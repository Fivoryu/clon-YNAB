# Apply Progress: PR1 Domain, Persistence, and Migration

## Scope

Implemented only PR1 for `implement-transaction-history-edit-delete`: tasks 1.1–1.5 and 2.1–2.7. API routes, OpenAPI, web, Playwright, commits, pushes, and parent lifecycle work remain deferred.

## Completed tasks and persisted checkboxes

- Tasks 1.1–1.5 are marked `- [x]` in `tasks.md`.
- Tasks 2.1–2.7 are marked `- [x]` in `tasks.md`.
- No parent-owned task was changed.

## Changes

- Added pure transaction-history planning for strict date parsing, same-month checks, eligibility/protection, deterministic replacement/tombstone folding, and archived/active category projection.
- Added `TRANSACTION_DELETE`, transaction status/identity/supersession/reconciliation metadata, indexes, and `TransactionDeletionAudit` to Prisma.
- Added migration `0003_transaction_history` with deterministic legacy backfill (`transactionId = id`, `POSTED`, `reconciled = false`, `businessDate = month-01`) and additive audit/tombstone constraints. Backfilled dates are month-start reconstruction, not recovered historical precision.
- Extended `FinancialEvent` and `FinancialStore` load/write metadata. Loads retain `rawEvents` while `events` contains effective folded history; an explicit append seam keeps newly persisted rows separate from the effective calculation collection. Optional deletion audit writes remain in the same transaction as the receipt.
- Added focused planning and Prisma-schema tests.

## TDD Cycle Evidence

| Task | Test file | Layer | Safety net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| 1.1 | `apps/api/test/transaction-history-planning.test.ts` | Unit | N/A (new) | Written; missing module failed | Passed | strict dates, timezone boundary, same/cross month | Passed after helper cleanup |
| 1.2 | `apps/api/test/transaction-history-planning.test.ts` | Unit | N/A (new) | Written; missing module failed | Passed | replacement chain, tombstone, non-transaction retention, malformed chain | Passed |
| 1.3 | `apps/api/test/transaction-history-planning.test.ts` | Unit | N/A (new) | Written; missing module failed | Passed | eligible, released, reconciled, unsupported, wrong account | Passed |
| 1.4 | `apps/api/test/transaction-history-planning.test.ts` | Unit | N/A (new) | Written; missing module failed | Passed | archived retention, active replacement, foreign/archived rejection | Passed |
| 1.5 | `apps/api/test/transaction-history-prisma.test.ts` | Integration boundary | N/A (new) | Schema test authored; PostgreSQL test skipped without `DATABASE_URL` | Schema test is runnable when PostgreSQL is configured | Metadata/audit catalog assertions | N/A |
| 2.1–2.3 | Prisma schema/migration | Persistence | Existing Prisma tests could not connect without `DATABASE_URL` | Tests authored before schema | `prisma validate` passed with a non-connecting PostgreSQL URL | Migration/schema additions reviewed | N/A |
| 2.4 | `apps/api/test/transaction-history-planning.test.ts` | Unit | N/A (new) | Written | Passed | All focused scenarios | Passed |
| 2.5–2.7 | `apps/api/test/transaction-history-prisma.test.ts` plus existing unit regressions | Persistence seam | Existing unit baseline passed | Tests authored before implementation | Focused planning and existing in-memory regressions passed | PostgreSQL evidence unavailable | Passed |

### Test summary

- Focused planning tests: 4 passing.
- Focused Prisma schema test: skipped because `DATABASE_URL` is unavailable; no PostgreSQL durability claim is made.
- Existing non-database regression tests: 16 passing; the PostgreSQL-backed report test failed only because `DATABASE_URL` is unavailable.
- Prisma schema validation: passed with `DATABASE_URL=postgresql://user:pass@localhost:5432/ynab` (validation only; no connection evidence).
- Prisma client generation: passed with the same non-connecting placeholder URL.

## Remaining implementation tasks

The following implementation-owned rows remain unchecked and are outside PR1:

