import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { BudgetApp } from '../src/app.ts';
import { BudgetStoreError } from '../src/persistence/budget-store.ts';
import { InMemoryBudgetStore, InMemoryFinancialStore } from '../src/persistence/in-memory-budget-store.ts';
import { FinancialStore, PersistenceError, type FinancialState, type ScheduleState } from '../src/persistence/financial-store.ts';
import { PrismaBudgetStore } from '../src/persistence/budget-store.ts';

const postgresEnabled = Boolean(process.env.DATABASE_URL);

const makeSchedule = (budgetId: string, accountId: string, categoryId: string | null, overrides: Partial<ScheduleState> = {}): ScheduleState => ({
  id: randomUUID(),
  budgetId,
  accountId,
  categoryId,
  flow: categoryId === null ? 'INCOME' : 'SPENDING',
  amountMinor: 2450,
  payee: categoryId === null ? null : 'Market',
  memo: categoryId === null ? null : 'Monthly supplies',
  dayOfMonth: 31,
  intervalMonths: 2,
  startDate: '2026-01-31',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
  ...overrides,
});

const writeSchedule = (store: any, ownerId: string, budgetId: string, schedule: ScheduleState, idempotencyKey: string) => store.execute({
  ownerId,
  budgetId,
  command: 'schedule-upsert',
  input: { schedule },
  idempotencyKey,
  persistSchedule: schedule,
  work: () => ({ scheduleId: schedule.id }),
});

const deleteSchedule = (store: any, ownerId: string, budgetId: string, scheduleId: string, idempotencyKey: string) => store.execute({
  ownerId,
  budgetId,
  command: 'schedule-delete',
  input: { scheduleId },
  idempotencyKey,
  deleteScheduleId: scheduleId,
  work: () => ({ scheduleId }),
});

const sortedSchedules = (schedules: ScheduleState[] | undefined) => [...(schedules ?? [])].sort((left, right) => left.id.localeCompare(right.id));
const financialValues = (state: FinancialState) => ({
  events: state.events,
  account: state.account,
  accounts: state.accounts,
  categories: state.categories,
  targets: state.targets,
  transfers: state.transfers,
  reconciliations: state.reconciliations,
});

async function exerciseScheduleCrud(store: any, ownerId: string, budgetId: string, accountId: string, categoryId: string) {
  const before = await store.load(ownerId, budgetId);
  assert.equal(before.targets?.length, 1);
  assert.equal(before.transfers?.length, 1);
  assert.equal(before.reconciliations?.length, 1);
  const assertFinancialValuesPreserved = async () => {
    const state = await store.load(ownerId, budgetId);
    assert.deepEqual(financialValues(state), financialValues(before));
    return state;
  };
  const schedule = makeSchedule(budgetId, accountId, categoryId);
  const otherSchedule = makeSchedule(budgetId, accountId, null, { dayOfMonth: 15, intervalMonths: 12, startDate: '2026-02-15' });
  await writeSchedule(store, ownerId, budgetId, schedule, 'schedule-create-one');
  const afterFirstCreate = await assertFinancialValuesPreserved();
  assert.deepEqual(afterFirstCreate.schedules, [schedule]);

  await writeSchedule(store, ownerId, budgetId, otherSchedule, 'schedule-create-two');
  const afterSecondCreate = await assertFinancialValuesPreserved();
  assert.deepEqual(sortedSchedules(afterSecondCreate.schedules), sortedSchedules([schedule, otherSchedule]));

  const updated = { ...schedule, memo: 'Updated schedule memo', updatedAt: '2026-01-03T00:00:00.000Z' };
  await writeSchedule(store, ownerId, budgetId, updated, 'schedule-update-one');
  const reloaded = await assertFinancialValuesPreserved();
  assert.deepEqual(sortedSchedules(reloaded.schedules), sortedSchedules([updated, otherSchedule]));
  assert.deepEqual(reloaded.schedules?.find((candidate: ScheduleState) => candidate.id === updated.id), updated);
  assert.deepEqual(reloaded.schedules?.find((candidate: ScheduleState) => candidate.id === otherSchedule.id), otherSchedule);

  await deleteSchedule(store, ownerId, budgetId, updated.id, 'schedule-delete-one');
  const afterDelete = await assertFinancialValuesPreserved();
  assert.deepEqual(afterDelete.schedules, [otherSchedule]);

  await deleteSchedule(store, ownerId, budgetId, otherSchedule.id, 'schedule-delete-last');
  const afterLastDelete = await assertFinancialValuesPreserved();
  assert.deepEqual(afterLastDelete.schedules, []);
  return { before, afterDelete, afterLastDelete };
}

