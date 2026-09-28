# Delta for Guided Budgeting UX

This delta describes the proposed initial tranche under review. It does not change the existing academic MVP decision documents.

## ADDED Requirements

### Requirement: Account activity is reachable in account context

The authenticated owner MUST be able to open an account detail/activity view from the existing Accounts experience. The view MUST make the selected account identifiable, show its server-derived account balance, and present history in that account's context. It MUST preserve the established account and transaction-history semantics; it MUST NOT imply support for new account kinds or unsupported transaction workflows.

#### Scenario: Owner opens account activity

- GIVEN an authenticated owner is viewing the account list
- WHEN the owner opens a supported account
- THEN account detail and activity for that account are reachable without losing the selected-account context
- AND the displayed balance is server-derived

### Requirement: Basic monthly report is reachable in the authenticated experience

An authenticated budget owner MUST have a discoverable path from the existing product experience to the basic report for a selected month. The report entry MUST NOT imply multi-month trends, report export, or financial behavior outside the reporting requirements defined by this change.

#### Scenario: Owner opens the basic monthly report

- GIVEN an authenticated owner is using the product
- WHEN the owner navigates to the basic report and selects a budget month
- THEN the report for that single month is reachable and its selected period is clear
- AND the path does not expose multi-month reporting as part of this initial tranche
