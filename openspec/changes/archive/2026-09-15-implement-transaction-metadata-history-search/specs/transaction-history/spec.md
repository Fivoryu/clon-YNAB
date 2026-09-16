# Delta for Transaction History

## ADDED Requirements

### Requirement: Normalized nullable transaction metadata

Supported income, spending, and transfer commands SHALL accept optional `payee` and `memo` fields. The server SHALL trim Unicode whitespace, preserve case, and count Unicode code points after trimming. `payee` SHALL be no longer than 200 code points and `memo` SHALL be no longer than 1000 code points. A missing or JSON `null` value on creation SHALL result in `null`; a trimmed-empty value SHALL also result in `null`. Responses SHALL represent both fields consistently as nullable properties (`string` or `null`). Values exceeding their limit or having an invalid JSON type SHALL be rejected as validation errors without mutation.

#### Scenario: Metadata is normalized and returned as nullable fields

- GIVEN an owner records income with payee containing surrounding Unicode whitespace and a mixed-case memo
- WHEN the command succeeds
- THEN the stored and returned values SHALL be trimmed, SHALL preserve case, SHALL be counted by Unicode code point, and the response SHALL include `payee` and `memo` as nullable properties

#### Scenario: Null and empty metadata clear the value

- GIVEN a transaction has non-null payee and memo
- WHEN a command supplies `null` or text that becomes empty after Unicode-whitespace trimming
- THEN the corresponding value SHALL be stored and projected as `null`

#### Scenario: Metadata length is enforced

- GIVEN a payee or memo exceeds its applicable Unicode-code-point limit after trimming
- WHEN the command is submitted
- THEN the server SHALL return a validation error and SHALL leave the transaction and financial effects unchanged

### Requirement: Immutable metadata lifecycle

Metadata SHALL be authoritative nullable transaction data and SHALL participate in the existing immutable replacement and tombstone model. An edit SHALL preserve an omitted metadata field’s current effective value, replace a supplied non-empty value, and clear a supplied `null` or trimmed-empty value. Prior events SHALL remain immutable. Tombstones SHALL retain only the linkage required for folding and SHALL never be visible or searchable. Effective history and PostgreSQL rebuild/restart reads SHALL produce the same metadata projection.

#### Scenario: An omitted edit field preserves metadata

- GIVEN an eligible transaction has a payee and memo
- WHEN its owner edits amount, date, or category without including payee or memo
- THEN the replacement’s effective metadata SHALL retain both current values

#### Scenario: A metadata edit is an immutable replacement

- GIVEN an eligible transaction has existing metadata
- WHEN its owner submits a valid metadata edit
- THEN a new replacement SHALL become effective, the prior event SHALL remain unchanged, and all financial effects SHALL remain exactly once

#### Scenario: Deleted metadata is not exposed

- GIVEN a supported transaction is successfully deleted
- WHEN the owner lists or searches history
- THEN no tombstone or deleted transaction SHALL be returned or matched

### Requirement: Metadata is financially neutral and command-safe

Metadata SHALL NOT change amount, account, category, business date, transfer direction, or any financial equation, including balances, category Activity, Assigned, Available, rollover, or RTA. Metadata SHALL be part of the canonical budget-scoped idempotency payload. Existing owner authorization, non-disclosure, `If-Match`, stable envelopes, atomic PostgreSQL command behavior, and existing edit eligibility restrictions SHALL remain authoritative.

#### Scenario: Metadata-only edit leaves financial outcomes unchanged

- GIVEN an eligible income or spending transaction and its calculated financial outcomes
- WHEN the owner changes only payee or memo
- THEN only the effective metadata SHALL change and all financial outcomes SHALL remain unchanged

#### Scenario: Metadata payload is idempotent

- GIVEN a successful metadata command with an idempotency key
- WHEN the owner retries the same normalized payload
- THEN the original result SHALL be replayed without another replacement or financial effect; reuse with a materially different normalized payload SHALL conflict

#### Scenario: Protected or unauthorized mutation remains protected

- GIVEN a released, reconciled, unsupported, foreign, or inaccessible transaction
- WHEN a metadata edit or delete is attempted
- THEN the established conflict or non-disclosing authorization response SHALL be returned and no state SHALL change

### Requirement: Effective history DTO projection

History SHALL be projected only from effective records and SHALL preserve the existing envelopes and ordering (business date descending, creation timestamp descending, then transaction identity descending where already applicable). Income and spending items SHALL expose nullable `payee` and `memo`; transfer items SHALL expose the same nullable fields alongside the approved canonical `accounts[]` source/destination projection and `kind: "TRANSFER"`. Server-projected current account and category names SHALL be used; clients SHALL NOT provide authoritative names. Transfers SHALL appear once, not as paired effects, and SHALL have no category.

