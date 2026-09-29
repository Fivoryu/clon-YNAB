# Apply Progress: Multi-Month Trends (API Contract)

Cumulative record. Append one section per work unit. Never edit a closed section.

## Work Unit 1 — Range helpers and multi-month projection

Status: **complete**, tasks 1-4 checked in `tasks.md`. Tasks 5-8 and the parent-owned post-apply gates are untouched.
Authorized scope: `apps/api/src/reports/multi-month-report.ts` (new), `apps/api/test/multi-month-report.test.ts` (new), `tasks.md`, `apply-progress.md`.

### Exported module surface (`apps/api/src/reports/multi-month-report.ts`)

| Export | Signature |
| --- | --- |
| `MULTI_MONTH_POLICY_ID` | `'report-policy/v2'` |
| `REPORT_MONTH_RANGE_MAX` | `24` |
| `MultiMonthReportPolicy` (type) | `{ id; monthBasis; from; to; monthCount }` |
| `MultiMonthReportTotal` (type) | `{ treatment; incomeMinor; expenseMinor; categories; transfers; provisional }` — no release field |
| `MultiMonthReportDisclosure` (type) | `{ recomputedFromEffectiveHistory: true; categoryLabelsAreCurrent: true; durable: false }` |
| `MultiMonthReport` (type) | `{ policy; months; total; disclosure; version }` |
| `monthRangeLength` | `(from: string, to: string): number` |
| `monthsInRange` | `(from: string, to: string): string[]` |
| `projectMultiMonthReport` | `(state: FinancialState, from: string, to: string): MultiMonthReport` |

`projectMonthlyReport` is called only with its default policy; `apps/api/src/reports/monthly-report.ts` is unmodified.

### TDD evidence

| Phase | Command | Observed result |
| --- | --- | --- |
| RED (task 1) | `node --experimental-strip-types --test apps/api/test/multi-month-report.test.ts` | `ERR_MODULE_NOT_FOUND: Cannot find module '...\apps\api\src\reports\multi-month-report.ts'`; `# tests 1 / # pass 0 / # fail 1` — the whole new suite failed because the module did not exist |
| GREEN attempt 1 (task 2) | same | `# tests 14 / # pass 12 / # fail 2` — both failures came from a defect in the **test** matcher, not the module: `/pending/i.test(JSON.stringify(total))` matched `"spendingMinor"`. Replaced with a word-accurate key-path scan (`exposesRelease`/`releaseKeyPaths`) |
| GREEN (task 2) | same | `# tests 14 / # pass 14 / # fail 0 / # skipped 0` |
| TRIANGULATE (task 3) | same | `# tests 17 / # pass 17 / # fail 0` after adding range-isolation, widest-range/year-boundary arithmetic, and effective-history cases |
| REFACTOR (task 4) | same | `# tests 15 / # pass 15 / # fail 0` — `projectPeriodTotal` extracted from `projectMultiMonthReport`; no assertion changed. (15 rather than 17 because the two pure range-helper suites were merged into one, and the widest-range assertions were folded into the helper and 24-month suites; the final file is 277 lines instead of 356 with identical coverage) |
| REFACTOR (task 4) | `npm test` (from the repository root) | `1..135 / # tests 135 / # suites 0 / # pass 115 / # fail 0 / # cancelled 0 / # skipped 20 / # todo 0 / # duration_ms 5799.766` — 0 failures; the 20 skips are the pre-existing `DATABASE_URL`-gated database tests. The 15 new tests account for 135-120 and 115-100, so every pre-existing test still passes |

### Pending-release absence: proof

Three independent locks, all passing:

1. `assert.deepEqual(Object.keys(report.total).sort(), ['categories', 'expenseMinor', 'incomeMinor', 'provisional', 'transfers', 'treatment'])` — the exact key set of the period total.
2. `assert.deepEqual(releaseKeyPaths(report.total, 'total'), [])` — a recursive scan of every nested key; a key matches only when a camelCase word is `pending` or the key names the income release breakdown, so `spendingMinor` cannot produce a false pass.
3. `assert.equal('pendingMinor' in report.total, false)` and `assert.equal('incomeRelease' in report.total, false)`, plus `Object.keys(report.total).sort()` locked again in the release-month test. The same suite asserts `releaseKeyPaths(report.months, 'months')` is **not** empty, proving the lock can detect the measure where it is required.

### Changed files

