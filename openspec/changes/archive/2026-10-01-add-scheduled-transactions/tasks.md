# Implementation Tasks: Scheduled Transactions

Execution status: Proposal approved 2026-10-01 (scope, the two canonical modifications, and the product-document update). Work Unit 1 is implemented and was independently verified read-only over four rounds; it is NOT committed. Work Unit 1 measured ~716 changed lines against the 400-line budget, so implementation paused at this boundary for the owner's re-scoping decision.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 1,250-1,650 authored additions across schema, migration, both adapters, API, web, tests, and the authorized scope-document update |
| 400-line budget risk | High |
| Chained PRs recommended | Yes, five slices |
| Suggested split | WU1 (schema, migration, both adapters, pure derivation) then WU2 (commands, routes, OpenAPI) then WU3 (generation, occurrence identity, cleared coverage) then WU4 (account-scoped web surface and browser coverage) then WU5 (product documents) |
| Delivery strategy | ask-on-risk; no commit or push requested by these tasks |
| Chain strategy | Five review slices; each must be re-measured during apply and MUST pause for the owner's re-scoping if it exceeds 400 changed lines |

The estimate is high because the phase introduces persisted state, a migration, an explicit generation command, and mandatory browser coverage. The previous three phases each had at least one slice exceed its forecast, so these ranges are deliberately wide and no slice may absorb another.

## Preconditions and hard gates

- **"No effect before occurrence" is absolute.** Creating, listing, or removing a schedule MUST NOT change Ready to Assign, Assigned, Activity, Available, any account balance, or any financial event. Only an explicit generation request creates a transaction.
- **No second authority for "has this occurrence happened".** The record of a generated occurrence is the ordinary command's own receipt. No generation cursor, no occurrence table, and no "last generated" column may be added.
- **`cleared` is explicit at every creation call site.** A generated transaction into a `CASH` account is cleared; every other generated transaction is uncleared. The public `recordIncome` and `recordSpending` routes keep creating uncleared transactions and MUST pass that value explicitly rather than inheriting a default.
- **Both persistence adapters or neither.** Every read, every write, and every invariant introduced here MUST exist in `FinancialStore` and in `InMemoryBudgetStore`, with a test per adapter. The dominant defect class of the previous phase was a rule applied at one site and missed at its sibling.
- **No schedule reaches a projection or a report.** No projection module and no report module may read schedule state. An HTTP test MUST assert that the summary and both report responses contain no schedule field.
- **Canonical scenario names are preserved verbatim** in both modified requirements: *A deferred concept is requested* and *Unsupported history capability remains unavailable*.
- Do NOT change `report-policy/v1`, `report-policy/v2`, the report projection modules, the financial engine's formulas, the transfer model, or the cleared-state invariant.
- Do NOT add a background job, worker, queue, cron, scheduler, or automatic posting.
- Do NOT implement editing an existing schedule, weekly/annual/custom recurrence, multiple accounts or categories per schedule, or multi-timezone occurrence dates.

## Work unit 1 — Schema, migration, both adapters, and the pure derivation

**Boundary:** `apps/api/prisma/schema.prisma` plus new migration `0011_scheduled_transactions/`, `apps/api/src/persistence/financial-store.ts`, `apps/api/src/persistence/in-memory-budget-store.ts`, new `apps/api/src/planning/schedules.ts`, and focused tests. Keep the schema, its load path, and the pure derivation together. Roll back by reverting the code and leaving the table inert.

1. [x] **RED:** Add failing tests for occurrence derivation: the first occurrence equals `startDate`; consecutive occurrences are `intervalMonths` apart; a `dayOfMonth` beyond the month's length clamps to that month's last day; the clamp does not move the declared day for later months; February in a non-leap year clamps to the 28th; a cut-off exactly on an occurrence includes it; a cut-off before the first occurrence yields none; an interval of 1 and of 12 are accepted and 0 and 13 rejected; `dayOfMonth` 0 and 32 rejected. Add failing per-adapter tests that a schedule persists, reloads, and is removed in **both** `FinancialStore` and `InMemoryBudgetStore`. <!-- sdd-owner: implementation -->
2. [x] **GREEN:** Add the `ScheduledFlow` enum and the `ScheduledTransaction` model, create migration `0011_scheduled_transactions`, load schedules into `FinancialState` inside the existing single transaction in both adapters, add the additive write and delete capability following the `persistTarget` precedent, and implement the pure derivation module. <!-- sdd-owner: implementation -->
3. [x] **TRIANGULATE:** Strengthen the tests for a schedule whose start date is itself the end of a short month, a single schedule observed across a year boundary, a schedule removed while another remains, a load that leaves event, receipt, and account counts unchanged, and a PostgreSQL-gated test exercising the real persistence path. <!-- sdd-owner: implementation -->
4. [x] **REFACTOR:** Refine the derivation and the load path without changing the contract; run `npm test` without and with the documented database URL, run `npm run db:validate` and `npm run db:status`, and record each exact result. <!-- sdd-owner: implementation -->

