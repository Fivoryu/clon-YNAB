# Technical Design: Transaction History Edit and Delete

## Context

The approved `transaction-history` specification adds owner-scoped history list/read and bounded edit/delete for realized income and one-category spending in the existing single cash/checking account. The current API records an append-only `FinancialEvent` stream, while `FinancialStore` owns budget locking, owner-scoped loading, receipt replay, version checks, event appends, and atomic Prisma transactions. `ReportService` rebuilds account, RTA, category, and rollover values from the event stream.

The existing Prisma schema already has a `businessDate` column, but the application does not write or load it. There is no transaction aggregate, reconciliation marker, audit table, history read model, edit/delete command, or effective-event projection. The in-memory store remains a test double; PostgreSQL is authoritative.

This design is additive. It does not introduce splits, transfers, multiple accounts, reconciliation, closed-month policy, payee/memo fields, or an audit-read API. It also does not redo the delivered first-slice dashboard, summary, or entry behavior.

## Goals / Non-Goals

### Goals

- Give every supported income/spending record a stable transaction identity and authoritative date.
- List/read effective history in the specified order and optional month scope.
- Implement atomic, same-month amount/date/category edits and explicitly confirmed deletes.
- Keep released income readable but protected, and reject all unsupported or ineligible mutations without mutation.
- Preserve append-only evidence while ensuring Reports and rebuilds see each effective financial effect exactly once.
- Preserve the established envelopes, owner authorization, budget-scoped idempotency, and optimistic version semantics.
- Provide pure planning seams for validation, effective-history folding, and mutation projections.

### Non-Goals

- No public transaction status/reconciliation workflow; the internal eligibility fields are only guards.
- No audit listing, deletion restore, closed-month handling, pagination policy, or retention policy.
- No change to first-slice report shape or dashboard behavior beyond consuming corrected authoritative events.
- No client authority over balances, summaries, month derivation, or financial effects.

## Decisions

### 1. Stable identity and effective-history representation

Use the original `FinancialEvent.id` as the stable transaction identity, exposed as `transactionId` in the domain/API. Existing `INCOME` and `SPENDING` rows are backfilled with `transactionId = id`. An edit appends a new row with the same `transactionId`, the same immutable `kind` and `accountId`, and `supersedesEventId` pointing at the currently effective row. A delete appends a zero-amount `TRANSACTION_DELETE` tombstone for that identity.

`FinancialStore` folds all rows for a budget in creation order: the latest valid replacement is effective; a tombstone removes the transaction; non-transaction events (`INCOME_RELEASE`, `ASSIGNMENT`, `UNASSIGNMENT`, and `MOVE`) remain separate. The fold emits only effective income/spending rows plus those non-transaction events. The old rows and tombstones remain persisted evidence but are never passed to Reports as financial effects.

This is preferred over updating or hard-deleting the original event because it preserves the existing append-only history and makes recovery/rebuild deterministic. A separate mutable transaction aggregate was considered, but would create a second source of truth for current amount/date/category and would require more synchronization with the existing event stream. A separate revision table was also considered, but the event stream already supplies the required revision evidence and the tombstone kind is the smaller additive change.

The fold rejects malformed identity/kind/account chains rather than guessing. A replacement cannot change transaction type or account, and a delete cannot target a release/allocation event.

### 2. Authoritative business date

For supported `INCOME` and `SPENDING` rows, `businessDate` is persisted as a PostgreSQL `DATE` and `month` is derived from that date using the budget timezone. The domain event gains `businessDate`, `accountId`, `transactionId`, `supersedesEventId`, `createdAt`, status, and reconciliation metadata. `appendEvent` writes the date instead of silently dropping it.

The migration backfills existing supported rows with the first day of their persisted `month`, because the exact historical day was not previously stored. This preserves all existing month totals and gives legacy records a deterministic, authoritative date; it must not be presented as recovered precision. A database check and application invariant require a business date for supported transaction rows. Release/allocation events may continue to use their existing month-only representation.

Date input remains strict date-only `YYYY-MM-DD`. An edit with no date retains the persisted date; a supplied date is converted to the budget month and must have the same `YYYY-MM` as the current date. The client never supplies or controls `month`.

### 3. Eligibility, release linkage, and protected state

Add internal `status` (`POSTED` or `WORKING`) and `reconciled` fields to supported transaction rows. The migration classifies existing first-slice records as `POSTED` and `reconciled = false`; no endpoint changes either field. The pure eligibility guard requires a supported kind, supported account, status in `POSTED|WORKING`, and `reconciled = false`.

A realized income is protected when any `INCOME_RELEASE` row has `relatedEventId` equal to its stable transaction identity. Released income remains in history with `state: PROTECTED`; edit and delete return `CONFLICT`. The release event is never independently editable, and no release linkage or assignment policy is invented. Because released income cannot mutate, its existing linkage remains valid and cannot be double-counted.

History items expose `state: ELIGIBLE|PROTECTED`, the effective type, date, amount, creation timestamp, account identity, and category details where applicable. Archived categories remain visible. A spending edit may retain an archived category, but a supplied replacement category must be active and budget-owned.

