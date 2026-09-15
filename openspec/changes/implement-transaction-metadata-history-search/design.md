# Technical Design: Transaction Metadata, History Filtering, and Search

## Context and constraints

This design implements the approved transaction-history and transfer deltas on top of the existing append-only `FinancialEvent` stream and the approved multi-account `Transfer` aggregate. PostgreSQL remains authoritative. The existing success/error envelopes, budget-scoped command receipts, `If-Match` version checks, owner authorization/non-disclosure, effective-history ordering, financial equations, and same-month edit policy remain unchanged.

The capability is limited to realized income, one-category spending, and readable same-budget `TRANSFER` history. CSV/import, cards, splits, reconciliation, banking synchronization, refunds, schedules, and broader ledger/search work remain out of scope. Transfers remain non-editable and non-deletable.

## Decisions

### 1. Canonical metadata contract

Add one shared domain normalizer, used by create, edit, transfer, PostgreSQL, and in-memory paths:

```ts
type TransactionMetadata = { payee: string | null; memo: string | null };
type MetadataPatch = { payee?: string | null; memo?: string | null };
```

Normalization is performed before validation and idempotency digesting:

1. Accept only a JSON string or `null` for each present field. `undefined` means absent only at the TypeScript boundary; an explicitly present JSON `undefined` is invalid/non-JSON.
2. Trim Unicode `White_Space` code points at both ends (not merely ASCII space). Implement this with a Unicode-property-aware trim helper rather than database `TRIM`.
3. Preserve all remaining code points and their case; do not apply Unicode normalization or case folding to stored values.
4. Count with `[value].length`, i.e. Unicode code points after trimming. `payee` is limited to 200 and `memo` to 1000.
5. A `null` or trimmed-empty value becomes `null`.

Create inputs accept optional `payee` and `memo`; omitted create fields normalize to `null`. Edit inputs are presence-sensitive: omission preserves the current effective value, while present `null`, empty, or whitespace-only text clears it. A non-empty normalized string replaces it. The edit validator must inspect own keys so `{ payee: null }` differs from `{}`.

The public representation is consistently nullable and present on every supported ordinary and transfer result/history item: `payee: string | null` and `memo: string | null`. This avoids ambiguity between a legacy row and an intentional clear. Prior fields and envelopes remain compatible.

### 2. DTOs and route seams

Extend the existing seams rather than adding a parallel transaction API:

- `apps/api/src/app.ts`: extend `TransactionEditInput`, income/spending/transfer command inputs, `TransactionHistoryItem`, `historyItem`, `listTransactions`, `getTransaction`, and command payload construction.
- `apps/api/src/server.ts`: replace the current single `month` extraction with a strict history-query parser and pass a typed filter object to `BudgetApp.listTransactions`.
- `apps/api/src/planning/transaction-history.ts`: own metadata normalization, patch application, transaction-kind checks, immutable replacement propagation, tombstone construction, effective folding, and pure filter predicates.
- `apps/api/src/persistence/financial-store.ts`: load/write nullable fields, transfer aggregates, current account/category references, and effective raw history.
- `apps/api/src/persistence/in-memory-budget-store.ts`: clone the added state and reuse the same pure normalizer, fold, projection, filter, and digest helpers.
- `apps/api/openapi.yaml`, web, and tests consume the settled contract only after the domain/API seams are complete.

The ordinary DTOs retain their existing account/category shape and add nullable metadata:

```ts
type AccountReference = { id: string; name: string; kind: 'CASH' | 'CHECKING'; archived: boolean };
type IncomeHistoryItem = {
  transactionId: string; kind: 'INCOME'; date: string; amountMinor: number;
  accountId?: string; payee: string | null; memo: string | null;
  createdAt?: string; state: 'ELIGIBLE' | 'PROTECTED';
};
type SpendingHistoryItem = Omit<IncomeHistoryItem, 'kind' | 'category'> & {
  kind: 'SPENDING'; category: Category | null;
};
type TransferHistoryItem = {
  transactionId: string; kind: 'TRANSFER'; date: string; amountMinor: number;
  sourceAccount: AccountReference; destinationAccount: AccountReference;
  payee: string | null; memo: string | null; createdAt: string;
};
type TransactionHistoryItem = IncomeHistoryItem | SpendingHistoryItem | TransferHistoryItem;
```

