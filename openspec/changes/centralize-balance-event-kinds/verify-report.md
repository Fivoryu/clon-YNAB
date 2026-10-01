# Apply Progress and Verify Report: Centralize the Balance Event-Kind Predicate

This change declares `skip_specs: true`: it alters no requirement. It is an internal refactor with no behaviour change.

## Why it exists

The set of event kinds contributing to an account balance was written as a literal array in five separate places. During the cleared-state phase the new `RECONCILIATION_ADJUSTMENT` kind reached the reducer and two of those five sites and was omitted from the other two. Independent verification caught both omissions, and the visible effects were a public budget response that ignored the reconciliation correction and a summary whose account balances disagreed with the account's real balance.

That phase had eight correction rounds and the dominant class was exactly this: a rule stated in one place and applied in only some of the places it governs. Adding a kind is a normal act — the remaining roadmap adds credit-card and overspending kinds — so the duplication was going to fail again.

## Delivered

`apps/api/src/planning/engine.ts` now exports:

- `BALANCE_EVENT_KINDS` and `isBalanceEvent`, the single source consumed by all five balance projections; `BalanceEventKind` is derived from the constant, so the type and the runtime set cannot disagree.
- `LOCKABLE_EVENT_KINDS` and `isLockableEvent`, a **separate** predicate for a different question: which effective statement items a reconciliation may lock.

The five projections — `app.ts` `projectAccounts`, `PrismaBudgetStore.read`, `FinancialStore.readState`, `InMemoryBudgetStore.clone`, and `ReportService.read` — consume `isBalanceEvent` instead of their own literals.

The lock site at `apps/api/src/app.ts` keeps its own predicate and carries a comment recording why. A reconciliation adjustment is created already reconciled, so it is never a lock candidate; folding that site into the balance predicate would have been a behaviour change disguised as a refactor, and an invisible one, because the adjustment is excluded by the `!reconciled` condition anyway.

## Two corrections made during verification

Verification returned PASS-WITH-CAVEATS and named two things worth fixing, both of which were the same defect in a different dress:

1. **Three map expressions restated the balance union in a type assertion.** They did not control runtime membership, but a literal union in a cast is the same duplication this change exists to remove. All three now cast to `BalanceEventKind`.
2. **The reducer absorbed an unknown kind as a debit.** `calculateAccountBalances` computed `kind === 'INCOME' || kind === 'TRANSFER_IN' ? +amount : -amount`, so anything unrecognised became a debit. No production path could reach it, because the five projections filter first and the parameter type prevents it — but a fallback branch that silently accepts an unknown value is precisely the pattern that has caused silent financial defects in this repository twice already, most recently as a no-op callback default that skipped an entire validation path. The reducer now rejects a kind outside the balance set.

A third, cosmetic item was fixed: the task list said `INASSIGNMENT` where the predicate and test correctly use `UNASSIGNMENT`.

## Evidence

- `npm test` with the documented database: **235 passed, 0 failed, 0 skipped** (232 before this change; +3 tests).
- `npm test` without the database: 216 tests, 182 passed, 34 skipped.
- `npm run test:web`: 60 passed.
- `npm run typecheck:web`: clean. `npm run build:web`: compiled. `npm run test:e2e`: **15 passed**, with `apps/web/.next` cleared first.
- `npx openspec validate --all --strict`: 11 passed, 0 failed.
- Measured scope: about 60 lines of production change plus the tests, far under the 400-line budget.

## The mutation evidence, which is the point of the change

Removing `RECONCILIATION_ADJUSTMENT` from `BALANCE_EVENT_KINDS` made three tests fail, one of them a real balance assertion:

```
not ok - one balance predicate is the single source for every projection
not ok - the lock predicate is separate from the balance predicate by exactly the reconciliation adjustment
not ok - InMemoryBudgetStore: confirmedAdjustmentMovesOnlyAccountBalancesAndNeverEntersReports
```

The omission that previously required an independent verifier to surface now breaks three tests. The mutation was restored immediately and the constant verified intact.

## Deviation recorded: implementation preceded the tests

The refactor was implemented before the tests were written, which is not strict TDD. The RED that could be produced this way is weaker than in the preceding units: with the constant absent the test file does not load at all, which proves the symbol was missing but not that the assertions have teeth. That gap is why the mutation run above was performed instead, and why the verification was asked to judge the tests on their merits rather than accept the author's account. It reported that the tests fail on addition, removal, or reordering of either constant, and that they do not by themselves prove all five call sites use the predicate — that is established by source inspection.

## Verification

Independent read-only verification returned **PASS-WITH-CAVEATS**, confirming that all five broad-event production projections consume one predicate, that the lock predicate is structurally separate, that the kind set and its order are unchanged from the committed state, and that no requirement, schema, or migration was touched. Its caveats are the two corrections above plus an unrelated `package.json` change belonging to another session.
