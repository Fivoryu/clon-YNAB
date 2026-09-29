import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiError, BudgetApp } from '../src/app.ts';
import { createServer } from '../src/server.ts';
import { InMemoryBudgetStore, InMemoryFinancialStore } from '../src/persistence/in-memory-budget-store.ts';

const setup = () => {
  const budgetStore = new InMemoryBudgetStore(); const financialStore = new InMemoryFinancialStore(budgetStore); const app = new BudgetApp(Date.now, budgetStore, financialStore);
  app.register('owner@example.test', 'correct horse'); const token = app.signIn('owner@example.test', 'correct horse').data.sessionToken; const budget = app.createBudget(token).data;
  const completed = app.saveSetup(token, budget.id, { openingBalanceMinor: 10_000, categories: ['Food', 'Bills'] }).data;
  return { app, token, budget, categoryId: completed.categories[0].id, ownerId: app.authenticate(token).id, financialStore };
};
const options = (idempotencyKey: string, expectedVersion: number) => ({ idempotencyKey, expectedVersion });
const expectApiError = (promise: Promise<unknown>, code: ApiError['code']) => assert.rejects(promise, (error: unknown) => error instanceof ApiError && error.code === code);
const withoutVersion = ({ version: _version, ...summary }: Record<string, any>) => summary;

test('category targets can be set, replaced, replayed, and removed without changing financial values', async () => {
  const { app, token, budget, categoryId, ownerId, financialStore } = setup();
  const income = await app.recordIncome(token, budget.id, { amountMinor: 800, date: '2026-02-01' }, undefined, options('target-income', 0));
  await app.releaseIncome(token, budget.id, income.data.id, undefined, options('target-release', 1));
  await app.assign(token, budget.id, { categoryId, amountMinor: 250, month: '2026-02' }, undefined, options('target-assignment', 2));
  await app.recordSpending(token, budget.id, { amountMinor: 75, categoryId, date: '2026-02-02' }, undefined, options('target-spending', 3));
  const before = (await app.getFinancialSummary(token, budget.id, '2026-02')).data; const beforeState = await financialStore.load(ownerId, budget.id);
  const definition = { kind: 'MONTHLY_SET_ASIDE', amountMinor: 300 };
  const set = await app.setCategoryTarget(token, budget.id, categoryId, definition, undefined, options('target-set', beforeState.version));
  assert.deepEqual(set.data, { categoryId, target: definition, version: beforeState.version + 1 });
  assert.deepEqual((await app.setCategoryTarget(token, budget.id, categoryId, definition, undefined, options('target-set', beforeState.version))).data, set.data);
  const afterSet = (await app.getFinancialSummary(token, budget.id, '2026-02')).data; const afterSetState = await financialStore.load(ownerId, budget.id);
  assert.deepEqual(withoutVersion(afterSet), withoutVersion(before)); assert.equal(afterSet.version, before.version + 1); assert.equal(afterSetState.events.length, beforeState.events.length);
  const replacement = { kind: 'BALANCE_BY_DATE', amountMinor: 900, targetMonth: '2026-03' };
  const replaced = await app.setCategoryTarget(token, budget.id, categoryId, replacement, undefined, options('target-replace', afterSetState.version));
  assert.deepEqual(replaced.data.target, replacement); assert.equal(replaced.data.version, afterSetState.version + 1);
  assert.deepEqual(withoutVersion((await app.getFinancialSummary(token, budget.id, '2026-02')).data), withoutVersion(before));
  const removed = await app.removeCategoryTarget(token, budget.id, categoryId, undefined, options('target-remove', replaced.data.version));
  const afterRemove = (await app.getFinancialSummary(token, budget.id, '2026-02')).data; const afterRemoveState = await financialStore.load(ownerId, budget.id);
  assert.deepEqual(removed.data, { categoryId, target: null, version: replaced.data.version + 1 });
  assert.deepEqual(withoutVersion(afterRemove), withoutVersion(before)); assert.equal(afterRemove.version, before.version + 3);
  assert.equal(afterRemoveState.events.length, beforeState.events.length); assert.deepEqual(afterRemoveState.targets, []);
});

