# Explore: Multi-Month Trends

Read-only exploration performed before the proposal. Every factual claim is paired with the file and line that supports it. The product owner decided the three open contract questions after this exploration; those decisions are recorded in the proposal, not here.

## Why this phase exists

`openspec/specs/reporting/spec.md` now requires a single-month basic report and forbids combining months. The roadmap that produced it explicitly deferred the multi-month view and required an agreed multi-period aggregation contract before any design could exist (`openspec/changes/archive/2026-09-28-ynab-screen-parity-roadmap/proposal.md`: "A distinct reporting phase after the basic monthly report. It requires an agreed multi-period aggregation contract.").

## Verified current behavior

| Fact | Evidence |
| --- | --- |
| The single-month prohibition is now canonical. | `openspec/specs/reporting/spec.md:80` — "It MUST identify the selected month and MUST NOT combine months, compare multiple months, or present multi-month trends." |
| The exclusion requirement is canonical and now permits only the scoped single-month treatment. | `openspec/specs/reporting/spec.md:67-69` |
| The approved accounting policy is explicitly single-month-scoped and forbids multi-month. | `openspec/changes/archive/2026-09-28-ynab-screen-parity-roadmap/report-accounting-policy.md` — "Scope: the single-month basic report defined by Work Units 3 and 4 only." and "No multi-month aggregation, comparison, or trend contract is exposed." |
| The report projection is a pure per-month function. | `apps/api/src/reports/monthly-report.ts:41` — `projectMonthlyReport(state, requestedMonth, policy)` |
| Month membership comes from a stored month field, not from recomputation. | `apps/api/src/reports/monthly-report.ts:34` — `inMonth = (event, month) => event.month === month`; transfers filtered by `TransferState.month` |
| Category rows use the category's CURRENT name and archived flag, for every month. | `apps/api/src/reports/monthly-report.ts:62` |
| Category renames mutate budget state, not the financial command stream. | `apps/api/src/app.ts` rename path saves through the budget store; the predecessor design notes renames are not captured by the financial version |
| Effective-history folding removes superseded events and delete tombstones. | `apps/api/src/planning/transaction-history.ts:48` |
| The projection never touches rollover or Available. | `apps/api/src/reports/monthly-report.ts` has no `positiveRollover` / `calculateCategory` call; those live only in `apps/api/src/reports/report-service.ts:37,49` |
| One report request reads the whole budget history. | `apps/api/src/persistence/financial-store.ts` `load` → `readState` reads all `financialEvent` and all `transfer` rows, without a month filter |
| Snapshot consistency is guaranteed per `load` call only. | `apps/api/src/persistence/financial-store.ts` `load` wraps budget, version, events, and transfers in one `RepeatableRead` transaction |
| The report query parser accepts exactly one month and rejects unknown or repeated parameters. | `apps/api/src/server.ts` `parseMonthlyReportQuery` |
| No multi-period contract, range helper, or trend wire shape exists. | No range parameter on the report route; `previousMonth` in `apps/api/src/reports/report-service.ts:56` is single-step only |
| No charting dependency exists and the report surface deliberately renders a table. | `apps/web/app/reports/page.tsx`; the predecessor design states a chart is not required |

## Decisions taken by the product owner after this exploration

1. **Aggregation contract:** one row per month reusing the existing per-month projection, plus a period total covering flow measures only.
2. **Period selection:** explicit `from` and `to`, inclusive, with a hard cap of 24 months.
3. **First slice:** API only; the surface is deferred.

## Known constraints the contract must not contradict

These are properties of the current data model, not opinions:

- **Per-month category labels are not implementable.** Only the current name is stored, so any cross-month view shows today's labels for every month. A rename silently relabels history. This must be stated, not hidden.
- **A multi-month view is not a durable record.** Effective-history folding means deleting or editing a transaction changes a past month's totals. The view must not be presented or cached as immutable history.
- **Rollover is outside the report accounting model.** Mixing report spending with budget Available across months would juxtapose two different accounting models.
- **The range must be capped and loaded once.** Each request already reads the full budget history, so a range implemented as N loads multiplies that cost; and snapshot consistency holds only within a single `load`.
- **The pending-release measure is a stock, not a flow.** Summing it across months can cancel out or go negative, which is why the owner excluded it from the period total.

## Open questions deliberately left to specification and design

- The exact response envelope and field names, and whether the period total nests per-category rows or reuses the per-month category shape.
- Whether the period total is emitted when every selected month is empty.
- How the cap violation is reported: a validation error, or a clamped result with an explicit signal.
- Whether the later surface change is a separate OpenSpec change or a later work unit of this one.
