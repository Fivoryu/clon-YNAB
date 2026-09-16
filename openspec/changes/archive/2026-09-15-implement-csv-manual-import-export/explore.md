# Exploration: Manual CSV Import and Export

## Scope and phase boundary

This exploration covers a bounded, synchronous manual CSV round trip for the approved financial history model. It does not implement code, change contracts, or alter persistence. The change depends on the multi-account/transfer model being canonical: `accounts[]` is authoritative, the singular `account` is an oldest-account compatibility alias, and transfers are one aggregate identity with paired account effects.

Non-goals remain cards, splits, reconciliation, bank synchronization, scheduled transactions, automatic imports, raw audit export, tombstones, and any broader CSV dialect or background job system.

## Repository and architecture evidence

CodeGraph was not available through the supplied tools and `.codegraph/` was not present at the expected project root, so this exploration used targeted source reads and symbol/path references rather than CodeGraph queries.

- `apps/api/prisma/schema.prisma`: PostgreSQL is the declared authority. `Budget` owns the singular legacy `Account`; `OpeningBalance` stores opening amounts; `FinancialEvent` is append-oriented; `CommandReceipt` is budget-scoped and unique on `(budgetId, idempotencyKey)`. Existing `FinancialEventKind` has income, spending, allocation, category `MOVE`, releases, and `TRANSACTION_DELETE`, but no CSV or transfer-specific fields in this checkout.
- `apps/api/src/persistence/financial-store.ts`, `FinancialStore.execute`, `readState`, and `appendEvent`: PostgreSQL commands lock the budget, count receipts as the version, replay matching payload digests, execute domain work, append events, and commit the receipt in one transaction. `readState` maps `BIGINT` to safe JS integers and folds effective history. This is the natural atomic import seam, but it currently supports only the existing event model.
- `apps/api/src/persistence/budget-store.ts`, `PrismaBudgetStore.read/saveBudget`: setup and legacy budget reads still assume `Budget.account`; these paths must not become a second source of truth when `accounts[]` is introduced. Setup currently writes an opening balance and account metadata together.
- `apps/api/src/app.ts`, `BudgetApp.recordIncome`, `recordSpending`, `listTransactions`, `historyItems`, `historyItem`, and `financial`: authentication and owner-scoped budget access are centralized here; ordinary financial mutations require idempotency and use the shared financial command path. History currently exposes only `INCOME` and `SPENDING` effective records and derives identity from `transactionId`.
- `apps/api/src/planning/transaction-history.ts`, `foldEffectiveHistory`, `parseTransactionDate`, `projectEffectiveHistory`: effective-history folding excludes superseded records and tombstones. Export must consume this effective projection, never raw events or deletion tombstones.
- `apps/api/src/reports/report-service.ts`, `ReportService.read`: reports calculate from effective events and explicitly classify income, spending, assignments, category `MOVE`, and releases. Imported rows must enter the same authoritative history path so reports rebuild identically.
- `apps/api/src/server.ts`, `createServer`, `commandOptions`: HTTP dispatch is hand-routed; request bodies are currently JSON and mutation headers are extracted here. CSV requires an explicit content type/body-size policy and separate import/export dispatch without weakening cookie authorization.
- `apps/api/openapi.yaml`: the current contract documents only JSON first-slice routes and explicitly says transfers/imports/CSV are unsupported. It will need a later contract update, but is intentionally untouched in this phase.
- `apps/web/app/page.tsx`: the existing client consumes server projections and has no import/export UI. A later web slice should remain manual and synchronous and must not calculate balances locally.
- Existing OpenSpec context: `openspec/changes/implement-multi-account-transfers/{proposal,design,tasks}.md` establishes `accounts[]`, deterministic oldest-account aliasing, PostgreSQL transfer aggregates with `TRANSFER_OUT`/`TRANSFER_IN` effects, one `TRANSFER` history item, idempotency, optimistic versioning, and transfer neutrality for category/RTA. Its proposal explicitly deferred CSV and payee/memo to this change.

## Affected paths and symbols (implementation later)

Likely API/persistence seams are:

