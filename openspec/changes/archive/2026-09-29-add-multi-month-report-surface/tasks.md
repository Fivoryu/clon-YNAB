# Implementation Tasks: Multi-Month Report Surface

Execution status: Proposal approved 2026-09-28, specs validated, design and tasks approved. Both work units are implemented, independently verified read-only with no candidate-caused blockers, and committed as `537242a` and `879a514`. One open follow-up is recorded and is NOT claimed as green: a pre-existing account-detail browser journey fails intermittently in full-suite runs.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 500-660 authored additions across web types, state, page, styles, and tests |
| 400-line budget risk | High |
| Chained PRs recommended | Yes, two slices |
| Suggested split | WU1 (range contract, state, and their tests) then WU2 (rendered surface, chart, navigation, and browser coverage) |
| Delivery strategy | ask-on-risk; no commit or push requested by these tasks |
| Chain strategy | Two review slices; each must be re-estimated and must pause for re-scoping if it exceeds 400 |

The estimate is high because real browser coverage is a requirement of this change, and the previous surface slice showed that tests dominate the line count: the page was 138 lines while its slice reached 457. Neither slice may absorb the other. If either exceeds 400 changed lines during apply, stop and re-scope rather than proceeding.

## Preconditions and hard gates

- The API contract is frozen. Do NOT modify anything under `apps/api/`, and do NOT add a trend, delta, percentage, comparison, or export parameter or field anywhere.
- Do NOT render, compute, or imply a period pending-release figure. The response's period total deliberately has no such field, and each month carries its own release breakdown.
- Do NOT render rollover or Available values.
- Do NOT add a charting dependency. The chart uses plain markup, CSS, or inline SVG, and the data table remains the authoritative equivalent representation.
- `readMonthlyReport` and the single-month `/reports` surface MUST remain byte-identical, and its existing tests MUST keep passing unmodified.
- No comparison, percentage change, delta, trendline, moving average, or "versus previous" control may exist on the surface, and the page must state that it presents months side by side rather than analysing a trend.

## Work unit 1 — Range contract, state, and request shape

**Boundary:** `apps/web/app/models.ts`, `apps/web/app/hooks/useBudgetApp.ts`, and source-contract plus pure-function tests under `apps/web/test/`. Keep the types, the pure guards, the range state, the reader, and their tests together. Roll back by reverting these files; nothing renders the range yet.

1. [x] **RED:** Add failing tests under `apps/web/test/` for the range guards (well-formed months, inclusive ordering, the 24-month boundary and one month past it, and length across a year boundary), for a separate range state that never reuses or overwrites the single-month state, for `readReportRange` sending exactly `from` and `to` and no other parameter, for stale-range response rejection, and for the unchanged single-month request shape. <!-- sdd-owner: implementation -->
2. [x] **GREEN:** Add the range types and pure guards to `apps/web/app/models.ts` and the range state plus `readReportRange` to `apps/web/app/hooks/useBudgetApp.ts`, with its own request-generation guard and sign-out invalidation. Leave `readMonthlyReport` untouched. <!-- sdd-owner: implementation -->
3. [x] **TRIANGULATE:** Strengthen the same tests for: a range of exactly one month; a range spanning a year boundary; an inverted range rejected before any request is issued; an over-long range rejected rather than clamped, with no request issued; a stale success and a stale failure both ignored across a mode change; and proof that the single-month state and its request remain unaffected by any range operation. <!-- sdd-owner: implementation -->
4. [x] **REFACTOR:** Refine the guards and state transitions without changing the contract; run `npm run test:web` and `npm run typecheck:web` from the repository root and record the exact results. <!-- sdd-owner: implementation -->

## Work unit 2 — Rendered surface, chart, navigation, and browser coverage

**Depends on:** Work unit 1's range state and guards. **Boundary:** new `apps/web/app/reports/trends/page.tsx`, `apps/web/app/components/shell/AppShell.tsx`, `apps/web/app/globals.css`, and tests under `apps/web/test/` and `apps/web/e2e/`. Roll back the page, the navigation entry, and the styles together; the single-month surface must be unaffected.

5. [x] **RED:** Add failing tests for the rendered surface: discoverable navigation and the `/reports/trends` route; the start and end month controls with their hint; all three disclosure statements visible as prose; both policy identifiers and the revision visible; one summary row per month in ascending order including an empty month labelled as having no recorded activity; the period total presented after the months and labelled as covering flow measures only; transfers labelled as outside it with no pending-release total anywhere; one accessible collapsible section per month containing that month's full treatment; the chart accompanied by the equivalent table and carrying no derived value; and the absence of comparison, percentage, delta, or trend controls. Add real browser coverage for these in `apps/web/e2e/`, including an inverted and an over-long range leaving no stale series. <!-- sdd-owner: implementation -->
6. [x] **GREEN:** Implement the route and its sections, the navigation entry, the dependency-free chart, the collapsible per-month detail, and the responsive and accessible styles, including making the mobile navigation adaptive so a sixth entry does not overflow the fixed five-column grid. <!-- sdd-owner: implementation -->
7. [x] **TRIANGULATE:** Strengthen the browser coverage for a three-month range containing an empty month, a wide range confirming the page stays navigable, expanding a month's detail by keyboard, an over-limit range, a malformed or inverted range, an API failure, and compact-layout reachability of the entry. Assert in the rendered DOM that no trend, delta, percentage, or comparison control exists and that no period pending-release figure is displayed. <!-- sdd-owner: implementation -->
8. [x] **REFACTOR:** Refine the page and styles while keeping presentation tied to the contract; run `npm run test:web`, `npm run typecheck:web`, `npm run build:web`, and the browser suite against the documented database URL, and record each exact result. <!-- sdd-owner: implementation -->

## Parent-owned post-apply gates

- [x] Parent review of each completed work unit: changed scope, test evidence, changed-line estimate against the 400-line budget, and rollback boundary. Work Unit 1 measured 249 changed lines against a 200-260 forecast and was implemented inline by the parent after the `gentle-ai-worker` subagent failed three consecutive times without writing anything; the deviation is recorded in `apply-progress.md`. Work Unit 2 measured 375 changed lines against a 300-400 forecast. Both were independently verified read-only with no candidate-caused blockers, and every finding from those verifications was either closed or recorded. <!-- sdd-owner: parent -->
- [x] Confirm nothing under `apps/api/` changed and that no trend, delta, percentage, comparison, or export field or control was added anywhere. Confirmed by read-only diff against the previous commit: no `apps/api/` change, and the rendered surface contains no such control. The chart displays each measure's raw value and states that no differences or percentages are calculated. <!-- sdd-owner: parent -->
- [x] Confirm the single-month `/reports` surface and its request are byte-identical and that its existing tests pass unmodified. Confirmed: `apps/web/app/reports/page.tsx` is unchanged, `readMonthlyReport` extracts identically to its previous revision, and its request is still the only `?month=` call. One existing assertion was necessarily superseded because the route now serves two modes; it was replaced by a stricter assertion of one call per mode plus no other report endpoint, and the change is recorded rather than silent. <!-- sdd-owner: parent -->
- [x] Confirm the three disclosures, both policy identifiers, and the revision are visible to a reader, and that no period pending-release figure appears on the surface. Confirmed in the rendered DOM by the browser suite, which asserts all three disclosure statements, both policy identifiers, the range endpoints, and the revision, and asserts that the period panel carries no pending-release text while each month still reports its own breakdown. <!-- sdd-owner: parent -->
