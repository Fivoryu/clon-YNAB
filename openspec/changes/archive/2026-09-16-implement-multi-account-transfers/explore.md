# Exploration: implement-multi-account-transfers

## Status and boundary

- **Clone decision:** This change is a bounded successor to the implemented first slice. It adds multiple manual `CASH`/`CHECKING` accounts and same-budget account-to-account transfers while preserving all existing first-slice behavior.
- **Clone decision:** The public budget DTO becomes canonical through `accounts[]`; the existing singular `account` field remains temporarily as a compatibility alias. Existing clients must continue to work during the compatibility period.
- **Clone decision:** Transfers are manual, same-budget, account-to-account movements only. Cards, splits, reconciliation, bank synchronization/imports, and other broader transaction behavior are not part of this change.
- **Clone decision:** A transfer has equal and opposite account effects, is atomic, does not create ordinary category activity, does not change RTA, is idempotent, and is durable in PostgreSQL.

## Repository and OpenSpec evidence

- `openspec/config.yaml` requires English artifacts and English structural headings/SHALL/MUST terminology.
- Existing change artifacts use explicit **Observed**, **Inferred**, **Clone decision**, **Proposed**, and **Open question** labels. This exploration follows that distinction.
- CodeGraph MCP/CLI was not available in this executor tool surface. The `.codegraph/` path was checked before targeted repository reads; no CodeGraph files were modified. Targeted reads/grep were used as fallback.
- The repository contains a working implementation, unlike the earlier first-slice design's historical baseline. Therefore the current source is the implementation authority for this exploration, while the existing product and NFR documents provide accepted constraints.

## Current architecture evidence

### Public/application boundary

- `apps/api/src/app.ts` defines `Budget`, `BudgetState` usage, setup input, financial command options, `publicBudget`, authorization, command dispatch, history mapping, and summary reads.
- `publicBudget` currently emits one nullable `account` object and no `accounts[]` collection. `saveSetup` creates or updates that one account; `ready` requires that account and rejects an archived account.
- `apps/api/src/server.ts` maps `/api/v1/budgets`, setup, income, spending, transaction history, allocations, summary, and dashboard routes. It extracts `Idempotency-Key` and `If-Match` for financial commands. A new account-management and transfer route must preserve these envelope/header conventions.
- `apps/api/openapi.yaml` explicitly documents transfers as unsupported and currently describes the singular budget account contract. The contract must be updated only in the later implementation phase, not during this exploration.

### Persistence and consistency boundary

- `apps/api/src/persistence/financial-store.ts` owns `FinancialState`, `FinancialEvent`, PostgreSQL command execution, idempotency receipts, version calculation, event loading, and `appendEvent`.
- Financial writes run through `withPostgresTransaction` in `apps/api/src/persistence/transaction.ts`. The store locks the budget row with `FOR UPDATE`, checks a budget-scoped `CommandReceipt`, compares the expected version, appends events, and stores the result in one transaction.
- The current version is derived from the count of command receipts rather than a dedicated budget version column. Same-key/same-payload replays the stored result; same-key/different-payload conflicts.
- `apps/api/src/persistence/in-memory-budget-store.ts` mirrors the financial command path for tests and currently clones one `account`. It must remain behaviorally compatible while gaining collection semantics.
- `apps/api/src/persistence/budget-store.ts` performs setup persistence and currently reads `budget.account`, upserts by `budgetId`, hardcodes `kind: 'CASH'` on creation, and rewrites one opening balance. This is the primary migration-compatibility seam: the current unique account-per-budget shape cannot represent the new requirement.

### Database/domain evidence

- `apps/api/prisma/schema.prisma` currently has `Budget.account Account?` and `Account.budgetId @unique`, enforcing one account per budget. `AccountKind` already contains `CASH` and `CHECKING`.
- `FinancialEventKind` currently includes `MOVE`, but application/reporting use `MOVE` for category assignment movement (`sourceCategoryId`/`destinationCategoryId`), not account transfers. Reusing that meaning without a discriminator would make history and derived calculations ambiguous.
- `FinancialEvent` has one optional `accountId`, category references, transaction identity, and related-event linkage. A transfer needs two account references or a separate paired transfer representation while maintaining tenant-scoped foreign-key safety.
- `apps/api/src/reports/report-service.ts` calculates a single aggregate account balance from the singular account opening balance and all income/spending events. Transfer events must cancel in the aggregate while still changing per-account balances; category activity and RTA filters must ignore them.
- `apps/api/src/planning/engine.ts` contains pure integer-minor-unit arithmetic and currently lists `transfer` as deferred. Its account balance helper accepts one opening balance and income/spending totals; transfer-specific balance calculation and command support must be introduced without changing first-slice equations.

