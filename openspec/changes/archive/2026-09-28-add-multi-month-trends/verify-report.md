# Verify Report: Multi-Month Trends (API Contract)

## Result

**PASS** — both work units are implemented, independently verified with no candidate-caused blockers, and the native OpenSpec validator accepts the change.

## Provenance (deviation from the archived convention)

Produced by the parent orchestrator under the project owner's standing instruction to delegate to the gentle-ai `worker`, `verify`, and `explore` subagents instead of the SDD phase agents. It therefore does **not** carry the `gentle-ai.verify-result/v1` machine front matter used by changes closed through the SDD verify phase, and claims no such schema. Every command result below was observed.

## Scope verified

| Work unit | Commit | Changed lines | Independent verification |
| --- | --- | --- | --- |
| WU1 — range helpers and multi-month projection | `944d2cc` | 403 (126 module + 277 tests) | Read-only verifier: no blockers; it executed the range helpers directly rather than trusting the tests |
| WU2 — range mode on the report route, contract, and reachable verification | `944d2cc` | 400 | Read-only verifier: no blockers; it observed the single-load guarantee and counted the component references itself |

## Requirement coverage

- `specs/reporting/spec.md` ADDED `Bounded multi-month report series`: one entry per month in ascending order with no omissions; empty months as explicit zeros; each entry identical to the single-month report; a period total over flow measures only; no pending-release field; an over-long range rejected rather than clamped; one consistent revision; non-disclosure for a foreign user.
- `specs/reporting/spec.md` ADDED `Multi-month series discloses recomputation and current labels`: policy, version, range, revision, and the three disclosure facts.
- `specs/reporting/spec.md` MODIFIED `Single-month basic report` and `Unsupported reporting concepts are excluded`: combining months is permitted only through the bounded series, and month-to-month comparison, percentage change, and trend fields remain excluded.

## Observed evidence

| Check | Command | Result |
| --- | --- | --- |
| API and unit suite, no database | `npm test` | 147 tests, 125 passed, 0 failed, 22 skipped (database-gated) |
| API and unit suite with the documented database | `DATABASE_URL='postgresql://ynab:ynab_local@localhost:5434/ynab_dev' npm test` | 147 tests, 147 passed, 0 failed, 0 skipped |
| Focused projection suite | `node --experimental-strip-types --test apps/api/test/multi-month-report.test.ts` | 15 passed |
| Focused route suite, with database | `node --experimental-strip-types --test apps/api/test/multi-month-report-api.test.ts` | 10 passed, 0 skipped |
| OpenAPI contract and reference resolution | `npm test` (openapi suite) | passed; 432 component references resolve |
| Web suites unaffected | `npm run test:web` | 38 passed, 0 failed |
| Native spec validation | `openspec validate add-multi-month-trends` | valid |

## Verified properties worth naming

- **Single-month mode is unchanged.** Its success key set and error codes are regression-locked, its payload is deep-equal to `projectMonthlyReport`, and the previously locked key set still passes. The route extension is additive.
- **Exactly one state load per request.** Observed with a counting store: one load for a 24-month range, zero loads for a rejected request, and one distinct revision across every month entry.
- **The period total cannot carry the release measure.** Locked by exact key set, by `'pendingMinor' in total === false`, and by a recursive scan that rejects the substring trap in `spendingMinor` while still detecting the measure where it belongs in the month entries.
- **The 24-month cap rejects uniformly.** All three exported entry points reject an over-long range with no partial series.

## Known follow-ups (accepted, not blockers)

- `Month` remains `required: true` on the extended path even though range mode forbids `month`. OpenAPI 3.0 cannot express a mutual exclusion across shared path parameters, so the exclusivity is documented in prose and in the parameter descriptions. Recorded by the independent verifier as a follow-up.
- The `available`/`REPORT_POLICY_UNRESOLVED` branch remains unreachable through the public API because the policy identifier is a compile-time constant, so the wire state is not exercised end to end.
- A non-zero `WORKING` provisional breakdown is unreachable because no public command writes `status: 'WORKING'`.
- The surface is a separate later change and is not part of this verification.

## Workload

Both work units exceeded their original forecasts: WU1 by 403 against a 170-230 forecast, WU2 at 400 against 190-260. The forecasts were wrong, not the scope. The owner accepted both overages after being shown the composition, and was offered trimming, splitting, and re-scoping each time.
