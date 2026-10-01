ALTER TYPE "FinancialEventKind" ADD VALUE 'RECONCILIATION_ADJUSTMENT';

ALTER TABLE "FinancialEvent"
  ADD COLUMN "cleared" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "reconciliationId" UUID;

CREATE TABLE "Reconciliation" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "budgetId" UUID NOT NULL,
  "accountId" UUID NOT NULL,
  "actorId" UUID NOT NULL,
  "confirmedClearedBalanceMinor" BIGINT NOT NULL,
  "observedClearedBalanceMinor" BIGINT NOT NULL,
  "adjustmentMinor" BIGINT NOT NULL,
  "reason" TEXT,
  "month" VARCHAR(7) NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "Reconciliation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Reconciliation_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget" ("id") ON UPDATE NO ACTION ON DELETE RESTRICT,
  CONSTRAINT "Reconciliation_budgetId_accountId_fkey" FOREIGN KEY ("budgetId", "accountId") REFERENCES "Account" ("budgetId", "id") ON UPDATE NO ACTION ON DELETE RESTRICT,
  CONSTRAINT "Reconciliation_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User" ("id") ON UPDATE NO ACTION ON DELETE RESTRICT
);

CREATE UNIQUE INDEX "Reconciliation_budgetId_id_key" ON "Reconciliation" ("budgetId", "id");
CREATE INDEX "Reconciliation_budgetId_accountId_createdAt_idx" ON "Reconciliation" ("budgetId", "accountId", "createdAt");

ALTER TABLE "FinancialEvent"
  ADD CONSTRAINT "FinancialEvent_budgetId_reconciliationId_fkey"
    FOREIGN KEY ("budgetId", "reconciliationId") REFERENCES "Reconciliation" ("budgetId", "id") ON UPDATE NO ACTION ON DELETE RESTRICT;

CREATE INDEX "FinancialEvent_budgetId_reconciliationId_idx" ON "FinancialEvent" ("budgetId", "reconciliationId");
