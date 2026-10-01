import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiError, BudgetApp } from '../src/app.ts';
import { createServer } from '../src/server.ts';
import { InMemoryBudgetStore, InMemoryFinancialStore } from '../src/persistence/in-memory-budget-store.ts';

const setup = (email = 'owner@example.test') => {
  const budgetStore = new InMemoryBudgetStore(); const financialStore = new InMemoryFinancialStore(budgetStore); const app = new BudgetApp(Date.now, budgetStore);
  app.register(email, 'correct horse'); const token = (app.signIn(email, 'correct horse') as any).data.sessionToken; const budget = (app.createBudget(token) as any).data;
  const ready = (app.saveSetup(token, budget.id, { openingBalanceMinor: 10_000, categories: ['Food', 'Bills'] }) as any).data;
  return { app, token, budget, ownerId: (app.authenticate(token) as any).id, accountId: ready.accounts[0].id, categoryId: ready.categories[0].id, budgetStore, financialStore };
};
const definition = (accountId: string, categoryId: string | null = null) => ({ accountId, categoryId, flow: categoryId ? 'SPENDING' as const : 'INCOME' as const, amountMinor: 500, payee: 'Payee', memo: 'Memo', dayOfMonth: 15, intervalMonths: 1, startDate: '2026-01-15' });
const options = (idempotencyKey: string, expectedVersion: number) => ({ idempotencyKey, expectedVersion });
const expectError = (promise: Promise<unknown>, code: ApiError['code']) => assert.rejects(promise, error => error instanceof ApiError && error.code === code);
const errorEnvelope = async (promise: Promise<unknown>) => {
  let error: unknown;
  try { await promise; } catch (caught) { error = caught; }
  assert.ok(error instanceof ApiError, 'Expected an API error');
  return { status: error.status, error: { code: error.code, message: error.message } };
};
const expectIndistinguishableNotFound = async (resource: () => Promise<unknown>, missing: () => Promise<unknown>) => {
  const resourceError = await errorEnvelope(resource()); const missingError = await errorEnvelope(missing());
  const notFound = { status: 404, error: { code: 'NOT_FOUND', message: 'Resource not found' } };
  assert.deepEqual(resourceError, notFound); assert.deepEqual(missingError, notFound); assert.deepEqual(resourceError, missingError);
};
const withoutVersions = (value: any): any => Array.isArray(value)
  ? value.map(withoutVersions)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'version').map(([key, nested]) => [key, withoutVersions(nested)]))
    : value;

test('schedule create, list, and remove preserve server-minted identity and replay each mutation', async () => {
  const { app, token, budget, accountId, categoryId, ownerId, financialStore } = setup(); const input = definition(accountId, categoryId);
  const created = await app.createSchedule(token, budget.id, input, undefined, options('schedule-create', 0));
  assert.equal(created.data.version, 1); const id = created.data.schedule.id;
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.deepEqual((await app.createSchedule(token, budget.id, input, undefined, options('schedule-create', 0))).data, created.data);
  await expectError(app.createSchedule(token, budget.id, { ...input, amountMinor: 600 }, undefined, options('schedule-create', 0)), 'CONFLICT');
  const listed = await app.listSchedules(token, budget.id);
  assert.deepEqual(listed.data.schedules.map((schedule: any) => schedule.id), [id]); assert.equal(listed.data.version, 1);
  const removed = await app.removeSchedule(token, budget.id, id, undefined, options('schedule-remove', 1));
  assert.deepEqual(removed.data, { id, removed: true, version: 2 });
  assert.deepEqual((await app.removeSchedule(token, budget.id, id, undefined, options('schedule-remove', 1))).data, removed.data);
  assert.deepEqual((await app.listSchedules(token, budget.id)).data.schedules, []);
  assert.equal((await financialStore.load(ownerId, budget.id)).version, 2);
});

test('schedule creation rejects a client-supplied identity', async () => {
  const owner = setup(); const version = (await owner.financialStore.load(owner.ownerId, owner.budget.id)).version;
  await expectError(owner.app.createSchedule(owner.token, owner.budget.id, { ...definition(owner.accountId), id: crypto.randomUUID() }, undefined, options('client-schedule-id', version)), 'VALIDATION_ERROR');
  assert.deepEqual((await owner.app.listSchedules(owner.token, owner.budget.id)).data.schedules, []);
  assert.equal((await owner.financialStore.load(owner.ownerId, owner.budget.id)).version, version);
});

