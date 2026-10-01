import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { BudgetApp, ApiError } from '../src/app.ts';
import { createServer } from '../src/server.ts';
import { FinancialStore, PersistenceError } from '../src/persistence/financial-store.ts';
import { PrismaBudgetStore } from '../src/persistence/budget-store.ts';
import { InMemoryBudgetStore } from '../src/persistence/in-memory-budget-store.ts';
import { foldEffectiveHistory } from '../src/planning/transaction-history.ts';

const prisma = process.env.DATABASE_URL ? new (await import('@prisma/client')).PrismaClient() : null;
const adapters = [
  { name: 'InMemoryBudgetStore', kind: 'memory' as const },
  ...(prisma ? [{ name: 'FinancialStore', kind: 'postgres' as const }] : []),
];
const password = 'correct horse';
const options = (idempotencyKey: string, expectedVersion?: number) => ({ idempotencyKey, expectedVersion });

const fixtureFor = async (kind: 'memory' | 'postgres') => {
  let now = Date.parse('2026-09-01T00:00:00.000Z');
  const memoryStore = kind === 'memory' ? new InMemoryBudgetStore() : null;
  const budgetStore = kind === 'postgres' ? new PrismaBudgetStore(prisma!) : memoryStore!;
  const financialStore = kind === 'postgres' ? new FinancialStore(prisma!) : null;
  const app = financialStore
    ? new BudgetApp(() => now++, budgetStore, financialStore)
    : new BudgetApp(() => now++, memoryStore!);
  const email = `cleared-${kind}-${randomUUID()}@example.test`;
  await app.register(email, password);
  const token = (await app.signIn(email, password)).data.sessionToken;
  const budget = (await app.createBudget(token)).data;
  const setup = (await app.saveSetup(token, budget.id, { openingBalanceMinor: 1000, categories: ['Food', 'Bills'] })).data;
  const ownerId = (await app.authenticate(token)).id;
  const load = () => financialStore ? financialStore.load(ownerId, budget.id) : memoryStore!.loadFinancial(ownerId, budget.id);
  const execute = (command: any) => financialStore ? financialStore.execute(command) : memoryStore!.executeFinancial(command);
  const cleanup = async () => {
    if (!prisma || kind !== 'postgres') return;
    const user = await prisma.user.findUnique({ where: { email }, include: { budget: true } });
    if (user?.budget) {
      await prisma.financialEvent.deleteMany({ where: { budgetId: user.budget.id } });
      await prisma.transfer.deleteMany({ where: { budgetId: user.budget.id } });
      await prisma.commandReceipt.deleteMany({ where: { budgetId: user.budget.id } });
      await prisma.category.deleteMany({ where: { budgetId: user.budget.id } });
      const accounts = await prisma.account.findMany({ where: { budgetId: user.budget.id }, select: { id: true } });
      await prisma.openingBalance.deleteMany({ where: { accountId: { in: accounts.map(account => account.id) } } });
      await prisma.account.deleteMany({ where: { budgetId: user.budget.id } });
      await prisma.budget.delete({ where: { id: user.budget.id } });
    }
    if (user) await prisma.user.delete({ where: { id: user.id } });
  };
  return { app, token, budget, setup, ownerId, kind, memoryStore, load, execute, cleanup };
};

const currentVersion = async (fixture: Awaited<ReturnType<typeof fixtureFor>>) => (await fixture.load()).version;
const recordIncome = async (fixture: Awaited<ReturnType<typeof fixtureFor>>, amountMinor: number, accountId?: string) => {
  const version = await currentVersion(fixture);
  return (await fixture.app.recordIncome(fixture.token, fixture.budget.id, { amountMinor, accountId, date: '2026-02-10', payee: 'Income', memo: 'Clearing test' }, undefined, options(`income-${randomUUID()}`, version))).data;
};
const recordSpending = async (fixture: Awaited<ReturnType<typeof fixtureFor>>, amountMinor: number) => {
  const version = await currentVersion(fixture);
  return (await fixture.app.recordSpending(fixture.token, fixture.budget.id, { amountMinor, categoryId: fixture.setup.categories[0].id, date: '2026-02-11', payee: 'Grocer', memo: 'Clearing test' }, undefined, options(`spending-${randomUUID()}`, version))).data;
};
const setCleared = async (fixture: Awaited<ReturnType<typeof fixtureFor>>, itemId: string, cleared: boolean, key = `cleared-${randomUUID()}`, expectedVersion?: number) =>
  fixture.app.setTransactionCleared(fixture.token, fixture.budget.id, itemId, { cleared }, undefined, options(key, expectedVersion ?? await currentVersion(fixture)));
