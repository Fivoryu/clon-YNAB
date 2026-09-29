## ADDED Requirements

### Requirement: Multi-month report view is reachable in the authenticated experience

An authenticated budget owner MUST have a discoverable path from the existing product experience to the multi-month view of the bounded report series. The path MUST remain reachable on compact layouts, not only from the desktop sidebar. The view and its entry MUST NOT imply trend analysis, month-to-month comparison, percentage change, report export, or reporting capability beyond the bounded series, and the entry copy MUST describe what the view actually presents.

#### Scenario: Owner opens the multi-month view

- GIVEN an authenticated owner is using the product
- WHEN the owner navigates to the multi-month view
- THEN the bounded report series for the chosen range is reachable
- AND the view and its navigation entry describe months presented side by side rather than trend analysis

#### Scenario: The multi-month view is reachable on a compact layout

- GIVEN the viewport is compact and the desktop sidebar is not displayed
- WHEN an authenticated owner navigates the product
- THEN the multi-month view remains reachable without relying on the desktop sidebar

## MODIFIED Requirements

### Requirement: Basic monthly report is reachable in the authenticated experience

An authenticated budget owner MUST have a discoverable path from the existing product experience to the basic report for a selected month. The single-month report entry MUST NOT imply report export or financial behavior outside the reporting requirements defined by this specification. A separately specified multi-month view MAY additionally be reachable, and the single-month entry MUST NOT be required to expose it and MUST NOT gain multi-month behavior within itself.

#### Scenario: Owner opens the basic monthly report

- GIVEN an authenticated owner is using the product
- WHEN the owner navigates to the basic report and selects a budget month
- THEN the report for that single month is reachable and its selected period is clear
- AND the single-month report itself presents no multi-month trends or comparisons
