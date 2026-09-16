import { createHash, randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { applyCommand, stableScenarioKey } from '../simulation/engine.ts';
import { getSimulationProfile, listSimulationProfiles, validateFixture } from '../simulation/catalog.ts';
import { projectCandidateDeliveries, projectCandidates, projectCheckpoints, projectAudit, projectRun } from '../simulation/projection.ts';
import { DEFAULT_SIMULATION_LIMITS, canonicalJson, safeDiagnostic, type CandidateLifecycleEntry, type CheckpointSnapshot, type EngineContext, type SafeDiagnostic, type SimulationAuditProjection, type SimulationCandidate, type SimulationCheckpointProjection, type SimulationOutcome, type SimulationProfile, type SimulationProjection, type SimulationRunProjection, type SimulationRunState } from '../simulation/types.ts';
import { withPostgresTransaction } from './transaction.ts';

export type SimulationPersistenceCode = 'NOT_FOUND' | 'CONFLICT' | 'VALIDATION_ERROR' | 'RESOURCE_UNAVAILABLE';
export class SimulationPersistenceError extends Error {
  readonly code: SimulationPersistenceCode;
  constructor(code: SimulationPersistenceCode, message = 'Resource not found') { super(message); this.name = 'SimulationPersistenceError'; this.code = code; }
}

export type SimulationClock = () => number;
export type SimulationCreateCommand = {
  ownerId: string; budgetId: string; profileCode: string; fixtureVersion: string; seed: string;
  idempotencyKey: string; actorId: string; requestId?: string; clock: SimulationClock;
};
export type SimulationCommandInput = {
  ownerId: string; budgetId: string; runId?: string; command: 'START' | 'ADVANCE' | 'RETRY';
  idempotencyKey: string; expectedRevision?: number; actorId: string; requestId?: string; clock: SimulationClock;
};
export type OwnerScopedRunQuery = { ownerId: string; budgetId: string; runId: string };
export type SimulationInspectCommand = OwnerScopedRunQuery & { idempotencyKey: string; actorId: string; requestId?: string; view: 'STATUS' | 'CANDIDATES' | 'CHECKPOINTS' | 'AUDIT'; clock: SimulationClock };
export type SimulationResult = SimulationProjection & { outcome: SimulationOutcome; simulationRevision: number; replayed?: boolean; diagnostic?: SafeDiagnostic };
export type SimulationInspectResult = { view: SimulationInspectCommand['view']; projection: SimulationProjection; replayed?: boolean };

export interface SimulationStore {
  listProfiles(ownerId: string, budgetId: string): Promise<ReturnType<typeof listSimulationProfiles>>;
  createRun(command: SimulationCreateCommand): Promise<SimulationResult>;
  execute(command: SimulationCommandInput): Promise<SimulationResult>;
  inspect(command: SimulationInspectCommand): Promise<SimulationInspectResult>;
  loadRun(query: OwnerScopedRunQuery): Promise<SimulationRunProjection>;
  listCandidates(query: OwnerScopedRunQuery): Promise<SimulationCandidate[]>;
  listCheckpoints(query: OwnerScopedRunQuery): Promise<SimulationCheckpointProjection[]>;
  listAudit(query: OwnerScopedRunQuery): Promise<SimulationAuditProjection[]>;
}

export const canonicalSimulationDigest = (value: unknown) => createHash('sha256').update(canonicalJson(value)).digest('hex');
const clone = <T>(value: T): T => structuredClone(value);
const eventTime = (clock: SimulationClock) => {
  const value = clock();
  if (!Number.isFinite(value)) throw new SimulationPersistenceError('VALIDATION_ERROR', 'Injected clock value is invalid');
  return value;
};
const projectionResult = (projection: SimulationProjection, outcome: SimulationOutcome, replayed = false, diagnostic?: SafeDiagnostic): SimulationResult => ({ ...clone(projection), outcome, simulationRevision: projection.run.revision, ...(replayed ? { replayed: true } : {}), ...(diagnostic ? { diagnostic } : {}) });
type MemoryRecord = { id: string; candidateId: string; budgetId: string; runId: string; sourceRecordId: string; batchIndex: number; deliveryOrdinal: number; businessDate: string; amountMinor: number; status: 'PENDING' | 'POSTED' | 'REJECTED'; payee: string | null; memo: string | null; checkpointId: string | null; attemptId: string; deliveredAt: string };
type MemoryAttempt = { id: string; sequence: number; command: 'START' | 'ADVANCE' | 'RETRY'; priorState: SimulationRunState; resultingState: SimulationRunState; outcome: SimulationOutcome; idempotencyKey: string; diagnostic?: SafeDiagnostic; eventAt: string };
type MemoryState = { ownerId: string; budgetId: string; run: SimulationRunProjection; candidates: SimulationCandidate[]; checkpoints: SimulationCheckpointProjection[]; audits: SimulationAuditProjection[]; records: MemoryRecord[]; attempts: MemoryAttempt[] };

type StoreOptions = { beforeCommit?: () => void | Promise<void> };

export class InMemorySimulationStore implements SimulationStore {
  private readonly budgets = new Map<string, string>();
  private readonly states = new Map<string, MemoryState>();
  private readonly receiptsByBudget = new Map<string, Map<string, { digest: string; result: SimulationResult | SimulationInspectResult }>>();
  private readonly queues = new Map<string, Promise<unknown>>();
  private readonly beforeCommit?: StoreOptions['beforeCommit'];
  constructor(budgets: Iterable<{ ownerId: string; budgetId: string }> = [], options: StoreOptions = {}) { for (const budget of budgets) this.registerBudget(budget.ownerId, budget.budgetId); this.beforeCommit = options.beforeCommit; }
  registerBudget(ownerId: string, budgetId: string) { this.budgets.set(budgetId, ownerId); }
  private assertOwner(ownerId: string, budgetId: string) { if (this.budgets.get(budgetId) !== ownerId) throw new SimulationPersistenceError('NOT_FOUND'); }
  private enqueue<T>(budgetId: string, work: () => Promise<T>) {
    const previous = this.queues.get(budgetId) ?? Promise.resolve();
    const current = previous.then(work, work);
    this.queues.set(budgetId, current);
    return current.finally(() => { if (this.queues.get(budgetId) === current) this.queues.delete(budgetId); });
  }
  async listProfiles(ownerId: string, budgetId: string) { this.assertOwner(ownerId, budgetId); return clone(listSimulationProfiles()); }
  async createRun(command: SimulationCreateCommand) {
    return this.enqueue(command.budgetId, async () => {
      this.assertOwner(command.ownerId, command.budgetId);
      const digest = canonicalSimulationDigest({ operation: 'CREATE', ownerId: command.ownerId, budgetId: command.budgetId, profileCode: command.profileCode, fixtureVersion: command.fixtureVersion, seed: command.seed, idempotencyKey: command.idempotencyKey });
      const receipts = this.receiptsByBudget.get(command.budgetId) ?? new Map();
      this.receiptsByBudget.set(command.budgetId, receipts);
      const existing = receipts.get(command.idempotencyKey);
      if (existing) { if (existing.digest !== digest) throw new SimulationPersistenceError('CONFLICT', 'Idempotency key was reused with a different payload'); return clone(existing.result as SimulationResult); }
      const profile = getSimulationProfile(command.profileCode, command.fixtureVersion);
      const runId = randomUUID();
      const run: SimulationRunProjection = { runId, state: 'DISCONNECTED', cursor: 0, revision: 0, processedRecordCount: 0, commandCount: 0, attemptCount: 0, profileCode: profile.code, fixtureVersion: profile.fixtureVersion, seed: command.seed, scenarioKey: stableScenarioKey(profile, command.seed) };
      const state: MemoryState = { ownerId: command.ownerId, budgetId: command.budgetId, run, candidates: [], checkpoints: [], audits: [], records: [], attempts: [] };
      const audit: SimulationAuditProjection = { id: randomUUID(), sequence: 1, actorId: command.actorId, budgetId: command.budgetId, runId, requestId: command.requestId ?? command.idempotencyKey, command: 'CREATE', priorState: 'DISCONNECTED', resultingState: 'DISCONNECTED', outcome: 'CREATED' };
      state.audits.push(audit);
      const projection = this.project(state);
      const result = projectionResult(projection, 'CREATED');
      await this.beforeCommit?.();
      this.states.set(runId, state); receipts.set(command.idempotencyKey, { digest, result: clone(result) });
      return clone(result);
    });
  }
  async execute(command: SimulationCommandInput) {
    if (!command.runId) throw new SimulationPersistenceError('VALIDATION_ERROR', 'runId is required');
    return this.enqueue(command.budgetId, async () => this.executeNow(command));
  }
  private async executeNow(command: SimulationCommandInput) {
    this.assertOwner(command.ownerId, command.budgetId);
    const state = this.states.get(command.runId!);
    if (!state || state.budgetId !== command.budgetId || state.ownerId !== command.ownerId) throw new SimulationPersistenceError('NOT_FOUND');
    const digest = canonicalSimulationDigest({ operation: 'CONTROL', budgetId: command.budgetId, runId: command.runId, command: command.command, expectedRevision: command.expectedRevision });
    const receipts = this.receiptsByBudget.get(command.budgetId) ?? new Map();
    this.receiptsByBudget.set(command.budgetId, receipts);
    const receipt = receipts.get(command.idempotencyKey);
    if (receipt) { if (receipt.digest !== digest) throw new SimulationPersistenceError('CONFLICT', 'Idempotency key was reused with a different payload'); return clone(receipt.result as SimulationResult); }
    if (command.expectedRevision !== undefined && command.expectedRevision !== state.run.revision) throw new SimulationPersistenceError('CONFLICT', 'Simulation revision is stale');
    const profile = getSimulationProfile(state.run.profileCode!, state.run.fixtureVersion!);
    const context: EngineContext = { profile, seed: state.run.seed!, clock: command.clock, limits: DEFAULT_SIMULATION_LIMITS };
    const checkpoint = state.checkpoints.at(-1) ?? null;
    const plan = applyCommand(context, command.command, clone(state.run), checkpoint);
    const draft = clone(state);
    const attemptId = randomUUID();
    const sequence = draft.attempts.length + 1;
    const checkpointId = plan.checkpoint ? randomUUID() : null;
    if (plan.checkpoint) { plan.checkpoint.id = checkpointId!; plan.checkpoint.sequence = draft.checkpoints.length + 1; }
    const eventAt = new Date(plan.eventTime ?? eventTime(command.clock)).toISOString();
    const diagnostic = plan.diagnostic ?? plan.next.lastDiagnostic;
    draft.run = { ...plan.next, ...(diagnostic ? { lastDiagnostic: diagnostic } : {}) };
    const candidateContext = { budgetId: command.budgetId, profileCode: profile.code, fixtureVersion: profile.fixtureVersion, seed: state.run.seed!, attemptId, checkpointId };
    draft.candidates = projectCandidateDeliveries(draft.candidates, plan.deliveries, candidateContext, command.runId);
    for (const delivery of plan.deliveries) draft.records.push({ id: randomUUID(), candidateId: delivery.candidateIdentity, budgetId: command.budgetId, runId: command.runId, sourceRecordId: delivery.record.sourceRecordId, batchIndex: delivery.batchIndex, deliveryOrdinal: delivery.deliveryOrdinal, businessDate: delivery.record.businessDate, amountMinor: delivery.record.amountMinor, status: delivery.record.status, payee: delivery.record.payee, memo: delivery.record.memo, checkpointId, attemptId, deliveredAt: eventAt });
    if (plan.checkpoint) draft.checkpoints.push(clone(plan.checkpoint) as SimulationCheckpointProjection);
    const attempt: MemoryAttempt = { id: attemptId, sequence, command: command.command, priorState: state.run.state, resultingState: draft.run.state, outcome: plan.outcome, idempotencyKey: command.idempotencyKey, ...(diagnostic ? { diagnostic } : {}), eventAt };
    draft.attempts.push(attempt);
    draft.audits.push({ id: randomUUID(), sequence: state.audits.length + 1, actorId: command.actorId, budgetId: command.budgetId, runId: command.runId, requestId: command.requestId ?? command.idempotencyKey, command: command.command, priorState: state.run.state, resultingState: draft.run.state, outcome: plan.outcome, attemptId, checkpointId, ...(diagnostic ? { diagnostic } : {}) });
    const result = projectionResult(this.project(draft), plan.outcome, false, diagnostic);
    await this.beforeCommit?.();
    this.states.set(command.runId, draft); receipts.set(command.idempotencyKey, { digest, result: clone(result) });
    return clone(result);
  }
  private project(state: MemoryState): SimulationProjection { return { run: projectRun(state.run), candidates: projectCandidates(state.candidates), checkpoints: projectCheckpoints(state.checkpoints), audits: projectAudit(state.audits) }; }
  async inspect(command: SimulationInspectCommand) { const digest = canonicalSimulationDigest({ operation: 'INSPECT', ...command, clock: undefined }); return this.enqueue(command.budgetId, async () => { this.assertOwner(command.ownerId, command.budgetId); const state = this.states.get(command.runId); if (!state || state.ownerId !== command.ownerId) throw new SimulationPersistenceError('NOT_FOUND'); const receipts = this.receiptsByBudget.get(command.budgetId) ?? new Map(); this.receiptsByBudget.set(command.budgetId, receipts); const receipt = receipts.get(command.idempotencyKey); if (receipt) { if (receipt.digest !== digest) throw new SimulationPersistenceError('CONFLICT'); return clone(receipt.result as unknown as SimulationInspectResult); } const result = { view: command.view, projection: this.project(state) }; await this.beforeCommit?.(); receipts.set(command.idempotencyKey, { digest, result: clone(result) }); return clone(result); }); }
  async loadRun(query: OwnerScopedRunQuery) { this.assertOwner(query.ownerId, query.budgetId); const state = this.states.get(query.runId); if (!state || state.ownerId !== query.ownerId || state.budgetId !== query.budgetId) throw new SimulationPersistenceError('NOT_FOUND'); return clone(projectRun(state.run)); }
  async listCandidates(query: OwnerScopedRunQuery) { return this.read(query, state => projectCandidates(state.candidates)); }
  async listCheckpoints(query: OwnerScopedRunQuery) { return this.read(query, state => projectCheckpoints(state.checkpoints)); }
  async listAudit(query: OwnerScopedRunQuery) { return this.read(query, state => projectAudit(state.audits)); }
  private async read<T>(query: OwnerScopedRunQuery, select: (state: MemoryState) => T) { this.assertOwner(query.ownerId, query.budgetId); const state = this.states.get(query.runId); if (!state || state.ownerId !== query.ownerId || state.budgetId !== query.budgetId) throw new SimulationPersistenceError('NOT_FOUND'); return clone(select(state)); }
}

const amount = (value: bigint) => { const number = Number(value); if (!Number.isSafeInteger(number)) throw new SimulationPersistenceError('RESOURCE_UNAVAILABLE', 'Persisted amount exceeds safe range'); return number; };
const date = (value: Date) => value.toISOString().slice(0, 10);
const timestamp = (value: Date) => value.toISOString();
const mapRun = (row: any): SimulationRunProjection => ({ runId: row.id, state: row.state, cursor: row.cursor, revision: row.revision, processedRecordCount: row.processedRecordCount ?? 0, commandCount: row.commandCount, attemptCount: row.attemptCount, profileCode: row.profileCode, fixtureVersion: row.fixtureVersion, seed: row.seed, scenarioKey: row.scenarioKey, ...(row.diagnosticCode ? { lastDiagnostic: safeDiagnostic(row.diagnosticCode, row.diagnosticMessage ?? '') } : {}) });
const mapCheckpoint = (row: any): SimulationCheckpointProjection => ({ id: row.id, sequence: row.sequence, cursor: row.cursor, state: row.state, processedRecordCount: row.processedRecordCount });
const mapAudit = (row: any): SimulationAuditProjection => ({ id: row.id, sequence: row.sequence, actorId: row.actorId, budgetId: row.budgetId, runId: row.runId, requestId: row.requestId, command: row.command, priorState: row.priorState, resultingState: row.resultingState, outcome: row.outcome, attemptId: row.attemptId, checkpointId: row.checkpointId, ...(row.diagnosticCode ? { diagnostic: safeDiagnostic(row.diagnosticCode, row.diagnosticMessage ?? '') } : {}) });

export class PrismaSimulationStore implements SimulationStore {
  private readonly client: PrismaClient;
  private readonly beforeCommit?: StoreOptions['beforeCommit'];
  constructor(client?: PrismaClient, options: StoreOptions = {}) { if (!client) throw new Error('PrismaSimulationStore requires a PrismaClient'); this.client = client; this.beforeCommit = options.beforeCommit; }
  private async ownerBudget(tx: any, ownerId: string, budgetId: string) { const budget = await tx.budget.findFirst({ where: { id: budgetId, ownerId }, select: { id: true } }); if (!budget) throw new SimulationPersistenceError('NOT_FOUND'); await tx.$queryRaw`SELECT "id" FROM "Budget" WHERE "id" = ${budgetId}::uuid FOR UPDATE`; return budget; }
  private async scope(tx: any, budgetId: string) { await tx.simulationScope.upsert({ where: { budgetId }, create: { budgetId }, update: {} }); await tx.$queryRaw`SELECT "id" FROM "SimulationScope" WHERE "budgetId" = ${budgetId}::uuid FOR UPDATE`; return tx.simulationScope.findUniqueOrThrow({ where: { budgetId } }); }
  private async profile(tx: any, code: string, fixtureVersion: string): Promise<SimulationProfile> { const row = await tx.simulationProfile.findUnique({ where: { code_fixtureVersion: { code, fixtureVersion } } }); if (!row || !row.enabled) throw new SimulationPersistenceError('NOT_FOUND'); const profile = { code: row.code, displayLabel: row.displayLabel, description: row.description, fixtureVersion: row.fixtureVersion, fixture: row.fixture, enabled: row.enabled } as SimulationProfile; try { validateFixture(profile.fixture); } catch { throw new SimulationPersistenceError('VALIDATION_ERROR', 'Stored simulation fixture is invalid'); } return profile; }
  private async receipt(tx: any, budgetId: string, key: string, digest: string) { const row = await tx.simulationCommandReceipt.findUnique({ where: { budgetId_idempotencyKey: { budgetId, idempotencyKey: key } } }); if (row) { if (row.payloadDigest !== digest) throw new SimulationPersistenceError('CONFLICT', 'Idempotency key was reused with a different payload'); return row.result as SimulationResult; } return null; }
  async listProfiles(ownerId: string, budgetId: string) { return withPostgresTransaction(this.client, async tx => { await this.ownerBudget(tx, ownerId, budgetId); const rows = await tx.simulationProfile.findMany({ where: { enabled: true }, orderBy: [{ code: 'asc' }, { fixtureVersion: 'asc' }], take: DEFAULT_SIMULATION_LIMITS.maxProfiles }); return rows.map((row: any) => ({ code: row.code, displayLabel: row.displayLabel, description: row.description, fixtureVersion: row.fixtureVersion, enabled: row.enabled })); }); }
  async createRun(command: SimulationCreateCommand) { try { return await withPostgresTransaction(this.client, async tx => { await this.ownerBudget(tx, command.ownerId, command.budgetId); const scope = await this.scope(tx, command.budgetId); const digest = canonicalSimulationDigest({ operation: 'CREATE', ownerId: command.ownerId, budgetId: command.budgetId, profileCode: command.profileCode, fixtureVersion: command.fixtureVersion, seed: command.seed, idempotencyKey: command.idempotencyKey }); const saved = await this.receipt(tx, command.budgetId, command.idempotencyKey, digest); if (saved) return { ...saved, replayed: true }; const profile = await this.profile(tx, command.profileCode, command.fixtureVersion); const runId = randomUUID(); const createdAt = new Date(eventTime(command.clock)); await tx.simulationRun.create({ data: { id: runId, budgetId: command.budgetId, profileCode: profile.code, fixtureVersion: profile.fixtureVersion, seed: command.seed, scenarioKey: stableScenarioKey(profile, command.seed), state: 'DISCONNECTED', cursor: 0, revision: 0, commandCount: 0, attemptCount: 0, processedRecordCount: 0, createdAt } }); const auditSequence = scope.auditSequence + 1; await tx.simulationScope.update({ where: { budgetId: command.budgetId }, data: { auditSequence, lockVersion: { increment: 1 } } }); await tx.simulationAuditEntry.create({ data: { id: randomUUID(), budgetId: command.budgetId, runId, sequence: auditSequence, actorId: command.actorId, requestId: command.requestId ?? command.idempotencyKey, command: 'CREATE', priorState: 'DISCONNECTED', resultingState: 'DISCONNECTED', outcome: 'CREATED', eventAt: createdAt } }); const projection = await this.readProjection(tx, command.ownerId, command.budgetId, runId); const result = projectionResult(projection, 'CREATED'); await this.beforeCommit?.(); await tx.simulationCommandReceipt.create({ data: { budgetId: command.budgetId, idempotencyKey: command.idempotencyKey, command: 'CREATE', payloadDigest: digest, result } }); return result; }); } catch (error: any) { if (error?.code === 'P2002') throw new SimulationPersistenceError('CONFLICT', 'Simulation identity already exists'); throw error; } }
  async execute(command: SimulationCommandInput) { if (!command.runId) throw new SimulationPersistenceError('VALIDATION_ERROR', 'runId is required'); try { return await withPostgresTransaction(this.client, async tx => { await this.ownerBudget(tx, command.ownerId, command.budgetId); const scope = await this.scope(tx, command.budgetId); const digest = canonicalSimulationDigest({ operation: 'CONTROL', budgetId: command.budgetId, runId: command.runId, command: command.command, expectedRevision: command.expectedRevision }); const saved = await this.receipt(tx, command.budgetId, command.idempotencyKey, digest); if (saved) return { ...saved, replayed: true }; const row = await tx.simulationRun.findFirst({ where: { id: command.runId, budgetId: command.budgetId } }); if (!row) throw new SimulationPersistenceError('NOT_FOUND'); if (command.expectedRevision !== undefined && command.expectedRevision !== row.revision) throw new SimulationPersistenceError('CONFLICT', 'Simulation revision is stale'); const profile = await this.profile(tx, row.profileCode, row.fixtureVersion); const checkpoints = await tx.simulationCheckpoint.findMany({ where: { budgetId: command.budgetId, runId: command.runId }, orderBy: { sequence: 'asc' } }); const candidates = await this.readCandidates(tx, command.budgetId, command.runId); const run = mapRun(row); const plan = applyCommand({ profile, seed: row.seed, clock: command.clock, limits: DEFAULT_SIMULATION_LIMITS }, command.command, run, checkpoints.at(-1) ? mapCheckpoint(checkpoints.at(-1)) : null); const attemptId = randomUUID(); const attemptSequence = row.attemptCount + 1; const checkpointId = plan.checkpoint ? randomUUID() : null; if (plan.checkpoint) { plan.checkpoint.id = checkpointId!; plan.checkpoint.sequence = checkpoints.length + 1; } const at = new Date(plan.eventTime ?? eventTime(command.clock)); const diagnostic = plan.diagnostic ?? plan.next.lastDiagnostic; await tx.simulationAttempt.create({ data: { id: attemptId, budgetId: command.budgetId, runId: command.runId, sequence: attemptSequence, idempotencyKey: command.idempotencyKey, command: command.command, priorState: row.state, resultingState: plan.next.state, outcome: plan.outcome, diagnosticCode: diagnostic?.code, diagnosticMessage: diagnostic?.message, eventAt: at } }); if (plan.checkpoint) await tx.simulationCheckpoint.create({ data: { id: checkpointId!, budgetId: command.budgetId, runId: command.runId, sequence: plan.checkpoint.sequence!, cursor: plan.checkpoint.cursor, state: plan.checkpoint.state, processedRecordCount: plan.checkpoint.processedRecordCount, checkpointAt: at } }); for (const delivery of plan.deliveries) { const recordId = randomUUID(); await tx.simulatedRecord.create({ data: { id: recordId, budgetId: command.budgetId, runId: command.runId, sourceRecordId: delivery.record.sourceRecordId, batchIndex: delivery.batchIndex, deliveryOrdinal: delivery.deliveryOrdinal, businessDate: new Date(`${delivery.record.businessDate}T00:00:00Z`), amountMinor: BigInt(delivery.record.amountMinor), status: delivery.record.status, payee: delivery.record.payee, memo: delivery.record.memo, checkpointId, attemptId, deliveredAt: at } }); const prior = candidates.find(candidate => candidate.id === delivery.candidateIdentity); const lifecycle: CandidateLifecycleEntry = { sequence: delivery.deliveryOrdinal, priorStatus: prior?.status ?? null, status: delivery.status, attemptId, checkpointId }; const candidate: SimulationCandidate = prior ? { ...prior, status: delivery.status, lifecycle: [...prior.lifecycle, lifecycle], provenance: { ...prior.provenance, batchIndex: delivery.batchIndex, checkpointId, attemptId } } : { id: delivery.candidateIdentity, runId: command.runId, status: delivery.status, sourceRecordId: delivery.record.sourceRecordId, businessDate: delivery.record.businessDate, amountMinor: delivery.record.amountMinor, payee: delivery.record.payee, memo: delivery.record.memo, provenance: { budgetId: command.budgetId, profileCode: profile.code, fixtureVersion: profile.fixtureVersion, seed: row.seed, sourceRecordId: delivery.record.sourceRecordId, deliveryOrdinal: delivery.deliveryOrdinal, batchIndex: delivery.batchIndex, checkpointId, attemptId }, lifecycle: [lifecycle] }; if (prior) await tx.simulationCandidate.update({ where: { id: prior.id }, data: { status: candidate.status, provenance: candidate.provenance } }); else await tx.simulationCandidate.create({ data: { id: candidate.id, budgetId: command.budgetId, runId: command.runId, simulatedRecordId: recordId, status: candidate.status, sourceRecordId: candidate.sourceRecordId, businessDate: new Date(`${candidate.businessDate}T00:00:00Z`), amountMinor: BigInt(candidate.amountMinor), payee: candidate.payee, memo: candidate.memo, provenance: candidate.provenance } }); await tx.simulationCandidateEvent.create({ data: { budgetId: command.budgetId, candidateId: candidate.id, sequence: lifecycle.sequence, priorStatus: lifecycle.priorStatus, status: lifecycle.status, attemptId, checkpointId, eventAt: at } }); }
      await tx.simulationRun.update({ where: { id: command.runId }, data: { state: plan.next.state, cursor: plan.next.cursor, revision: plan.next.revision, commandCount: plan.next.commandCount, attemptCount: plan.next.attemptCount, processedRecordCount: plan.next.processedRecordCount, diagnosticCode: diagnostic?.code ?? null, diagnosticMessage: diagnostic?.message ?? null } }); const auditSequence = scope.auditSequence + 1; await tx.simulationScope.update({ where: { budgetId: command.budgetId }, data: { auditSequence, lockVersion: { increment: 1 } } }); await tx.simulationAuditEntry.create({ data: { id: randomUUID(), budgetId: command.budgetId, runId: command.runId, sequence: auditSequence, actorId: command.actorId, requestId: command.requestId ?? command.idempotencyKey, command: command.command, priorState: row.state, resultingState: plan.next.state, outcome: plan.outcome, attemptId, checkpointId, diagnosticCode: diagnostic?.code, diagnosticMessage: diagnostic?.message, eventAt: at } }); const projection = await this.readProjection(tx, command.ownerId, command.budgetId, command.runId); const result = projectionResult(projection, plan.outcome, false, diagnostic); await this.beforeCommit?.(); await tx.simulationCommandReceipt.create({ data: { budgetId: command.budgetId, idempotencyKey: command.idempotencyKey, command: command.command, payloadDigest: digest, result, runId: command.runId } }); return result; }); } catch (error: any) { if (error?.code === 'P2002') throw new SimulationPersistenceError('CONFLICT', 'Simulation identity already exists'); throw error; } }
  async inspect(command: SimulationInspectCommand) { const digest = canonicalSimulationDigest({ operation: 'INSPECT', ownerId: command.ownerId, budgetId: command.budgetId, runId: command.runId, view: command.view, idempotencyKey: command.idempotencyKey }); return withPostgresTransaction(this.client, async tx => { await this.ownerBudget(tx, command.ownerId, command.budgetId); await this.scope(tx, command.budgetId); const saved = await this.receipt(tx, command.budgetId, command.idempotencyKey, digest); if (saved) return { ...(saved as unknown as SimulationInspectResult), replayed: true }; const projection = await this.readProjection(tx, command.ownerId, command.budgetId, command.runId); const result = { view: command.view, projection }; await tx.simulationCommandReceipt.create({ data: { budgetId: command.budgetId, idempotencyKey: command.idempotencyKey, command: 'INSPECT', payloadDigest: digest, result, runId: command.runId } }); return result; }); }
  async loadRun(query: OwnerScopedRunQuery) { return withPostgresTransaction(this.client, async tx => { await this.ownerBudget(tx, query.ownerId, query.budgetId); const row = await tx.simulationRun.findFirst({ where: { id: query.runId, budgetId: query.budgetId } }); if (!row) throw new SimulationPersistenceError('NOT_FOUND'); return projectRun(mapRun(row)); }); }
  async listCandidates(query: OwnerScopedRunQuery) { return withPostgresTransaction(this.client, async tx => { await this.ownerBudget(tx, query.ownerId, query.budgetId); if (!await tx.simulationRun.findFirst({ where: { id: query.runId, budgetId: query.budgetId }, select: { id: true } })) throw new SimulationPersistenceError('NOT_FOUND'); return projectCandidates(await this.readCandidates(tx, query.budgetId, query.runId)); }); }
  async listCheckpoints(query: OwnerScopedRunQuery) { return withPostgresTransaction(this.client, async tx => { await this.ownerBudget(tx, query.ownerId, query.budgetId); if (!await tx.simulationRun.findFirst({ where: { id: query.runId, budgetId: query.budgetId }, select: { id: true } })) throw new SimulationPersistenceError('NOT_FOUND'); return projectCheckpoints((await tx.simulationCheckpoint.findMany({ where: { budgetId: query.budgetId, runId: query.runId }, orderBy: [{ sequence: 'asc' }, { id: 'asc' }] })).map(mapCheckpoint)); }); }
  async listAudit(query: OwnerScopedRunQuery) { return withPostgresTransaction(this.client, async tx => { await this.ownerBudget(tx, query.ownerId, query.budgetId); if (!await tx.simulationRun.findFirst({ where: { id: query.runId, budgetId: query.budgetId }, select: { id: true } })) throw new SimulationPersistenceError('NOT_FOUND'); return projectAudit((await tx.simulationAuditEntry.findMany({ where: { budgetId: query.budgetId, runId: query.runId }, orderBy: [{ sequence: 'asc' }, { id: 'asc' }] })).map(mapAudit)); }); }
  private async readCandidates(tx: any, budgetId: string, runId: string): Promise<SimulationCandidate[]> { const rows = await tx.simulationCandidate.findMany({ where: { budgetId, runId }, orderBy: [{ sourceRecordId: 'asc' }, { id: 'asc' }] }); const events = await tx.simulationCandidateEvent.findMany({ where: { budgetId, candidateId: { in: rows.map((row: any) => row.id) } }, orderBy: [{ sequence: 'asc' }, { id: 'asc' }] }); return rows.map((row: any) => ({ id: row.id, runId: row.runId, status: row.status, sourceRecordId: row.sourceRecordId, businessDate: date(row.businessDate), amountMinor: amount(row.amountMinor), payee: row.payee, memo: row.memo, provenance: row.provenance, lifecycle: events.filter((event: any) => event.candidateId === row.id).map((event: any) => ({ sequence: event.sequence, priorStatus: event.priorStatus, status: event.status, attemptId: event.attemptId, checkpointId: event.checkpointId })) })); }
  private async readProjection(tx: any, ownerId: string, budgetId: string, runId: string): Promise<SimulationProjection> { const row = await tx.simulationRun.findFirst({ where: { id: runId, budgetId }, }); if (!row) throw new SimulationPersistenceError('NOT_FOUND'); const [candidates, checkpoints, audits] = await Promise.all([this.readCandidates(tx, budgetId, runId), tx.simulationCheckpoint.findMany({ where: { budgetId, runId }, orderBy: [{ sequence: 'asc' }, { id: 'asc' }] }), tx.simulationAuditEntry.findMany({ where: { budgetId, runId }, orderBy: [{ sequence: 'asc' }, { id: 'asc' }] })]); return { run: projectRun(mapRun(row)), candidates: projectCandidates(candidates), checkpoints: projectCheckpoints(checkpoints.map(mapCheckpoint)), audits: projectAudit(audits.map(mapAudit)) }; }
}
