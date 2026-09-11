# Technology Stack Proposal

## Recommendation

Use one language across the client and server: TypeScript. Choose mature, boring tools so the team spends its effort learning the budgeting domain instead of operating infrastructure.

| Layer | Proposed technology | Reason |
|---|---|---|
| Web app | Next.js + React + TypeScript | Component model, routing, server/client flexibility, strong ecosystem. |
| API | NestJS + TypeScript | Explicit modules, dependency injection, validation, OpenAPI support. |
| Database | PostgreSQL | Transactions, constraints, reliable relational modeling, good reporting queries. |
| ORM | Prisma | Type-safe access and migrations without hiding the relational model. |
| Styling | Tailwind CSS or a small project-owned CSS system | Fast consistent UI without coupling domain logic to visual components. |
| Validation | class-validator on API DTOs or Zod at shared boundaries | Reject invalid input close to the boundary. |
| API contract | OpenAPI/Swagger | Makes endpoints inspectable and supports frontend coordination. |
| Local environment | Docker Compose | Reproducible API, web, and database setup. |
| Unit/integration tests | Jest or Vitest | Domain and API verification. |
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

- Use UUIDs for public identifiers unless the course has a reason to prefer another strategy.
- Use `BIGINT` or a decimal-safe representation for money in minor units.
- Store dates deliberately: transaction date is a calendar/business date; timestamps are UTC.
- Add `created_at` and `updated_at` to mutable records.
- Use explicit status fields for archived, reconciled, scheduled, or deleted states.
- Add foreign keys and unique constraints for budget ownership and external import identifiers.
- Prefer soft deletion or voiding for financial history when auditability matters.

## API conventions

- Version the API from the beginning, for example `/api/v1`.
- Use resource-oriented routes for reads and intent-oriented commands for financial writes.
- Return DTOs, not ORM models.
- Use pagination for transaction lists.
- Use consistent error responses.
- Add idempotency support before implementing imports or repeated financial commands.

## Authentication choice

For an academic MVP, two viable options exist:

1. local email/password with secure server-managed sessions;
2. an external identity provider, if the course prioritizes product features over authentication learning.

The default recommendation is server-managed sessions because it avoids placing long-lived tokens in browser storage. The choice must be recorded before implementation.

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

**Provisional.** Confirm team skills, course requirements, hosting constraints, and expected deliverables before freezing the stack in an OpenSpec change.
