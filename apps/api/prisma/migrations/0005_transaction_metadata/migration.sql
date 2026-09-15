ALTER TABLE "FinancialEvent"
  ADD COLUMN "payee" TEXT,
  ADD COLUMN "memo" TEXT;

ALTER TABLE "Transfer"
  ADD COLUMN "payee" TEXT,
  ADD COLUMN "memo" TEXT;

CREATE INDEX "FinancialEvent_budget_transaction_created_id_idx"
  ON "FinancialEvent" ("budgetId", "transactionId", "createdAt", "id");
CREATE INDEX "FinancialEvent_budget_date_kind_created_idx"
  ON "FinancialEvent" ("budgetId", "businessDate", "kind", "createdAt");
CREATE INDEX "FinancialEvent_budget_account_date_idx"
  ON "FinancialEvent" ("budgetId", "accountId", "businessDate");
CREATE INDEX "FinancialEvent_budget_category_date_idx"
  ON "FinancialEvent" ("budgetId", "categoryId", "businessDate");
CREATE INDEX "Transfer_budget_date_created_id_idx"
  ON "Transfer" ("budgetId", "businessDate", "createdAt", "id");
CREATE INDEX "Transfer_budget_month_idx"
  ON "Transfer" ("budgetId", "month");
CREATE INDEX "Transfer_budget_source_date_idx"
  ON "Transfer" ("budgetId", "sourceAccountId", "businessDate");
CREATE INDEX "Transfer_budget_destination_date_idx"
  ON "Transfer" ("budgetId", "destinationAccountId", "businessDate");
