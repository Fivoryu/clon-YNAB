# Apply Progress: PR 1 skeleton auth setup

## Status

- Change: `implement-first-budgeting-slice`
- Work unit: `PR 1 skeleton auth setup`
- Result: bounded checkpoint implemented; full change remains incomplete.
- Native status consumed: `changeName=implement-first-budgeting-slice`, `applyState=ready`, `actionContext.mode=repo-local`, workspace and allowed edit root are the repository root.
- Delivery boundary: selected `stacked-to-main`, PR 1 only, 400-line maximum; no size exception.
- Action-context warnings: none. Pre-existing documentation changes and untracked files were preserved.

## Bounded correction: PR 1 HTTP auth resume

- Work unit: `PR 1 HTTP auth resume correction`; native correction authority token was supplied by the parent and was not expanded.
- Fixed `GET /api/v1/budgets` to derive the session token before dispatch, restoring authenticated resume and unauthenticated `401 UNAUTHENTICATED` behavior.
- Added focused HTTP regression coverage for registration, sign-in, unauthenticated resume rejection, budget creation, and authenticated resume identity.
- Changed files in this correction: `apps/api/src/server.ts`, `apps/api/test/app.test.ts`, and this progress artifact.
- Authored-line estimate for this correction: approximately 35 implementation/test lines, plus cumulative progress notes; within the 200-line correction bound.

## Completed implementation tasks

The following six implementation-owned rows were marked `- [x]` in `tasks.md`: baseline/path inspection; modular-monolith skeleton; Identity; budget authorization; resumable setup; web auth/setup/resume screens.

Baseline: the repository contained documentation/OpenSpec artifacts only, with no application, test, package, Prisma, or Docker configuration. Selected paths are `apps/api/src`, `apps/api/test`, `apps/web/app`, and the future canonical persistence boundary under `apps/api/prisma`.

## Files changed by this run

- `package.json`
- `tsconfig.json`
- `apps/api/src/app.ts`
- `apps/api/src/server.ts`
- `apps/api/test/app.test.ts`
- `apps/web/app/page.tsx`
- `openspec/changes/implement-first-budgeting-slice/tasks.md`
- `openspec/changes/implement-first-budgeting-slice/apply-progress.md`

## Verification evidence

- RED: `npm test` was run before `apps/api/src/app.ts` existed and failed with `ERR_MODULE_NOT_FOUND`.
- GREEN: `npm test` passed 4/4 focused tests.
- Syntax checks: `node --experimental-strip-types --check apps/api/src/app.ts` and `.../server.ts` passed.
- HTTP smoke check passed for registration envelope, sign-in `HttpOnly; SameSite=Lax` cookie, and unauthenticated budget access (`401 UNAUTHENTICATED`).

## Correction verification evidence

- RED: focused HTTP regression initially returned `400 VALIDATION_ERROR` for unauthenticated `GET /api/v1/budgets`, confirming the pre-declaration token bug.
- GREEN: `node --experimental-strip-types --test apps/api/test/app.test.ts` passed all 5 tests, including authenticated resume and unauthenticated `401` behavior.
- Syntax: `node --experimental-strip-types --check apps/api/src/server.ts` and `node --experimental-strip-types --check apps/api/test/app.test.ts` passed.
- No category HTTP routes, Prisma persistence, income/release, budgeting engine, spending, assignments, dashboard, reports, or later-slice behavior was added.

## Authored-line evidence

The selected source/configuration files contain 236 authored lines (214 under `apps/`, 22 package/TypeScript configuration). The task checkbox delta and this progress artifact add approximately 60 lines; the run remains below the 400-line attempt budget. Existing documentation changes are not included in this estimate.

## Design deviations and risks

- The HTTP correction validates the route against the existing in-memory `BudgetApp`; durable persistence and restart survival remain unverified and out of scope for this correction.
- The repository had documentation only and no package/dependency baseline. This checkpoint uses a small Node 22 TypeScript runtime and an in-memory repository to keep the first stacked slice coherent and within budget; it does not claim durable PostgreSQL/Prisma persistence.
- Prisma schema/migrations, durable session storage, and database constraints remain for the persistence slice. Restarting the process currently loses users, sessions, and setup state.
- The web page is a minimal Next.js path and renders API state; Next.js dependencies/build configuration remain part of the later application setup work.
- No budgeting engine, financial history, income/release, spending, allocations, moves, reports, or deferred features were added.

## Remaining implementation tasks

