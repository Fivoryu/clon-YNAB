import test from 'node:test';
import assert from 'node:assert/strict';
import { BudgetApp } from '../src/app.ts';
import { InMemorySimulationStore } from '../src/persistence/in-memory-simulation-store.ts';
import { SimulationPersistenceError, canonicalSimulationDigest, type SimulationCommandInput } from '../src/persistence/simulation-store.ts';

const ownerId = 'owner-1';
const budgetId = 'budget-1';
const command = (key: string, expectedRevision?: number): SimulationCommandInput => ({
  ownerId, budgetId, runId: undefined, command: 'START', idempotencyKey: key, expectedRevision,
  actorId: ownerId, requestId: `${key}-request`, clock: () => 1_700_000_000_000,
});

const create = (store: InMemorySimulationStore, key = 'create-1') => store.createRun({
  ownerId, budgetId, profileCode: 'BO_INSPIRED_A', fixtureVersion: '2026-01', seed: 'parity-seed',
  idempotencyKey: key, actorId: ownerId, requestId: `${key}-request`, clock: () => 1_700_000_000_000,
});

const advance = (store: InMemorySimulationStore, runId: string, key: string, expectedRevision: number) => store.execute({
  ...command(key, expectedRevision), runId, command: 'ADVANCE',
});

test('in-memory store enforces owner scope and canonical SHA-256 idempotency digests', async () => {
  const store = new InMemorySimulationStore([{ ownerId, budgetId }]);
  assert.equal(canonicalSimulationDigest({ b: 2, a: 1 }), canonicalSimulationDigest({ a: 1, b: 2 }));
  await assert.rejects(() => store.listProfiles('foreign-owner', budgetId), (error: unknown) => error instanceof SimulationPersistenceError && error.code === 'NOT_FOUND');
  const first = await create(store);
  assert.equal(first.run.state, 'DISCONNECTED');
  const replay = await create(store);
  assert.deepEqual(replay, first);
  await assert.rejects(() => store.createRun({ ownerId, budgetId, profileCode: 'BO_INSPIRED_A', fixtureVersion: '2026-01', seed: 'different-seed', idempotencyKey: 'create-1', actorId: ownerId, requestId: 'conflict-request', clock: () => 1_700_000_000_000 }), (error: unknown) => error instanceof SimulationPersistenceError && error.code === 'CONFLICT');
  await assert.rejects(() => store.loadRun({ ownerId: 'foreign-owner', budgetId, runId: first.run.runId! }), (error: unknown) => error instanceof SimulationPersistenceError && error.code === 'NOT_FOUND');
});

test('in-memory store serializes commands, clones projections, and preserves replay parity', async () => {
  const store = new InMemorySimulationStore([{ ownerId, budgetId }]);
  const created = await create(store);
  const runId = created.run.runId!;
  const started = await store.execute({ ...command('start-1', 0), runId, command: 'START' });
  assert.equal(started.run.state, 'CONNECTING');
  const [first, second] = await Promise.all([
    advance(store, runId, 'advance-1', 1),
    advance(store, runId, 'advance-2', 1),
  ].map(promise => promise.then(value => ({ ok: true as const, value }), error => ({ ok: false as const, error }))));
  assert.equal([first, second].filter(item => item.ok).length, 1);
  const accepted = first.ok ? first.value : (second as { ok: true; value: typeof first extends { value: infer V } ? V : never }).value;
  const rejected = first.ok ? second : first;
  assert.equal(rejected.ok, false);
  if (!rejected.ok) assert.ok(rejected.error instanceof SimulationPersistenceError && rejected.error.code === 'CONFLICT');
  const replay = await advance(store, runId, 'advance-1', 1);
  assert.deepEqual(replay, accepted);
  const loaded = await store.loadRun({ ownerId, budgetId, runId });
  loaded.state = 'SUCCEEDED';
  assert.notEqual((await store.loadRun({ ownerId, budgetId, runId })).state, 'SUCCEEDED');
  const candidates = await store.listCandidates({ ownerId, budgetId, runId });
  candidates.push({} as never);
  assert.equal((await store.listCandidates({ ownerId, budgetId, runId })).length, candidates.length - 1);
});

test('in-memory and durable adapters expose the same normalized simulation protocol', async () => {
  const store = new InMemorySimulationStore([{ ownerId, budgetId }]);
  const created = await create(store, 'normalized-create');
  let revision = created.simulationRevision;
  const outputs = [created.outcome];
  for (const [index, name] of (['START', 'ADVANCE', 'ADVANCE', 'ADVANCE'] as const).entries()) {
    const result = await store.execute({ ...command(`normalized-${index}`, revision), runId: created.run.runId, command: name });
    outputs.push(result.outcome);
    revision = result.simulationRevision;
  }
  assert.deepEqual(outputs, ['CREATED', 'STARTED', 'ADVANCED', 'ADVANCED', 'PARTIAL']);
  assert.ok((await store.listCheckpoints({ ownerId, budgetId, runId: created.run.runId! })).length >= 1);
  assert.ok((await store.listAudit({ ownerId, budgetId, runId: created.run.runId! })).every(entry => entry.budgetId === budgetId));
});

