# Apply Progress: YNAB Screen and Capability Roadmap

## Structured status consumed

- Native status: `gentle-ai.sdd-status/v2`; change `ynab-screen-parity-roadmap`; artifact store `openspec`; pre-apply `applyState: ready`; `nextRecommended: apply`; proposal/specs/design/tasks complete; no blockers.
- Action context: `repo-local`, workspace root `D:/Universidad/Proyectos/2doSemestre2026/topicos/YNAB`, with that root as the only allowed edit root. No action-context warning was present.
- Apply-progress was missing before this run. Strict TDD was explicitly required; the global strict-TDD guidance was loaded and no project override existed.
- Workload gate: the full-tranche forecast is High / 700–1,000 lines and requires a delivery decision. The parent context records authorization of the full planned tranche and four-slice review plan; this apply executed only assigned Work Unit 1. Work Unit 1 itself changed 266 lines in its seven API/persistence/test files (237 additions, 29 deletions), below the 400-line threshold. No work units 2–4 were started.
- Skill resolution: `fallback-path` (no parent-injected skill path was supplied; loaded the available `gentle-ai` skill at its listed path).

## Completed tasks and persisted checkboxes

- Task 1 — RED: added account-history pagination, cursor validation/binding, snapshot-consistency, transfer, effective-history, and 500-item ceiling cases. Persisted task checkbox is `[x]`.
- Task 2 — GREEN: implemented account-only continuation using the canonical descending tuple, binding cursor budget/filter/history version; changed financial history loads to a PostgreSQL `RepeatableRead` transaction. Persisted task checkbox is `[x]`.
- Task 3 — TRIANGULATE: verified 0/500/501/multi-page boundaries, tied sort keys without overlap, stale-cursor conflict and clean restart after intervening changes, transfer visibility from either account side without duplicate ledger rows, effective replacements/deletions, non-cursor filter behavior, and no continuation for mutable name-based filters. Persisted task checkbox is `[x]`.
- Task 4 — REFACTOR: extracted cursor-anchor shape validation and simplified request/filter extraction; preserved the contract and ran the required repository-root `npm test`. Persisted task checkbox is `[x]`.

## TDD Cycle Evidence

| Task | Test file(s) | Layer | Safety net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| 1 | `apps/api/test/transaction-history-api.test.ts`, `transaction-history-planning.test.ts`, `transaction-history-prisma.test.ts` | API + unit + persistence adapter | Focused baseline: 15 passed, 4 skipped, 0 failed | Confirmed: focused command failed because continuation/cursor exports and repeatable-read reads were absent; API continuation assertions also failed | N/A | N/A | N/A |
| 2 | Same | API + unit + persistence adapter | Baseline above | Tests already red before production edits | Focused suite: 20 passed, 4 skipped, 0 failed | N/A | N/A |
| 3 | Same | API + unit + persistence adapter | Existing behavior retained | RED coverage was established with the initial contract tests; added boundary, cross-budget, mutable-name-filter, restart, transfer, and canonical-history assertions | Focused suite: 20 passed, 4 skipped, 0 failed | 0/500/501/1,103 entries; exclusive tied anchors; stale restart; transfer sides; effective replacement/tombstone; filters | N/A |
| 4 | Same; full API suite | API + unit + persistence adapter | Focused suite green before refactor | N/A (contract unchanged) | Focused suite after parser refactor: 20 passed, 4 skipped, 0 failed | Retained all triangulation assertions | `npm test`: 90 passed, 20 skipped, 0 failed; `git diff --check` clean |

The four skipped tests in the focused run and twenty skipped in the full run are PostgreSQL integration tests gated on database configuration; the new snapshot test is a non-skipped mocked-Prisma adapter test asserting `RepeatableRead` and that budget/version/event/transfer reads all use the same transaction client.

## Files changed

Work Unit 1 implementation/test files:

- `apps/api/src/app.ts`
- `apps/api/src/persistence/financial-store.ts`
- `apps/api/src/planning/transaction-history.ts`
- `apps/api/src/server.ts`
- `apps/api/test/transaction-history-api.test.ts`
- `apps/api/test/transaction-history-planning.test.ts`
- `apps/api/test/transaction-history-prisma.test.ts`

Apply bookkeeping:

- `openspec/changes/ynab-screen-parity-roadmap/tasks.md` — checked only completed implementation tasks 1–4, as required by the apply checkbox contract; parent-owned rows were left unchanged.
- `openspec/changes/ynab-screen-parity-roadmap/apply-progress.md` — this cumulative progress record.

No web/UI files, canonical MVP documents, proposal, specs, or design were changed. Pre-existing working-tree changes were left untouched. No commit or push was made.

## Verification evidence

- Baseline before edits: `node --experimental-strip-types --test apps/api/test/transaction-history-api.test.ts apps/api/test/transaction-history-planning.test.ts apps/api/test/transaction-history-prisma.test.ts` — 15 passed, 4 skipped, 0 failed.
- RED: same focused command — expected failure (4 failures across missing continuation behavior, absent cursor exports, and non-transactional persistence reads).
- GREEN / TRIANGULATE / post-refactor focused check: same command — 20 passed, 4 skipped, 0 failed.
- Required full API suite: `npm test` — 90 passed, 20 skipped, 0 failed.
- `git diff --check` — clean (Git emitted only line-ending normalization warnings).
- Changed-line estimate for Work Unit 1 implementation/tests: 266 total (237 additions + 29 deletions), under the 400-line limit by 134 lines. Bookkeeping files are outside that work-unit estimate.

## Contract and deviations

- The cursor is enabled only for a normalized account-ID-only filter, binds the budget ID, digest of that filter, history `state.version`, and exclusive `(date, createdAt, transactionId)` anchor. Stale cursors return a restartable conflict. Each page remains capped at 500; other filters preserve first-page behavior without continuation.
- `FinancialStore.load` reads budget projection, command-receipt history version, events, and transfers in one Prisma `RepeatableRead` transaction. It does not substitute `GET /api/v1/budgets`' `Budget.version`.
- No schema change or migration was needed. The existing whole-history projection remains; database-level pagination/performance improvement was not part of this unit.
- No scope deviation in implementation. PostgreSQL live-concurrency integration could not be exercised because the test environment did not enable its database-gated tests.

## Remaining unchecked tasks at completion of Work Unit 1 (historical snapshot)