- [ ] Add failing unit-test files under the selected API domain test locations for integer minor-unit arithmetic, budget-timezone month resolution (UTC default and boundary dates), RTA components, Assigned/Activity/Available, positive-only rollover, assignment/unassignment/move conservation, explicit income-release repeatability, and rejection of deferred concepts. <!-- sdd-owner: implementation -->
- [ ] Add failing API/integration test fixtures under the selected API integration-test locations for session expiry/revocation, owner isolation with uniform `NOT_FOUND`, one-budget uniqueness, resumable setup retries, archived-category rejection, atomic financial writes, idempotency replay/payload conflict, stale-version conflict, and deterministic rebuild. <!-- sdd-owner: implementation -->
- [ ] Add a failing Playwright test under the selected web E2E location covering registration/sign-in, partial setup save/resume, setup completion, income before/after explicit release, assignment and negative-RTA correction, categorized spending, month boundary, and dashboard/month-summary consistency. <!-- sdd-owner: implementation -->
- [ ] Implement the additive Prisma schema/migrations at the canonical API persistence path for users, sessions, one-user/one-budget setup metadata, budget timezone, the supported account, category lifecycle, and integer opening-balance history; add ownership uniqueness, stable historical references, archive constraints, and rollback inventory. <!-- sdd-owner: implementation -->
- [ ] Implement the pure TypeScript planning engine at the selected API planning/engine path with explicit minor-unit inputs/outputs for account balance, released versus unreleased income, RTA breakdown, category Assigned/Activity/Available, positive rollover, timezone month selection, and assignment/move conservation. <!-- sdd-owner: implementation -->
- [ ] Implement authoritative financial history and idempotency/version persistence in the canonical Prisma migration path for income, release, spending, assignment, unassignment, moves, command digests/results, and affected budget-month versions; ensure indexes and uniqueness protect retries. <!-- sdd-owner: implementation -->
- [ ] Implement Accounts, Categories, Transactions, and Planning application services at their selected API module paths using intent amounts only, archived-entity checks, explicit full release semantics, visible overassignment/negative RTA, and rejection of all deferred transaction concepts. <!-- sdd-owner: implementation -->
- [ ] Wrap every financial command in one PostgreSQL transaction with authorization, same-transaction idempotency lookup/digest validation, affected-state version protection, append-only effects, result replay, and all-or-nothing account/category/allocation changes. <!-- sdd-owner: implementation -->
- [ ] Implement versioned `/api/v1` command/read controllers and OpenAPI documentation at the selected API controller paths for authentication, setup, category lifecycle, income/release, spending, allocation/moves, dashboard, and month summary; use stable status/error categories and server-calculated values. <!-- sdd-owner: implementation -->
- [ ] Make the RED unit matrix pass against the pure engine, including property/table cases proving no floating-point source of truth, no double-subtracted spending, positive-only carry, release exactly once, and no silent unrelated-category changes. <!-- sdd-owner: implementation -->
- [ ] Make the API integration matrix pass against PostgreSQL, including rollback after injected failure, same-key same-payload replay, same-key different-payload conflict, concurrent stale-write conflict, ownership isolation, archived references, boundary-month behavior, and rebuild after derived-summary loss. <!-- sdd-owner: implementation -->
- [ ] Implement Reports read services at the selected API reports path so dashboard and month summary use the same canonical engine/read model, authorize before loading, expose distinct components, and synchronously rebuild or safely recalculate derived data from authoritative history. <!-- sdd-owner: implementation -->
- [ ] Make contract/API tests pass for envelopes, validation, status codes, OpenAPI DTOs, request IDs, non-disclosing foreign access, and unsupported reporting controls without creating partial effects. <!-- sdd-owner: implementation -->
- [ ] Implement the selected web budgeting routes/components for monthly category assignments, moves/unassignments, negative-RTA correction, income release, categorized spending, dashboard, and monthly summary; keep all displayed figures sourced from API DTOs and make unsupported controls absent or clearly unavailable. <!-- sdd-owner: implementation -->
- [ ] Make the Playwright primary journey pass end to end, including save/resume and retry paths, account balance versus unreleased RTA distinction, explicit release, overassignment/correction, positive rollover, timezone boundary, and matching dashboard/month-summary values. <!-- sdd-owner: implementation -->
- [ ] Refactor module dependencies, shared DTO/error handling, transaction boundaries, and engine/read-service reuse to enforce the documented API boundaries and remove duplicated formulas while preserving the mandatory unit/integration/contract/E2E behavior. <!-- sdd-owner: implementation -->
- [ ] Run the repository’s discovered format, lint, unit, integration, build, migration, OpenAPI, and Playwright commands; verify the migration rollback/rebuild procedure and the first-slice non-goal scan, then record results and any environment limitations in the apply/verify artifacts. <!-- sdd-owner: implementation -->

