import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { BudgetApp } from '../src/app.ts';
import { InMemoryBudgetStore, InMemoryFinancialStore } from '../src/persistence/in-memory-budget-store.ts';
import { FinancialStore } from '../src/persistence/financial-store.ts';
import { PrismaBudgetStore } from '../src/persistence/budget-store.ts';
import { createServer } from '../src/server.ts';

const enabled = Boolean(process.env.DATABASE_URL);
const prisma = enabled ? new (await import('@prisma/client')).PrismaClient() : null;
after(async () => { await prisma?.$disconnect(); });
const now = () => Date.parse('2026-01-01T00:00:00.000Z');
const opts = (idempotencyKey: string, expectedVersion?: number) => ({ idempotencyKey, expectedVersion });
const definition = (accountId: string, categoryId: string | null = null, startDate = '2026-01-15') => ({ accountId, categoryId, flow: categoryId ? 'SPENDING' as const : 'INCOME' as const, amountMinor: 500, payee: 'Payee', memo: 'Memo', dayOfMonth: 15, intervalMonths: 1, startDate });
const scrub = (value: any): any => Array.isArray(value) ? value.map(scrub) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'version' && key !== 'id' && !key.endsWith('Id') && key !== 'createdAt').map(([key, nested]) => [key, scrub(nested)])) : value;
const scheduleDerivedKeys = new Set(['schedules', 'schedule', 'scheduledTransaction', 'scheduleId', 'isScheduled']);
const hasSchedules = (value: any): boolean => Array.isArray(value) ? value.some(hasSchedules) : value && typeof value === 'object' ? Object.entries(value).some(([key, nested]) => scheduleDerivedKeys.has(key) || hasSchedules(nested)) : false;
const scheduledTransactionFields = (schema: string): string[] => {
  const model = schema.match(/^model ScheduledTransaction \{\r?\n([\s\S]*?)^\}/m)?.[1];
  assert.ok(model, 'ScheduledTransaction model must exist');
  return model.split(/\r?\n/).flatMap(line => { const name = line.trim().match(/^([A-Za-z_]\w*)\s+/)?.[1]; return name ? [name] : []; }).sort();
};
const scheduledTransactionFieldSet = ['id', 'budgetId', 'accountId', 'categoryId', 'flow', 'amountMinor', 'payee', 'memo', 'dayOfMonth', 'intervalMonths', 'startDate', 'createdAt', 'updatedAt', 'budget', 'account', 'category'].sort();