`TRANSFER` follows the approved design: one aggregate identity, both canonical account references, no category, and no separate paired-effect items. Its metadata is accepted when the transfer is created and returned by transfer results/history; no transfer edit/delete route is introduced. Budget DTOs continue to derive canonical `accounts[]` and the oldest-account `account` alias from the multi-account implementation; this change does not reintroduce singular-account authority.

Income and spending create payloads add metadata. `TransactionEditInput` adds the two presence-sensitive fields while retaining amount/date/category and the existing same-month eligibility guard. Transfer creation adds metadata to the approved body. Metadata-only edits do not create a new date policy: omitted date retains the current date, and any supplied date must satisfy the existing same-month restriction.

### 3. Query grammar, validation, and literal matching

The history collection accepts exactly these keys, each at most once: `month`, `account`, `kind`, `category`, `from`, `to`, and `q`. The parser must iterate `URLSearchParams.entries()` and reject unknown or repeated keys; `get()` alone is insufficient. Validate after authentication and owner-scoped budget lookup, preserving non-disclosure.

- `month`: strict `YYYY-MM` with a real month.
- `from`/`to`: strict real `YYYY-MM-DD`, inclusive business-date bounds; `from > to` is `VALIDATION_ERROR`.
- `kind`: exactly `INCOME`, `SPENDING`, or `TRANSFER`.
- `account`/`category`: canonical UUID syntax, normalized to the server's canonical identifier form. Owner-scope the referenced account/category before querying. A malformed ID is validation; an unknown/foreign ID uses the established safe `NOT_FOUND` behavior. A valid filter with no matching transactions returns an empty list.
- `q`: Unicode-trimmed, empty becomes omitted, and at most 200 Unicode code points after trimming. The query-string portion is capped at 4096 UTF-8 bytes before parsing to bound synchronous work.

All supplied predicates are ANDed. `month` and date bounds are not alternatives. Category filters exclude items without that category, including income and transfers. An account filter matches an ordinary item's account and either `sourceAccount.id` or `destinationAccount.id` for a transfer.

`q` is a literal case-insensitive substring over normalized stored payee/memo, the current authorized category name (where present), and every current authorized account name represented by the item. It uses the same pure `searchFold` helper in PostgreSQL-backed projection and the in-memory adapter (Unicode lower-case for comparison; stored case is untouched). `%`, `_`, `\\`, and all other pattern characters have no wildcard meaning. The first implementation does not interpolate `q` into SQL: it loads authorized rows, folds effective history, projects current names, and applies the pure predicate. Thus SQL injection and SQL wildcard escaping are avoided by construction. If a later measured optimization pushes `q` into PostgreSQL, it MUST use bound parameters and escape `\\`, `%`, and `_` before an `ILIKE ... ESCAPE '\\'` predicate, with parity tests against the pure helper.

The final result is sorted exactly as today: business date descending, creation timestamp descending, then stable public transaction identity descending. Apply the unchanged ordering before `slice(0, 500)`. There is no cursor, offset, or client-controlled limit.

### 4. Immutable lifecycle and financial neutrality

An ordinary metadata edit uses the existing replacement path:

1. Load the effective event and verify owner, kind, account, status, reconciliation, release protection, and same-month eligibility.
2. Normalize only supplied metadata fields and merge them with the current effective values.
3. Build a new event with the same transaction identity, immutable kind/account/financial references, `supersedesEventId` equal to the current event, and new creation time.
4. Replace the effective in-memory item for the command result while appending the replacement row durably.

The replacement copies normalized metadata explicitly; it must not depend on an accidental object spread. Amount, category, account, date, month, status, and release linkage remain governed by the existing edit policy. A tombstone contains identity, linkage, kind/delete marker, and the fields needed by the existing fold only; it carries `payee: null` and `memo: null`, is never projected, and is never searchable. Existing events remain immutable.

The fold must continue to validate supersession chains and exclude superseded rows and tombstones. Transfer paired effects are not ordinary transaction events: history merges the approved `Transfer` aggregate with effective ordinary events and emits exactly one transfer item. Transfer metadata is stored on the aggregate, not duplicated onto both effects.

Metadata is outside `ReportService` equations. Rebuilding effective events and reports must produce the same balances, category Activity, Assigned, Available, rollover, RTA, and transfer conservation values as before. A metadata-only edit increments the normal command version once but changes no financial amount or classification.

### 5. Idempotency, If-Match, and authorization