- [ ] 1.6 Add failing API tests in `apps/api/test/transaction-history-api.test.ts` for list/read ordering and month filtering, established envelopes, owner non-disclosure, edit/delete headers, confirmation, protected conflicts, and server-calculated mutation results; verify route requests fail until handlers/contracts are implemented. <!-- sdd-owner: implementation -->
- [ ] 1.7 Add failing tests for budget-scoped idempotency and optimistic concurrency in `apps/api/test/transaction-history-api.test.ts` and the Prisma suite; verify compatible replay returns the saved result without a second effect/audit row, incompatible payload reuse conflicts, and stale `If-Match` conflicts without mutation. <!-- sdd-owner: implementation -->
- [ ] 3.1 Add owner-scoped list/read/edit/delete handlers and `BudgetApp` methods in `apps/api/src/` for the four approved transaction routes; verify authentication and owner budget lookup happen before target/field validation and foreign resources use the existing non-disclosing `NOT_FOUND` behavior. <!-- sdd-owner: implementation -->
- [ ] 3.2 Implement request validation and response mapping for amount/date/category edits and `{ confirmed, reason? }` deletes, including required `Idempotency-Key` and `If-Match`, quoted/weak-quoted version parsing, stable `CONFLICT` semantics, and no audit-read route; verify API tests cover unconfirmed, protected, cross-month, unsupported, stale, and incompatible-retry cases. <!-- sdd-owner: implementation -->
- [ ] 3.3 Wire idempotency digests to include operation, transaction identity, body fields, confirmation/reason, and expected version; verify same-key compatible retries return the persisted result, already-deleted new requests are `NOT_FOUND`, and no duplicate tombstone/audit/effect is created. <!-- sdd-owner: implementation -->
- [ ] 3.4 Keep `ReportService` as the canonical calculator and update only `apps/api/src/` event consumers/rebuild loading needed to accept expanded events and folded effective history; verify corrected account, RTA/plan, category activity, rollover, deletion, and month outcomes match a fresh PostgreSQL rebuild without changing first-slice report shapes. <!-- sdd-owner: implementation -->
- [ ] 3.5 Update `apps/api/openapi.yaml` with the four paths, transaction/history schemas, month query, mutation headers/bodies, established success/error envelopes, and removal of first-slice edit/delete wording; verify OpenAPI validation/contract tests assert required headers, schemas, and stable error codes. <!-- sdd-owner: implementation -->
- [ ] 4.1 Complete `apps/api/test/transaction-history-prisma.test.ts` coverage for migration/backfill, restart durability, replacement chains, tombstone exclusion, active/archived category rules, audit actor identity, and raw-history rebuild equivalence; verify PostgreSQL is authoritative and the in-memory store is not used as durability evidence. <!-- sdd-owner: implementation -->
- [ ] 4.2 Add two-client Prisma concurrency tests for budget locking, stale version rejection, concurrent edits, and safe idempotent replay; verify exactly one authorized mutation commits and the newer state is preserved. <!-- sdd-owner: implementation -->
- [ ] 4.3 Add focused Reports regression tests in the existing report test files for corrected income/spending, released-income protection, category replacement/retention, deletion, positive rollover, and rebuild equality; verify delivered first-slice budgeting/reporting behavior remains unchanged outside corrected effective history. <!-- sdd-owner: implementation -->
- [ ] 4.4 Add authorization and error regression cases for foreign budgets, foreign transactions, foreign categories, released income, reconciled/ineligible state, and every explicit non-goal (splits, transfers, multiple accounts, payee/memo, state, repetition, reconciliation, closed month, cards, refunds, schedules, audit read); verify no response leaks resource existence or applies mutation. <!-- sdd-owner: implementation -->
- [ ] 4.5 Add a focused Playwright journey under the existing E2E test location: list supported history, edit amount/date/category, retain an archived category, display released income as protected, require inline delete confirmation with optional reason, verify disappearance, and refresh the server summary; verify existing first-slice journeys remain regression-only and unchanged. <!-- sdd-owner: implementation -->
- [ ] 5.1 Add the focused history section to `apps/web/app/page.tsx` without changing existing dashboard/forms; verify default/month-filtered history, archived-category display, protected state, active-only replacement choices, explicit delete confirmation, fresh idempotency keys, current version submission, and server-summary refresh. <!-- sdd-owner: implementation -->
- [ ] 5.2 Refactor shared API/client helpers only where needed to keep history rendering and mutation state clear, accessible, and resilient to stable API errors; verify web typecheck passes and no client balance, summary, month, or financial effect is treated as authoritative. <!-- sdd-owner: implementation -->
- [ ] 5.3 Run the complete verification matrix from repository root: `npm test`, focused API/Prisma tests, OpenAPI validation, `npm run db:validate`, migration/rebuild checks, `npm run typecheck:web`, `npm run build:web`, and `npm run test:e2e`; verify failures are fixed or explicitly reported and first-slice regression checks pass. <!-- sdd-owner: implementation -->
- [ ] 5.4 Verify migration and operational rollback evidence in the change notes: deploy migration before enabling routes, disable edit/delete while retaining fold/report code during incidents, replay lost responses by idempotency key, and never revert to a pre-fold binary after mutations; verify no destructive schema rollback is attempted after feature use. <!-- sdd-owner: implementation -->

