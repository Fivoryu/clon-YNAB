# System Architecture Overview

## Architectural decision in one sentence

Build the first version as a modular monolith with a web client, a typed HTTP API, and PostgreSQL; keep integration and asynchronous processing behind replaceable module boundaries.

## Goals

- Make budget calculations testable in isolation.
- Keep account and category effects consistent.
- Support one clear deployment for a student team.
- Make later bank imports, scheduled jobs, and reports possible without committing to microservices.
- Keep the system understandable for learning and evaluation.

## Non-goals for the first version

- Production-grade bank connectivity.
- Mobile-native clients.
- Multi-region deployment.
- Event-driven microservice infrastructure.
- Full commercial parity with YNAB.

## Logical components

```text
┌──────────────────────────────┐
│ Web client                   │
│ Next.js, React, TypeScript   │
└──────────────┬───────────────┘
               │ HTTPS / JSON
┌──────────────▼───────────────┐
│ API application              │
│ Auth | Budgets | Accounts    │
│ Categories | Transactions     │
│ Planning | Reports           │
└──────────────┬───────────────┘
               │ Prisma / SQL
┌──────────────▼───────────────┐
│ PostgreSQL                   │
│ authoritative financial data │
└──────────────────────────────┘

Future adapters:
  Bank import → Import module → idempotent transaction commands
  Scheduler   → Scheduled module → transaction commands
```

## Backend module responsibilities

| Module | Owns | Does not own |
|---|---|---|
| Auth | Identity, sessions, password or OAuth boundary | Budget calculations |
| Budgets | Budget lifecycle and membership | Bank credentials |
| Accounts | Account metadata, reconciliation state | Category allocation rules |
| Categories | Groups, categories, archive state | Account balances |
| Transactions | Commands, splits, transfers, payees | UI formatting |
| Planning | Months, allocations, availability calculations | Authentication |
| Reports | Read models and summaries | Authoritative writes |
| Imports (later) | External rows, mapping, deduplication | Direct balance mutation without domain validation |

A module can expose application services to other modules, but modules should not reach into each other's repositories directly.

## Request flow

```text
HTTP request
  → authentication middleware
  → budget-membership authorization
  → request validation
  → application command/query
  → domain rules
  → repository transaction
  → response DTO
```

For a financial write, the API must not accept a client-provided final balance as truth. It accepts an intent such as `RecordTransaction` or `AssignMoney`; the server calculates the effects.

## Data and consistency strategy

PostgreSQL is the source of truth. A command that changes both an account and the budget must use a database transaction.

Recommended first approach:

1. Store authoritative transaction and allocation movements.
2. Calculate derived balances in domain services or database queries.
3. Add cached read models only after profiling identifies a need.
4. Provide a rebuild/reconciliation command for derived data.

This favors correctness and explainability over premature optimization.

## Security boundaries

- Passwords are never stored directly; use a well-tested password hashing library if local credentials are implemented.
- Session or token cookies should be `httpOnly`, `secure` in production, and protected against CSRF where applicable.
- Every budget-scoped resource must verify ownership or membership on the server.
- Never log access tokens, passwords, bank credentials, or full financial payloads unnecessarily.
- Validate all monetary values and identifiers at the API boundary.
- Use database constraints in addition to application checks.

## Error handling

The API should return stable error categories rather than raw database errors:

- `UNAUTHENTICATED`
- `FORBIDDEN`
- `NOT_FOUND`
- `VALIDATION_ERROR`
- `CONFLICT`
- `INSUFFICIENT_AVAILABLE_FUNDS`
- `INTERNAL_ERROR`

Error responses should include a request identifier for debugging without exposing sensitive data.

## Testing strategy

### Unit tests

- money arithmetic;
- category availability formulas;
- split validation;
- transfer rules;
- month rollover;
- target progress.

### Integration tests

- authorization across budgets;
- atomic transaction writes;
- repository constraints;
- reconciliation behavior.

### End-to-end tests

- create a budget;
- add an account and starting balance;
- create categories;
- assign money;
- record spending;
- verify account and category summaries.

## Deployment shape

For local development and evaluation:

```text
Docker Compose
├── web
├── api
└── postgres
```

A single deployable API is sufficient for the first version. Redis, a worker process, and object storage are optional future additions, not baseline dependencies.

## Architecture risks

| Risk | Mitigation |
|---|---|
| Incorrect budget formulas | Specify examples first; test formulas independently. |
| Floating-point errors | Store integer minor units. |
| Cross-budget data leakage | Central authorization guard and tenant-scoped queries. |
| Duplicate imported transactions | Stable external IDs and idempotency keys. |
| Overgrown monolith | Enforce module boundaries and application services. |
| Premature integrations | Keep bank integration out of MVP. |
