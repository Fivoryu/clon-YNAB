CREATE TYPE "TransactionStatus" AS ENUM ('POSTED', 'WORKING');
ALTER TYPE "FinancialEventKind" ADD VALUE 'TRANSACTION_DELETE';

ALTER TABLE "FinancialEvent"
  ADD COLUMN "transactionId" UUID,
  ADD COLUMN "supersedesEventId" UUID,
  ADD COLUMN "status" "TransactionStatus",
  ADD COLUMN "reconciled" BOOLEAN NOT NULL DEFAULT false;

UPDATE "FinancialEvent"
SET "transactionId" = "id", "status" = 'POSTED', "businessDate" = to_date("month" || '-01', 'YYYY-MM-DD')
WHERE "kind" IN ('INCOME', 'SPENDING');

ALTER TABLE "FinancialEvent"
  ADD CONSTRAINT "FinancialEvent_transaction_shape_check" CHECK (
    "kind"::text NOT IN ('INCOME', 'SPENDING', 'TRANSACTION_DELETE') OR
    ("transactionId" IS NOT NULL AND "businessDate" IS NOT NULL AND "status" IS NOT NULL)
  ),
  ADD CONSTRAINT "FinancialEvent_tombstone_check" CHECK (
    "kind"::text <> 'TRANSACTION_DELETE' OR ("transactionId" IS NOT NULL AND "amountMinor" = 0)
  );
CREATE INDEX "FinancialEvent_budget_transaction_created_idx" ON "FinancialEvent" ("budgetId", "transactionId", "createdAt");
CREATE INDEX "FinancialEvent_supersedes_idx" ON "FinancialEvent" ("supersedesEventId");

CREATE TABLE "TransactionDeletionAudit" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "budgetId" UUID NOT NULL,
  "actorId" UUID NOT NULL,
  "transactionId" UUID NOT NULL,
  "requestId" TEXT,
  "reason" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "TransactionDeletionAudit_budget_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE RESTRICT,
  CONSTRAINT "TransactionDeletionAudit_actor_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT,
  CONSTRAINT "TransactionDeletionAudit_budget_key_uq" UNIQUE ("budgetId", "idempotencyKey")
);
CREATE INDEX "TransactionDeletionAudit_lookup_idx" ON "TransactionDeletionAudit" ("budgetId", "transactionId", "createdAt");
