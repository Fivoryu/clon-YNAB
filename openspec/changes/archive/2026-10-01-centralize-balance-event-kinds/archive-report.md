# Archive Report: Centralize the Balance Event-Kind Predicate

- Status: ARCHIVED
- Change: `centralize-balance-event-kinds`
- Archived as: `2026-10-01-centralize-balance-event-kinds`
- Task status at archive: complete, including all six parent gates.
- Canonical specs updated: none. The change declares `skip_specs: true` because it alters no requirement.

## Why

The set of event kinds contributing to an account balance was written as a literal array in five places, and the `RECONCILIATION_ADJUSTMENT` kind added by the preceding phase reached two of them and missed two others. Independent verification found both omissions: the public budget response ignored the reconciliation correction (`[1120, 1200]` where the account held `[1137, 1217]`) and the monthly summary's account balances disagreed with the account's real balance.

That phase had eight correction rounds and the dominant class was a rule stated once and applied in only some of the places it governs. Six of the eight were that shape. Since the remaining roadmap adds credit-card and overspending kinds, the duplication was guaranteed to fail again.

## Delivered

| Commit | Content |
| --- | --- |
| `2b96409` | One balance predicate in `engine.ts` consumed by all five balance projections, a structurally separate lock predicate, and a reducer that rejects a kind outside the balance set instead of silently debiting it. |

- `BALANCE_EVENT_KINDS` / `isBalanceEvent`, with `BalanceEventKind` derived from the constant so the type and the runtime set cannot disagree.
- `LOCKABLE_EVENT_KINDS` / `isLockableEvent`, a separate predicate for which items a reconciliation may lock. The same four-kind literal sat at that site, but it answered a different question, and unifying them would have been an invisible behaviour change: a reconciliation adjustment is created already reconciled and is excluded by the `!reconciled` condition regardless.
- The five projections — `projectAccounts`, `PrismaBudgetStore.read`, `FinancialStore.readState`, `InMemoryBudgetStore.clone`, and `ReportService.read` — consume the shared predicate.
- Three type assertions that restated the balance union now cast to the derived type.
- The reducer rejects a kind outside the balance set. Previously any unrecognised kind was debited, which is the same silent-fallback pattern that had already caused two defects in this repository.

## Verification

Independent read-only verification returned **PASS-WITH-CAVEATS**. It enumerated every balance-projection site and confirmed all five broad-event projections consume one predicate, that the reducer holds no competing allowlist, that the lock predicate is separate and enforced by structure rather than prose, that the kind set and order are unchanged from the committed state, and that no requirement, schema, or migration was touched. It judged that the new tests fail on addition, removal, or reordering of either constant, while noting that they do not by themselves prove all five call sites consume the predicate — that rests on source inspection.

Its caveats became the two corrections recorded above, plus an unrelated `package.json` change belonging to another session, which was excluded from this commit and remains uncommitted in the working tree.

Evidence at closure: `npm test` **235 passed, 0 failed, 0 skipped** with the database (232 before), 216 with 182 passed and 34 skipped without it, `npm run test:web` 60 passed, `npm run typecheck:web` clean, `npm run build:web` compiled, `npm run test:e2e` **15 passed** with `apps/web/.next` cleared first, and `openspec validate --all --strict` 11 passed and 0 failed. Measured scope was roughly 60 lines of production change plus tests, far under the 400-line budget.

## The evidence that matters

Removing `RECONCILIATION_ADJUSTMENT` from the constant makes three tests fail, one of them a real balance assertion:

```
not ok - one balance predicate is the single source for every projection
not ok - the lock predicate is separate from the balance predicate by exactly the reconciliation adjustment
not ok - InMemoryBudgetStore: confirmedAdjustmentMovesOnlyAccountBalancesAndNeverEntersReports
```

The omission that previously needed an independent verifier to surface now breaks three tests. The mutation was restored immediately and the constant verified intact.

## Deviation recorded

The refactor was implemented before the tests were written, which is not strict TDD. The RED obtainable that way is weaker than in the preceding units, since with the constant absent the test file does not load at all. That is why the mutation run above was performed and why verification was asked to judge the tests on their merits rather than accept the author's account.

## Carried forward

The remaining duplication of this kind is none in the balance path. The next place a new kind must be placed deliberately is `LOCKABLE_EVENT_KINDS`, and the two constants are now adjacent in `engine.ts` with the distinction recorded at both the declaration and the call site, so a future kind cannot land in one and be forgotten in the other without the difference being visible.
