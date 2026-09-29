## ADDED Requirements

### Requirement: A category may carry one target definition

The system MUST allow an authenticated owner to set, replace, and remove at most one target per category within a budget. A target MUST declare a kind of `MONTHLY_SET_ASIDE` or `BALANCE_BY_DATE` and a positive integer amount in minor units. A `BALANCE_BY_DATE` target MUST declare a target month as `YYYY-MM`; a `MONTHLY_SET_ASIDE` target MUST NOT declare one. The system MUST reject a target for a category outside the owning budget, an unsupported kind, a non-positive or unsafe amount, a malformed target month, and a target month supplied for the set-aside kind. Removing a target that does not exist MUST be reported as not found. An archived category MUST retain its existing target as read-only and MUST NOT accept a new or changed target.

#### Scenario: An owner sets a monthly set-aside target

- GIVEN an authenticated owner has a category in their budget
- WHEN the owner sets a `MONTHLY_SET_ASIDE` target with a positive amount and no target month
- THEN the target is stored for that category
- AND it is reported with the category in the owner's summary

#### Scenario: An owner sets a balance-by-date target

- GIVEN an authenticated owner has a category in their budget
- WHEN the owner sets a `BALANCE_BY_DATE` target with a positive amount and a `YYYY-MM` target month
- THEN the target is stored for that category with its target month

#### Scenario: An invalid target definition is rejected

- GIVEN an authenticated owner is setting a category target
- WHEN the definition has an unsupported kind, a non-positive or unsafe amount, a malformed target month, a target month on the set-aside kind, or no target month on the dated kind, or the category belongs to another budget
- THEN the system MUST reject the request and MUST store no target

#### Scenario: An archived category keeps its target read-only

- GIVEN a category with a target is archived
- WHEN the owner attempts to set, replace, or remove that target
- THEN the system MUST reject the change
- AND the existing target MUST remain readable

### Requirement: A target never changes a financial value

Creating, replacing, removing, or evaluating a target MUST NOT change Ready to Assign, Assigned, Activity, Available, any account balance, or any financial event. A target definition MUST NOT be represented as money, as an assignment, or as a transaction. Applying a target's suggestion MUST require an explicit owner action and MUST use the existing assignment command; the system MUST NOT move money on its own.

#### Scenario: Setting and removing a target leaves every financial value unchanged

- GIVEN an owner has a budget with categories and history
- WHEN the owner sets a target and later removes it
- THEN Ready to Assign, Assigned, Activity, Available, and every account balance MUST be unchanged from before the target existed

#### Scenario: A suggestion is never applied automatically

- GIVEN a category has a target with a positive remaining gap
- WHEN the owner views the budget without confirming anything
- THEN no assignment MUST be created and no financial value MUST change

### Requirement: Target state is derived for a requested month

For a requested budget month the system MUST derive, for every category that has a target, the progress, the remaining gap as a non-negative amount, and a status. A `MONTHLY_SET_ASIDE` target's progress MUST be the month's assigned amount and MUST NOT include carried-over money. A `BALANCE_BY_DATE` target's progress MUST be the month's available amount. The status MUST be `MET` when progress reaches the target amount, `OVERDUE` when the target is a `BALANCE_BY_DATE` whose target month precedes the requested month while progress is below the amount, and `UNDERFUNDED` otherwise. Target state MUST be derived from the same revision as the category values reported beside it and MUST NOT be persisted as a running total. A change to a target MUST change the revision reported with the summary, so a client cannot hold a summary whose target state contradicts the revision it carries.

#### Scenario: A monthly set-aside ignores carried-over money

- GIVEN a category has a monthly set-aside target and a positive available amount carried from an earlier month
- WHEN the requested month has nothing assigned to that category
- THEN the progress MUST be zero and the status MUST NOT be met

#### Scenario: A balance-by-date target counts the available amount

- GIVEN a category has a balance-by-date target
- WHEN the requested month's available amount, including carry, reaches the target amount
- THEN the status MUST be met

#### Scenario: A past-dated underfunded target is overdue

- GIVEN a category has a balance-by-date target whose target month precedes the requested month
- WHEN the available amount is below the target amount
- THEN the status MUST be overdue rather than merely not met

#### Scenario: A target change changes the reported revision

- GIVEN an owner holds a summary at some revision
- WHEN the owner sets or removes a target
- THEN the revision reported with the summary MUST change
- AND the summary MUST NOT be able to carry target state that contradicts its own revision

#### Scenario: Removing a target removes its state

- GIVEN a category has a target
- WHEN the owner removes it
- THEN the category MUST report no target state for any month
