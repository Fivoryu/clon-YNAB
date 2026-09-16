# Exploration: Transaction Metadata, History Filters, and Search

## Scope understood

This change adds optional, trimmed transaction `payee` (maximum 200 characters) and `memo` (maximum 1000 characters) to supported transaction creation, editing, history, and history DTOs. It adds history filtering by month, account, kind, category, and date range, plus case-insensitive partial text search across payee, memo, category name, and account name.

The implementation MUST preserve immutable replacement/tombstone semantics, existing history ordering, owner authorization and non-disclosure, budget-scoped idempotency, `If-Match` optimistic concurrency, PostgreSQL authority, and existing first-slice behavior. It MUST remain compatible with the approved canonical `accounts[]` projection and `TRANSFER` history direction from the multi-account change. CSV/import, cards, splits, reconciliation, and bank synchronization are explicit non-goals.

The current source predates the approved multi-account implementation shape: it still has a singular account and income/spending-only transaction history. Therefore, this exploration records both the source currently present and the already-approved compatibility constraints that later implementation must honor.

## Repository and OpenSpec evidence

- `openspec/config.yaml` requires English artifacts and English structural headings/`SHALL`/`MUST` terminology.
- `openspec/changes/implement-transaction-history-edit-delete/` establishes the existing immutable history model: effective history is folded from raw append-only events, edits append replacements with `supersedesEventId`, deletes append tombstones, and only effective records are exposed or used for calculations.
- `openspec/changes/implement-multi-account-transfers/` approves canonical `accounts[]`, a derived legacy `account` alias, and one `TRANSFER` history item backed by a transfer aggregate with canonical source/destination direction. That change explicitly deferred payee/memo to this change.
- The prior edit/delete change currently limits ordinary transaction edits to the same month and excludes payee/memo. This change should add metadata without silently reopening cross-month correction policy.
- Current application code is present under `apps/api/src`, with the HTTP boundary in `server.ts`, DTOs and command orchestration in `app.ts`, pure folding/eligibility helpers in `planning/transaction-history.ts`, persistence in `persistence/financial-store.ts` and `persistence/budget-store.ts`, and reports in `reports/report-service.ts`.
- Current OpenAPI schemas in `apps/api/openapi.yaml` expose `IncomeInput`, `SpendingInput`, `TransactionEditInput`, and `TransactionHistoryItem`, but do not expose payee/memo or the requested filters.
- The current web page has a month-only history control and local history types. Web changes are implementation work, not part of this exploration.
- CodeGraph MCP/CLI was unavailable in this executor tool surface. Targeted reads and repository searches were used as a fallback; no application, `.codegraph/`, or `.pi/` files were modified.

## Current architecture evidence

### Application and HTTP boundary

- `apps/api/src/app.ts` owns `TransactionEditInput`, `TransactionHistoryItem`, `recordIncome`, `recordSpending`, `listTransactions`, `getTransaction`, `editTransaction`, and `historyItem`.
- Creation currently accepts amount/date (and category for spending). It creates an event whose `transactionId` is the event identity, derives `month` from the budget timezone, and defaults the account from the singular account.
- `editTransaction` accepts only amount/date/category, validates the current effective transaction, builds an immutable replacement, preserves the transaction identity, and replaces the in-memory effective item while separately appending the replacement for durable raw history.
- `deleteTransaction` requires explicit confirmation, appends a tombstone, and writes deletion audit information through the same command transaction.
- `listTransactions` currently accepts only an optional `month` query, loads effective history, maps income/spending events, and sorts by date descending, `createdAt` descending, and transaction ID descending. `getTransaction` performs the same effective projection for one identity.
- `apps/api/src/server.ts` routes the history collection and item endpoints but currently forwards only `month`; query parsing and validation are therefore a clear extension seam.
- Existing command handling extracts `Idempotency-Key` and `If-Match`; metadata must be included in the canonical command payload so retries distinguish materially different trimmed values while preserving replay behavior.

### Persistence and event model

