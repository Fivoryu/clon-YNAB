# Exploration: Transaction History Edit and Delete

## Scope understood

The approved slice adds transaction-history read/list plus ordinary edit and explicitly confirmed delete for existing realized income and one-category spending. It is limited to the existing single cash/checking account, posted/working and non-reconciled transactions. Editable fields are amount, date, and spending category; transaction type and account remain fixed. Deletion records the minimum audit identity. Splits, transfers, multiple accounts, payee/memo, state changes, repetition, closed-month corrections, reconciliation, cards, refunds, schedules, and repeated first-slice web/reporting work are excluded.

## Repository surfaces inspected

- `docs/decisions/ADR-002-financial-history.md`: proposed policy requires explicit delete confirmation, an audit event, authorized audit visibility, atomic removal of account/plan effects, and `CONFLICT` for reconciled ordinary edit/delete. Retention, immutability, exports/reports, roles, and reconciled correction remain open.
- `docs/product/functional-requirements.md` (`FR-TRANSACTION`), `docs/product/actors-and-use-cases.md`, `docs/product/mvp-scope.md`: first-slice creation contract and later edit/delete criteria agree with the approved boundary; dates are date-only in budget timezone and event timestamps are UTC.
- Completed change `implement-first-budgeting-slice`: first-slice application, persistence, reporting, OpenAPI, and Playwright work exists, but its recorded limitations distinguish durable Prisma/PostgreSQL behavior from the in-memory test double and do not claim a transaction-history UI.
- `apps/api/src/app.ts` and `server.ts`: creation and release commands are application-boundary methods with owner checks, positive minor-unit validation, idempotency keys, optimistic `If-Match` versions, and stable errors. There are currently no history, edit, or delete routes.
- `apps/api/src/persistence/financial-store.ts` and `in-memory-budget-store.ts`: authoritative history is an append-only `FinancialEvent` stream; durable commands run inside Prisma interactive `$transaction`, lock the budget, validate idempotency/version, append events, and store `CommandReceipt`. The in-memory adapter mutates cloned state and is a test double.
- `apps/api/prisma/schema.prisma` and migrations `0001_budgeting_slice`, `0002_ownership_consistency`: `FinancialEvent` stores kind, amount, business month/date fields, account/category references, and release linkage. There is no transaction aggregate/status/reconciliation marker, deletion tombstone, or audit model. Composite budget ownership constraints exist for financial references.
- `apps/api/src/planning/engine.ts`: validates positive integer amounts and date/month derivation; `edit` and `delete` are explicitly deferred. Existing formulas support account balance, RTA, category Activity/Available, and full income release.
- `apps/api/src/reports/report-service.ts`: summaries are rebuilt from event history; income/spending and category activity are calculated from current events. There is no transaction list read model. `apps/web/app/page.tsx` only repeats setup, monthly summary, and first-slice entry/release/allocation forms.
- `apps/api/openapi.yaml`, API tests, reports tests, persistence/restart/migration tests, and `apps/web/e2e/budgeting.spec.ts`: contracts and E2E cover creation/summary/first-slice journeys, not history listing, edit, delete confirmation, audit, or post-change rebuild behavior.

## Existing invariants to preserve

1. PostgreSQL is authoritative; a command changing account and plan effects commits atomically or not at all.
2. All financial references are owner/budget scoped and foreign access is non-disclosing (`NOT_FOUND` in the current application path).
3. Amounts are integer minor units and creation amounts are positive; client-calculated balances are never authoritative.
4. Date-only business dates derive `month` from the budget timezone (currently UTC by default); persisted event timestamps are UTC.
5. Income increases account balance and realized income; release is a separate linked event and does not change account balance.
6. Spending decreases account balance and category Activity for exactly one category; summaries are deterministically rebuilt from events.
7. Idempotency is budget-scoped: same key/payload replays, different payload conflicts. Stale versions conflict.
8. Archived accounts/categories cannot receive new activity; existing event history must remain readable.
9. Reconciled correction is deliberately undefined; ordinary edit/delete must not silently establish a new reconciliation policy.

## Gaps and dependency seams

