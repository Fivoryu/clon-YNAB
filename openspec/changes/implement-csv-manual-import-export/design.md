# Technical Design: Manual CSV Import and Export

## Scope and invariants

This design turns the approved CSV specification into one additive, synchronous API slice. It is dependent on the approved multi-account/transfer model and metadata/history model being deployed first (including canonical `accounts[]`, the oldest-account `account` compatibility alias, the `Transfer` aggregate, and nullable normalized metadata).

The existing JSON routes, envelopes, authorization order, history semantics, version stream, report equations, and client-visible fields retain their current meaning. CSV is a second representation of supported effective history, not a second financial authority. Imports append new identities; they never preserve source IDs. Duplicate-looking rows are accepted as separate transactions, with no matching or duplicate detector.

This slice excludes background processing, queues, polling, partial success, implicit account/category creation or mapping, cross-budget imports, identity preservation, cards, splits, reconciliation, banking/synchronization, scheduled transactions, raw-audit/tombstone export, and unsupported transaction conversion.

## HTTP contract and content handling

The two exact additive routes are:

- `GET /api/v1/budgets/{budgetId}/transactions/export`
- `POST /api/v1/budgets/{budgetId}/transactions/import`

Both use the existing cookie authentication, request ID, owner-scoped budget lookup, and non-disclosing inaccessible-budget behavior. Authorization is established before account/category resolution or any detailed resource diagnostic.

### Export

An authorized export returns `200`, `Content-Type: text/csv; charset=utf-8`, and the CSV bytes directly—never a JSON wrapper. It uses a deterministic attachment name such as `transactions.csv` in `Content-Disposition`. It does not require `Idempotency-Key`, does not create a receipt, and does not advance the budget version. Non-success responses use the existing `{ error, requestId }` JSON envelope.

`Accept` is not a second format negotiation: this endpoint always emits the canonical CSV representation. If an implementation rejects an explicitly incompatible `Accept`, it must use the existing error conventions without changing the successful contract.

### Import

Import requires `Content-Type: text/csv` with no charset or a case-insensitive `charset=utf-8` parameter. Any other media type, charset, or malformed media-type parameter returns `415` before financial processing. The body is read as bounded bytes, not as a prematurely decoded string:

- more than `10,485,760` bytes (10 MiB) returns `400` with `FILE_TOO_LARGE`;
- UTF-8 decoding is fatal; invalid sequences return `400` with `INVALID_ENCODING`;
- a UTF-8 BOM is not stripped and therefore fails exact-header validation.

Import also requires `Idempotency-Key` and `If-Match`. The existing header parser is reused: `If-Match` accepts an integer, quoted integer, or weak-quoted integer and rejects wildcard, non-integer, duplicate, or otherwise invalid values as `400`. Missing command headers are rejected without parsing into financial state. Existing JSON command header behavior is unchanged.

Success is `201` with `Content-Type: application/json` and the existing `{ data, requestId }` envelope:

```json
{
  "data": {
    "rows": 2,
    "accepted": 2,
    "rejected": 0,
    "diagnostics": [],
    "diagnosticsTruncated": false,
    "version": 18
  },
  "requestId": "..."
}
```

A validation failure is `400` in the existing `{ error, requestId }` envelope. The error has `code: "VALIDATION_ERROR"`, a safe summary, and a bounded `details` object with the same `rows`, `accepted`, `rejected`, `diagnostics`, and `diagnosticsTruncated` fields. A file-level failure may use `rows: 0`, `accepted: 0`, and `rejected: 0` when no data records can be counted. Stale versions and idempotency conflicts are `409`; missing/invalid authentication is `401`; an inaccessible budget is `404`; unsupported media is `415`; unexpected failures are the existing generic `500` error. No response includes raw CSV, SQL errors, or foreign-resource existence.

## Canonical CSV parser and serializer

