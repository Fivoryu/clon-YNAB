# Proposal: Scheduled Transactions

**Draft for owner review. Approval of this proposal authorizes specification and design only; it does not authorize implementation.**

## Why

A budget today records what has already happened. Nothing records what is going to happen: rent, a salary, a subscription. The owner cannot see a future register item, and nothing creates it when the day arrives.

The product backlog already defines the contract this must respect: a future or repeating register entry has no plan effect before its occurrence; at the occurrence the system creates one ordinary transaction; and retrying the same occurrence does not duplicate effects (`docs/product/functional-requirements.md:340-365`). That contract is deferred and leaves four questions open — recurrence shape, generation timing and idempotency, whether an occurrence posts on its own, and the cash-account cleared-state exception (`docs/product/functional-requirements.md:358`; `docs/architecture/domain-model.md:43`). This phase implements the contract and resolves those four questions.

The repository already supplies almost all of the machinery: an ordinary transaction command that is versioned, receipt-backed and transactional (`apps/api/src/persistence/financial-store.ts:122-157`), an idempotency key unique per budget (`apps/api/prisma/schema.prisma:313-322`), and the category-target precedent for adding one persisted planning entity without touching the money model. This phase therefore adds one table, one derivation, three commands and one surface, and borrows its entire atomicity guarantee instead of inventing one.

## What Changes

### A persisted schedule that is a plan, not a transaction

| Field | Meaning |
| --- | --- |
| `accountId` | The account a generated transaction will belong to, in the owning budget |
| `flow` | `INCOME` or `SPENDING` |
| `categoryId` | Required for `SPENDING`, forbidden for `INCOME` |
| `amountMinor` | A positive integer amount in minor units |
| `payee`, `memo` | Optional metadata carried onto the generated transaction |
| `dayOfMonth` | 1-31; an occurrence past the month's length clamps to that month's last day |
| `intervalMonths` | 1-12; the spacing in whole months |
| `startDate` | The calendar date of the first occurrence, `YYYY-MM-DD` |

A schedule changes no balance, no Activity, no Available, no Assigned and no Ready to Assign, and never appears as a transaction. It lives in its own table and is never folded into an event stream, so it is structurally incapable of affecting a projection.

### One recurrence shape: monthly, clamped

The owner chose one cadence and no more. Weekly, annual and custom rhythms stay out, exactly as the owner previously kept category targets to two kinds. A monthly cadence with an interval covers "every month", "every second month" and "every year" without a second anchor or a second date arithmetic.

### Generation is explicit, owner-triggered, and idempotent by construction

Generation is a command carrying an inclusive cut-off date, not a background job. The repository declares no background execution anywhere, and the CSV capability states explicitly that it introduces none (`openspec/specs/csv-manual-import-export/spec.md:170`); a scheduler would be the first one and would bring a runtime, a retry policy and a timezone policy this phase does not need.

Idempotency is not new machinery. Every occurrence gets a stable identity derived from its schedule and its occurrence date, and generation submits the ordinary transaction command with that identity as the idempotency key. The `CommandReceipt` unique constraint (`schema.prisma:313-322`) then makes a duplicate occurrence impossible, an overlapping retry a replay of the saved outcome, and a concurrent attempt resolve to exactly one transaction (`financial-store.ts:129-135`). **There is one authority for "has this occurrence happened": the receipt.** No generation cursor is persisted, because a cursor would be a second authority that could diverge from the first.

### Occurrences post on their own, as ordinary transactions

An occurrence creates its transaction without a per-occurrence confirmation, because that is what the contract says the scheduler does. Confirm-before-acting in this repository guards destructive or discretionary actions — a deletion, a reconciliation discrepancy — not a generation the owner already planned and explicitly requested.

### Uncleared by default, cleared into a cash account

Generated transactions are created uncleared, except that a transaction generated into a cash account is created cleared. Every creation call site states its cleared value explicitly instead of inheriting a default, so the exception cannot be honoured at one call site and forgotten at its sibling. Today creation omits the field and the adapter defaults it to `false` (`financial-store.ts:230`), which is exactly the shape of the defect class that dominated the previous phase.

### Canonical changes: the exclusion is modified, not contradicted

Two requirements are modified, and both keep their canonical scenario names verbatim:

