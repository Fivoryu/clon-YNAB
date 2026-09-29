# Proposal: Multi-Month Report Surface

**Draft for owner review. Approval of this proposal authorizes specification and design only; it does not authorize implementation.**

## Why

The bounded multi-month series exists in the contract and is now canonical, but a person cannot see it. The archiving change deliberately excluded the surface so it stayed small and closeable, and the deferred work was recorded as the next step.

The series carries three disclosure obligations that exist precisely because the data can mislead: it is recomputed from effective history, so editing or deleting an ordinary transaction can change a previously reported month; its category labels are the current ones, not the labels in effect during each reported month; and it is not a durable record. Those obligations are already satisfied on the wire, but nothing surfaces them to a reader. A page that renders the numbers without the caveats would be technically conformant and practically misleading.

## What Changes

- **A new authenticated route, `/reports/trends`.** It is reachable from the existing navigation and renders the bounded series. The existing `/reports` single-month surface is untouched.
- **An explicit inclusive range chosen by the user**, with a start month and an end month. The client validates the shape and the maximum and, when the range is invalid or too long, reports the problem and shows no series rather than clamping or partially serving it.
- **One row per month, ascending, with no month omitted.** A month with no activity is present and labelled as having no recorded activity rather than disappearing.
- **A period total after the month rows**, in its own labelled panel, presented as flow measures only, with transfers separate and labelled as outside it. The surface never computes or displays a period pending-release figure, because that measure is a stock and each month already reports its own breakdown.
- **A chart alongside the data table.** The chart renders only raw per-month measures that already exist in the contract. It is not the only representation: the table remains authoritative and no meaning is carried by colour or shape alone. No charting dependency is added; the chart is built from plain markup, CSS, or inline SVG.
- **The disclosure obligations rendered as visible prose** next to the range selector: the recomputation caveat, the current-label caveat, and the not-durable statement, together with both policy identifiers and the revision the series was produced from.
- **A distinct client read path for the range**, separate from the single-month state, so the existing `month=` request and its response handling stay byte-identical.

## Capabilities

### New Capabilities

None. This change extends the existing reporting and guided-budgeting capabilities.

### Modified Capabilities

- `guided-budgeting-ux`: the authenticated experience gains a discoverable path to a multi-month view of the bounded series, and that path MUST NOT imply trend analysis, month-to-month comparison, or reporting capability beyond the bounded series.
- `reporting`: the bounded series MUST be presented to a user with its period total labelled as flow-only, its disclosures visible as prose, and its chart, if any, restricted to per-month measures already present in the contract and accompanied by an equivalent accessible data table.

## Impact

- **Web:** a new route under `apps/web/app/reports/`, a navigation entry, range state in `apps/web/app/hooks/useBudgetApp.ts`, range types in `apps/web/app/models.ts`, and responsive plus chart styles in `apps/web/app/globals.css`.
- **Navigation:** the mobile navigation is a fixed five-column grid, so adding an entry requires revisiting that layout instead of overflowing it.
- **API:** no change. The contract already exposes everything the surface needs, and this change must not add a trend, delta, percentage, comparison, or export parameter or field.
- **Tests:** source-contract and pure-function tests for the range state and request shape, plus real browser coverage for the rendered surface.
- **Unchanged by design:** the `/reports` single-month surface, `readMonthlyReport`, the report projection, and every API behaviour.

## Non-goals

- No percentage change, delta, difference, trendline, moving average, or any computed comparison between months, in the contract or derived in the surface.
- No month-comparison control, period-over-period selector, or "versus previous" mode.
- No trend field anywhere, and no saved or cached snapshot of a series.
- No historical category labels, which are not implementable because only the current name is stored.
- No rollover or Available series.
- No export.
- No new charting dependency, and no chart that becomes the only representation of a measure.
- No change to the single-month report surface or its contract.
- No targets, scheduled transactions, reconciliation, cards, or splits.

## Risks and how they are handled

| Risk | Handling |
| --- | --- |
| The route is named `trends` while the contract forbids trend fields, so the name can imply analysis that does not exist. | The surface must state that it presents months side by side and does not analyse a trend; the naming is recorded here as a deliberate owner choice rather than an accident. |
| A chart of monthly values invites the reader to infer a comparison the contract does not compute. | The chart plots only measures already in the contract, adds no derived value, is accompanied by the authoritative table, and is explicitly not a trend analysis. |
| Disclosure is present in the metadata but invisible to the reader. | The three disclosure facts, both policy identifiers, and the revision are rendered as prose next to the range selector, and a test asserts their presence in the rendered surface. |
| An over-long range is silently clamped client-side into a different range. | The client validates and rejects, and a browser test covers the over-limit case showing no stale series. |
| Adding range state breaks the single-month surface. | The range state and reader are separate, and the existing `month=` request and its key set stay locked by their current tests. |
| The new navigation entry breaks the mobile layout. | The mobile navigation layout is revisited as part of the change rather than left to overflow. |

## Success criteria

- An authenticated owner can reach the multi-month view from the existing navigation and choose an explicit inclusive range.
- The rendered series contains exactly one entry per month in the range, ascending, with empty months present and labelled.
- The period total is labelled as flow measures only, transfers are separate and labelled as outside it, and no pending-release total appears anywhere.
- The three disclosure facts, both policy identifiers, and the revision are visible as prose.
- The chart is accompanied by the data table and adds no derived value.
- No comparison, percentage change, delta, or trend control or field exists anywhere on the surface, proven in a real browser.
- An invalid or over-long range is rejected with no stale series left on screen.
- The single-month surface and its request are unchanged.
