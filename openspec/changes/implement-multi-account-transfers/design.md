# Technical Design: Multi-Account Transfers

## Context

The current implementation has a one-to-one `Budget.account` relation, a singular account in `FinancialState`, append-only `FinancialEvent` rows, and a budget-scoped `CommandReceipt` stream. PostgreSQL financial commands already lock the budget row, check idempotency, compare the receipt-count version, append events, and commit the receipt in one transaction. The in-memory store mirrors this contract for fast tests.

This design extends that boundary without changing the meaning of existing income, spending, category assignment, category `MOVE`, setup, or summary behavior. PostgreSQL remains authoritative. The singular `account` response is a projection, never a second source of truth.

This phase changes only this document. Application, schema, migration, OpenAPI, web, and test changes are implementation work described below.

## Goals and non-goals

### Goals

- Make `accounts[]` the canonical budget projection while deriving the oldest-account `account` alias.
- Preserve legacy account IDs, opening information, events, and first-slice clients.
- Add bounded manual `CASH`/`CHECKING` account create, rename, and archive operations.
- Calculate current per-account balances and the aggregate balance from server-owned data.
- Add one atomic, same-budget transfer command with durable paired effects.
- Include each transfer once in history as a `TRANSFER` DTO exposing both account sides.
- Share budget version, idempotency, authorization, and PostgreSQL locking between account mutations and transfers.
- Keep transfers out of income, spending, category Activity, Assigned, Available, and RTA equations.
- Keep in-memory behavior equivalent to the durable behavior without treating it as durability evidence.

### Non-goals

No unarchive, payee, memo, CSV/import, split, card, investment, loan, reconciliation, synchronization, transfer edit/delete, transfer correction, or broader YNAB parity is introduced. Existing transaction edit/delete remains limited to the previously supported income/spending records; transfer IDs are rejected by those mutation paths without changing transfer state.

## Decisions

### 1. Canonical account model and compatibility projection

Change the domain state from a singular authoritative account to:

```ts
type AccountState = {
  id: string;
  name: string;
  kind: 'CASH' | 'CHECKING';
  archived: boolean;
  createdAt: string;
  openingBalanceMinor: number;
  balanceMinor: number; // calculated, never a write input
};

type FinancialState = {
  // ...existing fields...
  accounts: AccountState[];
  transfers: TransferState[];
  account: AccountState | null; // deprecated derived alias for old callers
};
```

`accounts` is sorted by `createdAt ASC, id ASC`. The compatibility alias is `accounts[0]`, so it is the account with the earliest durable creation timestamp and the lowest stable ID on a timestamp tie. A migrated legacy account retains its ID and `createdAt`; it therefore remains the deterministic first account unless a data repair explicitly changes it. No code writes the alias independently.

The public budget DTO gains `accounts[]` and `accountBalanceMinor`. Each account includes `id`, `name`, `kind`, `archived`, `openingBalanceMinor`, and server-calculated `balanceMinor`. `account` remains nullable and is the same DTO selected from `accounts[]`; existing fields remain present. Extra fields are additive for old clients. A budget with no account still returns `account: null` and `accounts: []`.

The summary/dashboard DTOs retain `accountBalanceMinor` and gain the same ordered `accounts[]` projection. This gives new clients per-account values while leaving old aggregate and category fields unchanged.

Existing income/spending payloads gain an optional `accountId`. When omitted, the server selects the oldest non-archived account. This keeps single-account requests byte-for-byte compatible and gives old clients a safe default if the oldest compatibility alias is later archived. An explicit archived, foreign, or unknown account is rejected. `ready` requires setup completion and at least one active account, not specifically an unarchived alias.

### 2. PostgreSQL schema and tenant-scoped constraints

The Prisma migration will make these additive/structural changes:

- Replace `Budget.account Account?` with `Budget.accounts Account[]`.
- Remove the unique constraint on `Account.budgetId`; retain `Account.budgetId` as a required tenant key and add an index on `(budgetId, createdAt, id)`.
- Preserve the existing `Account.id`, `kind`, `archived`, and timestamps. `Account.kind` remains limited to the existing `CASH` and `CHECKING` enum values.
- Keep `OpeningBalance` as the authoritative account-local opening record. Add an index/constraint so a newly created account has exactly one opening row. The migration preflight must detect legacy duplicate opening rows; if found, it must not enable multi-account writes until the rows are reviewed. No historical financial event is deleted or rewritten.
- Add a `Transfer` table:

