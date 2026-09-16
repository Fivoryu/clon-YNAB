# Tasks: Implement Manual CSV Import and Export

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | Unit 1: 270–340; Unit 2: 320–390; Unit 3: 300–380; Unit 4: 240–330; total: 1,130–1,440 authored lines |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 → PR 2 → PR 3 → PR 4 |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

This plan assumes the approved `accounts[]`/oldest-account alias, transfer aggregate/effects, and nullable normalized payee/memo/history artifacts are available first. No implementation is authorized by this artifact until the parent gate is satisfied.

## Scope Guardrails

- Implement only synchronous, same-budget CSV for `INCOME`, `SPENDING`, and `TRANSFER`; imports append new identities and accept duplicate-looking rows as distinct transactions.
- Canonical header and order are exactly `date,type,account,amountMinor,category,payee,memo`; UTF-8, no BOM, RFC 4180 quoting, CRLF endings including the final terminator, and exactly seven fields per record.
- Input limits are 10 MiB (`10,485,760` bytes), 5,000 data rows (header excluded), and at most 1,000 deterministic diagnostics. Reject bare LF/CR, malformed quotes, wrong header, extra columns, invalid UTF-8, and empty/no-data files as specified.
- `date` is exact real `YYYY-MM-DD`; amount is positive decimal digits only and a safe integer minor-unit value. `category` is required only for spending and empty for income/transfer.
- Ordinary `account` is one canonical UUID. Transfer `account` is exactly `sourceAccountId=>destinationAccountId`, with two canonical UUIDs, no whitespace/escaping variation, distinct active same-budget accounts. No names, implicit resources, cross-budget mapping, or legacy singular alias as an import identity.
- Payee/memo trim Unicode `White_Space`, preserve case and remaining code points without NFC/case folding, count code points after trim, map empty to `null`, and cap at 200/1,000 respectively.
- Validate the complete file before writes. A successful batch creates canonical income/spending history or one transfer aggregate plus exactly `TRANSFER_OUT`/`TRANSFER_IN` effects, commits one receipt and one version increment; any failure commits none.
- Import requires `Idempotency-Key` and `If-Match`; digest is SHA-256 lowercase hex over route, budget ID, expected version, and canonical serialized normalized rows. Same key/digest replays; changed digest or stale/concurrent version conflicts without mutation. Export is authenticated, effective-history-only, deterministic, read-only, and version-neutral.
- Preserve owner authorization/non-disclosure, PostgreSQL authority, restart/rebuild equality, rollback containment, transfer conservation and neutrality for category Activity, Assigned, Available, RTA, and existing JSON behavior. Exclude raw events, tombstones, superseded rows, receipts, paired transfer duplicates, cards, splits, reconciliation, banking, scheduling, and background jobs.

## Review Unit 1 — CSV parser, serializer, and domain

**Paths:** `apps/api/src/planning/transaction-history.ts`, a focused CSV/history module under `apps/api/src/`, and parser/domain tests under `apps/api/test/`.

**Start:** Approved metadata/history and transfer domain contracts, without CSV behavior. **Finish:** Pure canonical parser/serializer, normalization, row validation, digest, effective export mapping, and deterministic ordering. **Rollback:** Remove only the pure CSV/domain slice; no durable rows or route behavior depend on it.

### RED

- [x] Add failing tests for exact header, strict UTF-8/no BOM, CRLF/final terminator, RFC 4180 commas/quotes/embedded CRLF, seven-field records, blank-row handling, malformed quotes, limits, and bounded row-numbered diagnostics using `cd apps/api && npm test -- --runInBand <csv-domain-test-file>`. <!-- sdd-owner: implementation -->
- [x] Add failing tests for exact date/leap validation, positive safe minor units, supported types, account/category rules, `sourceAccountId=>destinationAccountId`, archived/foreign/unavailable diagnostics, metadata normalization/code-point boundaries, and no category for income/transfer. <!-- sdd-owner: implementation -->
- [x] Add failing round-trip/digest tests for canonical CRLF serialization, null metadata, deterministic ordering, effective-history filtering, one transfer row, paired-effect exclusion, normalized digest input, reordered-row distinction, and duplicate-looking rows remaining distinct. <!-- sdd-owner: implementation -->

### GREEN

- [x] Implement the focused strict byte parser and canonical serializer with the fixed seven-column grammar, 10 MiB/5,000-row/1,000-diagnostic limits, safe diagnostics, and no general dialect expansion. <!-- sdd-owner: implementation -->
- [x] Implement row normalization/validation and SHA-256 canonical digest, reusing approved metadata normalizer semantics and canonical `accounts[]`/transfer references without performing persistence. <!-- sdd-owner: implementation -->
- [x] Implement effective-history export projection and UTF-8-byte deterministic ordering: date ascending, type `INCOME < SPENDING < TRANSFER`, account cell, amount, category, nullable payee/memo, then durable identity; emit transfers once. <!-- sdd-owner: implementation -->

