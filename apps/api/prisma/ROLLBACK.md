# Migration rollback inventory

Migration `0001_budgeting_slice` adds the first durable persistence boundary. Rollback is a controlled, destructive schema operation and must only run after financial history has been exported and the command paths are disabled.

Drop in dependency order: `CommandReceipt`, `FinancialEvent`, `BudgetMonth`, `OpeningBalance`, `Category`, `Account`, `Budget`, `Session`, `User`; then drop `FinancialEventKind`, `AccountKind`, and `SetupStep`. Do not use rollback to delete live financial history. A forward rebuild must restore authoritative events before derived reads are enabled.

The migration intentionally uses restrictive foreign keys for historical account/category references, a unique owner budget and account, active-category name uniqueness, and budget-scoped command receipts. Migration `0002_ownership_consistency` replaces event account/category/release foreign keys with composite `(budgetId, id)` references; roll it back by dropping the five composite event foreign keys, restoring the five single-column foreign keys, then dropping the four composite unique constraints (account, category, event id, and related event). Financial commands still need to execute their idempotency, authorization, and version checks in one PostgreSQL transaction in the application layer.
