import test from 'node:test';
import assert from 'node:assert/strict';
import { ReportService } from '../src/reports/report-service.ts';
import { InMemoryBudgetStore } from '../src/persistence/in-memory-budget-store.ts';
import { isFinancialEventCleared, PersistenceError, type FinancialEvent, type FinancialState } from '../src/persistence/financial-store.ts';
import * as planningEngine from '../src/planning/engine.ts';

const clearedStateViolation = (planningEngine as any).clearedStateViolation as (event: Pick<FinancialEvent, 'status' | 'cleared' | 'reconciled'>) => string | null;
const createEmptyBudgetStore = () => { const store = new InMemoryBudgetStore(); store.createUser({ id: 'owner', email: 'owner@example.test', passwordHash: 'unused' }); store.createBudget('owner', { id: 'budget', setupStep: 'COMPLETE', timezone: 'UTC', version: 0, account: { id: 'cash', name: 'Cash', openingBalanceMinor: 0 }, categories: [], events: [] }); return store; };
const createBudgetStore = () => { const store = new InMemoryBudgetStore(); store.createUser({ id: 'owner', email: 'owner@example.test', passwordHash: 'unused' }); return store; };
const budgetWithEvents = (events: FinancialEvent[], transfers: { id: string; sourceAccountId: string; destinationAccountId: string; amountMinor: number; businessDate: string; month: string; createdAt: string }[] = []) => ({
  id: 'budget', setupStep: 'COMPLETE' as const, timezone: 'UTC' as const, version: 0,
  account: { id: 'source', name: 'Source', kind: 'CHECKING' as const, archived: false, openingBalanceMinor: 0 },
  accounts: ['source', 'destination'].map(id => ({ id, name: id === 'source' ? 'Source' : 'Destination', kind: 'CHECKING' as const, archived: false, openingBalanceMinor: 0 })),
  categories: [], events, transfers,
});
const transferEffect = (id: string, kind: 'TRANSFER_OUT' | 'TRANSFER_IN', transferId: string | undefined = 'transfer'): FinancialEvent => ({
  id, kind, transferId, accountId: kind === 'TRANSFER_OUT' ? 'source' : 'destination', amountMinor: 25,
  businessDate: '2026-09-01', month: '2026-09', status: 'POSTED', cleared: false, reconciled: false,
});
const invalidWholeStates: { name: string; events: () => FinancialEvent[] }[] = [
  { name: 'an unpaired transfer effect', events: () => [transferEffect('unpaired-out', 'TRANSFER_OUT')] },
  { name: 'two same-kind effects for one transfer', events: () => [transferEffect('out', 'TRANSFER_OUT'), transferEffect('in', 'TRANSFER_IN'), transferEffect('duplicate-out', 'TRANSFER_OUT')] },
  { name: 'a transfer effect with no transferId', events: () => [transferEffect('missing-id', 'TRANSFER_OUT', undefined)] },
  { name: 'a cleared WORKING event', events: () => [{ id: 'working-cleared', kind: 'INCOME', amountMinor: 10, status: 'WORKING', cleared: true }] },
];
const assertConflict = (error: unknown) => error instanceof PersistenceError && error.code === 'CONFLICT';
for (const invalid of invalidWholeStates) {
  test(`in-memory createBudget rejects ${invalid.name}`, () => {
    const store = createBudgetStore();
    assert.throws(() => store.createBudget('owner', budgetWithEvents(invalid.events())), assertConflict);
  });
  test(`in-memory saveBudget rejects ${invalid.name}`, () => {
    const store = createEmptyBudgetStore();
    assert.throws(() => store.saveBudget('owner', budgetWithEvents(invalid.events())), assertConflict);
    assert.deepEqual(store.loadBudget('owner', 'budget')?.events, [], 'the rejected state must not be stored');
  });
}

test('in-memory whole-state writes reject a chain instead of folding it', () => {
  const events: FinancialEvent[] = [{ id: 'original', kind: 'INCOME', amountMinor: 10 }, { id: 'replacement', kind: 'INCOME', amountMinor: 15, supersedesEventId: 'original' }];
  const state = budgetWithEvents(events);
  assert.throws(() => createBudgetStore().createBudget('owner', state), assertConflict);
  assert.throws(() => createEmptyBudgetStore().saveBudget('owner', state), assertConflict);
});

