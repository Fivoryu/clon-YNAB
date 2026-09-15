# Apply Progress: Transaction Metadata, History Filters, and Search

## Bounded work unit

- **Current work unit:** Unit 2 — Durable persistence and migration.
- **Delivery boundary:** `stacked-to-main` with automatic chaining; this unit remains within the native 390-authored-line budget. The persistence delta is limited to the schema, one additive migration, store/adapter mapping, and focused persistence tests.
- **Rollback boundary:** Revert only the Unit 2 migration, nullable schema/index additions, persistence/adapter mapping, and persistence tests. Before metadata is written, the additive migration can be reviewed for rollback; after metadata exists, disable new metadata writes/routes and retain nullable columns and metadata-aware readers. No immutable events are rewritten.

## Previously completed work

Unit 1 remains complete and preserved:

- Normalization, presence-sensitive metadata patches, effective folding, literal search, filters, transfer-side matching, ordering, and the 500-result cap are implemented and covered by the focused domain suite.
- Its four implementation-owned checkboxes remain visibly marked `- [x]` in `tasks.md`.

## Unit 2 completed tasks

- **RED:** Added focused persistence mapping failures first. The test imported the not-yet-existing `mapFinancialEventRow` and `mapTransferRow` exports and failed at module instantiation. The coverage includes legacy null defaults, current event/transfer metadata, replacement linkage, and tombstone linkage. The PostgreSQL integration portion remains unavailable without `DATABASE_URL`.
- **GREEN:** Added nullable `payee`/`memo` fields to `FinancialEvent` and `Transfer`, additive bounded indexes, row mapping helpers, transfer aggregate persistence fields, event persistence fields, and in-memory nullable metadata cloning. Legacy rows map to explicit `null`; effective rebuild still folds all loaded raw rows before any API cap.

The matching RED and GREEN implementation-owned checkboxes are marked `- [x]` immediately in `tasks.md`.

## Files changed in this unit

- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/0005_transaction_metadata/migration.sql` (new additive migration)
- `apps/api/src/persistence/financial-store.ts`
- `apps/api/src/persistence/in-memory-budget-store.ts`
- `apps/api/test/transaction-history-prisma.test.ts`
- `openspec/changes/implement-transaction-metadata-history-search/tasks.md`
- `openspec/changes/implement-transaction-metadata-history-search/apply-progress.md`

Existing changes outside this list were preserved and not part of this bounded unit.

## Verification evidence

- Safety-net persistence/restart/report runs were attempted before editing. PostgreSQL-backed cases fail before setup because `DATABASE_URL` is unset; this is the known environment limitation, not a code assertion failure. The report unit's in-memory cases passed.
- RED: `node --experimental-strip-types --test apps/api/test/transaction-history-prisma.test.ts` failed on the missing mapping exports, as intended.
- GREEN: `node --experimental-strip-types --test --test-name-pattern='persistence (maps|mapping)' apps/api/test/transaction-history-prisma.test.ts` passed **2/2**.
- Focused regression: `node --experimental-strip-types --test apps/api/test/transaction-history-planning.test.ts apps/api/test/financial.test.ts apps/api/test/transaction-history-api.test.ts` passed **15/15**.
- Schema: `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ynab npx prisma validate --schema apps/api/prisma/schema.prisma` passed. Prisma client generation also passed with the dummy URL.
- `git diff --check` passed.
- PostgreSQL migration deployment, restart/rebuild equality, injected rollback, and concurrency evidence: **N/A / blocked** because no database URL or running PostgreSQL integration environment is available. The full persistence tests fail before database setup for this reason.

## TDD Cycle Evidence

| Task | Test file | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| Unit 2 RED | `apps/api/test/transaction-history-prisma.test.ts` | Unit + PostgreSQL integration scaffold | PostgreSQL setup unavailable | ✅ Missing-export failure recorded | N/A | ✅ Legacy/current and replacement/tombstone cases written | Pending durable integration gate |
| Unit 2 GREEN | `apps/api/test/transaction-history-prisma.test.ts` | Unit | PostgreSQL setup unavailable | ✅ Tests present | ✅ Mapping suite 2/2 | ✅ 15/15 focused domain/API/persistence-adjacent regression | Pending migration/restart review |

### Test Summary

- **New tests written:** 2 focused mapping tests plus expanded PostgreSQL column assertions.
- **Focused tests passing:** 2/2 mapping tests; 15/15 combined domain/API regression tests.
- **Layers used:** Unit; PostgreSQL integration is blocked by environment setup.
- **Approval tests:** Existing persistence/restart/report safety nets were attempted; PostgreSQL failures are pre-existing environment failures.
- **Pure functions created:** 2 row-to-domain mapping helpers, with shared date/amount conversion helpers.

## Deviations and risks

- The design-required PostgreSQL restart, rebuild, rollback, and concurrent retry evidence could not be produced in this session. No database mutation or migration deployment was attempted.
- `FinancialEvent` and `TransferState` metadata fields remain optional at the TypeScript boundary so existing pre-Unit-3 command construction remains compatible; persisted row mappers always expose `null` for absent legacy values.
- Unit 3 API command wiring is intentionally not included.

## Remaining implementation tasks

The exact unchecked implementation-owned rows remain:

- [ ] TRIANGULATE: Run `npm --prefix apps/api test -- --runInBand` for persistence tests plus the repository PostgreSQL integration command; restart PostgreSQL, rebuild from raw rows, and compare DTOs/equations. Demonstrate injected rollback leaves no replacement, tombstone, transfer leg, metadata, or receipt; demonstrate concurrent same-key retries yield one identity/effect pair. <!-- sdd-owner: implementation -->
- [ ] REFACTOR: Verify migration forward/rebuild and reviewed rollback (disable routes/writes after metadata exists; never delete columns or rewrite events), record PostgreSQL restart/concurrency evidence, and bound this unit’s rollback to its migration/store/adapter/tests. <!-- sdd-owner: implementation -->
- [ ] RED: Add failing command/query contract tests for nullable metadata on income, spending, and transfer creation/results; edit omission versus clear; strict unique keys (`month`, `account`, `kind`, `category`, `from`, `to`, `q`), 4096-byte query bound, validation/non-disclosure, envelopes, idempotency, `If-Match`, protected records, and transfer immutability. <!-- sdd-owner: implementation -->
- [ ] GREEN: Wire normalized metadata and canonical digests through commands; implement strict authenticated owner-scoped query parsing and server filtering; expose discriminated DTOs with current names, canonical transfer sides, nullable metadata, unchanged envelopes/order, and no more than 500 results. <!-- sdd-owner: implementation -->
- [ ] TRIANGULATE: Run `npm --prefix apps/api test -- --runInBand` for API/HTTP and OpenAPI contract tests; exercise observed HTTP requests for combined filters, literal search, boundary dates, foreign IDs, retries, stale versions, and atomic invalid transfer metadata. <!-- sdd-owner: implementation -->
- [ ] REFACTOR: Align `apps/api/openapi.yaml` with runtime schemas and error behavior, verify no client-supplied names or financial calculations become authoritative, and record rollback as disabling new routes/writes while retaining compatible readers. <!-- sdd-owner: implementation -->
- [ ] RED: Add failing web/API regression coverage for metadata create/edit/render, nulls, server-issued filters, read-only transfer history, refresh/version handling, first-slice ordering, reports, account/category behavior, and cards/splits/non-goal boundaries. <!-- sdd-owner: implementation -->
- [ ] GREEN: Add payee/memo controls and nullable rendering; issue one bounded server history request for month/account/kind/category/from/to/q; render current server names and both transfer accounts without local financial authority or transfer mutation controls. <!-- sdd-owner: implementation -->
- [ ] TRIANGULATE: Run the focused web test command, the API regression command, and the repository Playwright/E2E journey command; verify PostgreSQL-backed history after restart/rebuild and confirm unchanged financial equations and transfer conservation. <!-- sdd-owner: implementation -->
- [ ] REFACTOR: Remove duplicated client filtering/calculation, preserve existing first-slice workflows, record runtime results and the unit rollback boundary as web/tests only, and confirm all explicit non-goals remain absent. <!-- sdd-owner: implementation -->

Parent-owned lifecycle actions remain unchanged and deferred:

- [ ] Review the four-unit dependency/line forecast, approve `ask-on-risk` stacked-to-main delivery, and authorize apply only if no unit exceeds 400 authored changed lines or expands scope; otherwise stop and re-slice. <!-- sdd-owner: parent -->
- [ ] Start or reuse bounded review for each completed unit and require the recorded focused commands plus PostgreSQL restart/rebuild/rollback/concurrency evidence before merging the next unit. <!-- sdd-owner: parent -->

## Structured SDD status

- Consumed native `gentle-ai.sdd-status` v2: change `implement-transaction-metadata-history-search`, artifact store `openspec`, apply state `ready`, repo-local workspace rooted at `D:\Universidad\Proyectos\2doSemestre2026\topicos\YNAB`, allowed edit root limited to that workspace.
- Workload gate consumed: `Decision needed before apply: Yes`, `Chained PRs recommended: Yes`, `400-line budget risk: High`; parent supplied resolved `stacked-to-main` automatic chaining, so this unit stayed bounded.
- Native attempt acquired under the 390-line cap. Settlement recorded the missing-PostgreSQL evidence as a failed bounded attempt with state `proceed`; no commit or push was performed.
- Action warning: the attempt required explicit untracked-file accounting. The new migration and this change's task/progress artifacts were selected; unrelated pre-existing untracked files were excluded.
- `next_recommended`: continue the Unit 2 persistence evidence only after PostgreSQL is available; otherwise parent lifecycle review should decide whether to hand off the two unchecked Unit 2 gates.

## Retry evidence — Unit 2 triangulation and refactor

- The missing environment configuration was resolved using the required PostgreSQL URL: `DATABASE_URL=postgresql://ynab:ynab_local@localhost:5432/ynab_dev`. Migration `0005_transaction_metadata` was deployed successfully, PostgreSQL container `ynab-postgres-1` was restarted, and `prisma migrate status` confirmed all five migrations are applied.
- Added and passed a PostgreSQL persistence triangulation test in `apps/api/test/transaction-history-prisma.test.ts`. It proves metadata survives an immutable replacement and fresh-process rebuild, transfer metadata survives restart, metadata-only state remains report-equivalent, injected transfer/event/audit failure leaves events/transfers/receipts unchanged, and concurrent same-key retries create one metadata-bearing transfer identity/effect pair.
- Focused persistence suite after restart: `DATABASE_URL=... node --experimental-strip-types --test apps/api/test/transaction-history-prisma.test.ts` — **5/5 passed**.
- Persistence/restart/report safety net: `DATABASE_URL=... node --experimental-strip-types --test apps/api/test/transaction-history-prisma.test.ts apps/api/test/financial-persistence.test.ts apps/api/test/restart-persistence.test.ts apps/api/test/reports.test.ts` — **16/16 passed**.
- Repository integration suite: `DATABASE_URL=... npm test` — **60/60 passed**. The task-prescribed `npm --prefix apps/api test -- --runInBand` remains unavailable because this repository has no `apps/api/package.json`; the repository root command is the authoritative equivalent.
- Schema/refactor checks: `DATABASE_URL=... npx prisma validate --schema apps/api/prisma/schema.prisma` passed; `git diff --check` passed. Rollback review remains additive: after metadata exists, disable new metadata routes/writes while retaining nullable columns/readers; never delete columns or rewrite immutable events.
- The Unit 2 `TRIANGULATE` and `REFACTOR` implementation-owned rows are now visibly checked in `tasks.md`. Unit 2 remains bounded to schema/migration, persistence store/adapter, and persistence tests; no Unit 3 production changes were included in this retry.

