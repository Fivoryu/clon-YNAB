# scheduled-transactions Specification

## Purpose
Provide an owner-authorized way to plan a monthly future register item that has no plan effect before its occurrence, and to turn each eligible occurrence into exactly one ordinary transaction through an explicit, idempotent generation request, without background execution, without a second authority for "has this occurrence happened", and without representing schedules as transactions or as reported values.

## Requirements

### Requirement: A schedule is a future plan with no effect before its occurrence

The system SHALL let an owner create, list, and remove a schedule for the owning budget that describes a future register item for exactly one account and, for a spending flow, exactly one category. A schedule MUST record its account, its flow, a positive integer amount in minor units, optional payee and memo, the day of the month it falls on, its interval in whole months, and the calendar date of its first occurrence. A schedule MUST NOT change any account balance, Activity, Available, Assigned, Ready to Assign, or any financial event before its occurrence, and MUST NOT be presented as a transaction or as a reported measure.

#### Scenario: A schedule has no effect before its occurrence

- GIVEN an owner's budget has a schedule whose first occurrence has not arrived
- WHEN any balance, plan, summary, or report value is calculated
- THEN the account balance, Activity, Available, Assigned, and Ready to Assign MUST be identical to their values without the schedule
- AND no financial event MUST exist for the schedule

#### Scenario: An invalid schedule is rejected

- GIVEN a schedule request
- WHEN its account or category is unknown, belongs to another budget, or is archived, its amount is not a positive safe integer in minor units, its flow is income and carries a category, its flow is spending and omits one, its day of the month is outside one to thirty-one, its interval is outside one to twelve months, or its first occurrence date is not a calendar date
- THEN the request MUST be rejected with `VALIDATION_ERROR` without creating a schedule

#### Scenario: A removed schedule stops generating

- GIVEN an existing schedule
- WHEN the owner removes it
- THEN it MUST no longer appear in the budget's schedules
- AND no later generation request MUST create an occurrence for it
- AND any occurrence already generated MUST remain as ordinary transaction history

### Requirement: Occurrence dates are bounded monthly calendar dates

A schedule's occurrences SHALL be calendar dates in the budget timezone, spaced by its interval in whole months, beginning with its first occurrence date. When the day of the month exceeds the number of days in an occurrence month, that occurrence MUST fall on the month's last day, and an occurrence generated for a clamped month MUST NOT shift the day used by later occurrences. Occurrence dates MUST be derived from the schedule's own definition and MUST NOT be derived from the current time.

#### Scenario: A day beyond the month's length clamps to the last day

- GIVEN a schedule whose day of the month is thirty-one
- WHEN its occurrences are derived for a month with thirty days
- THEN that occurrence MUST fall on the month's last day
- AND the following occurrence MUST use the schedule's declared day of the month again

#### Scenario: February clamps in a non-leap year

- GIVEN a schedule whose day of the month is above twenty-eight
- WHEN its occurrences are derived for a February of a non-leap year
- THEN that occurrence MUST fall on the twenty-eighth

#### Scenario: An interval longer than one month skips the intervening months

- GIVEN a schedule whose interval is three months
- WHEN its occurrences are derived
- THEN consecutive occurrences MUST be three calendar months apart

### Requirement: Generation creates exactly one ordinary transaction per eligible occurrence

An owner-authorized generation request SHALL accept an inclusive cut-off date and create, for every occurrence of the budget's schedules that falls on or before that date, exactly one ordinary posted income or spending transaction carrying the schedule's account, category where the flow is spending, amount, payee, and memo. Each created transaction MUST follow the ordinary validation, authorization, budget-engine, atomicity, and idempotency rules of the existing transaction commands. A generated transaction MUST be created posted and MUST be created uncleared, except that a transaction generated into a cash account MUST be created cleared. Generation MUST NOT create an occurrence that falls after the supplied cut-off date.

#### Scenario: One eligible occurrence produces one ordinary transaction

- GIVEN a schedule with one occurrence on or before the supplied cut-off date
- WHEN the owner requests generation
- THEN exactly one posted transaction MUST exist for that occurrence with the schedule's account, category where applicable, amount, payee, and memo
- AND its account and plan effects MUST be the ordinary effects of that transaction

#### Scenario: A cash account's generated transaction is cleared

- GIVEN a schedule whose account is a cash account
- WHEN an occurrence is generated
- THEN the generated transaction MUST be created cleared
- AND a transaction generated into any other supported account kind MUST be created uncleared

