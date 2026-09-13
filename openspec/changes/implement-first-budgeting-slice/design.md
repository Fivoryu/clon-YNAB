# Technical Design: Implement the First Budgeting Slice

## Status and decision posture

This design implements the accepted ADR-001 modular-monolith baseline. Statements labeled **Clone decision** preserve approved behavior or existing accepted architecture. Statements labeled **Proposed** are implementation recommendations for task planning, not additional user approval. **Open question** items must not be silently converted into product policy.

The repository currently provides architecture/domain documentation rather than an existing application implementation; this design therefore defines seams without assuming settled source filenames, endpoint names, or database table names.

## Architecture and module boundaries

**Clone decisions:** Use one Next.js/React/TypeScript web application, one NestJS/TypeScript API, one PostgreSQL database, and one canonical Prisma schema/migration owner at the API persistence boundary. Keep the deployment a modular monolith.

API modules and dependencies:

- **Identity:** users, password verification, opaque sessions, authentication middleware. It does not calculate budgets.
- **Budgets/setup:** one-user/one-budget ownership, budget timezone, setup state, and authorization context.
- **Accounts:** the one supported cash/checking account and account-side balance facts.
- **Categories:** category metadata, starter categories, rename/archive lifecycle.
- **Transactions:** realized income and one-category cash/checking spending commands.
- **Planning/engine:** months, allocation movements, income-release semantics, RTA/Assigned/Activity/Available, rollover, and pure calculations.
- **Reports:** owner-authorized dashboard and month-summary queries; it never mutates financial state.

Modules call application services or stable contracts, never another module's repository. The engine is pure TypeScript and depends on domain inputs, not HTTP, Prisma, or React. The web renders API DTOs and does not reimplement equations.

## Authoritative state and data flow

PostgreSQL is authoritative. Preserve immutable, budget-scoped history for:

1. opening balance and account-side realized movements;
2. realized income and its account effect;
3. explicit income-release movements (linking released income to the assignable pool);
4. categorized spending and its account/category effects;
5. assignment, unassignment, and category-to-category move movements; and
6. setup/idempotency outcomes and versions needed to replay commands.

The conceptual records above are not settled table names. Mutable budget, account, and category metadata retains stable identifiers so rename/archive cannot rewrite history. Archived entities cannot receive new applicable writes. A derived month summary/read model may be added for performance, but it is disposable and must be reproducible from the authoritative records.

Write flow:

```text
HTTP request
  -> request ID + DTO validation
  -> opaque-session authentication
  -> owner/budget authorization
  -> idempotency lookup and payload-digest check
  -> application command
  -> pure domain validation/calculation
  -> one PostgreSQL transaction
       compare version / lock relevant budget-month state
       append authoritative effects
       advance version and store command result
       refresh or invalidate derived summary
  -> {data, requestId}
```

Read flow authorizes first, obtains authoritative facts (or a validated derived projection), invokes the same engine/read query used by all consumers, and returns a DTO. A rebuild path must ignore client totals and regenerate the same summary from history.

## Authentication and authorization

Use local email/password registration and sign-in with a well-tested password hash. Create a cryptographically random opaque session token; store only a server-verifiable representation and session metadata/expiry. Send it in an `httpOnly` cookie, `secure` in production, with same-site and CSRF protection appropriate to the deployment. Logout revokes it; expiry is enforced server-side. Do not use long-lived browser tokens.

Every protected request derives the user from the session, then checks ownership/membership before querying a budget-scoped resource. Client-supplied user or budget IDs are selectors, never authority. Invalid credentials and foreign resources must not disclose account/budget existence; foreign resources use the accepted uniform `NOT_FOUND` behavior.

## Resumable setup state machine

**Proposed state machine (requires task-level confirmation):**

```text
NOT_STARTED -> ACCOUNT_PENDING -> CATEGORIES_PENDING -> COMPLETE
                  \                         /
                   ---- saved/resumed -------
```

Budget creation creates a draft and persists setup progress. The required completion boundary is: default/valid IANA timezone, exactly one supported account, an integer opening balance recorded, and at least one active category from the editable starter set or user-created set. Saving any step is allowed; re-entry reads the persisted state and presents the deterministic next step. Category rename/archive/create remains available during setup. Repeated setup submissions use the same idempotency rules and unique ownership constraints, so account, opening movement, and starter categories are not duplicated. Once `COMPLETE`, the budgeting workflow is enabled; incomplete budgets remain resumable and are not exposed as usable budgets.

**Open questions:** final state names, whether zero active categories is permitted, and the exact setup command grouping. These are contract/task decisions, not permission to create extra accounts or budgets.

## Income release and budgeting engine

**Proposed first-slice release design:** recording realized income immediately increases the supported account working balance and appends an income history entry, but contributes zero to RTA until the owner explicitly releases it. The UI should offer a release action for an individual unreleased income entry. The first slice should release the full remaining amount of that entry (no partial release); a release appends one linked release movement, changes no account balance, and makes that amount assignable exactly once. Repeating the same command replays its result; a later attempt to release an already fully released entry is a deterministic no-op/result rather than a second financial effect. This recommendation resolves the proposal's release gap but is not claimed as user-approved policy.

The pure engine receives integer minor-unit facts and returns an explainable summary:

