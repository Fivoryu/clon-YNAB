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

export type CategorySummary = Category & {
  carryoverMinor: number;
  assignedMinor: number;
  activityMinor: number;
  availableMinor: number;
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
