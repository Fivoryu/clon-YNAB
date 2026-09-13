# Technology Stack

## Recommendation

**Clone decision — accepted for the first implementation:** Use the following modular-monolith stack for the first slice. Course, hosting, and later infrastructure refinements remain **Open question** where noted below.

Use one language across the client and server: TypeScript. Choose mature, boring tools so the team spends its effort learning the budgeting domain instead of operating infrastructure.

| Layer | Accepted first-slice technology | Reason |
|---|---|---|
| Web app | Next.js + React + TypeScript | Component model, routing, server/client flexibility, strong ecosystem. |
| API | NestJS + TypeScript | Explicit modules, dependency injection, validation, OpenAPI support. |
| Database | PostgreSQL | Transactions, constraints, reliable relational modeling, good reporting queries. |
| ORM | Prisma | Type-safe access and migrations without hiding the relational model. |
| Styling | Tailwind CSS or a small project-owned CSS system | Fast consistent UI without coupling domain logic to visual components. |
| Validation | class-validator on API DTOs or Zod at shared boundaries | Reject invalid input close to the boundary. |
| API contract | OpenAPI/Swagger | Makes endpoints inspectable and supports frontend coordination. |
| Local environment | Docker Compose | Reproducible API, web, and database setup. |
| Unit/integration tests | Jest | Domain and API verification. |
| Browser tests | Playwright | Verifies the main budgeting workflow in a real browser. |
| Formatting/linting | ESLint + Prettier | Shared code quality baseline. |

## Why not microservices?

The MVP has one cohesive domain, a small team, and no independent scaling requirement. Microservices would add network failures, deployment complexity, duplicated types, and distributed consistency problems before the team has validated the business rules.

The modular monolith still gives us boundaries. If a future import worker or reporting service needs to split out, it can do so after real evidence.

## Suggested repository layout

```text
apps/
├── web/                     # Next.js client
└── api/                     # NestJS application

packages/
└── contracts/               # Optional generated/shared API types

docs/
├── research/
├── architecture/
├── product/
└── decisions/

infra/
└── docker/                  # Compose and local infrastructure

prisma/                      # Schema and migrations, if kept at workspace root
```

A monorepo is a good fit if the course team wants one repository and shared tooling. It is not required to make the architecture modular; module boundaries must exist in the application code either way.

## Data modeling guidelines

- **Clone decision:** PostgreSQL is authoritative for financial state and history.
- **Clone decision:** One canonical Prisma schema and migration owner belongs to the API persistence boundary; do not create duplicate schemas. This is a boundary decision, not a claim about a private YNAB schema.
- Use UUIDs for public identifiers unless the course has a reason to prefer another strategy.
- Use `BIGINT` or a decimal-safe representation for money in integer minor units.
- **Clone decision:** Store one explicit IANA budget timezone, defaulting to `UTC` for the first slice; transaction dates are date-only business dates and event timestamps are UTC. The browser timezone must not decide month boundaries.
- Add `created_at` and `updated_at` to mutable records.
- Use explicit status fields for archived, reconciled, scheduled, or deleted states.
- Add foreign keys and unique constraints for budget ownership and external import identifiers.
- Prefer soft deletion or voiding for financial history when auditability matters.

## API conventions

- **Clone decision:** Version the API from the beginning at `/api/v1`.
- **Clone decision:** Use resource-oriented routes for reads and intent-oriented commands for financial writes.
- **Clone decision:** Return DTOs, not ORM models.
- Use pagination for transaction lists.
- **Clone decision:** Use the stable JSON envelopes `{data, requestId}` for success and `{error:{code,message,requestId}}` for errors.
- **Clone decision:** Map stable categories to conventional statuses: `401 UNAUTHENTICATED`, `403 FORBIDDEN`, `404 NOT_FOUND`, `400 VALIDATION_ERROR`, `409 CONFLICT`, `422 INSUFFICIENT_AVAILABLE_FUNDS`, and `500 INTERNAL_ERROR`.
- **Clone decision:** Messages must not expose secrets, raw database errors, or unnecessary financial payloads.
- **Clone decision:** All first-slice mutating financial commands use an idempotency key; same-payload replay succeeds and a different payload returns `CONFLICT`.
- **Open question:** Exact endpoint names and DTO fields remain implementation-level choices to be traced during bounded SDD/OpenSpec; they must not be inferred as private YNAB details.

## Authentication choice

**Clone decision — accepted for the first slice:** Use local email/password with server-managed opaque sessions. Passwords use a well-tested password-hashing library. Session cookies are `httpOnly`, `secure` in production, and protected with same-site/CSRF measures as applicable; logout revokes the session, the server configures explicit expiry, and no long-lived browser tokens are used.

**Clone decision:** External identity providers are deferred/out of MVP and are not an implementation blocker. Future roles and collaboration remain **Open question**.

## Dependency policy

- Prefer libraries with active maintenance and clear licenses.
- Keep the first dependency set small.
- Do not add Redis, Kafka, a workflow engine, or a bank provider until a documented requirement needs it.
- Pin versions through the package manager lockfile.
- Review security advisories as part of CI.

## Alternatives considered

### Full-stack Next.js only

This is simpler and viable for a very small MVP. It is less useful if the course expects a separately understood backend API and domain architecture.

### Supabase/Firebase

These can accelerate authentication and persistence, but they hide some database and authorization decisions. They may be appropriate if delivery time is the main constraint, but PostgreSQL plus an explicit API teaches more of the system.

### Java/Spring Boot

A good alternative if the course or team is already centered on Java. The domain decisions remain the same; only the implementation ecosystem changes.

## Decision status

**Accepted for the first implementation.** The first slice uses Next.js + React + TypeScript web, NestJS + TypeScript API, PostgreSQL, Prisma, Docker Compose, OpenAPI/Swagger, ESLint/Prettier, Jest, and Playwright. Redis, workers, Kafka, workflow engines, bank providers, and similar infrastructure additions remain outside MVP unless a later approved requirement needs them.

**Open question:** Confirm course requirements, hosting constraints, and expected deliverables during bounded SDD/OpenSpec. These refinements do not reopen the accepted first-slice stack.
