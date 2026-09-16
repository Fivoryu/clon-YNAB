# Tasks: Implement Multi-Account Transfers

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | Work unit 1: 340–380; work unit 2: 320–380; work unit 3: 370–400; work unit 4: 330–390; total: 1,360–1,550 authored lines |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 → PR 2 → PR 3 → PR 4, one design work unit per review slice |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

The estimate excludes generated Prisma artifacts but includes authored migration, application, contract, client, and test changes. No work unit may silently cross into the next architectural boundary. If a unit approaches or exceeds 400 authored changed lines, pause for the delivery decision rather than accepting a `size:exception` or inventing a chain strategy.

## Scope Guardrails

- Preserve `accounts[]` as canonical, with `account` derived as the deterministic oldest-account alias (creation timestamp, then stable ID).
- Preserve aggregate `accountBalanceMinor` and add server-calculated per-account balances; PostgreSQL is authoritative and client balances are never write inputs.
- Support only manual `CASH` and `CHECKING` accounts; allow create, rename, and archive, with no unarchive.
- Protect archived accounts from new ordinary movements and transfers while retaining their readable history.
- Transfers are same-budget, distinct-account, positive-safe-integer minor-unit commands with `TRANSFER` history, idempotency, `If-Match`, authorization, and atomic paired effects.
- Transfers remain neutral for categories, Activity, Assigned, Available, and RTA; category `MOVE` retains its existing meaning.
- Keep payee/memo, CSV/import, cards, splits, reconciliation, synchronization, transfer edit/delete, and broader YNAB behavior in separate changes.

## Work Unit 1 — Persistence and Projection

**Start:** Existing singular `Budget.account`, one-account uniqueness, and singular financial projections. **Finish:** Additive legacy-safe account collection/projection and durable per-account balance calculation, with schema/migration containment evidence. **Rollback boundary:** Disable multi-account writes and retain the legacy read path; never delete or rewrite legacy account/event rows.

### RED

- [x] Add failing pure/domain tests under `apps/api/test` (or the repository’s established domain-test location) for deterministic account ordering, oldest-account alias selection, zero/one/multiple accounts, legacy ID/opening preservation, safe negative opening values, per-account formulas, and aggregate conservation. Run the narrow test file with `cd apps/api && npm test -- --runInBand <focused-test-file>` (adapt only to the repository’s existing test runner syntax). <!-- sdd-owner: implementation -->
- [x] Add failing PostgreSQL migration/projection tests under `apps/api/test` covering legacy single-account rows after migration/restart, duplicate opening-row preflight rejection, tenant-scoped references, supported kinds, and preservation of historical event rows. Run the focused PostgreSQL suite with `cd apps/api && npm test -- --runInBand <postgres-projection-test-file>`. <!-- sdd-owner: implementation -->

### GREEN

- [x] Update `apps/api/prisma/schema.prisma` and the additive migration under `apps/api/prisma/migrations/` to remove the per-budget account uniqueness limitation, retain legacy IDs/timestamps/openings, add required indexes/constraints, and introduce the tenant-scoped transfer-ready schema without deleting or rewriting financial history. <!-- sdd-owner: implementation -->
- [x] Implement collection loading/writing and legacy compatibility in `apps/api/src/persistence/budget-store.ts`, `apps/api/src/persistence/in-memory-budget-store.ts`, and the relevant `FinancialState` loading seams in `apps/api/src/persistence/financial-store.ts`; derive `accounts[]`, the oldest `account` alias, aggregate `accountBalanceMinor`, and per-account balances from server-owned data. <!-- sdd-owner: implementation -->
- [x] Implement checked per-account/opening aggregation in `apps/api/src/planning/engine.ts` and the projection/report seams in `apps/api/src/reports/report-service.ts`, excluding transfer effects from ordinary budgeting equations. <!-- sdd-owner: implementation -->
- [x] Add migration preflight and rollout containment at the established persistence/deployment seam: inventory legacy accounts, openings, event references, duplicate IDs, and invalid kinds; leave multi-account writes disabled when validation fails; verify compatibility-reader-before-schema and old-binary drain ordering. <!-- sdd-owner: implementation -->

### TRIANGULATE

- [x] Verify RED tests now pass with `cd apps/api && npm test -- --runInBand <focused-test-files>` and run the focused PostgreSQL command against a disposable PostgreSQL database, recording restart/rebuild equality and no-data-loss evidence. <!-- sdd-owner: implementation -->
- [x] Exercise migration failure/rollback containment with `cd apps/api && npm test -- --runInBand <migration-containment-test-file>` and confirm no multi-account write is enabled, no legacy row is deleted, and no historical event is rewritten. <!-- sdd-owner: implementation -->

### REFACTOR

- [x] Consolidate account ordering, alias, checked arithmetic, and projection logic into the existing domain seams without introducing a second balance source of truth; preserve first-slice single-account behavior and rerun `cd apps/api && npm test -- --runInBand <legacy-regression-test-files>`. <!-- sdd-owner: implementation -->

## Work Unit 2 — Account Lifecycle

