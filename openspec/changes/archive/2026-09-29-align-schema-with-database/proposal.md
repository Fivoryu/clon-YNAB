# Proposal: Align the Prisma Schema with the Existing Database

**Draft for owner review. Approval of this proposal authorizes specification and design only; it does not authorize implementation.**

## Why

A read-only Prisma schema diff reports **112 `ALTER TABLE` statements** across the entire schema. Every timestamp column in all seven migrations is `TIMESTAMPTZ` while the Prisma models declare a plain `DateTime`, which Prisma maps to `TIMESTAMP(3)`, and no migration emits the `ON UPDATE CASCADE` that Prisma assumes by default for a relation.

The consequence is not a runtime failure: the application works and every suite passes. The consequence is that the schema and the migrations disagree, so `prisma migrate dev` would try to rewrite every table, and any future migration author would be reading a schema that does not describe the database they are changing. This was discovered while adding category targets, where the new table was flagged for exactly the same two reasons as the rest of the schema.

## What Changes

The Prisma schema is annotated so it **describes what the database already contains**, and the database is not touched:

- Every `DateTime` field gains the PostgreSQL native type that matches its existing column.
- Every relation gains the explicit update action that matches its existing foreign key.

This direction is deliberate. The alternative — rewriting 25 columns and recreating every foreign key in the database to match Prisma's defaults — would rewrite every table that holds data, require a rollback plan and a backup, and change nothing about how the product behaves. Aligning the schema instead reaches the same end state with no data migration at all.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. This change alters no requirement. It is a schema-description and tooling correction, which is why the change declares `skip_specs: true` rather than inventing a requirement to satisfy validation.

## Impact

- **`apps/api/prisma/schema.prisma`:** native-type annotations and explicit update actions only. No model, field, relation, or index is added or removed.
- **Database:** no change. No migration is authored, and no row is read or written.
- **API, web, and behaviour:** no change. If an annotation is wrong, Prisma's runtime mapping could change, which is why the full suites and the drift diff are both required evidence rather than one or the other.
- **Documentation:** none required.

## Non-goals

- No column type change, no foreign-key recreation, and no data migration of any kind.
- No change to any model, field, relation, index, or constraint.
- No behavioural change, and no new migration.
- No attempt to make Prisma's defaults win. The existing database is the reference, not Prisma's defaults.

## Success criteria

- `prisma migrate diff` from the database to the schema reports **no statements**, where it previously reported 112.
- `npm run db:validate` passes with the documented database URL.
- The full API and unit suite passes with zero failures and zero skips against the documented database, and the web suite and browser journeys pass unchanged.
- No migration is added, no database row is modified by this change, and no model, field, or relation changes shape beyond its annotation.

## Open item for the owner at this gate

1. Approve or reject the direction: annotate the schema to match the database rather than migrate the database to match the schema.
