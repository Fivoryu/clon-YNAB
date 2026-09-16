# Delta for Budgeting

## ADDED Requirements

### Requirement: Per-account balances and aggregate conservation

The system MUST calculate each account balance from its authoritative opening balance and applicable account effects, and MUST calculate `accountBalanceMinor` as the aggregate of all account balances. A transfer MUST change only the participating per-account balances by equal and opposite amounts, leaving the aggregate unchanged.

#### Scenario: Per-account balances are returned

- GIVEN a budget with multiple accounts and account activity
- WHEN the budget or summary is requested
- THEN every account balance MUST be server-calculated and the aggregate MUST equal the sum of those balances

#### Scenario: Transfer conservation holds

- GIVEN a source and destination account with known balances
- WHEN a valid transfer is committed
- THEN the source and destination balances MUST change by `-amount` and `+amount`, while `accountBalanceMinor` MUST remain constant

### Requirement: Transfers do not enter ordinary budgeting equations

The budgeting engine MUST exclude transfer effects from ordinary income, spending, category Activity, Assigned, Available, and RTA calculations. Existing first-slice income, spending, category movement, and release equations MUST retain their meaning.

#### Scenario: Transfer leaves RTA unchanged

- GIVEN a budget with calculated category values and RTA
- WHEN money is transferred between two accounts
- THEN RTA, category Activity, Assigned, and Available MUST remain unchanged

### Requirement: Shared mutation consistency

Account lifecycle mutations and transfers MUST use the same budget version and budget-scoped idempotency semantics as existing financial commands. PostgreSQL MUST be authoritative, and client-provided balances MUST never be accepted as write inputs.

#### Scenario: Concurrent account and transfer writes

- GIVEN two commands are based on the same budget version
- WHEN one account mutation and one transfer are submitted concurrently
- THEN at most one stale command may commit, and no command may produce a silently lost update or partial financial effect

### Requirement: Canonical monetary values

The system MUST treat monetary values as authoritative integer minor units, MUST calculate financial effects on the server, and MUST keep account balance, RTA, Assigned, Activity, and Available as distinct values.

#### Scenario: A summary is displayed

- GIVEN a budget with account activity and category allocations
- WHEN the owner requests its monthly values
- THEN the system MUST return server-calculated distinct values and MUST NOT rely on client-provided balances or client-reimplemented equations

### Requirement: RTA source and explainability

The system MUST calculate RTA from realized funds that are assignable (including the opening balance and realized income explicitly released for assignment), permitted prior carry, and current assignments; it MUST exclude unreleased income and MUST not subtract categorized spending twice.

#### Scenario: RTA components reconcile

- GIVEN an opening balance, released and unreleased realized income, permitted prior carry, and current assignments
- WHEN the owner requests RTA
- THEN RTA MUST include only assignable realized funds and permitted carry less assignments, while unreleased income remains excluded and categorized spending is not subtracted a second time

### Requirement: Realized income and explicit release

The system MUST record realized income against the supported account so the account working balance increases immediately, MUST keep that income out of assignable RTA until a separate explicit owner action releases it, and MUST make the release state and history repeatable without double counting.

#### Scenario: Income is recorded before release

- GIVEN a supported account and a realized income amount
- WHEN the owner records the income
- THEN the account balance MUST increase atomically, while the amount MUST remain excluded from assignable RTA

#### Scenario: Released income becomes assignable

- GIVEN realized income recorded in the account but not released
- WHEN the owner performs the explicit release action
- THEN the released amount MUST become available to RTA exactly once and MUST remain represented in authoritative history

### Requirement: Categorized spending

The system MUST support categorized spending against the supported account, MUST decrease the account working balance atomically, and MUST record signed category Activity in the month determined by the transaction date and budget timezone.

#### Scenario: Spending is recorded

- GIVEN a supported account and an active category
- WHEN the owner records realized categorized spending
- THEN the account effect and category Activity effect MUST commit together in the same budget and month

#### Scenario: Unsupported transaction behavior is unavailable

