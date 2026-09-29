-- Two indexes predate their superseding variants, which the Prisma schema already declares with the
-- identifier appended: (budgetId, transactionId, createdAt, id) and (budgetId, businessDate, createdAt, id).
-- The originals are strict prefixes of those and serve no query the wider index does not.
DROP INDEX "FinancialEvent_budget_transaction_created_idx";
DROP INDEX "Transfer_budget_date_created_idx";
