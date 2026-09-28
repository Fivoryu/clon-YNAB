# Delta for Transaction History

This delta describes the proposed initial tranche under review. It does not change the existing academic MVP decision documents.

## ADDED Requirements

### Requirement: Older account history remains reachable beyond bounded results

An authorized owner MUST be able to reach available supported history for a selected account beyond the current 500-item result cap. A bounded history response MAY continue to contain at most 500 records, but the account-history experience MUST NOT make older matching records unreachable because of that cap. The continuation mechanism, request shape, and batch size are left to design.

#### Scenario: Owner reaches history older than the first 500 records

- GIVEN an account has more than 500 available supported history records
- WHEN its owner continues through that account's activity history beyond the initial result window
- THEN the owner can reach older matching records beyond the first 500
- AND the records remain associated with the correct account and retain the canonical transaction-history meaning
- AND no individual result is required to exceed the existing 500-record bound
