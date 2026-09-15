# Delta for Reporting

## ADDED Requirements

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
