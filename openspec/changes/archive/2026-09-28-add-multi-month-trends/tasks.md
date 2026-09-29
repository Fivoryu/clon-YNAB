# Implementation Tasks: Multi-Month Trends (API Contract)

Execution status: Proposal approved 2026-09-28, `report-policy/v2` approved and recorded in `report-policy-v2.md`, specs validated, design and tasks approved by the owner. Both work units are implemented, independently verified with no blockers, and committed as `944d2cc`. Scope was the API contract only; the surface is a separate later change and was not started.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 360-490 authored additions across API, contract, and tests |
| 400-line budget risk | Medium |
| Chained PRs recommended | Yes, two slices |
| Suggested split | WU1 (range helpers + projection + unit tests) then WU2 (route + contract + API and database-gated tests) |
| Delivery strategy | ask-on-risk; no commit or push requested by these tasks |
| Chain strategy | Two review slices; each must be re-estimated and must pause for re-scoping if it exceeds 400 |

The estimate is rough because the test volume is the dominant unknown. Neither slice may absorb the other: WU1 is a pure module with its own tests, WU2 is the reachable HTTP surface with its own tests. If a slice exceeds 400 changed lines during apply, stop and re-scope instead of proceeding.

## Preconditions and hard gates

- `report-policy/v2` is approved and recorded in `report-policy-v2.md`. No implementation may add, remove, or reinterpret a measure beyond that record. In particular the period total MUST NOT acquire a pending-release field, and the 24-month cap MUST NOT become a clamp.
- The canonical single-month requirement in `openspec/specs/reporting/spec.md` was modified by this change's delta and validated. Do not weaken the exclusion boundary: comparison, percentage change, and trend fields stay out.
- Keep `apps/api/src/reports/monthly-report.ts` unmodified. It is reused, not refactored.
- Do not change `ReportService.read`, account balances, Ready to Assign, the canonical monthly summary, or the Prisma schema.
- Do not touch any file under `apps/web/`. The surface is a separate change.
- One `financialStore.load` per request. Do not call the single-month route internally.

## Work unit 1 — Range helpers and multi-month projection

**Boundary:** new `apps/api/src/reports/multi-month-report.ts` and its focused tests in `apps/api/test/multi-month-report.test.ts`. Keep the range helpers, the projection, the types, and their tests together. Roll back by deleting the new module and its test file; nothing else depends on them yet.

1. [x] **RED:** Add failing unit tests in `apps/api/test/multi-month-report.test.ts` for: inclusive ascending month enumeration that is correct across a year boundary; range length computation; a series with exactly one entry per month and no omissions; an empty month present as explicit zeros; every month entry deep-equal to `projectMonthlyReport` for that same month; the period total equal to the sum of the covered flow measures; the period total carrying no pending-release key; transfers visible with their treatment and contributing nothing to income, expense, category spending, or the total; a month releasing income received earlier leaving the total unaffected while its own breakdown is complete; and the disclosure block present with its three flags true. <!-- sdd-owner: implementation -->
2. [x] **GREEN:** Implement `apps/api/src/reports/multi-month-report.ts` with `MULTI_MONTH_POLICY_ID`, `REPORT_MONTH_RANGE_MAX`, the range helpers, `projectMultiMonthReport`, and the series/total/disclosure types. Reuse `projectMonthlyReport` with its default policy. <!-- sdd-owner: implementation -->
3. [x] **TRIANGULATE:** Strengthen the same suite with policy and boundary cases: exactly 24 months accepted and 25 rejected; a single-month range; a range spanning a year boundary; a range whose months are all empty still returning a total of zeros and every category row; an archived category summed by identity with its current label; a category with zero spending in every month still present in the total; and evidence that a violation is rejected by the helper rather than producing a truncated series. <!-- sdd-owner: implementation -->
4. [x] **REFACTOR:** Refine the module without changing approved semantics; run `npm test` from the repository root and record the exact result. <!-- sdd-owner: implementation -->

## Work unit 2 — Endpoint, contract, and reachable verification

**Depends on:** Work unit 1's projection. **Boundary:** `apps/api/src/server.ts`, `apps/api/src/app.ts`, `apps/api/openapi.yaml`, and focused API plus PostgreSQL-gated tests under `apps/api/test/`. Roll back the parser, app method, and contract additions together; single-month mode must be unaffected.

5. [x] **RED:** Add failing API tests for owner authorization, foreign-user non-disclosure, only one of `from`/`to` supplied, `month` combined with a range parameter, neither mode selected, malformed `from`/`to`, `from` later than `to`, a range longer than 24 months, an unknown or repeated query parameter, a locked range-mode response key set including the absence of a pending-release key in the total, the disclosure block, and proof that single-month mode's exact success key set and error codes are unchanged. Supersede the previous change's assertion that `from` is rejected as an unknown parameter, which is obsolete because `from` now selects range mode, and record that supersede explicitly in the test diff rather than silently. Add a PostgreSQL-gated integration test that exercises both modes against real persistence across at least two months with real events, following the existing database-gated test pattern. <!-- sdd-owner: implementation -->
6. [x] **GREEN:** Extend the existing report query parser in `apps/api/src/server.ts` to be mode-aware and to enforce mode exclusivity, add `getMultiMonthReport` in `apps/api/src/app.ts`, and document range mode and its schemas in `apps/api/openapi.yaml`. The route dispatch itself does not change. Load the budget state exactly once and project every month from that snapshot. Preserve single-month mode's response byte-for-byte. <!-- sdd-owner: implementation -->
7. [x] **TRIANGULATE:** Strengthen the tests to prove that one request performs a single state load; that each returned month deep-equals the single-month projection for the same month and revision; that the returned version and every month come from one revision; that single-month mode's response remains byte-identical to the shape locked by the previous change; that no comparison, trend, or second-period parameter is accepted; and that the new OpenAPI schemas are covered by the component reference-resolution check. <!-- sdd-owner: implementation -->
8. [x] **REFACTOR:** Refine the parser and route without changing the contract; run `npm test` without `DATABASE_URL` and again with the documented database URL, then run `npm run db:validate`, and record each exact result. <!-- sdd-owner: implementation -->

## Parent-owned post-apply gates

- [x] Parent review of each completed work unit: changed scope, test evidence, changed-line estimate against the 400-line budget, and rollback boundary. Work Unit 1 measured 403 changed lines against a forecast of 170-230; the owner was shown the composition and explicitly accepted the overage. Work Unit 2 measured 388 and then 400 changed lines after the owner authorized closing two test gaps found by independent verification; the overage was explicitly accepted. Both units were verified read-only with no candidate-caused blockers. <!-- sdd-owner: parent -->
- [x] Confirm the implementation matches `report-policy-v2.md` exactly, including the absence of a pending-release field in the period total and rejection rather than clamping of an over-long range. Confirmed: tests lock the period total's exact key set and assert no pending-release key at any nesting depth while the same scan detects it in the month entries, and all three range entry points reject an over-long range with no partial series. The independent verifier independently recounted and obtained the same result. <!-- sdd-owner: parent -->
- [x] Confirm the surface was not started in this change; it belongs to a separate later change. Confirmed: no file under `apps/web/` was modified, and the change contains no UI artifact. <!-- sdd-owner: parent -->