#### Scenario: An occurrence after the cut-off date is not generated

- GIVEN a schedule whose next occurrence falls after the supplied cut-off date
- WHEN the owner requests generation
- THEN no transaction MUST be created for that occurrence

### Requirement: Generation is idempotent and replay-safe per occurrence

Every occurrence MUST have a stable identity derived from its schedule and its occurrence date, and generation MUST submit the existing ordinary transaction command with that identity as its budget-scoped idempotency key. Replaying the same or an overlapping generation range MUST return the saved outcome for an already generated occurrence and MUST NOT create a second transaction, financial effect, or receipt. Concurrent attempts to generate the same occurrence MUST produce exactly one transaction. A failed generation MUST leave no partially created occurrence and MUST remain safely retryable. The system MUST NOT persist a separate generation cursor: the record of a generated occurrence is the ordinary command's own outcome record.

#### Scenario: The same range generated twice does not duplicate effects

- GIVEN a generation request that created an occurrence
- WHEN an identical or overlapping generation request is made
- THEN the transaction, its account and plan effects, and the number of outcome records MUST be unchanged

#### Scenario: A retry after a failure creates each missing occurrence exactly once

- GIVEN a generation request that failed partway through a schedule's eligible occurrences
- WHEN the owner retries the same request
- THEN exactly one transaction MUST exist for every eligible occurrence, and none MUST exist twice

#### Scenario: Concurrent generation of one occurrence produces one transaction

- GIVEN the same occurrence is generated by two attempts at once
- WHEN both attempts complete
- THEN exactly one transaction MUST exist for that occurrence

### Requirement: Generated transactions are ordinary history

A transaction created by generation MUST be indistinguishable from an ordinary transaction of the same flow for every downstream behaviour, including effective-history projection, account and plan effects, the monthly summary, and reports. The system MUST NOT retain a distinction that changes how a generated transaction is reported, and MUST NOT present a schedule inside the dashboard, the canonical monthly summary, or either report.

#### Scenario: A generated transaction projects like an ordinary transaction

- GIVEN a generated transaction and an ordinary transaction with the same flow, account, category, amount, and date
- WHEN account balances, the monthly summary, and the reports are calculated
- THEN both MUST contribute identically

#### Scenario: A schedule is not presented in any report or summary

- GIVEN a budget has schedules
- WHEN the monthly summary, the single-month report, or the multi-month series is requested
- THEN the response MUST NOT contain any schedule field, and MUST NOT identify any transaction as scheduled

### Requirement: Bounded scheduled-transaction scope

The capability SHALL support owner-authorized monthly schedules with one account and, for spending, one category; listing a budget's schedules; removing a schedule; and explicit owner-triggered generation up to an inclusive cut-off date, each only within the explicit scope defined by the requirements in this specification. It MUST NOT provide background execution, a scheduler, a worker, or posting without an explicit generation request; editing an existing schedule; editing or deleting a generated occurrence other than through the ordinary transaction rules; weekly, annual, end-of-month-flagged, or custom recurrence; more than one account or category per schedule; transfers, splits, cards, refunds, reimbursements, or loans; cross-budget schedules; or any presentation of a schedule as a transaction, a plan value, or a reported measure.

#### Scenario: Unsupported scheduling capability remains unavailable

- GIVEN a user attempts background posting, editing an existing schedule, a weekly or annual recurrence, a schedule spanning more than one account or category, or another capability outside the bounded scheduled scope
- WHEN the request reaches scheduled-transaction behavior
- THEN the capability MUST remain unavailable and the ordinary transaction, transfer, and cleared-state models MUST remain unchanged

### Requirement: Stable envelopes and non-disclosing authorization for schedules

Schedule success and error responses MUST use the established API envelopes and stable semantics, and schedule mutations MUST be owner-authorized, budget-scoped, and idempotent. An incompatible idempotency reuse MUST return `CONFLICT` without mutation. Foreign or inaccessible budgets, accounts, categories, and schedules MUST follow the existing non-disclosing behaviour and reveal neither existence nor financial details.

#### Scenario: Foreign schedule resource remains undisclosed

- GIVEN an authenticated user references a budget, account, category, or schedule owned by another user
- WHEN the user attempts a schedule read or mutation
- THEN the established non-disclosing response MUST be returned without exposing existence or financial details
