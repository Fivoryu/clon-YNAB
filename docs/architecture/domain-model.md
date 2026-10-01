# Domain Model

## Purpose

This is the first conceptual model for the clone. It is intentionally independent of database tables so that business rules can be discussed before implementation.

Priority and delivery status are separate: **P0**, **P1**, and **P2** express importance; delivery status is **first slice**, **later MVP slice**, or **deferred/out of MVP**. This model does not turn a later-MVP P0 behavior into first-slice delivery.

## Bounded areas

**Clone decision:** The bounded first vertical slice was one authenticated user's budget, one cash/checking-style account with an explicit opening balance, categories, realized income/spending, monthly allocation, RTA/Available, dashboard/month summary, and positive rollover. Its transaction boundary was one realized income command and one categorized spending command with positive input amounts and `POSTED`/`WORKING` status. Later phases have delivered multiple accounts and transfers, ordinary transaction edit/delete, cleared-state transitions, and manual reconciliation as separate account-history capabilities. Credit cards, loans, broader account types, splits, future income, refunds/reimbursements/returns, closed-month corrections, pending transaction status, and overspending remain deferred or open; scheduled and repeating transactions remain deferred.

### Identity and access

- `User` owns or joins budgets.
- `BudgetMember` connects a user to a budget with a role.
- Every query and command must verify budget membership. The first slice uses one user-owned budget and returns uniform non-disclosing `NOT_FOUND` for foreign budgets/resources; future roles and collaboration remain deferred/Open question.

### Budget planning

- `Budget` is the tenant and the user's plan.
- `BudgetMonth` represents a planning period such as 2026-09. A budget stores one explicit IANA timezone, defaulting to `UTC` in the first slice; timezone changes after creation are not permitted in this slice.
- `CategoryGroup` organizes categories.
- `Category` represents a job for money.
- `Allocation` records money assigned to a category for a month.
- `Target` belongs to a category and describes an optional desired amount, refill, set-aside, or balance-by-period behavior. It is a planning instruction, not money and not a transaction.

### Accounts and ledger

- `Account` represents a place where money is held. The first slice supports only a cash/checking-style account.
- `Payee` represents the merchant or recipient.
- `Transaction` records an economic event.
- `TransactionSplit` supports a transaction assigned to several categories.
- `Transfer` links the two sides of an account-to-account movement.

### Automation and integration

- `ScheduledTransaction` describes a future or repeating register item. Before its occurrence, it has no plan effect; occurrence handling and generation policy are clone decisions.
- `ImportBatch` and `ImportRow` are future integration concepts, not first-MVP requirements.

### ScheduledTransaction behavior

A `ScheduledTransaction` is a future or repeating register item with no plan effect before its occurrence. Generated transactions are normally uncleared, except for the documented cash-account exception. Generation must be idempotent. **Open question:** Define the exact generation timing, cash-account exception handling, and other generation policy before the deferred feature is implemented.

## Relationship sketch

```text
User ──< BudgetMember >── Budget
                              │
         ┌────────────────────┼───────────────────────┐
         ▼                    ▼                       ▼
 CategoryGroup ──< Category  Account ──< Transaction ──< TransactionSplit
                              │             │                  │
                              └─────────────┴── Transfer        └── Category

 Budget ──< BudgetMonth ──< Allocation >── Category
 Category ──< Target
 Budget ──< ScheduledTransaction
 Budget ──< Payee
```

## Aggregate boundaries

The first implementation should treat these as separate application-level aggregates:

| Aggregate | Main commands | Important consistency boundary |
|---|---|---|
| Budget structure | Create/rename/archive group or category | Category belongs to the selected budget. |
| Account | Create, rename, reconcile, close | Working and cleared balances are derived from effective account history; reconciliation is a delivered account command. |
| Transaction | Create, edit, delete, split, transfer | Account and budget effects change atomically. |
| Monthly plan | Assign, unassign, move money | Allocation changes never mint money; the first slice permits an explicit negative Ready to Assign state and corrects it through unassignment or a move-back allocation to the unassigned pool. |
| Scheduled transaction | Create, pause, generate | Generated transactions must be idempotent. |

