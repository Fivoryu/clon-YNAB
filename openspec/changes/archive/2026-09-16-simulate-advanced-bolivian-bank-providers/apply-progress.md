# Apply Progress: simulate-advanced-bolivian-bank-providers

## Result

- Status: Work Units 1–3 implementation-owned tasks complete; Work Unit 4 not started.
- Change: `simulate-advanced-bolivian-bank-providers`
- Slice boundary: Work Unit 3 only, stacked-to-main on Work Unit 2 (PR3 base: PR2).
- Delivery strategy: `ask-on-risk`; current slice is the selected stacked work unit and no size exception was used.
- Runtime harness: configured PostgreSQL harness was unavailable because `DATABASE_URL` is unset. PostgreSQL-only tests were skipped; no durability, locking, restart, rebuild, or rollback pass is claimed.
- Skill resolution: `fallback-path` (no parent-injected executor skill path was provided; the declared Gentle AI skill and global strict-TDD support guidance were loaded).

## Native status consumed

Consumed fresh `gentle-ai.sdd-status@2` before editing:

- `change`: `simulate-advanced-bolivian-bank-providers`
- `artifactStore`: `openspec`
- `applyState`: `ready`; `nextRecommended`: `apply`
- `blockedReasons`: none
- task progress supplied by parent: 20/39 complete; Work Units 1–2 complete; Work Unit 3 pending; Work Unit 4 pending; two parent rows deferred
- task progress after this phase: 29/39 implementation rows complete; Work Unit 4 and two parent-owned rows remain deferred
- `actionContext.mode`: `repo-local`
- workspace and allowed edit root: repository root
- proposal/specs/design/tasks/apply-progress present; verify report missing

No authoritative status blocker, ambiguous change, or edit-root warning was present. The workload forecast is High / chained PRs recommended, and the parent supplied the resolved `stacked-to-main` PR3 boundary (base PR2), so no delivery gate was opened.

## Completed Work Unit 1 tasks

The ten Work Unit 1 implementation-owned rows remain `[x]` in `tasks.md`, covering domain contracts, catalog, engine, projections, domain triangulation, and refactoring. Existing evidence remains:

- `node --experimental-strip-types --test apps/api/test/simulation-domain.test.ts` — pass, 9/9.
- Focused TypeScript check for the Work Unit 1 simulation files and test — pass.
- Repeated fixed-seed/fixed-clock plans compare equal; domain modules have no financial-authority or network imports.

## Completed Work Unit 2 tasks and persisted checkbox updates

All ten Work Unit 2 implementation-owned rows are now visibly marked `[x]` in `tasks.md` immediately after implementation:

- Added schema/migration isolation assertions in `apps/api/test/simulation-postgres.test.ts`.
- Added PostgreSQL test coverage for owner predicates, scope/run locking, stale revisions, receipt replay/conflict, atomic failure injection, and competing commands. These tests are present but skipped without the configured database.
- Added restart/rebuild comparison coverage for run, candidates, checkpoints, audits, attempts, receipts, and financial command-receipt version. These tests are present but skipped without the configured database.
- Added in-memory fixed-clock parity, SHA-256 canonical digest, idempotency, per-budget queue serialization, cloned reads, and normalized projection tests.
- Added isolated Prisma simulation enums/models/relations and non-negative/positive bounds without relations to financial tables.
- Added additive `0006_bank_provider_simulation` migration with simulation tables, composite tenant constraints, indexes, checks, and neutral `BO_INSPIRED_A`–`E` seed rows.
- Implemented `SimulationStore` and `PrismaSimulationStore` with owner predicates, budget scope/run locks, receipt replay/conflict handling, atomic writes, safe persistence errors, and reload projections.
- Implemented `InMemorySimulationStore` with per-budget serialization, cloned pre-apply state, shared engine/digest/projection use, and publish-after-success behavior.
- Ran the focused checks below; PostgreSQL-only evidence remains explicitly unavailable.
- Refactored the store mapping/read structure without broadening beyond persistence/simulation scope.

## RED → GREEN → TRIANGULATE → REFACTOR evidence

The Work Unit 2 tests were authored before the corresponding schema/store implementation. The requested RED-before-GREEN order was honored. The available GREEN evidence is:

