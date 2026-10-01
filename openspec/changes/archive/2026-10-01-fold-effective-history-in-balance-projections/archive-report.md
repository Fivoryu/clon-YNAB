# Archive Report: Fold Effective History in Balance Projections

- Status: ARCHIVED
- Change: `fold-effective-history-in-balance-projections`
- Archived as: `2026-10-01-fold-effective-history-in-balance-projections`
- Task status at archive: complete.
- Canonical specs updated: none. The change declares `skip_specs: true` because it alters no requirement.

## Why this change exists

Both durable persistence adapters computed account balances from RAW event history, so a superseded event still contributed to a balance. The canonical transaction-history requirement *Atomic replacement and removal of financial effects* already demanded that a successful edit or deletion replace prior effects exactly once, and the implementation did not satisfy it. That is why this change declares no spec deltas: it made the implementation agree with a requirement that already existed.

The defect was pre-existing — `HEAD:apps/api/src/persistence/budget-store.ts` was identical except for the later addition of the `cleared` flag — and it was invisible locally because `ynab_dev` held zero superseded events and zero tombstones across 35 budgets. It was found while verifying the cleared-state phase's Work Unit 1, and the owner approved fixing it before that phase's Work Unit 2 so the cleared balance, the reconciliation adjustment, and the reconciliation lock were not built on projections that counted a superseded event and its replacement.

## Delivered

| Commit | Content |
| --- | --- |
| `274e283` | Both durable adapters fold effective history once per read and project balances from the folded set; `PrismaBudgetStore.read` also maps its returned events from the folded set, so superseded rows and tombstones are no longer exposed. `InMemoryBudgetStore` was left as the reference behaviour and the fold algorithm was not modified. |

## Verification

Verdict from independent read-only verification: **PASS-with-caveats**. It confirmed that both durable adapters fold once per read, that `rawEvents` remains available for digests and rebuilds, that the fold algorithm is untouched, that measured adapter parity holds for edited and deleted history (both reporting `900/850` after an edit and `1050/1000` after a deletion), and that no pre-existing assertion had been weakened.

It also performed the enumeration that mattered: every site under `apps/api/src` that derives an account balance from events, and every projection of events that reaches a client. It found no supported path still consuming raw history without folding.

RED observed before implementation: a 100 to 150 same-length replacement produced an expected `900/850` against an observed `800/750`, and adapter parity measured Prisma `800/750` against memory `900/850`. The difference was exactly the superseded event.

Measured scope: 191 changed lines, under the 400-line budget.

## Caveat carried forward

`InMemoryBudgetStore.clone` trusts that `state.events` already holds effective history rather than folding it itself, because that store's `state.events` is the EFFECTIVE set by construction — commands replace in place — unlike the durable table which keeps the chain and folds on read. Every ordinary command maintains that invariant, and the sibling cleared-state change later gave the in-memory store's `createBudget` and `saveBudget` whole-state validation. The residual boundary is a caller that seeds raw superseded rows directly: a fixture-level risk, not a supported application path.

## Left in place, deliberately

The repository-wide `RenameForeignKey`/`RenameIndex` naming drift is out of scope here and belongs to its own alignment change.
