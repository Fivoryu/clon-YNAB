## MODIFIED Requirements

### Requirement: Bounded transaction-history scope

The capability SHALL support owner-authorized posted or working, not-reconciled realized income and one-category spending, nullable metadata, bounded filters, the approved same-budget transfer history projection, cleared-state transitions, and manual reconciliation with reconciled locking, each only within the explicit scope defined by the requirements in this specification. Transfers remain visible but are not editable or deletable as to their financial content. It MUST NOT provide splits, multiple-account transfer mutation, payee/memo behavior beyond the normalized metadata contract, repetition, closed-month corrections, unlocking or correction of reconciled history, import matching against reconciled history, CSV/import workflows, banking synchronization, cards, refunds, schedules, or audit-read behavior, and SHALL NOT alter the approved transfer aggregate/effect model. Schedule management is provided by the scheduled-transactions capability rather than by this one, and a transaction created by that capability is an ordinary transaction governed by the scope defined here.

#### Scenario: Unsupported history capability remains unavailable

- GIVEN a user attempts a split, card, schedule, refund, CSV import, banking synchronization, an unlock or correction of reconciled history, import matching, or another capability outside the bounded history scope
- WHEN the request reaches transaction-history behavior
- THEN the capability MUST remain unavailable and the approved effective history and transfer model MUST remain unchanged