- `reporting` — *Unsupported reporting concepts are excluded* (`openspec/specs/reporting/spec.md:67`): a transaction created by scheduled generation is accounted for as an ordinary transaction of its flow, and a schedule itself is never presented. Without this sentence the exclusion would read as forbidding the very transactions this phase creates.
- `transaction-history` — *Bounded transaction-history scope* (`openspec/specs/transaction-history/spec.md:141`): schedule management is a separate capability, and a generated transaction is an ordinary transaction governed by the history scope.

`report-policy/v1` and `report-policy/v2` are untouched.

### Disclosed limits

Once generated, an occurrence is ordinary transaction history, and ordinary edit/delete is itself still deferred in this repository. A schedule therefore cannot be edited, only removed and recreated, and an already generated occurrence cannot be corrected through this capability. The surface must say so.

## Capabilities

### New Capabilities

- `scheduled-transactions`: a persisted monthly schedule with no effect before its occurrence, its occurrence derivation, explicit idempotent generation into ordinary transactions, and the bounded scope of the capability.

### Modified Capabilities

- `reporting`: modifies the exclusion so a generated transaction accounts as an ordinary transaction while a schedule remains unrepresented.
- `transaction-history`: modifies the bounded scope so the boundary between history and schedule management is explicit.

## Impact

- **Data:** one additive table, one enum, and migration `0011`. No backfill: existing budgets simply have no schedules.
- **API:** three owner-scoped commands (create, list, remove) plus an explicit generation command; the OpenAPI contract documents them.
- **Web:** an account-scoped schedule surface — list, create, remove, and an explicit generate control.
- **Unchanged by design:** the financial engine's formulas, the balance projections, both persistence adapters' event model, both report policies, the transfer model, and the cleared-state invariant.

## Non-goals

- No background job, worker, cron, or posting without an explicit generation request.
- No editing an existing schedule; no weekly, annual, or custom recurrence; no more than one account or category per schedule.
- No schedule field in the summary, the dashboard, or either report, and no change to either report policy.
- No transfers, splits, cards, refunds, rehabilitations, or loans.
- No multi-timezone support: occurrence dates are calendar dates in the budget's UTC timezone.
- No full YNAB parity claim: the repository records that its private formulas are not known, so this implements an explicitly specified behaviour inspired by the public description, not a replica of it.

## Risks and how they are handled

| Risk | Handling |
| --- | --- |
| A second authority for "has this occurrence happened". | Only the receipt decides; no cursor is persisted. |
| The cash-account exception is applied at one creation site and forgotten at another. | Every creation call site passes `cleared` explicitly, with a test per persistence adapter. |
| A schedule leaks into a balance or a report. | Schedules are read by no projection and no report; an HTTP test asserts the summary and both reports contain no schedule field. |
| A long-overdue schedule floods history. | Generation is bounded by the cut-off date the caller supplies, and occurrences are enumerated from the schedule's own start date. |
| A replay duplicates an occurrence. | The occurrence identity is the ordinary command's idempotency key. |
| A schedule is mistaken for money. | A schedule is never a transaction and never a reported measure. |

## Success criteria

- An owner can create, list, and remove a monthly schedule for one account and, for spending, one category.
- A schedule changes no balance, Activity, Available, Assigned, Ready to Assign, or financial event before its occurrence.
- Generation with an inclusive cut-off date creates exactly one ordinary posted transaction per eligible occurrence.
- Generating the same range twice, or a concurrent attempt on the same occurrence, produces no duplicate transaction or financial effect.
- A transaction generated into a cash account is cleared; every other generated transaction is uncleared.
- A generated transaction projects exactly like an ordinary transaction, and no schedule appears in the summary, the dashboard, or either report.
- Both canonical requirements are modified rather than contradicted, with their scenario names preserved.

## Open items for the owner at this gate

1. Approve or reject the scope, including the single monthly cadence and explicit owner-triggered generation.
2. Approve or reject modifying the canonical reporting exclusion and the transaction-history bounded scope, and confirm `report-policy/v1` and `report-policy/v2` stay untouched.
3. Confirm that updating the product-scope documents, which currently mark scheduled transactions as deferred and out of MVP, is authorized as part of this change's approval.
