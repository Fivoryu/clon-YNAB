# Domain Model

## Purpose

This is the first conceptual model for the clone. It is intentionally independent of database tables so that business rules can be discussed before implementation.

## Bounded areas

### Identity and access

- `User` owns or joins budgets.
- `BudgetMember` connects a user to a budget with a role.
- Every query and command must verify budget membership.

### Budget planning

- `Budget` is the tenant and the user's plan.
- `BudgetMonth` represents a planning period such as 2026-09.
- `CategoryGroup` organizes categories.
- `Category` represents a job for money.
- `Allocation` records money assigned to a category for a month.
- `Target` describes an optional desired amount or date.

### Accounts and ledger

- `Account` represents a place where money is held.
- `Payee` represents the merchant or recipient.
- `Transaction` records an economic event.
- `TransactionSplit` supports a transaction assigned to several categories.
- `Transfer` links the two sides of an account-to-account movement.

### Automation and integration

- `ScheduledTransaction` describes a recurring or future transaction template.
- `ImportBatch` and `ImportRow` are future integration concepts, not first-MVP requirements.

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
| Account | Create, rename, reconcile, close | Account balance is derived from its transactions and adjustments. |
| Transaction | Create, edit, delete, split, transfer | Account and budget effects change atomically. |
| Monthly plan | Assign, unassign, move money | Allocation changes cannot exceed the budget's allowed available amount. |
| Scheduled transaction | Create, pause, generate | Generated transactions must be idempotent. |

The exact aggregate choice can change after the first domain tests. It should not be dictated only by ORM convenience.

## State and calculation vocabulary

For a category and month, distinguish these values:

- **Assigned** — money deliberately allocated to the category in that month.
- **Activity** — categorized spending or returns affecting the category during that month.
- **Available** — money currently available for that category after assignments and activity, including permitted carryover rules.
- **Target** — desired future state; not money and not a transaction.

For an account, distinguish:

- **Cleared balance** — total of transactions marked cleared.
- **Uncleared balance** — total of transactions not yet cleared.
- **Working balance** — the account's current calculated balance.

The exact formulas must be specified and tested before coding the budget engine.

## Transaction types

### Income

Adds money to an account and increases the budget's pool of money to assign. The clone should require a payee/source and an amount.

### Categorized spending

Decreases an account balance and decreases availability in one category or several split categories.

### Transfer

Decreases one account and increases another. It should not create ordinary category spending.

### Refund or return

An open decision for the clone. The safest first model is a categorized inflow that increases the selected category's activity and the account balance, but the final behavior must be documented with examples and tests.

### Starting balance and reconciliation adjustment

These are system-supported corrections rather than ordinary merchant spending. They need an explicit reason and audit trail.

## Critical use case: record spending

```text
User selects account
  → enters date, payee, amount, and category
  → optionally enters split lines
  → system validates amount and ownership
  → system updates account-side and category-side effects atomically
  → system returns updated account balance and category availability
```

Validation rules:

- amount is positive at input for spending and represented by transaction type;
- date is valid for the budget timezone;
- all referenced entities belong to the same budget;
- split totals equal the transaction amount;
- the transaction cannot be duplicated by an identical import key;
- archived accounts cannot receive new ordinary transactions.

## Critical use case: assign money

```text
User selects budget month and category
  → enters amount to assign or move
  → system checks available money and category state
  → system writes allocation movement
  → system recalculates the month summary
```

Assignments must be modeled as auditable movements or immutable entries rather than silently overwriting a balance. The storage shape is an implementation decision; preserving history is a domain requirement.

## Consistency requirements

- Use one database transaction for a command that changes both account and budget effects.
- Recalculate derived values from authoritative movements when correctness is more important than a micro-optimization.
- If derived balances are cached, provide a deterministic rebuild path.
- Use idempotency keys for import and scheduled-transaction generation.
- Never use client-calculated balances as authoritative writes.

## Questions to resolve next

1. Exact formulas for available-to-assign and category availability.
2. Whether a month can be closed or edited indefinitely.
3. Overspending behavior for cash and credit-card accounts.
4. Refund and reimbursement semantics.
5. Reconciliation adjustment rules.
6. Deletion versus voiding for historical transactions.