- `apps/api/src/server.ts`: authenticated `GET` export and authenticated synchronous `POST` import route dispatch, CSV content negotiation, request-size limits, and request IDs.
- `apps/api/src/app.ts`: owner authorization, import/export orchestration, CSV result/error DTOs, effective history projection, account/category/payee/memo resolution, and row-level diagnostics.
- `apps/api/src/persistence/financial-store.ts`: one PostgreSQL transaction for validated import batches, receipt/version handling, transfer aggregate plus paired effects, and durable metadata.
- `apps/api/src/persistence/budget-store.ts` and `apps/api/src/persistence/in-memory-budget-store.ts`: canonical `accounts[]` compatibility loading and test parity only; in-memory behavior cannot substitute for PostgreSQL durability evidence.
- `apps/api/src/planning/transaction-history.ts` or a focused CSV/history module: strict CSV parsing, canonical serialization, effective-history export mapping, transfer cell parsing, bounds, and deterministic row ordering.
- `apps/api/src/reports/report-service.ts`: likely no semantic change, but regression evidence must prove imported effective events produce the same account/category/RTA results.
- `apps/api/prisma/schema.prisma` and one additive migration: only if the approved multi-account/transfer metadata design does not already provide `payee`, `memo`, and durable transfer representation. No migration should rewrite financial history or make raw audit records exportable.
- `apps/api/openapi.yaml`, `apps/web/app/page.tsx`, and focused API/Prisma/E2E tests: later contract/client/test surfaces, not edited now.

## Proposed CSV shape and transfer identity

The canonical header is exactly:

```text
date,type,account,amountMinor,category,payee,memo
```

Rows are UTF-8, with RFC 4180-compatible quoting, a single header, and no undocumented columns. `type` is bounded to `INCOME`, `SPENDING`, and `TRANSFER`; amount is a positive safe integer minor-unit value. `category` is required for spending and empty for income/transfer. `payee` and `memo` are optional, with maximum lengths of 200 and 1000 characters respectively; their trimming, Unicode length definition, and whether empty values normalize to null must be made explicit in the spec.

A transfer MUST be one CSV row and one public transfer identity, not two rows. The `account` cell must carry both sides in a specified, unambiguous grammar (recommended direction: `source=>destination`, resolved against canonical account references), while the database stores one transfer aggregate and exactly two effects. Export must never emit the paired effects as separate rows. The recommendation is to resolve account references by stable account ID where available and use an explicitly escaped/name-qualified representation only if portability requires names; names alone are unsafe because they may duplicate or change. The exact portable grammar is an unresolved design gate below.

This preserves one transfer identity within an import batch and avoids conflating transfers with category `MOVE`. It does not, by itself, preserve an original UUID across export/import; preserving UUIDs would require an additional identity column, which conflicts with the proposed canonical seven-column format. That tradeoff must be consciously accepted or the format must be versioned/extended.

## Import behavior and integrity boundary

Import should be a manual, synchronous operation with a bounded byte and row limit. The server should:

1. Authenticate the session and owner-scope the budget before revealing any account/category result.
2. Validate content type, UTF-8, header exactness, CSV quoting/record structure, column count, field bounds, date format, type, positive amount, account references, category references, and transfer source/destination invariants.
3. Parse and validate the entire file before financial writes. Collect row-numbered diagnostics (including field/code/message) for every invalid row; do not report hidden foreign-resource existence.
4. Resolve all account/category names or IDs against the selected budget and reject archived/foreign/unknown targets according to the approved account/transfer rules. Existing archived references may be export-readable but must not silently receive new imported activity.
5. Apply all valid rows in one PostgreSQL transaction, under the same budget lock/version and idempotency boundary as other financial commands. Income/spending must create the same authoritative effective-history records as their manual commands; each transfer must create one aggregate plus its paired effects.
6. Commit no financial state when any row fails. A successful import commits all rows and one batch receipt together, or none. A retry with the same idempotency key and identical canonical file digest replays the original result; a changed file or version conflicts.

Validation failures should return a bounded structured report rather than a partial success. The response should include total rows, accepted/rejected counts, and row diagnostics, but not raw CSV content or sensitive database details. Export should read PostgreSQL-derived effective history, be deterministic (document date/type/account/identity tie-breakers), use stable UTF-8 quoting/newlines, and exclude `TRANSACTION_DELETE`, superseded rows, raw audit events, command receipts, and other non-financial events.

## Compatibility and migration considerations

- This change cannot safely assume the current singular `Budget.account` schema. The multi-account/transfer migration and compatibility reader must land first or be a hard prerequisite. Legacy account IDs, creation timestamps, opening balances, and event references must survive unchanged.
- Export should include the canonical account reference needed to distinguish multiple accounts and transfers. The oldest-account alias must never be used as an export identity.
- Legacy income/spending rows with missing account references must follow the approved compatibility projection to the migrated oldest account; import must not recreate that ambiguity.
- Payee/memo persistence may require additive nullable columns or an approved metadata relation. Existing rows should read as empty/null without rewriting history. Length and Unicode normalization must be enforced server-side and PostgreSQL must remain authoritative.
- Existing clients and JSON routes remain unchanged. CSV routes are additive and should be capability-gated until schema, generated client, migration preflight, and mixed-version rollout are verified.
- Export is read-only and should not advance the financial version. Import is a financial command and must advance the shared budget version exactly once per committed batch.

