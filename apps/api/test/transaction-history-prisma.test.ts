import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { BudgetApp } from '../src/app.ts';
import { FinancialStore, mapFinancialEventRow, mapTransferRow } from '../src/persistence/financial-store.ts';
import { PrismaBudgetStore } from '../src/persistence/budget-store.ts';
import { InMemoryBudgetStore } from '../src/persistence/in-memory-budget-store.ts';

const prisma = process.env.DATABASE_URL ? new (await import('@prisma/client')).PrismaClient() : null;

test('persistence maps nullable metadata for legacy and current rows', () => {
  const event = mapFinancialEventRow({
    id: randomUUID(), kind: 'INCOME', amountMinor: 7n, payee: 'Acme', memo: null,
    businessDate: new Date('2026-02-01T00:00:00Z'), createdAt: new Date('2026-02-01T01:00:00Z'), reconciled: false,
  });
  const legacy = mapFinancialEventRow({ id: randomUUID(), kind: 'SPENDING', amountMinor: 3n, createdAt: new Date('2026-02-02T01:00:00Z'), reconciled: false });
  const transfer = mapTransferRow({
    id: randomUUID(), sourceAccountId: randomUUID(), destinationAccountId: randomUUID(), amountMinor: 10n,
    businessDate: new Date('2026-02-03T00:00:00Z'), month: '2026-02', payee: 'Move', memo: null,
    createdAt: new Date('2026-02-03T01:00:00Z'),
  });
  assert.equal(event.payee, 'Acme');
  assert.equal(event.memo, null);
  assert.equal(legacy.payee, null);
  assert.equal(legacy.memo, null);
  assert.equal(transfer.payee, 'Move');
  assert.equal(transfer.memo, null);
});

test('financial state rows including targets share one repeatable-read snapshot', async () => {
  const snapshotEvent = { id: 'snapshot-event', transactionId: 'snapshot-event', kind: 'INCOME', amountMinor: 7, accountId: 'account-1', businessDate: new Date('2026-02-01T00:00:00Z'), month: '2026-02', createdAt: new Date('2026-02-01T01:00:00Z'), reconciled: false };
  const calls: string[] = [];
  const tx = {
    budget: { findFirst: async () => { calls.push('budget'); return { id: 'budget-1', setupStep: 'COMPLETE', timezone: 'UTC', accounts: [{ id: 'account-1', name: 'Cash', kind: 'CASH', archived: false, createdAt: new Date('2026-01-01T00:00:00Z'), openingBalances: [{ amountMinor: 0n }] }], categories: [] }; } },
    commandReceipt: {
      count: async () => { calls.push('version'); return 7; },
      findMany: async () => { calls.push('receipts'); return []; },
    },
    financialEvent: { findMany: async () => { calls.push('events'); return [snapshotEvent]; } },
    transfer: { findMany: async () => { calls.push('transfers'); return []; } },
    categoryTarget: { findMany: async () => { calls.push('targets'); return []; } },
    reconciliation: { findMany: async () => { calls.push('reconciliations'); return []; } },
  };
  const client = { $transaction: async (work: (tx: any) => Promise<unknown>, options: any) => {
    assert.equal(options.isolationLevel, 'RepeatableRead');
    return work(tx);
  } };
  const state = await new FinancialStore(client as any).load('owner-1', 'budget-1');
  assert.deepEqual(calls, ['budget', 'version', 'events', 'transfers', 'targets', 'reconciliations', 'receipts']);
  assert.equal(state.version, 7);
  assert.equal(state.events[0].transactionId, 'snapshot-event');
});

