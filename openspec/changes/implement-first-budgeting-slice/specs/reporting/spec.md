# Reporting Specification

## Purpose

Expose a dashboard and monthly summary that explain the same authoritative budgeting state without introducing unsupported features.

## ADDED Requirements

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

The dashboard and monthly summary MUST NOT present partial or misleading representations of splits, transfers, cards, reconciliation, targets, scheduled transactions, future income, refunds/reimbursements/returns, ordinary transaction edit/delete, cleared/pending/uncleared states, shared or multiple budgets, or broader card/overspending formulas.

#### Scenario: A deferred concept is requested

- GIVEN a user requests a report dimension or control for an excluded capability
- WHEN the system handles the request
- THEN it MUST reject or clearly identify the capability as unavailable and MUST preserve supported report values
