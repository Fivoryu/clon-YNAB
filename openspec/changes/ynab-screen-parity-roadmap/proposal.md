# Proposal: YNAB Screen and Capability Roadmap

## Status

**Proposed for user review; not approved.** This roadmap proposes expanding the academic MVP boundary for its first tranche only. The existing MVP decisions remain in force unless and until the user reviews and approves that expansion. This proposal does not edit existing MVP decision documents.

## Intent

Expand the academic YNAB-inspired clone in small, independently deliverable capability phases. The initial focus is account activity and a bounded, single-month report, followed by broader reporting and separately gated capabilities. This is a pragmatic academic roadmap—not a promise of literal commercial parity or a claim about YNAB's private implementation.

## Scope and roadmap

### Initial proposed MVP expansion — review and approval required

1. **Account activity.** Add an account detail/activity experience within the existing account workflow. Users must have a path to reach older available account history beyond the current 500-item result cap. The API pagination or continuation mechanism is intentionally left to design.
2. **Basic monthly report.** Add a basic report for one selected month, covering spending by category and income versus expenses. Its input scope includes transfers and working/pending transactions; they must not be silently excluded. Their classification, presentation, and contribution to any breakdown or total remain unresolved and must be decided in the later specification. No calculation semantics are invented by this proposal.

These are separate deliverables within the first tranche; neither depends on implementing the other as one large release. The MVP-boundary expansion is proposed, not authorized.

### Later roadmap candidates — separately scoped and gated

3. **Multi-month trends.** A distinct reporting phase after the basic monthly report. It requires an agreed multi-period aggregation contract. Its exact sequencing relative to targets and scheduled transactions remains a roadmap recommendation, not a commitment.
4. **Category targets** and **scheduled transactions.** Treat as independent capability tracks requiring product rules and domain/API support. Targets must remain distinct from assigned money. Do not assume target formulas, recurrence, timezone, occurrence, retry, or idempotency behavior.
5. **Reconciliation.** Consider only after cleared/uncleared behavior, cleared-balance semantics, reconciled-history protection, and correction/audit policy are defined. The existing reconciled flag alone is insufficient.
6. **Credit-card behavior** and **loan/payoff planning.** Treat as separate specialized capabilities, gated on supported account types and explicit financial assumptions. No formulas or simulator behavior are specified here.
7. **External and platform capabilities.** Collaboration, bank synchronization, offline behavior, and native mobile are much-later, independent proposals requiring their own authorization, integration, reliability, and platform decisions.

Each later capability requires its own scope review; inclusion on this roadmap is not implementation approval.

## Affected areas

- **Web:** account workflow currently served by `/accounts`; a basic Reports/Insights surface is absent.
- **API/reporting:** account-filtered transaction history currently caps results at 500, and the existing monthly summary is not a multi-period reporting contract.
- **Domain/API (later phases):** targets and schedules need new domain behavior; reconciliation needs cleared-state support; cards and loans need account/domain and financial-policy decisions.
- **Product scope:** existing MVP documents remain unchanged unless the proposed initial expansion is reviewed and approved.

## Non-goals

No implementation, API/schema or UI design, tests, task breakdown, report export, multi-month trends in the initial report, or external integrations are included. Do not treat public product descriptions as evidence of private YNAB behavior or claim literal feature parity.

## Risks and mitigations

- **MVP scope drift:** keep the initial expansion explicitly pending approval and leave current MVP documents authoritative until then.
- **Misleading or incomplete reports:** require later specification to settle transfer and working/pending classification and presentation; do not silently omit those records or invent formulas.
- **Incomplete account history:** make reachability beyond 500 an outcome requirement while leaving the continuation mechanism to design.
- **Premature commitments in later phases:** preserve their decision gates and do not imply unresolved policies are settled.
- **Coupled delivery or rollback:** keep phases independently deliverable; before implementation, define phase-specific migration and rollback plans so later capabilities do not become prerequisites for the initial tranche.

## Rollback

This proposal itself changes no application behavior or existing MVP decisions. If the proposed MVP expansion is not approved, retain the current MVP boundary and do not begin those capabilities under this proposal. If an individual roadmap phase is later approved and delivered, it should be independently disableable or revertible where practical, with its data/migration rollback approach defined during that phase's design.

## Success criteria

- Users can access account-specific activity and reach older available history beyond the current 500-item cap.
- The basic report covers one selected month and presents spending by category and income versus expenses, with transfers and working/pending transactions explicitly accounted for under rules approved in the later specification.
- Multi-month trends are not folded into the basic monthly report and remain a later phase.
- Later capabilities are planned and reviewed independently, with their domain rules resolved before implementation.
- The academic MVP boundary changes only if the user explicitly approves the proposed expansion.