- `FinancialEvent` currently contains amount, month/date, account/category references, transaction identity, status/reconciliation markers, replacement linkage, release linkage, and creation time, but no payee or memo.
- `FinancialStore.execute` locks the budget, checks a budget-scoped command receipt, checks expected version, runs domain work, appends events, optionally appends deletion audit data, and commits the receipt in one PostgreSQL transaction.
- `readState` loads raw PostgreSQL events and exposes `events: foldEffectiveHistory(rawEvents)` plus `rawEvents`. This separation is essential: search and history MUST operate on effective records, while persistence/rebuild tests MUST prove metadata survives replacements and restart.
- `appendEvent` currently maps event fields to Prisma rows and defaults dates/month/status for supported income/spending events. It is the persistence seam for additive nullable metadata columns or an eventual transaction aggregate representation.
- `InMemoryBudgetStore`/`InMemoryFinancialStore` are explicit test doubles. They clone event state and emulate receipts, but cannot prove PostgreSQL durability, database constraints, indexes, or restart behavior.
- The current Prisma schema has `FinancialEvent` as the durable transaction-like record and a `TransactionDeletionAudit`. It has no payee/memo columns, transaction aggregate table, or search index. The approved multi-account design introduces transfer aggregates and paired transfer effects; the metadata change must not expose paired transfer effects as duplicate history rows.

### Reporting and account/category projection

- `ReportService` consumes effective events and calculates account balance, RTA, category activity, assignments, and rollover. Payee/memo and history predicates must not alter those financial equations.
- Current history category data is a live category projection (`id`, current `name`, `archived`). Account data is currently only an `accountId`; the approved multi-account design requires account references and names to be projected from canonical `accounts[]`/transfer state.
- Category and account archive/rename behavior creates an important distinction between durable transaction metadata and display/search projection: historical records must remain readable, while search-by-name semantics need an explicit decision.

## Affected paths and symbols

| Area | Current path/symbols | Expected later impact |
|---|---|---|
| DTOs and commands | `apps/api/src/app.ts`: `TransactionEditInput`, `TransactionHistoryItem`, `recordIncome`, `recordSpending`, `editTransaction`, `historyItem`, `listTransactions`, `getTransaction` | Add bounded optional metadata, filter input/query mapping, effective projection fields, and transfer-compatible discriminated DTOs without changing envelopes or financial authority. |
| HTTP routing | `apps/api/src/server.ts`: transaction route matching and query extraction | Parse all supported history filters and reject malformed/unknown values consistently; retain auth, request IDs, and existing route behavior. |
| Pure history domain | `apps/api/src/planning/transaction-history.ts`: `TransactionEvent`, `foldEffectiveHistory`, `buildReplacement`, `buildDeleteTombstone` | Extend immutable event shape and replacement/tombstone copying/validation for metadata; add pure normalization and filter predicates where appropriate. |
| Durable financial persistence | `apps/api/src/persistence/financial-store.ts`: `FinancialEvent`, `FinancialState`, `readState`, `appendEvent`, `execute` | Load/write metadata, preserve it across raw/effective folding, and merge transfer aggregates once in history. Keep PostgreSQL as the authoritative source. |
| Budget/account persistence | `apps/api/src/persistence/budget-store.ts` and the approved multi-account seams | Resolve account filters and current account references through canonical `accounts[]`; never reintroduce singular-account authority. |
| In-memory adapter | `apps/api/src/persistence/in-memory-budget-store.ts` | Mirror normalization, replacement, filtering, and transfer-compatible projection for fast tests only. |
| Contract | `apps/api/openapi.yaml` | Document optional bounded fields, filter query parameters, supported kinds, DTO discriminators, and existing envelopes after decisions are settled. No contract edit belongs in this phase. |
| Web | `apps/web/app/page.tsx` and web tests/E2E | Later consumer work only; preserve server-calculated values and existing first-slice UI behavior. |
| Schema/migrations | `apps/api/prisma/schema.prisma` and additive migration(s) | Add nullable metadata storage and any bounded/search indexes compatible with the approved transaction/transfer model; do not rewrite or delete history. |

## Data migration and backfill considerations

