import { PrismaClient, type Prisma } from '@prisma/client';
import type { FinancialState } from './financial-store.ts';
import { withPostgresTransaction } from './transaction.ts';
export type StoredUser = { id: string; email: string; passwordHash: string; budgetId?: string };
export type StoredSession = { userId: string; expiresAt: number; revoked: boolean };
export type BudgetState = FinancialState;
export type NewUser = Omit<StoredUser, 'budgetId'>;
export type NewSession = { tokenHash: string; userId: string; expiresAt: number };
export class BudgetStoreError extends Error { readonly code: 'CONFLICT' | 'NOT_FOUND'; constructor(code: 'CONFLICT' | 'NOT_FOUND', message = 'Resource not found') { super(message); this.code = code; } }
export interface BudgetStore {
  createUser(user: NewUser): void | Promise<void>; findUser(email: string): StoredUser | null | Promise<StoredUser | null>; findUserById(id: string): StoredUser | null | Promise<StoredUser | null>;
  createSession(session: NewSession): void | Promise<void>; findSession(tokenHash: string): StoredSession | null | Promise<StoredSession | null>; revokeSession(tokenHash: string): void | Promise<void>;
  createBudget(ownerId: string, state: BudgetState): BudgetState | Promise<BudgetState>; loadBudget(ownerId: string, budgetId: string): BudgetState | null | Promise<BudgetState | null>; saveBudget(ownerId: string, state: BudgetState): BudgetState | Promise<BudgetState>;
}
export class PrismaBudgetStore implements BudgetStore {
  private readonly client: PrismaClient;
  constructor(client: PrismaClient = new PrismaClient()) { this.client = client; }
  async createUser(user: NewUser) { try { await this.client.user.create({ data: user }); } catch (error: any) { if (error?.code === 'P2002') throw new BudgetStoreError('CONFLICT', 'Account already exists'); throw error; } }
  async findUser(email: string) { return this.toUser(await this.client.user.findUnique({ where: { email }, include: { budget: { select: { id: true } } } })); }
  async findUserById(id: string) { return this.toUser(await this.client.user.findUnique({ where: { id }, include: { budget: { select: { id: true } } } })); }
  async createSession(session: NewSession) { await this.client.session.create({ data: { ...session, expiresAt: new Date(session.expiresAt) } }); }
  async findSession(tokenHash: string) { const row = await this.client.session.findUnique({ where: { tokenHash } }); return row ? { userId: row.userId, expiresAt: row.expiresAt.getTime(), revoked: row.revokedAt !== null } : null; }
  async revokeSession(tokenHash: string) { await this.client.session.updateMany({ where: { tokenHash, revokedAt: null }, data: { revokedAt: new Date() } }); }
  async createBudget(ownerId: string, state: BudgetState) { try { return await withPostgresTransaction<Prisma.TransactionClient, BudgetState>(this.client, async tx => { await tx.budget.create({ data: { id: state.id, ownerId, timezone: state.timezone, setupStep: state.setupStep } }); return state; }); } catch (error: any) { if (error?.code === 'P2002') throw new BudgetStoreError('CONFLICT', 'A user can own only one budget'); throw error; } }
  async loadBudget(ownerId: string, budgetId: string) { return this.read(this.client, ownerId, budgetId); }
  async saveBudget(ownerId: string, state: BudgetState) { return withPostgresTransaction<Prisma.TransactionClient, BudgetState>(this.client, async tx => {
    if (!await tx.budget.findFirst({ where: { id: state.id, ownerId }, select: { id: true } })) throw new BudgetStoreError('NOT_FOUND');
    await tx.budget.update({ where: { id: state.id }, data: { setupStep: state.setupStep } });
    await tx.category.deleteMany({ where: { budgetId: state.id, id: { notIn: state.categories.map(category => category.id) } } });
    for (const category of state.categories) await tx.category.upsert({ where: { id: category.id }, create: { id: category.id, budgetId: state.id, name: category.name, archived: category.archived }, update: { name: category.name, archived: category.archived } });
    if (state.account) { await tx.account.upsert({ where: { budgetId: state.id }, create: { id: state.account.id, budgetId: state.id, name: state.account.name, kind: 'CASH', openingBalances: { create: { amountMinor: BigInt(state.account.openingBalanceMinor) } } }, update: { name: state.account.name, archived: state.account.archived ?? false } }); await tx.openingBalance.deleteMany({ where: { accountId: state.account.id } }); await tx.openingBalance.create({ data: { accountId: state.account.id, amountMinor: BigInt(state.account.openingBalanceMinor) } }); }
    return (await this.read(tx, ownerId, state.id))!;
  }); }
  private toUser(row: any): StoredUser | null { return row ? { id: row.id, email: row.email, passwordHash: row.passwordHash, ...(row.budget?.id ? { budgetId: row.budget.id } : {}) } : null; }
  private async read(tx: any, ownerId: string, budgetId: string): Promise<BudgetState | null> { const row = await tx.budget.findFirst({ where: { id: budgetId, ownerId }, include: { account: { include: { openingBalances: { orderBy: { recordedAt: 'desc' }, take: 1 } } }, categories: true } }); if (!row) return null; const events = await tx.financialEvent.findMany({ where: { budgetId }, orderBy: { createdAt: 'asc' } }); return { id: row.id, setupStep: row.setupStep, timezone: row.timezone, version: await tx.commandReceipt.count({ where: { budgetId } }), account: row.account ? { id: row.account.id, name: row.account.name, archived: row.account.archived, openingBalanceMinor: Number(row.account.openingBalances[0]?.amountMinor ?? 0n) } : null, categories: row.categories.map((category: any) => ({ id: category.id, name: category.name, archived: category.archived })), events: events.map((event: any) => ({ id: event.id, kind: event.kind, amountMinor: Number(event.amountMinor), ...(event.month ? { month: event.month } : {}), ...(event.categoryId ? { categoryId: event.categoryId } : {}), ...(event.sourceCategoryId ? { sourceCategoryId: event.sourceCategoryId } : {}), ...(event.destinationCategoryId ? { destinationCategoryId: event.destinationCategoryId } : {}), ...(event.relatedEventId ? { relatedEventId: event.relatedEventId } : {}) })) }; }
}
