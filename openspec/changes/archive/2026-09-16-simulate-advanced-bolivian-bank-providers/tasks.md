# Implementation Tasks: Advanced Bolivian Bank-Provider Simulation

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 1,000–1,340 authored lines across four cohesive work units |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (base: main) → PR 2 (base: PR 1) → PR 3 (base: PR 2) → PR 4 (base: PR 3) |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

This plan covers the approved first slice only: fictional local simulation, isolated persistence, read-only candidates, synchronous controls, and regression evidence. It does not add candidate application, official integration, account linking, financial effects, or real-money behavior.

## Execution constraints and verification

- Keep `apps/api/src/persistence/financial-store.ts`, `apps/api/src/persistence/budget-store.ts`, all existing financial domain/projection modules, `openspec/changes/simulate-advanced-bolivian-bank-providers/proposal.md`, `openspec/changes/simulate-advanced-bolivian-bank-providers/specs/bank-provider-simulation/spec.md`, and `openspec/changes/simulate-advanced-bolivian-bank-providers/design.md` read-only; simulation must not call or modify financial authority.
- Use strict TDD in each work unit: RED tests first, then GREEN implementation, then TRIANGULATE against neighboring boundaries, then REFACTOR without changing the contract.
- Focused verification uses `node --experimental-strip-types --test <listed tests>`, `npm run db:validate`, and the repository's existing PostgreSQL test harness/configuration where required. Runtime harness for pure, in-memory, API, HTTP, OpenAPI, and web regression work: **N/A**. PostgreSQL tasks require the existing configured PostgreSQL harness; do not invent a network/provider harness.
- Rollback boundaries: each work unit must be revertible independently; schema rollback is additive-feature disablement/forward-compatible readers once simulation rows exist, never deletion or rewriting of ordinary budget history.

## Work Unit 1 — Domain contracts, catalog, engine, and projections

**Start:** no simulation source exists; existing financial tests remain green. **Finish:** pure deterministic domain behavior and normalized projections are independently testable with no I/O. **Rollback:** revert only `apps/api/src/simulation/` and its domain test.

### RED

- [x] Add failing tests for shared simulation states, fixture/version/seed contracts, bounded limits, safe diagnostics, and the absence of `APPLIED`, credential, endpoint, affiliation, and financial-effect fields in `apps/api/test/simulation-domain.test.ts` and `apps/api/src/simulation/types.ts` (read-only target until implementation). <!-- sdd-owner: implementation -->
- [x] Add failing catalog tests for neutral fictional profile codes/labels, immutable server-owned fixtures, deterministic ordering, forbidden provider-shaped input rejection, and catalog bounds in `apps/api/test/simulation-domain.test.ts`. <!-- sdd-owner: implementation -->
- [x] Add failing engine tests for every legal transition, illegal/terminal transitions, seeded ordered delivery, pending-to-posted identity, duplicate/rejected outcomes, partial checkpoints, failure-after-checkpoint, timeout, legal retry, command/attempt limits, and deterministic replay in `apps/api/test/simulation-domain.test.ts`. <!-- sdd-owner: implementation -->
- [x] Add failing projection tests for stable run/candidate/checkpoint/audit ordering and provenance, side-effect-free reads, and normalized equivalence for identical fixture inputs in `apps/api/test/simulation-domain.test.ts`. <!-- sdd-owner: implementation -->

### GREEN

- [x] Implement the shared domain contracts, enums/unions, fixture records/batches/transitions, limits, command inputs, safe diagnostics, and projection types in `apps/api/src/simulation/types.ts`. <!-- sdd-owner: implementation -->
- [x] Implement the neutral catalog, complete fixture validation, forbidden-field validation, immutable profile lookup, and bounded profile summaries in `apps/api/src/simulation/catalog.ts`; do not accept caller-supplied fixtures or provider metadata. <!-- sdd-owner: implementation -->
- [x] Implement the pure deterministic state-machine engine, checked seeded branching, one-transition command plans, checkpoint/failure/timeout/partial/retry behavior, stable candidate identity inputs, and no-I/O/no-financial calculation boundary in `apps/api/src/simulation/engine.ts`. <!-- sdd-owner: implementation -->
- [x] Implement deterministic run, candidate lifecycle, checkpoint, audit, ordering, and safe-diagnostic projections in `apps/api/src/simulation/projection.ts`; keep `APPLIED` unreachable and expose no application DTO. <!-- sdd-owner: implementation -->

### TRIANGULATE and REFACTOR

- [x] Run `node --experimental-strip-types --test apps/api/test/simulation-domain.test.ts` and compare normalized repeated-run outputs, then add boundary assertions that simulation modules do not import network clients or financial authority paths in `apps/api/test/simulation-domain.test.ts`. <!-- sdd-owner: implementation -->
- [x] Refactor only after RED/GREEN evidence: remove duplicated canonicalization/limit logic across `apps/api/src/simulation/types.ts`, `apps/api/src/simulation/catalog.ts`, `apps/api/src/simulation/engine.ts`, and `apps/api/src/simulation/projection.ts`, preserving all domain tests. <!-- sdd-owner: implementation -->