### TRIANGULATE

- [x] Run `cd apps/api && npm test -- --runInBand <csv-domain-test-file>` and record parser boundary, serializer byte, metadata, transfer grammar, digest, and effective-projection evidence. <!-- sdd-owner: implementation -->
- [x] Compare pure in-memory fixtures with the approved history/transfer projection and prove category `MOVE` is never classified as `TRANSFER`; record `N/A` for PostgreSQL durability in this unit. <!-- sdd-owner: implementation -->

### REFACTOR

- [x] Consolidate grammar, normalization, diagnostics, digest, and ordering ownership into one reusable domain seam; keep all limits and non-goals explicit and rerun the focused command. <!-- sdd-owner: implementation -->

## Review Unit 2 — Durable PostgreSQL batch and projection

**Paths:** `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/<additive-csv-metadata-migration>/migration.sql`, `apps/api/src/persistence/financial-store.ts`, `apps/api/src/persistence/budget-store.ts`, `apps/api/src/persistence/in-memory-budget-store.ts`, and persistence tests under `apps/api/test/`.

**Start:** Unit 1 pure contract plus deployed canonical accounts/transfers/metadata prerequisites. **Finish:** Durable atomic import, effective export projection, restart/rebuild and rollback evidence. **Rollback:** Disable import/export gates and retain additive forward-compatible readers; never delete imported history, transfer aggregates, metadata, receipts, or effects.

### RED

- [x] Add failing PostgreSQL tests for all-file validation before writes, one receipt/version per batch, transfer aggregate plus exactly two effects, active same-budget resolution, archived rejection, and no implicit account/category creation. <!-- sdd-owner: implementation -->
- [x] Add failing tests for injected failure rollback, database constraint/tenant isolation, restart/rebuild equality, effective-history filtering, deterministic export, transfer conservation, and report neutrality for Activity, Assigned, Available, and RTA. <!-- sdd-owner: implementation -->
- [x] Add failing concurrency tests for budget-lock serialization, stale `If-Match`, same-key retries, changed digest conflict, response-loss replay, and concurrent attempts producing no duplicate identities/effects. <!-- sdd-owner: implementation -->

### GREEN

- [x] Add only the approved additive nullable metadata/transfer persistence support in `apps/api/prisma/schema.prisma` and `apps/api/prisma/migrations/<additive-csv-metadata-migration>/migration.sql`; preserve legacy IDs, openings, raw history, composite tenant ownership, and compatibility alias semantics. <!-- sdd-owner: implementation -->
- [x] Implement one PostgreSQL transaction in `apps/api/src/persistence/financial-store.ts`: lock budget first, check receipt/digest, compare version, resolve all resources under the lock, append every row, persist metadata and transfer aggregate/effects, insert receipt, increment version once, and commit or roll back all state. <!-- sdd-owner: implementation -->
- [x] Implement durable effective export from folded history and transfer aggregates, excluding tombstones/superseded/raw/receipt rows and paired effects; keep in-memory parity in `apps/api/src/persistence/in-memory-budget-store.ts` as test evidence only. <!-- sdd-owner: implementation -->

### TRIANGULATE

- [x] Run `cd apps/api && npm test -- --runInBand <csv-persistence-test-files>` against disposable PostgreSQL; restart/rebuild from authoritative rows and compare balances, reports, metadata, history, transfer direction, and export bytes. <!-- sdd-owner: implementation -->
- [x] Run failure-injection and concurrency commands; verify no receipt, identity, metadata, aggregate, one-sided effect, or version increment survives failure, and only one compatible retry commits. <!-- sdd-owner: implementation -->

### REFACTOR

- [x] Remove duplicate persistence/projection logic, verify migration preflight and forward-only rollback containment, and rerun focused PostgreSQL plus existing financial/report regression commands. <!-- sdd-owner: implementation -->

## Review Unit 3 — API, HTTP, and OpenAPI

**Paths:** `apps/api/src/server.ts`, `apps/api/src/app.ts`, `apps/api/openapi.yaml`, and API/contract tests under `apps/api/test/`.

**Start:** Verified durable domain operation. **Finish:** Exact authenticated routes `GET /api/v1/budgets/{budgetId}/transactions/export` and `POST /api/v1/budgets/{budgetId}/transactions/import`, documented without changing JSON routes. **Rollback:** Disable CSV routes/capability while retaining legacy JSON and forward-compatible durable readers.

### RED