Canonical command input is normalized before the digest. Create and transfer payloads include both metadata keys with `null` defaults, so omitted and explicit `null` are equivalent on create. Edit payloads retain field presence: omitted means preserve and is omitted from the edit patch digest; explicit `null` is included as a clear. Unknown body keys, invalid types, overlong values, and invalid transfer metadata fail before mutation.

The existing budget lock, owner predicate, receipt lookup, version comparison, append/replacement/tombstone writes, and receipt commit remain one PostgreSQL transaction. Same key/same canonical payload replays the stored result; same key/different normalized payload conflicts. Stale `If-Match` conflicts before any append. Foreign transaction/account/category references use the established non-disclosing response. Released/reconciled/unsupported ordinary records retain current protection, and transfer identity is rejected by edit/delete before any write.

### 6. PostgreSQL persistence and indexes

Use one additive Prisma migration:

- nullable `payee` and `memo` columns on `FinancialEvent` for `INCOME`/`SPENDING` rows;
- nullable `payee` and `memo` columns on the approved `Transfer` aggregate;
- no backfill to empty strings; all existing rows remain `NULL`;
- generated client/domain mapping that preserves null rather than omitting it;
- indexes supporting authoritative row loading and coarse filters: `(budgetId, transactionId, createdAt, id)`, `(budgetId, businessDate, kind, createdAt)`, `(budgetId, month, kind)`, `(budgetId, accountId, businessDate)`, `(budgetId, categoryId, businessDate)`, and transfer indexes for `(budgetId, businessDate, createdAt, id)`, `(budgetId, month)`, and each account side.

The implementation must not apply a SQL `LIMIT 500` before folding: a replacement or tombstone outside that slice could change the effective result. PostgreSQL queries are budget/owner scoped and ordered; the application folds all relevant immutable rows, joins current accounts/categories from the same authorized state, applies predicates, orders, and caps the response. This preserves correctness for replacement chains and current-name search without introducing a second mutable history authority. Standard B-tree indexes support month/date/kind/account/category narrowing; no `pg_trgm` extension or mutable search index is introduced in this bounded slice. A statement timeout/deadline must fail the whole read rather than return a partial result if an unusually large history exceeds the synchronous budget.

Transfer aggregate reads must join account references by budget-scoped composite ownership, retain archived references for history, and never fall back to paired raw effects. PostgreSQL restart/rebuild loads the same raw events, transfer aggregates, and current references to reproduce the same effective DTOs.

### 7. In-memory parity

`InMemoryBudgetStore` must deep-clone metadata, accounts, transfers, and raw/effective event fields. Its command queue remains serialized per budget; it must use the same canonical digest, presence-sensitive patch semantics, effective fold, filter predicates, ordering, 500 cap, and transfer one-item projection. It is evidence for domain/API parity only, not migration, constraint, lock, restart, or durability evidence.

## Data flow

1. `server.ts` authenticates through the existing app boundary, bounds and parses the raw query, and rejects malformed/repeated/unknown parameters.
2. `BudgetApp` validates/normalizes command metadata, checks owner scope and existing eligibility, and passes canonical input to `FinancialStore.execute`.
3. The store locks the budget, checks/replays the receipt, checks `If-Match`, loads PostgreSQL rows, folds effective ordinary history, and loads the approved transfer aggregates/current references.
4. Pure domain code applies metadata normalization, replacement/tombstone rules, or effective filters. Transfer projection merges one aggregate only.
5. PostgreSQL commits all command rows and receipt atomically, or rolls them back. Reads return the existing `{ data, requestId }` envelope with the existing history `{ items, version }` payload shape.
6. Web clients render server DTOs and refresh using the returned version; no balance, search, or category/account-name calculation is client-authoritative.

## Migration, rollout, and rollback

### Forward rollout

1. Verify the approved multi-account/transfer reader is deployed and can rebuild legacy single-account data, transfer aggregates, current references, and canonical account projections.
2. Run an additive preflight: validate metadata columns can be added, transfer rows/effects are internally consistent, and legacy event chains fold deterministically. Abort feature enablement on malformed chains; do not repair history in place.
3. Apply the nullable migration and indexes. Existing metadata is `NULL`; existing dates, months, IDs, effects, and timestamps are untouched.
4. Deploy metadata-aware domain/persistence readers first with new writes and search routes disabled. Verify fresh-process/restart projections and financial-equation equality.
5. Deploy API/OpenAPI/web changes, then enable metadata create/edit, transfer metadata, and filters behind one capability gate after PostgreSQL atomicity, authorization, idempotency, query-bound, and rebuild checks pass. Old binaries must not be allowed to perform transaction replacements after metadata writes are enabled, because an unaware replacement could drop metadata.

