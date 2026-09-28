# YNAB Screen and Capability Parity Research

**Recommended next step — Clone decision:** Plan one bounded initial batch around an account detail/activity view and a basic Reports/Insights screen. Reuse account-filtered history and monthly summaries where they fit; define an aggregation query before promising useful multi-month trends. Keep this an academic clone roadmap, not a claim that literal 100% feature parity is feasible.

Research checked **2026-09-22**. Public descriptions below are **Observed** behavior, not evidence about YNAB's private implementation. Repository facts cite the inspected paths; recommendations are **Clone decisions**, while technical conclusions beyond those facts are **Inferred**.

## Current-state snapshot

- **Repository:** Eight routes are present: `/`, `/login`, `/register`, `/setup`, `/budget`, `/transactions`, `/accounts`, and `/settings/data`. Route and shell evidence: `apps/web/app/page.tsx`, `apps/web/app/components/shell/AppShell.tsx`, `apps/web/app/components/shell/RouteGate.tsx`, and the route `page.tsx` files.
- **Repository:** Budget, transaction, account, onboarding, and CSV screens are API-wired, not static mock screens: `apps/web/app/budget/page.tsx`, `apps/web/app/transactions/page.tsx`, `apps/web/app/accounts/page.tsx`, `apps/web/app/setup/page.tsx`, and `apps/web/app/settings/data/page.tsx`. The budget screen switches months, shows Ready to Assign and category values, and supports manual assignment/moves; current transaction capabilities include income, spending, transfers, search/filter, edit/delete, and pending-income release. CSV import/export is available.
- **Repository:** Accounts currently have a list/management screen, but there is no account-detail/register screen, Reports screen, category-target screen, or scheduled-transaction screen. These absences do not imply that each feature needs a new top-level route.
- **Repository:** The API supports account-filtered transaction history and monthly category/account summaries (`apps/api/src/server.ts`, `apps/api/src/reports/report-service.ts`). The history has no pagination. **Inferred:** A rich multi-month report needs repeated monthly summary calls or an aggregation endpoint; the existing monthly summary alone is not a full reporting layer.
- **Repository:** Category targets and scheduled transactions need model/API work (`apps/api/prisma/schema.prisma`). Cleared-state support is a documented prerequisite for reconciliation (`docs/product/functional-requirements.md`, `docs/research/ynab-domain.md`). The MVP boundary defers advanced reports, targets/schedules, reconciliation, credit cards/loans, collaboration, bank synchronization, and native mobile (`docs/product/mvp-scope.md`, `docs/product/functional-requirements.md`, `docs/research/ynab-domain.md`).

## Gap matrix

Priority and delivery timing are separate in this project: P0/P1/P2 express importance; delivery is a first slice, later MVP slice, or deferred/out of MVP. Rows below recommend sequencing, not scope expansion.

| Priority / delivery | Screen or flow shape | Repository evidence | Dependencies and gap |
|---|---|---|---|
| **P1 — later MVP candidate: account activity** | Add account detail/activity within the `/accounts` flow or as a subordinate view. A register is an account workflow, not necessarily a new top-level destination. | `/accounts` lists balances and supports account management; `/transactions` is the transaction screen. API history supports account filtering (`apps/api/src/server.ts`). | Reuse filtered history and account balances; decide what detail is needed and address unpaginated history before large registers. |
| **P2 — later MVP candidate: Reports/Insights** | One Reports screen for a small set of spending/category and account summaries, with a clear time range; export can follow once the report data contract is defined. | No Reports route/screen. `apps/api/src/reports/report-service.ts` calculates monthly category/account summaries; `apps/api/src/server.ts` exposes the history workflow. | Multi-month trends and period comparisons need repeated monthly reads or an aggregation endpoint. Do not imply that transaction CSV export is equivalent to report export. |
| **P2 — deferred: category goals/targets** | Target status and controls belong on category rows/details in `/budget`; they need not create a standalone Goals page. | No target screen; category targets require model/API work (`apps/api/prisma/schema.prisma`). | Define supported target types, date periods, snooze behavior, and suggestions. Target evaluation must remain distinct from money actually assigned. |
| **P2 — deferred: scheduled transactions** | A collapsible future/repeating section inside an account register, with edit-series and enter-now actions, matches the described workflow better than an independent top-level page. | No scheduled-transaction screen or schedule model/API (`apps/api/prisma/schema.prisma`). | Define recurrence, budget timezone, occurrence generation, retries/idempotency, and how generated entries enter ordinary transaction history. |
| **P1 — later MVP: reconciliation** | Reconcile from account detail/register using cleared activity and a confirmed cleared balance; this is an account workflow, not necessarily a separate route. | No cleared-state UI/flow. Reconciliation is documented as requiring prior cleared-state support (`docs/product/functional-requirements.md`, `docs/research/ynab-domain.md`). | Implement cleared-state behavior and settle correction, locking, and audit policy before presenting reconciliation as ready. |
| **P1 later MVP / P2 deferred: credit cards and loan planning** | Card payment state belongs with account/budget workflows; a Loan Planner would be a separate specialized simulator. | The account model currently has cash/checking kinds (`apps/api/prisma/schema.prisma`); no loan simulator or related screen is present. | Card rules and account types need domain work. A payoff simulator also needs explicit interest, payment, and estimate assumptions; do not infer these from YNAB's public feature description. |
| **Deferred/out of MVP: sharing, bank sync, offline sync, native mobile** | These span authorization, integration, and platform behavior rather than one missing screen. | The current MVP docs defer collaboration, automatic bank sync, and mobile-native UI (`docs/product/mvp-scope.md`, `docs/product/functional-requirements.md`). | Requires separate scope and capability decisions; defer well beyond the initial screen batch. |

