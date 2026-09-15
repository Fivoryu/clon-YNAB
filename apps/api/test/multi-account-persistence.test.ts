import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { BudgetApp, ApiError } from '../src/app.ts';
import { createServer } from '../src/server.ts';
import { FinancialStore } from '../src/persistence/financial-store.ts';
import { PrismaBudgetStore } from '../src/persistence/budget-store.ts';
import { calculateAccountBalances, oldestAccount, orderAccounts } from '../src/planning/engine.ts';

const account = (id: string, createdAt: string, openingBalanceMinor: number, archived = false) => ({
  id, name: id, kind: 'CASH' as const, archived, createdAt, openingBalanceMinor,
});

test('accounts are ordered deterministically and the oldest account is the compatibility alias', () => {
  const accounts = [account('b', '2026-01-01T00:00:00.000Z', 0), account('a', '2026-01-01T00:00:00.000Z', 0), account('c', '2026-02-01T00:00:00.000Z', 0)];
  assert.deepEqual(orderAccounts(accounts).map(item => item.id), ['a', 'b', 'c']);
  assert.equal(oldestAccount(accounts)?.id, 'a');
  assert.equal(oldestAccount([]), null);
});

test('per-account balances preserve legacy openings and conserve the aggregate', () => {
  const accounts = [account('cash', '2026-01-01T00:00:00.000Z', -250), account('checking', '2026-01-02T00:00:00.000Z', 1000)];
  const events = [
    { accountId: 'cash', kind: 'INCOME' as const, amountMinor: 500 },
    { accountId: 'cash', kind: 'SPENDING' as const, amountMinor: 50 },
    { accountId: 'checking', kind: 'TRANSFER_OUT' as const, amountMinor: 125 },
    { accountId: 'cash', kind: 'TRANSFER_IN' as const, amountMinor: 125 },
  ];
  const projection = calculateAccountBalances(accounts, events);
  assert.deepEqual(projection.map(item => item.balanceMinor), [325, 875]);
  assert.equal(projection.reduce((sum, item) => sum + item.balanceMinor, 0), 1200);
});

