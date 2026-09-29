import test from 'node:test';
import assert from 'node:assert/strict';
import type { FinancialState } from '../src/persistence/financial-store.ts';
import { REPORT_POLICY_ID, projectMonthlyReport } from '../src/reports/monthly-report.ts';
import { MULTI_MONTH_POLICY_ID, REPORT_MONTH_RANGE_MAX, monthRangeLength, monthsInRange, projectMultiMonthReport } from '../src/reports/multi-month-report.ts';

const budgetState = (overrides: Partial<FinancialState> = {}): FinancialState => ({
  id: 'budget-multi', setupStep: 'COMPLETE', timezone: 'UTC', version: 11,
  account: { id: 'account-1', name: 'Cash', openingBalanceMinor: 0, kind: 'CHECKING', archived: false },
  accounts: [
    { id: 'account-1', name: 'Cash', kind: 'CHECKING', archived: false, openingBalanceMinor: 0 },
    { id: 'account-2', name: 'Savings', kind: 'CHECKING', archived: false, openingBalanceMinor: 0 },
  ],
  categories: [{ id: 'food', name: 'Food', archived: false }, { id: 'bills', name: 'Bills', archived: false }],
  events: [], transfers: [], ...overrides,
});

// 2025-12 has income and food spending, 2026-01 is completely empty, 2026-02 has income, bills spending and
// one transfer. The range therefore crosses a year boundary and contains a gap month.
const activityState = () => budgetState({
  events: [
    { id: 'dec-income', transactionId: 'dec-income', kind: 'INCOME', amountMinor: 100000, month: '2025-12', businessDate: '2025-12-04', accountId: 'account-1', status: 'POSTED', reconciled: false },
    { id: 'dec-spending', transactionId: 'dec-spending', kind: 'SPENDING', amountMinor: 30000, month: '2025-12', businessDate: '2025-12-09', accountId: 'account-1', categoryId: 'food', status: 'POSTED', reconciled: false },
    { id: 'feb-income', transactionId: 'feb-income', kind: 'INCOME', amountMinor: 50000, month: '2026-02', businessDate: '2026-02-02', accountId: 'account-1', status: 'POSTED', reconciled: false },
    { id: 'feb-spending', transactionId: 'feb-spending', kind: 'SPENDING', amountMinor: 2000, month: '2026-02', businessDate: '2026-02-06', accountId: 'account-1', categoryId: 'bills', status: 'POSTED', reconciled: false },
    { id: 'feb-transfer-out', kind: 'TRANSFER_OUT', amountMinor: 25000, month: '2026-02', accountId: 'account-1', transferId: 'transfer-1' },
    { id: 'feb-transfer-in', kind: 'TRANSFER_IN', amountMinor: 25000, month: '2026-02', accountId: 'account-2', transferId: 'transfer-1' },
  ],
  transfers: [{ id: 'transfer-1', sourceAccountId: 'account-1', destinationAccountId: 'account-2', amountMinor: 25000, businessDate: '2026-02-14', month: '2026-02', createdAt: '2026-02-14T00:00:00.000Z' }],
});

const spendingState = (events: FinancialState['events'], categories: FinancialState['categories'] = budgetState().categories) => budgetState({ categories, events });

const FLOW_TOTAL_KEYS = ['categories', 'expenseMinor', 'incomeMinor', 'provisional', 'transfers', 'treatment'];
// A key exposes the release measure when one of its camelCase words is "pending" (pendingMinor, ...) or when it
// names the income release breakdown. "spendingMinor" must not match.
const exposesRelease = (key: string) => {
  const words = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return words.includes('pending') || (words.includes('income') && words.includes('release'));
};
const releaseKeyPaths = (value: unknown, path: string): string[] => Array.isArray(value)
  ? value.flatMap((item, index) => releaseKeyPaths(item, `${path}[${index}]`))
  : value && typeof value === 'object'
    ? Object.entries(value).flatMap(([key, nested]) => [...(exposesRelease(key) ? [`${path}.${key}`] : []), ...releaseKeyPaths(nested, `${path}.${key}`)])
    : [];
const sumBy = <T,>(items: T[], measure: (item: T) => number) => items.reduce((sum, item) => sum + measure(item), 0);

