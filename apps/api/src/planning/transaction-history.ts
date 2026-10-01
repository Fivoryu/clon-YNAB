import { createHash, randomUUID } from 'node:crypto';
import { monthForDate } from './engine.ts';

export type TransactionKind = 'INCOME' | 'SPENDING';
export type TransactionStatus = 'POSTED' | 'WORKING';
export type TransactionMetadata = { payee: string | null; memo: string | null };
export type MetadataPatch = { payee?: string | null; memo?: string | null };
export type TransactionEvent = {
  id: string; transactionId?: string; transferId?: string; kind: string; accountId?: string; amountMinor: number;
  businessDate?: string; month?: string; categoryId?: string; status?: TransactionStatus;
  cleared?: boolean; reconciled?: boolean; supersedesEventId?: string; relatedEventId?: string; budgetId?: string;
  payee?: string | null; memo?: string | null;
};
export type TransactionClearedState = 'UNCLEARED' | 'CLEARED' | 'RECONCILED';
export class TransferPairingError extends Error {
  constructor(message: string) { super(message); this.name = 'TransferPairingError'; }
}
const transactionKinds = new Set(['INCOME', 'SPENDING']);
const isTransaction = (event: TransactionEvent) => transactionKinds.has(event.kind);
export const isTransferEffect = (event: TransactionEvent) => event.kind === 'TRANSFER_OUT' || event.kind === 'TRANSFER_IN';
export const isHistoryEffect = (event: TransactionEvent) => isTransaction(event) || isTransferEffect(event);
const identity = (event: TransactionEvent) => isTransferEffect(event)
  ? `transfer:${event.transferId ?? event.id}:${event.kind}`
  : event.transactionId ?? event.id;
const dateIdentity = (value: unknown) => value instanceof Date ? value.toISOString().slice(0, 10) : value;
export const projectClearedState = (event: Pick<TransactionEvent, 'cleared' | 'reconciled'>): TransactionClearedState =>
  event.reconciled === true ? 'RECONCILED' : event.cleared === true ? 'CLEARED' : 'UNCLEARED';
export const assertTransferPairing = <T extends TransactionEvent>(events: readonly T[], transferIds: readonly string[] = []) => {
  const effectsByTransfer = new Map<string, T[]>();
  for (const event of events) {
    if (!isTransferEffect(event)) continue;
    if (!event.transferId) throw new TransferPairingError('Malformed transfer pairing: transfer effect is missing transferId');
    const effects = effectsByTransfer.get(event.transferId) ?? [];
    effects.push(event);
    effectsByTransfer.set(event.transferId, effects);
  }
  for (const transferId of new Set([...transferIds, ...effectsByTransfer.keys()])) {
    const effects = effectsByTransfer.get(transferId) ?? [];
    const outgoing = effects.filter(event => event.kind === 'TRANSFER_OUT');
    const incoming = effects.filter(event => event.kind === 'TRANSFER_IN');
    if (outgoing.length !== 1 || incoming.length !== 1) throw new TransferPairingError(`Malformed transfer pairing for transfer ${transferId}`);
    if (projectClearedState(outgoing[0]) !== projectClearedState(incoming[0])) {
      throw new TransferPairingError('Malformed transfer pairing: effects disagree on cleared state');
    }
  }
};
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
    if (!isHistoryEffect(event)) continue;
    const key = identity(event);
    const previous = current.get(key);
    if (previous) {
      const invalidTransferReplacement = isTransferEffect(event) && (
        event.transferId !== previous.transferId || event.amountMinor !== previous.amountMinor ||
        dateIdentity(event.businessDate) !== dateIdentity(previous.businessDate) || event.month !== previous.month
      );
      if (event.supersedesEventId !== previous.id || event.kind !== previous.kind || event.accountId !== previous.accountId || invalidTransferReplacement) {
        throw new Error(isTransferEffect(event) ? 'Malformed immutable transfer chain' : 'Malformed immutable transaction chain');
      }
    } else if (event.supersedesEventId) throw new Error('Malformed transaction chain');
    current.set(key, event);
  }
  const effective = events.filter(event => isHistoryEffect(event) ? current.get(identity(event))?.id === event.id : event.kind !== 'TRANSACTION_DELETE') as T[];
  assertTransferPairing(effective.filter(isHistoryEffect));
  return effective;
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
export const buildClearedReplacement = <T extends TransactionEvent>(event: T, cleared: boolean, createdAt: string): T => ({
  ...event,
  ...(isTransferEffect(event) ? {} : { transactionId: identity(event) }),
  id: randomUUID(),
  cleared,
  createdAt,
  supersedesEventId: event.id,
}) as T;
export const buildDeleteTombstone = (event: TransactionEvent, date = event.businessDate ?? `${event.month ?? '1970-01'}-01`): TransactionEvent => ({ id: randomUUID(), transactionId: identity(event), kind: 'TRANSACTION_DELETE', accountId: event.accountId, amountMinor: 0, businessDate: date, month: event.month, payee: null, memo: null, supersedesEventId: event.id });
export const projectEffectiveHistory = <T extends TransactionEvent>(events: T[], appended: T) => foldEffectiveHistory([...events, appended]);