test('persistence mapping preserves replacement and tombstone metadata rows for rebuild', () => {
  const originalId = randomUUID();
  const replacement = mapFinancialEventRow({ id: randomUUID(), transactionId: originalId, kind: 'SPENDING', amountMinor: 9n, payee: null, memo: 'updated', supersedesEventId: originalId, createdAt: new Date('2026-02-02T01:00:00Z'), reconciled: false });
  const tombstone = mapFinancialEventRow({ id: randomUUID(), transactionId: originalId, kind: 'TRANSACTION_DELETE', amountMinor: 0n, payee: null, memo: null, supersedesEventId: replacement.id, createdAt: new Date('2026-02-03T01:00:00Z'), reconciled: false });
  assert.equal(replacement.memo, 'updated');
  assert.equal(replacement.supersedesEventId, originalId);
  assert.equal(tombstone.memo, null);
  assert.equal(tombstone.supersedesEventId, replacement.id);
});
const options = (idempotencyKey: string, expectedVersion?: number) => ({ idempotencyKey, expectedVersion });
const createPrismaApp = () => {
  let now = Date.parse('2026-09-01T00:00:00.000Z');
  const budgetStore = new PrismaBudgetStore(prisma!);
  const financialStore = new FinancialStore(prisma!);
  return { app: new BudgetApp(() => now++, budgetStore, financialStore), budgetStore, financialStore };
};
const createMemoryApp = () => {
  let now = Date.parse('2026-09-01T00:00:00.000Z');
  const budgetStore = new InMemoryBudgetStore();
  return { app: new BudgetApp(() => now++, budgetStore), budgetStore };
};
const createFixture = async (app: BudgetApp, email: string) => {
  await app.register(email, 'correct horse');
  const token = (await app.signIn(email, 'correct horse')).data.sessionToken;
  const budget = (await app.createBudget(token)).data;
  const setup = (await app.saveSetup(token, budget.id, { openingBalanceMinor: 1000, categories: ['Food', 'Housing'] })).data;
  const owner = await app.authenticate(token);
  return { token, budgetId: budget.id, ownerId: owner.id, accountId: setup.account!.id, categoryIds: setup.categories.map((category: any) => category.id) };
};
const seedHistory = async (app: BudgetApp, fixture: Awaited<ReturnType<typeof createFixture>>, prefix: string) => {
  const income = (await app.recordIncome(fixture.token, fixture.budgetId, { amountMinor: 50, date: '2026-09-01' }, undefined, options(`${prefix}-income`))).data;
  const spending = (await app.recordSpending(fixture.token, fixture.budgetId, { amountMinor: 100, categoryId: fixture.categoryIds[0], date: '2026-09-02' }, undefined, options(`${prefix}-spending`))).data;
  return { income, spending };
};
const markPrismaEventCleared = (eventId: string) => prisma!.financialEvent.update({ where: { id: eventId }, data: { cleared: true } });
const markMemoryEventCleared = (store: InMemoryBudgetStore, fixture: Awaited<ReturnType<typeof createFixture>>, eventId: string) => {
  const state = store.loadBudget(fixture.ownerId, fixture.budgetId);
  assert.ok(state);
  store.saveBudget(fixture.ownerId, { ...state, events: state.events.map(event => event.id === eventId ? { ...event, cleared: true } : event) });
};
const readAccountBalances = async (app: BudgetApp, fixture: Awaited<ReturnType<typeof createFixture>>) => {
  const budget = (await app.getBudget(fixture.token, fixture.budgetId)).data;
  const account = budget.accounts.find((candidate: any) => candidate.id === fixture.accountId);
  assert.ok(account);
  return { working: account.balanceMinor, cleared: account.clearedBalanceMinor };
};
const cleanup = async (email: string) => {
  const user = await prisma!.user.findUnique({ where: { email }, include: { budget: true } });
  if (user?.budget) {
    await prisma.transactionDeletionAudit.deleteMany({ where: { budgetId: user.budget.id } });
    await prisma!.commandReceipt.deleteMany({ where: { budgetId: user.budget.id } });
    await prisma!.financialEvent.deleteMany({ where: { budgetId: user.budget.id } });
    await prisma!.transfer.deleteMany({ where: { budgetId: user.budget.id } });
    await prisma!.category.deleteMany({ where: { budgetId: user.budget.id } });
    const accounts = await prisma!.account.findMany({ where: { budgetId: user.budget.id }, select: { id: true } });
    await prisma!.openingBalance.deleteMany({ where: { accountId: { in: accounts.map(account => account.id) } } });
    await prisma!.account.deleteMany({ where: { budgetId: user.budget.id } });
    await prisma!.budget.delete({ where: { id: user.budget.id } });
  }
  if (user) await prisma!.user.delete({ where: { id: user.id } });
};
test('transaction history persistence exposes additive identity, metadata, tombstone, and audit schema', { skip: !process.env.DATABASE_URL }, async () => {
  const columns = await prisma!.$queryRaw<{ column_name: string }[]>`SELECT column_name FROM information_schema.columns WHERE table_name = 'FinancialEvent' AND column_name IN ('transactionId', 'businessDate', 'status', 'reconciled', 'supersedesEventId', 'payee', 'memo')`;
  assert.deepEqual(columns.map(column => column.column_name).sort(), ['businessDate', 'memo', 'payee', 'reconciled', 'status', 'supersedesEventId', 'transactionId']);
  const transferColumns = await prisma!.$queryRaw<{ column_name: string }[]>`SELECT column_name FROM information_schema.columns WHERE table_name = 'Transfer' AND column_name IN ('payee', 'memo')`;
  assert.deepEqual(transferColumns.map(column => column.column_name).sort(), ['memo', 'payee']);
  const audit = await prisma!.$queryRaw<{ to_regclass: string | null }[]>`SELECT to_regclass('"TransactionDeletionAudit"')::text`;
  assert.equal(audit[0].to_regclass, '"TransactionDeletionAudit"');
});