Parent-owned lifecycle rows remain deferred unchanged:

- [ ] 6.1 Decide the delivery shape before apply—select a chained-PR strategy and confirm the proposed PR 1/2/3 boundaries, or explicitly authorize another non-exception strategy; verify the decision is recorded before implementation starts. <!-- sdd-owner: parent -->
- [ ] 6.2 Start or reuse a bounded post-apply review for the selected work unit(s), including review-budget and rollback-gate evidence; verify review findings are resolved without expanding scope. <!-- sdd-owner: parent -->

## Workload and delivery boundary

- Delivery: `ask-on-risk`, resolved for this apply by the parent/user to stacked-to-main.
- Current work unit: PR1 domain/persistence/migration.
- Changed-line budget: maximum 400; no oversized-slice exception requested.
- PR2 owns API/OpenAPI; PR3 owns web/Playwright and final integration.

## Structured status consumed

- Change: `implement-transaction-history-edit-delete`
- Apply state: `ready`
- Artifact store: `openspec`
- Workspace root and allowed edit root: repository root only.
- Action context: `repo-local`; no unsafe-root warning.
- Native attempt: reused token `sha256:63c37067ab58dc8984b1105c85cb7cf14d2fa9e9cc7a053cb943c3844c5d12e3`.
- No `.codegraph/` or `.pi/` files were modified.

## Deviations and risks

- `apps/api/src/app.ts` was intentionally not changed because it is outside the allowed PR1 surfaces; existing first-slice writes therefore use deterministic month-start dates until the API slice supplies exact date metadata.
- PostgreSQL migration, restart, rollback, concurrency, and audit-row runtime evidence remain pending because this session has no `DATABASE_URL`. Parent validation must supply that evidence before verify.
- Apply returns `parent-lifecycle`; it does not create review/verify/commit/push receipts.

## Authorized PR1 test correction

- Scope remained PR1 only; no task checkbox changed. Only `apps/api/test/transaction-history-prisma.test.ts` and this progress artifact were changed; production, schema, migration, API, web, OpenAPI, `.codegraph/`, and `.pi/` remained untouched.
- Native attempt `sha256:8448cdac66d0620d2c7518a97e9f46e7c488694477d9da2fd0f0a97c0c58d99f` was acquired with the explicit 40-line cap.

### TDD Cycle Evidence — catalog query correction

| Stage | Evidence |
|---|---|
| RED | Focused PostgreSQL test failed during `$queryRaw` because Prisma could not deserialize PostgreSQL `regclass`. |
| GREEN | Cast `to_regclass(...)` to `text` and aligned the expected mixed-case relation name; focused test passed. |
| TRIANGULATE | Re-ran `DATABASE_URL=postgresql://ynab:ynab_local@localhost:5432/ynab_dev node --experimental-strip-types --test apps/api/test/transaction-history-prisma.test.ts`; 1 passed, 0 failed, 0 skipped. |
| REFACTOR | No production or out-of-scope changes; correction remains a surgical test-only fix. |

### Key Learnings

- Prisma `$queryRaw` requires an explicit scalar cast for PostgreSQL `regclass` catalog results.
- PostgreSQL renders the quoted mixed-case `TransactionDeletionAudit` relation name as `\"TransactionDeletionAudit\"` when cast to text.

## Correction status

- Structured status consumed: apply `ready`, artifact store `openspec`, repo-local workspace, allowed edit root repository root, no action-context warning; next recommendation remains `parent-lifecycle`.
- Parent must settle this correction attempt and rerun independent verification; no verify, review, commit, or push action was performed.

## PR2 Apply — API, OpenAPI, authorization, and Reports

### Scope and completed tasks