| File | Lines | Change |
| --- | --- | --- |
| `apps/api/src/reports/multi-month-report.ts` | 126 (new) | Range helpers, series/total/disclosure types, `projectMultiMonthReport` |
| `apps/api/test/multi-month-report.test.ts` | 277 (new) | 15 focused `node:test` cases |
| `openspec/changes/add-multi-month-trends/tasks.md` | 4 changed lines | Rows 1-4 flipped to `[x]`; rows 5-8 and parent rows untouched |
| `openspec/changes/add-multi-month-trends/apply-progress.md` | this file (new) | Work Unit 1 record |

Deliverable delta: **403 authored lines** (126 module + 277 tests). No file outside the allowed edit surfaces was touched; `git status --porcelain` shows only the two new deliverables and the pre-existing untracked `openspec/changes/add-multi-month-trends/`, `.codegraph/`, and `.pi/` directories.

### Deviations, ambiguities, and how they were resolved

1. **Changed-line budget.** 403 lines against the "roughly 400" slice budget and against Work Unit 1's own 170-230 forecast in `design.md`. Nothing was shortened by dropping coverage; the final size was reached by merging redundant helper tests and compressing fixtures, keeping every assertion the task listed. This is reported for the parent's re-scoping decision rather than hidden.
2. **Where the 24-month cap is enforced.** `design.md` gives `monthCount` as a formula that "must be `<= 24`" and says an over-long range is "rejected before any data is loaded", but does not say which helper rejects. Resolved by enforcing the cap, the malformed-month check, and the ordering check in one internal `resolveRange` used by `monthRangeLength`, `monthsInRange`, and `projectMultiMonthReport`, so all three reject uniformly and no caller can obtain a truncated series. `monthRangeLength` therefore throws instead of returning an over-long length; that is the conservative reading of "the range is rejected, never clamped or truncated".
3. **Enumeration arithmetic.** `design.md` asks for `Date.UTC` arithmetic while the length formula is `(to.year - from.year) * 12 + (to.month - from.month) + 1`. Implemented exactly that way: length from the design's formula, enumeration by offsetting `Date.UTC(start.year, start.month - 1 + offset, 1)`.
4. **Unreachable unavailable branch.** `projectMonthlyReport` returns `MonthlyReportProjection`, and the default policy is always resolved, so its `REPORT_POLICY_UNRESOLVED` branch is unreachable from this module. Handled with a documented narrow type assertion in an internal `projectMonth` wrapper — no runtime branch was invented, and no month value is altered.
5. **`policy.monthBasis`.** Taken from the imported `REPORT_POLICY_ID` constant rather than retyped as a literal, so a v1 policy rename cannot silently desynchronize the v2 series. The test still locks the literal `'report-policy/v1'` through `REPORT_POLICY_ID`.
6. **Release-month breakdown.** `report-policy-v2.md` requires each month to keep its own complete `incomeRelease` breakdown without defining a cross-month release rule, so the module inherits v1 verbatim: a month releasing income received earlier reports `receivedMinor: 0, releasedMinor: 80000, pendingMinor: -80000`. No new semantics were introduced; the assertion is a deep-equal against `projectMonthlyReport`, with the explicit values recorded as documentation of what v1 already returns.

## Work Unit 2 — Endpoint, contract, and reachable verification

Status: **complete**, tasks 5-8 checked in `tasks.md`. Parent-owned post-apply gates untouched.
Authorized scope: `apps/api/src/server.ts`, `apps/api/src/app.ts`, `apps/api/openapi.yaml`, `apps/api/test/multi-month-report-api.test.ts` (new), `apps/api/test/monthly-report-api.test.ts`, `apps/api/test/openapi.test.ts`, `tasks.md`, `apply-progress.md`.
Work Unit 1 was reused verbatim: `projectMultiMonthReport`, `monthsInRange`, `monthRangeLength`, `MULTI_MONTH_POLICY_ID`. `apps/api/src/reports/multi-month-report.ts`, `monthly-report.ts`, `report-service.ts`, `planning/engine.ts`, and `persistence/financial-store.ts` are unmodified; nothing under `apps/web/` was touched.

### The parser's mode-discrimination contract

`parseMonthlyReportQuery(url)` changed from `(url) => string` to `(url) => MonthlyReportQuery`, where `MonthlyReportQuery = { mode: 'month'; month: string } | { mode: 'range'; from: string; to: string }`. It is the only place the mode is decided, and it runs before the route dispatches to any app method, so every mode violation is rejected before any data is read. `grep` confirmed no other caller of `parseMonthlyReportQuery` existed.

