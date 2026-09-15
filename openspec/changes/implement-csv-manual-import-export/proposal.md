# Proposal: Implement Manual CSV Import and Export

## Intent

Add a bounded, synchronous CSV round trip for supported financial history. Authenticated budget owners can export effective history in a fixed canonical format and import a validated file back into the same budget. The capability must remain compatible with canonical `accounts[]`, the oldest-account `account` alias, the approved `TRANSFER` aggregate, metadata/history semantics, PostgreSQL authority, and existing JSON/API behavior.

This proposal defines the product contract and boundaries for later specification and design. It does not authorize application, test, schema, migration, OpenAPI, web, `.codegraph/`, or `.pi/` changes during this phase.

## Business problem

Users need a reliable manual way to move supported budgeting history into and out of the product for backup, correction in external tools, migration between environments, and review. Without a single canonical format, account-side transfers can be duplicated or misread, metadata can be lost, and imports can create partial or cross-budget financial state. Exporting raw events would also expose tombstones and superseded history rather than what users actually see.

## Target users and situations

- Budget owners who need a downloadable record of their effective income, spending, and transfers.
- Users performing a bounded manual migration or restoring supported history into the same budget.
- Users preparing or reviewing a file offline before committing a batch of financial rows.
- API and web clients that need a clear, authorized, synchronous import/export capability without taking financial authority away from the server.

## Product outcome

A user can download deterministic canonical CSV and receive a file that represents the budget's visible effective history: one row per income, spending, or transfer. A user can submit a canonical file to the same budget, receive bounded row-level diagnostics when it is invalid, and know that either every valid row is committed or no financial change occurs.

Imported rows are appended as new transaction identities. Duplicate-looking rows are accepted as distinct transactions. Transfers remain one public transfer row and one `TRANSFER` aggregate with paired account effects. Metadata remains optional, normalized, and visible through the existing server-projected history model. Export is read-only and does not advance the budget version.

## Capabilities

1. **Canonical export**
   - Produce exactly the fixed header:
     `date,type,account,amountMinor,category,payee,memo`
   - Serialize UTF-8 RFC 4180-compatible CSV with CRLF record endings, including the single canonical header and standard quoting for fields that require it.
   - Export effective history only, in deterministic order, with one row per visible income, spending, or transfer.
   - Serialize transfer direction in one `account` cell as `sourceAccountId=>destinationAccountId`.
   - Preserve current server-owned account/category and normalized metadata values in the exported projection; the singular `account` alias is never used as an export identity.

2. **Manual synchronous import**
   - Accept only the canonical seven-column header and the supported CSV encoding/dialect.
   - Support only `INCOME`, `SPENDING`, and `TRANSFER` rows.
   - Validate the complete file before any financial write and return a bounded result containing row counts and row-numbered diagnostics for invalid input.
   - Commit all valid rows in one PostgreSQL transaction and one shared budget version advancement, or commit none.
   - Assign new identities to imported rows; no source identity is inferred from matching values.

3. **Metadata-compatible rows**
   - Import and export optional `payee` and `memo` according to the approved metadata/history contract.
   - Trim Unicode whitespace, preserve case, count Unicode code points, and treat null/trimmed-empty values as cleared.
   - Enforce a maximum of 200 Unicode code points for payee and 1,000 for memo.

4. **Transfer-compatible rows**
   - Treat each transfer row as one transfer aggregate with a source and destination account, not as two import rows or two public history records.
   - Resolve both account IDs within the selected budget and require the approved same-budget, distinct, active-account invariants.
   - Keep transfer effects neutral for category activity, Assigned, Available, and RTA.

5. **Safe command and read behavior**
   - Require `Idempotency-Key` and `If-Match` for import.
   - Keep export authenticated, owner-scoped, read-only, and version-neutral.
   - Preserve existing envelopes, authorization, non-disclosure, JSON routes, and transaction/history semantics outside the additive CSV capability.

## Confirmed scope

