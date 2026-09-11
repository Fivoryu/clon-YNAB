# YNAB Clone Documentation

This directory contains the product research and technical decisions for the academic YNAB clone.

## Current phase

**Phase 0 — research and documentation.** No application code and no SDD execution are planned yet.

The goal of this phase is to understand the product domain, document its important rules, choose a feasible architecture, and define a deliberately small MVP before implementation begins.

## Reading order

1. [YNAB domain research](research/ynab-domain.md)
2. [Domain model](architecture/domain-model.md)
3. [System architecture](architecture/system-overview.md)
4. [Technology stack](architecture/stack.md)
5. [MVP scope](product/mvp-scope.md)
6. [ADR-001: modular monolith](decisions/ADR-001-modular-monolith.md)

## Evidence policy

Each statement about the original product should be classified as one of:

- **Observed** — directly supported by a cited public source.
- **Inferred** — a reasonable technical interpretation, not an official implementation detail.
- **Clone decision** — a decision we make for the academic project.
- **Open question** — needs confirmation through further research or a deliberate product decision.

This project must not present the clone as the official YNAB product. It should use its own name, visual assets, and implementation.

## OpenSpec boundary

OpenSpec will be used later to describe and validate concrete product or technical changes. During this research phase, these stable documents are the source of context. We are intentionally not starting an SDD change yet.
