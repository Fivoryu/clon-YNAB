# Proposal: Implement Transaction History Edit and Delete

- **Change:** `implement-transaction-history-edit-delete`
- **Status:** Draft for user review
- **Next recommended phase:** Spec

## Intent

Give users a trustworthy way to review and correct supported financial history without changing the budgeting model or weakening its accounting guarantees. The slice adds history list/read plus ordinary edit and explicitly confirmed delete for eligible existing transactions, while protecting released income and unsupported transaction types.

This is a bounded correction workflow: users can fix ordinary amount, date, or spending-category mistakes, and can remove an unwanted transaction with an auditable action. It is not a new ledger, reconciliation workflow, or general transaction-management platform.

## Business problem

Once a transaction has been recorded, an amount or date mistake can make account balance, category activity, rollover, and monthly summaries misleading. Without a history view, users cannot understand which recorded activity produced those effects; without safe correction, they must tolerate inaccurate history or resort to unsafe workarounds. Deletion also needs explicit user intent and minimum accountability because it removes financial effects.

The product must improve correction and explainability without allowing a released income event, a cross-month correction, or an unsupported transaction shape to silently alter established budgeting rules.

## Target users and situations

- A budget owner reviewing recorded activity and checking what contributed to a month’s results.
- A user correcting a normal posted/working transaction before it is reconciled or, for income, before it is released.
- A user removing a mistakenly entered transaction after an explicit confirmation.
- A user reviewing older history that still references an archived category.

The workflow remains limited to the existing single supported account and the current owner/budget authorization model.

## Product outcome

Users can locate supported history, understand the transaction’s effective type, date, amount, category, and protected state, then make a bounded correction or confirm deletion. After either mutation, account and planning effects remain internally consistent and rebuildable. Unsupported or protected operations fail clearly and non-disclosingly rather than appearing to succeed.

## Capabilities

### New Capabilities

- `transaction-history`: Provide history list/read plus ordinary edit and explicitly confirmed delete for supported posted/working, non-reconciled realized income and one-category spending, while preserving the approved account, transaction-type, date-boundary, category, authorization, audit, and consistency rules.

### Modified Capabilities

None. No existing capability specification is modified by this change.

## Confirmed scope

### Included

1. History list and read for existing supported transactions.
2. Ordinary edit of existing realized income while it is unreleased.
3. Ordinary edit of one-category spending.
4. Explicitly confirmed deletion of eligible realized income or one-category spending; a deletion reason is optional.
5. Amount and date edits for both supported transaction types, preserving transaction type and the single supported account.
6. Spending-category edits, with an active replacement category required when replacing a category.
7. Same-`YYYY-MM` date edits only. A cross-month edit returns `CONFLICT` until a closed-month policy exists.
8. Eligibility limited to posted/working, non-reconciled records.
9. Minimum delete audit identity: actor, transaction identity, request/correlation identity when applicable, timestamp, and optional reason. No audit-read endpoint is included.
10. Recalculation of affected authoritative account, plan, category, rollover, and month-specific effects through the existing budgeting rules.

### Explicit non-goals

This slice does not include splits, transfers, multiple accounts, payee or memo editing, state changes, repetition, closed-month corrections, reconciliation, cards, refunds, schedules, or a new policy for released income. Released income is protected: edit/delete attempts return `CONFLICT`. It also does not repeat the already delivered first-slice web, reporting, or E2E work; only focused history behavior and its necessary verification belong here.

## Product behavior and business rules

- PostgreSQL remains authoritative for history and all financial effects; a mutation is all-or-nothing.
- History reads and mutations are budget-scoped and owner-authorized. Foreign or inaccessible resources use the existing non-disclosing authorization behavior.
- Amounts remain integer minor units and use the existing validation rules. Client-calculated balances and summaries are never authoritative.
- Transaction type and account are immutable in this slice. Income remains realized income; spending remains one-category spending.
- Unreleased realized income may be edited or deleted. Released income remains readable but protected, and any attempted ordinary edit/delete returns `CONFLICT`.
- A date edit must remain in the same `YYYY-MM` month under the budget’s date/month rules. Cross-month edits return `CONFLICT` rather than changing rollover or closed-month policy implicitly.
- Archived categories remain visible on historical records. An amount/date edit may retain an archived spending category; selecting a replacement category requires that category to be active.
- Delete requires explicit confirmation. The reason is optional and is retained only as part of the minimum audit identity; no audit-reading experience is promised in this slice.
- Idempotency and optimistic concurrency remain required for mutations, including safe retry behavior and conflict on stale versions or incompatible retries.
- Effective history must remove or replace old financial effects exactly once so reports and summaries remain deterministic and rebuildable. The durable representation is a design decision, not a proposal-level commitment.
- API success and error responses continue to use the repository’s established envelopes and stable conflict/not-found semantics.

## Affected areas