test('migration is additive, tenant-scoped, and contains duplicate opening rows before writes', async () => {
  const schema = await readFile(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');
  const migration = await readFile(new URL('../prisma/migrations/0004_multi_account_projection/migration.sql', import.meta.url), 'utf8');
  assert.match(schema, /accounts\s+Account\[\]/);
  assert.match(schema, /budgetId\s+String\s+@db\.Uuid/);
  assert.match(schema, /model Transfer/);
  assert.match(schema, /TRANSFER_OUT/);
  assert.match(schema, /@@unique\(\[accountId\]\)/);
  assert.match(migration, /DROP CONSTRAINT "Account_budgetId_key"/);
  assert.match(migration, /duplicate opening/i);
  assert.match(migration, /FOREIGN KEY \("budgetId", "sourceAccountId"\)/);
  assert.match(migration, /FOREIGN KEY \("budgetId", "destinationAccountId"\)/);
  assert.match(migration, /historical|legacy/i);
});

test('account lifecycle enforces the bounded in-memory command contract', async () => {
  const app = new BudgetApp();
  app.register('lifecycle-owner@example.test', 'correct horse');
  app.register('lifecycle-foreign@example.test', 'correct horse');
  const token = app.signIn('lifecycle-owner@example.test', 'correct horse').data.sessionToken;
  const foreign = app.signIn('lifecycle-foreign@example.test', 'correct horse').data.sessionToken;
  const budget = app.createBudget(token).data;
  const complete = app.saveSetup(token, budget.id, { openingBalanceMinor: 1000, categories: ['Food'] }).data;
  const original = complete.account!;

  await assert.rejects(() => app.createAccount(token, budget.id, { name: ' Late ', kind: 'card' }, undefined, { idempotencyKey: 'bad-kind', expectedVersion: 0 }), (error: unknown) => error instanceof ApiError && error.code === 'VALIDATION_ERROR');
  await assert.rejects(() => app.createAccount(token, budget.id, { name: ' ', kind: 'cash' }, undefined, { idempotencyKey: 'bad-name', expectedVersion: 0 }), (error: unknown) => error instanceof ApiError && error.code === 'VALIDATION_ERROR');
  await assert.rejects(() => app.createAccount(token, budget.id, { name: 'Late', kind: 'cash' }, undefined, {}), (error: unknown) => error instanceof ApiError && error.code === 'VALIDATION_ERROR');
  await assert.rejects(() => app.createAccount(foreign, budget.id, { name: 'Late', kind: 'cash' }, undefined, { idempotencyKey: 'foreign', expectedVersion: 0 }), (error: unknown) => error instanceof ApiError && error.code === 'NOT_FOUND');

  const created = (await app.createAccount(token, budget.id, { name: ' Late ', kind: 'checking', openingBalanceMinor: -250 }, undefined, { idempotencyKey: 'account-create', expectedVersion: 0 })).data;
  assert.equal(created.account.name, 'Late');
  assert.equal(created.account.kind, 'CHECKING');
  assert.equal(created.account.openingBalanceMinor, -250);
  assert.equal(created.version, 1);
  assert.equal((await app.createAccount(token, budget.id, { name: ' Late ', kind: 'checking', openingBalanceMinor: -250 }, undefined, { idempotencyKey: 'account-create', expectedVersion: 0 })).data.account.id, created.account.id);
  await assert.rejects(() => app.createAccount(token, budget.id, { name: 'Different', kind: 'cash' }, undefined, { idempotencyKey: 'account-create', expectedVersion: 0 }), (error: unknown) => error instanceof ApiError && error.code === 'CONFLICT');
  assert.equal((await app.createAccount(token, budget.id, { name: 'Late', kind: 'cash' }, undefined, { idempotencyKey: 'duplicate-name', expectedVersion: 1 })).data.account.name, 'Late');

  const renamed = (await app.renameAccount(token, budget.id, created.account.id, { name: ' Renamed ' }, undefined, { idempotencyKey: 'account-rename', expectedVersion: 2 })).data;
  assert.equal(renamed.account.id, created.account.id);
  assert.equal(renamed.account.name, 'Renamed');
  const archived = (await app.archiveAccount(token, budget.id, created.account.id, undefined, { idempotencyKey: 'account-archive', expectedVersion: 3 })).data;
  assert.equal(archived.account.id, created.account.id);
  assert.equal(archived.account.archived, true);
  assert.equal((await app.archiveAccount(token, budget.id, created.account.id, undefined, { idempotencyKey: 'account-archive', expectedVersion: 3 })).data.account.archived, true);
  assert.equal(app.getBudget(token, budget.id).data.account?.id, original.id);
  await app.recordIncome(token, budget.id, { amountMinor: 10, accountId: original.id }, undefined, { idempotencyKey: 'active-income', expectedVersion: 4 });
  await assert.rejects(() => app.renameAccount(token, budget.id, 'missing', { name: 'x' }, undefined, { idempotencyKey: 'missing', expectedVersion: 5 }), (error: unknown) => error instanceof ApiError && error.code === 'NOT_FOUND');
  await assert.rejects(() => app.recordIncome(token, budget.id, { amountMinor: 10, accountId: created.account.id }, undefined, { idempotencyKey: 'archived-income', expectedVersion: 5 }), (error: unknown) => error instanceof ApiError && error.code === 'CONFLICT');
  await assert.rejects(() => app.renameAccount(token, budget.id, created.account.id, { name: 'x' }, undefined, { idempotencyKey: 'stale-rename', expectedVersion: 4 }), (error: unknown) => error instanceof ApiError && error.code === 'CONFLICT');
});

test('account lifecycle HTTP routes parse headers and expose no unarchive route', async (t) => {
  const app = new BudgetApp();
  app.register('lifecycle-http@example.test', 'correct horse');
  const token = app.signIn('lifecycle-http@example.test', 'correct horse').data.sessionToken;
  const budget = app.createBudget(token).data;
  app.saveSetup(token, budget.id, { openingBalanceMinor: 0, categories: ['Food'] });
  const server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}/api/v1/budgets/${budget.id}/accounts`;
  const headers = { cookie: `sid=${token}`, 'content-type': 'application/json', 'Idempotency-Key': 'http-create', 'If-Match': 'W/"0"' };
  const missing = await fetch(url, { method: 'POST', headers: { cookie: `sid=${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ name: 'No headers', kind: 'cash' }) });
  assert.equal(missing.status, 400);
  const created = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ name: 'HTTP account', kind: 'cash' }) });
  assert.equal(created.status, 201);
  const account = (await created.json() as any).data.account;
  const renamed = await fetch(`${url}/${account.id}`, { method: 'PATCH', headers: { ...headers, 'Idempotency-Key': 'http-rename', 'If-Match': '"1"' }, body: JSON.stringify({ name: 'HTTP renamed' }) });
  assert.equal(renamed.status, 200);
  const archived = await fetch(`${url}/${account.id}/archive`, { method: 'POST', headers: { ...headers, 'Idempotency-Key': 'http-archive', 'If-Match': '"2"' }, body: '{}' });
  assert.equal(archived.status, 200);
  const unarchive = await fetch(`${url}/${account.id}/unarchive`, { method: 'POST', headers: { ...headers, 'Idempotency-Key': 'http-unarchive', 'If-Match': '"3"' }, body: '{}' });
  assert.equal(unarchive.status, 404);
});

