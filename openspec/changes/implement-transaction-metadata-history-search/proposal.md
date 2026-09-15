# Proposal: Implement Transaction Metadata, History Filters, and Search

## Intent

Extend supported transaction creation, editing, effective history, and history retrieval with optional payee and memo metadata plus bounded filtering and literal text search. The change SHALL remain additive and compatible with the approved multi-account and transfer model, including canonical `accounts[]`, the derived legacy `account` alias, and one public `TRANSFER` history item per transfer.

## Business problem

Transactions currently lack lightweight context that users need to recognize and explain spending and income. History is also limited to a month view, making it difficult to find a transaction or narrow history by account, category, kind, or date. Adding these capabilities without preserving immutable history, authorization, transfer semantics, and financial equations could make history unreliable or expose information across budgets.

## Target users and situations

- Budget users recording income, spending, or transfers who need to add or review a payee or note.
- Users looking back through a month or broader retained history to locate a transaction by text or structured attributes.
- Users with multiple manual accounts who need history searches to reflect the account involved, including either side of a transfer.
- API and web clients that must continue consuming existing first-slice financial projections and history behavior.

## Product outcome

Users can attach optional, normalized payee and memo values to supported transactions, update or clear them without rewriting prior events, and see metadata on income, spending, and transfer history. They can search effective history with a literal, case-insensitive partial query and combine supported filters to find relevant records. Results remain authorized, server-projected, deterministically ordered, bounded to at most 500 records, and financially neutral: metadata and history retrieval do not alter first-slice equations or transfer meaning.

## Capabilities

1. **Optional transaction metadata**
   - Accept payee up to 200 Unicode code points and memo up to 1000 Unicode code points.
   - Trim Unicode whitespace, preserve case, and treat null or trimmed-empty values as cleared.
   - On edit, omitted fields preserve their current values; supplied values replace them.
   - Expose metadata on supported income, spending, and transfer history representations.

2. **Immutable metadata lifecycle**
   - Store metadata as nullable authoritative transaction data.
   - Propagate effective metadata through immutable replacement chains.
   - Preserve the metadata needed for correct folding/rebuild semantics when tombstones are appended.
   - Keep deleted/tombstoned records out of visible history and search results.

3. **Effective history filtering and search**
   - Support the existing month filter and the approved filters for account, kind, category, and inclusive date bounds.
   - Treat `q` as a literal partial substring query, case-insensitive, across payee, memo, current category name, and current account name.
   - Combine supplied filters with AND semantics.
   - Match an account filter against either source or destination account of a `TRANSFER`.
   - Search names from current server-projected account/category references, not client-supplied labels.
   - Preserve existing ordering and retain an unpaginated first-slice response with a maximum of 500 results.

4. **Contract and client impact**
   - Extend API and OpenAPI contracts for optional metadata, history filters, result shapes, and transfer-compatible discriminated history.
   - Update web consumers and tests to use server-projected values without introducing client-side financial authority.
   - Preserve existing envelopes, transaction kinds, routes, and first-slice history semantics except for the additive capabilities in this scope.

## Confirmed scope

- Additive nullable payee and memo metadata for supported transaction creation, editing, history, and history DTOs.
- Unicode-whitespace trimming, Unicode-code-point length limits, case preservation, optional fields, and the confirmed edit clear/preserve semantics.
- Immutable replacement and tombstone propagation, including effective-history folding and rebuild/restart durability.
- History filtering by month, account, kind, category, and inclusive `from`/`to` date bounds; `from > to` is invalid.
- Literal case-insensitive partial `q` search across payee, memo, current category name, and current account name.
- AND combination of filters, valid empty results, and a maximum of 500 unpaginated history results.
- Canonical `accounts[]` and approved `TRANSFER` history compatibility; account filters match either transfer side and transfers appear once with canonical direction.
- Metadata visibility on income, spending, and transfers; transfers remain non-editable and non-deletable.
- PostgreSQL as the authority, with authorization, safe non-disclosure for foreign account/category references, budget-scoped idempotency, `If-Match` optimistic concurrency, atomic command behavior, and durable restart/rebuild verification.
- API, OpenAPI, web, and test impact required to describe and enforce the same behavior.
- Preservation of existing first-slice financial equations and history semantics.

## Explicit non-goals