const financialFields = (event: any) => {
  const { id, supersedesEventId, createdAt, cleared, ...financial } = event;
  return financial;
};
const budgetingValues = (summary: any) => ({
  accountBalanceMinor: summary.accountBalanceMinor,
  accounts: summary.accounts,
  rta: summary.rta,
  categories: summary.categories,
});
const assertNoClearedOrReconciliationFields = (value: any) => {
  const visit = (item: any) => {
    if (Array.isArray(item)) return item.forEach(visit);
    if (!item || typeof item !== 'object') return;
    for (const [key, child] of Object.entries(item)) {
      assert.doesNotMatch(key, /cleared|reconciliation/i);
      visit(child);
    }
  };
  visit(value);
};
const readSummary = async (fixture: Awaited<ReturnType<typeof fixtureFor>>) => {
  const summary = (await fixture.app.getFinancialSummary(fixture.token, fixture.budget.id, '2026-02')).data;
  assertNoClearedOrReconciliationFields(summary);
  return summary;
};
const readAccountProjection = async (fixture: Awaited<ReturnType<typeof fixtureFor>>) =>
  (await fixture.app.getBudget(fixture.token, fixture.budget.id)).data;
const readItem = async (fixture: Awaited<ReturnType<typeof fixtureFor>>, itemId: string) =>
  (await fixture.app.getTransaction(fixture.token, fixture.budget.id, itemId)).data.item;
const replaceForTest = async (fixture: Awaited<ReturnType<typeof fixtureFor>>, itemId: string, patch: Record<string, unknown>) => {
  const state = await fixture.load();
  const current = state.events.find(event => (event.transactionId ?? event.id) === itemId && ['INCOME', 'SPENDING'].includes(event.kind));
  assert.ok(current);
  const replacement = { ...current, ...patch, id: randomUUID(), supersedesEventId: current.id, createdAt: new Date('2026-09-01T01:00:00.000Z').toISOString() };
  await fixture.execute({
    ownerId: fixture.ownerId, budgetId: fixture.budget.id, command: 'cleared-state-test-fixture', input: { itemId, patch },
    idempotencyKey: `fixture-${randomUUID()}`, expectedVersion: state.version,
    work: (_budget: any, events: any[], _version: number, append: (event: any) => void) => {
      const index = events.findIndex(event => event.id === current.id);
      events.splice(index, 1, replacement);
      append(replacement);
      return { itemId };
    },
  });
};
const updateTransferEffectForTest = async (fixture: Awaited<ReturnType<typeof fixtureFor>>, transferId: string, kind: 'TRANSFER_OUT' | 'TRANSFER_IN', patch: Record<string, unknown>) => {
  const state = await fixture.load();
  const effect = (state.rawEvents ?? state.events).find(event => event.transferId === transferId && event.kind === kind);
  assert.ok(effect);
  if (fixture.memoryStore) {
    const stored = fixture.memoryStore.loadBudget(fixture.ownerId, fixture.budget.id);
    assert.ok(stored);
    fixture.memoryStore.saveBudget(fixture.ownerId, { ...stored, events: stored.events.map(event => event.id === effect.id ? { ...event, ...patch } : event) });
  } else {
    await prisma!.financialEvent.update({ where: { id: effect.id }, data: patch as any });
  }
};
const removeTransferEffectForTest = async (fixture: Awaited<ReturnType<typeof fixtureFor>>, transferId: string, kind: 'TRANSFER_OUT' | 'TRANSFER_IN') => {
  const state = await fixture.load();
  const effect = (state.rawEvents ?? state.events).find(event => event.transferId === transferId && event.kind === kind);
  assert.ok(effect);
  if (fixture.memoryStore) {
    const stored = fixture.memoryStore.loadBudget(fixture.ownerId, fixture.budget.id);
    assert.ok(stored);
    fixture.memoryStore.saveBudget(fixture.ownerId, { ...stored, events: stored.events.filter(event => event.id !== effect.id) });
  } else {
    await prisma!.financialEvent.delete({ where: { id: effect.id } });
  }
};
const withAdapter = (name: string, kind: 'memory' | 'postgres', run: (fixture: Awaited<ReturnType<typeof fixtureFor>>) => Promise<void>) => {
  test(`${name}: ${run.name}`, async () => {
    const fixture = await fixtureFor(kind);
    try { await run(fixture); } finally { await fixture.cleanup(); }
  });
};