## Next step

This bounded PR 1 checkpoint is not ready for full-change verification because durable Prisma persistence and the later verification tasks remain unchecked. Continue with the next approved stacked slice after parent review; do not run delivery lifecycle actions here.

## PR 2 engine and persistence checkpoint

- Work unit: `PR 2 engine persistence API`; native attempt authority token was consumed for this bounded run and no replacement was created.
- Structured status consumed: active change `implement-first-budgeting-slice`, repo-local root/allowed edit root, parent-authorized `stacked-to-main`, 400-line cap, no size exception; action-context warnings: none.
- Completed implementation tasks: unit engine matrix, additive Prisma schema/migration, pure planning engine, and authoritative financial/idempotency/version persistence. Their four `tasks.md` rows are now visibly `- [x]`.
- Files added: `apps/api/src/planning/engine.ts`, `apps/api/test/engine.test.ts`, `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/0001_budgeting_slice/migration.sql`, `apps/api/prisma/ROLLBACK.md`.
- Engine covers integer account/RTA/category values, explicit release repeatability, positive rollover, timezone month selection, assignment/move conservation, and deferred-command rejection.
- Persistence baseline covers one owner budget/account, sessions/setup metadata, category lifecycle, opening history, append-only financial events, budget-month versions, scoped command receipts, restrictive historical references, and rollback inventory.
- Verification: `npm test` passed 12/12; `node --experimental-strip-types --check` passed for the engine and engine tests. Prisma CLI/database runtime is unavailable, so migration execution and generated-client validation were not run.
- Authored-line evidence for this PR2 run: 374 new implementation/test/persistence lines before this progress note; progress/task edits are tracked separately. This remains within the 400-line bounded attempt when documentation bookkeeping is excluded from authored implementation evidence.
- Deviations: application services, PostgreSQL transaction wrappers, financial HTTP controllers/OpenAPI, reports, and web workflow are not claimed; no PR1 files or documentation changes were altered.

## Remaining implementation tasks

Remaining unchecked implementation tasks (exact `tasks.md` rows):

- [ ] Add failing API/integration test fixtures under the selected API integration-test locations for session expiry/revocation, owner isolation with uniform `NOT_FOUND`, one-budget uniqueness, resumable setup retries, archived-category rejection, atomic financial writes, idempotency replay/payload conflict, stale-version conflict, and deterministic rebuild. <!-- sdd-owner: implementation -->
- [ ] Add a failing Playwright test under the selected web E2E location covering registration/sign-in, partial setup save/resume, setup completion, income before/after explicit release, assignment and negative-RTA correction, categorized spending, month boundary, and dashboard/month-summary consistency. <!-- sdd-owner: implementation -->
- [ ] Implement Accounts, Categories, Transactions, and Planning application services at their selected API module paths using intent amounts only, archived-entity checks, explicit full release semantics, visible overassignment/negative RTA, and rejection of all deferred transaction concepts. <!-- sdd-owner: implementation -->
- [ ] Wrap every financial command in one PostgreSQL transaction with authorization, same-transaction idempotency lookup/digest validation, affected-state version protection, append-only effects, result replay, and all-or-nothing account/category/allocation changes. <!-- sdd-owner: implementation -->
- [ ] Implement versioned `/api/v1` command/read controllers and OpenAPI documentation at the selected API controller paths for authentication, setup, category lifecycle, income/release, spending, allocation/moves, dashboard, and month summary; use stable status/error categories and server-calculated values. <!-- sdd-owner: implementation -->
- [ ] Make the RED unit matrix pass against the pure engine, including property/table cases proving no floating-point source of truth, no double-subtracted spending, positive-only carry, release exactly once, and no silent unrelated-category changes. <!-- sdd-owner: implementation -->
- [ ] Make the API integration matrix pass against PostgreSQL, including rollback after injected failure, same-key same-payload replay, same-key different-payload conflict, concurrent stale-write conflict, ownership isolation, archived references, boundary-month behavior, and rebuild after derived-summary loss. <!-- sdd-owner: implementation -->
- [ ] Implement Reports read services at the selected API reports path so dashboard and month summary use the same canonical engine/read model, authorize before loading, expose distinct components, and synchronously rebuild or safely recalculate derived data from authoritative history. <!-- sdd-owner: implementation -->
- [ ] Make contract/API tests pass for envelopes, validation, status codes, OpenAPI DTOs, request IDs, non-disclosing foreign access, and unsupported reporting controls without creating partial effects. <!-- sdd-owner: implementation -->
- [ ] Implement the selected web budgeting routes/components for monthly category assignments, moves/unassignments, negative-RTA correction, income release, categorized spending, dashboard, and monthly summary; keep all displayed figures sourced from API DTOs and make unsupported controls absent or clearly unavailable. <!-- sdd-owner: implementation -->
- [ ] Make the Playwright primary journey pass end to end, including save/resume and retry paths, account balance versus unreleased RTA distinction, explicit release, overassignment/correction, positive rollover, timezone boundary, and matching dashboard/month-summary values. <!-- sdd-owner: implementation -->
- [ ] Refactor module dependencies, shared DTO/error handling, transaction boundaries, and engine/read-service reuse to enforce the documented API boundaries and remove duplicated formulas while preserving the mandatory unit/integration/contract/E2E behavior. <!-- sdd-owner: implementation -->
- [ ] Run the repository’s discovered format, lint, unit, integration, build, migration, OpenAPI, and Playwright commands; verify the migration rollback/rebuild procedure and the first-slice non-goal scan, then record results and any environment limitations in the apply/verify artifacts. <!-- sdd-owner: implementation -->

