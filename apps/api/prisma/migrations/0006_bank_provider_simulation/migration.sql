CREATE TYPE "SimulationRunState" AS ENUM ('DISCONNECTED', 'CONNECTING', 'CONNECTED', 'SYNCING', 'PARTIAL', 'FAILED', 'TIMED_OUT', 'SUCCEEDED');
CREATE TYPE "SimulationCandidateStatus" AS ENUM ('PENDING', 'POSTED', 'DUPLICATE', 'REJECTED');
CREATE TYPE "SimulationRecordStatus" AS ENUM ('PENDING', 'POSTED', 'REJECTED');
CREATE TYPE "SimulationCommand" AS ENUM ('START', 'ADVANCE', 'RETRY');
CREATE TYPE "SimulationAuditCommand" AS ENUM ('CREATE', 'START', 'ADVANCE', 'RETRY', 'INSPECT');
CREATE TYPE "SimulationOutcome" AS ENUM ('CREATED', 'STARTED', 'ADVANCED', 'RETRIED', 'FAILED', 'TIMED_OUT', 'PARTIAL', 'SUCCEEDED');

CREATE TABLE "SimulationProfile" (
  "code" TEXT NOT NULL,
  "fixtureVersion" TEXT NOT NULL,
  "displayLabel" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "fixture" JSONB NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "SimulationProfile_pkey" PRIMARY KEY ("code", "fixtureVersion"),
  CONSTRAINT "SimulationProfile_code_check" CHECK (length("code") > 0 AND length("code") <= 512),
  CONSTRAINT "SimulationProfile_fixture_version_check" CHECK (length("fixtureVersion") > 0 AND length("fixtureVersion") <= 512),
  CONSTRAINT "SimulationProfile_label_check" CHECK (length("displayLabel") > 0 AND length("displayLabel") <= 512),
  CONSTRAINT "SimulationProfile_description_check" CHECK (length("description") > 0 AND length("description") <= 2048)
);
CREATE INDEX "SimulationProfile_enabled_code_fixtureVersion_idx" ON "SimulationProfile" ("enabled", "code", "fixtureVersion");

CREATE TABLE "SimulationScope" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "budgetId" UUID NOT NULL UNIQUE,
  "auditSequence" INTEGER NOT NULL DEFAULT 0,
  "lockVersion" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "SimulationScope_budget_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE RESTRICT,
  CONSTRAINT "SimulationScope_sequence_check" CHECK ("auditSequence" >= 0 AND "lockVersion" >= 0)
);

CREATE TABLE "SimulationRun" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "budgetId" UUID NOT NULL,
  "profileCode" TEXT NOT NULL,
  "fixtureVersion" TEXT NOT NULL,
  "seed" TEXT NOT NULL,
  "scenarioKey" TEXT NOT NULL,
  "state" "SimulationRunState" NOT NULL DEFAULT 'DISCONNECTED',
  "cursor" INTEGER NOT NULL DEFAULT 0,
  "revision" INTEGER NOT NULL DEFAULT 0,
  "commandCount" INTEGER NOT NULL DEFAULT 0,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "processedRecordCount" INTEGER NOT NULL DEFAULT 0,
  "diagnosticCode" TEXT,
  "diagnosticMessage" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "SimulationRun_budget_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE RESTRICT,
  CONSTRAINT "SimulationRun_scope_fkey" FOREIGN KEY ("budgetId") REFERENCES "SimulationScope"("budgetId") ON DELETE RESTRICT,
  CONSTRAINT "SimulationRun_profile_fkey" FOREIGN KEY ("profileCode", "fixtureVersion") REFERENCES "SimulationProfile"("code", "fixtureVersion") ON DELETE RESTRICT,
  CONSTRAINT "SimulationRun_budget_id_key" UNIQUE ("budgetId", "id"),
  CONSTRAINT "SimulationRun_cursor_check" CHECK ("cursor" >= 0),
  CONSTRAINT "SimulationRun_revision_check" CHECK ("revision" >= 0),
  CONSTRAINT "SimulationRun_command_count_check" CHECK ("commandCount" >= 0),
  CONSTRAINT "SimulationRun_attempt_count_check" CHECK ("attemptCount" >= 0),
  CONSTRAINT "SimulationRun_processed_record_count_check" CHECK ("processedRecordCount" >= 0)
);
CREATE INDEX "SimulationRun_budget_state_updated_idx" ON "SimulationRun" ("budgetId", "state", "updatedAt");

