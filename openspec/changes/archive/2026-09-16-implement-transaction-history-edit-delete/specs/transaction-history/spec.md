# Transaction History Specification

## Purpose

Provide an owner-authorized way to inspect and safely correct supported transaction history while preserving month boundaries, financial consistency, audit accountability, and PostgreSQL as the authoritative source of financial outcomes. This capability covers realized income and one-category spending in the existing supported account only; it does not broaden transaction-management scope.

## ADDED Requirements

### Requirement: Owner-scoped history listing and reading

The system MUST allow an authorized budget owner to list and read supported transaction history only within the owner’s budget. A history list MUST default to business date descending, then creation timestamp descending for equal business dates, and MAY be filtered to one calendar month under the budget’s date rules. History items MUST expose sufficient observable information to identify their supported type, business date, amount, category when applicable, and protected or eligible state.

#### Scenario: List all supported history in default order

- GIVEN an authorized owner requests supported transaction history without a month filter
- WHEN the history is returned
- THEN records are scoped to that owner’s budget and ordered by business date descending, then creation timestamp descending for ties

#### Scenario: Read history with a month filter

- GIVEN an authorized owner requests supported history for a specified month
- WHEN the history is returned
- THEN every returned record belongs to that business month and no record from another month is included

### Requirement: Eligibility for ordinary edits

The system MUST permit ordinary edits only for posted or working, non-reconciled, unreleased realized income and one-category spending in the supported account. An ordinary edit MUST preserve the transaction type and account and MUST validate integer minor-unit amounts as positive and dates according to the budget’s date rules.

#### Scenario: Edit an eligible spending transaction

- GIVEN a posted, non-reconciled, one-category spending transaction is in the supported account
- WHEN its owner submits a valid positive amount and same-month date edit
- THEN the edit succeeds without changing its transaction type or account

### Requirement: Bounded amount and date correction

The system MUST allow eligible realized income and one-category spending to change amount and business date only when the requested date remains in the same `YYYY-MM` month as the existing date. A cross-month date edit MUST be rejected with `CONFLICT` and MUST NOT alter the transaction or its month-specific effects.

#### Scenario: Reject a cross-month correction

- GIVEN an otherwise eligible transaction has an existing business date in one `YYYY-MM` month
- WHEN its owner requests a date in a different `YYYY-MM` month
- THEN the system returns `CONFLICT` and leaves the transaction and all financial effects unchanged

### Requirement: Spending category retention and replacement

The system MUST preserve an archived category reference on historical one-category spending and MUST allow amount or date edits to retain that archived category. A requested category replacement MUST succeed only when the replacement category is active and belongs to the same authorized budget; archived or foreign categories MUST be rejected without mutation.

#### Scenario: Retain an archived category

- GIVEN eligible spending references an archived category
- WHEN its owner edits only the amount or same-month date
- THEN the transaction remains readable with the archived category reference

#### Scenario: Replace with an active category

- GIVEN eligible spending references a category and the owner selects an active category in the same budget
- WHEN the category edit is submitted
- THEN the spending is associated with the active replacement and the old category’s effects are replaced rather than retained

### Requirement: Explicitly confirmed deletion with minimum audit identity

The system MUST require an explicit deletion confirmation before deleting an eligible realized income or one-category spending transaction. A deletion reason MUST be optional. A successful deletion MUST retain minimum audit identity consisting of actor identity, transaction identity, request or correlation identity when applicable, timestamp, and optional reason; this capability MUST NOT expose an audit-read endpoint.

#### Scenario: Delete after explicit confirmation

- GIVEN an eligible transaction and an authenticated owner
- WHEN the owner submits an explicit confirmation, with or without a reason
- THEN the transaction is removed from effective history and the minimum deletion audit identity is retained

#### Scenario: Refuse an unconfirmed deletion

- GIVEN an eligible transaction
- WHEN a deletion request lacks explicit confirmation
- THEN the system rejects the request and leaves the transaction and its financial effects unchanged