test('the range helpers enumerate and measure every month inclusively, ascending, across year boundaries', () => {
  assert.equal(MULTI_MONTH_POLICY_ID, 'report-policy/v2');
  assert.equal(REPORT_MONTH_RANGE_MAX, 24);
  assert.deepEqual(monthsInRange('2025-11', '2026-02'), ['2025-11', '2025-12', '2026-01', '2026-02']);
  assert.deepEqual(monthsInRange('2026-03', '2026-03'), ['2026-03']);
  assert.deepEqual(monthsInRange('2027-11', '2028-02'), ['2027-11', '2027-12', '2028-01', '2028-02']);
  assert.deepEqual(monthsInRange('2025-12', '2026-12').slice(0, 3), ['2025-12', '2026-01', '2026-02']);

  assert.equal(monthRangeLength('2026-01', '2026-01'), 1);
  assert.equal(monthRangeLength('2025-11', '2026-02'), 4);
  assert.equal(monthRangeLength('2025-01', '2026-12'), 24);
  assert.equal(monthRangeLength('2025-12', '2026-12'), 13);
  assert.equal(monthRangeLength('2026-01', '2026-12'), 12);
  assert.equal(monthRangeLength('2026-02', '2027-02'), 13);
});

test('the series holds exactly one entry per month, in order, with empty months present as explicit zeros', () => {
  const state = activityState();
  const report = projectMultiMonthReport(state, '2025-12', '2026-02');

  assert.deepEqual(report.months.map(month => month.month), ['2025-12', '2026-01', '2026-02']);
  assert.equal(report.policy.monthCount, 3);
  // Every entry is the single-month projection for that month, verbatim: series membership changes nothing.
  for (const month of report.months) assert.deepEqual(month, projectMonthlyReport(state, month.month));

  const empty = report.months[1];
  assert.equal(empty.incomeMinor, 0);
  assert.equal(empty.expenseMinor, 0);
  assert.deepEqual(empty.categories, [{ id: 'food', name: 'Food', archived: false, spendingMinor: 0 }, { id: 'bills', name: 'Bills', archived: false, spendingMinor: 0 }]);
  assert.deepEqual(empty.transfers, { treatment: 'OUTSIDE_INCOME_EXPENSE_TOTALS', totalMinor: 0, items: [] });
  assert.deepEqual(empty.provisional, { treatment: 'INCLUDED_PROVISIONAL', count: 0, incomeMinor: 0, expenseMinor: 0 });
  assert.deepEqual(empty.incomeRelease, { treatment: 'PENDING_RELEASE', receivedMinor: 0, releasedMinor: 0, pendingMinor: 0 });
});

test('the response identifies the policy pair, the range, the revision and its disclosure', () => {
  const report = projectMultiMonthReport(activityState(), '2025-12', '2026-02');

  assert.deepEqual(report.policy, { id: 'report-policy/v2', monthBasis: REPORT_POLICY_ID, from: '2025-12', to: '2026-02', monthCount: 3 });
  assert.deepEqual(Object.keys(report.policy).sort(), ['from', 'id', 'monthBasis', 'monthCount', 'to']);
  assert.deepEqual(report.disclosure, { recomputedFromEffectiveHistory: true, categoryLabelsAreCurrent: true, durable: false });
  assert.deepEqual(Object.keys(report.disclosure).sort(), ['categoryLabelsAreCurrent', 'durable', 'recomputedFromEffectiveHistory']);
  assert.equal(report.version, 11);
  assert.deepEqual(Object.keys(report).sort(), ['disclosure', 'months', 'policy', 'total', 'version']);
  for (const month of report.months) assert.equal(month.policy.id, REPORT_POLICY_ID, 'each month entry keeps the single-month policy untouched');
});

test('the period total sums only the covered flow measures', () => {
  const report = projectMultiMonthReport(activityState(), '2025-12', '2026-02');
  const { total } = report;

  assert.equal(total.treatment, 'PERIOD_TOTAL_FLOW_MEASURES_ONLY');
  assert.equal(total.incomeMinor, 150000);
  assert.equal(total.expenseMinor, 32000);
  assert.deepEqual(total.categories, [{ id: 'food', name: 'Food', archived: false, spendingMinor: 30000 }, { id: 'bills', name: 'Bills', archived: false, spendingMinor: 2000 }]);
  assert.deepEqual(total.transfers, { treatment: 'OUTSIDE_INCOME_EXPENSE_TOTALS', totalMinor: 25000 });
  assert.deepEqual(total.provisional, { treatment: 'INCLUDED_PROVISIONAL', count: 0, incomeMinor: 0, expenseMinor: 0 });
  assert.equal(total.incomeMinor, sumBy(report.months, month => month.incomeMinor), 'the total is the sum of the per-month income it covers');
  assert.equal(total.expenseMinor, sumBy(report.months, month => month.expenseMinor));
  assert.equal(total.transfers.totalMinor, sumBy(report.months, month => month.transfers.totalMinor));
  assert.equal(total.provisional.count, sumBy(report.months, month => month.provisional.count));
});

