# Technical design: proposed initial screen-parity tranche

## Status and scope

This is a planning artifact only. The proposal still describes the MVP expansion as under review; approval to plan this design does not authorize implementation or change the canonical MVP boundary. No application code, tests, or canonical decision documents are changed by this design.

The proposed first tranche has two independently deliverable capabilities:

1. Account detail/activity, including continuation to older available account history beyond the current 500-record cap.
2. A basic report for one selected budget month, with spending by category and distinct income/expense information.

The report's treatment of transfers and working/pending activity is an explicit implementation and release gate. No accounting formula or default treatment is selected here. Multi-month trends, period comparisons, exports, targets, scheduled transactions, reconciliation, and other later-roadmap capabilities remain out of scope.

## Decisions at a glance

| Area | Design decision |
|---|---|
| Account route | Add a subordinate `/accounts/[accountId]` route linked from the existing `/accounts` workflow; do not add another top-level account destination. |
| Account data | Use the selected account from the authenticated budget response for its server-derived balance; request history through the existing account filter. Preserve transfers as one activity item even when either side matches the selected account. |
| History continuation | Use exclusive keyset continuation over the existing canonical descending order `(date, createdAt, transactionId)`, not offset pagination. Initially issue cursors only for account-detail's account-ID filter. Bind each opaque cursor to `budgetId`, the exact normalized supported filters, and the history `state.version` returned by `listTransactions`—not `Budget.version` from `GET /api/v1/budgets`. Require the version and page items to come from one logical snapshot. Keep every response at or below 500 items; do not accept a larger client page size. |
| Report route | Add a single-month `/reports` surface and an owner-authorized monthly report API contract. Do not reuse the current monthly budget summary as if it were a complete income-versus-expenses report. |
| Report accounting | No report totals are enabled until an explicit accounting policy is approved. The approved policy must give visible treatment to transfers, working transactions, and pending/unreleased income. |
| Navigation | Add Reports to the existing primary navigation. On mobile, include Reports among the four core destinations and retain Settings as the fifth “More” destination. |
| Persistence | No schema or migration is justified by the initial design. Existing effective transaction history and transfer records are the source of truth. |

## Account detail and activity

### Route and presentation

- Add `/accounts/[accountId]` under the existing authenticated shell and `RouteGate gate="ready"`.
- Link each active account from `/accounts` to its detail route. Keep rename/archive actions separate so the account link is an unambiguous navigation target. Archived accounts may still open their retained history, but the detail view must not suggest they can receive new activity.
- Identify the selected account by its current server-returned name and kind. Display its server-derived `balanceMinor`; do not recompute the balance from the visible page of transactions or include the opening balance as a transaction row.
- Show activity in the current canonical history order, with the existing income, spending, and transfer descriptions and their payee, date, memo, account/category references, and amount. A transfer appears once and identifies source and destination; it is not duplicated as separate visible rows for the account.
- Include a clear “Load older activity” control while a continuation cursor exists. Empty, loading, request-error, and end-of-history states must be distinct. A failed continuation keeps already-loaded rows and offers retry.
- Keep account identity in the URL so detail can be opened or refreshed directly. Provide a clear return path to `/accounts`.

### Data flow

1. `RouteGate` ensures the owner is authenticated and setup is complete.
2. Resolve `accountId` against `app.budget.accounts`, whose balances are supplied by the existing server API. Unknown IDs show the normal not-found state; an archived account remains readable if present.
3. Fetch `GET /api/v1/budgets/{budgetId}/transactions?account={accountId}` for the first page, then repeat with `cursor` for continuation. The API's existing account filter includes ordinary transactions on that account and transfers for which it is the source or destination.
4. Append a page only when its request cursor still matches the active account/filter state. Changing account or filters resets to the first page. Compare continuation against the history version returned by `listTransactions`, never the separate `Budget.version` used by `GET /api/v1/budgets`. A stale history-version cursor returns a restartable conflict rather than silently mixing snapshots; the server must first guarantee the page items and bound version represent the same logical snapshot.
5. Retain the account's balance from the budget response independently of page state. Normal history mutations elsewhere continue to use the existing budget version/idempotency flow; no edit, reconciliation, or new account workflow is introduced here.

Where transaction lifecycle is shown, distinguish persisted transaction status (`POSTED`/`WORKING`) from income-release state (released versus pending release). Do not reinterpret the existing history `state` field (`ELIGIBLE`/`PROTECTED`) as transaction status. Add explicit response fields only if the account UI needs to render these distinctions; preserve existing fields and meanings for current consumers.