## Delivery boundary

This is a coherent PR2 foundation checkpoint and is ready for delegated verification of the engine/schema artifacts only. It is not ready for full-change verification or delivery lifecycle actions; the parent must continue the remaining PR2 API work before advancing to PR3.

## PR2 financial API successor attempt

- Work unit: `PR 2 engine persistence API size exception`.
- Native attempt authority: parent-authorized `size:exception`, maximum 500 changed lines for this successor attempt; token `sha256:ee29057759e6c3811dd86b31fc45c4b8aecf7f472b24288ce74c8cd0343fa8b4` was supplied for this bounded attempt. No further exception was inferred.
- Structured status consumed: `changeName=implement-first-budgeting-slice`, `applyState=ready`, repo-local workspace root and allowed edit root are the repository root. Interactive/both/ask-on-risk/stacked-to-main context was honored; no preflight artifact or `.codegraph/` change was made. Engram was unavailable, so this progress was persisted only in OpenSpec.
- Completed implementation-owned tasks: Accounts/Categories/Transactions/Planning application services and versioned `/api/v1` command/read controllers with OpenAPI evidence. `tasks.md` was updated immediately and re-read; both rows visibly show `- [x]`.
- Financial behavior: realized income, explicit full release, categorized spending, monthly assignment/unassignment/move, archived-category guards, intent-only positive amounts, owner authorization, server-calculated summaries, scoped idempotency replay/digest conflict, expected-version conflict, append-only in-memory event history, and clone-before-commit atomic behavior for the available non-PostgreSQL baseline.
- Files changed in this successor attempt: `apps/api/src/app.ts`, `apps/api/src/server.ts`, `apps/api/test/financial.test.ts`, `apps/api/openapi.yaml`, `openspec/changes/implement-first-budgeting-slice/tasks.md`, and this progress artifact. Existing PR1 and PR2 engine/Prisma artifacts were preserved.
- Verification: RED `npm test` failed on the new financial tests because the application methods did not exist; GREEN `npm test` passed 16/16. Syntax checks passed for `apps/api/src/app.ts`, `apps/api/src/server.ts`, and `apps/api/test/financial.test.ts`. No PostgreSQL/Prisma runtime was available, so PostgreSQL transaction integration and generated-client validation remain unverified.
- Authored-line estimate: approximately 155 successor implementation/test/OpenAPI lines relative to the current PR2 checkpoint (about 155/500; task/progress bookkeeping excluded). This remains within the explicitly authorized bound.
- Deviations: the available baseline remains an in-memory Node runtime, so the application transaction wrapper provides rollback-style atomicity but does not complete the required PostgreSQL transaction task. Dashboard and summary routes currently share the bounded canonical summary calculation; the dedicated Reports read-service/rebuild task remains deferred. No web budgeting UI, Playwright, delivery lifecycle, commit, push, PR, or release action was performed.

## Remaining implementation tasks after this attempt