```text
5. [ ] **RED:** Add failing web tests in the existing account/page test targets under `apps/web/test/` for account-to-detail navigation, direct account URL/context, server-returned balance, appended cursor pages, archived-account read history, and distinct loading/error/empty/end states (including retry without losing loaded rows). <!-- sdd-owner: implementation -->
6. [ ] **GREEN:** Add the account detail route and account links in `apps/web/app/accounts/[accountId]/page.tsx` and `apps/web/app/accounts/page.tsx`; add typed, cursor-aware request/append/reset handling in `apps/web/app/hooks/useBudgetApp.ts` and `apps/web/app/models.ts`. Preserve the selected account's server-derived balance independently of loaded pages, show a single transfer activity item, and reject stale request appends after account/filter changes. <!-- sdd-owner: implementation -->
7. [ ] **TRIANGULATE:** Add or complete tests for keyboard/native-link and continuation controls, stale-cursor restart messaging, transfer source/destination context, status-versus-income-release distinctions where displayed, and responsive single-column reflow at the designed breakpoints in `apps/web/app/globals.css`; ensure there are no controls for unsupported account workflows. <!-- sdd-owner: implementation -->
8. [ ] **REFACTOR:** Refine the account page and hook within the same web work unit, preserving the loading/error/empty/end distinctions; run `npm run test:web` and `npm run typecheck:web` from the repository root and record exact results. <!-- sdd-owner: implementation -->
9. [ ] **RED (after approval only):** Add failing report API tests under `apps/api/test/`, derived from the approved policy, for owner authorization, `YYYY-MM` validation, one-month-only selection, category spending and distinct income/expense measures, policy/version and treatment metadata, paired transfer ledgers, `WORKING` transactions, and pending/unreleased income. Assert every in-scope record has the approved visible treatment and no unapproved or partial totals are returned. <!-- sdd-owner: implementation -->
10. [ ] **GREEN (after approval only):** Implement the dedicated monthly report projection and `GET /api/v1/budgets/{budgetId}/reports/monthly?month=YYYY-MM` in `apps/api/src/reports/` and `apps/api/src/server.ts` / `apps/api/src/app.ts`, applying only the recorded policy. Use canonical effective income/spending and transfer records for the selected business month, preserve archived category labels, expose approved treatment/policy metadata, and leave canonical summary calculations unchanged. <!-- sdd-owner: implementation -->
11. [ ] **TRIANGULATE (after approval only):** Strengthen report API tests to cover policy-defined edge cases, authorization/month errors, out-of-month exclusion, non-omission/treatment of transfers, `WORKING`, and pending/unreleased income, and proof that transfer handling does not alter canonical category-budget results. Confirm the endpoint exposes no multi-month aggregation or comparison contract. <!-- sdd-owner: implementation -->
12. [ ] **REFACTOR (after approval only):** Refine the isolated report projection and contract without changing approved semantics; run `npm test` from the repository root and record the exact result. <!-- sdd-owner: implementation -->
13. [ ] **RED (after approval only):** Add failing web tests under `apps/web/test/` for discoverable report navigation, one selected `YYYY-MM` period, accessible category and distinct income/expense presentation, visible approved treatment for transfers, `WORKING`, and pending/unreleased income, and absence of comparison/trend controls. <!-- sdd-owner: implementation -->
14. [ ] **GREEN (after approval only):** Implement the `/reports` route, typed client contract, and Reports navigation in `apps/web/app/reports/page.tsx`, `apps/web/app/hooks/useBudgetApp.ts`, `apps/web/app/models.ts`, and `apps/web/app/components/shell/AppShell.tsx`; render only the approved single-month report and its treatment metadata, with accessible category/value presentation and responsive styles in `apps/web/app/globals.css`. <!-- sdd-owner: implementation -->
15. [ ] **TRIANGULATE (after approval only):** Add or complete web tests for invalid month/API failure/empty states, keyboard and screen-reader labels, selected-month clarity, approved treatment visibility, and responsive layout. Assert no multi-month trends, period comparisons, exports, or later-roadmap controls appear. <!-- sdd-owner: implementation -->
16. [ ] **REFACTOR:** Refine the report page and navigation while keeping all data and presentation tied to the approved contract; run `npm run test:web`, `npm run typecheck:web`, and `npm run build:web` from the repository root and record exact results. <!-- sdd-owner: implementation -->
- [ ] Start or reuse bounded review for each completed work unit; verify its changed scope, focused test/typecheck/build evidence, and stated rollback boundary before accepting the slice. <!-- sdd-owner: parent -->
- [ ] Keep report release blocked unless the explicit accounting-policy approval covers transfers, WORKING transactions, and pending/unreleased income and the implemented report demonstrates that approved treatment without partial or misleading totals. <!-- sdd-owner: parent -->
```

## Parent-owned lifecycle updates

- Work Unit 1 was parent-reviewed after apply. ASSESS with the actual writer profile (`openai-codex / gpt-6-luna`, `xhigh`) returned `unassessable` because the workspace has undeclared untracked files; native inspect/status reported `rdd_disabled`. No native review was started or bypassed. The fail-closed assessment plan required an independent verifier; `gentle-ai-verify` reviewed the seven-file slice and tests, found no issues, and confirmed the working tree was unchanged by verification.
- Focused and full API suites were independently rerun: 20 passed, 4 skipped, 0 failed; `npm test`: 90 passed, 20 skipped, 0 failed. PostgreSQL live integration remains unverified because database-gated tests skipped.
- Work Unit 1 and Work Unit 2 parent-review checkboxes are complete in `tasks.md`. Native ASSESS for Work Unit 2 also returned `unassessable` because of undeclared untracked files; fresh native inspect/status reported `rdd_disabled`. No native review was started or bypassed. The returned risk plan was followed with the independent read-only verifier; it reported no code findings and independently reran `npm run test:web` (22 passed) and `npm run typecheck:web` (passed).
- The verifier's typecheck updated `apps/web/tsconfig.tsbuildinfo`, which was clean at pre-verification inspection; parent restored it to its prior clean state and fresh inspect confirmed the path absent. No tests were rerun after restore because only generated metadata was reverted.
- The user approved the proposed MVP expansion and four-slice review plan. Work Units 1–2 are complete; Work Units 3–4 remain unstarted until separate explicit accounting-policy approval. No commit or PR delivery action was requested.

## Work Unit 2 — Account detail and activity UI

### Structured status consumed

