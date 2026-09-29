# Explore: Multi-Month Report Surface

Read-only exploration performed before the proposal. Every factual claim is paired with the file and line that supports it. The product owner decided the four open surface questions after this exploration; those decisions are recorded in the proposal.

## Why this phase exists

The API delivered and archived in `2026-09-28-add-multi-month-trends` can return a bounded multi-month series, but nothing in the product renders it. The change deliberately excluded the surface so it stayed small and closeable, and the canonical reporting spec now contains the read contract to build on.

## Verified canonical requirements that bind the surface

| Requirement | Evidence |
| --- | --- |
| Months may be presented side by side only within the explicit range, per-month projection, and flow-only period total, and the treatment must not imply month-to-month comparison, percentage change, or trend fields. | `openspec/specs/reporting/spec.md:69` |
| A request for an excluded dimension or control must be rejected or clearly identified as unavailable, and must not imply comparison, percentage change, trend fields, targets, schedules, reconciliation, or cards. | `openspec/specs/reporting/spec.md:73-76` |
| Every series entry is the single-month report for that month and must not be altered by series membership. | `openspec/specs/reporting/spec.md:80`, `:103` |
| One entry per month, ascending, with no month omitted; a month with no activity appears as explicit zeros. | `openspec/specs/reporting/spec.md:103`, `:112-116` |
| The period total is limited to flow measures and MUST NOT include the pending-release measure; transfers MUST NOT contribute to it. | `openspec/specs/reporting/spec.md:103`, `:124-136` |
| A range above the maximum is rejected rather than clamped or partially served. | `openspec/specs/reporting/spec.md:118-122` |
| The series must identify the policy and its version, the range, and the revision, and must disclose that it is recomputed from effective history, that category labels are the current ones, and that it is not a durable record. | `openspec/specs/reporting/spec.md:146-153` |
| Rollover and Available must not appear in a series or its total. | `report-policy-v2.md:65` in the archived change |

The API metadata alone does not explain these caveats to a person. The disclosure obligation therefore has a user-experience consequence, not only a wire consequence.

## Verified current behaviour

| Fact | Evidence |
| --- | --- |
| Range mode returns `{ policy, months[], total, disclosure, version }`, with `policy.monthBasis` naming `report-policy/v1` for every month entry. | `apps/api/src/reports/multi-month-report.ts:9-36` |
| The period total's exact key set is `treatment, incomeMinor, expenseMinor, categories, transfers, provisional`; there is no release or pending field. | `apps/api/src/reports/multi-month-report.ts:18-25` |
| Each month entry carries its own complete release breakdown. | `apps/api/src/reports/monthly-report.ts` (the `incomeRelease` field) |
| The route serves two mutually exclusive modes with no response discriminator: `month` for a single month, `from`+`to` for a range. | `apps/api/openapi.yaml:323-335`, `:516-526` |
| The existing report surface is a client page using `RouteGate` and `AppShell`, with a native month input, a labelled period heading, distinct loading, error, unresolved-policy, and empty states, and semantic sections. | `apps/web/app/reports/page.tsx:92-138` |
| Category spending is a captioned table with column and row headers; measures use `<dl>/<dt>/<dd>`; archived categories are labelled in text, not colour. | `apps/web/app/reports/page.tsx:23-41`, `:12-20` |
| Transfers render in their own section with a subtotal explicitly labelled as outside the totals. | `apps/web/app/reports/page.tsx:43-64` |
| The client stores one single-month report state guarded by a request generation counter, and constructs only a `month=` query. | `apps/web/app/hooks/useBudgetApp.ts:154-180` |
| Web tests are Node source-contract and pure-function tests; no component or DOM renderer is installed, but a real Playwright suite exists and covers the existing report surface. | `apps/web/test/reports.test.ts`, `apps/web/e2e/reports-account-detail.spec.ts` |
| The mobile navigation is a fixed five-column grid, and the sidebar is hidden below 980px. | `apps/web/app/globals.css:260-266` |
| No charting dependency is installed. | `package.json` dependencies |

## Owner decisions taken after this exploration

1. A new route, `/reports/trends`, rather than a mode switch on `/reports`.
2. An explicit start and end month chosen by the user, with inclusive semantics.
3. A chart **plus** the data table.
4. The period total after the month rows, with the disclosure obligations surfaced next to the range selector.

## Constraints the decisions create

- **The chart may not become a trend analysis.** The canonical spec permits months side by side and forbids comparison, percentage change, and trend fields. A chart of raw per-month measures already present in the contract is therefore within scope; a delta, percentage, trendline, average line, or annotated change is not, and must not be added to the contract or derived in the surface. Because the route is named `trends`, the surface must be explicit that it presents months side by side and does not analyse a trend.
- **No charting dependency exists.** The chart must be built from plain markup, CSS, or inline SVG rather than by adding a dependency, and it must never be the only representation: the data table stays authoritative, and no meaning may be carried by colour or shape alone.
- **A new route needs navigation work.** The mobile navigation is a fixed five-column grid, so adding an entry requires revisiting that layout rather than silently overflowing it.
- **The client needs a second, separate read path.** Range state must not be conflated with the single-month state keyed by `month`, and the existing `month=` request must stay byte-identical.
- **The disclosure has to be visible prose.** The three disclosure facts and the policy identifiers must be readable by a person, not only present in the wire metadata.
- **The surface needs real browser coverage**, because source-contract tests cannot prove rendered behaviour, and that is exactly the gap the previous surface slice had to close afterwards.

## Open questions deliberately left to specification and design

- The exact range validation the client performs versus the validation the API already performs, and how an over-long range is reported without clamping.
- Whether per-month detail is inline or in accessible expandable sections.
- The chart form, and how it stays equivalent to the table for assistive technology.
- How the two policy identifiers and the revision are labelled without mistakenly presenting the revision as a policy version.
