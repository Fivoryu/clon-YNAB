DROP INDEX "FinancialEvent_budget_transfer_kind_key";

CREATE INDEX "FinancialEvent_budgetId_transferId_kind_idx" ON "FinancialEvent"("budgetId", "transferId", "kind");