export type HistoryFilter = { month?: string; accountId?: string; kind?: 'INCOME' | 'SPENDING' | 'TRANSFER'; categoryId?: string; from?: string; to?: string; q?: string };
export type HistoryQuery = HistoryFilter & { cursor?: string };
export type HistoryFilterItem = { transactionId: string; kind: 'INCOME' | 'SPENDING' | 'TRANSFER'; date: string; createdAt?: string; accountId?: string; categoryId?: string; categoryName?: string; accountNames?: string[]; sourceAccountId?: string; destinationAccountId?: string; payee: string | null; memo: string | null };
export type HistoryAnchor = { date: string; createdAt: string; transactionId: string };
export const isAccountOnlyHistoryFilter = (filter: HistoryFilter) => filter.accountId !== undefined && Object.keys(filter).length === 1;
const historyFilterDigest = (filter: HistoryFilter) => createHash('sha256').update(JSON.stringify({ accountId: filter.accountId?.toLowerCase() })).digest('hex');
const cursorError = () => new Error('cursor is invalid or does not match the requested history');
const isRecord = (value: unknown): value is Record<string, any> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const hasExactKeys = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).sort().join(',') === keys.join(',');
const parseCursorAnchor = (value: unknown): HistoryAnchor => {
  if (!isRecord(value) || !hasExactKeys(value, ['createdAt', 'date', 'transactionId'])) throw cursorError();
  const { date, createdAt, transactionId } = value;
  if (typeof date !== 'string' || typeof createdAt !== 'string' || createdAt.length > 64 || (createdAt !== '' && !Number.isFinite(Date.parse(createdAt))) || typeof transactionId !== 'string' || !transactionId.trim() || transactionId.length > 128) throw cursorError();
  parseTransactionDate(date);
  return { date, createdAt, transactionId };
};
export const createHistoryCursor = (budgetId: string, filter: HistoryFilter, historyVersion: number, anchor: HistoryAnchor) => {
  if (!isAccountOnlyHistoryFilter(filter) || !Number.isSafeInteger(historyVersion) || historyVersion < 0) throw cursorError();
  return Buffer.from(JSON.stringify({ schemaVersion: 1, budgetId, filtersDigest: historyFilterDigest(filter), historyVersion, anchor })).toString('base64url');
};
export const parseHistoryCursor = (cursor: string, budgetId: string, filter: HistoryFilter): { version: number; anchor: HistoryAnchor } => {
  if (!isAccountOnlyHistoryFilter(filter) || typeof cursor !== 'string' || cursor.length === 0 || cursor.length > 2048 || !/^[A-Za-z0-9_-]+$/.test(cursor)) throw cursorError();
  try {
    const bytes = Buffer.from(cursor, 'base64url');
    if (bytes.toString('base64url') !== cursor) throw cursorError();
    const value: unknown = JSON.parse(bytes.toString('utf8'));
    if (!isRecord(value) || !hasExactKeys(value, ['anchor', 'budgetId', 'filtersDigest', 'historyVersion', 'schemaVersion'])) throw cursorError();
    if (value.schemaVersion !== 1 || value.budgetId !== budgetId || value.filtersDigest !== historyFilterDigest(filter) || !Number.isSafeInteger(value.historyVersion) || value.historyVersion < 0) throw cursorError();
    return { version: value.historyVersion, anchor: parseCursorAnchor(value.anchor) };
  } catch { throw cursorError(); }
};
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
const compareHistoryOrder = (a: Pick<HistoryFilterItem, 'date' | 'createdAt' | 'transactionId'>, b: Pick<HistoryFilterItem, 'date' | 'createdAt' | 'transactionId'>) => b.date.localeCompare(a.date) || (b.createdAt ?? '').localeCompare(a.createdAt ?? '') || b.transactionId.localeCompare(a.transactionId);
const matchingHistoryItems = <T extends HistoryFilterItem>(items: T[], filter: HistoryFilter) => {
  if (filter.month !== undefined && !/^\d{4}-(0[1-9]|1[0-2])$/.test(filter.month)) throw new Error('month must be YYYY-MM');
  if (filter.from !== undefined) parseTransactionDate(filter.from);
  if (filter.to !== undefined) parseTransactionDate(filter.to);
  if (filter.from !== undefined && filter.to !== undefined && filter.from > filter.to) throw new Error('from must not be later than to');
  const query = normalizedQuery(filter.q);
  return [...items.filter(item => matchesHistoryFilter(item, filter, query))].sort(compareHistoryOrder);
};
export const filterHistoryItems = <T extends HistoryFilterItem>(items: T[], filter: HistoryFilter): T[] => matchingHistoryItems(items, filter).slice(0, 500);
export const pageHistoryItems = <T extends HistoryFilterItem>(items: T[], filter: HistoryFilter, anchor?: HistoryAnchor): { items: T[]; hasMore: boolean } => {
  const ordered = matchingHistoryItems(items, filter);
  const afterAnchor = anchor ? ordered.filter(item => compareHistoryOrder(item, anchor) > 0) : ordered;
  const bounded = afterAnchor.slice(0, 501);
  return { items: bounded.slice(0, 500), hasMore: bounded.length > 500 };
};
