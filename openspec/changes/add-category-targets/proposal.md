# Proposal: Category Targets

**Draft for owner review. Approval of this proposal authorizes specification and design only; it does not authorize implementation.**

## Why

A category today reports what was assigned, spent, and is available, but nothing about what the category is *for*. A user cannot tell whether the money set aside for a category is enough for its purpose, and cannot see a gap between intent and funding.

The product backlog already defines the contract this must respect: a target is planning instruction, not money, assignment, or a transaction; evaluating it changes no financial value; and a suggestion requires an explicit assignment (`docs/product/functional-requirements.md:315-331`). That contract is deferred and has open questions, so this phase both implements it and resolves the questions it left open.

The one thing that cannot be added quietly is visibility. The canonical reporting requirement forbids the dashboard and the canonical monthly summary from presenting targets (`openspec/specs/reporting/spec.md:67-76`). Since the Budget view is the dashboard and the monthly summary is that summary, showing target state in either place means modifying that requirement, deliberately and in the open.

## What Changes

### A persisted target definition, one per category

| Field | Meaning |
| --- | --- |
| `categoryId` | The category the target belongs to, in the owning budget |
| `kind` | `MONTHLY_SET_ASIDE` or `BALANCE_BY_DATE` |
| `amountMinor` | A positive integer amount in minor units |
| `targetMonth` | Required for `BALANCE_BY_DATE`, expressed as `YYYY-MM`; forbidden for `MONTHLY_SET_ASIDE` |

The owner chose two kinds and no more. Weekly, annual, and custom rhythms, and the refill behaviour, stay out: the repository's own research records set-aside, refill, and balance-by-period as distinct behaviours rather than variants of one formula (`docs/research/budget-engine.md:79-83`).

### A derived target state, per category, for the requested month

Each category in the monthly summary gains a target block when a target exists:

- **`MONTHLY_SET_ASIDE`** measures the month's **assigned amount**. This is the deliberate consequence of the owner's choice: measuring a monthly set-aside on `Available` would let money carried over from earlier months declare this month's set-aside satisfied without anything being set aside now.
- **`BALANCE_BY_DATE`** measures the month's **available amount**, because a balance goal asks whether the money is there, and carried-over money genuinely counts towards it.
- The block carries the kind, the amount, the target month where applicable, the progress, the remaining gap as a non-negative value, and a status of `MET`, `UNDERFUNDED`, or `OVERDUE`. `OVERDUE` applies only to a dated target whose month has passed while still underfunded; without it, a target whose date is behind us would read as merely "not met yet".

### Commands that never move money

- Setting or replacing a category's target, and removing it, are owner-scoped and validated on the server.
- **A target mutation must change the revision reported with the summary.** Category mutations today bypass the versioned financial command path, so this is a deliberate difference: a client holding a summary revision must not be able to keep a stale view that silently lacks the target.
- A target change alters no RTA, Assigned, Activity, Available, or balance. Only the existing assignment command moves money, and only when the user confirms it.

### A suggestion with an explicit confirmation

The Budget view shows the gap for a category with a positive gap and an actionable suggestion, and the confirmation invokes the existing assignment command. There is no new money-moving command and nothing is assigned automatically, which is what the existing product contract requires.

### A modified reporting exclusion

The exclusion is modified to permit target state on the dashboard and the canonical monthly summary, while keeping targets out of the single-month report and the multi-month series and keeping every other excluded concept unavailable. `report-policy/v1` and `report-policy/v2` are untouched, because the owner kept targets out of the report endpoints.

### Disclosed limits

The current target definition is what is evaluated, and no target history is stored, so a target shown for a past month reflects today's definition rather than the definition in force then. The surface must say so, in the same spirit as the multi-month series disclosing that its category labels are current.

## Capabilities

### New Capabilities

None. This change extends the existing budgeting, reporting, and guided-budgeting capabilities.

### Modified Capabilities

- `budgeting`: adds a persisted per-category target definition, its server-derived state for a requested month, and the invariant that a target changes no financial value.
- `reporting`: modifies the exclusion requirement so target state may appear on the dashboard and the canonical monthly summary, while remaining absent from the report endpoints.
- `guided-budgeting-ux`: adds target presentation and the confirm-to-assign interaction inside the category context, without exposing implementation terminology.

## Impact

- **Data:** one additive table and migration. No backfill: existing categories simply have no target.
- **API:** target read is part of the existing summary response; two new owner-scoped commands set and remove a target; the OpenAPI contract documents them.
- **Web:** the budget category row gains the target state and the confirmation action; the web model and hook gain the target shapes.
- **Unchanged by design:** the report endpoints and both report policies, the assignment commands and their semantics, the category lifecycle, and the financial engine.

## Non-goals

- No weekly, annual, or custom target rhythms, and no refill behaviour.
- No snooze, no multiple targets per category, and no target history or versioning.
- No target field in the single-month report or the multi-month series, and no change to either report policy.
- No automatic assignment, and no target that changes RTA, Assigned, Activity, Available, or a balance.
- No target-driven money movement of any kind.
- No category deletion, and no new activity in an archived category.
- No full YNAB parity claim: the repository records that its private formulas are not known, so this implements an explicitly specified behaviour inspired by the public description, not a replica of it.

## Risks and how they are handled

| Risk | Handling |
| --- | --- |
| A monthly set-aside looks satisfied because money carried over. | That kind is measured on the month's assigned amount, never on `Available`. |
| A suggestion is mistaken for available money. | The gap is presented as a suggestion distinct from RTA, over-assignment and a negative RTA remain possible and visible, and nothing is assigned without confirmation. |
| The same money is counted twice. | State is derived from the same snapshot as the category values beside it and is never persisted as a running total. |
| A target is shown for a past month as though it had been in force. | The current definition is what is evaluated, and the surface discloses it. |
| An archived category offers an action the server would reject. | An archived category keeps its target read-only and offers no actionable suggestion. |
| A stale summary silently lacks the target. | A target mutation changes the reported revision. |

## Success criteria

- An owner can set, replace, and remove one target per category, of either kind, with the fields each kind requires and no field the other kind forbids.
- The monthly summary reports each category's target state for the requested month, computed on the basis the kind declares.
- Setting or removing a target changes no RTA, Assigned, Activity, Available, or balance, and no money moves without an explicit confirmed assignment.
- A monthly set-aside is never reported as met on the strength of carried-over money.
- A dated target past its month and still underfunded is reported as overdue rather than merely not met.
- Target state appears on the Budget view and in the monthly summary, and in neither report endpoint.
- A target mutation changes the reported revision, so a stale client cannot hold a summary that silently lacks the target.
- The canonical reporting exclusion is modified rather than contradicted.

## Open items for the owner at this gate

1. Approve or reject the scope, including the two kinds and the progress basis each uses.
2. Approve or reject modifying the canonical reporting exclusion, and confirm the report endpoints and both report policies stay untouched.
3. Confirm that updating the product-scope documents, which currently mark targets as deferred, is authorized as part of this change's approval.