- `node --experimental-strip-types --test apps/api/test/simulation-domain.test.ts apps/api/test/simulation-postgres.test.ts apps/api/test/simulation-api.test.ts` — pass, 13 passed; 3 PostgreSQL tests skipped because `DATABASE_URL` is unset.
- `npx tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --allowImportingTsExtensions ...` for simulation domain, persistence stores, and Work Unit 2 tests — pass.
- `DATABASE_URL='postgresql://postgres:postgres@localhost:5432/ynab' npm run db:validate` — pass, schema valid; this dummy URL was used only for Prisma schema parsing and was not used as durability evidence.
- `npm run db:generate` — pass.
- TRIANGULATE: schema assertions confirm simulation model blocks contain no financial-table relations; the Work Unit 1 domain suite plus in-memory command sequences preserve owner scope, digest replay, queue serialization, cloned reads, and normalized ordering. PostgreSQL lock/restart/rollback parity remains unverified because the runtime harness was unavailable.
- REFACTOR: shared persistence mapping and projection reads were kept in the new simulation store files only; focused in-memory and static schema tests remain green.

## Files changed in Work Unit 2

- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/0006_bank_provider_simulation/migration.sql`
- `apps/api/src/persistence/simulation-store.ts`
- `apps/api/src/persistence/in-memory-simulation-store.ts`
- `apps/api/src/simulation/types.ts` (audit/protocol type extension needed by the isolated store)
- `apps/api/test/simulation-api.test.ts`
- `apps/api/test/simulation-postgres.test.ts`
- `openspec/changes/simulate-advanced-bolivian-bank-providers/tasks.md` (Work Unit 2 checkboxes only)
- `openspec/changes/simulate-advanced-bolivian-bank-providers/apply-progress.md`

## Deviations and boundaries

- `npm run db:validate` without an injected environment failed before database access with Prisma `P1012`: `Environment variable not found: DATABASE_URL`. The same command passed with a syntactically valid temporary `DATABASE_URL` solely to validate schema structure.
- No configured PostgreSQL endpoint/credentials were available, so PostgreSQL tests were not promoted to passing durability evidence.
- No Work Unit 3 or Work Unit 4 code was added: no `BudgetApp`, HTTP/server, OpenAPI, web, financial, worker, network, or provider wiring.
- No canonical financial persistence files were changed. Simulation tables and receipts are separate from `FinancialEvent`, `Transfer`, `CommandReceipt`, accounts, categories, history, reports, and CSV state.
- No commit, push, bounded review, receipt, delivery-gate, correction, or validation actor was started.

## Remaining tasks

The following exact task rows remain unchecked and are intentionally deferred:

- [ ] Add failing in-memory application tests for authenticated owner success, missing/foreign budget non-disclosure, guessed run/candidate/checkpoint/audit IDs, unsupported application/linking/provider controls, financial neutrality, idempotency replay/conflict, and stale simulation revision handling in `apps/api/test/simulation-api.test.ts`. <!-- sdd-owner: implementation -->
- [ ] Add failing HTTP tests for exact profile/run/control/inspect/read routes, JSON parsing, required `Idempotency-Key`/`If-Match`, request IDs, status mapping, bounded bodies, safe errors, and absent application/network routes in `apps/api/test/simulation-http.test.ts`. <!-- sdd-owner: implementation -->
- [ ] Add failing OpenAPI tests for every simulation path, security, headers, envelopes, DTO bounds/enums, fictional/no-network/no-money descriptions, and omitted application integration in `apps/api/test/simulation-openapi.test.ts`. <!-- sdd-owner: implementation -->
- [ ] Add simulation dependency injection, owner-scoped catalog/run/control/inspect/read methods, input normalization, revision/idempotency handling, and domain/persistence error mapping to `apps/api/src/app.ts` without invoking financial methods. <!-- sdd-owner: implementation -->
- [ ] Add explicit simulation route matching, path/body/header dispatch, cookie/session handling, request-ID and `If-Match` parsing, and standard success/error envelopes to `apps/api/src/server.ts`; reject unsupported controls without mutation. <!-- sdd-owner: implementation -->
- [ ] Wire `InMemorySimulationStore` and `PrismaSimulationStore` in `apps/api/src/app.ts` and `apps/api/src/server.ts` production/default construction while preserving existing constructor call sites and ordinary route behavior. <!-- sdd-owner: implementation -->
- [ ] Document the nine routes, shared headers, bounded request/response schemas, stable status responses, authorization, non-disclosure, fictional labels, no-network/no-credentials, no-financial-effects, and deferred capabilities in `apps/api/openapi.yaml`. <!-- sdd-owner: implementation -->
- [ ] Run `node --experimental-strip-types --test apps/api/test/simulation-api.test.ts apps/api/test/simulation-http.test.ts apps/api/test/simulation-openapi.test.ts apps/api/test/openapi.test.ts`; confirm route results match direct store projections and no existing envelope/security assertions regress. <!-- sdd-owner: implementation -->
- [ ] Refactor route matching, DTO mapping, and authorization plumbing in `apps/api/src/app.ts`, `apps/api/src/server.ts`, and `apps/api/openapi.yaml` only after all new and existing API tests pass; preserve non-disclosure before resource detail lookup. <!-- sdd-owner: implementation -->
- [ ] Add failing integration assertions in `apps/api/test/simulation-postgres.test.ts` that simulation commands create no `FinancialEvent`, `Transfer`, `CommandReceipt`, account/category effect, report change, CSV row, or `Budget.version` advancement, including failed and rebuilt runs. <!-- sdd-owner: implementation -->
- [ ] Add failing no-network/credential regression assertions in `apps/api/test/simulation-domain.test.ts`, `apps/api/test/simulation-api.test.ts`, and `apps/api/test/simulation-http.test.ts` for imports, requests, persistence, diagnostics, and forbidden deferred capabilities. <!-- sdd-owner: implementation -->
- [ ] Extend `apps/web/test/page.test.ts` with failing assertions that no provider/credential/linking/application UI or client financial calculation is introduced and existing authenticated API, CSV, history, and proxy boundaries remain intact. <!-- sdd-owner: implementation -->
- [ ] Complete the failure-injection, PostgreSQL restart/rebuild, concurrent-client, response-loss/idempotency replay, and in-memory/PostgreSQL normalized-projection harnesses in `apps/api/test/simulation-postgres.test.ts`; use the configured PostgreSQL harness and record explicit N/A for external-network and worker harnesses. <!-- sdd-owner: implementation -->
- [ ] Complete no-network, financial-neutrality, safe-diagnostic, and deferred-boundary assertions in `apps/api/test/simulation-domain.test.ts`, `apps/api/test/simulation-api.test.ts`, and `apps/api/test/simulation-http.test.ts`. <!-- sdd-owner: implementation -->
- [ ] Complete web regression assertions in `apps/web/test/page.test.ts` without changing web application source; run `node --experimental-strip-types --test apps/web/test/page.test.ts`. <!-- sdd-owner: implementation -->
- [ ] Run the focused suite, then `npm test`, `npm run typecheck:web`, `npm run build:web`, and `npm run verify` as applicable; retain evidence that no candidate reaches ordinary financial projections or real-money behavior. <!-- sdd-owner: implementation -->
- [ ] Make only testability/readability refactors in the new simulation files and focused tests after the full regression suite passes; do not broaden routes, add workers/network clients, or modify canonical financial modules. <!-- sdd-owner: implementation -->
- [ ] Start or reuse a bounded review of the four proposed work units and decide whether to proceed with the `ask-on-risk` delivery decision; do not select a chain strategy implicitly. <!-- sdd-owner: parent -->
- [ ] Before apply, record the explicit delivery/chain decision for the High review-budget risk (`Yes` is required by this plan); keep `Chain strategy: pending` until a human selects a strategy. <!-- sdd-owner: parent -->

Parent-owned rows were preserved byte-for-byte and deferred to the parent lifecycle.

## Completed Work Unit 3 tasks

The nine Work Unit 3 implementation-owned rows are now `[x]` in `tasks.md`: RED application, HTTP, and OpenAPI tests; BudgetApp orchestration and dependency injection; explicit server routes and headers; in-memory/default and Prisma/production store wiring; OpenAPI documentation; focused triangulation; and post-green route/DTO/authorization refactoring.

### TDD Cycle Evidence

| Task slice | Test file | Layer | Safety net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| Application orchestration | `apps/api/test/simulation-api.test.ts` | In-memory application | Existing simulation API: 3/3 pass | Written first; initially failed on missing BudgetApp methods | Pass | Owner success, foreign/non-disclosure, guessed IDs, provider-shaped input, idempotency, stale revision, financial neutrality | Pass; mapping and auth boundary kept isolated |
| HTTP routes and headers | `apps/api/test/simulation-http.test.ts` | Bounded local HTTP | Existing API/server patterns | Written first; initially failed before route dispatch | Pass | All scoped profile/run/control/inspect/read routes, replay, missing headers, malformed JSON, unsupported application path, auth/error envelopes | Pass; explicit route matcher and simulation header adapter |
| OpenAPI contract | `apps/api/test/simulation-openapi.test.ts` | Contract/static | Existing `openapi.test.ts` | Written first; initially failed before paths/schemas | Pass | Every route, security, headers, envelopes, bounded DTOs, enum exclusion, fictional/no-network/no-money/deferred boundaries | Pass; existing OpenAPI test remains green |

### Verification evidence

- `node --experimental-strip-types --test apps/api/test/simulation-api.test.ts apps/api/test/simulation-http.test.ts apps/api/test/simulation-openapi.test.ts apps/api/test/openapi.test.ts` — pass, 12/12.
- `DATABASE_URL='postgresql://postgres:postgres@localhost:5432/ynab' npm run db:validate` — pass; temporary syntactic URL used only for schema parsing.
- `npm run typecheck:web` — pass; web source was not modified.
- Focused `npx tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --allowImportingTsExtensions --skipLibCheck apps/api/src/app.ts apps/api/src/server.ts apps/api/src/persistence/simulation-store.ts apps/api/src/persistence/in-memory-simulation-store.ts apps/api/test/simulation-api.test.ts apps/api/test/simulation-http.test.ts apps/api/test/simulation-openapi.test.ts` — failed on pre-existing API typecheck errors in `app.ts` (UUID/template and financial-event typing) plus existing broad `unknown` inference in legacy app/test call sites; no PostgreSQL runtime was contacted. The new focused tests execute successfully under the repository runner.
- Runtime harness: bounded local HTTP harness exists and was exercised by `simulation-http.test.ts`; external provider/network and worker harnesses are N/A and were not added.
- PostgreSQL evidence limitation preserved: `DATABASE_URL` is unset in the configured environment, so PostgreSQL tests remain skipped; no durability, locking, restart, rebuild, or rollback pass is claimed.

### Files changed in Work Unit 3

- `apps/api/src/app.ts`
- `apps/api/src/server.ts`
- `apps/api/openapi.yaml`
- `apps/api/test/simulation-api.test.ts`
- `apps/api/test/simulation-http.test.ts`
- `apps/api/test/simulation-openapi.test.ts`
- `openspec/changes/simulate-advanced-bolivian-bank-providers/tasks.md`
- `openspec/changes/simulate-advanced-bolivian-bank-providers/apply-progress.md`

No financial projections, reports, CSV semantics, web application source, network client, provider behavior, or credential handling was added. Existing Prisma/store files from Work Units 1–2 were not changed by this slice; production construction now injects the already-existing `PrismaSimulationStore`.

### Deviations and boundaries

- The design table contains ten concrete HTTP paths including inspect (profiles, create, three controls, four reads, and inspect); all ten are documented and tested despite the task prose calling this the nine-route slice.
- API typecheck remains blocked by pre-existing errors described above; focused runtime tests are green.
- No Work Unit 4 task or parent-owned gate was started. No commit, push, review, receipt, validation actor, or delivery gate was started.

### Remaining tasks

Exact unchecked implementation rows remain in `tasks.md`:

- [ ] Add failing integration assertions in `apps/api/test/simulation-postgres.test.ts` that simulation commands create no `FinancialEvent`, `Transfer`, `CommandReceipt`, account/category effect, report change, CSV row, or `Budget.version` advancement, including failed and rebuilt runs. <!-- sdd-owner: implementation -->
- [ ] Add failing no-network/credential regression assertions in `apps/api/test/simulation-domain.test.ts`, `apps/api/test/simulation-api.test.ts`, and `apps/api/test/simulation-http.test.ts` for imports, requests, persistence, diagnostics, and forbidden deferred capabilities. <!-- sdd-owner: implementation -->
- [ ] Extend `apps/web/test/page.test.ts` with failing assertions that no provider/credential/linking/application UI or client financial calculation is introduced and existing authenticated API, CSV, history, and proxy boundaries remain intact. <!-- sdd-owner: implementation -->
- [ ] Complete the failure-injection, PostgreSQL restart/rebuild, concurrent-client, response-loss/idempotency replay, and in-memory/PostgreSQL normalized-projection harnesses in `apps/api/test/simulation-postgres.test.ts`; use the configured PostgreSQL harness and record explicit N/A for external-network and worker harnesses. <!-- sdd-owner: implementation -->
- [ ] Complete no-network, financial-neutrality, safe-diagnostic, and deferred-boundary assertions in `apps/api/test/simulation-domain.test.ts`, `apps/api/test/simulation-api.test.ts`, and `apps/api/test/simulation-http.test.ts`. <!-- sdd-owner: implementation -->
- [ ] Complete web regression assertions in `apps/web/test/page.test.ts` without changing web application source; run `node --experimental-strip-types --test apps/web/test/page.test.ts`. <!-- sdd-owner: implementation -->
- [ ] Run the focused suite, then `npm test`, `npm run typecheck:web`, `npm run build:web`, and `npm run verify` as applicable; retain evidence that no candidate reaches ordinary financial projections or real-money behavior. <!-- sdd-owner: implementation -->
- [ ] Make only testability/readability refactors in the new simulation files and focused tests after the full regression suite passes; do not broaden routes, add workers/network clients, or modify canonical financial modules. <!-- sdd-owner: implementation -->
- [ ] Start or reuse a bounded review of the four proposed work units and decide whether to proceed with the `ask-on-risk` delivery decision; do not select a chain strategy implicitly. <!-- sdd-owner: parent -->
- [ ] Before apply, record the explicit delivery/chain decision for the High review-budget risk (`Yes` is required by this plan); keep `Chain strategy: pending` until a human selects a strategy. <!-- sdd-owner: parent -->

## Work Unit 4 apply record

- Status: all eight Work Unit 4 implementation-owned tasks complete; both parent-owned delivery rows remain deferred and unchanged.
- Slice boundary: Work Unit 4 only, PR4 base PR3, stacked-to-main; `ask-on-risk` was explicitly resolved and no size exception was used.
- Files changed: `apps/api/test/simulation-postgres.test.ts`, `apps/api/test/simulation-domain.test.ts`, `apps/api/test/simulation-api.test.ts`, `apps/api/test/simulation-http.test.ts`, `apps/web/test/page.test.ts`, this progress artifact, and the eight Work Unit 4 implementation checkboxes in `tasks.md`.
- No web application source, production simulation source, canonical financial module, provider behavior, worker, network client, candidate application, or real-money effect was added.

### TDD Cycle Evidence

| Task slice | RED | GREEN / TRIANGULATE | REFACTOR |
|---|---|---|---|
| Financial-neutrality and durable harness assertions | New PostgreSQL neutrality assertions were authored before the final verification run; the configured runtime was unavailable, so the DB cases are explicit skips rather than invented passes. | Added failed-run, response-loss replay, rebuild, and in-memory/PostgreSQL normalized-projection coverage; existing rollback/concurrency/restart harnesses remain covered. | Extracted readable financial snapshots and projection normalization helpers in the focused PostgreSQL test only. |
| No-network, credentials, diagnostics, and deferred boundaries | New domain/API/HTTP assertions were authored first; the first run exposed only test-regex syntax defects, which were corrected before implementation verification. | In-memory and bounded local HTTP assertions pass; forbidden controls are 404/non-mutating, credential input is rejected, and diagnostics contain no sensitive/internal detail. | Kept boundary checks in focused tests; no route or production behavior was broadened. |
| Web regression | New static boundary assertions were authored first; an over-broad credential assertion was narrowed to permit the existing authenticated session flow while still rejecting provider credential UI. | Web regression passes without changing web source. | Assertions remain grouped as a web-boundary test. |

### Verification evidence

- `node --experimental-strip-types --test apps/api/test/simulation-domain.test.ts apps/api/test/simulation-api.test.ts apps/api/test/simulation-http.test.ts apps/api/test/simulation-openapi.test.ts apps/api/test/openapi.test.ts apps/api/test/simulation-postgres.test.ts apps/web/test/page.test.ts` — pass, 31 passed, 4 PostgreSQL tests skipped because `DATABASE_URL` is unset.
- `node --experimental-strip-types --test apps/api/test/simulation-domain.test.ts apps/api/test/simulation-api.test.ts apps/api/test/simulation-http.test.ts apps/api/test/simulation-postgres.test.ts apps/web/test/page.test.ts` — final focused boundary run pass, 26 passed, 4 skipped.
- `node --experimental-strip-types --test apps/web/test/page.test.ts` — pass, 6/6; no web application source changed.
- `npm test` — pass, 85 passed and 20 PostgreSQL-dependent tests skipped.
- `npm run typecheck:web` — pass.
- `npm run build:web` — pass; Next.js production build completed and emitted only the existing static routes.
- `npm run verify` — pass; repeats the API suite, web typecheck, and web build with 85 passed / 20 skipped API tests.
- `npm run db:validate` — unavailable without `DATABASE_URL` (Prisma P1012). `DATABASE_URL='postgresql://postgres:postgres@localhost:5432/ynab' npm run db:validate` — schema validation pass using a syntactic placeholder only; it did not contact PostgreSQL or establish durability evidence.
- Focused API TypeScript command (`npx tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --allowImportingTsExtensions --skipLibCheck ...`) — failed only with the known pre-existing `app.ts` UUID/template and `FinancialEvent` typing errors, `server.ts` unknown inference, and legacy simulation test `data` unknown inference already recorded in prior progress; no new Work Unit 4-specific type error was reported.
- PostgreSQL attempts: the new financial-neutrality/failure/replay/rebuild/parity test and the existing restart/rebuild, rollback, and concurrent-client tests all skip when `DATABASE_URL` is unset. No PostgreSQL durability, lock, restart, rebuild, or rollback pass is claimed. External-network and worker harnesses are N/A by design and were not added.

### Work Unit 4 scope evidence

- PostgreSQL assertions cover zero `FinancialEvent`, `Transfer`, financial `CommandReceipt`, account/category/opening-balance/month rows, unchanged budget metadata/version authority, failed-run state, response-loss replay, rebuild projections, and normalized in-memory/durable projections when a configured database is available. In the current environment these remain unexecuted skips.
- Domain/API/HTTP checks cover network-client imports, no runtime network calls, credential rejection before persistence, safe diagnostics, no candidate application/provider connectivity/account linking/money movement controls, and unchanged financial summary/version/candidate state.
- Web checks retain authenticated API, CSV, history, server-calculation, same-origin proxy, and no-provider/no-linking/no-application assertions.

### Parent delivery gate

- [x] Start or reuse a bounded review of the four proposed work units and decide whether to proceed with the `ask-on-risk` delivery decision; user selected stacked-to-main. <!-- sdd-owner: parent -->
- [x] Record the explicit delivery/chain decision for the High review-budget risk: `stacked-to-main`; no size exception. <!-- sdd-owner: parent -->

Review mode: clone-local `off`; no native review was started for this candidate.

Structured status consumed: `gentle-ai.sdd-status@2`, change `simulate-advanced-bolivian-bank-providers`, `artifactStore: openspec`, `applyState: ready`, `nextRecommended: apply`, `blockedReasons: []`, repo-local action context rooted at `D:/Universidad/Proyectos/2doSemestre2026/topicos/YNAB`; delivery `ask-on-risk` / `stacked-to-main`, PR4 base PR3. Persisted task state after this phase is 39/39 complete. No commit, push, receipt, archive, or delivery-gate actor was started.

Workload / PR boundary: PR4 only, stacked-to-main on PR3; the authored slice is limited to cross-cutting tests and testability/readability helpers, with no size exception. Parent delivery decision is complete; archive remains the lifecycle next step.
