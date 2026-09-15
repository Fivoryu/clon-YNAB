# Apply Progress: Multi-Account Transfers

## Status

- Phase: `apply`
- Change: `implement-multi-account-transfers`
- Work unit: 1 — Persistence and Projection
- Structured status consumed: `ready`, authoritative `openspec`, action context `repo-local`; allowed edit root was the repository root.
- Runtime attempt: acquired and continued as `persistence-projection-size-exception` with native token `sha256:94852402a68e9825832f1ac5cbaca0ab6669a1195dc61597837f981d5afcab93`; explicit size exception is 450 authored changed lines.
- Delivery boundary: approved stacked-to-main Work Unit 1 only; no commit or push.
- Skill resolution: `fallback-path` for `work-unit-commits` because the injected path was missing; loaded the available equivalent at `C:\Users\HP\.agents\skills\work-unit-commits\SKILL.md`. `gentle-ai` loaded from the injected path.
- CodeGraph was present and `codegraph_explore` was used before filesystem inspection. `.codegraph/` and `.pi/` were not edited.

## Completed implementation tasks and checkbox updates

- RED domain tests added and first run failed on the missing projection exports; persisted task marked `[x]`.
- RED PostgreSQL migration/projection checks added; persisted task marked `[x]`.
- Additive Prisma schema and migration added; persisted task marked `[x]`.
- Durable collection loading/writing and legacy alias projection added in the PostgreSQL and in-memory seams; persisted task marked `[x]`.
- Checked per-account/opening aggregation and report projection added; persisted task marked `[x]`.
- Migration fail-closed preflight added; persisted task marked `[x]`.

## TDD Cycle Evidence

| Cycle | Evidence |
|---|---|
| RED | `node --experimental-strip-types --test apps/api/test/multi-account-persistence.test.ts` failed before implementation because `calculateAccountBalances` was not exported. |
| GREEN | `DATABASE_URL=postgresql://ynab:ynab_local@localhost:5432/ynab_dev npm run db:validate` passed; `npm run db:migrate` applied `0004_multi_account_projection`; focused persistence tests passed 4/4. |
| TRIANGULATE | `DATABASE_URL="postgresql://ynab:ynab_local@localhost:5432/ynab_dev" node --experimental-strip-types --test apps/api/test/multi-account-persistence.test.ts apps/api/test/migration.test.ts apps/api/test/financial-persistence.test.ts apps/api/test/restart-persistence.test.ts apps/api/test/reports.test.ts apps/api/test/transaction-history-prisma.test.ts` passed 20/20. `DATABASE_URL="postgresql://ynab:ynab_local@localhost:5432/ynab_dev" npm test` passed 48/48, including durable reload, restart/rebuild equality, migration containment, and transaction rollback. `DATABASE_URL="postgresql://ynab:ynab_local@localhost:5432/ynab_dev" npm run db:status` reported the database up to date. |
| REFACTOR | Ordering, alias, checked arithmetic, and projection logic remain centralized in `apps/api/src/planning/engine.ts`; `npx tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --allowImportingTsExtensions --skipLibCheck apps/api/src/planning/engine.ts apps/api/src/persistence/budget-store.ts apps/api/src/persistence/financial-store.ts apps/api/src/persistence/in-memory-budget-store.ts apps/api/src/reports/report-service.ts apps/api/test/multi-account-persistence.test.ts` and `git diff --check` passed. |

## Files changed

- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/0004_multi_account_projection/migration.sql`
- `apps/api/src/persistence/budget-store.ts`
- `apps/api/src/persistence/financial-store.ts`
- `apps/api/src/persistence/in-memory-budget-store.ts`
- `apps/api/src/planning/engine.ts`
- `apps/api/src/reports/report-service.ts`
- `apps/api/test/multi-account-persistence.test.ts`
- Existing PostgreSQL cleanup tests updated from singular `findUnique(budgetId)` to non-unique `findFirst(budgetId)` in `financial-persistence.test.ts`, `migration.test.ts`, `restart-persistence.test.ts`, `reports.test.ts`, and `transaction-history-prisma.test.ts`.
- `openspec/changes/implement-multi-account-transfers/tasks.md`

## Migration and rollback containment

Migration `0004_multi_account_projection` checks duplicate opening rows and historical income/spending rows without account references before dropping the legacy `Account_budgetId_key`; failure aborts the migration, so multi-account writes are not enabled. It adds the account ordering index, one-opening-row constraint, transfer-ready aggregate/effect columns and tenant-scoped foreign keys/checks without deleting or rewriting financial events. Rollback boundary: disable multi-account/transfer writes and continue the compatibility reader; do not restore the one-account unique constraint after multi-account data exists.

The previously measured candidate was 411 authored changed lines; it is within the explicitly authorized 450-line exception. No new runtime-bearing implementation change was needed.

## Remaining Work Unit 1 tasks

All Work Unit 1 implementation tasks are complete and visibly checked in `tasks.md`. Work Units 2–4 and parent-owned lifecycle gates remain unchecked and intentionally deferred. No account lifecycle routes, transfers, metadata, CSV, OpenAPI, web, or unrelated implementation was added.

## Risks / blockers

- No implementation blocker remains for Work Unit 1. PostgreSQL durability, migration application, restart/rebuild equality, and rollback tests passed against the supplied local database.
- The documented `psql` rollback-inventory command could not run because `psql` is not installed; equivalent migration/catalog assertions passed through Prisma-backed tests. No rollback was run against shared development data.
- Native attempt remains bounded at the explicit 450-line exception; settle the acquired token with the final evidence revision. Parent lifecycle review/verify remains deferred.

## Work Unit 2 — Account Lifecycle

- Structured status consumed: authoritative `openspec`, `applyState: ready`, repo-local action context, allowed edit root repository root; workload forecast is High with chained PRs recommended, and the parent supplied the resolved stacked-to-main Work Unit 2 boundary plus the explicit 380-line cap.
- Runtime attempt: acquired after the pre-execution timeout with request `ynab-accounts-wu2-acquire-retry-20260310` and token `sha256:0bfd43decb1dc6e1a05b4078b5ec8207515e8ca370a3e1938ec57ad3759c69ee`; no reset or commit/push performed.
- Completed implementation tasks: all eight Work Unit 2 implementation rows are checked `[x]` in `tasks.md`. Parent-owned rows and Work Units 3–4 remain unchanged and deferred.
- Implementation: added owner-scoped create/rename/archive commands, trimmed/manual `CASH`/`CHECKING` validation, optional safe negative openings, stable account IDs, no-unarchive behavior, shared `Idempotency-Key`/`If-Match` receipts and versions, PostgreSQL account/opening persistence in the existing transaction, in-memory parity, HTTP route/header mapping, and explicit account targeting for ordinary income/spending with archived-account rejection.
- Tests added to existing `apps/api/test/multi-account-persistence.test.ts`; no new test path was introduced. The test covers in-memory lifecycle/replay/conflict/owner scoping, HTTP POST/PATCH/archive/no-unarchive, and PostgreSQL atomic failure, opening uniqueness, restart rebuild, stale version, and receipt counts.

### TDD Cycle Evidence

| Task slice | Safety net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|
| Account lifecycle API and authorization | Focused pre-change suite: 13/13 passed with `DATABASE_URL` | Added tests first; focused run failed because `createAccount` was absent | Focused lifecycle suite: 7/7 passed | In-memory, HTTP, PostgreSQL restart/atomicity, negative opening, duplicate names, replay/conflict, stale version, and archived movement cases passed | Centralized `normalizeAccount`, `accountById`, and `activeAccount`; focused suite rerun 7/7; `git diff --check` passed |
| First-slice regression | Existing behavior baseline passed | N/A — regression safety net | Full suite after implementation: 51/51 passed | PostgreSQL-backed first-slice and restart suites passed against `postgresql://ynab:ynab_local@localhost:5432/ynab_dev` | No first-slice response regression observed |

### Exact verification commands and results

- `export DATABASE_URL='postgresql://ynab:ynab_local@localhost:5432/ynab_dev'; node --experimental-strip-types --test apps/api/test/multi-account-persistence.test.ts` — passed 7/7.
- `export DATABASE_URL='postgresql://ynab:ynab_local@localhost:5432/ynab_dev'; npm test` — passed 51/51.
- `npx tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --allowImportingTsExtensions --skipLibCheck apps/api/src/app.ts apps/api/src/server.ts apps/api/src/persistence/budget-store.ts apps/api/src/persistence/financial-store.ts apps/api/src/persistence/in-memory-budget-store.ts apps/api/test/multi-account-persistence.test.ts` — failed on the repository's existing broad type surface (legacy UUID/template and `unknown` inference errors, including pre-existing app/server/test diagnostics); runtime tests remain green. `git diff --check` passed.
- Changed-line accounting for this retry: 89 implementation-file additions/deletions relative to the Work Unit 1 candidate plus 208 lines for the existing lifecycle test surface replacement (161 additions and 47 removals); implementation/test delta is exactly 297 authored changed lines and below the explicit 380-line cap, excluding cumulative OpenSpec bookkeeping. `.codegraph/` and `.pi/` were not edited.

