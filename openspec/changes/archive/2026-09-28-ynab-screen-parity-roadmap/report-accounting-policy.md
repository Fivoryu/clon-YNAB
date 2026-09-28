# Report Accounting Policy (Approved)

Policy identifier: `report-policy/v1`
Approved: 2026-09-28 by the project owner (explicit human decision).
Change: `ynab-screen-parity-roadmap`.
Scope: the single-month basic report defined by Work Units 3 and 4 only.

This record resolves the report hard gate in `tasks.md`. It chooses classification, presentation, and contribution semantics; it does not itself implement anything and it does not amend canonical MVP documents.

## Decision summary

| In-scope record class | Contribution to report measures | Required visibility |
| --- | --- | --- |
| Transfers (`Transfer` rows, between budget accounts) | None. Excluded from income, from expense, and from category spending. | Dedicated "Transfers" section listing each transfer once with source account, destination account, date, and amount, plus a subtotal labelled as outside the income/expense totals. |
| `WORKING` transactions | Included in their own measure: `INCOME` adds to income, `SPENDING` adds to expense and to that category's spending. | Per-row provisional marker plus a visible provisional count and provisional income/expense subtotals. |
| Pending/unreleased income | The full realized `INCOME` amount counts in the income measure. Release is an assignment decision, not a re-measure of income. | Visible release breakdown for the month: received, released, and pending/unreleased, labelled as pending release. |

## Non-negotiable rules

- No in-scope record may be silently omitted. Every transfer, every `WORKING` record, and every unreleased-income remainder must be visible with the treatment above.
- Transfers never contribute to income, expense, or category spending, and never alter canonical category-budget results.
- `INCOME_RELEASE`, `ASSIGNMENT`, `UNASSIGNMENT`, and `MOVE` are budgeting movements, not report income or expense. They never add to `incomeMinor` or `expenseMinor`.
- The transfer ledger events `TRANSFER_OUT`/`TRANSFER_IN` are never treated as income or expense; the single canonical `Transfer` row is the only transfer representation in the report.
- Transaction lifecycle status (`POSTED` vs `WORKING`) is never conflated with income-release state (released vs pending release).
- No multi-month aggregation, comparison, or trend contract is exposed.
- If the policy identifier cannot be resolved, the endpoint must return an explicit unavailable state and no totals at all.

## Measure definitions for a single budget month `M`

Computed from canonical effective history (`foldEffectiveHistory`) over `INCOME`/`SPENDING`, plus `Transfer` rows selected by their stored `month`.

- `incomeMinor(M)` = sum of `INCOME.amountMinor` where `month = M` (`POSTED` and `WORKING`).
- `expenseMinor(M)` = sum of `SPENDING.amountMinor` where `month = M` (`POSTED` and `WORKING`).
- `categories[].spendingMinor(M)` = per-category sum over the same `SPENDING` set, preserving archived category labels for historical spending.
- `incomeRelease(M)` = `{ receivedMinor: incomeMinor(M), releasedMinor: sum of INCOME_RELEASE.amountMinor where month = M, pendingMinor: receivedMinor - releasedMinor }`.
- `transfers(M)` = the `Transfer` rows whose stored `month` is `M`, one entry each; `totalMinor` = sum of their `amountMinor`, labelled as outside totals.
- `provisional(M)` = the `WORKING` subset of the month: `{ count, incomeMinor, expenseMinor }`.
- `policy` = `{ id: "report-policy/v1", month: M }` accompanying every successful response.

## Limits and known state

- Every existing account is a budget account (`CASH` or `CHECKING`). There is no tracking or external account kind, so every transfer is internal and contributes nothing by construction. Introducing a non-budget account kind invalidates this policy and requires re-approval.
- No production command currently writes `status: 'WORKING'`; the persisted type and eligibility checks allow it. The policy governs such a record regardless, and Work Unit 3 must exercise it with an explicitly constructed working record rather than assuming it is unreachable.
- `reconciled` records are outside eligibility and are not in scope for this report.
- All monetary values remain integer minor units at the API boundary; formatting stays in the web layer.

## Verification obligations

Work Unit 3 tests must prove, from this exact policy: owner authorization, `YYYY-MM` validation, single-month selection only, per-category spending, distinct income and expense measures, policy/treatment metadata presence, transfer visibility with zero contribution to totals, `WORKING` inclusion with provisional metadata, unreleased-income breakdown, no silent omission, no partial totals, and no transfer effect on canonical category-budget results. Work Unit 4 tests must prove the same treatment is visible and accessible in the UI and that no comparison or trend control exists.
