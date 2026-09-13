-- Keep every financial reference in the same budget as its event.
ALTER TABLE "Account"
  ADD CONSTRAINT "Account_budget_id_key" UNIQUE ("budgetId", "id");
ALTER TABLE "Category"
  ADD CONSTRAINT "Category_budget_id_key" UNIQUE ("budgetId", "id");
ALTER TABLE "FinancialEvent"
  ADD CONSTRAINT "FinancialEvent_budget_id_key" UNIQUE ("budgetId", "id"),
  ADD CONSTRAINT "FinancialEvent_budget_related_event_key" UNIQUE ("budgetId", "relatedEventId");

ALTER TABLE "FinancialEvent"
  DROP CONSTRAINT "FinancialEvent_accountId_fkey",
  DROP CONSTRAINT "FinancialEvent_categoryId_fkey",
  DROP CONSTRAINT "FinancialEvent_sourceCategoryId_fkey",
  DROP CONSTRAINT "FinancialEvent_destinationCategoryId_fkey",
  DROP CONSTRAINT "FinancialEvent_relatedEventId_fkey";

ALTER TABLE "FinancialEvent"
  ADD CONSTRAINT "FinancialEvent_budget_account_fkey"
    FOREIGN KEY ("budgetId", "accountId") REFERENCES "Account" ("budgetId", "id") ON DELETE RESTRICT,
  ADD CONSTRAINT "FinancialEvent_budget_category_fkey"
    FOREIGN KEY ("budgetId", "categoryId") REFERENCES "Category" ("budgetId", "id") ON DELETE RESTRICT,
  ADD CONSTRAINT "FinancialEvent_budget_source_category_fkey"
    FOREIGN KEY ("budgetId", "sourceCategoryId") REFERENCES "Category" ("budgetId", "id") ON DELETE RESTRICT,
  ADD CONSTRAINT "FinancialEvent_budget_destination_category_fkey"
    FOREIGN KEY ("budgetId", "destinationCategoryId") REFERENCES "Category" ("budgetId", "id") ON DELETE RESTRICT,
  ADD CONSTRAINT "FinancialEvent_budget_related_event_fkey"
    FOREIGN KEY ("budgetId", "relatedEventId") REFERENCES "FinancialEvent" ("budgetId", "id") ON DELETE RESTRICT;
