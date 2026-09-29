import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { ApiError, BudgetApp } from '../src/app.ts';
import { FinancialStore } from '../src/persistence/financial-store.ts';
import { PrismaBudgetStore } from '../src/persistence/budget-store.ts';

const enabled = Boolean(process.env.DATABASE_URL);
const options = (idempotencyKey: string, expectedVersion: number) => ({ idempotencyKey, expectedVersion });
const withoutVersion = ({ version: _version, ...summary }: Record<string, any>) => ({ ...summary, categories: summary.categories.map(({ target: _target, ...category }: Record<string, any>) => category) });

test('PostgreSQL category targets persist with their loaded snapshot, receipt version, and financial invariants', { skip: !enabled }, async () => {
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  const store = new FinancialStore(prisma);
  const app = new BudgetApp(Date.now, new PrismaBudgetStore(prisma), store);
  const email = `category-target-${randomUUID()}@example.test`;
  let userId = '';
  let budgetId = '';
  const cleanup = async () => {
    if (budgetId) {
      await prisma.categoryTarget.deleteMany({ where: { budgetId } });
      await prisma.transactionDeletionAudit.deleteMany({ where: { budgetId } });
      await prisma.commandReceipt.deleteMany({ where: { budgetId } });
      await prisma.financialEvent.deleteMany({ where: { budgetId } });
      await prisma.transfer.deleteMany({ where: { budgetId } });
      const accounts = await prisma.account.findMany({ where: { budgetId }, select: { id: true } });
      await prisma.openingBalance.deleteMany({ where: { accountId: { in: accounts.map(account => account.id) } } });
      await prisma.budgetMonth.deleteMany({ where: { budgetId } });
      await prisma.category.deleteMany({ where: { budgetId } });
      await prisma.account.deleteMany({ where: { budgetId } });
      await prisma.budget.delete({ where: { id: budgetId } });
    }
    if (userId) { await prisma.session.deleteMany({ where: { userId } }); await prisma.user.delete({ where: { id: userId } }); }
    await prisma.$disconnect();
  };

  try {
    userId = (await app.register(email, 'correct horse')).data.id;
    const token = (await app.signIn(email, 'correct horse')).data.sessionToken;
    budgetId = (await app.createBudget(token)).data.id;
    const ready = (await app.saveSetup(token, budgetId, { openingBalanceMinor: 10_000, categories: ['Food'] })).data;
    const categoryId = ready.categories[0].id;
    const income = (await app.recordIncome(token, budgetId, { amountMinor: 800, date: '2026-02-01' }, undefined, options('target-pg-income', 0))).data;
    await app.releaseIncome(token, budgetId, income.id, undefined, options('target-pg-release', 1));
    await app.assign(token, budgetId, { categoryId, amountMinor: 250, month: '2026-02' }, undefined, options('target-pg-assignment', 2));
    await app.recordSpending(token, budgetId, { amountMinor: 75, categoryId, date: '2026-02-02' }, undefined, options('target-pg-spending', 3));

    const before = (await app.getFinancialSummary(token, budgetId, '2026-02')).data;
    const beforeState = await store.load(userId, budgetId);
    const eventsBefore = await prisma.financialEvent.count({ where: { budgetId } });
    const receiptsBefore = await prisma.commandReceipt.count({ where: { budgetId } });
    const dated = { kind: 'BALANCE_BY_DATE', amountMinor: 900, targetMonth: '2026-02' };
    const set = (await app.setCategoryTarget(token, budgetId, categoryId, dated, undefined, options('target-pg-set', beforeState.version))).data;
    assert.equal(set.version, beforeState.version + 1);
    assert.equal(await prisma.commandReceipt.count({ where: { budgetId } }), receiptsBefore + 1);
    assert.equal(await prisma.financialEvent.count({ where: { budgetId } }), eventsBefore);
    assert.deepEqual((await store.load(userId, budgetId)).targets, [{ categoryId, ...dated }]);
    assert.equal(await prisma.categoryTarget.count({ where: { budgetId } }), 1);
    assert.deepEqual((await app.setCategoryTarget(token, budgetId, categoryId, dated, undefined, options('target-pg-set', beforeState.version))).data, set);
    assert.equal(await prisma.commandReceipt.count({ where: { budgetId } }), receiptsBefore + 1);

    for (const requestedMonth of ['2026-01', '2026-02', '2026-03']) {
      const summary = (await app.getFinancialSummary(token, budgetId, requestedMonth)).data;
      assert.equal(summary.version, set.version);
      assert.deepEqual((await store.load(userId, budgetId)).targets, [{ categoryId, ...dated }]);
      assert.equal(await prisma.categoryTarget.count({ where: { budgetId } }), 1);
    }
    assert.deepEqual(withoutVersion((await app.getFinancialSummary(token, budgetId, '2026-02')).data), withoutVersion(before));

    const replacement = { kind: 'MONTHLY_SET_ASIDE', amountMinor: 500 };
    const replaced = (await app.setCategoryTarget(token, budgetId, categoryId, replacement, undefined, options('target-pg-replace', set.version))).data;
    assert.equal(replaced.version, set.version + 1);
    assert.equal(await prisma.commandReceipt.count({ where: { budgetId } }), receiptsBefore + 2);
    assert.equal(await prisma.financialEvent.count({ where: { budgetId } }), eventsBefore);
    assert.deepEqual(withoutVersion((await app.getFinancialSummary(token, budgetId, '2026-02')).data), withoutVersion(before));

    const removed = (await app.removeCategoryTarget(token, budgetId, categoryId, undefined, options('target-pg-remove', replaced.version))).data;
    assert.equal(removed.version, replaced.version + 1);
    assert.equal(await prisma.commandReceipt.count({ where: { budgetId } }), receiptsBefore + 3);
    assert.equal(await prisma.financialEvent.count({ where: { budgetId } }), eventsBefore);
    assert.deepEqual((await store.load(userId, budgetId)).targets, []);
    assert.deepEqual(withoutVersion((await app.getFinancialSummary(token, budgetId, '2026-02')).data), withoutVersion(before));

    await app.setCategoryTarget(token, budgetId, categoryId, dated, undefined, options('target-pg-archive', removed.version));
    await app.archiveCategory(token, budgetId, categoryId);
    const archived = await store.load(userId, budgetId);
    assert.equal(archived.categories.find(category => category.id === categoryId)?.archived, true);
    assert.deepEqual(archived.targets, [{ categoryId, ...dated }]);
    await assert.rejects(() => app.setCategoryTarget(token, budgetId, categoryId, dated, undefined, options('target-pg-archived-set', archived.version)), (error: unknown) => error instanceof ApiError && error.code === 'CONFLICT');
    await assert.rejects(() => app.setCategoryTarget(token, budgetId, categoryId, replacement, undefined, options('target-pg-archived-replace', archived.version)), (error: unknown) => error instanceof ApiError && error.code === 'CONFLICT');
    await assert.rejects(() => app.removeCategoryTarget(token, budgetId, categoryId, undefined, options('target-pg-archived-remove', archived.version)), (error: unknown) => error instanceof ApiError && error.code === 'CONFLICT');
    assert.deepEqual((await store.load(userId, budgetId)).targets, [{ categoryId, ...dated }]);
  } finally {
    await cleanup();
  }
});
