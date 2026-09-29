# Archive Report: Multi-Month Report Surface

- Status: ARCHIVED
- Change: `add-multi-month-report-surface`
- Archived as: `2026-09-29-add-multi-month-report-surface`
- Task status at archive: complete. All 8 implementation tasks and all 4 parent-owned gates are checked; `openspec list` reported complete before archiving.
- Canonical specs updated: `reporting` (+1 added, 1 modified) and `guided-budgeting-ux` (+1 added, 1 modified). See `sync-report.md` in this directory.

## Delivered

| Commit | Content |
| --- | --- |
| `537242a` | Range types mirroring the frozen response, pure guards that reject rather than clamp, a range state separate from the single-month state, and `readReportRange` with its own request guard and cross-mode invalidation |
| `879a514` | The `/reports/trends` route: explicit inclusive range selection, visible disclosure prose, a dependency-free chart displaying each raw measure, a captioned per-month summary table, accessible collapsible per-month detail, a flow-only period total with no pending-release figure, and an adaptive mobile navigation grid |

## Contract delivered

`/reports/trends` renders the bounded multi-month series for an explicit inclusive range of at most 24 months. It answers two questions the API contract alone leaves to the reader: what the series can and cannot claim, and why a period pending-release figure is absent while every month still reports its own.

## Verification

See `verify-report.md` in this directory. **Provenance note:** it was produced by the parent orchestrator under the project owner's instruction to use the gentle-ai subagents rather than the SDD phase agents, and Work Unit 1 was implemented inline because that harness failed three consecutive times. It does not carry the `gentle-ai.verify-result/v1` machine front matter and claims no such schema.

Runtime evidence at closure: `npm run test:web` 48 passed, `npm run typecheck:web` clean, `npm run build:web` compiled with `/reports/trends` prerendered, and the browser suite 10 tests with zero skips and one intermittently failing pre-existing journey.

## Open follow-up, explicitly not green

The pre-existing browser journey `a native link opens the routed history with the server-derived balance and a single transfer row` fails intermittently in full-suite runs: nine passed and two failed across eleven runs, always that same test, and it passes in isolation. The account-detail surface it exercises is unchanged by this change. A leading hypothesis was tested and refuted; no root cause is claimed. The configuration retains a Playwright trace on failure, so the next failure should be diagnosed from that artifact.

## Further follow-ups carried forward

- No browser assertion covers a range in which every month is empty, the loading live-region announcement, or the retry action after an API failure.
- Per-month collapsible content is asserted by headings and treatment labels rather than by every rendered value, caption, and `scope` attribute.
- The forbidden-control scan inspects interactive elements only, so a non-interactive element carrying a derived percentage or delta would evade it. No such element exists today.
- `playwright.config.ts` still defaults `DATABASE_URL` to port 5432 while the documented setup uses 5434.

## Next step

No further work is scoped for the reporting roadmap. Later roadmap candidates — targets, scheduled transactions, reconciliation, and cards or loans — each require their own scope review and their own change, and none is approved by this archive.