- **History/API boundary:** new authorized list/read and edit/delete contracts, including confirmation, concurrency, idempotency, and stable errors.
- **Financial domain:** eligibility, amount/date/category correction, protected released-income behavior, deletion effects, and invariant-preserving recalculation.
- **Persistence:** durable transaction identity/date information, effective replacement/removal, command receipts, and minimum delete audit evidence while preserving PostgreSQL authority and rebuildability. Exact tables and representation belong to design.
- **Reports and summaries:** consume corrected authoritative history without duplicating old effects or expanding reporting scope.
- **Web workflow:** focused history viewing, edit, and confirmed-delete interaction only; existing dashboard and first-slice flows remain unchanged.
- **Verification and operations:** unit, API/contract, persistence/concurrency/rollback, rebuild, and focused user-journey coverage appropriate to this change.

## Risks and tradeoffs

| Risk or tradeoff | Containment |
| --- | --- |
| A replacement or deletion double-counts, loses, or leaves behind financial effects. | Require atomic mutations and deterministic rebuild/invariant coverage before enabling the path. |
| Users mistake protected released income for an editable transaction. | Keep it visible in history, make its protected state clear, and return `CONFLICT` consistently. |
| A date correction changes month-level meaning or accidentally establishes closed-month behavior. | Permit only same-`YYYY-MM` edits and reject cross-month requests. |
| Archived category references become unreadable or users accidentally reactivate historical classification. | Preserve archived references for display; permit replacement only with an active category. |
| Delete is triggered accidentally or cannot be tied to an actor. | Require explicit confirmation and record the minimum audit identity, with an optional reason. |
| Retries or concurrent edits create inconsistent results. | Preserve budget-scoped idempotency, optimistic concurrency, PostgreSQL transaction boundaries, and stable conflicts. |
| Scope expands into a generic ledger or reconciliation product. | Keep the explicit non-goal list and defer durable-model and contract details to spec/design. |

The principal tradeoff is correction capability versus protection of financial and month-boundary invariants. A smaller set of safe corrections is preferable to broad editing that users cannot reliably explain or reverse.

## Rollback and containment

- Keep the new history mutation boundary disabled or revertible until atomicity, authorization, conflict, audit, and rebuild evidence passes.
- Prefer additive, reversible persistence changes; preserve authoritative history and audit evidence during rollback rather than silently rewriting or erasing it.
- If corrected summaries diverge, stop the affected mutation path and rebuild derived views from authoritative PostgreSQL history; never repair with client-provided totals.
- If deletion or editing can partially apply, contain the command, preserve request/audit lineage, and use a controlled recovery procedure defined in design.
- Limit containment to the owning budget and supported account; do not perform silent cross-budget, cross-category, or cross-month corrections.

## Success criteria

1. An authorized user can list and read supported history for the existing account without exposing another budget’s records.
2. Eligible unreleased realized income and one-category spending can be edited for amount/date, and spending can be reassigned only to an active replacement category.
3. Existing archived category references remain visible and may be retained during amount/date edits.
4. Released income, reconciled records, unsupported states, and cross-month date edits are protected with clear `CONFLICT` behavior.
5. Delete cannot execute without explicit confirmation; optional reason data is captured with the minimum required audit identity, and no audit-read endpoint is exposed.
6. Repeated and concurrent requests obey idempotency and optimistic-concurrency rules.
7. After edit or delete, account balance, RTA/plan effects, category activity, rollover, and month-specific summaries contain no stale or duplicated effects and can be rebuilt deterministically.
8. Existing first-slice behavior remains unchanged, and focused history verification covers the supported path and principal protected/error cases.

## Proposal question round

These questions are included for user review so the proposal can uncover remaining product tradeoffs before spec/design. The user may answer, skip, correct the framing, or request a second round:

1. Should history open to a month-focused view, all supported history, or another default scope, and which filtering/order behavior is essential for the first correction workflow?
2. When released income is shown as protected, what explanation or next action should the user receive, if any, given that release correction is outside this slice?
3. Should the optional delete reason be presented as a free-form support/audit note with any product limits, or should the first slice keep it entirely unobtrusive?

## Remaining decision gaps for spec/design

1. Define the history item shape, ordering, filtering, pagination, and how income release/protected state is represented without making the release event independently editable.
2. Define exact edit/delete request and response contracts, including confirmation proof, idempotency replay behavior, version handling, and mutation result semantics.
3. Select the durable effective-history representation that preserves audit evidence, atomic effects, and deterministic rebuildability without inventing a broader retention policy.
4. Define the required error copy and focused web interaction while keeping authorization non-disclosing and existing first-slice surfaces stable.
5. Define the Prisma migration, rollback/recovery procedure, and mandatory unit, contract, persistence, concurrency, and journey evidence.

The next phase should resolve these implementation and contract details without changing the confirmed product scope or non-goals above.
