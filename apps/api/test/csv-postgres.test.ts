import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { ApiError, BudgetApp } from '../src/app.ts';
import { FinancialStore, type FinancialEvent } from '../src/persistence/financial-store.ts';
import { PrismaBudgetStore } from '../src/persistence/budget-store.ts';
import { CSV_HEADER } from '../src/planning/csv.ts';

const enabled = Boolean(process.env.DATABASE_URL);
const csv = (rows: string[]) => new TextEncoder().encode(`${CSV_HEADER}\r\n${rows.join('\r\n')}\r\n`);

test('PostgreSQL CSV batch is durable, atomic, idempotent and lock/version safe', { skip: !enabled }, async () => {
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  const financial = new FinancialStore(prisma);
  const app = new BudgetApp(() => Date.parse('2026-09-15T12:00:00Z'), new PrismaBudgetStore(prisma), financial);
  const email = `csv-pg-${randomUUID()}@example.test`;
  let userId = '';
  let budgetId = '';
  try {
    userId = (await app.register(email, 'correct horse')).data.id;
    const token = (await app.signIn(email, 'correct horse')).data.sessionToken;
    budgetId = (await app.createBudget(token)).data.id;
    await app.saveSetup(token, budgetId, { openingBalanceMinor: 1000, accountName: 'Checking', categories: ['Food'] });
    const first = (await app.getBudget(token, budgetId)).data;
    await app.createAccount(token, budgetId, { name: 'Savings', kind: 'checking', openingBalanceMinor: 500 }, undefined, { idempotencyKey: 'second-account', expectedVersion: 0 });
    const current = (await app.getBudget(token, budgetId)).data;
    const account = first.account!.id;
    const savings = current.accounts.find(candidate => candidate.name === 'Savings');
    assert.ok(savings);
    const category = current.categories[0].id;
    const payload = csv([
      `2026-09-13,TRANSFER,${account}=>${savings.id},100,,Move,`,
      `2026-09-14,SPENDING,${account},125,${category},Market,Food`,
      `2026-09-15,INCOME,${account},300,,Employer,Pay`,
    ]);
    const committed = (await app.importTransactionsCsv(token, budgetId, payload, undefined, { idempotencyKey: 'batch-1', expectedVersion: 1 })).data;
    assert.equal(committed.version, 2);
    assert.equal(await prisma.commandReceipt.count({ where: { budgetId, idempotencyKey: 'batch-1' } }), 1);
    assert.equal(await prisma.transfer.count({ where: { budgetId } }), 1);
    assert.equal(await prisma.financialEvent.count({ where: { budgetId, kind: { in: ['INCOME', 'SPENDING', 'TRANSFER_OUT', 'TRANSFER_IN'] } } }), 4);

    const fresh = new BudgetApp(Date.now, new PrismaBudgetStore(prisma), new FinancialStore(prisma));
    const replayToken = (await fresh.signIn(email, 'correct horse')).data.sessionToken;
    const exported = new TextDecoder().decode(await fresh.exportTransactionsCsv(replayToken, budgetId));
    assert.match(exported, /TRANSFER/);
    assert.match(exported, /Market,Food/);
    assert.match(exported, /Employer,Pay/);

    const retryPayload = csv([`2026-09-16,INCOME,${account},10,,Retry,`]);
    const [one, two] = await Promise.all([
      fresh.importTransactionsCsv(replayToken, budgetId, retryPayload, undefined, { idempotencyKey: 'parallel-same', expectedVersion: 2 }),
      fresh.importTransactionsCsv(replayToken, budgetId, retryPayload, undefined, { idempotencyKey: 'parallel-same', expectedVersion: 2 }),
    ]);
    assert.deepEqual(one.data, two.data);
    assert.equal(await prisma.commandReceipt.count({ where: { budgetId, idempotencyKey: 'parallel-same' } }), 1);

    const baseVersion = one.data.version;
    const competing = await Promise.allSettled([
      fresh.importTransactionsCsv(replayToken, budgetId, csv([`2026-09-17,INCOME,${account},11,,One,`]), undefined, { idempotencyKey: 'parallel-a', expectedVersion: baseVersion }),
      fresh.importTransactionsCsv(replayToken, budgetId, csv([`2026-09-17,INCOME,${account},12,,Two,`]), undefined, { idempotencyKey: 'parallel-b', expectedVersion: baseVersion }),
    ]);
    assert.equal(competing.filter(item => item.status === 'fulfilled').length, 1);
    const rejected = competing.find(item => item.status === 'rejected') as PromiseRejectedResult;
    assert.ok(rejected.reason instanceof ApiError);
    assert.equal(rejected.reason.code, 'CONFLICT');

    const beforeFailure = await prisma.financialEvent.count({ where: { budgetId } });
    const validEventId = randomUUID();
    await assert.rejects(() => financial.execute({
      ownerId: userId,
      budgetId,
      command: 'csv-injected-failure-proof',
      input: {},
      idempotencyKey: 'forced-failure',
      expectedVersion: baseVersion + 1,
      work: (_state, _events, version, append) => {
        const good: FinancialEvent = { id: validEventId, transactionId: validEventId, kind: 'INCOME', amountMinor: 1, accountId: account, businessDate: '2026-09-18', month: '2026-09', status: 'POSTED', reconciled: false };
        const badId = randomUUID();
        const bad: FinancialEvent = { id: badId, transactionId: badId, kind: 'INCOME', amountMinor: 1, accountId: randomUUID(), businessDate: '2026-09-18', month: '2026-09', status: 'POSTED', reconciled: false };
        append(good); append(bad); return { version };
      },
    }));
    assert.equal(await prisma.financialEvent.count({ where: { budgetId } }), beforeFailure);
    assert.equal(await prisma.financialEvent.count({ where: { id: validEventId } }), 0);
    assert.equal(await prisma.commandReceipt.count({ where: { budgetId, idempotencyKey: 'forced-failure' } }), 0);
  } finally {
    if (budgetId) {
      await prisma.transactionDeletionAudit.deleteMany({ where: { budgetId } });
      await prisma.commandReceipt.deleteMany({ where: { budgetId } });
      await prisma.financialEvent.deleteMany({ where: { budgetId } });
      await prisma.transfer.deleteMany({ where: { budgetId } });
      const accounts = await prisma.account.findMany({ where: { budgetId }, select: { id: true } });
      await prisma.openingBalance.deleteMany({ where: { accountId: { in: accounts.map(item => item.id) } } });
      await prisma.budgetMonth.deleteMany({ where: { budgetId } });
      await prisma.category.deleteMany({ where: { budgetId } });
      await prisma.account.deleteMany({ where: { budgetId } });
      await prisma.budget.deleteMany({ where: { id: budgetId } });
    }
    if (userId) { await prisma.session.deleteMany({ where: { userId } }); await prisma.user.deleteMany({ where: { id: userId } }); }
    await prisma.$disconnect();
  }
});