## Bounded history continuation contract

The current API accepts account and other history filters, builds canonical effective transaction and transfer items, orders them by date descending, creation time descending, and transaction ID descending, then returns at most 500. `filterHistoryItems` applies the 500-item slice after filtering. The API currently loads all event and transfer rows before projecting history; effective replacement/deletion folding is part of the canonical result. History `state.version` returned by `listTransactions` is the `FinancialStore` command-receipt version; it is distinct from `Budget.version`, which is returned by `GET /api/v1/budgets`. Do not compare or substitute these version values.

Extend that behavior as follows:

```text
GET /api/v1/budgets/{budgetId}/transactions?account={uuid}[&cursor={opaque}]

200 { data: { items: HistoryItem[], version: number, nextCursor: string | null }, requestId }
```

- The server keeps a fixed maximum page size of 500. Do not introduce a larger `limit` parameter. Each `items` array has at most 500 entries.
- The first request returns the first 500 matching canonical items. A subsequent request uses the returned `nextCursor`; the anchor is exclusive, so the last item from the previous page cannot repeat.
- The cursor encodes a validated anchor `(date, createdAt, transactionId)`, the `budgetId`, the history `state.version` from `listTransactions`, and a digest of the exact normalized supported filters. Initially, cursor pagination is enabled only for account-detail's `account` ID filter; other existing history filters remain available without cursor continuation. A cursor for another budget or normalized filter set is rejected. A cursor whose history version is stale is rejected with a conflict that tells the client to restart from the first page. The cursor version is not `Budget.version` from `GET /api/v1/budgets`.
- Continue using the exact existing sort tuple, including all tie-breakers. This makes continuation deterministic for same-date items and avoids offset drift when newer activity is inserted. Version checks can protect membership only when the page items and history version are from the same logical snapshot and all relevant changes are represented by that version; do not claim the current version alone detects every projection change.
- `nextCursor` is null when no later matching item exists. The server may inspect one additional matching item internally to determine this; that item is not included in the response. A missing cursor preserves current first-page behavior, so existing clients may ignore the additive response field.
- Validate cursor encoding, field lengths, and shape; retain the existing overall query-string bound. Authentication, budget ownership, and account validation remain server-side. A cursor is navigation state, not authorization.

For the initial implementation, continuation should be applied to the same canonical projected account-filtered list used today, after effective-history folding and transfer inclusion. The account-ID filter keeps cursor membership independent of mutable account/category display names. Do not enable cursor continuation for `q` or other filters whose membership can depend on mutable names unless the binding also protects the relevant projection revision and snapshot semantics. In particular, category renames use budget persistence rather than financial command receipts, so the history `state.version` alone does not capture them. This avoids a second, inconsistent definition of history and handles the current model in which transfers live separately from ordinary transaction events. It does not worsen the existing whole-history read pattern, but it also does not make that read asymptotically cheaper. Database-level pagination is deliberately not claimed: effective transaction replacement/tombstone folding and merging the separate transfer stream make naïve row-level paging unsafe. Any later query optimization must preserve the same effective-history projection, merged ordering, supported filter semantics, cursor versioning, snapshot guarantee, and 500-item response ceiling.

## Basic single-month report and accounting-policy gate

### Surface and API

- Add an authenticated `/reports` route with one visibly selected month (`YYYY-MM`). A labelled month input or equivalent single-month selector may move between months, but the view must never combine periods, compare periods, or expose trend controls.
- Add `GET /api/v1/budgets/{budgetId}/reports/monthly?month=YYYY-MM`. It uses the existing session authentication, budget-owner check, request envelope, month validation, and budget version conventions.
- The existing `GET .../summary?month=` is a budgeting summary: it exposes account/category budget state, not a defined income-versus-expenses report. Keep it and canonical category-budget calculations unchanged. Implement report projection separately rather than infer report measures from summary fields.
- The report's eventual available response identifies the selected month and the approved policy/version, presents spending by category and distinct income/expense measures, and carries explicit treatment metadata for transfer activity, working transactions, and pending/unreleased income. All monetary values remain integer minor units at the API boundary and use the existing currency formatting in the web layer.
- Build the report's selected-month source set from canonical effective `INCOME`/`SPENDING` records and the canonical `Transfer` rows. Use the stored business month, preserve archived category labels for historical spending, and de-duplicate transfer ledger pairs by using their one transfer record. Do not mix account-balance activity with report contributions.

