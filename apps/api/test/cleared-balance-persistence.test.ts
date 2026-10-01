import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { BudgetApp } from '../src/app.ts';
import { FinancialStore, PersistenceError } from '../src/persistence/financial-store.ts';
import { PrismaBudgetStore } from '../src/persistence/budget-store.ts';

const prisma = process.env.DATABASE_URL ? new (await import('@prisma/client')).PrismaClient() : null;
const postgresEnabled = Boolean(process.env.DATABASE_URL);
const cleanup = async (email: string) => {
  const user = await prisma!.user.findUnique({ where: { email }, include: { budget: true } });
  if (user?.budget) {
    await prisma!.financialEvent.deleteMany({ where: { budgetId: user.budget.id } });
    await prisma!.commandReceipt.deleteMany({ where: { budgetId: user.budget.id } });
    await prisma!.category.deleteMany({ where: { budgetId: user.budget.id } });
    const accounts = await prisma!.account.findMany({ where: { budgetId: user.budget.id } });
    for (const account of accounts) await prisma!.openingBalance.deleteMany({ where: { accountId: account.id } });
    await prisma!.account.deleteMany({ where: { budgetId: user.budget.id } });
    await prisma!.budget.delete({ where: { id: user.budget.id } });
  }
  if (user) await prisma!.user.delete({ where: { id: user.id } });
};

test('PostgreSQL migration and persisted projection preserve legacy uncleared state in one revision', { skip: !postgresEnabled }, async () => {
  const email = `cleared-projection-${randomUUID()}@example.test`;
  const store = new FinancialStore(prisma!);
  const app = new BudgetApp(Date.now, new PrismaBudgetStore(prisma!), store);
  try {
    await app.register(email, 'correct horse');
    const token = (await app.signIn(email, 'correct horse')).data.sessionToken;
    const budget = (await app.createBudget(token)).data;
    const setup = (await app.saveSetup(token, budget.id, { openingBalanceMinor: 1000, categories: ['Food'] })).data;
    const income = (await app.recordIncome(token, budget.id, { amountMinor: 500, date: '2026-09-01' }, undefined, { idempotencyKey: 'legacy-income' })).data;
    const owner = await app.authenticate(token);
    await store.execute({
      ownerId: owner.id, budgetId: budget.id, command: 'cleared-projection-fixture', input: {}, idempotencyKey: 'cleared-projection-fixture', expectedVersion: 1,
      work: (_state, _events, _version, append) => {
        append({ id: randomUUID(), kind: 'INCOME', accountId: setup.account!.id, amountMinor: 100, month: '2026-09', businessDate: '2026-09-10', status: 'POSTED', cleared: true, reconciled: true });
        append({ id: randomUUID(), kind: 'INCOME', accountId: setup.account!.id, amountMinor: 20, month: '2026-09', businessDate: '2026-09-11', status: 'WORKING', cleared: false });
        return {};
      },
    });
    const state = await store.load(owner.id, budget.id);
    const budgetProjection = (await app.getBudget(token, budget.id)).data;
    assert.equal(budgetProjection.accounts[0].clearedBalanceMinor, 1100);
    const summary = (await app.getFinancialSummary(token, budget.id, '2026-09')).data;
    assert.equal(summary.version, state.version);
    assert.equal(Object.hasOwn(summary.accounts[0], 'clearedBalanceMinor'), false);
    assert.ok(Object.keys(summary.accounts[0]).every(key => !/cleared|reconciliation/i.test(key)));
    assert.equal(summary.accounts[0].balanceMinor, 1620);
    assert.equal(summary.accountBalanceMinor, 1620);
    assert.equal(state.events.find(event => event.id === income.id)?.cleared, false);
    assert.equal(state.events.find(event => event.id === income.id)?.reconciled, false);

    const migration = await prisma!.$queryRaw<Array<{ migration_name: string }>>`
      SELECT migration_name FROM "_prisma_migrations"
      WHERE migration_name = '0009_cleared_state_and_reconciliation' AND finished_at IS NOT NULL AND rolled_back_at IS NULL
    `;
    assert.equal(migration.length, 1);
    const column = await prisma!.$queryRaw<Array<{ column_default: string; is_nullable: string }>>`
      SELECT column_default, is_nullable FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'FinancialEvent' AND column_name = 'cleared'
    `;
    assert.equal(column.length, 1);
    assert.match(column[0].column_default, /false/i);
    assert.equal(column[0].is_nullable, 'NO');
  } finally {
    await cleanup(email);
  }
});

test('persistence rejects cleared or reconciled WORKING events', { skip: !postgresEnabled }, async () => {
  const email = `working-invalid-${randomUUID()}@example.test`;
  const store = new FinancialStore(prisma!);
  const app = new BudgetApp(Date.now, new PrismaBudgetStore(prisma!), store);
  try {
    await app.register(email, 'correct horse');
    const token = (await app.signIn(email, 'correct horse')).data.sessionToken;
    const budget = (await app.createBudget(token)).data;
    const setup = (await app.saveSetup(token, budget.id, { openingBalanceMinor: 1000, categories: ['Food'] })).data;
    const owner = await app.authenticate(token);
    const rejectWorkingEvent = (idempotencyKey: string, reconciled?: boolean) => store.execute({
      ownerId: owner.id, budgetId: budget.id, command: idempotencyKey, input: {}, idempotencyKey, expectedVersion: 0,
      work: (_state, _events, _version, append) => { append({ id: randomUUID(), kind: 'INCOME', accountId: setup.account!.id, amountMinor: 10, month: '2026-09', status: 'WORKING', cleared: true, reconciled }); return {}; },
    });
    const isConflict = (error: unknown) => error instanceof PersistenceError && error.code === 'CONFLICT';
    await assert.rejects(() => rejectWorkingEvent('working-cleared'), isConflict);
    await assert.rejects(() => rejectWorkingEvent('working-reconciled', true), isConflict);
  } finally {
    await cleanup(email);
  }
});

test('persistence rejects a reconciled event that is not cleared', { skip: !postgresEnabled }, async () => {
  const email = `invalid-reconciled-${randomUUID()}@example.test`;
  const store = new FinancialStore(prisma!);
  const app = new BudgetApp(Date.now, new PrismaBudgetStore(prisma!), store);
  try {
    await app.register(email, 'correct horse');
    const token = (await app.signIn(email, 'correct horse')).data.sessionToken;
    const budget = (await app.createBudget(token)).data;
    const setup = (await app.saveSetup(token, budget.id, { openingBalanceMinor: 1000, categories: ['Food'] })).data;
    const owner = await app.authenticate(token);
    await assert.rejects(() => store.execute({
      ownerId: owner.id, budgetId: budget.id, command: 'invalid-reconciled-fixture', input: {}, idempotencyKey: 'invalid-reconciled-fixture', expectedVersion: 0,
      work: (_state, _events, _version, append) => {
        append({ id: randomUUID(), kind: 'INCOME', accountId: setup.account!.id, amountMinor: 10, month: '2026-09', reconciled: true, cleared: false });
        return {};
      },
    }), (error: unknown) => error instanceof PersistenceError && error.code === 'CONFLICT');
  } finally {
    await cleanup(email);
  }
});

after(async () => { if (prisma) await prisma.$disconnect(); });
