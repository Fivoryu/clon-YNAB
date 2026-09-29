# Design: Category Targets

Governing records: `proposal.md` (approved 2026-09-29), `explore.md`, and the validated deltas in this change. The report endpoints and both report policies are frozen and are not touched.

## Goals

- Persist one target per category, of one of two kinds, with the fields each kind requires and no field the other forbids.
- Derive target state for a requested month from the same snapshot as the category values it appears beside.
- Keep the invariant that a target never changes any financial value, and that only the existing assignment command moves money and only on explicit confirmation.
- Add the target state to the dashboard and the monthly summary, and make it structurally impossible for it to leak into the report endpoints.

## Decisions taken

| Decision | Choice |
| --- | --- |
| Kinds | `MONTHLY_SET_ASIDE` and `BALANCE_BY_DATE`, and no others |
| Progress basis | The month's assigned amount for the set-aside kind; the month's available amount for the dated kind |
| Visibility | Budget view and monthly summary; never the report endpoints |
| Suggestion | Inform, and apply through the existing assignment command on confirmation |
| Target date granularity | A budget month, `YYYY-MM`, not a calendar day |

The date granularity is a deliberate simplification: the budget model is month-based, month membership already follows the budget timezone, and a calendar day would introduce a second timezone-sensitive boundary for no benefit the product needs. This is recorded here rather than left implicit.

## Persistence

A new additive table, `CategoryTarget`:

| Column | Notes |
| --- | --- |
| `categoryId` | Primary key and foreign key to `Category`, with `onDelete: Restrict`, consistent with the rest of the schema |
| `budgetId` | Foreign key to `Budget`, `onDelete: Restrict` |
| `kind` | A new enum with `MONTHLY_SET_ASIDE` and `BALANCE_BY_DATE` |
| `amountMinor` | `BigInt`, positive |
| `targetMonth` | Nullable string, `YYYY-MM`, present only for the dated kind |
| `createdAt`, `updatedAt` | Timestamps |

One row per category makes "at most one target per category" a schema property rather than only a validation rule. A new migration `0007_category_targets` creates the table and the enum. There is no backfill: existing categories simply have no target. Reverting the code and leaving the table in place is a safe rollback because the table holds no financial data; dropping it destroys only user-authored target definitions, so the revert path is "remove the UI and API, keep the data inert".

## State loading

`FinancialState` gains a `targets` array, loaded inside the existing single `RepeatableRead` transaction in `FinancialStore.readState`. Every projection that already receives a `FinancialState` therefore receives the target definitions from the same snapshot, which is what the derivation requirement demands. The loader is unchanged in shape: one more `findMany` inside the same transaction, not a second read.

## Commands and versioning

Target mutations MUST change the revision reported with the summary, and category mutations today bypass the versioned financial command path. Rather than duplicate the receipt, locking, and idempotency machinery, `FinancialStore` gains one additive capability following the existing `persistAccounts` precedent:

- `FinancialCommand` gains an optional `persistTarget?: { categoryId: string; target: TargetInput | null }`.
- `execute` writes it through a private `persistTarget(tx, budgetId, categoryId, target)` inside the same transaction, before the command receipt is created.

Consequences: the mutation is atomic with its receipt, inherits `FOR UPDATE` budget locking and idempotent replay, and increments `commandReceipt.count`, which is the version the summary and `GET /budgets` report. A null target deletes the row. The work function validates and returns the resulting target state.

New owner-scoped endpoints, both requiring `Idempotency-Key` and `If-Match` for consistency with every other mutation:

- `PUT /api/v1/budgets/{budgetId}/categories/{categoryId}/target`
- `DELETE /api/v1/budgets/{budgetId}/categories/{categoryId}/target`

Validation, all server-side: the category must exist in the owning budget; the kind must be supported; the amount must be a positive safe integer; `targetMonth` is required for `BALANCE_BY_DATE` and forbidden for `MONTHLY_SET_ASIDE` and must be `YYYY-MM`; an archived category rejects any change; removing a target that does not exist is `NOT_FOUND`.

## Derivation

A new pure module `apps/api/src/planning/targets.ts`:

```
projectTargetState(target, { assignedMinor, availableMinor }, requestedMonth) -> { kind, amountMinor, targetMonth?, progressMinor, remainingMinor, status }
```

- `MONTHLY_SET_ASIDE`: `progress = assignedMinor`; `remaining = max(0, amount - progress)`.
- `BALANCE_BY_DATE`: `progress = availableMinor`; `remaining = max(0, amount - progress)`.
- `status = MET` when `progress >= amount`; else `OVERDUE` when the kind is `BALANCE_BY_DATE` and `targetMonth < requestedMonth`; else `UNDERFUNDED`.

