import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { BudgetApp } from '../src/app.ts';
import { FinancialStore } from '../src/persistence/financial-store.ts';
import { PrismaBudgetStore } from '../src/persistence/budget-store.ts';

const prisma = new PrismaClient();
const options = (idempotencyKey: string, expectedVersion?: number) => ({ idempotencyKey, expectedVersion });
const cleanup = async (email: string) => {
  const user = await prisma.user.findUnique({ where: { email }, include: { budget: true } });
  if (user?.budget) {
    await prisma.transactionDeletionAudit.deleteMany({ where: { budgetId: user.budget.id } });
    await prisma.commandReceipt.deleteMany({ where: { budgetId: user.budget.id } });
    await prisma.financialEvent.deleteMany({ where: { budgetId: user.budget.id } });
    await prisma.category.deleteMany({ where: { budgetId: user.budget.id } });
    const account = await prisma.account.findUnique({ where: { budgetId: user.budget.id } });
    if (account) { await prisma.openingBalance.deleteMany({ where: { accountId: account.id } }); await prisma.account.delete({ where: { id: account.id } }); }
    await prisma.budget.delete({ where: { id: user.budget.id } });
  }
  if (user) await prisma.user.delete({ where: { id: user.id } });
};
test('transaction history persistence exposes additive identity, metadata, tombstone, and audit schema', { skip: !process.env.DATABASE_URL }, async () => {
  const columns = await prisma.$queryRaw<{ column_name: string }[]>`SELECT column_name FROM information_schema.columns WHERE table_name = 'FinancialEvent' AND column_name IN ('transactionId', 'businessDate', 'status', 'reconciled', 'supersedesEventId')`;
  assert.deepEqual(columns.map(column => column.column_name).sort(), ['businessDate', 'reconciled', 'status', 'supersedesEventId', 'transactionId']);
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

test.after(() => prisma.$disconnect());