test('postgres projection durability suite requires an explicit PostgreSQL database', { skip: !process.env.DATABASE_URL }, async () => {
  assert.ok(process.env.DATABASE_URL);
});

test('postgres account lifecycle commits atomically and rebuilds after restart', { skip: !process.env.DATABASE_URL }, async () => {
  const { PrismaClient } = await import('@prisma/client');
  const firstPrisma = new PrismaClient();
  const secondPrisma = new PrismaClient();
  const email = `lifecycle-db-${randomUUID()}@example.test`;
  const cleanup = async () => {
    const user = await firstPrisma.user.findUnique({ where: { email }, include: { budget: true } });
    if (!user?.budget) return;
    await firstPrisma.financialEvent.deleteMany({ where: { budgetId: user.budget.id } });
    await firstPrisma.commandReceipt.deleteMany({ where: { budgetId: user.budget.id } });
    await firstPrisma.category.deleteMany({ where: { budgetId: user.budget.id } });
    const accounts = await firstPrisma.account.findMany({ where: { budgetId: user.budget.id } });
    for (const account of accounts) { await firstPrisma.openingBalance.deleteMany({ where: { accountId: account.id } }); }
    await firstPrisma.account.deleteMany({ where: { budgetId: user.budget.id } });
    await firstPrisma.budget.delete({ where: { id: user.budget.id } });
    await firstPrisma.user.delete({ where: { id: user.id } });
  };
  try {
    const app = new BudgetApp(Date.now, new PrismaBudgetStore(firstPrisma), new FinancialStore(firstPrisma));
    await app.register(email, 'correct horse');
    const token = (await app.signIn(email, 'correct horse')).data.sessionToken;
    const budget = (await app.createBudget(token)).data;
    await app.saveSetup(token, budget.id, { openingBalanceMinor: 1000, categories: ['Food'] });
    const created = (await app.createAccount(token, budget.id, { name: 'DB checking', kind: 'CHECKING', openingBalanceMinor: -40 }, undefined, { idempotencyKey: 'db-create', expectedVersion: 0 })).data;
    assert.equal(await firstPrisma.openingBalance.count({ where: { accountId: created.account.id } }), 1);
    const owner = await app.authenticate(token);
    await assert.rejects(() => new FinancialStore(firstPrisma).execute({
      ownerId: owner.id, budgetId: budget.id, command: 'account-atomic-failure', input: {}, idempotencyKey: 'db-atomic-failure', expectedVersion: 1, persistAccounts: true,
      work: state => { state.accounts?.push({ id: randomUUID(), name: 'rolled back', kind: 'CASH', archived: false, createdAt: new Date().toISOString(), openingBalanceMinor: 10, balanceMinor: 10 }); return { failed: false }; },
      deletionAudit: { actorId: 'not-a-uuid', transactionId: randomUUID() },
    }));
    assert.equal(await firstPrisma.account.count({ where: { budgetId: budget.id } }), 2);
    assert.equal(await firstPrisma.commandReceipt.count({ where: { budgetId: budget.id } }), 1);
    const restarted = new BudgetApp(Date.now, new PrismaBudgetStore(secondPrisma), new FinancialStore(secondPrisma));
    const renamed = (await restarted.renameAccount(token, budget.id, created.account.id, { name: 'DB renamed' }, undefined, { idempotencyKey: 'db-rename', expectedVersion: 1 })).data;
    assert.equal(renamed.account.name, 'DB renamed');
    const archived = (await restarted.archiveAccount(token, budget.id, created.account.id, undefined, { idempotencyKey: 'db-archive', expectedVersion: 2 })).data;
    assert.equal(archived.account.archived, true);
    await assert.rejects(() => restarted.createAccount(token, budget.id, { name: 'stale', kind: 'cash' }, undefined, { idempotencyKey: 'db-stale', expectedVersion: 2 }), (error: unknown) => error instanceof ApiError && error.code === 'CONFLICT');
    assert.equal(await firstPrisma.commandReceipt.count({ where: { budgetId: budget.id } }), 3);
  } finally {
    await cleanup();
    await Promise.all([firstPrisma.$disconnect(), secondPrisma.$disconnect()]);
  }
});