- [x] Add failing HTTP tests for cookie auth/non-disclosure ordering, exact routes, CSV content type/charset, 10 MiB bounded body handling, strict headers, status/envelopes, request IDs, and direct CSV export bytes. <!-- sdd-owner: implementation -->
- [x] Add failing API tests for validation diagnostics, 401/404/409/415/500 mapping, idempotent replay/digest conflict, stale/concurrent `If-Match`, owner-scoped resource resolution, and unchanged existing JSON behavior. <!-- sdd-owner: implementation -->
- [x] Add failing OpenAPI structural tests for both routes, media types, limits, headers, result/diagnostic schemas, transfer grammar, and retained existing route matrix. <!-- sdd-owner: implementation -->

### GREEN

- [x] Wire bounded raw-byte parsing and authenticated owner-scoped orchestration in `apps/api/src/server.ts` and `apps/api/src/app.ts`; return `201` JSON `{ data, requestId }` on import and direct `200 text/csv; charset=utf-8` export with deterministic attachment metadata. <!-- sdd-owner: implementation -->
- [x] Enforce required `Idempotency-Key`/`If-Match`, safe errors, no raw CSV/SQL/foreign-resource disclosure, and exact request flow before detailed account/category diagnostics. <!-- sdd-owner: implementation -->
- [x] Update `apps/api/openapi.yaml` and contract tests for additive CSV behavior, explicitly excluding unsupported formats, identities, resources, and non-goals. <!-- sdd-owner: implementation -->

### TRIANGULATE

- [x] Run `cd apps/api && npm test -- --runInBand <csv-api-test-files> <csv-openapi-test-file>` and exercise observed HTTP export/import requests for malformed, valid, replay, changed-key, stale-version, and inaccessible-budget cases. <!-- sdd-owner: implementation -->
- [x] Confirm OpenAPI/runtime parity and that export does not create receipts or advance version while one successful import advances it exactly once. <!-- sdd-owner: implementation -->

### REFACTOR

- [x] Centralize route/header/error handling on existing conventions, preserve legacy JSON envelopes and authorization, and rerun focused API/contract commands. <!-- sdd-owner: implementation -->

## Review Unit 4 — Web and regression

**Paths:** `apps/web/app/page.tsx`, established web/E2E test paths, and existing API/report regression tests under `apps/api/test/`.

**Start:** Verified domain, PostgreSQL, HTTP, and OpenAPI slices. **Finish:** Manual upload/download UX and regression evidence with server authority. **Rollback:** Revert/disable UI and CSV capability without removing durable history or changing existing workflows.

### RED

- [x] Add failing web/API regression coverage for download, file selection, 10 MiB rejection, bounded diagnostics, successful refresh, stale-version handling, and unchanged first-slice JSON/history/report behavior. <!-- sdd-owner: implementation -->
- [x] Add failing E2E coverage for income, spending, and one transfer export/import round trip, metadata nullability, one transfer history item, account/category semantics, and no client-calculated balances or RTA. <!-- sdd-owner: implementation -->

### GREEN

- [x] Update `apps/web/app/page.tsx` with manual synchronous export/download and import selection/upload, display safe counts/diagnostics, send server version/idempotency headers, and refresh authoritative projections after success; do not add local financial calculations or mapping. <!-- sdd-owner: implementation -->
- [x] Preserve transfer direction, `accounts[]` with oldest `account` compatibility, metadata rendering, archived-history readability, and all explicit non-goals in the client. <!-- sdd-owner: implementation -->

### TRIANGULATE

- [x] Run the focused web command, established Playwright/E2E command, and `cd apps/api && npm test -- --runInBand <existing-regression-files>`; verify PostgreSQL-backed results after reload/restart and report neutrality. <!-- sdd-owner: implementation -->
- [x] Record export/import round-trip bytes, rollback/no-partial-state evidence, concurrency/idempotency evidence from Unit 2, and exact changed-line counts for this unit. <!-- sdd-owner: implementation -->

### REFACTOR

- [x] Remove duplicated client authority/filtering, align loading/error/accessibility behavior with existing UI conventions, rerun focused regressions, and confirm cards/splits/reconciliation/banking/background jobs remain absent. <!-- sdd-owner: implementation -->

## Parent Gate Before Apply

- [x] Approve the four-unit `ask-on-risk` `stacked-to-main` delivery and the forecast before apply; stop and re-slice if any unit exceeds 400 authored changed lines or crosses an additional architectural boundary. <!-- sdd-owner: parent -->
- [x] Start or reuse bounded review for each unit and require focused commands, PostgreSQL restart/rebuild/rollback/concurrency evidence, migration containment, and an independent rollback boundary before merging the next unit. <!-- sdd-owner: parent -->
