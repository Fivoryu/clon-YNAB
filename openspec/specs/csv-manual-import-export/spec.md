# CSV Manual Import and Export Specification

## Purpose

Define the additive, authenticated, synchronous CSV round trip for effective income, spending, and transfer history without changing existing JSON behavior, PostgreSQL authority, account compatibility, or transfer semantics.

## Requirements

### Requirement: Canonical CSV format

The system MUST accept and emit only UTF-8 RFC 4180-compatible CSV with CRLF record endings and the exact header `date,type,account,amountMinor,category,payee,memo`. Fields MUST use standard RFC 4180 quoting when required; alternate delimiters, headers, columns, encodings, and dialects MUST be rejected. `amountMinor` MUST be a positive safe integer represented without a sign, decimal point, or exponent. `type` MUST be exactly `INCOME`, `SPENDING`, or `TRANSFER`.

`date` MUST be exactly `YYYY-MM-DD`, with a four-digit year and valid month/day (including leap-year rules). It is a date-only business date; it MUST NOT contain a time, offset, or timezone. Budget-month derivation MUST use the budget's configured IANA timezone, defaulting to UTC, while stored timestamps remain UTC. `category` MUST be non-empty for `SPENDING` and MUST be empty for `INCOME` and `TRANSFER`.

`payee` and `memo` MUST use the approved nullable metadata contract: trim Unicode whitespace, preserve case, count Unicode code points after trimming, map missing, null-equivalent empty CSV fields, and trimmed-empty values to null, and reject more than 200 code points for payee or 1,000 for memo. CSV has no null token; an empty field represents null.

#### Scenario: Canonical export bytes are consumable

- GIVEN effective supported history containing quoted metadata and a transfer
- WHEN the owner exports the budget
- THEN the file MUST be UTF-8, contain exactly the canonical header once, quote fields according to RFC 4180, and terminate every record with CRLF

#### Scenario: Non-canonical input is rejected

- GIVEN an import with a wrong header, invalid UTF-8, LF-only records, an unsupported type, malformed date, decimal amount, or incorrect column count
- WHEN the import is submitted
- THEN the request MUST fail validation before financial persistence and MUST leave the budget unchanged

#### Scenario: Metadata is normalized during import

- GIVEN a row whose payee or memo has surrounding Unicode whitespace and mixed case
- WHEN the row is validated
- THEN the stored and returned value MUST be trimmed with case preserved; an empty result MUST be nullable

### Requirement: Authenticated CSV endpoints and envelopes

The system MUST expose these additive owner-authorized endpoints:

- `GET /api/v1/budgets/{budgetId}/transactions/export`, returning `200` with `Content-Type: text/csv; charset=utf-8` and the CSV bytes.
- `POST /api/v1/budgets/{budgetId}/transactions/import`, requiring `Content-Type: text/csv` with an optional `charset=utf-8`, returning JSON with `Content-Type: application/json`.

JSON import results and errors MUST use the existing `{ data, requestId }` or `{ error, requestId }` envelope conventions. A successful import MUST return `201` and `data` containing `rows`, `accepted`, `rejected: 0`, `diagnostics: []`, and the committed budget `version`; `rows` MUST be the number of data rows. A fully validated file with zero data rows MUST be rejected. Validation, including malformed CSV and row diagnostics, MUST return `400`; missing/invalid authentication MUST return `401`; an inaccessible budget MUST use the established non-disclosing `404`; stale versions or idempotency conflicts MUST return `409`; and an unsupported media type MUST return `415`. Export MUST return the established JSON error envelope for non-success statuses.

Import MUST require both `Idempotency-Key` and `If-Match` before financial processing. `If-Match` MUST contain the expected integer budget version, accepting the existing quoted or weak-quoted syntax. The request ID behavior MUST remain unchanged. Existing JSON transaction routes, envelopes, authorization, and the canonical `accounts[]` projection—including the deterministic oldest-account `account` alias—MUST remain unchanged.

#### Scenario: Owner imports a valid file

- GIVEN an authenticated owner, an accessible budget, the required headers, and a canonical CSV file
- WHEN the owner posts to the import endpoint
- THEN the server MUST return `201` in the standard envelope with accepted row counts and the one new budget version

#### Scenario: Export uses CSV rather than a JSON wrapper

- GIVEN an authenticated owner of an accessible budget
- WHEN the owner requests the export endpoint
- THEN the server MUST return `200` with CSV content and MUST NOT wrap the file in JSON or advance the budget version

#### Scenario: Missing command headers are rejected safely

