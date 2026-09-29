# Design: Multi-Month Trends (API Contract)

Governing records: `proposal.md` (approved 2026-09-28), `report-policy-v2.md` (approved with the proposal), `specs/reporting/spec.md` (validated), and the canonical `openspec/specs/reporting/spec.md`.

This design covers the API contract only. The surface is a separate later change.

## Goals

- Make one bounded, owner-authorized multi-month read available, with one entry per month and a period total over flow measures only.
- Reuse the existing per-month projection unchanged, so no new per-month accounting arithmetic exists to get wrong.
- Guarantee that every month in a series and the reported revision come from one consistent snapshot.
- Be explicit, in the contract itself, about the two ways the series can mislead: recomputed history and current category labels.

## Non-goals

No comparison, percentage change, delta, or trend field. No chart. No export. No rollover or Available. No per-month historical category labels (not implementable). No caching or persistence of a series. No change to the single-month mode's response shape, error codes, or success payload. No schema change or migration.

## Contract

`GET /api/v1/budgets/{budgetId}/reports/monthly` — extended, with two mutually exclusive query modes.

The owner decided to extend the existing report route rather than add a sibling route. The route therefore serves two modes, selected by which parameters are present:

| Mode | Parameters | Response `data` |
| --- | --- | --- |
| Single month (existing) | `month=YYYY-MM` | The existing `MonthlyReportProjection`, **byte-identical to today** |
| Bounded range (new) | `from=YYYY-MM` and `to=YYYY-MM` | The series shape below |

Mode rules, all enforced before any data is read:

- `month` alone selects single-month mode.
- `from` and `to` together select range mode.
- `month` combined with either range parameter, or only one of `from`/`to`, is a validation error.
- Selecting neither mode is a validation error.
- The response carries no mode discriminator. The single-month shape is preserved exactly, so the shipped surface, its key-set lock test, and its behaviour are unaffected, and each caller knows which mode it requested.

Success envelope `{ data, requestId }`, where range-mode `data` is:

```jsonc
{
  "policy": {
    "id": "report-policy/v2",
    "monthBasis": "report-policy/v1",   // the policy every month entry follows unchanged
    "from": "2026-01",
    "to": "2026-06",
    "monthCount": 6
  },
  "months": [ /* MonthlyReport, ascending, exactly one per month in range */ ],
  "total": {
    "treatment": "PERIOD_TOTAL_FLOW_MEASURES_ONLY",
    "incomeMinor": 0,
    "expenseMinor": 0,
    "categories": [ { "id": "", "name": "", "archived": false, "spendingMinor": 0 } ],
    "transfers": { "treatment": "OUTSIDE_INCOME_EXPENSE_TOTALS", "totalMinor": 0 },
    "provisional": { "treatment": "INCLUDED_PROVISIONAL", "count": 0, "incomeMinor": 0, "expenseMinor": 0 }
  },
  "disclosure": {
    "recomputedFromEffectiveHistory": true,
    "categoryLabelsAreCurrent": true,
    "durable": false
  },
  "version": 0
}
```

Design decisions inside this shape:

- **Month entries are the existing `MonthlyReport` verbatim**, including each entry's own `policy.id` of `report-policy/v1` and its own complete `incomeRelease` breakdown. A month's values MUST NOT differ from what the single-month endpoint returns for the same month and revision. This is directly testable and is the primary regression guard.
- **`policy.monthBasis` makes the two-policy relationship explicit** rather than leaving a consumer to infer why a v2 series contains v1 months.
- **The period total has no pending-release field at all.** Absence is a stronger and clearer statement than a field that is always zero, and it matches `report-policy-v2.md`.
- **The total is always emitted**, including when every selected month is empty, so a consumer never has to infer "no total" from absence.
- **`disclosure` is structured booleans, not prose**, so a consumer can render the caveats without parsing a sentence and a test can assert them.

### Errors

