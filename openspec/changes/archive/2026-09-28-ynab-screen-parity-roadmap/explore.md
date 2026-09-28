# Exploration: YNAB Screen and Capability Expansion Roadmap

## Outcome

Recommend a phased academic-clone roadmap that expands account activity, reporting, planning automation, controlled account history, specialized debt workflows, and—much later—cross-platform or external capabilities. This is a roadmap for screen/capability coverage, not a promise of literal YNAB parity or approval of every phase for the current MVP. The user selected the complete phased roadmap; the exact behaviors and implementation acceptance criteria remain to be decided per phase.

## Repository findings validated

| Area | Evidence and implication |
|---|---|
| Account activity | `apps/web/app/accounts/page.tsx` is an account list/management surface. `apps/api/src/server.ts` accepts account-filtered transaction history, so an account register can build on an existing capability rather than require a new top-level navigation destination. |
| History limits | The history query has account/date/type/category/text filters but no page/cursor parameters (`apps/api/src/server.ts`). `apps/api/src/planning/transaction-history.ts` sorts newest-first and returns at most 500 matches. The handoff's “no pagination” claim is accurate; importantly, this is a 500-item cap without a continuation mechanism, not an unbounded response. A useful full register needs an explicit older-history strategy. |
| Reporting foundation | `apps/api/src/server.ts` exposes a summary by requested month, and `apps/api/src/reports/report-service.ts` returns a monthly financial summary. This supports a narrowly defined monthly view; it is not a multi-period reporting/aggregation contract. Existing transaction CSV export is not report export. |
| Planning automation | `apps/api/prisma/schema.prisma` contains accounts, categories, budget months, and financial events, but no target or scheduled-transaction models. The roadmap's targets and schedules therefore require domain/API work, not only new screens. |
| Reconciliation | The schema includes `FinancialEvent.reconciled`, but transaction status is only `POSTED`/`WORKING`; this flag alone does not provide cleared/uncleared states, a cleared-balance workflow, or reconciliation policy. Reconciliation remains gated on those behaviors. |
| Account types | `AccountKind` currently supports `CASH` and `CHECKING`. Credit-card and loan workflows require domain/account support beyond the current model. |
| Existing scope boundary | `docs/product/mvp-scope.md` and `docs/product/functional-requirements.md` place targets and schedules outside the bounded first slice, reconciliation in later MVP scope, and advanced reports/card behavior outside or later than that slice. The roadmap should preserve those boundaries unless a later product decision changes them. |

The research handoff `docs/research/ynab-screen-parity.md` remains the source for external observations and the fuller route/current-state inventory. Its external research was not repeated.

## Recommended phases

Priority labels and phase order below are roadmap recommendations, not new product facts or detailed implementation commitments.

1. **Account activity and basic Reports/Insights.** Add account detail/activity within the existing accounts flow; reuse account-filtered history and account summaries. Separately define a basic report limited to currently supported monthly summaries. Do not promise multi-month trends until an aggregation contract exists. Before presenting a complete register, decide how history beyond the latest 500 items is reached. Treat report export as a separate capability from transaction CSV export.
2. **Category targets and scheduled transactions.** Plan these as two independent capability tracks, not as a combined screen release. Targets belong with budget categories and must remain distinct from assigned money. Schedules belong with account activity/register and should produce ordinary transaction effects only under an explicit occurrence policy. Both tracks require agreed domain behavior and model/API work before their screens are implementation-ready.
3. **Reconciliation.** Add reconciliation within account activity only after cleared/uncleared state, cleared-balance calculation, reconciled-history protection, and correction/audit policy are defined. The existing `reconciled` flag is not a substitute for that prerequisite.
4. **Credit-card and loan workflows.** Treat basic card behavior and a loan/payoff planner as specialized, separate domain commitments. Resolve supported account types and financial assumptions before promising either; do not imply that a loan simulator follows automatically from a card screen.
5. **External and platform capabilities.** Consider collaboration, bank synchronization, offline behavior, and native mobile only as later, separately scoped expansions. They cross authorization, integration, reliability, and platform boundaries and should not be treated as a single “parity” implementation.

### Dependency outline

```text
Account detail/register ── existing filtered history ── history >500 strategy
Basic monthly report ───── existing monthly summary
Multi-period reports ───── report definitions + aggregation contract
Targets ────────────────── target types/periods/suggestion policy + model/API
Scheduled transactions ── recurrence/timezone/occurrence/idempotency policy + model/API
Reconciliation ────────── cleared state + cleared balance + lock/correction/audit policy
Cards/loans ────────────── account/domain support + explicit financial assumptions
External/platform work ── independent authorization, provider, sync, and platform decisions
```

## Open product decisions and risks

- **Report definition:** Which monthly measures are in the basic report, which periods are selectable, how comparisons/trends are computed, and whether report export is required. The current summary endpoint does not settle these questions.
- **Register completeness:** The latest-500 cap is a concrete constraint. Decide whether the register uses paging, a bounded date range, or another continuation strategy before claiming complete history.
- **Targets:** Choose the supported target subset, periods, partial-period/carryover behavior, and status/suggestion semantics. Existing requirements correctly state that targets must not themselves create or assign money.
- **Schedules:** Set budget-timezone and recurrence rules, occurrence generation, missed-run/retry/idempotency behavior, and post-generation editing semantics.
- **Reconciliation:** Define cleared state and balance semantics plus lock, correction, and audit policy. The model's `reconciled` boolean is only a partial marker.
- **Scope language:** Basic reporting is described as a first roadmap tranche here, while current MVP documents defer advanced reports. Keep “basic” explicitly bounded and record any MVP-boundary change as a separate product decision; do not silently relabel deferred scope as already approved MVP behavior.
- **Later capabilities:** Card/loan and external/platform phases lack enough product decisions to specify as implementation-ready features. Their place in the full roadmap does not establish their formulas, provider behavior, or delivery commitment.

## Recommended next step

Resolve the report definition/time-range and the academic scope boundary first, then confirm the desired history continuation behavior. Keep targets, schedules, and reconciliation as separate follow-up decision gates using their documented open policies. Only after those product facts are settled should this roadmap advance to an OpenSpec proposal; this exploration does not create proposal/spec/design/tasks.

## Non-goals

No application implementation, API/schema design, UI design, tests, builds, renewed external research, private YNAB implementation claims, or commitment to literal feature parity. No capabilities beyond the selected phased screen/capability roadmap are introduced.
