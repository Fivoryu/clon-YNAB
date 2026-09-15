import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { BudgetApp } from '../src/app.ts';
import { FinancialStore, mapFinancialEventRow, mapTransferRow } from '../src/persistence/financial-store.ts';
import { PrismaBudgetStore } from '../src/persistence/budget-store.ts';

const prisma = new PrismaClient();

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
const cleanup = async (email: string) => {
  const user = await prisma.user.findUnique({ where: { email }, include: { budget: true } });
  if (user?.budget) {
    await prisma.transactionDeletionAudit.deleteMany({ where: { budgetId: user.budget.id } });
    await prisma.commandReceipt.deleteMany({ where: { budgetId: user.budget.id } });
    await prisma.financialEvent.deleteMany({ where: { budgetId: user.budget.id } });
    await prisma.category.deleteMany({ where: { budgetId: user.budget.id } });
    const account = await prisma.account.findFirst({ where: { budgetId: user.budget.id } });
    if (account) { await prisma.openingBalance.deleteMany({ where: { accountId: account.id } }); await prisma.account.delete({ where: { id: account.id } }); }
    await prisma.budget.delete({ where: { id: user.budget.id } });
  }
  if (user) await prisma.user.delete({ where: { id: user.id } });
};
test('transaction history persistence exposes additive identity, metadata, tombstone, and audit schema', { skip: !process.env.DATABASE_URL }, async () => {
  const columns = await prisma.$queryRaw<{ column_name: string }[]>`SELECT column_name FROM information_schema.columns WHERE table_name = 'FinancialEvent' AND column_name IN ('transactionId', 'businessDate', 'status', 'reconciled', 'supersedesEventId', 'payee', 'memo')`;
  assert.deepEqual(columns.map(column => column.column_name).sort(), ['businessDate', 'memo', 'payee', 'reconciled', 'status', 'supersedesEventId', 'transactionId']);
  const transferColumns = await prisma.$queryRaw<{ column_name: string }[]>`SELECT column_name FROM information_schema.columns WHERE table_name = 'Transfer' AND column_name IN ('payee', 'memo')`;
  assert.deepEqual(transferColumns.map(column => column.column_name).sort(), ['memo', 'payee']);
  const audit = await prisma.$queryRaw<{ to_regclass: string | null }[]>`SELECT to_regclass('"TransactionDeletionAudit"')::text`;
  assert.equal(audit[0].to_regclass, '"TransactionDeletionAudit"');
});

test('PostgreSQL folds two replacements before deleting a transaction', async () => {
  const store = new FinancialStore(prisma);
  let now = Date.parse('2026-02-01T00:00:00.000Z');
  const app = new BudgetApp(() => now++, new PrismaBudgetStore(prisma), store);
  const email = `${randomUUID()}@example.test`;
  try {
    await app.register(email, 'correct horse');
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
    const rows = await prisma.financialEvent.findMany({ where: { budgetId: budget.id, transactionId: original.id }, orderBy: { createdAt: 'asc' } });
    assert.equal(listed.items.length, 0);
    assert.equal(summary.accountBalanceMinor, 1000);
    assert.equal(rows.length, 4);
    assert.equal(new Set(rows.slice(0, 3).map(row => row.createdAt.getTime())).size, 3);
  } finally {
    await cleanup(email);
  }
});

test('PostgreSQL metadata survives replacement rebuild, transfer restart, rollback, and same-key retry', { skip: !process.env.DATABASE_URL }, async () => {
  const restartPrisma = new PrismaClient();
  const store = new FinancialStore(prisma);
  const restartedStore = new FinancialStore(restartPrisma);
  const email = `${randomUUID()}@example.test`;
  let budgetId = '';
  const cleanup = async () => {
    if (!budgetId) return;
    await prisma.financialEvent.deleteMany({ where: { budgetId } });
    await prisma.transfer.deleteMany({ where: { budgetId } });
    await prisma.commandReceipt.deleteMany({ where: { budgetId } });
    await prisma.category.deleteMany({ where: { budgetId } });
    const accounts = await prisma.account.findMany({ where: { budgetId } });
    for (const account of accounts) await prisma.openingBalance.deleteMany({ where: { accountId: account.id } });
    await prisma.account.deleteMany({ where: { budgetId } });
    await prisma.budget.delete({ where: { id: budgetId } });
    await prisma.user.delete({ where: { email } });
  };
  try {
    const app = new BudgetApp(Date.now, new PrismaBudgetStore(prisma), store);
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
    const countsBeforeFailure = { events: await prisma.financialEvent.count({ where: { budgetId } }), transfers: await prisma.transfer.count({ where: { budgetId } }), receipts: await prisma.commandReceipt.count({ where: { budgetId } }) };
    await assert.rejects(() => store.execute({ ownerId: owner.id, budgetId, command: 'metadata-rollback', input: { payee: 'ShouldNotPersist' }, idempotencyKey: 'metadata-rollback', expectedVersion: 4, work: (state: any, events: any[]) => {
      const transferId = randomUUID();
      state.transfers.push({ id: transferId, sourceAccountId: ready.account!.id, destinationAccountId: destination.id, amountMinor: 1, businessDate: '2026-02-03', month: '2026-02', createdAt: new Date().toISOString(), payee: 'ShouldNotPersist', memo: 'Rollback' });
      events.push({ id: randomUUID(), kind: 'TRANSFER_OUT', transferId, accountId: ready.account!.id, amountMinor: 1, businessDate: '2026-02-03', month: '2026-02' });
      return {};
    }, deletionAudit: { actorId: 'not-a-uuid', transactionId: randomUUID() } }));
    assert.deepEqual({ events: await prisma.financialEvent.count({ where: { budgetId } }), transfers: await prisma.transfer.count({ where: { budgetId } }), receipts: await prisma.commandReceipt.count({ where: { budgetId } }) }, countsBeforeFailure);
    const retries = await Promise.all([1, 2].map(() => store.execute({ ownerId: owner.id, budgetId, command: 'metadata-concurrent', input: { payee: 'Retry', memo: 'Once' }, idempotencyKey: 'metadata-concurrent', expectedVersion: 4, work: (state: any, events: any[]) => {
      const transferId = randomUUID();
      state.transfers.push({ id: transferId, sourceAccountId: ready.account!.id, destinationAccountId: destination.id, amountMinor: 2, businessDate: '2026-02-04', month: '2026-02', createdAt: new Date().toISOString(), payee: 'Retry', memo: 'Once' });
      events.push({ id: randomUUID(), kind: 'TRANSFER_OUT', transferId, accountId: ready.account!.id, amountMinor: 2, businessDate: '2026-02-04', month: '2026-02' });
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

test.after(() => prisma.$disconnect());