1. **Nullable legacy backfill:** Existing income/spending events have no metadata. A forward migration should add nullable storage (or an approved nullable transaction-metadata representation) and backfill existing rows to `NULL`, not empty strings. Reads should omit optional fields or return the agreed null representation consistently.
2. **Replacement chains:** A replacement MUST carry the effective transaction's normalized payee/memo when the edit omits that field. An explicitly supplied empty/whitespace value needs a decided clear-vs-absent rule before implementation. Old events remain immutable; no historical row should be updated in place.
3. **Tombstones:** Tombstones must retain only the identity/linkage required for folding and audit semantics. They must not become searchable or visible history items and must not erase metadata needed to rebuild the effective deletion chain.
4. **Legacy dates and account references:** Existing backfilled month-start dates remain historical reconstruction, not recovered precision. Month/date filters must use stored business date/month and preserve the budget-timezone rule. Account filtering must resolve legacy rows through the approved account compatibility mapping, not client-provided aliases.
5. **Transfers:** The migration/read path must recognize the approved transfer aggregate and canonical source/destination direction. A paired `TRANSFER_OUT`/`TRANSFER_IN` event must yield one history item, with one set of payee/memo values according to the transfer model, never two ordinary transaction results. Transfers have no category; category filters must define whether they are excluded or return no match.
6. **Text search indexes:** A functional lower-case index or PostgreSQL text-search/trigram strategy may be needed after measuring the bounded first-slice query. Any index must be additive, preserve PostgreSQL authority, and reflect the chosen live-vs-snapshot name semantics. Do not introduce an unbounded search subsystem in this change.
7. **Mixed-version rollout:** The reader should tolerate null metadata while old binaries may still write rows without it. Metadata writes/search should be enabled only when the schema and all approved multi-account/transfer compatibility seams are deployed. Rollback after metadata exists must disable new writes/routes rather than delete columns or rewrite events.

## Exact unresolved product/design questions

1. **Optional-field representation:** In JSON DTOs, does absent metadata mean omitted property or explicit `null`? Is whitespace-only input cleared to `null`, rejected, or treated as absent?
2. **Trim semantics:** Is trimming Unicode whitespace required, and are limits measured in JavaScript UTF-16 code units, Unicode code points, or PostgreSQL characters? The approved limits are 200 for payee and 1000 for memo, but the counting rule is not recorded.
3. **Create/edit patch semantics:** On edit, does an omitted field preserve its current value, while `null` clears it? Are `payee`/`memo` allowed on income, spending, and transfer creation/edit DTOs, and are transfer edits intentionally unsupported as in the approved transfer change?
4. **Search normalization:** Is case-insensitive matching based on lowercase only, or should accent/collation-insensitive matching be used? Are `%`/`_` and other pattern characters treated literally? What minimum query length, if any, is required?
5. **Text match scope and conjunction:** If `q` is supplied, does it match any of payee, memo, category name, or account name? Are multiple field filters ANDed together, and is there one text query or separate payee/memo queries?
6. **Filter grammar:** What exact values and error behavior apply to `kind` (including `TRANSFER`), account IDs, category IDs, `from`/`to` dates, and month? Are date bounds inclusive, and may `from` exceed `to`? If month and date range overlap, are they combined with AND or is one rejected?
7. **Account filter for transfers:** Does an account filter match either source or destination account, and does the result expose both canonical directions? How should an archived account name/reference behave?
8. **Category filter for transfers and income:** Are transactions without a category simply excluded by a category filter, and is an invalid/foreign category a validation error or an empty authorized result?
9. **Name search stability:** Does account/category text search use current renamed names, names snapshotted on the transaction, or both? This affects whether a rename changes historical search results without changing immutable transaction data.
10. **Ordering and pagination:** Is the existing three-key ordering unchanged for every filtered result? Is the first-slice unpaginated result intentionally retained, or is a bounded limit/cursor now required? If a limit is added, what maximum and continuation semantics apply?
11. **Transaction date policy:** Does this change preserve the prior same-month edit restriction, or may metadata-only edits and amount/date edits cross months? No new closed-month or reconciliation policy should be inferred from search requirements.
12. **Protected/released records:** Are payee/memo visible and searchable for protected/released income? The existing protected state is readable; metadata must not accidentally make it editable.
13. **DTO compatibility:** Should metadata fields be present on every supported history item as nullable/optional fields, and what is the exact discriminated shape for `TRANSFER` with source/destination account references and no category?
14. **Empty-result and invalid-resource behavior:** Must a valid filter return an empty list, while foreign account/category IDs return non-disclosing `NOT_FOUND`? Existing authorization behavior must remain consistent.
15. **Query limits and abuse control:** What maximum URL/query length and result cap are required to prevent expensive wildcard scans, especially before a search index is available?