| Input | Result |
| --- | --- |
| `month=YYYY-MM` alone | `{ mode: 'month', month }` |
| `from=YYYY-MM` and `to=YYYY-MM` together | `{ mode: 'range', from, to }`, after the Work Unit 1 helper validates malformed, inverted, and over-long ranges |
| `month` combined with `from` or with `to` | `ApiError('VALIDATION_ERROR')` |
| only one of `from`/`to` | `ApiError('VALIDATION_ERROR')` |
| neither mode selected | `ApiError('VALIDATION_ERROR')` |
| unknown or repeated key, including `range`, `compare`, `trend`, `percentChange`, `delta`, `previousFrom`, `export` | `ApiError('VALIDATION_ERROR')` |
| malformed `YYYY-MM` in any of the three keys | `ApiError('VALIDATION_ERROR')` |

The response carries no mode discriminator: `month` mode returns the unchanged `report-policy/v1` projection, range mode the `report-policy/v2` series. The route dispatch does not change shape; it selects one of the two app methods from the parser's discriminated union.

### Exactly one state load per request: proof

`getMultiMonthReport` validates the range with `monthRangeLength` **before** any read, then performs exactly one `financialStore.load(user.id, budgetId)`, then `projectMultiMonthReport(state, from, to)` over that snapshot. There is no internal HTTP call to the single-month mode and no per-month load.

Four independent locks, all in `apps/api/test/multi-month-report-api.test.ts` and all passing:

1. **Counting store, HTTP level.** A `financialStore` seam that increments a counter returns `loads === 1` for a 24-month range request, `loads === 1` (unchanged) after a rejected 25-month request, and `loads === 2` after a subsequent single-month request — one load per request in both modes.
2. **Rejection before read.** The over-long request in lock 1 returns 400 while the load counter does not move, proving range rejection precedes the read.
3. **Revision-mixing probe.** A store that would return `version + loads` on every call still reports `loads === 1`, the series `version` equal to the first loaded revision, exactly one distinct `month.version` across the series, and real month values — so a per-month load would fail this test.
4. **App boundary.** Four helper violations (malformed `from`, malformed `to`, `from > to`, 25-month range) all reject with `ApiError('VALIDATION_ERROR')` carrying the helper's message, with `loads === 0`.

### Range-mode boundary locks

- Response key set locked to `['disclosure', 'months', 'policy', 'total', 'version']`.
- Period-total key set locked to `['categories', 'expenseMinor', 'incomeMinor', 'provisional', 'transfers', 'treatment']`, plus `'pendingMinor' in data.total === false` and a recursive key-path scan (`releaseKeyPaths`) that a `spendingMinor` key cannot false-pass. The same scan is asserted **non-empty** on `months`, proving the lock can detect the measure where v1 requires it.
- `disclosure` deep-equals `{ recomputedFromEffectiveHistory: true, categoryLabelsAreCurrent: true, durable: false }`.
- Every returned month deep-equals `projectMonthlyReport(state, month.month)` for the same revision, and each month's own `version` equals the series `version`.
- `total.incomeMinor`/`expenseMinor`/`transfers.totalMinor` are the sums of the covered months, and the transfer stays outside income, expense, and category spending.

### Superseded assertion (explicit record)

The previous change's single-month suite carried the query `month=2026-02&from=2026-01-01` in a rejection list, on the model that `from` was an unknown report parameter. That reason is now obsolete: `from` is a known parameter that selects range mode. It is **superseded, not deleted**:

- The query string is kept verbatim in `apps/api/test/monthly-report-api.test.ts`, re-labelled under the mode-exclusivity rule with an in-file comment naming the change and the old reason.
- The other queries in that list (`month=`, `month=2026-13`, `month=2026-2`, `month=2026-02&range=2025-12..2026-03`, `month=2026-02&month=2026-03`) and every other assertion in the file are unchanged; `from=2026-01` and `to=2026-02` (one-sided) and `''` (neither mode) were added to the same list.
- The old reason is replaced positively in the new suite: `from` + `to` together now returns 200 at both the parser and HTTP levels.
- Failure detail: `apps/api/test/multi-month-report-api.test.ts` and `apps/api/test/openapi.test.ts` assert the new mode rules; `apps/api/test/monthly-report-api.test.ts` still asserts 400 `VALIDATION_ERROR` for the superseded query, now for mode exclusivity.

