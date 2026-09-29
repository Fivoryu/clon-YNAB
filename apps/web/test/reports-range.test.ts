import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  REPORT_RANGE_MAX_MONTHS,
  isReportRange,
  reportRangeError,
  reportRangeLabel,
  reportRangeLength,
  type MultiMonthReport,
} from '../app/models.ts';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const controller = read('../app/hooks/useBudgetApp.ts');
const models = read('../app/models.ts');

const rangeReport: MultiMonthReport = {
  policy: { id: 'report-policy/v2', monthBasis: 'report-policy/v1', from: '2026-01', to: '2026-03', monthCount: 3 },
  months: [],
  total: {
    treatment: 'PERIOD_TOTAL_FLOW_MEASURES_ONLY', incomeMinor: 0, expenseMinor: 0,
    categories: [{ id: 'food', name: 'Food', archived: false, spendingMinor: 0 }],
    transfers: { treatment: 'OUTSIDE_INCOME_EXPENSE_TOTALS', totalMinor: 0 },
    provisional: { treatment: 'INCLUDED_PROVISIONAL', count: 0, incomeMinor: 0, expenseMinor: 0 },
  },
  disclosure: { recomputedFromEffectiveHistory: true, categoryLabelsAreCurrent: true, durable: false },
  version: 4,
};

test('a range is accepted only when both months are well formed, ordered, and within the maximum', () => {
  assert.equal(isReportRange('2026-01', '2026-01'), true);
  assert.equal(isReportRange('2026-01', '2026-03'), true);
  assert.equal(isReportRange('2025-12', '2026-02'), true);
  assert.equal(reportRangeError('2026-01', '2026-03'), null);

  assert.equal(isReportRange('2026-3', '2026-04'), false);
  assert.equal(isReportRange('', '2026-04'), false);
  assert.equal(isReportRange('2026-13', '2026-14'), false);
  assert.equal(isReportRange('2026-04', '2026-01'), false);
  assert.equal(isReportRange('2026-01', '2028-01'), false);

  assert.match(reportRangeError('2026-3', '2026-04')!, /AAAA-MM/);
  assert.match(reportRangeError('2026-04', '2026-01')!, /posterior/);
  assert.match(reportRangeError('2026-01', '2028-01')!, new RegExp(`superar ${REPORT_RANGE_MAX_MONTHS} meses`));
});

test('the inclusive length counts every month including across a year boundary', () => {
  assert.equal(reportRangeLength('2026-01', '2026-01'), 1);
  assert.equal(reportRangeLength('2026-01', '2026-03'), 3);
  assert.equal(reportRangeLength('2025-11', '2026-02'), 4);
  assert.equal(reportRangeLength('2026-01', '2027-12'), REPORT_RANGE_MAX_MONTHS);
  assert.equal(reportRangeLength('2026-1', '2026-03'), null);
  assert.equal(reportRangeLength('2026-04', '2026-01'), null);
});

test('the maximum is exactly twenty-four months and one month past it is rejected, never shortened', () => {
  assert.equal(reportRangeLength('2026-01', '2027-12'), REPORT_RANGE_MAX_MONTHS);
  assert.equal(isReportRange('2026-01', '2027-12'), true);
  const tooLong = reportRangeLength('2026-01', '2028-01')!;
  assert.equal(tooLong, REPORT_RANGE_MAX_MONTHS + 1);
  assert.equal(isReportRange('2026-01', '2028-01'), false);
  assert.equal(reportRangeLength('2016-01', '2026-01'), 121);
  assert.equal(isReportRange('2016-01', '2026-01'), false);
});

test('a range is labelled for the reader and never dresses an invalid month as one', () => {
  assert.equal(reportRangeLabel('2026-03', '2026-03'), 'marzo de 2026');
  assert.equal(reportRangeLabel('2026-01', '2026-03'), 'enero de 2026 – marzo de 2026');
  assert.equal(reportRangeLabel('2025-12', '2026-01'), 'diciembre de 2025 – enero de 2026');
  assert.match(reportRangeLabel('', ''), /sin inicio/);
  assert.match(reportRangeLabel('', ''), /sin fin/);
  assert.ok(reportRangeLabel('2026-1', '2026-03').startsWith('2026-1'), 'an invalid month is shown verbatim rather than dressed as a month name');
  assert.ok(reportRangeLabel('2026-03', '2026-1').endsWith('2026-1'), 'an invalid end month is shown verbatim too');
});

