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

test('account history API continues exclusive 500-item pages and rejects cursors outside their snapshot/filter', async () => {
  const { app, token, budget } = prepare();
  const accountId = budget.account!.id;
  const otherAccountId = '123e4567-e89b-42d3-a456-426614174000';
  let version = 91;
  const state: any = {
    id: budget.id, version, setupStep: 'COMPLETE', timezone: 'UTC',
    account: budget.account, accounts: [...budget.accounts, { ...budget.account, id: otherAccountId, name: 'Other', balanceMinor: 0 }],
    categories: budget.categories, transfers: [],
    events: Array.from({ length: 501 }, (_, index) => ({
      id: `transaction-${String(index).padStart(3, '0')}`, transactionId: `transaction-${String(index).padStart(3, '0')}`,
      kind: 'INCOME', accountId, amountMinor: 1, businessDate: '2026-02-01', month: '2026-02',
      status: 'POSTED', reconciled: false, createdAt: '2026-02-01T00:00:00.000Z',
    })),
  };
  (app as any).financialStore = { load: async () => ({ ...state, version }) };

  const firstResponse = await http(app, token, `/api/v1/budgets/${budget.id}/transactions?account=${accountId}`);
  const first = (await firstResponse.json() as any).data;
  assert.equal(firstResponse.status, 200);
  assert.equal(first.items.length, 500);
  assert.equal(first.version, 91);
  assert.ok(first.nextCursor);
  const secondResponse = await http(app, token, `/api/v1/budgets/${budget.id}/transactions?account=${accountId}&cursor=${encodeURIComponent(first.nextCursor)}`);
  const second = (await secondResponse.json() as any).data;
  assert.equal(second.items.length, 1);
  assert.equal(second.nextCursor, null);
  const ids = [...first.items, ...second.items].map((item: any) => item.transactionId);
  assert.equal(new Set(ids).size, 501);
  assert.deepEqual([ids[0], ids.at(-1)], ['transaction-500', 'transaction-000']);

  const allEvents = state.events;
  state.events = [];
  const empty = (await http(app, token, `/api/v1/budgets/${budget.id}/transactions?account=${accountId}`)).json();
  assert.equal((await empty as any).data.items.length, 0);
  assert.equal((await empty as any).data.nextCursor, null);
  state.events = allEvents.slice(0, 500);
  const exactlyFull = (await http(app, token, `/api/v1/budgets/${budget.id}/transactions?account=${accountId}`)).json();
  assert.equal((await exactlyFull as any).data.items.length, 500);
  assert.equal((await exactlyFull as any).data.nextCursor, null);
  state.events = allEvents;

  const tooLarge = await http(app, token, `/api/v1/budgets/${budget.id}/transactions?account=${accountId}&cursor=${'a'.repeat(2049)}`);
  assert.equal(tooLarge.status, 400);
  for (const query of [
    '?cursor=not-a-cursor',
    `?account=${otherAccountId}&cursor=${encodeURIComponent(first.nextCursor)}`,
    `?account=${accountId}&kind=INCOME&cursor=${encodeURIComponent(first.nextCursor)}`,
    `?account=${accountId}&q=Cash&cursor=${encodeURIComponent(first.nextCursor)}`,
  ]) {
    const response = await http(app, token, `/api/v1/budgets/${budget.id}/transactions${query}`);
    assert.equal(response.status, 400, query);
    assert.equal((await response.json() as any).error.code, 'VALIDATION_ERROR');
  }
  const { app: otherApp, token: otherToken, budget: otherBudget } = prepare();
  const crossBudget = await http(otherApp, otherToken, `/api/v1/budgets/${otherBudget.id}/transactions?account=${accountId}&cursor=${encodeURIComponent(first.nextCursor)}`);
  assert.equal(crossBudget.status, 400);

  version++;
  state.events.push({ id: 'new-transaction', transactionId: 'new-transaction', kind: 'INCOME', accountId, amountMinor: 2, businessDate: '2026-03-01', month: '2026-03', status: 'POSTED', reconciled: false, createdAt: '2026-03-01T00:00:00.000Z' });
  const stale = await http(app, token, `/api/v1/budgets/${budget.id}/transactions?account=${accountId}&cursor=${encodeURIComponent(first.nextCursor)}`);
  assert.equal(stale.status, 409);
  assert.match((await stale.json() as any).error.message, /restart/i);
  const restarted = await http(app, token, `/api/v1/budgets/${budget.id}/transactions?account=${accountId}`);
  const restartedData = (await restarted.json() as any).data;
  assert.equal(restartedData.version, 92);
  assert.equal(restartedData.items[0].transactionId, 'new-transaction');

  const nameFiltered = await http(app, token, `/api/v1/budgets/${budget.id}/transactions?account=${accountId}&q=Cash`);
  assert.equal((await nameFiltered.json() as any).data.nextCursor, null);
});