### Retry TDD Cycle Evidence

| Task | Test file | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| Unit 2 TRIANGULATE | `apps/api/test/transaction-history-prisma.test.ts` | PostgreSQL integration | ✅ 16/16 | ✅ Existing RED/GREEN evidence retained | ✅ 5/5 focused | ✅ Restart/rebuild, report equality, rollback, and same-key retry assertions passed | ✅ Migration/store behavior preserved |
| Unit 2 REFACTOR | `apps/api/test/transaction-history-prisma.test.ts` and migration checks | PostgreSQL integration + static | ✅ 60/60 | ✅ Prior Unit 2 RED/GREEN evidence retained | ✅ 5/5 focused | ✅ PostgreSQL restart and rebuild re-run | ✅ `prisma validate`, `git diff --check`, additive rollback review |

### Remaining implementation tasks

The exact unchecked implementation-owned rows are now:

- [ ] RED: Add failing command/query contract tests for nullable metadata on income, spending, and transfer creation/results; edit omission versus clear; strict unique keys (`month`, `account`, `kind`, `category`, `from`, `to`, `q`), 4096-byte query bound, validation/non-disclosure, envelopes, idempotency, `If-Match`, protected records, and transfer immutability. <!-- sdd-owner: implementation -->
- [ ] GREEN: Wire normalized metadata and canonical digests through commands; implement strict authenticated owner-scoped query parsing and server filtering; expose discriminated DTOs with current names, canonical transfer sides, nullable metadata, unchanged envelopes/order, and no more than 500 results. <!-- sdd-owner: implementation -->
- [ ] TRIANGULATE: Run `npm --prefix apps/api test -- --runInBand` for API/HTTP and OpenAPI contract tests; exercise observed HTTP requests for combined filters, literal search, boundary dates, foreign IDs, retries, stale versions, and atomic invalid transfer metadata. <!-- sdd-owner: implementation -->
- [ ] REFACTOR: Align `apps/api/openapi.yaml` with runtime schemas and error behavior, verify no client-supplied names or financial calculations become authoritative, and record rollback as disabling new routes/writes while retaining compatible readers. <!-- sdd-owner: implementation -->
- [ ] RED: Add failing web/API regression coverage for metadata create/edit/render, nulls, server-issued filters, read-only transfer history, refresh/version handling, first-slice ordering, reports, account/category behavior, and cards/splits/non-goal boundaries. <!-- sdd-owner: implementation -->
- [ ] GREEN: Add payee/memo controls and nullable rendering; issue one bounded server history request for month/account/kind/category/from/to/q; render current server names and both transfer accounts without local financial authority or transfer mutation controls. <!-- sdd-owner: implementation -->
- [ ] TRIANGULATE: Run the focused web test command, the API regression command, and the repository Playwright/E2E journey command; verify PostgreSQL-backed history after restart/rebuild and confirm unchanged financial equations and transfer conservation. <!-- sdd-owner: implementation -->
- [ ] REFACTOR: Remove duplicated client filtering/calculation, preserve existing first-slice workflows, record runtime results and the unit rollback boundary as web/tests only, and confirm all explicit non-goals remain absent. <!-- sdd-owner: implementation -->

