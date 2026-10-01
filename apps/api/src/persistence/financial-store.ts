import { createHash } from 'node:crypto';
import type { PrismaClient, Prisma } from '@prisma/client';
import { withPostgresTransaction } from './transaction.ts';
import { assertTransferPairing, foldEffectiveHistory, isTransferEffect, TransferPairingError } from '../planning/transaction-history.ts';
import { calculateAccountBalances, clearedStateViolation, isBalanceEvent, oldestAccount, type AccountState } from '../planning/engine.ts';
import { validateScheduleDefinition } from '../planning/schedules.ts';

export type FinancialEvent = {
  id: string;
  kind: 'INCOME' | 'INCOME_RELEASE' | 'SPENDING' | 'ASSIGNMENT' | 'UNASSIGNMENT' | 'MOVE' | 'TRANSFER_OUT' | 'TRANSFER_IN' | 'TRANSACTION_DELETE' | 'RECONCILIATION_ADJUSTMENT';
  amountMinor: number;
  month?: string;
  businessDate?: string;
  accountId?: string;
  transactionId?: string;
  transferId?: string;
  supersedesEventId?: string;
  status?: 'POSTED' | 'WORKING';
  reconciled?: boolean;
  cleared?: boolean;
  reconciliationId?: string | null;
  categoryId?: string;
  sourceCategoryId?: string;
  destinationCategoryId?: string;
  relatedEventId?: string;
  createdAt?: string;
  payee?: string | null;
  memo?: string | null;
};
export type TransferState = {
  id: string;
  sourceAccountId: string;
  destinationAccountId: string;
  amountMinor: number;
  businessDate: string;
  month: string;
  createdAt: string;
  payee?: string | null;
  memo?: string | null;
};
export type TargetKind = 'MONTHLY_SET_ASIDE' | 'BALANCE_BY_DATE';
export type TargetInput = { kind: TargetKind; amountMinor: number; targetMonth?: string };
export type TargetState = TargetInput & { categoryId: string };
export type ScheduleState = {
  id: string;
  budgetId: string;
  accountId: string;
  categoryId: string | null;
  flow: 'INCOME' | 'SPENDING';
  amountMinor: number;
  payee: string | null;
  memo: string | null;
  dayOfMonth: number;
  intervalMonths: number;
  startDate: string;
  createdAt: string;
  updatedAt: string;
};
export type ReconciliationRecord = { id: string; accountId: string; actorId: string; observedClearedBalanceMinor: number; confirmedClearedBalanceMinor: number; adjustmentMinor: number; reason: string | null; month: string; createdAt: string; idempotencyKey?: string };
export type FinancialState = {
  id: string;
  setupStep: 'ACCOUNT' | 'CATEGORIES' | 'COMPLETE';
  timezone: 'UTC';
  version: number;
  account: { id: string; name: string; openingBalanceMinor: number; archived?: boolean; kind?: 'CASH' | 'CHECKING'; createdAt?: string } | null;
  accounts?: AccountState[];
  categories: { id: string; name: string; archived: boolean }[];
  targets?: TargetState[];
  schedules?: ScheduleState[];
  events: FinancialEvent[];
  transfers?: TransferState[];
  reconciliations?: ReconciliationRecord[];
  rawEvents?: FinancialEvent[];
};
type Work<T> = (state: FinancialState, events: FinancialEvent[], nextVersion: number, append: (event: FinancialEvent) => void) => T;
export type FinancialCommand<T> = {
  ownerId: string; budgetId: string; command: string; input: unknown; idempotencyKey: string; expectedVersion?: number; payloadDigest?: string; work: Work<T>; persistAccounts?: boolean;
  persistTarget?: { categoryId: string; target: TargetInput | null };
  persistSchedule?: ScheduleState;
  deleteScheduleId?: string;
  deletionAudit?: { actorId: string; transactionId: string; requestId?: string; reason?: string };
};

type ErrorCode = 'NOT_FOUND' | 'CONFLICT';
export class PersistenceError extends Error {
  readonly code: ErrorCode;
  constructor(code: ErrorCode, message: string) { super(message); this.code = code; }
}