A focused pure CSV module is the only owner of byte/record grammar and canonical serialization. It receives bytes for import and emits bytes for export. The parser is deliberately narrower than a general CSV library:

1. Decode strict UTF-8 without BOM removal.
2. Require exactly one header record, exactly the byte/text sequence `date,type,account,amountMinor,category,payee,memo`, and at least one data record.
3. Require CRLF (`\r\n`) record endings, including the final record terminator. A bare LF or CR outside a quoted field is `INVALID_CSV`.
4. Implement RFC 4180 quoting: commas, quotes, and embedded CRLF are legal only inside quoted fields; a quote in a quoted field is represented by `""`; unquoted quotes and unterminated quotes are invalid. Embedded CRLF is one logical record and one data-row number.
5. Require exactly seven fields for every data record. Blank data records are seven empty fields and then fail the row rules rather than being silently skipped.
6. Do not trim date, type, IDs, amount, or category. Metadata alone receives the approved Unicode normalization below.

The serializer writes the exact header followed by one CRLF-terminated record per row, with no BOM and UTF-8 encoding. It uses minimal RFC 4180 quoting: a field is quoted when it contains comma, quote, CR, or LF, and embedded quotes are doubled. It never emits a null token; null metadata and empty category become empty fields.

### Row normalization and validation

A row is normalized into an internal command only after its seven-field shape is valid. Date is exactly `YYYY-MM-DD` with four digits, real month/day, and leap-year validation; it has no time, offset, or timezone. The budget-timezone month helper interprets that date as a budget-local date (default UTC), while timestamps remain UTC. Amount matches positive decimal digits only (`0` and leading-sign/decimal/exponent forms are invalid), converts to a safe integer, and rejects overflow.

`type` is exactly `INCOME`, `SPENDING`, or `TRANSFER`. For `INCOME` and `SPENDING`, `account` is one canonical UUID account ID. For `TRANSFER`, `account` is exactly one `sourceAccountId=>destinationAccountId` delimiter with two non-empty canonical UUID IDs and no whitespace or escaping variation. IDs are normalized to the server's canonical lowercase UUID form only when the UUID grammar is otherwise exact. `category` is required and a canonical UUID for `SPENDING`; it must be empty for income and transfer. No names are accepted in these fields.

Payee and memo use the shared metadata normalizer: trim Unicode `White_Space` code points at both ends, preserve all remaining code points and case, do not apply NFC/case folding, count code points after trimming, map empty to `null`, and enforce 200/1,000 code points respectively. CSV has no null token, so an empty field (quoted or unquoted) is null. Metadata containing embedded line breaks remains representable through RFC quoting and is normalized, not rewritten.

Each row yields at most one diagnostic, selected deterministically by parser/field order. A diagnostic contains the physical CSV row number (header is row 1), `field` or `file`, stable `code`, and safe message. Use the specification codes consistently, including `INVALID_CSV`, `INVALID_HEADER`, `INVALID_COLUMN_COUNT`, `INVALID_DATE`, `INVALID_TYPE`, `INVALID_AMOUNT`, `INVALID_ACCOUNT`, `INVALID_CATEGORY`, `INVALID_METADATA`, `LIMIT_EXCEEDED`, and `TRANSFER_GRAMMAR`.

The parser counts data records while enforcing the 5,000-data-row limit. A file over the limit is rejected with `ROW_LIMIT_EXCEEDED` and no writes; it must not allocate an unbounded diagnostic list. For an in-limit file, all records and all fields are visited before persistence. The result reports true `rows`, `accepted`, and `rejected` counts. Invalid rows are represented by at most the first 1,000 deterministic diagnostics; if more exist, exactly 1,000 are returned with `diagnosticsTruncated: true`.

## Resolution, digest, and command flow