function createInMemoryFixture() {
  const ownerId = randomUUID();
  const budgetId = randomUUID();
  const accountId = randomUUID();
  const destinationAccountId = randomUUID();
  const categoryId = randomUUID();
  const transferId = randomUUID();
  const transferCreatedAt = '2026-01-06T00:00:00.000Z';
  const budgetStore = new InMemoryBudgetStore();
  budgetStore.createUser({ id: ownerId, email: `${ownerId}@example.test`, passwordHash: 'test-hash' });
  budgetStore.createBudget(ownerId, {
    id: budgetId,
    setupStep: 'COMPLETE',
    timezone: 'UTC',
    version: 0,
    account: { id: accountId, name: 'Checking', kind: 'CHECKING', archived: false, createdAt: '2026-01-01T00:00:00.000Z', openingBalanceMinor: 10000 },
    accounts: [
      { id: accountId, name: 'Checking', kind: 'CHECKING', archived: false, createdAt: '2026-01-01T00:00:00.000Z', openingBalanceMinor: 10000 },
      { id: destinationAccountId, name: 'Savings', kind: 'CHECKING', archived: false, createdAt: '2026-01-02T00:00:00.000Z', openingBalanceMinor: 5000 },
    ],
    categories: [{ id: categoryId, name: 'Food', archived: false }],
    targets: [{ categoryId, kind: 'MONTHLY_SET_ASIDE', amountMinor: 1200 }],
    events: [
      { id: randomUUID(), kind: 'INCOME', amountMinor: 750, accountId, transactionId: randomUUID(), businessDate: '2026-01-05', status: 'POSTED', cleared: false, reconciled: false },
      { id: randomUUID(), kind: 'TRANSFER_OUT', amountMinor: 250, accountId, transferId, businessDate: '2026-01-06', month: '2026-01', createdAt: transferCreatedAt, status: 'POSTED', cleared: false, reconciled: false },
      { id: randomUUID(), kind: 'TRANSFER_IN', amountMinor: 250, accountId: destinationAccountId, transferId, businessDate: '2026-01-06', month: '2026-01', createdAt: transferCreatedAt, status: 'POSTED', cleared: false, reconciled: false },
    ],
    transfers: [{ id: transferId, sourceAccountId: accountId, destinationAccountId, amountMinor: 250, businessDate: '2026-01-06', month: '2026-01', createdAt: transferCreatedAt, payee: 'Fixture transfer', memo: null }],
    reconciliations: [{ id: randomUUID(), accountId, actorId: ownerId, observedClearedBalanceMinor: 10000, confirmedClearedBalanceMinor: 10000, adjustmentMinor: 0, reason: null, month: '2026-01', createdAt: '2026-01-07T00:00:00.000Z', idempotencyKey: 'fixture-reconciliation' }],
  });
  return { ownerId, budgetId, accountId, destinationAccountId, categoryId, budgetStore, financialStore: new InMemoryFinancialStore(budgetStore) };
}