test('the range contract exposes no period pending-release figure', () => {
  const totalBlock = models.match(/export type MultiMonthReportTotal = \{[\s\S]*?\n\};/);
  assert.ok(totalBlock, 'the range total type must be declared');
  assert.doesNotMatch(totalBlock[0], /pendingMinor|incomeRelease|releasedMinor|receivedMinor/);
  assert.match(totalBlock[0], /PERIOD_TOTAL_FLOW_MEASURES_ONLY/);
  assert.match(totalBlock[0], /OUTSIDE_INCOME_EXPENSE_TOTALS/);
  const monthBlock = models.match(/export type MonthlyReport = \{[\s\S]*?\n\};/);
  assert.ok(monthBlock, 'the per-month type must still carry its own release breakdown');
  assert.match(monthBlock[0], /incomeRelease/);
  const policyBlock = models.match(/export type MultiMonthReportPolicy = \{[\s\S]*?\n\};/);
  assert.ok(policyBlock, 'the range policy type must be declared');
  assert.match(policyBlock[0], /id: 'report-policy\/v2';/, 'the range policy id must be the literal, not widened to string');
  assert.match(policyBlock[0], /monthBasis: 'report-policy\/v1';/, 'the month basis must be the literal, not widened to string');
});

test('the range reader requests exactly from and to and nothing else', () => {
  const templates = controller.match(/`\/api\/v1\/budgets\/\$\{budgetId\}\/reports\/monthly\?from=[^`]*`/g) ?? [];
  assert.equal(templates.length, 1, 'exactly one range request template');
  assert.match(templates[0], /\?from=\$\{encodeURIComponent\(requestedFrom\)\}&to=\$\{encodeURIComponent\(requestedTo\)\}`$/);
  assert.equal((templates[0].match(/&/g) ?? []).length, 1, 'exactly one separator, so only from and to are sent');
  assert.doesNotMatch(templates[0], /month=|compare|trend|delta|percent|export/);
  assert.equal((controller.match(/reports\/monthly\?from=/g) ?? []).length, 1);
});

test('an invalid or over-long range is rejected before any request is issued', () => {
  const rangeReader = controller.slice(controller.indexOf('const readReportRange = useCallback'), controller.indexOf('const readPendingIncomes = useCallback'));
  assert.ok(rangeReader.length > 0, 'the range reader must be extractable');
  const guard = rangeReader.indexOf('if (!isReportRange(requestedFrom, requestedTo))');
  const request = rangeReader.indexOf('reports/monthly?from=');
  assert.notEqual(guard, -1, 'the range must be validated');
  assert.notEqual(request, -1, 'the range request must exist');
  assert.ok(guard < request, 'validation must precede the request');
  assert.match(rangeReader, /setReportRange\(invalid\);\s*return invalid;/, 'the invalid branch must return, not fall through to the request');
  assert.match(rangeReader, /errorKind: 'invalid-range'/);
  assert.doesNotMatch(controller, /Math\.min\([^)]*REPORT_RANGE_MAX_MONTHS|clamp/i);
});

test('the range state is separate from the single-month state, keeps its own request guard, and each mode invalidates the other', () => {
  assert.match(controller, /const \[report, setReport\] = useState<MonthlyReportState \| null>\(null\);/);
  assert.match(controller, /const \[reportRange, setReportRange\] = useState<MultiMonthReportState \| null>\(null\);/);
  assert.match(controller, /const reportRangeRequestId = useRef\(0\);/);
  const rangeReader = controller.slice(controller.indexOf('const readReportRange = useCallback'), controller.indexOf('const readPendingIncomes = useCallback'));
  const monthReader = controller.slice(controller.indexOf('const readMonthlyReport = useCallback'), controller.indexOf('const readReportRange = useCallback'));
  assert.match(rangeReader, /const requestId = \+\+reportRangeRequestId\.current;/);
  assert.equal((rangeReader.match(/if \(requestId !== reportRangeRequestId\.current\) return null;/g) ?? []).length, 2, 'stale range success and stale range failure are both ignored inside the range reader');
  assert.match(rangeReader, /reportRequestId\.current \+= 1;/, 'a range read must invalidate an in-flight single-month read');
  assert.match(monthReader, /if \(requestId !== reportRequestId\.current\) return null;/);
  assert.match(monthReader, /reportRangeRequestId\.current \+= 1;/, 'a single-month read must invalidate an in-flight range read');
  assert.match(controller, /reportRangeRequestId\.current \+= 1;/, 'sign-out must invalidate the range state');
  assert.match(controller, /setReportRange\(null\);/);
});

test('the single-month reader and its request remain unchanged', () => {
  assert.match(controller, /const readMonthlyReport = useCallback\(async \(month: string\)/);
  assert.equal((controller.match(/reports\/monthly\?month=/g) ?? []).length, 1);
  assert.equal((controller.match(/reports\/monthly\?/g) ?? []).length, 2, 'exactly one single-month and one range request');
  assert.equal(rangeReport.policy.monthBasis, 'report-policy/v1');
  assert.equal(Object.hasOwn(rangeReport.total, 'pendingMinor'), false);
});