test('effective-history read assertion rejects an unpaired transfer effect', () => {
  assert.throws(() => foldEffectiveHistory([
    { id: randomUUID(), kind: 'TRANSFER_OUT', transferId: 'transfer-read-pair', accountId: 'source', amountMinor: 25, businessDate: '2026-02-12', month: '2026-02' },
  ]), /Malformed transfer pairing/);
});

test('effective-history rejects transfer effects missing transferId instead of retaining them', () => {
  assert.throws(() => foldEffectiveHistory([
    { id: randomUUID(), kind: 'TRANSFER_OUT', accountId: 'source', amountMinor: 25, businessDate: '2026-02-12', month: '2026-02' },
  ]), /missing transferId/);
});

for (const adapter of adapters) {
  withAdapter(adapter.name, adapter.kind, async function rejectsDuplicateTransferEffectBeforeWritingReceipt(fixture) {
    const destination = (await fixture.app.createAccount(fixture.token, fixture.budget.id, { name: 'Write-boundary destination', kind: 'checking' }, undefined, options(`write-boundary-account-${adapter.name}`, await currentVersion(fixture)))).data.account;
    const transfer = (await fixture.app.recordTransfer(fixture.token, fixture.budget.id, { sourceAccountId: fixture.setup.account!.id, destinationAccountId: destination.id, amountMinor: 25, date: '2026-02-12' }, undefined, options(`write-boundary-transfer-${adapter.name}`, await currentVersion(fixture)))).data;
    const before = await fixture.load();
    const outgoing = before.events.find(event => event.transferId === transfer.transferId && event.kind === 'TRANSFER_OUT')!;
    const duplicate = { ...outgoing, id: randomUUID(), createdAt: new Date().toISOString() };
    const command = {
      ownerId: fixture.ownerId, budgetId: fixture.budget.id, command: 'duplicate-transfer-effect', input: { transferId: transfer.transferId },
      idempotencyKey: `duplicate-transfer-effect-${adapter.name}`, expectedVersion: before.version,
      work: (_state: any, events: any[], _version: number, append: (event: any) => void) => {
        if (fixture.memoryStore) events.push(duplicate);
        append(duplicate);
        return { rejected: false };
      },
    };

    await assert.rejects(
      () => fixture.execute(command),
      (error: unknown) => error instanceof PersistenceError && error.code === 'CONFLICT',
    );
    const afterFailure = await fixture.load();
    assert.equal(afterFailure.version, before.version);
    assert.deepEqual(afterFailure.events.filter(event => event.transferId === transfer.transferId).map(event => event.kind).sort(), ['TRANSFER_IN', 'TRANSFER_OUT']);

    const retry = await fixture.execute({ ...command, work: () => ({ retried: true }) });
    assert.deepEqual(retry.result, { retried: true }, 'a rejected command must not leave an idempotency receipt');
    assert.equal(retry.version, before.version + 1);
    assert.deepEqual((await fixture.load()).events.filter(event => event.transferId === transfer.transferId).map(event => event.kind).sort(), ['TRANSFER_IN', 'TRANSFER_OUT']);
  });

  withAdapter(adapter.name, adapter.kind, async function rejectsTransferEffectWithoutTransferIdAtWriteBoundary(fixture) {
    const before = await fixture.load();
    const malformed = { id: randomUUID(), kind: 'TRANSFER_OUT', accountId: fixture.setup.account!.id, amountMinor: 25, businessDate: '2026-02-12', month: '2026-02' };
    const command = {
      ownerId: fixture.ownerId, budgetId: fixture.budget.id, command: 'missing-transfer-id', input: { eventId: malformed.id },
      idempotencyKey: `missing-transfer-id-${adapter.name}`, expectedVersion: before.version,
      work: (_state: any, events: any[], _version: number, append: (event: any) => void) => {
        if (fixture.memoryStore) events.push(malformed);
        append(malformed);
        return { rejected: false };
      },
    };

    await assert.rejects(
      () => fixture.execute(command),
      (error: unknown) => error instanceof PersistenceError && error.code === 'CONFLICT',
    );
    assert.equal((await fixture.load()).version, before.version);
    const retry = await fixture.execute({ ...command, work: () => ({ retried: true }) });
    assert.deepEqual(retry.result, { retried: true }, 'a rejected command must not leave an idempotency receipt');
    assert.equal(retry.version, before.version + 1);
    assert.equal((await fixture.load()).events.some(event => event.id === malformed.id), false);
  });
  withAdapter(adapter.name, adapter.kind, async function incomeAndSpendingTransitionsAreNeutral(fixture) {
    const income = await recordIncome(fixture, 200);
    const spending = await recordSpending(fixture, 50);
    const beforeSummary = await readSummary(fixture);
    const beforeAccountProjection = await readAccountProjection(fixture);
    assert.equal(beforeAccountProjection.accounts[0].clearedBalanceMinor, 1000);
    assert.equal((await readItem(fixture, income.id)).clearedState, 'UNCLEARED');
    assert.equal((await readItem(fixture, spending.id)).clearedState, 'UNCLEARED');

    const originalIncome = (await fixture.load()).events.find(event => event.transactionId === income.id)!;
    const originalSpending = (await fixture.load()).events.find(event => event.transactionId === spending.id)!;
    const markedIncome = await setCleared(fixture, income.id, true, `mark-income-${adapter.name}`);
    assert.equal(markedIncome.data.item.clearedState, 'CLEARED');
    assert.equal(markedIncome.data.version, beforeSummary.version + 1);
    assert.deepEqual(financialFields((await fixture.load()).events.find(event => event.transactionId === income.id)!), financialFields(originalIncome));
    let summary = await readSummary(fixture);
    assert.equal((await readAccountProjection(fixture)).accounts[0].clearedBalanceMinor, 1200, 'clearing income adds exactly 200');
    assert.deepEqual(budgetingValues(summary), budgetingValues(beforeSummary));

    const unclearedIncome = await setCleared(fixture, income.id, false, `unmark-income-${adapter.name}`);
    assert.equal(unclearedIncome.data.item.clearedState, 'UNCLEARED');
    assert.deepEqual(financialFields((await fixture.load()).events.find(event => event.transactionId === income.id)!), financialFields(originalIncome));
    summary = await readSummary(fixture);
    assert.equal((await readAccountProjection(fixture)).accounts[0].clearedBalanceMinor, 1000, 'unclearing income returns to the opening balance');
    assert.deepEqual(budgetingValues(summary), budgetingValues(beforeSummary));

    const markedSpending = await setCleared(fixture, spending.id, true, `mark-spending-${adapter.name}`);
    assert.equal(markedSpending.data.item.clearedState, 'CLEARED');
    assert.deepEqual(financialFields((await fixture.load()).events.find(event => event.transactionId === spending.id)!), financialFields(originalSpending));
    summary = await readSummary(fixture);
    assert.equal((await readAccountProjection(fixture)).accounts[0].clearedBalanceMinor, 950, 'clearing spending subtracts exactly 50');
    assert.deepEqual(budgetingValues(summary), budgetingValues(beforeSummary));

    const unclearedSpending = await setCleared(fixture, spending.id, false, `unmark-spending-${adapter.name}`);
    assert.equal(unclearedSpending.data.item.clearedState, 'UNCLEARED');
    assert.deepEqual(financialFields((await fixture.load()).events.find(event => event.transactionId === spending.id)!), financialFields(originalSpending));
    summary = await readSummary(fixture);
    assert.equal((await readAccountProjection(fixture)).accounts[0].clearedBalanceMinor, 1000, 'unclearing spending returns to the opening balance');
    assert.deepEqual(budgetingValues(summary), budgetingValues(beforeSummary));
    const storedIncome = (await fixture.load()).events.find(event => event.transactionId === income.id)!;
    assert.equal((storedIncome as any).clearedState, undefined, 'clearedState is derived and is not persisted');
  });

  withAdapter(adapter.name, adapter.kind, async function rejectsReconciledAndWorkingTransitions(fixture) {
    const reconciled = await recordIncome(fixture, 30);
    await replaceForTest(fixture, reconciled.id, { cleared: true, reconciled: true });
    const reconciledState = await fixture.load();
    const historyItem = await readItem(fixture, reconciled.id);
    assert.equal(historyItem.clearedState, 'RECONCILED');
    for (const [index, cleared] of [true, false].entries()) {
      await assert.rejects(
        () => setCleared(fixture, reconciled.id, cleared, `reconciled-${index}-${adapter.name}`, reconciledState.version),
        (error: unknown) => error instanceof ApiError && error.code === 'CONFLICT',
      );
    }
    assert.equal((await fixture.load()).version, reconciledState.version);

    const working = await recordIncome(fixture, 40);
    await replaceForTest(fixture, working.id, { status: 'WORKING', cleared: false, reconciled: false });
    const workingState = await fixture.load();
    await assert.rejects(
      () => setCleared(fixture, working.id, true, `working-${adapter.name}`, workingState.version),
      (error: unknown) => error instanceof ApiError && error.code === 'CONFLICT' && /WORKING financial event cannot be cleared/.test(error.message),
    );
    assert.equal((await fixture.load()).version, workingState.version);
  });

  withAdapter(adapter.name, adapter.kind, async function editsNonAliasAndClearsArchivedAccountHistory(fixture) {
    const version0 = await currentVersion(fixture);
    const other = (await fixture.app.createAccount(fixture.token, fixture.budget.id, { name: 'Other account', kind: 'checking', openingBalanceMinor: 75 }, undefined, options(`other-account-${adapter.name}`, version0))).data.account;
    const income = await recordIncome(fixture, 40, other.id);
    const edited = await fixture.app.editTransaction(fixture.token, fixture.budget.id, income.id, { amountMinor: 45 }, undefined, options(`edit-non-alias-${adapter.name}`, await currentVersion(fixture)));
    assert.equal(edited.data.item.amountMinor, 45);
    assert.notEqual(other.id, fixture.setup.account!.id, 'the edited transaction is not on the compatibility alias account');

    await fixture.app.archiveAccount(fixture.token, fixture.budget.id, other.id, undefined, options(`archive-other-${adapter.name}`, await currentVersion(fixture)));
    const before = await readSummary(fixture);
    assert.equal((await readAccountProjection(fixture)).accounts.find((account: any) => account.id === other.id).clearedBalanceMinor, 75);
    const transition = await setCleared(fixture, income.id, true, `clear-archived-${adapter.name}`);
    assert.equal(transition.data.item.clearedState, 'CLEARED');
    const after = await readSummary(fixture);
    assert.equal((await readAccountProjection(fixture)).accounts.find((account: any) => account.id === other.id).clearedBalanceMinor, 120, 'archived account cleared balance moves by the income effect');
    assert.deepEqual(budgetingValues(after), budgetingValues(before));
  });

  withAdapter(adapter.name, adapter.kind, async function clearsBothTransferEffectsWithoutChangingFinancialContent(fixture) {
    const version0 = await currentVersion(fixture);
    const source = (await fixture.app.createAccount(fixture.token, fixture.budget.id, { name: 'Transfer source', kind: 'checking', openingBalanceMinor: 300 }, undefined, options(`transfer-source-${adapter.name}`, version0))).data.account;
    const destination = fixture.setup.account!;
    const transfer = (await fixture.app.recordTransfer(fixture.token, fixture.budget.id, { sourceAccountId: source.id, destinationAccountId: destination.id, amountMinor: 125, date: '2026-02-12' }, undefined, options(`transfer-seed-${adapter.name}`, await currentVersion(fixture)))).data;
    await fixture.app.archiveAccount(fixture.token, fixture.budget.id, source.id, undefined, options(`archive-transfer-source-${adapter.name}`, await currentVersion(fixture)));
    const before = await fixture.load();
    const beforeSummary = await readSummary(fixture);
    const originalTransfer = before.transfers!.find(candidate => candidate.id === transfer.transferId)!;
    const originalEffects = (before.rawEvents ?? before.events).filter(event => event.transferId === transfer.transferId);
    assert.deepEqual(originalEffects.map(event => event.kind).sort(), ['TRANSFER_IN', 'TRANSFER_OUT']);
    assert.equal((await readItem(fixture, transfer.transferId)).clearedState, 'UNCLEARED');

    const cleared = await setCleared(fixture, transfer.transferId, true, `clear-transfer-${adapter.name}`);
    assert.equal(cleared.data.item.clearedState, 'CLEARED');
    let state = await fixture.load();
    let effects = state.events.filter(event => event.transferId === transfer.transferId);
    assert.deepEqual(effects.map(event => event.kind).sort(), ['TRANSFER_IN', 'TRANSFER_OUT']);
    assert.ok(effects.every(event => event.cleared === true));
    assert.ok(effects.every(event => originalEffects.some(original => original.kind === event.kind && event.supersedesEventId === original.id)));
    for (const effect of effects) {
      const original = originalEffects.find(candidate => candidate.kind === effect.kind);
      assert.ok(original);
      assert.deepEqual(financialFields(effect), financialFields(original), 'clearing changes no transfer effect financial content');
    }
    assert.deepEqual(state.transfers!.find(candidate => candidate.id === transfer.transferId), originalTransfer);
    const afterClear = await readSummary(fixture);
    const afterClearAccounts = await readAccountProjection(fixture);
    assert.equal(afterClearAccounts.accounts.find((account: any) => account.id === source.id).clearedBalanceMinor, 175, 'the archived source balance moves by the signed outgoing effect');
    assert.equal(afterClearAccounts.accounts.find((account: any) => account.id === destination.id).clearedBalanceMinor, 1125, 'the destination cleared balance moves by the signed incoming effect');
    assert.deepEqual(budgetingValues(afterClear), budgetingValues(beforeSummary));

    const uncleared = await setCleared(fixture, transfer.transferId, false, `unclear-transfer-${adapter.name}`);
    assert.equal(uncleared.data.item.clearedState, 'UNCLEARED');
    const afterRoundTrip = await readSummary(fixture);
    const afterRoundTripAccounts = await readAccountProjection(fixture);
    assert.equal(afterRoundTripAccounts.accounts.find((account: any) => account.id === source.id).clearedBalanceMinor, 300);
    assert.equal(afterRoundTripAccounts.accounts.find((account: any) => account.id === destination.id).clearedBalanceMinor, 1000);
    assert.deepEqual(budgetingValues(afterRoundTrip), budgetingValues(beforeSummary));

    await setCleared(fixture, transfer.transferId, true, `clear-transfer-again-${adapter.name}`);
    state = await fixture.load();
    effects = state.events.filter(event => event.transferId === transfer.transferId);
    assert.equal(effects.length, 2, 'two successive transitions retain exactly one effective effect of each kind');
    assert.ok(effects.every(event => event.cleared === true));
    assert.deepEqual(state.transfers!.find(candidate => candidate.id === transfer.transferId), originalTransfer);
    assert.equal((await readItem(fixture, transfer.transferId)).clearedState, 'CLEARED');
    const finalSummary = await readSummary(fixture);
    const finalAccountProjection = await readAccountProjection(fixture);
    assert.equal(finalAccountProjection.accounts.find((account: any) => account.id === source.id).clearedBalanceMinor, 175);
    assert.equal(finalAccountProjection.accounts.find((account: any) => account.id === destination.id).clearedBalanceMinor, 1125);
    assert.deepEqual(budgetingValues(finalSummary), budgetingValues(beforeSummary));
  });

  withAdapter(adapter.name, adapter.kind, async function rejectsTransferClearingWhenEffectsDisagreeOnClearedState(fixture) {
    const destination = (await fixture.app.createAccount(fixture.token, fixture.budget.id, { name: 'Transfer destination', kind: 'checking' }, undefined, options(`mismatch-destination-${adapter.name}`, await currentVersion(fixture)))).data.account;
    const transfer = (await fixture.app.recordTransfer(fixture.token, fixture.budget.id, { sourceAccountId: fixture.setup.account!.id, destinationAccountId: destination.id, amountMinor: 25, date: '2026-02-12' }, undefined, options(`mismatch-transfer-${adapter.name}`, await currentVersion(fixture)))).data;
    if (fixture.memoryStore) {
      await assert.rejects(() => updateTransferEffectForTest(fixture, transfer.transferId, 'TRANSFER_IN', { cleared: true }), (error: unknown) => error instanceof PersistenceError && error.code === 'CONFLICT');
      return;
    }
    await updateTransferEffectForTest(fixture, transfer.transferId, 'TRANSFER_IN', { cleared: true });
    await assert.rejects(
      () => setCleared(fixture, transfer.transferId, false, `reject-mismatch-${adapter.name}`),
      /Malformed transfer pairing.*cleared state/,
    );
  });

  withAdapter(adapter.name, adapter.kind, async function rejectsTransferWithoutExactlyOneEffectOfEachKind(fixture) {
    const destination = (await fixture.app.createAccount(fixture.token, fixture.budget.id, { name: 'Transfer destination', kind: 'checking' }, undefined, options(`missing-destination-${adapter.name}`, await currentVersion(fixture)))).data.account;
    const transfer = (await fixture.app.recordTransfer(fixture.token, fixture.budget.id, { sourceAccountId: fixture.setup.account!.id, destinationAccountId: destination.id, amountMinor: 25, date: '2026-02-12' }, undefined, options(`missing-transfer-${adapter.name}`, await currentVersion(fixture)))).data;
    if (fixture.memoryStore) {
      await assert.rejects(() => removeTransferEffectForTest(fixture, transfer.transferId, 'TRANSFER_IN'), (error: unknown) => error instanceof PersistenceError && error.code === 'CONFLICT');
      return;
    }
    await removeTransferEffectForTest(fixture, transfer.transferId, 'TRANSFER_IN');
    await assert.rejects(
      () => setCleared(fixture, transfer.transferId, true, `reject-unpaired-${adapter.name}`),
      /Malformed transfer pairing/,
    );
  });

  withAdapter(adapter.name, adapter.kind, async function replaysIdempotentlyAndRejectsPayloadReuseAndStaleVersions(fixture) {
    const income = await recordIncome(fixture, 60);
    const expectedVersion = await currentVersion(fixture);
    const key = `clear-replay-${adapter.name}`;
    const first = await setCleared(fixture, income.id, true, key, expectedVersion);
    const stateAfterFirst = await fixture.load();
    const replay = await setCleared(fixture, income.id, true, key, expectedVersion);
    const stateAfterReplay = await fixture.load();
    assert.deepEqual(replay.data, first.data);
    assert.deepEqual(stateAfterReplay.events, stateAfterFirst.events, 'replay creates no duplicate effective replacement');
    assert.deepEqual(stateAfterReplay.rawEvents, stateAfterFirst.rawEvents, 'replay creates no duplicate durable replacement');
    assert.equal(stateAfterReplay.version, stateAfterFirst.version);

    await assert.rejects(
      () => setCleared(fixture, income.id, false, key, expectedVersion),
      (error: unknown) => error instanceof ApiError && error.code === 'CONFLICT',
    );
    assert.deepEqual((await fixture.load()).events, stateAfterReplay.events);

    const staleVersion = await currentVersion(fixture);
    await recordIncome(fixture, 10);
    await assert.rejects(
      () => setCleared(fixture, income.id, false, `stale-clear-${adapter.name}`, staleVersion),
      (error: unknown) => error instanceof ApiError && error.code === 'CONFLICT',
    );
  });

  withAdapter(adapter.name, adapter.kind, async function exposesTheClearedRouteAndDerivedHistoryState(fixture) {
    const income = await recordIncome(fixture, 25);
    const server = createServer(fixture.app);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const url = `http://127.0.0.1:${address.port}/api/v1/budgets/${fixture.budget.id}/transactions/${income.id}/cleared`;
    const init = {
      method: 'PATCH',
      headers: { cookie: `sid=${fixture.token}`, 'content-type': 'application/json', 'Idempotency-Key': `http-clear-${adapter.name}`, 'If-Match': `"${await currentVersion(fixture)}"` },
      body: JSON.stringify({ cleared: true }),
    };
    try {
      const response = await fetch(url, init);
      assert.equal(response.status, 200);
      const result = (await response.json() as any).data;
      assert.equal(result.item.clearedState, 'CLEARED');
      assert.equal(result.version, 2);
      const replay = await fetch(url, init);
      assert.deepEqual((await replay.json() as any).data, result);
      const history = await fetch(`http://127.0.0.1:${address.port}/api/v1/budgets/${fixture.budget.id}/transactions`, { headers: { cookie: `sid=${fixture.token}` } });
      assert.equal((await history.json() as any).data.items[0].clearedState, 'CLEARED');
      const invalid = await fetch(url, { ...init, headers: { ...init.headers, 'Idempotency-Key': `invalid-clear-${adapter.name}`, 'If-Match': '"2"' }, body: JSON.stringify({ cleared: 'true' }) });
      assert.equal(invalid.status, 400);
    } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
  });
}