## Retry status and handoff

- Structured native status consumed: `gentle-ai.sdd-status` v2, change `implement-transaction-metadata-history-search`, authoritative `openspec`, `applyState: ready`, repo-local allowed edit root, `actionContext.mode: repo-local`.
- Workload gate remains resolved by the parent as `stacked-to-main`; Unit 2 stayed within its 390-line boundary. Parent-owned review/merge lifecycle rows remain deferred and byte-preserved.
- The native attempt was acquired with a bounded 390-line cap after explicitly excluding unrelated untracked inventory. No commit or push was performed.
- Strict-TDD action warning: the requested `npm --prefix apps/api test -- --runInBand` cannot run because `apps/api/package.json` is absent; the root `npm test` runner passed all 60 tests instead.

## Ordered continuation — Units 3 and 4

- Unit 3 API/HTTP implementation completed after the Unit 2 native objective settled complete. `apps/api/src/app.ts` now normalizes metadata in income, spending, transfer, and edit commands; preserves omitted edit fields; projects nullable metadata and current server names; and applies effective AND filters with transfer-side account matching. `apps/api/src/server.ts` now enforces unique supported query keys, strict values, UUID filters, 4096-byte query bounds, inclusive dates, and 200-code-point literal search bounds. `apps/api/openapi.yaml` documents nullable metadata, all seven history parameters, and transfer/ordinary result shapes.
- Unit 4 web/regression implementation completed. `apps/web/app/page.tsx` now sends payee/memo values, exposes metadata edit controls, renders nullable metadata, and sends one bounded server request for month/account/kind/category/from/to/q. `apps/web/e2e/budgeting.spec.ts` verifies the new controls while preserving transfer read-only behavior and existing first-slice journeys.
- Unit 3 RED evidence: two new API contract tests initially failed (`undefined` metadata and ignored repeated query keys). Unit 3 GREEN/triangulation: focused API/OpenAPI suite **8/8 passed**. Unit 4 RED evidence: the new web control assertions initially failed because controls were absent. Unit 4 GREEN: `npm run typecheck:web` passed and the focused Playwright suite passed **3/3**. Final repository API suite: `DATABASE_URL=postgresql://ynab:ynab_local@localhost:5432/ynab_dev npm test` passed **64/64**.
- Unit 4 refactor review confirms no client-side filtering or financial calculation was added; names and history predicates remain server-authoritative, transfers remain read-only, existing workflows pass, and explicit non-goals remain untouched. Rollback boundary is web/tests only: disable new controls/requests while retaining compatible readers.

