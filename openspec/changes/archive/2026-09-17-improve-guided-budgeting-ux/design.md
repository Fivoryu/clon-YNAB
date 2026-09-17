# Technical Design: Guided Budgeting UX

## Design goals

The web application SHALL reflect the user's budgeting mental model while preserving the existing backend as the sole financial authority. The redesign keeps the current visual styling and API contracts but changes routing, composition, local state ownership, loading behavior, and interaction hierarchy.

The principal design rule is: **navigation represents user goals; backend commands remain implementation details**.

## Route architecture

The previous `page.tsx` decision tree and internal `activeSection` workspace navigation are replaced with real Next.js routes:

- `/login` — returning-user authentication.
- `/register` — account creation.
- `/setup` — resumable onboarding.
- `/budget` — primary planning surface.
- `/transactions` — history plus create/edit transaction workflows.
- `/accounts` — account management.
- `/settings/data` — CSV import/export and related data tools.

Authenticated routes share an application shell. Desktop uses a persistent side navigation; compact/mobile layouts use a bottom or condensed navigation surface. Browser refresh, deep links, back, and forward navigation therefore operate on real URLs rather than component-local state.

## Authentication and bootstrap flow

A top-level session bootstrap performs the existing session/resume query on application startup. Routing decisions are derived from authoritative state:

1. No valid session → `/login` or `/register`.
2. Valid session with incomplete setup → `/setup`.
3. Valid session with completed setup → requested authenticated route, defaulting to `/budget`.

Successful registration immediately performs the established sign-in flow (or consumes the equivalent authenticated registration result when available) and continues to `/setup`. The UI removes the extra “Start or resume setup” action; resume is an application behavior, not a user task.

Route protection MUST avoid disclosing foreign resources and MUST keep all existing server authorization checks authoritative.

## Guided onboarding state machine

`/setup` is a presentation state machine over persisted budget setup state. It presents one major decision at a time:

- **Cuenta** — account name/type/opening balance.
- **Categorías** — starter categories as individually manageable entries/chips.
- **Listo** — concise review and completion handoff.

The labels indicate semantic progress without numeric “Step 1/2/3” copy. Reloading MUST reconstruct the current stage from persisted budget/setup data. Previously saved account values MUST populate the resumed screen instead of reverting to client defaults.

## Money boundary

The domain/API continue to use integer `amountMinor`/minor-unit values. The web layer adds one reusable money boundary:

- `formatMoneyMinor(minor: number) -> string`
- `parseMoneyInput(decimalText: string) -> minor integer | validation error`
- reusable `MoneyInput` presentation component where appropriate.

The conversion MUST avoid floating-point authority. User-facing forms accept decimal text, normalize it deterministically, and convert to safe integer minor units before commands are sent. Server-returned minor units are formatted as decimal values. No `$`, `Bs`, or other currency symbol is assumed until the domain has a configured currency.

## Budget screen

`/budget` replaces the separate Overview and Plan mental models.

The screen loads the active month summary automatically and exposes month navigation without a manual load button. Its hierarchy is:

1. Month controls and high-level financial context.
2. Ready to Assign and total account balance.
3. Category list with Assigned, Activity, and Available.
4. Contextual category actions.

Category rows own their interaction affordances. Assignment changes are initiated from the category rather than from separate Assign/Unassign forms. Moving money is contextual to a source category and destination choice. Category create/rename/archive actions are available from this area using the existing API behavior.

The web MUST render server-derived summary values and MUST NOT recalculate financial equations locally.

## Transactions screen

`/transactions` combines routine activity entry with history because both represent the user's financial-event workflow.

History loads automatically on entry. The stable top-level action is **Nueva transacción**. It opens a dialog/drawer with a transaction-kind selector:

- Gasto
- Ingreso
- Transferencia

Only fields relevant to the selected kind are rendered. Date defaults to the current local date. A sensible active account may be preselected when unambiguous, but the server remains authoritative for validation.

