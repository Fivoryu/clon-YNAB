# MVP Scope

## Objective

Deliver a small, understandable budgeting product that demonstrates the YNAB-style planning loop without pretending to reproduce the entire commercial service.

> **Implementation status note (2026-09):** this document preserves the original bounded first-slice decisions while tracking later delivery separately. Since that first slice, the repository has delivered transaction edit/delete, multiple accounts and transfers, payee/memo plus history search, manual CSV import/export, category targets, cleared-state transitions with manual reconciliation, and scheduled and repeating transactions. The account projection exposes its cleared balance; reports intentionally omit cleared and reconciliation fields. Remaining deferred and open behavior is identified below; first-slice limits are not claims about current delivery.

Priority and delivery status are separate: **P0**, **P1**, and **P2** express importance; delivery status is **first slice**, **later MVP slice**, or **deferred/out of MVP**. A P0 later-MVP item is not part of the bounded first slice.

## In scope

The following is the bounded first vertical slice. It is a **Clone decision** for this academic clone, not an official YNAB formula or parity claim.

### Account and budget setup

- Register and sign in with local email/password and server-managed opaque sessions. Passwords use well-tested hashing; logout revokes the session, expiry is server-configured, and no long-lived browser tokens are used.
- Create one user-owned budget; foreign budgets/resources return uniform non-disclosing `NOT_FOUND` and future roles/collaboration remain deferred.
- Create, rename, archive, and list one cash/checking-style account.
- Enter an explicit opening balance.
- Create, rename, archive, and list categories while preserving historical references.
- Choose the active planning month. Store one explicit IANA budget timezone, default `UTC`, with no timezone changes after creation; transaction dates are date-only business dates and event timestamps are UTC.

### Budgeting

- Show the bounded RTA equation: realized opening cash plus realized cash inflows plus explicitly supported prior carry, minus current assignments.
- Do not count future income as realized and do not double-subtract spending already funded by an assignment.
- Assign, unassign, and move assigned money between categories without minting money.
- Show `Assigned`, signed `Activity`, and `Available` as distinct values.
- Permit an explicit negative RTA state without clamping or silently repairing it; correct it through an unassignment or move-back allocation to the unassigned pool.
- Carry positive `Available` into the next planning month with deterministic calculation.

### Transactions

- Record one realized income command and one categorized spending command on the supported cash/checking-style account.
- Require positive input amounts. Financial-event status is `POSTED` or `WORKING`; cleared state is a separate delivered dimension, and `WORKING` items cannot be cleared. A `PENDING` transaction status is unsupported.
- Income increases the realized account balance and assignable pool; spending decreases the account working balance and signed category `Activity`.
- Keep account and plan effects atomic or not at all, rebuildable deterministically from authoritative transaction history, and independent of client-provided balances.
- Require idempotency keys for setup/opening movement, assignments, moves, realized income, and categorized spending: the same key and payload replay the same logical result, while the same key with a different payload returns `CONFLICT`. Stale writes use optimistic version checks and return `CONFLICT`.

### Basic feedback

- Dashboard with the supported account balance and category availability.
- Monthly summary with RTA and category values.
- Validation errors that explain what the user must correct.

## Out of scope for MVP

The broader MVP remains a later MVP slice roadmap. The existing heading is retained for link compatibility; the following are outside the bounded first vertical slice and must not be read as delivered by it.

- Future-income behavior and assignments for future months (later MVP slice).
- Splits remain later MVP slice/P1. Transfers and ordinary transaction edit/delete were delivered in subsequent slices; all are outside the bounded first vertical slice.
- Refunds, reimbursements, and returns (later MVP slice).
- Closed-month corrections or propagation (later MVP slice; **Open question**).
- Cleared/uncleared transitions and cleared-balance effects are delivered for supported income, spending, and transfers. Account projections expose the cleared balance; report responses deliberately do not expose cleared or reconciliation fields.
- Manual account reconciliation and cleared-history locking are delivered. A mismatch without explicit confirmation changes nothing; a confirmed mismatch requires a reason and creates one non-assignable adjustment. Unlocking, reverting, or correcting reconciled history remains open.
- Category targets and scheduled and repeating transactions were delivered in later slices; both never create money automatically. A schedule cannot be edited, so editing repetition remains unsupported.
- Cash/card overspending rollover and credit-card payment state (later MVP slice/P1; policy **Open question**).
- Cards and basic credit-card behavior, including UC-16, which is later MVP slice/P1 scope.

- Automatic bank synchronization.
- Real financial institution credentials.
- Investment, retirement, loan, and HSA tracking.
- Mobile-native application.
- Multiple currencies in one budget.
- Multi-user collaboration beyond a future-ready membership model.
- Advanced reports and forecasting.
- Notifications and email.
- AI recommendations.
- Editing repetition of a schedule, pausing a schedule, and weekly, annual, or custom cadences (unsupported).
- Advanced credit-card workflows and full parity with YNAB.

## User journeys

### Journey 1: create a first plan

```text
Register
  → create budget
  → create categories
  → add checking account with current balance
  → see available-to-assign amount
  → assign money to priorities
```