- CSV or other imports, cards, splits, reconciliation, bank synchronization, or broader YNAB parity.
- Transfer editing, transfer deletion, or changing the approved transfer aggregate/effect model.
- Rewriting historical events in place, changing financial equations, or introducing client-calculated balances, category activity, or RTA.
- Snapshotting account/category names as new transaction authority; this proposal uses current server-projected names for search as confirmed.
- General-purpose full-text search, new pagination/continuation semantics, or an unbounded history endpoint.
- New closed-month, reconciliation, or cross-month correction policy beyond preserving the existing transaction mutation rules.

## Business rules

### Metadata normalization and edits

- Payee and memo are optional on supported income, spending, and transfer metadata surfaces.
- The server trims Unicode whitespace before storing or comparing metadata.
- Payee length is at most 200 Unicode code points; memo length is at most 1000 Unicode code points. Values over the applicable limit are invalid.
- Normalization preserves the user's case.
- A null value or value that becomes empty after trimming clears the field.
- An omitted edit field preserves the current effective value; it is not interpreted as a clear.
- Metadata-only changes must not alter amount, account, category, date, reports, or transfer direction.

### History and search

- History is built from effective records, not superseded replacements or tombstones.
- `q` is a literal substring search; pattern metacharacters are not user-controlled wildcard instructions. Matching is case-insensitive across payee, memo, current category name, and current account name.
- All supplied filters are ANDed. A valid filter combination may return an empty result set.
- Date bounds are inclusive. A `from` date later than `to` is invalid.
- Account filters use canonical server-owned account references and match either side of a transfer. Transfer history is returned once, never as duplicated paired effects.
- Category filtering excludes records without a matching category, including transfers without a category; it does not reinterpret transfers as category movements.
- Existing date/creation/identity ordering remains unchanged for filtered and unfiltered results.
- Results remain unpaginated and are capped at 500 records.

### Authorization and command safety

- Reads and writes remain owner-authorized and budget-scoped. Foreign or unknown account/category references use safe non-disclosing behavior consistent with existing resource handling.
- Metadata participates in the canonical command payload used for idempotency. Identical retries replay the original outcome; reuse of a key for a materially different normalized payload conflicts.
- `If-Match` remains authoritative for optimistic concurrency, and failed commands do not leave partial metadata, replacement, receipt, or tombstone state.
- PostgreSQL remains authoritative for metadata, effective history, transfer compatibility, and durability. In-memory behavior may mirror the contract but is not evidence of persistence durability.

## Affected areas

- **Application/API (`apps/api/src/app.ts`):** metadata input normalization, command payloads, history DTO projection, filter semantics, effective-record handling, and transfer edit/delete protection.
- **HTTP boundary (`apps/api/src/server.ts`):** history query parsing, validation, forwarding, and consistent error/non-disclosure behavior while retaining existing auth and envelopes.
- **History/domain (`apps/api/src/planning/transaction-history.ts` and related seams):** nullable metadata shape, normalization, immutable replacement propagation, tombstone folding, effective predicates, and unchanged ordering.
- **Persistence (`apps/api/src/persistence/financial-store.ts`, budget/account seams, and in-memory adapters):** nullable authoritative storage, raw/effective reconstruction, current account/category projections, transfer aggregation, receipts, version checks, and restart/rebuild behavior.
- **Prisma/schema/migrations:** additive nullable metadata persistence and any justified bounded-search support compatible with the approved PostgreSQL and transfer model. No destructive rewrite is authorized.
- **Reports:** prove metadata and history predicates do not change income, spending, category movement, balances, Activity, Assigned, Available, rollover, or RTA calculations.
- **OpenAPI (`apps/api/openapi.yaml`):** optional field constraints, query parameters, filter grammar, history discriminators, transfer metadata, limits, and retained compatibility contract.
- **Web (`apps/web/app/page.tsx` and related tests):** render/edit metadata and consume server-filtered history without local financial calculations, while preserving first-slice workflows.
- **Tests:** pure normalization/folding/filter tests; API and contract coverage; authorization/idempotency/`If-Match` coverage; transfer one-item history coverage; PostgreSQL migration, rollback, restart/rebuild, and durability coverage; and web/regression coverage.

## Risks and tradeoffs

