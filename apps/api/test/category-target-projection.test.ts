import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { BudgetApp } from '../src/app.ts';
import { InMemoryBudgetStore, InMemoryFinancialStore } from '../src/persistence/in-memory-budget-store.ts';
import { ReportService } from '../src/reports/report-service.ts';
import { createServer } from '../src/server.ts';
import type { FinancialState } from '../src/persistence/financial-store.ts';

const derive = async (target: any, values: { assignedMinor: number; availableMinor: number }, requestedMonth: string) => {
  const { projectTargetState } = await import('../src/planning/targets.ts');
  return projectTargetState(target, values, requestedMonth);
};

const setup = () => {
  const budgetStore = new InMemoryBudgetStore();
  const financialStore = new InMemoryFinancialStore(budgetStore);
  const app = new BudgetApp(Date.now, budgetStore, financialStore);
  const email = `category-target-projection-${randomUUID()}@example.test`;
  app.register(email, 'correct horse');
  const token = app.signIn(email, 'correct horse').data.sessionToken;
  const budget = app.createBudget(token).data;
  const complete = app.saveSetup(token, budget.id, { openingBalanceMinor: 5000, categories: ['Food', 'Bills'] }).data;
  return { app, token, budget: complete, financialStore, ownerId: app.authenticate(token).id };
};

const options = (idempotencyKey: string, expectedVersion: number) => ({ idempotencyKey, expectedVersion });

test('monthly set-aside progress uses this month assigned amount, not positive carry', async () => {
  const target = { kind: 'MONTHLY_SET_ASIDE', amountMinor: 100 };
  assert.deepEqual(await derive(target, { assignedMinor: 75, availableMinor: 175 }, '2026-02'), {
    kind: 'MONTHLY_SET_ASIDE', amountMinor: 100, progressMinor: 75, remainingMinor: 25, status: 'UNDERFUNDED',
  });
  const carried = await derive(target, { assignedMinor: 0, availableMinor: 500 }, '2026-02');
  assert.deepEqual(carried, {
    kind: 'MONTHLY_SET_ASIDE', amountMinor: 100, progressMinor: 0, remainingMinor: 100, status: 'UNDERFUNDED',
  });
  const overfunded = await derive(target, { assignedMinor: 150, availableMinor: 150 }, '2026-02');
  assert.equal(overfunded.progressMinor, 150);
  assert.equal(overfunded.remainingMinor, 0, 'the remaining gap cannot become negative');
  assert.equal(overfunded.status, 'MET');
});

test('both target kinds are met when progress exactly reaches the amount', async () => {
  assert.deepEqual(await derive({ kind: 'MONTHLY_SET_ASIDE', amountMinor: 100 }, { assignedMinor: 100, availableMinor: 140 }, '2026-03'), {
    kind: 'MONTHLY_SET_ASIDE', amountMinor: 100, progressMinor: 100, remainingMinor: 0, status: 'MET',
  });
  assert.deepEqual(await derive({ kind: 'BALANCE_BY_DATE', amountMinor: 100, targetMonth: '2026-03' }, { assignedMinor: 0, availableMinor: 100 }, '2026-03'), {
    kind: 'BALANCE_BY_DATE', amountMinor: 100, targetMonth: '2026-03', progressMinor: 100, remainingMinor: 0, status: 'MET',
  });
});

test('only an underfunded dated target before the requested month is overdue', async () => {
  assert.equal((await derive({ kind: 'BALANCE_BY_DATE', amountMinor: 100, targetMonth: '2026-01' }, { assignedMinor: 1000, availableMinor: 99 }, '2026-02')).status, 'OVERDUE');
  assert.equal((await derive({ kind: 'BALANCE_BY_DATE', amountMinor: 100, targetMonth: '2026-02' }, { assignedMinor: 0, availableMinor: 99 }, '2026-02')).status, 'UNDERFUNDED', 'a target in the requested month is not overdue');
  assert.equal((await derive({ kind: 'BALANCE_BY_DATE', amountMinor: 100, targetMonth: '2026-03' }, { assignedMinor: 0, availableMinor: 99 }, '2026-02')).status, 'UNDERFUNDED');
  assert.equal((await derive({ kind: 'BALANCE_BY_DATE', amountMinor: 100, targetMonth: '2025-12' }, { assignedMinor: 0, availableMinor: 99 }, '2026-01')).status, 'OVERDUE', 'the comparison must be chronological across a year boundary, not a month-suffix comparison');
  assert.equal((await derive({ kind: 'MONTHLY_SET_ASIDE', amountMinor: 100 }, { assignedMinor: 0, availableMinor: 99 }, '2026-04')).status, 'UNDERFUNDED', 'the dated overdue rule does not apply to set-aside targets');
});

