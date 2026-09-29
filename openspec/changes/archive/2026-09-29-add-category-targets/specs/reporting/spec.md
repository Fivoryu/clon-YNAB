## ADDED Requirements

### Requirement: Category target state appears in the dashboard and monthly summary

The dashboard and the canonical monthly summary MUST present, for every category that has a target, the target kind, the target amount, the target month where the kind declares one, the progress, the remaining gap as a non-negative amount, and the status, all derived from the same revision as the category values reported beside them. Target state MUST NOT be presented as a report measure, as income, as expense, as a transfer, or as a flow, and MUST NOT be summed into any reported total. The single-month report and the multi-month report series MUST NOT present category target state. Because no target history is retained, a target shown while viewing a past month reflects the current definition, and the presentation MUST state that rather than implying the target was in force during that month.

#### Scenario: The summary shows target state beside the category values

- GIVEN an owner's budget has a category with a target and a summary is requested for one month
- WHEN the summary renders
- THEN the category reports its kind, amount, target month where applicable, progress, remaining gap, and status
- AND those values are consistent with the same revision as the category's assigned and available amounts

#### Scenario: The report endpoints present no target state

- GIVEN a budget has categories with targets
- WHEN the single-month report or the multi-month series is requested
- THEN neither response MUST contain any category target kind, amount, progress, remaining gap, or status

#### Scenario: A past month discloses that the current definition is shown

- GIVEN a category has a target today and the owner views an earlier month
- WHEN the target state renders for that month
- THEN the presentation MUST state that the target shown is the current definition and that no target history is retained

## MODIFIED Requirements

### Requirement: Unsupported reporting concepts are excluded

The dashboard and canonical monthly summary MUST NOT present partial or misleading representations of splits, cards, reconciliation, scheduled transactions, future income, refunds/reimbursements/returns, ordinary transaction edit/delete, cleared/uncleared workflows, shared or multiple budgets, or broader card/overspending formulas. The basic single-month report MAY account for supported transfers and working or pending transactions only within the explicit scope and reporting policy defined by the added requirements in this specification, and the bounded multi-month report series MAY present months side by side only within the explicit range, per-month projection, and flow-only period total defined by the added requirements in this specification, and MAY be accompanied by a chart that renders only measures already present in the response and adds no derived or comparative value while an equivalent accessible table remains authoritative. The dashboard and canonical monthly summary MAY present category target state within the explicit scope defined by the added requirements in this specification, and that presentation MUST NOT be treated as a report measure, as money, or as a flow. Neither treatment MUST imply a cleared/uncleared or reconciliation workflow, month-to-month comparison, percentage change, trend fields, targets within the single-month report or the multi-month series, or broader support for an otherwise excluded capability. All other excluded concepts remain unavailable in reports.

#### Scenario: A deferred concept is requested

- GIVEN a user requests a report dimension or control for an excluded capability or outside the defined single-month, bounded multi-month, or category target scope
- WHEN the system handles the request
- THEN it MUST reject or clearly identify the capability as unavailable and MUST preserve supported report values
- AND it MUST NOT imply support for month-to-month comparison, percentage change, trend fields, targets within reports, scheduled transactions, reconciliation, cards, or another excluded concept