const prepareApp = () => {
  const app = new BudgetApp(() => 1_700_000_000_000);
  app.register('simulation-owner@example.test', 'correct horse');
  app.register('simulation-foreign@example.test', 'correct horse');
  const owner = app.signIn('simulation-owner@example.test', 'correct horse').data.sessionToken;
  const foreign = app.signIn('simulation-foreign@example.test', 'correct horse').data.sessionToken;
  const budget = app.createBudget(owner).data;
  app.saveSetup(owner, budget.id, { openingBalanceMinor: 1000, categories: ['Food'] });
  return { app, owner, foreign, budget };
};

test('BudgetApp orchestrates owner-scoped simulation controls without financial effects', async () => {
  const { app, owner, foreign, budget } = prepareApp();
  const before = app.getBudget(owner, budget.id).data;
  const profiles = (await app.listSimulationProfiles(owner, budget.id)).data;
  assert.equal(profiles.length, 5);
  assert.match(profiles[0].description, /fictional|local simulation|no network/i);
  const created = (await app.createSimulationRun(owner, budget.id, { profileCode: 'BO_INSPIRED_A', fixtureVersion: '2026-01', seed: 'app-seed' }, 'app-create', 'create-app')).data;
  const started = (await app.startSimulationRun(owner, budget.id, created.run.runId!, 'app-start', { idempotencyKey: 'start-app', expectedRevision: 0 })).data;
  assert.equal(started.run.state, 'CONNECTING');
  assert.deepEqual((await app.startSimulationRun(owner, budget.id, created.run.runId!, 'different-request', { idempotencyKey: 'start-app', expectedRevision: 0 })).data, started);
  await assert.rejects(() => app.advanceSimulationRun(owner, budget.id, created.run.runId!, 'stale-request', { idempotencyKey: 'stale-app', expectedRevision: 0 }), (error: any) => error.code === 'CONFLICT');
  await assert.rejects(() => app.getSimulationRun(foreign, budget.id, created.run.runId!), (error: any) => error.code === 'NOT_FOUND');
  await assert.rejects(() => app.getSimulationCandidates(owner, budget.id, '00000000-0000-4000-8000-000000000000'), (error: any) => error.code === 'NOT_FOUND');
  const after = app.getBudget(owner, budget.id).data;
  assert.deepEqual(after, before);
  assert.equal(after.version, before.version);
  assert.equal((await app.getFinancialSummary(owner, budget.id, '2026-01')).data.version, before.version);
});

test('simulation rejects credentials without network calls or persisted side effects', async () => {
  const { app, owner, budget } = prepareApp();
  const beforeBudget = app.getBudget(owner, budget.id).data;
  const beforeSummary = (await app.getFinancialSummary(owner, budget.id, '2026-01')).data;
  const originalFetch = globalThis.fetch;
  let networkCalls = 0;
  globalThis.fetch = (async () => { networkCalls += 1; throw new Error('simulation must not use network'); }) as typeof fetch;
  try {
    await assert.rejects(() => app.createSimulationRun(owner, budget.id, { profileCode: 'BO_INSPIRED_A', fixtureVersion: '2026-01', seed: 'offline', authentication: { password: 'secret' } } as any, 'credential-request', 'credential-key'), (error: any) => error.code === 'VALIDATION_ERROR');
    const created = (await app.createSimulationRun(owner, budget.id, { profileCode: 'BO_INSPIRED_A', fixtureVersion: '2026-01', seed: 'offline' }, 'offline-create', 'credential-key')).data;
    assert.equal(created.run.state, 'DISCONNECTED');
    assert.equal(networkCalls, 0);
    assert.deepEqual(app.getBudget(owner, budget.id).data, beforeBudget);
    assert.deepEqual((await app.getFinancialSummary(owner, budget.id, '2026-01')).data, beforeSummary);
    assert.equal((await app.getSimulationCandidates(owner, budget.id, created.run.runId!)).data.length, 0);
    for (const method of ['applySimulationCandidate', 'connectProvider', 'linkAccount', 'pollSimulation', 'moveRealMoney']) assert.equal(typeof (app as any)[method], 'undefined', method);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('BudgetApp rejects provider-shaped simulation input before persistence and maps safe errors', async () => {
  const { app, owner, budget } = prepareApp();
  await assert.rejects(() => app.createSimulationRun(owner, budget.id, { profileCode: 'BO_INSPIRED_A', fixtureVersion: '2026-01', seed: 'x', credentials: 'secret' } as any, 'bad-input', 'bad-input-key'), (error: any) => error.code === 'VALIDATION_ERROR');
  await assert.rejects(() => app.listSimulationProfiles(owner, 'missing-budget'), (error: any) => error.code === 'NOT_FOUND');
});
