# Implementation Tasks: Category Targets

Execution status: Proposal approved 2026-09-29 and specs validated. The owner authorized WU1 implementation for tasks 1–4 only; the report endpoints and both report policies are frozen and MUST NOT change.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 750-1,010 authored additions across schema, migration, API, web, tests, and the authorized scope-document update |
| 400-line budget risk | High |
| Chained PRs recommended | Yes, four slices |
| Suggested split | WU1 (definition, persistence, commands) then WU2 (derivation and summary projection) then WU3a (presentation, target management, confirmation, browser coverage) then WU3b (archived target readability and product documents) |
| Delivery strategy | ask-on-risk; no commit or push requested by these tasks |
| Chain strategy | Four review slices; each must be re-estimated and must pause for re-scoping if it exceeds 400 |

### Re-scope recorded during apply

The original plan had three slices with a single Work Unit 3 estimated at 300-400 lines. Before writing any code, that unit was measured at 410-500 lines and the owner chose to split it rather than proceed above the budget. Two facts drove the overage: the browser coverage is mandatory rather than optional, and the Budget view currently lists only active categories, so making an archived category's target readable requires a surface that did not previously exist. Work Unit 1 measured 368 changed lines against a 250-330 forecast and Work Unit 2 measured 257 against a 200-280 forecast; both are recorded rather than restated.

The estimate is high because this phase introduces persisted state and a migration, where the last phase had neither, and because browser coverage is a requirement. The last three phases each had at least one slice exceed its forecast, so these ranges are deliberately wide and no slice may absorb another.

## Preconditions and hard gates

- **The financial invariant is absolute.** Creating, replacing, or removing a target MUST NOT change Ready to Assign, Assigned, Activity, Available, any account balance, or any financial event. Only the existing assignment command moves money, and only after an explicit confirmation.
- **A `MONTHLY_SET_ASIDE` target MUST be measured on the month's assigned amount and MUST NOT include carried-over money.** A `BALANCE_BY_DATE` target MUST be measured on the month's available amount.
- **Targets MUST NOT appear in the single-month report or the multi-month series**, and `report-policy/v1` and `report-policy/v2` MUST NOT change. No target value may be summed into any reported total.
- **No target history.** The current definition is what is evaluated, so a target shown for a past month MUST be accompanied by the disclosure that no target history is retained.
- Do NOT modify the assignment commands, their semantics, the category lifecycle, or the financial engine's calculations.
- Do NOT provide any automatic assignment, snooze, weekly or annual rhythm, refill behaviour, or multiple targets per category.

## Work unit 1 — Definition, persistence, and commands

**Boundary:** `apps/api/prisma/schema.prisma` plus a new migration, `apps/api/src/persistence/financial-store.ts` for loading and the additive write capability, `apps/api/src/app.ts`, `apps/api/src/server.ts`, `apps/api/openapi.yaml`, and focused API tests. Keep the schema, the commands, and their tests together. Roll back by reverting the code and leaving the table inert.

1. [x] **RED:** Add failing tests for setting, replacing, and removing a target; for every validation rejection (unknown category, category from another budget, unsupported kind, non-positive or unsafe amount, malformed target month, target month on the set-aside kind, missing target month on the dated kind, archived category); for removing a target that does not exist; for idempotent replay; and for the reported version changing when a target changes. <!-- sdd-owner: implementation -->
2. [x] **GREEN:** Add the `CategoryTarget` model and the kind enum, create migration `0007_category_targets`, load targets in `FinancialState` inside the existing single transaction, add the additive `persistTarget` capability following the `persistAccounts` precedent, implement the commands and their routes, and document them in OpenAPI. <!-- sdd-owner: implementation -->
3. [x] **TRIANGULATE:** Strengthen the tests for a target month equal to and one month either side of the requested month, a single category holding a target across several months, an archived category that keeps its target readable while rejecting changes, a target write that leaves event and receipt counts otherwise unchanged except for its own receipt, and a PostgreSQL-gated test exercising the real persistence path. <!-- sdd-owner: implementation -->
4. [x] **REFACTOR:** Refine validation and the write path without changing the contract; run `npm test` without and with the documented database URL, run `npm run db:validate`, and record each exact result. <!-- sdd-owner: implementation -->

## Work unit 2 — Derivation and summary projection

**Depends on:** Work unit 1's persisted definition and loaded targets. **Boundary:** new `apps/api/src/planning/targets.ts`, `apps/api/src/reports/report-service.ts`, and focused tests. Roll back by reverting the module and the projection wiring; no schema change.

5. [x] **RED:** Add failing unit tests for the pure derivation: both kinds; the met boundary at exactly the amount; the overdue boundary and its non-application to the set-aside kind; a set-aside with a positive carry and nothing assigned in the month NOT met; the remaining gap never negative; and a dated target whose month equals the requested month not overdue. Add failing projection tests proving the summary carries target state for targeted categories only, and that neither report response contains any target field. <!-- sdd-owner: implementation -->
6. [x] **GREEN:** Implement the pure derivation and attach it per category in the summary projection only. Do not touch the report projection modules. <!-- sdd-owner: implementation -->
7. [x] **TRIANGULATE:** Strengthen the tests to prove the invariant end to end: RTA, Assigned, Activity, Available, balance values, and event counts are identical before and after setting and after removing a target; no assignment exists without a confirmation; and a category without a target reports no target state in any month. <!-- sdd-owner: implementation -->
8. [x] **REFACTOR:** Refine the derivation and projection without changing semantics; run `npm test` without and with the documented database URL and record each exact result. <!-- sdd-owner: implementation -->

