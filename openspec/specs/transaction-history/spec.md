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

The system MUST permit ordinary edits only for posted or working, non-reconciled, unreleased realized income and one-category spending in the supported account. Edits MUST preserve transaction type and account and validate positive integer minor-unit amounts and budget-valid dates. Transfers MUST remain readable but immutable.

#### Scenario: Eligible ordinary transaction is edited

- GIVEN an owner has a posted or working, non-reconciled, unreleased supported income or one-category spending transaction
- WHEN the owner submits an otherwise valid edit
- THEN the edit MUST be eligible for processing, while a transfer or protected transaction MUST remain immutable

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

Released income MUST remain readable as protected history, while edit/delete attempts return `CONFLICT`. Reconciled, unsupported, split, transfer, card, refund, scheduled, repeated, or otherwise ineligible mutation attempts MUST be rejected without mutation. Transfer edits/deletes MUST preserve both paired effects and the transfer record.

#### Scenario: Protected transaction cannot be mutated

- GIVEN released income, a reconciled transaction, a transfer, or another unsupported transaction state
- WHEN an edit or delete is requested
- THEN the mutation MUST be rejected without changing the transaction or any financial effect

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

The capability SHALL support owner-authorized posted or working, non-reconciled realized income and one-category spending, nullable metadata, bounded filters, and the approved same-budget transfer history projection. Transfers remain visible but are not editable or deletable. It MUST NOT provide splits, multiple-account transfer mutation, payee/memo behavior beyond the normalized metadata contract, state changes, repetition, closed-month corrections, reconciliation, CSV/import workflows, banking synchronization, cards, refunds, schedules, or audit-read behavior, and SHALL NOT alter the approved transfer aggregate/effect model.

#### Scenario: Unsupported history capability remains unavailable

- GIVEN a user attempts a split, card, reconciliation, schedule, CSV import, banking synchronization, or another capability outside the bounded history scope
- WHEN the request reaches transaction-history behavior
- THEN the capability MUST remain unavailable and the approved effective history and transfer model MUST remain unchanged