- Consumed native `gentle-ai.sdd-status/v2` for `ynab-screen-parity-roadmap`: pre-apply `applyState: ready`, `nextRecommended: apply`, `artifactStore: openspec`; proposal/specs/design/tasks complete; 5/19 tasks complete before this slice, with no native blockers.
- `actionContext.mode: repo-local`; workspace and only allowed edit root: `D:/Universidad/Proyectos/2doSemestre2026/topicos/YNAB`. No action-context warning. Workload forecast for the whole tranche is High/chained; the parent authorized the four-slice path, and this execution was limited to Work Unit 2.
- Used only Work Unit 2 (tasks 5–8). The writer did not refresh native status after checkbox updates; parent lifecycle read fresh native status after apply. `skill_resolution: paths-injected` — loaded the exact React/Next and UI/UX skill paths provided in the parent prompt. Loaded global strict-TDD guidance; project-local override was absent.

### Completed tasks and persisted checkbox updates

- Task 5 — RED: added account-route/page contracts and pure cursor-page tests. Persisted checkbox is `[x]`.
- Task 6 — GREEN: added account links/detail route and typed first-page/append/reset/retry state. Balance stays sourced from the budget account object; activity rows do not derive it. Persisted checkbox is `[x]`.
- Task 7 — TRIANGULATE: covered active request/account/cursor/version acceptance, append preservation, duplicate transfer identity, stale-cursor restart state, native links/buttons, status/error/empty/end states, transfer endpoints, absent transaction-state reinterpretation, mobile reflow, and unsupported actions. Persisted checkbox is `[x]`.
- Task 8 — REFACTOR: extracted/tested pure account-history append, request-acceptance, and append-error transitions and kept UI states distinct. Persisted checkbox is `[x]`.
- Re-read `tasks.md`: tasks 5–8 are visibly `[x]`; report tasks 9–16 remain `[ ]` under the accounting-policy gate. Parent lifecycle rows were updated only after the parent reviews.

### TDD Cycle Evidence

| Task | Test file(s) | Layer | Safety net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| 5 | `apps/web/test/page.test.ts`, `apps/web/test/account-history.test.ts` | Node source-contract + pure unit | `npm run test:web`: 13 passed; `npm run typecheck:web`: passed before edits | Focused page contract: 10 passed / 4 expected failures for missing account UI; pure helper import failed because append contract was absent | N/A | N/A | N/A |
| 6 | Same | Node source-contract + pure unit | Baseline above | RED evidence above | Account append helper 2/2 passed; page contracts passed after UI landed and the archived label assertion was aligned case-insensitively | N/A | N/A |
| 7 | Same | Node source-contract + pure unit | Focused tests green | Added request-generation and append-error tests first; they failed on the missing helper export | Added current-request/error-state helpers and reran both focused files: 5 account-history tests and 14 page tests passed | Verified stale account/cursor/version/request rejection; deduped repeated transfer ID; preserved old rows/cursor on failure; status/retry and mobile/link contracts passed | N/A |
| 8 | Same; full web suite | Node source-contract + pure unit | 5 focused account-history and 14 page tests green before final suite | No new behavior change; model transition tests were written before helper extraction | `npm run test:web`: 22 passed, 0 failed; `npm run typecheck:web`: passed | Final suite retained append, retry, stale-cursor, transfer, state, and responsive assertions | Pure state transitions extracted and re-used by the hook; focused tests remained green |

The repository has no installed component-rendering test library in the web test runner. Page behavior was checked with the existing Node source-contract style; pagination and stale-request transitions were exercised as pure functions. No browser/E2E or visual viewport run was performed.

### Files changed in Work Unit 2

Implementation and focused tests:

- `apps/web/app/accounts/page.tsx`
- `apps/web/app/accounts/[accountId]/page.tsx`
- `apps/web/app/hooks/useBudgetApp.ts`
- `apps/web/app/models.ts`
- `apps/web/app/globals.css`
- `apps/web/test/page.test.ts`
- `apps/web/test/account-history.test.ts`

Apply bookkeeping:

- `openspec/changes/ynab-screen-parity-roadmap/tasks.md` — checked only implementation-owned tasks 5–8; left parent-owned rows unchanged.
- `openspec/changes/ynab-screen-parity-roadmap/apply-progress.md` — appended this cumulative Work Unit 2 record; Work Unit 1 evidence above is retained.

No API/persistence code, shell/nav, Reports route/navigation/calculations, canonical MVP documents, proposal/specs/design, or unrelated/pre-existing working-tree changes were modified. No commit or PR was created. Typecheck-generated `apps/web/tsconfig.tsbuildinfo` was restored because it was not dirty at preflight.

### Verification and workload evidence

- Pre-edit estimate for this slice: approximately 360 changed implementation/test lines, below the 400-line limit.
- Actual implementation/test delta from the seven Work Unit 2 files: 342 changed lines (336 additions, 6 deletions), 58 below the limit. SDD bookkeeping is not included in that slice estimate.
- `npm run test:web` — 22 passed, 0 failed.
- `npm run typecheck:web` — passed.
- `git diff --check` on the six tracked Work Unit 2 code/test files — clean. The two new untracked files were also parsed/exercised by the Node tests and TypeScript check.
- No `npm run build:web`, browser E2E, or visual-device test was run; these were not part of task 8's requested checks.

### Contract, deviations, and remaining gates

- Account list links for active and archived accounts use native Next links. `/accounts/[accountId]` resolves the URL account against the budget response, preserves archived history access, and displays `account.balanceMinor` directly. No balance is calculated from loaded history.
- Account history requests use the typed `{ items, version, nextCursor }` contract and account-ID query. Appends require matching account, cursor, history version, and current request generation; duplicate transaction IDs are not rendered twice. Transfers remain one activity row with both source and destination names.
- Initial loading/error, empty, appended loading/error with rows retained, stale-cursor restart, and end-of-history states are separate. A `409` asks for a first-page restart. The existing `HistoryItem.state` is not presented as transaction lifecycle or income-release status; this UI does not need either distinction.
- The summary balance remains the server-derived account balance. The route adds no unsupported account workflows. Responsive account summary and activity rows collapse at the existing 720px breakpoint; links/buttons have semantic native controls, focus affordance, and live status/error announcements.
- Report work remains blocked on explicit accounting-policy approval for transfers, `WORKING` transactions, and pending/unreleased income. No report totals, calculations, route, or nav were added. Work Units 3–4 remain unstarted; Work Unit 2 parent bounded review is complete. No implementation deviation was recorded.

### Current remaining unchecked tasks (exact persisted task lines)

