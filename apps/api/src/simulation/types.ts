export type SimulationRunState = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'SYNCING' | 'PARTIAL' | 'FAILED' | 'TIMED_OUT' | 'SUCCEEDED';
export type CandidateStatus = 'PENDING' | 'POSTED' | 'DUPLICATE' | 'REJECTED';
export type SimulationCommand = 'START' | 'ADVANCE' | 'RETRY';
export type SimulationOutcome = 'CREATED' | 'STARTED' | 'ADVANCED' | 'RETRIED' | 'FAILED' | 'TIMED_OUT' | 'PARTIAL' | 'SUCCEEDED';
export type FixtureOutcome = 'NORMAL' | 'PARTIAL' | 'FAILURE' | 'TIMEOUT';
export type DiagnosticCode = 'PROFILE_UNAVAILABLE' | 'FIXTURE_UNAVAILABLE' | 'INVALID_SEED' | 'ILLEGAL_TRANSITION' | 'FIXTURE_FAILURE' | 'FIXTURE_TIMEOUT' | 'PARTIAL_SYNC' | 'LIMIT_EXCEEDED' | 'UNSUPPORTED_CONTROL' | 'RESOURCE_UNAVAILABLE';
export type SafeDiagnostic = { code: DiagnosticCode; message: string };

export type SimulationLimits = {
  maxProfiles: number;
  maxStringCodePoints: number;
  maxFixtureBatches: number;
  maxFixtureRecords: number;
  maxCommandsPerRun: number;
  maxAttemptsPerRun: number;
  maxCandidatesPerRun: number;
  maxCheckpointsPerRun: number;
  maxAuditEntriesPerBudget: number;
  maxDiagnosticCodePoints: number;
};

export const DEFAULT_SIMULATION_LIMITS: Readonly<SimulationLimits> = Object.freeze({
  maxProfiles: 50,
  maxStringCodePoints: 128,
  maxFixtureBatches: 100,
  maxFixtureRecords: 5_000,
  maxCommandsPerRun: 100,
  maxAttemptsPerRun: 20,
  maxCandidatesPerRun: 5_000,
  maxCheckpointsPerRun: 500,
  maxAuditEntriesPerBudget: 10_000,
  maxDiagnosticCodePoints: 512,
});

export type FixtureRecord = {
  sourceRecordId: string;
  businessDate: string;
  amountMinor: number;
  status: 'PENDING' | 'POSTED' | 'REJECTED';
  payee: string | null;
  memo: string | null;
  deliveryType?: 'NORMAL' | 'DUPLICATE';
};
export type FixtureBatch = { index: number; records: FixtureRecord[] };
export type FixtureTransition = {
  command: SimulationCommand;
  from: SimulationRunState;
  to: SimulationRunState;
  batchIndex?: number;
  outcome?: FixtureOutcome;
  diagnostic?: SafeDiagnostic;
  checkpoint?: boolean;
  nextCursor?: number;
};
export type RetryPolicy = {
  retryableStates: Array<'PARTIAL' | 'FAILED' | 'TIMED_OUT'>;
  resumeState: 'SYNCING';
};
export type FixtureDefinition = {
  profileCode: string;
  fixtureVersion: string;
  maxCommands: number;
  transitions: FixtureTransition[];
  batches: FixtureBatch[];
  duplicatePolicy: 'MARK_DUPLICATE';
  retryPolicy: RetryPolicy;
};
export type SimulationProfile = {
  code: string;
  displayLabel: string;
  description: string;
  fixtureVersion: string;
  fixture: FixtureDefinition;
  enabled: boolean;
};
export type SimulationProfileSummary = Pick<SimulationProfile, 'code' | 'displayLabel' | 'description' | 'fixtureVersion' | 'enabled'>;