| Condition | Result |
| --- | --- |
| No session | `UNAUTHENTICATED` (401) |
| Budget not owned by the caller | `NOT_FOUND` (404), non-disclosing, no values |
| Missing `from` or `to` in range mode | `VALIDATION_ERROR` (400) |
| Only one of `from`/`to` supplied | `VALIDATION_ERROR` (400) |
| `month` combined with `from` or `to` | `VALIDATION_ERROR` (400) |
| Neither `month` nor a complete range supplied | `VALIDATION_ERROR` (400) |
| Malformed `YYYY-MM` | `VALIDATION_ERROR` (400) |
| `from` later than `to` | `VALIDATION_ERROR` (400) |
| Range longer than 24 months | `VALIDATION_ERROR` (400), never a partial or clamped series |
| Unknown or repeated query parameter | `VALIDATION_ERROR` (400) |

## Range rules

- Inclusive `from`..`to`, both required.
- Maximum 24 months, inclusive of both ends. `monthCount = (to.year - from.year) * 12 + (to.month - from.month) + 1` must be `<= 24`.
- Enumeration is a pure helper over `YYYY-MM` strings using `Date.UTC` arithmetic, ascending, inclusive, and correct across year boundaries.
- An over-long range is rejected before any data is loaded.

## Components and file layout

| File | Change |
| --- | --- |
| `apps/api/src/reports/multi-month-report.ts` | New. `MULTI_MONTH_POLICY_ID`, `REPORT_MONTH_RANGE_MAX`, `monthsInRange`, `monthRangeLength`, `projectMultiMonthReport`, and its types. |
| `apps/api/src/app.ts` | Add `getMultiMonthReport` beside `getMonthlyReport`. |
| `apps/api/src/server.ts` | Extend the existing report query parser and route. The parser becomes mode-aware; the route dispatch itself does not change. |
| `apps/api/openapi.yaml` | Add the route and its schemas, following the `reports/monthly` precedent. |
| `apps/api/test/` | New focused suites plus a PostgreSQL-gated integration test. |

Deliberately untouched: `apps/api/src/reports/monthly-report.ts` (reused, not modified), `apps/api/src/reports/report-service.ts`, `apps/api/src/planning/engine.ts`, `apps/api/src/persistence/financial-store.ts`, and every file under `apps/web/`.
## Data flow and consistency

1. `authenticate(token)` then `requireBudget(token, budgetId)` — owner scoping and non-disclosure.
2. Validate and normalize the range; reject early on any range or parameter violation.
3. **One** `financialStore.load(user.id, budgetId)`. That call already wraps budget, version, events, and transfers in a single `RepeatableRead` transaction, so its snapshot guarantee applies to the whole series.
4. For each month in the range, ascending, call `projectMonthlyReport(state, month)` on that same loaded state.
5. Sum the covered flow measures across the returned months, summing per-category spending by category id.
6. Return the series, the total, the disclosure block, and `state.version`, all from that one snapshot.

Hard constraints for the implementation:

- Exactly one `load` per request. N loads would multiply the whole-history read by the range length and would break the single-revision guarantee.
- No internal HTTP call to the single-month mode. Calling the route would re-authenticate, re-load, and reintroduce the multi-load problem.
- `projectMonthlyReport` MUST be called with its default policy. Series membership must not alter a month's values.
- **Single-month mode MUST stay byte-identical to today's response.** The mode is additive: no field is added, removed, renamed, or reordered in the existing shape, so the shipped web surface keeps working without change. Only range mode returns the new shape.

## Cost

Today one report request reads the entire budget history. A series reuses that single read and then performs up to 24 in-memory passes over the already-loaded events, which is `O(rangeLength × events)`. With the range capped at 24 this is bounded and acceptable for the academic scope. Choosing a month-indexed projection, or bounding database work by month, is explicitly out of scope: it would require restructuring effective-history folding and the merged transfer stream, and the single-month design already records why naive row-level paging is unsafe there.

## Rollback

