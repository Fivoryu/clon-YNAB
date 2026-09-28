# Delta for Reporting

This delta describes the proposed initial tranche under review. It does not change the existing academic MVP decision documents.

## ADDED Requirements

### Requirement: Single-month basic report

The system MUST make an owner-authorized basic report available for one selected budget month. The report MUST present spending by category and make income and expenses separately discernible for that month. It MUST identify the selected month and MUST NOT combine months, compare multiple months, or present multi-month trends. Report calculations MUST use an explicitly approved accounting policy; this requirement does not define new financial formulas.

#### Scenario: Owner views a selected month's basic report

- GIVEN an authorized owner selects one budget month
- WHEN the owner views the basic report
- THEN the report identifies that month and presents category-level spending and distinct income and expense information for that month
- AND it does not include multi-month trends or comparisons

### Requirement: Transfers and working or pending transactions are accounted for in the basic report

The basic monthly report MUST account visibly for supported transfers and working or pending transactions that fall within the selected month's report scope. It MUST NOT silently omit them. Their classification, presentation, and contribution to any report measure MUST follow an explicitly approved report accounting policy and MUST be clear from the report. This requirement does not choose that policy or authorize transfers to be represented as categorized spending or to alter canonical category-budget calculations.

#### Scenario: Selected month contains transfers and working or pending transactions

- GIVEN the selected month contains supported transfer activity and working or pending transactions
- WHEN the owner views the basic report
- THEN the report makes their presence and treatment clear according to the approved report accounting policy
- AND none is silently omitted or implicitly assigned an unapproved contribution to a report measure
- AND transfer activity does not change canonical category-budget calculations

## MODIFIED Requirements

### Requirement: Unsupported reporting concepts are excluded

The dashboard and canonical monthly summary MUST NOT present partial or misleading representations of splits, cards, reconciliation, targets, scheduled transactions, future income, refunds/reimbursements/returns, ordinary transaction edit/delete, cleared/uncleared workflows, shared or multiple budgets, or broader card/overspending formulas. The basic single-month report MAY account for supported transfers and working or pending transactions only within the explicit scope and reporting policy defined by the added requirements in this delta. That scoped reporting treatment MUST NOT imply a cleared/uncleared or reconciliation workflow, multi-month reporting, or broader support for an otherwise excluded capability. All other excluded concepts remain unavailable in reports.

#### Scenario: A deferred reporting concept is requested

- GIVEN a user requests a report dimension or control outside the basic single-month report's defined scope
- WHEN the system handles the request
- THEN it MUST reject or clearly identify the capability as unavailable and MUST preserve supported report values
- AND it MUST NOT imply support for multi-month trends, targets, scheduled transactions, reconciliation, cards, or another excluded concept
