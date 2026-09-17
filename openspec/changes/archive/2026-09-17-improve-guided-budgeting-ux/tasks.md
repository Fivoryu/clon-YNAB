# Tasks: Improve Guided Budgeting UX

## Implementation status

This task list records the completed implementation of the guided UX plan. All implementation tasks are complete and intentionally marked `[x]`.

## 1. Route and application-shell architecture

- [x] Replace component-local workspace section navigation with real Next.js routes for `/login`, `/register`, `/setup`, `/budget`, `/transactions`, `/accounts`, and `/settings/data`.
- [x] Add an authenticated application shell with desktop navigation and a compact/mobile navigation pattern exposing Budget, Transactions, Accounts, and Settings.
- [x] Ensure refresh/deep-link/browser navigation derives the visible product area from the URL rather than an `activeSection` state variable.

## 2. Authentication and resume flow

- [x] Add automatic session/bootstrap handling so an existing authenticated user resumes setup or the authenticated application without an extra manual action.
- [x] Separate registration and login intents into dedicated routes/surfaces.
- [x] Continue successful registration into an authenticated onboarding flow without requiring the user to enter credentials a second time.
- [x] Remove the manual `Start or resume setup` interaction from the user journey.

## 3. Guided onboarding

- [x] Rework setup into semantic account, category, and review stages that emphasize one primary decision at a time without numbered step copy.
- [x] Resume onboarding from persisted setup state after reload instead of restarting client defaults.
- [x] Restore previously saved account/setup values when onboarding resumes.
- [x] Replace comma-separated category setup with individually understandable category entries/interactions.

## 4. Money presentation boundary

- [x] Introduce shared decimal-money parsing/formatting so users enter and read normal decimal values while API commands retain safe integer minor units.
- [x] Remove user-facing `minor units` terminology from ordinary account, budget, and transaction workflows.
- [x] Avoid assuming a currency symbol because the current domain does not configure currency.

## 5. Budget-centered planning

- [x] Merge the previous Overview and Plan concepts into the primary `/budget` screen.
- [x] Load the selected month's server summary automatically and support month navigation without manual dashboard/summary load buttons.
- [x] Present Ready to Assign, account total, and category Assigned/Activity/Available using server-derived values.
- [x] Replace separate global Assign/Unassign/Move forms with category-context interactions.
- [x] Expose category create, rename, and archive management from the budgeting experience after onboarding.

## 6. Unified transactions and history

- [x] Merge routine activity entry and history into `/transactions` and load history automatically on entry.
- [x] Add a single `Nueva transacción` interaction that supports Spending, Income, and Transfer and renders only kind-relevant fields.
- [x] Reuse the transaction interaction pattern for eligible edits and use explicit confirmation for deletion.
- [x] Keep simple history/search visible by default and move account/kind/category/date controls behind optional advanced filters.
- [x] Refresh authoritative history/summary/account state after successful transaction mutations instead of maintaining client-side financial projections.

## 7. Persistent pending income

- [x] Remove transient `latestIncome` component memory as the authority for releasable income.
- [x] Discover unreleased income from persisted authoritative history/state so the release affordance survives reload.
- [x] Keep pending-income discovery independent from visible transaction-history filters.

## 8. Account management

- [x] Rework `/accounts` around active/archived account state and readable server-derived balances.
- [x] Move account creation/archive actions into contextual management interactions rather than always-visible parallel forms.
- [x] Preserve server authority for balances and archived-account restrictions.

## 9. Settings and CSV

- [x] Move CSV import/export out of primary everyday navigation into `/settings/data`.
- [x] Preserve the existing canonical CSV contract, validation, idempotency, optimistic versioning, atomicity, and server authority.
- [x] Refresh authoritative application state after successful imports and keep only safe early client checks such as obvious file-size validation.

## 10. Feedback, state ownership, language, and accessibility

- [x] Replace one global message/state pattern with workflow-scoped pending, validation, error, and success feedback.
- [x] Prevent duplicate submissions while mutations are in flight and clear/reset local form state after successful operations where appropriate.
- [x] Move individual form state into the screen/dialog that owns it and keep shared hooks focused on session and authoritative product data/mutations.
- [x] Use Spanish user-facing copy and remove backend implementation terminology from normal workflows.
- [x] Add responsive navigation behavior and accessible dialog/form semantics for keyboard, labels, loading/error state, and focus management.

## 11. Code structure and regression verification

- [x] Decompose the previous monolithic web workflow into bounded authentication, setup, shell/navigation, budget, transaction, account, settings/data, money, and feedback components/hooks.
- [x] Update web contract/component tests for route-based navigation, guided onboarding, decimal money, contextual categories, unified transactions, persistent pending income, and CSV under Settings.
- [x] Update Playwright journey coverage for the new navigation and interaction model.
- [x] Run the available backend regression suite and confirm the UX refactor does not change financial/API semantics; record infrastructure-dependent PostgreSQL/build/E2E limitations separately where the execution environment cannot provide them.
- [x] Package the updated project without transient `node_modules`, build output, Playwright reports, environment secrets, or cache artifacts.