CREATE TABLE "SimulationAttempt" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "budgetId" UUID NOT NULL,
  "runId" UUID NOT NULL,
  "sequence" INTEGER NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "command" "SimulationCommand" NOT NULL,
  "priorState" "SimulationRunState" NOT NULL,
  "resultingState" "SimulationRunState" NOT NULL,
  "outcome" "SimulationOutcome" NOT NULL,
  "diagnosticCode" TEXT,
  "diagnosticMessage" TEXT,
  "eventAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "SimulationAttempt_budget_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE RESTRICT,
  CONSTRAINT "SimulationAttempt_run_fkey" FOREIGN KEY ("budgetId", "runId") REFERENCES "SimulationRun"("budgetId", "id") ON DELETE RESTRICT,
  CONSTRAINT "SimulationAttempt_budget_run_sequence_key" UNIQUE ("budgetId", "runId", "sequence"),
  CONSTRAINT "SimulationAttempt_budget_id_key" UNIQUE ("budgetId", "id"),
  CONSTRAINT "SimulationAttempt_budget_idempotency_key" UNIQUE ("budgetId", "idempotencyKey"),
  CONSTRAINT "SimulationAttempt_sequence_check" CHECK ("sequence" >= 0)
);
CREATE INDEX "SimulationAttempt_budget_run_event_idx" ON "SimulationAttempt" ("budgetId", "runId", "eventAt", "id");

CREATE TABLE "SimulationCheckpoint" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "budgetId" UUID NOT NULL,
  "runId" UUID NOT NULL,
  "sequence" INTEGER NOT NULL,
  "cursor" INTEGER NOT NULL,
  "state" "SimulationRunState" NOT NULL,
  "processedRecordCount" INTEGER NOT NULL,
  "checkpointAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "SimulationCheckpoint_budget_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE RESTRICT,
  CONSTRAINT "SimulationCheckpoint_run_fkey" FOREIGN KEY ("budgetId", "runId") REFERENCES "SimulationRun"("budgetId", "id") ON DELETE RESTRICT,
  CONSTRAINT "SimulationCheckpoint_budget_run_sequence_key" UNIQUE ("budgetId", "runId", "sequence"),
  CONSTRAINT "SimulationCheckpoint_budget_id_key" UNIQUE ("budgetId", "id"),
  CONSTRAINT "SimulationCheckpoint_bounds_check" CHECK ("sequence" >= 0 AND "cursor" >= 0 AND "processedRecordCount" >= 0)
);
CREATE INDEX "SimulationCheckpoint_budget_run_sequence_idx" ON "SimulationCheckpoint" ("budgetId", "runId", "sequence");

CREATE TABLE "SimulatedRecord" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "budgetId" UUID NOT NULL,
  "runId" UUID NOT NULL,
  "sourceRecordId" TEXT NOT NULL,
  "batchIndex" INTEGER NOT NULL,
  "deliveryOrdinal" INTEGER NOT NULL,
  "businessDate" DATE NOT NULL,
  "amountMinor" BIGINT NOT NULL,
  "status" "SimulationRecordStatus" NOT NULL,
  "payee" TEXT,
  "memo" TEXT,
  "checkpointId" UUID,
  "attemptId" UUID NOT NULL,
  "deliveredAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "SimulatedRecord_budget_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE RESTRICT,
  CONSTRAINT "SimulatedRecord_run_fkey" FOREIGN KEY ("budgetId", "runId") REFERENCES "SimulationRun"("budgetId", "id") ON DELETE RESTRICT,
  CONSTRAINT "SimulatedRecord_attempt_fkey" FOREIGN KEY ("budgetId", "attemptId") REFERENCES "SimulationAttempt"("budgetId", "id") ON DELETE RESTRICT,
  CONSTRAINT "SimulatedRecord_checkpoint_fkey" FOREIGN KEY ("budgetId", "checkpointId") REFERENCES "SimulationCheckpoint"("budgetId", "id") ON DELETE RESTRICT,
  CONSTRAINT "SimulatedRecord_budget_run_source_ordinal_key" UNIQUE ("budgetId", "runId", "sourceRecordId", "deliveryOrdinal"),
  CONSTRAINT "SimulatedRecord_budget_id_key" UNIQUE ("budgetId", "id"),
  CONSTRAINT "SimulatedRecord_bounds_check" CHECK ("batchIndex" >= 0 AND "deliveryOrdinal" > 0 AND "amountMinor" > 0)
);
CREATE INDEX "SimulatedRecord_budget_run_batch_ordinal_idx" ON "SimulatedRecord" ("budgetId", "runId", "batchIndex", "deliveryOrdinal");

