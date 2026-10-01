## ADDED Requirements

### Requirement: Cleared state is an explicit and financially neutral transaction dimension

A supported effective income, spending, or transfer item MUST carry a cleared state of `UNCLEARED`, `CLEARED`, or `RECONCILED`. `CLEARED` MUST mean the item has been matched against external account state; `RECONCILED` MUST mean the item was locked by a completed reconciliation. A reconciled item MUST also be cleared, and an item recorded as reconciled without being cleared MUST be rejected. The cleared state MUST be independent of the posted or working status: a `WORKING` item MUST NOT be cleared, while a `POSTED` item MAY be either.

The system MUST allow an authorized owner to move an eligible item between `UNCLEARED` and `CLEARED`. A cleared-state transition MUST change no amount, account, category, business date, transfer direction, month, or any other financial field, MUST be represented as an immutable superseding replacement rather than an in-place edit, MUST be included in the canonical budget-scoped idempotency payload, and MUST advance the budget version. A transition on a `RECONCILED` item MUST return `CONFLICT` without mutation; a matching idempotent retry MUST replay its saved outcome without a duplicate replacement.

A cleared-state transition MAY be requested for a transfer. It MUST be applied to the transfer's paired effects atomically and MUST NOT change the transfer aggregate, its amount, its direction, or the approved transfer effect model.

History items MUST expose the cleared state so the owner and the account surface can distinguish it, alongside the existing protected or eligible state.

#### Scenario: An owner marks an eligible transaction cleared

- GIVEN an authorized owner has a posted, uncleared, not-reconciled income or spending transaction
- WHEN the owner requests that it be cleared
- THEN the item's cleared state becomes `CLEARED`
- AND no amount, account, category, business date, month, balance, category Activity, Assigned, Available, or Ready to Assign value changes

#### Scenario: An owner returns a cleared transaction to uncleared

- GIVEN an authorized owner has a posted, cleared, not-reconciled transaction
- WHEN the owner requests that it be uncleared
- THEN the item's cleared state becomes `UNCLEARED`
- AND no financial value changes

#### Scenario: A reconciled transaction cannot change its cleared state

- GIVEN a transaction locked by a completed reconciliation
- WHEN the owner requests that it be cleared or uncleared
- THEN the system MUST return `CONFLICT` and MUST change nothing

#### Scenario: A working transaction cannot be cleared

- GIVEN a transaction whose status is `WORKING`
- WHEN the owner requests that it be cleared
- THEN the system MUST reject the request without recording a cleared state

#### Scenario: Clearing a transfer leaves its financial content untouched

- GIVEN an authorized owner has a committed same-budget transfer
- WHEN the owner marks it cleared
- THEN both its paired effects MUST carry the cleared state atomically
- AND its amount, both account sides, its business date, and its month MUST remain unchanged

### Requirement: Manual reconciliation locks cleared history against a confirmed external balance

The system MUST allow an authorized owner to reconcile one account by confirming an external cleared balance as an integer minor-unit amount. The command MUST be authorized against the owning budget, MUST use the established budget-scoped idempotency and optimistic-concurrency semantics, and MUST be rejected for an archived account without creating an adjustment or locking anything.

Reconciliation MUST compare the confirmed external balance with the account's computed cleared balance over effective cleared history:

- When they are equal, the system MUST record the reconciliation and MUST lock every cleared, not-yet-reconciled effective item on that account by marking it `RECONCILED`.
- When they differ and the adjustment is not explicitly confirmed, the system MUST return `CONFLICT`, MUST disclose the difference, and MUST NOT mutate anything.
- When they differ and the adjustment is explicitly confirmed with a reason, the system MUST create exactly one reconciliation adjustment for the difference on that account, MUST record the reconciliation, and MUST then lock the same way.

A reconciliation adjustment MUST be an account-local account-state correction. It MUST change the reconciled account's working and cleared balances by exactly the difference, and MUST NOT enter Ready to Assign, realized income, spending, category Activity, Assigned, Available, or any transfer measure. It is not an assignable realized fund and MUST NOT be presented in the canonical monthly summary, the single-month report, the multi-month series, or any report measure. The system MUST NOT silently create, remove, or repair money: a mismatch without an explicit confirmation MUST change nothing. An adjustment changes the reconciled account's working and cleared balances by exactly the difference, and therefore changes the divergence between the aggregate account balance and Ready to Assign by exactly that amount. The absolute gap between those two values also reflects structural amounts such as unreleased income and permitted carry, so only the CHANGE that an adjustment causes is attributable to it. That change MUST remain a documented, inspectable limit of this scope rather than being masked or corrected silently.

The reconciliation record MUST retain the account, the actor identity, the confirmed external balance, the adjustment amount, the reason, the budget month, the timestamp, and the idempotency identity. Reconciled protection MUST be reproducible from persisted history; a rebuild MUST reproduce the same locked items and the same cleared balance. No endpoint to unlock, revert, or correct a reconciled item is provided in this scope, and a request for one MUST be reported as unavailable.

#### Scenario: A matching confirmed balance reconciles without an adjustment