test('the period total carries no pending-release field at all', () => {
  const report = projectMultiMonthReport(activityState(), '2025-12', '2026-02');

  assert.deepEqual(Object.keys(report.total).sort(), FLOW_TOTAL_KEYS);
  assert.equal('pendingMinor' in report.total, false);
  assert.equal('incomeRelease' in report.total, false);
  assert.deepEqual(releaseKeyPaths(report.total, 'total'), [], 'no nesting level of the total may expose the release measure');
  assert.notDeepEqual(releaseKeyPaths(report.months, 'months'), [], 'each month entry still reports its own complete release breakdown');
});

test('transfers stay visible under their treatment and contribute nothing to the total measures', () => {
  const report = projectMultiMonthReport(activityState(), '2025-12', '2026-02');
  const february = report.months[2];

  assert.equal(february.transfers.treatment, 'OUTSIDE_INCOME_EXPENSE_TOTALS');
  assert.equal(february.transfers.totalMinor, 25000);
  assert.equal(february.transfers.items.length, 1);
  assert.equal(february.transfers.items[0].amountMinor, 25000);
  assert.equal(report.total.transfers.totalMinor, 25000);
  assert.equal(report.total.incomeMinor, 150000, 'income excludes the 25000 transfer');
  assert.equal(report.total.expenseMinor, 32000);
  assert.equal(report.total.categories.reduce((sum, category) => sum + category.spendingMinor, 0), 32000, 'category spending excludes the transfer');
});

test('a month that releases income received earlier keeps its own breakdown while the total stays flow-only', () => {
  const state = budgetState({
    version: 4,
    events: [
      { id: 'dec-income', transactionId: 'dec-income', kind: 'INCOME', amountMinor: 80000, month: '2025-12', businessDate: '2025-12-01', accountId: 'account-1', status: 'POSTED', reconciled: false },
      { id: 'jan-release', kind: 'INCOME_RELEASE', amountMinor: 80000, month: '2026-01', relatedEventId: 'dec-income' },
    ],
  });
  const report = projectMultiMonthReport(state, '2025-12', '2026-01');

  assert.deepEqual(report.months[1], projectMonthlyReport(state, '2026-01'));
  assert.equal(report.months[1].incomeMinor, 0);
  // The release month reports its own v1 breakdown, including a negative month-level pending remainder.
  assert.deepEqual(report.months[1].incomeRelease, { treatment: 'PENDING_RELEASE', receivedMinor: 0, releasedMinor: 80000, pendingMinor: -80000 });
  assert.equal(report.total.incomeMinor, 80000, 'realized income is unaffected by a later release');
  assert.equal(report.total.expenseMinor, 0);
  assert.deepEqual(Object.keys(report.total).sort(), FLOW_TOTAL_KEYS);
  assert.deepEqual(releaseKeyPaths(report.total, 'total'), []);
});

test('exactly 24 months are served and 25 are rejected instead of truncated', () => {
  const state = activityState();
  const widest = projectMultiMonthReport(state, '2025-11', '2027-10');

  assert.equal(monthsInRange('2025-11', '2027-10').length, 24);
  assert.equal(widest.policy.monthCount, 24);
  assert.equal(widest.months.length, 24);
  assert.equal(widest.months[0].month, '2025-11');
  assert.equal(widest.months.at(-1)!.month, '2027-10');
  assert.deepEqual([...widest.months.map(month => month.month)].sort(), widest.months.map(month => month.month), 'the series is strictly ascending');
  assert.equal(new Set(widest.months.map(month => month.month)).size, 24, 'no month is duplicated or omitted');

  assert.throws(() => monthsInRange('2026-01', '2028-01'), /24-month maximum/);
  assert.throws(() => monthRangeLength('2026-01', '2028-01'), /24-month maximum/);
  assert.throws(() => projectMultiMonthReport(state, '2026-01', '2028-01'), /24-month maximum/);

  let truncated: string[] | undefined;
  try { truncated = monthsInRange('2026-01', '2028-01'); } catch { /* rejected, not clamped */ }
  assert.equal(truncated, undefined, 'a rejected range must not produce a partial series');
});