- Manual, synchronous CSV import and export only.
- The exact canonical header `date,type,account,amountMinor,category,payee,memo`.
- UTF-8 RFC 4180-compatible input/output with CRLF line endings.
- `type` limited to `INCOME`, `SPENDING`, and `TRANSFER`.
- Payee optional, maximum 200 Unicode code points; memo optional, maximum 1,000 Unicode code points. Both trim Unicode whitespace, preserve case, and clear on null or trimmed-empty input.
- Transfer `account` cells use `sourceAccountId=>destinationAccountId`.
- Imports are same-budget only and never create accounts or categories implicitly.
- Imported rows receive new identities.
- Files are limited to 10 MB, 5,000 rows, and 1,000 diagnostics.
- Duplicate rows are accepted as distinct transactions.
- Complete-file validation before one atomic PostgreSQL commit/version operation.
- Import idempotency and optimistic concurrency through required `Idempotency-Key` and `If-Match` headers.
- Export from effective history only, with one row per transfer and no export of tombstones, raw audits, superseded events, receipts, or other non-effective records.
- Impact to API/application services, OpenAPI, web consumers, PostgreSQL persistence, authorization/non-disclosure, idempotency, concurrency, rollback/containment, and focused regression/contract/integration tests in later implementation phases.
- Compatibility with canonical `accounts[]`, the deterministic oldest-account `account` alias, and the approved `TRANSFER` aggregate/effect model.

## Explicit non-goals

- Cards, splits, reconciliation, bank synchronization, automatic imports, background jobs, scheduled transactions, or broader YNAB parity.
- Cross-budget imports, account/category creation, account/category mapping workflows, or implicit resource provisioning.
- Raw audit export, tombstone export, superseded-event export, command-receipt export, or any ledger-forensics format.
- Broader CSV dialects, configurable headers, arbitrary columns, alternate delimiters, or source-ID columns.
- Preserving original transaction or transfer UUIDs across import/export.
- Duplicate detection, deduplication, matching, or conflict resolution beyond accepting duplicate rows as new transactions.
- Editing or deleting existing transfers, changing the transfer aggregate/effect model, or changing existing JSON/API behavior.
- Client-calculated balances, category activity, Assigned, Available, RTA, or other financial authority.
- Asynchronous processing, queues, retries as background jobs, or partial-success imports.

## Business rules

### File and row contract

- The header must exactly match the seven canonical column names and order; undocumented columns and alternate headers are invalid.
- Input must be valid UTF-8 and RFC 4180-compatible. Quoted commas, quotes, and embedded record content follow the canonical CSV rules; output uses CRLF.
- The 10 MB limit applies before import processing. The 5,000-row limit excludes the header. The diagnostic response is capped at 1,000 row diagnostics and must not expose raw CSV content or sensitive database details.
- A row must satisfy the supported date, type, amount, account, category, and metadata rules. Amounts are represented as positive safe integer minor units. Spending requires a category; income and transfer rows do not use a category. Exact date grammar and remaining field constraints belong in spec/design, without broadening this contract.
- Validation covers the whole file before financial persistence. Any invalid row rejects the import as a whole; no accepted row, receipt, identity, aggregate, effect, or version increment may survive.

### Accounts, categories, and transfers

- Account and category references resolve only against the selected, owner-authorized budget. Unknown, foreign, malformed, or otherwise unavailable references use the established safe non-disclosing behavior.
- No account or category is created during import. Archived accounts cannot receive new imported income, spending, or transfer effects; existing effective history remains readable for export subject to the effective-history rules.
- A transfer must contain two distinct active accounts owned by the same budget, encoded as `sourceAccountId=>destinationAccountId`. It produces one new transfer identity, one aggregate, and equal/opposite paired effects. It is never interpreted as category `MOVE`.
- Imported income, spending, and transfer rows enter the same authoritative domain/history path as their corresponding manual operations. Imports do not bypass account, category, transfer, authorization, or report invariants.
- Repeated-looking rows are valid and append as separate transactions with new identities. The format does not promise identity preservation or deduplication.

