# Apply Progress and Verify Report: Fold Effective History in Balance Projections

This change declares `skip_specs: true`: it alters no requirement. The canonical transaction-history requirements *Atomic replacement and removal of financial effects* and *Immutable metadata lifecycle* already demanded this behaviour, and the implementation did not satisfy it.

## Why the change exists

Both durable persistence adapters computed account balances from RAW event history, so a superseded event still contributed to a balance. `FinancialStore.readState` projected from a raw `findMany` while folding only the events it returned; `PrismaBudgetStore.read` projected from raw rows and also mapped its returned events from raw rows, exposing superseded rows and tombstones. `InMemoryBudgetStore` and `ReportService` folded correctly, which is why editing a transaction through the report path produced the correct balance while the budget path did not.

The defect was pre-existing: `HEAD:apps/api/src/persistence/budget-store.ts` was identical except for the later addition of the `cleared` flag. It was invisible in the local database because `ynab_dev` held zero superseded events and zero tombstones across 35 budgets.

It was found while verifying the cleared-state phase's Work Unit 1, and the owner approved fixing it before that phase's Work Unit 2 so the cleared balance, the reconciliation adjustment, and the reconciliation lock were not built on projections that counted a superseded event and its replacement.

## Delivered

- `FinancialStore.readState` folds once per read and projects accounts from the folded set, while keeping `rawEvents` for callers that legitimately need persisted truth.
- `PrismaBudgetStore.read` folds once per read, projects accounts from the folded set, and maps its returned events from the folded set, so superseded rows and tombstones are no longer exposed.
- `InMemoryBudgetStore` was left as the reference behaviour.
- The fold algorithm itself was not modified.

## Evidence at closure

- `npm test` with the documented database: 180 passed, 0 failed, 0 skipped at the time this change closed.
- `npm test` without the database: 148 passed, 32 skipped.
- `npm run test:web`: 53 passed.
- Measured scope: 191 changed lines, under the 400-line budget.
- RED observed before implementation: a same-length replacement of 100 to 150 produced an expected source/destination of `900/850` against an observed `800/750`, and adapter parity measured Prisma `800/750` against memory `900/850`. The difference was exactly the superseded event.

## Independent verification

Verdict: **PASS-with-caveats**. The verification confirmed both durable adapters fold once per read, confirmed the measured adapter parity for edited and deleted history, confirmed that no pre-existing assertion had been weakened, and enumerated every balance-deriving and client-facing projection site, finding none that still consumed raw history without folding.

The caveat is recorded rather than fixed: `InMemoryBudgetStore.clone` trusts that `state.events` already holds effective history rather than folding it itself. Every ordinary command maintains that invariant, and the in-memory store's `createBudget` and `saveBudget` were later given whole-state validation by the sibling cleared-state change. The residual boundary is a caller that seeds raw superseded rows directly: a fixture-level risk, not a supported application path.

## Note on the record

This change was closed and its canonical specs needed no sync, since it declares no spec-level behaviour change. No commit was made: everything above lives in the working tree under the owner's instruction not to commit until asked.