export const assertTransferPairingAtWrite = (events: FinancialEvent[], newEvents: FinancialEvent[], transferIds: readonly string[]) => {
  const resultingEvents = [...events];
  for (const event of newEvents) {
    if (resultingEvents.some(current => current.id === event.id)) continue;
    const supersededIndex = isTransferEffect(event) && event.supersedesEventId
      ? resultingEvents.findIndex(current => current.id === event.supersedesEventId)
      : -1;
    if (supersededIndex >= 0) resultingEvents.splice(supersededIndex, 1, event);
    else resultingEvents.push(event);
  }
  try { assertTransferPairing(resultingEvents, transferIds); }
  catch (error) {
    if (error instanceof TransferPairingError) throw new PersistenceError('CONFLICT', error.message);
    throw error;
  }
};

const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const amount = (value: bigint) => {
  const result = Number(value);
  if (!Number.isSafeInteger(result)) throw new Error('Persisted amount exceeds integer minor-unit range');
  return result;
};
const dateOnly = (value: Date | undefined) => value?.toISOString().slice(0, 10);
const timestamp = (value: Date | undefined) => value?.toISOString();

export const mapFinancialEventRow = (event: any): FinancialEvent => ({
  id: event.id, kind: event.kind, amountMinor: amount(event.amountMinor),
  cleared: event.cleared ?? false,
  reconciliationId: event.reconciliationId ?? null,
  ...(event.month ? { month: event.month } : {}), ...(dateOnly(event.businessDate) ? { businessDate: dateOnly(event.businessDate) } : {}),
  ...(event.accountId ? { accountId: event.accountId } : {}), ...(event.transactionId ? { transactionId: event.transactionId } : {}),
  ...(event.transferId ? { transferId: event.transferId } : {}), ...(event.supersedesEventId ? { supersedesEventId: event.supersedesEventId } : {}),
  ...(event.status ? { status: event.status } : {}), reconciled: event.reconciled,
  ...(event.categoryId ? { categoryId: event.categoryId } : {}), ...(event.sourceCategoryId ? { sourceCategoryId: event.sourceCategoryId } : {}),
  ...(event.destinationCategoryId ? { destinationCategoryId: event.destinationCategoryId } : {}), ...(event.relatedEventId ? { relatedEventId: event.relatedEventId } : {}),
  ...(timestamp(event.createdAt) ? { createdAt: timestamp(event.createdAt) } : {}), payee: event.payee ?? null, memo: event.memo ?? null,
});
export const isFinancialEventCleared = (event: Pick<FinancialEvent, 'cleared' | 'reconciled' | 'status'>) =>
  event.status !== 'WORKING' && (event.reconciled === true || event.cleared === true);

export const mapTransferRow = (transfer: any): TransferState => ({
  id: transfer.id, sourceAccountId: transfer.sourceAccountId, destinationAccountId: transfer.destinationAccountId,
  amountMinor: amount(transfer.amountMinor), businessDate: dateOnly(transfer.businessDate)!, month: transfer.month,
  createdAt: timestamp(transfer.createdAt)!, payee: transfer.payee ?? null, memo: transfer.memo ?? null,
});

export class FinancialStore {
  private readonly client: PrismaClient;
  constructor(client?: PrismaClient) { if (!client) throw new Error('FinancialStore requires a PrismaClient'); this.client = client; }

  async findReceipt(ownerId: string, budgetId: string, idempotencyKey: string): Promise<{ payloadDigest: string; result: unknown } | null> {
    const budget = await this.client.budget.findFirst({ where: { id: budgetId, ownerId }, select: { id: true } });
    if (!budget) throw new PersistenceError('NOT_FOUND', 'Resource not found');
    const receipt = await this.client.commandReceipt.findUnique({ where: { budgetId_idempotencyKey: { budgetId, idempotencyKey } }, select: { payloadDigest: true, result: true } });
    return receipt ? { payloadDigest: receipt.payloadDigest, result: receipt.result } : null;
  }