### 4. Pure planning and mutation seam

Keep arithmetic in `apps/api/src/planning/engine.ts` and add a focused transaction-history module beside it. Pure functions will cover:

- strict date parsing and same-month validation using `monthForDate`;
- effective-event folding and stable transaction projection;
- eligibility/protected-state checks;
- construction of an immutable replacement event or delete tombstone; and
- application of the replacement/removal to an effective event collection for immediate result/rebuild calculation.

`FinancialStore.execute` will continue to provide the locked authoritative state, receipt check, expected-version check, and atomic commit. Its work seam must also retain the set of newly appended rows independently of the effective collection, because an edit removes the old effective row from the calculation while the old row must remain in PostgreSQL. Existing commands keep their behavior; transaction commands use the new append/projection seam.

After a successful edit/delete, the effective collection contains the new replacement or no transaction, never both old and new. Account balance, RTA, category activity, and rollover are then calculated using the existing pure formulas. Same-month enforcement means no closed-month or cross-month rollover policy is needed.

### 5. Application API and authorization

Add these owner-scoped endpoints:

- `GET /api/v1/budgets/{budgetId}/transactions` with optional `month=YYYY-MM`, returning `{ items, version }`.
- `GET /api/v1/budgets/{budgetId}/transactions/{transactionId}`, returning one history item and the current budget version.
- `PATCH /api/v1/budgets/{budgetId}/transactions/{transactionId}` with optional `amountMinor`, `date`, and spending-only `categoryId`.
- `DELETE /api/v1/budgets/{budgetId}/transactions/{transactionId}` with `{ confirmed: true, reason?: string }`.

Edit and delete require `Idempotency-Key` and `If-Match`; the latter carries the budget version returned by history/read, using the existing quoted or weak-quoted integer parsing. Their idempotency digest includes operation, transaction identity, body fields, confirmation/reason, and expected version. The same budget-scoped key and compatible request replays the stored result; reuse with a different payload conflicts. A new request for an already deleted transaction is not found. An unconfirmed delete is rejected before mutation; a confirmed delete of a protected/ineligible item is `CONFLICT`.

The application authenticates first and performs the existing owner-scoped budget lookup before validating the target or its fields. Foreign budgets/categories/transactions therefore use the established non-disclosing `NOT_FOUND` behavior. The durable command repeats the owner predicate, locks the budget row, validates the receipt and version, and performs all writes in one PostgreSQL transaction.

Mutation results contain the server-calculated updated history item (edit) or `{ id, deleted: true, version }` (delete); they do not contain client-calculated summaries. A successful mutation increments the existing receipt-count budget version once.

### 6. Deletion audit and atomicity

Add `TransactionDeletionAudit` with budget ID, actor/user ID, stable transaction ID, optional request/correlation ID, optional reason, idempotency key, and server timestamp. The actor is the authenticated owner. The audit row, delete tombstone, and `CommandReceipt` are inserted in the same transaction. Receipt replay returns the saved result and creates no second tombstone or audit row. No audit-read route is added.

The command input carries the authenticated actor and request ID into the persistence seam; the store does not trust actor data supplied in the JSON body. A database uniqueness constraint on budget and idempotency key is a final duplicate-audit guard.

### 7. Reports and rebuild

`ReportService` remains the canonical summary calculator and does not gain transaction-edit policy or a second read model. `FinancialStore.load/readState` supplies only the folded effective history, so existing income, spending, release, assignment, move, account, RTA, category, and rollover formulas automatically consume corrected authoritative history. Report changes are limited to accepting the expanded event shape and ensuring no raw superseded/tombstoned transaction reaches the filters.

A rebuild loads PostgreSQL rows, folds them, and runs the same `ReportService.read` for each requested month. The mutation path and rebuild must produce identical values. No derived balance table is introduced.

### 8. OpenAPI and web boundary

Update `apps/api/openapi.yaml` with the four paths, transaction/history schemas, optional month query, edit/delete bodies, required mutation headers, and existing success/error envelopes. Remove edits/deletes from the first-slice description only; leave unrelated unsupported capabilities unchanged.

Add a focused history section to `apps/web/app/page.tsx` without changing the existing dashboard/forms. It lists default or selected-month history, displays archived categories and protected state, opens an amount/date/category edit form, and uses an inline explicit-confirmation step with optional reason before delete. Active categories are the only replacement options; an archived current category can be retained by leaving the category unchanged. The client sends the current version and a fresh idempotency key, then refreshes history and the existing server-reported summary.

## Data Flow

1. The request handler parses body/query and existing command headers, then delegates to `BudgetApp`.
2. `BudgetApp` authenticates, checks the owner budget, validates the operation shape, and calls `FinancialStore` with actor/request context.
3. `FinancialStore` locks the budget, replays or rejects the receipt, checks `If-Match`, loads raw events, folds effective history, and invokes the pure transaction mutation.
4. The mutation validates eligibility, release protection, same-month date, amount, category, and immutable type/account; it updates the effective calculation set and records replacement/tombstone plus audit metadata.
5. Prisma commits all new rows and the receipt atomically. The response contains only server-calculated data and the new version.
6. History/read and summary/rebuild independently reload and fold PostgreSQL history, providing the same effective outcome.

