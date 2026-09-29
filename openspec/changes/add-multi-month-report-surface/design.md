# Design: Multi-Month Report Surface

Governing records: `proposal.md` (approved 2026-09-28), `explore.md`, and the canonical `openspec/specs/reporting/spec.md` with the delta in this change. The API contract is frozen and archived; this design adds no API behaviour.

## Goals

- Render the bounded multi-month series on a new authenticated route, keeping every month individually identifiable and preserving each month's established treatment.
- Make the three disclosure obligations, both policy identifiers, and the revision visible as prose, next to where the range is chosen.
- Keep a 24-month range navigable by summarizing per month and moving full per-month detail into accessible collapsible sections.
- Add a chart that is a rendering of measures already in the response, never a trend analysis, and never the only representation.
- Leave the existing `/reports` single-month surface and its request byte-identical.

## Decisions taken

| Decision | Choice |
| --- | --- |
| Route | New `/reports/trends`, not a mode switch on `/reports` |
| Discovery | Its own navigation entry, which requires the mobile navigation grid to become adaptive |
| Range selection | Explicit start month and end month, inclusive |
| Range maximum | The API maximum of 24 months; rejected, never clamped |
| Density | One summary row per month plus one accessible collapsible section per month with the full detail |
| Chart | Included, dependency-free, with the summary table as the equivalent and authoritative representation |
| Period total | After the month rows, in its own panel labelled as flow measures only |
| Disclosures | Visible prose next to the range selector |

## Route and navigation

- New page `apps/web/app/reports/trends/page.tsx`, a client component following the existing `/reports` page conventions: `RouteGate(gate="ready")` inside `AppShell`.
- A navigation entry is added in `apps/web/app/components/shell/AppShell.tsx`. The desktop sidebar already renders every `nav` entry.
- **The mobile layout must change with it.** `apps/web/app/globals.css` currently fixes `.mobile-nav` to `grid-template-columns: repeat(5, 1fr)` and the mobile bar maps the five `nav` entries, so a sixth entry would wrap or shrink unreadably. The grid must become width-adaptive rather than a fixed five-column repeat, and the `.app-frame` bottom padding must still accommodate a single-row bar. No entry may be dropped on compact layouts.
- Entry copy must describe what the view presents. Because the route is named `trends` while the contract exposes no trend field, the visible label and the page copy state that months are presented side by side and that the view does not analyse a trend.

## Range selection and validation

- Two native `<input type="month">` controls, start and end, each with an associated `<label>` and an `aria-describedby` hint, reusing the pattern in `apps/web/app/reports/page.tsx`.
- Inclusive semantics stated in the hint.
- Client validation, in order: both values present and well-formed; `from <= to`; month count `<= 24`.
- On any violation the view reports the problem and renders no series, no totals, and retains no previous result. The client MUST NOT clamp, truncate, or silently substitute a valid range, which would misrepresent what the reader asked for.
- The client sends exactly `?from=...&to=...` and nothing else.

## Client contract

`apps/web/app/models.ts` gains types mirroring the frozen response: `MultiMonthReportPolicy`, `MultiMonthReportTotal`, `MultiMonthDisclosure`, `MultiMonthReport`, plus a range state shape and pure guards (`isReportRange`, `reportRangeLength`, `reportRangeLabel`, `isMultiMonthUnavailable` if needed). Pure guards are extracted deliberately so they can be unit-tested without a renderer, matching the precedent set by the account-history work.

`apps/web/app/hooks/useBudgetApp.ts` gains:

- a separate range state, keyed by its own `{ from, to }`, that never reuses or overwrites the single-month state;
- `readReportRange(from, to)`, which validates before requesting, increments its own request-generation counter, and ignores stale success and failure responses, mirroring `readMonthlyReport`;
- sign-out invalidation of the range state alongside the existing single-month invalidation.

`readMonthlyReport` and its `month=` request MUST remain untouched, and its existing tests must keep passing unmodified.

## Presentation

Order, top to bottom:

1. **Range controls** — start and end month inputs, the hint, and the validation state.
2. **Disclosures** — visible prose: recomputed from effective history (an ordinary edit or delete can change a previously reported month); category labels are the current ones, not the labels in effect during each month; the series is not a durable record. Alongside them, the identifiers: `report-policy/v2`, the per-month basis `report-policy/v1`, the requested range, and the revision.
3. **Chart** — a dependency-free rendering (inline SVG or CSS) of per-month measures already in the response, with an accessible name. It shows no derived, comparative, percentage, or trend value, and no annotation implying change between months.
4. **Month summary table** — a captioned table with column headers and a row header per month: month label, income, expense, provisional count, transfers subtotal. This table is also the chart's equivalent accessible representation.
5. **Per-month detail** — one `<details>` per month with a `<summary>` naming the month, containing that month's full established treatment: income and expense measures, the captioned category table, the transfers section with its outside-totals label, the provisional section, and the release breakdown. A month with no recorded activity states so explicitly inside its summary and still renders its zero-valued detail.
6. **Period total panel** — after the months, labelled as covering flow measures only: income, expense, per-category spending, provisional count and subtotals, and the transfers subtotal labelled as outside it. **No pending-release figure appears here**, because it is a stock and the response deliberately omits it from the total.

