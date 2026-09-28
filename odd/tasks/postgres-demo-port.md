# PostgreSQL Demo Port

## Goal
Run the YNAB project for the instructor with PostgreSQL reachable on host port 5434.

## Why
The user requested the project be started and selected host port 5434. The container's PostgreSQL port remains 5432.

## Scope
- Change the Docker Compose host-side PostgreSQL port to 5434 while preserving container port 5432.
- Update accessible setup documentation to match the selected port.
- Start PostgreSQL, apply migrations, and launch the API and web app with a process-scoped `DATABASE_URL` override.

## Constraints
- Do not read or modify `.env.example`; access was blocked by the runtime's sensitive-file policy. The user explicitly chose the runtime-override plan.
- Do not change credentials, database contents, or unrelated configuration.
- Preserve pre-existing untracked `.codegraph/`, `.pi/`, and `odd/tasks/aws-cost-cleanup.md`.
- Do not install dependencies unless required; `node_modules/` is already present.
- Do not commit or publish without explicit user authorization.

## Checks
This is infrastructure/configuration and runtime work, not application behavior; TDD is not applicable. Use `docker compose config` and `git diff --check` for the configuration/documentation change. For startup, verify PostgreSQL readiness on the selected mapping, run Prisma migration deployment with `DATABASE_URL` set only in the relevant process environment, and confirm the API and web app respond.

## Tasks
- [x] **DBPORT-1 — Align database port configuration and documentation.** Route: delegated writer (multi-file write trigger); mapping was completed by a read-only explorer (4-file rule). Update only `docker-compose.yml` and `README.md`. Acceptance: host port 5434 maps to container port 5432, accessible setup instructions use 5434, and `.env.example` remains untouched. Checks: `docker compose config`; `git diff --check`.
- [x] **DBPORT-2 — Start and verify the demo stack.** Route: delegated verifier for command execution. Start PostgreSQL, apply migrations with a process-scoped `DATABASE_URL` pointing to port 5434, launch API and web app, and verify availability. Keep `.env.example` untouched. Record the exact endpoints, process handles/log locations, and any failures.

## Acceptance Criteria
- Compose publishes PostgreSQL at `localhost:5434` and keeps PostgreSQL inside the container on 5432.
- Accessible setup documentation agrees with the selected host port.
- PostgreSQL is ready, migrations complete, and the API/web app are reachable for the demonstration.
- `.env.example` and pre-existing untracked files are unchanged.

## Progress
- Port choice resolved: 5434.
- Runtime environment strategy resolved: do not access `.env.example`; pass `DATABASE_URL` only to the processes that need it.
- Task DBPORT-1: complete; writer and independent verifier confirmed Compose/docs and structural checks.
- Task DBPORT-2: complete. PostgreSQL is healthy, migrations are applied, the API route responds, and the YNAB web root returns HTTP 200 on IPv4.
- No commit was created; the user did not request one.

## Verification Evidence
- Initial repository state included untracked `.codegraph/`, `.pi/`, and `odd/tasks/aws-cost-cleanup.md`; these are outside scope.
- The project explorer identified `docker-compose.yml` mapping `5432:5432`, PostgreSQL database `ynab_dev`, user `ynab`, and password `ynab_local`; the host port is the left side of the mapping.
- A prior launch attempt in this project failed because host port 5432 was already allocated; port 5434 was selected as an alternate and confirmed healthy during this launch.
- The root scripts include `dev:api`, `dev:web`, `db:generate`, and `db:migrate`.
- The runtime blocked reading `.env.example`; user selected continuing without touching it.
- The DBPORT-1 writer changed `docker-compose.yml` to `5434:5432` and aligned README commands with process-scoped `DATABASE_URL`. Writer reported `docker compose config` and `git diff --check` passed; the latter emitted only a line-ending warning. Parent diff readback confirms the host/container mapping and README uses host port 5434.
- Native assessment returned `unassessable` because the working tree contains undeclared untracked files. Its fail-closed plan required an independent verifier; do not treat this as a review approval or receipt.
- Independent verification passed `docker compose config` and `git diff --check` (LF-to-CRLF warning only); DBPORT-1 is complete.
- PostgreSQL is healthy at `0.0.0.0:5434->5432/tcp`; Prisma generation succeeded and migration `0006_bank_provider_simulation` applied.
- The API endpoint `GET /api/v1/budgets` responded 401 without credentials, confirming HTTP availability. The initial web request to `http://127.0.0.1:3000/` failed with connection refused (exit 7), but a later bounded retry and final independent spot-check confirmed the page was ready.
- The generated Prisma Client was written under ignored `node_modules/@prisma/client`; `git status --short --untracked-files=all` shows only the expected README/Compose changes, task artifact, and pre-existing untracked entries.
- The initial verifier launched with PID/log paths under `/tmp/ynab-demo-port`, but could not confirm their contents or PID values. A follow-up read failed because the parent runtime resolved that path to `D:/tmp/ynab-demo-port`, where it does not exist.
- A later bounded retry reported `web-ready`; the final independent spot-check returned HTTP 200 from `http://127.0.0.1:3000/` with `X-Powered-By: Next.js`. PID 43576 runs this repository's Next.js server.
- A separate Vite process from `sw1/1erParcial/web` listens on `[::1]:3000` (PID 1948). It was not stopped; use the IPv4 URL `http://127.0.0.1:3000/` to reach this YNAB app unambiguously.
- API `GET /api/v1/budgets` returned 401 without credentials. The API responds on port 3001; this is an unauthenticated response, not an API failure.
- API PID/log values remain unverified because `/tmp/ynab-demo-port` was not readable through the parent runtime; the endpoint response proves API availability. No process was stopped.

## Next Step
No further action is required. Use `http://127.0.0.1:3000/` for the YNAB demo and PostgreSQL at `localhost:5434`; leave the unrelated IPv6 Vite listener untouched.