### Gate — unresolved, blocking

The approved policy for classification, presentation, and contribution of transfers and working/pending records is not present in the proposal or delta specs. Therefore:

- No income, expense, category, transfer, or pending/working contribution formula is selected by this design.
- A report implementation may not silently omit an in-scope record, equate transfer activity with categorized spending, or infer that unreleased income is the same thing as a `WORKING` transaction.
- The report endpoint/UI must not publish report totals until a product/accounting policy is explicitly approved. If implementation begins before that decision, the only safe behavior is an explicit unavailable state (for example, `REPORT_POLICY_UNRESOLVED`) with the selected month; it must not return plausible-looking partial totals. This state is a gate, not the delivered report.
- After approval, every in-scope transfer and working/pending record must have an explicit, user-visible treatment in the report, even when the chosen policy keeps it outside a particular measure. The policy identifier and treatment must accompany the result so users can distinguish settled, provisional, and separate activity.

This design can proceed without choosing between accounting policies because it blocks report calculation and release until that choice is recorded. The initial account-activity capability is independently implementable; the report must not be treated as done or exposed as a completed capability while the gate remains open.

### Data-flow boundaries

The report request validates one month, authenticates the owner, loads the budget's canonical effective financial state, and passes only that month's transactions and transfers to a dedicated monthly-report projection. The projection requires an approved policy and returns one-period data only. The UI displays the selected period, category-level spending, separate income and expense information, and explicit transfer/working/pending treatment under that policy. It does not alter `ReportService.read`, account balances, Ready to Assign, category availability, or any canonical budget calculation.

The current persistence layer loads all financial events and transfer rows, and `ReportService.read` has existing budget-specific calculations (including category activity and rollovers). Those semantics are not a substitute for the new report policy. No Prisma schema or migration is required for the first design; policy approval and report semantics must be settled before implementing the report projection.

## UI accessibility and responsive behavior

Follow the existing `AppShell`, `RouteGate`, semantic color tokens, typography, and spacing conventions. Keep all new routes inside the shared shell; do not introduce another navigation pattern.

- Use a single page-level heading, labelled main content, meaningful link/button text, visible keyboard focus, and `aria-current="page"` for the active route. Route changes should move assistive-technology focus to the page heading/main region without disrupting browser back navigation.
- Use native links for account navigation and native buttons for continuation/month actions. Controls must work by keyboard and touch, expose disabled/loading state, and have at least 44×44 CSS-pixel hit areas for new interactive elements. Announce appended-page loading/errors politely without stealing focus.
- Represent category spending with a semantic table or equivalent labelled name/value rows (`caption`, column headers, and row headers where using a table); text and labels must convey meaning without color. Do not require a chart. If a chart is introduced later, it needs an equivalent accessible data table and non-color-only distinctions.
- Keep the current web sidebar on wide screens. At the existing `980px` breakpoint, use the bottom navigation and include Reports among the four core destinations plus Settings/More; keep the mobile navigation within five destinations. At the existing `720px` breakpoint, collapse account summary/report columns and filters into a single column, reflow transaction rows, preserve 16px page gutters, and avoid horizontal scrolling.
- Respect the existing mobile safe-area insets and reserve space below content for the fixed bottom navigation. On small screens, use stacked report category rows rather than a horizontally scrolling wide table. Keep labels and monetary values legible when text scales; do not rely on hover for actions.
- Reuse the existing loading/empty/notice patterns, but distinguish “no activity for this account/month” from loading, API failure, unavailable policy, and end-of-history.

## Proposed implementation touchpoints

These are design targets, not edits made in this phase.

| Area | Likely files | Responsibility |
|---|---|---|
| Account navigation/detail | `apps/web/app/accounts/page.tsx`, new `apps/web/app/accounts/[accountId]/page.tsx` | Link accounts into selected-account detail; show server balance and paged activity. |
| Reports | new `apps/web/app/reports/page.tsx`, `apps/web/app/components/shell/AppShell.tsx` | Single-month report view, policy-gated state, responsive category/measure presentation, and discoverable navigation. |
| Client data/contracts | `apps/web/app/hooks/useBudgetApp.ts`, `apps/web/app/models.ts` | Add cursor-aware account-history loading and typed monthly-report/policy availability data without conflating lifecycle status. |
| API routing and projection | `apps/api/src/server.ts`, `apps/api/src/app.ts`, `apps/api/src/planning/transaction-history.ts`, `apps/api/src/reports/` | Parse and validate continuation, page canonical history, add the owner-authorized single-month endpoint and isolated policy-gated projection. |
| Shared layout styles | `apps/web/app/globals.css` | Responsive account/report layouts, touch targets, and status/notice styles consistent with existing tokens and breakpoints. |
| Verification | Existing API and web test suites | Verify contracts and behavior described below; no tests are created in this design phase. |