- account working balance = opening balance + realized income - realized spending;
- RTA includes opening assignable cash, explicitly released realized income, permitted prior carry, and subtracts assignments; unreleased income is excluded and spending is not subtracted twice;
- `Available = permitted positive carry + Assigned + signed Activity` for each category/month;
- positive Available becomes deterministic next-month carry; non-positive Available does not become positive carry;
- assignments/unassignments use exact minor units; moves reduce source and increase destination equally;
- overassignment is accepted, leaves a visible negative RTA, and never silently changes another category;
- spending decreases account balance and records negative category Activity in the month selected from the transaction date and the budget's IANA timezone (default `UTC`); event timestamps remain UTC.

The engine rejects unsupported splits, transfers, cards, reconciliation, targets, scheduled transactions, future income, refunds/returns, ordinary edit/delete, cleared/pending/uncleared states, and broader overspending formulas at the application boundary. It must not infer future-income behavior from realized income.

## Transactions, idempotency, and concurrency

Financial commands accept intent and positive amounts, not client-calculated balances. Each first-slice setup/opening, income, spending, assignment, unassignment, move, and release command carries a budget-scoped idempotency identity. The persistence layer stores a canonical payload digest and original result: same key plus same payload replays; same key plus different payload returns `CONFLICT`.

The transaction writes all account, category, allocation/release, history, version, and command-result effects atomically. A failure commits none. **Proposed concurrency mechanism:** lock the affected budget/month row inside the PostgreSQL transaction and compare a client-supplied expected version; increment the version on success and return `CONFLICT` for stale writes. The final isolation/locking detail is an implementation choice, but lost updates are not acceptable. Idempotency lookup and effect creation must be in the same transaction and protected by a database uniqueness constraint.

## API contract

The accepted API conventions are `/api/v1`, DTOs rather than ORM objects, `{data,requestId}` successes, and `{error:{code,message,requestId}}` errors. Stable categories are `UNAUTHENTICATED` (401), `FORBIDDEN` (403), non-disclosing `NOT_FOUND` (404), `VALIDATION_ERROR` (400), `CONFLICT` (409), `INSUFFICIENT_AVAILABLE_FUNDS` (422 where applicable), and `INTERNAL_ERROR` (500).

**Proposed intent surface, not settled endpoint names:** authentication (register/sign-in/sign-out), setup progress, category lifecycle, income, income release, spending, allocation/move, dashboard, and month summary. Exact route names, DTO fields, pagination, and whether the idempotency/version values are headers or body fields remain **Open questions**. OpenAPI must document the selected names and reject unsupported concepts without creating partial effects. Financial success DTOs should include server-calculated affected values and the authoritative version, never accept or return an instruction to persist a client balance.

## Dashboard and month-summary reads

The dashboard queries the authorized usable budget and presents account working balance, RTA, and category/month values with Assigned, signed Activity, Available, and relevant breakdown components distinct. The month-summary query takes a supported month identifier/date, resolves month boundaries using the budget timezone, loads authoritative effects and positive carry history, and runs the canonical engine. Dashboard and month summary share the same read service/engine so they cannot drift. Missing/stale derived data triggers synchronous rebuild or a controlled rebuild path; it never accepts client values as repair input. Layout, responsive breakpoints, WCAG target, and exact error copy remain open.

## Verification strategy

- **Unit:** integer money arithmetic; timezone month resolution; RTA components; Available and positive carry; assignment/unassignment/move conservation; release repeatability; unsupported-feature boundaries.
- **Integration (PostgreSQL):** session expiry/revocation; owner isolation and non-disclosing foreign access; one-budget constraint; setup resume/retry; archived-category rejection; atomic account-plus-category writes; idempotent replay and payload conflict; stale-version conflict; boundary dates; deterministic rebuild after derived data loss.
- **Contract/API:** envelope, status-code, DTO, OpenAPI, and unsupported-command behavior.
- **Playwright:** register/sign in, save partial setup, resume, finish setup, record income and verify unreleased RTA, explicitly release it, assign/overassign and correct negative RTA, record spending, cross a month boundary, and compare dashboard with month summary.

No numeric coverage threshold or CI provider is established; the mandatory matrix above is the delivery gate, with the threshold remaining an **Open question**.

## Migration, rollback, and rollout

Use additive Prisma migrations owned by the API boundary: identity/session support, budget/setup metadata, supported account/category metadata, authoritative financial history, idempotency/version records, and optional derived summaries. Add constraints and indexes with the migration. Do not hard-delete financial history in a rollback. Because no application schema is assumed here, the implementation must produce a migration inventory and verify it against the actual baseline before applying it.

Roll out schema first, then API/domain services, then web flows, behind the existing delivery boundary or a narrowly scoped feature flag. Enable only after invariant, rebuild, isolation, and primary-journey checks pass. On a financial defect, disable the affected command/read path, preserve history, rebuild derived data from authoritative records, and use a reviewed compensating operation rather than silent correction. A backward-compatible API period may be used while the web switches DTOs. Keep request/idempotency identities and redacted diagnostic context for incident tracing.

## Risks and workload

The principal risks are formula drift, duplicate/minted effects, cross-budget leakage, and scope creep into deferred YNAB behavior. The design keeps calculations centralized, history rebuildable, and writes transactional. Exact endpoint/schema naming, release confirmation, setup details, UI accessibility/performance targets, and CI policy remain bounded follow-up decisions. Implementation should be split into reviewable slices and paused before exceeding the 400-line review budget rather than adding deferred features.

## Key Learnings

- The first slice is safest when authoritative movements, not client totals or cached summaries, drive every financial read.
- Realized income and assignable income are distinct states; release must be explicit and idempotent.
- The modular-monolith boundary is sufficient if the engine stays pure and module repositories remain private.
- Unresolved product policy must remain labeled as proposed/open instead of being hidden in endpoint or schema choices.
