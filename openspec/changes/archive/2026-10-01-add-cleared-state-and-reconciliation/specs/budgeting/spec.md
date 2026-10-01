## ADDED Requirements

### Requirement: Cleared state and reconciliation preserve budgeting conservation

A cleared-state transition MUST be financially neutral: it MUST NOT change Ready to Assign, Assigned, Activity, Available, any account's working balance, `accountBalanceMinor`, or any transfer measure.

A reconciliation adjustment MUST change the reconciled account's working balance and cleared balance by exactly the confirmed difference, and MUST NOT enter Ready to Assign, realized income, spending, category Activity, Assigned, Available, or any transfer measure. A reconciliation adjustment is an account-state correction and is NOT an assignable realized fund: the system MUST NOT present it in the canonical monthly summary, the single-month report, the multi-month series, or any report measure, and MUST NOT treat it as money available to assign. A reconciliation that produces no adjustment MUST change no financial value beyond the reconciled lock.

Because a reconciliation adjustment changes the aggregate account balance without changing Ready to Assign, it changes the divergence between them by exactly its amount. That divergence MUST be a documented, inspectable limit of this scope rather than a silent repair: the system MUST NOT mask it by inventing a Ready-to-Assign component and MUST NOT adjust it on its own. The contract is about the CHANGE in the divergence and its explainability, not about the absolute gap: the gap between the aggregate account balance and Ready to Assign also reflects structural differences such as unreleased income and permitted carry, so requiring the absolute gap to equal the cumulative adjustment would be wrong. What MUST hold is that a recorded adjustment moves the gap by exactly its signed amount, and that the cumulative adjustment accounts for the whole of any change in that gap that reconciliation caused.

#### Scenario: Cleared and uncleared movements leave every budgeting value unchanged

- GIVEN a budget with accounts, categories, and history
- WHEN a transaction is marked cleared and later uncleared
- THEN Ready to Assign, Assigned, Activity, Available, every working balance, the aggregate account balance, and every transfer measure MUST be unchanged

#### Scenario: A reconciliation adjustment moves only the reconciled account's balances

- GIVEN a reconciliation confirms an external balance that differs from the computed cleared balance
- WHEN the owner confirms the adjustment with a reason
- THEN the reconciled account's working and cleared balances MUST move by exactly the difference
- AND Ready to Assign, realized income, spending, category Activity, Assigned, Available, every other account's balance, and every transfer measure MUST be unchanged

#### Scenario: A reconciliation without an adjustment changes no financial value

- GIVEN a reconciliation confirms an external balance equal to the computed cleared balance
- WHEN the reconciliation completes
- THEN Ready to Assign, Assigned, Activity, Available, every account balance, and every transfer measure MUST be unchanged

#### Scenario: A mismatch is never repaired silently

- GIVEN a reconciliation confirms an external balance that differs from the computed cleared balance
- WHEN the owner does not confirm an adjustment
- THEN no adjustment, no balance movement, and no Ready-to-Assign change MUST occur

#### Scenario: The plan-and-account divergence is a documented limit

- GIVEN a reconciliation adjustment has been recorded on an account
- WHEN the aggregate account balance and Ready to Assign are inspected together, before and after that adjustment
- THEN the CHANGE in the difference between them MUST equal the signed amount of the recorded adjustment
- AND the absolute difference between them MUST NOT be required to equal the cumulative adjustment, because that difference also reflects structural amounts such as unreleased income and permitted carry
- AND no Ready-to-Assign component, report measure, or summary field MUST have been invented to absorb either one

## MODIFIED Requirements

### Requirement: Categorized spending

The system MUST support categorized spending against the supported account, MUST decrease the account working balance atomically, and MUST record signed category Activity in the month determined by the transaction date and budget timezone.

#### Scenario: Spending is recorded

- GIVEN a supported account and an active category
- WHEN the owner records realized categorized spending
- THEN the account effect and category Activity effect MUST commit together in the same budget and month

#### Scenario: Unsupported transaction behavior is unavailable

- GIVEN the transaction workflow
- WHEN a user attempts splits, future income, refunds/reimbursements/returns, cleared or uncleared states outside the account cleared-and-reconciliation scope, reconciliation outside that scope, or another capability outside the supported transaction scope
- THEN the system MUST reject or clearly mark the capability unavailable and MUST not apply an inferred financial effect

### Requirement: RTA source and explainability

The system MUST calculate RTA from realized funds that are assignable (including the opening balance and realized income explicitly released for assignment), permitted prior carry, and current assignments; it MUST exclude unreleased income and MUST not subtract categorized spending twice. A reconciliation adjustment MUST NOT be included in Ready to Assign: it is an account-state correction rather than an assignable realized fund, so it MUST NOT be an RTA input, MUST NOT be presented in any summary or report, and MUST NOT be corrected silently. Any divergence it creates between the aggregate account balance and Ready to Assign MUST remain documented and inspectable rather than absorbed.

#### Scenario: RTA components reconcile

- GIVEN an opening balance, released and unreleased realized income, permitted prior carry, and current assignments
- WHEN the owner requests RTA
- THEN RTA MUST include only assignable realized funds and permitted carry less assignments, while unreleased income remains excluded and categorized spending is not subtracted a second time
- AND a recorded reconciliation adjustment MUST NOT appear among the RTA inputs and MUST NOT change RTA
