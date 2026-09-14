import { createHash } from 'node:crypto';
import { PrismaClient, type Prisma } from '@prisma/client';
import { withPostgresTransaction } from './transaction.ts';
import { foldEffectiveHistory } from '../planning/transaction-history.ts';

export type FinancialEvent = {
  id: string;
  kind: 'INCOME' | 'INCOME_RELEASE' | 'SPENDING' | 'ASSIGNMENT' | 'UNASSIGNMENT' | 'MOVE' | 'TRANSACTION_DELETE';
  amountMinor: number;
  month?: string;
  businessDate?: string;
  accountId?: string;
  transactionId?: string;
  supersedesEventId?: string;
  status?: 'POSTED' | 'WORKING';
  reconciled?: boolean;
  categoryId?: string;
  sourceCategoryId?: string;
  destinationCategoryId?: string;
  relatedEventId?: string;
  createdAt?: string;
};
export type FinancialState = {
  id: string;
  setupStep: 'ACCOUNT' | 'CATEGORIES' | 'COMPLETE';
  timezone: 'UTC';
  version: number;
  account: { id: string; name: string; openingBalanceMinor: number; archived?: boolean } | null;
  categories: { id: string; name: string; archived: boolean }[];
  events: FinancialEvent[];
  rawEvents?: FinancialEvent[];
};
type Work<T> = (state: FinancialState, events: FinancialEvent[], nextVersion: number, append: (event: FinancialEvent) => void) => T;
export type FinancialCommand<T> = {
  ownerId: string; budgetId: string; command: string; input: unknown; idempotencyKey: string; expectedVersion?: number; work: Work<T>;
  deletionAudit?: { actorId: string; transactionId: string; requestId?: string; reason?: string };
};

type ErrorCode = 'NOT_FOUND' | 'CONFLICT';
export class PersistenceError extends Error {
  readonly code: ErrorCode;
  constructor(code: ErrorCode, message: string) { super(message); this.code = code; }
}

const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const amount = (value: bigint) => {
  const result = Number(value);
  if (!Number.isSafeInteger(result)) throw new Error('Persisted amount exceeds integer minor-unit range');
  return result;
};

export class FinancialStore {
  private readonly client: PrismaClient;
  constructor(client: PrismaClient = new PrismaClient()) { this.client = client; }

  async execute<T>(command: FinancialCommand<T>): Promise<{ result: T; version: number }> {
    const payloadDigest = digest({ command: command.command, input: command.input });
    return withPostgresTransaction<Prisma.TransactionClient, { result: T; version: number }>(this.client, async tx => {
      let budget = await tx.budget.findFirst({ where: { id: command.budgetId, ownerId: command.ownerId }, include: { account: { include: { openingBalances: { orderBy: { recordedAt: 'desc' }, take: 1 } } }, categories: true } });
      if (!budget) throw new PersistenceError('NOT_FOUND', 'Resource not found');

      await tx.$queryRaw`SELECT "id" FROM "Budget" WHERE "id" = ${command.budgetId}::uuid FOR UPDATE`;
      const receipt = await tx.commandReceipt.findUnique({ where: { budgetId_idempotencyKey: { budgetId: command.budgetId, idempotencyKey: command.idempotencyKey } } });
      if (receipt) {
        if (receipt.payloadDigest !== payloadDigest) throw new PersistenceError('CONFLICT', 'Idempotency key was reused with a different payload');
        return { result: receipt.result as T, version: await tx.commandReceipt.count({ where: { budgetId: command.budgetId } }) };
      }
      const version = await tx.commandReceipt.count({ where: { budgetId: command.budgetId } });
      if (command.expectedVersion !== undefined && command.expectedVersion !== version) throw new PersistenceError('CONFLICT', 'Budget version is stale');
      const state = await this.readState(tx, budget, version);
      const events = state.events.map(event => ({ ...event }));
      const appended: FinancialEvent[] = [];
      const result = command.work(state, events, version + 1, event => appended.push(event));
      const newEvents = appended.length ? appended : events.slice(state.events.length);
      for (const event of newEvents) await this.appendEvent(tx, command.budgetId, state.account?.id, event);
      if (command.deletionAudit) await (tx as any).transactionDeletionAudit.create({ data: { ...command.deletionAudit, budgetId: command.budgetId, idempotencyKey: command.idempotencyKey } });
      await tx.commandReceipt.create({ data: { budgetId: command.budgetId, idempotencyKey: command.idempotencyKey, payloadDigest, result: result as Prisma.InputJsonValue } });
      return { result, version: version + 1 };
    });
  }

