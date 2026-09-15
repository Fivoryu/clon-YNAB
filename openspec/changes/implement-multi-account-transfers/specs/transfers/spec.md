# Delta for Account Transfers

## ADDED Requirements

### Requirement: Same-budget transfer command

The system MUST allow an authorized owner to record a transfer between two distinct, active, supported accounts belonging to the selected budget. The amount MUST be a positive safe integer number of minor units. Cross-budget, unknown, archived, or identical source and destination accounts MUST be rejected without disclosing unauthorized resources or applying effects. Payee, memo, CSV, cards, splits, reconciliation, and other deferred capabilities MUST remain outside this command.

#### Scenario: A valid transfer is recorded

- GIVEN two distinct active `CASH` or `CHECKING` accounts in the owner's budget
- WHEN the owner submits a positive minor-unit transfer
- THEN the source balance MUST decrease by exactly that amount and the destination balance MUST increase by exactly that amount

#### Scenario: An invalid account pairing is rejected

- GIVEN a transfer references an archived, foreign, missing, or identical account
- WHEN the command is submitted
- THEN it MUST conflict or use the established safe resource error behavior and MUST leave all state unchanged

### Requirement: Atomic durable paired effects

Each transfer MUST have a distinct durable transfer identity independent of category `MOVE`. Its authoritative record MUST identify the source account, destination account, positive amount, business date, budget, and linked paired effects. The two effects, transfer record, and idempotency outcome MUST commit or roll back together in one PostgreSQL transaction. Rebuilding balances or history from PostgreSQL MUST reproduce the same paired effects exactly once.

#### Scenario: A transfer commits atomically

- GIVEN a valid transfer command
- WHEN PostgreSQL commits the command
- THEN one durable transfer identity and both equal/opposite account effects MUST be present, with no ordinary category movement created

#### Scenario: A transfer write fails

- GIVEN one transfer leg or its durable record cannot be persisted
- WHEN the command fails
- THEN neither leg, the transfer identity, nor its idempotency receipt MUST remain committed

#### Scenario: A transfer is rebuilt

- GIVEN a committed transfer
- WHEN account balances and history are rebuilt from authoritative PostgreSQL records
- THEN the source negative effect and destination positive effect MUST be reconstructed once from that transfer identity

### Requirement: Transfer date, month, and history semantics

A transfer MUST require a date-only business date. Its budget month MUST be determined using the budget's configured IANA timezone, defaulting to UTC, and its timestamps MUST remain UTC. `/transactions` MUST include each transfer as `kind: "TRANSFER"` with its distinct transfer identity and both account sides, using the established history ordering and month filters. Transfer history MUST not be represented as category `MOVE`, and existing transaction-kind meanings MUST remain unchanged.

#### Scenario: A transfer appears in history

- GIVEN a committed transfer with a business date
- WHEN the owner lists `/transactions`
- THEN the transfer MUST appear as `kind: "TRANSFER"`, retain its transfer identity and source/destination accounts, and be ordered by business date and creation timestamp under existing rules

#### Scenario: A month filter is applied

- GIVEN a transfer date near a calendar-month boundary and a configured budget timezone
- WHEN the owner requests the corresponding `/transactions` month
- THEN the transfer MUST appear only in the month selected by that budget timezone

### Requirement: Transfer isolation from category budgeting

Transfers MUST conserve the aggregate `accountBalanceMinor` while changing per-account balances. They MUST NOT affect ordinary income, spending, category Activity, Assigned, Available, or RTA calculations, and MUST NOT create a category assignment or movement.

#### Scenario: A transfer is summarized

- GIVEN stable category values and a transfer between accounts
- WHEN the budget summary is requested
- THEN aggregate account balance MUST be unchanged, per-account balances MUST reflect equal/opposite effects, and category Activity, Assigned, Available, and RTA MUST be unchanged

### Requirement: Authorized idempotent and concurrent transfers

Transfers MUST use the owning budget's existing authorization, optimistic budget version, and idempotency stream. An identical retry MUST replay its original result without duplicate transfer effects. Reusing a key with a different canonical payload MUST conflict. A stale version MUST conflict. PostgreSQL locking and uniqueness MUST prevent concurrent retries from producing more than one transfer identity or pair of effects.

#### Scenario: An identical retry is replayed

- GIVEN a successful transfer command with an idempotency key and canonical payload
- WHEN the owner retries it
- THEN the original result MUST be returned and balances MUST not change again

#### Scenario: A key is reused with a different transfer

- GIVEN an idempotency key already committed for one transfer
- WHEN it is submitted with a different account, amount, date, or budget payload
- THEN the request MUST conflict and MUST not create another transfer

#### Scenario: A stale transfer is submitted

- GIVEN the budget version has advanced since the client read it
- WHEN the client submits a transfer with the stale version
- THEN the transfer MUST conflict without changing either account
