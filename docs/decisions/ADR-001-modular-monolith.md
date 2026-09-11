# ADR-001: Use a Modular Monolith for the First Version

- **Status:** Proposed
- **Date:** 2026-09-10
- **Decision owners:** Project team

## Context

The project is an academic YNAB clone at the research stage. The team needs to learn the budgeting domain, produce a working MVP, and preserve enough architectural structure to explain the system. There is no independent service boundary, scaling requirement, or operations team yet.

## Decision

Implement the first version as a modular monolith:

- one web application;
- one API application;
- one PostgreSQL database;
- explicit backend modules for identity, budgets, accounts, categories, transactions, planning, and reports;
- asynchronous workers only when a real scheduled or import requirement is accepted.

## Consequences

### Positive

- Financial commands can use one database transaction.
- Local development and evaluation are simple.
- The team can test domain rules without network coordination.
- Deployment and debugging have a small operational surface.
- Module boundaries still make responsibilities visible.

### Negative

- The API deployable can become too large if boundaries are ignored.
- One runtime failure can affect multiple modules.
- Future extraction into services would require explicit integration contracts.

## Guardrails

- Modules communicate through application services or stable contracts, not each other's repositories.
- Domain calculations do not depend on HTTP or UI code.
- Database writes that affect multiple financial views are atomic.
- New infrastructure requires a documented requirement and an ADR or updated decision record.
- Reports consume read models or queries; they do not mutate authoritative financial state.

## Alternatives rejected for now

### Microservices

Rejected because the added deployment and distributed-consistency cost is not justified by the current scope.

### Serverless-only backend

Not rejected permanently, but deferred. It may be useful for hosting, while the logical modular-monolith decision remains unchanged.

### Backend-as-a-service only

Deferred because the team should explicitly learn the domain, authorization, transactions, and relational constraints.

## Revisit triggers

Reconsider this decision if one of these becomes real:

- bank integrations require an isolated credential-processing worker;
- reports require independently scalable workloads;
- multiple teams own independently deployable areas;
- operational evidence shows the monolith is the limiting factor.