```text
Transfer
  id                 UUID primary key
  budgetId           UUID not null
  sourceAccountId    UUID not null
  destinationAccountId UUID not null
  amountMinor        BIGINT not null
  businessDate       DATE not null
  month              TEXT not null
  createdAt          TIMESTAMPTZ not null

unique (budgetId, id)
foreign key (budgetId) references Budget(id)
foreign key (budgetId, sourceAccountId) references Account(budgetId, id)
foreign key (budgetId, destinationAccountId) references Account(budgetId, id)
check (sourceAccountId <> destinationAccountId)
check (amountMinor > 0)
```

- Add `TRANSFER_OUT` and `TRANSFER_IN` to `FinancialEventKind`, plus nullable `FinancialEvent.transferId`. Add a tenant-scoped foreign key `(budgetId, transferId) -> Transfer(budgetId, id)`, an index on `(budgetId, transferId)`, and a unique constraint on `(budgetId, transferId, kind)`.
- Add database checks requiring a transfer event to have `transferId`, `accountId`, and a transfer kind, and requiring non-transfer kinds (including category `MOVE`) to have no `transferId`. Transfer effects have positive `amountMinor`; direction is represented by the kind. They cannot carry category references.
- The migration may add a deferred PostgreSQL constraint trigger that verifies every committed `Transfer` has exactly one `TRANSFER_OUT` and one `TRANSFER_IN`, with matching amount/date/account references. The application transaction remains the normal write path; the trigger is a containment guard against partial direct writes.

The existing composite account/category relations are retained or tightened so every financial reference includes `budgetId`. A UUID alone is never accepted as proof of tenant ownership. The database is the final authority for cross-budget foreign-key rejection; the application performs owner-scoped lookups first for non-disclosure.

A transfer is therefore distinct in three independent ways: it has its own aggregate table and ID, it has dedicated event kinds, and it cannot use the category `MOVE` shape or category references. Category `MOVE` remains exactly the category assignment event already used by reports.

### 3. Transfer and balance domain shape

The in-memory/domain transfer shape is:

```ts
type TransferState = {
  id: string;
  sourceAccountId: string;
  destinationAccountId: string;
  amountMinor: number;       // positive safe integer
  businessDate: string;      // YYYY-MM-DD
  month: string;             // budget-timezone month
  createdAt: string;
};
```

One command creates one `TransferState` and exactly two immutable effects with the same transfer ID and creation timestamp:

- `TRANSFER_OUT`, account = source, amount = `amountMinor`;
- `TRANSFER_IN`, account = destination, amount = `amountMinor`.

Both effects and the aggregate are written in the same transaction. The event IDs are implementation evidence, not public transaction identity. History uses the aggregate transfer ID (`transactionId` in the existing history route) and never exposes either effect as a separate transaction.

For every account, the current balance is calculated as:

```text
opening balance
+ sum(INCOME for account)
- sum(SPENDING for account)
- sum(TRANSFER_OUT for account)
+ sum(TRANSFER_IN for account)
```

All sums use safe integer minor units after checked `BIGINT` conversion. `accountBalanceMinor` is the sum of all calculated account balances. Transfer effects therefore change only source and destination balances by `-amount` and `+amount`; the aggregate is conserved. Client-provided balances are not accepted by any write.

For reports, the opening base is the sum of all account opening balances. This preserves the existing one-account equation and makes an added account's authoritative opening amount visible to the aggregate/RTA calculation. Account creation with a non-zero opening amount is a financial opening effect; rename and archive have no financial effect. Transfer events are excluded from all income/spending/release/assignment/category filters, so transfers do not change RTA, category Activity, Assigned, or Available.

Legacy `INCOME`/`SPENDING` rows with a missing account reference are associated with the migrated oldest account during the compatibility read/migration validation step. Existing rows with a valid account ID retain it. The exact legacy month totals and amounts are preserved; no client is allowed to repair them through this change.

### 4. Account lifecycle commands

The new owner-scoped routes are:

- `POST /api/v1/budgets/{budgetId}/accounts`
- `PATCH /api/v1/budgets/{budgetId}/accounts/{accountId}`
- `POST /api/v1/budgets/{budgetId}/accounts/{accountId}/archive`

There is deliberately no unarchive route. Account names are trimmed and must be non-empty; duplicate names are allowed because IDs, not names, identify accounts. Create is allowed only after setup is `COMPLETE` and accepts:

```json
{ "name": "Emergency cash", "kind": "cash", "openingBalanceMinor": -250 }
```

`kind` is required and normalizes to `CASH` or `CHECKING`. `openingBalanceMinor` is optional, defaults to zero, and may be any safe integer, including negative values. It is written once to `OpeningBalance`; it is not a current-balance override. Rename accepts `{ "name": "..." }`. Archive has an empty object body. Rename of an archived account remains allowed as metadata maintenance; archive is idempotent as a command replay, but there is no operation that reverses it.

