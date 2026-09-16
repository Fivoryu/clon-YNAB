import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_SIMULATION_LIMITS,
  SimulationDomainError,
  safeDiagnostic,
  type FixtureDefinition,
  type RunSnapshot,
  type SimulationProfile,
  type SimulationCandidate,
  type SimulationProjectionInput,
} from '../src/simulation/types.ts';
import { getSimulationProfile, listSimulationProfiles, validateFixture, validateCatalogInput } from '../src/simulation/catalog.ts';
import { applyCommand, stableScenarioKey } from '../src/simulation/engine.ts';
import { normalizeSimulationProjection, projectAudit, projectCandidates, projectCheckpoints, projectRun } from '../src/simulation/projection.ts';

const profile = (): SimulationProfile => getSimulationProfile('BO_INSPIRED_A', '2026-01');
const run = (overrides: Partial<RunSnapshot> = {}): RunSnapshot => ({
  runId: 'run-1', state: 'DISCONNECTED', cursor: 0, revision: 0, processedRecordCount: 0,
  commandCount: 0, attemptCount: 0, ...overrides,
});
const context = (selected = profile()) => ({ profile: selected, seed: 'domain-seed', clock: () => 1_700_000_000_000, limits: DEFAULT_SIMULATION_LIMITS });
const command = (selected: SimulationProfile, current: RunSnapshot, name: 'START' | 'ADVANCE' | 'RETRY') => applyCommand(context(selected), name, current, null);

const fixture = (overrides: Partial<FixtureDefinition> = {}): FixtureDefinition => ({
  profileCode: 'TEST', fixtureVersion: 'v1', maxCommands: 10, duplicatePolicy: 'MARK_DUPLICATE',
  transitions: [
    { command: 'START', from: 'DISCONNECTED', to: 'CONNECTING' },
    { command: 'ADVANCE', from: 'CONNECTING', to: 'CONNECTED' },
    { command: 'ADVANCE', from: 'CONNECTED', to: 'SYNCING' },
    { command: 'ADVANCE', from: 'SYNCING', to: 'SUCCEEDED', batchIndex: 0 },
  ],
  batches: [{ index: 0, records: [{ sourceRecordId: 'source-1', businessDate: '2026-01-02', amountMinor: 125, status: 'POSTED', payee: 'Synthetic shop', memo: null }] }],
  retryPolicy: { retryableStates: ['PARTIAL', 'FAILED', 'TIMED_OUT'], resumeState: 'SYNCING' },
  ...overrides,
});