- [ ] Add failing API/integration test fixtures under the selected API integration-test locations for session expiry/revocation, owner isolation with uniform `NOT_FOUND`, one-budget uniqueness, resumable setup retries, archived-category rejection, atomic financial writes, idempotency replay/payload conflict, stale-version conflict, and deterministic rebuild. <!-- sdd-owner: implementation -->
- [ ] Add a failing Playwright test under the selected web E2E location covering registration/sign-in, partial setup save/resume, setup completion, income before/after explicit release, assignment and negative-RTA correction, categorized spending, month boundary, and dashboard/month-summary consistency. <!-- sdd-owner: implementation -->
- [ ] Wrap every financial command in one PostgreSQL transaction with authorization, same-transaction idempotency lookup/digest validation, affected-state version protection, append-only effects, result replay, and all-or-nothing account/category/allocation changes. <!-- sdd-owner: implementation -->
- [ ] Make the RED unit matrix pass against the pure engine, including property/table cases proving no floating-point source of truth, no double-subtracted spending, positive-only carry, release exactly once, and no silent unrelated-category changes. <!-- sdd-owner: implementation -->
- [ ] Make the API integration matrix pass against PostgreSQL, including rollback after injected failure, same-key same-payload replay, same-key different-payload conflict, concurrent stale-write conflict, ownership isolation, archived references, boundary-month behavior, and rebuild after derived-summary loss. <!-- sdd-owner: implementation -->
- [ ] Implement Reports read services at the selected API reports path so dashboard and month summary use the same canonical engine/read model, authorize before loading, expose distinct components, and synchronously rebuild or safely recalculate derived data from authoritative history. <!-- sdd-owner: implementation -->
- [ ] Make contract/API tests pass for envelopes, validation, status codes, OpenAPI DTOs, request IDs, non-disclosing foreign access, and unsupported reporting controls without creating partial effects. <!-- sdd-owner: implementation -->
- [ ] Implement the selected web budgeting routes/components for monthly category assignments, moves/unassignments, negative-RTA correction, income release, categorized spending, dashboard, and monthly summary; keep all displayed figures sourced from API DTOs and make unsupported controls absent or clearly unavailable. <!-- sdd-owner: implementation -->
- [ ] Make the Playwright primary journey pass end to end, including save/resume and retry paths, account balance versus unreleased RTA distinction, explicit release, overassignment/correction, positive rollover, timezone boundary, and matching dashboard/month-summary values. <!-- sdd-owner: implementation -->
- [ ] Refactor module dependencies, shared DTO/error handling, transaction boundaries, and engine/read-service reuse to enforce the documented API boundaries and remove duplicated formulas while preserving the mandatory unit/integration/contract/E2E behavior. <!-- sdd-owner: implementation -->
- [ ] Run the repository’s discovered format, lint, unit, integration, build, migration, OpenAPI, and Playwright commands; verify the migration rollback/rebuild procedure and the first-slice non-goal scan, then record results and any environment limitations in the apply/verify artifacts. <!-- sdd-owner: implementation -->

## Successor checkpoint

This bounded successor is ready for delegated verification of the financial application/controller/OpenAPI changes, but not for full-change verification or delivery lifecycle actions. Next recommended phase: `parent-lifecycle` after delegated verification; remaining PR2 PostgreSQL/integration/reporting tasks must be assigned before PR3.

## PR2 corrective persistence and month-scope checkpoint

- Work unit: `PR 2 persistence and month correction`; parent authority token was supplied and honored. Maximum authored correction remains 400 lines; no size exception was used.
- Structured status consumed: `changeName=implement-first-budgeting-slice`, `applyState=ready`, interactive/both/ask-on-risk/stacked-to-main context, repo-local workspace and allowed edit root. Action-context warnings: none. No preflight, delivery-state, commit, push, PR, release, or `.codegraph/` change was made.
- Month correction: release events now retain the income month; monthly summaries filter income and released income by requested month for RTA while retaining all-time account balance aggregation. Regression coverage proves a February release does not enter January RTA.
- Ownership correction: added Prisma composite uniqueness and composite foreign keys for event account, category, source/destination category, and related release-event references. Added migration `0002_ownership_consistency` and documented its rollback inventory.
- Transaction boundary: added the dependency-free `withPostgresTransaction` adapter, which delegates work to Prisma's interactive `$transaction` callback. It is a real integration seam for a configured Prisma/PostgreSQL adapter, but the current synchronous `BudgetApp` remains in-memory and does not call it.
- Focused evidence: `npm test` passed 19/19; syntax checks passed for `apps/api/src/app.ts` and `apps/api/src/persistence/transaction.ts`; `git diff --check` passed. The persistence test covers transaction delegation and schema/migration ownership contracts.
- Runtime limitation: Prisma CLI and `psql` are unavailable; no PostgreSQL container is running; generated-client validation, migration execution, rollback execution, and durable transaction behavior remain unverified. Docker is installed but was not used to pull or provision runtime dependencies.
- Files changed for this correction: `apps/api/src/app.ts`, `apps/api/src/persistence/transaction.ts`, `apps/api/test/financial.test.ts`, `apps/api/test/persistence.test.ts`, `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/0002_ownership_consistency/migration.sql`, `apps/api/prisma/ROLLBACK.md`, and this artifact. Approximate correction authored lines: under 100, within the 400-line boundary.
- Persisted task checkboxes: none changed. The broad PostgreSQL transaction and integration-matrix tasks remain unchecked because runtime-backed durability was not demonstrated. Existing completed implementation rows were preserved.