test('account-filtered transfers remain one item from either ledger side and effective replacements/deletions stay canonical', async () => {
  const { app, token, budget } = prepare();
  const destination = (await app.createAccount(token, budget.id, { name: 'History destination', kind: 'checking' }, undefined, options('cursor-account', 0))).data.account;
  const transfer = await app.recordTransfer(token, budget.id, { sourceAccountId: budget.account!.id, destinationAccountId: destination.id, amountMinor: 5, date: '2026-02-03' }, undefined, options('cursor-transfer', 1));
  const sourceHistory = await app.listTransactions(token, budget.id, { accountId: budget.account!.id, kind: 'TRANSFER' });
  const destinationHistory = await app.listTransactions(token, budget.id, { accountId: destination.id, kind: 'TRANSFER' });
  assert.deepEqual(sourceHistory.data.items.map(item => item.transactionId), [transfer.data.transferId]);
  assert.deepEqual(destinationHistory.data.items.map(item => item.transactionId), [transfer.data.transferId]);
  assert.equal(sourceHistory.data.nextCursor, null);

  const replaced = (await app.recordIncome(token, budget.id, { amountMinor: 10, date: '2026-02-04' }, undefined, options('cursor-replaced'))).data;
  const deleted = (await app.recordIncome(token, budget.id, { amountMinor: 20, date: '2026-02-05' }, undefined, options('cursor-deleted'))).data;
  await app.editTransaction(token, budget.id, replaced.id, { amountMinor: 11 }, undefined, options('cursor-replacement', 4));
  await app.deleteTransaction(token, budget.id, deleted.id, { confirmed: true }, undefined, options('cursor-tombstone', 5));
  const canonical = await app.listTransactions(token, budget.id, { accountId: budget.account!.id });
  assert.equal(canonical.data.items.filter(item => item.transactionId === replaced.id).length, 1);
  assert.equal(canonical.data.items.find(item => item.transactionId === replaced.id)?.amountMinor, 11);
  assert.equal(canonical.data.items.some(item => item.transactionId === deleted.id), false);
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

test('metadata is normalized on commands, preserved on omitted edits, and clearable', async () => {
  const { app, token, budget } = prepare();
  const income = (await app.recordIncome(token, budget.id, { amountMinor: 50, date: '2026-02-01', payee: '  Alice  ', memo: '\u2003Quarterly\u2003' }, undefined, options('metadata-income'))).data as any;
  assert.equal(income.payee, 'Alice');
  assert.equal(income.memo, 'Quarterly');
  const kept = (await app.editTransaction(token, budget.id, income.id, { amountMinor: 60 }, undefined, options('metadata-keep', 1))).data as any;
  assert.equal(kept.item.payee, 'Alice');
  assert.equal(kept.item.memo, 'Quarterly');
  const cleared = (await app.editTransaction(token, budget.id, income.id, { payee: null, memo: '  ' }, undefined, options('metadata-clear', 2))).data as any;
  assert.equal(cleared.item.payee, null);
  assert.equal(cleared.item.memo, null);
  const listed = await http(app, token, `/api/v1/budgets/${budget.id}/transactions?q=alice&kind=INCOME&from=2026-02-01&to=2026-02-01`);
  assert.equal(listed.status, 200);
  assert.equal((await listed.json() as any).data.items.length, 0);
});

test('history query grammar rejects repeated, unknown, inverted, and overlong parameters', async () => {
  const { app, token, budget } = prepare();
  for (const query of ['?q=one&q=two', '?unknown=value', '?from=2026-03-01&to=2026-02-01', `?q=${encodeURIComponent('😀'.repeat(201))}`]) {
    const response = await http(app, token, `/api/v1/budgets/${budget.id}/transactions${query}`);
    assert.equal(response.status, 400, query);
    assert.equal((await response.json() as any).error.code, 'VALIDATION_ERROR');
  }
});

test('metadata history covers spending and transfers with literal combined filters', async () => {
  const { app, token, budget } = prepare();
  const destination = (await app.createAccount(token, budget.id, { name: 'Search destination', kind: 'checking' }, undefined, options('metadata-api-account', 0))).data.account;
  const spending = (await app.recordSpending(token, budget.id, { amountMinor: 20, categoryId: budget.categories[0].id, date: '2026-02-02', payee: 'Store', memo: '100%_ready' }, undefined, options('metadata-api-spending', 1))).data as any;
  assert.deepEqual({ payee: spending.payee, memo: spending.memo }, { payee: 'Store', memo: '100%_ready' });
  const transfer = (await app.recordTransfer(token, budget.id, { sourceAccountId: budget.account!.id, destinationAccountId: destination.id, amountMinor: 5, date: '2026-02-03', payee: 'Move', memo: 'Archive note' }, undefined, options('metadata-api-transfer', 2))).data as any;
  assert.deepEqual({ payee: transfer.payee, memo: transfer.memo }, { payee: 'Move', memo: 'Archive note' });
  const literal = await http(app, token, `/api/v1/budgets/${budget.id}/transactions?q=${encodeURIComponent('100%_')}&kind=SPENDING&category=${budget.categories[0].id}&from=2026-02-02&to=2026-02-02`);
  assert.equal((await literal.json() as any).data.items[0].memo, '100%_ready');
  const transferResponse = await http(app, token, `/api/v1/budgets/${budget.id}/transactions?account=${destination.id}&kind=TRANSFER&q=destination`);
  const transferItems = (await transferResponse.json() as any).data.items;
  assert.equal(transferItems.length, 1);
  assert.deepEqual({ payee: transferItems[0].payee, memo: transferItems[0].memo }, { payee: 'Move', memo: 'Archive note' });
});