## Work unit 3a — Target presentation, management, and confirmation

**Depends on:** Work unit 2's summary projection. **Boundary:** `apps/web/app/budget/page.tsx`, `apps/web/app/models.ts`, `apps/web/app/hooks/useBudgetApp.ts`, `apps/web/app/globals.css`, and tests under `apps/web/test/` and `apps/web/e2e/`. Roll back the web changes together; the API and the derivation are unaffected.

9. [x] **RED:** Add failing web tests for a targeted category presenting its kind, amount, target month where applicable, progress, remaining gap, and status in category context; setting, replacing, and removing a target from that context, sending exactly the fields the chosen kind requires and never a target month for the set-aside kind; a suggestion offered only for an active category with a positive gap; the confirmation invoking the existing assignment command; no target state for a category without a target; the past-month disclosure; and the absence of implementation terminology. Add real browser coverage for the same flows, including a confirmation that refreshes the displayed values. <!-- sdd-owner: implementation -->
10. [x] **GREEN:** Implement the presentation, target management, the suggestion, and the confirmation, plus the Spanish copy and the past-month disclosure. Route the confirmation through the existing assignment command with a fresh idempotency key and the current version, and keep the suggestion visibly distinct from Ready to Assign. <!-- sdd-owner: implementation -->
11. [x] **TRIANGULATE:** Strengthen the browser coverage for a met target, an overdue dated target, a negative Ready to Assign alongside a suggestion, keyboard operation of the confirmation, replacing and removing a target, and compact-layout rendering. <!-- sdd-owner: implementation -->
12. [x] **REFACTOR:** Refine the presentation while keeping it tied to the contract; run `npm run test:web`, `npm run typecheck:web`, `npm run build:web`, and the browser suite, and record each exact result. <!-- sdd-owner: implementation -->

## Work unit 3b — Archived target readability and product documents

**Depends on:** Work unit 3a's presentation. **Boundary:** `apps/web/app/budget/page.tsx`, `apps/web/app/globals.css`, tests under `apps/web/test/` and `apps/web/e2e/`, and the authorized update to `docs/product/functional-requirements.md`, `docs/product/mvp-scope.md`, and `docs/product/actors-and-use-cases.md`. This unit exists because the Budget view currently lists only active categories, so an archived category's target is not reachable at all. Roll back this unit at the archived-disclosure boundary.

13. [x] **RED:** Add failing tests for an archived category keeping its target readable from the Budget view with no actionable suggestion, and for the product documents no longer describing targets as deferred. Add real browser coverage for the archived case. <!-- sdd-owner: implementation -->
14. [x] **GREEN:** Add the archived-category disclosure to the Budget view, rendering any target read-only and offering no assignment action, and update the three product-scope documents to stop deferring targets and to record the questions this phase resolved. <!-- sdd-owner: implementation -->
15. [x] **TRIANGULATE:** Strengthen the coverage for an archived category with no target, an archived category whose target is met, reopening the disclosure by keyboard, and the document statements that previously deferred targets. <!-- sdd-owner: implementation -->
16. [x] **REFACTOR:** Refine the archived disclosure and the documents; run `npm run test:web`, `npm run typecheck:web`, `npm run build:web`, and the browser suite, and record each exact result. <!-- sdd-owner: implementation -->

## Parent-owned post-apply gates

- [x] Parent review of each completed work unit: changed scope, test evidence, changed-line estimate against the 400-line budget, and rollback boundary. Work Unit 1 measured 368 changed lines against a 250-330 forecast. Work Unit 2 measured 257 against a 200-280 forecast and was independently verified with no candidate-caused blocker. Work Unit 3 was re-scoped by the owner from one unit estimated at 410-500 lines into 3a (312 lines) and 3b, rather than proceeding above budget. Every unit was independently verified read-only except 3b, which the parent implemented inline after the `gentle-ai-worker` subagent stalled and reported an error without writing; that deviation is recorded in `apply-progress.md`. <!-- sdd-owner: parent -->
- [x] Confirm the financial invariant with observed evidence: no RTA, Assigned, Activity, Available, balance, or event-count change across setting and removing a target, and no assignment without confirmation. Confirmed: the API and PostgreSQL suites compare complete before/after summaries and event counts across set, replace, and remove, and the browser suite observes that no assignment request is issued before the confirmation and exactly one after it. <!-- sdd-owner: parent -->
- [x] Confirm a monthly set-aside is never reported as met on the strength of carried-over money. Confirmed by the pure derivation tests: a set-aside whose progress comes only from carried-over money with nothing assigned in the month reports zero progress and is not met. <!-- sdd-owner: parent -->
- [x] Confirm neither report response contains any target field and that both report policies are unchanged. Confirmed: an HTTP test sets a target and recursively checks both report responses for any target field, and a read-only diff shows `monthly-report.ts`, `multi-month-report.ts`, and both policy identifiers unchanged. <!-- sdd-owner: parent -->
- [x] Confirm the canonical reporting exclusion was modified rather than contradicted, and that the product-scope documents no longer describe targets as deferred. Confirmed: the change's reporting delta MODIFIES the exclusion requirement, preserving its canonical scenario, and archiving applies that modification to the canonical spec. The three product-scope documents were updated so targets read as delivered, with what remains open still reading as open. <!-- sdd-owner: parent -->
