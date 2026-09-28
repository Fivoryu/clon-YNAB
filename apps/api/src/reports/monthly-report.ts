import type { AccountState } from '../planning/engine.ts';
import type { FinancialEvent, FinancialState, TransferState } from '../persistence/financial-store.ts';
import { foldEffectiveHistory } from '../planning/transaction-history.ts';

/** Approved report accounting policy identifier. Every report response carries it. */
export const REPORT_POLICY_ID = 'report-policy/v1';

export type ReportAccountReference = { id: string; name: string; kind: 'CASH' | 'CHECKING'; archived: boolean };
export type ReportCategorySpending = { id: string; name: string; archived: boolean; spendingMinor: number };
export type ReportTransferItem = { transferId: string; sourceAccount: ReportAccountReference; destinationAccount: ReportAccountReference; date: string; amountMinor: number };
export type MonthlyReport = {
  month: string;
  policy: { id: string; month: string };
  incomeMinor: number;
  expenseMinor: number;
  categories: ReportCategorySpending[];
  transfers: { treatment: 'OUTSIDE_INCOME_EXPENSE_TOTALS'; totalMinor: number; items: ReportTransferItem[] };
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
export type ReportPolicy = { id: string } | null;

const effectiveEvents = (state: FinancialState): FinancialEvent[] => state.rawEvents ? foldEffectiveHistory(state.rawEvents) : state.events;
const ofKind = (events: readonly FinancialEvent[], kind: FinancialEvent['kind']) => events.filter(event => event.kind === kind);
const sum = (events: readonly FinancialEvent[]) => events.reduce((total, event) => total + event.amountMinor, 0);
const accountsOf = (state: FinancialState): AccountState[] => state.accounts ?? (state.account ? [{ ...state.account, kind: state.account.kind ?? 'CASH', archived: state.account.archived ?? false }] : []);
const inMonth = (event: FinancialEvent | TransferState, month: string) => event.month === month;

/**
 * Projects the approved `report-policy/v1` single-month report.
 * Transfers stay outside the income/expense measures and every category's spending; working records are
 * included and surfaced as provisional; unreleased income is exposed as pending release.
 */
export const projectMonthlyReport = (state: FinancialState, requestedMonth: string, policy: ReportPolicy = { id: REPORT_POLICY_ID }): MonthlyReportProjection => {
  if (!policy?.id) return { month: requestedMonth, policy: { id: null, month: requestedMonth }, unavailable: { code: 'REPORT_POLICY_UNRESOLVED', treatment: 'NO_TOTALS_RETURNED' } };
  const events = effectiveEvents(state).filter(event => inMonth(event, requestedMonth));
  const income = ofKind(events, 'INCOME');
  const expense = ofKind(events, 'SPENDING');
  const accounts = accountsOf(state);
  const transfers = (state.transfers ?? []).filter(transfer => inMonth(transfer, requestedMonth)).map(transfer => {
    const source = accounts.find(account => account.id === transfer.sourceAccountId);
    const destination = accounts.find(account => account.id === transfer.destinationAccountId);
    if (!source || !destination) throw new Error('Malformed transfer account reference');
    return { transferId: transfer.id, sourceAccount: { id: source.id, name: source.name, kind: source.kind, archived: source.archived }, destinationAccount: { id: destination.id, name: destination.name, kind: destination.kind, archived: destination.archived }, date: transfer.businessDate, amountMinor: transfer.amountMinor };
  });
  const receivedMinor = sum(income);
  const releasedMinor = sum(ofKind(events, 'INCOME_RELEASE'));
  const workingIncome = income.filter(event => event.status === 'WORKING');
  const workingExpense = expense.filter(event => event.status === 'WORKING');
  return {
    month: requestedMonth,
    policy: { id: policy.id, month: requestedMonth },
    incomeMinor: receivedMinor,
    expenseMinor: sum(expense),
    categories: state.categories.map(category => ({ id: category.id, name: category.name, archived: category.archived, spendingMinor: sum(expense.filter(event => event.categoryId === category.id)) })),
    transfers: { treatment: 'OUTSIDE_INCOME_EXPENSE_TOTALS', totalMinor: transfers.reduce((total, transfer) => total + transfer.amountMinor, 0), items: transfers },
    provisional: { treatment: 'INCLUDED_PROVISIONAL', count: workingIncome.length + workingExpense.length, incomeMinor: sum(workingIncome), expenseMinor: sum(workingExpense) },
    incomeRelease: { treatment: 'PENDING_RELEASE', receivedMinor, releasedMinor, pendingMinor: receivedMinor - releasedMinor },
    version: state.version,
  };
};