### Web and tests

- `apps/web/app/page.tsx` types and renders one `budget.account`, uses one account name/opening setup form, and has no transfer UI. Web changes are explicitly outside this phase.
- Existing API tests are under `apps/api/test`; later implementation must extend the existing first-slice coverage rather than rewrite its behavior. PostgreSQL integration evidence is especially important because the in-memory store cannot prove durability or row-level constraints.

## Affected paths and symbols

| Area | Current path/symbols | Expected impact in later phases |
|---|---|---|
| API DTO/application | `apps/api/src/app.ts`: `Budget`, `BudgetState` consumers, `publicBudget`, `saveSetup`, `ready`, `balance`, `historyItem`, `financial` | Add collection-compatible projection, account commands/authorization, transfer validation and results; preserve alias and first-slice command semantics. |
| HTTP routing | `apps/api/src/server.ts`: budget route matcher and `commandOptions` | Add narrowly scoped account and transfer routes with existing auth, idempotency, version, and envelope behavior. |
| Account persistence | `apps/api/src/persistence/budget-store.ts`: `saveBudget`, `read` | Read/write many accounts, preserve existing account identity/opening history, honor account kind, and avoid destructive conversion of legacy data. |
| Financial persistence | `apps/api/src/persistence/financial-store.ts`: `FinancialState`, `FinancialEvent`, `execute`, `readState`, `appendEvent` | Represent paired transfer effects, validate same-budget account references, persist atomically, and calculate per-account balances. |
| Test adapter | `apps/api/src/persistence/in-memory-budget-store.ts` | Mirror account collection and transfer/idempotency/version behavior for fast tests without weakening PostgreSQL requirements. |
| Domain/reporting | `apps/api/src/planning/engine.ts`, `apps/api/src/reports/report-service.ts` | Keep category/RTA filters unchanged for transfers; add pure per-account balance/transfer conservation logic. |
| Persistence contract | `apps/api/prisma/schema.prisma` and additive migration(s) | Remove the one-account uniqueness limitation safely and add tenant-scoped transfer representation/constraints. Schema/migrations are not to be edited in this phase. |
| Contract/UI | `apps/api/openapi.yaml`, `apps/web/app/page.tsx` | Update only during implementation after exact route/DTO and product decisions are settled; no web/OpenAPI edits now. |

## Confirmed constraints and invariants

- **Authorization:** Every account and transfer operation MUST authenticate and authorize the owning budget before exposing whether an account exists. Cross-budget identifiers MUST not permit reads or writes; preserve the project’s non-disclosing resource behavior.
- **Account qualification:** Only manual `CASH` and `CHECKING` accounts are supported. No card, investment, loan, sync, or imported-account semantics may be inferred.
- **Lifecycle:** Archived accounts MUST reject new ordinary transactions and transfers as a source or destination. Existing history remains readable and references stable. Account rename/archive behavior must not rewrite financial history.
- **Same budget:** Source and destination MUST be distinct accounts belonging to the selected budget. A cross-budget or missing account should use the agreed safe resource error policy.
- **Money:** Amounts MUST be positive safe integer minor units. The source effect is `-amount`, destination effect is `+amount`; total budget account cash is conserved.
- **Plan isolation:** Transfer effects MUST NOT be classified as `INCOME`, `SPENDING`, category `Activity`, `Assigned`, `Available`, or RTA changes. Existing ordinary income/spending calculations and first-slice category behavior MUST remain unchanged.
- **Atomicity/durability:** Both sides and their command receipt MUST commit or roll back together in one PostgreSQL transaction. PostgreSQL is authoritative; client balances are never accepted as writes.
- **Idempotency:** The idempotency key is budget-scoped. Same key and identical canonical payload MUST replay the original result without duplicate effects; same key with a different payload MUST return `CONFLICT` and preserve state.
- **Concurrency:** The existing optimistic version contract MUST be honored. Stale `If-Match` writes MUST conflict. The transaction must retain a lock/uniqueness strategy that prevents duplicate transfer effects under concurrent retries.
- **Compatibility:** Responses MUST include canonical `accounts[]` and temporarily retain `account` as an alias to the legacy first account (or the explicitly chosen compatibility value). Existing first-slice clients and persisted single-account budgets MUST continue to load without data loss.