test('PostgreSQL folds two replacements before deleting a transaction', { skip: !process.env.DATABASE_URL }, async () => {
  const store = new FinancialStore(prisma!);
  let now = Date.parse('2026-02-01T00:00:00.000Z');
  const app = new BudgetApp(() => now++, new PrismaBudgetStore(prisma!), store);
  const email = `${randomUUID()}@example.test`;
  try {
    const owner = (await app.register(email, 'correct horse')).data;
    const token = (await app.signIn(email, 'correct horse')).data.sessionToken;
    const budget = (await app.createBudget(token)).data;
    const complete = (await app.saveSetup(token, budget.id, { openingBalanceMinor: 1000, categories: ['Food'] })).data;
    const categoryId = complete.categories[0].id;
    const original = (await app.recordSpending(token, budget.id, { amountMinor: 100, categoryId, date: '2026-02-01' }, undefined, options('chain-seed'))).data;
    await app.editTransaction(token, budget.id, original.id, { amountMinor: 120, date: '2026-02-02' }, undefined, options('chain-edit-1', 1));
    await app.editTransaction(token, budget.id, original.id, { amountMinor: 80, date: '2026-02-03' }, undefined, options('chain-edit-2', 2));
    await app.deleteTransaction(token, budget.id, original.id, { confirmed: true }, undefined, options('chain-delete', 3));

    const listed = (await app.listTransactions(token, budget.id)).data;
    const summary = (await app.getFinancialSummary(token, budget.id, '2026-02')).data;
    const rows = await prisma!.financialEvent.findMany({ where: { budgetId: budget.id, transactionId: original.id }, orderBy: { createdAt: 'asc' } });
    assert.equal(listed.items.length, 0);
    assert.equal(summary.accountBalanceMinor, 1000);
    assert.equal(rows.length, 4);
    assert.equal(new Set(rows.slice(0, 3).map(row => row.createdAt.getTime())).size, 3);
    const audit = await prisma!.transactionDeletionAudit.findFirst({ where: { budgetId: budget.id, transactionId: original.id } });
    assert.equal(audit?.actorId, owner.id);
    assert.equal(audit?.transactionId, original.id);
  } finally {
    await cleanup(email);
  }
});

test('PostgreSQL persists a replacement chain for both effects of a cleared transfer', { skip: !process.env.DATABASE_URL }, async () => {
  const { app, financialStore } = createPrismaApp();
  const email = `${randomUUID()}@example.test`;
  try {
    await app.register(email, 'correct horse');
    const token = (await app.signIn(email, 'correct horse')).data.sessionToken;
    const budget = (await app.createBudget(token)).data;
    const ready = (await app.saveSetup(token, budget.id, { openingBalanceMinor: 1000, categories: ['Food'] })).data;
    const destination = (await app.createAccount(token, budget.id, { name: 'Transfer destination', kind: 'checking' }, undefined, options('transfer-chain-account', 0))).data.account;
    const transfer = (await app.recordTransfer(token, budget.id, { sourceAccountId: ready.account!.id, destinationAccountId: destination.id, amountMinor: 125, date: '2026-02-12' }, undefined, options('transfer-chain-seed', 1))).data;
    const owner = await app.authenticate(token);
    const before = await financialStore.load(owner.id, budget.id);
    await financialStore.execute({
      ownerId: owner.id, budgetId: budget.id, command: 'transfer-cleared-test', input: { transferId: transfer.transferId, cleared: true },
      idempotencyKey: 'transfer-chain-clear', expectedVersion: before.version,
      work: (state: any, events: any[], _version: number, append: (event: any) => void) => {
        const pair = (state.rawEvents ?? events).filter((event: any) => event.transferId === transfer.transferId);
        assert.deepEqual(pair.map((event: any) => event.kind).sort(), ['TRANSFER_IN', 'TRANSFER_OUT']);
        for (const current of pair) {
          const replacement = { ...current, id: randomUUID(), cleared: true, supersedesEventId: current.id, createdAt: new Date().toISOString() };
          const index = events.findIndex((event: any) => event.id === current.id);
          if (index < 0) events.push(replacement); else events.splice(index, 1, replacement);
          append(replacement);
        }
        return { transferId: transfer.transferId };
      },
    });
    const after = await financialStore.load(owner.id, budget.id);
    assert.deepEqual(after.events.filter(event => event.transferId === transfer.transferId).map(event => event.kind).sort(), ['TRANSFER_IN', 'TRANSFER_OUT']);
    assert.ok(after.events.filter(event => event.transferId === transfer.transferId).every(event => event.cleared));
  } finally {
    await cleanup(email);
  }
});

