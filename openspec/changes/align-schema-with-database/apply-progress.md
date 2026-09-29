# Apply Progress — Align the Prisma Schema with the Existing Database

## Baseline

Read-only `prisma migrate diff` from the database to the schema reported **112 `ALTER TABLE` statements** plus three `DROP INDEX` statements. The proposal described two families; applying it revealed five, and the owner corrected the success criterion during apply rather than chasing the original one. The corrected criterion and the reason for the naming non-goal are recorded in `design.md` under "Amendment recorded during apply".

## What was changed

**`apps/api/prisma/schema.prisma`**, annotations only:

| Annotation | Count | Why |
| --- | --- | --- |
| `@db.Timestamptz(6)` on `DateTime` | 25 | The columns exist as bare `TIMESTAMPTZ`, which PostgreSQL stores at microsecond precision. The precision was determined empirically by re-running the diff, not assumed. |
| `onUpdate: NoAction` on relations | 46 | The migrations omit `ON UPDATE`, so the foreign keys are already `NO ACTION`; Prisma assumes `CASCADE`. Applied only to the owning side of each relation. |
| `@default(dbgenerated("gen_random_uuid()"))` on identifiers | 19 | The database already generates identifiers. The owner explicitly decided the database keeps doing so rather than removing the column defaults. |
| `@db.VarChar(7)` on `month` | 3 | The columns are `VARCHAR(7)`; a plain `String` maps to `TEXT`. Two are non-null and one is nullable. |
| `@default(now())` on `updatedAt` | 4 | `Account`, `Budget`, `Category`, and `SimulationRun` carry an existing database default that a bare `@updatedAt` does not describe. |
| `@@index([supersedesEventId])` | 1 | The database already had this index and the schema did not declare it, although the field carries effective-history folding. |

**`apps/api/prisma/migrations/0008_align_indexes/migration.sql`**, metadata only:

```sql
DROP INDEX "FinancialEvent_budget_transaction_created_idx";
DROP INDEX "Transfer_budget_date_created_idx";
```

Both are strict prefixes of wider indexes the schema already declares, so they serve no query the wider index does not. No row is read or written, and applied successfully with `npm run db:migrate`.

## Corrected result

The remaining drift is **naming only**: 41 `ALTER INDEX … RENAME TO` and 34 `ALTER TABLE … RENAME CONSTRAINT` statements, with **no** type, default, index-existence, or update-action statement left. The hand-written migrations abbreviated object names while Prisma derives them from the columns.

Reaching a zero-statement diff would need roughly 75 `map:` annotations binding the schema to legacy names, or as many database renames, for no change in type, default, constraint, or behaviour. The owner declared that family a deliberate non-goal, recorded in `design.md`.

## Verification evidence

| Command | Result |
| --- | --- |
| `DATABASE_URL=… npx prisma migrate diff …` | 112 + 3 statements → naming-only: 41 index renames, 34 foreign-key renames |
| `DATABASE_URL=… npm run db:migrate` | `0008_align_indexes` applied |
| `DATABASE_URL=… npm run db:validate` | schema valid |
| `DATABASE_URL=… npm test` | **160 tests, 160 passed, 0 failed, 0 skipped** |
| `npm run test:web` | 53 passed, 0 failed |
| `npm run typecheck:web` | clean |
| `npm run build:web` | compiled successfully |
| `npm run test:e2e` | 13 passed, 0 failed |

The database-backed run is the load-bearing evidence for the `dbgenerated` decision: it proves that making the database the identifier generator changed nothing observable.

## Deviations and corrections recorded

1. **The proposal's scope and criterion were wrong.** It described two families and demanded a zero-statement diff. Reality had five families and zero is not reachable without binding the schema to legacy names. The owner corrected the criterion; the proposal is left as approved rather than rewritten after the fact.
2. **A design edit briefly removed the `## Rollback` heading** and left its content orphaned with a now-false claim that no migration existed. Both were restored and the claim corrected before committing.
3. **A first annotation pass missed `FinancialEvent.month`** because the field is nullable and the rule matched only non-nullable `String` fields. Found by re-running the diff, not by reading the code.
4. `apps/web/tsconfig.tsbuildinfo` was restored after every command that rewrote it.

## Remaining work

- The naming family is a declared non-goal, not an open task.
- The change has no specs by design (`skip_specs: true`), because it alters no requirement.
