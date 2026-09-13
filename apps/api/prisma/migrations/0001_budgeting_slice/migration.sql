CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE "SetupStep" AS ENUM ('ACCOUNT', 'CATEGORIES', 'COMPLETE');
CREATE TYPE "AccountKind" AS ENUM ('CASH', 'CHECKING');
CREATE TYPE "FinancialEventKind" AS ENUM ('OPENING_BALANCE', 'INCOME', 'INCOME_RELEASE', 'SPENDING', 'ASSIGNMENT', 'UNASSIGNMENT', 'MOVE');

CREATE TABLE "User" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "email" TEXT NOT NULL UNIQUE,
  "passwordHash" TEXT NOT NULL, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE "Session" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "userId" UUID NOT NULL,
  "tokenHash" TEXT NOT NULL UNIQUE, "expiresAt" TIMESTAMPTZ NOT NULL,
  "revokedAt" TIMESTAMPTZ, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);
CREATE INDEX "Session_userId_expiresAt_idx" ON "Session" ("userId", "expiresAt");

CREATE TABLE "Budget" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "ownerId" UUID NOT NULL UNIQUE,
  "timezone" TEXT NOT NULL DEFAULT 'UTC', "setupStep" "SetupStep" NOT NULL DEFAULT 'ACCOUNT',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "Budget_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT,
  CONSTRAINT "Budget_timezone_check" CHECK (length("timezone") > 0)
);
CREATE INDEX "Budget_timezone_idx" ON "Budget" ("timezone");

CREATE TABLE "Account" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "budgetId" UUID NOT NULL UNIQUE,
  "name" TEXT NOT NULL, "kind" "AccountKind" NOT NULL, "archived" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "Account_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE RESTRICT
);
CREATE TABLE "Category" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "budgetId" UUID NOT NULL, "name" TEXT NOT NULL,
  "archived" BOOLEAN NOT NULL DEFAULT false, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "Category_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE RESTRICT
);
CREATE INDEX "Category_budgetId_archived_idx" ON "Category" ("budgetId", "archived");
CREATE UNIQUE INDEX "Category_active_name_uq" ON "Category" ("budgetId", "name") WHERE NOT "archived";

CREATE TABLE "OpeningBalance" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "accountId" UUID NOT NULL,
  "amountMinor" BIGINT NOT NULL, "recordedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "OpeningBalance_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT
);
CREATE INDEX "OpeningBalance_accountId_recordedAt_idx" ON "OpeningBalance" ("accountId", "recordedAt");

CREATE TABLE "BudgetMonth" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "budgetId" UUID NOT NULL,
  "month" VARCHAR(7) NOT NULL, "version" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "BudgetMonth_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE RESTRICT,
  CONSTRAINT "BudgetMonth_month_check" CHECK ("month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  CONSTRAINT "BudgetMonth_budget_month_uq" UNIQUE ("budgetId", "month")
);

CREATE TABLE "FinancialEvent" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "budgetId" UUID NOT NULL,
  "accountId" UUID, "categoryId" UUID, "sourceCategoryId" UUID, "destinationCategoryId" UUID,
  "relatedEventId" UUID, "kind" "FinancialEventKind" NOT NULL, "amountMinor" BIGINT NOT NULL,
  "businessDate" DATE, "month" VARCHAR(7), "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "FinancialEvent_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE RESTRICT,
  CONSTRAINT "FinancialEvent_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT,
  CONSTRAINT "FinancialEvent_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT,
  CONSTRAINT "FinancialEvent_sourceCategoryId_fkey" FOREIGN KEY ("sourceCategoryId") REFERENCES "Category"("id") ON DELETE RESTRICT,
  CONSTRAINT "FinancialEvent_destinationCategoryId_fkey" FOREIGN KEY ("destinationCategoryId") REFERENCES "Category"("id") ON DELETE RESTRICT,
  CONSTRAINT "FinancialEvent_relatedEventId_fkey" FOREIGN KEY ("relatedEventId") REFERENCES "FinancialEvent"("id") ON DELETE RESTRICT,
  CONSTRAINT "FinancialEvent_relatedEventId_uq" UNIQUE ("relatedEventId"),
  CONSTRAINT "FinancialEvent_month_check" CHECK ("month" IS NULL OR "month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
);
CREATE INDEX "FinancialEvent_budgetId_month_kind_idx" ON "FinancialEvent" ("budgetId", "month", "kind");
CREATE INDEX "FinancialEvent_accountId_createdAt_idx" ON "FinancialEvent" ("accountId", "createdAt");
CREATE INDEX "FinancialEvent_categoryId_month_idx" ON "FinancialEvent" ("categoryId", "month");

CREATE TABLE "CommandReceipt" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "budgetId" UUID NOT NULL,
  "idempotencyKey" TEXT NOT NULL, "payloadDigest" TEXT NOT NULL, "result" JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "CommandReceipt_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE RESTRICT,
  CONSTRAINT "CommandReceipt_budget_key_uq" UNIQUE ("budgetId", "idempotencyKey")
);
