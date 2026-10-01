# Feature: E2E screenshot walkthrough in docs

## Goal

Document the delivered product surface with a complete, reproducible E2E screenshot walkthrough
stored under `docs/`, captured from a real login against a seeded local PostgreSQL database, and
covering every surface merged up to the current `HEAD` commit.

## Non-goals

- No product behavior change. This feature adds documentation evidence only.
- No modification of `apps/web/e2e/*.spec.ts` (the `npm run test:e2e` suite stays untouched).
- No CI wiring. The capture harness is a local, opt-in command.

## Deliverables

- `docs/e2e/` — screenshot assets plus a reproducible capture harness.
- `docs/e2e/README.md` — narrative walkthrough embedding every capture.
- A seeded demo dataset persisted in the local PostgreSQL dev database via the real HTTP API.

## Allowed edit surfaces

- `docs/e2e/**`
- `docs/README.md`
- `odd/tasks/e2e-screenshot-docs.md`
- `scripts/seed-demo-data.mjs` (new, local-only seeding entry point)
- `package.json` (one opt-in script entry only)

## Tasks

- [x] 1. Seed a rich, realistic demo dataset into local PostgreSQL through the public API.
- [x] 2. Build the reproducible capture harness under `docs/e2e/`.
- [x] 3. Capture the complete journey from login to the current HEAD surfaces.
- [x] 4. Write `docs/e2e/README.md` and link it from `docs/README.md`.
- [x] 5. Verify assets and links, then close with a work-unit commit.

## Evidence

- Seeded state verified directly in PostgreSQL: 1 demo budget, 4 accounts, 9 categories, 9 category
targets, 119 financial events and 4 transfers, with the current month `RTA` at `250.00`.
- `npm run docs:screenshots` passes end to end (32 captures in ~30 s) and was run twice consecutively
with a pass both times, which proves the harness is reproducible on its own.
- Consistency check: 32 `manifest.json` captures, 32 PNG files and their README references match with
no broken relative links.
- Idempotency check: re-running the seed without `--reset` writes nothing and reports the existing
state; the capture harness resets through `globalSetup` so the walkthrough's own mutations cannot
drift the published images.
- Commit: not created. Task 5 ships uncommitted because the repository has a concurrent writer
session (`openspec/changes/add-cleared-state-and-reconciliation/`) and the harness rule is to never
commit without an explicit user request. Staging command for the human:

```bash
git add docs/e2e docs/README.md package.json scripts/seed-demo-data.mjs odd/tasks/e2e-screenshot-docs.md
```
