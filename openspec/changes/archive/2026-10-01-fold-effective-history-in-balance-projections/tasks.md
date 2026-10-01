# Implementation Tasks: Fold Effective History in Balance Projections

Execution status: Owner approved opening and fixing this before Work Unit 2 of the cleared-state phase on 2026-09-30. Design approved in the same decision. Implementation is authorized. This change alters no requirement and declares `skip_specs: true`. No commit or push is requested.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 120-220 authored additions across two persistence adapters and their tests |
| 400-line budget risk | Low |
| Chained PRs recommended | No; one slice |
| Suggested split | Single work unit; split only if the returned-event narrowing forces changes in unrelated consumers |
| Delivery strategy | ask-on-risk; no commit or push requested by these tasks |
| Chain strategy | One review slice; pause for re-scoping if it exceeds 400 |

## Preconditions and hard gates

- **The rule is absolute.** Every account-balance projection MUST consume effective history. An adapter projecting from raw rows is defective.
- **The fold itself MUST NOT change.** This change alters which history a projection reads, not how history is folded.
- **Tombstones and superseded rows MUST NOT be exposed.** Per the canonical requirements, they are never visible.
- **`rawEvents` MUST remain available** where a caller legitimately needs persisted truth for a digest or a rebuild.
- **No retroactive data repair.** Stored rows are not modified.
- **A pre-existing test that encodes the raw-sum balance MUST be classified, not silently adjusted.** A test asserting a doubled balance is asserting the defect.
- Do NOT change any cleared-state or reconciliation behaviour, and do NOT touch the cleared-state phase's files beyond the two adapters named below.
- Do NOT modify `apps/api/src/reports/monthly-report.ts` or `apps/api/src/reports/multi-month-report.ts`.

## Work unit 1 — Effective-history balance projections in both durable adapters

**Boundary:** `apps/api/src/persistence/financial-store.ts`, `apps/api/src/persistence/budget-store.ts`, and focused tests. Roll back by reverting the two adapters; no schema, migration, or data change.

1. [x] **RED:** Add failing tests that observe the defect through the real adapters, not a mock: after editing a transaction through the ordinary command, `getBudget` reports the replaced amount **once** rather than the sum of the superseded and replacement events, and the same holds for the working and cleared balances; after deleting a transaction, `getBudget` reports the balance with the effect removed; the superceded row and the tombstone are not exposed in the returned events; and `PrismaBudgetStore` and `InMemoryBudgetStore` report identical working and cleared balances for the same edited and deleted history. <!-- sdd-owner: implementation -->
2. [x] **GREEN:** Fold once per read in `FinancialStore.readState` and project accounts from the folded set while preserving `rawEvents`; fold once per read in `PrismaBudgetStore.read`, project accounts from the folded set, and map the returned events from the folded set; leave `InMemoryBudgetStore` as the reference behaviour. Import the existing `foldEffectiveHistory`; do not add a second fold. <!-- sdd-owner: implementation -->
3. [x] **TRIANGULATE:** Strengthen the coverage for a chain of two successive edits, an edit that changes the amount, business date, and category together, a deletion followed by a rebuild, a transfer's two paired effects remaining balanced, an unedited budget whose balances are unchanged, and a cleared replacement whose cleared balance reflects only the effective event. <!-- sdd-owner: implementation -->
4. [x] **REFACTOR:** Refine the read paths without changing the contract, and review every consumer of the returned `events` projection for one that relied on seeing superseded rows or tombstones, classifying each as required-behaviour change or defect. Run `npm test` without and with the documented database URL and record each exact result. <!-- sdd-owner: implementation -->

## Parent-owned post-apply gates

- [x] Parent review of the work unit: changed scope, test evidence, changed-line estimate against the 400-line budget, and rollback boundary. <!-- sdd-owner: parent -->
- [x] Confirm both durable adapters now consume effective history, and confirm adapter parity with observed evidence: identical working and cleared balances from `PrismaBudgetStore` and `InMemoryBudgetStore` for the same edited and deleted history. <!-- sdd-owner: parent -->
- [x] Confirm no superseded row or tombstone is exposed in any client-facing event projection. <!-- sdd-owner: parent -->
- [x] Confirm the canonical requirement *Atomic replacement and removal of financial effects* is now satisfied by observation, not by declaration: an edit replaces prior effects exactly once and a deletion removes them exactly once. <!-- sdd-owner: parent -->
- [x] Confirm every pre-existing balance-after-edit or balance-after-delete assertion that changed was classified as encoding the defect or as a genuine regression, and record the classification. <!-- sdd-owner: parent -->
- [x] Confirm the fold algorithm, both report projections, and the cleared-state phase's work are unchanged. <!-- sdd-owner: parent -->
- [x] Confirm runtime evidence at closure: `npm test` against the documented database with zero skips, `npm run test:web`, `npm run typecheck:web`, and `npm run build:web`. <!-- sdd-owner: parent -->

## Recorded separately, not fixed here

The repository-wide `RenameForeignKey`/`RenameIndex` naming drift (75 statements, all renames, none touching this change's objects) predates this work and belongs to its own alignment change. It is out of scope here.

## Known boundary recorded at closure

`InMemoryBudgetStore.clone` trusts that `state.events` already holds effective history rather than folding it itself. Every ordinary command maintains that invariant, and the parity tests confirm both adapters report identical balances for edited and deleted history. The boundary is direct seeding: a caller that passes raw superseded rows through `createBudget` could still double-count in the in-memory store. This is a fixture-level risk, not a supported application path, and it is recorded rather than fixed so that a future test which seeds raw history does not mistake the in-memory projection for a folding one.

Verification of this work unit returned PASS WITH CAVEATS: both durable adapters fold once per read, no supported client-facing path was found consuming raw history without folding, no pre-existing assertion was weakened, and the measured scope was 191 changed lines against the 400-line budget.