test('schedule validation rejects malformed definitions and unavailable resources without a write', async () => {
  const owner = setup(); const foreign = setup('foreign@example.test');
  const active = await owner.app.createAccount(owner.token, owner.budget.id, { name: 'Active account', kind: 'checking' }, undefined, options('active-schedule-account', 0));
  await owner.app.archiveAccount(owner.token, owner.budget.id, owner.accountId, undefined, options('archive-schedule-account', 1));
  await owner.app.archiveCategory(owner.token, owner.budget.id, owner.categoryId);
  const accountId = (active.data as any).account.id;
  const foreignAccount = (await foreign.financialStore.load(foreign.ownerId, foreign.budget.id)).accounts![0].id;
  const foreignCategory = (await foreign.financialStore.load(foreign.ownerId, foreign.budget.id)).categories[0].id;
  const version = (await owner.financialStore.load(owner.ownerId, owner.budget.id)).version;
  await expectIndistinguishableNotFound(
    () => owner.app.createSchedule(owner.token, owner.budget.id, definition(foreignAccount), undefined, options('foreign-account', version)),
    () => owner.app.createSchedule(owner.token, owner.budget.id, definition(crypto.randomUUID()), undefined, options('missing-account', version)),
  );
  await expectIndistinguishableNotFound(
    () => owner.app.createSchedule(owner.token, owner.budget.id, definition(accountId, foreignCategory), undefined, options('foreign-category', version)),
    () => owner.app.createSchedule(owner.token, owner.budget.id, definition(accountId, crypto.randomUUID()), undefined, options('missing-category', version)),
  );
  const rejected: [string, any, ApiError['code']][] = [
    ['archived account', definition(owner.accountId), 'VALIDATION_ERROR'],
    ['archived category', definition(accountId, owner.categoryId), 'VALIDATION_ERROR'],
    ['income with category', { ...definition(accountId), categoryId: owner.categoryId }, 'VALIDATION_ERROR'],
    ['spending without category', { ...definition(accountId, owner.categoryId), categoryId: null }, 'VALIDATION_ERROR'],
    ['non-positive amount', { ...definition(accountId), amountMinor: 0 }, 'VALIDATION_ERROR'],
    ['unsafe amount', { ...definition(accountId), amountMinor: Number.MAX_SAFE_INTEGER + 1 }, 'VALIDATION_ERROR'],
    ['day below range', { ...definition(accountId), dayOfMonth: 0 }, 'VALIDATION_ERROR'],
    ['day above range', { ...definition(accountId), dayOfMonth: 32 }, 'VALIDATION_ERROR'],
    ['interval below range', { ...definition(accountId), intervalMonths: 0 }, 'VALIDATION_ERROR'],
    ['interval above range', { ...definition(accountId), intervalMonths: 13 }, 'VALIDATION_ERROR'],
    ['malformed start date', { ...definition(accountId), startDate: '2026-02-30' }, 'VALIDATION_ERROR'],
    ['start day mismatch', { ...definition(accountId), dayOfMonth: 31, startDate: '2026-02-27' }, 'VALIDATION_ERROR'],
  ];
  for (const [label, input, code] of rejected) await expectError(owner.app.createSchedule(owner.token, owner.budget.id, input, undefined, options(`invalid-${label}`, version)), code);
  assert.deepEqual((await owner.app.listSchedules(owner.token, owner.budget.id)).data.schedules, []);
  assert.equal((await owner.financialStore.load(owner.ownerId, owner.budget.id)).version, version);
});

