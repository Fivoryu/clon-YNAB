# Apply Progress — Work Unit 1
Scope: WU1 tasks 1–4 only; reports, report policies, assignment semantics, category lifecycle, financial engine, and web untouched.
## TDD evidence
| Phase | Exact command | Observed output |
| RED | `node --experimental-strip-types --test apps/api/test/category-target-api.test.ts` | `error: 'app.setCategoryTarget is not a function'`; `404 !== 400`; `# tests 3\n# suites 0\n# pass 0\n# fail 3\n# cancelled 0\n# skipped 0\n# todo 0\n# duration_ms 2628.243` (exit 1). |
| GREEN | `node --experimental-strip-types --test apps/api/test/category-target-api.test.ts` | `1..3\n# tests 3\n# suites 0\n# pass 3\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n# duration_ms 721.5534` (exit 0). |
| TRIANGULATE | `DATABASE_URL='postgresql://ynab:ynab_local@localhost:5434/ynab_dev' node --experimental-strip-types --test apps/api/test/category-target-api.test.ts apps/api/test/category-target-postgres.test.ts apps/api/test/openapi.test.ts` | `1..12\n# tests 12\n# suites 0\n# pass 12\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n# duration_ms 1983.0428` (exit 0). Added before/equal/after month coverage, one current category target across month reads, archived read-only behavior, receipt/event counts, and real PostgreSQL persistence. |
## Command output excerpts
| Exact command | Exact observed output |
| `DATABASE_URL='postgresql://ynab:ynab_local@localhost:5434/ynab_dev' npm run db:migrate` | Applying migration 0007_category_targets; All migrations have been successfully applied. |
| `DATABASE_URL='postgresql://ynab:ynab_local@localhost:5434/ynab_dev' npm run db:generate` | `✔ Generated Prisma Client (v6.19.0) to .\node_modules\@prisma\client in 269ms` |
| `env -u DATABASE_URL npm test` | `# tests 154\n# suites 0\n# pass 131\n# fail 0\n# cancelled 0\n# skipped 23\n# todo 0\n# duration_ms 4036.1047` (exit 0; DB-gated skips expected). |
| `DATABASE_URL='postgresql://ynab:ynab_local@localhost:5434/ynab_dev' npm test` | `# tests 154\n# suites 0\n# pass 154\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n# duration_ms 5326.0471` (exit 0; complete pre-existing suite plus target tests). |
| `DATABASE_URL='postgresql://ynab:ynab_local@localhost:5434/ynab_dev' npm run db:validate` | The schema at apps\api\prisma\schema.prisma is valid 🚀 |
## Changed files and line counts (additions/deletions)
`apps/api/prisma/schema.prisma +19; apps/api/prisma/migrations/0007_category_targets/migration.sql +14; apps/api/src/persistence/financial-store.ts +19/-1; apps/api/src/app.ts +38/-4; apps/api/src/server.ts +3; apps/api/openapi.yaml +51/-7; apps/api/test/openapi.test.ts +12/-2; apps/api/test/transaction-history-prisma.test.ts +3/-2; apps/api/test/category-target-api.test.ts +96; apps/api/test/category-target-postgres.test.ts +97; openspec/changes/add-category-targets/tasks.md +5/-5; openspec/changes/add-category-targets/apply-progress.md +19`.
Estimate: 376 insertions, 21 deletions (397 changed lines including this record); under the roughly 400-line limit. RED/GREEN and both full-suite outputs are recorded above.
Deviations: The first RED invocation had a test-only reserved-word syntax error and was corrected before recording RED; initial Prisma generation exposed P1012, resolved by modeling the reverse category relation as a collection while `categoryId` remains the PK; an OpenAPI expectation and a RepeatableRead mock were updated for `RequiredIfMatch` and the new delegate. CodeGraph timed out, so exploration used the exact requested paths.
Scope check: only the listed source/test/change files are changed; generated client output remains ignored and absent from `git status --untracked-files=all`. No commit or push.

---

## Parent-owned independent verification (appended)

A read-only verification returned two non-CLEAR findings and **no candidate-caused blocker**. Both findings are **pre-existing repository conventions that this work followed faithfully**, which the parent confirmed with direct evidence rather than accepting the classification.

### The reported migration/schema mismatch is repository-wide and pre-existing

The verifier reported that `CategoryTarget` uses `TIMESTAMPTZ` where Prisma's `DateTime` expects `TIMESTAMP(3)`, and that its foreign keys omit `ON UPDATE CASCADE`. Measured evidence:

