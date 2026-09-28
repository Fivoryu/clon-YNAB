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

The dashboard and canonical monthly summary MUST NOT present partial or misleading representations of splits, cards, reconciliation, targets, scheduled transactions, future income, refunds/reimbursements/returns, ordinary transaction edit/delete, cleared/uncleared workflows, shared or multiple budgets, or broader card/overspending formulas. The basic single-month report MAY account for supported transfers and working or pending transactions only within the explicit scope and reporting policy defined by the added requirements in this delta. That scoped reporting treatment MUST NOT imply a cleared/uncleared or reconciliation workflow, multi-month reporting, or broader support for an otherwise excluded capability. All other excluded concepts remain unavailable in reports.

#### Scenario: A deferred concept is requested

- GIVEN a user requests a report dimension or control for an excluded capability or outside the basic single-month report's defined scope
- WHEN the system handles the request
- THEN it MUST reject or clearly identify the capability as unavailable and MUST preserve supported report values
- AND it MUST NOT imply support for multi-month trends, targets, scheduled transactions, reconciliation, cards, or another excluded concept

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
