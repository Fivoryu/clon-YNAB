import test from 'node:test';
import assert from 'node:assert/strict';
import { BudgetApp, ApiError } from '../src/app.ts';
import { createServer } from '../src/server.ts';

const password = 'correct horse';
const options = (idempotencyKey: string, expectedVersion?: number) => ({ idempotencyKey, expectedVersion });
const prepare = () => {
  const app = new BudgetApp();
  const email = `history-${Math.random()}@example.test`;
  app.register(email, password);
  const token = app.signIn(email, password).data.sessionToken;
  const budget = app.createBudget(token).data;
  const complete = app.saveSetup(token, budget.id, { openingBalanceMinor: 1000, categories: ['Food', 'Bills'] }).data;
  return { app, token, budget: complete };
};
const http = async (app: BudgetApp, token: string, path: string, init: RequestInit = {}) => {
  const server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const url = `http://127.0.0.1:${(address as { port: number }).port}${path}`;
  try {
    return await fetch(url, { ...init, headers: { cookie: `sid=${token}`, ...(init.headers ?? {}) } });
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
};

test('history list/read is owner-scoped, ordered by date and filterable by month', async () => {
  const { app, token, budget } = prepare();
  await app.recordIncome(token, budget.id, { amountMinor: 50, date: '2026-02-01' }, undefined, options('history-a'));
  await app.recordIncome(token, budget.id, { amountMinor: 75, date: '2026-02-20' }, undefined, options('history-b'));
  const listed = await http(app, token, `/api/v1/budgets/${budget.id}/transactions`);
  assert.equal(listed.status, 200);
  const body = await listed.json() as any;
  assert.equal(body.data.items[0].amountMinor, 75);
  assert.equal(body.data.items[0].state, 'ELIGIBLE');
  const filtered = await http(app, token, `/api/v1/budgets/${budget.id}/transactions?month=2026-02`);
  assert.equal((await filtered.json() as any).data.items.length, 2);
  const item = body.data.items[0];
  const read = await http(app, token, `/api/v1/budgets/${budget.id}/transactions/${item.transactionId}`);
  assert.equal((await read.json() as any).data.item.transactionId, item.transactionId);
});

test('edit requires mutation headers, validates fields, returns server history, and replays', async () => {
  const { app, token, budget } = prepare();
  const income = (await app.recordIncome(token, budget.id, { amountMinor: 50, date: '2026-02-01' }, undefined, options('edit-seed'))).data;
  const missing = await http(app, token, `/api/v1/budgets/${budget.id}/transactions/${income.id}`, { method: 'PATCH', body: JSON.stringify({ amountMinor: 60 }) });
  assert.equal(missing.status, 400);
  const edit = { method: 'PATCH', headers: { 'content-type': 'application/json', 'Idempotency-Key': 'edit-1', 'If-Match': 'W/"1"' }, body: JSON.stringify({ amountMinor: 60, date: '2026-02-10' }) };
  const first = await http(app, token, `/api/v1/budgets/${budget.id}/transactions/${income.id}`, edit);
  assert.equal(first.status, 200);
  const result = await first.json() as any;
  assert.equal(result.data.item.amountMinor, 60);
  assert.equal(result.data.item.date, '2026-02-10');
  assert.equal(result.data.version, 2);
  const replay = await http(app, token, `/api/v1/budgets/${budget.id}/transactions/${income.id}`, edit);
  assert.deepEqual((await replay.json() as any).data, result.data);
  const crossMonth = await http(app, token, `/api/v1/budgets/${budget.id}/transactions/${income.id}`, { ...edit, headers: { ...edit.headers as Record<string, string>, 'Idempotency-Key': 'edit-cross', 'If-Match': '"2"' }, body: JSON.stringify({ date: '2026-03-10' }) });
  assert.equal(crossMonth.status, 409);
  const incompatible = await http(app, token, `/api/v1/budgets/${budget.id}/transactions/${income.id}`, { ...edit, body: JSON.stringify({ amountMinor: 61, date: '2026-02-10' }) });
  assert.equal(incompatible.status, 409);
  await assert.rejects(() => app.editTransaction(token, budget.id, income.id, { amountMinor: 70 }, undefined, options('edit-2', 1)), (e: unknown) => e instanceof ApiError && e.code === 'CONFLICT');
});

test('delete requires confirmation, protects released income, and hides foreign resources', async () => {
  const { app, token, budget } = prepare();
  const income = (await app.recordIncome(token, budget.id, { amountMinor: 50, date: '2026-02-01' }, undefined, options('delete-seed'))).data;
  const unconfirmed = await http(app, token, `/api/v1/budgets/${budget.id}/transactions/${income.id}`, { method: 'DELETE', headers: { 'content-type': 'application/json', 'Idempotency-Key': 'delete-1', 'If-Match': '"1"' }, body: JSON.stringify({ confirmed: false }) });
  assert.equal(unconfirmed.status, 400);
  await app.releaseIncome(token, budget.id, income.id, undefined, options('release-for-protection'));
  const protectedList = await http(app, token, `/api/v1/budgets/${budget.id}/transactions`);
  assert.equal((await protectedList.json() as any).data.items[0].state, 'PROTECTED');
  const protectedResponse = await http(app, token, `/api/v1/budgets/${budget.id}/transactions/${income.id}`, { method: 'DELETE', headers: { 'content-type': 'application/json', 'Idempotency-Key': 'delete-2', 'If-Match': '"2"' }, body: JSON.stringify({ confirmed: true }) });
  assert.equal(protectedResponse.status, 409);
  app.register('foreign-history@example.test', password);
  const foreign = app.signIn('foreign-history@example.test', password).data.sessionToken;
  const hidden = await http(app, foreign, `/api/v1/budgets/${budget.id}/transactions/${income.id}`);
  assert.equal(hidden.status, 404);
});