### Work Unit 1 outcome and evidence

Measured size: **~716 changed lines** (710 additions, 6 removals) against a 400-line budget — over budget, so the phase paused here for the owner's re-scoping decision. Authored additions: `schema.prisma` 29, `financial-store.ts` 47, `in-memory-budget-store.ts` 23, `transaction-history-prisma.test.ts` 17, `schedules.ts` 97 (new), `schedule-derivation.test.ts` 130 (new), `schedule-persistence.test.ts` 328 (new), migration `0011_scheduled_transactions` 31 (new), migration `0012_schedule_anchor_invariant` 8 (new).

Observed results: `npm test` with the database **256 passed, 0 failed, 0 skipped**; without it **202 passed, 0 failed, 35 skipped**; `npm run db:status` reports 12 migrations and the schema up to date; the filtered strict-type check for the touched files prints nothing.

Migration discipline: `0011` was applied to the local database during this Work Unit and was therefore NOT edited afterwards: the anchor-day CHECK constraint went into the additive `0012_schedule_anchor_invariant`. Verified independently — the `_prisma_migrations` checksum recorded for `0011` matches the SHA-256 of the file on disk, so `0011` is byte-for-byte unchanged since it was applied.

Four independent verification rounds returned FAIL and every gap was closed: (1) a `tx.scheduledTransaction ? ... : []` fallback in `readState` weakened the production read path to tolerate a test double — the fallback was removed, the double was fixed, and a regression test now asserts that a client without the delegate THROWS; (2) `startDate` and `dayOfMonth` were two authorities for the same fact — the invariant `day(startDate) = min(dayOfMonth, daysInMonth(startDate))` now holds in the validator and one recurrence rule serves every occurrence; (3) the durable adapter did not validate where the in-memory adapter did — `persistSchedule` now validates before its upsert; (4) `saveBudget` could silently erase schedules — it now fails closed when the collection is omitted while schedules exist; (5) the financial-neutrality assertion compared empty collections — the fixture now seeds a target, a transfer, and a reconciliation and asserts their retention.

Two verification findings were rejected as reasoned false positives and are recorded in `design.md` section 11: rejecting an explicit `schedules: []` would break deleting the last schedule, and the in-memory `?? []` defaults are type-level necessities rather than failure masks.

## Work unit 2 — Schedule commands: create, list, remove

**Depends on:** Work unit 1's persisted model and load path. **Boundary:** `apps/api/src/app.ts`, `apps/api/src/server.ts`, `apps/api/openapi.yaml`, and focused API tests. Roll back the three together; no schema change.

5. [x] **RED:** Add failing tests for creating, listing, and removing a schedule; for every validation rejection (unknown account or category, an account or category from another budget, an archived account or category, a non-positive or unsafe amount, income carrying a category, spending without one, `dayOfMonth` outside 1-31, `intervalMonths` outside 1-12, a malformed start date); for removing a schedule that does not exist; for idempotent replay and incompatible-key `CONFLICT`; for non-disclosing behaviour on a foreign budget, account, category, or schedule; and for the reported revision changing when a schedule changes. <!-- sdd-owner: implementation -->
6. [x] **GREEN:** Implement the three commands and their routes, validate on the server, keep them owner-scoped and budget-scoped, and document them in the OpenAPI contract. <!-- sdd-owner: implementation -->
7. [x] **TRIANGULATE:** Strengthen the coverage with a second schedule on the same account, a schedule on a different account of the same budget, an archived account that keeps an existing schedule readable while rejecting a new one, and a test proving that create, list, and remove leave RTA, Assigned, Activity, Available, balances, and event counts identical. <!-- sdd-owner: implementation -->
8. [x] **REFACTOR:** Refine validation and the route layer without changing the contract; run `npm test` without and with the documented database URL, `npm run db:validate`, and the OpenAPI test, and record each exact result. <!-- sdd-owner: implementation -->

