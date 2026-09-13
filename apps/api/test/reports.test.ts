import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { BudgetApp, ApiError } from '../src/app.ts';
import { FinancialStore } from '../src/persistence/financial-store.ts';
import { PrismaBudgetStore } from '../src/persistence/budget-store.ts';
import { ReportService } from '../src/reports/report-service.ts';

const password = 'correct horse';
const prisma = new PrismaClient();
const options = (idempotencyKey: string) => ({ idempotencyKey });

const prepare = () => {
  const app = new BudgetApp();
  const email = `reports-${randomUUID()}@example.test`;
  app.register(email, password);
  const token = app.signIn(email, password).data.sessionToken;
  const budget = app.createBudget(token).data;
  const complete = app.saveSetup(token, budget.id, { openingBalanceMinor: 1000, categories: ['Food', 'Bills'] }).data;
  return { app, token, budget: complete };
};

const durableApp = () => new BudgetApp(Date.now, new PrismaBudgetStore(prisma), new FinancialStore(prisma));
const cleanup = async (email: string) => {
  const user = await prisma.user.findUnique({ where: { email }, include: { budget: true } });
  if (user?.budget) {
    await prisma.commandReceipt.deleteMany({ where: { budgetId: user.budget.id } });
    await prisma.financialEvent.deleteMany({ where: { budgetId: user.budget.id } });
    await prisma.category.deleteMany({ where: { budgetId: user.budget.id } });
    const account = await prisma.account.findUnique({ where: { budgetId: user.budget.id } });
    if (account) {
      await prisma.openingBalance.deleteMany({ where: { accountId: account.id } });
      await prisma.account.delete({ where: { id: account.id } });
    }
    await prisma.budget.delete({ where: { id: user.budget.id } });
  }
  if (user) await prisma.user.delete({ where: { id: user.id } });
};

test('dashboard and month summary expose equivalent canonical values', async () => {
  const { app, token, budget } = prepare();
  const category = budget.categories[0].id;
  const income = (await app.recordIncome(token, budget.id, { amountMinor: 500, date: '2026-02-01' }, undefined, options('income'))).data;
  await app.releaseIncome(token, budget.id, income.id, undefined, options('release'));
  await app.recordSpending(token, budget.id, { amountMinor: 125, categoryId: category, date: '2026-02-01' }, undefined, options('spending'));
  await app.assign(token, budget.id, { categoryId: category, amountMinor: 200, month: '2026-02' }, undefined, options('assignment'));

  const summary = await app.getFinancialSummary(token, budget.id, '2026-02');
  const dashboard = await app.getDashboard(token, budget.id, '2026-02');
  assert.deepEqual(dashboard.data, summary.data);
});

test('recalculating twice from the same authoritative events is deeply deterministic', async () => {
  const { app, token, budget } = prepare();
  await app.recordIncome(token, budget.id, { amountMinor: 500, date: '2026-02-01' }, undefined, options('deterministic-income'));
  const first = await app.getFinancialSummary(token, budget.id, '2026-02');
  const second = await app.getFinancialSummary(token, budget.id, '2026-02');
  assert.deepEqual(second.data, first.data);
});

test('report service rebuilds deterministically from authoritative state', () => {
  const state = {
    id: 'budget', setupStep: 'COMPLETE' as const, timezone: 'UTC' as const, version: 4,
    account: { id: 'account', name: 'Cash', openingBalanceMinor: 1000 },
    categories: [{ id: 'food', name: 'Food', archived: false }],
    events: [
      { id: 'income', kind: 'INCOME' as const, amountMinor: 500, month: '2026-02' },
      { id: 'release', kind: 'INCOME_RELEASE' as const, amountMinor: 500, month: '2026-02', relatedEventId: 'income' },
      { id: 'spending', kind: 'SPENDING' as const, amountMinor: 125, month: '2026-02', categoryId: 'food' },
    ],
  };
  const service = new ReportService();
  assert.deepEqual(service.read(state, '2026-02'), service.read(state, '2026-02'));
});

test('foreign report access remains NOT_FOUND', async () => {
  const { app, token, budget } = prepare();
  const email = `foreign-${randomUUID()}@example.test`;
  app.register(email, password);
  const foreign = app.signIn(email, password).data.sessionToken;
  await assert.rejects(() => app.getFinancialSummary(foreign, budget.id, '2026-02'), (error: unknown) => error instanceof ApiError && error.code === 'NOT_FOUND');
  await assert.rejects(() => app.getDashboard(foreign, budget.id, '2026-02'), (error: unknown) => error instanceof ApiError && error.code === 'NOT_FOUND');
  assert.equal(app.getBudget(token, budget.id).data.version, 0);
});

test('a new Prisma-backed BudgetApp rebuilds the same report values after restart', async () => {
  const email = `reports-restart-${randomUUID()}@example.test`;
  try {
    const first = durableApp();
    await first.register(email, password);
    const token = (await first.signIn(email, password)).data.sessionToken;
    const budget = (await first.createBudget(token)).data;
    const complete = (await first.saveSetup(token, budget.id, { openingBalanceMinor: 1000, categories: ['Food', 'Bills'] })).data;
    const income = (await first.recordIncome(token, budget.id, { amountMinor: 500, date: '2026-02-01' }, undefined, options('restart-income'))).data;
    await first.releaseIncome(token, budget.id, income.id, undefined, options('restart-release'));
    await first.recordSpending(token, budget.id, { amountMinor: 125, categoryId: complete.categories[0].id, date: '2026-02-01' }, undefined, options('restart-spending'));
    const beforeSummary = await first.getFinancialSummary(token, budget.id, '2026-02');
    const beforeDashboard = await first.getDashboard(token, budget.id, '2026-02');

    const restarted = durableApp();
    assert.deepEqual((await restarted.getFinancialSummary(token, budget.id, '2026-02')).data, beforeSummary.data);
    assert.deepEqual((await restarted.getDashboard(token, budget.id, '2026-02')).data, beforeDashboard.data);
  } finally {
    await cleanup(email);
  }
});

after(async () => prisma.$disconnect());