```text
9. [ ] **RED (after approval only):** Add failing report API tests under `apps/api/test/`, derived from the approved policy, for owner authorization, `YYYY-MM` validation, one-month-only selection, category spending and distinct income/expense measures, policy/version and treatment metadata, paired transfer ledgers, `WORKING` transactions, and pending/unreleased income. Assert every in-scope record has the approved visible treatment and no unapproved or partial totals are returned. <!-- sdd-owner: implementation -->
10. [ ] **GREEN (after approval only):** Implement the dedicated monthly report projection and `GET /api/v1/budgets/{budgetId}/reports/monthly?month=YYYY-MM` in `apps/api/src/reports/` and `apps/api/src/server.ts` / `apps/api/src/app.ts`, applying only the recorded policy. Use canonical effective income/spending and transfer records for the selected business month, preserve archived category labels, expose approved treatment/policy metadata, and leave canonical summary calculations unchanged. <!-- sdd-owner: implementation -->
11. [ ] **TRIANGULATE (after approval only):** Strengthen report API tests to cover policy-defined edge cases, authorization/month errors, out-of-month exclusion, non-omission/treatment of transfers, `WORKING`, and pending/unreleased income, and proof that transfer handling does not alter canonical category-budget results. Confirm the endpoint exposes no multi-month aggregation or comparison contract. <!-- sdd-owner: implementation -->
12. [ ] **REFACTOR (after approval only):** Refine the isolated report projection and contract without changing approved semantics; run `npm test` from the repository root and record the exact result. <!-- sdd-owner: implementation -->
13. [ ] **RED (after approval only):** Add failing web tests under `apps/web/test/` for discoverable report navigation, one selected `YYYY-MM` period, accessible category and distinct income/expense presentation, visible approved treatment for transfers, `WORKING`, and pending/unreleased income, and absence of comparison/trend controls. <!-- sdd-owner: implementation -->
14. [ ] **GREEN (after approval only):** Implement the `/reports` route, typed client contract, and Reports navigation in `apps/web/app/reports/page.tsx`, `apps/web/app/hooks/useBudgetApp.ts`, `apps/web/app/models.ts`, and `apps/web/app/components/shell/AppShell.tsx`; render only the approved single-month report and its treatment metadata, with accessible category/value presentation and responsive styles in `apps/web/app/globals.css`. <!-- sdd-owner: implementation -->
15. [ ] **TRIANGULATE (after approval only):** Add or complete web tests for invalid month/API failure/empty states, keyboard and screen-reader labels, selected-month clarity, approved treatment visibility, and responsive layout. Assert no multi-month trends, period comparisons, exports, or later-roadmap controls appear. <!-- sdd-owner: implementation -->
16. [ ] **REFACTOR:** Refine the report page and navigation while keeping all data and presentation tied to the approved contract; run `npm run test:web`, `npm run typecheck:web`, and `npm run build:web` from the repository root and record exact results. <!-- sdd-owner: implementation -->
- [ ] Repeat bounded parent review for every remaining completed work unit; verify changed scope, focused test/typecheck/build evidence, and rollback boundary before accepting each slice. <!-- sdd-owner: parent -->
- [ ] Keep report release blocked unless the explicit accounting-policy approval covers transfers, WORKING transactions, and pending/unreleased income and the implemented report demonstrates that approved treatment without partial or misleading totals. <!-- sdd-owner: parent -->
```

### Writer

- `openai-codex / gpt-6-luna`, reasoning effort `xhigh`.

## Work Unit 3 — Policy-approved single-month report API

### Structured status consumed

- Native status was not refreshed by this writer. The report hard gate is recorded as resolved in `tasks.md` (owner approval 2026-09-28) and in `report-accounting-policy.md` as `report-policy/v1`; the parent assigned tasks 9–12 only. No other work unit was touched.
- `skill_resolution: none` — the parent injected no skill paths for this slice, and no fallback registry was used.
- Authorized edit surfaces: `apps/api/src/reports/`, `apps/api/src/app.ts`, `apps/api/src/server.ts`, `apps/api/test/`, and the two SDD bookkeeping files. Pre-existing working-tree changes (`README.md`, `docker-compose.yml`, `docs/README.md`, untracked `docs/research/`, `odd/tasks/`, `.pi/`, `.codegraph/`) were left untouched. No commit, push, or PR was created.

### Completed tasks and persisted checkbox updates

- Task 9 — RED: added `apps/api/test/monthly-report-api.test.ts` with the approved-policy contract cases. Persisted checkbox is `[x]`.
- Task 10 — GREEN: added the isolated projection `apps/api/src/reports/monthly-report.ts` plus `BudgetApp.getMonthlyReport` and the `GET /api/v1/budgets/{budgetId}/reports/monthly` route with its own query parser. Persisted checkbox is `[x]`.
- Task 11 — TRIANGULATE: added exact-once transfer balance accounting, effective-history fold (replacement + tombstone) rather than raw double counting, empty-month zeros without cross-month leakage, and the no-multi-month response-shape assertion. Persisted checkbox is `[x]`.
- Task 12 — REFACTOR: extracted the shared kind filter and renamed the working-subset locals without changing semantics, then ran the required repository-root `npm test`. Persisted checkbox is `[x]`.
- Only implementation-owned tasks 9–12 were checked. Parent-owned rows 69–70 were left unchanged.

### TDD Cycle Evidence

| Task | Test file(s) | Layer | Safety net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| 9 | `apps/api/test/monthly-report-api.test.ts` | API + projection unit | `node --experimental-strip-types --test apps/api/test/reports.test.ts`: 5 passed, 1 skipped, 0 failed before edits | Confirmed: focused command failed 6/6 — 5 behavioral failures from the absent endpoint (report body `undefined`, HTTP 404) and 1 `ERR_MODULE_NOT_FOUND` for the not-yet-created projection module | N/A | N/A | N/A |
| 10 | Same | API + projection unit | Baseline above | RED evidence above | Focused command: 6 passed, 0 failed | N/A | N/A |
| 11 | Same | API + projection unit | Focused suite green | TRIANGULATE cases were added after GREEN and passed on first run, so no new RED was required | Focused command re-run: 9 passed, 0 failed | Exact-once transfer balances (source −60,000 / destination +60,000 / paired legs net to zero); `rawEvents` fold with superseding replacement and `TRANSACTION_DELETE` tombstone counted once; empty month reports explicit zeros; `Object.keys` assertion proves no multi-month/comparison/trend contract | N/A |
| 12 | Same; full API suite | API + projection unit | Combined focused safety net `reports.test.ts + monthly-report-api.test.ts`: 14 passed, 1 skipped, 0 failed | N/A (contract unchanged) | Focused command after refactor: 9 passed, 0 failed | All triangulation assertions retained after the refactor | `npm test`: 119 tests, 99 passed, 20 skipped, 0 failed |