### Work Unit 2 outcome and evidence

Measured size: **339 changed lines** against the 400-line budget. Observed results: `npm test` with the database **263 passed, 0 failed, 0 skipped**; without it **209 passed, 0 failed, 35 skipped**; `npm run db:validate` valid; `npx openspec validate add-scheduled-transactions --strict` valid.

Surfaces: `app.ts` (create, list, remove, validation, ownership), `server.ts` (GET/POST on the collection, DELETE on an item), `openapi.yaml`, and the two test files.

The list command reads through the schedule-aware financial path (`this.financialStore.load`), not `PrismaBudgetStore`, as design.md section 11.3 requires.

A scope correction was needed during apply, and it was the parent's error rather than the writer's: the delegation prompt asked for "create or replace", while the approved specification permits only create, list and remove and forbids editing an existing schedule. The replace method, its HTTP route, and its OpenAPI operation were removed, and the create command now mints the identity server-side and rejects a client-supplied identity with `VALIDATION_ERROR`, so create cannot be used to mutate a schedule in place. This is recorded in design.md section 10.

Independent verification returned FAIL and two real test-oracle gaps were closed: the projection-leak assertions only observed the dashboard and reports AFTER removing the schedule, so they never tested the state that matters (they now assert against a live future-dated schedule as well), and four assertions could pass for the wrong reason (PUT/PATCH asserted only a status code, the non-disclosure cases asserted only an error code, and an OpenAPI regex spanned two schemas).

Two verification findings were rejected as reasoned false positives. First, "list is not the only reader of the schedule collection": create and remove also read it and persistence loads it, but the claim was that list is the only read-only public listing operation. Second, "an idempotent replay reports the original result version rather than the current one": returning the saved outcome, including its version, is the repository-wide idempotency contract and this specification requires an identical replay to return its saved outcome; only a genuinely new mutation advances the revision.

## Work unit 3 — Explicit generation, occurrence identity, and cleared coverage

**Depends on:** Work units 1 and 2. **Boundary:** `apps/api/src/app.ts`, `apps/api/src/planning/schedules.ts`, `apps/api/src/persistence/financial-store.ts` if the `cleared` parameter needs a signature change, `apps/api/openapi.yaml`, and focused tests. Roll back generation without touching already generated history.

9. [x] **RED:** Add failing tests for: one eligible occurrence producing exactly one ordinary posted transaction with the schedule's fields; an occurrence after the cut-off not being generated; a cash account's generated transaction being cleared and every other account kind's being uncleared; a generated transaction contributing identically to an ordinary transaction in balances, summary and reports; the same range generated twice leaving transactions, effects, and receipt counts unchanged; an overlapping range not duplicating an existing occurrence; a retry after a partial failure creating exactly the missing occurrences; a concurrent attempt on one occurrence producing exactly one transaction; and the summary and both report responses containing no schedule field. Each of these MUST run against both persistence adapters. <!-- sdd-owner: implementation -->
10. [x] **GREEN:** Implement `occurrenceIdentity`, `generatedCleared`, and the generation command that submits the existing ordinary command per occurrence with the derived idempotency key and an explicit `cleared` value; make `cleared` an explicit parameter at every creation call site, including the two public routes; document the command in OpenAPI. <!-- sdd-owner: implementation -->
11. [x] **TRIANGULATE:** Strengthen the coverage with a multi-month backlog generated in one request, two schedules sharing a date, a schedule whose account holds a reconciled transaction, an occurrence falling on a month boundary, and an assertion that no generation cursor or occurrence table was introduced. <!-- sdd-owner: implementation -->
12. [x] **REFACTOR:** Refine generation and the cleared plumbing without changing semantics; run `npm test` without and with the documented database URL, `npm run db:validate`, and the OpenAPI test, and record each exact result. <!-- sdd-owner: implementation -->

### Work Unit 3 outcome and evidence

Measured size: **268 changed lines** against the 400-line budget (118 in tracked files, 150 in the new test file). Observed results: `npm test` with the database **316 passed, 0 failed, 0 skipped**; without it 243 passed, 0 failed, 35 skipped; `npm run db:validate` valid; `npx openspec validate add-scheduled-transactions --strict` valid; `schedules.ts` and the new test file are clean under the strict type check.

