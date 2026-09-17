# Delta for Guided Budgeting UX

## ADDED Requirements

### Requirement: Route-based product navigation

The web application SHALL expose dedicated routes for authentication, onboarding, budgeting, transactions, accounts, and data settings. Authenticated everyday navigation SHALL present Budget, Transactions, Accounts, and Settings as the primary product areas. The application SHALL preserve the active destination across refresh and browser back/forward navigation and SHALL NOT rely on a component-local section selector as the sole navigation state.

#### Scenario: Refresh preserves an authenticated destination

- GIVEN an authenticated user is viewing `/transactions`
- WHEN the browser is refreshed
- THEN the application SHALL restore the authenticated transaction experience at `/transactions` without routing through an unrelated workspace section

#### Scenario: Browser history follows product navigation

- GIVEN an authenticated user navigates from Budget to Accounts to Transactions
- WHEN the user presses the browser Back control
- THEN the application SHALL return to Accounts using the URL history

### Requirement: Automatic session resume and low-friction registration

The application SHALL check for an existing valid session during bootstrap. A returning authenticated user SHALL continue to the appropriate setup or application route without pressing a manual resume button. Successful registration SHALL continue as an authenticated session into onboarding without requiring a second credential submission.

#### Scenario: Registration continues directly to onboarding

- GIVEN no existing account/session
- WHEN a user submits valid registration credentials
- THEN the application SHALL establish the authenticated flow and continue to `/setup` without asking the user to sign in again

#### Scenario: Existing session resumes automatically

- GIVEN a valid existing session and completed setup
- WHEN the user opens the application
- THEN the application SHALL enter the authenticated product without displaying a “start/resume setup” control

### Requirement: Guided resumable onboarding

Setup SHALL present the primary account decision, category decision, and completion review as sequential semantic stages. The application SHALL NOT display all setup forms as equal-priority controls at once. Setup progress SHALL use descriptive labels rather than requiring numbered step copy. Reloading setup SHALL reconstruct the active stage and previously persisted setup values from authoritative state.

#### Scenario: Persisted account setup survives reload

- GIVEN a user has already saved the setup account but has not completed categories
- WHEN `/setup` is reloaded
- THEN the category stage SHALL be active and the persisted account name/type/balance SHALL remain available for review instead of reverting to client defaults

#### Scenario: Only the relevant setup decision is emphasized

- GIVEN a new user is configuring the first account
- WHEN the setup screen renders
- THEN category-completion controls SHALL NOT compete as an equally prominent form with the account decision

### Requirement: Human-readable decimal money presentation

All user-facing money inputs and outputs SHALL use decimal monetary values. The web SHALL convert decimal input to safe integer minor units before invoking existing API commands and SHALL format server minor-unit values back to decimals for display. Normal product UI SHALL NOT require the user to enter or interpret “minor units”. The UI SHALL NOT invent a currency symbol while no currency is configured in the domain.

#### Scenario: Decimal spending input maps to minor units

- GIVEN a user enters `125.50` as a spending amount
- WHEN the transaction command is submitted
- THEN the web SHALL send the equivalent integer minor-unit amount according to the shared money conversion utility and SHALL NOT send a floating-point financial authority

#### Scenario: Server balance is shown without implementation terminology

- GIVEN the server returns an account balance in minor units
- WHEN the account is rendered
- THEN the UI SHALL show its decimal representation and SHALL NOT label it as “minor units”

### Requirement: Budget-centered planning surface

The primary Budget route SHALL automatically load the selected month's authoritative summary and SHALL present Ready to Assign, account total, and category Assigned, Activity, and Available values without a manual load action. Month navigation SHALL refresh the server-derived summary. Category allocation and lifecycle actions SHALL be initiated contextually from the relevant category rather than requiring separate global Assign, Unassign, and Move forms.

#### Scenario: Budget opens with useful state immediately

- GIVEN setup is complete
- WHEN the user opens `/budget`
- THEN the selected month summary and categories SHALL load without a `Load dashboard` or `Load month summary` action

#### Scenario: Category assignment is contextual

- GIVEN a category row is visible in Budget
- WHEN the user chooses to adjust its assignment
- THEN the interaction SHALL originate from that category and the resulting displayed values SHALL be refreshed from the server

#### Scenario: Category lifecycle remains available after setup

- GIVEN setup is complete
- WHEN the user needs another category or needs to rename/archive an existing category
- THEN those actions SHALL be available from the Budget experience using existing authorized category commands

### Requirement: Unified transaction creation and history experience

The Transactions route SHALL automatically load effective transaction history and SHALL expose one primary action for creating a transaction. The creation interaction SHALL allow the user to choose Spending, Income, or Transfer and SHALL render only fields relevant to that kind. Eligible ordinary transaction editing SHALL reuse the transaction interaction pattern, and deletion SHALL require an explicit confirmation. Advanced filters SHALL remain available without dominating the default history view.

#### Scenario: One action creates different transaction kinds

- GIVEN the user is viewing Transactions
- WHEN `Nueva transacción` is activated
- THEN the user SHALL be able to select Spending, Income, or Transfer without navigating to three parallel forms

#### Scenario: History loads automatically

- GIVEN an authenticated user opens `/transactions`
- WHEN the route renders
- THEN effective history SHALL be requested automatically and SHALL NOT require a `Load history` button

#### Scenario: Advanced filters are optional