### Metadata and effective history

- Payee and memo are optional nullable values. The server trims Unicode whitespace, preserves case, enforces Unicode-code-point limits, and treats null or trimmed-empty values as cleared.
- Export reflects current effective metadata and current server-projected account/category references according to metadata/history rules. It excludes superseded replacement records and tombstones.
- Export emits each effective transfer once with its canonical direction; paired transfer effects are never exported separately.
- Export is a read operation: it requires authorization but does not consume a financial version, create a receipt, or mutate history.

### Safety, idempotency, and concurrency

- Import requires both `Idempotency-Key` and `If-Match` before financial processing. The idempotency record and complete batch outcome share the budget scope and PostgreSQL transaction boundary.
- An identical retry replays the original import result without duplicate rows or effects. Reuse of a key with a materially different canonical file/payload conflicts without state change.
- The expected version is checked at the atomic commit boundary. A stale import conflicts rather than silently applying against a changed budget. One successful batch advances the shared budget version once, regardless of row count.
- Authentication and owner authorization precede detailed account/category resolution. Foreign budgets and resources must not be disclosed through diagnostics, existence checks, or export behavior.
- PostgreSQL is the financial authority. Database transaction rollback, tenant constraints, transfer pairing, and durable replay behavior must be demonstrated later; in-memory parity is not durability evidence.

## Affected areas

- **API/application:** additive authenticated import/export orchestration, canonical CSV result/error handling, row diagnostics, account/category resolution, metadata projection, and preservation of existing JSON command/read behavior.
- **HTTP boundary:** CSV content negotiation, bounded request-body handling, import headers, authenticated export, request IDs, status/error mapping, and non-disclosure behavior.
- **CSV/history domain:** strict parsing and serialization, canonical header and newline rules, normalization, limits, deterministic ordering, effective-history selection, transfer-row mapping, and new-identity semantics.
- **Persistence:** all-file validation handoff, one PostgreSQL transaction for the batch and receipt/version, authoritative metadata, transfer aggregate plus paired effects, restart/rebuild behavior, and rollback containment.
- **Accounts and reports:** canonical `accounts[]` and oldest-account alias compatibility, active-account checks, same-budget references, and proof that imported transfers do not change ordinary category/RTA calculations.
- **OpenAPI:** later documentation of additive CSV endpoints, content types, headers, limits, canonical file contract, diagnostic/result shape, and unchanged JSON route matrix.
- **Web:** later manual import/export controls, file-size/error/diagnostic presentation, server-refresh behavior, and no client-side financial calculations.
- **Tests and operations:** parser/serializer boundary tests, metadata and transfer round trips, authorization/non-disclosure, idempotency, stale-version and concurrent imports, atomic failure/rollback, PostgreSQL durability, effective-history filtering, OpenAPI, web, and existing JSON/API regression coverage.

## Risks and tradeoffs

- **Partial or duplicated money effects:** Row-by-row writes could leave a partial batch, and transfer effects could be duplicated. Full-file validation, one PostgreSQL transaction, shared receipt/version handling, aggregate constraints, and exactly-once retry behavior contain this risk.
- **Transfer grammar portability:** Stable IDs prevent ambiguous renamed or duplicate account names but make files less human-portable and intentionally restrict imports to the same budget. The confirmed same-budget policy accepts that tradeoff.
- **Identity loss on round trip:** The seven-column format has no identity column. Importing creates new identities, so export/import is a financial-data round trip rather than an event-identity restore.
- **Effective-history confusion:** Exporting raw events would expose deleted or superseded records or duplicate transfer sides. The export projection must consume only effective history and the transfer aggregate.
- **Tenant disclosure:** Resolving IDs or categories outside the selected budget could reveal resource existence. Owner-scoped lookups and uniform safe errors are required before detailed diagnostics.
- **Resource exhaustion:** Synchronous parsing and row diagnostics can consume CPU or memory. Strict byte/row/diagnostic limits and bounded responses protect availability, though the exact operational timeout remains a design concern.
- **Encoding and dialect mismatch:** Rejecting non-canonical files reduces convenience but keeps round trips deterministic and avoids silently changing amounts, delimiters, quoting, or Unicode metadata.
- **Mixed-version rollout:** Older readers/writers may not understand CSV, metadata, or transfer-compatible projections. Enablement must follow compatible persistence/readers and preserve legacy JSON behavior.