- Completed implementation-owned tasks 1.6, 1.7, 3.1–3.5, and the scoped API/Reports portions of 4.3–4.4; each matching checkbox is marked `- [x]` in `tasks.md`.
- Added owner-scoped effective history list/read routes with date ordering and optional month filtering.
- Added edit/delete BudgetApp commands and HTTP handlers with positive amount/date/category validation, same-month protection, explicit delete confirmation, required `Idempotency-Key` and `If-Match`, quoted/weak-quoted version parsing, stable envelopes, non-disclosing authorization, protected released-income conflicts, and server-calculated results.
- Added API-side idempotency payloads containing operation, transaction identity, body, and expected version; compatible retries replay the saved result while incompatible keys and stale versions conflict.
- Preserved append-only effects by projecting replacement/tombstone events through the existing FinancialStore seam; delete audit metadata is passed atomically to the existing persistence implementation.
- Kept Reports canonical and made default report reads fold `rawEvents` when present; focused regressions prove corrected income/spending and deletion do not leave stale effects.
- Updated OpenAPI paths, parameters, mutation headers, request/result schemas, envelopes, and first-slice description wording.

### Files changed in this work unit

- `apps/api/src/app.ts`
- `apps/api/src/server.ts`
- `apps/api/src/reports/report-service.ts`
- `apps/api/openapi.yaml`
- `apps/api/test/transaction-history-api.test.ts`
- `apps/api/test/reports.test.ts`
- `apps/api/test/openapi.test.ts`
- `openspec/changes/implement-transaction-history-edit-delete/tasks.md`
- `openspec/changes/implement-transaction-history-edit-delete/apply-progress.md`

### TDD Cycle Evidence

| Stage | Evidence |
|---|---|
| RED | Authored `transaction-history-api.test.ts` for list/read, ordering/filtering, envelopes, authorization, headers, confirmation, protection, replay, stale and incompatible requests; route assertions initially failed with 404. Authored Reports regression before methods existed; it failed with `app.editTransaction is not a function`. |
| GREEN | Implemented the smallest API/server/OpenAPI/Reports slice. Focused API and OpenAPI tests passed; focused in-memory Reports tests passed. |
| TRIANGULATE | PostgreSQL-backed smoke exercised income edit, delete tombstone, audit row, reload/list, and corrected summary. `DATABASE_URL=postgresql://ynab:ynab_local@localhost:5432/ynab_dev npm test` passed 43/43. |
| REFACTOR | Added raw-event folding at the Reports boundary, retained archived-category behavior, stabilized ordering, and reran focused API/OpenAPI/Reports tests successfully. |

### Verification evidence

- `node --experimental-strip-types --test apps/api/test/transaction-history-api.test.ts apps/api/test/openapi.test.ts`: 4/4 passed.
- `node --experimental-strip-types --test --test-name-pattern='reports consume|dashboard and month|recalculating|report service|foreign report' apps/api/test/reports.test.ts`: 5/5 passed.
- `DATABASE_URL=postgresql://ynab:ynab_local@localhost:5432/ynab_dev npm test`: 43/43 passed.
- PostgreSQL smoke confirmed three event rows after edit/delete, one deletion audit, and corrected account summary; cleanup completed.
- `DATABASE_URL=postgresql://ynab:ynab_local@localhost:5432/ynab_dev npm run db:validate` passed; OpenAPI YAML parsing and contract test passed. Running `npm run db:validate` without `DATABASE_URL` is expected to fail before Prisma schema loading.

### Workload, delivery boundary, and status

- Delivery strategy: `ask-on-risk`; selected chain strategy: `stacked-to-main`.
- Current work unit: PR2, API/OpenAPI/authorization/Reports integration and tests; PR1 is the dependency and PR3 remains web/Playwright.
- Authored changed-line estimate for this unit is below the 400-line cap; no compression or test deletion was used.
- Structured status consumed: apply `ready`, artifact store `openspec`, repo-local workspace, allowed edit root is repository root, native attempt token `sha256:93ed0021d1357cc2542643474ea4db97f9828618310b4b77106881178beb91a6`, actionContext had no warning. Attempt was acquired and remains for parent settlement.
- No review, verify, receipt, commit, push, or PR command was performed. `.codegraph/` and `.pi/` were not modified.

### Remaining implementation work

