## ADDED Requirements

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