test('PostgreSQL metadata survives replacement rebuild, transfer restart, rollback, and same-key retry', { skip: !process.env.DATABASE_URL }, async () => {
  const { PrismaClient } = await import('@prisma/client');
  const restartPrisma = new PrismaClient();
  const store = new FinancialStore(prisma!);
  const restartedStore = new FinancialStore(restartPrisma);
  const email = `${randomUUID()}@example.test`;
  let budgetId = '';
  const cleanup = async () => {
    if (!budgetId) return;
    await prisma!.financialEvent.deleteMany({ where: { budgetId } });
    await prisma.transfer.deleteMany({ where: { budgetId } });
    await prisma!.commandReceipt.deleteMany({ where: { budgetId } });
    await prisma!.category.deleteMany({ where: { budgetId } });
    const accounts = await prisma!.account.findMany({ where: { budgetId } });
    for (const account of accounts) await prisma!.openingBalance.deleteMany({ where: { accountId: account.id } });
    await prisma!.account.deleteMany({ where: { budgetId } });
    await prisma!.budget.delete({ where: { id: budgetId } });
    await prisma!.user.delete({ where: { email } });
  };
  try {
    const app = new BudgetApp(Date.now, new PrismaBudgetStore(prisma!), store);
    await app.register(email, 'correct horse');
    const token = (await app.signIn(email, 'correct horse')).data.sessionToken;
    const budget = (await app.createBudget(token)).data;
    budgetId = budget.id;
    const ready = (await app.saveSetup(token, budget.id, { openingBalanceMinor: 1000, categories: ['Food'] })).data;
    const destination = (await app.createAccount(token, budget.id, { name: 'Metadata destination', kind: 'checking' }, undefined, { idempotencyKey: 'metadata-account', expectedVersion: 0 })).data.account;
    const spending = (await app.recordSpending(token, budget.id, { amountMinor: 100, categoryId: ready.categories[0].id, date: '2026-02-01' }, undefined, { idempotencyKey: 'metadata-spending', expectedVersion: 1 })).data;
    const owner = await app.authenticate(token);
    await store.execute({ ownerId: owner.id, budgetId, command: 'metadata-replacement', input: { payee: 'Acme', memo: 'Original' }, idempotencyKey: 'metadata-replacement', expectedVersion: 2, work: (state: any, events: any[], _version: number, append: (event: any) => void) => {
      const current = events.find(event => event.transactionId === spending.id)!;
      const replacement = { ...current, id: randomUUID(), supersedesEventId: current.id, payee: 'Acme', memo: 'Original', createdAt: new Date().toISOString() };
      events.splice(events.indexOf(current), 1, replacement);
      append(replacement);
      return { transactionId: spending.id };
    } });
    await store.execute({ ownerId: owner.id, budgetId, command: 'metadata-transfer', input: { payee: 'Move', memo: 'Between accounts' }, idempotencyKey: 'metadata-transfer', expectedVersion: 3, work: (state: any, events: any[]) => {
      const transferId = randomUUID();
      const transfer = { id: transferId, sourceAccountId: ready.account!.id, destinationAccountId: destination.id, amountMinor: 25, businessDate: '2026-02-02', month: '2026-02', createdAt: new Date().toISOString(), payee: 'Move', memo: 'Between accounts' };
      state.transfers.push(transfer);
      events.push(
        { id: randomUUID(), kind: 'TRANSFER_OUT', transferId, accountId: ready.account!.id, amountMinor: 25, businessDate: transfer.businessDate, month: transfer.month },
        { id: randomUUID(), kind: 'TRANSFER_IN', transferId, accountId: destination.id, amountMinor: 25, businessDate: transfer.businessDate, month: transfer.month },
      );
      return { transferId };
    } });
    const loaded = await store.load(owner.id, budgetId);
    const rebuilt = await restartedStore.load(owner.id, budgetId);
    const effective = loaded.events.find(event => event.transactionId === spending.id)!;
    assert.deepEqual({ payee: effective.payee, memo: effective.memo }, { payee: 'Acme', memo: 'Original' });
    assert.deepEqual(loaded.transfers, rebuilt.transfers);
    assert.deepEqual({ payee: rebuilt.transfers![0].payee, memo: rebuilt.transfers![0].memo }, { payee: 'Move', memo: 'Between accounts' });
    const beforeSummary = (await app.getFinancialSummary(token, budget.id, '2026-02')).data;
    const restarted = new BudgetApp(Date.now, new PrismaBudgetStore(restartPrisma), restartedStore);
    const afterSummary = (await restarted.getFinancialSummary(token, budget.id, '2026-02')).data;
    assert.deepEqual(afterSummary, beforeSummary);
    const countsBeforeFailure = { events: await prisma!.financialEvent.count({ where: { budgetId } }), transfers: await prisma.transfer.count({ where: { budgetId } }), receipts: await prisma!.commandReceipt.count({ where: { budgetId } }) };
    await assert.rejects(() => store.execute({ ownerId: owner.id, budgetId, command: 'metadata-rollback', input: { payee: 'ShouldNotPersist' }, idempotencyKey: 'metadata-rollback', expectedVersion: 4, work: (state: any, events: any[]) => {
      const transferId = randomUUID();
      state.transfers.push({ id: transferId, sourceAccountId: ready.account!.id, destinationAccountId: destination.id, amountMinor: 1, businessDate: '2026-02-03', month: '2026-02', createdAt: new Date().toISOString(), payee: 'ShouldNotPersist', memo: 'Rollback' });
      events.push(
        { id: randomUUID(), kind: 'TRANSFER_OUT', transferId, accountId: ready.account!.id, amountMinor: 1, businessDate: '2026-02-03', month: '2026-02' },
        { id: randomUUID(), kind: 'TRANSFER_IN', transferId, accountId: destination.id, amountMinor: 1, businessDate: '2026-02-03', month: '2026-02' },
      );
      return {};
    }, deletionAudit: { actorId: 'not-a-uuid', transactionId: randomUUID() } }));
    assert.deepEqual({ events: await prisma!.financialEvent.count({ where: { budgetId } }), transfers: await prisma.transfer.count({ where: { budgetId } }), receipts: await prisma!.commandReceipt.count({ where: { budgetId } }) }, countsBeforeFailure);
    const retries = await Promise.all([1, 2].map(() => store.execute({ ownerId: owner.id, budgetId, command: 'metadata-concurrent', input: { payee: 'Retry', memo: 'Once' }, idempotencyKey: 'metadata-concurrent', expectedVersion: 4, work: (state: any, events: any[]) => {
      const transferId = randomUUID();
      state.transfers.push({ id: transferId, sourceAccountId: ready.account!.id, destinationAccountId: destination.id, amountMinor: 2, businessDate: '2026-02-04', month: '2026-02', createdAt: new Date().toISOString(), payee: 'Retry', memo: 'Once' });
      events.push(
        { id: randomUUID(), kind: 'TRANSFER_OUT', transferId, accountId: ready.account!.id, amountMinor: 2, businessDate: '2026-02-04', month: '2026-02' },
        { id: randomUUID(), kind: 'TRANSFER_IN', transferId, accountId: destination.id, amountMinor: 2, businessDate: '2026-02-04', month: '2026-02' },
      );
      return { transferId };
    } })));
    assert.equal(retries[0].result.transferId, retries[1].result.transferId);
    assert.equal(await prisma.transfer.count({ where: { budgetId } }), countsBeforeFailure.transfers + 1);
    assert.equal(await prisma.transfer.count({ where: { budgetId, payee: 'Retry', memo: 'Once' } }), 1);
  } finally {
    await cleanup();
    await restartPrisma.$disconnect();
  }
});