**Clone decision:** The first slice permits an explicit negative Ready to Assign state; it is not clamped or silently repaired, and correction is through an unassignment or a move-back allocation to the unassigned pool.

**Open question:** Later command-specific policies for allowing or rejecting overassignment remain unresolved.

The exact aggregate choice can change after the first domain tests. It should not be dictated only by ORM convenience.

**Clone decision:** The first-slice category lifecycle is create, rename, and archive while preserving historical references. **Open question:** Moving, hiding, deleting, and migrating categories or historical assignments require a later policy.

## State and calculation vocabulary

For a category and month, distinguish these values:

- **Assigned** — money deliberately allocated to the category in that month.
- **Activity** — categorized spending or returns affecting the category during that month.
- **Available** — money currently available for that category after permitted carryover, assignments, and signed activity. The first-slice equation is `Available = permitted carryover + Assigned + signed Activity`.
- **Target** — desired future state; not money and not a transaction.

For an account, distinguish:

- **Cleared balance** — the opening balance, treated as cleared, plus the signed effects of effective account events whose derived state is `CLEARED` or `RECONCILED`. A reconciliation adjustment is included in the account balance projection as an account-state correction.
- **Uncleared balance** — the signed effects of effective account events in `UNCLEARED` state; the opening balance is not uncleared.
- **Working balance** — the opening balance plus the signed effects of all effective account events, regardless of cleared state.
- **Cleared state** — the derived, never-stored value `RECONCILED` when `reconciled` is true, otherwise `CLEARED` when `cleared` is true, otherwise `UNCLEARED`; the underlying `cleared` and `reconciled` flags are persisted. The invariant is `reconciled ⇒ cleared ⇒ not WORKING`.
- **Surface split** — the account projection exposes `clearedBalanceMinor` beside its working balance. Embedded report accounts deliberately omit that field, and reports expose no cleared or reconciliation state.

For the budget, distinguish:

- **Ready to Assign** — the amount available to assign. The first-slice equation is `RTA = realized opening cash + realized cash inflows + explicitly supported prior carry - current assignments`; it can be negative and must remain visible for correction.
- **Cash overspending** — overspending funded from cash, displayed separately from credit-card overspending and handled distinctly at rollover.
- **Credit-card overspending** — overspending that leaves additional card debt rather than moving money to the payment category.

