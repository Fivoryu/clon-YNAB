import {
  DEFAULT_SIMULATION_LIMITS,
  SimulationDomainError,
  assertSafeInteger,
  canonicalJson,
  codePointLength,
  type FixtureDefinition,
  type FixtureRecord,
  type SimulationLimits,
  type SimulationProfile,
  type SimulationProfileSummary,
  type SimulationRunState,
} from './types.ts';

const forbiddenKeys = new Set(['endpoint', 'url', 'logo', 'logos', 'credential', 'credentials', 'password', 'token', 'authentication', 'auth', 'institution', 'affiliation', 'provider', 'accountlink', 'accountlinking', 'financialevent', 'transaction', 'transfer', 'payment', 'network']);
const safe = (code: 'PROFILE_UNAVAILABLE' | 'FIXTURE_UNAVAILABLE' | 'LIMIT_EXCEEDED', message: string): never => { throw new SimulationDomainError(code, message); };

const containsForbiddenKey = (value: unknown): boolean => {
  if (Array.isArray(value)) return value.some(containsForbiddenKey);
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value as Record<string, unknown>).some(([key, child]) => forbiddenKeys.has(key.replaceAll(/[^a-z]/gi, '').toLowerCase()) || containsForbiddenKey(child));
};
export const validateCatalogInput = (input: unknown) => {
  if (containsForbiddenKey(input)) safe('FIXTURE_UNAVAILABLE', 'Provider-shaped metadata is not supported by local simulation');
  return true;
};

