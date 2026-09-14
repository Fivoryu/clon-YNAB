# Implementation Tasks: Transaction History Edit and Delete

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 700–1,000 authored lines across API, Prisma, tests, OpenAPI, web, and Playwright |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1: domain/persistence/migration; PR 2: API/OpenAPI and focused API tests; PR 3: web/Playwright and final integration |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

The split above is a proposed review boundary, not a selected chain strategy. Apply must wait for the parent to obtain the user’s chain-strategy decision. Do not use `size:exception` unless explicitly approved.

## 1. RED — Pure domain and persistence contracts

- [x] 1.1 Add failing tests in `apps/api/test/transaction-history-planning.test.ts` for strict `YYYY-MM-DD` parsing, positive minor-unit validation, budget-timezone month derivation, same-month acceptance, and cross-month `CONFLICT`; verify the tests fail for the missing planning API. <!-- sdd-owner: implementation -->
- [x] 1.2 Add failing tests in `apps/api/test/transaction-history-planning.test.ts` for deterministic effective-history folding, replacement chains, delete tombstones, malformed identity/type/account chains, and exclusion of superseded/tombstoned financial effects; verify old rows never appear as effective effects in the assertions. <!-- sdd-owner: implementation -->
- [x] 1.3 Add failing tests for eligibility and protected-state planning covering realized income, one-category spending, supported account, `POSTED|WORKING`, non-reconciled records, released income, reconciled records, unsupported kinds, splits, transfers, cards, refunds, schedules, repetition, and state changes; verify each rejected mutation is side-effect free. <!-- sdd-owner: implementation -->
- [x] 1.4 Add failing tests for immutable replacement/tombstone projections and archived-category behavior in `apps/api/test/transaction-history-planning.test.ts`; verify amount/date edits retain archived categories while supplied replacements require an active category from the same budget. <!-- sdd-owner: implementation -->
- [x] 1.5 Add failing Prisma integration tests in `apps/api/test/transaction-history-prisma.test.ts` for stable identity, `businessDate` restart durability, replacement chains, tombstone exclusion, audit identity, and effective-history rebuild equivalence; verify tests run against PostgreSQL and fail before the migration/seams exist. <!-- sdd-owner: implementation -->
- [x] 1.6 Add failing API tests in `apps/api/test/transaction-history-api.test.ts` for list/read ordering and month filtering, established envelopes, owner non-disclosure, edit/delete headers, confirmation, protected conflicts, and server-calculated mutation results; verify route requests fail until handlers/contracts are implemented. <!-- sdd-owner: implementation -->
- [x] 1.7 Add failing tests for budget-scoped idempotency and optimistic concurrency in `apps/api/test/transaction-history-api.test.ts` and the Prisma suite; verify compatible replay returns the saved result without a second effect/audit row, incompatible payload reuse conflicts, and stale `If-Match` conflicts without mutation. <!-- sdd-owner: implementation -->

## 2. GREEN — Prisma, pure planning, and store implementation

- [x] 2.1 Update `apps/api/prisma/schema.prisma` and add an additive migration under `apps/api/prisma/migrations/` for `TRANSACTION_DELETE`, transaction identity/date/status/reconciliation/supersession metadata, indexes and supported-row date invariants; verify `prisma validate` and migration status succeed. <!-- sdd-owner: implementation -->
- [x] 2.2 Implement deterministic legacy backfill in the migration for `transactionId = id`, `POSTED`, `reconciled = false`, and `businessDate = month-01` without changing existing month or amounts; verify migration data assertions preserve legacy totals and document that recovered dates are not historical precision. <!-- sdd-owner: implementation -->
- [x] 2.3 Add `TransactionDeletionAudit` persistence with budget/idempotency uniqueness and actor, transaction, request/correlation, reason, and server timestamp fields; verify schema constraints reject duplicate budget/idempotency audit identities. <!-- sdd-owner: implementation -->
- [x] 2.4 Add the focused pure transaction-history module beside `apps/api/src/planning/engine.ts`; implement strict date/month validation, effective folding, eligibility/protection checks, replacement/tombstone construction, and effective-collection projection; verify all RED planning tests pass and no client-derived financial totals are accepted. <!-- sdd-owner: implementation -->
- [x] 2.5 Extend the domain event shape and `FinancialStore.appendEvent`/load paths in `apps/api/src/` to persist and reload `businessDate`, stable identity, supersession, status, reconciliation metadata, and creation time while preserving release/allocation/move behavior; verify a fresh-process PostgreSQL reload retains dates and event identity. <!-- sdd-owner: implementation -->
- [x] 2.6 Implement `FinancialStore` transaction commands in the existing persistence seam, retaining raw appended rows separately from the effective calculation set; lock the budget, authenticate owner scope, replay receipts, enforce expected version, fold history, validate eligibility, and atomically append replacement/tombstone plus receipt/audit; verify failures roll back every write. <!-- sdd-owner: implementation -->
- [x] 2.7 Preserve rollback containment in the store and migration path: route-disable compatibility, forward-compatible additive schema, no deletion of tombstones/audits, and rebuild-from-PostgreSQL recovery; verify an injected Prisma constraint/client failure leaves history, effects, receipt, and audit unchanged. <!-- sdd-owner: implementation -->

## 3. GREEN — API, authorization, contract, and Reports integration

