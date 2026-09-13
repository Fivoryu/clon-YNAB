# Actors, Permissions, and Use Cases

## Purpose and boundary

This document defines the actors, permissions, and behavior-oriented use cases for the academic YNAB-style budgeting clone. It preserves the proposed MVP boundary in [MVP Scope](mvp-scope.md): create a budget, register realized money, assign it to priorities, record transactions, observe balances, and adjust priorities.

This is a product contract for an independent clone. It is not a description of YNAB's private database, source code, or complete permissions model.

## Scope and classification policy

### MVP scope

**Clone decision:** The bounded first vertical slice supports this deliberately narrow loop:

```text
Authenticate
  → create one user-owned budget
  → create a cash/checking-style account with an explicit opening balance
  → create, rename, and archive categories
  → query realized-cash Ready to Assign
  → assign, unassign, or move money between categories
  → record one realized income and one categorized spending path
  → observe account/category/month summaries
  → carry positive Available into the next planning month
```

**Clone decision:** Broader MVP use cases remain documented for later MVP slices. Splits, transfers, ordinary transaction edit/delete, cards/credit-card behavior (including UC-16), future income, refunds/reimbursements/returns, closed-month corrections, reconciliation, and cleared-state behavior are not part of this first loop.

**Clone decision:** The first slice is intentionally manual. It does not require bank credentials, automatic synchronization, collaboration, targets, scheduled transactions, advanced reports, mobile-native behavior, investments, loans, HSA tracking, or multiple currencies.

**Clone decision:** The first implementation supports one user-owned budget per user, while its boundary remains compatible with a future membership model. A user may only read or change budgets for which the authorization layer grants access; foreign budgets and resources return a uniform non-disclosing `NOT_FOUND`.

### Classification vocabulary

Every substantive statement in this document uses one of these classifications:

- **Observed** — public product behavior described in the project research. It does not imply knowledge of YNAB's internal implementation. The official-source trail is summarized in [YNAB domain research](../research/ynab-domain.md).
- **Inferred** — a conceptual relationship derived from public observations; it is not an official implementation detail.
- **Clone decision** — an explicit product or domain rule proposed for this independent academic clone. The budget-engine rationale and working equations are in [Budget engine research](../research/budget-engine.md).
- **Open question** — an unresolved policy that must be decided before the affected behavior is implementation-ready. An open question must not be silently converted into an assumption.

**Clone decision:** When an observed behavior is included in the MVP, the clone must define its own storage, authorization, error, and calculation behavior without presenting those implementation choices as YNAB facts.

**Clone decision:** P0, P1, and P2 express priority, not delivery timing. Delivery status is stated separately as first slice, later MVP slice, or deferred/out of MVP; a P0 later-MVP use case is not part of the bounded first loop.

### Money and calculation boundary

**Clone decision:** Monetary values are represented as integer minor units. Floating-point arithmetic is not authoritative.

**Clone decision:** For the bounded first slice, the budget engine is authoritative for `Ready to Assign`, `Assigned`, `Activity`, `Available`, positive rollover, and their derived summaries. Account and plan effects for one command commit atomically.

The first-slice equations are semantic clone equations, not official YNAB formulas:

```text
Available = permitted carryover + Assigned + signed Activity
```

```text
RTA = realized opening cash
    + realized cash inflows available to the plan
    + explicitly supported prior carry
    - current assignments
```

**Clone decision:** Future income is not realized, and spending already funded by an assignment is not subtracted from RTA a second time. **Open question:** Full-MVP treatment of future assignments, positive credit-card balances, cash overspending deductions, credit-card payment movement, refunds, closed months, and special rollover cases remains unresolved. These equations are a bounded clone decision, not an official YNAB formula.

## Actors and permissions

### Actor summary

| Actor | Role in the clone | MVP status |
|---|---|---:|
| Authenticated user | Operates an authorized budget and performs all MVP commands | Required |
| Budget member | Future-ready membership boundary for collaboration and role-based access | Boundary only; collaboration deferred |
| Budget system/engine | Authoritative calculator and consistency boundary | Required |
| Bank/financial institution | External reference for manual reconciliation only | Reference only |
| Scheduler/generation process | Future process for recurring register items | Deferred |
| Administrator/financial reviewer | Possible oversight role with no assumed MVP authority | Open question |

### Authenticated user

**Clone decision:** The first slice authenticates with local email/password and server-managed opaque sessions. Passwords use a well-tested hash; cookies are `httpOnly`, `secure` in production, same-site/CSRF protected as applicable, explicitly server-expiring, and revoked on logout. No long-lived browser tokens are used. External identity providers are deferred/out of MVP.

**Clone decision — goals:** An authenticated user can establish a plan, register money that has actually arrived, assign it to categories, record economic events, inspect resulting balances, and adapt priorities without losing financial history.

**Clone decision — permissions in the bounded first slice:** Subject to budget authorization, the user may:

- create and configure one user-owned MVP budget;
- create, rename, archive, and list the supported cash/checking-style account;
- enter an explicit opening balance;
- create, rename, archive, and list categories while preserving historical references;
- select the active planning month;
- query realized-cash RTA and monthly category values;
- assign, unassign, and move assigned money between categories;
- record one realized income path and one categorized spending path;
- view the dashboard and monthly summary.

**Clone decision:** Editing/deleting/splitting/transferring transactions, cleared state, reconciliation, and overspending/card workflows remain documented for later MVP slices.

**Clone decision:** The user cannot grant themselves access to another budget, read another tenant's records, treat future income as realized money, or use a client-calculated balance as an authoritative write. The browser timezone cannot decide a transaction's month boundary.