test('target writes validate category ownership, kind, amount, and target month', async () => {
  const { app, token, budget, categoryId } = setup();
  app.register('foreign@example.test', 'correct horse'); const foreignToken = app.signIn('foreign@example.test', 'correct horse').data.sessionToken;
  const foreignBudget = app.createBudget(foreignToken).data; const foreignCategory = app.saveSetup(foreignToken, foreignBudget.id, { categories: ['Foreign'] }).data.categories[0];
  await expectApiError(app.setCategoryTarget(token, budget.id, crypto.randomUUID(), { kind: 'MONTHLY_SET_ASIDE', amountMinor: 1 }, undefined, options('unknown-category', 0)), 'NOT_FOUND');
  await expectApiError(app.setCategoryTarget(token, budget.id, foreignCategory.id, { kind: 'MONTHLY_SET_ASIDE', amountMinor: 1 }, undefined, options('foreign-category', 0)), 'NOT_FOUND');
  await expectApiError(app.setCategoryTarget(token, budget.id, categoryId, { kind: 'OTHER', amountMinor: 1 }, undefined, options('unsupported-kind', 0)), 'VALIDATION_ERROR');
  for (const [key, amountMinor] of [['zero', 0], ['negative', -1], ['unsafe', Number.MAX_SAFE_INTEGER + 1], ['fraction', 1.5]] as const) await expectApiError(app.setCategoryTarget(token, budget.id, categoryId, { kind: 'MONTHLY_SET_ASIDE', amountMinor }, undefined, options(`amount-${key}`, 0)), 'VALIDATION_ERROR');
  await expectApiError(app.setCategoryTarget(token, budget.id, categoryId, { kind: 'BALANCE_BY_DATE', amountMinor: 100, targetMonth: '2026-13' }, undefined, options('bad-month', 0)), 'VALIDATION_ERROR');
  await expectApiError(app.setCategoryTarget(token, budget.id, categoryId, { kind: 'MONTHLY_SET_ASIDE', amountMinor: 100, targetMonth: '2026-02' }, undefined, options('forbidden-month', 0)), 'VALIDATION_ERROR');
  await expectApiError(app.setCategoryTarget(token, budget.id, categoryId, { kind: 'BALANCE_BY_DATE', amountMinor: 100 }, undefined, options('missing-month', 0)), 'VALIDATION_ERROR');
  await expectApiError(app.removeCategoryTarget(token, budget.id, categoryId, undefined, options('missing-target', 0)), 'NOT_FOUND');
  await app.archiveCategory(token, budget.id, categoryId);
  await expectApiError(app.setCategoryTarget(token, budget.id, categoryId, { kind: 'MONTHLY_SET_ASIDE', amountMinor: 100 }, undefined, options('archived-set', 0)), 'CONFLICT');
});

test('dated targets accept a month before, equal to, and after the requested month while one category retains one current definition', async () => {
  const { app, token, budget, categoryId, ownerId, financialStore } = setup(); let version = 0;
  for (const targetMonth of ['2026-01', '2026-02', '2026-03']) {
    const target = { kind: 'BALANCE_BY_DATE', amountMinor: 700, targetMonth };
    assert.deepEqual((await app.setCategoryTarget(token, budget.id, categoryId, target, undefined, options(`dated-${targetMonth}`, version))).data, { categoryId, target, version: ++version });
    await app.getFinancialSummary(token, budget.id, '2026-02');
    assert.deepEqual((await financialStore.load(ownerId, budget.id)).targets, [{ categoryId, ...target }]);
  }
  for (const requestedMonth of ['2026-01', '2026-02', '2026-03']) {
    assert.equal((await app.getFinancialSummary(token, budget.id, requestedMonth)).data.version, version);
    assert.deepEqual((await financialStore.load(ownerId, budget.id)).targets, [{ categoryId, kind: 'BALANCE_BY_DATE', amountMinor: 700, targetMonth: '2026-03' }]);
  }
});

test('an archived category keeps its target readable but rejects setting, replacing, and removing it', async () => {
  const { app, token, budget, categoryId, ownerId, financialStore } = setup(); const target = { kind: 'MONTHLY_SET_ASIDE', amountMinor: 250 };
  await app.setCategoryTarget(token, budget.id, categoryId, target, undefined, options('archive-target-set', 0)); await app.archiveCategory(token, budget.id, categoryId);
  const archived = await financialStore.load(ownerId, budget.id); assert.equal(archived.categories.find(category => category.id === categoryId)?.archived, true);
  assert.deepEqual(archived.targets, [{ categoryId, ...target }]);
  await expectApiError(app.setCategoryTarget(token, budget.id, categoryId, target, undefined, options('archive-target-new', 1)), 'CONFLICT');
  await expectApiError(app.setCategoryTarget(token, budget.id, categoryId, { ...target, amountMinor: 500 }, undefined, options('archive-target-replace', 1)), 'CONFLICT');
  await expectApiError(app.removeCategoryTarget(token, budget.id, categoryId, undefined, options('archive-target-remove', 1)), 'CONFLICT');
  assert.deepEqual((await financialStore.load(ownerId, budget.id)).targets, archived.targets);
});

test('target routes require both mutation headers and expose the target contract', async (t) => {
  const { app, token, budget, categoryId } = setup(); const server = createServer(app);
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); }); t.after(() => server.close());
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}/api/v1/budgets/${budget.id}/categories/${categoryId}/target`;
  const headers = { cookie: `sid=${token}`, 'content-type': 'application/json' }; const body = JSON.stringify({ kind: 'BALANCE_BY_DATE', amountMinor: 500, targetMonth: '2026-02' });
  assert.equal((await fetch(url, { method: 'PUT', headers, body })).status, 400);
  assert.equal((await fetch(url, { method: 'PUT', headers: { ...headers, 'idempotency-key': 'http-target' }, body })).status, 400);
  const put = await fetch(url, { method: 'PUT', headers: { ...headers, 'idempotency-key': 'http-target', 'if-match': '0' }, body });
  assert.equal(put.status, 200); assert.deepEqual((await put.json() as any).data, { categoryId, target: { kind: 'BALANCE_BY_DATE', amountMinor: 500, targetMonth: '2026-02' }, version: 1 });
  assert.equal((await fetch(url, { method: 'DELETE', headers })).status, 400);
  assert.equal((await fetch(url, { method: 'DELETE', headers: { cookie: headers.cookie, 'idempotency-key': 'no-version' } })).status, 400);
  const removed = await fetch(url, { method: 'DELETE', headers: { cookie: headers.cookie, 'idempotency-key': 'http-delete', 'if-match': '1' } });
  assert.equal(removed.status, 200); assert.deepEqual((await removed.json() as any).data, { categoryId, target: null, version: 2 });
});
