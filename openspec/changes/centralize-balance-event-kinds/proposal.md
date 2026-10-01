# Proposal: Centralize the Balance Event-Kind Predicate

**Draft for owner review.** This change alters no requirement, so it declares `skip_specs: true`: it is an internal refactor with no behaviour change.

## Why

The set of event kinds that contribute to an account balance is written as a literal array in **five** separate places:

| Site | Role |
| --- | --- |
| `apps/api/src/app.ts:625` | `projectAccounts`, the in-command account projection |
| `apps/api/src/persistence/budget-store.ts:47` | `PrismaBudgetStore.read`, the durable public budget projection |
| `apps/api/src/persistence/financial-store.ts:185` | `FinancialStore.readState`, the durable event-state projection |
| `apps/api/src/persistence/in-memory-budget-store.ts:32` | `InMemoryBudgetStore.clone` |
| `apps/api/src/reports/report-service.ts:31` | `ReportService.read`, the summary's account projection |

The type union and the reducer's sign logic live separately in `apps/api/src/planning/engine.ts:4` and `:44-45`.

This duplication is not theoretical. During the cleared-state phase the new `RECONCILIATION_ADJUSTMENT` kind was added to the reducer and to two of the five sites, and **omitted from the other two**. The consequences were real and were caught only by independent verification: `PrismaBudgetStore.read` made the public budget response ignore the reconciliation correction, so it reported `[1120, 1200]` where the account actually held `[1137, 1217]`; and `ReportService.read` made the monthly summary's account balances disagree with the account's real balance and with `accountBalanceMinor`.

That phase had **eight** correction rounds and the dominant class was exactly this: a rule stated in one place and applied in only some of the places it governs. Six of the eight were coverage defects of that shape. Enumerating the sites by hand each time is the current mitigation, and it has already failed twice.

Adding a new kind is a normal, expected act: the remaining roadmap adds credit-card and overspending kinds. Without a single source, the next one will be omitted somewhere again.

## What Changes

1. `apps/api/src/planning/engine.ts` exports the balance kind set as **one** constant, and derives the event type from it, so the type and the runtime set cannot disagree.
2. The five balance-projection sites use that constant instead of their own literal array.
3. No behavioural change: the predicate's membership is exactly the current five kinds, in every site it replaces.

## An important non-goal, stated because conflating it would be a bug

`apps/api/src/app.ts:207` also filters event kinds with the same four-kind literal, but it selects the items that a reconciliation LOCKS, which is a **different predicate with a different meaning**. A reconciliation adjustment is created already reconciled and must not be selected for re-locking. Folding it into the balance predicate would silently change behaviour.

This change therefore leaves that site on its own explicit list and adds a comment there recording why it is deliberately NOT the balance predicate. Recognising that two identical literals meant two different things is part of the deliverable.

## Impact

| Area | Files |
| --- | --- |
| Domain | `apps/api/src/planning/engine.ts` |
| Projections | `apps/api/src/app.ts`, `apps/api/src/persistence/budget-store.ts`, `apps/api/src/persistence/financial-store.ts`, `apps/api/src/persistence/in-memory-budget-store.ts`, `apps/api/src/reports/report-service.ts` |

## Risk

- **Silent behaviour change from an over-broad predicate.** The mitigation is that membership is asserted: a test pins the exported set and its order, and every site is exercised by the existing suites, which are green at 232 API tests, 60 web tests, and 15 browser tests. Any site that gained or lost a kind would move a balance, and the reconciliation and cleared-balance tests would catch it.
- **Type-level change.** Deriving the event type from the constant could ripple; the compiler is the check, via `npm run typecheck:web` and the API suite.
