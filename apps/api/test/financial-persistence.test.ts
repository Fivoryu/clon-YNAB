import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { BudgetApp, ApiError } from '../src/app.ts';
import { FinancialStore } from '../src/persistence/financial-store.ts';
import { PrismaBudgetStore } from '../src/persistence/budget-store.ts';
import { InMemoryBudgetStore } from '../src/persistence/in-memory-budget-store.ts';

const prisma = new PrismaClient();
const options = (idempotencyKey: string, expectedVersion?: number) => ({ idempotencyKey, expectedVersion });
const cleanup = async (email: string) => {
  const user = await prisma.user.findUnique({ where: { email }, include: { budget: true } });
  if (user?.budget) {
    await prisma.commandReceipt.deleteMany({ where: { budgetId: user.budget.id } });
    await prisma.financialEvent.deleteMany({ where: { budgetId: user.budget.id } });
    await prisma.category.deleteMany({ where: { budgetId: user.budget.id } });
    const account = await prisma.account.findFirst({ where: { budgetId: user.budget.id } });
    if (account) { await prisma.openingBalance.deleteMany({ where: { accountId: account.id } }); await prisma.account.delete({ where: { id: account.id } }); }
    await prisma.budget.delete({ where: { id: user.budget.id } });
  }
  if (user) await prisma.user.delete({ where: { id: user.id } });
};

test('financial commands use PostgreSQL for durable reload, idempotency, versions, and rollback', async () => {
  const store = new FinancialStore(prisma);
  const app = new BudgetApp(Date.now, new PrismaBudgetStore(prisma), store);
  const email = `${randomUUID()}@example.test`;
  const registered = await app.register(email, 'correct horse');
  const token = (await app.signIn(email, 'correct horse')).data.sessionToken;
  const owner = await app.authenticate(token);
  const budget = (await app.createBudget(token)).data;
  const complete = (await app.saveSetup(token, budget.id, { openingBalanceMinor: 1000, categories: ['Food', 'Bills'] })).data;

  const first = (await app.recordIncome(token, budget.id, { amountMinor: 500, date: '2026-02-01' }, undefined, options('income-1'))).data;
  const reloaded = await store.load(owner.id, budget.id);
  assert.equal(reloaded.events.length, 1);
  assert.equal(reloaded.events[0].amountMinor, 500);
  assert.equal(reloaded.version, 1);

  const replay = (await app.recordIncome(token, budget.id, { amountMinor: 500, date: '2026-02-01' }, undefined, options('income-1'))).data;
  assert.deepEqual(replay, first);
  await assert.rejects(
    () => app.recordIncome(token, budget.id, { amountMinor: 501, date: '2026-02-01' }, undefined, options('income-1')),
    (error: unknown) => error instanceof ApiError && error.code === 'CONFLICT',
  );
  await assert.rejects(
    () => app.recordIncome(token, budget.id, { amountMinor: 100, date: '2026-02-01' }, undefined, options('stale', 0)),
    (error: unknown) => error instanceof ApiError && error.code === 'CONFLICT',
  );

  await assert.rejects(() => store.execute({
    ownerId: owner.id,
    budgetId: budget.id,
    command: 'rollback-check',
    input: { amountMinor: 1 },
    idempotencyKey: 'rollback-check',
    work: (state, events) => {
      events.push({ id: randomUUID(), kind: 'INCOME', amountMinor: 1, month: '2026-02' });
      events.push({ ...state.events[0] });
      return { rollback: true };
    },
  }));
  const afterRollback = await store.load(owner.id, budget.id);
  assert.equal(afterRollback.events.length, 1);
  assert.equal(afterRollback.version, 1);
  assert.equal(await prisma.commandReceipt.count({ where: { budgetId: budget.id, idempotencyKey: 'rollback-check' } }), 0);
  assert.equal(complete.setupStep, 'COMPLETE');
  assert.equal(registered.data.id, owner.id);
  await cleanup(email);
});

test('missing durable budgets are never seeded from in-memory state', async () => {
  const budgetStore = new InMemoryBudgetStore();
  const app = new BudgetApp(Date.now, budgetStore, new FinancialStore(prisma));
  const email = `${randomUUID()}@example.test`;
  try {
    app.register(email, 'correct horse');
    const token = app.signIn(email, 'correct horse').data.sessionToken;
    const budget = app.createBudget(token).data;
    app.saveSetup(token, budget.id, { openingBalanceMinor: 1000, categories: ['Food'] });

    await assert.rejects(
      () => app.getFinancialSummary(token, budget.id, '2026-02'),
      (error: unknown) => error instanceof ApiError && error.code === 'NOT_FOUND',
    );
    await assert.rejects(
      () => app.recordIncome(token, budget.id, { amountMinor: 500, date: '2026-02-01' }, undefined, options('no-seed')),
      (error: unknown) => error instanceof ApiError && error.code === 'NOT_FOUND',
    );
    assert.equal(await prisma.budget.findUnique({ where: { id: budget.id } }), null);
  } finally {
    await cleanup(email);
  }
});

test('concurrent commands serialize on the persisted budget version', async () => {
  const firstPrisma = new PrismaClient();
  const secondPrisma = new PrismaClient();
  const email = `${randomUUID()}@example.test`;
  try {
    const first = new BudgetApp(Date.now, new PrismaBudgetStore(firstPrisma), new FinancialStore(firstPrisma));
    const second = new BudgetApp(Date.now, new PrismaBudgetStore(secondPrisma), new FinancialStore(secondPrisma));
    const owner = (await first.register(email, 'correct horse')).data;
    const token = (await second.signIn(email, 'correct horse')).data.sessionToken;
    const budget = (await first.createBudget(token)).data;
    await first.saveSetup(token, budget.id, { openingBalanceMinor: 1000, categories: ['Food'] });

    const attempt = (run: Promise<unknown>) => run.then(value => ({ ok: true as const, value }), error => ({ ok: false as const, error }));
    const outcomes = await Promise.all([
      attempt(first.recordIncome(token, budget.id, { amountMinor: 500, date: '2026-02-01' }, undefined, options('concurrent-1', 0))),
      attempt(second.recordIncome(token, budget.id, { amountMinor: 700, date: '2026-02-01' }, undefined, options('concurrent-2', 0))),
    ]);
    const successes = outcomes.filter(outcome => outcome.ok);
    assert.equal(successes.length, 1);
    assert.equal((successes[0] as { value: { data: { version: number } } }).value.data.version, 1);
    const errors = outcomes.filter(outcome => !outcome.ok).map(outcome => outcome.error);
    assert.equal(errors.length, 1);
    assert.ok(errors[0] instanceof ApiError);
    assert.equal((errors[0] as ApiError).code, 'CONFLICT');
    assert.equal(await prisma.commandReceipt.count({ where: { budgetId: budget.id } }), 1);
    assert.equal(await prisma.financialEvent.count({ where: { budgetId: budget.id } }), 1);
    assert.equal((await new FinancialStore(prisma).load(owner.id, budget.id)).version, 1);
  } finally {
    await Promise.all([firstPrisma.$disconnect(), secondPrisma.$disconnect()]);
    await cleanup(email);
  }
});

after(async () => prisma.$disconnect());