  async execute<T>(command: FinancialCommand<T>): Promise<{ result: T; version: number; replayed?: true }> {
    const payloadDigest = command.payloadDigest ?? digest({ command: command.command, input: command.input, expectedVersion: command.expectedVersion });
    return withPostgresTransaction<Prisma.TransactionClient, { result: T; version: number }>(this.client, async tx => {
      let budget = await tx.budget.findFirst({ where: { id: command.budgetId, ownerId: command.ownerId }, include: { accounts: { include: { openingBalances: { orderBy: { recordedAt: 'desc' }, take: 1 } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }, categories: true } });
      if (!budget) throw new PersistenceError('NOT_FOUND', 'Resource not found');

      await tx.budget.update({ where: { id: command.budgetId }, data: { setupStep: budget.setupStep } });
      const receipt = await tx.commandReceipt.findUnique({ where: { budgetId_idempotencyKey: { budgetId: command.budgetId, idempotencyKey: command.idempotencyKey } } });
      if (receipt) {
        if (receipt.payloadDigest !== payloadDigest) throw new PersistenceError('CONFLICT', 'Idempotency key was reused with a different payload');
        return { result: receipt.result as T, version: await tx.commandReceipt.count({ where: { budgetId: command.budgetId } }), replayed: true };
      }
      const version = await tx.commandReceipt.count({ where: { budgetId: command.budgetId } });
      if (command.expectedVersion !== undefined && command.expectedVersion !== version) throw new PersistenceError('CONFLICT', 'Budget version is stale');
      const state = await this.readState(tx, budget, version);
      const events = state.events.map(event => ({ ...event }));
      const previousTransfers = new Set((state.transfers ?? []).map(transfer => transfer.id));
      const previousReconciliations = new Set((state.reconciliations ?? []).map(record => record.id));
      const appended: FinancialEvent[] = [];
      const result = command.work(state, events, version + 1, event => appended.push(event));
      const newEvents = appended.length ? appended : events.slice(state.events.length);
      assertTransferPairingAtWrite(events, newEvents, (state.transfers ?? []).map(transfer => transfer.id));
      if (command.persistAccounts) await this.persistAccounts(tx, command.budgetId, state.accounts ?? []);
      if (command.persistTarget) await this.persistTarget(tx, command.budgetId, command.persistTarget.categoryId, command.persistTarget.target);
      if (command.persistSchedule) await this.persistSchedule(tx, command.budgetId, command.persistSchedule);
      if (command.deleteScheduleId) await this.deleteSchedule(tx, command.budgetId, command.deleteScheduleId);
      for (const record of state.reconciliations ?? []) {
        if (previousReconciliations.has(record.id)) continue;
        await tx.reconciliation.create({ data: { id: record.id, budgetId: command.budgetId, accountId: record.accountId, actorId: record.actorId, observedClearedBalanceMinor: BigInt(record.observedClearedBalanceMinor), confirmedClearedBalanceMinor: BigInt(record.confirmedClearedBalanceMinor), adjustmentMinor: BigInt(record.adjustmentMinor), reason: record.reason, month: record.month, createdAt: new Date(record.createdAt) } });
      }
      for (const transfer of state.transfers ?? []) {
        if (!previousTransfers.has(transfer.id)) await (tx as any).transfer.create({ data: { id: transfer.id, budgetId: command.budgetId, sourceAccountId: transfer.sourceAccountId, destinationAccountId: transfer.destinationAccountId, amountMinor: BigInt(transfer.amountMinor), businessDate: new Date(`${transfer.businessDate}T00:00:00Z`), month: transfer.month, createdAt: new Date(transfer.createdAt), payee: transfer.payee, memo: transfer.memo } });
      }
      for (const event of newEvents) await this.appendEvent(tx, command.budgetId, state.account?.id, event);
      if (command.deletionAudit) await (tx as any).transactionDeletionAudit.create({ data: { ...command.deletionAudit, budgetId: command.budgetId, idempotencyKey: command.idempotencyKey } });
      await tx.commandReceipt.create({ data: { budgetId: command.budgetId, idempotencyKey: command.idempotencyKey, payloadDigest, result: result as Prisma.InputJsonValue } });
      return { result, version: version + 1 };
    });
  }

  async load(ownerId: string, budgetId: string): Promise<FinancialState> {
    return this.client.$transaction(async tx => {
      const budget = await tx.budget.findFirst({
        where: { id: budgetId, ownerId },
        include: { accounts: { include: { openingBalances: { orderBy: { recordedAt: 'desc' }, take: 1 } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }, categories: true },
      });
      if (!budget) throw new PersistenceError('NOT_FOUND', 'Resource not found');
      const version = await tx.commandReceipt.count({ where: { budgetId } });
      return this.readState(tx, budget, version);
    }, { isolationLevel: 'RepeatableRead' });
  }

  private async readState(tx: Pick<Prisma.TransactionClient, 'financialEvent' | 'commandReceipt' | 'transfer' | 'categoryTarget' | 'scheduledTransaction' | 'reconciliation'>, budget: any, version: number): Promise<FinancialState> {
    const sourceEvents = await tx.financialEvent.findMany({ where: { budgetId: budget.id }, orderBy: { createdAt: 'asc' } });
    const transfers = await tx.transfer.findMany({ where: { budgetId: budget.id }, orderBy: [{ businessDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }] });
    const targetRows = await tx.categoryTarget.findMany({ where: { budgetId: budget.id }, orderBy: { categoryId: 'asc' } });
    const scheduleRows = await tx.scheduledTransaction.findMany({ where: { budgetId: budget.id }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
    const reconciliationRows = await tx.reconciliation.findMany({ where: { budgetId: budget.id }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
    const receipts = await tx.commandReceipt.findMany({ where: { budgetId: budget.id }, select: { idempotencyKey: true, result: true } });
    const reconciliationKeys = new Map(receipts.flatMap((receipt: any) => typeof receipt.result?.reconciliationId === 'string' ? [[receipt.result.reconciliationId, receipt.idempotencyKey]] : []));
    const reconciliations: ReconciliationRecord[] = reconciliationRows.map((record: any) => ({ id: record.id, accountId: record.accountId, actorId: record.actorId, observedClearedBalanceMinor: amount(record.observedClearedBalanceMinor), confirmedClearedBalanceMinor: amount(record.confirmedClearedBalanceMinor), adjustmentMinor: amount(record.adjustmentMinor), reason: record.reason, month: record.month, createdAt: timestamp(record.createdAt)!, ...(reconciliationKeys.has(record.id) ? { idempotencyKey: reconciliationKeys.get(record.id)! } : {}) }));
    const targets: TargetState[] = targetRows.map((target: any) => ({ categoryId: target.categoryId, kind: target.kind, amountMinor: amount(target.amountMinor), ...(target.targetMonth === null ? {} : { targetMonth: target.targetMonth }) }));
    const schedules: ScheduleState[] = scheduleRows.map((schedule: any) => ({
      id: schedule.id, budgetId: schedule.budgetId, accountId: schedule.accountId, categoryId: schedule.categoryId,
      flow: schedule.flow, amountMinor: amount(schedule.amountMinor), payee: schedule.payee, memo: schedule.memo,
      dayOfMonth: schedule.dayOfMonth, intervalMonths: schedule.intervalMonths, startDate: dateOnly(schedule.startDate)!,
      createdAt: timestamp(schedule.createdAt)!, updatedAt: timestamp(schedule.updatedAt)!,
    }));
    const rawEvents = sourceEvents.map(mapFinancialEventRow);
    const events = foldEffectiveHistory(rawEvents);
    const rowsAccounts = budget.accounts ?? (budget.account ? [budget.account] : []);
    const accounts = rowsAccounts.map((account: any) => ({ id: account.id, name: account.name, kind: account.kind ?? 'CASH', archived: account.archived, createdAt: account.createdAt?.toISOString?.() ?? account.createdAt, openingBalanceMinor: amount(account.openingBalances?.[0]?.amountMinor ?? 0n) }));
    const projected = calculateAccountBalances(accounts, events.filter((event: any) => isBalanceEvent(event.kind)).map((event: any) => ({ accountId: event.accountId, kind: event.kind, amountMinor: event.amountMinor, cleared: isFinancialEventCleared(event) })));
    const alias = oldestAccount(projected);
    return {
      id: budget.id,
      setupStep: budget.setupStep,
      timezone: budget.timezone,
      version,
      accounts: projected,
      transfers: transfers.map(mapTransferRow),
      reconciliations,
      account: alias ? { id: alias.id, name: alias.name, kind: alias.kind, archived: alias.archived, createdAt: alias.createdAt, openingBalanceMinor: alias.openingBalanceMinor } : null,
      categories: budget.categories.map((category: any) => ({ id: category.id, name: category.name, archived: category.archived })),
      targets,
      schedules,
      events, rawEvents,
    };
  }

  private async persistAccounts(tx: any, budgetId: string, accounts: AccountState[]) {
    for (const account of accounts) {
      await tx.account.upsert({ where: { id: account.id }, create: { id: account.id, budgetId, name: account.name, kind: account.kind, archived: account.archived, ...(account.createdAt ? { createdAt: new Date(account.createdAt) } : {}) }, update: { name: account.name, kind: account.kind, archived: account.archived } });
      await tx.openingBalance.upsert({ where: { accountId: account.id }, create: { accountId: account.id, amountMinor: BigInt(account.openingBalanceMinor) }, update: { amountMinor: BigInt(account.openingBalanceMinor) } });
    }
  }

  private async persistTarget(tx: any, budgetId: string, categoryId: string, target: TargetInput | null) {
    if (target === null) {
      await tx.categoryTarget.delete({ where: { categoryId } });
      return;
    }
    const data = { budgetId, categoryId, kind: target.kind, amountMinor: BigInt(target.amountMinor), targetMonth: target.targetMonth ?? null };
    await tx.categoryTarget.upsert({ where: { categoryId }, create: data, update: data });
  }

  private async persistSchedule(tx: any, budgetId: string, schedule: ScheduleState) {
    if (!validateScheduleDefinition(schedule)) throw new PersistenceError('CONFLICT', 'Invalid schedule state');
    if (schedule.budgetId !== budgetId) throw new PersistenceError('CONFLICT', 'Schedule belongs to a different budget');
    const data = {
      id: schedule.id, budgetId, accountId: schedule.accountId, categoryId: schedule.categoryId, flow: schedule.flow,
      amountMinor: BigInt(schedule.amountMinor), payee: schedule.payee, memo: schedule.memo,
      dayOfMonth: schedule.dayOfMonth, intervalMonths: schedule.intervalMonths,
      startDate: new Date(`${schedule.startDate}T00:00:00.000Z`),
      createdAt: new Date(schedule.createdAt), updatedAt: new Date(schedule.updatedAt),
    };
    await tx.scheduledTransaction.upsert({ where: { id: schedule.id }, create: data, update: data });
  }

  private async deleteSchedule(tx: any, budgetId: string, scheduleId: string) {
    await tx.scheduledTransaction.deleteMany({ where: { id: scheduleId, budgetId } });
  }

  private async appendEvent(tx: Prisma.TransactionClient, budgetId: string, accountId: string | undefined, event: FinancialEvent) {
    const violation = clearedStateViolation(event);
    if (violation) throw new PersistenceError('CONFLICT', violation);
    const supported = event.kind === 'INCOME' || event.kind === 'SPENDING';
    await tx.financialEvent.create({ data: {
      id: event.id, budgetId, kind: event.kind, amountMinor: BigInt(event.amountMinor),
      ...(event.accountId ?? (supported ? accountId : undefined) ? { accountId: event.accountId ?? accountId } : {}),
      ...(event.transactionId ? { transactionId: event.transactionId } : supported ? { transactionId: event.id } : {}),
      ...(event.transferId ? { transferId: event.transferId } : {}),
      ...(event.businessDate ? { businessDate: new Date(`${event.businessDate}T00:00:00Z`) } : event.month ? { businessDate: new Date(`${event.month}-01T00:00:00Z`) } : {}),
      ...(event.month ? { month: event.month } : {}), ...(event.supersedesEventId ? { supersedesEventId: event.supersedesEventId } : {}),
      ...(event.status ? { status: event.status } : supported ? { status: 'POSTED' } : {}), reconciled: event.reconciled ?? false,
      cleared: event.cleared ?? false, reconciliationId: event.reconciliationId ?? null,
      ...(event.categoryId ? { categoryId: event.categoryId } : {}), ...(event.sourceCategoryId ? { sourceCategoryId: event.sourceCategoryId } : {}),
      ...(event.destinationCategoryId ? { destinationCategoryId: event.destinationCategoryId } : {}), ...(event.relatedEventId ? { relatedEventId: event.relatedEventId } : {}),
      ...(event.createdAt ? { createdAt: new Date(event.createdAt) } : {}),
      payee: event.payee ?? null, memo: event.memo ?? null,
    } as any });
  }
}
