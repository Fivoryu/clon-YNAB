# Proposal: Improve Guided Budgeting UX

## Intent

Reorganize the web application around the budgeting decisions a person makes instead of the backend commands that happen to implement those decisions. The change keeps the existing visual language and all financial/API invariants, while replacing the previous single-page, operation-heavy workflow with guided authentication, resumable onboarding, real application routes, task-oriented budgeting screens, a unified transaction flow, contextual account/category management, and lower-friction feedback.

This change is a presentation and interaction rearchitecture. It MUST NOT change the authoritative financial equations, transaction semantics, account/transfer behavior, CSV contract, authorization model, idempotency model, or PostgreSQL ownership boundaries.

## Business problem

The previous UI exposed too much implementation detail. Registration and sign-in shared one surface, a signed-in user still had to explicitly start/resume setup, setup displayed multiple unrelated inputs at once, everyday navigation mirrored technical modules (`Overview`, `Plan`, `Activity`, `History`, `Data`), money was displayed as minor units, history/dashboard data required manual load actions, and related operations were split across parallel forms.

These choices made the application technically functional but cognitively expensive. A user had to understand concepts such as assign/unassign/move, release income, minor units, server history loading, and CSV data management before understanding the budgeting task itself.

## Product outcome

A new user can register and move directly into a guided setup. A returning user resumes the correct authenticated destination automatically. After setup, the application presents four clear product areas: Budget, Transactions, Accounts, and Settings. The Budget view answers what money is available and what it is assigned to; Transactions answers what happened to the money; Accounts answers where the money is held; Settings contains occasional administrative tools such as CSV import/export.

Money is entered and displayed as normal decimal values while the existing API continues using integer minor units internally. The application loads routine data automatically, places advanced controls behind contextual affordances, and uses one transaction entry flow for spending, income, and transfers.

## Capabilities

1. **Real application navigation**
   - Use dedicated routes for authentication, setup, budget, transactions, accounts, and data settings.
   - Preserve the current destination across refresh and browser back/forward navigation.
   - Provide an authenticated application shell with desktop and mobile navigation.

2. **Low-friction authentication and resume**
   - Detect an existing session automatically.
   - Separate login and registration intents clearly.
   - Sign in immediately after successful registration and continue to setup without a second credential submission.
   - Remove manual “start/resume setup” actions.

3. **Guided onboarding**
   - Present account setup, categories, and review as sequential decisions without exposing all setup controls simultaneously.
   - Resume from persisted setup state after reload.
   - Use clear semantic progress labels rather than numbered instructions.

4. **Human-readable money**
   - Accept decimal monetary input and format decimal monetary output in the UI.
   - Convert to/from integer minor units only at the client/API boundary.
   - Avoid inventing a currency symbol while the domain has no configured currency.

5. **Budget-first planning experience**
   - Merge the previous overview/plan concepts into one primary Budget screen.
   - Load the selected month automatically and expose month navigation.
   - Show Ready to Assign, account total, and per-category Assigned, Activity, and Available values.
   - Make category assignment and category lifecycle actions contextual to each category instead of separate global command forms.

6. **Unified transaction workflow**
   - Merge ordinary activity entry and history into one Transactions area.
   - Use one “New transaction” entry point that selects Spending, Income, or Transfer and reveals only relevant fields.
   - Load history automatically and reuse the same interaction surface for transaction editing.
   - Keep advanced filters collapsed until requested.

7. **Persistent pending-income guidance**
   - Surface unreleased income from authoritative/persisted history rather than transient component memory.
   - Keep the release action available after reload and independent of visible history filters.

8. **Focused account management**
   - Present active and archived accounts separately, with readable balances and contextual create/archive actions.
   - Keep account management outside the everyday transaction form.

9. **Administrative tools under Settings**
   - Move CSV import/export out of primary everyday navigation and into a data/settings area.
   - Preserve the existing CSV contract and server-side financial authority.

10. **Consistent feedback, language, responsive behavior, and accessibility**
    - Use localized Spanish product copy and hide backend terminology from end users.
    - Use local loading/error/success feedback instead of one global status message.
    - Prevent accidental duplicate submissions.
    - Support desktop and mobile navigation and keyboard/focus semantics for dialogs/forms.

## Confirmed scope

- Web UI/UX architecture and client-side presentation only.
- Existing API endpoints and financial rules remain authoritative.
- Dedicated routes: `/login`, `/register`, `/setup`, `/budget`, `/transactions`, `/accounts`, `/settings/data`.
- Authenticated responsive application shell.
- Automatic session/bootstrap/resume behavior.
- Guided account/category/review onboarding.
- Decimal money entry/display with integer-minor-unit API conversion.
- Budget-centered category management and assignment interactions.
- Unified create/edit transaction interaction for spending, income, and transfer.
- Automatically loaded transaction history with simple search and optional advanced filters.
- Persisted pending-income discovery and release affordance.
- Account management and CSV settings surfaces.
- Component/hook decomposition needed to support the new UX.
- Updated component/contract/E2E coverage for the new journeys.

## Explicit non-goals

- Changing RTA, Assigned, Activity, Available, rollover, transfer, or account-balance equations.
- Changing transaction identity, immutable history, edit/delete, idempotency, optimistic concurrency, or authorization behavior.
- Adding cards, splits, reconciliation, scheduled transactions, targets, bank sync, notifications, collaboration, or new reporting formulas.
- Adding a configured currency model or assuming a currency symbol.
- Replacing the established visual identity with a new design system.
- Moving financial calculations into the browser.
- Changing the CSV import/export format or persistence semantics.

## Success criteria

- A new user can register and reach setup without signing in a second time or manually starting setup.
- Reloading during setup resumes the correct setup decision with persisted data.
- Reloading or using browser navigation on an authenticated route preserves the intended application area.
- Everyday navigation contains Budget, Transactions, Accounts, and Settings rather than backend-operation names.
- No user-facing monetary control requires knowledge of minor units.
- Budget data and transaction history load without explicit “load” buttons.
- Assignment/category operations are contextual to the selected category.
- Spending, income, and transfer creation begin from one transaction action.
- Unreleased income remains discoverable after reload and when transaction filters change.
- CSV remains available but no longer competes with daily budgeting tasks in primary navigation.
- Existing backend regression suites remain unchanged in behavior, and updated web tests cover the new journeys.