Revert the new module and the parser, route-dispatch, app, and OpenAPI edits as one unit. There is no schema change, no migration, and no persisted state, so rollback is a plain revert. `ReportService.read`, account balances, Ready to Assign, and the canonical monthly summary are untouched by construction.

One pre-existing assertion is knowingly superseded: the single-month test suite currently asserts that `from` is rejected as an unknown parameter. Extending the route makes that assertion obsolete, so it is replaced by assertions for the new mode rules while the single-month success response's exact key set continues to be asserted unchanged. This supersede must be explicit in the test diff, not silent.

## Review workload forecast

| Slice | Boundary | Estimated changed lines |
| --- | --- | --- |
| Work Unit 1 | `multi-month-report.ts` (range helpers, projection, types) plus its focused unit tests | 170-230 |
| Work Unit 2 | `apps/api/src/server.ts`, `apps/api/src/app.ts`, `apps/api/openapi.yaml` plus API and PostgreSQL-gated integration tests | 190-260 |

Both slices are below the 400-line budget with margin, and each carries its own tests. Work Unit 1 alone is not reachable over HTTP; that is acceptable for review because it is a pure module with its own tests, and it keeps the projection independently reviewable from the routing. If either slice's estimate exceeds 400 during apply, work pauses for re-scoping rather than proceeding.

## Risks

| Risk | Mitigation |
| --- | --- |
| A series quietly disagrees with the single-month endpoint. | A test deep-equals each month entry against `projectMonthlyReport` for that month and revision. |
| The period total gains a pending-release field later, reintroducing a summed stock. | The policy record forbids it and a test asserts the total's exact key set. |
| Cost multiplies with range length. | Hard 24-month cap; exactly one `load`; an explicit test that a single load serves the request. |
| A consumer presents the series as durable history, or as per-month labels. | Structured `disclosure` fields plus an explicit non-durability statement. |
| Category identity drifts after a rename. | Spending is summed by category id; labels are the current ones and the disclosure says so. |
| Months are omitted, making a trend silently skip a gap. | Enumeration is index-based over the range, not derived from data, so absence of activity cannot remove a month. |
| The new OpenAPI schemas do not resolve. | The existing reference-resolution test covers every `#/components/...` reference, including the new ones. |
| Routing drift from the single-month parser. | The parser becomes mode-aware but the single-month mode's success response key set, error codes, and rejection of unknown and repeated parameters are asserted unchanged. |
| The extended route becomes polymorphic in a way consumers cannot handle. | Modes are mutually exclusive and enforced before any read; the response carries no discriminator because the shapes are already self-identifying, and each caller knows which mode it requested. |
| Extending the route silently breaks the shipped surface. | Single-month mode is byte-identical, and its key-set lock test from the previous change continues to pass unmodified. |

## Verification strategy

- Projection unit tests: enumeration across year boundaries; ascending order; one entry per month with no omissions; empty months as explicit zeros; per-month identity with the single-month projection; total equals the sum of covered flow measures; the total has no pending-release key; transfers visible and contributing nothing; a month releasing earlier income leaves the total unaffected; over-long range rejected; `from > to` rejected.
- API tests: owner authorization; foreign-user non-disclosure; missing, malformed, and repeated parameters; range cap; response key-set lock; disclosure presence; mode exclusivity in both directions; and proof that single-month mode's response is unchanged from the previous change's locked key set and error codes.
- PostgreSQL-gated integration test: the endpoint over real persistence, exercising single-month mode and range mode across at least two months with real events, run with `DATABASE_URL` set against the documented local database. This is deliberately included because the browser suite cannot reach an API-only change and the repository's database-gated tests otherwise always skip.
- Contract: OpenAPI route coverage plus the component reference-resolution check.
- Independent read-only verification of each work unit, as in the previous tranche.

## Environment note

The documented local database is PostgreSQL on host port 5434 (Compose service `postgres`). `DATABASE_URL` must be supplied per process for database-gated tests. The browser configuration's default database URL does not match the documented port; that mismatch is a known, separate follow-up and is not addressed here.