The generation command is `POST /api/v1/budgets/{budgetId}/schedules/generate`, matched BEFORE the `schedules/{id}` item route so a request cannot be mistaken for an operation on a schedule whose identity is `generate`. Each occurrence is submitted through the existing ordinary transaction command with `Idempotency-Key = occurrenceIdentity(scheduleId, occurrenceDate)`, so the per-occurrence receipt is the only authority for whether an occurrence happened. No cursor, counter, timestamp or occurrence table was added, and no migration was needed for this unit; a test asserts the scheduled-transaction model's field set EXACTLY and proves its own discriminating power by injecting a marker field into a copy of the schema and requiring the comparison to fail.

Independent verification returned FAIL on a serious defect, and it was fixed: the generation call site computed the cleared value as `generatedCleared(account.kind ?? 'CASH')`, so a missing account kind would have silently produced a CLEARED transaction — the opposite of the specification's conservative default. `generatedCleared` now accepts `string | undefined` and returns true only for exactly `'CASH'`, the fallback is gone, and a test asserts UNCLEARED for a missing kind and again for an unknown kind. The CSV import path, which created ordinary events without a `cleared` property and inherited the adapter default, now passes `false` explicitly.

Five test-oracle gaps were closed: test 2 now asserts the schedule was actually persisted before generating; test 11 asserts exactly one transaction AND the concrete per-occurrence outcomes `['created','replay']` with both requests fulfilled, instead of accepting any of several results; test 14's schedule-marker detection was broadened beyond a property named exactly `schedules` to `schedule`, `scheduledTransaction`, `scheduleId` and `isScheduled`; test 16 pins both directions of the route ordering, asserting that `DELETE` on the generate path does not generate; and the OpenAPI assertions are now newline-bounded and assert field requirements, date format and `additionalProperties: false` rather than mere presence.

A focused re-verification of all four corrections returned PASS. One acknowledged limit remains: a pre-existing edit path that revises a legacy event carrying no `cleared` value still lets the durable adapter supply `false`. That is an edit of existing history, not a creation site, and the conservative value is the correct default there.

## Work unit 4 — Account-scoped web surface and browser coverage

**Depends on:** Work unit 2's list and mutation contract and Work unit 3's generation command. **Boundary:** `apps/web/app/accounts/[accountId]/page.tsx`, `apps/web/app/models.ts`, `apps/web/app/hooks/useBudgetApp.ts`, `apps/web/app/globals.css`, and tests under `apps/web/test/` and `apps/web/e2e/`. Roll back the web changes together; the API is unaffected.

13. [x] **RED:** Add failing web tests for listing an account's schedules, creating one with exactly the fields its flow requires and never a category for income, removing one, and triggering generation; for the empty state; for the disclosed limit that a schedule cannot be edited and that an already generated occurrence is ordinary history; and for the absence of implementation terminology. Add real browser coverage for the same flows. <!-- sdd-owner: implementation -->
14. [x] **GREEN:** Implement the account-scoped schedule surface, its Spanish copy, the create and remove actions with fresh idempotency keys and the current version, the explicit generate control, and the disclosed limits. <!-- sdd-owner: implementation -->
15. [x] **TRIANGULATE:** Strengthen the browser coverage for a generated occurrence becoming visible in the account history after generation, a replay of the same generation leaving the history unchanged, compact-layout rendering, and keyboard operation of the create and remove flows. <!-- sdd-owner: implementation -->
16. [x] **REFACTOR:** Refine the presentation while keeping it tied to the contract; run `npm run test:web`, `npm run typecheck:web`, `npm run build:web`, and the browser suite, and record each exact result. <!-- sdd-owner: implementation -->

### Work Unit 4 outcome and evidence

Measured size: **344 changed lines** against the 400-line budget (159 in tracked files, 185 in the two new test files). Observed results: `npm run test:web` **67 passed, 0 failed**; `npm run typecheck:web` exited clean; `npm run build:web` completed; the browser suite **16 passed, 0 failed**, including the new schedule spec and every pre-existing spec.

The write delegation returned PARTIAL because it was not authorized to delete `apps/web/.next` or to write build and browser artifacts, so it did not run the build or the browser suite. Both were run afterwards and both passed. Its declared RED evidence covers the seven web contract assertions; no browser RED was observed, and the browser behaviour is now proven by a green run rather than by a red-then-green pair.

Two real defects were found only by running the work the delegation could not:

1. **The income create contract was violated.** `validateScheduleDefinition` requires an income schedule to carry `categoryId: null` explicitly; omitting the property is a validation error, because `categoryId !== null` is true for `undefined`. The documented contract agrees: `ScheduleInput` lists `categoryId` as required and nullable, with an explicit description. The client had typed income as `categoryId?: never` and omitted the property, so creating an income schedule against the real API would have been rejected. Income now carries `categoryId: null`, and the browser test asserts the exact request body. The web unit tests had passed while this was broken because that file asserts against source text with regular expressions rather than behaviour; the browser suite, which talks to the real API, is the oracle that catches it. A local re-implementation of the serialization was deliberately rejected as a fake oracle that would only duplicate the production expression.

2. **A regression in the archived-account surface.** The new disabled-state copy read `No puedes agregar movimientos periódicos a una cuenta archivada.`, whose substring `cuenta archivada` collided with the pre-existing `Cuenta archivada` banner under Playwright's case-insensitive substring matching, producing a strict-mode violation with two matches in a pre-existing test. The copy now reads `Esta cuenta está archivada: no se pueden agregar movimientos periódicos.`, which keeps the meaning and removes the collision. The existing test was not weakened to accommodate the new copy.

Both defects were isolated rather than guessed: stashing only `apps/web/app` made the archived-account test pass and confirmed the regression belonged to this unit, and the failure output identified the ambiguity as two resolved elements rather than a missing banner.

## Work unit 5 — Product documents

**Depends on:** the accepted behaviour of Work units 1-4. **Boundary:** `docs/product/functional-requirements.md`, `docs/product/mvp-scope.md`, `docs/product/actors-and-use-cases.md`, and `docs/architecture/domain-model.md`, plus any focused documentation test. This unit requires the owner's explicit authorization recorded in the proposal gate.

17. [x] **RED:** Add failing tests or checks that the documents no longer describe scheduled transactions as deferred, and that the four resolved questions are recorded as resolved while what remains open still reads as open. <!-- sdd-owner: implementation -->
18. [x] **GREEN:** Update the four documents: mark scheduled transactions delivered, record the resolved recurrence shape, generation timing and idempotency mechanism, posting model, and cash-account exception, and refresh the traceability and delivery-slice statements. <!-- sdd-owner: implementation -->
19. [x] **TRIANGULATE:** Strengthen the coverage for the statements that previously deferred scheduling, for the delivery slices, and for the remaining open questions that this phase did not resolve. <!-- sdd-owner: implementation -->
20. [x] **REFACTOR:** Refine the wording; run the focused documentation checks and the full `npm test`, and record each exact result. <!-- sdd-owner: implementation -->

### Work Unit 5 outcome and evidence

Observed results: the focused documentation test **8 passed, 0 failed**, and the full API suite with the database **324 passed, 0 failed, 0 skipped**. Real RED evidence was captured: the documentation test failed on two assertions before the documents were edited, and passed afterwards.

A new check, `apps/api/test/product-docs.test.ts`, asserts that the delivery status of scheduled transactions is recorded, that the four resolved decisions are present, that no product or architecture document still defers scheduling, and that the genuinely unresolved limitations still read as open.

The boundary in this unit named four documents, and a fifth had to be corrected to satisfy the parent gate that the product-scope documents no longer describe scheduled transactions as deferred. `docs/product/non-functional-requirements.md` still carried the occurrence cutoff and generation identity in its unresolved lists even though the phase resolved both. Leaving it would have failed the gate, so the three affected statements were corrected: the cutoff was removed from the deferred timezone questions, scheduled generation was removed from the unresolved idempotency list, and the deferred-automation item now names only what genuinely remains.

In `docs/product/actors-and-use-cases.md`, the actor table row, the actor section, the DU-02 use case, a classification sentence and an idempotency open question all still described scheduling as deferred; each now records delivery and keeps editing repetition, pausing, and weekly/annual/custom cadences open. In `docs/architecture/domain-model.md`, the summary, the automation entry and the `ScheduledTransaction` behaviour paragraph now record the resolved generation policy instead of deferring it.

Three remaining mentions of scheduling in the documents are deliberate and correct: the weekly/annual/custom cadence limitation, the delivery-slice statement that records what was delivered, and the open question about generalizing the identity pattern to imports. Any further removal would misstate the delivered capability.

## Parent-owned post-apply gates

- [x] Parent review of each completed work unit: changed scope, test evidence, measured changed lines against the 400-line budget, and rollback boundary. <!-- sdd-owner: parent -->
  - WU1: 716 lines (over budget by explicit owner decision). WU2: 339. WU3: 268. WU4: 344. WU5: 117 plus a 71-line new test. Each unit was committed only after its own evidence. Rollback boundary: the API units revert together, WU4's web scope reverts independently of the API, and WU5 touches only documents and one test.