- **Immutable-chain loss:** A replacement that drops metadata or an incorrect tombstone can make live and rebuilt history diverge. Containment requires explicit effective-chain tests and PostgreSQL restart/rebuild equality.
- **Transfer duplication or misclassification:** Searching paired effects could show two rows or alter category semantics. The read path must merge through the approved transfer aggregate and preserve one canonical `TRANSFER` item.
- **Authorization leakage:** Invalid account/category filters can reveal foreign resources. Owner-scoped validation and safe non-disclosing responses must precede detailed querying.
- **Rename/archive behavior:** Current-name search intentionally changes as server-projected account/category names change. This is more current than snapshots but less historically stable and must be documented and tested.
- **Unicode and database mismatch:** Application trimming/counting and database comparison semantics may differ. A single normalization contract and parameterized literal predicates are required.
- **Performance and availability:** Broad substring searches may be expensive, and even a 500-row cap does not bound query work. Query validation, measured database support, and operational monitoring are needed without expanding into a search subsystem.
- **Compatibility and rollout:** Existing nullable rows and approved multi-account/transfer data must remain readable across rollout and rollback. New routes/writes may need controlled enablement until all compatible schema and readers are deployed.
- **Scope pressure:** Metadata and search could become a broader ledger or parity effort. The explicit exclusions and unchanged equations keep the first slice bounded.

## Rollback and containment

- Use additive nullable persistence and tolerant reads; existing transactions without metadata remain valid and metadata reads use the agreed optional representation.
- If rollout validation fails, disable new metadata/filter routes or writes while retaining existing transaction and history reads. Do not delete columns, rewrite immutable events, or revert to a reader that cannot understand approved multi-account/transfer data.
- If search causes unacceptable load or incorrect projection, disable the new query capability and continue the existing month/history path, retaining durable metadata for a later compatible read.
- If a metadata edit or replacement fails, PostgreSQL must roll back the replacement, receipt/version change, and any related command state together.
- Preserve transfer aggregates, paired effects, canonical `accounts[]`, and legacy `account` compatibility during containment; transfer history must never fall back to duplicated raw effects.

## Success criteria

- Payee and memo accept only normalized values within their Unicode-code-point limits, preserve case, clear on null/trimmed-empty input, and preserve omitted edit fields.
- Metadata survives immutable replacements, tombstone folding, PostgreSQL restart, and rebuild without mutating prior events or exposing deleted records.
- Income, spending, and transfer history expose the agreed optional metadata shape; transfers remain visible but cannot be edited or deleted.
- `q` performs literal, case-insensitive partial matching across all four confirmed fields, including current projected account/category names.
- Month, account, kind, category, and inclusive date filters validate correctly, combine with AND, match transfer accounts on either side, reject inverted date ranges, and permit valid empty results.
- History ordering is unchanged and responses remain unpaginated with no more than 500 records; transfers appear exactly once with canonical direction.
- Owner authorization, safe foreign-reference behavior, budget-scoped idempotency, `If-Match`, atomic failure behavior, and PostgreSQL authority are demonstrated by tests.
- Existing financial equations, reports, balances, category behavior, RTA, and first-slice history semantics remain unchanged.
- OpenAPI, web behavior, tests, and observed API behavior agree on the bounded contract, while all explicit non-goals remain absent.

## Remaining spec/design questions

1. What exact JSON representation should a cleared or absent metadata field use in each create result, transaction detail, and history DTO: omitted property, explicit `null`, or a consistent combination?
2. What exact accepted grammar and error mapping should apply to each query parameter (`month`, `account`, `kind`, `category`, `from`, `to`, and `q`), including unknown kinds and malformed identifiers, while preserving safe non-disclosure?
3. What query-string length/minimum-query safeguards are needed in addition to the confirmed 500-result cap, and what measured PostgreSQL support is justified for literal substring search?
4. How should the existing same-month transaction edit restriction interact with metadata-only edits, especially when the current transaction date is in another month? This proposal does not authorize changing that policy.
5. What exact discriminated DTO fields are required for metadata on `TRANSFER`, and how should optional metadata be represented alongside its source/destination account references without changing the approved transfer identity?
6. What deployment sequencing and feature flag behavior is required when old API binaries, nullable metadata schema, and the approved multi-account/transfer readers are temporarily mixed?

These questions belong to the subsequent spec/design phases. They do not authorize application, test, schema, migration, OpenAPI, web, `.codegraph/`, or `.pi/` changes during this proposal phase.