- GIVEN an account has cleared, not-reconciled effective history
- WHEN the owner confirms an external cleared balance equal to the computed cleared balance
- THEN the reconciliation MUST be recorded, every cleared item on the account MUST become `RECONCILED`, and no adjustment MUST be created
- AND no financial value beyond the lock MUST change

#### Scenario: A mismatching balance without confirmation changes nothing

- GIVEN the confirmed external cleared balance differs from the computed cleared balance
- WHEN the owner submits the reconciliation without confirming an adjustment
- THEN the system MUST return `CONFLICT`, disclose the difference, and record no reconciliation, no adjustment, and no lock

#### Scenario: A mismatching balance with confirmation adjusts once and locks

- GIVEN the confirmed external cleared balance differs from the computed cleared balance
- WHEN the owner confirms the adjustment with a reason
- THEN exactly one reconciliation adjustment for the difference MUST be created, the account balances MUST move by exactly that difference, and the reconciliation MUST lock every cleared item

#### Scenario: An archived account cannot be reconciled

- GIVEN an account is archived
- WHEN the owner attempts to reconcile it
- THEN the request MUST be rejected and no adjustment, lock, or reconciliation record MUST be created

#### Scenario: Reconciled protection survives a rebuild

- GIVEN a reconciliation has locked cleared history
- WHEN the account and history are rebuilt from persisted records
- THEN the same items MUST be reconciled, the same cleared balance MUST be reproduced, and the reconciliation adjustment MUST be reproduced exactly once

#### Scenario: An unlock or correction request is unavailable

- GIVEN a transaction is reconciled
- WHEN a user requests that it be unlocked, reverted, or corrected through an ordinary path
- THEN the system MUST report the capability as unavailable and MUST leave the reconciled item unchanged

#### Scenario: A foreign account reconciliation is not disclosed

- GIVEN an authenticated user is not authorized for the budget that owns an account
- WHEN the user attempts to reconcile it
- THEN the established non-disclosing authorization behavior MUST be returned without revealing account existence or financial details

## MODIFIED Requirements

### Requirement: Eligibility for ordinary edits

The system MUST permit ordinary edits only for posted or working, not-reconciled, unreleased realized income and one-category spending. Eligibility MUST be evaluated against the account that owns the transaction, and that account MUST belong to the authorized budget; eligibility MUST NOT depend on the compatibility alias account. Edits MUST preserve transaction type and account and validate positive integer minor-unit amounts and budget-valid dates. A cleared transaction MUST remain eligible for ordinary edit. An ordinary edit MUST NOT be applied to a reconciled transaction. Transfers MUST remain readable and their financial content MUST remain immutable; a transfer's cleared state is changed only through the separate financially neutral cleared-state operation defined in this specification.

#### Scenario: Eligible ordinary transaction is edited

- GIVEN an owner has a posted or working, not-reconciled, unreleased supported income or one-category spending transaction in any active account of their budget
- WHEN the owner submits an otherwise valid edit
- THEN the edit MUST be eligible for processing regardless of whether the transaction is cleared and regardless of whether its account is the compatibility alias
- AND a transfer, a reconciled transaction, or another protected transaction MUST remain immutable to ordinary edits

### Requirement: Released-income and unsupported-state protection

Released income MUST remain readable as protected history, while edit/delete attempts return `CONFLICT`. Reconciled, unsupported, split, transfer, card, refund, scheduled, repeated, or otherwise ineligible mutation attempts MUST be rejected without mutation. A cleared-state transition is not an ordinary mutation: it MUST be permitted on an eligible not-reconciled item and MUST be rejected on a reconciled item. Transfer edits/deletes MUST preserve both paired effects and the transfer record.

#### Scenario: Protected transaction cannot be mutated

- GIVEN released income, a reconciled transaction, a transfer, or another unsupported transaction state
- WHEN an ordinary edit or delete is requested
- THEN the mutation MUST be rejected without changing the transaction or any financial effect
- AND a cleared-state transition MUST still be permitted for the same item when it is not reconciled

### Requirement: Bounded transaction-history scope

The capability SHALL support owner-authorized posted or working, not-reconciled realized income and one-category spending, nullable metadata, bounded filters, the approved same-budget transfer history projection, cleared-state transitions, and manual reconciliation with reconciled locking, each only within the explicit scope defined by the requirements in this specification. Transfers remain visible but are not editable or deletable as to their financial content. It MUST NOT provide splits, multiple-account transfer mutation, payee/memo behavior beyond the normalized metadata contract, repetition, closed-month corrections, unlocking or correction of reconciled history, import matching against reconciled history, CSV/import workflows, banking synchronization, cards, refunds, schedules, or audit-read behavior, and SHALL NOT alter the approved transfer aggregate/effect model.

#### Scenario: Unsupported history capability remains unavailable

- GIVEN a user attempts a split, card, schedule, refund, CSV import, banking synchronization, an unlock or correction of reconciled history, import matching, or another capability outside the bounded history scope
- WHEN the request reaches transaction-history behavior
- THEN the capability MUST remain unavailable and the approved effective history and transfer model MUST remain unchanged