## Work Unit 2 — Isolated Prisma schema, migration, and in-memory parity

**Start:** Work Unit 1 domain contracts are green. **Finish:** durable and in-memory stores implement the same simulation protocol with atomic, restartable, owner-scoped state. **Rollback:** disable/revert simulation store wiring and additive migration before persisted rows; after rows exist, retain tables and use route disablement.

### RED

- [x] Add failing schema/migration assertions for all isolated simulation enums/models, composite budget-scoped foreign keys, uniqueness/indexes, bounded checks, neutral seed, and absence of relations to financial tables in `apps/api/test/simulation-postgres.test.ts` and `apps/api/prisma/schema.prisma` (read-only target until implementation). <!-- sdd-owner: implementation -->
- [x] Add failing PostgreSQL tests for owner predicates, simulation-scope/run locking, revision conflicts, receipt replay/conflict, atomic rollback, fixture-defined committed failures, and concurrent identical/different commands in `apps/api/test/simulation-postgres.test.ts`. <!-- sdd-owner: implementation -->
- [x] Add failing restart/rebuild tests for exact run, attempt, checkpoint, candidate/lifecycle, diagnostic, audit, and receipt recovery without duplicate rows or financial-version changes in `apps/api/test/simulation-postgres.test.ts`. <!-- sdd-owner: implementation -->
- [x] Add failing in-memory parity tests for the same command sequence, fixed clock, canonical digest, idempotency, queue serialization, cloned state, and normalized projections in `apps/api/test/simulation-api.test.ts` (store boundary). <!-- sdd-owner: implementation -->

### GREEN

- [x] Add isolated simulation enums/models/relations and constraints to `apps/api/prisma/schema.prisma`, with no `FinancialEvent`, `Transfer`, `CommandReceipt`, account, category, history, report, or CSV relation. <!-- sdd-owner: implementation -->
- [x] Create additive migration `apps/api/prisma/migrations/0006_bank_provider_simulation/migration.sql` for tables, indexes, composite tenant constraints, checks, and neutral catalog seed; validate it leaves migrations `0001`–`0005` and existing rows available. <!-- sdd-owner: implementation -->
- [x] Implement the owner-scoped `SimulationStore` contract, Prisma transaction protocol, scope/run locks, canonical SHA-256 receipt handling, atomic attempt/delivery/candidate/checkpoint/audit/revision writes, safe error mapping, and restart loading in `apps/api/src/persistence/simulation-store.ts`. <!-- sdd-owner: implementation -->
- [x] Implement `InMemorySimulationStore` with per-budget promise serialization, cloned pre-apply state, the shared engine/digest/projections, and publish-after-success semantics in `apps/api/src/persistence/in-memory-simulation-store.ts`. <!-- sdd-owner: implementation -->

### TRIANGULATE and REFACTOR

- [x] Run `npm run db:validate` and `node --experimental-strip-types --test apps/api/test/simulation-postgres.test.ts apps/api/test/simulation-api.test.ts`; verify PostgreSQL and in-memory normalized projections match for fixed inputs while PostgreSQL-only lock/restart/rollback evidence remains explicit. <!-- sdd-owner: implementation -->
- [x] Refactor transaction mapping and projection reads in `apps/api/src/persistence/simulation-store.ts` and `apps/api/src/persistence/in-memory-simulation-store.ts` only after atomicity, restart/rebuild, concurrency, and parity tests pass. <!-- sdd-owner: implementation -->

## Work Unit 3 — BudgetApp, HTTP server, OpenAPI, authorization, idempotency, and revision wiring

**Start:** Work Units 1–2 expose tested store APIs. **Finish:** all nine scoped routes use existing session/budget authorization and envelopes, with no disclosure or unsupported capability. **Rollback:** disable simulation route dispatch and remove only simulation dependency wiring; leave ordinary routes unchanged.

### RED

- [x] Add failing in-memory application tests for authenticated owner success, missing/foreign budget non-disclosure, guessed run/candidate/checkpoint/audit IDs, unsupported application/linking/provider controls, financial neutrality, idempotency replay/conflict, and stale simulation revision handling in `apps/api/test/simulation-api.test.ts`. <!-- sdd-owner: implementation -->
- [x] Add failing HTTP tests for exact profile/run/control/inspect/read routes, JSON parsing, required `Idempotency-Key`/`If-Match`, request IDs, status mapping, bounded bodies, safe errors, and absent application/network routes in `apps/api/test/simulation-http.test.ts`. <!-- sdd-owner: implementation -->
- [x] Add failing OpenAPI tests for every simulation path, security, headers, envelopes, DTO bounds/enums, fictional/no-network/no-money descriptions, and omitted application integration in `apps/api/test/simulation-openapi.test.ts`. <!-- sdd-owner: implementation -->

