# Verify Report: Multi-Month Report Surface

## Result

**PASS with one open follow-up** — both work units are implemented, each was independently verified read-only with no candidate-caused blockers, and every verification finding was either closed or recorded. The open follow-up is a pre-existing browser journey that fails intermittently; it is not claimed as green.

## Provenance

Produced by the parent orchestrator under the project owner's instruction to delegate to the gentle-ai subagents rather than the SDD phase agents, and — for Work Unit 1 — implemented inline after that harness failed three consecutive times. It therefore does not carry the `gentle-ai.verify-result/v1` machine front matter and claims no such schema. Every command result below was observed.

## Scope verified

| Work unit | Commit | Changed lines | Independent verification |
| --- | --- | --- | --- |
| WU1 — range contract, pure guards, range state, range reader | `537242a` | 249 (forecast 200-260) | Read-only verifier: no blockers; four findings, all closed |
| WU2 — rendered surface, chart, navigation, browser coverage | `879a514` | 375 (forecast 300-400) | Read-only verifier: no blockers; four findings, two closed and two recorded |

## Requirement coverage

- `guided-budgeting-ux` ADDED `Multi-month report view is reachable in the authenticated experience`: the route is reachable from the navigation on both layouts, and its copy describes months side by side rather than trend analysis.
- `guided-budgeting-ux` MODIFIED `Basic monthly report is reachable in the authenticated experience`: the single-month entry is unchanged and a separately specified multi-month view may exist alongside it.
- `reporting` ADDED `Multi-month series is presented with visible disclosures and a flow-only total`: per-month treatment preserved, empty months labelled and rendered with zeros, the period total presented separately and labelled flow-only, the three disclosure statements visible as prose with both policy identifiers and the revision, and an equivalent accessible table for the chart.
- `reporting` MODIFIED `Unsupported reporting concepts are excluded`: the bounded series and its chart are permitted while month-to-month comparison, percentage change, trend fields, and every other excluded concept remain unavailable.

## Observed evidence

| Check | Command | Result |
| --- | --- | --- |
| Web suites | `npm run test:web` | 48 passed, 0 failed |
| Web type check | `npm run typecheck:web` | clean |
| Web build | `npm run build:web` | compiled; `/reports/trends` prerendered |
| Browser journey | `DATABASE_URL='postgresql://ynab:ynab_local@localhost:5434/ynab_dev' npm run test:e2e` | 10 tests, 0 skips; see the follow-up below |
| API and unit suites | `npm test` (no `DATABASE_URL`) | 125 passed, 0 failed, 22 skipped |
| Native spec validation | `openspec validate add-multi-month-report-surface` | valid |

## Verified properties worth naming

- **The single-month surface is untouched.** `apps/web/app/reports/page.tsx` is unchanged, `readMonthlyReport` extracts identically, and its request remains the only `?month=` call.
- **The range is rejected, never clamped.** Validation runs before any request; an inverted and an over-long range leave no series, totals, or stale result on screen, proven in the browser.
- **No period pending-release figure exists.** The period panel carries none, proven in the rendered DOM, while every month still reports its own release breakdown.
- **The chart is not a trend analysis.** It displays each measure's raw value, states that no differences or percentages are calculated, and its values are proven equal to the summary table's by a browser assertion.
- **The disclosures are visible, not merely present in metadata.** All three statements, both policy identifiers, the range, and the revision are asserted in the rendered DOM.

## Open follow-up, explicitly not green

The pre-existing browser journey `a native link opens the routed history with the server-derived balance and a single transfer row` fails intermittently in full-suite runs: nine passed and two failed across eleven runs, always that same test, and it passes in isolation. The product surface it exercises is unchanged by this change. A leading hypothesis — a rebuild while a reused dev server is serving — was tested and refuted. No root cause is claimed; the configuration already retains a Playwright trace on failure, and the next failure should be diagnosed from it. Work Unit 2's product behaviour is verified; the reliability of that one pre-existing journey is not.

## Further recorded gaps

- No browser assertion covers a range in which every month is empty, the loading live-region announcement, or the retry action after an API failure.
- Per-month collapsible content is asserted by headings and treatment labels rather than by every rendered value, caption, and `scope` attribute.
- The forbidden-control scan inspects interactive elements only, so a non-interactive element carrying a derived percentage or delta would evade it. No such element exists today.

## Workload

Both work units stayed under the 400-line budget. Work Unit 1's forecast of 200-260 was accurate; Work Unit 2's of 300-400 was accurate. The previous surface slice is the precedent that shaped these estimates: a 138-line page whose slice reached 457 because tests dominated, which is why browser coverage was made a requirement rather than an afterthought here.