export type ProcessedRecord = { sourceRecordId: string; status: FixtureRecord['status']; deliveryOrdinal: number };
export type RunSnapshot = {
  runId?: string;
  state: SimulationRunState;
  cursor: number;
  revision: number;
  processedRecordCount: number;
  commandCount?: number;
  attemptCount?: number;
  scenarioKey?: string;
  lastDiagnostic?: SafeDiagnostic;
  processedRecords?: ProcessedRecord[];
};
export type CheckpointSnapshot = {
  id?: string;
  sequence?: number;
  cursor: number;
  state: SimulationRunState;
  processedRecordCount: number;
  processedRecords?: ProcessedRecord[];
};
export type FixtureDelivery = {
  record: FixtureRecord;
  batchIndex: number;
  deliveryOrdinal: number;
  duplicate: boolean;
  status: CandidateStatus;
  candidateIdentity: string;
};
export type CheckpointPlan = CheckpointSnapshot;
export type TransitionPlan = {
  next: RunSnapshot;
  outcome: SimulationOutcome;
  deliveries: FixtureDelivery[];
  checkpoint?: CheckpointPlan;
  diagnostic?: SafeDiagnostic;
  eventTime?: number;
};
export type EngineContext = {
  profile: SimulationProfile;
  seed: string;
  clock: () => number;
  limits: SimulationLimits;
};

export type CandidateProvenance = {
  budgetId: string;
  profileCode: string;
  fixtureVersion: string;
  seed: string;
  sourceRecordId: string;
  deliveryOrdinal: number;
  batchIndex: number;
  checkpointId: string | null;
  attemptId: string;
};
export type CandidateLifecycleEntry = {
  sequence: number;
  priorStatus: CandidateStatus | null;
  status: CandidateStatus;
  attemptId: string;
  checkpointId: string | null;
};
export type SimulationCandidate = {
  id: string;
  runId: string;
  status: CandidateStatus;
  sourceRecordId: string;
  businessDate: string;
  amountMinor: number;
  payee: string | null;
  memo: string | null;
  provenance: CandidateProvenance;
  lifecycle: CandidateLifecycleEntry[];
};
export type SimulationCheckpointProjection = CheckpointSnapshot & { id: string; sequence: number };
export type SimulationAuditProjection = {
  id: string;
  sequence: number;
  actorId: string;
  budgetId: string;
  runId: string;
  requestId: string;
  command: SimulationCommand | 'CREATE' | 'INSPECT';
  priorState: SimulationRunState;
  resultingState: SimulationRunState;
  outcome: SimulationOutcome;
  attemptId?: string | null;
  checkpointId?: string | null;
  diagnostic?: SafeDiagnostic;
};
export type SimulationRunProjection = RunSnapshot & { profileCode?: string; fixtureVersion?: string; seed?: string };
export type SimulationProjectionInput = {
  run: SimulationRunProjection;
  candidates: SimulationCandidate[];
  checkpoints: SimulationCheckpointProjection[];
  audits: SimulationAuditProjection[];
};
export type SimulationProjection = {
  run: SimulationRunProjection;
  candidates: SimulationCandidate[];
  checkpoints: SimulationCheckpointProjection[];
  audits: SimulationAuditProjection[];
};

export class SimulationDomainError extends Error {
  readonly code: DiagnosticCode;
  readonly diagnostic: SafeDiagnostic;
  constructor(code: DiagnosticCode, message: string) {
    super(message);
    this.name = 'SimulationDomainError';
    this.code = code;
    this.diagnostic = { code, message };
  }
}

export const codePointLength = (value: string) => [...value].length;
export const boundedText = (value: string, limit: number) => [...value].slice(0, limit).join('');
export const safeDiagnostic = (code: DiagnosticCode, message: string, limit = DEFAULT_SIMULATION_LIMITS.maxDiagnosticCodePoints): SafeDiagnostic => ({ code, message: boundedText(message, limit) });
export const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value as Record<string, unknown>).filter(key => (value as Record<string, unknown>)[key] !== undefined).sort().map(key => [key, canonicalize((value as Record<string, unknown>)[key])]));
};
export const canonicalJson = (value: unknown) => JSON.stringify(canonicalize(value));
export const assertSafeInteger = (value: number, name: string, minimum = 0) => {
  if (!Number.isSafeInteger(value) || value < minimum) throw new SimulationDomainError('LIMIT_EXCEEDED', `${name} is outside the safe bound`);
  return value;
};