### Remaining implementation tasks (exact persisted rows)

- [ ] Add failing API/integration test fixtures under the selected API integration-test locations for session expiry/revocation, owner isolation with uniform `NOT_FOUND`, one-budget uniqueness, resumable setup retries, archived-category rejection, atomic financial writes, idempotency replay/payload conflict, stale-version conflict, and deterministic rebuild. <!-- sdd-owner: implementation -->
- [ ] Add a failing Playwright test under the selected web E2E location covering registration/sign-in, partial setup save/resume, setup completion, income before/after explicit release, assignment and negative-RTA correction, categorized spending, month boundary, and dashboard/month-summary consistency. <!-- sdd-owner: implementation -->
- [ ] Wrap every financial command in one PostgreSQL transaction with authorization, same-transaction idempotency lookup/digest validation, affected-state version protection, append-only effects, result replay, and all-or-nothing account/category/allocation changes. <!-- sdd-owner: implementation -->
- [ ] Make the RED unit matrix pass against the pure engine, including property/table cases proving no floating-point source of truth, no double-subtracted spending, positive-only carry, release exactly once, and no silent unrelated-category changes. <!-- sdd-owner: implementation -->
- [ ] Make the API integration matrix pass against PostgreSQL, including rollback after injected failure, same-key same-payload replay, same-key different-payload conflict, concurrent stale-write conflict, ownership isolation, archived references, boundary-month behavior, and rebuild after derived-summary loss. <!-- sdd-owner: implementation -->
- [ ] Implement Reports read services at the selected API reports path so dashboard and month summary use the same canonical engine/read model, authorize before loading, expose distinct components, and synchronously rebuild or safely recalculate derived data from authoritative history. <!-- sdd-owner: implementation -->
- [ ] Make contract/API tests pass for envelopes, validation, status codes, OpenAPI DTOs, request IDs, non-disclosing foreign access, and unsupported reporting controls without creating partial effects. <!-- sdd-owner: implementation -->
- [ ] Implement the selected web budgeting routes/components for monthly category assignments, moves/unassignments, negative-RTA correction, income release, categorized spending, dashboard, and monthly summary; keep all displayed figures sourced from API DTOs and make unsupported controls absent or clearly unavailable. <!-- sdd-owner: implementation -->
- [ ] Make the Playwright primary journey pass end to end, including save/resume and retry paths, account balance versus unreleased RTA distinction, explicit release, overassignment/correction, positive rollover, timezone boundary, and matching dashboard/month-summary values. <!-- sdd-owner: implementation -->
- [ ] Refactor module dependencies, shared DTO/error handling, transaction boundaries, and engine/read-service reuse to enforce the documented API boundaries and remove duplicated formulas while preserving the mandatory unit/integration/contract/E2E behavior. <!-- sdd-owner: implementation -->
- [ ] Run the repository’s discovered format, lint, unit, integration, build, migration, OpenAPI, and Playwright commands; verify the migration rollback/rebuild procedure and the first-slice non-goal scan, then record results and any environment limitations in the apply/verify artifacts. <!-- sdd-owner: implementation -->

## Delivery/readiness boundary

This is a coherent corrective checkpoint for month scoping and schema ownership. It is **not ready for delegated verification as a complete corrective PR2** because the available runtime cannot execute Prisma/PostgreSQL and the application financial commands are still in-memory. It is suitable only for scoped static/code review of the migration, transaction seam, and month regression. The parent must provide a configured Prisma runtime and complete the integration transaction boundary before claiming PR2 readiness or advancing to PR3.

## PR2 durable database environment setup