## Risks and containment

| Risk | Containment |
|---|---|
| Legacy `Account.budgetId @unique` or a migration assumption loses existing data | Use an additive, reviewed migration; inventory existing rows; preserve IDs/opening balances; verify forward read and rollback/rebuild behavior before deployment. |
| Singular alias diverges from `accounts[]` | Define one canonical ordering/selection rule and derive both fields from the same server-side projection; add contract tests for zero/one/multiple accounts. |
| Account `MOVE` is confused with category assignment `MOVE` | Use an explicit transfer identity/shape or distinct event semantics; keep category move filters and history folding unchanged. |
| One side of a transfer commits or retries twice | Lock the budget, check receipt and payload digest inside the same transaction, enforce database uniqueness, and test failure injection plus concurrent retries in PostgreSQL. |
| Transfer accidentally changes RTA/category summaries | Add engine/report tests proving aggregate account conservation with zero category/RTA deltas and inspect all event filters. |
| Archived or foreign account can be selected through a crafted ID | Validate ownership and lifecycle server-side, not from client lists; use tenant-scoped relations/queries and authorization tests. |
| Broad “multiple accounts” work expands into unsupported features | Keep this change manual CASH/CHECKING plus same-budget transfer only; explicitly reject/defer cards, splits, reconciliation, sync/import, and other unrelated behavior. |

## Unresolved design and product questions

1. **Canonical transfer representation:** Should the authoritative model be one transfer record with source/destination account IDs, two linked financial events, or another paired immutable entry? It must remain queryable/rebuildable and must not collide with category `MOVE`.
2. **Transfer history DTO:** Should transfers appear in existing transaction history, a separate transfer collection, or both? If included, define kind, date, memo/payee policy, and whether the legacy income/spending-only history remains unchanged for old clients.
3. **Account-management surface:** Exact create, rename, archive, and (if any) unarchive routes, setup interaction, duplicate-name policy, opening-balance rules for accounts added after setup, and whether an account with history may be archived only are unresolved.
4. **Alias semantics:** Confirm that `account` means the first deterministic account (likely legacy account by stable identity/creation ordering), whether it may be null for a multi-account budget, and the compatibility sunset/version policy.
5. **Balance/report DTO shape:** Decide whether summaries expose per-account balances, an aggregate working balance, or both, and how opening balances and transfer pairs are presented without changing first-slice response meanings.
6. **Transfer date/time semantics:** Confirm required date, budget-timezone month handling, and whether transfers have a category-independent month/date for history/report filtering.
7. **Concurrency/version scope:** Confirm whether account metadata mutations share the same budget version/receipt stream as financial transfers and whether transfer locks need account-row locks in addition to the budget lock.
8. **Migration rollout:** Confirm deployment order and rollback policy for changing the one-account relation, especially whether legacy clients must be supported across mixed API/schema versions.

## Bounded recommendation

Proceed to proposal/spec/design with a small vertical slice: first establish an additive multi-account persistence representation and canonical server-side projection that reads legacy single-account data unchanged; then add manual account lifecycle operations; then add one transfer command with explicit paired effects, idempotency, optimistic concurrency, authorization, archive checks, and PostgreSQL transaction tests. Keep the existing singular `account` field as a derived compatibility alias until a separately approved removal decision. Preserve current income, spending, category moves, RTA, summary, and history behavior through regression tests. Do not begin schema, application, OpenAPI, web, or test edits in this explore phase.

## Persistence

This exploration is persisted in the active OpenSpec backend at `openspec/changes/implement-multi-account-transfers/explore.md`. Engram was unavailable in this session, so no Engram persistence is claimed.
