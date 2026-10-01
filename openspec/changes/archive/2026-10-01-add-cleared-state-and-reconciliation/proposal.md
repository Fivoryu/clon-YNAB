# Proposal: Cleared State and Manual Reconciliation

**Draft for owner review.** On 2026-09-29 the owner fixed the capability order (cleared and reconciliation, then scheduled transactions, then cards, then loans) and chose Phase A's boundary: cleared/uncleared transitions, a per-account cleared balance, a reconciliation event with a confirmed external balance, a reconciliation adjustment with a reason, and locking of reconciled history. Approval of this proposal authorizes specification, design, and task planning; it does not authorize implementation.

## Why

The repository already carries half of this capability and cannot use it.

- `FinancialEvent.reconciled` is a real persisted column with a `false` default, added by migration `0003_transaction_history` (`apps/api/prisma/migrations/0003_transaction_history/migration.sql:8`).
- It is plumbed end to end: mapped on read and write (`apps/api/src/persistence/financial-store.ts:81,189`).
- It already decides behavior: a reconciled event is rejected by the ordinary edit and delete paths (`apps/api/src/planning/transaction-history.ts:69`, reached through `apps/api/src/app.ts:516`).
- Canonical requirements already speak of it as an existing state: ordinary edits apply to "posted or working, **non-reconciled**" transactions (`openspec/specs/transaction-history/spec.md:29`).

What is missing is any way to produce that state. Income, spending, CSV import, and deletion tombstones all write `reconciled: false` (`apps/api/src/app.ts:251,268,346,409`); no route and no input can set it to `true`. The guard is real, the state is unreachable, and no cleared balance exists anywhere: the account balance inputs carry only `accountId`, `kind`, and `amountMinor`, and never `status` or `reconciled` (`apps/api/src/planning/engine.ts:3-4`, `apps/api/src/persistence/financial-store.ts:148`).

So Phase A does not invent a dimension. It makes an existing, already-guarded dimension reachable, and adds the second half the domain requires: a cleared balance to compare against a bank statement, and a reconciliation event that locks what it has confirmed.

Two constraints decide the shape of this change:

1. **The canonical exclusion forbids this today.** `openspec/specs/reporting/spec.md:69` forbids the dashboard and canonical monthly summary from presenting reconciliation and cleared/uncleared workflows, and its scenario (`:76`) forbids implying reconciliation support. The capability cannot be added quietly; that requirement must be modified deliberately, in the open.
2. **Eligibility is bound to the wrong account.** `ensureEligible` validates against `budget.account?.id`, the compatibility alias — the **oldest** account, not the transaction's own account (`apps/api/src/app.ts:516`). In a multi-account budget only the oldest account's history can be edited. A cleared-state transition is an ordinary history mutation, and reconciliation is inherently per-account, so Phase A must make eligibility account-scoped or neither can work beyond the first account.

## What Changes

### One cleared dimension, three derived states

`status` (`POSTED`/`WORKING`, `apps/api/prisma/schema.prisma:34-37`) records whether a movement is posted or still working. It is **not** cleared state and stays untouched.

| Layer | Representation |
| --- | --- |
| Persisted, new | `FinancialEvent.cleared` boolean, default `false`, additive |
| Persisted, existing | `FinancialEvent.reconciled` boolean — reused as the reconciliation lock |
| Derived, public | `clearedState: 'UNCLEARED' \| 'CLEARED' \| 'RECONCILED'` |

Invariant: a reconciled transaction is necessarily cleared. `reconciled: true` with `cleared: false` is invalid and MUST be rejected.

### A cleared balance per account

Each account projection gains `clearedBalanceMinor`: its opening balance plus the effective account effects whose transaction is `CLEARED` or `RECONCILED`. The existing `balanceMinor` remains the working balance and `accountBalanceMinor` remains the aggregate of working balances. The cleared balance is a **projection only** — it changes no budgeting equation.

### Cleared-state transitions

A dedicated, financially neutral command moves an eligible item between `UNCLEARED` and `CLEARED`. It changes no amount, account, category, date, or transfer direction. It applies to supported income and spending and to a transfer's state, while the transfer's financial content stays immutable. A `RECONCILED` item cannot be cleared or uncleared. Only `POSTED` items may be cleared.

### Manual reconciliation

A reconciliation command compares the account's computed cleared balance with an external cleared balance the owner confirms:

- **Matching balance.** The event is recorded and every `CLEARED`, not-yet-reconciled effective item on the account becomes `RECONCILED`. No adjustment is created.
- **Mismatching balance without confirmation.** The system returns `CONFLICT` and discloses the difference. No mutation. Nothing is silently repaired.
- **Mismatching balance with explicit confirmation.** Exactly one reconciliation adjustment for the difference is created with the owner's reason, then the same lock applies.

