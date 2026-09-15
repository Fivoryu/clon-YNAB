# Apply Progress: Manual CSV Import and Export

## Status

- **Implementation status:** production implementation complete across domain, persistence integration, HTTP/OpenAPI, web controls, and automated tests.
- **Delivery shape:** four bounded work units following the approved `stacked-to-main` design.
- **Database schema:** no CSV-specific migration was required. The prerequisite migrations `0003_transaction_history`, `0004_multi_account_projection`, and `0005_transaction_metadata` already contain the immutable-history, transfer, metadata, receipt, ownership, and version structures needed by CSV. Adding an empty/redundant migration was intentionally avoided.
- **Runtime environment limitation:** this execution environment has no PostgreSQL server/Docker and cannot finish `npm ci` because package downloads are unavailable. PostgreSQL and Playwright tests are included but their infrastructure-dependent executions remain explicit gates rather than being reported as passed.

## Unit 1 — CSV domain

Implemented `apps/api/src/planning/csv.ts` and focused tests covering:

- exact seven-column header `date,type,account,amountMinor,category,payee,memo`;
- fatal UTF-8 decoding, BOM rejection, strict CRLF/final terminator, RFC 4180 quoting, embedded CRLF, malformed quote handling, and exact field counts;
- 10 MiB, 5,000-row, and 1,000-diagnostic bounds;
- real `YYYY-MM-DD` dates, positive safe minor units, canonical UUIDs, spending category rules, and `sourceAccountId=>destinationAccountId` transfer grammar;
- shared nullable payee/memo normalization and code-point limits;
- canonical serializer and SHA-256 import digest;
- deterministic effective-history export ordering, superseded/tombstone exclusion, paired-effect exclusion, and one canonical transfer row.

Local evidence: `apps/api/test/csv-domain.test.ts` passes 5/5.

## Unit 2 — Durable batch and projection

CSV import reuses the existing authoritative `FinancialStore.execute` PostgreSQL transaction boundary. The command now accepts an optional canonical payload digest while preserving existing command digest behavior for all prior commands. Under the same budget lock it performs idempotency lookup, expected-version validation, resource validation, immutable event/transfer append, one receipt write, and one version advance. Any persistence failure rolls back the complete transaction.

`apps/api/test/csv-postgres.test.ts` covers, when `DATABASE_URL` is available:

- all-or-nothing income/spending/transfer batches;
- one transfer aggregate plus exactly `TRANSFER_OUT` and `TRANSFER_IN` effects;
- restart/export equality;
- same-key concurrent replay;
- competing stale versions;
- injected database failure after an initially valid append with proof that events and receipts roll back.

In-memory parity tests additionally prove invalid/archived/unavailable resources commit no partial state and that a corrected malformed/invalid-resource request may safely reuse a key because no receipt was stored.

## Unit 3 — HTTP and OpenAPI

Implemented:

- `GET /api/v1/budgets/{budgetId}/transactions/export` → direct deterministic `text/csv; charset=utf-8` attachment;
- `POST /api/v1/budgets/{budgetId}/transactions/import` → bounded raw-byte CSV request with required `Idempotency-Key` and strict integer/quoted/weak-quoted `If-Match`;
- safe 400/401/404/409/415/500 behavior with request IDs and bounded diagnostic details;
- owner authorization before detailed account/category diagnostics;
- generic 500 responses that do not expose SQL/raw CSV/internal errors;
- matching OpenAPI paths, schemas, media types, limits, headers, diagnostics, and error codes.

A regression found during verification was fixed: invalid/repeated history query parameters had begun mapping to generic 500 after internal-error hardening; `parseHistoryQuery` now raises the established validation error and returns 400.

Local evidence: CSV HTTP/API/OpenAPI focused tests pass with zero failures.

## Unit 4 — Web and regression

The Next.js page now provides:

- deterministic CSV download;
- manual CSV file selection/import;
- client-side 10 MiB early rejection while retaining server authority;
- `Idempotency-Key` and current server version via `If-Match`;
- bounded server diagnostic rendering;
- authoritative refresh of budget/history after import;
- no client-side balance/RTA/category financial formulas.

A Playwright journey was added for an income + spending + transfer export/import round trip, one transfer history item, metadata, and downloaded CSV bytes. Source-contract web tests pass 4/4. The modified TSX parses successfully with TypeScript 5.8 `--noCheck` in this environment; full Next build/Playwright execution requires the npm dependencies that could not be downloaded here.

## Verification summary

Executed locally in this handoff:

- `npm test`: **79 tests, 63 passed, 0 failed, 16 skipped**. Every skip is explicitly PostgreSQL-dependent and guarded by missing `DATABASE_URL`.
- `npm run test:csv`: **20 tests, 19 passed, 0 failed, 1 skipped** (the single skip is the PostgreSQL CSV integration test).
- `node --experimental-strip-types --test apps/web/test/page.test.ts`: **4/4 passed**.
- Focused CSV API test after diagnostic-boundary hardening: **5/5 passed**.
- `tsc --noEmit --noCheck ... apps/web/app/page.tsx apps/web/app/layout.tsx`: parse succeeds.
- Production source scan: no `TODO`, `FIXME`, or `NOT_IMPLEMENTED` markers under `apps/`.

## Review-size evidence

Normalized diff accounting against the supplied ZIP baseline (line-ending-only changes excluded):

- Unit 1: 322 added / 0 deleted lines.
- Unit 2: 108 added / 7 deleted lines.
- Unit 3: 374 added / 28 deleted lines (374 authored additions; the additional touched lines are contract/server replacements).
- Unit 4: 87 added / 1 deleted lines.

Unit 4 round-trip byte assertions are present in `apps/web/e2e/budgeting.spec.ts`; in-memory API tests assert exact canonical exported bytes. Unit 2 includes rollback/concurrency/idempotency database tests, with runtime execution gated only by the unavailable PostgreSQL service.

## Remaining explicit verification gates

These are not missing production code:

1. Start PostgreSQL, install/generate Prisma, apply migrations, and execute the PostgreSQL-backed durability/restart/rollback/concurrency suites (including `csv-postgres.test.ts`).
2. Install Next/Playwright dependencies and run `npm run typecheck:web`, `npm run build:web`, and `npm run test:e2e` against Chromium.
3. Parent-owned review/merge gates remain intentionally parent-owned; they are not implementation TODOs.

## Rollback boundary

CSV routes/UI can be disabled or reverted without deleting already committed ordinary history, transfer aggregates, metadata, effects, or command receipts. Never expose raw immutable events as a fallback export and never destructively roll back transfer/history metadata structures after feature use. Existing JSON APIs and financial equations remain the authority.