No edits to `docs/product/mvp-scope.md`, other canonical MVP decisions, or the roadmap proposal are part of this design.

## Verification design

When implementation is separately authorized, tests should establish:

- History pages at 0, 500, 501, and multiple-page boundaries; stable ordering for ties; no overlap between pages; no response above 500; account filters include transfers from either side exactly once; and ordinary transaction filters remain intact.
- Cursor binding/rejection for malformed, oversized, cross-budget, filter-mismatched, and stale-history-version tokens. Verify cursor support is initially limited to the account-ID filter, and that the bound history version and page items come from one logical snapshot (or version recheck/retry rejects an inconsistent load). Verify mutable name-based filters cannot use cursors without an appropriate projection revision. A stale cursor offers a clean restart; a mutation followed by restart returns the updated canonical history.
- Account route identity, server-derived balance, archived-account history behavior, loading/error/empty/end states, direct URL access, keyboard operation, and mobile reflow.
- Before policy approval, report tests assert the explicit unavailable gate and absence of report totals. After approval, tests must be derived from the approved policy and prove selected-month-only behavior, category spending, distinct income/expense presentation, and visible non-omission/treatment of transfers, `WORKING` transactions, and unreleased/pending income. Include paired transfer ledger events to prove no accidental double counting.
- Report route/API authorization, invalid month handling, accessible period/category labels, no multi-month controls, and no changes to canonical monthly-summary values.

## Rollout, rollback, and known risks

Account activity and monthly reporting remain independently releasable. Account history can ship only after the proposed MVP expansion is separately authorized. The report release remains blocked until its accounting policy is approved and tested. Keep multi-month trends and all later roadmap candidates out of this change's routes and contracts. Do not amend canonical MVP documents as part of rollout.

The account feature can be disabled/reverted at the route/navigation boundary without a data migration. The proposed design adds no persistent state, so no schema rollback is required. If report policy later requires stored configuration, that is a separate design decision and migration review.

The main technical risks are that continuation exposes older history while the existing repository still loads and projects the full event/transfer set, and that `FinancialStore.load` currently counts command receipts then reads financial events/transfers in separate non-transactional operations. The current load therefore does not establish that its history version and returned page items describe the same logical snapshot. Implementation must provide a snapshot-consistent read or an equivalent version recheck/retry that rejects or retries when the version changes across the read; the design does not claim this guarantee already exists. Cursor continuation is initially limited to the account-ID filter because mutable account/category-name search membership is not necessarily reflected in the financial command-receipt version. The cursor guarantees reachability and bounded responses, not bounded database work. A later optimization must be separately verified against effective-history folding, mixed transfer ordering, filter semantics, snapshot consistency, and the same 500-item cap. The main product risk is premature or misleading report totals; the explicit policy gate prevents that risk from being hidden by implementation defaults.

## Evidence and constraints

This design follows the user-authorized planning scope and three completed deltas, while retaining the proposal's stated under-review MVP expansion. Repository evidence was read directly from `apps/api/src/server.ts`, `apps/api/src/app.ts`, `apps/api/src/planning/transaction-history.ts`, `apps/api/src/persistence/financial-store.ts`, `apps/api/src/reports/report-service.ts`, `apps/api/prisma/schema.prisma`, `apps/web/app/accounts/page.tsx`, `apps/web/app/transactions/page.tsx`, `apps/web/app/hooks/useBudgetApp.ts`, `apps/web/app/models.ts`, `apps/web/app/components/shell/AppShell.tsx`, `apps/web/app/components/shell/RouteGate.tsx`, and `apps/web/app/globals.css`, along with `docs/research/ynab-screen-parity.md`.

The available tool interface did not provide CodeGraph MCP or a command runner. In accordance with the no-commands constraint, no CodeGraph initialization/query or shell command was run; targeted source reads were used instead. No unsupported YNAB-private behavior is assumed.