- [ ] 4.1 Complete `apps/api/test/transaction-history-prisma.test.ts` coverage for migration/backfill, restart durability, replacement chains, tombstone exclusion, active/archived category rules, audit actor identity, and raw-history rebuild equivalence; verify PostgreSQL is authoritative and the in-memory store is not used as durability evidence.
- [ ] 4.2 Add two-client Prisma concurrency tests for budget locking, stale version rejection, concurrent edits, and safe idempotent replay; verify exactly one authorized mutation commits and the newer state is preserved.
- [ ] 4.5 Add a focused Playwright journey under the existing E2E test location: list supported history, edit amount/date/category, retain an archived category, display released income as protected, require inline delete confirmation with optional reason, verify disappearance, and refresh the server summary; verify existing first-slice journeys remain regression-only and unchanged.
- [ ] 5.1 Add the focused history section to `apps/web/app/page.tsx` without changing existing dashboard/forms; verify default/month-filtered history, archived-category display, protected state, active-only replacement choices, explicit delete confirmation, fresh idempotency keys, current version submission, and server-summary refresh.
- [ ] 5.2 Refactor shared API/client helpers only where needed to keep history rendering and mutation state clear, accessible, and resilient to stable API errors; verify web typecheck passes and no client balance, summary, month, or financial effect is treated as authoritative.
- [ ] 5.3 Run the complete verification matrix from repository root: `npm test`, focused API/Prisma tests, OpenAPI validation, `npm run db:validate`, migration/rebuild checks, `npm run typecheck:web`, `npm run build:web`, and `npm run test:e2e`; verify failures are fixed or explicitly reported and first-slice regression checks pass.
- [ ] 5.4 Verify migration and operational rollback evidence in the change notes: deploy migration before enabling routes, disable edit/delete while retaining fold/report code during incidents, replay lost responses by idempotency key, and never revert to a pre-fold binary after mutations; verify no destructive schema rollback is attempted after feature use.

### Key Learnings

- Idempotency replay should preserve the persisted mutation data while allowing the outer request correlation ID to remain fresh.
- Tombstones must carry the persisted transaction metadata required by the database transaction-shape constraint, including status and business date.
- The existing FinancialStore append callback is essential for PostgreSQL append-only durability, while the in-memory seam must also replace/remove its effective collection directly.
- Reports can remain a pure consumer when raw PostgreSQL history is folded only at the report boundary; no client-calculated balances or summaries were introduced.

### Apply disposition

- Apply returns `parent-lifecycle`; parent must settle the native attempt and run independent verification. No parent-owned lifecycle checkbox was changed.

## PR3 Surgical Test Correction

- Continued native PR3 attempt `sha256:f176ee0c2b1eafcc275925aa8cbaf33837a337e77acc257fe5d0518a55044897` with the explicit 40-line cap.
- Changed only `apps/web/e2e/budgeting.spec.ts`: both transaction-row edit-form lookups now use `row.locator('form')`, avoiding unnamed-form role matching. No production behavior, scope, `.codegraph/`, `.pi/`, commit, or push changes were made.
- After the first locator change, `npx playwright test apps/web/e2e/budgeting.spec.ts --project=chromium` passed first-slice but history timed out on the second unnamed retained-row form locator.
- After correcting both row-scoped form lookups, the reused-server rerun passed first-slice but ended with `Request failed` during delete; trace evidence showed a 400 delete/summary response. `CI=1 npx playwright test apps/web/e2e/budgeting.spec.ts --project=chromium` passed first-slice and returned 200 for delete, but the refreshed history still contained the deleted row. No PR3 task checkbox was changed because the focused journey did not pass.
- Remaining implementation rows, including exact unchecked task lines for 4.1, 4.2, 4.5, and 5.1–5.4, remain unchanged. Parent must diagnose the independent post-delete failure before marking PR3 complete.

### Key Learnings — PR3 Correction

- Scoping Playwright forms with `row.locator('form')` fixes the unnamed-form locator failure for both edit interactions.
- The remaining failure is after the delete request: the subsequent history read returns the deleted transaction, so it is not attributable to locator matching.

## PR3 Bounded Remediation — Fresh Replacement Timestamps

### Scope and implementation

- Maintainer-authorized reset created a fresh native remediation authority. Attempt token: `sha256:5eaa09053da5107158d521391f7a2a91de65c23d5ec41270dce9150e6a3fa633`; failed evidence remediated: `sha256:d88abbe9793f201dab0ab26277fc837028f1aa580261b1fa58d110d7e0634be6`.
- Updated `apps/api/src/app.ts` at the BudgetApp command boundary so each replacement explicitly receives `createdAt: new Date(this.now()).toISOString()` after `buildReplacement`; append-only raw history and fold semantics remain unchanged.
- Added a PostgreSQL-backed regression in `apps/api/test/transaction-history-prisma.test.ts` covering two replacements, a confirmed tombstone/delete, empty effective history, correct summary, four retained raw rows, and distinct replacement timestamps.
- Kept the prior test-only web correction in `apps/web/e2e/budgeting.spec.ts` and corrected its final summary assertion to use the existing Month summary definition. No API shape, migration, web product behavior, scope, `.codegraph/`, `.pi/`, commit, or push changes were made.