### Rollback and containment

Before metadata has been written, disable the gate and (if operationally required) remove only unused additive indexes/columns through a reviewed reverse migration. After metadata exists, the safe rollback is to disable new metadata/filter routes while retaining nullable columns and metadata-aware readers/writers. Do not delete columns, rewrite events, restore the pre-transfer singular reader, re-add the one-account uniqueness constraint, or expose paired transfer effects. Existing ordinary history and transfer history remain readable. A failed command rolls back replacement/tombstone or transfer aggregate, effects, metadata, and receipt together; a lost response is recovered with the same idempotency key.

## Test plan

### Pure/domain and contract tests

- Unicode `White_Space` trimming, case preservation, code-point boundaries, null/empty clearing, invalid types, and exact 200/1000 limits.
- Create defaults versus edit omission/null presence; canonical digest equality/conflict cases.
- Replacement metadata propagation, immutable prior rows, tombstone invisibility, malformed-chain rejection, same-month preservation, and unchanged report inputs.
- Query grammar: duplicate/unknown keys, strict month/date/UUID/kind values, inverted ranges, 4096-byte query bound, q trimming/200-code-point bound, literal `%/_/\\`, AND semantics, inclusive dates, unchanged ordering, and 500 cap.
- Ordinary category/account predicates, current rename/archive names, transfer either-side account matching, category exclusion, and exactly one transfer item.

### API/in-memory tests

- Income/spending creation and edit metadata, transfer creation metadata, nullable DTOs, envelopes, owner/non-disclosure, protected/reconciled rejection, transfer edit/delete rejection, idempotency replay/conflict, and stale `If-Match`.
- In-memory and PostgreSQL-backed projections produce identical DTO/filter results for the same fixtures.
- Existing first-slice setup, reports, allocation, category move, month history, and equation regressions remain green.

### PostgreSQL tests

- Migration shape, nullable legacy backfill, indexes, transfer metadata columns, composite ownership, and restart/rebuild equality.
- Atomic failure injection proving no one-sided replacement, tombstone, transfer leg, metadata, or receipt survives.
- Concurrent retries and stale versions under the existing budget lock; no duplicate replacement or transfer history item.
- Current account/category rename/archive projection and owner-scoped foreign-reference non-disclosure.
- Query plans/timeouts for common month/account/date filters and bounded synchronous failure without partial results. Do not treat a successful in-memory search as PostgreSQL performance or durability evidence.

### OpenAPI and web tests

Update OpenAPI for nullable metadata, create/edit/transfer inputs, the discriminated history union, all seven query parameters, strict limits, and retained envelopes. Web behavior adds payee/memo controls to income/spending creation and history edit, renders nullable metadata and current server names, and exposes month/account/kind/category/from/to/q filters that issue one server request. Transfer history is rendered read-only with both account references; no transfer edit/delete controls are shown. The client preserves server ordering and financial values, refreshes after commands, and does not implement local filtering as authority. Existing first-slice history, dashboard, cards/splits exclusions, and Playwright journeys remain unchanged.

## Review workload and delivery split

The complete implementation is estimated at **1,250–1,650 authored changed lines**, excluding generated Prisma output. It is not a safe single review under the canonical 400-line budget. Use these ordered review units; each target stays below 400 authored lines:

1. **Normalization and pure history domain (260–340 lines):** metadata normalizer/patch semantics, effective folding, transfer-aware pure DTO/filter predicates, digest fixtures, and focused unit tests.
2. **Durable persistence and migration (320–390 lines):** nullable columns, transfer aggregate mapping, authoritative load/rebuild, indexes, rollout checks, PostgreSQL atomic/restart tests, and report-neutrality tests.
3. **API and HTTP contract (300–380 lines):** command DTOs, idempotency/If-Match integration, strict query parser, owner/non-disclosure behavior, OpenAPI, and API/contract tests.
4. **Web and regression verification (240–330 lines):** metadata forms, bounded filter controls, read-only transfer rendering, refresh/version handling, and focused web/E2E coverage.

Pause for an explicit delivery decision if a unit exceeds 400 changed lines or combines an additional architectural boundary. This design phase changes no application source, tests, schema/migrations, OpenAPI, web, `.codegraph/`, or `.pi/` files.
