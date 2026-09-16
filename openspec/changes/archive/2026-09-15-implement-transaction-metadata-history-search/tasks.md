# Tasks: Transaction Metadata, History Filters, and Search

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 1,250–1,650 authored lines total; each review unit 260–390 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 → PR 2 → PR 3 → PR 4 |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

## Implementation guardrails

- Keep the four units ordered and independently verifiable: normalization/domain → PostgreSQL durability → API/HTTP contract → web/regression.
- Preserve append-only immutable replacements and tombstones, canonical `accounts[]`, one canonical `TRANSFER` item, owner authorization/non-disclosure, budget-scoped idempotency, `If-Match`, existing ordering, and the existing 500-result first slice.
- Do not change financial equations in `apps/api/src/reports/report-service.ts` (balances, Activity, Assigned, Available, rollover, or RTA); metadata and search are financially neutral.
- Do not add CSV/import, cards, splits, reconciliation, synchronization, pagination, transfer edit/delete, a new search subsystem, or a new transaction authority. Do not edit generated artifacts outside the owning unit.
- Every unit records focused test output, runtime evidence (or explicit `N/A`), and an exact rollback boundary before handoff.

## Review Unit 1 — Normalization and pure history domain

Paths: `apps/api/src/planning/transaction-history.ts`, related pure domain modules, and their focused unit tests under `apps/api/src/**/*.test.ts`.

- [x] RED: Add failing tests for Unicode-White_Space trimming, case preservation, Unicode code-point limits (payee 200, memo 1000), null/empty clearing, invalid types, presence-sensitive edit patches, canonical digest behavior, replacement propagation, tombstone invisibility, unchanged ordering, AND filters, literal `%`/`_` search, inclusive dates, transfer either-side matching, and one transfer result. <!-- sdd-owner: implementation -->
- [x] GREEN: Implement the shared nullable metadata normalizer/patch and pure effective-fold/filter/search predicates; preserve omitted edit values, immutable prior events, non-searchable tombstones, canonical transfer direction, and the 500 cap. <!-- sdd-owner: implementation -->
- [x] TRIANGULATE: Run `npm --prefix apps/api test -- --runInBand` with the focused transaction-history test path; compare in-memory fixtures with rebuilt effective projections and prove metadata-only edits do not change financial inputs/equations. <!-- sdd-owner: implementation -->
- [x] REFACTOR: Remove duplicate normalization/folding logic, retain stable date/createdAt/identity ordering, and document the unit’s rollback boundary as only the domain changes and tests in the paths above. <!-- sdd-owner: implementation -->

## Review Unit 2 — Durable persistence and migration

Paths: `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/<additive-metadata-migration>/migration.sql`, `apps/api/src/persistence/financial-store.ts`, `apps/api/src/persistence/in-memory-budget-store.ts`, and persistence/report tests under `apps/api/src/**/*.test.ts`.

- [x] RED: Add PostgreSQL-backed failures for nullable legacy backfill, event/transfer metadata mapping, replacement-chain and tombstone rebuild, restart equality, current account/category rename/archive projection, atomic failure rollback, and unchanged report equations; add concurrent retry/stale-version cases. <!-- sdd-owner: implementation -->
- [x] GREEN: Add nullable payee/memo columns and justified bounded indexes additively; persist/load transfer aggregate metadata, fold all relevant rows before capping, reuse pure predicates, and keep PostgreSQL authoritative with atomic receipt/version writes. <!-- sdd-owner: implementation -->
- [x] TRIANGULATE: Run `npm --prefix apps/api test -- --runInBand` for persistence tests plus the repository PostgreSQL integration command; restart PostgreSQL, rebuild from raw rows, and compare DTOs/equations. Demonstrate injected rollback leaves no replacement, tombstone, transfer leg, metadata, or receipt; demonstrate concurrent same-key retries yield one identity/effect pair. <!-- sdd-owner: implementation -->
- [x] REFACTOR: Verify migration forward/rebuild and reviewed rollback (disable routes/writes after metadata exists; never delete columns or rewrite events), record PostgreSQL restart/concurrency evidence, and bound this unit’s rollback to its migration/store/adapter/tests. <!-- sdd-owner: implementation -->

## Review Unit 3 — API and HTTP contract

Paths: `apps/api/src/app.ts`, `apps/api/src/server.ts`, `apps/api/openapi.yaml`, and API/contract tests under `apps/api/src/**/*.test.ts`.

- [x] RED: Add failing command/query contract tests for nullable metadata on income, spending, and transfer creation/results; edit omission versus clear; strict unique keys (`month`, `account`, `kind`, `category`, `from`, `to`, `q`), 4096-byte query bound, validation/non-disclosure, envelopes, idempotency, `If-Match`, protected records, and transfer immutability. <!-- sdd-owner: implementation -->
- [x] GREEN: Wire normalized metadata and canonical digests through commands; implement strict authenticated owner-scoped query parsing and server filtering; expose discriminated DTOs with current names, canonical transfer sides, nullable metadata, unchanged envelopes/order, and no more than 500 results. <!-- sdd-owner: implementation -->
- [x] TRIANGULATE: Run `npm --prefix apps/api test -- --runInBand` for API/HTTP and OpenAPI contract tests; exercise observed HTTP requests for combined filters, literal search, boundary dates, foreign IDs, retries, stale versions, and atomic invalid transfer metadata. <!-- sdd-owner: implementation -->
- [x] REFACTOR: Align `apps/api/openapi.yaml` with runtime schemas and error behavior, verify no client-supplied names or financial calculations become authoritative, and record rollback as disabling new routes/writes while retaining compatible readers. <!-- sdd-owner: implementation -->

## Review Unit 4 — Web and regression

Paths: `apps/web/app/page.tsx`, related web tests/E2E paths, and existing API regression tests under `apps/api/src/**/*.test.ts`.

- [x] RED: Add failing web/API regression coverage for metadata create/edit/render, nulls, server-issued filters, read-only transfer history, refresh/version handling, first-slice ordering, reports, account/category behavior, and cards/splits/non-goal boundaries. <!-- sdd-owner: implementation -->
- [x] GREEN: Add payee/memo controls and nullable rendering; issue one bounded server history request for month/account/kind/category/from/to/q; render current server names and both transfer accounts without local financial authority or transfer mutation controls. <!-- sdd-owner: implementation -->
- [x] TRIANGULATE: Run the focused web test command, the API regression command, and the repository Playwright/E2E journey command; verify PostgreSQL-backed history after restart/rebuild and confirm unchanged financial equations and transfer conservation. <!-- sdd-owner: implementation -->
- [x] REFACTOR: Remove duplicated client filtering/calculation, preserve existing first-slice workflows, record runtime results and the unit rollback boundary as web/tests only, and confirm all explicit non-goals remain absent. <!-- sdd-owner: implementation -->

## Parent gate before apply

- [x] Review the four-unit dependency/line forecast, approve `ask-on-risk` stacked-to-main delivery, and authorize apply only if no unit exceeds 400 authored changed lines or expands scope; otherwise stop and re-slice. <!-- sdd-owner: parent -->
- [x] Start or reuse bounded review for each completed unit and require the recorded focused commands plus PostgreSQL restart/rebuild/rollback/concurrency evidence before merging the next unit. <!-- sdd-owner: parent -->