Editing an eligible ordinary transaction reuses the same interaction surface in edit mode. Deletion uses a confirmation interaction rather than inserting a large destructive form inline.

A simple search is visible by default. Account/kind/category/date controls live under an advanced filter affordance. History refreshes from the server after successful mutations and does not maintain client-calculated balances.

## Pending income

The old transient `latestIncome` approach is removed as the source of truth. Pending/unreleased income is derived from an authoritative history/query projection independent of the user's visible history filters.

The Transactions and/or Budget surface displays a clear pending-income callout when release is possible. Reloading the browser or filtering history MUST NOT hide the release opportunity. Release continues to use the existing server command/idempotency/version rules.

## Accounts screen

`/accounts` presents account state rather than exposing account commands as equal-weight forms. The view distinguishes active and archived accounts, shows formatted balances, and provides contextual create/archive actions. Account creation uses a dialog/drawer so the account list remains the primary content.

No client-provided balance becomes authoritative. All displayed balances come from server DTOs.

## Settings and CSV

CSV import/export moves to `/settings/data`. The existing canonical CSV headers, validation limits, idempotency, versioning, and atomic server behavior are unchanged.

The settings surface explains that import/export is an occasional data operation. Successful import refreshes authoritative budget/history/account state. Client-side validation may reject obvious file-size errors early but MUST NOT replace server validation.

## Feedback and local state ownership

A single global message string is replaced by scoped interaction state:

- submitting state on the initiating action;
- field-level validation for user-correctable input;
- non-blocking success notifications/toasts;
- local/server error presentation near the relevant workflow;
- disabled repeat submission while a mutation is pending.

Form state lives with the screen/dialog that owns it. Shared application state is limited to session, authoritative budget/account/category state, summaries/history queries, and reusable mutations. This reduces cross-form coupling and prevents stale inputs from unrelated workflows.

## Component boundaries

The web SHALL be decomposed around responsibilities such as:

- authentication/session bootstrap;
- route guards and authenticated `AppShell`;
- setup/onboarding state;
- `MoneyInput` and formatting utilities;
- budget summary/category rows and category dialogs;
- transaction history/filtering and a reusable transaction dialog/drawer;
- account list/account dialog;
- settings/data import-export surface;
- toast/notification region.

The exact filenames may evolve, but `page.tsx` MUST NOT return to being the owner of all product workflows and form state.

## Language and accessibility

User-facing product copy is Spanish. Backend/domain names may remain English internally, but terms such as `minor units`, raw DTO names, or implementation-specific history terminology MUST NOT be required for normal use.

Dialogs/drawers MUST manage focus, expose accessible labels, support keyboard submission/cancellation, and return focus to the initiating control. Loading and error states use appropriate disabled/ARIA semantics. Mobile controls maintain usable touch targets.

## Responsive behavior

The information architecture remains the same across viewports. Desktop may use side navigation and wider tables/cards; mobile uses compact navigation and stacked content. Transaction/category/account dialogs may become bottom sheets or full-width dialogs on small screens without changing the underlying workflow.

## Verification strategy

Verification is organized around user journeys rather than component presence alone:

- register → authenticated onboarding without a second sign-in;
- returning session → automatic resume;
- setup reload/resume with persisted account/category state;
- budget month navigation and server-derived values;
- category create/rename/archive and allocation interactions;
- create spending/income/transfer from one transaction entry point;
- income release surviving reload and history filters;
- automatic history loading, search, advanced filters, edit/delete;
- account create/archive and server-derived balances;
- CSV import/export under Settings;
- route deep-link/back/forward behavior;
- responsive navigation and dialog accessibility.

Backend API and financial regression tests remain mandatory evidence that the UX refactor did not change server behavior.

## Rollback boundary

This is a web presentation refactor. Rollback consists of restoring the previous web route/component structure while leaving all API, persistence, transaction-history, account, transfer, and CSV data unchanged. No database migration or financial-history rewrite is required by this change.