// Adversarial authorization check: widening eligibility to the transaction's own account
// must not widen it past the budget boundary. Two real budgets are created through the
// public API and one attempts to clear the other's transaction.
const crossBudgetAttempt = async (kind: 'memory' | 'postgres') => {
  const victim = await fixtureFor(kind);
  const attacker = await fixtureFor(kind);
  try {
    const income = await recordIncome(victim, 200);
    assert.equal((await readItem(victim, income.id)).clearedState, 'UNCLEARED');

    // The victim's transaction identity addressed from the attacker's own budget.
    // A valid If-Match is supplied so the version gate cannot mask the lookup result.
    const attackerVersion = await currentVersion(attacker);
    await assert.rejects(
      () => attacker.app.setTransactionCleared(attacker.token, attacker.budget.id, income.id, { cleared: true }, undefined, options(`cross-own-${randomUUID()}`, attackerVersion)),
      (error: unknown) => error instanceof ApiError && error.code === 'NOT_FOUND',
      'a foreign transaction identity must not be resolvable from another budget',
    );

    // The victim's budget addressed with the attacker's session.
    await assert.rejects(
      () => attacker.app.setTransactionCleared(attacker.token, victim.budget.id, income.id, { cleared: true }, undefined, options(`cross-budget-${randomUUID()}`, attackerVersion)),
      (error: unknown) => error instanceof ApiError && error.code === 'NOT_FOUND',
      'an unauthorized budget must not disclose or mutate',
    );

    // Neither attempt may have mutated the victim.
    assert.equal((await readItem(victim, income.id)).clearedState, 'UNCLEARED', 'the victim transaction must remain uncleared');
    assert.equal((await readAccountProjection(victim)).accounts[0].clearedBalanceMinor, 1000, 'the victim cleared balance must be unchanged');
  } finally { await victim.cleanup(); await attacker.cleanup(); }
};

for (const adapter of adapters) {
  test(`cleared route preserves authorization boundaries (${adapter.name})`, async () => { await crossBudgetAttempt(adapter.kind); });
}

after(async () => { if (prisma) await prisma.$disconnect(); });
