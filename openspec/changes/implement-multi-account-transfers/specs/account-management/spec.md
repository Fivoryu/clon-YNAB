# Delta for Account Management

## ADDED Requirements

### Requirement: Canonical multi-account projection and compatibility alias

The system MUST expose `accounts[]` as the canonical account collection, including each account's identity, supported kind, lifecycle state, opening balance, and current balance. `accountBalanceMinor` MUST remain the aggregate balance across all accounts. During the compatibility period, `account` MUST be derived from the same projection as the account with the earliest durable creation timestamp; ties MUST be resolved by the lowest stable account identifier. A migrated legacy account MUST retain its identity and original ordering. The alias MUST remain until a separately approved removal change.

#### Scenario: A budget has multiple accounts

- GIVEN a budget with two supported accounts
- WHEN its budget projection is returned
- THEN `accounts[]` MUST contain both accounts, `accountBalanceMinor` MUST equal their aggregate balance, and `account` MUST equal the deterministically oldest account

#### Scenario: A legacy budget is projected

- GIVEN a persisted single-account budget
- WHEN it is read through the multi-account projection
- THEN the original account identity and opening balance MUST be preserved, `accounts[]` MUST contain that account, and existing clients MUST still be able to use `account`

### Requirement: Bounded account lifecycle

The system MUST allow the authorized budget owner to create additional manual `CASH` or `CHECKING` accounts after setup, rename accounts, and archive accounts. The system MUST NOT offer unarchive in this slice. Account identity and historical references MUST remain stable across rename and archive operations. Archived accounts MUST remain readable for history but MUST reject new ordinary movements and transfers.

#### Scenario: An account is added after setup

- GIVEN an authorized owner has a completed budget
- WHEN the owner creates a manual `CASH` or `CHECKING` account with an optional opening balance
- THEN the account MUST be added without changing existing account identity or history

#### Scenario: A new account has no opening balance

- GIVEN an authorized owner creates an account without an opening balance
- WHEN creation succeeds
- THEN its opening balance and initial balance MUST be zero

#### Scenario: A new account has an opening balance

- GIVEN an authorized owner creates an account with a valid integer minor-unit opening balance
- WHEN creation succeeds
- THEN that opening balance MUST be recorded as an account-local authoritative opening effect exactly once and MUST be included in that account's balance and the aggregate balance

#### Scenario: An archived account is used for a new movement

- GIVEN an account is archived
- WHEN a user attempts a new ordinary movement or transfer using it as source or destination
- THEN the request MUST be rejected and all balances and history MUST remain unchanged

### Requirement: Authorized, versioned account mutations

Account creation, rename, and archive operations MUST authorize the owning budget before revealing or changing account resources. They MUST use the established budget-scoped idempotency and optimistic-concurrency semantics: identical retries replay the original result, key reuse with a different canonical payload conflicts, and stale versions conflict. Client-provided balances MUST NOT be accepted as authoritative writes. Account metadata mutations and transfers MUST share the same budget version and idempotency stream.

#### Scenario: A foreign account mutation is attempted

- GIVEN an authenticated user is not authorized for the selected budget
- WHEN the user submits an account mutation or references an account identifier
- THEN the established non-disclosing authorization behavior MUST be returned without revealing resource existence or changing state

#### Scenario: An account mutation is retried

- GIVEN an account mutation has committed with an idempotency key
- WHEN the same key and canonical payload are submitted again
- THEN the original result MUST be replayed without a duplicate account or metadata effect

#### Scenario: A stale account mutation conflicts with a transfer

- GIVEN a transfer or other budget mutation has advanced the budget version
- WHEN an account mutation is submitted with the prior version
- THEN it MUST conflict and MUST not change account metadata or financial state

### Requirement: Legacy single-account migration compatibility

The system MUST read legacy single-account persistence without data loss and MUST migrate or project it additively into the canonical collection. Migration MUST preserve the legacy account identifier, kind, opening information, financial history, and compatibility response behavior. Mixed-version reads MUST remain safe; rollback or migration validation failure MUST leave legacy reads available and MUST NOT delete or rewrite historical financial events.

#### Scenario: Legacy data is loaded after migration

- GIVEN a budget stored under the prior one-account representation
- WHEN the current service loads it
- THEN it MUST expose a canonical one-element `accounts[]`, the oldest-account `account` alias, and a matching aggregate balance with no lost history

#### Scenario: Migration validation fails

- GIVEN legacy rows cannot be validated for additive projection
- WHEN migration readiness is evaluated
- THEN multi-account writes MUST remain unavailable while the legacy single-account read path continues
