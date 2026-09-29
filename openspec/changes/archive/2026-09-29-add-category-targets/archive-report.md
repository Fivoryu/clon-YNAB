# Archive Report: Category Targets

- Status: ARCHIVED
- Change: `add-category-targets`
- Archived as: `2026-09-29-add-category-targets`
- Task status at archive: complete. All 16 implementation tasks and all 5 parent-owned gates are checked; `openspec list` reported a complete change before archiving.
- Canonical specs updated: `budgeting` (+3), `reporting` (+1 added, 1 modified), `guided-budgeting-ux` (+1). See `sync-report.md` in this directory.

## Delivered

| Commit | Content |
| --- | --- |
| `4bbe07f` | One target per category of either kind, persisted, loaded inside the existing single snapshot, written transactionally with its command receipt, with owner-scoped commands and full server-side validation |
| `439940b` | A pure derivation plus the summary projection: set-aside measures the month's assigned amount, balance-by-date measures the month's available amount, status met, underfunded, or overdue, attached only to the summary so it cannot reach a report |
| `39ef45e` | The Budget surface: target state in category context, set, replace, and remove, and a suggestion whose explicit confirmation reaches the existing assignment command |
| `78471a2` | Archived-category target readability with no actionable control, one shared disclosure rule, and the three product-scope documents updated so targets no longer read as deferred |

## Contract delivered

A category may carry one target: a monthly amount to set aside, or a total balance to reach by a budget month. A target is a planning instruction: it changes no financial value, and only the existing assignment command moves money, and only when the owner confirms. Target state appears on the Budget view and in the monthly summary, and deliberately never in the single-month report or the multi-month series, whose policies are unchanged.

## Verification

See `verify-report.md` in this directory. **Provenance note:** it was produced by the parent orchestrator under the project owner's instruction to use the gentle-ai subagents rather than the SDD phase agents, and Work Unit 3b was implemented inline after that harness stalled. It does not carry the `gentle-ai.verify-result/v1` machine front matter and claims no such schema.

Runtime evidence at closure: migration `0007_category_targets` applied, `npm test` 160 passed with 0 skipped against the documented database and 137 passed with 23 skipped without it, `npm run test:web` 53 passed, `npm run typecheck:web` clean, `npm run build:web` compiled, and `npm run test:e2e` 13 passed.

## Non-blocking warnings observed

- `openspec archive` reported that the proposal's `## Why` section exceeds 1000 characters. It was archived as written rather than trimmed after approval.

## Follow-ups carried forward, not blockers

- The selected-month race in the budget hook is pre-existing and now visible through month-dependent target values; it is not fixed by this change.
- The repository-wide schema drift between hand-written `TIMESTAMPTZ` migrations and Prisma's `DateTime` expectation remains; the owner scheduled a dedicated alignment migration after this phase.
- The OpenAPI `{ nullable: true, allOf: [...] }` idiom predates this change; one over-permissive nullable on the summary target was removed here.
- A met target on an archived category and a rapid double-click on the confirmation are not separately asserted in the browser.

## Next steps

1. The dedicated migration aligning the hand-written migrations with the Prisma schema, as its own change with its own verification.
2. The remaining roadmap candidates — scheduled transactions, reconciliation and cleared state, and cards or loans — each require their own scope review and their own change, and none is approved by this archive.
