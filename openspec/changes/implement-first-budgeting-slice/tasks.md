# Implementation Tasks: First Budgeting Slice

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 900–1,400 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 → PR 2 → PR 3: application skeleton/auth/setup → canonical engine/persistence/API → web workflow/reporting/E2E |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

The repository currently contains architecture/domain documentation rather than functional application code. This forecast reflects establishing both approved application surfaces, persistence, domain behavior, tests, and the primary browser journey. Apply may begin only through the selected `stacked-to-main` chained slices; do not use `size:exception` unless explicitly approved.

## Guardrails and sequencing

- Implement only the approved first slice: local auth/sessions, one owner budget, resumable setup, one cash/checking account/opening balance, editable categories, realized income with explicit release, categorized spending, assignments/unassignments/moves, RTA/Assigned/Activity/Available, positive rollover, dashboard, and monthly summary.
- Keep the engine pure TypeScript, PostgreSQL authoritative, Prisma migrations owned at the API persistence boundary, and web calculations server-derived. Preserve immutable history and rebuildability.
- Do not add splits, transfers, cards, reconciliation, targets, scheduled transactions, future income, refunds/returns, ordinary edit/delete, cleared/pending/uncleared states, shared or multiple budgets, or broader card/overspending formulas.
- Exact endpoint names, DTO fields, setup state names, persistence entity names, accessibility/performance thresholds, CI policy, and module-enforcement mechanism remain implementation decisions bounded by the approved spec/design; document the selected contracts in the implementation rather than inventing extra product behavior.

## RED — baseline and contract tests

- [x] Inspect `docs/decisions/ADR-001-modular-monolith.md`, `docs/architecture/stack.md`, the repository root, and existing test/configuration files; record the actual baseline and select concrete API/web/Prisma paths without modifying existing working-tree changes. <!-- sdd-owner: implementation -->
- [x] Add failing unit-test files under the selected API domain test locations for integer minor-unit arithmetic, budget-timezone month resolution (UTC default and boundary dates), RTA components, Assigned/Activity/Available, positive-only rollover, assignment/unassignment/move conservation, explicit income-release repeatability, and rejection of deferred concepts. <!-- sdd-owner: implementation -->
- [x] Add failing API/integration test fixtures under the selected API integration-test locations for session expiry/revocation, owner isolation with uniform `NOT_FOUND`, one-budget uniqueness, resumable setup retries, archived-category rejection, atomic financial writes, idempotency replay/payload conflict, stale-version conflict, and deterministic rebuild. <!-- sdd-owner: implementation -->
- [x] Add a failing Playwright test under the selected web E2E location covering registration/sign-in, partial setup save/resume, setup completion, income before/after explicit release, assignment and negative-RTA correction, categorized spending, month boundary, and dashboard/month-summary consistency. <!-- sdd-owner: implementation -->

## GREEN — application skeleton, identity, and setup

- [x] Establish the ADR-001 modular-monolith skeleton at the repository’s selected API and web package paths, including shared verification scripts/configuration and local PostgreSQL/Docker Compose integration only where the existing repository baseline requires it. <!-- sdd-owner: implementation -->
- [x] Implement the API Identity module at the selected API identity paths: password hashing, registration/sign-in/sign-out, opaque random server-managed sessions, secure cookie policy, expiry/revocation, DTO validation, request IDs, and `{data,requestId}`/`{error:{code,message,requestId}}` envelopes. <!-- sdd-owner: implementation -->
- [x] Implement budget authorization middleware/application services at the selected API budgets paths so every protected read/write resolves the session owner first and foreign resources disclose only `NOT_FOUND`. <!-- sdd-owner: implementation -->
- [x] Implement the additive Prisma schema/migrations at the canonical API persistence path for users, sessions, one-user/one-budget setup metadata, budget timezone, the supported account, category lifecycle, and integer opening-balance history; add ownership uniqueness, stable historical references, archive constraints, and rollback inventory. <!-- sdd-owner: implementation -->
- [x] Implement resumable setup commands/queries at the selected API budgets/setup paths: deterministic progress, starter categories, account/opening balance, category create/rename/archive, completion boundary, idempotent retries, and rejection of second budgets or unsupported account breadth. <!-- sdd-owner: implementation -->
- [x] Implement the corresponding web auth/setup/resume screens at the selected Next.js paths, rendering API state and unavailable-feature messaging without financial calculations or client authority. <!-- sdd-owner: implementation -->