Accessibility and responsiveness reuse the existing conventions: `aria-labelledby` sections, `<caption>` with `scope="col"` and `scope="row"`, `<dl>/<dt>/<dd>` for measures, `role="status" aria-live="polite"` for loading, `role="alert"` for errors, text rather than colour alone for archived or zero states, horizontal scroll wrapping for wide tables, and the existing 720px and 980px breakpoints.

## Components and file layout

| File | Change |
| --- | --- |
| `apps/web/app/reports/trends/page.tsx` | New route and its sections |
| `apps/web/app/components/shell/AppShell.tsx` | Navigation entry |
| `apps/web/app/models.ts` | Range types and pure guards |
| `apps/web/app/hooks/useBudgetApp.ts` | Separate range state and reader |
| `apps/web/app/globals.css` | Chart, collapsible section, and adaptive mobile navigation styles |
| `apps/web/test/` | Source-contract and pure-guard tests |
| `apps/web/e2e/` | Browser coverage for the rendered surface |

Deliberately untouched: `apps/web/app/reports/page.tsx`, every file under `apps/api/`, and `apps/api/openapi.yaml`.

## Rollback

Revert the new route, the navigation entry, the range state and types, the styles, and the tests as one unit. There is no schema change, no migration, and no persisted state. The single-month surface is unaffected by construction, and its unchanged tests prove it.

## Review workload forecast

| Slice | Boundary | Estimated changed lines |
| --- | --- | --- |
| Work Unit 1 | `models.ts` range types and guards, `useBudgetApp.ts` range state and reader, and their source-contract and pure-function tests | 200-260 |
| Work Unit 2 | `reports/trends/page.tsx`, `AppShell.tsx`, `globals.css`, and real browser coverage | 300-400 |

Work Unit 1 alone is not user-visible; that is acceptable because it is a typed contract plus state with its own tests, and it keeps state correctness reviewable separately from presentation. Work Unit 2 is the largest risk because the page, the chart, the collapsible sections, the adaptive navigation, and their browser coverage are all new surface.

The previous surface slice is the cautionary precedent: `apps/web/app/reports/page.tsx` was only 138 lines, but its slice reached 457 lines because source-contract tests dominated the count. Both estimates above assume real browser coverage is included and therefore run high. If either slice exceeds 400 changed lines during apply, work pauses for re-scoping rather than proceeding.

## Risks

| Risk | Mitigation |
| --- | --- |
| The chart reads as a trend analysis the contract does not compute. | The chart renders only measures already in the response, carries no derived value or change annotation, is accompanied by the authoritative table, and the page states that it presents months side by side. |
| The disclosures exist but are not noticed. | They are rendered as prose immediately below the range controls, and a browser test asserts their presence on screen. |
| An over-long range is clamped into a different range. | Validation rejects; a browser test asserts no series remains after an over-limit request. |
| Adding range state regresses the single-month surface. | Separate state and reader, with the existing single-month request and key set still locked by unchanged tests. |
| The mobile navigation overflows with a sixth entry. | The fixed five-column grid becomes adaptive, and compact-layout reachability is asserted. |
| A 24-month range becomes unusable. | Summary rows plus collapsible per-month detail, and a browser test at a wide range. |
| Collapsing detail hides treatment the policy requires to be visible. | Each month's summary row is always visible; the full treatment is one keystroke away inside a labelled `details` element; and the total panel is always rendered. |

## Verification strategy

- Pure-function tests for the range guards: well-formed months, inclusive ordering, the 24-month boundary and one past it, and the length calculation across a year boundary.
- Source-contract tests for the request shape, the separate range state, the disclosure copy, the flow-only total labelling, the absence of any pending-release total, the absence of comparison or trend controls, and the unchanged single-month request.
- **Real browser coverage is required, not optional.** The previous surface slice shipped without it and the gap had to be closed afterwards. The browser suite must exercise a seeded range across at least three months including one empty month, assert the rendered per-month rows and the period total, assert the disclosures are visible, assert the absence of comparison, percentage, delta, and trend controls in the rendered DOM, expand a month's detail, and cover an inverted and an over-long range showing no stale series.
- Independent read-only verification of each work unit.