const validStates: SimulationRunState[] = ['DISCONNECTED', 'CONNECTING', 'CONNECTED', 'SYNCING', 'PARTIAL', 'FAILED', 'TIMED_OUT', 'SUCCEEDED'];
const validCommands = ['START', 'ADVANCE', 'RETRY'];
const validOutcomes = ['NORMAL', 'PARTIAL', 'FAILURE', 'TIMEOUT'];
const validStatuses = ['PENDING', 'POSTED', 'REJECTED'];
const validDiagnosticCodes = ['PROFILE_UNAVAILABLE', 'FIXTURE_UNAVAILABLE', 'INVALID_SEED', 'ILLEGAL_TRANSITION', 'FIXTURE_FAILURE', 'FIXTURE_TIMEOUT', 'PARTIAL_SYNC', 'LIMIT_EXCEEDED', 'UNSUPPORTED_CONTROL', 'RESOURCE_UNAVAILABLE'];
const validateText = (value: unknown, name: string, limits: SimulationLimits) => {
  if (typeof value !== 'string' || value.length === 0 || codePointLength(value) > limits.maxStringCodePoints) safe('LIMIT_EXCEEDED', `${name} is outside the bounded simulation contract`);
  return value as string;
};
const validateRecord = (record: FixtureRecord, limits: SimulationLimits) => {
  validateCatalogInput(record);
  validateText(record.sourceRecordId, 'sourceRecordId', limits);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(record.businessDate)) safe('FIXTURE_UNAVAILABLE', 'Fixture contains an invalid business date');
  const date = new Date(`${record.businessDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== record.businessDate) safe('FIXTURE_UNAVAILABLE', 'Fixture contains an invalid business date');
  assertSafeInteger(record.amountMinor, 'amountMinor', 1);
  if (!validStatuses.includes(record.status) || (record.payee !== null && typeof record.payee !== 'string') || (record.memo !== null && typeof record.memo !== 'string')) safe('FIXTURE_UNAVAILABLE', 'Fixture contains an invalid synthetic record');
  if (record.payee !== null) validateText(record.payee, 'payee', limits);
  if (record.memo !== null) validateText(record.memo, 'memo', limits);
  if (record.deliveryType !== undefined && !['NORMAL', 'DUPLICATE'].includes(record.deliveryType)) safe('FIXTURE_UNAVAILABLE', 'Fixture contains an invalid delivery type');
};

export const validateFixture = (fixture: FixtureDefinition, limits: SimulationLimits = DEFAULT_SIMULATION_LIMITS) => {
  if (!fixture || typeof fixture !== 'object' || !Array.isArray(fixture.transitions) || !Array.isArray(fixture.batches) || !fixture.retryPolicy) safe('FIXTURE_UNAVAILABLE', 'Fixture definition is invalid');
  validateCatalogInput(fixture);
  validateText(fixture.profileCode, 'profileCode', limits);
  validateText(fixture.fixtureVersion, 'fixtureVersion', limits);
  assertSafeInteger(fixture.maxCommands, 'maxCommands', 1);
  if (fixture.maxCommands > limits.maxCommandsPerRun || fixture.batches.length > limits.maxFixtureBatches) safe('LIMIT_EXCEEDED', 'Fixture exceeds a bounded simulation limit');
  if (fixture.duplicatePolicy !== 'MARK_DUPLICATE' || fixture.retryPolicy.resumeState !== 'SYNCING') safe('FIXTURE_UNAVAILABLE', 'Fixture policy is not supported');
  if (fixture.retryPolicy.retryableStates.some(state => !['PARTIAL', 'FAILED', 'TIMED_OUT'].includes(state))) safe('FIXTURE_UNAVAILABLE', 'Fixture retry policy is invalid');
  let recordCount = 0;
  const indexes = new Set<number>();
  for (const batch of fixture.batches) {
    if (!batch || !Array.isArray(batch.records)) safe('FIXTURE_UNAVAILABLE', 'Fixture batch is invalid');
    assertSafeInteger(batch.index, 'batch.index');
    if (indexes.has(batch.index) || batch.records.length > limits.maxFixtureRecords) safe('FIXTURE_UNAVAILABLE', 'Fixture batch ordering or size is invalid');
    indexes.add(batch.index);
    recordCount += batch.records.length;
    for (const record of batch.records) validateRecord(record, limits);
  }
  if (recordCount > limits.maxFixtureRecords) safe('LIMIT_EXCEEDED', 'Fixture contains too many records');
  for (const transition of fixture.transitions) {
    if (!validCommands.includes(transition.command) || !validStates.includes(transition.from) || !validStates.includes(transition.to) || (transition.outcome !== undefined && !validOutcomes.includes(transition.outcome))) safe('FIXTURE_UNAVAILABLE', 'Fixture contains an invalid transition');
    if (transition.from === 'DISCONNECTED' && transition.command !== 'START') safe('FIXTURE_UNAVAILABLE', 'Disconnected fixtures must start with START');
    if (transition.command === 'RETRY' && !fixture.retryPolicy.retryableStates.includes(transition.from as 'PARTIAL' | 'FAILED' | 'TIMED_OUT')) safe('FIXTURE_UNAVAILABLE', 'Fixture retry transition is not supported');
    if (transition.batchIndex !== undefined && !indexes.has(transition.batchIndex)) safe('FIXTURE_UNAVAILABLE', 'Transition references an unavailable batch');
    if (transition.nextCursor !== undefined) assertSafeInteger(transition.nextCursor, 'transition.nextCursor');
    if (transition.diagnostic) {
      if (!validDiagnosticCodes.includes(transition.diagnostic.code)) safe('FIXTURE_UNAVAILABLE', 'Fixture diagnostic code is not supported');
      validateText(transition.diagnostic.code, 'diagnostic.code', limits);
      validateText(transition.diagnostic.message, 'diagnostic.message', limits);
    }
  }
  return fixture;
};

const record = (sourceRecordId: string, status: FixtureRecord['status'], amountMinor: number, deliveryType: FixtureRecord['deliveryType'] = 'NORMAL'): FixtureRecord => ({ sourceRecordId, businessDate: '2026-01-15', amountMinor, status, payee: 'Synthetic merchant', memo: 'Local fixture', deliveryType });
const baseTransitions = (finalState: 'FAILED' | 'TIMED_OUT', outcome: 'FAILURE' | 'TIMEOUT') => [
  { command: 'START' as const, from: 'DISCONNECTED' as const, to: 'CONNECTING' as const },
  { command: 'ADVANCE' as const, from: 'CONNECTING' as const, to: 'CONNECTED' as const },
  { command: 'ADVANCE' as const, from: 'CONNECTED' as const, to: 'SYNCING' as const },
  { command: 'ADVANCE' as const, from: 'SYNCING' as const, to: finalState, batchIndex: 0, outcome, diagnostic: { code: finalState === 'FAILED' ? 'FIXTURE_FAILURE' as const : 'FIXTURE_TIMEOUT' as const, message: finalState === 'FAILED' ? 'Synthetic fixture failure' : 'Synthetic fixture timeout' } },
  { command: 'ADVANCE' as const, from: 'SYNCING' as const, to: 'SUCCEEDED' as const, batchIndex: 1 },
];
const makeProfile = (code: string, behavior: 'PARTIAL' | 'FAILED' | 'TIMED_OUT' | 'SUCCEEDED'): SimulationProfile => {
  const fixture: FixtureDefinition = {
    profileCode: code, fixtureVersion: '2026-01', maxCommands: 100, duplicatePolicy: 'MARK_DUPLICATE',
    transitions: behavior === 'FAILED' ? baseTransitions('FAILED', 'FAILURE') : behavior === 'TIMED_OUT' ? baseTransitions('TIMED_OUT', 'TIMEOUT') : [
      { command: 'START', from: 'DISCONNECTED', to: 'CONNECTING' },
      { command: 'ADVANCE', from: 'CONNECTING', to: 'CONNECTED' },
      { command: 'ADVANCE', from: 'CONNECTED', to: 'SYNCING' },
      { command: 'ADVANCE', from: 'SYNCING', to: behavior === 'PARTIAL' ? 'PARTIAL' : 'SUCCEEDED', batchIndex: 0, ...(behavior === 'PARTIAL' ? { outcome: 'PARTIAL' as const, diagnostic: { code: 'PARTIAL_SYNC' as const, message: 'A bounded synthetic prefix was synchronized' } } : {}) },
      { command: 'ADVANCE', from: 'SYNCING', to: 'SUCCEEDED', batchIndex: 1 },
    ],
    batches: [
      { index: 0, records: [record(`${code.toLowerCase()}-source-1`, 'PENDING', 1250)] },
      { index: 1, records: [record(`${code.toLowerCase()}-source-1`, 'POSTED', 1250), record(`${code.toLowerCase()}-source-2`, 'POSTED', 875)] },
      { index: 2, records: [record(`${code.toLowerCase()}-source-2`, 'POSTED', 875, 'DUPLICATE')] },
      { index: 3, records: [record(`${code.toLowerCase()}-source-3`, 'REJECTED', 50)] },
    ],
    retryPolicy: { retryableStates: ['PARTIAL', 'FAILED', 'TIMED_OUT'], resumeState: 'SYNCING' },
  };
  validateFixture(fixture);
  return Object.freeze({ code, displayLabel: `Bolivia-inspired fictional preset ${code.at(-1)}`, description: 'Fictional local simulation only; synthetic behavior, no network, and no real money.', fixtureVersion: fixture.fixtureVersion, fixture: deepFreeze(fixture), enabled: true });
};
const deepFreeze = <T>(value: T): T => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
};
const catalog = deepFreeze((['A', 'B', 'C', 'D', 'E'] as const).map((suffix, index) => makeProfile(`BO_INSPIRED_${suffix}`, index === 1 ? 'FAILED' : index === 2 ? 'TIMED_OUT' : index === 3 ? 'PARTIAL' : index === 0 ? 'PARTIAL' : 'SUCCEEDED')));

export const listSimulationProfiles = (limits: SimulationLimits = DEFAULT_SIMULATION_LIMITS): SimulationProfileSummary[] => catalog.filter(profile => profile.enabled).slice(0, limits.maxProfiles).map(({ fixture: _fixture, ...summary }) => ({ ...summary }));
export const getSimulationProfile = (code: string, fixtureVersion: string): SimulationProfile => {
  const found = catalog.find(profile => profile.enabled && profile.code === code && profile.fixtureVersion === fixtureVersion);
  if (!found) safe('PROFILE_UNAVAILABLE', 'The requested fictional simulation profile is unavailable');
  return found;
};
export const catalogDigest = () => canonicalJson(catalog);
