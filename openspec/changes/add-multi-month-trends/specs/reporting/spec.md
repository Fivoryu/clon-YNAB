## ADDED Requirements

### Requirement: Bounded multi-month report series

The system MUST make an owner-authorized multi-month report series available for an explicit inclusive month range whose length does not exceed an approved maximum. It MUST return exactly one entry per month in the range, in ascending order, and MUST NOT omit a month for lack of activity; a month with no income, spending, or transfers MUST appear with explicit zero values. Each entry MUST be the single-month report for that month under the same approved accounting policy, and MUST NOT be altered by its membership in a series. The series MUST include a period total limited to flow measures: income, expense, per-category spending, provisional income and expense, and the transfers subtotal. The period total MUST NOT include the pending-release measure, because that measure is a stock and not a flow. Transfers MUST NOT contribute to income, expense, category spending, or to the period total of those measures. The system MUST reject a request whose range exceeds the approved maximum rather than serving a partial or silently clamped result. Every month in a series, and the revision reported with it, MUST originate from one consistent revision of the budget's financial state.

#### Scenario: Owner requests a bounded multi-month range

- GIVEN an authorized owner has supported history in several months
- WHEN the owner requests an inclusive range within the approved maximum
- THEN exactly one entry per month in that range is returned in ascending order, each identical to the single-month report for that same month and revision
- AND the period total equals the sum of the per-month flow measures it covers

#### Scenario: The range contains a month without activity

- GIVEN the requested range contains a month with no income, spending, or transfers
- WHEN the series is returned
- THEN that month is present with explicit zero values rather than omitted

#### Scenario: The requested range exceeds the approved maximum

- GIVEN a requested range longer than the approved maximum
- WHEN the owner requests it
- THEN the system rejects the request and returns no partial series

#### Scenario: The range contains transfers

- GIVEN the requested range contains supported transfer activity
- WHEN the series and its period total are returned
- THEN transfers remain visible under their approved treatment
- AND the transfer total does not contribute to income, expense, category spending, or to the period total of those measures

#### Scenario: A month releases income received earlier

- GIVEN a month in the range releases income that was received in an earlier month
- WHEN the period total is returned
- THEN the pending-release measure is absent from the period total while that month still reports its own release breakdown
- AND the period total remains a sum of flow measures only

#### Scenario: A foreign user requests a multi-month series

- GIVEN a multi-month series belongs to another user's budget
- WHEN a non-owner requests it
- THEN the system MUST return a non-disclosing result and MUST expose no values

### Requirement: Multi-month series discloses recomputation and current labels

The multi-month response MUST identify the approved accounting policy and its version, the requested range, and the revision from which the series was produced. It MUST carry enough metadata for a consumer to state that the series is recomputed from effective history, so a later ordinary transaction edit or delete can change a previously reported month, and that reported category labels are the current budget labels rather than the labels in effect during each reported month. The system MUST NOT present, persist, or cache the series as a durable or immutable financial record.

#### Scenario: A consumer renders a returned series

- GIVEN an owner has requested a bounded range
- WHEN the series is returned
- THEN the response identifies the accounting policy and its version, the range, and the revision
- AND it carries metadata stating that the series is recomputed from effective history and that category labels are the current ones

## MODIFIED Requirements

### Requirement: Single-month basic report

The system MUST make an owner-authorized basic report available for one selected budget month. The report MUST present spending by category and make income and expenses separately discernible for that month. It MUST identify the selected month. A single-month report MUST NOT combine months, compare multiple months, or present multi-month trends within itself. Combining months is permitted only through the separately specified bounded multi-month report series, whose every per-month value MUST remain the single-month report for that month. Report calculations MUST use an explicitly approved accounting policy; this requirement does not define new financial formulas.

#### Scenario: Owner views a selected month's basic report

- GIVEN an authorized owner selects one budget month
- WHEN the owner views the basic report
- THEN the report identifies that month and presents category-level spending and distinct income and expense information for that month
- AND it does not include multi-month trends or comparisons

### Requirement: Unsupported reporting concepts are excluded

The dashboard and canonical monthly summary MUST NOT present partial or misleading representations of splits, cards, reconciliation, targets, scheduled transactions, future income, refunds/reimbursements/returns, ordinary transaction edit/delete, cleared/uncleared workflows, shared or multiple budgets, or broader card/overspending formulas. The basic single-month report MAY account for supported transfers and working or pending transactions only within the explicit scope and reporting policy defined by the added requirements in this change, and the bounded multi-month report series MAY present months side by side only within the explicit range, per-month projection, and flow-only period total defined by the added requirements in this change. Neither treatment MUST imply a cleared/uncleared or reconciliation workflow, month-to-month comparison, percentage change, trend fields, or broader support for an otherwise excluded capability. All other excluded concepts remain unavailable in reports.

#### Scenario: A deferred concept is requested

- GIVEN a user requests a report dimension or control for an excluded capability or outside the defined single-month or bounded multi-month report scope
- WHEN the system handles the request
- THEN it MUST reject or clearly identify the capability as unavailable and MUST preserve supported report values
- AND it MUST NOT imply support for month-to-month comparison, percentage change, trend fields, targets, scheduled transactions, reconciliation, cards, or another excluded concept