**Observed:** Cash overspending is red, credit-card overspending is yellow, and cash is taken first in mixed spending. Planned credit-card spending moves money to its payment category. Sources: [Overspending in YNAB](https://support.ynab.com/en_us/overspending-in-ynab-a-guide-ryWoxEyi) and [Credit Card Overspending](https://support.ynab.com/en_us/credit-card-overspending-an-overview-HkMGpSbJs).

**Observed:** Positive Available rolls over; cash overspending is deducted from the next month's Ready to Assign, and credit overspending becomes an underfunded credit-card payment alert. Source: [When the Month Rolls Over](https://support.ynab.com/en_us/when-the-month-rolls-over-a-guide-rkyyd6qC9).

**Clone decision:** The first-slice RTA and Available equations above are bounded clone decisions, not official YNAB formulas. Spending already funded by an assignment is not subtracted from RTA a second time.

**Open question:** Full-MVP formulas for future assignments, positive card balances, overspending, refunds, closed months, and credit-card payment movement remain unresolved. The observations above do not by themselves define those formulas.

## Transaction types

### Income

**Clone decision:** A first-slice income command accepts a positive amount in posted/working state, adds money to the supported account's working balance, and increases the budget's realized assignable pool. It carries an idempotency key; the same key and command payload replay the same logical result, while a different payload returns `CONFLICT`.

### Categorized spending

**Clone decision:** A first-slice spending command accepts a positive amount in posted/working state, decreases the supported cash/checking-style account's working balance, and decreases signed category `Activity` for one category. `Available` is derived from authoritative history. It carries the same scoped idempotency rule as income. Split categories and other transaction variants remain later MVP slice behavior.

### Transfer

**Clone decision — delivered beyond the bounded first slice:** A transfer links two distinct accounts in the same budget, decreases the source and increases the destination by equal opposite amounts, does not create ordinary category spending Activity, and commits both sides atomically. Retrying the same transfer request must not duplicate its effects. This P0 behavior was outside the bounded first slice.

### Refund or return

An **Open question** for later slices. Refunds and returns are outside the bounded first slice. The safest later model may be a categorized inflow that increases the selected category's activity and the account balance, but the final behavior must be documented with examples and tests. Official guidance treats credit-card refunds and returns as a distinct workflow: [Credit Card Refunds and Returns](https://support.ynab.com/en_us/credit-card-refunds-and-returns-H1J7qDWkj).

### Edit and delete

**Clone decision — later MVP slice:** Editing a posted, non-reconciled transaction may change its amount, payee, category, date, memo, repetition, or account; the account and budget effects must be recalculated and replaced atomically. Cleared-state changes use the separate account-history transition, not ordinary transaction editing.

**Clone decision — later MVP slice:** Deleting a posted, non-reconciled transaction requires explicit confirmation, removes its account and plan effects atomically, and records the minimum authorized audit identity. This follows the observed public behavior in [How to Edit and Delete Transactions](https://support.ynab.com/en_us/how-to-edit-and-delete-transactions-BJG4oS1s).

**Clone decision:** Hard deletion of reconciled history is prohibited by default, and ordinary edit/delete paths return `CONFLICT`.

**Open question:** Closed-month propagation, stale-version details, reconciled correction mechanism, audit retention period, export/report presentation, and audit immutability remain unresolved in [ADR-002](../decisions/ADR-002-financial-history.md).

### Starting balance and reconciliation adjustment

**Clone decision:** The first slice supports an explicit opening balance as realized cash; it is not an invented opening pool. The delivered reconciliation adjustment is a non-assignable account-state correction, not ordinary merchant spending. A mismatch adjustment requires explicit confirmation and a reason; its effect is reflected in the account's working and cleared balances, including the aggregate working account-balance field in a summary/report. It is not exposed as a separate adjustment measure and does not enter category activity, assignments, or Ready to Assign. Reports expose no cleared balance or cleared/reconciliation state, and the RTA inputs and formula remain unchanged. The resulting account-balance-versus-Ready-to-Assign divergence is documented and remains unresolved inside the plan.

## Critical use case: record spending

The bounded first slice uses one category and the supported cash/checking-style account:

```text
User selects account
  → enters date, payee, amount, and category
  → system validates amount and ownership
  → system updates account-side and category-side effects atomically
  → system returns updated account balance and category availability
```

Validation rules:

- amount is positive at input for both first-slice commands and its transaction type determines the domain effect;
- date is a date-only business date interpreted in the explicit budget timezone;
- all referenced entities belong to the same budget;
- split totals equal the transaction amount for later split support;
- first-slice setup/opening movement, assignments, moves, income, and spending carry an idempotency key: same key plus same payload replays the same logical result, while a different payload returns `CONFLICT`;
- archived accounts cannot receive new ordinary transactions;
- posted/working is the only supported transaction state in this slice;
- the first slice accepts only the supported cash/checking-style account and one category for spending;
- cleared/uncleared transitions and manual reconciliation are delivered beyond the first-slice transaction-creation flow as separate account-history operations; only `POSTED` items can be cleared, and `PENDING` is not a supported transaction status;
- transfers and ordinary edit/delete are also delivered outside that first-slice flow; splits, cards, refunds, reimbursements, and returns remain later MVP policies.

## Critical use case: assign money

```text
User selects budget month and category
  → enters amount to assign or move
  → system checks available money and category state
  → system writes allocation movement
  → system recalculates the month summary
```

Assignments must be modeled as auditable movements or immutable entries rather than silently overwriting a balance. The storage shape is an implementation decision; preserving history is a domain requirement.

## Reconciliation behavior

**Observed:** Public guidance describes comparing an account with bank state, confirming the cleared balance, locking reconciled transactions, and reducing duplicate imports. This is an observation about the external product, not a claim that this clone matches imports against reconciled history. Source: [Reconciling Accounts](https://support.ynab.com/en_us/reconciling-accounts-a-guide-BJFE3fHys).

**Clone decision — delivered beyond the bounded first slice:** Manual reconciliation compares the server-derived cleared balance with an external balance the owner confirms. A match records the reconciliation and locks cleared history without an adjustment. A mismatch without explicit confirmation returns `CONFLICT`, discloses the difference, and changes nothing. A confirmed mismatch requires a reason and creates exactly one non-assignable account-state adjustment for the exact difference before locking the cleared history. Archived accounts are rejected.

The adjustment changes the reconciled account's working and cleared balances; its working-balance effect is reflected in the aggregate account-balance field in a summary/report, but it is not exposed as a separate adjustment measure. It does not enter Ready to Assign or category values, and the RTA inputs and formula remain unchanged. The resulting divergence between aggregate account balance and Ready to Assign is a documented limit; this phase does not resolve it inside the plan. The account projection exposes the cleared balance, but report-embedded accounts and report responses do not expose cleared balance, cleared/reconciliation state, or a separate adjustment field.

Reconciled history is terminal in this phase: ordinary edits, deletes, and cleared-state transitions are rejected, and there is no unlock, revert, or correction path.

**Open question:** Unlocking, reverting, or correcting reconciled history; import and duplicate matching against reconciled history; presenting cleared balance or reconciliation state in reports; and resolving the account-versus-Ready-to-Assign divergence remain open. Do not treat this conceptual model as a claim about YNAB's internal implementation.

## Consistency requirements

- **Clone decision:** PostgreSQL is authoritative, and one canonical Prisma schema/migration owner belongs to the API persistence boundary. Use one PostgreSQL transaction for a command that changes both account and budget effects; commit atomically or not at all.
- **Clone decision:** Recalculate derived values from authoritative movements when correctness is more important than a micro-optimization.
- **Clone decision:** If derived balances are cached, provide a deterministic rebuild path from authoritative transaction history and other authoritative movements.
- **Clone decision:** First-slice setup/opening movement, assignments, moves, income, and spending carry idempotency keys. The same key plus the same command payload replays the same logical result; the same key plus a different payload returns `CONFLICT`. Stale writes use optimistic version checks and return `CONFLICT`.
- **Clone decision:** Minimal diagnostic identity for a first-slice financial command includes the transaction identity and request/idempotency identity.
- **Clone decision — later MVP slice:** Minimum audit identity for transaction history and deletion includes the actor, transaction identity, request/correlation identity where applicable, timestamp, and reason when available, with visibility limited to the authorized relevant budget/user boundary.
- **Clone decision:** Never use client-calculated balances as authoritative writes.
- **Open question:** Broader later-slice idempotency coverage, audit retention period, deletion-history export/report presentation, audit immutability, and reconciled corrections remain later policies; import and scheduled-generation identity is not generalized to this slice.

## Questions to resolve next

1. Full-MVP formulas beyond the bounded first-slice RTA and Available equations.
2. Whether a month can be closed or edited indefinitely.
3. Exact later MVP slice formulas for Ready to Assign, Available, rollover, and credit-card payment movement.
4. Overspending correction behavior for cash and credit-card accounts.
5. Refund and reimbursement semantics.
6. Unlocking, reverting, or correcting reconciled history; import and duplicate matching against reconciled history; future report presentation; and any policy for resolving the account-versus-Ready-to-Assign divergence.
7. Deletion versus voiding for reconciled transactions, including any compensating adjustment or controlled unlock.
8. Audit retention period, export/report presentation, and immutability.
