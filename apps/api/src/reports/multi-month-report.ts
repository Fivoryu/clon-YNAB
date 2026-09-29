import type { FinancialState } from '../persistence/financial-store.ts';
import { REPORT_POLICY_ID, projectMonthlyReport, type MonthlyReport, type ReportCategorySpending } from './monthly-report.ts';

/** Approved multi-month report accounting policy identifier. Every range response carries it. */
export const MULTI_MONTH_POLICY_ID = 'report-policy/v2';
/** Maximum number of months one range may cover, inclusive of both ends. Never clamped, never truncated. */
export const REPORT_MONTH_RANGE_MAX = 24;

export type MultiMonthReportPolicy = {
  id: typeof MULTI_MONTH_POLICY_ID;
  /** The policy every month entry follows unchanged. */
  monthBasis: typeof REPORT_POLICY_ID;
  from: string;
  to: string;
  monthCount: number;
};
/** Period total over flow measures only. It deliberately has no pending-release field: that measure is a stock. */
export type MultiMonthReportTotal = {
  treatment: 'PERIOD_TOTAL_FLOW_MEASURES_ONLY';
  incomeMinor: number;
  expenseMinor: number;
  categories: ReportCategorySpending[];
  transfers: { treatment: 'OUTSIDE_INCOME_EXPENSE_TOTALS'; totalMinor: number };
  provisional: { treatment: 'INCLUDED_PROVISIONAL'; count: number; incomeMinor: number; expenseMinor: number };
};
export type MultiMonthReportDisclosure = {
  recomputedFromEffectiveHistory: true;
  categoryLabelsAreCurrent: true;
  durable: false;
};
export type MultiMonthReport = {
  policy: MultiMonthReportPolicy;
  months: MonthlyReport[];
  total: MultiMonthReportTotal;
  disclosure: MultiMonthReportDisclosure;
  version: number;
};

const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

const parseMonth = (month: string): { year: number; month: number } => {
  const match = MONTH_PATTERN.exec(month);
  if (!match) throw new Error(`Malformed month "${month}": expected YYYY-MM`);
  return { year: Number(match[1]), month: Number(match[2]) };
};

/**
 * Validates an explicit inclusive range and reports its length in months.
 * A malformed month, `from` later than `to`, and a range above `REPORT_MONTH_RANGE_MAX` are rejected;
 * an over-long range is never clamped, truncated, or partially served.
 */
const resolveRange = (from: string, to: string): { start: { year: number; month: number }; length: number } => {
  const start = parseMonth(from);
  const end = parseMonth(to);
  const length = (end.year - start.year) * 12 + (end.month - start.month) + 1;
  if (length < 1) throw new Error(`Invalid month range ${from}..${to}: from must not be later than to`);
  if (length > REPORT_MONTH_RANGE_MAX) throw new Error(`Month range ${from}..${to} spans ${length} months, exceeding the ${REPORT_MONTH_RANGE_MAX}-month maximum`);
  return { start, length };
};

/** Inclusive month count of `from`..`to`, under the same rejection rules as `monthsInRange`. */
export const monthRangeLength = (from: string, to: string): number => resolveRange(from, to).length;

/**
 * Every month in `from`..`to`, ascending and inclusive, using UTC month arithmetic so year boundaries
 * are exact. Enumeration is index-based over the range, never derived from activity: a month without
 * activity is still enumerated.
 */
export const monthsInRange = (from: string, to: string): string[] => {
  const { start, length } = resolveRange(from, to);
  return Array.from({ length }, (_, offset) => {
    const date = new Date(Date.UTC(start.year, start.month - 1 + offset, 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  });
};

/**
 * The default policy is always resolved, so the `REPORT_POLICY_UNRESOLVED` branch of the single-month
 * projection is unreachable here. The narrow assertion records that invariant without reinterpreting it:
 * each series entry is the single-month report verbatim.
 */
const projectMonth = (state: FinancialState, month: string): MonthlyReport => projectMonthlyReport(state, month) as MonthlyReport;

/**
 * Sums the covered flow measures across already-projected months. Categories are summed by category
 * identity and labelled with their current name and archived flag; every current category appears, even
 * at zero. The release measure is deliberately absent: it is a stock, not a flow.
 */
const projectPeriodTotal = (categories: FinancialState['categories'], entries: MonthlyReport[]): MultiMonthReportTotal => {
  const sumOverMonths = (measure: (month: MonthlyReport) => number) => entries.reduce((sum, month) => sum + measure(month), 0);
  return {
    treatment: 'PERIOD_TOTAL_FLOW_MEASURES_ONLY',
    incomeMinor: sumOverMonths(month => month.incomeMinor),
    expenseMinor: sumOverMonths(month => month.expenseMinor),
    categories: categories.map(category => ({
      id: category.id,
      name: category.name,
      archived: category.archived,
      spendingMinor: sumOverMonths(month => month.categories.find(entry => entry.id === category.id)?.spendingMinor ?? 0),
    })),
    transfers: { treatment: 'OUTSIDE_INCOME_EXPENSE_TOTALS', totalMinor: sumOverMonths(month => month.transfers.totalMinor) },
    provisional: {
      treatment: 'INCLUDED_PROVISIONAL',
      count: sumOverMonths(month => month.provisional.count),
      incomeMinor: sumOverMonths(month => month.provisional.incomeMinor),
      expenseMinor: sumOverMonths(month => month.provisional.expenseMinor),
    },
  };
};

/**
 * Projects the bounded multi-month series: one single-month entry per month in the range, in ascending
 * order, plus a period total over flow measures only. Every entry and the reported revision come from the
 * one snapshot in `state`; nothing here alters a month's values.
 */
export const projectMultiMonthReport = (state: FinancialState, from: string, to: string): MultiMonthReport => {
  const months = monthsInRange(from, to);
  const entries = months.map(month => projectMonth(state, month));
  return {
    policy: { id: MULTI_MONTH_POLICY_ID, monthBasis: REPORT_POLICY_ID, from, to, monthCount: months.length },
    months: entries,
    total: projectPeriodTotal(state.categories, entries),
    disclosure: { recomputedFromEffectiveHistory: true, categoryLabelsAreCurrent: true, durable: false },
    version: state.version,
  };
};
