# Transaction History Specification

## Purpose

Provide an owner-authorized way to inspect and safely correct supported transaction history while preserving month boundaries, financial consistency, audit accountability, and PostgreSQL as the authoritative source. Supported effective history includes realized income, one-category spending, and the approved same-budget transfer projection.

## Requirements

### Requirement: Owner-scoped history listing and reading

The system MUST allow an authorized budget owner to list and read effective transaction history only within the owner’s budget. Results MUST use business-date descending order, creation-timestamp descending for ties, and transaction identity descending where applicable. The endpoint MUST support the bounded filters `month`, `account`, `kind`, `category`, `from`, `to`, and `q`, each at most once. `month` is `YYYY-MM`; `from` and `to` are inclusive `YYYY-MM-DD`; `kind` is `INCOME`, `SPENDING`, or `TRANSFER`; filters combine with AND semantics. Unknown or malformed parameters, repeated parameters, inverted date ranges, and foreign referenced resources MUST use established validation or safe non-disclosing behavior. `q` is an empty-trimmed, case-insensitive literal substring search across payee, memo, current category name, and current account name; pattern characters have no wildcard meaning and it is limited to 200 Unicode code points. Results MUST be effective authorized projections, MAY be month-filtered under budget date rules, and MUST contain no more than 500 records.

History items MUST expose sufficient information to identify type, business date, amount, account, category when applicable, protected/eligible state, and nullable `payee` and `memo`. Server-projected current names MUST be used. Transfers MUST appear once with `kind: "TRANSFER"`, a distinct transfer identity, positive amount, source/destination `accounts[]`, and no category.

#### Scenario: List and search effective history

- GIVEN an authorized owner requests valid history filters
- WHEN history is returned
- THEN only matching records from that budget are returned in the established order, with literal search semantics and at most 500 items

#### Scenario: Transfer history is listed and month-filtered

- GIVEN an authorized owner has a committed same-budget transfer, including one involving an archived account
- WHEN the owner lists history for its budget month
- THEN one readable `TRANSFER` item with both account sides and no category is returned, and it is excluded from other months

### Requirement: Eligibility for ordinary edits

The system MUST permit ordinary edits only for posted or working, not-reconciled, unreleased realized income and one-category spending. Eligibility MUST be evaluated against the account that owns the transaction, and that account MUST belong to the authorized budget; eligibility MUST NOT depend on the compatibility alias account. Edits MUST preserve transaction type and account and validate positive integer minor-unit amounts and budget-valid dates. A cleared transaction MUST remain eligible for ordinary edit. An ordinary edit MUST NOT be applied to a reconciled transaction. Transfers MUST remain readable and their financial content MUST remain immutable; a transfer's cleared state is changed only through the separate financially neutral cleared-state operation defined in this specification.

#### Scenario: Eligible ordinary transaction is edited

- GIVEN an owner has a posted or working, not-reconciled, unreleased supported income or one-category spending transaction in any active account of their budget
- WHEN the owner submits an otherwise valid edit
- THEN the edit MUST be eligible for processing regardless of whether the transaction is cleared and regardless of whether its account is the compatibility alias
- AND a transfer, a reconciled transaction, or another protected transaction MUST remain immutable to ordinary edits

### Requirement: Bounded amount and date correction

The system MUST allow eligible realized income and one-category spending to change amount and business date only when the date remains in the same `YYYY-MM` month. Cross-month edits MUST return `CONFLICT` and MUST NOT change the transaction or month-specific effects.

#### Scenario: Cross-month correction is rejected

- GIVEN an eligible transaction belongs to one budget month
- WHEN the owner attempts to edit its business date into a different `YYYY-MM` month
- THEN the system MUST return `CONFLICT` and MUST leave the transaction and month-specific effects unchanged

### Requirement: Spending category retention and replacement

The system MUST preserve archived category references and allow amount/date edits to retain them. A replacement category MUST be active and belong to the same authorized budget; archived or foreign categories MUST be rejected without mutation. Category effects MUST be replaced rather than retained twice.

#### Scenario: Spending category is replaced safely

- GIVEN an eligible spending transaction references an existing category
- WHEN the owner replaces it with an active category from the same authorized budget
- THEN the old category effect MUST be replaced exactly once and the new category effect MUST be authoritative

### Requirement: Normalized nullable transaction metadata

Supported income, spending, and transfer commands SHALL accept optional `payee` and `memo`. The server SHALL trim Unicode whitespace, preserve case, and count Unicode code points after trimming. `payee` SHALL be at most 200 code points and `memo` at most 1000. Missing, JSON `null`, and trimmed-empty values SHALL project as `null`; responses SHALL always represent both fields as nullable properties. Invalid types or excessive values SHALL be validation errors without mutation.

#### Scenario: Transaction metadata is normalized

- GIVEN a supported transaction command contains payee or memo with surrounding Unicode whitespace
- WHEN the command is validated
- THEN the values SHALL be trimmed with case preserved, and trimmed-empty values SHALL project as `null`

### Requirement: Immutable metadata lifecycle

Metadata SHALL participate in immutable replacement and tombstone folding. An omitted edit field preserves its effective value; a supplied non-empty value replaces it; null or trimmed-empty clears it. Prior events remain immutable. Tombstones retain only folding linkage and are never visible or searchable. Effective and PostgreSQL restart/rebuild projections MUST agree.

#### Scenario: Metadata edit preserves immutable history

- GIVEN an effective transaction with existing metadata
- WHEN the owner changes or clears one metadata field
- THEN a replacement SHALL become effective, prior events SHALL remain immutable, and tombstones SHALL remain invisible and unsearchable

### Requirement: Metadata is financially neutral and command-safe

