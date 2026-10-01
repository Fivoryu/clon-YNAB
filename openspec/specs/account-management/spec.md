# Account Management Specification

## Purpose

Define the canonical multi-account projection, supported account lifecycle, authorization, concurrency, and compatibility behavior for manual cash and checking accounts.

## Requirements

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

### Requirement: Per-account cleared balance projection

The account projection MUST expose, beside the existing working balance, a cleared balance for every account. "The account projection" means the account surface projection reached through the budget and account responses. A report's embedded account collection is a report projection, not the account projection: it MAY present the same account identities and working balances, and it MUST NOT expose the cleared balance, because the reporting requirements forbid a report from presenting a cleared balance. The split is therefore by surface, not by data: accounts carry the cleared balance, reports do not. A reconciliation command's own response MAY report the observed and confirmed cleared balances, because that is the command contract and not a report. An account's cleared balance MUST be its opening balance plus its effective account effects whose effective transaction is `CLEARED` or `RECONCILED`; its opening balance MUST be treated as cleared. The existing `balanceMinor` MUST remain the working balance over all effective account effects, and `accountBalanceMinor` MUST remain the aggregate of the working balances.

The cleared balance MUST be a projection over persisted history and MUST NOT be persisted as a running total. It MUST NOT change Ready to Assign, Assigned, Activity, Available, or any transfer measure. Its inputs MUST be derived from one consistent revision of the budget's financial state, so a cleared balance and the working balance reported together MUST come from the same revision.

#### Scenario: An account reports both balances

- GIVEN an account has an opening balance and effective cleared, uncleared, and working transactions
- WHEN the account is projected
- THEN its cleared balance MUST include the opening balance and the cleared and reconciled effects only
- AND its working balance MUST include every effective effect
- AND both MUST originate from the same revision

#### Scenario: Clearing a transaction moves the cleared balance only

- GIVEN an account has a posted, uncleared transaction and a recorded working balance
- WHEN the transaction is marked cleared
- THEN the cleared balance MUST change by that transaction's signed amount
- AND the working balance, `accountBalanceMinor`, Ready to Assign, Assigned, Activity, and Available MUST be unchanged

#### Scenario: An account with no cleared history reports an opening-only cleared balance

- GIVEN an account has an opening balance and no cleared or reconciled effects
- WHEN the account is projected
- THEN its cleared balance MUST equal its opening balance

#### Scenario: A legacy account is projected

- GIVEN a budget persisted before cleared state existed
- WHEN it is read
- THEN every existing transaction MUST project as `UNCLEARED` with reconciled protection unchanged
- AND account identity, opening balance, and history MUST be preserved

### Requirement: Manual reconciliation is an authorized, versioned account mutation

Reconciliation MUST authorize the owning budget before revealing or changing the account, MUST use the established budget-scoped idempotency and optimistic-concurrency semantics, and MUST share the same budget version and idempotency stream as account metadata mutations and transfers. Client-provided balances MUST NOT be accepted as authoritative account balances: the confirmed external cleared balance is a reconciliation input compared against server-derived cleared history, never a write to the working balance.

An identical retry of a committed reconciliation MUST replay the original result without a duplicate adjustment, a duplicate reconciliation record, or a duplicate lock. An idempotency-key reuse with a different canonical payload MUST return `CONFLICT`. A stale version MUST return `CONFLICT` and MUST change nothing.

#### Scenario: A reconciliation is retried

- GIVEN a reconciliation has committed with an idempotency key
- WHEN the same key and canonical payload are submitted again
- THEN the original result MUST be replayed without a duplicate adjustment, reconciliation record, or lock

#### Scenario: A reconciliation conflicts with a stale version

- GIVEN another budget mutation has advanced the budget version
- WHEN a reconciliation is submitted with the prior version
- THEN it MUST return `CONFLICT` and MUST not change account state or financial state

#### Scenario: A foreign budget reconciliation is refused

- GIVEN an authenticated user is not authorized for the selected budget
- WHEN the user submits a reconciliation or references a foreign account
- THEN the established non-disclosing authorization behavior MUST be returned without revealing resource existence or changing state
