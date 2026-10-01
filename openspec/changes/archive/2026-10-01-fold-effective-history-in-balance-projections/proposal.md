# Proposal: Fold Effective History in Balance Projections

**Draft for owner review.** On 2026-09-30 the owner approved opening and fixing this before Work Unit 2 of the cleared-state phase. This change alters no requirement, so it declares `skip_specs: true`: the canonical transaction-history requirement *Atomic replacement and removal of financial effects* already demands exactly this behaviour, and the implementation does not satisfy it.

## Why

Both durable persistence adapters compute account balances from **raw** event history instead of effective history, so a superseded event still contributes to a balance.

Evidence, all source-confirmed and reproducible:

| Site | Projects over | Folds effective history? |
| --- | --- | --- |
| `apps/api/src/persistence/financial-store.ts:148,155` (`FinancialStore.readState`) | `sourceEvents` from a raw `findMany` | No — the fold is applied only to the returned `events` (`:167`) |
| `apps/api/src/persistence/budget-store.ts:44-45` (`PrismaBudgetStore.read`) | `events` from a raw `findMany` | No |
| `apps/api/src/persistence/in-memory-budget-store.ts` (`clone`) | deduplicated events | Yes |

The two durable adapters therefore disagree with the in-memory adapter, and `ReportService.read` folds (`apps/api/src/reports/report-service.ts:18`), which is why editing a transaction through the report path already produces the correct balance while the budget path does not.

This is **pre-existing, not introduced by the cleared-state phase**: `HEAD:apps/api/src/persistence/budget-store.ts:45` is identical to the working tree except for the added `cleared` flag.

Consequences:

- Editing a transaction leaves the superseded event and its replacement in the table. Summing both double-counts the movement. This affects the **working** balance as well as the cleared balance, so it is not specific to cleared state.
- It violates the canonical requirement *Atomic replacement and removal of financial effects*, which states that every successful edit or deletion MUST replace or remove prior effective financial effects exactly once, and *Immutable metadata lifecycle* and *Released-income and unsupported-state protection*, whose tombstone folding states tombstones are never visible.
- It is reachable through the ordinary application path: `getBudget` → `PrismaBudgetStore` → cleared/working balance, and the production server constructs `PrismaBudgetStore`.
- It is **not observable in the current local data**: `ynab_dev` holds 0 superseded events, 0 tombstones, and 35 budgets. It becomes visible on the first edit.

Why it is urgent rather than a backlog item: the cleared-state phase's Work Unit 2 and Work Unit 3 build the cleared balance, the reconciliation adjustment, and the reconciliation lock on top of these same projections. Repairing them later means shipping two features on balances that are wrong after any edit.

## What Changes

Both durable adapters MUST project balances from effective history, and MUST return effective events where the canonical requirements say superseded rows and tombstones are never visible.

1. `FinancialStore.readState` folds before projecting accounts, while keeping the raw/effective pair the rest of the function already relies on.
2. `PrismaBudgetStore.read` folds before projecting accounts, and its returned event projection no longer exposes superseded rows or tombstones.
3. `InMemoryBudgetStore.clone` already behaves correctly and becomes the reference behaviour, not something to change.
4. The fold itself is not modified. This change alters **which** history a projection reads, not how history is folded.

## Non-goals

- The fold algorithm, its identity rules, or its error handling.
- Any cleared-state or reconciliation behaviour, or any requirement in the cleared-state phase.
- The pre-existing repository-wide `RenameForeignKey`/`RenameIndex` naming drift, which is recorded separately and needs its own alignment change.
- Retroactive repair of any database contents. The change corrects the projection, not stored rows.

## Impact

| Area | Files |
| --- | --- |
| Persistence | `apps/api/src/persistence/financial-store.ts`, `apps/api/src/persistence/budget-store.ts` |
| Tests | balance-after-edit and balance-after-delete coverage through the budget path, plus adapter parity |

## Risk

- **Behaviour change.** The budget path's balances change after an edit or a delete. Any existing test that encodes a raw-history sum will now fail, and each such failure must be examined deliberately rather than adjusted to fit: a test asserting a doubled balance is asserting the defect.
- **Returned-event shape.** Making the store return effective events changes what the `events` projection exposes. Downstream consumers of that projection must be checked, since tombstone rows becoming invisible is a requirement, not a regression.
- **Cost.** Folding adds one Map pass per read. `ReportService.read` already pays it, so the pattern is established.
