# Report Accounting Policy v2 (Multi-Month Addendum)

Policy identifier: `report-policy/v2`
Approved: 2026-09-28 by the project owner, with the proposal of `add-multi-month-trends`.
Relation to v1: **additive**. This record does not replace, weaken, or reinterpret `report-policy/v1`.
Scope: the bounded multi-month report series and its period total only.

`report-policy/v1` remains the governing authority for every single-month measure and for the existing single-month endpoint. `report-policy/v1` states that no multi-month aggregation contract is exposed and is scoped to the single-month report; that statement is superseded **only** for the bounded series defined here, and only once this record is in force.

## What v1 continues to govern unchanged

Every month entry inside a series is the single-month report for that month. Its measures, values, and treatments are exactly the v1 definitions, unchanged:

- `incomeMinor(M)` = sum of `INCOME.amountMinor` where `month = M`, `POSTED` and `WORKING` included.
- `expenseMinor(M)` = sum of `SPENDING.amountMinor` where `month = M`, `POSTED` and `WORKING` included.
- `categories[].spendingMinor(M)` = per-category sum over the same `SPENDING` set, with the current (not historical) category label.
- Transfers contribute nothing to income, expense, or category spending, and appear once each in their own section labelled as outside the totals.
- `WORKING` records are included and marked provisional with a count and provisional subtotals.
- `incomeRelease(M)` = `{ receivedMinor, releasedMinor, pendingMinor }`, with the full realized income counted in `incomeMinor` regardless of release.
- `INCOME_RELEASE`, `ASSIGNMENT`, `UNASSIGNMENT`, `MOVE`, and the `TRANSFER_OUT`/`TRANSFER_IN` ledger events never add to income or expense.

No month entry may be altered by its membership in a series. Adding a series MUST NOT change what the single-month endpoint returns for the same month and revision.

## What v2 defines, and nothing more

### Range

- The range is explicit and inclusive: `from` and `to`, both `YYYY-MM`, with `from <= to`.
- The range length MUST NOT exceed **24 months**. A longer range is rejected with a validation error. The system MUST NOT clamp, truncate, or partially serve an over-long range.
- The series contains exactly one entry per month in the range, ascending. A month with no activity is present with explicit zero values and MUST NOT be omitted.

### Period total

The period total is the sum, over every month in the range, of the following flow measures:

- `incomeMinor`
- `expenseMinor`
- `categories[].spendingMinor`, summed per category identity
- `provisional` count, income, and expense
- the transfers subtotal

The period total MUST be labelled with the treatment `PERIOD_TOTAL_FLOW_MEASURES_ONLY`, and its transfers subtotal MUST remain labelled as outside the income and expense totals.

### The period total MUST NOT include the pending-release measure

`pendingMinor` is a **stock**, not a flow. It is the unreleased remainder of income received up to a point in time. Summing it across months is not a flow sum and can produce a misleading result: income received in January and released in February yields `+X` in January and `-X` in February, so a summed stock reports zero for a period in which real income was received and fully released. Therefore:

- The period total carries **no** pending-release field.
- Each month entry still carries its own complete `incomeRelease` breakdown, so nothing is hidden.
- A consumer that wants a period-level pending figure must derive it from the monthly entries and is responsible for the resulting semantics; the contract does not offer it.

This is the only place where the series deliberately refuses to aggregate a measure that its own months report.

## Disclosure obligations

The multi-month response MUST identify the accounting policy and its version, the requested range, the revision the series was produced from, and MUST carry metadata stating that:

- the series is recomputed from effective history, so a later ordinary transaction edit or delete can change a previously reported month; and
- category labels are the **current** budget labels, not the labels in effect during each reported month; and
- the series is not a durable or immutable financial record, and MUST NOT be persisted or cached as one.

## Limits and known state

- Only the current category name is stored, so per-month historical labels are not implementable. The disclosure above is the honest substitute, not a temporary gap.
- Rollover and Available are outside the report accounting model and MUST NOT appear in a series or its total. Mixing them with report measures would juxtapose two different accounting models.
- Every request reads the whole budget history, so a series MUST be produced from **one** snapshot read followed by in-memory per-month projections. Reading once per month is forbidden: it would multiply cost by the range length and would break the single-revision guarantee.
- A series may be requested for months outside the range in which the budget had any activity; such months are explicit zeros.
- All monetary values remain integer minor units at the API boundary.

## Verification obligations

Tests must prove, from this exact record: ascending order with exactly one entry per month and no omissions; each entry identical to the single-month report for that month and revision; the period total equals the sum of the covered flow measures; the period total contains no pending-release field; an over-long range is rejected and not partially served; a month releasing income received earlier still reports its own breakdown while the total is unaffected; transfers remain visible and contribute nothing; a foreign user receives no values; and the disclosure metadata is present.