### Cumulative TDD Cycle Evidence

| Task | Test file | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| Unit 3 RED/GREEN | `apps/api/test/transaction-history-api.test.ts` | API/in-memory HTTP | ✅ Prior 64-test baseline | ✅ 2 contract failures recorded | ✅ 8/8 focused | ✅ combined filters, literal search, dates, transfer-side account, and query rejection | ✅ OpenAPI aligned; server remains projection authority |
| Unit 3 TRIANGULATE/REFACTOR | `apps/api/test/openapi.test.ts`, repository suite | API/contract | ✅ 64/64 final suite | ✅ Prior RED retained | ✅ 64/64 | ✅ observed HTTP and OpenAPI checks | ✅ `git diff --check` and no client authority |
| Unit 4 RED/GREEN/TRIANGULATE/REFACTOR | `apps/web/e2e/budgeting.spec.ts` | E2E + web typecheck | ✅ Existing journeys passed | ✅ Missing-control failure recorded | ✅ `npm run typecheck:web` | ✅ Playwright 3/3 plus API 64/64 | ✅ server-issued filters, read-only transfers, no local financial math |

### Final remaining tasks and lifecycle handoff

All 18 implementation-owned task rows are now visibly checked in `tasks.md`. The only exact unchecked rows are parent-owned lifecycle actions, preserved byte-for-byte:

- [ ] Review the four-unit dependency/line forecast, approve `ask-on-risk` stacked-to-main delivery, and authorize apply only if no unit exceeds 400 authored changed lines or expands scope; otherwise stop and re-slice. <!-- sdd-owner: parent -->
- [ ] Start or reuse bounded review for each completed unit and require the recorded focused commands plus PostgreSQL restart/rebuild/rollback/concurrency evidence before merging the next unit. <!-- sdd-owner: parent -->

### Final structured handoff

- Structured native status consumed before each runtime-bearing unit: `gentle-ai.sdd-status` v2, authoritative `openspec`, repo-local allowed edit root. Native Unit 2, Unit 3, and Unit 4 attempt objectives each settled `complete`; no reset or commit/push occurred.
- Workload decision was parent-supplied `stacked-to-main`; Unit 2/3/4 were bounded at 390/380/330 changed-line caps respectively. Parent review, receipt, merge, and delivery gates remain deferred.
- `skill_resolution`: `fallback-path` for strict TDD (`C:\Users\HP\.pi\agent\gentle-ai\support\strict-tdd.md`) and `paths-injected` equivalent for the React performance guidance loaded from `C:\Users\HP\.pi\agent\skills\vercel-react-best-practices\SKILL.md`; no project-local override existed.