test('monthly summary attaches current target state only to targeted categories in every month', () => {
  const state: FinancialState = {
    id: 'budget', setupStep: 'COMPLETE', timezone: 'UTC', version: 7, account: null,
    categories: [{ id: 'food', name: 'Food', archived: false }, { id: 'bills', name: 'Bills', archived: false }],
    targets: [{ categoryId: 'food', kind: 'BALANCE_BY_DATE', amountMinor: 80, targetMonth: '2026-02' }],
    events: [
      { id: 'assignment', kind: 'ASSIGNMENT', amountMinor: 50, categoryId: 'food', month: '2026-02' },
      { id: 'spending', kind: 'SPENDING', amountMinor: 20, categoryId: 'food', month: '2026-02' },
    ],
  };
  const service = new ReportService();
  const february = service.read(state, '2026-02');
  const food = february.categories.find(category => category.id === 'food')!;
  assert.equal(food.assignedMinor, 50);
  assert.equal(food.availableMinor, 30, 'assigned and available must differ here so a swapped progress basis cannot pass');
  assert.deepEqual(food.target, {
    kind: 'BALANCE_BY_DATE', amountMinor: 80, targetMonth: '2026-02', progressMinor: 30, remainingMinor: 50, status: 'UNDERFUNDED',
  });
  for (const month of ['2026-01', '2026-02', '2026-03']) {
    const bills = service.read(state, month).categories.find(category => category.id === 'bills')!;
    assert.equal('target' in bills, false, `Bills must have no target state in ${month}`);
  }
});

const targetResponseFields = (value: unknown, path = '$'): string[] => Array.isArray(value)
  ? value.flatMap((item, index) => targetResponseFields(item, `${path}[${index}]`))
  : value && typeof value === 'object'
    ? Object.entries(value).flatMap(([key, nested]) => [
      ...(['target', 'targetState', 'targetMonth', 'progressMinor', 'remainingMinor'].includes(key) ? [`${path}.${key}`] : []),
      ...targetResponseFields(nested, `${path}.${key}`),
    ])
    : [];

test('single-month and multi-month report responses never contain target state', async () => {
  const { app, token, budget } = setup();
  const categoryId = budget.categories[0].id;
  await app.setCategoryTarget(token, budget.id, categoryId, { kind: 'BALANCE_BY_DATE', amountMinor: 100, targetMonth: '2026-03' }, undefined, options('report-target', 0));

  const server = createServer(app);
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const request = async (query: string) => {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/budgets/${budget.id}/reports/monthly?${query}`, { headers: { cookie: `sid=${token}` } });
    assert.equal(response.status, 200);
    return (await response.json() as any).data;
  };
  try {
    const singleMonth = await request('month=2026-02');
    const multiMonth = await request('from=2026-02&to=2026-03');
    assert.deepEqual(targetResponseFields(singleMonth), []);
    assert.deepEqual(targetResponseFields(multiMonth), []);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

const financialSnapshot = (summary: any, state: FinancialState) => ({
  readyToAssignMinor: summary.rta.amountMinor,
  categories: summary.categories.map((category: any) => ({ id: category.id, assignedMinor: category.assignedMinor, activityMinor: category.activityMinor, availableMinor: category.availableMinor })),
  accountBalanceMinor: summary.accountBalanceMinor,
  accountBalances: summary.accounts.map((account: any) => ({ id: account.id, balanceMinor: account.balanceMinor })),
  financialEventCount: state.events.length,
  assignments: state.events.filter(event => event.kind === 'ASSIGNMENT').map(event => ({ id: event.id, categoryId: event.categoryId, amountMinor: event.amountMinor, month: event.month })),
});

test('setting and removing a target preserves every financial value and creates no unconfirmed assignment', async () => {
  const { app, token, budget, financialStore, ownerId } = setup();
  const categoryId = budget.categories[0].id;
  const income = (await app.recordIncome(token, budget.id, { amountMinor: 1000, date: '2026-02-01' }, undefined, options('invariant-income', 0))).data;
  await app.releaseIncome(token, budget.id, income.id, undefined, options('invariant-release', 1));
  await app.assign(token, budget.id, { categoryId, amountMinor: 250, month: '2026-02' }, undefined, options('invariant-assignment', 2));
  await app.recordSpending(token, budget.id, { amountMinor: 50, categoryId, date: '2026-02-02' }, undefined, options('invariant-spending', 3));

  const beforeState = await financialStore.load(ownerId, budget.id);
  const before = financialSnapshot((await app.getFinancialSummary(token, budget.id, '2026-02')).data, beforeState);
  const set = await app.setCategoryTarget(token, budget.id, categoryId, { kind: 'MONTHLY_SET_ASIDE', amountMinor: 300 }, undefined, options('invariant-target-set', beforeState.version));
  const afterSetState = await financialStore.load(ownerId, budget.id);
  const afterSet = financialSnapshot((await app.getFinancialSummary(token, budget.id, '2026-02')).data, afterSetState);
  assert.deepEqual(afterSet, before, 'setting a target must not change RTA, category values, account balances, event count, or assignments');

  await app.removeCategoryTarget(token, budget.id, categoryId, undefined, options('invariant-target-remove', set.data.version));
  const afterRemoveState = await financialStore.load(ownerId, budget.id);
  const afterRemove = financialSnapshot((await app.getFinancialSummary(token, budget.id, '2026-02')).data, afterRemoveState);
  assert.deepEqual(afterRemove, before, 'removing a target must preserve the same financial values and event count');
});