Account/category resolution is same-budget and owner-scoped. After the selected budget is authorized, all referenced account and category IDs are resolved against that budget in one validation phase. Income/spending accounts and both transfer sides must be existing, supported, active accounts. Transfer sides must be distinct. Spending categories must be existing, active, selected-budget categories. Unknown, foreign, malformed, archived, or unavailable references produce a safe row diagnostic (`RESOURCE_UNAVAILABLE` or the field-specific malformed code); they never create resources or reveal whether an ID exists elsewhere. A legacy singular `account` alias is never an implicit import target.

The canonical digest is SHA-256 (lowercase hex) over UTF-8 bytes of this canonical payload:

```text
route = /api/v1/budgets/{budgetId}/transactions/import
budgetId = selected budget identifier
expectedVersion = parsed If-Match integer
csv = canonical serializer(exact header, normalized parsed rows, CRLF)
```

The payload uses the normalized row order supplied by the file, not an export sort. Thus semantically normalized metadata/IDs have one digest, while row reordering is materially different. The route, budget ID, and expected version prevent reuse across budgets, routes, or versions. The raw request bytes are not the digest input.

The request flow is:

1. Authenticate, owner-scope the budget, validate headers/content type, enforce byte limit, decode, parse, normalize, and collect structural/field diagnostics.
2. If parsing/normalization/limits fail, return `400` and persist no receipt. A client may correct the file and reuse the same key.
3. Enter the existing PostgreSQL command boundary, lock the budget first, and look up `(budgetId, idempotencyKey)`.
4. If a receipt exists with the same digest, replay its stored JSON result exactly; do not re-resolve mutable resources or create rows. If the digest differs, return `409` without mutation.
5. If no receipt exists, compare `If-Match` with the locked current version, resolve every row against the locked/current budget state, and run all domain validations. Any failure returns the bounded `400` diagnostic report with no receipt.
6. Only after zero diagnostics, append all income/spending identities and metadata and each transfer aggregate plus exactly `TRANSFER_OUT` and `TRANSFER_IN` effects. Insert one receipt containing the digest and result, advance the shared version once, and commit.

The resource validation and version comparison are repeated at the commit boundary under the budget lock. A concurrent account/category/metadata/history/financial command therefore makes the expected version stale and returns `409` without importing anything. All rows, metadata, transfer aggregate/effects, receipt, and one version increment are in the same PostgreSQL transaction. Database or injected failures roll back every part.

## Effective deterministic export

Export reads PostgreSQL-derived effective history, never raw event rows directly as public rows. It folds immutable ordinary events first, removes superseded records and tombstones, and merges one `Transfer` aggregate per transfer. It includes only effective `INCOME`, `SPENDING`, and `TRANSFER` records. Command receipts, audit-only events, unsupported kinds, deleted records, superseded predecessors, and transfer paired effects are excluded.

Projection uses current authorized server-owned references: ordinary rows emit the stable account ID; spending emits the category ID; income and transfer emit an empty category; transfers emit exactly `sourceAccountId=>destinationAccountId`; current nullable payee/memo are emitted after the shared metadata projection. Archived accounts may appear because their existing effective history remains readable, but the oldest-account alias is never substituted.

CSV ordering is independent of database retrieval order and intentionally differs from the existing JSON history ordering. Compare, in order: business date ascending; type rank `INCOME < SPENDING < TRANSFER`; canonical account cell ascending; numeric amount ascending; category with empty first then UTF-8-byte lexical order; nullable payee with null first; nullable memo with null first; and finally durable effective identity ascending as a non-emitted tie-breaker. UTF-8-byte lexical comparison makes ordering deterministic across runtimes. The serializer then emits fixed CRLF bytes. Export does not change the budget version.

## In-memory parity and implementation seams

The in-memory adapter must reuse the pure parser/normalizer, canonical serializer, digest, row validator, effective projection, and comparator. It serializes commands per budget, clones state before applying a batch, checks the same receipt/version rules, stores one transfer aggregate with paired effects, and publishes state only after all validation succeeds. It is parity evidence, not evidence for PostgreSQL locks, constraints, restart durability, or migration behavior.