test('the in-memory adapter persists, reloads, updates, and removes schedules without changing financial values', async () => {
  const fixture = createInMemoryFixture();
  const { before, afterDelete, afterLastDelete } = await exerciseScheduleCrud(fixture.financialStore, fixture.ownerId, fixture.budgetId, fixture.accountId, fixture.categoryId);
  assert.equal(afterDelete.version, before.version + 4);
  assert.equal(afterLastDelete.version, before.version + 5);
});

test('the in-memory adapter rejects an invalid schedule through whole-state validation', async () => {
  const fixture = createInMemoryFixture();
  const invalid = makeSchedule(fixture.budgetId, fixture.accountId, fixture.categoryId, { dayOfMonth: 0 });
  await assert.rejects(() => writeSchedule(fixture.financialStore, fixture.ownerId, fixture.budgetId, invalid, 'invalid-schedule'));
  const reloaded = await fixture.financialStore.load(fixture.ownerId, fixture.budgetId);
  assert.deepEqual(reloaded.schedules, []);
  assert.equal(reloaded.version, 0);
});

test('both adapters reject a schedule whose start date disagrees with its declared day', async () => {
  const fixture = createInMemoryFixture();
  const invalid = makeSchedule(fixture.budgetId, fixture.accountId, fixture.categoryId, { startDate: '2026-01-30' });

  await assert.rejects(
    () => writeSchedule(fixture.financialStore, fixture.ownerId, fixture.budgetId, invalid, 'invalid-anchor-memory'),
    (error: unknown) => error instanceof PersistenceError && error.code === 'CONFLICT',
  );
  assert.deepEqual((await fixture.financialStore.load(fixture.ownerId, fixture.budgetId)).schedules, []);

  let upsertCalled = false;
  const tx = {
    budget: {
      findFirst: async () => ({
        id: fixture.budgetId,
        setupStep: 'COMPLETE',
        timezone: 'UTC',
        accounts: [{ id: fixture.accountId, name: 'Checking', kind: 'CHECKING', archived: false, createdAt: new Date('2026-01-01T00:00:00.000Z'), openingBalances: [{ amountMinor: 10000n }] }],
        categories: [{ id: fixture.categoryId, name: 'Food', archived: false }],
      }),
      update: async () => undefined,
    },
    commandReceipt: { findUnique: async () => null, count: async () => 0, findMany: async () => [], create: async () => undefined },
    financialEvent: { findMany: async () => [] },
    transfer: { findMany: async () => [] },
    categoryTarget: { findMany: async () => [] },
    scheduledTransaction: { findMany: async () => [], upsert: async () => { upsertCalled = true; } },
    reconciliation: { findMany: async () => [] },
  };
  const durableStore = new FinancialStore({ $transaction: async (work: (transaction: any) => Promise<unknown>) => work(tx) } as any);
  await assert.rejects(
    () => durableStore.execute({
      ownerId: fixture.ownerId,
      budgetId: fixture.budgetId,
      command: 'schedule-upsert',
      input: { schedule: invalid },
      idempotencyKey: 'invalid-anchor-durable',
      persistSchedule: invalid,
      work: () => ({ scheduleId: invalid.id }),
    }),
    (error: unknown) => error instanceof PersistenceError && error.code === 'CONFLICT',
  );
  assert.equal(upsertCalled, false);
});

test('saveBudget rejects an omitted schedule collection but accepts a loaded state update', async () => {
  const fixture = createInMemoryFixture();
  const schedule = makeSchedule(fixture.budgetId, fixture.accountId, fixture.categoryId);
  await writeSchedule(fixture.financialStore, fixture.ownerId, fixture.budgetId, schedule, 'save-budget-schedule');

  const loaded = fixture.budgetStore.loadBudget(fixture.ownerId, fixture.budgetId);
  assert.ok(loaded);
  const omittedSchedules = { ...loaded };
  delete omittedSchedules.schedules;
  assert.throws(
    () => fixture.budgetStore.saveBudget(fixture.ownerId, omittedSchedules),
    (error: unknown) => error instanceof BudgetStoreError && error.code === 'CONFLICT' && /schedule/i.test(error.message),
  );
  assert.deepEqual(fixture.budgetStore.loadBudget(fixture.ownerId, fixture.budgetId)?.schedules, [schedule]);

  const normalUpdate = fixture.budgetStore.loadBudget(fixture.ownerId, fixture.budgetId);
  assert.ok(normalUpdate);
  normalUpdate.version += 1;
  fixture.budgetStore.saveBudget(fixture.ownerId, normalUpdate);
  assert.deepEqual(fixture.budgetStore.loadBudget(fixture.ownerId, fixture.budgetId)?.schedules, [schedule]);
});

