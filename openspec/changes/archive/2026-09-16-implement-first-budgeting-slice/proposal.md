# Proposal: Implement the First Budgeting Slice

- **Change:** `implement-first-budgeting-slice`
- **Status:** Draft for user review
- **Next recommended phase:** Spec

## Intent

Deliver the smallest complete budgeting loop that lets an authenticated user create and resume a personal budget, record real cash activity, assign money to editable categories, understand what remains available, and review the month without depending on unsupported YNAB features.

This is a deliberately bounded vertical slice. It should establish authoritative money movement, explainable budget summaries, and a trustworthy user workflow before broader planning features are attempted.

## Business problem

A first-time budgeter needs a clear path from setup to an actionable monthly plan. Without a coherent account balance, category assignments, activity, availability, and rollover model, users cannot tell whether money was recorded, assigned, spent, or carried forward. Incorrect or duplicated financial effects would also create a high-cost trust and support problem.

## Target users and situations

- A new user setting up a personal cash/checking budget for the first time.
- A returning user resuming setup after saving partial progress.
- A user recording realized income or categorized spending during a month.
- A user assigning or moving money between categories and correcting a negative RTA.
- A user reviewing the dashboard or monthly summary to understand current and prior-month position.

The slice is for one user owning one budget. It is not intended to model shared budgeting, debt/card workflows, or advanced planning.

## Evidence and decision separation

### Observed

- Public YNAB guidance distinguishes Ready to Assign (RTA), category assignment, category activity, category availability, positive availability rollover, and cash/card overspending outcomes.
- The repository exploration identifies a modular monolith baseline using Next.js/React/TypeScript, NestJS/TypeScript, PostgreSQL, Prisma, Docker Compose, OpenAPI/Swagger, Jest, and Playwright.
- The repository does not claim access to private YNAB schemas or formulas.

### Inferred

- `Assigned`, signed `Activity`, and `Available` must remain separate, explainable values; the web client must not reproduce the budget equations independently.
- The natural implementation seam crosses identity/session handling, budget authorization, setup, transaction and allocation commands, the canonical budget engine, transactional persistence, and dashboard/month-summary reads.
- Authoritative movement history is needed so summaries can be rebuilt rather than trusting client-provided balances or unrecoverable snapshots.

### Clone decision

- The first slice is an authenticated, one-user-owned budgeting loop with one budget, one cash/checking-style account, categories, realized income, categorized spending, monthly assignments/moves, RTA, Assigned, Activity, Available, positive rollover, a dashboard, and a monthly summary.
- Local email/password authentication uses server-managed sessions.
- Initial setup is resumable: users may save progress and continue later.
- Categories start from an editable starter template.
- Assignments above RTA are allowed. RTA becomes visibly negative and the user must correct it; the system must not silently change another category.
- Realized income initially increases only the account balance. A separate explicit user action is required before that income becomes assignable through RTA.
- Assignments and moves conserve integer minor units. The system keeps negative RTA visible and supports correction by unassignment or moving money back.
- Positive category availability rolls deterministically into the next month.
- A transaction belongs to the month determined by its date in the budget's configured IANA timezone; the existing baseline default is UTC. Browser timezone does not choose the month.
- Financial effects are atomic, server-calculated, budget-authorized, and protected against retry duplication and stale concurrent writes through the later design/spec decisions.
- Historical references survive account/category rename and archive; archived entities cannot receive new applicable activity.

### Open question

- The exact follow-up operation that releases realized income from account balance into the assignable RTA pool is intentionally unresolved at proposal level. Later spec/design must define its user action, behavior, validation, and persistence semantics without inventing an endpoint name or schema here.
- Exact endpoint names, DTO fields, persistence representation, repository boundaries, canonical Prisma ownership, dashboard layout, responsive breakpoints, WCAG target, error copy, performance threshold, CI/coverage policy, and detailed rebuild mechanics remain later-phase decisions.

## Confirmed scope

### Included

1. Local email/password registration and sign-in.
2. Server-managed opaque sessions and budget-scoped authorization.
3. One budget per user.
4. Resumable initial setup.
5. One cash/checking-style account with an explicit opening balance.
6. Editable starter categories, plus category creation, rename, and archive behavior needed by the slice.
7. Realized income recorded against the supported account.
8. Categorized spending against the supported account.
9. Monthly category assignments, unassignments, and moves.
10. Canonical RTA, Assigned, Activity, and Available values.
11. Visible negative RTA and explicit correction workflow.
12. Positive availability rollover.
13. Dashboard and monthly summary views.
14. Unit, integration, and primary-journey verification for money equations, isolation, atomicity, idempotency, concurrency, rebuildability, and the main user journey.

### Explicit non-goals

The first slice does not include splits, transfers, credit cards, reconciliation, targets, scheduled transactions, future income, refunds/reimbursements/returns, ordinary transaction edit/delete, cleared/pending/uncleared states, broader overspending/card formulas, shared budgets, multiple budgets per user, or advanced closed-month behavior.

Future-income behavior must not be inferred from realized-income behavior. Deferred formulas and workflows must not leak into this slice through UI affordances, API contracts, or persistence assumptions.

## Product behavior and business rules

