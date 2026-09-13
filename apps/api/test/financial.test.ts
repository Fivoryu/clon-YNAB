import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { BudgetApp, ApiError } from '../src/app.ts';

const prepare = () => {
  const app = new BudgetApp();
  const email = `finance-${randomUUID()}@example.test`;
  app.register(email, 'correct horse');
  const token = app.signIn(email, 'correct horse').data.sessionToken;
  const budget = app.createBudget(token).data;
  const complete = app.saveSetup(token, budget.id, { openingBalanceMinor: 1000, categories: ['Food', 'Bills'] }).data;
  return { app, token, budget: complete };
};

const options = (key: string, expectedVersion?: number) => ({ idempotencyKey: key, expectedVersion });

test('income is unreleased until explicit full release and spending updates the account once', async () => {
  const { app, token, budget } = prepare();
  const income = (await app.recordIncome(token, budget.id, { amountMinor: 500, date: '2026-02-01' }, undefined, options('income-1'))).data;
  assert.equal(income.accountBalanceMinor, 1500);
  assert.equal((await app.getFinancialSummary(token, budget.id, '2026-02')).data.rta.amountMinor, 1000);
  const released = (await app.releaseIncome(token, budget.id, income.id, undefined, options('release-1'))).data;
  assert.equal(released.releasedNowMinor, 500);
  const spending = (await app.recordSpending(token, budget.id, { amountMinor: 125, categoryId: budget.categories[0].id, date: '2026-02-01' }, undefined, options('spend-1'))).data;
  assert.equal(spending.accountBalanceMinor, 1375);
  const summary = (await app.getFinancialSummary(token, budget.id, '2026-02')).data;
  assert.equal(summary.rta.amountMinor, 1500);
  assert.equal(summary.categories.find(c => c.id === budget.categories[0].id)?.activityMinor, -125);
});

test('released income is scoped to its income month', async () => {
  const { app, token, budget } = prepare();
  const income = (await app.recordIncome(token, budget.id, { amountMinor: 500, date: '2026-02-01' }, undefined, options('month-income'))).data;
  await app.releaseIncome(token, budget.id, income.id, undefined, options('month-release'));
  assert.equal((await app.getFinancialSummary(token, budget.id, '2026-01')).data.rta.releasedIncomeMinor, 0);
  assert.equal((await app.getFinancialSummary(token, budget.id, '2026-01')).data.rta.amountMinor, 1000);
  assert.equal((await app.getFinancialSummary(token, budget.id, '2026-02')).data.rta.releasedIncomeMinor, 500);
});

test('assignment, unassignment, moves and archived-category guards are explicit', async () => {
  const { app, token, budget } = prepare();
  const first = budget.categories[0].id;
  const second = budget.categories[1].id;
  const assigned = (await app.assign(token, budget.id, { categoryId: first, amountMinor: 1100, month: '2026-02' }, undefined, options('assign-1'))).data;
  assert.equal(assigned.rtaMinor, -100);
  await app.move(token, budget.id, { sourceCategoryId: first, destinationCategoryId: second, amountMinor: 100, month: '2026-02' }, undefined, options('move-1'));
  await app.unassign(token, budget.id, { categoryId: first, amountMinor: 100, month: '2026-02' }, undefined, options('unassign-1'));
  app.archiveCategory(token, budget.id, second);
  await assert.rejects(() => app.assign(token, budget.id, { categoryId: second, amountMinor: 1, month: '2026-02' }, undefined, options('assign-archived')), (e: unknown) => e instanceof ApiError && e.code === 'CONFLICT');
});

test('financial commands replay by key, reject payload conflicts, and protect stale versions', async () => {
  const { app, token, budget } = prepare();
  const input = { amountMinor: 50, date: '2026-02-01' };
  const first = (await app.recordIncome(token, budget.id, input, undefined, options('same-key'))).data;
  const replay = (await app.recordIncome(token, budget.id, input, undefined, options('same-key'))).data;
  assert.deepEqual(replay, first);
  await assert.rejects(() => app.recordIncome(token, budget.id, { amountMinor: 51, date: '2026-02-01' }, undefined, options('same-key')), (e: unknown) => e instanceof ApiError && e.code === 'CONFLICT');
  await assert.rejects(() => app.recordIncome(token, budget.id, { amountMinor: 25, date: '2026-02-01' }, undefined, options('stale', 0)), (e: unknown) => e instanceof ApiError && e.code === 'CONFLICT');
});

test('financial resources remain owner-only', async () => {
  const { app, token, budget } = prepare();
  app.register('other@example.test', 'correct horse');
  const other = app.signIn('other@example.test', 'correct horse').data.sessionToken;
  await assert.rejects(() => app.getFinancialSummary(other, budget.id, '2026-02'), (e: unknown) => e instanceof ApiError && e.code === 'NOT_FOUND');
  await assert.rejects(() => app.recordIncome(other, budget.id, { amountMinor: 1, date: '2026-02-01' }, undefined, options('foreign')), (e: unknown) => e instanceof ApiError && e.code === 'NOT_FOUND');
  assert.equal(app.getBudget(token, budget.id).data.version, 0);
});
