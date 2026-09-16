# Feature: Implement CSV Manual Import and Export

## Objective
Complete the remaining verification-owned work for the OpenSpec change `implement-csv-manual-import-export` after the fast-forward update from `origin/master`.

## Why
The production CSV implementation is present, but PostgreSQL durability/concurrency evidence and the final web regression command remain unobserved in this environment.

## Scope and constraints
- Verify only the existing CSV import/export implementation and its declared regression gates.
- Do not expand CSV format, add unsupported financial features, or alter unrelated OpenSpec changes.
- Preserve unrelated Docker containers and untracked `.codegraph/` and `.pi/` artifacts.
- Record unavailable infrastructure honestly; do not mark a task complete without observed evidence.

## Tasks
- [x] ODD-CSV-1: Provision an isolated temporary PostgreSQL service without disturbing unrelated containers.
- [x] ODD-CSV-2: Run CSV PostgreSQL persistence, restart/rebuild, rollback, idempotency, concurrency, and regression checks; capture exact results.
- [x] ODD-CSV-3: Run web typecheck/build and E2E checks using an isolated web port or record the precise environmental blocker.
- [x] ODD-CSV-4: Update the OpenSpec task/progress artifacts only for observed results and report the remaining parent-owned review gates.

## Acceptance criteria
- Local branch remains synchronized with `origin/master` with no merge conflicts.
- Database-backed CSV checks either pass against the temporary database or remain explicitly pending with exact blocker evidence.
- Web/E2E checks either pass or remain explicitly pending with exact blocker evidence.
- No unrelated source or container is changed.
- OpenSpec and this task document reflect only observed evidence.

## Checks
- `npm test`
- `npm run typecheck:web`
- `npm run build:web`
- `DATABASE_URL=<isolated-url> npm run db:migrate`
- `DATABASE_URL=<isolated-url> npm test`
- focused CSV and E2E commands where infrastructure permits
- `git diff --check`
- `git status --short --branch`

## Progress
- Merged `origin/master` fast-forward (`4ebd506` to `4e5afe5`) without conflicts.
- Baseline verification: unit tests passed 63/63 with 16 PostgreSQL skips; web typecheck/build passed; default E2E was blocked by a reused unrelated server on port 3000; DB validation was blocked without `DATABASE_URL`.
- Provisioned temporary PostgreSQL on `127.0.0.1:55432` without disturbing unrelated containers.
- Corrected two test-only regressions: CSV now selects `Savings` from `accounts[]`, and transaction-history audit lookup uses `findFirst` because the schema pair is not unique.
- Database verification: migrations/status/validation passed; full suite passed 79/79 and CSV suite passed 21/21 with no skips; durability, restart/rebuild, rollback, idempotency, and concurrency assertions passed.
- Web verification: typecheck and build passed; isolated Playwright passed 4/4 on API port 3001 and web port 3100; temporary verification configuration was removed.
- `git diff --check` passed.

## Next step
Only parent-owned review and delivery gates remain for this OpenSpec change; no source implementation task remains.
