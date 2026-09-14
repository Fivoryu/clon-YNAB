import { randomUUID } from 'node:crypto';
import { monthForDate } from './engine.ts';

export type TransactionKind = 'INCOME' | 'SPENDING';
export type TransactionStatus = 'POSTED' | 'WORKING';
export type TransactionEvent = {
  id: string; transactionId?: string; kind: string; accountId?: string; amountMinor: number;
  businessDate?: string; month?: string; categoryId?: string; status?: TransactionStatus;
  reconciled?: boolean; supersedesEventId?: string; relatedEventId?: string; budgetId?: string;
};
const transactionKinds = new Set(['INCOME', 'SPENDING']);
const isTransaction = (event: TransactionEvent) => transactionKinds.has(event.kind);
const identity = (event: TransactionEvent) => event.transactionId ?? event.id;

export const parseTransactionDate = (value: string, timezone = 'UTC') => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('date must be YYYY-MM-DD');
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) throw new Error('Invalid transaction date');
  return { date: value, month: monthForDate(value, timezone) };
};
export const sameTransactionMonth = (current: string, requested: string, timezone = 'UTC') => parseTransactionDate(current, timezone).month === parseTransactionDate(requested, timezone).month;

export const foldEffectiveHistory = <T extends TransactionEvent>(events: T[]): T[] => {
  const current = new Map<string, T>();
  for (const event of events) {
    if (event.kind === 'TRANSACTION_DELETE') {
      const previous = current.get(identity(event));
      if (previous && event.supersedesEventId !== previous.id) throw new Error('Malformed transaction chain');
      current.delete(identity(event));
      continue;
    }
    if (!isTransaction(event)) continue;
    const key = identity(event);
    const previous = current.get(key);
    if (previous) {
      if (event.supersedesEventId !== previous.id || event.kind !== previous.kind || event.accountId !== previous.accountId) throw new Error('Malformed immutable transaction chain');
    } else if (event.supersedesEventId) throw new Error('Malformed transaction chain');
    current.set(key, event);
  }
  return events.filter(event => isTransaction(event) ? current.get(identity(event))?.id === event.id : event.kind !== 'TRANSACTION_DELETE') as T[];
};

export const assertEligibleTransaction = (event: TransactionEvent, options: { supportedAccountId: string; released?: boolean }) => {
  if (!transactionKinds.has(event.kind) || event.accountId !== options.supportedAccountId || !['POSTED', 'WORKING'].includes(event.status ?? '') || event.reconciled || options.released) throw new Error('CONFLICT: transaction is not eligible');
  if (!Number.isSafeInteger(event.amountMinor) || event.amountMinor <= 0) throw new Error('Transaction amount must be positive');
  return true;
};

type CategoryChoice = { categoryId: string; categoryBudgetId: string; categoryArchived: boolean; budgetId: string };
export const buildReplacement = (event: TransactionEvent, patch: { amountMinor?: number; businessDate?: string; categoryId?: string; timezone?: string }, category?: CategoryChoice): TransactionEvent => {
  const timezone = patch.timezone ?? 'UTC';
  if (patch.amountMinor !== undefined && (!Number.isSafeInteger(patch.amountMinor) || patch.amountMinor <= 0)) throw new Error('Transaction amount must be positive');
  const date = patch.businessDate ? parseTransactionDate(patch.businessDate, timezone) : event.businessDate ? parseTransactionDate(event.businessDate, timezone) : { date: `${event.month ?? '1970-01'}-01`, month: event.month };
  if (event.month && date.month !== event.month) throw new Error('CONFLICT: transaction date must remain in the same month');
  let categoryId = event.categoryId;
  if (patch.categoryId && patch.categoryId !== event.categoryId) {
    if (!category || category.categoryId !== patch.categoryId || category.categoryBudgetId !== category.budgetId || category.categoryArchived) throw new Error('Replacement category must be active and in the same budget');
    categoryId = patch.categoryId;
  }
  return { ...event, id: randomUUID(), transactionId: identity(event), amountMinor: patch.amountMinor ?? event.amountMinor, businessDate: date.date, month: date.month, ...(categoryId ? { categoryId } : {}), supersedesEventId: event.id };
};
export const buildDeleteTombstone = (event: TransactionEvent, date = event.businessDate ?? `${event.month ?? '1970-01'}-01`): TransactionEvent => ({ id: randomUUID(), transactionId: identity(event), kind: 'TRANSACTION_DELETE', accountId: event.accountId, amountMinor: 0, businessDate: date, month: event.month, supersedesEventId: event.id });
export const projectEffectiveHistory = <T extends TransactionEvent>(events: T[], appended: T) => foldEffectiveHistory([...events, appended]);
