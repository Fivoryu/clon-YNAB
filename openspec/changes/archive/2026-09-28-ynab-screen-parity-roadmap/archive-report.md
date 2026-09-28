# Archive Report: YNAB Screen and Capability Roadmap

- Status: ARCHIVED
- Change: `ynab-screen-parity-roadmap`
- Archived as: `2026-09-28-ynab-screen-parity-roadmap`
- Task status at archive: complete. All 16 implementation tasks and both parent-owned gates are checked; `openspec list` reported `✓ Complete` before archiving.
- Canonical specs updated: `guided-budgeting-ux` (+2), `reporting` (+2 added, 1 modified), `transaction-history` (+1). See `sync-report.md` in this directory.

## Delivered

| Work unit | Commit | Content |
| --- | --- | --- |
| WU1 | `75586b8` | Account-history continuation with snapshot-consistent reads |
| WU2 | `55500b1` | Account detail and activity UI |
| WU3 | `370dd85` | Policy-approved single-month report API and OpenAPI contract |
| WU4 | `2196cfe` | Single-month report surface with visible accounting treatment |
| Records | `a2474f3` | OpenSpec artifacts and the approved `report-policy/v1` |

The report accounting policy record moved into this archive directory as `report-accounting-policy.md`. It remains the normative authority for the delivered single-month report and is explicitly scoped to it; it states that no multi-month aggregation, comparison, or trend contract is exposed.

## Verification

See `verify-report.md` in this directory. **Provenance note:** it was produced by the parent orchestrator under the project owner's instruction to delegate to the gentle-ai `worker`, `verify`, and `explore` subagents rather than the SDD phase agents. It therefore does not carry the `gentle-ai.verify-result/v1` machine front matter used by changes closed through the SDD verify phase, and it claims no such schema.

Runtime evidence recorded at closure: `npm test` 120 tests (100 passed, 20 skipped, 0 failed), `npm run test:web` 38 passed, `npm run typecheck:web` passed, `npm run build:web` compiled with `/reports` prerendered, `npm run test:e2e` 9 passed against the documented PostgreSQL port 5434.

## Non-blocking warnings observed

- `openspec archive` reported that `proposal.md` lacks the expected `## Why` and `## What Changes` headers. The proposal was written before that structure was required. It was archived as-is rather than rewritten after the fact, because rewriting an approved proposal retroactively would misrepresent what was approved.
- The MODIFIED reporting requirement initially dropped a canonical scenario, which made `openspec validate` fail and would have made archiving unsafe. It was corrected before archiving.

## Follow-ups carried forward, not blockers

- `pendingMinor` is unclamped; a month with an income release and no matching receipt could show a negative value. The approved policy defines the subtraction without constraining it, and the case is unreachable through the public API.
- A `SPENDING` record whose category is absent from the budget counts in `expenseMinor` without a category row. No category deletion path exists, so it is unreachable today.
- `REPORT_POLICY_UNRESOLVED` is unreachable through the public API because the policy identifier is a compile-time constant.
- A non-zero `WORKING` provisional breakdown is unreachable because no public command writes `status: 'WORKING'`.
- The `playwright.config.ts` default `DATABASE_URL` points at port 5432 while the documented setup uses 5434, so browser runs require an explicit override.
