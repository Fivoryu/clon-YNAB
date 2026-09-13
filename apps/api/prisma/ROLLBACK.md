# Migration rollback inventory

## Preconditions

Rollback is a controlled, destructive schema operation. Before considering it:

- Confirm the target database and maintenance window; disable financial commands.
- Export authoritative financial history and verify that the export can be restored.
- Take a PostgreSQL backup. Set `BACKUP_FILE` to a protected location, then run:

  ```sh
  pg_dump --format=custom --file="$BACKUP_FILE" "$DATABASE_URL"
  ```

- Record the current migration status and review the rollback inventory below.
- Use an isolated restore or disposable database for rehearsal. Do not use rollback to delete live financial history.

This migration slice does **not** execute rollback against the shared development database. The rollback commands and inventory below are documentation-only; only the forward migration and read-only evidence checks are run here.

## Forward and status commands

With `DATABASE_URL` explicitly set to the intended PostgreSQL database:

```sh
npm run db:migrate
npm run db:status
```

`db:migrate` applies pending migrations through Prisma. `db:status` runs Prisma's reproducible migration status check against `apps/api/prisma/schema.prisma`.

## Read-only rollback inventory commands

These commands inspect the migration files and live catalog; they do not change the database:

```sh
find apps/api/prisma/migrations -maxdepth 2 -type f -name migration.sql -print | sort
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -c "SELECT c.conname, pg_get_constraintdef(c.oid) FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid JOIN pg_namespace n ON n.oid = t.relnamespace WHERE n.nspname = 'public' AND t.relname = 'FinancialEvent' ORDER BY c.conname;"
```

Migration `0001_budgeting_slice` adds the first durable persistence boundary. Its reverse inventory is: drop `CommandReceipt`, `FinancialEvent`, `BudgetMonth`, `OpeningBalance`, `Category`, `Account`, `Budget`, `Session`, and `User` in dependency order; then drop `FinancialEventKind`, `AccountKind`, and `SetupStep`.

Migration `0002_ownership_consistency` replaces event account/category/release foreign keys with composite `(budgetId, id)` references. Its reverse inventory is: drop `FinancialEvent_budget_account_fkey`, `FinancialEvent_budget_category_fkey`, `FinancialEvent_budget_source_category_fkey`, `FinancialEvent_budget_destination_category_fkey`, and `FinancialEvent_budget_related_event_fkey`; restore the five single-column foreign keys; then drop `Account_budget_id_key`, `Category_budget_id_key`, `FinancialEvent_budget_id_key`, and `FinancialEvent_budget_related_event_key`.

A forward rebuild must restore authoritative events before derived reads are enabled. Financial commands still need to execute their idempotency, authorization, and version checks in one PostgreSQL transaction in the application layer.
