import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { BudgetApp, ApiError } from '../src/app.ts';
import { createServer, parseMonthlyReportQuery } from '../src/server.ts';
import { projectMonthlyReport } from '../src/reports/monthly-report.ts';
import { FinancialStore, type FinancialState } from '../src/persistence/financial-store.ts';
import { PrismaBudgetStore } from '../src/persistence/budget-store.ts';

const password = 'correct horse';
const options = (idempotencyKey: string, expectedVersion?: number) => ({ idempotencyKey, expectedVersion });
const prepare = () => {
  const app = new BudgetApp();
  const email = `report-modes-${Math.random()}@example.test`;
  app.register(email, password);
  const token = app.signIn(email, password).data.sessionToken;
  const budget = app.createBudget(token).data;
  const complete = app.saveSetup(token, budget.id, { openingBalanceMinor: 100000, categories: ['Food', 'Bills'] }).data;
  return { app, token, budget: complete };
};
const http = async (app: BudgetApp, token: string, path: string) => {
  const server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const url = `http://127.0.0.1:${(address as { port: number }).port}${path}`;
  try {
    return await fetch(url, { headers: { cookie: `sid=${token}` } });
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
};
const monthlyReport = (app: BudgetApp, token: string, budgetId: string, query = 'month=2026-02') => http(app, token, `/api/v1/budgets/${budgetId}/reports/monthly?${query}`);

// Key sets locked by the previous change and by report-policy/v2. Both must stay exact.
const SINGLE_MONTH_KEYS = ['categories', 'expenseMinor', 'incomeMinor', 'incomeRelease', 'month', 'policy', 'provisional', 'transfers', 'version'];
const RANGE_KEYS = ['disclosure', 'months', 'policy', 'total', 'version'];
const FLOW_TOTAL_KEYS = ['categories', 'expenseMinor', 'incomeMinor', 'provisional', 'transfers', 'treatment'];
// A key exposes the release measure when a camelCase word is "pending" or when it names the income release breakdown.
const exposesRelease = (key: string) => {
  const words = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return words.includes('pending') || (words.includes('income') && words.includes('release'));
};
const releaseKeyPaths = (value: unknown, path: string): string[] => Array.isArray(value)
  ? value.flatMap((item, index) => releaseKeyPaths(item, `${path}[${index}]`))
  : value && typeof value === 'object'
    ? Object.entries(value).flatMap(([key, nested]) => [...(exposesRelease(key) ? [`${path}.${key}`] : []), ...releaseKeyPaths(nested, `${path}.${key}`)])
    : [];

// One revision (42) holding activity in 2025-12, a fully empty 2026-01, and 2026-02 activity plus one transfer.
const state: FinancialState = {
  id: 'budget-api-modes', setupStep: 'COMPLETE', timezone: 'UTC', version: 42,
  account: { id: 'account-1', name: 'Cash', kind: 'CHECKING', archived: false, openingBalanceMinor: 0 },
  accounts: [
    { id: 'account-1', name: 'Cash', kind: 'CHECKING', archived: false, openingBalanceMinor: 0 },
    { id: 'account-2', name: 'Savings', kind: 'CHECKING', archived: false, openingBalanceMinor: 0 },
  ],
  categories: [{ id: 'food', name: 'Food', archived: false }, { id: 'bills', name: 'Bills', archived: false }],
  events: [
    { id: 'dec-income', transactionId: 'dec-income', kind: 'INCOME', amountMinor: 100000, month: '2025-12', businessDate: '2025-12-04', accountId: 'account-1', status: 'POSTED', reconciled: false },
    { id: 'dec-spending', transactionId: 'dec-spending', kind: 'SPENDING', amountMinor: 30000, month: '2025-12', businessDate: '2025-12-09', accountId: 'account-1', categoryId: 'food', status: 'POSTED', reconciled: false },
    { id: 'feb-income', transactionId: 'feb-income', kind: 'INCOME', amountMinor: 50000, month: '2026-02', businessDate: '2026-02-02', accountId: 'account-1', status: 'POSTED', reconciled: false },
    { id: 'feb-spending', transactionId: 'feb-spending', kind: 'SPENDING', amountMinor: 2000, month: '2026-02', businessDate: '2026-02-06', accountId: 'account-1', categoryId: 'bills', status: 'POSTED', reconciled: false },
    { id: 'feb-transfer-out', kind: 'TRANSFER_OUT', amountMinor: 25000, month: '2026-02', accountId: 'account-1', transferId: 'transfer-1' },
    { id: 'feb-transfer-in', kind: 'TRANSFER_IN', amountMinor: 25000, month: '2026-02', accountId: 'account-2', transferId: 'transfer-1' },
  ],
  transfers: [{ id: 'transfer-1', sourceAccountId: 'account-1', destinationAccountId: 'account-2', amountMinor: 25000, businessDate: '2026-02-14', month: '2026-02', createdAt: '2026-02-14T00:00:00.000Z' }],
};

// Every query that is not exactly one complete mode. Rejected by the parser, so no state is ever read.
const INVALID_MODES = [
  '', 'month=', 'month=2026-13', 'month=2026-2',
  'month=2026-02&from=2025-12', 'month=2026-02&to=2026-02', 'month=2026-02&from=2025-12&to=2026-02',
  'from=2025-12', 'to=2026-02', 'from=2025-13&to=2026-02', 'from=2025-12&to=2026-3',
  'from=2026-03&to=2025-12', 'from=2024-12&to=2026-12',
  'from=2025-12&to=2026-01&to=2026-02', 'month=2026-02&month=2026-03',
  'range=2025-12..2026-02', 'month=2026-02&unknown=1',
  'from=2025-12&to=2026-02&compare=2025-10', 'from=2025-12&to=2026-02&trend=1',
  'from=2025-12&to=2026-02&percentChange=1', 'from=2025-12&to=2026-02&previousFrom=2025-10',
  'from=2025-12&to=2026-02&delta=1', 'from=2025-12&to=2026-02&export=csv',
];

test('the report query parser discriminates the two modes and enforces exclusivity', () => {
  const url = (query: string) => new URL(`http://localhost/api/v1/budgets/budget/reports/monthly?${query}`);

  assert.deepEqual(parseMonthlyReportQuery(url('month=2026-02')), { mode: 'month', month: '2026-02' });
  assert.deepEqual(parseMonthlyReportQuery(url('from=2025-12&to=2026-02')), { mode: 'range', from: '2025-12', to: '2026-02' });
  assert.deepEqual(parseMonthlyReportQuery(url('from=2026-02&to=2026-02')), { mode: 'range', from: '2026-02', to: '2026-02' });
  for (const query of INVALID_MODES) {
    assert.throws(() => parseMonthlyReportQuery(url(query)), (error: unknown) => (error as { code?: string })?.code === 'VALIDATION_ERROR', `query ${query} must be rejected as VALIDATION_ERROR`);
  }
});

test('the extended route rejects every non-mode parameter shape and accepts exactly the two modes', async () => {
  const { app, token, budget } = prepare();

  for (const query of INVALID_MODES) {
    const rejected = await monthlyReport(app, token, budget.id, query);
    assert.equal(rejected.status, 400, `query ${query} must be rejected`);
    assert.equal((await rejected.json() as any).error.code, 'VALIDATION_ERROR', `query ${query} must report VALIDATION_ERROR`);
  }

  assert.equal((await monthlyReport(app, token, budget.id, 'from=2025-12&to=2026-02')).status, 200);
  assert.equal((await monthlyReport(app, token, budget.id, 'month=2026-02')).status, 200);
});

test('range mode stays owner authorized and never discloses a foreign budget', async () => {
  const { app, token, budget } = prepare();
  const { app: otherApp, token: otherToken } = prepare();

  assert.equal((await monthlyReport(app, token, budget.id, 'from=2025-12&to=2026-02')).status, 200);

  const anonymous = await monthlyReport(app, '', budget.id, 'from=2025-12&to=2026-02');
  assert.equal(anonymous.status, 401);
  assert.equal((await anonymous.json() as any).error.code, 'UNAUTHENTICATED');

  const foreign = await monthlyReport(otherApp, otherToken, budget.id, 'from=2025-12&to=2026-02');
  assert.equal(foreign.status, 404);
  const body = await foreign.json() as any;
  assert.equal(body.error.code, 'NOT_FOUND');
  assert.equal(body.data, undefined);
  assert.deepEqual(Object.keys(body.error).sort(), ['code', 'message', 'requestId']);
  assert.equal(body.error.message, 'Resource not found', 'the foreign response must not disclose values');
  assert.doesNotMatch(JSON.stringify(body), /report-policy|months|total/, 'a foreign response never reaches range data');
});

test('range mode locks its key set, disclosure and release-free total, and projects every month from one revision', async () => {
  const { app, token, budget } = prepare();
  (app as any).financialStore = { load: async () => state };

  const { data } = await (await monthlyReport(app, token, budget.id, 'from=2025-12&to=2026-02')).json() as any;

  assert.deepEqual(Object.keys(data).sort(), RANGE_KEYS);
  assert.deepEqual(data.policy, { id: 'report-policy/v2', monthBasis: 'report-policy/v1', from: '2025-12', to: '2026-02', monthCount: 3 });
  assert.deepEqual(data.disclosure, { recomputedFromEffectiveHistory: true, categoryLabelsAreCurrent: true, durable: false });
  assert.deepEqual(Object.keys(data.total).sort(), FLOW_TOTAL_KEYS);
  assert.equal('pendingMinor' in data.total, false);
  assert.deepEqual(releaseKeyPaths(data.total, 'total'), [], 'no nesting level of the period total may expose the release measure');
  assert.notDeepEqual(releaseKeyPaths(data.months, 'months'), [], 'each month entry still reports its own release breakdown');
  assert.equal(data.total.incomeMinor, 150000);
  assert.equal(data.total.expenseMinor, 32000);
  assert.equal(data.total.transfers.totalMinor, 25000);

  assert.deepEqual(data.months.map((month: any) => month.month), ['2025-12', '2026-01', '2026-02']);
  assert.equal(data.version, state.version);
  for (const month of data.months) {
    assert.deepEqual(month, projectMonthlyReport(state, month.month), 'each entry is the single-month projection for that month and revision');
    assert.equal(month.version, state.version, 'every month comes from the same revision as the series');
  }
});

test('range helper violations are mapped to VALIDATION_ERROR at the app boundary without any load', async () => {
  const { app, token, budget } = prepare();
  let loads = 0;
  (app as any).financialStore = { load: async () => { loads += 1; return state; } };

  for (const [from, to, reason] of [['2026-1', '2026-02', /Malformed month/], ['2025-13', '2026-02', /Malformed month/], ['2026-03', '2026-01', /later than to/], ['2024-12', '2026-12', /24-month maximum/]] as const) {
    await assert.rejects(() => app.getMultiMonthReport(token, budget.id, from, to), (error: unknown) => error instanceof ApiError && error.code === 'VALIDATION_ERROR' && reason.test(error.message), `${from}..${to} must map to VALIDATION_ERROR`);
  }
  assert.equal(loads, 0, 'a rejected range is never loaded');
});

test('unexpected range load failures remain INTERNAL_ERROR instead of validation errors', async () => {
  const { app, token, budget } = prepare();
  (app as any).financialStore = { load: async () => { throw new Error('unexpected report load failure'); } };

  const response = await monthlyReport(app, token, budget.id, 'from=2025-12&to=2026-02');
  assert.equal(response.status, 500);
  assert.notEqual(response.status, 400, 'unexpected failures must not become validation responses');
  const body = await response.json() as any;
  assert.equal(body.error.code, 'INTERNAL_ERROR');
  assert.notEqual(body.error.code, 'VALIDATION_ERROR', 'unexpected failures must not become validation errors');
});

test('a range request cannot mix revisions even when the store would return a new revision per load', async () => {
  const { app, token, budget } = prepare();
  let loads = 0;
  (app as any).financialStore = { load: async () => { loads += 1; return { ...state, version: state.version + loads }; } };

  const { data } = await (await monthlyReport(app, token, budget.id, 'from=2025-12&to=2026-02')).json() as any;
  assert.equal(loads, 1, 'one load serves the whole series');
  assert.equal(data.version, state.version + 1, 'the series reports the revision it actually loaded');
  assert.equal(new Set(data.months.map((month: any) => month.version)).size, 1, 'no month may come from a different revision');
  for (const month of data.months) assert.equal(month.version, data.version);
  assert.equal(data.months[0].incomeMinor, 100000, 'every month is projected from the one loaded state, never from a missing one');
});

test('one request performs exactly one state load and rejects an over-long range before reading', async () => {
  const { app, token, budget } = prepare();
  let loads = 0;
  (app as any).financialStore = { load: async () => { loads += 1; return state; } };

  const widest = await monthlyReport(app, token, budget.id, 'from=2024-12&to=2026-11');
  assert.equal(widest.status, 200);
  assert.equal((await widest.json() as any).data.months.length, 24);
  assert.equal(loads, 1, 'a range request must load the budget state exactly once');

  assert.equal((await monthlyReport(app, token, budget.id, 'from=2024-11&to=2026-11')).status, 400);
  assert.equal(loads, 1, 'an over-long range must be rejected before any state is read');

  assert.equal((await monthlyReport(app, token, budget.id, 'month=2026-02')).status, 200);
  assert.equal(loads, 2, 'single-month mode still loads exactly once per request');
});

test('single-month mode stays byte-identical to the shape locked by the previous change', async () => {
  const { app, token, budget } = prepare();
  (app as any).financialStore = { load: async () => state };

  const { data } = await (await monthlyReport(app, token, budget.id, 'month=2026-02')).json() as any;

  assert.deepEqual(Object.keys(data).sort(), SINGLE_MONTH_KEYS);
  assert.deepEqual(data, projectMonthlyReport(state, '2026-02'));
  assert.deepEqual(data, {
    month: '2026-02',
    policy: { id: 'report-policy/v1', month: '2026-02' },
    incomeMinor: 50000,
    expenseMinor: 2000,
    categories: [{ id: 'food', name: 'Food', archived: false, spendingMinor: 0 }, { id: 'bills', name: 'Bills', archived: false, spendingMinor: 2000 }],
    transfers: { treatment: 'OUTSIDE_INCOME_EXPENSE_TOTALS', totalMinor: 25000, items: [{ transferId: 'transfer-1', sourceAccount: { id: 'account-1', name: 'Cash', kind: 'CHECKING', archived: false }, destinationAccount: { id: 'account-2', name: 'Savings', kind: 'CHECKING', archived: false }, date: '2026-02-14', amountMinor: 25000 }] },
    provisional: { treatment: 'INCLUDED_PROVISIONAL', count: 0, incomeMinor: 0, expenseMinor: 0 },
    incomeRelease: { treatment: 'PENDING_RELEASE', receivedMinor: 50000, releasedMinor: 0, pendingMinor: 50000 },
    version: 42,
  });
  assert.equal('disclosure' in data, false);
  assert.equal('total' in data, false);
  assert.equal('months' in data, false);
});

const prisma = process.env.DATABASE_URL ? new (await import('@prisma/client')).PrismaClient() : null;
const cleanup = async (email: string) => {
  const user = await prisma!.user.findUnique({ where: { email }, include: { budget: true } });
  if (user?.budget) {
    const budgetId = user.budget.id;
    await prisma!.transactionDeletionAudit.deleteMany({ where: { budgetId } });
    await prisma!.commandReceipt.deleteMany({ where: { budgetId } });
    await prisma!.financialEvent.deleteMany({ where: { budgetId } });
    await prisma!.transfer.deleteMany({ where: { budgetId } });
    const accounts = await prisma!.account.findMany({ where: { budgetId }, select: { id: true } });
    await prisma!.openingBalance.deleteMany({ where: { accountId: { in: accounts.map(item => item.id) } } });
    await prisma!.budgetMonth.deleteMany({ where: { budgetId } });
    await prisma!.category.deleteMany({ where: { budgetId } });
    await prisma!.account.deleteMany({ where: { budgetId } });
    await prisma!.budget.delete({ where: { id: budgetId } });
  }
  if (user) { await prisma!.session.deleteMany({ where: { userId: user.id } }); await prisma!.user.delete({ where: { id: user.id } }); }
};

test('both report modes are served from real persistence across two event months with one load each', { skip: !process.env.DATABASE_URL }, async () => {
  const email = `report-modes-pg-${randomUUID()}@example.test`;
  let budgetId = '';
  try {
    const store = new FinancialStore(prisma!);
    const load = store.load.bind(store);
    let loads = 0;
    (store as any).load = (...args: [string, string]) => { loads += 1; return load(...args); };
    const app = new BudgetApp(Date.now, new PrismaBudgetStore(prisma!), store);

    await app.register(email, password);
    const token = (await app.signIn(email, password)).data.sessionToken;
    budgetId = (await app.createBudget(token)).data.id;
    const setup = (await app.saveSetup(token, budgetId, { openingBalanceMinor: 100000, categories: ['Food', 'Bills'] })).data;
    await app.recordIncome(token, budgetId, { amountMinor: 100000, date: '2025-12-05' }, undefined, options('pg-report-income'));
    await app.recordSpending(token, budgetId, { amountMinor: 30000, categoryId: setup.categories[0].id, date: '2026-02-10' }, undefined, options('pg-report-spending'));

    loads = 0;
    const single = await monthlyReport(app, token, budgetId, 'month=2026-02');
    assert.equal(single.status, 200);
    const singleData = (await single.json() as any).data;
    assert.deepEqual(Object.keys(singleData).sort(), SINGLE_MONTH_KEYS);
    assert.equal(singleData.incomeMinor, 0);
    assert.equal(singleData.expenseMinor, 30000);

    const range = await monthlyReport(app, token, budgetId, 'from=2025-12&to=2026-02');
    assert.equal(range.status, 200);
    const rangeData = (await range.json() as any).data;
    assert.deepEqual(rangeData.months.map((month: any) => month.month), ['2025-12', '2026-01', '2026-02']);
    assert.deepEqual(Object.keys(rangeData).sort(), RANGE_KEYS);
    assert.equal(rangeData.months[0].incomeMinor, 100000);
    assert.equal(rangeData.months[1].incomeMinor, 0);
    assert.equal(rangeData.months[1].expenseMinor, 0, 'the empty gap month is explicit zeros, not an omission');
    assert.equal(rangeData.total.incomeMinor, 100000);
    assert.equal(rangeData.total.expenseMinor, 30000);
    assert.deepEqual(rangeData.total.categories.map((category: any) => category.spendingMinor), [30000, 0]);
    assert.equal('pendingMinor' in rangeData.total, false);
    assert.notEqual(rangeData.version, 0, 'the persisted revision is read, not assumed');
    for (const month of rangeData.months) assert.equal(month.version, rangeData.version, 'one revision serves the whole series');
    assert.equal(loads, 2, 'each HTTP report request loads the persisted state exactly once');
  } finally {
    if (budgetId) await cleanup(email);
  }
});

after(async () => { if (prisma) await prisma.$disconnect(); });
