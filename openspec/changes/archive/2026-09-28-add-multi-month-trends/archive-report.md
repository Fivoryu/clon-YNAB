# Archive Report: Multi-Month Trends (API Contract)

- Status: ARCHIVED
- Change: `add-multi-month-trends`
- Archived as: `2026-09-28-add-multi-month-trends`
- Task status at archive: complete. All 8 implementation tasks and all 3 parent-owned gates are checked; `openspec list` reported no active changes after archiving.
- Canonical specs updated: `reporting` (+2 added, 2 modified). See `sync-report.md` in this directory.

## Delivered

| Commit | Content |
| --- | --- |
| `944d2cc` | Range mode on the report route: bounded explicit `from`/`to`, one state load, a period total over flow measures only, and the disclosure block |

The approved policy record moved into this archive as `report-policy-v2.md`. It is additive to `report-policy/v1`: every per-month measure and treatment of v1 still governs each month entry of a series unchanged, and v2 defines only the range, the flow-only period total, the deliberate exclusion of the pending-release stock, and the disclosure obligations.

## Contract delivered

`GET /api/v1/budgets/{budgetId}/reports/monthly` serves two mutually exclusive modes: `month=YYYY-MM` for the existing single-month response, **byte-identical to before**, and `from`/`to` for the series. A range longer than 24 months is rejected, never clamped. No comparison, percentage change, delta, trend, or export field exists in either mode.

## Verification

See `verify-report.md` in this directory. **Provenance note:** it was produced by the parent orchestrator under the project owner's instruction to delegate to the gentle-ai `worker`, `verify`, and `explore` subagents rather than the SDD phase agents. It does not carry the `gentle-ai.verify-result/v1` machine front matter and claims no such schema.

Runtime evidence at closure: `npm test` 147 tests (125 passed, 22 skipped, 0 failed) without a database, and 147 passed with 0 skipped against the documented PostgreSQL port 5434; `npm run test:web` 38 passed.

## Non-blocking warnings observed

- `openspec archive` reported that the proposal's `## Why` section exceeds 1000 characters. It was archived as written rather than trimmed after approval, because editing an approved proposal retroactively would misrepresent what was approved.

## Follow-ups carried forward, not blockers

- `Month` remains `required: true` on the extended path even though range mode forbids `month`. OpenAPI 3.0 cannot express the mutual exclusion across shared path parameters; the exclusivity is documented in prose. A future contract change could express the two modes as separate operations.
- The unresolved-policy branch is unreachable through the public API because the policy identifier is a compile-time constant, so its wire state is not exercised end to end.
- A non-zero `WORKING` provisional breakdown is unreachable because no public command writes `status: 'WORKING'`.
- The deferred trends surface is a separate change and was deliberately not started here. It must respect the flow-only period total and must not add comparison, percentage change, or trend fields.
- `playwright.config.ts` still defaults `DATABASE_URL` to port 5432 while the documented setup uses 5434, so browser runs need an explicit override.

## Next step

The trends surface, as its own OpenSpec change, built on this now-canonical read contract.