## GREEN — canonical engine and financial commands

- [x] Implement the pure TypeScript planning engine at the selected API planning/engine path with explicit minor-unit inputs/outputs for account balance, released versus unreleased income, RTA breakdown, category Assigned/Activity/Available, positive rollover, timezone month selection, and assignment/move conservation. <!-- sdd-owner: implementation -->
- [x] Implement authoritative financial history and idempotency/version persistence in the canonical Prisma migration path for income, release, spending, assignment, unassignment, moves, command digests/results, and affected budget-month versions; ensure indexes and uniqueness protect retries. <!-- sdd-owner: implementation -->
- [x] Implement Accounts, Categories, Transactions, and Planning application services at their selected API module paths using intent amounts only, archived-entity checks, explicit full release semantics, visible overassignment/negative RTA, and rejection of all deferred transaction concepts. <!-- sdd-owner: implementation -->
- [x] Wrap every financial command in one PostgreSQL transaction with authorization, same-transaction idempotency lookup/digest validation, affected-state version protection, append-only effects, result replay, and all-or-nothing account/category/allocation changes. <!-- sdd-owner: implementation -->
- [x] Implement versioned `/api/v1` command/read controllers and OpenAPI documentation at the selected API controller paths for authentication, setup, category lifecycle, income/release, spending, allocation/moves, dashboard, and month summary; use stable status/error categories and server-calculated values. <!-- sdd-owner: implementation -->

## TRIANGULATE — integration and reporting verification

- [x] Make the RED unit matrix pass against the pure engine, including property/table cases proving no floating-point source of truth, no double-subtracted spending, positive-only carry, release exactly once, and no silent unrelated-category changes. <!-- sdd-owner: implementation -->
- [x] Make the API integration matrix pass against PostgreSQL, including rollback after injected failure, same-key same-payload replay, same-key different-payload conflict, concurrent stale-write conflict, ownership isolation, archived references, boundary-month behavior, and rebuild after derived-summary loss. <!-- sdd-owner: implementation -->
- [x] Implement Reports read services at the selected API reports path so dashboard and month summary use the same canonical engine/read model, authorize before loading, expose distinct components, and synchronously rebuild or safely recalculate derived data from authoritative history. <!-- sdd-owner: implementation -->
- [x] Make contract/API tests pass for envelopes, validation, status codes, OpenAPI DTOs, request IDs, non-disclosing foreign access, and unsupported reporting controls without creating partial effects. <!-- sdd-owner: implementation -->

## REFACTOR — web journey and delivery verification

- [x] Implement the selected web budgeting routes/components for monthly category assignments, moves/unassignments, negative-RTA correction, income release, categorized spending, dashboard, and monthly summary; keep all displayed figures sourced from API DTOs and make unsupported controls absent or clearly unavailable. <!-- sdd-owner: implementation -->
- [x] Make the Playwright primary journey pass end to end, including save/resume and retry paths, account balance versus unreleased RTA distinction, explicit release, overassignment/correction, positive rollover, timezone boundary, and matching dashboard/month-summary values. <!-- sdd-owner: implementation -->
- [x] Refactor module dependencies, shared DTO/error handling, transaction boundaries, and engine/read-service reuse to enforce the documented API boundaries and remove duplicated formulas while preserving the mandatory unit/integration/contract/E2E behavior. <!-- sdd-owner: implementation -->
- [x] Run the repository’s discovered format, lint, unit, integration, build, migration, OpenAPI, and Playwright commands; verify the migration rollback/rebuild procedure and the first-slice non-goal scan, then record results and any environment limitations in the apply/verify artifacts. <!-- sdd-owner: implementation -->