  async load(ownerId: string, budgetId: string): Promise<FinancialState> {
    const budget = await this.client.budget.findFirst({
      where: { id: budgetId, ownerId },
      include: { account: { include: { openingBalances: { orderBy: { recordedAt: 'desc' }, take: 1 } } }, categories: true },
    });
    if (!budget) throw new PersistenceError('NOT_FOUND', 'Resource not found');
    return this.readState(this.client, budget, await this.client.commandReceipt.count({ where: { budgetId } }));
  }

  private async readState(tx: Pick<Prisma.TransactionClient, 'financialEvent' | 'commandReceipt'>, budget: any, version: number): Promise<FinancialState> {
    const rows = await tx.financialEvent.findMany({ where: { budgetId: budget.id }, orderBy: { createdAt: 'asc' } });
    const mapEvent = (event: any): FinancialEvent => ({ id: event.id, kind: event.kind, amountMinor: amount(event.amountMinor), ...(event.month ? { month: event.month } : {}), ...(event.businessDate ? { businessDate: event.businessDate.toISOString().slice(0, 10) } : {}), ...(event.accountId ? { accountId: event.accountId } : {}), ...(event.transactionId ? { transactionId: event.transactionId } : {}), ...(event.supersedesEventId ? { supersedesEventId: event.supersedesEventId } : {}), ...(event.status ? { status: event.status } : {}), reconciled: event.reconciled, ...(event.categoryId ? { categoryId: event.categoryId } : {}), ...(event.sourceCategoryId ? { sourceCategoryId: event.sourceCategoryId } : {}), ...(event.destinationCategoryId ? { destinationCategoryId: event.destinationCategoryId } : {}), ...(event.relatedEventId ? { relatedEventId: event.relatedEventId } : {}), ...(event.createdAt ? { createdAt: event.createdAt.toISOString() } : {}) });
    const rawEvents = rows.map(mapEvent);
    const account = budget.account;
    return {
      id: budget.id,
      setupStep: budget.setupStep,
      timezone: budget.timezone,
      version,
      account: account ? { id: account.id, name: account.name, archived: account.archived, openingBalanceMinor: amount(account.openingBalances?.[0]?.amountMinor ?? 0n) } : null,
      categories: budget.categories.map((category: any) => ({ id: category.id, name: category.name, archived: category.archived })),
      events: foldEffectiveHistory(rawEvents), rawEvents,
    };
  }

  private async appendEvent(tx: Prisma.TransactionClient, budgetId: string, accountId: string | undefined, event: FinancialEvent) {
    const supported = event.kind === 'INCOME' || event.kind === 'SPENDING';
    await tx.financialEvent.create({ data: {
      id: event.id, budgetId, kind: event.kind, amountMinor: BigInt(event.amountMinor),
      ...(event.accountId ?? (supported ? accountId : undefined) ? { accountId: event.accountId ?? accountId } : {}),
      ...(event.transactionId ? { transactionId: event.transactionId } : supported ? { transactionId: event.id } : {}),
      ...(event.businessDate ? { businessDate: new Date(`${event.businessDate}T00:00:00Z`) } : event.month ? { businessDate: new Date(`${event.month}-01T00:00:00Z`) } : {}),
      ...(event.month ? { month: event.month } : {}), ...(event.supersedesEventId ? { supersedesEventId: event.supersedesEventId } : {}),
      ...(event.status ? { status: event.status } : supported ? { status: 'POSTED' } : {}), reconciled: event.reconciled ?? false,
      ...(event.categoryId ? { categoryId: event.categoryId } : {}), ...(event.sourceCategoryId ? { sourceCategoryId: event.sourceCategoryId } : {}),
      ...(event.destinationCategoryId ? { destinationCategoryId: event.destinationCategoryId } : {}), ...(event.relatedEventId ? { relatedEventId: event.relatedEventId } : {}),
      ...(event.createdAt ? { createdAt: new Date(event.createdAt) } : {}),
    } as any });
  }
}