The lock is written as immutable superseding replacements, so reconciled protection survives rebuild from persisted history.

### Reports and summary stay unchanged

Cleared state and reconciliation belong to the **account surface**. The dashboard, the canonical monthly summary, the single-month report, and the multi-month series stay exactly as they are: no cleared balance, no cleared state, no reconciliation state, no reconciliation adjustment, and no new Ready-to-Assign component. The canonical *RTA source and explainability* requirement is modified so that excluding the adjustment from Ready to Assign is **canonical**, rather than an exception hidden in a delta.

One consequence is accepted and written down instead of hidden: a reconciliation adjustment moves real account money that the plan never sees, so the aggregate account balance and Ready to Assign may diverge by the cumulative adjustment. That divergence is a documented limit of this scope. The adjustment is attributable only in the reconciliation audit record; the system MUST NOT invent a Ready-to-Assign component to absorb it.

### Product documents

`docs/product/mvp-scope.md`, `docs/product/functional-requirements.md`, and `docs/architecture/domain-model.md` are updated so cleared state and manual reconciliation stop reading as deferred. The reconciled **correction/unlock** path and import matching remain documented as unresolved.

## Capabilities

- **Added:** cleared state as an explicit, financially neutral transaction dimension with three derived states.
- **Added:** a per-account cleared balance projection.
- **Added:** manual reconciliation with a confirmed external balance, an explicit adjustment decision, and reconciled locking.
- **Modified:** ordinary-edit eligibility becomes account-scoped and treats cleared state as editable while reconciled state remains protected.
- **Modified:** the canonical reporting exclusion, so the account surface may present cleared state and reconciliation within the scope above while reports stay unchanged.

## Non-goals

- Unlocking or correcting reconciled history. Reconciled protection has no repair path in this phase; the mismatch path requires explicit confirmation instead.
- Import and duplicate matching against reconciled history.
- Bank synchronization.
- Cleared balance, cleared state, and reconciliation state in the dashboard, the canonical monthly summary, or any report. A reconciliation adjustment is never presented in any summary or report and never enters Ready to Assign.
- Making a reconciliation adjustment assignable. The adjustment corrects account state only, so the divergence between the aggregate account balance and Ready to Assign is a documented, accepted limit rather than something this phase resolves.
- Cards, loans, scheduled transactions, splits, and refunds.
- Changing `POSTED`/`WORKING` semantics, or the existing transfer financial model.

## Impact

| Area | Files |
| --- | --- |
| Schema and migration | `apps/api/prisma/schema.prisma`, new `apps/api/prisma/migrations/0009_cleared_state_and_reconciliation/` |
| Domain | `apps/api/src/planning/engine.ts`, `apps/api/src/planning/transaction-history.ts`, `apps/api/src/persistence/financial-store.ts` |
| API | `apps/api/src/app.ts`, `apps/api/src/server.ts`, `apps/api/openapi.yaml` |
| Reports | `apps/api/src/reports/report-service.ts` (passes the cleared flag into the balance projection only; RTA inputs and formula unchanged) |
| Web | `apps/web/app/accounts/[accountId]/page.tsx`, `apps/web/app/models.ts`, `apps/web/app/hooks/useBudgetApp.ts` |
| Specs | `reporting`, `transaction-history`, `account-management`, `budgeting`, `guided-budgeting-ux` |
| Product docs | `docs/product/mvp-scope.md`, `docs/product/functional-requirements.md`, `docs/architecture/domain-model.md` |

## Migration and compatibility

The change is additive: one new column with a `false` default, one new event kind, and one new table. Every existing transaction keeps its current effective values and remains `UNCLEARED` with `reconciled: false`. The schema-alignment change (`bca8b77`) means the new column and table must be annotated with their PostgreSQL native types and explicit update actions so the schema continues to describe the database exactly.

The eligibility fix is a deliberate **behavior change**: edits become possible on transactions in any active account of the budget, not only the alias account. It is required for the phase and is called out as such in the design and tasks.

## Risk

- **PostgreSQL enum extension.** New `FinancialEventKind` values need `ALTER TYPE ... ADD VALUE`, which cannot run inside a transaction block on older PostgreSQL. The migration must be validated against the documented local database before the phase closes.
- **Lock fan-out.** Locking is one superseding replacement per affected transaction. It is a loop, not a large diff, but it makes the reconciliation command's write volume proportional to the account's cleared history.
- **Carve-out leakage.** The Ready-to-Assign adjustment component is the one place reconciliation may appear in a summary. Tests must prove it never reaches the single-month report, the multi-month series, or any report measure.
