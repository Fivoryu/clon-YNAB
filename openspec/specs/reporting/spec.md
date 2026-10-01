# Reporting Specification

## Purpose

Define owner-authorized dashboard and monthly reporting projections that are reproducible from authoritative financial history and preserve account and transfer semantics.

## Requirements

### Requirement: Reports expose account detail and preserve transfer neutrality

Owner-authorized budget projections and summaries MUST expose per-account balances through the canonical `accounts[]` projection alongside aggregate `accountBalanceMinor`. Reports MUST derive these values from PostgreSQL-authoritative account and transfer history. Transfers MUST be visible as account balance movements when account detail is requested, but MUST not change ordinary category Activity, Assigned, Available, or RTA values.

#### Scenario: A multi-account summary is requested

- GIVEN a budget with multiple accounts and a committed transfer
- WHEN the owner requests its summary
- THEN per-account balances and aggregate `accountBalanceMinor` MUST be consistent with authoritative history, while ordinary category and RTA values remain unchanged

#### Scenario: Derived reporting state is rebuilt

- GIVEN a summary or account balance projection is stale or absent
- WHEN it is rebuilt from PostgreSQL history
- THEN the same per-account balances, aggregate balance, and transfer-neutral category values MUST be reproduced without client totals

### Requirement: Archived accounts remain historical report subjects

Reports and history MUST continue to represent prior activity for archived accounts, while new account movements and transfers involving those accounts MUST be rejected. No report may infer unsupported card, split, reconciliation, import, payee, memo, or broader YNAB behavior.

#### Scenario: Archived account history is reported

- GIVEN an account with historical effects is archived
- WHEN the owner requests account detail or transaction history
- THEN prior effects MUST remain readable and included in authoritative derived balances

### Requirement: Dashboard reflects canonical state

The system MUST provide an owner-only dashboard showing server-calculated account balance, RTA, Assigned, Activity, and Available values for the supported budget context, with component values kept distinct.

#### Scenario: Owner views the dashboard

- GIVEN an authenticated owner with a usable budget
- WHEN the owner opens the dashboard
- THEN the displayed values MUST be derived from the canonical budgeting state and MUST be consistent with the corresponding monthly summary

#### Scenario: Dashboard is requested by a foreign user

- GIVEN a dashboard belonging to another user's budget
- WHEN a non-owner requests it
- THEN the system MUST return a non-disclosing not-found result and MUST expose no values

### Requirement: Monthly summary is reproducible

The system MUST provide a month-specific summary for the budget timezone, MUST include the supported account and category effects and their explainable components, and MUST be reproducible from authoritative movement and allocation history rather than client-provided totals.

#### Scenario: A month is summarized

- GIVEN authoritative opening balance, realized income, spending, assignments, and applicable rollover history
- WHEN the owner requests a supported budget month
- THEN the summary MUST consistently calculate account balance, RTA, Assigned, Activity, and Available from that history

#### Scenario: Derived data is rebuilt

- GIVEN derived summary data is missing, stale, or discarded
- WHEN the system rebuilds the supported month
- THEN it MUST reproduce the same canonical values from authoritative history without accepting client balances as repair input

### Requirement: Unsupported reporting concepts are excluded

The dashboard and canonical monthly summary MUST NOT present partial or misleading representations of splits, cards, reconciliation, scheduled transactions, future income, refunds/reimbursements/returns, ordinary transaction edit/delete, cleared/uncleared workflows, shared or multiple budgets, or broader card/overspending formulas. The dashboard and canonical monthly summary MUST NOT present a cleared balance, a cleared or uncleared state, a reconciliation workflow, reconciliation state, or a reconciliation adjustment as a report measure, as income, as expense, as category spending, as a Ready-to-Assign component, or as a flow. The basic single-month report MAY account for supported transfers and working or pending transactions only within the explicit scope and reporting policy defined by the added requirements in this specification, and the bounded multi-month report series MAY present months side by side only within the explicit range, per-month projection, and flow-only period total defined by the added requirements in this specification, and MAY be accompanied by a chart that renders only measures already present in the response and adds no derived or comparative value while an equivalent accessible table remains authoritative. The dashboard and canonical monthly summary MAY present category target state within the explicit scope defined by the added requirements in this specification, and that presentation MUST NOT be treated as a report measure, as money, or as a flow. The account surface MAY present cleared state and manual reconciliation only within the explicit scope defined by the added requirements in the transaction-history specification. Neither treatment MUST imply month-to-month comparison, percentage change, trend fields, targets within the single-month report or the multi-month series, or broader support for an otherwise excluded capability. A transaction created by scheduled generation MUST be accounted for as an ordinary transaction of its flow, and a schedule itself MUST NOT be presented as a transaction, a measure, or a flow. All other excluded concepts remain unavailable in reports.

#### Scenario: A deferred concept is requested

- GIVEN a user requests a report dimension or control for an excluded capability, or a cleared balance, cleared state, reconciliation state, or reconciliation workflow inside a report, or another capability outside the defined single-month, bounded multi-month, category target, or account cleared-and-reconciliation scope
- WHEN the system handles the request
- THEN it MUST reject or clearly identify the capability as unavailable and MUST preserve supported report values
- AND it MUST NOT imply support for month-to-month comparison, percentage change, trend fields, targets within reports, cleared state or reconciliation inside a report, scheduled transactions, cards, or another excluded concept

### Requirement: Single-month basic report

The system MUST make an owner-authorized basic report available for one selected budget month. The report MUST present spending by category and make income and expenses separately discernible for that month. It MUST identify the selected month. A single-month report MUST NOT combine months, compare multiple months, or present multi-month trends within itself. Combining months is permitted only through the separately specified bounded multi-month report series, whose every per-month value MUST remain the single-month report for that month. Report calculations MUST use an explicitly approved accounting policy; this requirement does not define new financial formulas.

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