## Exact unresolved product/design questions

1. **Transfer account cell:** Is the canonical cell `source=>destination`, and are each side stable IDs, exact names, or a tagged reference? What escaping handles delimiter characters, duplicate names, renamed accounts, and commas/quotes?
2. **Identity round trip:** Must export/import preserve the original transfer UUID and transaction IDs? If yes, may the format add a non-canonical `id` column or a metadata/version line? If no, is one new identity per imported row sufficient?
3. **Account portability:** Should exports from one budget import into another, or only back into the same budget? If cross-budget import is allowed, how are accounts and categories mapped without creating accounts/categories implicitly?
4. **Payee/memo semantics:** Are values trimmed, case-preserved, Unicode-normalized, and measured in Unicode code points or UTF-16 units? Are empty quoted fields null or empty strings?
5. **Date/timezone:** Is `date` strictly `YYYY-MM-DD` and interpreted in the budget timezone, as transfer design recommends? Are future dates and all historical months allowed?
6. **Import limits:** What exact maximum bytes, rows, field lengths beyond payee/memo, and synchronous timeout apply? What is the error behavior at the limit?
7. **Idempotency contract:** Is `Idempotency-Key` required for import, and does the digest include normalized UTF-8 bytes, parsed canonical rows, expected version, and route? Is export intentionally not idempotent?
8. **Duplicate detection:** Should repeated rows in one file be accepted as separate transactions, rejected, or deduplicated? Is there any stable source identifier despite the seven-column format?
9. **Existing-state conflicts:** Are imported rows always appended, or should a matching date/account/amount/payee/memo be treated as a conflict? How are released income, reconciled records, or archived categories handled if metadata support later expands eligibility?
10. **Error shape:** Is HTTP 400/422 the chosen status for row-level validation, and must all failures be returned in one response with a maximum diagnostic count?
11. **Ordering/newlines:** Should export use `\n` or `\r\n`, decimal-free minor units only, and a defined byte-order/deterministic tie-breaker for equal rows?
12. **Bulk versioning/concurrency:** Does one import consume one version regardless of row count, and should an import conflict if any concurrent account/category/financial command changes the budget after validation?

## Risks

- **Partial financial state:** A row-by-row command loop could commit early rows. Mitigation: parse/validate all rows first and persist the complete batch in one PostgreSQL transaction with a single receipt.
- **Transfer ambiguity or duplication:** Two exported effect rows or ambiguous account names can create one-sided/duplicate transfers. Mitigation: one transfer row, explicit grammar, aggregate identity, paired-effect constraints, and round-trip tests.
- **Identity loss on round trip:** Seven columns have no obvious stable ID. Mitigation: decide UUID preservation versus documented new identities before contract freeze.
- **Report corruption:** Importing raw audit/tombstone/superseded events or misclassifying transfers changes effective balances/RTA. Mitigation: export only effective history and route imports through canonical domain commands.
- **Tenant disclosure:** Name/ID resolution can leak foreign account/category existence. Mitigation: owner-scoped lookups and uniform not-found/row diagnostics.
- **Resource exhaustion:** Synchronous parsing of unbounded CSV can block the API. Mitigation: strict bytes/rows/field limits and bounded diagnostics.
- **Mixed-version deployment:** Old binaries cannot safely understand multi-account/transfer rows. Mitigation: compatibility reader first, additive schema, drain old writers before enabling new writes, and capability flag containment.

## Rollback and containment

Before any CSV write, disable the import route while retaining legacy JSON reads/writes and read-only export only if its projection is verified. After CSV rows or metadata exist, rollback means disabling import, preserving additive columns/rows, and deploying a forward-compatible reader; never delete imported history, transfer aggregates, receipts, or metadata. A failed batch must roll back its receipt and every financial effect. If export output is found incorrect, contain by disabling export and correcting the projection without mutating source events.

## Bounded recommendation

Proceed with a separate implementation slice only after multi-account/transfer persistence is available and the identity/account-portability questions are answered. Keep the first release append-only, same-budget, PostgreSQL-backed, and synchronous: exact seven-column UTF-8 CSV, bounded income/spending/transfer rows, one transfer row per aggregate, all-file validation before one atomic commit, row-level failures with no partial state, required import idempotency/version headers, deterministic effective-history export, and no implicit account/category creation. Prefer stable account IDs in a versioned transfer reference grammar; if human-portable names are mandatory, require an explicit mapping policy and reject ambiguous names rather than guessing. Defer edit/delete, reconciliation, automatic matching, and all non-goal transaction types.