### Requirement: Released-income and unsupported-state protection

The system MUST keep released income readable as protected history, but MUST reject edit and delete attempts for released income with `CONFLICT`. The system MUST likewise reject ordinary edit and delete attempts for reconciled, unsupported, or otherwise ineligible transaction states without applying a mutation.

#### Scenario: Protect released income

- GIVEN a released realized-income transaction is visible to its authorized owner
- WHEN the owner attempts an ordinary edit or delete
- THEN the system returns `CONFLICT` and preserves the transaction and all financial effects

### Requirement: Atomic replacement and removal of financial effects

For every successful edit or deletion, the system MUST replace or remove the prior effective financial effects exactly once, including account, plan, category, rollover, and affected month-specific outcomes. A failed edit or deletion MUST leave both transaction history and financial effects unchanged.

#### Scenario: Edit replaces prior effects atomically

- GIVEN an eligible transaction has existing financial effects
- WHEN a valid edit commits
- THEN the old effects are absent, the new effects are present exactly once, and the resulting outcomes are internally consistent

#### Scenario: Failure does not partially apply

- GIVEN a mutation cannot be completed
- WHEN the mutation fails
- THEN neither the transaction nor any associated financial effect is partially changed

### Requirement: PostgreSQL-authoritative and rebuildable outcomes

PostgreSQL MUST remain authoritative for supported history and all resulting financial outcomes. Client-provided balances, summaries, or calculated effects MUST NOT be authoritative. After any successful edit or deletion, account balance, plan or RTA effects, category activity, rollover, and month-specific summaries MUST be deterministically rebuildable from authoritative persisted history and retained evidence.

#### Scenario: Rebuild reproduces corrected outcomes

- GIVEN an edit or deletion has completed successfully
- WHEN financial outcomes are rebuilt from authoritative PostgreSQL history
- THEN the rebuilt account, plan, category, rollover, and month-specific results match the outcomes produced by the mutation

### Requirement: Idempotent and optimistic-concurrency-safe mutations

Mutation requests MUST support budget-scoped idempotency. Replaying the same request identity and compatible payload MUST return the same outcome without applying the effect more than once. The system MUST use an optimistic version supplied by the client and MUST reject stale versions or incompatible reuse of an idempotency identity with `CONFLICT`, without applying the requested mutation.

#### Scenario: Safe retry

- GIVEN a mutation has already succeeded with a request identity
- WHEN the owner retries the same compatible request
- THEN the system returns the prior successful outcome and does not duplicate effects or audit entries

#### Scenario: Stale version conflict

- GIVEN the transaction version has changed since the owner read it
- WHEN the owner submits a mutation with the stale version
- THEN the system returns `CONFLICT` and preserves the newer state

### Requirement: Stable envelopes and non-disclosing authorization

History success and error responses MUST use the repository’s established API envelopes and stable semantics, including `CONFLICT` for protected, stale, incompatible, and cross-month mutations. Requests for foreign or inaccessible budgets or transactions MUST follow the existing non-disclosing authorization behavior and MUST NOT reveal whether the resource exists or its financial details.

#### Scenario: Foreign resource is non-disclosing

- GIVEN an authenticated user requests history or a mutation for a budget or transaction outside their authorization
- WHEN the request is handled
- THEN the response uses the established non-disclosing authorization behavior and reveals no resource existence or financial details

### Requirement: Bounded transaction-history scope

The capability MUST support only posted or working, non-reconciled, realized income and one-category spending in the existing supported account. It MUST NOT provide splits, transfers, multiple-account support, payee or memo editing, state changes, repetition, closed-month corrections, reconciliation, card transactions, refunds, schedules, or audit-read behavior.

#### Scenario: Unsupported transaction shape is rejected

- GIVEN a transaction is a split, transfer, card, refund, scheduled, repeated, reconciled, or otherwise outside the supported shape
- WHEN a user attempts to edit or delete it through this capability
- THEN the system rejects the operation without changing the transaction or financial effects
