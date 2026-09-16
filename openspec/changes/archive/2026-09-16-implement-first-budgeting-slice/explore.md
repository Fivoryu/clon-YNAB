# Exploration: implement-first-budgeting-slice

## Status and boundary

- **Clone decision:** The approved first vertical slice is the authenticated, one-user-owned-budget planning loop: local email/password, server-managed opaque sessions, one cash/checking-style account with explicit opening balance, categories, realized income, categorized spending, monthly assignments/moves, RTA/Assigned/Activity/Available, positive rollover, dashboard, and monthly summary.
- **Clone decision:** Explicitly deferred: splits, transfers, credit cards, reconciliation, targets, scheduled transactions, future income, refunds/reimbursements/returns, ordinary transaction edit/delete, cleared/pending/uncleared states, and full overspending/card formulas.
- **Observed:** Public YNAB guidance distinguishes RTA, category assignment/activity/availability, positive availability rollover, and cash/card overspending outcomes. The project does not claim private YNAB schema or formulas.

## Existing product/domain evidence

- **Clone decision:** First-slice RTA is `realized opening cash + realized cash inflows + explicitly supported prior carry - current assignments`; future income is excluded and funded spending is not subtracted twice.
- **Inferred:** Category `Available` is `permitted carryover + Assigned + signed Activity`; Assigned, Activity, and Available must remain separate and explainable.
- **Clone decision:** Integer minor units are authoritative; assignments/moves conserve money; explicit negative RTA remains visible and is corrected by unassignment or move-back; positive Available carries deterministically into the next month.
- **Clone decision:** Income increases the supported account working balance and realized assignable pool. Categorized spending decreases the account working balance and category Activity. Account and plan effects are atomic.
- **Clone decision:** Category/account rename and archive preserve historical references; archived entities cannot receive new applicable activity.
- **Clone decision:** Date-only transaction dates use the explicit budget IANA timezone (default UTC); event timestamps are UTC and browser timezone does not choose the month.

## Existing architecture evidence

- **Clone decision:** Accepted architecture is a modular monolith: Next.js/React/TypeScript web, NestJS/TypeScript API, PostgreSQL, Prisma, Docker Compose, OpenAPI/Swagger, Jest, and Playwright.
- **Clone decision:** API modules are identity, budgets, accounts, categories, transactions, planning, and reports. Modules communicate through application services/contracts, not each other’s repositories; domain calculations do not depend on HTTP/UI.
- **Clone decision:** PostgreSQL and one canonical Prisma schema/migration owner are authoritative. Financial writes use one database transaction, server-calculated DTOs, optimistic versions, and scoped idempotency keys. Same key/payload replays; same key/different payload returns `CONFLICT`.
- **Clone decision:** API v1 uses `{data,requestId}` success and `{error:{code,message,requestId}}` errors with stable categories (`UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `VALIDATION_ERROR`, `CONFLICT`, `INSUFFICIENT_AVAILABLE_FUNDS`, `INTERNAL_ERROR`). Foreign resources use non-disclosing `NOT_FOUND`.
- **Clone decision:** Derived summaries may be cached only as derived data and need deterministic rebuild from authoritative transaction/allocation history; client-provided balances are never authoritative.
- **Clone decision:** Verification baseline includes unit tests for money/RTA/Available/allocation, integration tests for isolation/atomicity/idempotency/concurrency/rebuild, and Playwright primary-journey coverage.

## Structural observations and implementation seam

- **Inferred:** The natural vertical seam crosses auth/session middleware, budget authorization, budget/account/category setup, transaction and allocation command services, the budget engine, persistence transaction boundaries, and dashboard/month-summary read DTOs.
- **Inferred:** The first implementation should preserve authoritative movement history for opening money, income, spending, assignments, unassignments, moves, and rollover; exact table/entity shape remains an implementation concern for the later approved design phase.
- **Inferred:** Read paths should calculate or query the engine’s canonical summary rather than reproducing RTA/category formulas in the web client.

## Open questions to carry forward

1. **Open question:** Is setup/opening one atomic command or a resumable workflow? Existing requirements demand atomic initial account/plan effects and idempotent setup, but do not settle interaction shape.
2. **Open question:** Exact endpoint names, DTO fields, repository/module dependency enforcement, and location of the canonical Prisma schema remain to be traced during design.
3. **Open question:** Exact persistence representation for authoritative movements versus derived summaries/carryover snapshots remains open.
4. **Open question:** The first-slice command policy around overassignment is internally constrained to visible negative RTA, while later reject-overassignment behavior remains unresolved; proposal/design must avoid silently adding rejection.
5. **Open question:** Final dashboard layout, responsive breakpoints, WCAG target, error-copy standard, and performance fixture/threshold are not fixed.
6. **Open question:** No numeric coverage threshold, CI provider, or contract-test scope is established; the mandatory test matrix is accepted.
7. **Open question:** Broader future formulas (future assignments, card balances/payment state, refunds, overspending, closed months, reconciliation correction, targets, and scheduled generation) must not leak into this slice.

## Risks and constraints

- **Risk:** Formula drift or duplicate client-side calculations could create inconsistent RTA/Available; keep the engine authoritative and test equations independently.
- **Risk:** Partial account/plan persistence or retry duplication could mint or lose money; enforce one PostgreSQL transaction, idempotency, optimistic versions, and rebuild tests.
- **Risk:** Cross-budget leakage is high impact; authorization must precede every budget-scoped query/command and use tenant-scoped constraints.
- **Risk:** Scope creep into deferred features is likely because broader requirements are documented nearby; implementation planning must explicitly mark unsupported capabilities.
- **Constraint:** Preserve existing working-tree documentation changes and do not modify `.codegraph/` or `.pi/`.

## Exploration tooling note

CodeGraph MCP/CLI was not available in this executor’s tool surface, so structural exploration used targeted repository documentation reads and grep fallback after the CodeGraph check could not be performed. No code or existing documentation was modified.

## Persistence

This exploration is persisted in the active OpenSpec backend at this file path. Engram was unavailable in this session, so no Engram persistence is claimed.