- Every timestamp column in every previous migration is `TIMESTAMPTZ` (25 occurrences), and no migration anywhere uses `ON UPDATE`.
- A read-only schema diff reports **112 `ALTER TABLE` statements** spanning `Account`, `Budget`, `BudgetMonth`, `Category`, `CommandReceipt`, `FinancialEvent`, and every other table, not only `CategoryTarget`.

`CategoryTarget` is flagged for exactly the same two reasons as the rest of the schema, so the new migration matches the repository's established hand-written convention. Changing it alone would make this one table inconsistent with 25 existing columns. Recorded as a **pre-existing, repository-wide follow-up**: a future `prisma migrate dev` would attempt to rewrite the whole schema, and that deserves one deliberate migration rather than piecemeal edits.

### The reported OpenAPI `nullable` imprecision is also pre-existing

The verifier noted that `{ nullable: true, allOf: [{ $ref: ... }] }` lacks a sibling `type`, which OpenAPI 3.0.3 does not formally sanction. The same idiom already appears elsewhere in this document, for example `Budget.account`. The new schema follows the document's existing style rather than introducing a new one. Recorded as a pre-existing follow-up covering the whole contract.

### Database-backed verification reproduced by the parent

The verifier could not run the database-backed suite because the parent's brief over-restricted it, which was the parent's error. The parent ran it directly and reproduced the writer's result: **154 tests, 154 passed, 0 failed, 0 skipped**, plus the focused target suites 6 passed with 0 skipped. Also verified: targets are read inside the same `RepeatableRead` transaction, and the mock change in `transaction-history-prisma.test.ts` **strengthened** its assertion by extending the expected call order to include `targets`.

### Workload correction

Measured against the commit base, Work Unit 1's implementation delta is **368 changed lines** (352 additions, 16 deletions): above its 250-330 forecast by 38 lines and under the 400-line budget by 32. The forecast is corrected here rather than restated.

## Remaining work

- Work Unit 2 (tasks 5–8) is complete; its evidence is appended below.
- Work Unit 3 (tasks 9–12) is not started.
- The parent-owned gates remain open.

---

## Work Unit 2 — Derivation and summary projection
Scope: tasks 5–8 only. The financial engine and report projection modules remain unchanged; no web files changed.

### TDD evidence
| Phase | Exact command | Observed output |
|---|---|---|
| RED | `node --experimental-strip-types --test apps/api/test/category-target-projection.test.ts apps/api/test/openapi.test.ts` | `# tests 12\n# suites 0\n# pass 6\n# fail 6\n# cancelled 0\n# skipped 0\n# todo 0\n# duration_ms 1102.0583` (exit 1). The missing derivation module, target summary projection, and OpenAPI target-state schema were the intended failures. |
| GREEN | `node --experimental-strip-types --test apps/api/test/category-target-projection.test.ts apps/api/test/category-target-api.test.ts apps/api/test/category-target-postgres.test.ts apps/api/test/openapi.test.ts` | `# tests 18\n# suites 0\n# pass 17\n# fail 0\n# cancelled 0\n# skipped 1\n# todo 0\n# duration_ms 1466.379` (exit 0; PostgreSQL test skipped because DATABASE_URL was unset). |
| TRIANGULATE | `unset DATABASE_URL && npm test` | `# tests 160\n# suites 0\n# pass 137\n# fail 0\n# cancelled 0\n# skipped 23\n# todo 0\n# duration_ms 5350.0807` (exit 0; database-gated tests skipped). |
| REFACTOR | `node --experimental-strip-types --test apps/api/test/category-target-projection.test.ts apps/api/test/category-target-api.test.ts apps/api/test/monthly-report-api.test.ts apps/api/test/multi-month-report-api.test.ts apps/api/test/openapi.test.ts` | `# tests 36\n# suites 0\n# pass 35\n# fail 0\n# cancelled 0\n# skipped 1\n# todo 0\n# duration_ms 2000.9301` (exit 0; only the PostgreSQL report-mode case skipped). |

### Required command output
| Exact command | Exact observed result |
|---|---|
| `unset DATABASE_URL && npm test` | `# tests 160\n# suites 0\n# pass 137\n# fail 0\n# cancelled 0\n# skipped 23\n# todo 0\n# duration_ms 5350.0807` (exit 0). |
| `DATABASE_URL='postgresql://ynab:ynab_local@localhost:5434/ynab_dev' npm test` | `# tests 160\n# suites 0\n# pass 160\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n# duration_ms 8136.962` (exit 0). |
| `DATABASE_URL='postgresql://ynab:ynab_local@localhost:5434/ynab_dev' npm run db:validate` | `> db:validate\n> prisma validate --schema apps/api/prisma/schema.prisma\n\nPrisma schema loaded from apps\\api\\prisma\\schema.prisma\n┌─────────────────────────────────────────────────────────┐\n│  Update available 6.19.0 -> 8.0.0-rc.19                 │\n│                                                         │\n│  This is a major update - please follow the guide at    │\n│  https://pris.ly/d/major-version-upgrade                │\n│                                                         │\n│  Run the following to update                            │\n│    npm i --save-dev prisma@latest                       │\n│    npm i @prisma/client@latest                          │\n└─────────────────────────────────────────────────────────┘\nThe schema at apps\\api\\prisma\\schema.prisma is valid 🚀` (exit 0). |

