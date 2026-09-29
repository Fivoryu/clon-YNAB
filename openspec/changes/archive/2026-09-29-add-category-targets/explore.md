# Explore: Category Targets

Read-only exploration performed before the proposal. Every factual claim is paired with the file and line that supports it. The product owner decided the four open questions after this exploration; those decisions are recorded in the proposal, not here.

## Why this phase exists

A budget category today can tell a user what has been assigned, spent, and left available, but nothing about what the category is *for*. The roadmap lists category targets as a later phase requiring new domain behaviour, and states that each later capability needs its own scope review rather than an approved commitment.

## Verified current behaviour

| Fact | Evidence |
| --- | --- |
| A category has only `id`, `name`, and `archived`. There is no target field and no target state. | `apps/api/prisma/schema.prisma:154-167`; `apps/api/src/app.ts:19`; `apps/web/app/models.ts:1` |
| Assignments are financial events (`ASSIGNMENT`, `UNASSIGNMENT`, `MOVE`), not rows in an assignment table, and `BudgetMonth` stores no per-category assignment or target. | `apps/api/prisma/schema.prisma:21-28`, `:179-186`, `:188-226` |
| `Available = permitted carryover + assigned + signed activity`, and only positive `Available` rolls forward. | `apps/api/src/planning/engine.ts:64-71`, `:99-114` |
| The monthly summary derives per-category values from events, and rollover is the previous month's positive `Available`. | `apps/api/src/reports/report-service.ts:37-60` |
| Assigning, unassigning, and moving require an active category, a positive integer amount, and a `YYYY-MM` month; over-assigning is permitted and RTA may go negative. | `apps/api/src/app.ts:50-51`, `:237-253`; `openspec/specs/budgeting/spec.md:113-124` |
| Category lifecycle is create, rename, and archive; there is no delete. Archive keeps the category and its history and rejects new activity in it. | `apps/api/src/app.ts:207-211`, `:497` |
| Category mutations go through the budget store rather than the versioned financial command path, so they do not create a receipt. | `apps/api/src/app.ts:210-211`; `apps/api/src/persistence/budget-store.ts:28-47` |
| `target` is already listed among the engine's deferred or unsupported commands. | `apps/api/src/planning/engine.ts:116-120` |
| The product backlog already defines a target contract: it is planning instruction, not money, assignment, or transaction; evaluating it changes no financial value; and a suggestion requires an explicit assignment. It is marked deferred with open questions about carryover, partial months, and when to suggest. | `docs/product/functional-requirements.md:315-331` |
| The repository's research records public YNAB targets as covering recurring, weekly, annual, and date-based needs, with set-aside, refill, and balance-by-period as distinct behaviours, and explicitly leaves the exact algorithm open. | `docs/research/ynab-domain.md:37-43`, `:85`; `docs/research/budget-engine.md:79-83`, `:169`, `:323-330` |
| No target migration exists; the schema's last migration is `0006_bank_provider_simulation`. | `apps/api/prisma/migrations/` |

## The canonical requirement that has to change

`openspec/specs/reporting/spec.md:67-76` states that the dashboard and the canonical monthly summary MUST NOT present partial or misleading representations of, among others, **targets**, and its scenario requires the system not to imply support for targets. Because the Budget view is the dashboard and the monthly summary is the summary, showing target state in either place requires **modifying this requirement explicitly** rather than adding the field silently.

The report endpoints are separate: `report-policy/v1` defines per-category spending for one month and `report-policy/v2` limits the series total to flow measures. The owner's decision keeps targets out of both, so neither policy is touched by this phase.

## Owner decisions taken after this exploration

1. **Two target kinds**: a monthly amount to set aside, and a total balance to reach by a date.
2. **Progress basis depends on the kind**: the month's assigned amount for the set-aside kind, and the available amount for the balance-by-date kind.
3. **Visible in the Budget view and the existing monthly summary**, not in the report endpoints.
4. **Inform and apply on confirmation**: the surface shows the gap and, if the user confirms, invokes the existing assignment command. Nothing is assigned automatically.

## Constraints the decisions create

- **A target must never move money.** Evaluating it changes no RTA, Assigned, Activity, Available, or balance. Only the existing assignment command does, and only when the user confirms it.
- **The set-aside kind must be measured on the month's assigned amount, not on `Available`.** Measuring it on `Available` would let carried-over money declare a monthly set-aside satisfied without anything being set aside this month.
- **Progress must be derived from the same snapshot** as the summary it appears in. Persisting a running total would double-count and could disagree with the category values beside it.
- **There is no target history.** The current definition is what is evaluated, so a target shown for a past month reflects today's definition, not the definition in force then. This must be disclosed, exactly as the multi-month series already discloses that its category labels are the current ones.
- **An archived category must not offer an actionable suggestion**, because the server rejects new activity in it.
- **A dated target needs an overdue concept**, or a target whose date has passed while underfunded reads as merely "not met yet".

## Open questions deliberately left to specification and design

- The date granularity of the balance-by-date kind, and whether it is a budget month or a full date.
- Whether a suggestion is rendered per category always, or only when the gap is positive and the category is active.
- How a target edit is versioned so the summary revision reflects it, given that category mutations currently bypass the financial command path.
- Whether the target state is computed inside `FinancialStore.load` or projected from the already-loaded state.
