import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { BudgetApp, ApiError } from '../src/app.ts';
import { createServer } from '../src/server.ts';
import { FinancialStore } from '../src/persistence/financial-store.ts';
import { PrismaBudgetStore } from '../src/persistence/budget-store.ts';
import { InMemoryBudgetStore } from '../src/persistence/in-memory-budget-store.ts';

const prisma = process.env.DATABASE_URL ? new (await import('@prisma/client')).PrismaClient() : null;
const adapters = [{ name: 'InMemoryBudgetStore', kind: 'memory' as const }, ...(prisma ? [{ name: 'FinancialStore', kind: 'postgres' as const }] : [])];
after(async () => { await prisma?.$disconnect(); });
const options = (idempotencyKey: string, expectedVersion: number) => ({ idempotencyKey, expectedVersion });
const cleanupPostgresUser = async (email: string) => {
  const user = await prisma!.user.findUnique({ where: { email }, include: { budget: true } });
  if (user?.budget) {
    await prisma!.financialEvent.deleteMany({ where: { budgetId: user.budget.id } });
    await prisma!.reconciliation.deleteMany({ where: { budgetId: user.budget.id } });
    await prisma!.transfer.deleteMany({ where: { budgetId: user.budget.id } });
    await prisma!.commandReceipt.deleteMany({ where: { budgetId: user.budget.id } });
    await prisma!.category.deleteMany({ where: { budgetId: user.budget.id } });
    const accounts = await prisma!.account.findMany({ where: { budgetId: user.budget.id }, select: { id: true } });
    await prisma!.openingBalance.deleteMany({ where: { accountId: { in: accounts.map(account => account.id) } } });
    await prisma!.account.deleteMany({ where: { budgetId: user.budget.id } });
    await prisma!.budget.delete({ where: { id: user.budget.id } });
  }
  if (user) await prisma!.user.delete({ where: { id: user.id } });
};
const fixtureFor = async (kind: 'memory' | 'postgres') => {
  let now = Date.parse('2026-09-01T00:00:00.000Z');
  const memory = kind === 'memory' ? new InMemoryBudgetStore() : null;
  const budgetStore = kind === 'postgres' ? new PrismaBudgetStore(prisma!) : memory!;
  const financialStore = kind === 'postgres' ? new FinancialStore(prisma!) : null;
  const app = financialStore ? new BudgetApp(() => now++, budgetStore, financialStore) : new BudgetApp(() => now++, memory!);
  const email = `reconciliation-${kind}-${randomUUID()}@example.test`;
  await app.register(email, 'correct horse');
  const token = (await app.signIn(email, 'correct horse')).data.sessionToken;
  const budget = (await app.createBudget(token)).data;
  const setup = (await app.saveSetup(token, budget.id, { openingBalanceMinor: 1000, categories: ['Food'] })).data;
  const ownerId = (await app.authenticate(token)).id;
  const server = createServer(app);
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const load = () => financialStore ? financialStore.load(ownerId, budget.id) : memory!.loadFinancial(ownerId, budget.id);
  const request = (session: string, accountId: string, body: unknown, key: string, version: number) => fetch(`http://127.0.0.1:${address.port}/api/v1/budgets/${budget.id}/accounts/${accountId}/reconciliation`, { method: 'POST', headers: { cookie: `sid=${session}`, 'content-type': 'application/json', 'Idempotency-Key': key, 'If-Match': `W/"${version}"` }, body: JSON.stringify(body) });
  const cleanup = async () => { await new Promise<void>(resolve => server.close(() => resolve())); if (prisma && kind === 'postgres') await cleanupPostgresUser(email); };
  return { app, token, budget, setup, ownerId, kind, memory, port: address.port, load, request, cleanup };
};
const versionOf = async (f: Awaited<ReturnType<typeof fixtureFor>>) => (await f.load()).version;
const income = async (f: Awaited<ReturnType<typeof fixtureFor>>, amountMinor: number, accountId = f.setup.account!.id) => (await f.app.recordIncome(f.token, f.budget.id, { amountMinor, accountId, date: '2026-09-02' }, undefined, options(`income-${randomUUID()}`, await versionOf(f)))).data;
const spending = async (f: Awaited<ReturnType<typeof fixtureFor>>, amountMinor: number, accountId = f.setup.account!.id) => (await f.app.recordSpending(f.token, f.budget.id, { amountMinor, accountId, categoryId: f.setup.categories[0].id, date: '2026-09-03' }, undefined, options(`spending-${randomUUID()}`, await versionOf(f)))).data;
const clear = async (f: Awaited<ReturnType<typeof fixtureFor>>, id: string) => f.app.setTransactionCleared(f.token, f.budget.id, id, { cleared: true }, undefined, options(`clear-${randomUUID()}`, await versionOf(f)));
const post = async (f: Awaited<ReturnType<typeof fixtureFor>>, input: unknown, key = `reconcile-${randomUUID()}`, version?: number, accountId = f.setup.account!.id, token = f.token) => f.request(token, accountId, input, key, version ?? await versionOf(f));
const withAdapter = (name: string, kind: 'memory' | 'postgres', run: (f: Awaited<ReturnType<typeof fixtureFor>>) => Promise<void>) => test(`${name}: ${run.name}`, async () => { const f = await fixtureFor(kind); try { await run(f); } finally { await f.cleanup(); } });
const stripVersions = (value: any): any => Array.isArray(value) ? value.map(stripVersions) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'version').map(([key, item]) => [key, stripVersions(item)])) : value;
const assertNoClearedOrReconciliationFields = (value: any) => {
  const visit = (item: any) => { if (Array.isArray(item)) return item.forEach(visit); if (!item || typeof item !== 'object') return; for (const [key, child] of Object.entries(item)) { assert.doesNotMatch(key, /cleared|reconciliation/i); visit(child); } };
  visit(value);
};