The 20 skipped tests are the existing PostgreSQL-gated integration cases. No production command writes `status: 'WORKING'`, so the provisional case is exercised by injecting a budget state with `WORKING` events through the existing `financialStore` seam, the same technique the account-history API test uses.

### Files changed in Work Unit 3

Implementation, contract, and focused tests:

- `apps/api/src/reports/monthly-report.ts` — new isolated projection, 68 lines (+68/−0).
- `apps/api/src/app.ts` — `getMonthlyReport` plus the projection import, 11 lines (+11/−0).
- `apps/api/src/server.ts` — `parseMonthlyReportQuery` and the `reports/monthly` route, 13 lines (+13/−0).
- `apps/api/test/monthly-report-api.test.ts` — new policy-contract suite, 229 lines (+229/−0).
- `apps/api/openapi.yaml` — documented `GET /api/v1/budgets/{budgetId}/reports/monthly` plus the `MonthlyReportSuccess` response and the `MonthlyReportCategory`, `MonthlyReportTransferItem`, `MonthlyReport`, and `MonthlyReportEnvelope` schemas, 16 lines (+16/−0).
- `apps/api/test/openapi.test.ts` — added the report route row to the coverage list, extended the `Month` parameter condition, and registered the four new schema names, 5 changed lines (+3/−2).

Apply bookkeeping:

- `openspec/changes/ynab-screen-parity-roadmap/tasks.md` — checked only implementation-owned tasks 9–12; parent-owned rows unchanged.
- `openspec/changes/ynab-screen-parity-roadmap/apply-progress.md` — appended this cumulative Work Unit 3 record; Work Unit 1 and 2 evidence above is retained.

`ReportService.read`, account balances, Ready to Assign, the canonical monthly summary/dashboard, the Prisma schema, `apps/web/`, and canonical MVP documents were not modified. `apps/api/openapi.yaml` was modified only to document the new endpoint and its response schemas.

### Verification and workload evidence

- Focused safety net before edits: `node --experimental-strip-types --test apps/api/test/reports.test.ts` — 5 passed, 1 skipped, 0 failed.
- RED: `node --experimental-strip-types --test apps/api/test/monthly-report-api.test.ts` — 6 tests, 0 passed, 6 failed (5 behavioral, 1 missing module).
- GREEN: same command — 6 tests, 6 passed, 0 failed.
- TRIANGULATE: same command — 9 tests, 9 passed, 0 failed.
- REFACTOR: same command — 9 tests, 9 passed, 0 failed; then the required full suite `npm test` — 119 tests, 99 passed, 20 skipped, 0 failed.
- Changed-line total for this slice: 342 (340 additions, 2 deletions) across the six API implementation/test/contract files, 58 below the 400-line budget; no re-scoping pause was required. Bookkeeping files are outside that estimate.
- Contract-coverage addition: `node --experimental-strip-types --test apps/api/test/openapi.test.ts` — 3 passed, 0 failed. Read-only YAML parse of `apps/api/openapi.yaml` (via the `confbox` parser already present in `node_modules`) confirmed the file parses and that the new path, response, and schema nodes resolve to the intended shapes.
- Required full suite after the contract addition: `npm test` — 119 tests, 99 passed, 20 skipped, 0 failed.
- No API TypeScript check, build, or Prisma-gated integration run exists for this package and none was requested by task 12.

### Contract, resolved ambiguities, and deviations

- `GET /api/v1/budgets/{budgetId}/reports/monthly?month=YYYY-MM` is owner-authorized (unauthenticated `401 UNAUTHENTICATED`, foreign budget `404 NOT_FOUND`) and returns `{ data: { month, policy: { id: 'report-policy/v1', month }, incomeMinor, expenseMinor, categories[], transfers, provisional, incomeRelease, version }, requestId }`.
- Income and expense are the sums over canonical effective `INCOME` and `SPENDING` for the selected month, `POSTED` and `WORKING` alike. `INCOME_RELEASE`, `ASSIGNMENT`, `UNASSIGNMENT`, `MOVE`, `TRANSFER_OUT`, and `TRANSFER_IN` contribute nothing to either measure.
- Transfers are read from the `Transfer` rows for the month, one item each, with source/destination account references, date, amount, and a section subtotal labelled `OUTSIDE_INCOME_EXPENSE_TOTALS`. Paired ledger legs are never counted twice and no transfer reaches a category's spending.
- `WORKING` records are included and surfaced as `{ treatment: 'INCLUDED_PROVISIONAL', count, incomeMinor, expenseMinor }`.
- Pending income is `{ treatment: 'PENDING_RELEASE', receivedMinor, releasedMinor, pendingMinor }` with `pendingMinor = receivedMinor − releasedMinor`. `INCOME_RELEASE` events carry the income's month, and production release is full-amount only, so a non-zero pending balance requires an unreleased income in the same month.
- Resolved representation choices, flagged for review because the policy fixes semantics rather than wire shape: (1) the unresolved-policy state is `{ month, policy: { id: null, month }, unavailable: { code: 'REPORT_POLICY_UNRESOLVED', treatment: 'NO_TOTALS_RETURNED' } }` with no totals; `report-policy/v1` is a compile-time constant, so the endpoint cannot currently reach it and the projection's explicit `policy` argument is the only way to exercise it; (2) `categories[]` lists every budget category, active and archived, with `spendingMinor` zero when there is none, so archived labels are preserved and nothing is silently omitted; (3) `version` echoes the budget version like `GET /summary`; (4) the report query rejects unknown or repeated parameters instead of ignoring extras as `summary`/`dashboard` do, which makes the absence of a multi-month contract enforceable.
- Parent review found that the implemented endpoint was absent from `apps/api/openapi.yaml` and from the coverage list in `apps/api/test/openapi.test.ts`, which left the public contract undocumented and the API-contract coverage invariant broken. Closed inside the same work unit; the resolution is recorded under "Parent review finding closure" below.
- No report formula, total, or treatment beyond `report-policy/v1` was invented, and no account balance, Ready to Assign, or canonical summary value changed.

### Parent review finding closure