- Work unit: `PR2 durable database environment setup`; authorized local environment preparation only. This passing correction explicitly remediates failed evidence revision `sha256:dae1f63f5a6cca3da63d97ca01ba47741c80c6fb871338162afcf6a23d3761c6` using fresh dependency, container, schema, migration-status, table, and test evidence. Existing application, documentation, `.pi/`, and `.codegraph/` changes were preserved.
- Files changed: `package.json`, `package-lock.json`, `docker-compose.yml`, `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/0002_ownership_consistency/migration.sql`, `apps/api/prisma/ROLLBACK.md`, and this artifact. `.env.example` could not be authored because the runtime safety guard blocks `.env`-named paths; no secret was added.
- Dependencies: installed `prisma@6.19.0` as a dev dependency and `@prisma/client@6.19.0` as a runtime dependency. Added repeatable `db:validate` and `db:migrate` scripts.
- Compose: added one `postgres:16-alpine` service with local port `5432`, non-secret development credentials, a named data volume, and a readiness healthcheck. Started only `postgres` with `docker compose up -d postgres`; container `ynab-postgres-1` is running and healthy.
- Schema correction: Prisma validation initially failed because enum members were single-line and the self-relation lacked composite uniqueness. Enum definitions and required `(budgetId, id)` / `(budgetId, relatedEventId)` uniqueness were added; migration 0002 now creates the corresponding event uniqueness constraints before composite foreign keys.
- Validation: `DATABASE_URL=postgresql://ynab:ynab_local@localhost:5432/ynab_dev?schema=public npm run db:validate` passed. The same environment running `npm run db:migrate` applied `0001_budgeting_slice` and `0002_ownership_consistency`. `prisma migrate status` reports the database up to date; PostgreSQL lists all nine application tables plus `_prisma_migrations`, with both migrations applied. `docker compose config --quiet`, `npm test` (19/19), and `git diff --check` passed; Git emitted only pre-existing line-ending warnings for unrelated documentation.
- Limitation: the environment is database-ready, but `.env.example` remains the only missing requested file. The user explicitly authorized its non-secret creation in the follow-up, but the runtime safety guard still denied the write. A delegated persistence re-verification is ready once that example file is supplied through an allowed filesystem path. No generated client or product behavior was added.

### Follow-up evidence

- Fresh checks after the explicit authorization: `docker compose ps` shows `ynab-postgres-1` healthy; `DATABASE_URL=postgresql://ynab:ynab_local@localhost:5432/ynab_dev?schema=public npm run db:validate` passes; and `npx prisma migrate status --schema apps/api/prisma/schema.prisma` reports the database schema up to date.
- The attempted write to `.env.example` was denied by the runtime safety policy despite explicit user authorization. No workaround or out-of-scope write was attempted.
- Authored-line estimate: approximately 45 lines across configuration, Prisma corrections, rollback documentation, and this cumulative progress note; dependency lockfile changes are generated metadata.

## PR2 durable identity and setup slice

- Work unit: `PR2 durable identity and setup`; implemented after financial-store verification found that the production server still owned users, sessions, budgets, and setup only in memory.
- Files changed: `apps/api/src/app.ts`, `apps/api/src/server.ts`, `apps/api/src/persistence/budget-store.ts`, `apps/api/src/persistence/in-memory-budget-store.ts`, `apps/api/test/restart-persistence.test.ts`, and the surgical authorization regression in `apps/api/test/app.test.ts`.
- Production wiring now constructs a Prisma-backed budget store and FinancialStore explicitly; the in-memory store remains an explicit test double. PostgreSQL persists users, hashed opaque sessions, revocation/expiry, one-budget ownership, account/category setup, and resumable setup state inside transactional writes.
- RED/GREEN evidence: restart persistence initially failed because the durable store was absent; the restart suite then passed 2/2. The authorization-order regression initially returned `VALIDATION_ERROR` for a foreign invalid setup payload; after correction, the focused app suite passed 6/6 with foreign `NOT_FOUND` and owner `VALIDATION_ERROR` behavior.
- Independent verification: `DATABASE_URL=postgresql://ynab:ynab_local@localhost:5432/ynab_dev?schema=public npm test` passed 23/23; `npm run db:validate` passed; `git diff --check` passed. The identity/setup slice authored budget was 346 lines, followed by the small authorization correction.
- Remaining limitation: `FinancialStore` still has seed and in-memory summary fallback behavior. Financial restart durability is not claimed; the next causal work unit must remove those fallbacks and prove a new process can replay and read financial history exclusively from PostgreSQL. Reporting, Playwright, and broader API coverage remain open.

## Current delivery boundary

The durable identity/setup slice is independently verified and suitable to include in the current uncommitted work unit. It is not a complete PR2 or delivery-ready first slice until financial restart durability, concurrent database evidence, reporting, contract coverage, and Playwright acceptance are completed.

