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

**Clone decision:** The API persistence boundary owns one canonical Prisma schema and migration history. This documentation does not specify a private YNAB schema.

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

**Clone decision:** The API is versioned at `/api/v1`, uses DTOs rather than ORM models, and returns intent-oriented financial commands. Success responses use `{data, requestId}`; errors use `{error:{code,message,requestId}}`. Stable categories map to `401 UNAUTHENTICATED`, `403 FORBIDDEN`, `404 NOT_FOUND`, `400 VALIDATION_ERROR`, `409 CONFLICT`, `422 INSUFFICIENT_AVAILABLE_FUNDS`, and `500 INTERNAL_ERROR`. Messages must not expose secrets, raw database errors, or unnecessary financial payloads.

## Data and consistency strategy

**Clone decision:** PostgreSQL is authoritative. The API persistence boundary has one canonical Prisma schema and migration owner; duplicate schemas are not permitted. A command that changes both an account and the budget must use one PostgreSQL transaction.

**Clone decision:** Setup/opening movement, assignments, moves, realized income, and categorized spending are first-slice mutating financial commands. Each carries an idempotency key: same-payload retries replay the same logical result, while a different payload with the same key returns `CONFLICT`. Stale writes use optimistic version checks and return `CONFLICT` rather than overwriting newer state.

Recommended first approach:

1. Store authoritative transaction and allocation movements.
2. Calculate derived balances in domain services or database queries.
3. Add cached read models only after profiling identifies a need.
4. Provide a deterministic rebuild path for derived data.

This favors correctness and explainability over premature optimization.

## Security boundaries

- **Clone decision:** The first slice uses local email/password and server-managed opaque sessions. Passwords use a well-tested password-hashing library.
- **Clone decision:** Session cookies are `httpOnly`, `secure` in production, same-site/CSRF protected as applicable, explicitly server-expiring, and revoked on logout. No long-lived browser tokens are used.
- **Clone decision:** External identity providers are deferred/out of MVP, not an implementation blocker.
- **Clone decision:** Every budget-scoped resource must verify ownership or membership on the server. The first slice is one user-owned budget; future roles and collaboration remain deferred/Open question.
- **Clone decision:** Foreign budgets and resources use a uniform non-disclosing `NOT_FOUND` response.
- Never log access tokens, passwords, bank credentials, or full financial payloads unnecessarily.
- Validate all monetary values and identifiers at the API boundary.
- Use database constraints in addition to application checks.

## Error handling

**Clone decision:** The API returns stable error categories rather than raw database errors:

- `UNAUTHENTICATED` → HTTP 401
- `FORBIDDEN` → HTTP 403
- `NOT_FOUND` → HTTP 404, including foreign budget/resource lookups
- `VALIDATION_ERROR` → HTTP 400
- `CONFLICT` → HTTP 409
- `INSUFFICIENT_AVAILABLE_FUNDS` → HTTP 422
- `INTERNAL_ERROR` → HTTP 500

**Clone decision:** Error responses use `{error:{code,message,requestId}}`; success responses use `{data,requestId}`. Messages and logs must not expose secrets, raw database errors, or unnecessary financial payloads.

## Testing strategy

**Clone decision:** The first-slice verification gate is mandatory:

### Unit tests

- money arithmetic;
- bounded RTA and Available calculations;
- allocation and move rules.

### Integration tests

- authorization isolation across budgets;
- PostgreSQL atomicity;
- idempotency replay and different-payload conflict;
- optimistic concurrency and stale-write conflict;
- deterministic derived-summary rebuild.

### End-to-end tests

- Playwright coverage of the primary journey: authenticate, create a budget, add an account and opening balance, create categories, assign money, record spending, and verify account/category/month summaries.

CI must expose and run repository scripts for format check, lint, unit/integration tests, E2E where the environment permits, and build. **Open question:** No numeric coverage threshold is established; coverage remains a non-blocking target until agreed.

## Deployment shape

For local development and evaluation:

```text
Docker Compose
├── web
├── api
└── postgres
```

A single deployable API is sufficient for the first version. Redis, a worker process, and object storage are optional future additions, not baseline dependencies. **Clone decision:** Redis and workers are outside MVP.

## Architecture risks

| Risk | Mitigation |
|---|---|
| Incorrect budget formulas | Specify examples first; test formulas independently. |
| Floating-point errors | Store integer minor units. |
| Cross-budget data leakage | Central authorization guard and tenant-scoped queries. |
| Duplicate imported transactions | Stable external IDs and idempotency keys. |
| Overgrown monolith | Enforce module boundaries and application services. |
| Premature integrations | Keep bank integration out of MVP. |