- GIVEN the first-slice transaction workflow
- WHEN a user attempts splits, transfers, future income, refunds/reimbursements/returns, ordinary edit/delete, or cleared/pending/uncleared states
- THEN the system MUST reject or clearly mark the capability unavailable and MUST not apply an inferred financial effect

### Requirement: Assignments and moves conserve funds

The system MUST support monthly assignment, unassignment, and movement between categories using integer minor units, MUST conserve the assigned amount, and MUST never silently rebalance an unrelated category.

#### Scenario: Money is moved between categories

- GIVEN two active categories in a budget month
- WHEN the owner moves an amount from one category to the other
- THEN the source and destination assignments MUST change by equal opposite amounts and total assigned money MUST be conserved

#### Scenario: An assignment is removed

- GIVEN an existing assignment
- WHEN the owner unassigns part or all of it
- THEN the assignment MUST decrease by exactly that amount and the corresponding RTA effect MUST be explicit and explainable

### Requirement: Visible overassignment

The system MUST permit an owner to assign more than current RTA, MUST show the resulting negative RTA prominently as a correctable state, and MUST not automatically alter another category or silently reject the assignment solely because RTA is negative.

#### Scenario: Assignment exceeds RTA

- GIVEN current RTA is less than the requested assignment
- WHEN the owner confirms the assignment
- THEN the assignment MUST be recorded, RTA MUST become visibly negative by the overassigned amount, and no unrelated category MUST change

#### Scenario: Negative RTA is corrected

- GIVEN a budget with negative RTA
- WHEN the owner unassigns money or moves money back to RTA through a supported correction workflow
- THEN the negative RTA MUST be reduced by the explicit correction amount and the affected category values MUST remain explainable

### Requirement: Monthly values and positive rollover

The system MUST calculate RTA, Assigned, signed Activity, and Available consistently from authoritative history, and MUST carry positive category Available deterministically into the next month.

#### Scenario: Category values reconcile

- GIVEN a category month with permitted carryover, assignments, and signed activity
- WHEN the owner requests the month summary
- THEN Available MUST equal permitted carryover plus Assigned plus signed Activity, and the component values MUST remain separately visible

#### Scenario: Positive availability rolls forward

- GIVEN a category with positive Available at month end
- WHEN the owner views the next budget month
- THEN that positive amount MUST appear as deterministic carryover in the next month

#### Scenario: Negative availability does not use positive-rollover behavior

- GIVEN a category with non-positive Available at month end
- WHEN the next month is calculated
- THEN the system MUST not represent a positive carryover for that category and MUST not infer deferred card or broader overspending formulas

### Requirement: Budget timezone month assignment

The system MUST assign date-only transactions to the month determined by the budget's configured IANA timezone, MUST default that timezone to UTC, and MUST not use the browser timezone to choose the month; event timestamps MUST remain UTC.

#### Scenario: Budget timezone determines month

- GIVEN a transaction date near a calendar-month boundary and a configured budget IANA timezone
- WHEN the system records or summarizes the transaction
- THEN the transaction MUST belong to the calendar month in that budget timezone

#### Scenario: UTC baseline is used

- GIVEN no other budget timezone has been configured
- WHEN a date-only transaction is processed
- THEN the system MUST assign its month using UTC

### Requirement: Atomic, retry-safe financial commands

The system MUST commit each financial command and all of its derived effects atomically, MUST protect supported concurrent writes from stale state, and MUST scope idempotency to the authorized budget and request payload.

#### Scenario: A financial command partially fails

- GIVEN a command that would change account, category, or allocation state
- WHEN any required effect cannot commit
- THEN none of that command's financial effects MUST persist

#### Scenario: The same command is retried

- GIVEN a previously successful command with the same idempotency key and payload in the same budget
- WHEN it is submitted again
- THEN the system MUST return the original result without duplicating money effects

#### Scenario: An idempotency key is reused differently

- GIVEN a previously used idempotency key
- WHEN it is submitted with a different payload
- THEN the system MUST return a conflict and MUST not apply the new command

#### Scenario: A stale concurrent write is submitted

- GIVEN two writes based on the same prior budget state
- WHEN both attempt to change financial values
- THEN the system MUST prevent silent lost updates and MUST require the stale write to be retried or resolved explicitly