CREATE TABLE "SimulationCandidate" (
  "id" TEXT PRIMARY KEY,
  "budgetId" UUID NOT NULL,
  "runId" UUID NOT NULL,
  "simulatedRecordId" UUID NOT NULL,
  "status" "SimulationCandidateStatus" NOT NULL,
  "sourceRecordId" TEXT NOT NULL,
  "businessDate" DATE NOT NULL,
  "amountMinor" BIGINT NOT NULL,
  "payee" TEXT,
  "memo" TEXT,
  "provenance" JSONB NOT NULL,
  CONSTRAINT "SimulationCandidate_budget_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE RESTRICT,
  CONSTRAINT "SimulationCandidate_run_fkey" FOREIGN KEY ("budgetId", "runId") REFERENCES "SimulationRun"("budgetId", "id") ON DELETE RESTRICT,
  CONSTRAINT "SimulationCandidate_record_fkey" FOREIGN KEY ("budgetId", "simulatedRecordId") REFERENCES "SimulatedRecord"("budgetId", "id") ON DELETE RESTRICT,
  CONSTRAINT "SimulationCandidate_budget_id_key" UNIQUE ("budgetId", "id"),
  CONSTRAINT "SimulationCandidate_amount_check" CHECK ("amountMinor" > 0)
);
CREATE INDEX "SimulationCandidate_budget_run_record_idx" ON "SimulationCandidate" ("budgetId", "runId", "simulatedRecordId");

CREATE TABLE "SimulationCandidateEvent" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "budgetId" UUID NOT NULL,
  "candidateId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "priorStatus" "SimulationCandidateStatus",
  "status" "SimulationCandidateStatus" NOT NULL,
  "attemptId" UUID NOT NULL,
  "checkpointId" UUID,
  "eventAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "SimulationCandidateEvent_budget_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE RESTRICT,
  CONSTRAINT "SimulationCandidateEvent_candidate_fkey" FOREIGN KEY ("budgetId", "candidateId") REFERENCES "SimulationCandidate"("budgetId", "id") ON DELETE RESTRICT,
  CONSTRAINT "SimulationCandidateEvent_attempt_fkey" FOREIGN KEY ("budgetId", "attemptId") REFERENCES "SimulationAttempt"("budgetId", "id") ON DELETE RESTRICT,
  CONSTRAINT "SimulationCandidateEvent_checkpoint_fkey" FOREIGN KEY ("budgetId", "checkpointId") REFERENCES "SimulationCheckpoint"("budgetId", "id") ON DELETE RESTRICT,
  CONSTRAINT "SimulationCandidateEvent_budget_candidate_sequence_key" UNIQUE ("budgetId", "candidateId", "sequence"),
  CONSTRAINT "SimulationCandidateEvent_sequence_check" CHECK ("sequence" > 0)
);
CREATE INDEX "SimulationCandidateEvent_budget_candidate_sequence_idx" ON "SimulationCandidateEvent" ("budgetId", "candidateId", "sequence");

