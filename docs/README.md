# YNAB Clone Documentation

This directory contains the product research and technical decisions for the academic YNAB clone.

## Current phase

**Phase 1 — Group 3 implementation-readiness decisions recorded.** This remains a documentation-only phase: no application code has started, and SDD/OpenSpec has not started.

The goal of this phase is to record the approved implementation-readiness decisions, preserve unresolved questions explicitly, and maintain a deliberately small MVP boundary before implementation begins.

## Priority and delivery status

Priority and delivery status are separate dimensions. **P0**, **P1**, and **P2** express importance; they do not determine when a capability is delivered. Delivery status is expressed as **first slice**, **later MVP slice**, or **deferred/out of MVP**. A later-MVP P0 item remains important without being part of the bounded first slice.

## Reading order

1. [YNAB domain research](research/ynab-domain.md)
2. [Budget engine research](research/budget-engine.md)
3. [Domain model](architecture/domain-model.md)
4. [System architecture](architecture/system-overview.md)
5. [Technology stack](architecture/stack.md)
6. [MVP scope](product/mvp-scope.md)
7. [Actors and use cases](product/actors-and-use-cases.md)
8. [Functional requirements](product/functional-requirements.md)
9. [Non-functional requirements](product/non-functional-requirements.md)
10. [ADR-001: modular monolith](decisions/ADR-001-modular-monolith.md)
11. [ADR-002: financial history](decisions/ADR-002-financial-history.md)

## Implementation entry gate

**Clone decision:** No implementation may begin until the Group 3 decisions in these documents are traced to concrete acceptance criteria. After this documentation update and its read-only verification checks, the next phase is bounded SDD/OpenSpec for the first vertical slice. This entry gate does not authorize implementation or start SDD/OpenSpec by itself.

## Evidence policy

Each statement about the original product should be classified as one of:

- **Observed** — directly supported by a cited public source.
- **Inferred** — a reasonable technical interpretation, not an official implementation detail.
- **Clone decision** — a decision we make for the academic project.
- **Open question** — needs confirmation through further research or a deliberate product decision.

This project must not present the clone as the official YNAB product. It should use its own name, visual assets, and implementation.

## OpenSpec boundary

OpenSpec will be used later to describe and validate concrete product or technical changes. During this research phase, these stable documents are the source of context. We are intentionally not starting an SDD change yet.