test('malformed months and an inverted range are rejected by every range entry point', () => {
  const state = activityState();

  for (const [from, to] of [['2026-1', '2026-02'], ['2026-01', '2026-2'], ['2026-13', '2027-01'], ['2026-00', '2026-01'], ['26-01', '2026-02'], ['2026-01-01', '2026-02'], ['', '2026-01'], ['not-a-month', '2026-01']]) {
    assert.throws(() => monthRangeLength(from, to), /Malformed month/, `${from}..${to} must be malformed`);
    assert.throws(() => monthsInRange(from, to), /Malformed month/, `${from}..${to} must be malformed`);
    assert.throws(() => projectMultiMonthReport(state, from, to), /Malformed month/, `${from}..${to} must be malformed`);
  }

  assert.throws(() => monthRangeLength('2026-03', '2026-01'), /from must not be later than to/);
  assert.throws(() => monthsInRange('2026-03', '2026-01'), /from must not be later than to/);
  assert.throws(() => projectMultiMonthReport(state, '2026-03', '2026-01'), /from must not be later than to/);
});

test('a single-month range returns one entry and only that month in the total', () => {
  const state = activityState();
  const report = projectMultiMonthReport(state, '2026-02', '2026-02');

  assert.equal(report.policy.monthCount, 1);
  assert.equal(report.months.length, 1);
  assert.deepEqual(report.months[0], projectMonthlyReport(state, '2026-02'));
  assert.equal(report.total.incomeMinor, 50000);
  assert.equal(report.total.expenseMinor, 2000);
  assert.deepEqual(report.total.categories, [{ id: 'food', name: 'Food', archived: false, spendingMinor: 0 }, { id: 'bills', name: 'Bills', archived: false, spendingMinor: 2000 }]);
  assert.equal(report.total.transfers.totalMinor, 25000);
});

test('a range whose months are all empty still returns a zero total and every category row', () => {
  const report = projectMultiMonthReport(budgetState(), '2026-01', '2026-03');

  assert.equal(report.months.length, 3);
  for (const month of report.months) {
    assert.equal(month.incomeMinor, 0);
    assert.equal(month.expenseMinor, 0);
    assert.deepEqual(month.categories.map(category => category.spendingMinor), [0, 0]);
  }
  assert.deepEqual(report.total, {
    treatment: 'PERIOD_TOTAL_FLOW_MEASURES_ONLY',
    incomeMinor: 0,
    expenseMinor: 0,
    categories: [{ id: 'food', name: 'Food', archived: false, spendingMinor: 0 }, { id: 'bills', name: 'Bills', archived: false, spendingMinor: 0 }],
    transfers: { treatment: 'OUTSIDE_INCOME_EXPENSE_TOTALS', totalMinor: 0 },
    provisional: { treatment: 'INCLUDED_PROVISIONAL', count: 0, incomeMinor: 0, expenseMinor: 0 },
  });
});

test('activity outside the requested range never leaks into the series or its total', () => {
  const state = spendingState([
    { id: 'nov-food', kind: 'SPENDING', amountMinor: 900, month: '2025-11', categoryId: 'food', accountId: 'account-1', status: 'POSTED', reconciled: false },
    { id: 'jan-food', kind: 'SPENDING', amountMinor: 400, month: '2026-01', categoryId: 'food', accountId: 'account-1', status: 'POSTED', reconciled: false },
    { id: 'mar-income', kind: 'INCOME', amountMinor: 7000, month: '2026-03', accountId: 'account-1', status: 'POSTED', reconciled: false },
  ]);
  state.transfers = [{ id: 'mar-transfer', sourceAccountId: 'account-1', destinationAccountId: 'account-2', amountMinor: 300, businessDate: '2026-03-01', month: '2026-03', createdAt: '2026-03-01T00:00:00.000Z' }];

  const report = projectMultiMonthReport(state, '2025-12', '2026-02');
  assert.equal(report.months[0].categories[0].spendingMinor, 0, '2025-11 spending stays outside the range');
  assert.equal(report.months[1].categories[0].spendingMinor, 400);
  assert.equal(report.total.expenseMinor, 400);
  assert.equal(report.total.incomeMinor, 0, '2026-03 income stays outside the range');
  assert.deepEqual(report.total.categories, [{ id: 'food', name: 'Food', archived: false, spendingMinor: 400 }, { id: 'bills', name: 'Bills', archived: false, spendingMinor: 0 }]);
  assert.deepEqual(report.total.transfers, { treatment: 'OUTSIDE_INCOME_EXPENSE_TOTALS', totalMinor: 0 }, '2026-03 transfer stays outside the range');
});

