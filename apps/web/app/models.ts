export type Category = { id: string; name: string; archived: boolean };

export type Account = {
  id: string;
  name: string;
  kind: 'CASH' | 'CHECKING';
  archived: boolean;
  openingBalanceMinor: number;
  balanceMinor: number;
};

export type Budget = {
  id: string;
  setupStep: 'ACCOUNT' | 'CATEGORIES' | 'COMPLETE';
  version: number;
  accounts: Account[];
  accountBalanceMinor: number;
  account: Account | null;
  categories: Category[];
};

type CategoryTargetProgress = {
  amountMinor: number;
  progressMinor: number;
  remainingMinor: number;
  status: 'MET' | 'UNDERFUNDED' | 'OVERDUE';
};

export type CategoryTargetState =
  | (CategoryTargetProgress & { kind: 'MONTHLY_SET_ASIDE' })
  | (CategoryTargetProgress & { kind: 'BALANCE_BY_DATE'; targetMonth: string });

/**
 * No target history is retained, so a target shown for any month other than the current one is today's
 * definition rather than the definition in force then. A dated target adds its own case: while the viewed
 * month precedes its target month, the definition shown is the current one too.
 */
export function showsTargetDisclosure(viewedMonth: string, currentMonth: string, target: CategoryTargetState | undefined): boolean {
  return viewedMonth < currentMonth || (target?.kind === 'BALANCE_BY_DATE' && viewedMonth < target.targetMonth);
}

export type CategoryTargetInput =
  | { kind: 'MONTHLY_SET_ASIDE'; amountMinor: number }
  | { kind: 'BALANCE_BY_DATE'; amountMinor: number; targetMonth: string };

export type CategorySummary = Category & {
  carryoverMinor: number;
  assignedMinor: number;
  activityMinor: number;
  availableMinor: number;
  target?: CategoryTargetState;
};

export type Summary = {
  month: string;
  accountBalanceMinor: number;
  accounts: Account[];
  rta: {
    amountMinor: number;
    releasedIncomeMinor: number;
    unreleasedIncomeMinor: number;
    priorCarryMinor: number;
    assignedMinor: number;
  };
  categories: CategorySummary[];
  version: number;
};

export type CommandResult = {
  id?: string;
  transferId?: string;
  version: number;
  amountMinor?: number;
  released?: boolean;
  payee?: string | null;
  memo?: string | null;
};

export type CsvDiagnostic = { row: number; field: string; code: string; message: string };
export type CsvImportResult = {
  rows: number;
  accepted: number;
  rejected: number;
  diagnostics: CsvDiagnostic[];
  diagnosticsTruncated: boolean;
  version: number;
};

export type HistoryItem =
  | {
      transactionId: string;
      kind: 'INCOME' | 'SPENDING';
      date: string;
      amountMinor: number;
      category?: Category | null;
      payee: string | null;
      memo: string | null;
      state: 'ELIGIBLE' | 'PROTECTED';
      accountId?: string;
    }
  | {
      transactionId: string;
      kind: 'TRANSFER';
      date: string;
      amountMinor: number;
      payee: string | null;
      memo: string | null;
      sourceAccount: Pick<Account, 'id' | 'name' | 'kind' | 'archived'>;
      destinationAccount: Pick<Account, 'id' | 'name' | 'kind' | 'archived'>;
      createdAt: string;
    };

export type HistoryResponse = { items: HistoryItem[]; version: number; nextCursor: string | null };
export type AccountHistorySnapshot = {
  accountId: string;
  items: HistoryItem[];
  version: number;
  nextCursor: string | null;
};
export type AccountHistoryErrorKind = 'initial' | 'append' | 'stale-cursor';
export type AccountHistoryState = AccountHistorySnapshot & {
  loading: boolean;
  appending: boolean;
  error: string | null;
  errorKind: AccountHistoryErrorKind | null;
};

export function appendAccountHistoryPage(
  current: AccountHistorySnapshot,
  accountId: string,
  cursor: string,
  page: HistoryResponse,
): AccountHistorySnapshot | null {
  if (current.accountId !== accountId || current.nextCursor !== cursor || current.version !== page.version) return null;

  const seen = new Set(current.items.map(item => item.transactionId));
  const newItems = page.items.filter(item => {
    if (seen.has(item.transactionId)) return false;
    seen.add(item.transactionId);
    return true;
  });
  return { ...current, items: [...current.items, ...newItems], nextCursor: page.nextCursor };
}

export function isCurrentAccountHistoryPageRequest(
  current: AccountHistorySnapshot,
  accountId: string,
  cursor: string,
  requestId: number,
  activeRequestId: number,
): boolean {
  return current.accountId === accountId && current.nextCursor === cursor && requestId === activeRequestId;
}

export function markAccountHistoryAppendError(
  current: AccountHistoryState,
  error: string,
  stale: boolean,
): AccountHistoryState {
  return { ...current, appending: false, error, errorKind: stale ? 'stale-cursor' : 'append' };
}

export type HistoryKind = '' | 'INCOME' | 'SPENDING' | 'TRANSFER';
export type HistoryMutation = { version: number; item?: HistoryItem; deleted?: boolean };