test('two PostgreSQL clients serialize concurrent transaction edits and replay one winner safely', { skip: !process.env.DATABASE_URL }, async () => {
  const { PrismaClient } = await import('@prisma/client');
  const firstPrisma = new PrismaClient();
  const secondPrisma = new PrismaClient();
  const email = `tx-concurrency-${randomUUID()}@example.test`;
  try {
    const first = new BudgetApp(Date.now, new PrismaBudgetStore(firstPrisma), new FinancialStore(firstPrisma));
    const second = new BudgetApp(Date.now, new PrismaBudgetStore(secondPrisma), new FinancialStore(secondPrisma));
    const owner = (await first.register(email, 'correct horse')).data;
    const token = (await first.signIn(email, 'correct horse')).data.sessionToken;
    const budget = (await first.createBudget(token)).data;
    const ready = (await first.saveSetup(token, budget.id, { openingBalanceMinor: 1000, categories: ['Food'] })).data;
    const spending = (await first.recordSpending(token, budget.id, { amountMinor: 100, categoryId: ready.categories[0].id, date: '2026-02-01' }, undefined, options('concurrency-seed'))).data;

    const settle = (promise: Promise<unknown>) => promise.then(value => ({ ok: true as const, value }), error => ({ ok: false as const, error }));
    const results = await Promise.all([
      settle(first.editTransaction(token, budget.id, spending.id, { amountMinor: 120 }, undefined, options('concurrent-edit-a', 1))),
      settle(second.editTransaction(token, budget.id, spending.id, { amountMinor: 130 }, undefined, options('concurrent-edit-b', 1))),
    ]);
    assert.equal(results.filter(result => result.ok).length, 1);
    const failure = results.find(result => !result.ok) as { ok: false; error: unknown };
    assert.ok(failure.error instanceof Error);
    assert.equal((failure.error as any).code, 'CONFLICT');

    const winner = results.find(result => result.ok) as { ok: true; value: any };
    const history = (await first.listTransactions(token, budget.id)).data.items;
    assert.equal(history.length, 1);
    assert.equal(history[0].amountMinor, winner.value.data.item.amountMinor);

    const replayKey = winner.value.data.item.amountMinor === 120 ? 'concurrent-edit-a' : 'concurrent-edit-b';
    const replayAmount = winner.value.data.item.amountMinor;
    const replay = await second.editTransaction(token, budget.id, spending.id, { amountMinor: replayAmount }, undefined, options(replayKey, 1));
    assert.deepEqual(replay.data, winner.value.data);
    assert.equal(await firstPrisma.commandReceipt.count({ where: { budgetId: budget.id } }), 2);
    assert.equal(await firstPrisma.financialEvent.count({ where: { budgetId: budget.id, transactionId: spending.id } }), 2);
    assert.equal((await new FinancialStore(firstPrisma).load(owner.id, budget.id)).version, 2);
  } finally {
    const user = await firstPrisma.user.findUnique({ where: { email }, include: { budget: true } });
    if (user?.budget) {
      await firstPrisma.transactionDeletionAudit.deleteMany({ where: { budgetId: user.budget.id } });
      await firstPrisma.commandReceipt.deleteMany({ where: { budgetId: user.budget.id } });
      await firstPrisma.financialEvent.deleteMany({ where: { budgetId: user.budget.id } });
      await firstPrisma.transfer.deleteMany({ where: { budgetId: user.budget.id } });
      await firstPrisma.category.deleteMany({ where: { budgetId: user.budget.id } });
      const accounts = await firstPrisma.account.findMany({ where: { budgetId: user.budget.id }, select: { id: true } });
      await firstPrisma.openingBalance.deleteMany({ where: { accountId: { in: accounts.map(account => account.id) } } });
      await firstPrisma.budgetMonth.deleteMany({ where: { budgetId: user.budget.id } });
      await firstPrisma.account.deleteMany({ where: { budgetId: user.budget.id } });
      await firstPrisma.budget.delete({ where: { id: user.budget.id } });
    }
    if (user) { await firstPrisma.session.deleteMany({ where: { userId: user.id } }); await firstPrisma.user.delete({ where: { id: user.id } }); }
    await Promise.all([firstPrisma.$disconnect(), secondPrisma.$disconnect()]);
  }
});