test('schedule reads and mutations do not disclose foreign resources; archived-account schedules remain readable', async () => {
  const owner = setup(); const foreign = setup('other-owner@example.test');
  const created = await foreign.app.createSchedule(foreign.token, foreign.budget.id, definition(foreign.accountId), undefined, options('foreign-schedule', 0));
  await expectIndistinguishableNotFound(
    () => owner.app.listSchedules(owner.token, foreign.budget.id),
    () => owner.app.listSchedules(owner.token, crypto.randomUUID()),
  );
  await expectIndistinguishableNotFound(
    () => owner.app.createSchedule(owner.token, owner.budget.id, definition(foreign.accountId), undefined, options('foreign-account-boundary', 0)),
    () => owner.app.createSchedule(owner.token, owner.budget.id, definition(crypto.randomUUID()), undefined, options('missing-account-boundary', 0)),
  );
  await expectIndistinguishableNotFound(
    () => owner.app.createSchedule(owner.token, owner.budget.id, definition(owner.accountId, foreign.categoryId), undefined, options('foreign-category-boundary', 0)),
    () => owner.app.createSchedule(owner.token, owner.budget.id, definition(owner.accountId, crypto.randomUUID()), undefined, options('missing-category-boundary', 0)),
  );
  await expectIndistinguishableNotFound(
    () => owner.app.removeSchedule(owner.token, owner.budget.id, created.data.schedule.id, undefined, options('foreign-remove', 0)),
    () => owner.app.removeSchedule(owner.token, owner.budget.id, crypto.randomUUID(), undefined, options('missing-remove', 0)),
  );
  const local = await owner.app.createSchedule(owner.token, owner.budget.id, definition(owner.accountId), undefined, options('local-schedule', 0));
  await owner.app.archiveAccount(owner.token, owner.budget.id, owner.accountId, undefined, options('archive-existing-schedule', 1));
  assert.deepEqual((await owner.app.listSchedules(owner.token, owner.budget.id)).data.schedules.map((schedule: any) => schedule.id), [local.data.schedule.id]);
});

test('schedule writes preserve financial state and all projections before and after future occurrences', async () => {
  const { app, token, budget, accountId, categoryId, ownerId, budgetStore, financialStore } = setup();
  const destination = await app.createAccount(token, budget.id, { name: 'Savings', kind: 'checking' }, undefined, options('neutral-destination', 0));
  const destinationAccountId = (destination.data as any).account.id;
  const transfer = await app.recordTransfer(token, budget.id, { sourceAccountId: accountId, destinationAccountId, amountMinor: 125, date: '2026-01-02' }, undefined, options('neutral-transfer', 1));
  const income = await app.recordIncome(token, budget.id, { amountMinor: 800, date: '2026-01-01' }, undefined, options('seed-income', 2));
  await app.releaseIncome(token, budget.id, (income.data as any).id, undefined, options('seed-release', 3));
  await app.assign(token, budget.id, { categoryId, amountMinor: 250, month: '2026-01' }, undefined, options('seed-assignment', 4));
  await app.recordSpending(token, budget.id, { amountMinor: 75, categoryId, date: '2026-01-02' }, undefined, options('seed-spending', 5));
  const seededState = await financialStore.load(ownerId, budget.id);
  budgetStore.saveBudget(ownerId, { ...seededState, rawEvents: seededState.events.map(event => ({ ...event })) });
  const before = await financialStore.load(ownerId, budget.id);
  const beforeRawEvents = before.rawEvents!;
  assert.ok(beforeRawEvents.length > 0, 'the raw-event comparison must use a non-empty event history');
  assert.equal(before.transfers?.length, 1, 'the fixture must include a persisted transfer record');
  assert.ok(beforeRawEvents.some(event => event.transferId === (transfer.data as any).transferId && event.kind === 'TRANSFER_OUT'));
  assert.ok(beforeRawEvents.some(event => event.transferId === (transfer.data as any).transferId && event.kind === 'TRANSFER_IN'));
  const assertFinancialValuesUnchanged = (state: typeof before) => {
    assert.deepEqual(state.rawEvents, beforeRawEvents, 'raw event history changed');
    assert.deepEqual(state.events, before.events, 'effective events changed');
    assert.deepEqual(state.transfers, before.transfers, 'transfer records changed');
    assert.deepEqual(state.accounts, before.accounts, 'account values changed');
  };
  const readProjections = async () => ({
    summary: (await app.getFinancialSummary(token, budget.id, '2026-01')).data,
    dashboard: (await app.getDashboard(token, budget.id, '2026-01')).data,
    monthlyReport: (await app.getMonthlyReport(token, budget.id, '2026-01')).data,
    multiMonthSeries: (await app.getMultiMonthReport(token, budget.id, '2026-01', '2026-02')).data,
  });
  const projectionsBefore = await readProjections();
  const assertProjectionsUnchanged = async (expectedScheduleCount: number) => {
    const currentSchedules = (await app.listSchedules(token, budget.id)).data.schedules;
    assert.equal(currentSchedules.length, expectedScheduleCount, 'projection checks must observe the requested schedule state');
    const currentProjections = await readProjections();
    for (const name of ['summary', 'dashboard', 'monthlyReport', 'multiMonthSeries'] as const) {
      const current = currentProjections[name]; const original = projectionsBefore[name];
      assert.equal(Object.hasOwn(current, 'schedules'), false, `${name} must not expose schedules`);
      assert.deepEqual(withoutVersions(current), withoutVersions(original), `${name} acquired a schedule-derived value`);
    }
  };
  const created = await app.createSchedule(token, budget.id, definition(accountId), undefined, options('neutral-create', 6));
  assert.equal(created.data.version, 7); assertFinancialValuesUnchanged(await financialStore.load(ownerId, budget.id));
  await assertProjectionsUnchanged(1);

  const futureDefinition = { ...definition(accountId), dayOfMonth: 31, startDate: '2099-12-31' };
  assert.ok(Date.parse(`${futureDefinition.startDate}T00:00:00.000Z`) > Date.now(), 'future schedule start must be in the future');
  const future = await app.createSchedule(token, budget.id, futureDefinition, undefined, options('neutral-future-create', 7));
  assert.equal(future.data.version, 8); assertFinancialValuesUnchanged(await financialStore.load(ownerId, budget.id));
  assert.ok((await app.listSchedules(token, budget.id)).data.schedules.some(schedule => schedule.id === future.data.schedule.id && schedule.startDate === futureDefinition.startDate));
  await assertProjectionsUnchanged(2);

  const removed = await app.removeSchedule(token, budget.id, created.data.schedule.id, undefined, options('neutral-remove', 8));
  assert.equal(removed.data.version, 9); assertFinancialValuesUnchanged(await financialStore.load(ownerId, budget.id));
  await assertProjectionsUnchanged(1);
  const removedFuture = await app.removeSchedule(token, budget.id, future.data.schedule.id, undefined, options('neutral-future-remove', 9));
  assert.equal(removedFuture.data.version, 10); assertFinancialValuesUnchanged(await financialStore.load(ownerId, budget.id));
  await assertProjectionsUnchanged(0);
});

