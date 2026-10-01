CREATE TYPE "ScheduledFlow" AS ENUM ('INCOME', 'SPENDING');

CREATE TABLE "ScheduledTransaction" (
  "id" UUID NOT NULL,
  "budgetId" UUID NOT NULL,
  "accountId" UUID NOT NULL,
  "categoryId" UUID,
  "flow" "ScheduledFlow" NOT NULL,
  "amountMinor" BIGINT NOT NULL,
  "payee" TEXT,
  "memo" TEXT,
  "dayOfMonth" INTEGER NOT NULL,
  "intervalMonths" INTEGER NOT NULL,
  "startDate" DATE NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "ScheduledTransaction_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ScheduledTransaction_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON UPDATE NO ACTION ON DELETE RESTRICT,
  CONSTRAINT "ScheduledTransaction_budgetId_accountId_fkey" FOREIGN KEY ("budgetId", "accountId") REFERENCES "Account"("budgetId", "id") ON UPDATE NO ACTION ON DELETE RESTRICT,
  CONSTRAINT "ScheduledTransaction_budgetId_categoryId_fkey" FOREIGN KEY ("budgetId", "categoryId") REFERENCES "Category"("budgetId", "id") ON UPDATE NO ACTION ON DELETE RESTRICT,
  CONSTRAINT "ScheduledTransaction_amountMinor_check" CHECK ("amountMinor" > 0),
  CONSTRAINT "ScheduledTransaction_dayOfMonth_check" CHECK ("dayOfMonth" BETWEEN 1 AND 31),
  CONSTRAINT "ScheduledTransaction_intervalMonths_check" CHECK ("intervalMonths" BETWEEN 1 AND 12),
  CONSTRAINT "ScheduledTransaction_flow_category_check" CHECK (
    ("flow" = 'INCOME' AND "categoryId" IS NULL)
    OR ("flow" = 'SPENDING' AND "categoryId" IS NOT NULL)
  )
);

CREATE INDEX "ScheduledTransaction_budgetId_idx" ON "ScheduledTransaction"("budgetId");
CREATE INDEX "ScheduledTransaction_budgetId_accountId_idx" ON "ScheduledTransaction"("budgetId", "accountId");