test('PrismaBudgetStore projects an edited replacement once in working and cleared balances', { skip: !process.env.DATABASE_URL }, async () => {
  const email = `effective-edit-${randomUUID()}@example.test`;
  const { app, financialStore } = createPrismaApp();
  try {
    const fixture = await createFixture(app, email);
    const { spending } = await seedHistory(app, fixture, 'effective-edit');
    await markPrismaEventCleared(spending.id);
    assert.deepEqual(await readAccountBalances(app, fixture), { working: 950, cleared: 900 });

    await app.editTransaction(fixture.token, fixture.budgetId, spending.id, { amountMinor: 150, date: '2026-09-03', categoryId: fixture.categoryIds[1] }, undefined, options('effective-edit-first', 2));
    assert.deepEqual(await readAccountBalances(app, fixture), { working: 900, cleared: 850 });
    const financialState = await financialStore.load(fixture.ownerId, fixture.budgetId);
    const financialAccount = financialState.accounts!.find(account => account.id === fixture.accountId)!;
    assert.deepEqual({ working: financialAccount.balanceMinor, cleared: financialAccount.clearedBalanceMinor }, { working: 900, cleared: 850 });

    await app.editTransaction(fixture.token, fixture.budgetId, spending.id, { amountMinor: 200, date: '2026-09-04', categoryId: fixture.categoryIds[0] }, undefined, options('effective-edit-second', 3));
    assert.deepEqual(await readAccountBalances(app, fixture), { working: 850, cleared: 800 });
  } finally {
    await cleanup(email);
  }
});

