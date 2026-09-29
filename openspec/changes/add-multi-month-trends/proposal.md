# Proposal: Multi-Month Trends

**Draft for owner review. Approval of this proposal authorizes specification and design only; it does not authorize implementation, and it does not by itself approve the accounting policy record described below.**

## Why

The clone can show one budget month at a time. The owner cannot see whether spending in a category is rising or falling, and cannot read a period as a whole. The roadmap that delivered the single-month report deferred this deliberately and required an agreed multi-period aggregation contract before any design (`openspec/changes/archive/2026-09-28-ynab-screen-parity-roadmap/proposal.md`).

That contract now exists. The product owner decided, after a source-cited exploration: one row per month reusing the existing per-month projection; a period total covering flow measures only; an explicit inclusive `from`/`to` range capped at 24 months; and API first, surface later.

The current canonical requirement forbids this outright: `openspec/specs/reporting/spec.md:80` states the report "MUST NOT combine months, compare multiple months, or present multi-month trends", and the approved `report-policy/v1` is scoped to the single-month report only. This change therefore has to modify a canonical requirement rather than slip underneath it.

## What Changes

- **A bounded multi-month read contract.** The existing report endpoint is extended: alongside its current single-month mode it accepts an explicit inclusive month range and returns an ordered series of the existing per-month report projection, plus a period total. The owner chose extension over a sibling route, and the modes are mutually exclusive. It reuses `projectMonthlyReport` unchanged for each month, so no new accounting arithmetic is introduced per month.
- **A period total over flow measures only.** The total sums income, expense, per-category spending, provisional income and expense, and the transfers subtotal. It deliberately excludes the pending-release measure, because that measure is a stock: a month that releases income received earlier can make it cancel out or go negative, and a summed stock would be misleading. Each month in the series still carries its own full breakdown, so nothing is hidden.
- **A 24-month cap and a single read.** The range is capped and served from one snapshot read followed by N in-memory projections, not N database reads. This matters because one report request already reads the entire budget history.
- **A superseding accounting policy record.** `report-policy/v1` is scoped to the single-month report and forbids multi-month aggregation. This change proposes `report-policy/v2`, an additive record that keeps every v1 measure and its per-month treatment intact and defines only the period-total semantics above. The owner approves it with this proposal.
- **A modified canonical requirement.** The single-month requirement is relaxed only enough to permit a bounded, explicitly ranged multi-month read whose months remain individually single-month and whose total covers only flow measures. Comparison, percentage change, and trend fields remain excluded.
- **Visible honesty about mutable history.** Because effective-history folding means a later edit or delete changes a past month's totals, and because only the current category name is stored, the contract must carry enough metadata for a consumer to state that the series is recomputed and that labels are current. No caching or durability claim is made.

## Capabilities

### New Capabilities

None. This change extends the existing reporting capability; it introduces no new capability path.

### Modified Capabilities

- `reporting`: the requirement that forbids combining months is modified to permit a bounded, explicitly ranged multi-month read whose per-month values stay single-month and whose period total covers flow measures only. The exclusion requirement is modified to name the new bounded range as permitted while keeping comparison, percentage change, trend fields, and every other excluded concept unavailable.

## Impact

- **API:** new endpoint under `apps/api/src/reports/` plus routing in `apps/api/src/app.ts` and `apps/api/src/server.ts`; new range parser alongside the existing single-month parser, which stays backward compatible.
- **Contract:** `apps/api/openapi.yaml` gains the route and its schemas. The document's `components` nesting was corrected in `90661d9`, so new schemas can now resolve.
- **Data:** no schema change and no migration. Everything is derived from existing effective history and transfer rows.
- **Web:** no change in this change. Deferring the surface is deliberate: the previous change stayed open long enough that its own delta specs never reached canonical form, and keeping this one small and closeable is the cheaper governance path. The surface is a separate later change.
- **Unchanged by design:** `ReportService.read`, account balances, Ready to Assign, the canonical monthly summary, category rollover, and the single-month endpoint's contract and behaviour.

## Non-goals

- No month-to-month comparison, percentage change, delta, or trend field.
- No chart or visualization, in this change or its contract.
- No period export.
- No change to the single-month mode's response shape, error codes, or success payload. The route's query surface does change: `from` and `to` stop being rejected as unknown parameters, because they now select the range mode. That supersede is explicit in this change's design and tests rather than silent.
- No rollover or Available series. The report accounting model has no rollover, and mixing it with budget availability would juxtapose two different accounting models.
- No per-month category labels. Only the current name is stored, so this is not implementable; the contract must say so rather than imply otherwise.
- No caching or durable snapshot of the series.
- No targets, scheduled transactions, reconciliation, cards, or splits.

## Success criteria

- An owner can request one bounded range and receive one entry per month in ascending order, with no month silently omitted and empty months present as explicit zeros.
- Each month's values are identical to what the single-month endpoint returns for that same month, for the same budget and revision.
- The period total equals the sum of the per-month flow measures it covers, and structurally cannot include the pending-release stock.
- Transfers continue to contribute nothing to income, expense, or category spending, in every month and in the total, while remaining visibly reported.
- A range longer than the cap is rejected rather than served.
- The series is served from a single snapshot, so the months and the returned version describe one consistent revision.
- The canonical reporting requirement is modified rather than contradicted, and `report-policy/v2` is approved and recorded.

## Open items for the owner at this gate

1. Approve or reject this proposal's scope, and with it the API-first, surface-later split.
2. Approve or reject `report-policy/v2` as described, including the exclusion of the pending-release measure from the period total.
3. Confirm the remainder of the exclusion boundary in the modified requirement: comparison, percentage change, and trend fields stay out of this change.