CREATE TABLE "SimulationAuditEntry" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "budgetId" UUID NOT NULL,
  "runId" UUID NOT NULL,
  "sequence" INTEGER NOT NULL,
  "actorId" UUID NOT NULL,
  "requestId" TEXT NOT NULL,
  "command" "SimulationAuditCommand" NOT NULL,
  "priorState" "SimulationRunState" NOT NULL,
  "resultingState" "SimulationRunState" NOT NULL,
  "outcome" "SimulationOutcome" NOT NULL,
  "attemptId" UUID,
  "checkpointId" UUID,
  "diagnosticCode" TEXT,
  "diagnosticMessage" TEXT,
  "eventAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "SimulationAuditEntry_budget_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE RESTRICT,
  CONSTRAINT "SimulationAuditEntry_run_fkey" FOREIGN KEY ("budgetId", "runId") REFERENCES "SimulationRun"("budgetId", "id") ON DELETE RESTRICT,
  CONSTRAINT "SimulationAuditEntry_attempt_fkey" FOREIGN KEY ("budgetId", "attemptId") REFERENCES "SimulationAttempt"("budgetId", "id") ON DELETE RESTRICT,
  CONSTRAINT "SimulationAuditEntry_checkpoint_fkey" FOREIGN KEY ("budgetId", "checkpointId") REFERENCES "SimulationCheckpoint"("budgetId", "id") ON DELETE RESTRICT,
  CONSTRAINT "SimulationAuditEntry_actor_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT,
  CONSTRAINT "SimulationAuditEntry_budget_sequence_key" UNIQUE ("budgetId", "sequence"),
  CONSTRAINT "SimulationAuditEntry_sequence_check" CHECK ("sequence" > 0)
);
CREATE INDEX "SimulationAuditEntry_budget_run_sequence_idx" ON "SimulationAuditEntry" ("budgetId", "runId", "sequence");

CREATE TABLE "SimulationCommandReceipt" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "budgetId" UUID NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "command" "SimulationAuditCommand" NOT NULL,
  "payloadDigest" TEXT NOT NULL,
  "result" JSONB NOT NULL,
  "runId" UUID,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "SimulationCommandReceipt_budget_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE RESTRICT,
  CONSTRAINT "SimulationCommandReceipt_budget_key" UNIQUE ("budgetId", "idempotencyKey")
);
CREATE INDEX "SimulationCommandReceipt_budget_run_created_idx" ON "SimulationCommandReceipt" ("budgetId", "runId", "createdAt");

DO $$
DECLARE
  fixture JSONB := '{"profileCode":"BO_INSPIRED_A","fixtureVersion":"2026-01","maxCommands":100,"duplicatePolicy":"MARK_DUPLICATE","retryPolicy":{"retryableStates":["PARTIAL","FAILED","TIMED_OUT"],"resumeState":"SYNCING"},"transitions":[{"command":"START","from":"DISCONNECTED","to":"CONNECTING"},{"command":"ADVANCE","from":"CONNECTING","to":"CONNECTED"},{"command":"ADVANCE","from":"CONNECTED","to":"SYNCING"},{"command":"ADVANCE","from":"SYNCING","to":"PARTIAL","batchIndex":0,"outcome":"PARTIAL","diagnostic":{"code":"PARTIAL_SYNC","message":"A bounded synthetic prefix was synchronized"}},{"command":"ADVANCE","from":"SYNCING","to":"SUCCEEDED","batchIndex":1}],"batches":[{"index":0,"records":[{"sourceRecordId":"synthetic-source-1","businessDate":"2026-01-15","amountMinor":1250,"status":"PENDING","payee":"Synthetic merchant","memo":"Local fixture"}]},{"index":1,"records":[{"sourceRecordId":"synthetic-source-1","businessDate":"2026-01-15","amountMinor":1250,"status":"POSTED","payee":"Synthetic merchant","memo":"Local fixture"}]}]}'::jsonb;
  suffix TEXT;
BEGIN
  FOREACH suffix IN ARRAY ARRAY['A','B','C','D','E'] LOOP
    INSERT INTO "SimulationProfile" ("code", "fixtureVersion", "displayLabel", "description", "fixture", "enabled")
    VALUES ('BO_INSPIRED_' || suffix, '2026-01', 'Bolivia-inspired fictional preset ' || suffix, 'Fictional local simulation only; synthetic behavior, no network, and no real money.', jsonb_set(fixture, '{profileCode}', to_jsonb(('BO_INSPIRED_' || suffix)::text)), true)
    ON CONFLICT ("code", "fixtureVersion") DO NOTHING;
  END LOOP;
END $$;