export type MonthlyReportAccountReference = { id: string; name: string; kind: Account['kind']; archived: boolean };
export type MonthlyReportCategorySpending = { id: string; name: string; archived: boolean; spendingMinor: number };
export type MonthlyReportTransferItem = {
  transferId: string;
  sourceAccount: MonthlyReportAccountReference;
  destinationAccount: MonthlyReportAccountReference;
  date: string;
  amountMinor: number;
};
export type MonthlyReport = {
  month: string;
  policy: { id: string; month: string };
  incomeMinor: number;
  expenseMinor: number;
  categories: MonthlyReportCategorySpending[];
  transfers: { treatment: 'OUTSIDE_INCOME_EXPENSE_TOTALS'; totalMinor: number; items: MonthlyReportTransferItem[] };
  provisional: { treatment: 'INCLUDED_PROVISIONAL'; count: number; incomeMinor: number; expenseMinor: number };
  incomeRelease: { treatment: 'PENDING_RELEASE'; receivedMinor: number; releasedMinor: number; pendingMinor: number };
  version: number;
};
export type MonthlyReportUnavailable = {
  month: string;
  policy: { id: null; month: string };
  unavailable: { code: 'REPORT_POLICY_UNRESOLVED'; treatment: 'NO_TOTALS_RETURNED' };
};
export type MonthlyReportProjection = MonthlyReport | MonthlyReportUnavailable;
export type MonthlyReportErrorKind = 'initial' | 'invalid-month';
export type MonthlyReportState = {
  month: string;
  projection: MonthlyReportProjection | null;
  loading: boolean;
  error: string | null;
  errorKind: MonthlyReportErrorKind | null;
};

const reportMonthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;
const reportMonthNames = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export function isReportMonth(value: string): boolean { return reportMonthPattern.test(value); }

export function reportMonthLabel(month: string): string {
  if (!isReportMonth(month)) return month;
  const [year, index] = month.split('-');
  return `${reportMonthNames[Number(index) - 1]} de ${year}`;
}

export function isMonthlyReportUnavailable(projection: MonthlyReportProjection): projection is MonthlyReportUnavailable {
  return 'unavailable' in projection;
}

export type MultiMonthReportPolicy = {
  id: 'report-policy/v2';
  monthBasis: 'report-policy/v1';
  from: string;
  to: string;
  monthCount: number;
};
export type MultiMonthReportTotal = {
  treatment: 'PERIOD_TOTAL_FLOW_MEASURES_ONLY';
  incomeMinor: number;
  expenseMinor: number;
  categories: MonthlyReportCategorySpending[];
  transfers: { treatment: 'OUTSIDE_INCOME_EXPENSE_TOTALS'; totalMinor: number };
  provisional: { treatment: 'INCLUDED_PROVISIONAL'; count: number; incomeMinor: number; expenseMinor: number };
};
export type MultiMonthDisclosure = {
  recomputedFromEffectiveHistory: true;
  categoryLabelsAreCurrent: true;
  durable: false;
};
export type MultiMonthReport = {
  policy: MultiMonthReportPolicy;
  months: MonthlyReport[];
  total: MultiMonthReportTotal;
  disclosure: MultiMonthDisclosure;
  version: number;
};
export type MultiMonthReportErrorKind = 'initial' | 'invalid-range';
export type MultiMonthReportState = {
  from: string;
  to: string;
  report: MultiMonthReport | null;
  loading: boolean;
  error: string | null;
  errorKind: MultiMonthReportErrorKind | null;
};

/** The API's inclusive maximum for one range. The client rejects beyond it and never clamps. */
export const REPORT_RANGE_MAX_MONTHS = 24;

/** Inclusive month count of `from`..`to`, or null when a month is malformed or the range is inverted. Pure measurement; the maximum is enforced by `isReportRange`. */
export function reportRangeLength(from: string, to: string): number | null {
  if (!isReportMonth(from) || !isReportMonth(to)) return null;
  const [fromYear, fromIndex] = from.split('-').map(Number);
  const [toYear, toIndex] = to.split('-').map(Number);
  const length = (toYear - fromYear) * 12 + (toIndex - fromIndex) + 1;
  return length < 1 ? null : length;
}

/** The user-facing reason a range cannot be requested, or null when it can. */
export function reportRangeError(from: string, to: string): string | null {
  if (!isReportMonth(from) || !isReportMonth(to)) return 'Elige un mes válido en formato AAAA-MM para el inicio y el fin.';
  const length = reportRangeLength(from, to);
  if (length === null) return 'El mes de inicio no puede ser posterior al mes de fin.';
  if (length > REPORT_RANGE_MAX_MONTHS) return `El rango no puede superar ${REPORT_RANGE_MAX_MONTHS} meses.`;
  return null;
}

export function isReportRange(from: string, to: string): boolean { return reportRangeError(from, to) === null; }

export function reportRangeLabel(from: string, to: string): string {
  if (!isReportMonth(from) || !isReportMonth(to)) return [from || 'sin inicio', to || 'sin fin'].join(' \u2013 ');
  return from === to ? reportMonthLabel(from) : `${reportMonthLabel(from)} \u2013 ${reportMonthLabel(to)}`;
}
