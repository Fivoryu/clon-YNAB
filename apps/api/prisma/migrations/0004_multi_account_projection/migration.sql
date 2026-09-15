-- Compatibility preflight: fail closed before removing the legacy one-account guard.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "OpeningBalance" GROUP BY "accountId" HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'duplicate opening rows require legacy review before multi-account migration';
  END IF;
  IF EXISTS (SELECT 1 FROM "FinancialEvent" WHERE "kind" IN ('INCOME', 'SPENDING') AND "accountId" IS NULL) THEN
    RAISE EXCEPTION 'historical events without account references require legacy review';
  END IF;
END $$;

ALTER TABLE "Account" DROP CONSTRAINT "Account_budgetId_key";
CREATE INDEX "Account_budgetId_createdAt_id_idx" ON "Account" ("budgetId", "createdAt", "id");
ALTER TABLE "OpeningBalance" ADD CONSTRAINT "OpeningBalance_accountId_key" UNIQUE ("accountId");

ALTER TYPE "FinancialEventKind" ADD VALUE 'TRANSFER_OUT';
ALTER TYPE "FinancialEventKind" ADD VALUE 'TRANSFER_IN';

CREATE TABLE "Transfer" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "budgetId" UUID NOT NULL,
  "sourceAccountId" UUID NOT NULL,
  "destinationAccountId" UUID NOT NULL,
  "amountMinor" BIGINT NOT NULL,
  "businessDate" DATE NOT NULL,
  "month" VARCHAR(7) NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "Transfer_budget_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget" ("id") ON DELETE RESTRICT,
  CONSTRAINT "Transfer_budget_source_fkey" FOREIGN KEY ("budgetId", "sourceAccountId") REFERENCES "Account" ("budgetId", "id") ON DELETE RESTRICT,
  CONSTRAINT "Transfer_budget_destination_fkey" FOREIGN KEY ("budgetId", "destinationAccountId") REFERENCES "Account" ("budgetId", "id") ON DELETE RESTRICT,
  CONSTRAINT "Transfer_distinct_accounts_check" CHECK ("sourceAccountId" <> "destinationAccountId"),
  CONSTRAINT "Transfer_amount_check" CHECK ("amountMinor" > 0),
  CONSTRAINT "Transfer_month_check" CHECK ("month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  CONSTRAINT "Transfer_budget_id_key" UNIQUE ("budgetId", "id")
);
CREATE INDEX "Transfer_budget_date_created_idx" ON "Transfer" ("budgetId", "businessDate", "createdAt");

ALTER TABLE "FinancialEvent" ADD COLUMN "transferId" UUID;
ALTER TABLE "FinancialEvent"
  ADD CONSTRAINT "FinancialEvent_budget_transfer_fkey"
    FOREIGN KEY ("budgetId", "transferId") REFERENCES "Transfer" ("budgetId", "id") ON DELETE RESTRICT,
  ADD CONSTRAINT "FinancialEvent_transfer_shape_check" CHECK (
    ("kind"::text IN ('TRANSFER_OUT', 'TRANSFER_IN')) = ("transferId" IS NOT NULL)
  ),
  ADD CONSTRAINT "FinancialEvent_transfer_fields_check" CHECK (
    "transferId" IS NULL OR ("accountId" IS NOT NULL AND "categoryId" IS NULL AND "amountMinor" > 0)
  );
CREATE INDEX "FinancialEvent_budget_transfer_idx" ON "FinancialEvent" ("budgetId", "transferId");
CREATE UNIQUE INDEX "FinancialEvent_budget_transfer_kind_key" ON "FinancialEvent" ("budgetId", "transferId", "kind");