test('in-memory whole-state writes accept properly paired transfer effects', () => {
  const events = [transferEffect('valid-out', 'TRANSFER_OUT', 'valid-transfer'), transferEffect('valid-in', 'TRANSFER_IN', 'valid-transfer')];
  const transfers = [{ id: 'valid-transfer', sourceAccountId: 'source', destinationAccountId: 'destination', amountMinor: 25, businessDate: '2026-09-01', month: '2026-09', createdAt: '2026-09-01T00:00:00.000Z' }];
  const created = createBudgetStore().createBudget('owner', budgetWithEvents(events, transfers)); assert.equal(created.events.length, 2);

  const store = createEmptyBudgetStore();
  const saved = store.saveBudget('owner', budgetWithEvents(events, transfers)); assert.equal(saved.events.length, 2);
});
const appendEvent = (store: InMemoryBudgetStore, event: FinancialEvent) => store.executeFinancial({ ownerId: 'owner', budgetId: 'budget', command: 'fixture', input: event, idempotencyKey: event.id, work: (_state: unknown, events: FinancialEvent[]) => { events.push(event); return {}; } });

test('in-memory budget store includes cleared persisted effects in the cleared balance', () => {
  const store = new InMemoryBudgetStore();
  store.createUser({ id: 'owner', email: 'owner@example.test', passwordHash: 'unused' });
  store.createBudget('owner', {
    id: 'budget', setupStep: 'COMPLETE', timezone: 'UTC', version: 0,
    account: { id: 'cash', name: 'Cash', kind: 'CASH', archived: false, openingBalanceMinor: 1000 },
    accounts: [{ id: 'cash', name: 'Cash', kind: 'CASH', archived: false, openingBalanceMinor: 1000 }],
    categories: [],
    events: [{ id: 'income', kind: 'INCOME', accountId: 'cash', amountMinor: 100, status: 'POSTED', cleared: true, reconciled: false }],
  });

  const budget = store.loadBudget('owner', 'budget');
  assert.equal(budget?.accounts?.[0].clearedBalanceMinor, 1100);
});

test('cleared-state invariant accepts every valid and rejects every invalid combination', () => {
  const valid = [{ cleared: false, reconciled: false }, { cleared: true, reconciled: false }, { cleared: true, reconciled: true }, { status: 'POSTED', cleared: false, reconciled: false }, { status: 'POSTED', cleared: true, reconciled: false }, { status: 'POSTED', cleared: true, reconciled: true }, { status: 'WORKING', cleared: false, reconciled: false }] as const;
  const invalid = [{ cleared: false, reconciled: true }, { status: 'POSTED', cleared: false, reconciled: true }, { status: 'WORKING', cleared: false, reconciled: true }, { status: 'WORKING', cleared: true, reconciled: false }, { status: 'WORKING', cleared: true, reconciled: true }] as const;
  for (const event of valid) assert.equal(clearedStateViolation(event), null, JSON.stringify(event));
  for (const event of invalid) assert.notEqual(clearedStateViolation(event), null, JSON.stringify(event));
});

test('in-memory persistence rejects cleared-state invariant violations with CONFLICT', async () => {
  const invalid = [{ id: 'working-cleared', kind: 'INCOME', amountMinor: 10, status: 'WORKING', cleared: true }, { id: 'reconciled-uncleared', kind: 'INCOME', amountMinor: 10, reconciled: true, cleared: false }, { id: 'working-reconciled', kind: 'INCOME', amountMinor: 10, status: 'WORKING', reconciled: true, cleared: true }] satisfies FinancialEvent[];
  await Promise.all(invalid.map(async event => { const store = createEmptyBudgetStore(); await assert.rejects(() => appendEvent(store, event), (error: unknown) => error instanceof PersistenceError && error.code === 'CONFLICT'); }));
});

test('in-memory persistence stores a valid uncleared WORKING event', async () => {
  const store = createEmptyBudgetStore();
  const event: FinancialEvent = { id: 'working-uncleared', kind: 'INCOME', amountMinor: 10, status: 'WORKING', cleared: false };
  await appendEvent(store, event);
  assert.equal(isFinancialEventCleared((await store.loadFinancial('owner', 'budget')).events[0]), false);
});

const editWithReplacement = (store: InMemoryBudgetStore, originalId: string, replacement: FinancialEvent, key: string) => store.executeFinancial({
  ownerId: 'owner', budgetId: 'budget', command: 'transaction-edit', input: replacement, idempotencyKey: key,
  work: (_state: unknown, events: FinancialEvent[], _version: number, append: (event: FinancialEvent) => void = () => {}) => {
    const index = events.findIndex(event => event.id === originalId);
    events.splice(index, 1, replacement);
    append(replacement);
    return {};
  },
});

