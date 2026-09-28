import test from 'node:test';
import assert from 'node:assert/strict';
import { BudgetApp } from '../src/app.ts';
import { createServer } from '../src/server.ts';

const password = 'correct horse';
const options = (idempotencyKey: string, expectedVersion?: number) => ({ idempotencyKey, expectedVersion });
const prepare = () => {
  const app = new BudgetApp();
  const email = `reports-${Math.random()}@example.test`;
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
const categorySpending = (data: any) => Object.fromEntries(data.categories.map((category: any) => [category.name, category.spendingMinor]));

test('monthly report stays owner authorized and always reports the approved policy and month', async () => {
  const { app, token, budget } = prepare();
  const { app: otherApp, token: otherToken } = prepare();

  const response = await monthlyReport(app, token, budget.id);
  assert.equal(response.status, 200);
  const { data } = await response.json() as any;
  assert.equal(data.month, '2026-02');
  assert.deepEqual(data.policy, { id: 'report-policy/v1', month: '2026-02' });

  const anonymous = await monthlyReport(app, '', budget.id);
  assert.equal(anonymous.status, 401);
  assert.equal((await anonymous.json() as any).error.code, 'UNAUTHENTICATED');

  const foreign = await monthlyReport(otherApp, otherToken, budget.id);
  assert.equal(foreign.status, 404);
  assert.equal((await foreign.json() as any).error.code, 'NOT_FOUND');

  for (const query of ['', 'month=', 'month=2026-13', 'month=2026-2', 'month=2026-02&from=2026-01-01', 'month=2026-02&range=2025-12..2026-03', 'month=2026-02&month=2026-03']) {
    const invalid = await monthlyReport(app, token, budget.id, query);
    assert.equal(invalid.status, 400, `query ${query} must be rejected`);
    assert.equal((await invalid.json() as any).error.code, 'VALIDATION_ERROR', `query ${query} must report VALIDATION_ERROR`);
  }
});

test('monthly income, expense and category spending use only the requested month and ignore releases, assignments and other months', async () => {
  const { app, token, budget } = prepare();
  const [food, bills] = budget.categories;
  const released = await app.recordIncome(token, budget.id, { amountMinor: 125000, date: '2026-02-05' }, undefined, options('report-income-a'));
  await app.recordIncome(token, budget.id, { amountMinor: 25000, date: '2026-02-21' }, undefined, options('report-income-b'));
  await app.recordIncome(token, budget.id, { amountMinor: 90000, date: '2026-03-05' }, undefined, options('report-income-march'));
  await app.recordSpending(token, budget.id, { amountMinor: 30000, categoryId: food.id, date: '2026-02-10' }, undefined, options('report-spending-february'));
  await app.recordSpending(token, budget.id, { amountMinor: 5000, categoryId: bills.id, date: '2026-03-02' }, undefined, options('report-spending-march'));
  await app.assign(token, budget.id, { categoryId: food.id, amountMinor: 20000, month: '2026-02' }, undefined, options('report-assignment'));
  await app.releaseIncome(token, budget.id, released.data.id, undefined, options('report-release'));

  const { data } = await (await monthlyReport(app, token, budget.id)).json() as any;
  assert.equal(data.incomeMinor, 150000);
  assert.equal(data.expenseMinor, 30000);
  assert.deepEqual(categorySpending(data), { Food: 30000, Bills: 0 });
  assert.deepEqual(data.incomeRelease, { treatment: 'PENDING_RELEASE', receivedMinor: 150000, releasedMinor: 125000, pendingMinor: 25000 });
  assert.deepEqual(Object.keys(data).sort(), ['categories', 'expenseMinor', 'incomeMinor', 'incomeRelease', 'month', 'policy', 'provisional', 'transfers', 'version']);

  const march = await (await monthlyReport(app, token, budget.id, 'month=2026-03')).json() as any;
  assert.equal(march.data.incomeMinor, 90000);
  assert.equal(march.data.expenseMinor, 5000);
  assert.deepEqual(categorySpending(march.data), { Food: 0, Bills: 5000 });
  assert.deepEqual(march.data.incomeRelease, { treatment: 'PENDING_RELEASE', receivedMinor: 90000, releasedMinor: 0, pendingMinor: 90000 });
});

test('transfers contribute zero to income, expense and category spending while staying visible outside the totals', async () => {
  const { app, token, budget } = prepare();
  const [food] = budget.categories;
  const savings = (await app.createAccount(token, budget.id, { name: 'Savings', kind: 'checking' }, undefined, options('report-account', 0))).data.account;
  await app.recordIncome(token, budget.id, { amountMinor: 100000, date: '2026-02-01' }, undefined, options('report-transfer-income'));
  await app.recordSpending(token, budget.id, { amountMinor: 4000, categoryId: food.id, date: '2026-02-02' }, undefined, options('report-transfer-spending'));
  await app.recordTransfer(token, budget.id, { sourceAccountId: budget.account!.id, destinationAccountId: savings.id, amountMinor: 60000, date: '2026-02-14' }, undefined, options('report-transfer-february'));
  await app.recordTransfer(token, budget.id, { sourceAccountId: budget.account!.id, destinationAccountId: savings.id, amountMinor: 7000, date: '2026-03-14' }, undefined, options('report-transfer-march'));

  const before = await app.getFinancialSummary(token, budget.id, '2026-02');
  const { data } = await (await monthlyReport(app, token, budget.id)).json() as any;
  const after = await app.getFinancialSummary(token, budget.id, '2026-02');

  assert.equal(data.incomeMinor, 100000);
  assert.equal(data.expenseMinor, 4000);
  assert.deepEqual(categorySpending(data), { Food: 4000, Bills: 0 });
  assert.deepEqual(after.data, before.data, 'reading the report must not change the canonical monthly summary');

  assert.equal(data.transfers.treatment, 'OUTSIDE_INCOME_EXPENSE_TOTALS');
  assert.equal(data.transfers.totalMinor, 60000);
  assert.equal(data.transfers.items.length, 1);
  const [item] = data.transfers.items;
  assert.equal(item.amountMinor, 60000);
  assert.equal(item.date, '2026-02-14');
  assert.equal(item.sourceAccount.id, budget.account!.id);
  assert.equal(item.sourceAccount.name, budget.account!.name);
  assert.equal(item.destinationAccount.id, savings.id);
  assert.equal(item.destinationAccount.name, 'Savings');
  assert.ok(item.transferId);

  const march = await (await monthlyReport(app, token, budget.id, 'month=2026-03')).json() as any;
  assert.equal(march.data.transfers.items.length, 1);
  assert.equal(march.data.transfers.totalMinor, 7000);
  assert.equal(march.data.incomeMinor, 0);
  assert.equal(march.data.expenseMinor, 0);
});

test('working transactions stay inside the month and are always marked provisional', async () => {
  const { app, token, budget } = prepare();
  const [food, bills] = budget.categories;
  const accountId = budget.account!.id;
  const state: any = {
    id: budget.id, version: 7, setupStep: 'COMPLETE', timezone: 'UTC',
    account: budget.account, accounts: budget.accounts, categories: budget.categories, transfers: [],
    events: [
      { id: 'working-income', transactionId: 'working-income', kind: 'INCOME', amountMinor: 10000, month: '2026-02', businessDate: '2026-02-03', accountId, status: 'WORKING', reconciled: false, createdAt: '2026-02-03T00:00:00.000Z' },
      { id: 'posted-income', transactionId: 'posted-income', kind: 'INCOME', amountMinor: 5000, month: '2026-02', businessDate: '2026-02-04', accountId, status: 'POSTED', reconciled: false, createdAt: '2026-02-04T00:00:00.000Z' },
      { id: 'working-spending', transactionId: 'working-spending', kind: 'SPENDING', amountMinor: 2500, categoryId: food.id, month: '2026-02', businessDate: '2026-02-05', accountId, status: 'WORKING', reconciled: false, createdAt: '2026-02-05T00:00:00.000Z' },
      { id: 'posted-spending', transactionId: 'posted-spending', kind: 'SPENDING', amountMinor: 1500, categoryId: bills.id, month: '2026-02', businessDate: '2026-02-06', accountId, status: 'POSTED', reconciled: false, createdAt: '2026-02-06T00:00:00.000Z' },
      { id: 'march-working', transactionId: 'march-working', kind: 'INCOME', amountMinor: 999, month: '2026-03', businessDate: '2026-03-03', accountId, status: 'WORKING', reconciled: false, createdAt: '2026-03-03T00:00:00.000Z' },
    ],
  };
  (app as any).financialStore = { load: async () => state };

  const { data } = await (await monthlyReport(app, token, budget.id)).json() as any;
  assert.equal(data.version, 7);
  assert.equal(data.incomeMinor, 15000);
  assert.equal(data.expenseMinor, 4000);
  assert.deepEqual(categorySpending(data), { Food: 2500, Bills: 1500 });
  assert.deepEqual(data.provisional, { treatment: 'INCLUDED_PROVISIONAL', count: 2, incomeMinor: 10000, expenseMinor: 2500 });
  assert.deepEqual(data.incomeRelease, { treatment: 'PENDING_RELEASE', receivedMinor: 15000, releasedMinor: 0, pendingMinor: 15000 });
  assert.equal(data.transfers.totalMinor, 0);
});

test('archived categories keep their historical spending label instead of being omitted', async () => {
  const { app, token, budget } = prepare();
  const [food, bills] = budget.categories;
  await app.recordIncome(token, budget.id, { amountMinor: 20000, date: '2026-02-01' }, undefined, options('report-archived-income'));
  await app.recordSpending(token, budget.id, { amountMinor: 1500, categoryId: food.id, date: '2026-02-03' }, undefined, options('report-archived-spending'));
  app.archiveCategory(token, budget.id, food.id);

  const { data } = await (await monthlyReport(app, token, budget.id)).json() as any;
  assert.equal(data.categories.length, 2);
  assert.deepEqual(data.categories.find((category: any) => category.id === food.id), { id: food.id, name: 'Food', archived: true, spendingMinor: 1500 });
  assert.deepEqual(data.categories.find((category: any) => category.id === bills.id), { id: bills.id, name: 'Bills', archived: false, spendingMinor: 0 });
  assert.equal(data.expenseMinor, 1500);
});

test('a transfer moves account balances exactly once and never lands in the income or expense measures', async () => {
  const { app, token, budget } = prepare();
  const [food] = budget.categories;
  const savings = (await app.createAccount(token, budget.id, { name: 'Savings', kind: 'checking' }, undefined, options('balance-account', 0))).data.account;
  await app.recordIncome(token, budget.id, { amountMinor: 100000, date: '2026-02-01' }, undefined, options('balance-income'));
  await app.recordSpending(token, budget.id, { amountMinor: 4000, categoryId: food.id, date: '2026-02-02' }, undefined, options('balance-spending'));
  await app.recordTransfer(token, budget.id, { sourceAccountId: budget.account!.id, destinationAccountId: savings.id, amountMinor: 60000, date: '2026-02-14' }, undefined, options('balance-transfer'));

  const summary = await app.getFinancialSummary(token, budget.id, '2026-02');
  const source = summary.data.accounts.find(account => account.id === budget.account!.id)!;
  const destination = summary.data.accounts.find(account => account.id === savings.id)!;
  assert.equal(source.balanceMinor, 100000 + 100000 - 4000 - 60000);
  assert.equal(destination.balanceMinor, 60000);
  assert.equal(source.balanceMinor + destination.balanceMinor, 100000 + 100000 - 4000, 'the paired transfer legs net out to zero');

  const { data } = await (await monthlyReport(app, token, budget.id)).json() as any;
  assert.equal(data.incomeMinor, 100000);
  assert.equal(data.expenseMinor, 4000);
  assert.equal(data.transfers.totalMinor, 60000);
});

test('the month reads effective history only, so replacements and deletions are never double counted', async () => {
  const { app, token, budget } = prepare();
  const [food] = budget.categories;
  const accountId = budget.account!.id;
  const state: any = {
    id: budget.id, version: 12, setupStep: 'COMPLETE', timezone: 'UTC',
    account: budget.account, accounts: budget.accounts, categories: budget.categories, transfers: [], events: [],
    rawEvents: [
      { id: 'a', transactionId: 'a', kind: 'INCOME', amountMinor: 10000, month: '2026-02', businessDate: '2026-02-02', accountId, status: 'POSTED', reconciled: false },
      { id: 'a2', transactionId: 'a', kind: 'INCOME', amountMinor: 20000, month: '2026-02', businessDate: '2026-02-02', accountId, status: 'POSTED', reconciled: false, supersedesEventId: 'a' },
      { id: 'b', transactionId: 'b', kind: 'SPENDING', amountMinor: 3000, categoryId: food.id, month: '2026-02', businessDate: '2026-02-03', accountId, status: 'POSTED', reconciled: false },
      { id: 'b2', transactionId: 'b', kind: 'SPENDING', amountMinor: 3000, categoryId: food.id, month: '2026-02', businessDate: '2026-02-03', accountId, status: 'POSTED', reconciled: false, supersedesEventId: 'b' },
      { id: 'c', transactionId: 'b', kind: 'TRANSACTION_DELETE', amountMinor: 0, month: '2026-02', supersedesEventId: 'b2' },
    ],
  };
  (app as any).financialStore = { load: async () => state };

  const { data } = await (await monthlyReport(app, token, budget.id)).json() as any;
  assert.equal(data.incomeMinor, 20000);
  assert.equal(data.expenseMinor, 0);
  assert.deepEqual(categorySpending(data), { Food: 0, Bills: 0 });
  assert.equal(data.version, 12);
});

test('a month without activity is reported as explicit zeros instead of leaking another month', async () => {
  const { app, token, budget } = prepare();
  await app.recordIncome(token, budget.id, { amountMinor: 42000, date: '2026-02-11' }, undefined, options('empty-income'));

  const { data } = await (await monthlyReport(app, token, budget.id, 'month=2025-11')).json() as any;
  assert.deepEqual(data.policy, { id: 'report-policy/v1', month: '2025-11' });
  assert.equal(data.incomeMinor, 0);
  assert.equal(data.expenseMinor, 0);
  assert.deepEqual(categorySpending(data), { Food: 0, Bills: 0 });
  assert.deepEqual(data.transfers, { treatment: 'OUTSIDE_INCOME_EXPENSE_TOTALS', totalMinor: 0, items: [] });
  assert.deepEqual(data.provisional, { treatment: 'INCLUDED_PROVISIONAL', count: 0, incomeMinor: 0, expenseMinor: 0 });
  assert.deepEqual(data.incomeRelease, { treatment: 'PENDING_RELEASE', receivedMinor: 0, releasedMinor: 0, pendingMinor: 0 });
});

test('an unresolved report policy returns an explicit unavailable state with no totals at all', async () => {
  const { projectMonthlyReport } = await import('../src/reports/monthly-report.ts');
  const projection: any = projectMonthlyReport({ categories: [], events: [] } as any, '2026-02', null);
  assert.deepEqual(projection.policy, { id: null, month: '2026-02' });
  assert.deepEqual(projection.unavailable, { code: 'REPORT_POLICY_UNRESOLVED', treatment: 'NO_TOTALS_RETURNED' });
  assert.equal(projection.month, '2026-02');
  assert.deepEqual(Object.keys(projection).sort(), ['month', 'policy', 'unavailable']);
  assert.equal(projection.incomeMinor, undefined);
  assert.equal(projection.expenseMinor, undefined);
  assert.equal(projection.categories, undefined);
  assert.equal(projection.transfers, undefined);
  assert.equal(projection.provisional, undefined);
  assert.equal(projection.incomeRelease, undefined);
});