- GIVEN the user only wants to inspect recent transactions
- WHEN Transactions renders
- THEN the normal history/search surface SHALL be usable without first interacting with account/kind/category/date filter controls

### Requirement: Persistent unreleased-income guidance

The application SHALL discover unreleased income from authoritative persisted data rather than transient “latest income” component memory. Pending-income guidance and the release action SHALL survive browser reload. The discovery query SHALL be independent from the user's visible transaction-history filters so filtering the history cannot accidentally hide a releasable income.

#### Scenario: Reload does not lose release opportunity

- GIVEN an income was recorded and remains unreleased
- WHEN the application is reloaded
- THEN the user SHALL still receive a visible release affordance based on authoritative data

#### Scenario: History filter does not hide pending income

- GIVEN unreleased income exists
- AND the visible history is filtered to spending or another account/date range
- WHEN the filter is applied
- THEN pending-income guidance SHALL remain available independently of the filtered history result

### Requirement: Focused account management

The Accounts route SHALL present account state as the primary content, distinguish active from archived accounts, and show server-derived decimal balances. Creating or archiving an account SHALL be a contextual management action rather than one of several always-visible command forms. Client-provided balances SHALL NOT become authoritative.

#### Scenario: Active and archived accounts are understandable

- GIVEN a budget has active and archived accounts
- WHEN `/accounts` renders
- THEN the UI SHALL distinguish those states and SHALL preserve readable historical/account information without offering archived accounts as ordinary transaction targets

### Requirement: CSV tools live under Settings

Manual CSV import/export SHALL remain available but SHALL be presented under `/settings/data` rather than as an equal primary everyday navigation destination. The existing CSV server contract, validation, idempotency, versioning, atomicity, and financial authority SHALL remain unchanged.

#### Scenario: Everyday navigation is not dominated by data administration

- GIVEN an authenticated user is navigating the application
- WHEN the primary navigation renders
- THEN Budget, Transactions, Accounts, and Settings SHALL be primary destinations and CSV SHALL be reached through Settings/Data

### Requirement: Scoped interaction feedback

Each mutation workflow SHALL expose its own pending, validation, failure, and success state. While a mutation is pending, accidental duplicate submission SHALL be prevented. User-correctable validation SHALL appear close to the relevant input/action, while successful mutations MAY use a non-blocking notification. Unrelated forms SHALL NOT inherit stale input or status from another workflow.

#### Scenario: Pending submit cannot be duplicated

- GIVEN a transaction create request is in flight
- WHEN the user attempts to submit the same form again
- THEN the initiating control SHALL be disabled or otherwise guarded until the first request completes

#### Scenario: Account error does not pollute transaction UI

- GIVEN account creation fails validation
- WHEN the user later opens the transaction interaction
- THEN the account form's local error/input state SHALL NOT appear as transaction state

### Requirement: User-facing Spanish and hidden implementation terminology

Normal user-facing copy SHALL be Spanish and SHALL describe budgeting concepts rather than backend DTO/command terminology. Internal identifiers and API field names MAY remain English in source code, but the product SHALL NOT require users to understand terms such as `minor units`, raw DTO names, or implementation-specific history semantics.

#### Scenario: Financial value uses product language

- GIVEN the API exposes internal field names such as `amountMinor`
- WHEN the value is shown to the user
- THEN the UI SHALL use the appropriate Spanish product label and formatted decimal value rather than the raw field name

### Requirement: Responsive and accessible application shell

Authenticated navigation SHALL remain usable on desktop and compact/mobile layouts while preserving the same information architecture. Interactive dialogs/drawers SHALL expose accessible labels, support keyboard operation, manage focus appropriately, and return focus to the initiating control when closed. Loading/error states SHALL use appropriate disabled and accessibility semantics.

#### Scenario: Mobile navigation exposes the same product areas

- GIVEN the viewport is compact
- WHEN the authenticated application shell renders
- THEN Budget, Transactions, Accounts, and Settings SHALL remain reachable without relying on the desktop sidebar

#### Scenario: Dialog returns focus

- GIVEN the user opens the new-transaction interaction from its trigger
- WHEN the interaction is cancelled or completed
- THEN focus SHALL return to an appropriate initiating or next logical control

### Requirement: Web decomposition preserves server authority

The web implementation SHALL separate session/bootstrap, budgeting, transactions, accounts, settings/data, money presentation, and local form state into bounded components/hooks. A single root page/component SHALL NOT own all product form state. Financial summary calculations, account balances, transaction effects, RTA, category Activity, Assigned, Available, and rollover SHALL remain server-derived.

#### Scenario: UI refactor does not create a second financial engine

- GIVEN a successful transaction or category allocation mutation
- WHEN the UI refreshes
- THEN displayed financial values SHALL be taken from refreshed API DTOs rather than recalculated as authoritative client state

### Requirement: Journey-based regression coverage

Automated web coverage SHALL validate the user journeys introduced by this change, including registration-to-onboarding, session resume, onboarding continuation, budget/category interactions, unified transaction creation, persistent pending-income release, account management, CSV under Settings, and real route navigation. Existing backend financial/API regression coverage SHALL continue to pass without requiring changed financial semantics.

#### Scenario: UX refactor preserves backend behavior

- GIVEN the guided UX implementation is present
- WHEN backend regression tests execute
- THEN existing financial, persistence, authorization, transfer, history, and CSV behaviors SHALL remain compatible with their established contracts
