# Design: Centralize the Balance Event-Kind Predicate

**Draft for owner review.** No requirement changes, so there is no spec delta.

## Context

The cleared-state phase added `RECONCILIATION_ADJUSTMENT` to two of five balance-projection sites and omitted it from two others. Independent verification caught both omissions, and the visible effects were a public budget response that ignored the correction and a summary whose account balances disagreed with the account's real balance.

The rule is not wrong anywhere. It is stated in five places and was updated in three. The defect class is **application coverage**, and this design addresses the cause rather than the instance.

## The rule this change establishes

> There is exactly ONE definition of which event kinds contribute to an account balance. Every balance projection consumes it. A literal kind list in a projection is a defect.

## The shape

In `apps/api/src/planning/engine.ts`:

```ts
export const BALANCE_EVENT_KINDS = ['INCOME', 'SPENDING', 'TRANSFER_OUT', 'TRANSFER_IN', 'RECONCILIATION_ADJUSTMENT'] as const;
export type BalanceEventKind = (typeof BALANCE_EVENT_KINDS)[number];
export const isBalanceEvent = (kind: string): kind is BalanceEventKind =>
  (BALANCE_EVENT_KINDS as readonly string[]).includes(kind);
```

The constant is the single source: the type is derived from it, so a kind cannot exist in the type and be absent from the runtime set, or the reverse. `AccountBalanceEvent['kind']` becomes `BalanceEventKind`.

## Sites and their fix

| Site | Change |
| --- | --- |
| `app.ts:625` `projectAccounts` | Replace the literal with `isBalanceEvent(event.kind)` |
| `budget-store.ts:47` `PrismaBudgetStore.read` | Same |
| `financial-store.ts:185` `readState` | Same |
| `in-memory-budget-store.ts:32` `clone` | Same |
| `report-service.ts:31` `ReportService.read` | Same |

The `.filter(...).map(...)` shape stays; only the predicate is replaced. The `map` still extracts `accountId`, the kind, `amountMinor`, and `cleared`, because those are what the reducer needs.

## The site that must NOT change, and why it is the interesting part

`apps/api/src/app.ts:207` filters event kinds with the identical four-kind literal, but it answers a different question: **which items does a reconciliation lock?** Its predicate is "effective statement items that are cleared and not yet reconciled".

A `RECONCILIATION_ADJUSTMENT` is created already `reconciled: true`, so it is not a lock candidate and must not become one. Replacing that literal with `isBalanceEvent` would make the adjustment lockable, which is a behaviour change disguised as a refactor — and it would be invisible, because the adjustment is already reconciled and the lock loop would then select nothing extra in the current flow. That is exactly the kind of latent change this whole change exists to prevent.

So that site keeps its own explicit list and gains a comment stating that it is deliberately not the balance predicate. The distinction is recorded in code, not only in this document, because the next reader will see two similar literals and needs to know they mean different things.

## Verification strategy

| Layer | What it proves |
| --- | --- |
| Membership | A test pins `BALANCE_EVENT_KINDS` exactly, including order, so adding or removing a kind is a deliberate, visible act |
| Predicate | A test asserts `isBalanceEvent` accepts each of the five and rejects kinds that must not contribute, such as `ASSIGNMENT`, `INCOME_RELEASE`, `TRANSFER_OUT`-adjacent non-balance kinds, and arbitrary strings |
| Every site | The existing suites exercise all five projections: the reconciliation tests cover the public budget response and the summary, B's tests cover the durable projections folding, and the web and browser suites cover the account surface. Green suites here are a real signal because the projection sites all have real-adapter tests |
| No silent widening | A test asserts the reconciliation adjustment is NOT a lock candidate, so the distinction at `app.ts:207` is pinned rather than assumed |

## Risks

1. **An over-broad predicate could widen a projection silently.** Mitigated by pinning the constant and by the reconciliation tests, which assert concrete balances (`1137`/`1217`) that would move if a site gained a kind.
2. **Deriving the type from the constant can ripple into type errors.** That is the desired failure mode: the compiler reports it rather than a balance moving at runtime.
3. **A kind that contributes to a balance but must NOT be lockable, or the reverse, is a real future possibility.** This design does not attempt to model that relationship; it names the two predicates separately so that a future kind must be placed in each deliberately.