const assertHttpNotFound = async (response: Response) => {
  const body = await response.json() as any;
  assert.deepEqual({ status: response.status, code: body.error?.code, message: body.error?.message }, { status: 404, code: 'NOT_FOUND', message: 'Resource not found' });
};

test('schedule HTTP routes use the standard envelope and require idempotency and If-Match for mutations', async t => {
  const { app, token, budget, accountId } = setup(); const server = createServer(app);
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); }); t.after(() => server.close());
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}/api/v1/budgets/${budget.id}/schedules`; const headers = { cookie: `sid=${token}`, 'content-type': 'application/json' }; const body = JSON.stringify(definition(accountId));
  assert.equal((await fetch(url, { method: 'POST', headers, body })).status, 400);
  assert.equal((await fetch(url, { method: 'POST', headers: { ...headers, 'idempotency-key': 'missing-version' }, body })).status, 400);
  const createdResponse = await fetch(url, { method: 'POST', headers: { ...headers, 'idempotency-key': 'http-create', 'if-match': '0' }, body });
  assert.equal(createdResponse.status, 201); const created = await createdResponse.json() as any;
  assert.deepEqual(Object.keys(created).sort(), ['data', 'requestId']); assert.equal(created.data.version, 1);
  assert.equal((await fetch(url, { headers: { cookie: headers.cookie } })).status, 200);
  const id = created.data.schedule.id; const item = `${url}/${id}`;
  await assertHttpNotFound(await fetch(item, { method: 'PUT', headers: { ...headers, 'idempotency-key': 'http-update', 'if-match': '1' }, body: JSON.stringify({ ...definition(accountId), amountMinor: 900 }) }));
  await assertHttpNotFound(await fetch(item, { method: 'PATCH', headers: { ...headers, 'idempotency-key': 'http-patch', 'if-match': '1' }, body: JSON.stringify({ amountMinor: 900 }) }));
  assert.deepEqual((await app.listSchedules(token, budget.id)).data.schedules, [created.data.schedule]);
  const removed = await fetch(item, { method: 'DELETE', headers: { cookie: headers.cookie, 'idempotency-key': 'http-remove', 'if-match': '1' } });
  assert.equal(removed.status, 200); assert.deepEqual((await removed.json() as any).data, { id, removed: true, version: 2 });
});