The pure function takes already-computed category values, so it performs no arithmetic over history and cannot double-count. It is called from `ReportService.read` while building each category, which is the projection the dashboard and the monthly summary share.

**Why targets cannot leak into the reports.** The report endpoints use `projectMonthlyReport` and `projectMultiMonthReport`, which are separate modules over the same `FinancialState`. The target state is added only to the summary projection. Separation is therefore structural rather than a rule someone must remember, and a test asserts that neither report response contains any target field.

## Presentation

The Budget category context gains the target state and, when the gap is positive and the category is active, a suggestion whose confirmation invokes the existing assignment command with a fresh idempotency key and the current version. The suggestion is presented as distinct from Ready to Assign, so it cannot be read as money that is already available. A past month shows the current definition, accompanied by the disclosure that no target history is retained. An archived category keeps its target readable with no actionable suggestion. All copy is Spanish product language with no raw field names.

## Components and file layout

| File | Change |
| --- | --- |
| `apps/api/prisma/schema.prisma` and a new migration | `CategoryTarget` and the kind enum |
| `apps/api/src/planning/targets.ts` | New pure derivation |
| `apps/api/src/persistence/financial-store.ts` | Load `targets` in `readState`; the additive `persistTarget` capability |
| `apps/api/src/app.ts` | Target commands, validation, and the summary projection calling the derivation |
| `apps/api/src/server.ts` | The two routes |
| `apps/api/src/reports/report-service.ts` | Attach derived target state per category |
| `apps/api/openapi.yaml` | The two routes and the target shapes |
| `apps/web/app/budget/page.tsx`, `models.ts`, `hooks/useBudgetApp.ts`, `globals.css` | Presentation, suggestion, confirmation |
| `apps/api/test/`, `apps/web/test/`, `apps/web/e2e/` | Coverage |
| `docs/product/functional-requirements.md`, `docs/product/mvp-scope.md`, `docs/product/actors-and-use-cases.md` | Authorized scope-document update |

Unchanged: the report endpoints, `report-policy/v1`, `report-policy/v2`, the assignment commands and their semantics, the category lifecycle, and the financial engine's calculations.

## Rollback

Revert the code and leave the `CategoryTarget` table inert, or drop the migration before any target exists. No financial data is involved, no existing row is backfilled, and no report contract changes.

## Review workload forecast

| Slice | Boundary | Estimated changed lines |
| --- | --- | --- |
| WU1 | Schema, migration, `FinancialState.targets`, the additive `persistTarget` capability, the two commands, OpenAPI, and API tests | 250-330 |
| WU2 | The pure derivation, the summary projection, the no-money invariant, and projection tests including PostgreSQL-gated ones | 200-280 |
| WU3 | Web presentation, suggestion and confirmation, browser coverage, and the authorized scope-document update | 300-400 |

Total 750-1010. Each slice must be re-estimated and must pause for re-scoping if it exceeds 400. The precedent is unambiguous: the last three phases each had at least one slice exceed its forecast, so these ranges are deliberately wide and every slice carries its own tests.

## Risks

| Risk | Mitigation |
| --- | --- |
| A monthly set-aside is reported as met because of carryover. | That kind reads only the month's assigned amount, and a test asserts a month with nothing assigned but positive carry is not met. |
| A target accidentally changes a financial value. | The target write happens in the same transaction as a receipt but touches no event, and tests assert RTA, Assigned, Activity, Available, and balances are unchanged across set and remove. |
| Targets leak into a report. | Separate projection modules plus an explicit test that neither report response contains a target field. |
| A stale summary omits a target. | The mutation creates a receipt, so the reported version changes. |
| Double counting. | Progress is derived from already-computed category values, never from a persisted running total. |
| An archived category offers an action the server rejects. | The server rejects target changes on archived categories and the surface offers no actionable suggestion. |
| The additive change to `FinancialStore` destabilises financial commands. | It is optional, follows the existing `persistAccounts` precedent, and the full financial suite must remain green unchanged. |

## Verification strategy

- Pure-function tests for the derivation: both kinds, the met boundary, the overdue boundary and its non-application to the set-aside kind, carryover not satisfying a set-aside, and a non-negative remaining gap.
- Command tests: create, replace, remove, every validation rejection, archived-category rejection, idempotent replay, and the version change.
- Invariant tests: RTA, Assigned, Activity, Available, balances, and event counts unchanged across set and remove; no assignment created without confirmation.
- Separation tests: the summary carries target state; neither report response contains any target field.
- A PostgreSQL-gated test exercising the real persistence path, since the target state depends on the loaded snapshot.
- Web source-contract tests plus real browser coverage for the presentation, the suggestion, the confirmation, the archived case, and the past-month disclosure.
- Independent read-only verification of each work unit.
