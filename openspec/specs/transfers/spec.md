# Account Transfers Specification

## Purpose

Define authorized same-budget transfers between supported accounts, including atomic paired effects, history projection, metadata, idempotency, and budgeting neutrality.

## Requirements

### Requirement: Same-budget transfer command

The system MUST allow an authorized owner to record a transfer between two distinct, active, supported accounts belonging to the selected budget. The amount MUST be a positive safe integer number of minor units. Cross-budget, unknown, archived, or identical source and destination accounts MUST be rejected without disclosing unauthorized resources or applying effects. A transfer MAY carry nullable normalized `payee` and `memo` metadata under the transaction-history normalization contract. CSV, cards, splits, reconciliation, and other deferred capabilities MUST remain outside this command.
(Previously: The transfer command excluded payee and memo as deferred capabilities.)

#### Scenario: A transfer records optional metadata

- GIVEN two distinct active supported accounts in the owner's budget
- WHEN the owner submits a valid transfer with payee and memo
- THEN the transfer SHALL commit with trimmed, case-preserving nullable metadata and equal/opposite account effects

#### Scenario: Invalid transfer metadata is rejected atomically

- GIVEN a transfer contains invalid JSON metadata or metadata over its Unicode-code-point limit
- WHEN the command is submitted
- THEN validation SHALL fail and neither transfer leg, metadata, identity, receipt, nor balance effect SHALL be committed

### Requirement: Atomic durable paired effects

Each transfer MUST have a distinct durable transfer identity independent of category `MOVE`. Its authoritative record MUST identify the source account, destination account, positive amount, business date, budget, linked paired effects, and nullable metadata. The two effects, transfer record, metadata, and idempotency outcome MUST commit or roll back together in one PostgreSQL transaction. Rebuilding balances or history from PostgreSQL MUST reproduce the same paired effects and effective metadata exactly once.
(Previously: The authoritative transfer record did not include metadata.)

#### Scenario: Transfer metadata survives rebuild

- GIVEN a committed transfer with nullable or non-null metadata
- WHEN PostgreSQL state is restarted or effective history is rebuilt
- THEN one transfer item SHALL be reconstructed with the same metadata and canonical source/destination direction

### Requirement: Transfer date, month, and history semantics

A transfer MUST require a date-only business date. Its budget month MUST be determined using the budget's configured IANA timezone, defaulting to UTC, and its timestamps MUST remain UTC. `/transactions` MUST include each transfer as `kind: "TRANSFER"` with its distinct transfer identity, nullable metadata, and both account sides using canonical `accounts[]`; it SHALL preserve established ordering and month/date filters. Transfer history MUST not be represented as category `MOVE` and SHALL not be duplicated from paired effects.
(Previously: Transfer history exposed the transfer identity and both account sides but had no metadata projection.)

#### Scenario: Transfer history is one canonical item

- GIVEN a committed transfer with payee or memo and paired source/destination effects
- WHEN the owner lists or searches transactions
- THEN exactly one `TRANSFER` item SHALL be returned, with both canonical account sides, nullable metadata, no category, and unchanged ordering

#### Scenario: Transfer account filtering matches either side

- GIVEN a transfer between source account A and destination account B
- WHEN the owner filters history by account A or by account B
- THEN the same single transfer item SHALL match in either case and retain both canonical sides

### Requirement: Transfer isolation from category budgeting

Transfers MUST conserve aggregate `accountBalanceMinor` while changing per-account balances. They MUST NOT affect ordinary income, spending, category Activity, Assigned, Available, rollover, or RTA calculations. Metadata, history filters, and text search MUST not alter those financial equations or reinterpret a transfer as category movement.
(Previously: Transfer isolation covered transfer effects but not metadata and history predicates.)

#### Scenario: Transfer metadata and search leave equations unchanged

- GIVEN a transfer and stable category and account balances
- WHEN metadata is added or the transfer is found using history filters or literal search
- THEN aggregate conservation and all ordinary budgeting equations SHALL remain unchanged

### Requirement: Authorized idempotent and concurrent transfers

Transfers MUST use the owning budget's existing authorization, optimistic budget version, and idempotency stream. The canonical normalized metadata payload SHALL participate in idempotency comparison. An identical retry MUST replay its original result without duplicate transfer effects or metadata replacements. Reusing a key with a different normalized payload MUST conflict. A stale version MUST conflict. PostgreSQL locking and uniqueness MUST prevent concurrent retries from producing more than one transfer identity or pair of effects.
(Previously: Idempotency comparison covered transfer fields other than deferred metadata.)

#### Scenario: Metadata differences conflict on key reuse

- GIVEN an idempotency key committed a transfer with one normalized memo
- WHEN the key is reused with a different normalized memo or payee
- THEN the request SHALL conflict and SHALL create no transfer, replacement, or financial effect