test('transfer core validates, conserves, replays, and projects one neutral history item', async () => {
  const app = new BudgetApp();
  app.register('transfer-owner@example.test', 'correct horse');
  app.register('transfer-foreign@example.test', 'correct horse');
  const token = app.signIn('transfer-owner@example.test', 'correct horse').data.sessionToken;
  const foreign = app.signIn('transfer-foreign@example.test', 'correct horse').data.sessionToken;
  const budget = app.createBudget(token).data;
  const ready = app.saveSetup(token, budget.id, { openingBalanceMinor: 1000, categories: ['Food', 'Fun'] }).data;
  const source = ready.account!;
  const destination = (await app.createAccount(token, budget.id, { name: 'Checking', kind: 'checking', openingBalanceMinor: 250 }, undefined, { idempotencyKey: 'transfer-account', expectedVersion: 0 })).data.account;
  const before = (await app.getFinancialSummary(token, budget.id, '2026-09')).data;
  const command = { sourceAccountId: source.id, destinationAccountId: destination.id, amountMinor: 125, date: '2026-09-15' };
  const result = (await app.recordTransfer(token, budget.id, command, undefined, { idempotencyKey: 'transfer-1', expectedVersion: 1 })).data;
  assert.equal(result.amountMinor, 125);
  assert.equal(result.sourceAccount.balanceMinor, 875);
  assert.equal(result.destinationAccount.balanceMinor, 375);
  assert.equal(result.accountBalanceMinor, 1250);
  const replay = (await app.recordTransfer(token, budget.id, command, undefined, { idempotencyKey: 'transfer-1', expectedVersion: 1 })).data;
  assert.equal(replay.transferId, result.transferId);
  await assert.rejects(() => app.recordTransfer(token, budget.id, { ...command, amountMinor: 126 }, undefined, { idempotencyKey: 'transfer-1', expectedVersion: 1 }), (e: unknown) => e instanceof ApiError && e.code === 'CONFLICT');
  await assert.rejects(() => app.recordTransfer(token, budget.id, command, undefined, { idempotencyKey: 'stale-transfer', expectedVersion: 1 }), (e: unknown) => e instanceof ApiError && e.code === 'CONFLICT');
  await assert.rejects(() => app.recordTransfer(foreign, budget.id, command, undefined, { idempotencyKey: 'foreign-transfer', expectedVersion: 2 }), (e: unknown) => e instanceof ApiError && e.code === 'NOT_FOUND');
  for (const invalid of [{ ...command, amountMinor: 0 }, { ...command, date: '2026-9-15' }]) {
    await assert.rejects(() => app.recordTransfer(token, budget.id, invalid, undefined, { idempotencyKey: randomUUID(), expectedVersion: 2 }), (e: unknown) => e instanceof ApiError && e.code === 'VALIDATION_ERROR');
  }
  await assert.rejects(() => app.recordTransfer(token, budget.id, { ...command, destinationAccountId: source.id }, undefined, { idempotencyKey: randomUUID(), expectedVersion: 2 }), (e: unknown) => e instanceof ApiError && e.code === 'CONFLICT');
  const history = (await app.listTransactions(token, budget.id, '2026-09')).data.items;
  const transfer = history.find(item => item.transactionId === result.transferId) as any;
  assert.equal(transfer.kind, 'TRANSFER');
  assert.equal(transfer.sourceAccount.id, source.id);
  assert.equal(transfer.destinationAccount.id, destination.id);
  assert.equal(history.filter(item => item.kind === 'TRANSFER').length, 1);
  assert.deepEqual((await app.getFinancialSummary(token, budget.id, '2026-09')).data.rta, before.rta);
  assert.deepEqual((await app.getFinancialSummary(token, budget.id, '2026-09')).data.categories, before.categories);
  await assert.rejects(() => app.editTransaction(token, budget.id, result.transferId, { amountMinor: 1 }, undefined, { idempotencyKey: 'transfer-edit', expectedVersion: 2 }), (e: unknown) => e instanceof ApiError && e.code === 'CONFLICT');
  await assert.rejects(() => app.deleteTransaction(token, budget.id, result.transferId, { confirmed: true }, undefined, { idempotencyKey: 'transfer-delete', expectedVersion: 2 }), (e: unknown) => e instanceof ApiError && e.code === 'CONFLICT');
  const concurrent = await Promise.all([1, 2].map(() => app.recordTransfer(token, budget.id, { ...command, amountMinor: 50, date: '2026-09-16' }, undefined, { idempotencyKey: 'concurrent-transfer', expectedVersion: 2 })));
  assert.equal(concurrent[0].data.transferId, concurrent[1].data.transferId);
  assert.equal((await app.listTransactions(token, budget.id)).data.items.filter(item => item.kind === 'TRANSFER').length, 2);
  await app.archiveAccount(token, budget.id, destination.id, undefined, { idempotencyKey: 'archive-transfer-account', expectedVersion: 3 });
  const archived = (await app.listTransactions(token, budget.id)).data.items.find(item => item.kind === 'TRANSFER') as any;
  assert.equal(archived.destinationAccount.archived, true);
  await assert.rejects(() => app.recordTransfer(token, budget.id, { ...command, date: '2026-09-23' }, undefined, { idempotencyKey: 'archived-target', expectedVersion: 4 }), (e: unknown) => e instanceof ApiError && e.code === 'CONFLICT');
  await assert.rejects(() => app.recordTransfer(token, budget.id, { ...command, sourceAccountId: 'missing' }, undefined, { idempotencyKey: 'missing-source', expectedVersion: 4 }), (e: unknown) => e instanceof ApiError && e.code === 'NOT_FOUND');
});