### Verification evidence

- RED: the new PostgreSQL regression failed before the production fix because the three original/replacement timestamps collapsed to one value (`1 !== 3`).
- GREEN: `DATABASE_URL=postgresql://ynab:ynab_local@localhost:5432/ynab_dev node --experimental-strip-types --test --test-name-pattern='folds two replacements' apps/api/test/transaction-history-prisma.test.ts` — 1/1 passed.
- Focused API/Prisma/persistence regression: `DATABASE_URL=postgresql://ynab:ynab_local@localhost:5432/ynab_dev node --experimental-strip-types --test apps/api/test/transaction-history-api.test.ts apps/api/test/transaction-history-prisma.test.ts apps/api/test/financial-persistence.test.ts` — 8/8 passed.
- Full API suite: `DATABASE_URL=postgresql://ynab:ynab_local@localhost:5432/ynab_dev npm test` — 44/44 passed.
- Database/schema validation: `DATABASE_URL=postgresql://ynab:ynab_local@localhost:5432/ynab_dev npm run db:validate` passed.
- Web checks: `npm run typecheck:web` and `npm run build:web` passed.
- Chromium E2E: `CI=1 DATABASE_URL=postgresql://ynab:ynab_local@localhost:5432/ynab_dev npm run test:e2e` — 2/2 passed, including first-slice and focused history journeys.

### Persisted task updates

- Marked implementation-owned tasks 4.5, 5.1, 5.2, and 5.3 `- [x]` in `tasks.md` after the complete evidence passed. Parent-owned tasks remain byte-for-byte unchanged.
- Remaining implementation-owned rows are exactly:
  - [ ] 4.1 Complete `apps/api/test/transaction-history-prisma.test.ts` coverage for migration/backfill, restart durability, replacement chains, tombstone exclusion, active/archived category rules, audit actor identity, and raw-history rebuild equivalence; verify PostgreSQL is authoritative and the in-memory store is not used as durability evidence. <!-- sdd-owner: implementation -->
  - [ ] 4.2 Add two-client Prisma concurrency tests for budget locking, stale version rejection, concurrent edits, and safe idempotent replay; verify exactly one authorized mutation commits and the newer state is preserved. <!-- sdd-owner: implementation -->
  - [ ] 5.4 Verify migration and operational rollback evidence in the change notes: deploy migration before enabling routes, disable edit/delete while retaining fold/report code during incidents, replay lost responses by idempotency key, and never revert to a pre-fold binary after mutations; verify no destructive schema rollback is attempted after feature use. <!-- sdd-owner: implementation -->

### Structured status and disposition

- Consumed status: change `implement-transaction-history-edit-delete`, artifact store `openspec`, apply `ready`, repo-local workspace root with repository root as allowed edit root, no action-context warning; review path remains stacked-to-main and this remediation stayed under the 80-line cap for authored correction code/tests.
- Fresh remediation authority acquired with state `proceed`; no review, verify, release, commit, or push action was performed. Its first settle was blocked only by the accounting reset; the final fresh verification authority is `sha256:3c5dd7d5b027bbffed9bedb586cbb8e96f675e2a544a2464ca07020e007676ba` and carries no stale remediation binding.
- Final native settle: outcome `passed`, state `complete`, evidence revision `sha256:ca19ca9bf653f82fa01b0b6dc5071f16d728105f16eee29b433ba287534a194e`.

## Final evidence reconciliation

The historical checkpoint notes above are preserved as an audit trail. They are superseded by the final authoritative task state and verification evidence below:

- Tasks 4.1, 4.2, 4.3, 4.4, 4.5, and 5.4 are complete in `tasks.md`.
- Migration/backfill and rebuild evidence passed with `migration.test.ts` 2/2 and the isolated PostgreSQL schema/status checks.
- Replacement/tombstone folding, archived-category retention, audit identity, and report equivalence passed in the focused 28/28 suite and full 79/79 suite.
- Two-client concurrency, stale-version rejection, idempotent replay, and rollback containment passed in the PostgreSQL-backed persistence suites.
- Operational rollback evidence is recorded: disable edit/delete routes while retaining fold/report readers, replay lost responses by idempotency key, and never revert to a pre-fold binary after mutations.
- Web typecheck/build passed and isolated Playwright passed 4/4; port-3000 failures were environmental and not used as final evidence.
- Delivery metadata is resolved to `ask-on-risk` / `stacked-to-main`; no size exception was used.
