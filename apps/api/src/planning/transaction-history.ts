import { randomUUID } from 'node:crypto';
import { monthForDate } from './engine.ts';

export type TransactionKind = 'INCOME' | 'SPENDING';
export type TransactionStatus = 'POSTED' | 'WORKING';
export type TransactionMetadata = { payee: string | null; memo: string | null };
export type MetadataPatch = { payee?: string | null; memo?: string | null };
export type TransactionEvent = {
  id: string; transactionId?: string; kind: string; accountId?: string; amountMinor: number;
  businessDate?: string; month?: string; categoryId?: string; status?: TransactionStatus;
  reconciled?: boolean; supersedesEventId?: string; relatedEventId?: string; budgetId?: string;
  payee?: string | null; memo?: string | null;
};
const transactionKinds = new Set(['INCOME', 'SPENDING']);
const isTransaction = (event: TransactionEvent) => transactionKinds.has(event.kind);
const identity = (event: TransactionEvent) => event.transactionId ?? event.id;
const hasOwn = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);
const trimUnicodeWhitespace = (value: string) => value.replace(/^\p{White_Space}+/u, '').replace(/\p{White_Space}+$/u, '');
const normalizeMetadataValue = (value: unknown, name: 'payee' | 'memo') => {
  if (value === null) return null;
  if (typeof value !== 'string') throw new Error(`${name} must be a string or null`);
  const normalized = trimUnicodeWhitespace(value);
  const limit = name === 'payee' ? 200 : 1000;
  if ([...normalized].length > limit) throw new Error(`${name} must be at most ${limit} code points`);
  return normalized || null;
};
export const normalizeMetadata = (input: { payee?: unknown; memo?: unknown } = {}): TransactionMetadata => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('metadata must be an object');
  return { payee: normalizeMetadataValue(hasOwn(input, 'payee') ? input.payee : null, 'payee'), memo: normalizeMetadataValue(hasOwn(input, 'memo') ? input.memo : null, 'memo') };
};
export const normalizeMetadataPatch = (input: unknown): MetadataPatch => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('metadata patch must be an object');
  const patch: MetadataPatch = {};
  if (hasOwn(input, 'payee')) patch.payee = normalizeMetadataValue((input as any).payee, 'payee');
  if (hasOwn(input, 'memo')) patch.memo = normalizeMetadataValue((input as any).memo, 'memo');
  return patch;
};

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
export const buildReplacement = (event: TransactionEvent, patch: { amountMinor?: number; businessDate?: string; categoryId?: string; timezone?: string } & MetadataPatch, category?: CategoryChoice): TransactionEvent => {
  const timezone = patch.timezone ?? 'UTC';
  if (patch.amountMinor !== undefined && (!Number.isSafeInteger(patch.amountMinor) || patch.amountMinor <= 0)) throw new Error('Transaction amount must be positive');
  const date = patch.businessDate ? parseTransactionDate(patch.businessDate, timezone) : event.businessDate ? parseTransactionDate(event.businessDate, timezone) : { date: `${event.month ?? '1970-01'}-01`, month: event.month };
  if (event.month && date.month !== event.month) throw new Error('CONFLICT: transaction date must remain in the same month');
  let categoryId = event.categoryId;
  if (patch.categoryId && patch.categoryId !== event.categoryId) {
    if (!category || category.categoryId !== patch.categoryId || category.categoryBudgetId !== category.budgetId || category.categoryArchived) throw new Error('Replacement category must be active and in the same budget');
    categoryId = patch.categoryId;
  }
  const metadata = normalizeMetadataPatch(patch);
  const payee = hasOwn(metadata, 'payee') ? metadata.payee! : event.payee ?? null;
  const memo = hasOwn(metadata, 'memo') ? metadata.memo! : event.memo ?? null;
  return { ...event, id: randomUUID(), transactionId: identity(event), amountMinor: patch.amountMinor ?? event.amountMinor, businessDate: date.date, month: date.month, ...(categoryId ? { categoryId } : {}), payee, memo, supersedesEventId: event.id };
};
export const buildDeleteTombstone = (event: TransactionEvent, date = event.businessDate ?? `${event.month ?? '1970-01'}-01`): TransactionEvent => ({ id: randomUUID(), transactionId: identity(event), kind: 'TRANSACTION_DELETE', accountId: event.accountId, amountMinor: 0, businessDate: date, month: event.month, payee: null, memo: null, supersedesEventId: event.id });
export const projectEffectiveHistory = <T extends TransactionEvent>(events: T[], appended: T) => foldEffectiveHistory([...events, appended]);

export type HistoryFilter = { month?: string; accountId?: string; kind?: 'INCOME' | 'SPENDING' | 'TRANSFER'; categoryId?: string; from?: string; to?: string; q?: string };
export type HistoryFilterItem = { transactionId: string; kind: 'INCOME' | 'SPENDING' | 'TRANSFER'; date: string; createdAt?: string; accountId?: string; categoryId?: string; categoryName?: string; accountNames?: string[]; sourceAccountId?: string; destinationAccountId?: string; payee: string | null; memo: string | null };
export const searchFold = (value: string) => value.toLowerCase();
const normalizedQuery = (value: string | undefined) => {
  if (value === undefined) return undefined;
  const query = trimUnicodeWhitespace(value);
  if ([...query].length > 200) throw new Error('q must be at most 200 code points');
  return query || undefined;
};
const matchesHistoryFilter = (item: HistoryFilterItem, filter: HistoryFilter, query: string | undefined) => {
  if (filter.month !== undefined && item.date.slice(0, 7) !== filter.month) return false;
  if (filter.kind !== undefined && item.kind !== filter.kind) return false;
  if (filter.categoryId !== undefined && item.categoryId !== filter.categoryId) return false;
  if (filter.accountId !== undefined && item.accountId !== filter.accountId && item.sourceAccountId !== filter.accountId && item.destinationAccountId !== filter.accountId) return false;
  if (filter.from !== undefined && item.date < filter.from) return false;
  if (filter.to !== undefined && item.date > filter.to) return false;
  if (query !== undefined) {
    const haystack = [item.payee, item.memo, item.categoryName, ...(item.accountNames ?? [])].filter((value): value is string => Boolean(value)).map(searchFold);
    if (!haystack.some(value => value.includes(searchFold(query)))) return false;
  }
  return true;
};
export const filterHistoryItems = <T extends HistoryFilterItem>(items: T[], filter: HistoryFilter): T[] => {
  if (filter.month !== undefined && !/^\d{4}-(0[1-9]|1[0-2])$/.test(filter.month)) throw new Error('month must be YYYY-MM');
  if (filter.from !== undefined) parseTransactionDate(filter.from);
  if (filter.to !== undefined) parseTransactionDate(filter.to);
  if (filter.from !== undefined && filter.to !== undefined && filter.from > filter.to) throw new Error('from must not be later than to');
  const query = normalizedQuery(filter.q);
  const filtered = items.filter(item => matchesHistoryFilter(item, filter, query));
  return [...filtered].sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt ?? '').localeCompare(a.createdAt ?? '') || b.transactionId.localeCompare(a.transactionId)).slice(0, 500);
};