**Start:** Work unit 1 canonical persistence/projection is available. **Finish:** Owner-authorized create, rename, and archive commands with shared version/idempotency semantics and ordinary-movement account targeting. **Rollback boundary:** Disable account mutation routes; retain persisted identities, openings, metadata history, and legacy-compatible reads.

### RED

- [x] Add failing API tests under `apps/api/test` for `POST /api/v1/budgets/{budgetId}/accounts`, `PATCH /api/v1/budgets/{budgetId}/accounts/{accountId}`, and archive behavior: manual `CASH`/`CHECKING` only, trimmed non-empty names, duplicate-name allowance, optional/negative opening, setup-complete requirement, rename/archive identity stability, idempotent archive, and no unarchive route. Run `cd apps/api && npm test -- --runInBand <account-lifecycle-test-file>`. <!-- sdd-owner: implementation -->
- [x] Add failing authorization/version tests for non-disclosing foreign/unknown resources, required `Idempotency-Key` and `If-Match`, exact replay, changed-payload conflict, stale-version conflict against a transfer, and archived-account rejection for ordinary movements. <!-- sdd-owner: implementation -->

### GREEN

- [x] Implement account command validation, owner scoping, and result projection in `apps/api/src/app.ts`, using the shared financial command path in `apps/api/src/persistence/financial-store.ts` and persistence support in `apps/api/src/persistence/budget-store.ts`; create openings exactly once and never accept client balances. <!-- sdd-owner: implementation -->
- [x] Add route parsing, headers, envelopes, and safe error mapping in `apps/api/src/server.ts`; extend existing income/spending dispatch in `apps/api/src/app.ts` so omitted `accountId` selects the oldest active account and explicit archived/foreign/unknown accounts are rejected. <!-- sdd-owner: implementation -->
- [x] Mirror command serialization, canonical payload digest, receipt replay/conflict, version advancement, and all-or-nothing state updates in `apps/api/src/persistence/in-memory-budget-store.ts` and its financial adapter. <!-- sdd-owner: implementation -->

### TRIANGULATE

- [x] Run `cd apps/api && npm test -- --runInBand <account-lifecycle-test-files>` and the focused PostgreSQL command; verify account metadata/opening/receipt commits together, stale concurrent account-versus-financial commands allow at most one commit, and archived history remains readable. <!-- sdd-owner: implementation -->
- [x] Run the existing first-slice setup/income/spending/allocation/category-move suites with `cd apps/api && npm test -- --runInBand <first-slice-test-files>` and confirm unchanged response/error semantics. <!-- sdd-owner: implementation -->

### REFACTOR

- [x] Refactor lifecycle validation and authorization to one owner-scoped path, document no-unarchive and archive protection in code-facing contract tests, and rerun the focused lifecycle plus first-slice regression commands. <!-- sdd-owner: implementation -->

## Work Unit 3 — Transfer Core and History

**Start:** Canonical accounts, lifecycle commands, and shared receipt/version boundary are implemented. **Finish:** Durable same-budget transfer aggregate plus exactly two typed effects, history projection, balance conservation, and PostgreSQL concurrency/rollback proof. **Rollback boundary:** Disable transfer writes and transfer mutation routes; preserve committed transfer rows/effects and forward-compatible reads; never restore the old one-account schema after multi-account data exists.

### RED

- [x] Add failing pure/in-memory tests under `apps/api/test` for positive safe amount, strict `YYYY-MM-DD`, budget-timezone month, distinct active same-budget accounts, archived/foreign/missing rejection, equal/opposite balances, aggregate conservation, category/RTA neutrality, and category `MOVE` non-collision. Run `cd apps/api && npm test -- --runInBand <transfer-domain-test-files>`. <!-- sdd-owner: implementation -->
- [x] Add failing API/history tests for `POST /api/v1/budgets/{budgetId}/transfers`, one `TRANSFER` history item with both account references, ordering/month filtering, archived-history readability, transfer edit/delete rejection, authorization, `If-Match`, identical replay, changed-payload conflict, and stale-version conflict. <!-- sdd-owner: implementation -->
- [x] Add failing PostgreSQL tests for atomic failure injection, transfer/effect uniqueness, composite tenant foreign keys/checks, restart rebuild, budget-lock ordering, sorted account locks, and concurrent identical retries producing one transfer identity and one pair of effects. <!-- sdd-owner: implementation -->

### GREEN

- [x] Implement `TransferState`, typed transfer effects, canonical payload digest, validation, and checked balance/history projection in `apps/api/src/persistence/financial-store.ts`, `apps/api/src/planning/engine.ts`, and a focused transfer/history module under `apps/api/src/` if the existing seams require one. <!-- sdd-owner: implementation -->
- [x] Implement one PostgreSQL transaction in `apps/api/src/persistence/financial-store.ts` using `apps/api/src/persistence/transaction.ts`: lock budget first, check receipt/version, lock source/destination in sorted ID order, validate ownership/lifecycle, persist aggregate plus both effects plus receipt, and roll back all rows on any failure. <!-- sdd-owner: implementation -->
- [x] Implement transfer history merging and deterministic ordering/month filtering in `apps/api/src/app.ts` and `apps/api/src/persistence/financial-store.ts`; expose `TRANSFER` with aggregate identity and both account sides while leaving income, spending, and category `MOVE` DTO meanings unchanged. <!-- sdd-owner: implementation -->
- [x] Keep transfer kinds out of `apps/api/src/reports/report-service.ts` ordinary income/spending/category/RTA filters and add the transfer edit/delete conflict guard in `apps/api/src/app.ts`. <!-- sdd-owner: implementation -->