#### Scenario: Metadata appears on all supported history kinds

- GIVEN effective income, spending, and transfer records with metadata
- WHEN the owner reads or lists history
- THEN each corresponding DTO SHALL expose its nullable metadata and retain its existing kind-specific fields

#### Scenario: Current names drive projection

- GIVEN a historical record references an account or category that is renamed or archived
- WHEN the owner reads or searches history
- THEN the server SHALL project the current authorized name while retaining the durable reference and SHALL not require a client label

### Requirement: Bounded, literal history filtering and search

The history endpoint SHALL accept only the query parameters `month`, `account`, `kind`, `category`, `from`, `to`, and `q`; each parameter SHALL occur at most once. `month` SHALL use `YYYY-MM`; `from` and `to` SHALL use `YYYY-MM-DD` and SHALL be inclusive; `kind` SHALL be one of `INCOME`, `SPENDING`, or `TRANSFER`; and account/category values SHALL be canonical server-owned identifiers. Supplied filters SHALL combine with AND semantics. `q` SHALL be a literal, case-insensitive partial substring match across payee, memo, current category name, and current account name; pattern metacharacters SHALL have no wildcard meaning. Empty or whitespace-only `q` SHALL be treated as omitted. `from` later than `to`, malformed values, repeated parameters, unknown parameters, and unsupported kinds SHALL be rejected as validation errors. Valid filters SHALL be allowed to return an empty list. Foreign or unknown referenced account/category identifiers SHALL use the established safe non-disclosing resource behavior.

#### Scenario: Combined filters narrow effective history

- GIVEN history containing multiple kinds, accounts, categories, months, and dates
- WHEN an owner supplies valid month, account, kind, category, date, and q filters
- THEN only records satisfying every supplied predicate SHALL be returned

#### Scenario: Literal search does not interpret pattern characters

- GIVEN a memo containing the literal text `100%_ready`
- WHEN the owner searches with `q=100%_`
- THEN the matching decision SHALL use literal substring semantics and SHALL not treat `%` or `_` as wildcard operators

#### Scenario: Date bounds are inclusive and inverted ranges fail

- GIVEN records dated on both requested boundary dates
- WHEN the owner searches with inclusive `from` and `to` values
- THEN records on both boundaries SHALL be eligible; if `from` is later than `to`, the request SHALL fail validation and return no partial result

### Requirement: Bounded result safeguards

History results SHALL remain unpaginated and SHALL contain no more than 500 records. The server SHALL enforce a bounded query input suitable for the existing request limits and SHALL reject an overlong `q` (more than 200 Unicode code points) as a validation error. Filtering and searching SHALL operate on effective, authorized projections and SHALL not alter the established ordering.

#### Scenario: Large matching history is capped

- GIVEN more than 500 authorized effective records satisfy a valid filter
- WHEN the owner requests history
- THEN the response SHALL contain at most 500 records in the unchanged established order

#### Scenario: Overlong search input is rejected

- GIVEN `q` exceeds 200 Unicode code points
- WHEN the owner requests history
- THEN the server SHALL return a validation error without exposing an unbounded query or result

## MODIFIED Requirements

### Requirement: Bounded transaction-history scope

The capability SHALL support owner-authorized posted or working, non-reconciled, realized income and one-category spending, plus the approved same-budget transfer history projection. It SHALL support nullable payee and memo metadata and the bounded filters defined in this delta. Transfers SHALL remain visible but SHALL not be editable or deletable. It MUST NOT provide splits, card transactions, refunds, schedules, repetition, reconciliation, closed-month corrections, CSV/import workflows, banking synchronization, or audit-read behavior, and SHALL NOT alter the approved transfer aggregate/effect model.
(Previously: The capability supported only income and one-category spending in one account and explicitly excluded payee, memo, and transfers.)

#### Scenario: Unsupported transaction shape remains outside scope

- GIVEN a split, card, refund, scheduled, repeated, reconciled, or otherwise unsupported transaction
- WHEN a user attempts to edit or delete it through this capability
- THEN the system SHALL reject the operation without changing the transaction or financial effects

#### Scenario: Transfers are readable but immutable

- GIVEN an approved transfer is present in effective history
- WHEN its owner attempts to edit or delete it
- THEN the operation SHALL be rejected and the transfer aggregate, paired effects, and history SHALL remain unchanged