### Changed files and line counts (additions/deletions)
- `apps/api/src/planning/targets.ts`: +35 (new pure derivation).
- `apps/api/src/reports/report-service.ts`: +7/-2 (attach state only in summary categories).
- `apps/api/openapi.yaml`: +2/-1 (state DTO and nullable CategorySummary.target).
- `apps/api/test/category-target-projection.test.ts`: +139 (derivation, projection, report-separation, and financial-invariant coverage).
- `apps/api/test/category-target-api.test.ts`: +4/-4 (compare financial values independently of derived target presentation).
- `apps/api/test/category-target-postgres.test.ts`: +1/-1 (same financial-only comparison for PostgreSQL coverage).
- `apps/api/test/openapi.test.ts`: +5/-3 (target-state schema contract).
- `openspec/changes/add-category-targets/tasks.md`: +4/-4 (checked only tasks 5–8).
- `openspec/changes/add-category-targets/apply-progress.md`: +43/-2 (appended WU2 evidence and reconciled the remaining-work note).

Estimate: 240 insertions and 17 deletions (257 changed lines including this record), under the 400-line Work Unit 2 budget by 143 lines. The report endpoints call their separate `projectMonthlyReport` / `projectMultiMonthReport` projections; `ReportService.read` is shared by summary and dashboard only. Tests confirm neither HTTP report response contains target, targetMonth, progressMinor, or remainingMinor keys.

Implemented formulas: set-aside progress = monthly assignedMinor; dated progress = monthly availableMinor; remainingMinor = max(0, amountMinor - progressMinor); status = MET if progress >= amount, else OVERDUE only for a dated targetMonth < requestedMonth, else UNDERFUNDED.

Financial invariant evidence: the before/set/remove snapshot test compares RTA, each category's assigned/activity/available, aggregate and per-account balances, financial-event count, and assignment identities. Setting/removing adds no assignment; PostgreSQL target coverage also asserts financial event counts are unchanged.

Ambiguity and resolution: target history is not retained, so the current definition is derived against each requested month's values. A category without a target omits the runtime `target` property (no synthetic null state); the optional OpenAPI property uses the existing Budget.account nullable/allOf idiom. Set-aside output omits targetMonth. No semantics were inferred beyond the validated design.

Deviation: CodeGraph exploration timed out; route ownership was verified from the scoped source files instead. No other deviation. No commit or push.

---

## Parent-owned independent verification and hardening (appended)

An independent read-only verification returned **no candidate-caused blocker** and confirmed the derivation, the summary-only wiring, the report separation at the HTTP boundary, the financial invariant with real before/after comparisons, and the OpenAPI addition. Four follow-ups were raised; three were closed here.

| Follow-up | Resolution |
| --- | --- |
| `CategorySummary.target` was marked `nullable: true`, but the projection emits no such property for an untargeted category and never an explicit null. | The nullable marker was removed from the summary property, so the contract now says the property is omitted rather than nullable. The mutation result keeps `nullable: true`, because removal genuinely returns an explicit null there. The existing assertion was updated to pin both contracts separately, which is more precise than before. |
| No test vector for the overdue comparison across a year boundary, so a mutant comparing only the month suffix would have passed. | Added a `2025-12` target viewed from `2026-01`, asserting overdue, with the reason recorded in the assertion message. |
| The summary projection fixture had `assignedMinor` equal to `availableMinor`, so swapping the progress basis would not have been detected by that test. | Added a spending event so the two differ, asserted both values explicitly, and confirmed the dated target's progress follows the available amount. |
| The report-separation HTTP test recognises a fixed set of target-like field names, so a differently named payload could evade it. | Recorded as a residual limit. It is mitigated elsewhere: the report response shapes are key-locked by their own suites, and the report projectors are separate modules that never read targets. |

### Verification evidence reproduced by the parent

- `npm test` with the database: **160 tests, 160 passed, 0 failed, 0 skipped**.
- `npm test` without the database: 160 tests, 137 passed, 0 failed, 23 skipped.
- `npm run test:web` 48 passed; `npm run typecheck:web` clean.
- Changed-line total: **257** against Work Unit 2's forecast of 200-280 and the 400-line budget, before the hardening above.