All three mutations require `Idempotency-Key` and `If-Match`, use the same budget-scoped `FinancialStore.execute` path as transfers, and increment the existing receipt-count version once on a new commit. Their result is `{ account, version }`, with the server projection after the mutation. Account creation, opening row, metadata update, and receipt commit together.

### 5. Transfer command and request contract

Add:

- `POST /api/v1/budgets/{budgetId}/transfers`

with required headers `Idempotency-Key` and `If-Match` and this body:

```json
{
  "sourceAccountId": "uuid",
  "destinationAccountId": "uuid",
  "amountMinor": 1250,
  "date": "2026-09-15"
}
```

`date` is required and strictly `YYYY-MM-DD`; the server derives `month` using the budget timezone. Requiring the date avoids a clock-dependent idempotency payload. The amount must be a positive safe integer. Source and destination must be distinct, belong to the selected budget, and be active. No balance or category fields are accepted.

A successful result is a server-calculated transfer result containing `transferId`, both account IDs, amount, date, source and destination post-command balances, aggregate `accountBalanceMinor`, and the new version. A retry with the same key and canonical payload returns the exact stored result; it creates neither another aggregate nor another pair of effects.

No transfer-specific edit/delete route is added. `GET /transactions/{transactionId}` can return a transfer history item, while existing PATCH/DELETE transaction mutation dispatch rejects a transfer identity with `CONFLICT` before appending anything.

### 6. Shared version, idempotency, authorization, and error mapping

The current receipt-count version is retained to preserve first-slice version behavior. A successful new account or transfer command adds one `CommandReceipt`; reads report the count. Account mutations and transfers use the same `(budgetId, idempotencyKey)` unique receipt and the same expected-version comparison, so a transfer and account mutation based on one version cannot both silently commit. Existing setup/category persistence is not silently rewritten in this change; the new account/transfer commands are the shared stream required by the delta specs.

For new commands, the digest is calculated from a canonical payload with sorted object keys, omitted undefined fields, normalized account kind, trimmed name, normalized date, command name, and expected version. It includes the complete request body and expected version but never a client balance or untrusted actor identity. Same key/different canonical payload returns `409 CONFLICT`; same key/same payload replays the stored JSON result.

The transaction sequence is:

1. Authenticate and owner-scope the budget before validating account existence.
2. Start the PostgreSQL transaction and lock the budget row with `FOR UPDATE`.
3. Check the budget-scoped receipt, then compare `If-Match` with the receipt-count version.
4. For account-targeted commands, lock the target account; for transfers, lock source and destination account rows in sorted ID order. The budget lock is always acquired first to avoid deadlocks.
5. Validate setup, account ownership, active state, kind, amount, date, and operation-specific invariants from locked rows/state.
6. Apply the domain command, insert/update the required account/opening/transfer/effect rows, and create the receipt.
7. Commit. Any error rolls back every row, including a receipt, aggregate, opening row, or either effect.

Error mapping is deliberately non-disclosing: unauthenticated is `401 UNAUTHENTICATED`; unknown/foreign budget or account is `404 NOT_FOUND`; malformed body, date, kind, or amount is `400 VALIDATION_ERROR`; archived account, same-account transfer, stale version, idempotency conflict, unsupported transfer edit/delete, and database uniqueness/check/serialization conflicts are `409 CONFLICT`. Unexpected database failures become a generic `500 INTERNAL_ERROR` without raw SQL or resource details. The existing success/error envelopes and request IDs remain unchanged.

### 7. History projection and ordering

History remains one `/transactions` collection. The read model merges effective income/spending records with `Transfer` aggregates, then sorts by:

1. business date descending;
2. `createdAt` descending;
3. stable public identity descending as a final deterministic tie-breaker.

Month filtering compares the transfer's stored budget-timezone `month`; it does not convert the date using the server timezone at read time. Transfer history is readable after either account is archived. Account references contain stable IDs and current name/kind/archive state; archiving never deletes or rewrites the transfer.

The existing DTO remains unchanged for `INCOME` and `SPENDING`. The added discriminated DTO is:

```ts
type TransferHistoryItem = {
  transactionId: string; // Transfer.id; stable aggregate identity
  kind: 'TRANSFER';
  date: string;
  amountMinor: number;   // positive
  sourceAccount: AccountReference;
  destinationAccount: AccountReference;
  createdAt: string;
};
```