- GIVEN an authenticated owner submits import without `Idempotency-Key` or `If-Match`
- WHEN the request is processed
- THEN the server MUST return a validation error without parsing into financial state or changing any row, receipt, or version

### Requirement: Bounded complete-file validation and diagnostics

The import body MUST be at most 10 MiB (10,485,760 bytes) before processing and MUST contain at most 5,000 data rows, excluding the header. A body over the byte limit or a file over the row limit MUST be rejected without financial mutation. The server MUST parse and validate the entire file before any financial write. It MUST return one bounded diagnostic object per invalid data row, with at most 1,000 diagnostics; each diagnostic MUST contain the CSV row number (header is row 1), a stable field or `file` target, a stable code, and a safe human-readable message. Row numbers MUST be physical CSV record numbers, so embedded newlines inside quoted fields count as one record. Diagnostics MUST NOT include raw CSV content, account/category existence outside the selected budget, SQL errors, or other sensitive details.

The result MUST report total `rows`, `accepted`, and `rejected` counts. If more than 1,000 invalid rows exist, `rejected` MUST still report the true count and the response MUST include exactly 1,000 diagnostics plus a `diagnosticsTruncated: true` indicator. Recommended stable validation codes that implementations MUST use consistently are `FILE_TOO_LARGE`, `ROW_LIMIT_EXCEEDED`, `INVALID_ENCODING`, `INVALID_CSV`, `INVALID_HEADER`, `INVALID_COLUMN_COUNT`, `INVALID_DATE`, `INVALID_TYPE`, `INVALID_AMOUNT`, `INVALID_ACCOUNT`, `INVALID_CATEGORY`, `INVALID_METADATA`, `LIMIT_EXCEEDED`, `TRANSFER_GRAMMAR`, and `RESOURCE_UNAVAILABLE`.

#### Scenario: One invalid row rejects the whole file

- GIVEN a 100-row file containing one invalid amount
- WHEN validation completes
- THEN the response MUST be `400` with `rows: 100`, `accepted: 99`, a diagnostic for the physical row, and no transaction, identity, receipt, aggregate, effect, metadata, or version change

#### Scenario: Diagnostic output is capped

- GIVEN a file with more than 1,000 invalid rows within the file limits
- WHEN validation completes
- THEN the response MUST contain the true rejected count, no more than 1,000 diagnostics, and an explicit truncation indicator without exposing row content

### Requirement: Same-budget resource and transfer semantics

`account` for `INCOME` and `SPENDING` MUST be one stable canonical account identifier. `account` for `TRANSFER` MUST be exactly `sourceAccountId=>destinationAccountId`, with exactly one delimiter and non-empty stable identifiers on both sides. Both identifiers and any spending category identifier MUST resolve only within the selected owner-authorized budget. The server MUST NOT create or map accounts or categories implicitly. Unknown, malformed, foreign, archived, or otherwise unavailable resources MUST produce safe validation/conflict behavior without disclosing existence.

A transfer row MUST reference two distinct active supported accounts in the same budget, must have no category, and MUST create one new transfer identity, one transfer aggregate, and exactly two paired account effects. Transfers MUST remain distinct from category `MOVE`, preserve aggregate balance, and remain neutral to category Activity, Assigned, Available, rollover, and RTA. Archived accounts remain exportable through effective history but MUST reject new imported movements.

Imported rows MUST use the same authoritative account, category, metadata, history, transfer, authorization, and reporting invariants as corresponding manual commands. The server MUST never use the singular oldest-account alias as an export identity or as an implicit import target.

#### Scenario: A transfer round trip has one public row

- GIVEN a valid same-budget transfer between active accounts A and B
- WHEN it is imported and later exported
- THEN the import MUST create one transfer aggregate with paired effects and the export MUST contain exactly one row whose account cell is `A=>B`

#### Scenario: Cross-budget or archived references are contained

- GIVEN a row references a foreign, unknown, or archived account/category
- WHEN the file is validated
- THEN the row MUST receive a safe diagnostic, no resource existence MUST be disclosed, and no part of the file MUST commit

### Requirement: Effective deterministic export

Export MUST be read-only and version-neutral. It MUST select only current effective income, spending, and transfer history visible to the authorized owner. It MUST exclude tombstones, raw audit events, superseded/replaced records, command receipts, paired transfer effects as separate rows, and unsupported transaction types. It MUST project current server-owned account/category references and current nullable metadata; spending rows MUST contain their category identifier and income/transfer rows MUST contain an empty category field.