- Finding: `GET /api/v1/budgets/{budgetId}/reports/monthly` was implemented in `apps/api/src/server.ts` but appeared in neither the OpenAPI document nor the route coverage list, so the repository's own API-contract coverage invariant did not include it.
- Closure: added `  /api/v1/budgets/{budgetId}/reports/monthly:` with `RequestId`, `BudgetId`, and `Month` parameters, cookie auth, `'200': MonthlyReportSuccess`, and `ValidationError`/`Unauthenticated`/`NotFound`, matching the neighbouring `summary`/`dashboard` paths. Added the `MonthlyReportSuccess` response and the `MonthlyReportCategory`, `MonthlyReportTransferItem`, `MonthlyReport`, and `MonthlyReportEnvelope` schemas describing exactly the implemented fields, including `policy.id`, `transfers.treatment`/`totalMinor`/`items`, `provisional.treatment`/`count`/`incomeMinor`/`expenseMinor`, and `incomeRelease.treatment`/`receivedMinor`/`releasedMinor`/`pendingMinor`.
- Added the route row to `routes` in `apps/api/test/openapi.test.ts`, extended the shared `Month` parameter condition with `path.endsWith('/reports/monthly')`, and registered the four new schema names in the schema-coverage list.
- No production response field, projection semantic, or endpoint behavior changed. The document was written from the implemented shape rather than changing the implementation to match a nicer document.
- No new RED/GREEN cycle applies: this is contract coverage for an already-implemented endpoint, not new behavior. Evidence is the strengthened `openapi.test.ts` passing with the new row plus a block-level check that the documented operation contains every asserted parameter, success response, and error reference.
- Pre-existing defect observed while validating this file and deliberately not fixed here because repairing it exceeds the ~60-line budget for this change: `components:` is indented two spaces, so `components`, `securitySchemes`, `parameters`, `responses`, and `schemas` all parse as children of `paths` instead of as root-level `components` children. Every `#/components/...` reference in the file is therefore unresolvable by a strict OpenAPI validator. This predates Work Unit 3 and needs its own authorized slice.

### Current remaining unchecked tasks (exact persisted task lines)