test('in-memory persistence rejects an invalid same-length replacement through the edit path', async () => {
  const store = createEmptyBudgetStore();
  const original: FinancialEvent = { id: 't1', transactionId: 't1', kind: 'INCOME', accountId: 'cash', amountMinor: 100, status: 'POSTED', cleared: false, reconciled: false };
  await appendEvent(store, original);
  const invalid: FinancialEvent = { ...original, id: 't1b', status: 'WORKING', cleared: true, supersedesEventId: 't1' };
  await assert.rejects(
    () => editWithReplacement(store, 't1', invalid, 'edit-invalid'),
    (error: unknown) => error instanceof PersistenceError && error.code === 'CONFLICT',
  );
  const state = await store.loadFinancial('owner', 'budget');
  assert.equal((state.events as FinancialEvent[])[0].cleared, false, 'the rejected replacement must not be stored');
});

test('in-memory persistence accepts a valid same-length replacement once', async () => {
  const store = createEmptyBudgetStore();
  const original: FinancialEvent = { id: 't1', transactionId: 't1', kind: 'INCOME', accountId: 'cash', amountMinor: 100, status: 'POSTED', cleared: true, reconciled: false };
  await appendEvent(store, original);
  const valid: FinancialEvent = { ...original, id: 't1b', amountMinor: 150, supersedesEventId: 't1' };
  await editWithReplacement(store, 't1', valid, 'edit-valid');
  const state = await store.loadFinancial('owner', 'budget');
  const events = state.events as FinancialEvent[];
  assert.equal(events.length, 1, 'the superseded event must not survive in the in-memory event set');
  assert.equal(events[0].id, 't1b');
  assert.equal(state.accounts?.[0]?.balanceMinor, 150);
  assert.equal(state.accounts?.[0]?.clearedBalanceMinor, 150);
});

test('cleared projection is financially neutral and shares the report revision', () => {
  const state: FinancialState = {
    id: 'budget', setupStep: 'COMPLETE', timezone: 'UTC', version: 7,
    account: { id: 'cash', name: 'Cash', openingBalanceMinor: 1000 },
    accounts: [{ id: 'cash', name: 'Cash', kind: 'CASH', archived: false, openingBalanceMinor: 1000 }],
    categories: [],
    events: [{ id: 'income', kind: 'INCOME', accountId: 'cash', amountMinor: 500, month: '2026-09', status: 'POSTED', cleared: false, reconciled: false }],
  };
  const reports = new ReportService();
  const uncleared = reports.read(state, '2026-09');
  const cleared = reports.read(state, '2026-09', state.events.map(event => ({ ...event, cleared: true })));
  const projectAccount = (events: FinancialEvent[]) => {
    const store = new InMemoryBudgetStore();
    store.createUser({ id: 'owner', email: 'owner@example.test', passwordHash: 'unused' });
    store.createBudget('owner', { ...state, events });
    return store.loadBudget('owner', state.id)!.accounts![0];
  };
  const unclearedAccount = projectAccount(state.events);
  const clearedAccount = projectAccount(state.events.map(event => ({ ...event, cleared: true })));
  assert.equal(uncleared.version, 7);
  assert.equal(cleared.version, 7);
  assert.equal(unclearedAccount.clearedBalanceMinor, 1000);
  assert.equal(clearedAccount.clearedBalanceMinor, 1500);
  assert.equal(unclearedAccount.balanceMinor, 1500);
  assert.equal(clearedAccount.balanceMinor, 1500);
  assert.equal(uncleared.accountBalanceMinor, 1500);
  assert.equal(cleared.accountBalanceMinor, 1500);
  assert.equal(Object.hasOwn(uncleared.accounts[0], 'clearedBalanceMinor'), false);
  assert.equal(Object.hasOwn(cleared.accounts[0], 'clearedBalanceMinor'), false);
  assert.ok(Object.keys(uncleared.accounts[0]).every(key => !/cleared|reconciliation/i.test(key)));
  assert.ok(Object.keys(cleared.accounts[0]).every(key => !/cleared|reconciliation/i.test(key)));
  assert.deepEqual(cleared.rta, uncleared.rta);
});