Metadata MUST NOT change amount, account, category, business date, transfer direction, balances, category Activity, Assigned, Available, rollover, or RTA. Metadata MUST be included in the canonical budget-scoped idempotency payload. Existing authorization, non-disclosure, `If-Match`, envelopes, atomic PostgreSQL behavior, and edit eligibility restrictions remain authoritative.

#### Scenario: Metadata-only change preserves financial values

- GIVEN an effective transaction with stable amount, account, category, date, and transfer direction
- WHEN only payee or memo changes
- THEN balances, Activity, Assigned, Available, rollover, and RTA MUST remain unchanged

### Requirement: Explicitly confirmed deletion with minimum audit identity

The system MUST require explicit confirmation before deleting an eligible realized income or one-category spending transaction. A reason is optional. Successful deletion MUST retain actor identity, transaction identity, request/correlation identity when applicable, timestamp, optional reason, and idempotency identity. No audit-read endpoint is provided. Transfers cannot be deleted.

#### Scenario: Confirmed deletion records minimum audit evidence

- GIVEN an eligible supported transaction and explicit deletion confirmation
- WHEN the owner deletes the transaction
- THEN the transaction MUST cease to be effective and the minimum required actor, transaction, request, timestamp, reason, and idempotency evidence MUST be retained

### Requirement: Released-income and unsupported-state protection

Released income MUST remain readable as protected history, while edit/delete attempts return `CONFLICT`. Reconciled, unsupported, split, transfer, card, refund, scheduled, repeated, or otherwise ineligible mutation attempts MUST be rejected without mutation. A cleared-state transition is not an ordinary mutation: it MUST be permitted on an eligible not-reconciled item and MUST be rejected on a reconciled item. Transfer edits/deletes MUST preserve both paired effects and the transfer record.

#### Scenario: Protected transaction cannot be mutated

- GIVEN released income, a reconciled transaction, a transfer, or another unsupported transaction state
- WHEN an ordinary edit or delete is requested
- THEN the mutation MUST be rejected without changing the transaction or any financial effect
- AND a cleared-state transition MUST still be permitted for the same item when it is not reconciled

### Requirement: Atomic replacement and removal of financial effects

Every successful edit or deletion MUST replace or remove prior effective financial effects exactly once, including account, plan, category, rollover, and affected month outcomes. Failed mutations MUST leave history and effects unchanged. PostgreSQL remains authoritative; client balances and summaries are never authoritative. Results MUST be deterministically rebuildable from persisted history and retained evidence.

#### Scenario: Failed mutation leaves all effects unchanged

- GIVEN a supported edit or deletion would affect account, plan, category, rollover, or month outcomes
- WHEN the mutation fails before commit
- THEN no replacement, removal, balance change, category effect, or derived month outcome MUST be partially applied

### Requirement: Idempotent and optimistic-concurrency-safe mutations

Mutations MUST require budget-scoped idempotency and an optimistic version. Compatible retries return the saved outcome without duplicate effects, replacements, tombstones, or audit rows. Incompatible idempotency reuse or stale versions MUST return `CONFLICT` without mutation. A new request for an already deleted transaction is `NOT_FOUND`.

#### Scenario: Mutation retry and stale version are safe

- GIVEN a mutation has an idempotency key and expected budget version
- WHEN the same request is replayed or a stale version is submitted
- THEN an identical replay MUST return its saved outcome, while stale or incompatible reuse MUST return `CONFLICT` without duplicate effects

### Requirement: Stable envelopes and non-disclosing authorization

History success and error responses MUST use established API envelopes and stable semantics, including `CONFLICT` for protected, stale, incompatible, and cross-month mutations. Foreign or inaccessible budgets, transactions, accounts, and categories MUST follow existing non-disclosing behavior and reveal neither existence nor financial details.

#### Scenario: Foreign history resource remains undisclosed

- GIVEN an authenticated user references a budget, transaction, account, or category owned by another user
- WHEN the user attempts a history read or mutation
- THEN the established non-disclosing response MUST be returned without exposing existence or financial details

### Requirement: Bounded transaction-history scope

The capability SHALL support owner-authorized posted or working, not-reconciled realized income and one-category spending, nullable metadata, bounded filters, the approved same-budget transfer history projection, cleared-state transitions, and manual reconciliation with reconciled locking, each only within the explicit scope defined by the requirements in this specification. Transfers remain visible but are not editable or deletable as to their financial content. It MUST NOT provide splits, multiple-account transfer mutation, payee/memo behavior beyond the normalized metadata contract, repetition, closed-month corrections, unlocking or correction of reconciled history, import matching against reconciled history, CSV/import workflows, banking synchronization, cards, refunds, schedules, or audit-read behavior, and SHALL NOT alter the approved transfer aggregate/effect model.

#### Scenario: Unsupported history capability remains unavailable

- GIVEN a user attempts a split, card, schedule, refund, CSV import, banking synchronization, an unlock or correction of reconciled history, import matching, or another capability outside the bounded history scope
- WHEN the request reaches transaction-history behavior
- THEN the capability MUST remain unavailable and the approved effective history and transfer model MUST remain unchanged

### Requirement: Older account history remains reachable beyond bounded results

An authorized owner MUST be able to reach available supported history for a selected account beyond the current 500-item result cap. A bounded history response MAY continue to contain at most 500 records, but the account-history experience MUST NOT make older matching records unreachable because of that cap. The continuation mechanism, request shape, and batch size are left to design.

#### Scenario: Owner reaches history older than the first 500 records

- GIVEN an account has more than 500 available supported history records
- WHEN its owner continues through that account's activity history beyond the initial result window
- THEN the owner can reach older matching records beyond the first 500
- AND the records remain associated with the correct account and retain the canonical transaction-history meaning
- AND no individual result is required to exceed the existing 500-record bound

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
