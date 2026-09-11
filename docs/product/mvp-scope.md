# MVP Scope

## Objective

Deliver a small, understandable budgeting product that demonstrates the YNAB-style planning loop without pretending to reproduce the entire commercial service.

## In scope

### Account and budget setup

- Register and sign in.
- Create one budget per user for the first slice.
- Create, rename, archive, and list accounts.
- Enter an initial account balance.
- Create category groups and categories.
- Choose the active planning month.

### Budgeting

- Show money available to assign.
- Assign money to categories.
- Move assigned money between categories.
- Show assigned, activity, and available values per category.
- Carry permitted category balances into the next month according to documented rules.

### Transactions

- Create, edit, and delete manual transactions.
- Record income.
- Record categorized spending.
- Record split transactions.
- Record transfers between owned accounts.
- Mark transactions cleared.
- Reconcile an account manually.

### Basic feedback

- Dashboard with account balances and category availability.
- Monthly summary.
- Recent transaction list.
- Validation errors that explain what the user must correct.

## Out of scope for MVP

- Automatic bank synchronization.
- Real financial institution credentials.
- Investment, retirement, loan, and HSA tracking.
- Mobile-native application.
- Multiple currencies in one budget.
- Multi-user collaboration beyond a future-ready membership model.
- Advanced reports and forecasting.
- Notifications and email.
- AI recommendations.
- Full parity with YNAB credit-card workflows.

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

```text
Select source and destination accounts
  → enter amount and date
  → save transfer
  → source decreases
  → destination increases
  → no ordinary spending category is reduced
```

## Acceptance criteria for the first vertical slice

- A user cannot read or change another user's budget.
- Starting balance is reflected in the account and available-to-assign amount.
- Assignments cannot create money that does not exist.
- A normal transaction changes account and category effects atomically.
- Split transaction lines must equal the transaction total.
- Transfers affect two accounts and do not count as spending activity.
- Money calculations are deterministic for the same input history.
- The main journey is covered by automated tests.

## Suggested delivery slices

1. Project setup, authentication boundary, and database connection.
2. Budget, category groups, categories, and account setup.
3. Money representation and available-to-assign calculation.
4. Assign and move money within a month.
5. Manual income, spending, splits, and transfers.
6. Dashboard and monthly summary.
7. Cleared state and manual reconciliation.
8. Targets and scheduled transactions as a second milestone.

Each slice should leave the application runnable and documented. Do not start the next slice while the current domain behavior is still ambiguous.

## Success definition

The MVP succeeds if a reviewer can understand where money is, what each amount is for, record a realistic purchase, adjust priorities, and verify the resulting balances without manually repairing database state.