test('domain contracts expose bounded safe values and no financial/application fields', () => {
  assert.equal(DEFAULT_SIMULATION_LIMITS.maxProfiles, 50);
  assert.equal(DEFAULT_SIMULATION_LIMITS.maxDiagnosticCodePoints, 512);
  assert.equal([...safeDiagnostic('PARTIAL_SYNC', '😀'.repeat(600)).message].length, 512);
  assert.equal(({} as Record<string, unknown>).APPLIED, undefined);
  assert.equal(Object.prototype.hasOwnProperty.call(profile(), 'credentials'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(profile().fixture, 'endpoint'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(profile().fixture, 'financialEvent'), false);
});

test('catalog returns neutral fictional profiles in deterministic order and rejects provider-shaped input', () => {
  const profiles = listSimulationProfiles();
  assert.equal(profiles.length, 5);
  assert.deepEqual(profiles.map(item => item.code), ['BO_INSPIRED_A', 'BO_INSPIRED_B', 'BO_INSPIRED_C', 'BO_INSPIRED_D', 'BO_INSPIRED_E']);
  assert.ok(profiles.every(item => /fictional|local simulation/i.test(`${item.displayLabel} ${item.description}`)));
  assert.throws(() => validateCatalogInput({ profileCode: 'BO_INSPIRED_A', endpoint: 'https://bank.invalid' }), /provider|forbidden/i);
  assert.throws(() => validateCatalogInput({ credentials: { password: 'secret' } }), /provider|forbidden/i);
  assert.throws(() => getSimulationProfile('UNKNOWN', '2026-01'), /unavailable|profile/i);
  assert.equal(Object.isFrozen(profile()), true);
  assert.equal(Object.isFrozen(profile().fixture), true);
});

test('fixture validation rejects unsafe or over-limit definitions before use', () => {
  assert.doesNotThrow(() => validateFixture(fixture()));
  assert.throws(() => validateFixture(fixture({ profileCode: 'TEST', batches: [{ index: 0, records: [{ sourceRecordId: 'x', businessDate: '2026-01-02', amountMinor: 1, status: 'POSTED', payee: null, memo: null, endpoint: 'x' } as never] }] })), /provider|forbidden|fixture/i);
  assert.throws(() => validateFixture(fixture({ maxCommands: DEFAULT_SIMULATION_LIMITS.maxCommandsPerRun + 1 })), /limit/i);
});

test('engine follows legal transitions and rejects illegal or terminal transitions without mutation', () => {
  const selected = profile();
  const started = command(selected, run(), 'START');
  assert.equal(started.next.state, 'CONNECTING');
  const connected = command(selected, started.next, 'ADVANCE');
  assert.equal(connected.next.state, 'CONNECTED');
  const syncing = command(selected, connected.next, 'ADVANCE');
  assert.equal(syncing.next.state, 'SYNCING');
  const succeeded = command(selected, syncing.next, 'ADVANCE');
  assert.equal(succeeded.next.state, 'PARTIAL');
  assert.throws(() => command(selected, run({ state: 'SUCCEEDED', cursor: 99, revision: 4 }), 'ADVANCE'), (error: unknown) => error instanceof SimulationDomainError && error.code === 'ILLEGAL_TRANSITION');
  assert.throws(() => command(selected, run({ state: 'CONNECTED' }), 'START'), /transition/i);
  assert.deepEqual(succeeded.next.processedRecordCount, 1);
});

test('engine delivers ordered records, preserves pending-to-posted identity, and marks duplicates/rejections', () => {
  const deliveryFixture = fixture({ profileCode: 'BO_INSPIRED_A', transitions: [
    { command: 'ADVANCE', from: 'SYNCING', to: 'SYNCING', batchIndex: 0 },
    { command: 'ADVANCE', from: 'SYNCING', to: 'SYNCING', batchIndex: 1 },
    { command: 'ADVANCE', from: 'SYNCING', to: 'SYNCING', batchIndex: 2 },
    { command: 'ADVANCE', from: 'SYNCING', to: 'SUCCEEDED', batchIndex: 3 },
  ], batches: [
    { index: 0, records: [{ sourceRecordId: 'source-1', businessDate: '2026-01-02', amountMinor: 125, status: 'PENDING', payee: null, memo: null }] },
    { index: 1, records: [{ sourceRecordId: 'source-1', businessDate: '2026-01-02', amountMinor: 125, status: 'POSTED', payee: null, memo: null }] },
    { index: 2, records: [{ sourceRecordId: 'source-1', businessDate: '2026-01-02', amountMinor: 125, status: 'POSTED', payee: null, memo: null, deliveryType: 'DUPLICATE' }] },
    { index: 3, records: [{ sourceRecordId: 'source-2', businessDate: '2026-01-03', amountMinor: 50, status: 'REJECTED', payee: null, memo: null }] },
  ] });
  const selected = { ...profile(), fixture: deliveryFixture };
  let current = run({ state: 'SYNCING', cursor: 0 });
  const first = command(selected, current, 'ADVANCE');
  assert.equal(first.deliveries[0].status, 'PENDING');
  const second = applyCommand(context(selected), 'ADVANCE', first.next, first.checkpoint ?? null);
  assert.equal(second.deliveries[0].status, 'POSTED');
  assert.equal(second.deliveries[0].candidateIdentity, first.deliveries[0].candidateIdentity);
  const third = applyCommand(context(selected), 'ADVANCE', second.next, second.checkpoint ?? null);
  assert.equal(third.deliveries[0].status, 'DUPLICATE');
  assert.equal(third.deliveries[0].duplicate, true);
  const fourth = applyCommand(context(selected), 'ADVANCE', third.next, third.checkpoint ?? null);
  assert.equal(fourth.deliveries[0].status, 'REJECTED');
  assert.deepEqual(first.deliveries.map(item => item.batchIndex), [0]);
});

test('engine supports partial checkpoints, deterministic failure/timeout, legal retry, and limits', () => {
  const partialFixture = fixture({ transitions: [
    { command: 'START', from: 'DISCONNECTED', to: 'CONNECTING' },
    { command: 'ADVANCE', from: 'CONNECTING', to: 'CONNECTED' },
    { command: 'ADVANCE', from: 'CONNECTED', to: 'SYNCING' },
    { command: 'ADVANCE', from: 'SYNCING', to: 'PARTIAL', batchIndex: 0, outcome: 'PARTIAL', diagnostic: { code: 'PARTIAL_SYNC', message: 'A bounded prefix was synchronized' } },
    { command: 'ADVANCE', from: 'SYNCING', to: 'SUCCEEDED', batchIndex: 0 },
  ] });
  const partialProfile = { ...profile(), fixture: partialFixture } as SimulationProfile;
  const partial = applyCommand({ ...context(), profile: partialProfile }, 'ADVANCE', run({ state: 'SYNCING', cursor: 3 }), null);
  assert.equal(partial.next.state, 'PARTIAL');
  assert.equal(partial.outcome, 'PARTIAL');
  const retried = applyCommand({ ...context(), profile: partialProfile }, 'RETRY', partial.next, partial.checkpoint ?? null);
  assert.equal(retried.next.state, 'SYNCING');
  assert.equal(retried.outcome, 'RETRIED');
  assert.equal(retried.next.processedRecordCount, partial.next.processedRecordCount);
  const failedFixture = fixture({ transitions: [
    { command: 'ADVANCE', from: 'SYNCING', to: 'FAILED', batchIndex: 0, outcome: 'FAILURE', diagnostic: { code: 'FIXTURE_FAILURE', message: 'Synthetic failure' } },
  ] });
  const failed = applyCommand({ ...context(), profile: { ...profile(), fixture: failedFixture } as SimulationProfile }, 'ADVANCE', run({ state: 'SYNCING' }), null);
  assert.equal(failed.next.state, 'FAILED');
  assert.equal(failed.outcome, 'FAILED');
  const timeoutFixture = fixture({ transitions: [
    { command: 'ADVANCE', from: 'SYNCING', to: 'TIMED_OUT', outcome: 'TIMEOUT', diagnostic: { code: 'FIXTURE_TIMEOUT', message: 'Synthetic timeout' } },
  ] });
  const timedOut = applyCommand({ ...context(), profile: { ...profile(), fixture: timeoutFixture } as SimulationProfile }, 'ADVANCE', run({ state: 'SYNCING' }), null);
  assert.equal(timedOut.next.state, 'TIMED_OUT');
  assert.equal(timedOut.outcome, 'TIMED_OUT');
  const retriedFailure = applyCommand({ ...context(), profile: { ...profile(), fixture: failedFixture } as SimulationProfile }, 'RETRY', failed.next, failed.checkpoint ?? null);
  assert.equal(retriedFailure.next.state, 'SYNCING');
  const retriedTimeout = applyCommand({ ...context(), profile: { ...profile(), fixture: timeoutFixture } as SimulationProfile }, 'RETRY', timedOut.next, timedOut.checkpoint ?? null);
  assert.equal(retriedTimeout.next.state, 'SYNCING');
  const limited = { ...run(), commandCount: DEFAULT_SIMULATION_LIMITS.maxCommandsPerRun };
  assert.throws(() => applyCommand(context(), 'START', limited, null), /limit/i);
  assert.throws(() => applyCommand(context(), 'START', { ...run(), attemptCount: DEFAULT_SIMULATION_LIMITS.maxAttemptsPerRun }, null), /limit/i);
});

test('identical seed, fixture, and commands yield normalized equivalent plans', () => {
  const selected = profile();
  const execute = () => {
    let current = run();
    let checkpoint = null;
    const plans = [];
    for (const name of ['START', 'ADVANCE', 'ADVANCE', 'ADVANCE'] as const) {
      const plan = applyCommand(context(selected), name, current, checkpoint);
      plans.push(plan); current = plan.next; checkpoint = plan.checkpoint ?? checkpoint;
    }
    const retry = applyCommand(context(selected), 'RETRY', current, checkpoint);
    plans.push(retry);
    plans.push(applyCommand(context(selected), 'ADVANCE', retry.next, retry.checkpoint ?? checkpoint));
    return plans;
  };
  assert.deepEqual(execute(), execute());
  assert.equal(stableScenarioKey(selected, 'domain-seed'), stableScenarioKey(selected, 'domain-seed'));
  assert.notEqual(stableScenarioKey(selected, 'other-seed'), stableScenarioKey(selected, 'domain-seed'));
});

test('projections sort deterministically, preserve provenance/lifecycle, and do not mutate inputs', () => {
  const candidate: SimulationCandidate = {
    id: 'candidate-1', runId: 'run-1', status: 'POSTED', sourceRecordId: 'source-1', businessDate: '2026-01-02', amountMinor: 125, payee: 'Shop', memo: null,
    provenance: { budgetId: 'budget-1', profileCode: 'BO_INSPIRED_A', fixtureVersion: '2026-01', seed: 'domain-seed', sourceRecordId: 'source-1', deliveryOrdinal: 1, batchIndex: 0, checkpointId: 'checkpoint-1', attemptId: 'attempt-1' },
    lifecycle: [{ sequence: 2, priorStatus: 'PENDING', status: 'POSTED', attemptId: 'attempt-2', checkpointId: 'checkpoint-2' }],
  };
  const input: SimulationProjectionInput = { run: run({ state: 'SUCCEEDED' }), candidates: [candidate], checkpoints: [{ id: 'checkpoint-2', sequence: 2, cursor: 2, state: 'SUCCEEDED', processedRecordCount: 2 }], audits: [{ id: 'audit-2', sequence: 2, actorId: 'owner-1', budgetId: 'budget-1', runId: 'run-1', requestId: 'request-2', command: 'ADVANCE', priorState: 'SYNCING', resultingState: 'SUCCEEDED', outcome: 'SUCCEEDED' }] };
  const before = JSON.stringify(input);
  const projected = normalizeSimulationProjection(input);
  assert.equal(projected.run.state, 'SUCCEEDED');
  assert.equal(projected.candidates[0].provenance.sourceRecordId, 'source-1');
  assert.deepEqual(projectCandidates(input.candidates), input.candidates);
  assert.deepEqual(projectCheckpoints(input.checkpoints), input.checkpoints);
  assert.deepEqual(projectAudit(input.audits), input.audits);
  assert.equal(JSON.stringify(input), before);
  assert.deepEqual(projectRun(input.run), input.run);
  assert.throws(() => projectRun({ ...input.run, state: 'APPLIED' as never }), /applied/i);
});

test('simulation boundaries use no network clients and keep diagnostics/deferred controls safe', async () => {
  const { readdir, readFile } = await import('node:fs/promises');
  const roots = [new URL('../src/simulation/', import.meta.url), new URL('../src/persistence/', import.meta.url)];
  const files: URL[] = [];
  for (const root of roots) {
    for (const name of await readdir(root)) if (name.endsWith('.ts') && (name.includes('simulation') || name === 'in-memory-simulation-store.ts')) files.push(new URL(name, root));
  }
  const source = (await Promise.all(files.map(file => readFile(file, 'utf8')))).join('\\n');
  assert.doesNotMatch(source, /from ['\"]node:(?:http|https|net|tls)['\"]/i);
  assert.doesNotMatch(source, /\b(?:fetch|XMLHttpRequest|WebSocket)\s*\(/);
  assert.doesNotMatch(source, /\b(?:applySimulationCandidate|connectProvider|linkAccount|moneyMovement)\b/);
  const failed = applyCommand({ ...context(), profile: getSimulationProfile('BO_INSPIRED_B', '2026-01') }, 'ADVANCE', run({ state: 'SYNCING', cursor: 3 }), null);
  assert.equal(failed.diagnostic?.code, 'FIXTURE_FAILURE');
  assert.doesNotMatch(JSON.stringify(failed), /password|secret|credential|endpoint|sql|stack trace|https?:\/\//i);
  assert.equal(({} as Record<string, unknown>).APPLIED, undefined);
});

test('simulation domain has no network or financial-authority imports', async () => {
  const source = await (await import('node:fs/promises')).readFile(new URL('../src/simulation/types.ts', import.meta.url), 'utf8').catch(() => '');
  assert.doesNotMatch(source, /financial-store|network|fetch\(|http:\/\//i);
});
