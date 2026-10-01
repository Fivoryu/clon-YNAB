# Design: Fold Effective History in Balance Projections

**Draft for owner review.** No requirement changes, so there is no spec delta: the canonical transaction-history requirements already demand this behaviour.

## Context

A superseding replacement is how this repository mutates transaction history. The prior event remains in `FinancialEvent` and the new event points at it through `supersedesEventId`; a tombstone is a `TRANSACTION_DELETE` row that carries the chain linkage and must never be visible. `foldEffectiveHistory` (`apps/api/src/planning/transaction-history.ts:48-64`) collapses raw rows into the effective set.

Balance projection must read the folded set. Two durable adapters do not, and `ReportService` does.

## The rule this change establishes

> Every account-balance projection and every event projection that reaches a client MUST consume effective history, never raw rows. An adapter that projects from raw rows is defective, not merely different.

This is stated as a rule because the defect appeared as an *adapter divergence* twice in the preceding phase, and enumerating files instead of projection sites is what let it through.

## Sites and fixes

### 1. `FinancialStore.readState`

Today:

```
sourceEvents = findMany(...)                      // raw
projected = calculateAccountBalances(accounts, sourceEvents.filter(accountKinds)...)
return { ..., accounts: projected, events: foldEffectiveHistory(rawEvents), rawEvents }
```

Change: fold once, then project accounts from the folded set, and keep `rawEvents` as the raw input for callers that legitimately need it (idempotency digests and rebuild). The returned `events` remains the folded set.

The function deliberately keeps both: `rawEvents` is the persisted truth used for rebuild, `events` is what a client may see.

### 2. `PrismaBudgetStore.read`

Today:

```
events = findMany(...)                            // raw
accounts = calculateAccountBalances(accounts, events.filter(accountKinds)...)
return { ..., accounts, events: events.map(mapFinancialEventRow) }
```

Change: fold once, project accounts from the folded set, and map the returned events from the folded set so superseded rows and tombstones are not exposed. This is not only a balance fix: the canonical requirements say tombstones are never visible, and this projection currently leaks them.

### 3. `InMemoryBudgetStore.clone`

Already projects from its deduplicated event set. It becomes the reference. Do not change it except to keep its behaviour consistent if the shared rule is extracted.

## Implementation shape

- Import `foldEffectiveHistory` in both durable adapters. It is already exported from `apps/api/src/planning/transaction-history.ts`.
- Fold **once per read**, not once per account: `calculateAccountBalances` takes the event list, so a single folded array serves every account.
- Do not add a second fold implementation, and do not change the fold.
- Preserve the existing relation between `events` and `rawEvents` in `FinancialState`. If a caller needs raw rows for a digest or a rebuild, that must keep working; the change is which set feeds **projection and presentation**, not which set is retained.

## Ordering

`findMany` already orders by `createdAt`. `foldEffectiveHistory` keeps the last event per transaction identity and preserves order, so folding does not disturb the deterministic ordering the balance projection relies on.

## Verification strategy

| Layer | What it proves |
| --- | --- |
| Budget path after edit | `getBudget` reports the replaced amount once, not the sum of the old and new events |
| Budget path after delete | `getBudget` reports the balance with the deleted effect removed, and exposes no tombstone |
| Adapter parity | `PrismaBudgetStore` and `InMemoryBudgetStore` report identical working and cleared balances for the same edited and deleted history |
| Preserved behaviour | An unedited budget's balances are unchanged; `ReportService` output is unchanged, since it already folded |
| Existing suites | The full API suite, with each pre-existing balance-after-edit or balance-after-delete assertion examined against the effective-history expectation rather than adjusted to match the defect |

## Test double caution

The store tests must exercise the real adapters, not a mock, because the defect lives precisely in which set a real adapter reads. A mock that folds would hide it. This mirrors the lesson from the preceding phase, where mock-based tests passed on a fallback path that production never executed.

## Risks

1. **A pre-existing test may encode the defect.** A test asserting a balance equal to the raw sum will fail after the fix. Each failure must be classified as "the test encoded the defect" or "the fix is wrong", with the classification recorded.
2. **The returned event projection narrows.** Consumers of `FinancialState['events']` outside the balance path must be reviewed; hiding superseded rows and tombstones is required behaviour, so any consumer relying on seeing them is itself defective and must be identified rather than accommodated.
3. **No retroactive repair.** Stored rows are untouched. The corrected projection means a budget that was already displaying a doubled balance will display the correct one after the change, with no data migration.