`AccountReference` contains `id`, `name`, `kind`, and `archived`. A transfer has no category, `MOVE` classification, payee, memo, or separate source/destination history item. Existing history filters and date/creation ordering remain valid, with transfers added rather than redefining existing kinds.

### 8. In-memory parity

Extend `InMemoryBudgetStore` cloning and `InMemoryFinancialStore` state with ordered accounts, opening records, transfers, and paired effects. Reuse the same pure command validation, canonical digest, projection, balance, history, and transfer-neutral report functions used by the PostgreSQL path. The adapter must:

- serialize commands per budget (a promise queue or equivalent) before checking version;
- replay/conflict idempotency using the same digest;
- reject foreign/archived/same-account references identically;
- update the state only after all validation succeeds, so a simulated failure has no one-sided effect; and
- use the same deterministic ordering as PostgreSQL.

In-memory tests prove domain and API behavior only. PostgreSQL tests remain mandatory for database constraints, lock ordering, rollback, restart durability, and mixed-version migration behavior.

## Data flow

1. The HTTP server parses the existing cookie, request ID, JSON body, `Idempotency-Key`, and quoted/weak-quoted `If-Match` value.
2. `BudgetApp` authenticates, owner-scopes the budget, normalizes the bounded request, and dispatches account or transfer work through the shared financial command seam.
3. The store locks the budget, checks/replays the receipt, checks the version, locks relevant accounts, and loads canonical accounts plus effective events/transfers.
4. Pure domain code validates the command and calculates the post-command account projection, aggregate, and result. Transfer code creates one aggregate plus two typed effects.
5. PostgreSQL commits the complete mutation and receipt, or rolls all of it back.
6. Budget, summary, history, and restart reads rebuild from accounts, opening balances, effective ordinary events, and transfer aggregates. No derived balance table is introduced.
7. Web code consumes DTOs and refreshes server projections after commands; it never calculates balances or RTA locally.

## Migration and rollout

### Forward rollout

1. **Preflight.** Inventory account rows, legacy opening rows, event account references, duplicate IDs, and invalid kinds. Verify every legacy budget can produce one ordered account and an aggregate equal to its current first-slice balance. If validation fails, keep multi-account writes disabled and continue the legacy read path.
2. **Compatibility reader.** Deploy the new projection/store code and generated Prisma client while the database still contains at most one account per budget. Read both legacy rows and the new collection shape; keep all new account/transfer routes disabled.
3. **Schema migration.** Create the transfer table, enum values, nullable transfer columns, indexes, composite tenant-scoped foreign keys, checks, and opening-row constraint. Remove the account-per-budget unique constraint only after the compatibility reader is live and migration preflight passes. Existing account IDs, timestamps, opening amounts, and event rows are retained.
4. **Enable writes.** Drain old API binaries before allowing a second account: an old binary has a singular ORM relation and must not be allowed to write/read a budget after it has multiple account rows. HTTP clients remain compatible because the old `account` field is retained. Enable account and transfer routes behind a capability flag only after migration, restart, constraint, rollback, and concurrency checks pass.
5. **Verification.** Compare legacy and new projections for representative single-account budgets, then exercise multi-account balance conservation, archive/history behavior, idempotency replay/conflict, stale versions, and report neutrality.

### Rollback and containment

Before any multi-account or transfer write, the migration can be rolled back by disabling routes and reversing only unused additive schema. After a second account or transfer has been written, the safe rollback is route disablement plus forward-compatible reads; do not restore the one-account unique constraint, delete transfer rows, merge accounts, or deploy the pre-change singular reader. Existing transfers and paired effects must remain durable and readable.

A failed command is fully rolled back by PostgreSQL, including its receipt, opening row, transfer aggregate, and both effects. A response lost after commit is recovered by replaying the same idempotency key. A serialization/deadlock retry is bounded and repeats the complete command; if it cannot commit, return conflict without partial state. Migration validation failure contains the feature by leaving legacy reads available and never enabling multi-account writes.

## Implementation seams and file impact

The later implementation should remain centered on these existing seams:

