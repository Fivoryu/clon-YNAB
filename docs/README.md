# YNAB Clone Documentation

This directory contains the product research and technical decisions for the academic YNAB clone.

## Current phase

**Implementation active — bounded MVP/later-slice capabilities are present in the repository.** The original research and Phase 1 documents are retained as historical product decisions, while OpenSpec changes now trace the implemented budgeting slice, transaction-history edit/delete, multi-account transfers, transaction metadata/search, and manual CSV import/export.

The application code lives under `apps/api` and `apps/web`. The root `README.md` is the current setup and verification entry point.

## Priority and delivery status

Priority and delivery status are separate dimensions. **P0**, **P1**, and **P2** express importance; they do not determine when a capability is delivered. Delivery status is expressed as **first slice**, **later MVP slice**, or **deferred/out of MVP**. A later-MVP P0 item remains important without being part of the bounded first slice.

## Reading order

1. [YNAB domain research](research/ynab-domain.md)
2. [YNAB screen and capability parity research](research/ynab-screen-parity.md)
3. [Budget engine research](research/budget-engine.md)
4. [Domain model](architecture/domain-model.md)
5. [System architecture](architecture/system-overview.md)
6. [Technology stack](architecture/stack.md)
7. [MVP scope](product/mvp-scope.md)
8. [Actors and use cases](product/actors-and-use-cases.md)
9. [Functional requirements](product/functional-requirements.md)
10. [Non-functional requirements](product/non-functional-requirements.md)
11. [ADR-001: modular monolith](decisions/ADR-001-modular-monolith.md)
12. [ADR-002: financial history](decisions/ADR-002-financial-history.md)
13. [E2E screenshot walkthrough](e2e/README.md)

## Visual evidence

The [E2E screenshot walkthrough](e2e/README.md) is the current visual record of the delivered
product surface. It captures a real browser session from the login screen through onboarding, the
monthly budget with category targets, transactions, accounts, reports, CSV data settings, the
320 px mobile layout and the sign-out that closes the cycle. It runs against a demo budget seeded
into the local PostgreSQL database; `npm run docs:screenshots` regenerates every image.

## Historical implementation entry gate

**Historical Clone decision:** Before the first slice was implemented, no implementation could begin until the Group 3 decisions in these documents are traced to concrete acceptance criteria. After this documentation update and its read-only verification checks, the next phase is bounded SDD/OpenSpec for the first vertical slice. This entry gate does not authorize implementation or start SDD/OpenSpec by itself.

## Evidence policy

Each statement about the original product should be classified as one of:

- **Observed** — directly supported by a cited public source.
- **Inferred** — a reasonable technical interpretation, not an official implementation detail.
- **Clone decision** — a decision we make for the academic project.
- **Open question** — needs confirmation through further research or a deliberate product decision.

This project must not present the clone as the official YNAB product. It should use its own name, visual assets, and implementation.

## OpenSpec boundary

OpenSpec is now used for concrete product and technical changes under `openspec/changes`. These research documents remain context and decision history; current implementation status is recorded in each change task/progress artifact and in the root `README.md`.