The export order MUST be deterministic and independent of database retrieval order: ascending business date, ascending type (`INCOME`, `SPENDING`, `TRANSFER`), ascending canonical account cell, ascending `amountMinor`, ascending category (empty first), ascending nullable payee (null first), ascending nullable memo (null first), and finally ascending durable effective identity as the tie-breaker. The identity MUST affect ordering only and MUST NOT be emitted. Export MUST use the approved transfer `accounts[]` direction and MUST never expose the oldest-account alias in place of an account identity.

#### Scenario: Effective filtering excludes non-visible records

- GIVEN a transaction with a superseded predecessor, a tombstone, and a transfer with two effects
- WHEN the owner exports history
- THEN only the effective transaction or one transfer row MUST be emitted; no predecessor, tombstone, receipt, or paired effect may appear

#### Scenario: Equal visible rows have stable order

- GIVEN two effective rows with equal exported fields
- WHEN the export is requested repeatedly
- THEN their order MUST be identical because the durable effective identity is the final tie-breaker, and the budget version MUST remain unchanged

### Requirement: Atomic append-only import and shared versioning

After complete validation succeeds, all imported rows MUST commit in one PostgreSQL transaction under the selected budget's concurrency boundary. The transaction MUST append all new identities, metadata, transfer aggregate/effects, the idempotency outcome, and exactly one shared budget version advancement, or roll back all of them. Imported rows MUST never preserve source identities; duplicate-looking rows MUST be accepted as distinct new transactions. A successful zero-row commit is not permitted.

A stale `If-Match` MUST conflict at the commit boundary, including when another account, transfer, metadata, or financial command advances the budget during validation. A failed database commit MUST leave no imported financial state, receipt, metadata, or version advancement. PostgreSQL remains authoritative; in-memory parity MUST NOT substitute for durable behavior.

#### Scenario: A valid batch advances version once

- GIVEN a valid file with 500 rows and the expected current version
- WHEN the batch commits
- THEN all 500 rows MUST be durable, each MUST have a new identity, and the budget version MUST advance exactly once

#### Scenario: Concurrent mutation makes the batch stale

- GIVEN import validation began at version V and another budget mutation commits first
- WHEN the import reaches its commit boundary with `If-Match: V`
- THEN import MUST return `409`, commit no rows or receipt, and leave the newer version and history intact

#### Scenario: Duplicate-looking rows remain distinct

- GIVEN two identical data rows in one valid file
- WHEN the import commits
- THEN both MUST be accepted as separate transactions with distinct identities and effects

### Requirement: Idempotent retries and malformed-file behavior

The import idempotency digest MUST be SHA-256 over the UTF-8 bytes of a canonical payload consisting of the route, selected budget identifier, expected version, and canonical reserialization of all parsed rows after validation normalization, using the exact header, RFC 4180 quoting, and CRLF endings. The budget-scoped idempotency record MUST compare this digest. An identical key and digest MUST replay the original JSON result without creating rows, effects, metadata, or another version. Reusing a key with a different digest MUST return `409` without state change.

Malformed, over-limit, unauthorized, or otherwise pre-validation failures MUST NOT create an idempotency receipt or consume the key. A client MAY correct the file and retry that key; once a valid request commits or records a durable conflict, the key follows normal idempotency rules. Export MUST not require idempotency and MUST never create a receipt.

#### Scenario: Identical valid retry replays

- GIVEN a successful import with key K and its canonical normalized file digest
- WHEN the owner retries key K with the identical file and expected version
- THEN the server MUST replay the original result without duplicate rows, effects, receipt, or version advancement

#### Scenario: Key reuse with changed content conflicts

- GIVEN key K committed a valid import
- WHEN K is reused with a materially different row, metadata value, or expected version
- THEN the server MUST return `409` and MUST not change financial state

#### Scenario: Malformed retry can be corrected

- GIVEN key K is used with malformed CSV
- WHEN the server returns `400` and no valid receipt exists, then the owner retries K with a valid canonical file
- THEN the valid file MUST be eligible for normal processing and MUST not be treated as a conflicting reuse solely because the malformed attempt used K

### Requirement: Explicit out-of-scope boundary

This capability MUST remain manual and synchronous. It MUST NOT introduce background jobs, queues, asynchronous polling, cards, splits, reconciliation, bank synchronization, scheduled transactions, identity preservation, cross-budget import, implicit resource provisioning, raw-audit export, tombstone export, or client-calculated financial authority.

#### Scenario: Unsupported data is not silently converted

- GIVEN a file attempts to represent cards, splits, reconciliation state, or a source identity
- WHEN it is submitted
- THEN the file MUST be rejected as unsupported and MUST not be converted into an income, spending, or transfer row