test('PostgreSQL FinancialStore persists, reloads, updates, and deletes schedules without financial side effects', { skip: !postgresEnabled }, async () => {
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  const financialStore = new FinancialStore(prisma);
  const email = `scheduled-persistence-${randomUUID()}@example.test`;
  let userId = '';
  let budgetId = '';
  const cleanup = async () => {
    if (budgetId) {
      await prisma.scheduledTransaction.deleteMany({ where: { budgetId } });
      await prisma.commandReceipt.deleteMany({ where: { budgetId } });
      await prisma.financialEvent.deleteMany({ where: { budgetId } });
      await prisma.transfer.deleteMany({ where: { budgetId } });
      await prisma.reconciliation.deleteMany({ where: { budgetId } });
      await prisma.categoryTarget.deleteMany({ where: { budgetId } });
      await prisma.transactionDeletionAudit.deleteMany({ where: { budgetId } });
      const accounts = await prisma.account.findMany({ where: { budgetId }, select: { id: true } });
      await prisma.openingBalance.deleteMany({ where: { accountId: { in: accounts.map(account => account.id) } } });
      await prisma.category.deleteMany({ where: { budgetId } });
      await prisma.account.deleteMany({ where: { budgetId } });
      await prisma.budget.delete({ where: { id: budgetId } });
    }
    if (userId) {
      await prisma.session.deleteMany({ where: { userId } });
      await prisma.user.delete({ where: { id: userId } });
    }
    await prisma.$disconnect();
  };

  try {
    const app = new BudgetApp(Date.now, new PrismaBudgetStore(prisma), financialStore);
    const registered = (await app.register(email, 'correct horse')) as { data: { id: string } };
    userId = registered.data.id;
    const signedIn = (await app.signIn(email, 'correct horse')) as { data: { sessionToken: string } };
    const token = signedIn.data.sessionToken;
    const createdBudget = (await app.createBudget(token)) as { data: { id: string } };
    budgetId = createdBudget.data.id;
    const setupResult = (await app.saveSetup(token, budgetId, { openingBalanceMinor: 10000, categories: ['Food'] })) as {
      data: { account: { id: string } | null; categories: { id: string }[] };
    };
    const setup = setupResult.data;
    const anchorCases = [
      { startDate: '2026-01-31', dayOfMonth: 31 },
      { startDate: '2026-02-28', dayOfMonth: 31 },
      { startDate: '2024-02-29', dayOfMonth: 31 },
      { startDate: '2026-04-30', dayOfMonth: 30 },
    ];
    const validAnchorRows = anchorCases.map(item => ({ ...item, id: randomUUID() }));
    const invalidAnchorId = randomUUID();
    const anchorIds = [...validAnchorRows.map(item => item.id), invalidAnchorId];
    const anchorRow = (id: string, startDate: string, dayOfMonth: number) => ({
      id,
      budgetId,
      accountId: setup.account!.id,
      categoryId: null,
      flow: 'INCOME' as const,
      amountMinor: 100n,
      payee: null,
      memo: null,
      dayOfMonth,
      intervalMonths: 1,
      startDate: new Date(`${startDate}T00:00:00.000Z`),
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    try {
      for (const { id, startDate, dayOfMonth } of validAnchorRows) {
        await prisma.scheduledTransaction.create({ data: anchorRow(id, startDate, dayOfMonth) });
      }
      await assert.rejects(() => prisma.scheduledTransaction.create({
        data: anchorRow(invalidAnchorId, '2026-01-30', 31),
      }));
    } finally {
      await prisma.scheduledTransaction.deleteMany({ where: { id: { in: anchorIds } } });
    }

    const beforeCreateAccount = await financialStore.load(userId, budgetId);
    const createdAccount = (await app.createAccount(token, budgetId, { name: 'Savings', kind: 'checking', openingBalanceMinor: 5000 }, undefined, { idempotencyKey: 'scheduled-persistence-account', expectedVersion: beforeCreateAccount.version })) as { data: { account: { id: string } } };
    const beforeTarget = await financialStore.load(userId, budgetId);
    await app.setCategoryTarget(token, budgetId, setup.categories[0].id, { kind: 'MONTHLY_SET_ASIDE', amountMinor: 1200 }, undefined, { idempotencyKey: 'scheduled-persistence-target', expectedVersion: beforeTarget.version });
    await app.recordTransfer(token, budgetId, {
      sourceAccountId: setup.account!.id,
      destinationAccountId: createdAccount.data.account.id,
      amountMinor: 250,
      date: '2026-01-06',
    }, undefined, { idempotencyKey: 'scheduled-persistence-transfer' });
    await app.recordIncome(token, budgetId, { amountMinor: 750, date: '2026-01-05' }, undefined, { idempotencyKey: 'scheduled-persistence-income' });
    const beforeReconciliation = await financialStore.load(userId, budgetId);
    const sourceAccount = beforeReconciliation.accounts?.find(account => account.id === setup.account!.id);
    assert.ok(sourceAccount);
    await app.reconcileAccount(token, budgetId, setup.account!.id, {
      confirmedClearedBalanceMinor: sourceAccount.clearedBalanceMinor ?? sourceAccount.openingBalanceMinor,
      date: '2026-01-08',
    }, undefined, { idempotencyKey: 'scheduled-persistence-reconciliation', expectedVersion: beforeReconciliation.version });
    const baseline = await financialStore.load(userId, budgetId);
    const eventRowsBefore = await prisma.financialEvent.findMany({ where: { budgetId }, orderBy: { id: 'asc' } });
    const receiptRowsBefore = await prisma.commandReceipt.findMany({ where: { budgetId }, orderBy: { id: 'asc' } });
    const accountCountBefore = await prisma.account.count({ where: { budgetId } });
    const receiptCountBefore = receiptRowsBefore.length;

    const { before, afterDelete, afterLastDelete } = await exerciseScheduleCrud(financialStore, userId, budgetId, setup.account!.id, setup.categories[0].id);
    assert.deepEqual(financialValues(before), financialValues(baseline));
    assert.equal(afterDelete.version, baseline.version + 4);
    assert.equal(afterLastDelete.version, baseline.version + 5);
    assert.deepEqual(await prisma.financialEvent.findMany({ where: { budgetId }, orderBy: { id: 'asc' } }), eventRowsBefore);
    const receiptRowsAfter = await prisma.commandReceipt.findMany({ where: { budgetId }, orderBy: { id: 'asc' } });
    assert.equal(receiptRowsAfter.length, receiptCountBefore + 5);
    assert.deepEqual(receiptRowsAfter.filter(row => receiptRowsBefore.some(original => original.id === row.id)), receiptRowsBefore);
    assert.equal(await prisma.account.count({ where: { budgetId } }), accountCountBefore);
    assert.deepEqual(financialValues(afterDelete), financialValues(baseline));
    assert.deepEqual(afterLastDelete.schedules, []);
    assert.deepEqual(financialValues(afterLastDelete), financialValues(baseline));
  } finally {
    await cleanup();
  }
});