### GREEN

- [x] Add simulation dependency injection, owner-scoped catalog/run/control/inspect/read methods, input normalization, revision/idempotency handling, and domain/persistence error mapping to `apps/api/src/app.ts` without invoking financial methods. <!-- sdd-owner: implementation -->
- [x] Add explicit simulation route matching, path/body/header dispatch, cookie/session handling, request-ID and `If-Match` parsing, and standard success/error envelopes to `apps/api/src/server.ts`; reject unsupported controls without mutation. <!-- sdd-owner: implementation -->
- [x] Wire `InMemorySimulationStore` and `PrismaSimulationStore` in `apps/api/src/app.ts` and `apps/api/src/server.ts` production/default construction while preserving existing constructor call sites and ordinary route behavior. <!-- sdd-owner: implementation -->
- [x] Document the nine routes, shared headers, bounded request/response schemas, stable status responses, authorization, non-disclosure, fictional labels, no-network/no-credentials, no-financial-effects, and deferred capabilities in `apps/api/openapi.yaml`. <!-- sdd-owner: implementation -->

### TRIANGULATE and REFACTOR

- [x] Run `node --experimental-strip-types --test apps/api/test/simulation-api.test.ts apps/api/test/simulation-http.test.ts apps/api/test/simulation-openapi.test.ts apps/api/test/openapi.test.ts`; confirm route results match direct store projections and no existing envelope/security assertions regress. <!-- sdd-owner: implementation -->
- [x] Refactor route matching, DTO mapping, and authorization plumbing in `apps/api/src/app.ts`, `apps/api/src/server.ts`, and `apps/api/openapi.yaml` only after all new and existing API tests pass; preserve non-disclosure before resource detail lookup. <!-- sdd-owner: implementation -->

## Work Unit 4 — Cross-cutting resilience, financial neutrality, no-network, and web regression

**Start:** domain, store, and API slices are green. **Finish:** integrated evidence covers rollback/restart/rebuild/concurrency and proves the existing budgeting/web boundary is unchanged. **Rollback:** revert only new simulation tests and narrowly scoped regression assertions; never alter ordinary financial data.

### RED

- [x] Add failing integration assertions in `apps/api/test/simulation-postgres.test.ts` that simulation commands create no `FinancialEvent`, `Transfer`, `CommandReceipt`, account/category effect, report change, CSV row, or `Budget.version` advancement, including failed and rebuilt runs. <!-- sdd-owner: implementation -->
- [x] Add failing no-network/credential regression assertions in `apps/api/test/simulation-domain.test.ts`, `apps/api/test/simulation-api.test.ts`, and `apps/api/test/simulation-http.test.ts` for imports, requests, persistence, diagnostics, and forbidden deferred capabilities. <!-- sdd-owner: implementation -->
- [x] Extend `apps/web/test/page.test.ts` with failing assertions that no provider/credential/linking/application UI or client financial calculation is introduced and existing authenticated API, CSV, history, and proxy boundaries remain intact. <!-- sdd-owner: implementation -->

### GREEN / TRIANGULATE

- [x] Complete the failure-injection, PostgreSQL restart/rebuild, concurrent-client, response-loss/idempotency replay, and in-memory/PostgreSQL normalized-projection harnesses in `apps/api/test/simulation-postgres.test.ts`; use the configured PostgreSQL harness and record explicit N/A for external-network and worker harnesses. <!-- sdd-owner: implementation -->
- [x] Complete no-network, financial-neutrality, safe-diagnostic, and deferred-boundary assertions in `apps/api/test/simulation-domain.test.ts`, `apps/api/test/simulation-api.test.ts`, and `apps/api/test/simulation-http.test.ts`. <!-- sdd-owner: implementation -->
- [x] Complete web regression assertions in `apps/web/test/page.test.ts` without changing web application source; run `node --experimental-strip-types --test apps/web/test/page.test.ts`. <!-- sdd-owner: implementation -->
- [x] Run the focused suite, then `npm test`, `npm run typecheck:web`, `npm run build:web`, and `npm run verify` as applicable; retain evidence that no candidate reaches ordinary financial projections or real-money behavior. <!-- sdd-owner: implementation -->

### REFACTOR

- [x] Make only testability/readability refactors in the new simulation files and focused tests after the full regression suite passes; do not broaden routes, add workers/network clients, or modify canonical financial modules. <!-- sdd-owner: implementation -->

## Parent-owned delivery gate

- [x] Start or reuse a bounded review of the four proposed work units and decide whether to proceed with the `ask-on-risk` delivery decision; user selected stacked-to-main. <!-- sdd-owner: parent -->
- [x] Record the explicit delivery/chain decision for the High review-budget risk: `stacked-to-main`; no size exception. <!-- sdd-owner: parent -->