async function fixture(kind: 'CASH' | 'CHECKING' = 'CASH') {
  const email = `${randomUUID()}@example.test`;
  const budgetStore = enabled ? new PrismaBudgetStore(prisma!) : new InMemoryBudgetStore();
  const financialStore = enabled ? new FinancialStore(prisma!) : new InMemoryFinancialStore(budgetStore as InMemoryBudgetStore);
  const app = new BudgetApp(now, budgetStore, financialStore as any);
  let ownerId = '';
  try {
    const user: any = await app.register(email, 'correct horse'); ownerId = user.data.id;
    const token = (await app.signIn(email, 'correct horse') as any).data.sessionToken;
    const budget = (await app.createBudget(token) as any).data;
    const ready = (await app.saveSetup(token, budget.id, { openingBalanceMinor: 10000, accountType: kind.toLowerCase(), categories: ['Food'] }) as any).data;
    const f = { app, token, budget, ownerId, accountId: ready.accounts[0].id, categoryId: ready.categories[0].id, budgetStore, financialStore, async state() { return financialStore.load(ownerId, budget.id); }, async add(input = definition(ready.accounts[0].id, ready.categories[0].id)) { const state = await financialStore.load(ownerId, budget.id); return app.createSchedule(token, budget.id, input, undefined, opts(`schedule-${randomUUID()}`, state.version)); }, async generate(cutoffDate: string, key = `request-${randomUUID()}`) { return app.generateScheduledTransactions(token, budget.id, { cutoffDate }, undefined, opts(key)); }, async receipts() { return enabled ? prisma!.commandReceipt.count({ where: { budgetId: budget.id } }) : ((budgetStore as any).receipts.get(budget.id)?.size ?? 0); }, async close() { if (!enabled) return; await prisma!.scheduledTransaction.deleteMany({ where: { budgetId: budget.id } }); await prisma!.commandReceipt.deleteMany({ where: { budgetId: budget.id } }); await prisma!.financialEvent.deleteMany({ where: { budgetId: budget.id } }); await prisma!.transfer.deleteMany({ where: { budgetId: budget.id } }); await prisma!.reconciliation.deleteMany({ where: { budgetId: budget.id } }); await prisma!.categoryTarget.deleteMany({ where: { budgetId: budget.id } }); await prisma!.transactionDeletionAudit.deleteMany({ where: { budgetId: budget.id } }); const accounts = await prisma!.account.findMany({ where: { budgetId: budget.id }, select: { id: true } }); await prisma!.openingBalance.deleteMany({ where: { accountId: { in: accounts.map(a => a.id) } } }); await prisma!.category.deleteMany({ where: { budgetId: budget.id } }); await prisma!.account.deleteMany({ where: { budgetId: budget.id } }); await prisma!.budget.delete({ where: { id: budget.id } }); await prisma!.session.deleteMany({ where: { userId: ownerId } }); await prisma!.user.delete({ where: { id: ownerId } }); } };
    return f;
  } catch (error) { if (enabled && ownerId) { await prisma!.session.deleteMany({ where: { userId: ownerId } }); await prisma!.user.delete({ where: { id: ownerId } }); } throw error; }
}
async function adapters(t: any, run: (f: Awaited<ReturnType<typeof fixture>>, t: any) => Promise<void>, kind: 'CASH' | 'CHECKING' = 'CASH') {
  for (const adapter of enabled ? ['memory', 'postgres'] : ['memory']) await t.test(adapter, async (nested: any) => { const f = await fixture(kind); try { await run(f, nested); } finally { await f.close(); } });
}
const projections = async (f: Awaited<ReturnType<typeof fixture>>) => ({ summary: (await f.app.getFinancialSummary(f.token, f.budget.id, '2026-01')).data, dashboard: (await f.app.getDashboard(f.token, f.budget.id, '2026-01')).data, monthly: (await f.app.getMonthlyReport(f.token, f.budget.id, '2026-01')).data, series: (await f.app.getMultiMonthReport(f.token, f.budget.id, '2026-01', '2026-02')).data });