test('PrismaBudgetStore removes a deleted transaction effect from both balances', { skip: !process.env.DATABASE_URL }, async () => {
  const email = `effective-delete-${randomUUID()}@example.test`;
  const { app } = createPrismaApp();
  try {
    const fixture = await createFixture(app, email);
    const { spending } = await seedHistory(app, fixture, 'effective-delete');
    await markPrismaEventCleared(spending.id);
    await app.deleteTransaction(fixture.token, fixture.budgetId, spending.id, { confirmed: true }, undefined, options('effective-delete-command', 2));

    assert.deepEqual(await readAccountBalances(app, fixture), { working: 1050, cleared: 1000 });
  } finally {
    await cleanup(email);
  }
});

test('durable event projections hide superseded rows and tombstones while retaining raw history', { skip: !process.env.DATABASE_URL }, async () => {
  const email = `effective-events-${randomUUID()}@example.test`;
  const { app, budgetStore, financialStore } = createPrismaApp();
  try {
    const fixture = await createFixture(app, email);
    const { spending } = await seedHistory(app, fixture, 'effective-events');
    await app.editTransaction(fixture.token, fixture.budgetId, spending.id, { amountMinor: 150 }, undefined, options('effective-events-edit', 2));

    const afterEdit = await financialStore.load(fixture.ownerId, fixture.budgetId);
    const budgetAfterEdit = await budgetStore.loadBudget(fixture.ownerId, fixture.budgetId);
    const replacement = afterEdit.events.find(event => event.transactionId === spending.id);
    assert.ok(replacement);
    assert.deepEqual(budgetAfterEdit!.events.filter(event => event.transactionId === spending.id).map(event => event.id), [replacement.id]);
    assert.ok(afterEdit.rawEvents?.some(event => event.id === spending.id), 'raw persisted history remains available');

    await app.deleteTransaction(fixture.token, fixture.budgetId, spending.id, { confirmed: true }, undefined, options('effective-events-delete', 3));
    const afterDelete = await financialStore.load(fixture.ownerId, fixture.budgetId);
    const budgetAfterDelete = await budgetStore.loadBudget(fixture.ownerId, fixture.budgetId);
    assert.equal(afterDelete.events.some(event => event.transactionId === spending.id || event.kind === 'TRANSACTION_DELETE'), false);
    assert.equal(budgetAfterDelete!.events.some(event => event.transactionId === spending.id || event.kind === 'TRANSACTION_DELETE'), false);
    assert.ok(afterDelete.rawEvents?.some(event => event.kind === 'TRANSACTION_DELETE'), 'the raw tombstone remains available for rebuilds');
    const rebuiltFinancial = await new FinancialStore(prisma!).load(fixture.ownerId, fixture.budgetId);
    const rebuiltBudget = await new PrismaBudgetStore(prisma!).loadBudget(fixture.ownerId, fixture.budgetId);
    assert.equal(rebuiltFinancial.events.some(event => event.transactionId === spending.id), false);
    assert.equal(rebuiltBudget!.events.some(event => event.kind === 'TRANSACTION_DELETE'), false);
  } finally {
    await cleanup(email);
  }
});