### Journey 2: record a purchase

```text
Open account
  → add payee, date, amount, category
  → save
  → account balance decreases
  → category activity decreases
  → category available amount refreshes
```

### Journey 3: adapt the plan

```text
Open month
  → move money from one category to another
  → verify both category availability values
  → preserve an auditable allocation movement
```

### Journey 4: transfer money

This journey was outside the bounded first vertical slice and has since been delivered in a later slice.

```text
Select source and destination accounts
  → enter amount and date
  → save transfer
  → source decreases
  → destination increases
  → no ordinary spending category is reduced
```

## Entry gate for the first vertical slice

**Clone decision:** No implementation starts until the Group 3 decisions are traced to concrete acceptance criteria. After this documentation update and read-only verification, the next phase is bounded SDD/OpenSpec for the first vertical slice. Cards, splits, and full formulas remain deferred; closed-month correction, reconciled-history unlocking/reverting/correction, report presentation, and resolving the account-versus-Ready-to-Assign divergence remain open. These are not entry-gate blockers for the bounded first slice.

## Acceptance criteria for the first vertical slice

These are **Clone decision** criteria for the bounded first vertical slice, not official YNAB acceptance criteria:

- A user cannot read or change another user's budget.
- The user can create one budget with a cash/checking-style account and an explicit opening balance.
- Starting balance and realized income are reflected in the account and bounded RTA.
- Future income is not treated as realized money.
- Assignments and category moves cannot create money; assigned, activity, and available remain distinct.
- A positive-amount categorized spending transaction in posted/working state decreases the account working balance and signed category Activity atomically, and is not double-subtracted from RTA when already funded by an assignment.
- A positive-amount realized income transaction increases the realized account balance and assignable pool atomically.
- Retrying setup/opening movement, assignments, moves, realized income, or categorized spending with the same idempotency key and payload replays the same logical result; reusing the key with a different payload returns `CONFLICT`.
- Ready to Assign can be explicitly negative, is not clamped or silently repaired, and has an unassignment/move-back correction path to the unassigned pool.
- Positive category Available rolls into the next planning month deterministically.
- Category create/rename/archive preserves historical references. **Open question:** Move/hide/delete/migration behavior remains unresolved.
- The dashboard and month summary expose explainable RTA, account, and category values.
- The main journey is covered by authorization, atomicity, precision, and deterministic rebuild tests.

## Later-slice acceptance criteria

The following criteria preserve the distinction between the bounded first slice, subsequently delivered capabilities, and still-open later behavior:

- Posted, non-reconciled edits replace affected account and plan effects atomically; confirmed deletion removes those effects atomically and records the minimum authorized audit identity. Closed-month propagation, stale-version details, and unlocking, reverting, or correcting reconciled history remain **Open question**.
- Later-MVP split lines sum exactly to the parent amount in integer minor units, change the account once, apply category effects per line, and commit atomically.
- **Delivered later-slice criterion:** Transfers link same-budget source/destination sides with equal opposite amounts, no ordinary spending Activity, atomicity, and no-duplicate retry behavior.
- **Delivered later-slice criterion:** A posted income, spending, or transfer item transitions between `UNCLEARED` and `CLEARED` without changing its financial fields; `WORKING` items cannot be cleared, and `RECONCILED` items are locked. Each account projection exposes the server-derived cleared balance beside its working balance; report responses omit cleared and reconciliation fields.
- **Delivered later-slice criterion:** A matching external balance records the reconciliation and locks cleared history without an adjustment. A mismatch without explicit confirmation returns `CONFLICT`, discloses the difference, and changes nothing. A confirmed mismatch requires a reason, records exactly one adjustment for the difference, and locks the history; the adjustment changes account state only and is not assignable.
- **Open question:** Reconciled-history unlock/revert/correction, import or duplicate matching against reconciled history, presenting cleared balance or reconciliation state in reports, audit retention/immutability, and resolving the account-versus-Ready-to-Assign divergence remain open. The adjustment may cause that divergence; this phase does not resolve it inside the plan.
- **Delivered later-slice criterion:** Category targets and scheduled and repeating transactions were delivered in later slices; neither creates money automatically, and a schedule has no effect on any account or plan value until its occurrence is generated.

## Suggested delivery slices

1. Project setup, authentication boundary, and database connection.
2. Budget, category groups, categories, and account setup.
3. Money representation and available-to-assign calculation.
4. Assign and move money within a month.
5. Realized income and categorized spending; transaction edit/delete and transfers were delivered in later slices, while splits remain deferred.
6. Dashboard and monthly summary.
7. **Delivered (MVP expanded/P1):** Cleared state and manual reconciliation; reconciled-history correction and report presentation remain open.
8. Category targets, and scheduled and repeating transactions, were delivered in later slices.

Each slice should leave the application runnable and documented. Do not start the next slice while the current domain behavior is still ambiguous.

## Success definition

The MVP succeeds if a reviewer can understand where money is, what each amount is for, record a realistic purchase, adjust priorities, and verify the resulting balances without manually repairing database state.
