import {
  DEFAULT_SIMULATION_LIMITS,
  SimulationDomainError,
  assertSafeInteger,
  type CheckpointSnapshot,
  type EngineContext,
  type FixtureDelivery,
  type FixtureRecord,
  type FixtureTransition,
  type RunSnapshot,
  type SimulationOutcome,
  type SimulationProfile,
  type SimulationRunState,
  type TransitionPlan,
} from './types.ts';

const legalEdges: Record<SimulationRunState, SimulationRunState[]> = {
  DISCONNECTED: ['CONNECTING'],
  CONNECTING: ['CONNECTED'],
  CONNECTED: ['SYNCING'],
  SYNCING: ['SYNCING', 'PARTIAL', 'FAILED', 'TIMED_OUT', 'SUCCEEDED'],
  PARTIAL: ['SYNCING'],
  FAILED: ['SYNCING', 'FAILED', 'TIMED_OUT', 'SUCCEEDED'],
  TIMED_OUT: ['SYNCING', 'FAILED', 'TIMED_OUT', 'SUCCEEDED'],
  SUCCEEDED: [],
};
const terminal = new Set<SimulationRunState>(['SUCCEEDED']);
const hash = (value: string) => {
  let result = 2_166_136_261;
  for (const char of value) { result ^= char.codePointAt(0)!; result = Math.imul(result, 16_777_619) >>> 0; }
  return result.toString(16).padStart(8, '0');
};
export const stableScenarioKey = (profile: SimulationProfile, seed: string) => hash(`${profile.code}\u0000${profile.fixtureVersion}\u0000${seed}`);
export const seededBranch = (seed: string, branchCount: number) => {
  if (!Number.isSafeInteger(branchCount) || branchCount < 1) throw new SimulationDomainError('LIMIT_EXCEEDED', 'branchCount is outside the safe bound');
  return Number.parseInt(hash(seed), 16) % branchCount;
};
export const stableCandidateIdentity = (runId: string, sourceRecordId: string, deliveryOrdinal: number, duplicate: boolean) => duplicate ? `${runId}:${sourceRecordId}:${deliveryOrdinal}` : `${runId}:${sourceRecordId}`;

const fail = (code: 'ILLEGAL_TRANSITION' | 'LIMIT_EXCEEDED' | 'FIXTURE_UNAVAILABLE' | 'INVALID_SEED', message: string): never => { throw new SimulationDomainError(code, message); };
const safeSeed = (seed: string, max: number) => {
  if (typeof seed !== 'string' || seed.length === 0 || [...seed].length > max) fail('INVALID_SEED', 'Seed is invalid or exceeds the bounded simulation limit');
};
const sameRecords = (left: FixtureRecord, right: FixtureRecord) => left.sourceRecordId === right.sourceRecordId;
const recordsForBatch = (profile: SimulationProfile, index: number) => profile.fixture.batches.find(batch => batch.index === index)?.records ?? fail('FIXTURE_UNAVAILABLE', 'Transition references an unavailable fixture batch');
const priorRecord = (records: NonNullable<RunSnapshot['processedRecords']>, sourceRecordId: string) => [...records].reverse().find(item => item.sourceRecordId === sourceRecordId);
const outcomeFor = (command: 'START' | 'ADVANCE' | 'RETRY', transition: FixtureTransition): SimulationOutcome => {
  if (command === 'START') return 'STARTED';
  if (command === 'RETRY') return 'RETRIED';
  if (transition.outcome === 'FAILURE' || transition.to === 'FAILED') return 'FAILED';
  if (transition.outcome === 'TIMEOUT' || transition.to === 'TIMED_OUT') return 'TIMED_OUT';
  if (transition.outcome === 'PARTIAL' || transition.to === 'PARTIAL') return 'PARTIAL';
  if (transition.to === 'SUCCEEDED') return 'SUCCEEDED';
  return 'ADVANCED';
};
const nextBase = (context: EngineContext, run: RunSnapshot, state: SimulationRunState, cursor: number, processedRecords: NonNullable<RunSnapshot['processedRecords']>, diagnostic = run.lastDiagnostic): RunSnapshot => ({
  ...run,
  state,
  cursor,
  revision: run.revision + 1,
  commandCount: (run.commandCount ?? 0) + 1,
  attemptCount: (run.attemptCount ?? 0) + 1,
  processedRecords,
  processedRecordCount: processedRecords.length,
  scenarioKey: run.scenarioKey ?? stableScenarioKey(context.profile, context.seed),
  ...(diagnostic ? { lastDiagnostic: diagnostic } : { lastDiagnostic: undefined }),
});