test('transfer HTTP route enforces command headers and exposes aggregate history identity', async t => {
  const app = new BudgetApp(); app.register('transfer-http@example.test', 'correct horse');
  const token = app.signIn('transfer-http@example.test', 'correct horse').data.sessionToken; const budget = app.createBudget(token).data;
  const ready = app.saveSetup(token, budget.id, { openingBalanceMinor: 500, categories: ['Food'] }).data;
  const destination = (await app.createAccount(token, budget.id, { name: 'HTTP checking', kind: 'checking' }, undefined, { idempotencyKey: 'http-transfer-account', expectedVersion: 0 })).data.account;
  const server = createServer(app); await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => server.close());
  const address = server.address(); assert.ok(address && typeof address !== 'string'); const url = `http://127.0.0.1:${address.port}/api/v1/budgets/${budget.id}/transfers`;
  const headers = { cookie: `sid=${token}`, 'content-type': 'application/json', 'Idempotency-Key': 'http-transfer', 'If-Match': 'W/"1"' };
  const missing = await fetch(url, { method: 'POST', headers: { cookie: `sid=${token}`, 'content-type': 'application/json' }, body: '{}' }); assert.equal(missing.status, 400);
  const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ sourceAccountId: ready.account!.id, destinationAccountId: destination.id, amountMinor: 75, date: '2026-09-22' }) });
  assert.equal(response.status, 201); const item = (await response.json() as any).data; assert.equal(item.amountMinor, 75);
});