## Risks and containment

- **Double-counted transfer history:** Searching raw paired transfer effects could expose duplicates or wrong direction. Containment: query the effective aggregate projection and assert one `TRANSFER` item with canonical source/destination semantics.
- **Immutable-chain corruption:** Replacements that drop metadata or tombstones that retain the wrong identity can make rebuild and search disagree. Containment: copy normalized metadata explicitly, fold from raw PostgreSQL rows, and test replacement chains, deletion, restart, and rebuild equality.
- **Financial side effects:** Metadata-only edits must not change account, RTA, category Activity, rollover, or version semantics beyond the normal command receipt. Containment: keep metadata outside report equations and require atomic command/replacement behavior.
- **Authorization leakage:** Account/category filters may reveal whether a foreign identifier exists. Containment: owner-scope the budget and referenced filters before querying, preserve safe `NOT_FOUND` behavior, and never trust client account names.
- **Rename/archive ambiguity:** Searching current names may make old history appear/disappear after metadata changes; snapshotting names may duplicate mutable reference data. Containment: settle one explicit projection policy and test rename/archive cases.
- **Unicode/SQL semantics:** Inconsistent trimming, character counts, collation, or wildcard escaping can violate limits or produce surprising matches. Containment: define normalization/counting and use parameterized, escaped PostgreSQL predicates.
- **Performance and availability:** A broad case-insensitive partial search over history can cause sequential scans or unbounded responses. Containment: enforce query/result bounds, add only justified additive indexes, and preserve the existing first-slice behavior unless pagination is explicitly approved.
- **Mixed-schema deployment:** Old readers/writers may not understand new columns or transfer projections. Containment: additive nullable migration, tolerant reads, controlled feature enablement, and route disablement for rollback.
- **Scope creep:** Search can expand into CSV, cards, splits, reconciliation, synchronization, or a general ledger rewrite. Containment: keep this slice to supported transaction metadata/history and the approved accounts[]/TRANSFER compatibility boundary.

## Bounded recommendation

Proceed to proposal/spec/design with a small, additive vertical slice:

1. Define one canonical normalization contract for optional payee/memo, including absent/null/clear behavior and Unicode length counting.
2. Store metadata as nullable authoritative transaction fields, propagate it through immutable replacements, and keep tombstones non-visible/non-searchable.
3. Extend the existing effective history projection so ordinary income/spending and approved transfer aggregates share one stable ordering and one server-side filter pipeline. Preserve the current month filter and ordering as a compatibility baseline.
4. Resolve and document exact filter grammar, inclusive date bounds, AND semantics, transfer account matching, live account/category name search behavior, invalid-filter authorization behavior, and bounded result/query limits before implementation.
5. Add focused pure/in-memory tests and mandatory PostgreSQL migration/restart/rebuild/rollback coverage; do not treat the in-memory adapter as durability evidence. Update API/OpenAPI/web only after the DTO and query decisions are fixed.

The recommended default, pending product confirmation, is: omitted edit fields preserve existing metadata; explicit `null` or trimmed empty text clears it; matching is case-insensitive literal substring search across any requested text field; filters combine with AND; date bounds are inclusive; account filters match either side of a transfer; current server-projected account/category names are searched; existing date/creation/identity ordering remains unchanged; and the existing bounded first-slice response remains unpaginated. These are recommendations, not approved decisions.

No application, test, Prisma schema/migration, OpenAPI, web, `.codegraph/`, or `.pi/` file was modified in this exploration.

## Persistence

This exploration is persisted at `openspec/changes/implement-transaction-metadata-history-search/explore.md` in the active OpenSpec backend. Engram was unavailable in this session, so no Engram persistence is claimed.
