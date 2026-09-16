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
