# Apply Progress: Manual CSV Import and Export

## Handoff status

- **Implementation status:** Not started; all 36 implementation-owned task rows remain unchecked in `tasks.md`.
- **Handoff:** This change is intentionally preserved in OpenSpec for a subsequent developer. No CSV production code, tests, routes, migrations, or web controls were added in this session.
- **Prerequisites:** The approved account, transfer, metadata, and history foundations are present in the workspace.
- **Delivery boundary:** Four bounded units under the existing `stacked-to-main` strategy; keep each unit within the native 400-line review budget and preserve the scope guardrails in `tasks.md`.
- **Rollback boundary:** Follow the per-unit rollback boundaries in `tasks.md`; do not rewrite immutable history or introduce a second financial authority.

## Deferred implementation units

1. CSV parser, serializer, normalization, validation, digest, and effective export projection.
2. Durable PostgreSQL batch import/export and restart/rebuild/rollback/concurrency evidence.
3. Authenticated HTTP routes, exact headers/statuses/envelopes, and OpenAPI contract updates.
4. Manual web upload/download UX and regression/E2E coverage.

## Environment and policy

- PostgreSQL is available through the repository Docker Compose setup at `localhost:5432`.
- Use `DATABASE_URL=postgresql://ynab:ynab_local@localhost:5432/ynab_dev` for PostgreSQL-backed verification.
- Receipt-driven development is disabled for this clone by explicit maintainer decision for this slice; ordinary SDD/TDD and repository delivery policy still apply.
- No commit or push was performed by the CSV apply attempt; the attempt was cancelled before implementation began.

## Exact next action

A future developer should start the native SDD `apply` phase for `implement-csv-manual-import-export`, consume `tasks.md` and the approved design/spec artifacts, and implement Unit 1 first using strict RED-GREEN-TRIANGULATE-REFACTOR evidence.