test('postgres transfer commits atomically, survives restart, and serializes retries', { skip: !process.env.DATABASE_URL }, async () => {
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient(); const restartPrisma = new PrismaClient();
  const email = `transfer-db-${randomUUID()}@example.test`; let budgetId = '';
  const cleanup = async () => {
    if (!budgetId) return;
    await prisma.financialEvent.deleteMany({ where: { budgetId: budgetId } });
    await prisma.transfer.deleteMany({ where: { budgetId: budgetId } });
    await prisma.commandReceipt.deleteMany({ where: { budgetId: budgetId } });
    await prisma.category.deleteMany({ where: { budgetId: budgetId } });
    const accounts = await prisma.account.findMany({ where: { budgetId: budgetId } });
    for (const item of accounts) await prisma.openingBalance.deleteMany({ where: { accountId: item.id } });
    await prisma.account.deleteMany({ where: { budgetId: budgetId } });
    await prisma.budget.delete({ where: { id: budgetId } });
    await prisma.user.delete({ where: { email } });
  };
  try {
    const app = new BudgetApp(Date.now, new PrismaBudgetStore(prisma), new FinancialStore(prisma));
    await app.register(email, 'correct horse'); const token = (await app.signIn(email, 'correct horse')).data.sessionToken;
    const budget = (await app.createBudget(token)).data; budgetId = budget.id;
    const ready = (await app.saveSetup(token, budget.id, { openingBalanceMinor: 1000, categories: ['Food'] })).data;
    const destination = (await app.createAccount(token, budget.id, { name: 'DB destination', kind: 'checking' }, undefined, { idempotencyKey: 'db-transfer-account', expectedVersion: 0 })).data.account;
    const input = { sourceAccountId: ready.account!.id, destinationAccountId: destination.id, amountMinor: 200, date: '2026-09-20' };
    const transfer = (await app.recordTransfer(token, budget.id, input, undefined, { idempotencyKey: 'db-transfer', expectedVersion: 1 })).data;
    assert.equal(await prisma.transfer.count({ where: { id: transfer.transferId } }), 1);
    assert.equal(await prisma.financialEvent.count({ where: { transferId: transfer.transferId } }), 2);
    const restarted = new BudgetApp(Date.now, new PrismaBudgetStore(restartPrisma), new FinancialStore(restartPrisma));
    const rebuilt = (await restarted.listTransactions(token, budget.id, '2026-09')).data.items.filter(item => item.kind === 'TRANSFER');
    assert.equal(rebuilt.length, 1); assert.equal(rebuilt[0].transactionId, transfer.transferId);
    const retries = await Promise.all([1, 2].map(() => app.recordTransfer(token, budget.id, { ...input, amountMinor: 50, date: '2026-09-21' }, undefined, { idempotencyKey: 'db-concurrent', expectedVersion: 2 })));
    assert.equal(retries[0].data.transferId, retries[1].data.transferId);
    assert.equal(await prisma.transfer.count({ where: { budgetId } }), 2);
    const owner = await app.authenticate(token);
    await assert.rejects(() => new FinancialStore(prisma).execute({ ownerId: owner.id, budgetId, command: 'transfer-failure', input: {}, idempotencyKey: 'transfer-failure', expectedVersion: 3, work: (state: any, events: any[]) => { const id = randomUUID(); state.transfers.push({ id, sourceAccountId: input.sourceAccountId, destinationAccountId: input.destinationAccountId, amountMinor: 1, businessDate: input.date, month: '2026-09', createdAt: new Date().toISOString() }); events.push({ id: randomUUID(), kind: 'TRANSFER_OUT', transferId: id, accountId: input.sourceAccountId, amountMinor: 1, businessDate: input.date, month: '2026-09' }); return {}; }, deletionAudit: { actorId: 'not-a-uuid', transactionId: randomUUID() } }));
    assert.equal(await prisma.transfer.count({ where: { budgetId } }), 2); assert.equal(await prisma.commandReceipt.count({ where: { budgetId } }), 3);
  } finally { await cleanup(); await Promise.all([prisma.$disconnect(), restartPrisma.$disconnect()]); }
});