- [x] 3.1 Add owner-scoped list/read/edit/delete handlers and `BudgetApp` methods in `apps/api/src/` for the four approved transaction routes; verify authentication and owner budget lookup happen before target/field validation and foreign resources use the existing non-disclosing `NOT_FOUND` behavior. <!-- sdd-owner: implementation -->
- [x] 3.2 Implement request validation and response mapping for amount/date/category edits and `{ confirmed, reason? }` deletes, including required `Idempotency-Key` and `If-Match`, quoted/weak-quoted version parsing, stable `CONFLICT` semantics, and no audit-read route; verify API tests cover unconfirmed, protected, cross-month, unsupported, stale, and incompatible-retry cases. <!-- sdd-owner: implementation -->
- [x] 3.3 Wire idempotency digests to include operation, transaction identity, body fields, confirmation/reason, and expected version; verify same-key compatible retries return the persisted result, already-deleted new requests are `NOT_FOUND`, and no duplicate tombstone/audit/effect is created. <!-- sdd-owner: implementation -->
- [x] 3.4 Keep `ReportService` as the canonical calculator and update only `apps/api/src/` event consumers/rebuild loading needed to accept expanded events and folded effective history; verify corrected account, RTA/plan, category activity, rollover, deletion, and month outcomes match a fresh PostgreSQL rebuild without changing first-slice report shapes. <!-- sdd-owner: implementation -->
- [x] 3.5 Update `apps/api/openapi.yaml with the four paths, transaction/history schemas, month query, mutation headers/bodies, established success/error envelopes, and removal of first-slice edit/delete wording; verify OpenAPI validation/contract tests assert required headers, schemas, and stable error codes. <!-- sdd-owner: implementation -->

## 4. TRIANGULATE — Durable behavior and regression evidence

- [ ] 4.1 Complete `apps/api/test/transaction-history-prisma.test.ts` coverage for migration/backfill, restart durability, replacement chains, tombstone exclusion, active/archived category rules, audit actor identity, and raw-history rebuild equivalence; verify PostgreSQL is authoritative and the in-memory store is not used as durability evidence. <!-- sdd-owner: implementation -->
- [ ] 4.2 Add two-client Prisma concurrency tests for budget locking, stale version rejection, concurrent edits, and safe idempotent replay; verify exactly one authorized mutation commits and the newer state is preserved. <!-- sdd-owner: implementation -->
- [x] 4.3 Add focused Reports regression tests in the existing report test files for corrected income/spending, released-income protection, category replacement/retention, deletion, positive rollover, and rebuild equality; verify delivered first-slice budgeting/reporting behavior remains unchanged outside corrected effective history. <!-- sdd-owner: implementation -->
- [x] 4.4 Add authorization and error regression cases for foreign budgets, foreign transactions, foreign categories, released income, reconciled/ineligible state, and every explicit non-goal (splits, transfers, multiple accounts, payee/memo, state, repetition, reconciliation, closed month, cards, refunds, schedules, audit read); verify no response leaks resource existence or applies mutation. <!-- sdd-owner: implementation -->
- [x] 4.5 Add a focused Playwright journey under the existing E2E test location: list supported history, edit amount/date/category, retain an archived category, display released income as protected, require inline delete confirmation with optional reason, verify disappearance, and refresh the server summary; verify existing first-slice journeys remain regression-only and unchanged. <!-- sdd-owner: implementation -->

## 5. REFACTOR — Focused web and final implementation quality

- [x] 5.1 Add the focused history section to `apps/web/app/page.tsx` without changing existing dashboard/forms; verify default/month-filtered history, archived-category display, protected state, active-only replacement choices, explicit delete confirmation, fresh idempotency keys, current version submission, and server-summary refresh. <!-- sdd-owner: implementation -->
- [x] 5.2 Refactor shared API/client helpers only where needed to keep history rendering and mutation state clear, accessible, and resilient to stable API errors; verify web typecheck passes and no client balance, summary, month, or financial effect is treated as authoritative. <!-- sdd-owner: implementation -->
- [x] 5.3 Run the complete verification matrix from repository root: `npm test`, focused API/Prisma tests, OpenAPI validation, `npm run db:validate`, migration/rebuild checks, `npm run typecheck:web`, `npm run build:web`, and `npm run test:e2e`; verify failures are fixed or explicitly reported and first-slice regression checks pass. <!-- sdd-owner: implementation -->
- [ ] 5.4 Verify migration and operational rollback evidence in the change notes: deploy migration before enabling routes, disable edit/delete while retaining fold/report code during incidents, replay lost responses by idempotency key, and never revert to a pre-fold binary after mutations; verify no destructive schema rollback is attempted after feature use. <!-- sdd-owner: implementation -->

## 6. Parent decision and lifecycle gates

- [ ] 6.1 Decide the delivery shape before apply—select a chained-PR strategy and confirm the proposed PR 1/2/3 boundaries, or explicitly authorize another non-exception strategy; verify the decision is recorded before implementation starts. <!-- sdd-owner: parent -->
- [ ] 6.2 Start or reuse a bounded post-apply review for the selected work unit(s), including review-budget and rollback-gate evidence; verify review findings are resolved without expanding scope. <!-- sdd-owner: parent -->

## Deferred by design

Only these design questions remain deferred: audit retention/export/authorized audit-read policy, and future reconciliation/closed-month policy. Pagination/indexing beyond the bounded first history view may remain an implementation note, but no other implementation choice is left open.
