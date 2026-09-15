import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { BudgetApp, ApiError } from '../src/app.ts';
import { FinancialStore } from '../src/persistence/financial-store.ts';
import { PrismaBudgetStore } from '../src/persistence/budget-store.ts';

const prisma = new PrismaClient();
const password = 'correct horse';

const durableApp = () => {
  const store = new PrismaBudgetStore(prisma);
  return new BudgetApp(Date.now, store, new FinancialStore(prisma));
};
const cleanup = async (userId: string) => {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { budget: true } });
  if (user?.budget) {
    await prisma.commandReceipt.deleteMany({ where: { budgetId: user.budget.id } });
    await prisma.financialEvent.deleteMany({ where: { budgetId: user.budget.id } });
    await prisma.category.deleteMany({ where: { budgetId: user.budget.id } });
    const account = await prisma.account.findFirst({ where: { budgetId: user.budget.id } });
    if (account) { await prisma.openingBalance.deleteMany({ where: { accountId: account.id } }); await prisma.account.delete({ where: { id: account.id } }); }
    await prisma.budget.delete({ where: { id: user.budget.id } });
  }
  await prisma.user.delete({ where: { id: userId } });
};

test('identity, session, budget, and resumable setup survive a new app instance', async () => {
  const email = `restart-${randomUUID()}@example.test`;
  const first = durableApp();
  const registered = await first.register(email, password);
  const token = (await first.signIn(email, password)).data.sessionToken;
  const created = (await first.createBudget(token)).data;
  const partial = (await first.saveSetup(token, created.id, { categories: ['Food'] })).data;
  assert.equal(partial.setupStep, 'ACCOUNT');

  const restarted = durableApp();
  assert.equal((await restarted.authenticate(token)).id, registered.data.id);
  assert.equal((await restarted.resumeBudget(token)).data.id, created.id);
  const complete = (await restarted.saveSetup(token, created.id, { openingBalanceMinor: 12500, categories: ['Food', 'Bills'] })).data;
  assert.equal(complete.setupStep, 'COMPLETE');
  assert.equal((await restarted.getBudget(token, created.id)).data.account?.openingBalanceMinor, 12500);

  await restarted.signOut(token);
  await assert.rejects(() => first.authenticate(token), (error: unknown) => error instanceof ApiError && error.code === 'UNAUTHENTICATED');
  await cleanup(registered.data.id);
});

test('financial events, replay, and payload conflicts survive an app restart', async () => {
  const email = `financial-restart-${randomUUID()}@example.test`;
  const first = durableApp();
  await first.register(email, password);
  const token = (await first.signIn(email, password)).data.sessionToken;
  const budget = (await first.createBudget(token)).data;
  const complete = (await first.saveSetup(token, budget.id, { openingBalanceMinor: 1000, categories: ['Food'] })).data;
  const income = (await first.recordIncome(token, budget.id, { amountMinor: 500, date: '2026-02-01' }, undefined, { idempotencyKey: 'restart-income' })).data;

  const restarted = durableApp();
  const summary = (await restarted.getFinancialSummary(token, budget.id, '2026-02')).data;
  assert.equal(summary.accountBalanceMinor, 1500);
  assert.equal(summary.rta.unreleasedIncomeMinor, 500);
  assert.equal(summary.version, 1);
  assert.deepEqual((await restarted.recordIncome(token, budget.id, { amountMinor: 500, date: '2026-02-01' }, undefined, { idempotencyKey: 'restart-income' })).data, income);
  await assert.rejects(
    () => restarted.recordIncome(token, budget.id, { amountMinor: 501, date: '2026-02-01' }, undefined, { idempotencyKey: 'restart-income' }),
    (error: unknown) => error instanceof ApiError && error.code === 'CONFLICT',
  );
  assert.equal(complete.setupStep, 'COMPLETE');
  const user = await prisma.user.findUniqueOrThrow({ where: { email: email.toLowerCase() } });
  await cleanup(user.id);
});

test('database uniqueness enforces one budget per user across app instances', async () => {
  const email = `one-budget-${randomUUID()}@example.test`;
  const first = durableApp();
  await first.register(email, password);
  const token = (await first.signIn(email, password)).data.sessionToken;
  await first.createBudget(token);
  const restarted = durableApp();
  await assert.rejects(() => restarted.createBudget(token), (error: unknown) => error instanceof ApiError && error.code === 'CONFLICT');
  const user = await prisma.user.findUniqueOrThrow({ where: { email: email.toLowerCase() } });
  await cleanup(user.id);
});

after(async () => prisma.$disconnect());