test('PrismaBudgetStore and InMemoryBudgetStore agree after editing and deleting history', { skip: !process.env.DATABASE_URL }, async () => {
  const email = `effective-parity-${randomUUID()}@example.test`;
  const { app: prismaApp } = createPrismaApp();
  const { app: memoryApp, budgetStore: memoryStore } = createMemoryApp();
  try {
    const prismaFixture = await createFixture(prismaApp, email);
    const memoryFixture = await createFixture(memoryApp, `memory-${email}`);
    const { spending: prismaSpending } = await seedHistory(prismaApp, prismaFixture, 'effective-parity');
    const { spending: memorySpending } = await seedHistory(memoryApp, memoryFixture, 'effective-parity');
    await markPrismaEventCleared(prismaSpending.id);
    markMemoryEventCleared(memoryStore, memoryFixture, memorySpending.id);

    await prismaApp.editTransaction(prismaFixture.token, prismaFixture.budgetId, prismaSpending.id, { amountMinor: 150, date: '2026-09-03', categoryId: prismaFixture.categoryIds[1] }, undefined, options('effective-parity-edit', 2));
    await memoryApp.editTransaction(memoryFixture.token, memoryFixture.budgetId, memorySpending.id, { amountMinor: 150, date: '2026-09-03', categoryId: memoryFixture.categoryIds[1] }, undefined, options('effective-parity-edit', 2));
    assert.deepEqual(await readAccountBalances(prismaApp, prismaFixture), await readAccountBalances(memoryApp, memoryFixture));
    assert.deepEqual(await readAccountBalances(prismaApp, prismaFixture), { working: 900, cleared: 850 });

    await prismaApp.deleteTransaction(prismaFixture.token, prismaFixture.budgetId, prismaSpending.id, { confirmed: true }, undefined, options('effective-parity-delete', 3));
    await memoryApp.deleteTransaction(memoryFixture.token, memoryFixture.budgetId, memorySpending.id, { confirmed: true }, undefined, options('effective-parity-delete', 3));
    assert.deepEqual(await readAccountBalances(prismaApp, prismaFixture), await readAccountBalances(memoryApp, memoryFixture));
    assert.deepEqual(await readAccountBalances(prismaApp, prismaFixture), { working: 1050, cleared: 1000 });
  } finally {
    await cleanup(email);
  }
});

test('PrismaBudgetStore preserves an unedited budget balance', { skip: !process.env.DATABASE_URL }, async () => {
  const email = `effective-unchanged-${randomUUID()}@example.test`;
  const { app, financialStore } = createPrismaApp();
  try {
    const fixture = await createFixture(app, email);
    assert.deepEqual(await readAccountBalances(app, fixture), { working: 1000, cleared: 1000 });
    await app.recordIncome(fixture.token, fixture.budgetId, { amountMinor: 50, date: '2026-09-01' }, undefined, options('effective-unchanged-income'));
    assert.deepEqual(await readAccountBalances(app, fixture), { working: 1050, cleared: 1000 });
    const state = await financialStore.load(fixture.ownerId, fixture.budgetId);
    assert.deepEqual({ working: state.accounts![0].balanceMinor, cleared: state.accounts![0].clearedBalanceMinor }, { working: 1050, cleared: 1000 });
  } finally {
    await cleanup(email);
  }
});

test('effective-history projection preserves both balanced transfer effects', { skip: !process.env.DATABASE_URL }, async () => {
  const email = `effective-transfer-${randomUUID()}@example.test`;
  const { app, budgetStore, financialStore } = createPrismaApp();
  try {
    const fixture = await createFixture(app, email);
    const destination = (await app.createAccount(fixture.token, fixture.budgetId, { name: 'Destination', kind: 'CHECKING', openingBalanceMinor: 250 }, undefined, options('effective-transfer-account', 0))).data.account;
    const transfer = (await app.recordTransfer(fixture.token, fixture.budgetId, { sourceAccountId: fixture.accountId, destinationAccountId: destination.id, amountMinor: 125, date: '2026-09-02' }, undefined, options('effective-transfer-command', 1))).data;
    const budget = (await app.getBudget(fixture.token, fixture.budgetId)).data;
    const source = budget.accounts.find((account: any) => account.id === fixture.accountId);
    const target = budget.accounts.find((account: any) => account.id === destination.id);
    assert.deepEqual([source.balanceMinor, target.balanceMinor, budget.accountBalanceMinor], [875, 375, 1250]);

    const financial = await financialStore.load(fixture.ownerId, fixture.budgetId);
    const budgetState = await budgetStore.loadBudget(fixture.ownerId, fixture.budgetId);
    assert.deepEqual(financial.events.filter(event => event.transferId === transfer.transferId).map(event => event.kind).sort(), ['TRANSFER_IN', 'TRANSFER_OUT']);
    assert.deepEqual(budgetState!.events.filter(event => event.transferId === transfer.transferId).map(event => event.kind).sort(), ['TRANSFER_IN', 'TRANSFER_OUT']);
  } finally {
    await cleanup(email);
  }
});

test.after(async () => { if (prisma) await prisma.$disconnect(); });
