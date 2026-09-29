# Verify Report: Category Targets

## Result

**PASS** — all 16 implementation tasks are complete, three of the four work units were independently verified read-only with no candidate-caused blocker, every verification finding was closed or recorded, and the native OpenSpec validator accepts the change.

## Provenance

Produced by the parent orchestrator under the project owner's instruction to delegate to the gentle-ai subagents rather than the SDD phase agents. Work Unit 3b was implemented inline by the parent after the `gentle-ai-worker` subagent stalled and reported an error before writing anything. It therefore does not carry the `gentle-ai.verify-result/v1` machine front matter and claims no such schema. Every command result below was observed.

## Scope verified

| Work unit | Commit | Changed lines | Independent verification |
| --- | --- | --- | --- |
| WU1 — definition, persistence, migration, commands | `4bbe07f` | 368 (forecast 250-330) | Read-only verifier: no candidate-caused blocker; two findings shown to be pre-existing repository conventions |
| WU2 — pure derivation and summary projection | `439940b` | 257 (forecast 200-280) | Read-only verifier: no candidate-caused blocker; three findings closed, one recorded |
| WU3a — presentation, management, confirmation | `39ef45e` | 312 | Read-only verifier: no candidate-caused blocker; one requirement failure fixed, one vacuous assertion strengthened |
| WU3b — archived readability and product documents | `78471a2` | implemented inline | No independent verification; parent review and observed suites only |

## Requirement coverage

- `budgeting` ADDED `A category may carry one target definition`: one target per category, either kind, with the target month required only for the dated kind, every validation rejection enforced server-side, and an archived category retaining its target read-only.
- `budgeting` ADDED `A target never changes a financial value`: setting, replacing, removing, and evaluating a target change no RTA, Assigned, Activity, Available, balance, or event, and nothing is assigned without an explicit confirmation.
- `budgeting` ADDED `Target state is derived for a requested month`: the set-aside kind measures the month's assigned amount and never carried-over money; the dated kind measures the month's available amount; the status is met, underfunded, or overdue; a target change moves the reported revision.
- `reporting` ADDED `Category target state appears in the dashboard and monthly summary`, and MODIFIED `Unsupported reporting concepts are excluded` so target state is permitted there while remaining absent from the report endpoints and every other excluded concept stays unavailable.
- `guided-budgeting-ux` ADDED `Category targets are presented in category context with explicit confirmation`, including the archived case, the past-month disclosure, and the explicit confirmation.

## Observed evidence

| Check | Command | Result |
| --- | --- | --- |
| Migration applied | `DATABASE_URL=… npm run db:migrate` | `0007_category_targets` applied |
| Schema valid | `DATABASE_URL=… npm run db:validate` | valid |
| API and unit suites, no database | `npm test` | 160 tests, 137 passed, 0 failed, 23 skipped |
| API and unit suites with the database | `DATABASE_URL=… npm test` | **160 tests, 160 passed, 0 failed, 0 skipped** |
| Web suites | `npm run test:web` | **53 passed, 0 failed** |
| Web type check and build | `npm run typecheck:web`, `npm run build:web` | clean; compiled with `/budget` and `/reports/trends` generated |
| Browser journeys | `npm run test:e2e` | **13 passed, 0 failed** |

## Verified properties worth naming

- **The financial invariant holds.** Complete before/after summaries and event counts are compared across setting, replacing, and removing a target, and the browser suite observes zero assignment requests before the confirmation and exactly one after it.
- **Carryover cannot satisfy a monthly set-aside.** That kind reads only the month's assigned amount, and a test asserts a month with nothing assigned and a positive carry is not met.
- **Targets cannot leak into a report.** The report endpoints use separate projection modules, confirmed by reading the routing, and an HTTP test recursively checks both report responses for any target field.
- **The suggestion is not money.** It is rendered distinctly from Ready to Assign, says so in copy, and only its confirmation reaches the existing assignment command.
- **The disclosure covers every past month for every kind**, sharing one pure rule between the active panel and the archived disclosure.

## Open follow-ups, accepted and not blockers

- **Selected-month race, pre-existing.** The budget hook stores every summary response without checking that it is still for the selected month, so concurrent month changes can complete out of order and month-dependent values can belong to another month. This exposure predates targets, which make it visible rather than cause it.
- **Pre-existing repository-wide schema drift.** Every timestamp column in every migration is `TIMESTAMPTZ` while Prisma models `DateTime`, and no migration uses `ON UPDATE CASCADE`. A read-only schema diff reports 112 statements across the whole schema. The owner scheduled a dedicated alignment migration after this phase.
- **OpenAPI nullable idiom.** The document uses `{ nullable: true, allOf: [...] }`, which OpenAPI 3.0.3 does not formally sanction; the same idiom already existed for `Budget.account`. One over-permissive `nullable` on the summary target was removed during this phase.
- **Report separation test breadth.** The browser and API checks recognise a fixed set of target-like field names, so a differently named payload could evade them. The report response shapes are key-locked by their own suites and the projectors are separate modules.
- **Coverage limits.** A met target on an archived category is not separately asserted in the browser; the same read-only renderer is covered on active rows. A rapid double-click on the confirmation is not exercised.

## Workload

Work Unit 1 exceeded its forecast by 38 lines; Work Unit 2 landed inside its forecast; Work Unit 3 was re-scoped by the owner from one unit estimated at 410-500 lines into two units of 312 and a smaller remaining one, rather than proceeding above the 400-line budget. Every unit stayed under 400 changed lines.
