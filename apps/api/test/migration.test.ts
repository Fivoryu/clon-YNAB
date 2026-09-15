import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { BudgetApp } from '../src/app.ts';
import { FinancialStore } from '../src/persistence/financial-store.ts';
import { PrismaBudgetStore } from '../src/persistence/budget-store.ts';

const prisma = new PrismaClient();
const expectedMigrations = ['0001_budgeting_slice', '0002_ownership_consistency'];
const requiredTables = ['User', 'Session', 'Budget', 'Account', 'Category', 'OpeningBalance', 'BudgetMonth', 'FinancialEvent', 'CommandReceipt'];
const compositeConstraints = [
  ['FinancialEvent_budget_account_fkey', ['budgetId', 'accountId']],
  ['FinancialEvent_budget_category_fkey', ['budgetId', 'categoryId']],
  ['FinancialEvent_budget_source_category_fkey', ['budgetId', 'sourceCategoryId']],
  ['FinancialEvent_budget_destination_category_fkey', ['budgetId', 'destinationCategoryId']],
  ['FinancialEvent_budget_related_event_fkey', ['budgetId', 'relatedEventId']],
] as const;

const durableApp = () => new BudgetApp(Date.now, new PrismaBudgetStore(prisma), new FinancialStore(prisma));

const cleanup = async (userId: string) => {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { budget: true } });
  if (user?.budget) {
    await prisma.commandReceipt.deleteMany({ where: { budgetId: user.budget.id } });
    await prisma.financialEvent.deleteMany({ where: { budgetId: user.budget.id } });
    await prisma.category.deleteMany({ where: { budgetId: user.budget.id } });
    const account = await prisma.account.findFirst({ where: { budgetId: user.budget.id } });
    if (account) {
      await prisma.openingBalance.deleteMany({ where: { accountId: account.id } });
      await prisma.account.delete({ where: { id: account.id } });
    }
    await prisma.budget.delete({ where: { id: user.budget.id } });
  }
  await prisma.user.delete({ where: { id: userId } });
};

test('database status command is reproducible', async () => {
  const packageJson = JSON.parse(await readFile('package.json', 'utf8')) as { scripts?: Record<string, string> };
  assert.equal(packageJson.scripts?.['db:status'], 'prisma migrate status --schema apps/api/prisma/schema.prisma');
});

test('local migrations, ownership constraints, and event rebuild are verified', async () => {
  const migrations = await prisma.$queryRaw<Array<{ migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }>>`
    SELECT migration_name, finished_at, rolled_back_at
    FROM "_prisma_migrations"
    WHERE migration_name IN ('0001_budgeting_slice', '0002_ownership_consistency')
    ORDER BY migration_name
  `;
  assert.deepEqual(migrations.map(row => row.migration_name), expectedMigrations);
  assert.ok(migrations.every(row => row.finished_at !== null && row.rolled_back_at === null), 'expected migrations must be applied and not rolled back');

  const tables = await prisma.$queryRaw<Array<{ table_name: string }>>`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('User', 'Session', 'Budget', 'Account', 'Category', 'OpeningBalance', 'BudgetMonth', 'FinancialEvent', 'CommandReceipt')
  `;
  assert.deepEqual(tables.map(row => row.table_name).sort(), [...requiredTables].sort());

  const constraints = await prisma.$queryRaw<Array<{ conname: string; definition: string }>>`
    SELECT c.conname, pg_get_constraintdef(c.oid) AS definition
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname = 'FinancialEvent' AND c.contype = 'f'
  `;
  for (const [name, columns] of compositeConstraints) {
    const constraint = constraints.find(row => row.conname === name);
    assert.ok(constraint, `missing composite constraint ${name}`);
    assert.match(constraint.definition, new RegExp(`FOREIGN KEY \\("${columns.join('", "')}"\\)`));
  }

  const fixture = randomUUID();
  const email = `migration-${fixture}@example.test`;
  let userId: string | undefined;
  try {
    const app = durableApp();
    const registered = await app.register(email, 'correct horse');
    userId = registered.data.id;
    const token = (await app.signIn(email, 'correct horse')).data.sessionToken;
    const budget = (await app.createBudget(token)).data;
    const complete = (await app.saveSetup(token, budget.id, { openingBalanceMinor: 1000, categories: ['Migration fixture'] })).data;
    const categoryId = complete.categories[0].id;
    await app.recordIncome(token, budget.id, { amountMinor: 500, date: '2026-02-01' }, undefined, { idempotencyKey: `${fixture}-income` });
    await app.recordSpending(token, budget.id, { amountMinor: 125, categoryId, date: '2026-02-01' }, undefined, { idempotencyKey: `${fixture}-spending` });

    const events = await prisma.financialEvent.findMany({
      where: { budgetId: budget.id },
      orderBy: { createdAt: 'asc' },
      select: { kind: true, amountMinor: true, month: true, categoryId: true },
    });
    assert.deepEqual(events.map(event => ({ ...event, amountMinor: event.amountMinor })), [
      { kind: 'INCOME', amountMinor: 500n, month: '2026-02', categoryId: null },
      { kind: 'SPENDING', amountMinor: 125n, month: '2026-02', categoryId },
    ]);

    const freshService = durableApp();
    const summary = (await freshService.getFinancialSummary(token, budget.id, '2026-02')).data;
    assert.equal(summary.accountBalanceMinor, 1375);
    assert.equal(summary.rta.unreleasedIncomeMinor, 500);
    assert.equal(summary.rta.amountMinor, 1000);
    assert.equal(summary.categories[0].activityMinor, -125);
    assert.equal(summary.categories[0].availableMinor, -125);
  } finally {
    if (userId) await cleanup(userId);
  }
});

after(async () => prisma.$disconnect());