### Deviations and remaining work

- The task wording mentions stale-version conflict against a transfer; transfers are explicitly outside this Work Unit 2 boundary and are not implemented. The lifecycle suite proves the same shared version conflict against an ordinary persisted financial command; Work Unit 3 owns transfer-specific coverage.
- No implementation blocker remains for this work unit. Work Units 3–4 and parent-owned bounded review, verification, and archive gates remain pending.
- Exact remaining unchecked implementation rows are the Work Unit 3 and Work Unit 4 rows in `tasks.md`; parent-owned lifecycle rows remain unchecked by design. No transfer, metadata/search, CSV, OpenAPI, web, or unrelated behavior was added.

## Work Unit 3 — Transfer Core and History

- Structured status consumed: authoritative `openspec`, `applyState: ready`, repo-local action context, allowed edit root repository root; workload forecast High/chained recommended was resolved by the user's final authorized bounded third stacked slice with a 380-line cap.
- Native attempt: acquired and continued with request `ynab-accounts-wu3-acquire-final-retry-20260310`, token `sha256:29a0081188a45d2e598a524bfd4b7d95c79fccd0f3c53ea88f9a3b4f5c00faef`; no commit or push.
- Completed implementation tasks: all 11 Work Unit 3 implementation rows are checked `[x]` in `tasks.md`. Work Unit 4 and parent-owned lifecycle rows remain deferred.
- Implementation: added `TransferState`, same-budget active-account validation, strict date/month normalization, immutable `TRANSFER_OUT`/`TRANSFER_IN` effects, aggregate persistence, one-item transfer history with current account references, edit/delete conflict guards, report neutrality, in-memory per-budget serialization, HTTP route/header mapping, PostgreSQL budget-lock transaction/replay/version/rollback behavior, and restart-safe reads.
- Changed-line accounting: 166 authored implementation/test changed lines for this Work Unit 3 slice (app 38, financial store 18, in-memory store 12, server 1, focused existing test file 97), below the explicit 380-line cap. OpenSpec bookkeeping is excluded. `.codegraph/` and `.pi/` were not edited.

### TDD Cycle Evidence

| Cycle | Evidence |
|---|---|
| RED | `cd apps/api && DATABASE_URL='postgresql://ynab:ynab_local@localhost:5432/ynab_dev' node --experimental-strip-types --test test/multi-account-persistence.test.ts` failed 7/8 because `app.recordTransfer` was not implemented; no production transfer code existed before this failing test. |
| GREEN | The same focused command passed 10/10 after the transfer command, HTTP route, history projection, in-memory queue, and PostgreSQL persistence were implemented. |
| TRIANGULATE | The focused suite passed 10/10 with PostgreSQL, including restart/rebuild, rollback/no receipt leakage/no one-sided effect, tenant-scoped schema assertions, and concurrent identical retry uniqueness. `cd apps/api && DATABASE_URL='postgresql://ynab:ynab_local@localhost:5432/ynab_dev' npm test` passed 54/54. `npm run db:status` reported the database schema up to date. |
| REFACTOR | `git diff --check` passed. Transfer identity is the aggregate ID; paired effects remain internal. Existing reports exclude transfer kinds, category `MOVE` remains separate, and no payee/memo/CSV/OpenAPI/web behavior was added. |

### Exact verification commands and results

- `cd apps/api && DATABASE_URL='postgresql://ynab:ynab_local@localhost:5432/ynab_dev' node --experimental-strip-types --test test/multi-account-persistence.test.ts` — passed 10/10.
- `cd apps/api && DATABASE_URL='postgresql://ynab:ynab_local@localhost:5432/ynab_dev' npm test` — passed 54/54.
- `cd apps/api && DATABASE_URL='postgresql://ynab:ynab_local@localhost:5432/ynab_dev' npm run db:status` — passed; database schema is up to date.
- `git diff --check` — passed.
- `npx tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --allowImportingTsExtensions --skipLibCheck apps/api/src/app.ts apps/api/src/server.ts apps/api/src/persistence/financial-store.ts apps/api/src/persistence/in-memory-budget-store.ts apps/api/src/persistence/budget-store.ts apps/api/test/multi-account-persistence.test.ts` — failed on the repository's existing broad type surface (legacy UUID/template and `unknown` inference diagnostics); runtime focused/full suites passed.

