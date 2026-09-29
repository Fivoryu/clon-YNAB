# Design: Align the Prisma Schema with the Existing Database

Governing record: `proposal.md` (owner approved the direction: annotate the schema to match the database, not the reverse).

## What the drift actually is

A read-only `prisma migrate diff` between the database and the schema reports statements in exactly two families:

1. **Timestamp precision and type.** Every migration writes `TIMESTAMPTZ`, which PostgreSQL stores with microsecond precision. Prisma maps a plain `DateTime` to `TIMESTAMP(3)`, so the diff proposes `ALTER COLUMN … SET DATA TYPE TIMESTAMP(3)` for all 25 timestamp columns.
2. **Foreign-key update action.** Every migration omits `ON UPDATE`, so PostgreSQL records `NO ACTION`. Prisma's default for a relation is `ON UPDATE CASCADE`, so the diff proposes dropping and recreating each foreign key.

Neither family is a defect in the database. The database is self-consistent and the application works against it; the schema simply under-describes it.

## The change

`apps/api/prisma/schema.prisma` only:

- **Timestamps.** Each `DateTime` field gains a PostgreSQL native type annotation that matches its existing column. The implementation determines the exact argument **empirically** rather than by assumption: annotate, run the diff, and adjust until the diff reports nothing for that column. The starting hypothesis is microsecond precision, because the columns were created as bare `TIMESTAMPTZ`, and the scheme should be verified rather than trusted. A wrong precision is visible immediately in the diff.
- **Relations.** Each relation gains `onUpdate: NoAction` so it declares the update action the foreign key already has. `onDelete` values are already explicit and are not touched.

Nothing else changes: no model, field, relation, index, or constraint is added, removed, or reshaped. Because the annotations now describe what exists, **no migration is authored and no row is read or written**.

## Why this direction and not the other

Migrating the database would rewrite every table that holds data — every `Account`, `Budget`, `Category`, `FinancialEvent`, `Transfer`, `CommandReceipt`, and the rest — to change 25 column types and recreate every foreign key, in exchange for exactly the same drift-free end state and no behavioural difference whatsoever. It would need a backup, a rollback plan, and a maintenance window for a purely cosmetic alignment. Annotating the schema is reversible by editing text.

## Risks

| Risk | Mitigation |
| --- | --- |
| A wrong native type changes how Prisma maps values at runtime. | The drift diff is the objective check, and the full suite plus the browser journeys must still pass against the documented database. Both are required, not either. |
| An annotation silently changes a column's meaning in a later migration. | Only native-type annotations and explicit update actions are added; no field is added, removed, or retyped at the Prisma level. |
| The change tempts a wider refactor. | The non-goals forbid touching any model shape, and the diff must end at exactly zero statements. |

## Amendment recorded during apply (owner decision, 2026-09-29)

The proposal above was approved with a two-family scope and a success criterion of "no statements" from the drift diff. Applying it showed that description was incomplete, and the owner corrected the criterion rather than chasing the original one. This section is the current truth; the proposal is left as approved rather than rewritten after the fact.

### What the drift actually contained

The diff's 112 statements spanned **five** families, not two:

1. **Timestamp type and precision.** Every migration writes bare `TIMESTAMPTZ` (microsecond); Prisma maps a plain `DateTime` to `TIMESTAMP(3)`. 25 columns.
2. **Foreign-key update action.** The migrations omit `ON UPDATE`, so PostgreSQL records `NO ACTION`; Prisma assumes `ON UPDATE CASCADE`. 46 relations.
3. **Primary-key defaults.** The database carries `DEFAULT gen_random_uuid()` on 19 identifier columns; the schema declared `@default(uuid())`, which Prisma generates client-side.
4. **Column types.** Three `month` columns are `VARCHAR(7)` in the database while a plain `String` maps to `TEXT`, and one `updatedAt` per model in four models carries `DEFAULT now()` that the schema's bare `@updatedAt` does not describe.
5. **Object names.** The hand-written migrations abbreviated constraint and index names (`FinancialEvent_budget_account_fkey`); Prisma derives them from the columns (`FinancialEvent_budgetId_accountId_fkey`). About 75 objects.

### What was done

Families 1 to 4 are closed **in the schema**, so no data was migrated: each timestamp gained its native type, each relation gained `onUpdate: NoAction`, each identifier gained `@default(dbgenerated("gen_random_uuid()"))` on the owner's explicit decision that the database keeps generating identifiers, the three `month` columns gained `@db.VarChar(7)`, the four `updatedAt` fields gained `@default(now())` describing the existing database default, and the `supersedesEventId` index the database already had was declared.

One small metadata-only migration, `0008_align_indexes`, drops the two indexes that were strict prefixes of the wider variants the schema already declares:

- `FinancialEvent_budget_transaction_created_idx` versus the declared `(budgetId, transactionId, createdAt, id)`
- `Transfer_budget_date_created_idx` versus the declared `(budgetId, businessDate, createdAt, id)`

### Why family 5 is a deliberate non-goal

Reaching a zero-statement diff would require either roughly 75 `map:` annotations binding the schema to legacy names, making it substantially more verbose, or renaming roughly 75 database objects. Neither changes any type, default, constraint, or behaviour, and this project does not use `prisma migrate dev`: the workflow is hand-written migrations plus a deploying `db:migrate`. The owner chose to close the semantic families and record the naming family as a non-goal rather than pay that cost.

**Corrected success criterion:** the drift diff reports only `RENAME` statements, no type, default, index-existence, or update-action difference, and the full suite passes with zero failures and zero skips against the documented database.

## Rollback

Revert `schema.prisma` and reverse migration `0008_align_indexes`, which means recreating the two indexes it removed. No row was read or written by any part of this change, so there is no data to restore.

## Verification strategy

- `prisma migrate diff` from the database to the schema reports **no statements**. This is the primary evidence and it is objective: it went from 112 to nothing, or the change is not done.
- `npm run db:validate` passes.
- `npm test` with the documented database URL passes with zero failures and zero skips, proving the annotations did not change runtime behaviour.
- `npm run test:web`, `npm run typecheck:web`, `npm run build:web`, and `npm run test:e2e` pass unchanged.
- A read-only check confirms no migration directory was added or modified and that no row count changed.