## Rollback and containment

- Before enabling import writes, the route may be disabled while existing JSON reads/writes and verified read-only export remain available. If export projection is not trustworthy, disable export too.
- After any CSV data is committed, rollback means disabling import (and, if necessary, export) and deploying a forward-compatible reader. Do not delete imported transactions, transfer aggregates, paired effects, metadata, receipts, or history to simulate rollback.
- A failed validation, stale version, idempotency conflict, authorization failure, or database error must leave no financial rows, metadata, receipt, or version advancement from that attempt.
- If export output is incorrect, contain by disabling export and correcting the projection; never mutate source events or make raw audits exportable as a workaround.
- Preserve canonical `accounts[]`, the legacy `account` alias, transfer aggregate identity, effective-history folding, and existing JSON/API behavior throughout containment. Any correction after committed data must use a reviewed forward-compatible operation, not silent deletion or rewriting.

## Success criteria

- Canonical export has the exact seven-column header, valid UTF-8 RFC 4180-compatible quoting, CRLF line endings, deterministic ordering, and one row per effective income, spending, or transfer.
- Export excludes tombstones, raw audits, superseded events, receipts, paired transfer duplicates, and other non-effective records, and does not advance the budget version.
- Valid imports accept only the supported types and canonical contract, enforce 10 MB/5,000-row/1,000-diagnostic limits, resolve only same-budget existing resources, and create new identities.
- Payee and memo normalization, limits, null/trimmed-empty clearing, and case preservation match the approved metadata/history contract in both directions.
- Invalid files return bounded row-level diagnostics and commit no partial state. Valid files commit all rows atomically in PostgreSQL and advance the shared version exactly once.
- Identical import retries replay without duplicate transactions or transfer effects; changed payloads and stale versions conflict safely, including under concurrent requests.
- Transfers import and export once with `sourceAccountId=>destinationAccountId`, retain aggregate/pair invariants, and remain neutral to category activity, Assigned, Available, and RTA.
- Authorization and safe non-disclosure hold for budgets, account/category references, import errors, and export reads.
- Existing JSON/API behavior and first-slice account/history/report semantics remain unchanged; OpenAPI, web behavior, and tests describe and enforce the same additive contract.

## Remaining spec/design questions

1. What exact additive endpoint paths, CSV content-type response headers, status codes, and success/diagnostic envelopes should represent import and export while retaining existing API conventions?
2. What exact date grammar, timezone/month interpretation, field-level error codes, and behavior at each byte/row/diagnostic boundary should the contract specify?
3. How should missing or cleared optional CSV metadata be represented in the import result and subsequent JSON/history DTOs, given the approved nullable metadata semantics?
4. What deterministic export ordering and final identity tie-breakers should be frozen for equal dates and otherwise equal rows?
5. What canonical idempotency digest input should be used for raw normalized UTF-8 bytes versus parsed canonical rows, and how should malformed files interact with receipt storage and retries?
6. What PostgreSQL schema/metadata representation and migration sequencing are required to support the already-approved multi-account/transfer and metadata/history readers without mixed-version hazards?
7. What web interaction, preview/confirmation expectations, timeout budget, and operational observability are appropriate for a synchronous import, without introducing background processing?

These questions are reserved for the subsequent spec/design phases and do not authorize work outside the confirmed CSV contract or any source, test, schema/migration, OpenAPI, web, `.codegraph/`, or `.pi/` surface in this proposal phase.