### Scope, rollback, and action warnings

- Rollback boundary: disable `POST /api/v1/budgets/{budgetId}/transfers` and transfer mutation handling while retaining committed `Transfer` rows/effects and forward-compatible history reads; do not restore the old one-account schema.
- The CodeGraph explore request timed out. Per guidance, structural inspection fell back to targeted read-only file inspection after confirming `.codegraph/` exists; no CodeGraph index or `.pi/` file was changed.
- Remaining exact unchecked implementation rows:
  - [ ] Add failing OpenAPI structural tests under `apps/api/test` (or the established contract-test location) requiring `accounts[]`, oldest `account` alias, per-account balances, lifecycle routes, transfer request headers/body constraints, error envelopes, `TRANSFER` discriminator, and retained existing route matrix; run `cd apps/api && npm test -- --runInBand <openapi-contract-test-file>`. <!-- sdd-owner: implementation -->
  - [ ] Add a failing focused Playwright journey under the repository’s existing web test location for create/select/archive account, transfer between active accounts, reload/rebuild, one history item, both balances, unchanged RTA/category values, and legacy first-slice journey compatibility. Run the repository’s established Playwright command, e.g. `npm run test:e2e -- <focused-journey>`. <!-- sdd-owner: implementation -->
  - [ ] Update `apps/api/openapi.yaml` with the canonical budget/summary/dashboard schemas, account lifecycle routes, transfer route, required `Idempotency-Key`/`If-Match`, safe errors, and `TRANSFER` history fields; do not document payee/memo, CSV, cards, splits, reconciliation, or banking integration. <!-- sdd-owner: implementation -->
  - [ ] Update `apps/web/app/page.tsx` to consume `accounts[]`, show per-account and aggregate balances, support only the bounded lifecycle controls and one transfer flow/history view, refresh server projections after commands, and perform no balance/RTA calculations locally. <!-- sdd-owner: implementation -->
  - [ ] Wire any required typed API client or route adapter only in the existing API/web integration paths; keep transfer identity, archived references, headers, envelopes, and error behavior aligned with `apps/api/src/app.ts` and `apps/api/src/server.ts`. <!-- sdd-owner: implementation -->
  - [ ] Run `cd apps/api && npm test -- --runInBand <openapi-contract-test-file> <api-regression-test-files>` plus the focused Playwright command; verify the documented and observed schemas match, including legacy singular alias compatibility and `TRANSFER` history. <!-- sdd-owner: implementation -->
  - [ ] Run the complete existing API and web regression commands from repository configuration, and confirm PostgreSQL-backed journey reads after reload rather than client-maintained totals. <!-- sdd-owner: implementation -->
  - [ ] Remove duplicated client projection assumptions, keep accessibility/error/loading behavior consistent with existing UI conventions, and rerun contract, focused journey, and first-slice regression suites. <!-- sdd-owner: implementation -->
  - [ ] Before apply begins, decide whether to authorize the recommended four-slice chained delivery or another explicit strategy; because delivery is `ask-on-risk` and forecast risk is High, do not proceed past the 400-line gate without that decision. <!-- sdd-owner: parent -->
  - [ ] Start or reuse a bounded review for each completed work unit, checking its exact changed-line count, focused test evidence, PostgreSQL durability/concurrency/rollback evidence where applicable, migration containment, and independent rollback boundary. <!-- sdd-owner: parent -->

## Work Unit 4 — Contract and Client Integration