- `apps/api/prisma/schema.prisma` and one additive migration: account cardinality, `Transfer`, event kinds, composite constraints, and checks.
- `apps/api/src/persistence/budget-store.ts`: collection reads/writes, legacy projection, alias selection, opening rows, and public state loading.
- `apps/api/src/persistence/financial-store.ts`: canonical state, transfer effects, account mutation persistence, receipt/version/lock boundary, and transfer history loading.
- `apps/api/src/persistence/in-memory-budget-store.ts`: parity state, queueing, receipts, and cloning.
- `apps/api/src/planning/engine.ts` and a focused transfer/history module: checked per-account formulas, transfer conservation, canonical payload, and typed history projection.
- `apps/api/src/reports/report-service.ts`: aggregate opening base and per-account summary projection; retain existing category/RTA filters and meanings.
- `apps/api/src/app.ts` and `apps/api/src/server.ts`: DTOs, validation, owner/non-disclosure policy, routes, headers, and transfer rejection in ordinary transaction mutations.
- `apps/api/openapi.yaml`: new account/transfer paths, DTOs, headers, `accounts[]`, `TRANSFER` history, and stable errors; existing paths remain documented.
- `apps/web/app/page.tsx`: consume `accounts[]`, select account for ordinary movement, bounded account lifecycle controls, and one transfer form/history rendering. No client-side formulas.

## Test plan

### Pure/domain tests

- Account ordering, legacy alias selection, timestamp/ID ties, and zero/negative opening values.
- Per-account income/spending/opening/transfer formulas and aggregate conservation.
- Transfer validation: positive safe amount, required date, distinct active same-budget accounts, and transfer-neutral category/RTA projections.
- Canonical idempotency payload normalization and deterministic history ordering.
- Category `MOVE` remains category-only and cannot be interpreted as a transfer.

### In-memory API tests

- Legacy one-account budget response compatibility and multi-account DTOs.
- Create/rename/archive authorization, duplicate-name policy, opening balance, archived rejection, omitted-account defaulting, and no-unarchive behavior.
- Transfer success, replay, key reuse conflict, stale version, same-account/foreign/archived rejection, one history item, month filtering, archived history, and edit/delete rejection.
- First-slice setup, income, spending, allocation, category move, summary, dashboard, and existing history regression tests unchanged.

### PostgreSQL tests

- Migration shape, composite tenant foreign keys, checks, opening-row constraint, indexes, and legacy data projection after restart.
- Atomic failure injection proving no receipt, opening row, transfer aggregate, or one-sided effect survives a failed command.
- Concurrent account/transfer commands with the same version; budget lock serialization and sorted account locks; duplicate concurrent idempotency retries.
- Durable restart/rebuild equality for per-account balances, aggregate balance, reports, transfer history, archived account references, and month filtering.
- Explicit proof that category `MOVE` and transfer events coexist without cross-classification.

### Contract and web tests

OpenAPI structural tests must require the new routes, request headers, body constraints, response discriminators, `accounts[]`, and `TRANSFER` fields while retaining the existing route matrix. A focused Playwright journey should create an additional account, select it for a movement, archive it, create a transfer between active accounts, reload, and verify both balances, one history item, and unchanged RTA/category values. Existing first-slice journeys remain required.

## Risks and mitigations

- **Old singular binaries after cardinality expansion:** drain/disable them before enabling the first second-account write; never roll back to them after new rows exist.
- **Alias divergence:** derive `account` and `accounts[]` from one ordered projection and test zero/one/multiple cases.
- **One-sided transfer:** use the aggregate plus typed effects, budget/account locks, unique effect constraints, and a transaction/constraint-trigger test.
- **Report contamination:** keep transfer kinds out of all ordinary report filters and assert RTA/category equality before and after transfers.
- **Legacy opening duplicates:** preflight and gate writes rather than silently selecting or deleting a row.
- **Scope growth:** keep payee/memo, CSV, cards, splits, reconciliation, and all transfer corrections explicitly out of the implementation.

## Review workload and split decision

This is not a safe single apply under the canonical 400 changed-line review budget. The rough authored-line estimate is **1,200–1,700 lines** across schema/migration, persistence/domain, API/OpenAPI, web, and tests (generated Prisma output and bookkeeping excluded). It should be split before apply; this design does not authorize an oversized diff.

Recommended reviewable work units are:

1. **Persistence and projection:** account cardinality migration, legacy reader, opening rows, canonical DTO projection, per-account pure calculations, and restart/migration tests (target 300–380 authored lines).
2. **Account lifecycle:** create/rename/archive commands, optional account targeting for existing ordinary movements, shared receipt/version path, in-memory parity, and focused API tests (target 300–390).
3. **Transfer core and history:** `Transfer` aggregate, paired effects, locks/constraints/rollback, transfer-neutral reports, one-item history projection, and PostgreSQL concurrency tests (target 350–400).
4. **Contract and client integration:** OpenAPI, HTTP route wiring, web controls/history, Playwright coverage, and full regression/contract verification (target 300–390).

If any work unit exceeds 400 authored changed lines or crosses a second architectural boundary, pause for an explicit delivery decision rather than silently chaining or accepting `size:exception`. No commit or push is part of this design phase.