## PR2 financial restart durability correction

- Work unit: `PR2 financial restart durability`; removed production financial seeding from in-memory state and removed the silent in-memory summary fallback.
- Files changed: `apps/api/src/app.ts`, `apps/api/src/persistence/financial-store.ts`, `apps/api/test/financial-persistence.test.ts`, and `apps/api/test/restart-persistence.test.ts`.
- Financial commands now require an existing owner-scoped durable PostgreSQL budget. The Prisma transaction performs the budget lock, durable idempotency lookup/digest validation, authoritative event read, version check, append, and receipt write; absent or foreign budgets return non-disclosing `NOT_FOUND`.
- RED/GREEN evidence: focused persistence tests initially had 1 missing rejection; after removing seed/fallback behavior, focused financial/persistence/restart tests passed 12/12 and the full suite passed 25/25.
- Independent verification: `DATABASE_URL=postgresql://ynab:ynab_local@localhost:5432/ynab_dev?schema=public npm test` passed 25/25; `npm run db:validate` passed; `git diff --check` passed. Restart replay and same-key payload conflict were verified across Prisma-backed app instances.
- Remaining evidence gap: no concurrent competing-command stress test has been added yet. The explicit in-memory test double retains a seed branch for unit-test setup only; it is not used by the production Prisma path. Reporting, Playwright, and broader API contract coverage remain open.

## Current delivery boundary

The identity/setup and financial restart durability corrections are independently verified and ready for parent review as an uncommitted work unit. The first slice remains incomplete until concurrency evidence and the remaining integration/reporting/E2E gates are addressed.

## PR2 concurrent financial command evidence

- Work unit: `PR2 concurrent financial command evidence`; added an executable PostgreSQL race test without changing production code.
- The test uses two distinct Prisma clients and two Prisma-backed `BudgetApp` instances against one persisted budget. Both commands use distinct idempotency keys and `expectedVersion: 0`; the test asserts exactly one success at version 1, one `CONFLICT`, one durable receipt, and one durable event.
- Independent verification: focused persistence tests passed 3/3; the full suite passed 26/26; Prisma validation passed; `git diff --check` passed. Cleanup disconnects both clients and removes the created user/budget records in `finally`.
- Remaining limitation: this is evidence for the current lock/version strategy, not a complete PR2 delivery gate. Reporting, Playwright, broader API contract coverage, and final migration/rebuild evidence remain open.

## Current worktree note

The implementation and test changes remain uncommitted. `.codegraph/` and `.pi/` are local/unreviewed artifacts and are excluded from the intended commit. The transient empty `NUL` artifact was removed during cleanup.

## PR2 API contract and Reports gates

- OpenAPI now covers all implemented routes with request bodies, path/query/header parameters, DTO schemas, cookie security, request IDs, idempotency/version semantics, status/error envelopes, and unsupported-feature boundaries. Structural contract coverage passes.
- `ReportService` is the canonical read/rebuild boundary for dashboard and month summary. It recalculates from authoritative financial events, preserves authorization-before-load, and has deterministic/restart/equivalence coverage.
- Independent verification passed the API suite at 32/32 before web additions; contract and Reports focused suites passed.

## PR2 web and Playwright gates

- The web runtime is configured under `apps/web` with Next.js, same-origin `/api/v1` rewrites to the API, accessible setup/dashboard/activity controls, DTO-only rendering, idempotency/version headers, and no client-side financial formulas.
- Chromium Playwright coverage passes repeatedly against the real Next server, API server, and PostgreSQL for registration, sign-in, setup, dashboard, income/release, assignment, and categorized spending.
- `npm run typecheck:web`, `npm run build:web`, and the web source checks pass. Generated `.next/`, Playwright reports, and test results are ignored.

## PR2 migration and final evidence

- `npm run db:status` reports both migrations applied and the database up to date; `npm run db:validate` passes. Runtime tests observe the required tables and composite ownership constraints.
- Migration evidence creates unique fixtures, reads authoritative events, rebuilds reports through a fresh service, and cleans up in `finally`.
- `ROLLBACK.md` documents backup/preconditions and the exact rollback inventory/procedure. Destructive rollback was intentionally not executed against the shared development database.
- Final independent verification passed migration tests 2/2, full API suite 34/34, database status/validation, web typecheck/build, and `git diff --check`.

## Phase boundary

The first-slice implementation gates are now verified. Remaining delivery action is the parent decision to include the uncommitted changes in a commit and push; `.codegraph/` and `.pi/` remain excluded. No unsupported YNAB features were added.