- Structured status consumed: authoritative `openspec`, `applyState: ready`, repo-local action context, repository-root allowed edit scope. The workload gate was resolved by the parent as `stacked-to-main` with automatic chained delivery and a 380 authored-line cap; only the Work Unit 4 contract/client slice was implemented.
- Runtime attempt: acquired with request `ynab-contract-client-wu4-retry-20260310` and token `sha256:7f9c12e9bb0aef8768c48dd9b1bab7ff4bd2200ff41472175dce471ea5c6fd0f`; no commit or push performed.
- Completed implementation tasks: all eight Work Unit 4 implementation rows are checked `[x]` in `tasks.md`; parent-owned lifecycle rows remain unchecked and deferred.
- OpenAPI: added account collection/alias and balance fields, lifecycle routes, required account/transfer command headers, bounded request/result schemas, safe error response, `TRANSFER` history discriminator and retained existing route matrix. Deferred payee/memo, CSV, cards, splits, reconciliation, and banking routes remain undocumented.
- Web: added server-projection account list with aggregate/per-account balances, create/archive controls, ordinary movement account selectors, one transfer form/history rendering, and post-command budget/summary reloads. The browser continues to send idempotency/version headers and performs no balance or RTA calculations.
- Client integration: the existing typed `call`/`command` adapter now consumes the additive account and transfer envelopes and refreshes authoritative budget projections; no second API client or unrelated route adapter was introduced.

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| OpenAPI structural contract | `apps/api/test/openapi.test.ts` | Unit/structural | ✅ 1/1 before edits | ✅ Written; failed on missing account path | ✅ 2/2 focused | ✅ Four new routes plus retained route matrix; full API 55/55 | ✅ `git diff --check` |
| Account/transfer browser journey | `apps/web/e2e/budgeting.spec.ts` | E2E | ⚠ Existing journeys were covered in the final 3/3 run rather than a separate pre-edit run | ✅ Written; failed on missing Accounts UI | ✅ Focused journey passed | ✅ Lifecycle, archive, transfer, reload, history, RTA/category neutrality, plus legacy journeys | ✅ UI remains server-projection driven; full E2E passed |
| Client contract regression | `apps/web/test/page.test.ts` | Structural/unit | ✅ 3/3 before edits | N/A — existing boundary assertions | ✅ 3/3 after integration | ✅ Covered alongside the focused browser contract journey | ✅ `npm run typecheck:web` passed |

### Verification evidence

- `node --experimental-strip-types --test apps/api/test/openapi.test.ts` — passed 2/2 after GREEN.
- `npx playwright test apps/web/e2e/budgeting.spec.ts -g "integrates account lifecycle and transfers"` — passed 1/1.
- `DATABASE_URL='postgresql://ynab:ynab_local@localhost:5432/ynab_dev' npm test` — passed 55/55, including PostgreSQL-backed API regressions and the OpenAPI contract tests.
- `npx playwright test apps/web/e2e/budgeting.spec.ts` — passed 3/3, including first-slice and history compatibility journeys.
- `node --experimental-strip-types --test apps/api/test/openapi.test.ts apps/web/test/page.test.ts` — passed 5/5.
- `npm run typecheck:web` — passed.
- `git diff --check` — passed.

### Workload, scope, and remaining tasks

- Authored changed-line accounting for this slice: 195 changed lines across `apps/api/openapi.yaml`, `apps/api/test/openapi.test.ts`, `apps/web/app/page.tsx`, and `apps/web/e2e/budgeting.spec.ts`, below the explicit 380-line cap. OpenSpec bookkeeping is excluded.
- Files changed: `apps/api/openapi.yaml`, `apps/api/test/openapi.test.ts`, `apps/web/app/page.tsx`, `apps/web/e2e/budgeting.spec.ts`, `openspec/changes/implement-multi-account-transfers/tasks.md`, and this cumulative progress file.
- Exact remaining unchecked implementation tasks: none. Parent-owned deferred lifecycle actions remain:
  - [ ] Before apply begins, decide whether to authorize the recommended four-slice chained delivery or another explicit strategy; because delivery is `ask-on-risk` and forecast risk is High, do not proceed past the 400-line gate without that decision. <!-- sdd-owner: parent -->
  - [ ] Start or reuse a bounded review for each completed work unit, checking its exact changed-line count, focused test evidence, PostgreSQL durability/concurrency/rollback evidence where applicable, migration containment, and independent rollback boundary. <!-- sdd-owner: parent -->

### Deviations, risks, and action warnings

- CodeGraph exploration timed out again; after confirming `.codegraph/`, targeted read-only inspection was used. No `.codegraph/` or `.pi/` files were edited.
- The full API regression command initially ran without `DATABASE_URL` and produced environment/pre-existing harness failures; the authoritative rerun with the configured local PostgreSQL URL passed 55/55. No production fix was made for that environment-only failure.
- The Playwright web server emitted the existing Next.js cross-origin development warning; the focused and complete journeys passed.
- Rollback boundary: disable new account/transfer UI and contract routes or revert this contract/client slice while retaining durable server behavior and first-slice clients. Parent-owned bounded review, verify, and archive actions remain deferred.
- Structured status produced: Work Unit 4 implementation remains ready for parent lifecycle; `next_recommended` is `parent-lifecycle`, not verify or archive.
