# Budget Setup Specification

## Purpose

Let one user create and resume a personal first-slice budget with one supported cash/checking-style account and editable categories.

## Requirements

### Requirement: One personal budget

The system MUST allow each user to own at most one budget in this slice and MUST prevent creation or selection of shared or additional budgets.

#### Scenario: The owner creates a budget

- GIVEN an authenticated user without a budget
- WHEN the user starts budget setup
- THEN the system MUST create a budget owned by that user and MUST associate setup progress with it

#### Scenario: A second budget is attempted

- GIVEN an authenticated user who already owns a budget
- WHEN the user attempts to create another budget
- THEN the system MUST reject the attempt without changing either budget

### Requirement: Resumable setup

The system MUST persist setup progress safely, allow the owner to leave before completion, and resume deterministically without duplicating financial effects or categories.

#### Scenario: Partial setup is resumed

- GIVEN an owner has saved only part of the setup
- WHEN the owner returns and resumes setup
- THEN the system MUST show the saved state and allow continuation from that state

#### Scenario: Retrying saved setup is safe

- GIVEN setup progress has already been saved
- WHEN the owner repeats the same setup submission
- THEN the system MUST not duplicate the account, opening balance, or starter categories

### Requirement: Supported account and opening balance

The system MUST support exactly one cash/checking-style account for the first slice and MUST apply its explicit opening balance as authoritative integer minor units.

#### Scenario: Opening balance is recorded

- GIVEN an owner is configuring the supported account
- WHEN the owner submits an opening balance
- THEN the system MUST record the balance in integer minor units and include it in the account's working balance atomically

#### Scenario: Unsupported account breadth is unavailable

- GIVEN the first-slice budget
- WHEN a user attempts to add another account or use card, transfer, or reconciliation behavior
- THEN the system MUST reject or clearly mark that capability unavailable and MUST not create partial financial effects

### Requirement: Editable starter categories

The system MUST provide an editable starter category set and MUST allow the owner to create, rename, and archive categories while preserving historical references; an archived category MUST NOT receive new applicable activity or assignments.

#### Scenario: Starter categories are edited during setup

- GIVEN starter categories have been provisioned
- WHEN the owner renames, archives, or creates categories
- THEN the resulting category set MUST reflect those changes without rewriting historical references

#### Scenario: Archived category is used for new activity

- GIVEN a category is archived
- WHEN a user attempts to assign money to it or categorize new supported spending to it
- THEN the system MUST reject the new applicable activity and leave existing history intact

### Requirement: Setup completion boundary

The system MUST make a budget usable only after the required first-slice setup state is complete, while preserving the owner's ability to resume incomplete setup.

#### Scenario: Incomplete setup is accessed

- GIVEN required setup information is missing
- WHEN the owner returns to the budget
- THEN the system MUST present the budget as incomplete and provide a deterministic continuation path

#### Scenario: Completed setup is accessed

- GIVEN required setup information has been saved successfully
- WHEN the owner accesses the budget
- THEN the system MUST provide the first-slice budgeting workflow