- [x] Confirm with observed evidence that a schedule changes no balance, Activity, Available, Assigned, Ready to Assign, or financial event before its occurrence. <!-- sdd-owner: parent -->
  - Test 15 compares accounts, financial events and the summary, dashboard, monthly report and multi-period series before schedule creation, after creation, and after a generation whose cut-off precedes every occurrence: all unchanged, against a non-empty opening balance.
- [x] Confirm with observed evidence that generation is idempotent per occurrence across both adapters, including a replay, an overlapping range, a retry after failure, and a concurrent attempt, and that **no generation cursor or occurrence table exists**. <!-- sdd-owner: parent -->
  - Tests 8-11 run against both adapters: identical replay returns the stored result with unchanged events, accounts and receipt counts; an overlapping range creates only the genuinely new occurrence; a retry after an injected partial failure creates only the missing occurrences; a concurrent attempt leaves exactly one transaction with observed outcomes `['created','replay']` and both requests fulfilled. Test 17 asserts the model's field set EXACTLY and proves its own discriminating power by injecting a marker field and requiring the comparison to fail.
- [x] Confirm with observed evidence that a transaction generated into a cash account is cleared, that every other generated transaction is uncleared, and that both public creation routes still create uncleared transactions with an explicit value. <!-- sdd-owner: parent -->
  - Tests 4-6 cover the cash case, the non-cash case, and a missing or unknown account kind, which now yields UNCLEARED. Verification found the generation call site computing `generatedCleared(account.kind ?? 'CASH')`, so a missing kind would have silently created a CLEARED transaction; the fallback was removed, `generatedCleared` accepts `string | undefined` and returns true only for exactly `'CASH'`, and the CSV import path now passes `cleared: false` explicitly.
- [x] Confirm that no projection or report reads schedule state, and that the summary and both report responses contain no schedule field, with both report policies unchanged. <!-- sdd-owner: parent -->
  - Test 14 checks the summary, dashboard, monthly report and multi-period series while a schedule exists, using a detector broadened to `schedules`, `schedule`, `scheduledTransaction`, `scheduleId` and `isScheduled`. No reporting path reads schedule state.
- [x] Confirm that both canonical requirements were modified rather than contradicted, with *A deferred concept is requested* and *Unsupported history capability remains unavailable* preserved verbatim, and that the product-scope documents no longer describe scheduled transactions as deferred. Verified at the proposal gate: a sentence-level comparison shows exactly one sentence added per requirement and no canonical sentence removed or altered, and both canonical scenario names are preserved verbatim. <!-- sdd-owner: parent -->
  - Re-confirmed after archiving: both canonical scenario names appear exactly once in the delta and once in the base specs, and the archive applied `+7, ~2, -0`. The documentation test fails if any product or architecture document describes scheduling as deferred.
- [x] **After archiving, replace the placeholder Purpose** in the newly created `openspec/specs/scheduled-transactions/spec.md` with the exact wording recorded at the top of this change's `specs/scheduled-transactions/spec.md`, then re-run `npx openspec validate --all --strict`. Archiving a brand-new capability leaves a placeholder Purpose, exactly as it did for `guided-budgeting-ux` on 2026-09-17, and strict validation fails until it is written. <!-- sdd-owner: parent -->
  - Done: the placeholder was replaced with the recorded wording, and `npx openspec validate --all --strict` reports 11 passed, 0 failed.
- [x] Run the complete close-out sequence and record each exact result: `npm test` with and without the database, `npm run test:web`, `npm run typecheck:web`, `npm run build:web`, the browser suite, `npm run db:validate`, `npm run db:status`, and `npx openspec validate --all --strict`. Remove `apps/web/.next` before the typecheck and again before the browser suite. <!-- sdd-owner: parent -->
  - `npm test` with the database: 324 passed, 0 failed, 0 skipped. Without it: 288 total, 253 passed, 0 failed, 35 skipped. `npm run test:web`: 67 passed, 0 failed. `npm run typecheck:web`: clean. `npm run build:web`: compiled successfully, 13/13 static pages. Browser suite: 16 passed, 0 failed. `npm run db:validate`: schema valid. `npm run db:status`: 12 migrations, up to date. `npx openspec validate --all --strict`: 11 passed, 0 failed. `apps/web/.next` was removed before the typecheck and again before the browser suite.
