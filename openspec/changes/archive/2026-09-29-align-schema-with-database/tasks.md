# Implementation Tasks: Align the Prisma Schema with the Existing Database

Execution status: Proposal approved 2026-09-29 for the direction, design and tasks not yet approved. Implementation is not authorized until the owner approves them. No requirement changes, so this change declares `skip_specs: true`.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 40-90 authored additions, all inside `apps/api/prisma/schema.prisma` |
| 400-line budget risk | Low |
| Chained PRs recommended | No; one small slice |
| Suggested split | Single unit: annotate timestamps, annotate relations, verify |
| Delivery strategy | ask-on-risk; no commit or push requested by these tasks |
| Chain strategy | One review slice |

The line count is low because each change is an annotation on an existing line. The risk is not size but correctness of the annotation, which the drift diff settles objectively.

## Preconditions and hard gates

- **The database is the reference.** This change annotates the schema to describe what the database already contains. It MUST NOT change a column type, rewrite a table, or alter a row. The single exception the owner authorized is migration `0008_align_indexes`, which drops two indexes that are strict prefixes of wider ones the schema already declares.
- **No model shape changes.** No model, field, relation, index, or constraint may be added, removed, or renamed. Only native-type annotations, explicit relation update actions, explicit defaults, and the one already-present index declaration.
- **The corrected criterion applies.** The drift diff is expected to end with `RENAME` statements only. Reaching a zero-statement diff would require roughly 75 `map:` annotations or as many database renames, and the owner declared that family a deliberate non-goal.
- **Both kinds of evidence are required.** A reduced diff alone is not enough, because a wrong annotation could change runtime mapping; and a passing suite alone is not enough, because the drift is what the change exists to remove.

## Work unit — Annotate the schema and reduce the drift to naming only

**Boundary:** `apps/api/prisma/schema.prisma` and the new `apps/api/prisma/migrations/0008_align_indexes/`. Roll back by reverting both.

1. [x] Record the baseline: the read-only drift diff reported **112** `ALTER TABLE` statements. <!-- sdd-owner: implementation -->
2. [x] Annotate every timestamp with the PostgreSQL native type its column has, every relation with `onUpdate: NoAction`, every identifier with `@default(dbgenerated("gen_random_uuid()"))`, the three `month` columns with `@db.VarChar(7)`, the four `updatedAt` fields with `@default(now())`, and declare the `supersedesEventId` index. Determine the timestamp precision empirically. <!-- sdd-owner: implementation -->
3. [x] Add migration `0008_align_indexes` dropping the two obsolete prefix indexes, apply it, then re-run the drift diff and confirm the remainder is **naming only**: 41 index renames and 34 foreign-key renames, with no type, default, index-existence, or update-action statement. <!-- sdd-owner: implementation -->
4. [x] Run the full verification: `npm test` with the documented database URL passed **160 of 160 with zero skips**, `npm run test:web` 53 passed, `npm run typecheck:web` clean, `npm run build:web` compiled, `npm run test:e2e` 13 passed, and `npm run db:validate` valid. <!-- sdd-owner: implementation -->

## Parent-owned post-apply gates

- [x] Confirm the diff went from 112 statements to naming-only, with both the before and after output quoted and the two index drops explained. <!-- sdd-owner: parent -->
- [x] Confirm the schema change is annotations only: no model, field, relation, index, or constraint changed shape, and the only migration drops two redundant indexes. <!-- sdd-owner: parent -->
- [x] Confirm the full suite passed with zero failures and zero skips against the documented database, so the annotations, including the database-generated identifiers, did not change runtime behaviour. <!-- sdd-owner: parent -->

