# Implementation Tasks: Centralize the Balance Event-Kind Predicate

Execution status: Owner authorized starting this change on 2026-10-01. Design approved in the same decision. It alters no requirement and declares `skip_specs: true`. No commit or push is requested by these tasks beyond the change's own work-unit commit.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 60-120 authored lines across one domain module, five projections, and focused tests |
| 400-line budget risk | Low |
| Chained PRs recommended | No; one slice |
| Suggested split | Single work unit |
| Delivery strategy | ask-on-risk |
| Chain strategy | One review slice; pause for re-scoping if it exceeds 400 |

## Preconditions and hard gates

- **No behaviour change.** The predicate's membership is exactly the five kinds already in use, and its order is preserved. Any balance that moves is a defect, not an improvement.
- **The constant is the single source.** The event type is derived from it, so the type and the runtime set cannot disagree.
- **`apps/api/src/app.ts:207` MUST NOT use the balance predicate.** It selects lock candidates, which is a different question, and a reconciliation adjustment is created already reconciled and must not become lockable. It keeps its own list plus a comment recording why.
- **No site may keep its own literal kind list** once this change lands, apart from the lock-candidate site.
- Do NOT duplicate the predicate anywhere.
- Do NOT change the reducer's sign logic in `engine.ts`.
- Do NOT change any requirement, schema, or migration.

## Work unit 1 — One predicate, five projections

**Boundary:** `apps/api/src/planning/engine.ts`, `apps/api/src/app.ts`, `apps/api/src/persistence/budget-store.ts`, `apps/api/src/persistence/financial-store.ts`, `apps/api/src/persistence/in-memory-budget-store.ts`, `apps/api/src/reports/report-service.ts`, and focused tests. Roll back by reverting the six files; there is no data or schema change.

1. [x] **RED:** Add failing tests that pin the exported set exactly, including order, and that assert the predicate accepts each balance kind and rejects kinds which must not contribute — `ASSIGNMENT`, `UNASSIGNMENT`, `MOVE`, `INCOME_RELEASE`, `TRANSACTION_DELETE`, the long-form `RECONCILIATION_ADJUSTMENT`-adjacent strings, and arbitrary text. Add a test asserting a reconciliation adjustment is NOT a lock candidate, so the distinction between the two predicates is pinned rather than assumed. Add a third test asserting the reducer REJECTS a kind outside the balance set rather than silently absorbing it as a debit. <!-- sdd-owner: implementation -->
2. [x] **GREEN:** Export the constant, derive the type from it, add the predicate in `engine.ts`, and replace the literal in all five balance projections while leaving the lock-candidate site alone with its explanatory comment. <!-- sdd-owner: implementation -->
3. [x] **TRIANGULATE:** Strengthen the coverage by asserting a concrete reconciliation balance through the public budget response and the summary, and by asserting the cleared and working balances through both adapters, so a site that gained or lost a kind would move a number. <!-- sdd-owner: implementation -->
4. [x] **REFACTOR:** Confirm no balance-projection site retains a literal kind list, and that the lock-candidate site is the only remaining one and is commented. Run `npm test` without and with the documented database URL and record each exact result. <!-- sdd-owner: implementation -->

## Parent-owned post-apply gates

- [x] Parent review of the work unit: changed scope, test evidence, changed-line estimate against the 400-line budget, and rollback boundary. <!-- sdd-owner: parent -->
- [x] Confirm exactly one definition of the balance predicate exists under `apps/api/src`, and that all five projections consume it. <!-- sdd-owner: parent -->
- [x] Confirm no balance changed: the reconciliation assertions still report the same concrete numbers, and the cleared and working balances are unchanged through both adapters. <!-- sdd-owner: parent -->
- [x] Confirm the lock-candidate predicate was deliberately NOT unified, that a reconciliation adjustment cannot become a lock candidate, and that the reason is recorded in code. <!-- sdd-owner: parent -->
- [x] Confirm runtime evidence at closure: `npm test` against the documented database with zero skips, `npm run test:web`, `npm run typecheck:web`, `npm run build:web`, and `npm run test:e2e` with `apps/web/.next` cleared first. <!-- sdd-owner: parent -->
- [x] Confirm `openspec validate --all --strict` still reports ten passed and zero failed. <!-- sdd-owner: parent -->