### TDD evidence

| Phase | Command | Observed result |
| --- | --- | --- |
| RED (task 5) | `node --experimental-strip-types --test apps/api/test/multi-month-report-api.test.ts apps/api/test/openapi.test.ts apps/api/test/monthly-report-api.test.ts` | `# tests 21 / # pass 14 / # fail 6 / # skipped 1`. `not ok 10` parser: `actual: '2026-02'` vs `expected: { mode: 'month', month: '2026-02' }` (the old parser returned a bare string). `not ok 11` route: `400 !== 200` — a complete `from`/`to` pair was still rejected as an unknown parameter. `not ok 12` authz: `400 !== 200` for the same reason. `not ok 13`, `not ok 14` (key-set/load proofs, no range mode existed) and `not ok 20` (OpenAPI: missing `RangeFrom`, `RangeTo`) also failed. The 9 pre-existing single-month cases kept passing unchanged, including the supersede-adjacent ones. |
| GREEN (task 6) | same command, after the parser, `getMultiMonthReport`, and `openapi.yaml` edits | `# tests 21 / # pass 20 / # fail 0 / # skipped 1`. One of three repeats then failed on **my own** new leak assertion because `/\d{4}-\d{2}/` matched inside the hex request-id UUID; the assertion was narrowed to the error message and a `report-policy|months|total` scan, after which five consecutive runs reported `20 / 0 / 1`. A defect in the test, not in the implementation. |
| TRIANGULATE (task 7) | `node --experimental-strip-types --test apps/api/test/multi-month-report-api.test.ts` | `# tests 9 / # pass 8 / # fail 0 / # skipped 1` without `DATABASE_URL`, and `# tests 9 / # pass 9 / # fail 0 / # skipped 0` with it. Added the revision-mixing probe and the app-boundary helper-mapping test; the single-load, per-month identity, one-revision, byte-identical single-month, no-comparison/trend-parameter, and OpenAPI-resolution proofs were already in place. |
| REFACTOR (task 8) | same focused run, after narrowing the app-level catch | `# tests 9 / # pass 8 / # fail 0 / # skipped 1` (no `DATABASE_URL`) — no assertion changed, the contract is identical, and unexpected projection failures now stay 500 exactly as in single-month mode. |

### Changed files

| File | Lines | Change |
| --- | --- | --- |
| `apps/api/test/multi-month-report-api.test.ts` | 278 (new) | 9 focused `node:test` cases: parser union, all mode rules, authorization/non-disclosure, key-set + release-free-total lock, one-load and rejection-before-read, revision-mixing probe, helper-to-`VALIDATION_ERROR` mapping, single-month byte-identity, and the PostgreSQL-gated two-mode test |
| `apps/api/src/server.ts` | 25 added, 8 removed | `MonthlyReportQuery` union + mode-aware parser; dispatch selects `getMonthlyReport` or `getMultiMonthReport` |
| `apps/api/src/app.ts` | 17 added | `getMultiMonthReport` beside `getMonthlyReport`; range validated before the single load; helper errors mapped to `VALIDATION_ERROR` |
| `apps/api/openapi.yaml` | 29 added, 4 removed | Route description rewritten for two modes; `RangeFrom`/`RangeTo` parameters; `MonthlyReportSuccess` `oneOf` both envelopes; `MultiMonthReport`, `MultiMonthReportPolicy`, `MultiMonthReportTotal`, `MultiMonthReportDisclosure`, `MultiMonthReportEnvelope` schemas |
| `apps/api/test/openapi.test.ts` | 18 added | Focused check: exact path-parameter reference list, `RangeFrom`/`RangeTo` and the new schemas declared and referenced, and no `reports/months` sibling route |
| `apps/api/test/monthly-report-api.test.ts` | 8 added, 1 removed | Explicit supersede of the obsolete `from`-as-unknown case; no other assertion touched |
| `openspec/changes/add-multi-month-trends/tasks.md` | 4 changed lines | Rows 5-8 flipped to `[x]`; rows 1-4 and the parent-owned rows untouched |
| `openspec/changes/add-multi-month-trends/apply-progress.md` | this section appended | Work Unit 2 record |

