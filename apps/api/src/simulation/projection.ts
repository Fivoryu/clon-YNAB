import { SimulationDomainError, type CandidateLifecycleEntry, type CandidateStatus, type FixtureDelivery, type SimulationAuditProjection, type SimulationCandidate, type SimulationCheckpointProjection, type SimulationProjection, type SimulationProjectionInput, type SimulationRunProjection } from './types.ts';

const clone = <T>(value: T): T => structuredClone(value);
const compareText = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;
const candidateOrder = (left: SimulationCandidate, right: SimulationCandidate) => (left.provenance.batchIndex - right.provenance.batchIndex) || (left.provenance.deliveryOrdinal - right.provenance.deliveryOrdinal) || compareText(left.id, right.id);
const checkpointOrder = (left: SimulationCheckpointProjection, right: SimulationCheckpointProjection) => (left.sequence - right.sequence) || compareText(left.id, right.id);
const auditOrder = (left: SimulationAuditProjection, right: SimulationAuditProjection) => (left.sequence - right.sequence) || compareText(left.id, right.id);
const assertReachableState = (state: string) => {
  if (state === 'APPLIED') throw new SimulationDomainError('ILLEGAL_TRANSITION', 'Applied candidates are not part of local simulation');
};

export const projectRun = (run: SimulationRunProjection): SimulationRunProjection => {
  assertReachableState(run.state);
  return clone(run);
};
export const projectCandidates = (candidates: readonly SimulationCandidate[]): SimulationCandidate[] => candidates.map(clone).sort(candidateOrder).map(candidate => ({ ...candidate, lifecycle: candidate.lifecycle.map(clone).sort((left, right) => left.sequence - right.sequence) }));
export const projectCheckpoints = (checkpoints: readonly SimulationCheckpointProjection[]): SimulationCheckpointProjection[] => checkpoints.map(clone).sort(checkpointOrder);
export const projectAudit = (audits: readonly SimulationAuditProjection[]): SimulationAuditProjection[] => audits.map(clone).sort(auditOrder);

export type CandidateProjectionContext = {
  budgetId: string;
  profileCode: string;
  fixtureVersion: string;
  seed: string;
  attemptId: string;
  checkpointId: string | null;
};
export const projectCandidateDeliveries = (prior: readonly SimulationCandidate[], deliveries: readonly FixtureDelivery[], context: CandidateProjectionContext, runId: string): SimulationCandidate[] => {
  const result = projectCandidates(prior);
  for (const delivery of deliveries) {
    const existing = result.find(candidate => candidate.id === delivery.candidateIdentity);
    const lifecycle: CandidateLifecycleEntry = {
      sequence: delivery.deliveryOrdinal,
      priorStatus: existing?.status ?? null,
      status: delivery.status,
      attemptId: context.attemptId,
      checkpointId: context.checkpointId,
    };
    if (existing) {
      existing.status = delivery.status;
      existing.lifecycle.push(lifecycle);
      existing.provenance = { ...existing.provenance, deliveryOrdinal: existing.provenance.deliveryOrdinal, batchIndex: delivery.batchIndex, checkpointId: context.checkpointId, attemptId: context.attemptId };
    } else {
      result.push({
        id: delivery.candidateIdentity, runId, status: delivery.status, sourceRecordId: delivery.record.sourceRecordId,
        businessDate: delivery.record.businessDate, amountMinor: delivery.record.amountMinor, payee: delivery.record.payee, memo: delivery.record.memo,
        provenance: { budgetId: context.budgetId, profileCode: context.profileCode, fixtureVersion: context.fixtureVersion, seed: context.seed, sourceRecordId: delivery.record.sourceRecordId, deliveryOrdinal: delivery.deliveryOrdinal, batchIndex: delivery.batchIndex, checkpointId: context.checkpointId, attemptId: context.attemptId },
        lifecycle: [lifecycle],
      });
    }
  }
  return projectCandidates(result);
};

export const normalizeSimulationProjection = (input: SimulationProjectionInput): SimulationProjection => ({
  run: projectRun(input.run),
  candidates: projectCandidates(input.candidates),
  checkpoints: projectCheckpoints(input.checkpoints),
  audits: projectAudit(input.audits),
});

export const candidateStatuses = Object.freeze(['PENDING', 'POSTED', 'DUPLICATE', 'REJECTED'] as const satisfies readonly CandidateStatus[]);