## Risks / Trade-offs

- [Risk] An old binary would count appended replacement rows as additional income/spending. -> Mitigation: gate history mutations, keep the effective-history loader/report code deployed during rollback, and never roll back to a pre-change binary after mutations have been used.
- [Risk] A malformed supersession chain could silently duplicate or lose effects. -> Mitigation: enforce same budget/type/account invariants, fail closed on malformed chains, and cover chain/rebuild equivalence in persistence tests.
- [Risk] Legacy exact dates are unavailable. -> Mitigation: backfill the first month day deterministically, preserve the existing month totals, and make future app writes authoritative.
- [Risk] A release linkage could be detached from an income during correction. -> Mitigation: released income is detected from the stable identity and is never editable or deletable.
- [Risk] Delete confirmation or retry could create duplicate audit evidence. -> Mitigation: require `confirmed: true`, include the complete mutation payload in the digest, and atomically protect audit/tombstone writes with the receipt uniqueness constraint.
- [Risk] Concurrent history edits could overwrite a newer correction. -> Mitigation: lock the budget and require the returned optimistic version; stale versions return `CONFLICT` before append.
- [Risk] Archived categories could become unreferenced or accidentally receive new activity. -> Mitigation: preserve the old reference for amount/date edits, allow only active same-budget replacements, and use owner-scoped category lookup.
- [Risk] In-memory tests could imply PostgreSQL durability. -> Mitigation: keep pure/in-memory tests fast but require Prisma restart, rollback, concurrency, and migration evidence for the durable claims.

## Migration Plan with Rollback

1. Add the additive Prisma migration: `TRANSACTION_DELETE`, transaction metadata columns/indexes, `TransactionDeletionAudit`, and the supported-row business-date check. Backfill `transactionId`, status/reconciliation defaults, and `businessDate = month + '-01'` for legacy income/spending rows. Do not rewrite `month` or existing event amounts.
2. Deploy the domain/persistence fold and `businessDate` read/write support while history mutation routes remain disabled. Verify legacy report equivalence after a fresh-process reload.
3. Deploy API/OpenAPI and focused web behavior behind the route/feature gate. Enable only after migration, authorization, idempotency, atomic rollback, and rebuild tests pass.
4. If a command fails, PostgreSQL rollback removes its replacement/tombstone, audit, and receipt together. A lost response is recovered by replaying the same idempotency key.
5. For an operational incident, disable edit/delete and preserve the new loader/report code; rebuild summaries from PostgreSQL effective history. Do not repair totals from client data. Preserve tombstones and audit records during recovery.
6. Before any schema rollback, confirm no new revision/tombstone rows exist. The safe rollback is normally route disablement plus forward-compatible schema retention. Dropping the additive schema is only allowed before feature use or after a controlled data migration that removes its rows; the original `businessDate` column must not be dropped.

## Test Plan and Seams

- **Pure planning tests:** strict date and same-month boundaries, positive minor units, archived retention/active replacement, release protection, immutable type/account, effective replacement/removal, malformed/unsupported state rejection, and deterministic fold.
- **Application/API tests:** list/read ordering and month filtering, owner/non-disclosure behavior, edit/delete envelopes, confirmation, released/reconciled/unsupported conflicts, stale version, incompatible idempotency reuse, safe replay, and server-calculated results.
- **Prisma persistence tests:** business-date restart durability, migration/backfill/indexes, replacement chains, tombstone exclusion, audit identity, atomic failure rollback, budget locking, and two-client stale-version behavior.
- **Reports tests:** corrected account balance, unreleased income/RTA, spending activity/category replacement, positive rollover, deletion, and raw-history rebuild equivalence. Do not add new dashboard/reporting scope.
- **OpenAPI tests:** validate new paths, required headers, request schemas, transaction result envelopes, and stable error codes.
- **Focused Playwright journey:** list a supported record, edit amount/date/category, retain an archived category, show released income as protected, require the explicit delete confirmation, verify deletion disappears, and verify the refreshed server summary. Existing first-slice journey coverage remains unchanged.

Dependency injection remains through `BudgetApp`/`createServer`, `FinancialStore`'s Prisma client, the existing clock, and the in-memory store. Persistence failure tests must force a database constraint/client failure inside the transaction rather than mocking a successful commit.

## Open Questions

- Audit retention, export, and authorized audit-read behavior remain future policy decisions.
- Pagination and indexing beyond the bounded first history view can be added when history volume requires it.
- A future reconciliation or closed-month capability may define status transitions and cross-month correction policy; this change intentionally provides neither.

## Key Learnings

- Stable identity must be separate from individual append-only effect rows because income release already creates linked events.
- Effective folding is the smallest safe bridge between the existing event stream and edit/delete without double counting.
- Same-month correction and released-income protection avoid inventing release, rollover, or closed-month policies.
- The effective-history loader, pure mutation functions, and transactional store are the critical test seams; Reports should remain a consumer of corrected history, not another mutation engine.