for (const adapter of adapters) {
  withAdapter(adapter.name, adapter.kind, async function matchingBalanceRecordsAndLocksClearedHistory(f) {
    const earned = await income(f, 40); const spent = await spending(f, 10);
    await clear(f, earned.id); await clear(f, spent.id);
    const before = await f.load();
    const response = await post(f, { confirmedClearedBalanceMinor: 1030 }, `matching-${adapter.name}`, before.version);
    assert.equal(response.status, 201);
    const data = (await response.json() as any).data;
    assert.deepEqual(data, { reconciliationId: data.reconciliationId, accountId: f.setup.account!.id, observedClearedBalanceMinor: 1030, confirmedClearedBalanceMinor: 1030, adjustmentMinor: 0, lockedCount: 2, month: '2026-09', version: before.version + 1 });
    const state = await f.load();
    assert.equal(state.reconciliations?.length, 1);
    assert.deepEqual({ accountId: state.reconciliations?.[0].accountId, actorId: state.reconciliations?.[0].actorId, observed: state.reconciliations?.[0].observedClearedBalanceMinor, confirmed: state.reconciliations?.[0].confirmedClearedBalanceMinor, adjustment: state.reconciliations?.[0].adjustmentMinor, reason: state.reconciliations?.[0].reason, month: state.reconciliations?.[0].month, key: state.reconciliations?.[0].idempotencyKey }, { accountId: f.setup.account!.id, actorId: f.ownerId, observed: 1030, confirmed: 1030, adjustment: 0, reason: null, month: '2026-09', key: `matching-${adapter.name}` });
    assert.equal(state.events.filter(event => event.reconciled && event.reconciliationId === data.reconciliationId).length, 2);
    assert.equal(state.events.filter(event => event.kind === 'RECONCILIATION_ADJUSTMENT').length, 0);
    assert.equal(state.accounts?.find(account => account.id === f.setup.account!.id)?.clearedBalanceMinor, 1030);
    await assert.rejects(() => f.app.editTransaction(f.token, f.budget.id, earned.id, { amountMinor: 41 }, undefined, options(`edit-locked-${adapter.name}`, state.version)), (error: unknown) => error instanceof ApiError && error.code === 'CONFLICT');
    await assert.rejects(() => f.app.setTransactionCleared(f.token, f.budget.id, spent.id, { cleared: false }, undefined, options(`clear-locked-${adapter.name}`, state.version)), (error: unknown) => error instanceof ApiError && error.code === 'CONFLICT');
    assert.equal((await f.load()).version, state.version);
    const unavailable = await fetch(`http://127.0.0.1:${f.port}/api/v1/budgets/${f.budget.id}/accounts/${f.setup.account!.id}/reconciliation/${data.reconciliationId}/unlock`, { method: 'POST', headers: { cookie: `sid=${f.token}` } });
    assert.equal(unavailable.status, 404);
  });

  withAdapter(adapter.name, adapter.kind, async function reconcilingATransferLocksBothPairedEffects(f) {
    const destination = (await f.app.createAccount(f.token, f.budget.id, { name: 'Transfer destination', kind: 'checking', openingBalanceMinor: 500 }, undefined, options(`destination-${adapter.name}`, await versionOf(f)))).data.account;
    const transfer = (await f.app.recordTransfer(f.token, f.budget.id, { sourceAccountId: f.setup.account!.id, destinationAccountId: destination.id, amountMinor: 25, date: '2026-09-04' }, undefined, options(`transfer-pair-${adapter.name}`, await versionOf(f)))).data;
    await f.app.setTransactionCleared(f.token, f.budget.id, transfer.transferId, { cleared: true }, undefined, options(`clear-transfer-${adapter.name}`, await versionOf(f)));
    const before = await f.load();
    const response = await post(f, { confirmedClearedBalanceMinor: 975 }, `reconcile-transfer-${adapter.name}`, before.version);
    assert.equal(response.status, 201); assert.equal((await response.json() as any).data.lockedCount, 1);
    const effects = (await f.load()).events.filter(event => event.transferId === transfer.transferId);
    assert.equal(effects.length, 2); assert.ok(effects.every(event => event.reconciled && event.cleared));
    assert.equal(effects[0].reconciliationId, effects[1].reconciliationId);
    const accounts = (await f.load()).accounts!;
    assert.equal(accounts.find(account => account.id === f.setup.account!.id)?.clearedBalanceMinor, 975);
    assert.equal(accounts.find(account => account.id === destination.id)?.clearedBalanceMinor, 525);
  });

  withAdapter(adapter.name, adapter.kind, async function matchingBalanceWithNoClearedItemsRecordsAnEmptyLock(f) {
    const before = await f.load(); const response = await post(f, { confirmedClearedBalanceMinor: 1000 }, `empty-lock-${adapter.name}`, before.version);
    assert.equal(response.status, 201); const result = (await response.json() as any).data;
    assert.equal(result.adjustmentMinor, 0); assert.equal(result.lockedCount, 0); assert.equal((await f.load()).events.length, before.events.length);
  });

  withAdapter(adapter.name, adapter.kind, async function mismatchWithoutConfirmationDisclosesDifferenceAndChangesNothing(f) {
    const item = await income(f, 20); await clear(f, item.id); const before = await f.load();
    const response = await post(f, { confirmedClearedBalanceMinor: 1030 }, `mismatch-${adapter.name}`, before.version);
    const body = await response.json() as any;
    assert.equal(response.status, 409); assert.equal(body.error.code, 'CONFLICT');
    assert.equal(body.error.details.observedClearedBalanceMinor, 1020); assert.equal(body.error.details.confirmedClearedBalanceMinor, 1030); assert.equal(body.error.details.differenceMinor, 10);
    assert.deepEqual(await f.load(), before);
  });

  withAdapter(adapter.name, adapter.kind, async function confirmedAdjustmentMovesOnlyAccountBalancesAndNeverEntersReports(f) {
    const other = (await f.app.createAccount(f.token, f.budget.id, { name: 'Other', kind: 'checking', openingBalanceMinor: 500 }, undefined, options(`other-${adapter.name}`, await versionOf(f)))).data.account;
    const earned = await income(f, 200); await clear(f, earned.id); await income(f, 100, other.id); const expense = await spending(f, 50, f.setup.account!.id);
    assert.equal((await f.load()).events.some(event => event.transactionId === expense.id), true);
    await f.app.assign(f.token, f.budget.id, { categoryId: f.setup.categories[0].id, amountMinor: 75, month: '2026-09' }, undefined, options(`assign-${adapter.name}`, await versionOf(f)));
    const transfer = (await f.app.recordTransfer(f.token, f.budget.id, { sourceAccountId: f.setup.account!.id, destinationAccountId: other.id, amountMinor: 30, date: '2026-09-04' }, undefined, options(`transfer-${adapter.name}`, await versionOf(f)))).data;
    const history = await f.load();
    if (f.kind === 'postgres') assert.deepEqual(history.rawEvents?.filter(event => event.kind === 'SPENDING').map(event => [event.accountId, event.transactionId]), [[f.setup.account!.id, expense.id]]);
    assert.deepEqual(history.events.filter(event => event.accountId === f.setup.account!.id).map(event => [event.kind, event.amountMinor, event.cleared === true]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))), [['INCOME', 200, true], ['SPENDING', 50, false], ['TRANSFER_OUT', 30, false]]);
    const before = (await f.app.getBudget(f.token, f.budget.id)).data;
    const summaryBefore = (await f.app.getFinancialSummary(f.token, f.budget.id, '2026-09')).data;
    const monthlyBefore = (await f.app.getMonthlyReport(f.token, f.budget.id, '2026-09')).data;
    const seriesBefore = (await f.app.getMultiMonthReport(f.token, f.budget.id, '2026-09', '2026-10')).data;
    const account = (id: string, budget: any) => budget.accounts.find((item: any) => item.id === id);
    const primaryBefore = account(f.setup.account!.id, before);
    const otherBefore = account(other.id, before);
    const expectedSummaryBalances = summaryBefore.accounts.map((item: any) => [item.id, item.balanceMinor + (item.id === f.setup.account!.id ? 17 : 0)]);
    assert.equal(summaryBefore.accountBalanceMinor, before.accountBalanceMinor);
    const confirmedClearedBalanceMinor = primaryBefore.clearedBalanceMinor + 17;
    const response = await post(f, { confirmedClearedBalanceMinor, confirmAdjustment: true, reason: 'Statement correction', date: '2026-09-30' }, `adjust-${adapter.name}`, before.version);
    assert.equal(response.status, 201);
    const result = (await response.json() as any).data; assert.equal(result.adjustmentMinor, 17); assert.equal(result.lockedCount, 1);
    const state = await f.load(); const adjustment = state.events.find(event => event.kind === 'RECONCILIATION_ADJUSTMENT');
    assert.deepEqual({ amountMinor: adjustment?.amountMinor, accountId: adjustment?.accountId, reconciliationId: adjustment?.reconciliationId, cleared: adjustment?.cleared, reconciled: adjustment?.reconciled }, { amountMinor: 17, accountId: f.setup.account!.id, reconciliationId: result.reconciliationId, cleared: true, reconciled: true });
    const summaryAfter = (await f.app.getFinancialSummary(f.token, f.budget.id, '2026-09')).data;
    assert.deepEqual({ accountBalanceMinor: summaryAfter.accountBalanceMinor, accounts: summaryAfter.accounts.map((item: any) => [item.id, item.balanceMinor]) }, { accountBalanceMinor: summaryBefore.accountBalanceMinor + result.adjustmentMinor, accounts: expectedSummaryBalances });
    assert.deepEqual(summaryAfter.rta, summaryBefore.rta); assert.deepEqual(summaryAfter.categories, summaryBefore.categories);
    assert.deepEqual(Object.keys(summaryAfter.rta).sort(), ['amountMinor', 'assignedMinor', 'openingBalanceMinor', 'priorCarryMinor', 'releasedIncomeMinor', 'unreleasedIncomeMinor']);
    assertNoClearedOrReconciliationFields(summaryAfter);
    const after = (await f.app.getBudget(f.token, f.budget.id)).data;
    assert.deepEqual([account(f.setup.account!.id, after).balanceMinor, account(f.setup.account!.id, after).clearedBalanceMinor], [primaryBefore.balanceMinor + result.adjustmentMinor, confirmedClearedBalanceMinor]);
    assert.deepEqual([account(other.id, after).balanceMinor, account(other.id, after).clearedBalanceMinor], [otherBefore.balanceMinor, otherBefore.clearedBalanceMinor]);
    assert.equal(after.accountBalanceMinor, before.accountBalanceMinor + result.adjustmentMinor);
    assert.equal(summaryAfter.accountBalanceMinor, after.accountBalanceMinor);
    const monthlyAfter = (await f.app.getMonthlyReport(f.token, f.budget.id, '2026-09')).data;
    const seriesAfter = (await f.app.getMultiMonthReport(f.token, f.budget.id, '2026-09', '2026-10')).data;
    assert.deepEqual(stripVersions(monthlyAfter), stripVersions(monthlyBefore)); assert.deepEqual(stripVersions(seriesAfter), stripVersions(seriesBefore));
    assert.equal(monthlyAfter.transfers.totalMinor, 30); assert.equal(seriesAfter.total.transfers.totalMinor, 30);
    assertNoClearedOrReconciliationFields(monthlyAfter); assertNoClearedOrReconciliationFields(seriesAfter);
    assert.equal(state.events.filter(event => event.kind === 'RECONCILIATION_ADJUSTMENT').length, 1);
    assert.equal(transfer.amountMinor, 30);
    const reversed = await post(f, { confirmedClearedBalanceMinor: primaryBefore.clearedBalanceMinor, confirmAdjustment: true, reason: 'Reverse correction', date: '2026-10-01' }, `negative-adjust-${adapter.name}`);
    assert.equal(reversed.status, 201); assert.equal((await reversed.json() as any).data.adjustmentMinor, -17);
    const restored = (await f.app.getBudget(f.token, f.budget.id)).data;
    assert.deepEqual([account(f.setup.account!.id, restored).balanceMinor, account(f.setup.account!.id, restored).clearedBalanceMinor], [primaryBefore.balanceMinor, primaryBefore.clearedBalanceMinor]);
    const adjustments = (await f.load()).events.filter(event => event.kind === 'RECONCILIATION_ADJUSTMENT');
    assert.deepEqual(adjustments.map(event => event.amountMinor).sort((a, b) => a - b), [-17, 17]);
  });

  withAdapter(adapter.name, adapter.kind, async function confirmedMismatchRequiresReasonAndArchiveRejectsWithoutMutation(f) {
    const item = await income(f, 30); await clear(f, item.id); const version = await versionOf(f); const before = await f.load();
    const missingReason = await post(f, { confirmedClearedBalanceMinor: 1040, confirmAdjustment: true }, `no-reason-${adapter.name}`, version);
    assert.equal(missingReason.status, 400); assert.equal((await missingReason.json() as any).error.code, 'VALIDATION_ERROR'); assert.deepEqual(await f.load(), before);
    await f.app.archiveAccount(f.token, f.budget.id, f.setup.account!.id, undefined, options(`archive-${adapter.name}`, version));
    const archived = await f.load();
    const rejected = await post(f, { confirmedClearedBalanceMinor: 1030 }, `archived-${adapter.name}`, archived.version);
    assert.equal(rejected.status, 409); assert.deepEqual(await f.load(), archived);
    assert.equal((await f.load()).reconciliations?.length ?? 0, 0);
    assert.equal((await f.load()).events.some(event => event.reconciled), false);
  });

  withAdapter(adapter.name, adapter.kind, async function idempotencyReplayPayloadReuseAndStaleVersionAreSafe(f) {
    const item = await income(f, 25); await clear(f, item.id); const version = await versionOf(f); const key = `retry-${adapter.name}`;
    const first = await post(f, { confirmedClearedBalanceMinor: 1025 }, key, version); assert.equal(first.status, 201); const result = (await first.json() as any).data; const afterFirst = await f.load();
    const replay = await post(f, { confirmedClearedBalanceMinor: 1025 }, key, version); assert.deepEqual((await replay.json() as any).data, result); assert.deepEqual(await f.load(), afterFirst);
    const reused = await post(f, { confirmedClearedBalanceMinor: 1026 }, key, version); assert.equal(reused.status, 409); assert.deepEqual(await f.load(), afterFirst);
    await income(f, 1); const beforeStale = await f.load(); const stale = await post(f, { confirmedClearedBalanceMinor: 1025 }, `stale-${adapter.name}`, version);
    assert.equal(stale.status, 409); assert.deepEqual(await f.load(), beforeStale);
    assert.equal(beforeStale.reconciliations?.length, 1); assert.equal(beforeStale.events.filter(event => event.kind === 'RECONCILIATION_ADJUSTMENT').length, 0);
  });

  withAdapter(adapter.name, adapter.kind, async function foreignBudgetIsNotDisclosed(f) {
    const email = `foreign-${randomUUID()}@example.test`;
    try {
      await f.app.register(email, 'correct horse'); const token = (await f.app.signIn(email, 'correct horse')).data.sessionToken; const foreign = (await f.app.createBudget(token)).data;
      const before = await f.load(); const response = await post(f, { confirmedClearedBalanceMinor: 1000 }, `foreign-${adapter.name}`, before.version, f.setup.account!.id, token);
      assert.equal(response.status, 404); assert.equal((await response.json() as any).error.code, 'NOT_FOUND'); assert.notEqual(foreign.id, f.budget.id); assert.deepEqual(await f.load(), before);
    } finally { if (prisma && f.kind === 'postgres') await cleanupPostgresUser(email); }
  });
}