- All monetary values are authoritative integer minor units; no floating-point financial calculations are exposed as the source of truth.
- Opening balance and supported realized account activity affect the account balance atomically.
- Income is visible in the account balance first and is not assignable through RTA until the separate explicit release action is performed.
- Assignments and moves conserve funds and do not silently rebalance unrelated categories.
- RTA is visible and explainable. Overassignment is permitted as an explicit state; negative RTA is surfaced for correction rather than hidden or automatically rejected.
- Category `Available` is derived from permitted carryover, `Assigned`, and signed `Activity`; positive availability carries forward.
- Categorized spending reduces the account working balance and contributes signed category activity in the transaction's budget month.
- Every budget-scoped read and write is authorized against the owning user, with non-disclosing handling for foreign resources.
- Financial writes and their derived effects are atomic and safely retryable. Client-provided balances are never authoritative.
- Renaming or archiving preserves historical references; archived accounts/categories cannot receive new applicable activity.
- The configured IANA timezone determines the budget month for date-only transactions, with UTC as the baseline default.

## Affected areas

- **Identity and access:** registration, authentication, session lifecycle, and ownership checks.
- **Budget setup:** resumable setup state, one-budget ownership, opening balance, starter categories, and setup completion/resumption UX.
- **Financial domain:** account balance, realized income, categorized spending, assignments, moves, RTA, category activity, availability, and rollover calculations.
- **Persistence and consistency:** authoritative movement history, database transaction boundaries, idempotent commands, optimistic/concurrent-write protection, and deterministic rebuild support. The exact tables and schema belong to design.
- **API/application services:** budget-scoped commands and read DTOs with stable success/error semantics. Endpoint names and DTO shape belong to spec/design.
- **Web experience:** setup/resume flow, monthly budget view, transaction entry, correction of negative RTA, dashboard, and monthly summary. The canonical engine supplies the values.
- **Verification and operations:** unit, integration, and Playwright coverage; logging/request correlation; safe migration and rollback planning.

## Risks and tradeoffs

| Risk or tradeoff | Containment |
| --- | --- |
| Formula drift between API and web UI creates contradictory money values. | Keep calculations in one authoritative engine; test equations independently; render server-calculated summaries. |
| Partial setup or retry duplication mints or loses money. | Use one database transaction for financial effects, scoped idempotency, optimistic versions, and rebuild tests. |
| Cross-budget leakage exposes or mutates another user's data. | Authorize before every budget-scoped query/command and enforce tenant-scoped constraints. |
| Allowing overassignment may surprise users or be mistaken for a validation failure. | Make negative RTA prominent, explain the state, and provide explicit unassignment/move-back correction without silent changes. |
| Income that is visible in the account but not yet assignable may confuse users. | Clearly distinguish account balance from the RTA pool and define the explicit release action before implementation. |
| A resumable setup can leave incomplete budgets or ambiguous continuation state. | Persist progress safely, make resume deterministic, and define setup completion boundaries during spec/design. |
| Broader YNAB-like requirements pull implementation into unsupported formulas. | Keep the non-goal list explicit and reject/defer unsupported concepts at the product and contract boundaries. |
| Historical summaries become irreproducible if only cached totals are stored. | Preserve authoritative movement/allocation history and treat caches as derived, rebuildable data. |

The principal product tradeoff is choosing a smaller, explainable cash-budget model over premature support for advanced planning and card behavior. This limits near-term breadth but protects correctness and user trust.

## Rollback and containment

- Gate the slice behind the existing application delivery boundary until the end-to-end journey and financial invariants pass.
- Keep migrations additive and reversible where practical; preserve authoritative history during rollback rather than deleting or rewriting money movements.
- If a defect affects derived summaries, disable affected reads or revert to a rebuilt server calculation from authoritative history; never accept client balances as a repair.
- If a command can duplicate or partially apply money effects, stop that command path, preserve the audit/history records, and repair through a controlled rebuild or compensating operation defined by the later design.
- Limit all incident containment to the owning budget and user; do not perform silent cross-category or cross-budget corrections.
- A later implementation plan must include migration rollback details, feature-flag/route containment if used, and a data-rebuild procedure.

## Success criteria

The proposal is successful when the implemented slice can demonstrate that:

1. A new user can register, sign in, create a budget, enter an opening balance, choose/edit starter categories, save partway through setup, and resume later.
2. The user can record realized income and see the account balance increase without that income entering RTA until the explicit release action is taken.
3. The user can record categorized spending in the transaction's configured budget month, with atomic account and category effects.
4. The user can assign, unassign, and move money; assignments conserve minor units; overassignment produces visible negative RTA without silently changing another category.
5. Assigned, Activity, Available, and RTA remain distinct and reconcile to the canonical engine; positive availability rolls into the next month.
6. Dashboard and monthly summary values are consistent with the same server-side calculations and can be rebuilt from authoritative history.
7. A user cannot read or mutate another user's budget, including through identifiers, retries, or concurrent requests.
8. Repeated same-payload commands are safe, conflicting idempotency reuse is rejected, and partial financial writes do not persist.
9. The primary Playwright journey and the mandatory unit/integration matrix cover the supported path and the principal failure/edge cases.
10. Unsupported features are absent or clearly unavailable rather than being represented by partial or misleading behavior.

## Remaining decision gaps for spec/design

1. Define the explicit user action that releases realized income into the RTA pool, including its name, confirmation behavior, repeatability, validation, and history semantics. Do not assume an endpoint or persistence schema at proposal stage.
2. Define the resumable setup state machine and the boundary at which a budget becomes usable.
3. Define the authoritative movement/allocation history model and deterministic rebuild rules.
4. Define exact API contracts, error payloads, idempotency scope, optimistic version behavior, and module dependency enforcement.
5. Define dashboard/month-summary information architecture, responsive behavior, accessibility target, and error copy.
6. Define supported concurrency cases, performance fixture/threshold, CI/coverage policy, and contract-test scope.
7. Confirm the implementation guardrails that keep future income, card formulas, refunds, reconciliation, targets, scheduled generation, and other deferred concepts out of this slice.

The next phase should resolve these gaps at spec/design level while preserving every confirmed rule and non-goal in this proposal.