### TRIANGULATE

- [x] Run `cd apps/api && npm test -- --runInBand <transfer-domain-test-files> <transfer-api-test-files>` and the PostgreSQL integration command; verify commit, restart/rebuild, rollback, no receipt leakage, no one-sided effect, and exactly-once history evidence. <!-- sdd-owner: implementation -->
- [x] Run the concurrency suite against PostgreSQL and verify budget serialization, sorted account locks, stale `If-Match`, idempotency uniqueness, and no duplicate aggregate/effect pair under concurrent retries. <!-- sdd-owner: implementation -->
- [x] Compare summary/report snapshots before and after a committed transfer with `cd apps/api && npm test -- --runInBand <report-regression-test-files>`; prove aggregate neutrality and unchanged Activity, Assigned, Available, and RTA. <!-- sdd-owner: implementation -->

### REFACTOR

- [x] Refactor transfer persistence and history projection so the transfer aggregate is the sole public identity, paired effects are immutable implementation details, PostgreSQL remains authoritative, and unsupported payee/memo/CSV/cards/splits/reconciliation behavior is not introduced. <!-- sdd-owner: implementation -->

## Work Unit 4 — Contract and Client Integration

**Start:** API/domain behavior from work units 1–3 is verified. **Finish:** OpenAPI, HTTP/client behavior, and journeys describe and exercise the approved bounded contract without client-side balance authority. **Rollback boundary:** Disable new UI/routes or revert only contract/client integration while retaining durable server behavior and existing first-slice clients.

### RED

- [x] Add failing OpenAPI structural tests under `apps/api/test` (or the established contract-test location) requiring `accounts[]`, oldest `account` alias, per-account balances, lifecycle routes, transfer request headers/body constraints, error envelopes, `TRANSFER` discriminator, and retained existing route matrix; run `cd apps/api && npm test -- --runInBand <openapi-contract-test-file>`. <!-- sdd-owner: implementation -->
- [x] Add a failing focused Playwright journey under the repository’s existing web test location for create/select/archive account, transfer between active accounts, reload/rebuild, one history item, both balances, unchanged RTA/category values, and legacy first-slice journey compatibility. Run the repository’s established Playwright command, e.g. `npm run test:e2e -- <focused-journey>`. <!-- sdd-owner: implementation -->

### GREEN

- [x] Update `apps/api/openapi.yaml` with the canonical budget/summary/dashboard schemas, account lifecycle routes, transfer route, required `Idempotency-Key`/`If-Match`, safe errors, and `TRANSFER` history fields; do not document payee/memo, CSV, cards, splits, reconciliation, or banking integration. <!-- sdd-owner: implementation -->
- [x] Update `apps/web/app/page.tsx` to consume `accounts[]`, show per-account and aggregate balances, support only the bounded lifecycle controls and one transfer flow/history view, refresh server projections after commands, and perform no balance/RTA calculations locally. <!-- sdd-owner: implementation -->
- [x] Wire any required typed API client or route adapter only in the existing API/web integration paths; keep transfer identity, archived references, headers, envelopes, and error behavior aligned with `apps/api/src/app.ts` and `apps/api/src/server.ts`. <!-- sdd-owner: implementation -->

### TRIANGULATE

- [x] Run `cd apps/api && npm test -- --runInBand <openapi-contract-test-file> <api-regression-test-files>` plus the focused Playwright command; verify the documented and observed schemas match, including legacy singular alias compatibility and `TRANSFER` history. <!-- sdd-owner: implementation -->
- [x] Run the complete existing API and web regression commands from repository configuration, and confirm PostgreSQL-backed journey reads after reload rather than client-maintained totals. <!-- sdd-owner: implementation -->

### REFACTOR

- [x] Remove duplicated client projection assumptions, keep accessibility/error/loading behavior consistent with existing UI conventions, and rerun contract, focused journey, and first-slice regression suites. <!-- sdd-owner: implementation -->

## Parent Gates After Implementation Work

- [x] Before apply begins, decide whether to authorize the recommended four-slice chained delivery or another explicit strategy; because delivery is `ask-on-risk` and forecast risk is High, do not proceed past the 400-line gate without that decision. <!-- sdd-owner: parent -->
- [x] Start or reuse a bounded review for each completed work unit, checking its exact changed-line count, focused test evidence, PostgreSQL durability/concurrency/rollback evidence where applicable, migration containment, and independent rollback boundary. <!-- sdd-owner: parent -->