```text
13. [ ] **RED (after approval only):** Add failing web tests under `apps/web/test/` for discoverable report navigation, one selected `YYYY-MM` period, accessible category and distinct income/expense presentation, visible approved treatment for transfers, `WORKING`, and pending/unreleased income, and absence of comparison/trend controls. <!-- sdd-owner: implementation -->
14. [ ] **GREEN (after approval only):** Implement the `/reports` route, typed client contract, and Reports navigation in `apps/web/app/reports/page.tsx`, `apps/web/app/hooks/useBudgetApp.ts`, `apps/web/app/models.ts`, and `apps/web/app/components/shell/AppShell.tsx`; render only the approved single-month report and its treatment metadata, with accessible category/value presentation and responsive styles in `apps/web/app/globals.css`. <!-- sdd-owner: implementation -->
15. [ ] **TRIANGULATE (after approval only):** Add or complete web tests for invalid month/API failure/empty states, keyboard and screen-reader labels, selected-month clarity, approved treatment visibility, and responsive layout. Assert no multi-month trends, period comparisons, exports, or later-roadmap controls appear. <!-- sdd-owner: implementation -->
### Writer

- `openai-codex / gpt-6-luna`, reasoning effort `xhigh`.

## Work Unit 4 — Policy-approved single-month report surface

### Structured status consumed

- Native status was not refreshed by this writer. The report hard gate is recorded as resolved in `tasks.md` (owner approval 2026-09-28) and in `report-accounting-policy.md` as `report-policy/v1`; the parent assigned tasks 13–16 only. Work Unit 3 was treated as frozen and committed at `370dd85`; nothing under `apps/api/` was modified and no API contract change was requested or made.
- `skill_resolution: none` — the parent injected no skill paths for this slice, and no fallback registry was used.
- Authorized edit surfaces: `apps/web/app/reports/`, `apps/web/app/components/shell/AppShell.tsx`, `apps/web/app/models.ts`, `apps/web/app/hooks/useBudgetApp.ts`, `apps/web/app/globals.css`, `apps/web/test/`, and the two SDD bookkeeping files. Pre-existing working-tree changes (`README.md`, `docker-compose.yml`, `docs/README.md`, untracked `docs/research/`, `odd/tasks/`, `.pi/`, `.codegraph/`) were left untouched. No commit, push, or PR was created.

### Completed tasks and persisted checkbox updates

- Task 13 — RED: added `apps/web/test/reports.test.ts` covering discoverable report navigation, one selected `YYYY-MM` period, the captioned category table, distinct income/expense measures, transfer treatment with an outside-totals subtotal, provisional `WORKING` treatment, pending-release income, and the absence of comparison/trend/export controls. Persisted checkbox is `[x]`.
- Task 14 — GREEN: added the `apps/web/app/reports/page.tsx` route, the typed monthly-report contract and pure helpers in `apps/web/app/models.ts`, `readMonthlyReport` in `apps/web/app/hooks/useBudgetApp.ts`, the Reports entry in `apps/web/app/components/shell/AppShell.tsx`, and report styles in `apps/web/app/globals.css`. Persisted checkbox is `[x]`.
- Task 15 — TRIANGULATE: added non-omission (all five sections render together), unresolved-policy isolation from every totals path, no browser-side arithmetic, single-period wire guard, invalid-month/API-failure/empty-state separation, keyboard and assistive-technology labels, and responsive single-column reflow assertions. Persisted checkbox is `[x]`.
- Task 16 — REFACTOR: renamed the empty-month local for clarity and re-ran the three required repository-root commands on the frozen final state. Persisted checkbox is `[x]`.
- Only implementation-owned tasks 13–16 were checked. Parent-owned rows were left unchanged.

### TDD Cycle Evidence

| Task | Test file(s) | Layer | Safety net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| 13 | `apps/web/test/reports.test.ts` | Node source-contract + pure unit | `npm run test:web`: 22 passed, 0 failed before edits | Stage 1: `node --experimental-strip-types --test apps/web/test/reports.test.ts` failed with `SyntaxError: The requested module '../app/models.ts' does not provide an export named 'isMonthlyReportUnavailable'` (1 test, 0 passed, 1 failed). Stage 2, after adding only the typed contract and pure helpers: 13 tests, 2 passed, 11 failed — all 11 behavioral failures were the navigation, page, treatment, exclusion, state, accessibility, endpoint, and CSS contracts for a surface that did not exist yet | N/A | N/A | N/A |
| 14 | Same | Node source-contract + pure unit | RED stage 2 above | RED evidence above | Same focused command: 13 tests, 13 passed, 0 failed | N/A | N/A |
| 15 | Same | Node source-contract + pure unit | Focused suite green | The four triangulation tests were added after GREEN and passed on first run, so no new RED was required (same precedent as Work Unit 3 task 11) | Focused command re-run: 16 tests, 16 passed, 0 failed | Non-omission (five sections render together, empty transfer note, `Sin categorías` row, explicit empty-month note); unresolved-policy branch excluded from the totals path and no `+=`, `sum(`, `reduce(` arithmetic; single `reports/monthly?month=` call site with no second period parameter and a request-generation guard; no click-only `div` control | N/A |
| 16 | Same; full web suite | Node source-contract + pure unit | 16 focused tests green before final suite | N/A (presentation values unchanged) | Focused and full suites green after the rename | All triangulation assertions retained | `npm run test:web`: 38 passed, 0 failed; `npm run typecheck:web`: exit 0; `npm run build:web`: exit 0 with `/reports` prerendered |

RED evidence is recorded in two stages because the pure contract helpers are part of this unit's deliverable: the first run proved the exports were absent, and the second run proved the UI, navigation, endpoint, and CSS behavior was absent while the helpers passed. No RED claim is made for Task 15, where the triangulation cases passed on first execution.

### Files changed in Work Unit 4

Implementation and focused tests (added/deleted lines):

- `apps/web/app/reports/page.tsx` — new single-month report route, +138/−0.
- `apps/web/app/models.ts` — typed `MonthlyReport`/`MonthlyReportUnavailable`/`MonthlyReportProjection` contract, report state types, and `isReportMonth`/`reportMonthLabel`/`isMonthlyReportUnavailable`, +50/−0.
- `apps/web/app/hooks/useBudgetApp.ts` — `report` state, `readMonthlyReport` with invalid-month and request-generation handling, sign-out reset, returned controller surface, +36/−4.
- `apps/web/app/globals.css` — report layout, captioned-table, treatment, state, and responsive styles, +36/−2.
- `apps/web/app/components/shell/AppShell.tsx` — Reports navigation entry and full mobile-navigation mapping, +2/−1.
- `apps/web/test/reports.test.ts` — new report contract and triangulation suite, +184/−0.
- `apps/web/test/page.test.ts` — required supersede of the Work Unit 2 "reports not yet exposed" gate (see deviations), +2/−2.

Apply bookkeeping:

- `openspec/changes/ynab-screen-parity-roadmap/tasks.md` — checked only implementation-owned tasks 13–16; parent-owned rows unchanged.
- `openspec/changes/ynab-screen-parity-roadmap/apply-progress.md` — appended this cumulative Work Unit 4 record; Work Unit 1–3 evidence above is retained.

No file under `apps/api/`, no canonical MVP document, and no pre-existing unrelated working-tree change was touched. No commit or push was made.

### Verification evidence (exact commands, repository root)

`npm run test:web`

```text
> test:web
> node --experimental-strip-types --test apps/web/test/*.test.ts

TAP version 13
# Subtest: account history appends the requested cursor page without losing prior rows
...
1..38
# tests 38
# suites 0
# pass 38
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 269.3374
```

`npm run typecheck:web`

```text
> typecheck:web
> tsc -p apps/web/tsconfig.json --noEmit

typecheck exit=0
```

No diagnostics were emitted. This command rewrote the tracked generated artifact `apps/web/tsconfig.tsbuildinfo` (hash `ae886f3c…` instead of its pre-existing `612855aa…`); it was restored to its pre-existing clean state with the exact committed bytes and re-verified at hash `612855aa83b7ec6abdc9b185327763b867856ba9`, with `git status --porcelain apps/web/` no longer listing it.

`npm run build:web`

```text
Route (app)                                 Size  First Load JS
┌ ○ /                                      496 B         107 kB
├ ○ /_not-found                            986 B         104 kB
├ ○ /accounts                            3.22 kB         113 kB
├ ƒ /accounts/[accountId]                3.12 kB         113 kB
├ ○ /budget                              3.83 kB         114 kB
├ ○ /login                               1.43 kB         112 kB
├ ○ /register                             1.4 kB         112 kB
├ ○ /reports                             3.65 kB         114 kB
├ ○ /settings/data                       2.25 kB         113 kB
├ ○ /setup                               2.85 kB         110 kB
└ ○ /transactions                         4.8 kB         115 kB
+ First Load JS shared by all             103 kB

○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand

build exit=0
```

`/reports` built as a static route. No API test, API typecheck, browser E2E, or viewport run was performed; none was requested by task 16.

### Independent verification and defect closure (F2)

- Independent verification of Work Unit 4 returned **no blockers** and confirmed every acceptance criterion at source level. It also independently confirmed the changed-line figure as exactly **457**.
- Finding F2 (real defect caused by this unit, now fixed): adding `/reports` to `nav` made `nav` five entries long, but the mobile navigation still appended the hardcoded `Más` tile pointing at `/settings/data`, which `nav[4]` already covered. The bar therefore rendered **six** tiles into a 5-column grid: a duplicated settings destination, a sixth tile wrapping to a second row on narrow screens, and a bar that could exceed the `72px` bottom padding reserved by `.app-frame` for a single row.
- Resolution (surgical, no redesign): the redundant hardcoded tile was removed so the mobile navigation renders exactly the five `nav` entries in one row. The single `nav.map(...)` mapping itself is unchanged, so the previously asserted landmark attributes and the `nav.map(item => <Link …><span>{item.icon}</span><small>{item.label}</small></Link>)` shape still match. `repeat(5, 1fr)` in `apps/web/app/globals.css` was deliberately left untouched because a test asserts that exact value, and the desktop sidebar was not changed.
- The `0.62rem` mobile label size and `overflow-wrap: anywhere` introduced for the five-column bar were retained: with five labels including `Transacciones` and `Configuración` they remain justified, and the finding required only the removal of the duplicate tile. No `.app-frame` padding change was needed once the bar is a single row again.
- No test needed superseding for F2. No existing test asserted the `Más` label or the old `nav.slice(0, 3)` behavior; the only mobile-navigation assertions are the `className="mobile-nav" aria-label="Navegación móvil"` landmark and the CSS `repeat(5, 1fr)` value, both unaffected by the removal. Per the fix instruction, no assertion was added for the duplicate-tile invariant either: the invariant is now structural (a single `nav.map` with no second tile), not test-enforced.
- Post-fix re-run on the frozen final state: `npm run test:web` — 38 passed, 0 failed; `npm run typecheck:web` — exit 0, no diagnostics; `npm run build:web` — exit 0, `/reports` prerendered static and all ten pre-existing routes still built. `apps/web/tsconfig.tsbuildinfo` was dirtied by the typecheck and restored to its committed bytes at hash `612855aa83b7ec6abdc9b185327763b867856ba9`; `git status --porcelain apps/web/` no longer lists it.
- The fix is line-neutral: `apps/web/app/components/shell/AppShell.tsx` remains +2/−1, so the Work Unit 4 total is unchanged at **457 changed lines** (see the corrected total below).

### Changed-line estimate versus the 400-line budget

- Actual delta for this slice: **457 changed lines** (448 additions + 9 deletions) across the seven web implementation/test files: 138 + 50 + 36 + 36 + 2 + 184 + 2 additions and 4 + 2 + 1 + 2 deletions. This figure was independently confirmed as exact during verification and is unaffected by the F2 fix, which rewrote the same single `AppShell.tsx` line and stayed +2/−1.
- Budget: 400 lines. **Overage: 57 lines (14.25%).** SDD bookkeeping files are outside this estimate, consistent with Work Units 1–3.
- Composition: 322 lines are the two new files (the `/reports` page, 138, and its test suite, 184); 135 lines are edits to five existing files.
- Reduction already applied inside this unit: the test fixture block was compressed from 41 to 8 lines with no loss of asserted coverage, which removed 21 lines from the measured delta.
- The remaining overage is the enumerated Task 13 and Task 15 acceptance list rather than incidental scope: five mandatory sections, four distinct states, the captioned accessible category table, transfer/provisional/release treatments, the navigation entry, the typed contract, the hook wiring, and responsive styles, each with source-level assertions. This overage was surfaced to the transaction controller as a review-workload decision instead of being trimmed by dropping required coverage.

### Contract, resolved ambiguities, and deviations

- Route and contract: `/reports` reads `GET /api/v1/budgets/{budgetId}/reports/monthly?month=YYYY-MM` exactly once; the request carries no second period parameter, and a per-hook `reportRequestId` generation guard discards superseded responses on both success and failure. The typed contract mirrors the Work Unit 3 response exactly, including the treatment literals `OUTSIDE_INCOME_EXPENSE_TOTALS`, `INCLUDED_PROVISIONAL`, `PENDING_RELEASE`, `REPORT_POLICY_UNRESOLVED`, and `NO_TOTALS_RETURNED`; the web layer never re-derives those semantics.
- Selected period: the initial month reuses the existing `currentMonth()` (`new Date().toISOString().slice(0, 7)`) convention already used by `useBudgetApp`, so no new default policy was invented. The page shows a human label (`febrero de 2026`), the raw period code, and a single native `type="month"` control with a `label`/`aria-describedby` pairing. The label table in `models.ts` is fixed and timezone-independent rather than locale-dependent.
- Approved treatment visibility: the category table is a real `<table>` with `<caption>`, `scope="col"` headers, and per-row `scope="row"` headers; archived categories carry a text flag instead of colour-only meaning. Income and expense are two separately labelled `<dt>`/`<dd>` measures in their own labelled section; transfers render one row per transfer with source, destination, date, and amount plus a subtotal line explicitly labelled "fuera de los totales de ingresos y gastos"; the provisional count and provisional income/expense subtotals are labelled provisional; received/released/pending income is labelled "Pendiente de liberar"; and `policy.id` is shown as the applied policy.
- No silent omission: all five sections render together under a single `monthly` guard, so a zero value renders as `0,00` and an empty list renders an explicit "No hubo transferencias en este mes." note. A month with no activity additionally shows "Sin actividad registrada en …" because the API returns explicit zeros, so no blank page and no hidden section exists.
- Distinct states: initial loading (`role="status" aria-live="polite"`), API failure (`role="alert"` plus a `Reintentar` button for retryable failures only), invalid month (its own `errorKind: 'invalid-month'` message, native month input retained), empty month (explicit zeros plus the no-activity note), and unresolved policy (its own `role="alert"` section reporting `REPORT_POLICY_UNRESOLVED · NO_TOTALS_RETURNED` with no totals path reachable, because `monthly` is derived with `!isMonthlyReportUnavailable(projection)`).
- Deviation 1 (required supersede): `apps/web/test/page.test.ts` asserted `assert.doesNotMatch(shell, /\/reports|Reportes/)` in Work Unit 2. That assertion encoded "the report surface is not approved to exist yet"; Work Unit 4 is precisely the authorized change that flips it. It was replaced with `assert.doesNotMatch(accountDetail, /\/reports/)`, preserving the original account-activity intent (no report control inside account activity) while allowing the approved navigation entry. The test title "navigation is route-based and centered on four user tasks" was corrected to "…on the core user tasks" because the primary navigation now has five entries. No account-history behavior or assertion was removed, and no other existing test was changed.
- Deviation 2 (mobile reachability): the sidebar is `display: none` below 980px, so a Reports entry limited to the sidebar would have been unreachable on mobile. The mobile navigation therefore renders the full primary navigation — the same five `nav` entries, including `/settings/data` as `Configuración` — into the designed 5-column bar, with the desktop sidebar, labels, and route highlighting unchanged. The `repeat(5, 1fr)` value is retained exactly as asserted by the test.
- Resolved ambiguity: the browser performs no arithmetic on report values (`+=`, `sum(`, `reduce(` are absent), so every displayed number is the server's approved projection formatted with the existing `formatMoney` helper.
- Not invented: no formula, total, treatment, month aggregation, comparison, export, target, schedule, reconciliation, card/loan, or split control was added. Assertions explicitly cover the absence of trends, comparisons, exports, and later-roadmap controls.

### Could not be exercised

- The repository has no component-rendering, DOM, or browser test library, so no React render, DOM query, computed-style measurement, or screen-reader run was performed. Page behavior was verified as Node source-contract tests over the page source plus pure-function tests over the extracted contract helpers, following the Work Unit 2 convention, and the responsive claim is verified at source level (media-query rules present and asserted) rather than by a viewport run.
- The hook's React state transitions and the request-generation guard are asserted from source; they were not executed, because there is no renderer in this test setup.
- The unresolved-policy response is unreachable from the running endpoint (`REPORT_POLICY_ID` is a compile-time constant in Work Unit 3, as recorded there). The page's handling of it is verified against the typed response shape and the Work Unit 3 projection test, not by an end-to-end HTTP call.

### Current remaining unchecked tasks (exact persisted task lines)

```text
- [ ] Repeat parent review for each remaining completed work unit after the report policy gate is resolved. <!-- sdd-owner: parent -->
- [ ] Keep report release blocked unless the explicit accounting-policy approval covers transfers, WORKING transactions, and pending/unreleased income and the implemented report demonstrates that approved treatment without partial or misleading totals. <!-- sdd-owner: parent -->
```

### Writer

- `openai-codex / gpt-6-luna`, reasoning effort `xhigh`.
