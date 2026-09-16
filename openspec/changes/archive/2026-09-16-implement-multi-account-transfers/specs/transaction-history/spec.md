# Delta for Transaction History

## ADDED Requirements

### Requirement: Transfer history is included without changing ordinary history semantics

The system MUST include authorized same-budget account transfers in `/transactions` as `kind: "TRANSFER"`. Each item MUST expose its distinct transfer identity, business date, positive amount, and source and destination accounts. Transfer records MUST participate in the existing date-descending, creation-time-descending ordering and budget-timezone month filtering. Existing income, spending, and category `MOVE` meanings MUST remain unchanged.

#### Scenario: Transfer history is listed

- GIVEN an authorized owner has a committed account transfer
- WHEN the owner requests `/transactions`
- THEN the transfer MUST be returned as one identifiable `TRANSFER` record with both account sides and no category `MOVE` classification

#### Scenario: Transfer history is month-filtered

- GIVEN a transfer whose date is assigned to a budget month by the budget timezone
- WHEN the owner requests that month
- THEN the transfer MUST be included, and it MUST be excluded from other month results

### Requirement: Transfer history remains protected and bounded

Transfer history MUST remain readable after either account is archived, but this change MUST NOT add ordinary transfer edit or delete behavior, payee or memo fields, CSV workflows, splits, cards, reconciliation, or other deferred transaction capabilities. Unauthorized history requests MUST retain established non-disclosing behavior.

#### Scenario: Archived transfer remains readable

- GIVEN a historical transfer involving an account that is now archived
- WHEN its authorized owner lists or reads history
- THEN the transfer MUST remain visible with stable account and transfer identity references

#### Scenario: Transfer correction is not available

- GIVEN a committed transfer
- WHEN a user attempts to edit or delete it through ordinary transaction-history mutation
- THEN the request MUST be rejected without changing either paired effect or the transfer record