test('1. one eligible occurrence creates one ordinary transaction with schedule fields and effects', async t => adapters(t, async f => {
  const income = (await f.app.recordIncome(f.token, f.budget.id, { amountMinor: 200, date: '2026-01-01', accountId: f.accountId }, undefined, opts(`reconciled-income-${randomUUID()}`))).data;
  await f.app.setTransactionCleared(f.token, f.budget.id, income.id, { cleared: true }, undefined, opts(`clear-income-${randomUUID()}`, (await f.state()).version));
  await f.app.reconcileAccount(f.token, f.budget.id, f.accountId, { confirmedClearedBalanceMinor: 10200, date: '2026-01-10' }, undefined, opts(`reconcile-income-${randomUUID()}`, (await f.state()).version));
  await f.add(); const result = await f.generate('2026-01-15'); assert.deepEqual([result.data.occurrencesConsidered, result.data.created, result.data.replayed], [1, 1, 0]);
  const state = await f.state(); assert.equal(state.reconciliations?.length, 1); assert.ok(state.events.some(event => event.kind === 'INCOME' && event.reconciled));
  const event = state.events.find(event => event.kind === 'SPENDING' && event.businessDate === '2026-01-15')!;
  assert.deepEqual([event.kind, event.status, event.accountId, event.categoryId, event.amountMinor, event.payee, event.memo, event.businessDate, event.month], ['SPENDING', 'POSTED', f.accountId, f.categoryId, 500, 'Payee', 'Memo', '2026-01-15', '2026-01']);
  assert.equal(state.accounts?.find(a => a.id === f.accountId)?.balanceMinor, 9700); const summary = (await f.app.getFinancialSummary(f.token, f.budget.id, '2026-01')).data;
  assert.equal(summary.categories.find((c: any) => c.id === f.categoryId)!.activityMinor, -500);
}));
test('2. occurrences after the inclusive cut-off are not generated', async t => adapters(t, async f => { await f.add(); assert.equal((await f.state()).schedules?.length, 1); assert.equal((await f.generate('2026-01-14')).data.occurrencesConsidered, 0); assert.equal((await f.state()).events.length, 0); }));
test('3. the cut-off exactly on an occurrence includes it', async t => adapters(t, async f => { await f.add(); assert.equal((await f.generate('2026-01-15')).data.created, 1); assert.equal((await f.state()).events.length, 1); }));
test('4. generated cash-account transactions are explicitly cleared', async t => adapters(t, async f => { await f.add(); await f.generate('2026-01-15'); assert.equal((await f.state()).events[0]!.cleared, true); }));
test('5. generated non-cash transactions are explicitly uncleared', async t => adapters(t, async f => { await f.add(); await f.generate('2026-01-15'); assert.equal((await f.state()).events[0]!.cleared, false); }, 'CHECKING'));
test('5b. missing and unknown loaded account kinds never produce cleared generated transactions', async t => adapters(t, async f => {
  await f.add(definition(f.accountId)); await f.add(definition(f.accountId, null, '2026-02-15'));
  const store = f.financialStore as any; const load = store.load.bind(store); let kind: any;
  store.load = async (...args: any[]) => { const state = await load(...args); state.accounts = state.accounts?.map((account: any) => ({ ...account, kind })); return state; };
  kind = undefined; await f.generate('2026-01-15', `missing-kind-${randomUUID()}`);
  kind = 'UNKNOWN'; await f.generate('2026-02-15', `unknown-kind-${randomUUID()}`); store.load = load;
  const events = await f.state(); assert.equal(events.events.find((event: any) => event.businessDate === '2026-01-15')?.cleared, false);
  assert.equal(events.events.find((event: any) => event.businessDate === '2026-02-15')?.cleared, false);
}));
test('6. public income and spending routes remain explicitly uncleared', async t => adapters(t, async f => {
  const server = createServer(f.app); await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  try { const address = server.address(); assert.ok(address && typeof address !== 'string'); const url = `http://127.0.0.1:${address.port}/api/v1/budgets/${f.budget.id}`;
    for (const [action, body] of [['income', { amountMinor: 200, date: '2026-01-15', accountId: f.accountId }], ['spending', { amountMinor: 100, date: '2026-01-15', accountId: f.accountId, categoryId: f.categoryId }]] as const) assert.equal((await fetch(`${url}/${action}`, { method: 'POST', headers: { cookie: `sid=${f.token}`, 'content-type': 'application/json', 'idempotency-key': `${action}-${randomUUID()}` }, body: JSON.stringify(body) })).status, 201);
    assert.deepEqual((await f.state()).events.map(e => e.cleared), [false, false]);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
}));
test('7. generated transactions project exactly like ordinary transactions', async t => adapters(t, async f => {
  const generated = f; await generated.add(); await generated.generate('2026-01-15'); const generatedState = await generated.state();
  const ordinary = await fixture('CHECKING'); try { await ordinary.app.recordSpending(ordinary.token, ordinary.budget.id, { amountMinor: 500, categoryId: ordinary.categoryId, accountId: ordinary.accountId, date: '2026-01-15', payee: 'Payee', memo: 'Memo' }, undefined, opts(`ordinary-${randomUUID()}`));
    const ordinaryState = await ordinary.state(); assert.deepEqual(scrub(generatedState.accounts), scrub(ordinaryState.accounts)); assert.deepEqual(scrub(await projections(generated)), scrub(await projections(ordinary)));
  } finally { await ordinary.close(); }
}, 'CHECKING'));
test('8. replaying the same range leaves transactions, effects, and receipt counts unchanged', async t => adapters(t, async f => {
  await f.add(); const key = `same-${randomUUID()}`; await f.generate('2026-01-15', key); const before = await f.state(); const receipts = await f.receipts();
  await assert.rejects(f.generate('2026-02-15', key), (error: any) => error.code === 'CONFLICT'); assert.deepEqual((await f.state()).events, before.events); assert.equal(await f.receipts(), receipts);
  const replay = await f.generate('2026-01-15', key); const afterState = await f.state(); assert.deepEqual(afterState.events, before.events); assert.deepEqual(afterState.accounts, before.accounts); assert.equal(await f.receipts(), receipts); assert.deepEqual([replay.data.occurrencesConsidered, replay.data.created, replay.data.replayed], [1, 1, 0]);
}));
test('9. an overlapping range replays old occurrences and creates only the new one', async t => adapters(t, async f => {
  await f.add(); await f.generate('2026-01-15'); const result = await f.generate('2026-02-15'); const events = (await f.state()).events;
  assert.deepEqual([result.data.occurrencesConsidered, result.data.created, result.data.replayed], [2, 1, 1]); assert.deepEqual(events.map(e => e.businessDate).sort(), ['2026-01-15', '2026-02-15']);
}));
test('10. retry after a deliberate partial failure creates only missing occurrences', async t => adapters(t, async f => {
  await f.add(definition(f.accountId)); const store = f.financialStore as any; const execute = store.execute.bind(store); let incomeCalls = 0;
  store.execute = (command: any) => { if (command.command === 'income' && ++incomeCalls === 2) throw new Error('deliberate second-occurrence failure'); return execute(command); };
  const key = `partial-${randomUUID()}`; await assert.rejects(f.generate('2026-03-15', key), /deliberate second-occurrence failure/); store.execute = execute;
  assert.deepEqual((await f.state()).events.map(e => e.businessDate), ['2026-01-15']); const result = await f.generate('2026-03-15', key); const dates = (await f.state()).events.map(e => e.businessDate).sort();
  assert.deepEqual(dates, ['2026-01-15', '2026-02-15', '2026-03-15']); assert.deepEqual([result.data.created, result.data.replayed], [2, 1]);
}));
test('11. concurrent attempts create one occurrence and the second receipt attempt replays', async t => adapters(t, async f => {
  await f.add(); const store = f.financialStore as any; const execute = store.execute.bind(store); const attemptOutcomes: string[] = [];
  store.execute = async (command: any) => {
    if (!command.idempotencyKey.startsWith('sch:')) return execute(command);
    const attempt = attemptOutcomes.length; attemptOutcomes.push('pending');
    const result = await execute(command); attemptOutcomes[attempt] = result.replayed ? 'replay' : 'created'; return result;
  };
  const outcomes = await Promise.allSettled([f.generate('2026-01-15', `concurrent-a-${randomUUID()}`), f.generate('2026-01-15', `concurrent-b-${randomUUID()}`)]);
  const events = (await f.state()).events; assert.equal(events.filter(event => event.transactionId).length, 1);
  assert.deepEqual(attemptOutcomes, ['created', 'replay']); assert.ok(outcomes.every(outcome => outcome.status === 'fulfilled'));
  const results = outcomes.map(outcome => (outcome as PromiseFulfilledResult<any>).value.data);
  assert.deepEqual({ created: results.reduce((sum, result) => sum + result.created, 0), replayed: results.reduce((sum, result) => sum + result.replayed, 0) }, { created: 1, replayed: 1 });
}));
test('12. one request generates a multi-month backlog in date order', async t => adapters(t, async f => {
  await f.add({ ...definition(f.accountId, null, '2025-10-01'), dayOfMonth: 1 }); const store = f.financialStore as any; const execute = store.execute.bind(store); const keys: string[] = [];
  store.execute = (command: any) => { if (command.idempotencyKey.startsWith('sch:')) keys.push(command.idempotencyKey); return execute(command); };
  assert.equal((await f.generate('2026-01-01')).data.created, 4); store.execute = execute;
  assert.deepEqual(keys.map(key => key.slice(-10)), ['2025-10-01', '2025-11-01', '2025-12-01', '2026-01-01']);
  assert.deepEqual((await f.state()).events.map(e => e.businessDate).sort(), ['2025-10-01', '2025-11-01', '2025-12-01', '2026-01-01']);
}));
test('13. schedules on the same date have distinct occurrence identities', async t => adapters(t, async f => {
  const first = await f.add(definition(f.accountId)); const second = await f.add(definition(f.accountId, f.categoryId)); assert.equal((await f.generate('2026-01-15')).data.created, 2);
  const keys = enabled ? (await prisma!.commandReceipt.findMany({ where: { budgetId: f.budget.id }, select: { idempotencyKey: true } })).map(r => r.idempotencyKey) : [...(f.budgetStore as any).receipts.get(f.budget.id).keys()];
  assert.ok(keys.includes(`sch:${first.data.schedule.id}:2026-01-15`)); assert.ok(keys.includes(`sch:${second.data.schedule.id}:2026-01-15`)); assert.equal((await f.state()).events.length, 2);
}));
test('14. summaries, dashboard, and both reports omit schedules while schedules exist', async t => adapters(t, async f => {
  await f.add(); for (const [name, value] of Object.entries(await projections(f))) assert.equal(hasSchedules(value), false, `${name} exposed schedules`);
}));
test('15. schedule creation and a pre-occurrence generation are financially neutral', async t => adapters(t, async f => {
  const before = await f.state(); const beforeProjection = await projections(f); await f.add(); const scheduled = await f.state(); assert.deepEqual(scrub(scheduled.events), scrub(before.events)); assert.deepEqual(scrub(scheduled.accounts), scrub(before.accounts));
  await f.generate('2025-12-31'); const after = await f.state(); assert.equal(after.events.length, before.events.length); assert.deepEqual(scrub(after.accounts), scrub(before.accounts)); assert.deepEqual(scrub(await projections(f)), scrub(beforeProjection));
}));
test('16. POST generates while DELETE treats generate as an absent schedule identity', async t => adapters(t, async f => {
  await f.add(); const server = createServer(f.app); await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  try {
    const address = server.address(); assert.ok(address && typeof address !== 'string'); const url = `http://127.0.0.1:${address.port}/api/v1/budgets/${f.budget.id}/schedules/generate`;
    const deleteKey = `delete-${randomUUID()}`;
    const beforeDelete = await f.state(); const deleteHeaders = { cookie: `sid=${f.token}`, 'idempotency-key': deleteKey, 'if-match': String(beforeDelete.version) };
    const deleted = await fetch(url, { method: 'DELETE', headers: deleteHeaders }); assert.equal(deleted.status, 404); assert.equal((await f.state()).events.length, 0);
    const response = await fetch(url, { method: 'POST', headers: { cookie: `sid=${f.token}`, 'content-type': 'application/json', 'idempotency-key': `route-${randomUUID()}` }, body: JSON.stringify({ cutoffDate: '2026-01-15' }) });
    assert.equal(response.status, 200); assert.equal((await response.json() as any).data.created, 1); assert.equal((await f.state()).events.length, 1);
    const afterPost = await f.state(); const deleteAfterGeneration = await fetch(url, { method: 'DELETE', headers: { ...deleteHeaders, 'if-match': String(afterPost.version) } }); assert.equal(deleteAfterGeneration.status, 404); assert.equal((await f.state()).events.length, 1);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
}));
test('17. scheduled-transaction model has exactly the known persistence fields', () => {
  const schema = readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');
  const genericMarkerSchema = schema.replace(/(^model ScheduledTransaction \{[\s\S]*?)(^\})/m, '$1  progressCount Int\n$2');
  assert.notEqual(genericMarkerSchema, schema);
  assert.deepEqual(scheduledTransactionFields(schema), scheduledTransactionFieldSet);
  assert.throws(() => assert.deepEqual(scheduledTransactionFields(genericMarkerSchema), scheduledTransactionFieldSet));
});