## Staged roadmap

1. **Initial batch — Clone decision:** Add account activity/detail and a basic Reports/Insights experience. Keep account history within the register/account flow. Limit reports to supported summaries or first establish an aggregation contract for multi-month spending trends; add export only against that defined report data.
2. **Capability-backed planning — Clone decision:** Add category targets and scheduled transactions after their models, APIs, and behavior policies exist. Put targets in the plan and schedules in the register; page count is not the measure of coverage.
3. **Controlled account history — Clone decision:** Add reconciliation only after cleared-state support and its locking/correction policy are settled. It can then be an action inside account activity.
4. **Specialized and external capabilities — Clone decision:** Consider card/loan workflows later, followed much later by collaboration, bank synchronization/offline behavior, and mobile-native clients. These are separate domain, integration, and platform commitments—not reasonable additions to a first screen batch.

## Assumptions and non-goals

- **Observed:** Public YNAB pages describe product behavior and user flows; they do not establish its private schema, endpoints, algorithms, or complete edge cases. This report makes no claim about YNAB's private implementation.
- **Clone decision:** Preserve the academic MVP boundary and use public flows as comparison evidence, not a requirement to reproduce every commercial capability. Literal “100% feature parity” is neither a useful page-count target nor a feasible promise based on this evidence.
- **Inferred:** Some public capabilities are features inside an existing surface: schedules and reconciliation belong in account register/detail flows, while goals can live with budget categories. More routes alone would not supply the necessary data model or behavior.
- **Evidence limitation:** Search-result evidence was available for Reflect help pages, but direct body extraction was limited. Their public descriptions are recorded below without treating inaccessible details or hidden implementation as known.
- **Non-goals:** No implementation, API, persistence, UI, bank connection, or private YNAB behavior is specified by this research note.

## Official sources

All sources below are official YNAB or YNAB Support pages reviewed **2026-09-22**. Statements are **Observed** public descriptions.

- [Features](https://www.ynab.com/features) — bank connection/automatic import, cross-device sync including offline use, YNAB Together, goal tracking, loan calculator, and spending/net-worth reports.
- [Goal tracking](https://www.ynab.com/features/goal-tracking) — category targets for weekly, monthly, yearly, or custom dates; progress at a glance; and snoozing a target.
- [Debt management](https://www.ynab.com/features/debt-management) — Loan Planner/payoff simulator estimates interest and time effects of extra payments; integrated credit-card payment behavior, related reports, and targets.
- [YNAB Together terms](https://www.ynab.com/terms/ynab-together) — group of up to six, separate logins, shared budget, and member roles; page last updated **2024-12-11**.
- [The Plan header](https://support.ynab.com/en_us/the-plan-header-BkmiuJ_C9) — web month switching, Ready to Assign breakdown, and manual or Auto-Assign workflows.
- [YNAB glossary](https://support.ynab.com/en_us/ynab-glossary-a-guide-BJd80SORq) — accounts/all-accounts and account-register workflow.
- [Editing and deleting scheduled transactions](https://support.ynab.com/en_us/editing-and-deleting-scheduled-transactions-a-guide-Skru9yNJo) — future/repeating items in a collapsible register section; edit a series or enter an item now.
- [Reconciling accounts](https://support.ynab.com/en_us/reconciling-accounts-a-guide-BJFE3fHys) — reconcile from an account register using cleared balance; reconciled items lock and reduce duplicate-import risk.
- [Exporting Reflect data](https://support.ynab.com/en_us/how-to-export-reflection-data-Bykou09) and [Spending Breakdown](https://support.ynab.com/en_us/spending-breakdown-H1H7YxmD0) — search-result evidence describes Reflect views for Spending Trends, Spending Breakdown, Net Worth, and Income v Expense, plus web export. Direct support-page body extraction was limited.
- [Account types overview](https://support.ynab.com/en_us/account-types-an-overview-BkmGM0qCq) — Net Worth reporting distinguishes account types.