export const applyCommand = (context: EngineContext, command: 'START' | 'ADVANCE' | 'RETRY', run: RunSnapshot, persistedCheckpoint: CheckpointSnapshot | null): TransitionPlan => {
  const limits = context.limits ?? DEFAULT_SIMULATION_LIMITS;
  safeSeed(context.seed, limits.maxStringCodePoints);
  assertSafeInteger(run.cursor, 'cursor');
  assertSafeInteger(run.revision, 'revision');
  assertSafeInteger(run.processedRecordCount, 'processedRecordCount');
  if ((run.commandCount ?? 0) >= Math.min(limits.maxCommandsPerRun, context.profile.fixture.maxCommands)) fail('LIMIT_EXCEEDED', 'Run command limit exceeded');
  if ((run.attemptCount ?? 0) >= limits.maxAttemptsPerRun) fail('LIMIT_EXCEEDED', 'Run attempt limit exceeded');
  if (!legalEdges[run.state] || terminal.has(run.state) && command !== 'START') fail('ILLEGAL_TRANSITION', 'The requested simulation transition is not legal');
  if (command === 'RETRY') {
    if (!context.profile.fixture.retryPolicy.retryableStates.includes(run.state as 'PARTIAL' | 'FAILED' | 'TIMED_OUT') || !persistedCheckpoint) fail('ILLEGAL_TRANSITION', 'Retry is not available for the current simulation state');
    const records = (persistedCheckpoint.processedRecords ?? run.processedRecords ?? []).map(item => ({ ...item }));
    const next = nextBase(context, run, context.profile.fixture.retryPolicy.resumeState, persistedCheckpoint.cursor, records);
    return { next, outcome: 'RETRIED', deliveries: [], checkpoint: undefined, eventTime: checkedClock(context.clock) };
  }
  const transitionAtCursor = context.profile.fixture.transitions[run.cursor];
  const candidates = context.profile.fixture.transitions.filter(transition => transition.command === command && transition.from === run.state);
  const transition = transitionAtCursor?.command === command && transitionAtCursor.from === run.state
    ? transitionAtCursor
    : candidates[seededBranch(`${context.seed}:${run.cursor}`, candidates.length || 1)];
  if (!transition || transition.from !== run.state || transition !== transitionAtCursor) fail('ILLEGAL_TRANSITION', 'The requested simulation transition is not legal');
  if (!legalEdges[run.state].includes(transition.to)) fail('ILLEGAL_TRANSITION', 'The fixture contains an illegal state transition');
  const cursor = transition.nextCursor ?? run.cursor + 1;
  const existing = (run.processedRecords ?? persistedCheckpoint?.processedRecords ?? []).map(item => ({ ...item }));
  const deliveries: FixtureDelivery[] = [];
  if (transition.batchIndex !== undefined) {
    for (const fixtureRecord of recordsForBatch(context.profile, transition.batchIndex)) {
      const previous = priorRecord(existing, fixtureRecord.sourceRecordId);
      const ordinal = (existing.filter(item => item.sourceRecordId === fixtureRecord.sourceRecordId).at(-1)?.deliveryOrdinal ?? 0) + 1;
      const duplicate = fixtureRecord.deliveryType === 'DUPLICATE';
      const status = duplicate ? 'DUPLICATE' : fixtureRecord.status;
      const delivery: FixtureDelivery = {
        record: { ...fixtureRecord }, batchIndex: transition.batchIndex, deliveryOrdinal: ordinal, duplicate, status,
        candidateIdentity: stableCandidateIdentity(run.runId ?? 'run', fixtureRecord.sourceRecordId, ordinal, duplicate),
      };
      deliveries.push(delivery);
      existing.push({ sourceRecordId: fixtureRecord.sourceRecordId, status: fixtureRecord.status, deliveryOrdinal: ordinal });
      if (previous && !duplicate && previous.status === 'PENDING' && fixtureRecord.status === 'POSTED') delivery.candidateIdentity = stableCandidateIdentity(run.runId ?? 'run', fixtureRecord.sourceRecordId, previous.deliveryOrdinal, false);
    }
  }
  if (existing.length > limits.maxCandidatesPerRun) fail('LIMIT_EXCEEDED', 'Run candidate limit exceeded');
  const diagnostic = transition.diagnostic;
  const next = nextBase(context, run, transition.to, cursor, existing, diagnostic);
  const shouldCheckpoint = deliveries.length > 0 || transition.checkpoint === true || transition.outcome !== 'NORMAL' || transition.to === 'PARTIAL' || transition.to === 'FAILED' || transition.to === 'TIMED_OUT';
  const checkpoint = shouldCheckpoint ? { cursor, state: transition.to, processedRecordCount: next.processedRecordCount, processedRecords: existing.map(item => ({ ...item })) } : undefined;
  return { next, outcome: outcomeFor(command, transition), deliveries, checkpoint, ...(diagnostic ? { diagnostic } : {}), eventTime: checkedClock(context.clock) };
};

const checkedClock = (clock: () => number) => {
  const value = clock();
  if (!Number.isFinite(value)) throw new SimulationDomainError('LIMIT_EXCEEDED', 'Injected clock value is invalid');
  return value;
};