Later implementation is centered on these seams (none are changed in this design phase):

- `apps/api/src/server.ts`: exact route dispatch, content type/byte handling, headers, response content handling, and request IDs.
- `apps/api/src/app.ts`: authorization, orchestration, DTO/error envelopes, and safe diagnostics.
- A focused CSV/history domain module: strict parser/serializer, normalization, row validation, digest, effective export mapping, and ordering.
- `apps/api/src/persistence/financial-store.ts`: one transactional import operation, receipt/version boundary, metadata, transfer aggregate/effects, and effective reads.
- `apps/api/src/persistence/budget-store.ts` and `in-memory-budget-store.ts`: canonical account/category resolution and parity.
- `apps/api/src/reports/report-service.ts`: regression-only proof that imported transfers do not affect category Activity, Assigned, Available, rollover, or RTA.
- `apps/api/openapi.yaml`: later documentation of both paths, media types, headers, limits, envelopes, diagnostics, and unchanged JSON routes.
- `apps/web/app/page.tsx`: later download control and synchronous file selection/upload, server-version headers, diagnostic rendering, and refresh; no client-side financial calculations or authority.

## Rollout, rollback, and verification

Roll out only after the multi-account/transfer and metadata/history compatibility readers, additive schema/migrations, generated client, and restart/rebuild checks are complete. Deploy the CSV parser/projection and persistence readers with import/export disabled; verify effective export fixtures, metadata nullability, transfer one-row projection, JSON regression, and PostgreSQL atomic/restart behavior. Deploy API/OpenAPI/web seams next, then enable export only after its output is verified and import behind a separate capability gate after idempotency, stale-version, resource-resolution, rollback, and concurrency checks pass. Old binaries that cannot read metadata or transfer aggregates must not write once those capabilities are enabled.

If import is defective, disable import writes while preserving existing JSON behavior; do not delete committed history, metadata, receipts, transfer aggregates, or effects. If export is incorrect, disable export and correct the projection forward, never expose raw events as a workaround. Before any CSV data exists, unused additive schema may be reverted through a reviewed migration; afterward retain nullable/transfer-aware readers and contain by route disablement. A failed batch is always all-or-nothing.

Verification must cover strict CRLF/RFC4180 parsing and serialization, UTF-8 and limits, leap dates and amounts, metadata normalization/code-point boundaries, one diagnostic per invalid row and truncation, same-budget/archived/foreign resource safety, transfer direction and neutrality, effective filtering, deterministic output, digest/retry/malformed retry, stale/concurrent imports, injected PostgreSQL rollback, restart equality, in-memory parity, OpenAPI route/header/media-type shape, web refresh/download behavior, and unchanged JSON/API tests.

## Review workload and split

The complete implementation is estimated at **1,150–1,500 authored changed lines**, excluding generated Prisma output and bookkeeping, so it must not be one review. Use ordered work units, each below the 400-line budget:

1. **CSV domain (270–340 lines):** strict byte parser, canonical serializer, metadata/row normalization, bounds, diagnostics, digest, and pure tests.
2. **Durable batch (300–380 lines):** PostgreSQL import transaction, receipt/version integration, account/category resolution, transfer aggregate/effects, effective export projection, migration/restart/rollback tests.
3. **API and contract (280–370 lines):** exact HTTP routes/content handling, envelopes/statuses, OpenAPI, authorization/non-disclosure, idempotency/concurrency integration, and API tests.
4. **Web and regression (220–320 lines):** download/upload controls, bounded diagnostics, server refresh, focused E2E, report-neutrality and existing JSON regression verification.

Pause for an explicit delivery decision if any unit exceeds 400 authored changed lines or crosses an additional architectural boundary. This artifact is design-only: no source, tests, schema/migration, OpenAPI, web, `.codegraph/`, `.pi/`, commit, or push changes are authorized here.