**Clone decision:** All user commands are evaluated against the authorized budget and current authoritative state. Failure uses one of the stable error categories in [System architecture](../architecture/system-overview.md): `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `VALIDATION_ERROR`, `CONFLICT`, `INSUFFICIENT_AVAILABLE_FUNDS`, or `INTERNAL_ERROR`.

**Open question:** Whether one user may eventually own multiple budgets, and whether the first slice should technically permit that even though the MVP journey creates one budget per user, must be resolved before broadening the membership model.

### Budget member

**Clone decision:** `BudgetMember` is a future-ready boundary connecting a user to a budget with a role. It is useful for tenant authorization even while the MVP has one active user per budget.

**Clone decision:** Collaboration, invitations, concurrent editing UX, member-specific permissions, and shared ownership are outside the MVP. The model must not imply that a future member automatically has every owner permission.

**Open question:** Define member roles, invitation lifecycle, ownership transfer, removal, audit visibility, and conflict handling before enabling collaboration.

### Budget system/engine

**Clone decision — authority:** The budget system/engine is the authoritative calculator for:

- RTA;
- monthly `Assigned`, `Activity`, and `Available`;
- positive category carryover and next-month summaries;
- account and plan effects of first-slice transactions, assignments, moves, and unassignments.

**Open question:** Cash versus credit overspending, card alerts, future assignments, and other full-MVP engine behavior remain later MVP slice policy questions.

**Clone decision — consistency:** A command that changes account-side and plan-side state either commits all required effects or commits none. The engine rebuilds derived values deterministically from authoritative history.

**Clone decision — isolation:** Every account, category, transaction, allocation, month, and summary is tenant-scoped. Records from one budget cannot affect another budget's calculations.

**Clone decision:** The engine does not act as a human actor and does not decide unresolved product policies. It applies only documented rules and returns stable errors when a command is invalid, unauthorized, conflicting, or unsupported.

### Bank or financial institution

**Observed YNAB behavior:** Financial institutions are relevant to account state, cleared transactions, and reconciliation in the public product behavior described by the research.

**Clone decision:** The bank or financial institution is an external reference only in the MVP. The user manually compares the clone's cleared balance with an external bank state; the clone does not receive bank credentials or automatic transactions.

**Clone decision:** A future import provider may supply rows or transactions, but imported data must pass the same tenant, validation, idempotency, reconciliation, and budget-engine rules as manual data.

**Open question:** Provider selection, credentials, import matching, duplicate detection, pending transactions, and institution-specific failures are deferred until bank import is accepted as a product scope item.

### Scheduler or generation process

**Observed YNAB behavior:** Scheduled transactions are future or repeating register items and have no plan effect before occurrence, as summarized in [Budget engine research](../research/budget-engine.md).

**Clone decision:** Scheduling is deferred. If introduced, the generation process must create an ordinary transaction only at the defined occurrence and must be idempotent: processing the same occurrence twice cannot duplicate account or plan effects.

**Open question:** Define generation timing, timezone, missed occurrences, retries, cash-account cleared-state behavior, edits to generated items, and whether a generated item retains a stable source occurrence key.

### Administrator or financial reviewer

**Open question:** The MVP does not assume an administrator or financial reviewer actor. No elevated read, correction, deletion, unlock, or audit-review permission is granted by implication.

**Open question:** If academic review or support needs require this actor, define whether the role can inspect tenant data, approve reconciled corrections, review audit events, or operate only through user-provided exports. Any such role requires explicit least-privilege and tenant-boundary rules.

## Prioritized use cases

### P0 — core MVP loop

**Clone decision:** This P0 catalogue includes the broader MVP roadmap. P0 indicates MVP priority/foundation, not immediate first-slice delivery. The bounded first-slice subset is the loop documented above; later P0 use cases must not be read as delivered by that slice.

1. **UC-01 Authenticate** — register/sign in and establish an authenticated session.
2. **UC-02 Create and configure budget** — create the plan, active month, opening accounts, category groups, and categories.
3. **UC-03 Manage accounts and categories** — maintain the places where money is held and the jobs assigned to money.
4. **UC-04 Query Ready to Assign** — calculate and explain the budget-level assignable amount.
5. **UC-05 Assign money** — allocate realized money to a category for a planning month.
6. **UC-06 Move category money** — adjust priorities by moving allocation between categories.
7. **UC-07 Record income** — add realized money to an owned account and the assignable pool.
8. **UC-08 Record categorized spending** — record ordinary spending and update account and category effects atomically.
9. **UC-09 Record split transaction** — divide one spending transaction among categories while preserving the total.
10. **UC-10 Record transfer** — move money between owned accounts without ordinary spending activity.
11. **UC-11 Edit transaction** — recalculate all affected account and plan effects atomically.
12. **UC-12 Delete posted transaction** — remove ordinary posted effects with confirmation and audit protection.
13. **UC-13 Dashboard and monthly summary** — observe balances, category values, activity, and recent events.
14. **UC-14 Monthly rollover** — carry permitted values into the next planning month.
15. **Authorization and isolation behavior** — apply to every use case: only authorized budgets are visible or mutable.

**Clone decision:** UC-16 basic credit-card behavior is outside the bounded first vertical slice and is later P1 scope. Its public observations remain documented below and in the research.

**Observed YNAB behavior:** The public behavior summarized in the research distinguishes RTA, category assignment, activity, available money, transactions, transfers, overspending, rollover, and reconciliation.

**Clone decision:** The P0 list is the minimum product contract. It does not require parity with all account types, card workflows, reports, imports, or collaboration features.

### P1 — controlled financial history and basic card behavior

- **UC-15 Cleared state and manual reconciliation** — later MVP behavior, including reconciliation locks and audit events.
- **Protect reconciled transactions** from hard deletion by default, following the proposed policy in [ADR-002](../decisions/ADR-002-financial-history.md).
- **UC-16 Basic credit-card behavior** — later P1 behavior, including the public cash-versus-credit overspending distinction and the limited underfunded payment consequence documented by the research; outside the first vertical slice.

**Open question:** The exact credit-card payment formula, refunds, adjustments, and correction path are not yet implementation-ready.

### P2 — planning automation

- Targets and target status/suggestions.
- Scheduled and repeating transactions.

**Observed YNAB behavior:** Targets belong to categories and scheduled entries do not affect the plan before occurrence.

**Clone decision:** These are planning aids or future register automation, not permission to create money or assign money automatically without a documented command.

### Deferred

- Bank synchronization and import providers.
- Advanced reports and forecasting.
- Multi-user collaboration and invitations.
- Notifications and email.
- AI recommendations.
- Mobile-native application.
- Investments, loans, HSA tracking, and multiple currencies.
- Full credit-card parity and advanced card workflows.

## Detailed use cases

The scenarios below use the same template. “Actor” identifies the initiating actor; the budget system/engine is an involved system actor in every command that changes financial state.

### UC-01 — Authenticate

- **Actor:** Authenticated user (before authentication, a prospective user).
- **Priority:** P0.
- **Goal:** Establish an authenticated identity so the user can access only authorized budgets.
- **Preconditions:** The user has valid registration or sign-in credentials; the authentication service is available.
- **Main success scenario:**
  1. The user submits registration or sign-in data.
  2. The system validates the request and authenticates the identity.
  3. The system creates or refreshes a protected server-managed opaque session.
  4. The system resolves the user's authorized budget memberships.
  5. The system returns an authenticated result without exposing unrelated budgets.
- **Alternate/error flows:**
  - Invalid or incomplete input → `VALIDATION_ERROR`.
  - Credentials do not authenticate → `UNAUTHENTICATED`.
  - Duplicate registration or incompatible identity state → `CONFLICT`.
  - Service failure → `INTERNAL_ERROR`.
- **Dependencies:** Local email/password authentication, well-tested password hashing, server-managed opaque sessions, budget membership authorization, secure cookie handling, explicit server expiry, and logout revocation.
- **Classification:** **Clone decision:** authenticated access is mandatory and all budget queries require server-side authorization. **Clone decision:** local email/password with server-managed opaque sessions is accepted for the first slice; cookies are protected and sessions expire/revoke as documented. **Open question:** future roles and collaboration.

### UC-02 — Create and configure budget

- **Actor:** Authenticated user.
- **Priority:** P0.
- **Goal:** Establish a usable first-slice budget with an active planning month, one cash/checking-style account, explicit opening money, and categories.
- **Preconditions:** The user is authenticated; the user is permitted to create the MVP budget; the requested month and names are valid.
- **Main success scenario:**
  1. The user requests a budget with a name, active planning month, and explicit IANA budget timezone (default `UTC` in the first slice).
  2. The system creates the tenant-scoped budget and membership/ownership boundary.
  3. The user creates category groups and categories.
  4. The user creates the supported cash/checking-style account and enters its explicit opening balance.
  5. The engine records realized opening cash and calculates RTA.
  6. The system returns the configured budget and initial summaries.
- **Alternate/error flows:**
  - User is unauthenticated → `UNAUTHENTICATED`.
  - User cannot create or access the requested budget → `FORBIDDEN`.
  - Duplicate or missing setup entity → `CONFLICT` or `VALIDATION_ERROR`.
  - Invalid amount, month, account type, or name → `VALIDATION_ERROR`.
  - A referenced entity cannot be found → `NOT_FOUND`.
  - Atomic setup fails → `INTERNAL_ERROR`; no partial account/plan state is accepted.
- **Dependencies:** UC-01, budget membership, account/category lifecycle, integer minor units, atomic persistence, idempotency, budget timezone, and budget engine.
- **Classification:** **Observed:** onboarding starts with categories, accounts, and money currently available. **Clone decision:** the first slice uses one cash/checking-style account and an explicit opening balance; the clone does not invent an opening pool. **Clone decision:** setup/opening movement uses an idempotency key with same-payload replay and different-payload `CONFLICT`. The budget timezone defaults to `UTC` and cannot change after creation in the first slice. **Open question:** whether setup is one transaction or a resumable wizard and which broader account types are supported later.

### UC-03 — Manage accounts and categories

- **Actor:** Authenticated user.
- **Priority:** P0.
- **Goal:** Maintain the account and category structure used by the plan.
- **Preconditions:** The user is authorized for the budget; the budget exists; the requested account, group, or category is in that budget.
- **Main success scenario:**
  1. The user creates, renames, archives, or lists an account, category group, or category.
  2. The system validates names, lifecycle state, and tenant ownership.
  3. The system preserves historical references and recalculates affected summaries when required.
  4. The system returns the updated structure.
- **Alternate/error flows:**
  - Missing session or budget access → `UNAUTHENTICATED` or `FORBIDDEN`.
  - Entity absent → `NOT_FOUND`.
  - Empty/invalid name, illegal account/category state, or archived target used for new activity → `VALIDATION_ERROR`.
  - Rename/archive conflicts with an existing name or in-flight state → `CONFLICT`.
  - Calculation or persistence failure → `INTERNAL_ERROR`.
- **Dependencies:** Authorization, category/account lifecycle, transaction references, historical/audit model, budget engine.
- **Classification:** **Observed:** categories are organized into groups and accounts represent where money is held. **Clone decision:** the first slice supports category create, rename, and archive while preserving historical references; archived categories cannot receive new assignments. **Open question:** moving, hiding, deleting, and migrating categories with assignments, activity, targets, or historical transactions.

### UC-04 — Query Ready to Assign

- **Actor:** Authenticated user.
- **Priority:** P0.
- **Goal:** See the budget-level amount currently available to assign and the components that explain it.
- **Preconditions:** The user is authorized for the budget; the selected planning month exists; authoritative account, transaction, assignment, and rollover history is readable.
- **Main success scenario:**
  1. The user selects a budget month.
  2. The system loads the explicit opening cash balance, realized cash inflows, explicitly supported prior carry, and current assignments.
  3. The engine calculates RTA using the bounded first-slice equation.
  4. The system returns RTA, its components, and category summaries without treating future income as realized or funded spending as a second RTA deduction.
- **Alternate/error flows:**
  - No session or budget access → `UNAUTHENTICATED` or `FORBIDDEN`.
  - Month absent → `NOT_FOUND`.
  - Invalid month selector → `VALIDATION_ERROR`.
  - Inconsistent authoritative history → `CONFLICT` or `INTERNAL_ERROR` according to the detected failure.
- **Dependencies:** UC-01/02, budget engine, integer money arithmetic, authoritative transaction and allocation history, month rollover.
- **Classification:** **Observed:** RTA is a cash-based unassigned amount and may be negative. **Clone decision:** The first-slice RTA equation uses realized opening cash, realized cash inflows, explicitly supported prior carry, and current assignments; negative RTA remains visible rather than being clamped. **Open question:** positive-card-balance qualification, future assignments, cash overspending deductions, card-payment state, and whether later policies block assignments.

### UC-05 — Assign money

- **Actor:** Authenticated user.
- **Priority:** P0.
- **Goal:** Give realized available money a job in a category and planning month.
- **Preconditions:** The user is authorized; the budget month and category exist and are writable; the amount is valid; the category is not archived for new assignments.
- **Main success scenario:**
  1. The user selects a month and category and enters an assignment amount or adjustment with an idempotency key.
  2. The system validates the amount and ownership.
  3. The engine checks RTA, existing allocations, and the first-slice policy that permits an explicit negative RTA.
  4. The system records an auditable allocation or unassignment movement.
  5. The engine recalculates RTA and the category's Assigned and Available values.
  6. The system returns the updated allocation and summary.
- **Alternate/error flows:**
  - A first-slice assignment may create a negative RTA state → success with visible negative RTA, not silent clamping or repair.
  - A later reject-overassignment policy may return `INSUFFICIENT_AVAILABLE_FUNDS`; that policy is outside this slice.
  - Invalid amount/month/category → `VALIDATION_ERROR`.
  - Unauthorized or cross-budget category → `FORBIDDEN` or `NOT_FOUND` without leaking existence.
  - Concurrent plan change → `CONFLICT`.
  - Failure during account/plan persistence → `INTERNAL_ERROR` with no partial movement.
- **Dependencies:** UC-04, category lifecycle, allocation history, integer money arithmetic, atomicity, authorization.
- **Classification:** **Observed:** assigning money changes the plan and negative RTA can represent overassignment. **Clone decision:** the first slice permits visible negative RTA, assignments never mint money, allocation movements remain auditable, and assignment/unassignment commands use idempotency keys with same-payload replay and different-payload `CONFLICT`. **Open question:** later command-specific overassignment policies and future-assignment behavior.

### UC-06 — Move category money

- **Actor:** Authenticated user.
- **Priority:** P0.
- **Goal:** Adjust priorities by moving assigned money from one category to another.
- **Preconditions:** The user is authorized; source and destination categories belong to the same budget/month; both are valid for the operation; the source has enough movable assignment under the selected policy.
- **Main success scenario:**
  1. The user chooses source category, destination category, month, amount, and an idempotency key.
  2. The system validates that source and destination are distinct and tenant-scoped.
  3. The engine checks source allocation and category lifecycle state.
  4. The system records one auditable movement with equal source reduction and destination increase.
  5. RTA remains conserved by the move, and both category summaries are recalculated.
- **Alternate/error flows:**
  - Source lacks movable assigned money → `INSUFFICIENT_AVAILABLE_FUNDS` or `VALIDATION_ERROR`, according to the final command policy.
  - Same category, invalid amount, archived destination, or invalid month → `VALIDATION_ERROR`.
  - Cross-budget references → `FORBIDDEN` or `NOT_FOUND`.
  - Concurrent movement → `CONFLICT`.
  - Atomic persistence failure → `INTERNAL_ERROR`.
- **Dependencies:** UC-05, monthly plan, allocation history, category lifecycle, atomicity, deterministic rebuild.
- **Classification:** **Observed YNAB behavior:** users can adjust category allocations when priorities change. **Clone decision:** a move redistributes existing assigned money and preserves RTA rather than creating money; same-payload retries replay and different payloads return `CONFLICT`. **Open question:** whether moving money out of an overspent category is allowed, and how partial cash/credit overspending is corrected.

### UC-07 — Record income

- **Actor:** Authenticated user.
- **Priority:** P0.
- **Goal:** Record one realized income command so it appears in an owned account and increases the assignable pool.
- **Preconditions:** The user is authorized; the account exists, is owned by the budget, and can receive transactions; the positive amount, date, and source/payee are valid; the command carries an idempotency key.
- **Main success scenario:**
  1. The user selects an account and enters a positive amount, date-only business date, source/payee, and optional memo.
  2. The system validates the account, date-only business date in the budget timezone, posted/working state, positive amount, tenant boundary, and idempotency key.
  3. The engine records the inflow and updates the account working balance.
  4. The engine includes realized money in RTA according to the bounded first-slice policy.
  5. The system returns the posted transaction, updated authoritative account balance, and RTA.
- **Alternate/error flows:**
  - Account archived or not found → `VALIDATION_ERROR` or `NOT_FOUND`.
  - Cross-budget account → `FORBIDDEN` or `NOT_FOUND`.
  - Non-positive/invalid amount or date → `VALIDATION_ERROR`.
  - Same idempotency key with the same command payload → replay the same logical result without duplicate effects.
  - Same idempotency key with a different command payload → `CONFLICT`.
  - Partial update risk → `INTERNAL_ERROR`; account and plan effects must roll back together.
- **Dependencies:** UC-02/03, transaction ledger, budget engine, integer minor units, atomicity, scoped idempotency.
- **Classification:** **Observed YNAB behavior:** realized income adds money to the available pool; future income is not treated as available. **Clone decision:** only posted/realized inflows affect RTA, the account working balance and plan-side effect commit atomically, and the server-calculated balance is authoritative. **Open question:** broader manual-command idempotency, refund, reimbursement, and positive credit-card balance treatment.

### UC-08 — Record categorized spending

- **Actor:** Authenticated user.
- **Priority:** P0.
- **Goal:** Record a normal purchase against one category and update the account and monthly plan.
- **Preconditions:** The user is authorized; source account and category belong to the same budget; account is writable; the positive amount, date, and payee are valid; the command carries an idempotency key.
- **Main success scenario:**
  1. The user selects the supported cash/checking-style account and enters date-only business date, payee, positive amount, category, and memo.
  2. The system validates ownership, lifecycle, posted/working state, positive amount, date-only business date in the budget timezone, and idempotency key.
  3. The engine records the realized transaction and decreases the account working balance.
  4. The engine records negative category Activity and recalculates Available.
  5. The system commits both effects atomically and returns updated values; spending already funded by an assignment is not subtracted from RTA again.
- **Alternate/error flows:**
  - Archived account/category or invalid fields → `VALIDATION_ERROR`.
  - Cross-budget entity → `FORBIDDEN` or `NOT_FOUND`.
  - Cleared, pending, uncleared, or reconciliation behavior requested → later MVP slice policy; do not imply first-slice support.
  - Same idempotency key with the same command payload → replay the same logical result without duplicate effects.
  - Same idempotency key with a different command payload → `CONFLICT`.
  - Engine/persistence failure → `INTERNAL_ERROR` with no one-sided effect.
- **Dependencies:** UC-03, budget engine, transaction history, integer arithmetic, atomicity, scoped idempotency.
- **Classification:** **Observed:** spending changes account balances and category activity; public cash and credit overspending observations are retained for later scope. **Clone decision:** the first slice uses one category on the supported cash/checking-style account, positive input, posted/working state, authoritative server-calculated balances, and atomic account/plan effects. **Open question:** broader manual-command idempotency, splits, transfers, ordinary edit/delete, refunds, card-payment behavior, mixed-spending allocation, and overspending classification.

### UC-09 — Record split transaction

- **Actor:** Authenticated user.
- **Priority:** P1.
- **Delivery status:** Later MVP slice; outside the bounded first vertical slice.
- **Goal:** Record one purchase whose amount is distributed among multiple categories.
- **Preconditions:** The user is authorized; source account is writable; at least two valid category lines exist; each line has a valid amount; the sum of lines equals the transaction total.
- **Main success scenario:**
  1. The user enters one account transaction and multiple category lines.
  2. The system validates that every category belongs to the budget and that line totals equal the transaction amount exactly in integer minor units.
  3. The engine records the parent transaction and split lines.
  4. The engine applies each line's category Activity and computes any later MVP slice funding classification.
  5. The account and all category effects commit atomically.
  6. The system returns the parent transaction and updated summaries.
- **Alternate/error flows:**
  - Split totals do not equal the transaction total → `VALIDATION_ERROR`.
  - Duplicate category lines, invalid amounts, missing category, archived category, or malformed line set → `VALIDATION_ERROR`.
  - Cross-budget references → `FORBIDDEN` or `NOT_FOUND`.
  - Protected reconciled transaction edit → `CONFLICT`.
  - Persistence failure → `INTERNAL_ERROR` with no partial lines.
- **Dependencies:** UC-08, integer minor units, category lifecycle, transaction aggregate, overspending engine, atomicity.
- **Classification:** **Clone decision:** split lines must equal the parent total exactly in integer minor units; each line contributes to category Activity while the account changes once, and the command is atomic. This P1 use case is a later MVP slice item. **Open question:** whether a split may include card-payment categories or special account types in the basic MVP.

### UC-10 — Record transfer

- **Actor:** Authenticated user.
- **Priority:** P0.
- **Delivery status:** Later MVP slice; outside the bounded first vertical slice.
- **Goal:** Move money between two owned accounts without recording ordinary category spending.
- **Preconditions:** The user is authorized; source and destination accounts belong to the same budget; both are writable; accounts are distinct; amount and date are valid.
- **Main success scenario:**
  1. The user selects source and destination accounts and enters amount/date/memo.
  2. The system validates ownership and account lifecycle.
  3. The engine records linked transfer sides.
  4. The source account decreases and destination account increases by the same minor-unit amount.
  5. The engine does not reduce an ordinary spending category or count the transfer as spending activity.
  6. Both sides commit atomically.
- **Alternate/error flows:**
  - Same account, invalid amount/date, archived account, or missing account → `VALIDATION_ERROR` or `NOT_FOUND`.
  - Cross-budget destination → `FORBIDDEN` or `NOT_FOUND`.
  - Duplicate transfer request → `CONFLICT`.
  - Partial two-account update risk → `INTERNAL_ERROR`; no side may commit alone.
- **Dependencies:** UC-03, transfer link, account ledger, authorization, atomicity, idempotency.
- **Classification:** **Observed:** accounts represent where money is held and transfers are distinct from ordinary spending. **Clone decision:** a transfer changes two same-budget accounts by equal opposite amounts, has no ordinary category requirement, commits atomically, and cannot be duplicated by retry; this P0 use case is a later MVP slice item. **Open question:** credit-card payment classification and whether specialized card transfers need a separate presentation.

### UC-11 — Edit transaction

- **Actor:** Authenticated user.
- **Priority:** P0.
- **Delivery status:** Later MVP slice; outside the bounded first vertical slice.
- **Goal:** Correct a posted transaction while keeping account and plan effects consistent.
- **Preconditions:** For the later-MVP ordinary path, the transaction is posted, exists in an authorized budget, and is not protected by reconciliation policy; replacement fields are valid. Reconciled correction remains an open question.
- **Main success scenario:**
  1. The user opens a posted transaction and changes one or more fields: amount, payee, category, date, cleared state, memo, account, or split lines.
  2. The system validates all new references and split totals.
  3. The engine computes the old and new account/plan effects.
  4. The system replaces the authoritative transaction state and recalculates all affected summaries atomically.
  5. The system returns the updated transaction and affected balances.
- **Alternate/error flows:**
  - Transaction or replacement reference unavailable → `NOT_FOUND`.
  - Unauthorized budget → `FORBIDDEN`.
  - Invalid fields, split totals, archived references, or amount → `VALIDATION_ERROR`.
  - Reconciled/protected transaction → `CONFLICT`.
  - Concurrent edit → `CONFLICT`.
  - Recalculation failure → `INTERNAL_ERROR` with old state preserved.
- **Dependencies:** UC-08/09/10, authoritative history, reconciliation protection, atomicity, deterministic rebuild, audit policy.
- **Classification:** **Observed YNAB behavior:** public guidance says posted transactions can be edited and account/plan effects change accordingly. **Clone decision:** edits are atomic replacements of the affected effects and cannot rely on client-calculated balances; editing repetition belongs to the deferred P2 DU-02 Scheduled and repeating transactions use case. **Open question:** exact correction path for reconciled transactions and how edits propagate across closed or later months.

### UC-12 — Delete posted transaction

- **Actor:** Authenticated user.
- **Priority:** P0.
- **Delivery status:** Later MVP slice; outside the bounded first vertical slice.
- **Goal:** Remove an ordinary posted transaction and its account/plan effects after explicit confirmation.
- **Preconditions:** For the later-MVP ordinary path, the transaction is posted, exists in an authorized budget, and is not protected by reconciliation policy; the user explicitly confirms deletion. Reconciled correction remains an open question.
- **Main success scenario:**
  1. The user requests deletion and receives a confirmation that balances and plan effects will change.
  2. The user confirms and supplies a reason when available.
  3. The system records an audit event with actor, transaction identity, request/correlation identity where applicable, timestamp, and reason when available, visible only within the authorized budget/user boundary.
  4. The engine removes the transaction's account and plan effects atomically.
  5. The system recalculates affected summaries and returns the result.
- **Alternate/error flows:**
  - No confirmation → no mutation; return a validation-level interaction result.
  - Transaction absent → `NOT_FOUND`.
  - Unauthorized budget → `FORBIDDEN`.
  - Reconciled/protected transaction → `CONFLICT`; use the explicit void/adjustment policy if available.
  - Concurrent deletion or stale version → `CONFLICT`.
  - Atomic deletion/audit failure → `INTERNAL_ERROR`; effects remain unchanged.
- **Dependencies:** UC-11, audit history, reconciliation policy, transaction ledger, atomicity, budget engine. See [ADR-002](../decisions/ADR-002-financial-history.md).
- **Classification:** **Observed YNAB behavior:** deleting a transaction removes its account and plan effects. **Clone decision:** later-MVP ordinary deletion of a posted, non-reconciled transaction requires confirmation and an audit event; reconciled transactions cannot be hard-deleted by default and ordinary paths return `CONFLICT`. **Open question:** whether reconciled correction uses void, compensating adjustment, controlled unlock, or another policy.

### UC-13 — Dashboard and monthly summary

- **Actor:** Authenticated user.
- **Priority:** P0.
- **Goal:** Observe where money is, what each category can still do, recent activity, and the current month summary.
- **Preconditions:** The user is authorized; the selected budget and month exist; authoritative records are available.
- **Main success scenario:**
  1. The user opens the dashboard or selects a planning month.
  2. The system queries the engine for first-slice RTA, the supported account balance, category Assigned/Activity/Available, and recent realized transactions.
  3. The system shows monthly totals without treating derived client values as authoritative; overspending views are later MVP slice behavior.
  4. The user can navigate to the source transaction, category, or account for correction.
- **Alternate/error flows:**
  - No session or budget access → `UNAUTHENTICATED` or `FORBIDDEN`.
  - Month not found → `NOT_FOUND`.
  - Invalid filter/date → `VALIDATION_ERROR`.
  - Derived summary cannot be rebuilt consistently → `INTERNAL_ERROR` and no fabricated values.
- **Dependencies:** UC-04, transaction/account/category queries, budget engine, deterministic rebuild, tenant isolation.
- **Classification:** **Observed:** the product loop makes category availability and actual transactions visible for planning. **Clone decision:** first-slice dashboard values are projections from authoritative history and expose Assigned, Activity, Available, and RTA separately; overspending views remain later scope. **Open question:** exact dashboard layout, report totals, timezone boundary, and performance cache policy.

### UC-14 — Monthly rollover

- **Actor:** Authenticated user viewing a new month; budget system/engine performs the calculation.
- **Priority:** P0.
- **Goal:** Open the next planning month while preserving positive Available as permitted carryover. Cash/card overspending consequences are later MVP slice behavior.
- **Preconditions:** The budget exists; the current month and next month are valid; current authoritative history can be calculated.
- **Main success scenario:**
  1. The user selects or reaches the next planning month.
  2. The engine calculates each category's ending Available.
  3. Positive Available becomes permitted carryover.
  4. New-month Assigned starts at zero; future assignments are later MVP slice behavior.
  5. The system returns the new-month summary without minting money.

  Cash overspending deductions and credit-card payment state are not calculated by the bounded first slice.
- **Alternate/error flows:**
  - Invalid month or unavailable budget → `NOT_FOUND`.
  - Historical inconsistency or concurrent rollover operation → `CONFLICT`.
  - Unresolved special case (refund, card payment, closed month) → `VALIDATION_ERROR` or an explicit unsupported-policy response; do not silently guess.
  - Engine failure → `INTERNAL_ERROR`.
- **Dependencies:** UC-04/05/08, category availability, deterministic rebuild, integer arithmetic.
- **Classification:** **Observed:** positive Available rolls forward; public cash/card rollover observations are retained for later scope. **Clone decision:** the first slice carries positive Available deterministically and keeps Assigned, Activity, and Available distinct. **Open question:** cash overspending deductions, credit-card payment formula/state, closed-month propagation, refunds, partial correction, and future assignments.

### UC-15 — Cleared state and manual reconciliation

- **Actor:** Authenticated user; external bank/financial institution is a reference, not an integrated actor.
- **Priority:** P1.
- **Delivery status:** Later MVP slice; outside the bounded first vertical slice.
- **Goal:** Compare an account with an external bank state, confirm the cleared balance, and protect reconciled history.
- **Preconditions:** The user is authorized; the account exists; the user has an external bank balance or statement; transactions have cleared-state values.
- **Main success scenario:**
  1. The user marks applicable transactions cleared or reviews already-cleared transactions.
  2. The system calculates the account cleared balance.
  3. The user enters or confirms the external bank cleared balance.
  4. The system validates that the values reconcile according to the chosen policy.
  5. The system records a reconciliation event and locks reconciled transactions by default.
  6. The system returns the confirmed balance and audit reference.
- **Alternate/error flows:**
  - Account or transaction unavailable → `NOT_FOUND`.
  - Unauthorized account → `FORBIDDEN`.
  - Invalid external amount or cleared-state change → `VALIDATION_ERROR`.
  - Cleared balance does not match → `CONFLICT` or a documented adjustment path; do not silently create money.
  - Attempt to edit/delete protected history → `CONFLICT`.
  - Audit/persistence failure → `INTERNAL_ERROR`.
- **Dependencies:** UC-03/11/12, account ledger, cleared/uncleared balances, audit history, reconciliation lock policy.
- **Classification:** **Observed YNAB behavior:** public guidance describes comparing account state with bank state, confirming cleared balance, locking reconciled transactions, and reducing duplicate-import risk. **Clone decision:** MVP expanded/P1 reconciliation is manual and records an audit event; reconciled transactions are protected from hard deletion by default. **Open question:** adjustment transaction, unlock, correction, matching, and import behavior.

### UC-16 — Cash and credit overspending

- **Actor:** Authenticated user records spending; budget system/engine classifies the result.
- **Priority:** P1.
- **Delivery status:** Later MVP slice; outside the bounded first vertical slice.
- **Goal:** Detect and explain a category shortage without hiding whether it was funded from cash or credit.
- **Preconditions:** The transaction is valid and posted; the category's month and account funding type are known; the engine can calculate Available and funding source.
- **Main success scenario:**
  1. The user records categorized or split spending through UC-08 or UC-09.
  2. The engine calculates category Available after Activity.
  3. If the category is short, the engine classifies cash-funded shortage separately from credit-funded shortage.
  4. The system displays cash overspending as red and credit overspending as yellow, following the public behavior summarized in the research.
  5. At rollover, the engine applies the distinct cash deduction or credit-card payment consequence.
  6. The user can correct priorities through UC-06 or the documented card/cash correction path.
- **Alternate/error flows:**
  - Invalid account/category funding type → `VALIDATION_ERROR`.
  - Mixed funding cannot be classified under the selected policy → `CONFLICT` or an explicit open-policy response; never silently misclassify.
  - Unauthorized record → `FORBIDDEN` or `NOT_FOUND`.
  - Calculation failure → `INTERNAL_ERROR`.
- **Dependencies:** UC-06/08/09/14, account types, category Available, RTA, rollover, credit-card payment state.
- **Classification:** **Observed:** cash overspending is red, credit-card overspending is yellow, mixed spending is cash-first, and rollover consequences differ. **Clone decision:** UC-16 preserves these public observations for a later P1 slice and does not imply first-slice support. **Open question:** deterministic mixed-spending algorithm, exact card-payment behavior, partial corrections, and supported account types.

## Deferred use cases

### DU-01 — Targets and target status

- **Actor:** Authenticated user; budget engine calculates status.
- **Priority:** P2.
- **Goal:** Express a desired category state such as set-aside, refill, or balance-by-period and show a suggested amount or shortfall.
- **Reason deferred:** Targets add planning semantics and date/period rules after the core ledger and allocation loop are trustworthy.
- **Boundary:** **Observed YNAB behavior:** targets belong to categories and target types differ. **Clone decision:** a target is a planning instruction, not money, an assignment, or a transaction; evaluating it must not change balances. **Open question:** MVP target subset, carryover, partial months, skipped months, and suggestion timing.

### DU-02 — Scheduled and repeating transactions

- **Actor:** Authenticated user creates the schedule; future scheduler/generation process creates occurrences.
- **Priority:** P2.
- **Goal:** Define future/repeating register entries and generate ordinary transactions at occurrence.
- **Reason deferred:** Scheduling requires occurrence timing, retries, timezone handling, edit semantics, and idempotent generation.
- **Boundary:** **Observed YNAB behavior:** no plan effect exists before occurrence. **Clone decision:** a generated occurrence follows ordinary transaction rules and must be idempotent. **Open question:** exact generation policy, missed occurrences, and cleared-state exception.

### DU-03 — Bank import

- **Actor:** Future import provider; authenticated user reviews or confirms imported data.
- **Priority:** Deferred.
- **Goal:** Retrieve, deduplicate, match, and post institution transactions without exposing credentials to the clone's ordinary domain actors.
- **Reason deferred:** It requires provider integrations, credential security, retries, pending/posted matching, rate limits, duplicate handling, and reconciliation workflows.
- **Boundary:** **Clone decision:** manual entry and manual reconciliation are sufficient for MVP. **Open question:** provider, OAuth/token storage, import batch model, matching confidence, and user approval rules.

### DU-04 — Advanced reporting and forecasting

- **Actor:** Authenticated user; budget engine supplies authoritative read models.
- **Priority:** Deferred.
- **Goal:** Analyze trends, forecasts, and historical reports beyond the monthly summary.
- **Reason deferred:** Reports must be derived from stable ledger and rollover semantics; building them first would risk presenting uncertain formulas as authoritative.
- **Boundary:** **Clone decision:** MVP exposes dashboard and monthly summary only. **Open question:** report definitions, closed-month semantics, forecast assumptions, and whether future assignments count as forecast inputs.

### DU-05 — Multi-user collaboration

- **Actor:** Future budget member, owner, or explicitly defined collaborator.
- **Priority:** Deferred.
- **Goal:** Share a budget while preserving role-based permissions and understandable concurrent edits.
- **Reason deferred:** Collaboration requires invitations, membership roles, audit attribution, concurrent command handling, conflict resolution, and privacy decisions.
- **Boundary:** **Clone decision:** `BudgetMember` is a future-ready authorization boundary, but the MVP has no collaboration workflow. **Open question:** roles, invitations, ownership, removal, visibility, and whether all members may mutate financial history.

## Cross-cutting dependencies and invariants

### Authentication and authorization

- **Clone decision:** Every budget-scoped query and command verifies authentication and budget membership/ownership on the server.
- **Clone decision:** Unauthorized access must not reveal whether a foreign budget or record exists. Use `UNAUTHENTICATED`, `FORBIDDEN`, or `NOT_FOUND` according to the established API policy.
- **Open question:** Final role matrix once collaboration or reviewer access is accepted.

### Money preservation and precision

- **Clone decision:** Use integer minor units for accounts, transactions, assignments, activity, available values, targets, and comparisons.
- **Clone decision:** Assignments and category moves redistribute existing money; no successful command mints money.
- **Clone decision:** Only realized money can increase current assignable money. Future income is not realized by a forecast, target, or scheduled entry before occurrence.

### Atomicity

- **Clone decision:** Account effects, category effects, allocation movements, audit events required by the command, and transfer sides commit in one consistency boundary where they represent one user command.
- **Clone decision:** A failed command leaves authoritative state unchanged; derived values are recalculated from the unchanged history.

### Authoritative history

- **Clone decision:** Transactions, split lines, transfer links, allocation movements, rollover inputs, reconciliation events, and relevant audit events are authoritative history or references to it.
- **Clone decision:** Cached summaries may exist only as derived data and must have a deterministic rebuild path.
- **Open question:** Exact retention, event immutability, and audit detail for edits, deletes, reconciliation, and allocation moves.

### Budget engine

- **Clone decision:** The engine owns RTA, Assigned, Activity, Available, rollover, overspending classification, and account/plan consistency calculations.
- **Clone decision:** The engine exposes enough components to explain a summary and diagnose a correction; the UI must not independently recalculate authoritative balances.
- **Open question:** Final formulas and edge cases listed in [Budget engine research](../research/budget-engine.md), especially positive card balances, mixed spending order, refunds, future assignments, closed months, and card payments.

### Account and category lifecycle

- **Clone decision:** Every referenced account and category belongs to the selected budget and has a valid lifecycle state for the command.
- **Clone decision:** Historical transactions remain explainable after rename or archive; archival does not silently erase history.
- **Open question:** Delete versus archive, category moves, hidden categories, historical assignment migration, and account closure behavior.

### Idempotency and concurrency

- **Clone decision:** First-slice mutating financial commands (setup/opening movement, assignments, moves, UC-07 realized income, and UC-08 categorized spending) carry an idempotency key. The same key plus the same command payload replays the same logical result; the same key plus a different payload returns `CONFLICT`.
- **Clone decision:** Stale concurrent writes return `CONFLICT` rather than overwriting authoritative financial history.
- **Open question:** Broader idempotency coverage for later-slice commands, transfer creation, import processing, and scheduled generation remains unresolved; this slice does not generalize the rule to deferred behavior.

### Stable error categories

The API uses these stable categories rather than raw database errors:

- `UNAUTHENTICATED` — no valid authenticated session/token.
- `FORBIDDEN` — authenticated but not authorized for the budget or operation.
- `NOT_FOUND` — requested resource is unavailable under the API's non-disclosing lookup policy.
- `VALIDATION_ERROR` — input or lifecycle state violates a command rule.
- `CONFLICT` — stale, duplicate, protected, or concurrently changed state.
- `INSUFFICIENT_AVAILABLE_FUNDS` — an assignment or move cannot be satisfied under the active funds policy.
- `INTERNAL_ERROR` — unexpected service or persistence failure without exposing sensitive internals.

**Clone decision:** Error responses include a request identifier for debugging without exposing passwords, tokens, bank credentials, or unnecessary financial payloads, consistent with [System architecture](../architecture/system-overview.md).

## Pre-implementation questions

The following decisions must be answered before the affected use case is considered implementation-ready:

1. What later/full-MVP RTA formula and edge-case treatment is required for account qualification, positive card balances, future assignments, prior overspending, and other deferred cases?
2. Does the command reject overassignment, permit negative RTA, or vary by command and planning month?
3. What exact category Available formula and permitted carryover representation will be authoritative?
4. Which account types count as cash, credit card, or other for overspending and RTA?
5. How is mixed cash/credit spending classified when transaction order differs?
6. What is the exact credit-card payment behavior for planned spending, card payments, refunds, and credit overspending?
7. How are refunds, reimbursements, returns, and opening adjustments modeled?
8. Can a user edit or assign in a prior month, and how do changes propagate into later months?
9. Can a month be closed? If so, what is locked and how are corrections represented?
10. What happens to assignments, activity, availability, targets, and history when categories are renamed, moved, hidden, archived, or deleted?
11. What is the reconciled-transaction correction path: void, compensating adjustment, controlled unlock, or another policy?
12. **Clone decision:** Later-slice audit identity minimally includes actor, transaction identity, request/correlation identity where applicable, timestamp, and reason when available, with authorized visibility. **Open question:** retention period, export/report presentation, and immutability.
13. Which member roles, if any, will be supported after the MVP, and what is the minimum permission matrix?
14. What is the supported initial account-type set, and are credit-card accounts required for the first runnable vertical slice?
15. Which target behaviors and scheduled-transaction behaviors belong in the next milestone?
16. What broader idempotency coverage and concurrency policy applies to later manual commands, imports, and generated transactions? The first-slice command contract is accepted.
17. What DST, scheduled-occurrence cutoff, and historical-timezone-change policy applies after the first slice? The first slice uses an explicit UTC-default budget timezone with no changes after creation.
18. Which summary values must be explainable down to transaction/allocation movements in the UI?
19. Which later role/collaboration policies apply after the first slice? Foreign budget/resource access uses uniform non-disclosing `NOT_FOUND` in the first slice.
20. The first-slice acceptance scenarios and mandatory unit/integration/Playwright matrix are recorded in the MVP and NFR documents; later-slice coverage remains to be refined.

## Related project documents

- [MVP Scope](mvp-scope.md) — accepted MVP boundary and user journeys.
- [YNAB domain research](../research/ynab-domain.md) — public behavior observations and source trail.
- [Budget engine research](../research/budget-engine.md) — terminology, semantic equations, invariants, and unresolved formula questions.
- [Domain model](../architecture/domain-model.md) — conceptual entities and consistency requirements.
- [System architecture](../architecture/system-overview.md) — security boundary and stable error categories.
- [ADR-002: Preserve Financial History While Allowing Posted-Transaction Deletion](../decisions/ADR-002-financial-history.md) — proposed deletion and reconciliation protection policy.