Deliverable delta: **375 added lines** (97 insertions in 5 modified files plus the 278-line new test file), or **388 changed lines** counting the 13 removed lines. Under the ~400 budget, but with little margin; the estimate in `design.md` for this slice was 190-260, so the test volume is again the dominant overrun. No file outside the allowed edit surfaces changed; `git status --porcelain` shows only the tracked edits above plus the pre-existing untracked `multi-month-report.ts`, `multi-month-report.test.ts`, `openspec/changes/add-multi-month-trends/`, `.codegraph/`, and `.pi/`.

### Task 8 command results (exact)

| Command | Observed output |
| --- | --- |
| `npm test` (no `DATABASE_URL`) | `# tests 145 / # suites 0 / # pass 124 / # fail 0 / # cancelled 0 / # skipped 21 / # todo 0` |
| `DATABASE_URL='postgresql://ynab:ynab_local@localhost:5434/ynab_dev' npm test` | `# tests 145 / # suites 0 / # pass 141 / # fail 4 / # cancelled 0 / # skipped 0 / # todo 0`; `not ok 118`-`not ok 121` are the four pre-existing `simulation-postgres.test.ts` failures described below. All 21 database-gated tests ran: 17 passed (16 pre-existing plus this work unit's new gated test) and the 4 pre-existing simulation ones failed. |
| `DATABASE_URL='postgresql://ynab:ynab_local@localhost:5434/ynab_dev' npm run db:validate` | `The schema at apps\api\prisma\schema.prisma is valid 🚀` |
| `DATABASE_URL=... node --experimental-strip-types --test apps/api/test/multi-month-report-api.test.ts` | `# tests 9 / # pass 9 / # fail 0 / # skipped 0` — the gated test actually ran and passed |
| `npm run db:validate` (no `DATABASE_URL`) | `Error code: P1012 / error: Environment variable not found: DATABASE_URL. / Validation Error Count: 1` — Prisma requires the env var for static validation too; `apps/api/prisma/schema.prisma` is unmodified and the same command passes once the documented URL is supplied |

### Pre-existing, unrelated database-gated failures (not caused by this work unit)

`DATABASE_URL=... node --experimental-strip-types --test apps/api/test/simulation-postgres.test.ts` reports `# tests 5 / # pass 1 / # fail 4` on a file this work unit did not touch. The cause is that file's own cleanup ordering: `cleanup` deletes `SimulationCheckpoint` (line 37) before `SimulationAuditEntry` (line 39), while `apps/api/prisma/schema.prisma` declares `SimulationAuditEntry.checkpoint` with `onDelete: Restrict`, so Postgres raises `23503` (`update or delete on table "SimulationCheckpoint" violates foreign key constraint "SimulationAuditEntry_checkpoint_fkey"`). The throw comes from the test's `finally { await cleanup(budgetId, ownerId); }`, so the test bodies themselves complete. Evidence that this work unit is not on the failing path: `simulation-postgres.test.ts` never uses `BudgetApp`, `createServer`, or any `reports/monthly` route (`grep` returns nothing), `git status` shows `simulation-postgres.test.ts`, `simulation-store.ts`, and `schema.prisma` untouched, and Work Unit 1's record shows the earlier baseline never ran these tests with `DATABASE_URL` either (20 skips). The one-line fix would be to move the `SimulationAuditEntry` delete above the `SimulationCheckpoint` delete, but that file belongs to the simulation feature and is outside this work unit's scope, so it was reported rather than changed.

### Deviations and ambiguities

1. **Pre-existing simulation cleanup failures.** Requires a human decision: authorize the unrelated two-line cleanup-order fix so the gated run is fully green, or accept and track it separately. Reported, not silently fixed.
2. **`Month` keeps `required: true` on the extended path.** The instruction requires keeping the `Month` shared-parameter reference (the coverage test asserts it is present), but `month` is forbidden in range mode, so the shared parameter's `required: true` cannot be literally accurate for both modes. Resolved by keeping the reference untouched (as instructed) and stating the exclusivity in the operation description and in `RangeFrom`/`RangeTo`. OpenAPI 3.0 ignores `$ref` siblings, so a note could not be attached to the reference itself.
3. **Parser signature change.** `parseMonthlyReportQuery` now returns a union instead of `string`. Verified safe by grep: its only caller was the report route dispatch.
4. **Range validation at two layers.** The parser validates the range (earliest possible rejection, keeps parameter errors in the parser where `month` errors already lived) and `getMultiMonthReport` validates again before its load (holds the invariant for direct callers and is where the Work Unit 1 helper errors are mapped to `ApiError('VALIDATION_ERROR')`, mirroring `parseHistoryCursor`). Both layers produce the identical message from the helper; no semantics were invented.
5. **App-level catch narrowed.** The first GREEN version mapped *any* non-persistence error to `VALIDATION_ERROR`, which would have turned an unexpected malformed-state failure into a 400 while single-month mode returns 500. The catch now maps only the explicit pre-load range validation and otherwise rethrows, so an unexpected internal failure keeps 500 in both modes.
6. **No machine typecheck for the API.** The repository has no API typecheck script (`typecheck:web` covers `apps/web` only) and only the four Task 8 commands were authorized, so the new parser, app method, and test types were verified by the root `strict` tsconfig by construction and by runtime tests, not by `tsc`. Residual risk noted for review.
7. **Response shape in the contract.** Range mode and single-month mode share the `200` status, so `MonthlyReportSuccess` was changed to `oneOf` of `MonthlyReportEnvelope` and `MultiMonthReportEnvelope`; the route block itself is unchanged apart from the added parameters, and no `reports/months` sibling route was created (asserted by the new OpenAPI test).

## Work Unit 2 — Independent-verifier hardening

The owner authorized exactly two test-only additions reported by the independent verifier. No production file, web file, or simulation file was changed by this hardening.

1. **Gap 1 — unexpected failures must not become 400s:** added `unexpected range load failures remain INTERNAL_ERROR instead of validation errors`. It injects a `financialStore.load` that throws a plain `Error` for a valid range request and asserts HTTP `500`, `INTERNAL_ERROR`, and explicitly not `400`/`VALIDATION_ERROR`.
2. **Gap 2 — triple combination:** added the exact query `month=2026-02&from=2025-12&to=2026-02` to `INVALID_MODES`, covering the parser's existing month-plus-range rejection branch without changing production behavior.

### Hardening validation

| Command | Exact observed result |
| --- | --- |
| `node --experimental-strip-types --test apps/api/test/multi-month-report-api.test.ts` | `1..10`, `# tests 10`, `# suites 0`, `# pass 9`, `# fail 0`, `# cancelled 0`, `# skipped 1`, `# todo 0`, `# duration_ms 2529.9606` |
| `DATABASE_URL='postgresql://ynab:ynab_local@localhost:5434/ynab_dev' node --experimental-strip-types --test apps/api/test/multi-month-report-api.test.ts` | `1..10`, `# tests 10`, `# suites 0`, `# pass 10`, `# fail 0`, `# cancelled 0`, `# skipped 0`, `# todo 0`, `# duration_ms 2840.1667` |
| `npm test` | `1..146`, `# tests 146`, `# suites 0`, `# pass 125`, `# fail 0`, `# cancelled 0`, `# skipped 21`, `# todo 0`, `# duration_ms 11636.628` |

The existing genuine-validation assertion still passes alongside the new 500 assertion: focused output includes `ok 2 - the extended route rejects every non-mode parameter shape and accepts exactly the two modes` and `ok 6 - unexpected range load failures remain INTERNAL_ERROR instead of validation errors`.

### Exact hardening diff

```diff
+  'month=2026-02&from=2025-12&to=2026-02',
+
+test('unexpected range load failures remain INTERNAL_ERROR instead of validation errors', async () => {
+  const { app, token, budget } = prepare();
+  (app as any).financialStore = { load: async () => { throw new Error('unexpected report load failure'); } };
+
+  const response = await monthlyReport(app, token, budget.id, 'from=2025-12&to=2026-02');
+  assert.equal(response.status, 500);
+  assert.notEqual(response.status, 400, 'unexpected failures must not become validation responses');
+  const body = await response.json() as any;
+  assert.equal(body.error.code, 'INTERNAL_ERROR');
+  assert.notEqual(body.error.code, 'VALIDATION_ERROR', 'unexpected failures must not become validation errors');
+});
```

### Updated Work Unit 2 line total

The previous Work Unit 2 total was 388 changed lines. These additions are exactly 12 lines (11-line test including its blank line plus 1 invalid query line), with no removals. The new exact Work Unit 2 total is **400 changed lines**. The owner explicitly accepted the budget exception/threshold crossing for these two verifier-requested tests.
