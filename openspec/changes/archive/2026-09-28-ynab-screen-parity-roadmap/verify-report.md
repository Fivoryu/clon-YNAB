# Verify Report: YNAB Screen and Capability Roadmap

## Result

**PASS** — every implementation task in this change is complete, each work unit was independently verified with no candidate-caused blockers, the resulting report behaviour was proven in a real browser, and the native OpenSpec validator accepts the change.

## Provenance (deviation from the archived convention)

This report was produced by the parent orchestrator, under the project owner's explicit instruction to delegate work to the gentle-ai `worker`, `verify`, and `explore` subagents instead of the SDD phase agents. It therefore does **not** carry the `gentle-ai.verify-result/v1` machine front matter found in changes closed through the SDD verify phase, and it claims no such schema. The evidence below is the actual observed output of commands run during this change.

## Scope verified

| Work unit | Commit | Independent verification |
| --- | --- | --- |
| WU1 — account-history API and snapshot-consistent continuation | `75586b8` | Read-only verifier: no findings |
| WU2 — account detail and activity UI | `55500b1` | Read-only verifier: no code findings |
| WU3 — policy-approved single-month report API | `370dd85` | Read-only verifier: no blockers; four follow-ups, all pre-existing or unreachable through the public API |
| WU4 — policy-approved single-month report surface | `2196cfe` | Read-only verifier: no blockers; one candidate-caused defect (duplicate navigation tile), fixed and re-verified |
| E2E coverage of the two new surfaces | `92f824d` | Read-only verifier: no blockers; suite independently reproduced green |
| Report accounting policy `report-policy/v1` | `a2474f3` | Owner-approved; two independent verifiers confirmed the implemented semantics match the record |

## Requirement coverage

- `specs/transaction-history/spec.md` — older account history beyond the 500-record bound: covered by cursor continuation, proven in a browser with 501 seeded records, a stale-cursor recovery step, and a 500-to-502 row progression.
- `specs/reporting/spec.md` — single-month basic report, and visible accounting treatment for transfers, `WORKING` records, and pending/unreleased income: covered by `apps/api/src/reports/monthly-report.ts` and the `/reports` surface.
- `specs/guided-budgeting-ux/spec.md` — account activity reachable in account context, and a discoverable single-month report entry that does not imply multi-month trends: covered by the account detail route and the Reports navigation entry.

## Observed evidence

| Check | Command | Result |
| --- | --- | --- |
| API and unit suite | `npm test` | 120 tests, 100 passed, 0 failed, 20 skipped (PostgreSQL-gated, pre-existing) |
| Web source-contract suite | `npm run test:web` | 38 passed, 0 failed |
| Web type check | `npm run typecheck:web` | passed, exit 0 |
| Web build | `npm run build:web` | compiled successfully; `/reports` prerendered |
| Browser journey | `DATABASE_URL='postgresql://ynab:ynab_local@localhost:5434/ynab_dev' npm run test:e2e` | 9 passed, 0 failed |
| OpenAPI contract | `npm test` (openapi suite) | 4 passed; 432 component references resolve |
| Native spec validation | `openspec validate ynab-screen-parity-roadmap` | valid |

## Enforced semantics

`report-policy/v1` was verified as genuinely enforced, not merely declared: temporarily adding the transfer total to `expenseMinor` in `apps/api/src/reports/monthly-report.ts` made the browser assertion fail with `Expected: 2575, Received: 22575`. The mutation was reverted and `apps/api/` confirmed byte-identical to `HEAD`.

## Known follow-ups (accepted, not blockers)

- `pendingMinor` is unclamped; a month containing an income release without matching receipt could produce a negative value. The approved policy defines the subtraction but does not constrain it, and the case is not reachable through the public API.
- A `SPENDING` record whose category is absent from the budget would count in `expenseMinor` without appearing in any category row. There is no category deletion path, so it is unreachable today.
- `REPORT_POLICY_UNRESOLVED` is unreachable through the public API because the policy identifier is a compile-time constant; the projection is unit-tested but the wire state is not exercised end to end.
- A non-zero `WORKING` provisional breakdown is unreachable because no public command writes `status: 'WORKING'`.

## Workload

Work Units 1-3 measured 266, 342, and 342 changed lines. Work Unit 4 measured 457, 14% over the 400-line budget, which the owner explicitly accepted after being shown the composition and the alternatives. The E2E and OpenAPI slices are recorded in `odd/tasks/`.
