# Archive Report: Align the Prisma Schema with the Existing Database

- Status: ARCHIVED
- Change: `align-schema-with-database`
- Archived as: `2026-09-29-align-schema-with-database`
- Task status at archive: complete. All four implementation tasks and all three parent-owned gates are checked.
- Specs updated: none. The change declares `skip_specs: true` because it alters no requirement; it is a schema-description correction.

## Delivered

| Commit | Content |
| --- | --- |
| `bca8b77` | Annotations on `apps/api/prisma/schema.prisma` so it describes the existing database, plus migration `0008_align_indexes` dropping two redundant prefix indexes |

## Result

The drift diff fell from **112 `ALTER TABLE` statements plus three index drops** to **naming only**: 41 index renames and 34 foreign-key renames, with no type, default, index-existence, or update-action difference remaining. No row was read or written, and no model, field, relation, index, or constraint changed shape.

## The criterion was corrected during apply

The approved proposal described two drift families and demanded a zero-statement diff. Applying it showed five families, and that zero is not reachable without either binding the schema to about 75 legacy names with `map:` annotations or renaming as many database objects. The owner corrected the criterion and declared the naming family a deliberate non-goal, because this project does not use `prisma migrate dev` and the change would buy no type, default, constraint, or behavioural difference. The proposal is left as approved and the correction is recorded in `design.md` and `apply-progress.md`, rather than rewriting an approved proposal after the fact.

## Verification

Runtime evidence at closure: `npm run db:validate` valid, `npm test` **160 passed of 160 with zero skips** against the documented database, `npm run test:web` 53 passed, `npm run typecheck:web` clean, `npm run build:web` compiled, and `npm run test:e2e` 13 passed. The database-backed run is the load-bearing evidence that making the database the identifier generator changed nothing observable.

## Follow-ups carried forward

- The naming family remains a declared non-goal. Resolving it would need `map:` annotations or a wide rename migration.
- The selected-month race in the budget hook, recorded when category targets were archived, is still open and unrelated to this change.

## Next step

The remaining roadmap candidates — scheduled transactions, reconciliation and cleared state, and cards or loans — each require their own scope review and their own change, and none is approved by this archive.
