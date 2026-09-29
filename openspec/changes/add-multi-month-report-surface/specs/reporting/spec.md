## ADDED Requirements

### Requirement: Multi-month series is presented with visible disclosures and a flow-only total

The system MUST present the bounded multi-month report series to an authenticated owner in a form that keeps every month individually identifiable and MUST NOT alter or omit a month's established per-month report treatment. A month with no recorded income, spending, or transfers MUST be present and labelled as having no recorded activity. The period total MUST be presented separately from the month entries and labelled as covering flow measures only; transfers MUST remain separately presented and labelled as outside it, and no period pending-release figure MUST be computed or displayed anywhere. The presentation MUST render, as visible text, that the series is recomputed from effective history so a later ordinary transaction edit or delete can change a previously reported month, that reported category labels are the current budget labels rather than the labels in effect during each reported month, and that the series is not a durable record; it MUST also identify the accounting policy and its version, the per-month policy basis, the requested range, and the revision the series was produced from. A chart MAY accompany the presentation only if it renders measures already present in the response, adds no derived or comparative value, and an equivalent accessible data table remains available and authoritative. An invalid range, or a range exceeding the approved maximum, MUST be reported and MUST leave no series or totals on screen.

#### Scenario: Owner views a bounded multi-month series

- GIVEN an authenticated owner has requested a valid inclusive range within the approved maximum
- WHEN the multi-month view renders
- THEN every month in the range is present in ascending order, each retaining its established per-month treatment
- AND the period total is presented separately and labelled as covering flow measures only

#### Scenario: The range contains a month without recorded activity

- GIVEN the requested range contains a month with no income, spending, or transfers
- WHEN the multi-month view renders
- THEN that month is present and explicitly labelled as having no recorded activity rather than being absent or blank

#### Scenario: The reader is told what the series cannot claim

- GIVEN the multi-month view has rendered a series
- WHEN the reader inspects the disclosures
- THEN the view states that the series is recomputed from effective history and can change after an ordinary transaction edit or delete
- AND it states that category labels are the current ones rather than the labels in effect during each reported month
- AND it states that the series is not a durable record
- AND it identifies the accounting policy, the per-month policy basis, the requested range, and the revision

#### Scenario: A chart accompanies the series

- GIVEN the multi-month view renders a chart
- WHEN the reader uses assistive technology or cannot perceive the chart
- THEN an equivalent accessible data table presents the same measures
- AND the chart renders no derived, comparative, percentage, or trend value

#### Scenario: The requested range is invalid or too long

- GIVEN the owner supplies an inverted, malformed, or over-long range
- WHEN the multi-month view handles the request
- THEN the problem is reported to the reader
- AND no series, totals, or stale previous result remain on screen

## MODIFIED Requirements

### Requirement: Unsupported reporting concepts are excluded

The dashboard and canonical monthly summary MUST NOT present partial or misleading representations of splits, cards, reconciliation, targets, scheduled transactions, future income, refunds/reimbursements/returns, ordinary transaction edit/delete, cleared/uncleared workflows, shared or multiple budgets, or broader card/overspending formulas. The basic single-month report MAY account for supported transfers and working or pending transactions only within the explicit scope and reporting policy defined by the added requirements in this specification, and the bounded multi-month report series MAY present months side by side only within the explicit range, per-month projection, and flow-only period total defined by the added requirements in this specification, and MAY be accompanied by a chart that renders only measures already present in the response and adds no derived or comparative value while an equivalent accessible table remains authoritative. Neither treatment MUST imply a cleared/uncleared or reconciliation workflow, month-to-month comparison, percentage change, trend fields, or broader support for an otherwise excluded capability. All other excluded concepts remain unavailable in reports.

#### Scenario: A deferred concept is requested

- GIVEN a user requests a report dimension or control for an excluded capability or outside the defined single-month or bounded multi-month report scope
- WHEN the system handles the request
- THEN it MUST reject or clearly identify the capability as unavailable and MUST preserve supported report values
- AND it MUST NOT imply support for month-to-month comparison, percentage change, trend fields, targets, scheduled transactions, reconciliation, cards, or another excluded concept