test('an archived category is summed by identity and labelled with its current name and archived flag', () => {
  const state = spendingState([
    { id: 'dec-food', kind: 'SPENDING', amountMinor: 1000, month: '2025-12', categoryId: 'food', accountId: 'account-1', status: 'POSTED', reconciled: false },
    { id: 'jan-food', kind: 'SPENDING', amountMinor: 2500, month: '2026-01', categoryId: 'food', accountId: 'account-1', status: 'POSTED', reconciled: false },
    { id: 'jan-bills', kind: 'SPENDING', amountMinor: 500, month: '2026-01', categoryId: 'bills', accountId: 'account-1', status: 'POSTED', reconciled: false },
  ], [{ id: 'food', name: 'Groceries', archived: true }, { id: 'bills', name: 'Bills', archived: false }]);

  const report = projectMultiMonthReport(state, '2025-12', '2026-01');
  assert.deepEqual(report.months[0].categories[0], { id: 'food', name: 'Groceries', archived: true, spendingMinor: 1000 });
  assert.deepEqual(report.total.categories, [{ id: 'food', name: 'Groceries', archived: true, spendingMinor: 3500 }, { id: 'bills', name: 'Bills', archived: false, spendingMinor: 500 }]);
  assert.equal(report.total.expenseMinor, 4000);
});

test('working amounts are summed into the period provisional subtotals and stay included in the totals', () => {
  const state = spendingState([
    { id: 'working-income', kind: 'INCOME', amountMinor: 10000, month: '2026-01', accountId: 'account-1', status: 'WORKING', reconciled: false },
    { id: 'working-spending', kind: 'SPENDING', amountMinor: 2500, month: '2026-02', categoryId: 'food', accountId: 'account-1', status: 'WORKING', reconciled: false },
    { id: 'posted-income', kind: 'INCOME', amountMinor: 7000, month: '2026-02', accountId: 'account-1', status: 'POSTED', reconciled: false },
  ]);

  const report = projectMultiMonthReport(state, '2026-01', '2026-02');
  assert.deepEqual(report.total.provisional, { treatment: 'INCLUDED_PROVISIONAL', count: 2, incomeMinor: 10000, expenseMinor: 2500 });
  assert.equal(report.total.incomeMinor, 17000);
  assert.equal(report.total.expenseMinor, 2500);
  assert.deepEqual(report.total.categories, [{ id: 'food', name: 'Food', archived: false, spendingMinor: 2500 }, { id: 'bills', name: 'Bills', archived: false, spendingMinor: 0 }]);
});

test('the series folds effective history exactly as the single-month projection does', () => {
  const original = { id: 'dec-income', transactionId: 'dec-income', kind: 'INCOME' as const, amountMinor: 10000, month: '2025-12', accountId: 'account-1', businessDate: '2025-12-02', status: 'POSTED' as const, reconciled: false, createdAt: '2025-12-02T00:00:00.000Z' };
  const state = budgetState({
    version: 12,
    rawEvents: [original, { ...original, id: 'dec-income-replacement', amountMinor: 40000, supersedesEventId: 'dec-income', createdAt: '2025-12-03T00:00:00.000Z' }],
  });

  const report = projectMultiMonthReport(state, '2025-12', '2026-01');
  assert.equal(report.version, 12);
  assert.equal(report.months[0].incomeMinor, 40000, 'the superseded amount is replaced, never double counted');
  assert.deepEqual(report.months[0], projectMonthlyReport(state, '2025-12'));
  assert.equal(report.total.incomeMinor, 40000);
});