- A stable transaction identity currently corresponds to an event ID, but income release creates a second linked event. The implementation must define how a history item identifies an income and represents release state without treating release as an independently editable transaction.
- Event history is append-only in concept, while ordinary edit/delete requires replacing/removing effective effects. The design must choose a durable representation that preserves deterministic rebuild and audit evidence without inventing an unapproved retention policy.
- `FinancialEvent` currently lacks business date persistence (`appendEvent` does not write `businessDate`) even though the application carries only derived `month`; editing a date will need authoritative date data or an explicitly bounded equivalent.
- No transaction status, reconciliation flag, payee/memo, repetition, or account multiplicity exists. The absence is compatible with scope, but eligibility checks need a stable way to demonstrate that only supported posted/working, non-reconciled records are selected.
- `FinancialStore.readState` does not currently expose event dates or account IDs in the domain event type, and its append path always supplies the one account for income/spending. History DTOs and edit calculations will cross this seam.
- Current report calculations include all `INCOME`/`SPENDING` events. Any edit/delete representation must ensure old effects are not double-counted and deleted effects disappear from account, RTA, category Activity, rollover, and month-specific summaries.
- Existing command receipts make idempotent mutation possible, but delete confirmation and audit identity introduce payload and persistence requirements not represented by current DTOs/tables.
- The web and Playwright surfaces intentionally have no history workflow; this change must avoid redoing dashboard/summary work while adding only the approved history interaction and its focused acceptance coverage.

## Risks

- **Financial corruption:** replacing an event incorrectly can double-count or lose income, spending, release, or allocation effects. Atomic write plus rebuild assertions are essential.
- **Release coupling:** deleting or editing released income can affect released/unreleased RTA and may have downstream assignments; the approved scope does not state a policy for deleting released income or editing income whose release has occurred.
- **Historical month effects:** moving a spending/income date across months changes month summaries and rollover; closed-month behavior is explicitly excluded but the allowed date range is not specified.
- **Audit mismatch:** hard deletion could erase the identity needed by ADR-002, while retaining deleted data in reports could contradict the requirement to remove effects. Audit storage/visibility must remain minimum and scoped.
- **Concurrency/retry:** edit/delete must use the same owner lock, idempotency, and expected-version discipline as existing commands; confirmation and retry semantics are not currently defined.
- **Durability evidence:** the repository has Prisma integration seams and tests, but prior apply notes record runtime limitations when PostgreSQL/Prisma is unavailable. Claims about durable audit and atomic behavior require configured database evidence.
- **Scope creep:** adding generic transaction states, multiple accounts, splits, report deletion history, reconciliation correction, or a broad ledger abstraction would exceed this slice and the review budget.

## Implementation questions requiring proposal/spec decisions

These are unresolved questions, not inferred product policy:

1. What exact history item shape and ordering/filtering/pagination are required for the read/list endpoint (month, account, or all supported history)?
2. Does “existing realized income” include released income, and if so what happens to its release event and any assignments when amount/date is edited or it is deleted?
3. Are edits allowed when the transaction’s category is now archived, or only when the replacement category is active? Is an existing archived category still displayed in history?
4. Are edits/deletes allowed across month boundaries, and what explicitly happens to prior/current month summaries and positive rollover?
5. What confirmation proof belongs in the delete command (boolean, token, or UI-only confirmation), and is a reason required or merely optional as ADR-002 says “when available”?
6. What audit fields are persisted for actor, transaction identity, request/correlation identity, timestamp, and optional reason, and how is authorized visibility handled if no audit-read endpoint is in scope?
7. Should mutation results return the updated/deleted history item, affected summaries, or only an operation identity/version? The existing command convention returns server-calculated results and version.
8. How are idempotency keys scoped and replayed for edit/delete, especially a repeated confirmed delete after the item is no longer present?
9. What durable model represents effective replacement/removal while preserving the existing append-only/rebuild principle: a supersession/deletion marker, a transaction aggregate over events, or another design? This must be selected in design rather than assumed here.
10. Which tests are mandatory for Prisma restart/concurrency/rollback, OpenAPI contract, unit formulas, and Playwright confirmation/list/edit/delete journeys given the existing first-slice matrix?

## Recommended next phase

Proceed to proposal/spec only after resolving the questions that affect user-visible behavior and persistence semantics—especially released-income eligibility, cross-month edits, confirmation/idempotency behavior, and the durable representation of replacement/deletion. Keep Reports changes limited to consuming the corrected authoritative history; do not expand into advanced reporting or reconciliation.
