# Apply Progress: Multi-Month Report Surface

## Work Unit 1 — Range contract, state, and request shape

### Delegation deviation (recorded, not hidden)

Work Unit 1 was implemented **inline by the parent orchestrator**, not by a delegated writer. The `gentle-ai-worker` subagent was launched three consecutive times for this exact task and failed each time without writing anything: twice returning no result at all and once timing out after stalling at startup. The repository was verified untouched after each failure before proceeding. This is a routing deviation from the multi-file write rule, taken because the delegation harness was unavailable, and it is recorded here so the review can account for it.

### Delegated status not available

No independent verifier ran against this work unit yet. The parent ran the suites and reviewed the diff directly. Independent verification remains a parent-owned gate below.

### Completed tasks and persisted checkbox updates

- Task 1 — RED: added `apps/web/test/reports-range.test.ts` covering the range guards, the separate range state, the request shape, and the unchanged single-month request.
- Task 2 — GREEN: added the range types and pure guards to `apps/web/app/models.ts` and the separate range state plus `readReportRange` to `apps/web/app/hooks/useBudgetApp.ts`.
- Task 3 — TRIANGULATE: covered a single-month range, a range across a year boundary, the 24-month boundary and one month past it, an inverted range, an over-long range, a malformed month, stale success and stale failure rejection, and proof that the single-month state and request are unaffected.
- Task 4 — REFACTOR: `npm run test:web` and `npm run typecheck:web` both clean.

### TDD Cycle Evidence

| Task | Test file(s) | Layer | Safety net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| 1 | `apps/web/test/reports-range.test.ts` | Pure function plus Node source contract | `npm run test:web` 38 passed before edits | Observed: with the two source files restored to `HEAD`, the new suite failed (`# tests 1 / # pass 0 / # fail 1`, exit code 1, `ERR_TEST_FAILURE`) because the guards it imports did not exist at `HEAD` | After restoring the implementation: `# tests 9 / # pass 9 / # fail 0` | 9 cases including year-boundary length, the 24/25 boundary, and validation-before-request ordering | Focused suite green; full suite green |
| 2 | Same | Same | RED evidence above | Covered by the same RED run | Same as above | — | — |
| 3 | Same | Same | Focused suite green | Added cases first, two of which failed and exposed wrong expectations in the test itself (see below) | 9 passed | Asserted one call per mode and no other report endpoint | — |
| 4 | Same plus the full web suite | Same | 47 passed before final run | — | `npm run test:web`: 47 passed, 0 failed; `npm run typecheck:web`: clean | Retained | — |

The RED demonstration was produced honestly rather than claimed: the two edited source files were copied outside the repository, restored to `HEAD`, the new suite was run to observe the failure, and the implementation was then restored, with the pre-copy and post-restore MD5 sums verified identical.

A correction: an earlier draft of this record attributed `ERR_MODULE_NOT_FOUND` to that RED run. That detail was carried over from an unrelated earlier note and was **not** observed in this run. The observed result was the counts, exit code, and failure type recorded above. An independent verifier flagged the discrepancy, and the record is corrected rather than left standing.

### Two of the parent's own expectations were wrong

Both failures in the first GREEN run were defects in the new test file, not in the implementation, and both were corrected so that the asserted property is preserved or strengthened:

- The range label renders an invalid month **verbatim** rather than substituting a placeholder. The assertion was changed from expecting `sin inicio` to asserting the raw invalid value appears and is not dressed as a month name, which is the honest behaviour and a clearer property.
- The request-template assertion did not account for the closing backtick of the template literal. It now asserts the exact template including its terminator, plus that exactly one separator exists, so only `from` and `to` are sent.

### Superseded pre-existing assertion

`apps/web/test/reports.test.ts` asserted that the client reaches `reports/monthly` exactly once. The route now serves two modes, so that assertion became false. It was replaced by an assertion of exactly two call sites on the same route — one `?month=` and one `?from=` — plus a new assertion that no other report endpoint is called. No assertion was removed or relaxed; the test now proves a stricter property under a renamed title.

### Files changed in Work Unit 1

| File | Added | Deleted |
| --- | --- | --- |
| `apps/web/app/models.ts` | 65 | 0 |
| `apps/web/app/hooks/useBudgetApp.ts` | 38 | 4 |
| `apps/web/test/reports-range.test.ts` (new, 134 lines) | 134 | 0 |
| `apps/web/test/reports.test.ts` | 6 | 2 |
| **Total** | **243** | **6** |

249 changed lines against the Work Unit 1 forecast of 200-260 and the 400-line budget, after the verification hardening. Bookkeeping files are excluded.

### Verification and workload evidence

- `node --experimental-strip-types --test apps/web/test/reports-range.test.ts` → 9 passed, 0 failed.
- `npm run test:web` → 47 passed, 0 failed.
- `npm run typecheck:web` → clean, no diagnostics.
- `npm test` (repository root, no `DATABASE_URL`) → 125 passed, 0 failed, 22 skipped.
- `apps/web/tsconfig.tsbuildinfo` was rewritten by typecheck and restored to its committed bytes; `git status` no longer lists it.

### Contract delivered

- `REPORT_RANGE_MAX_MONTHS = 24`, mirroring the API maximum.
- `reportRangeLength(from, to)` is a pure measurement returning `null` for a malformed or inverted range; the maximum is enforced by `isReportRange`, which keeps the "measurement" name honest.
- `reportRangeError(from, to)` returns the specific user-facing reason, so the reader and the surface share one source of truth for the message.
- `reportRangeLabel(from, to)` labels a valid range and never dresses an invalid month as a month name.
- `MultiMonthReport` mirrors the frozen response exactly, and `MultiMonthReportTotal` deliberately declares no pending-release field.
- `readReportRange(from, to)` validates before requesting, sends exactly `from` and `to`, keeps its own request-generation guard, ignores stale success and stale failure, and is invalidated on sign-out. The range state is separate from the single-month state.

## Independent verification and hardening

An independent read-only verification of Work Unit 1 returned **no blockers** and four real follow-ups, all of which were closed except where noted.

| Finding | Resolution |
| --- | --- |
| The client policy types were widened to `string` where the frozen API response uses literal policy ids. | Tightened to `id: 'report-policy/v2'` and `monthBasis: 'report-policy/v1'`, and a new assertion locks both literals. |
| A switch between report modes did not invalidate the other mode's in-flight request, which task 3 explicitly required. | `readMonthlyReport` now invalidates an in-flight range read and `readReportRange` invalidates an in-flight single-month read, both asserted per reader block. |
| The stale-response assertions counted occurrences globally, so duplicating both strings in one path would still pass. | The assertions are now scoped to the extracted range reader and the extracted single-month reader. |
| The validation-before-request assertion compared string indices, so removing the early `return` would still pass. | The assertion now requires `setReportRange(invalid); return invalid;` in sequence. This was proven load-bearing by mutation: deleting `return invalid;` made the test fail (`9 tests, 8 passed, 1 failed`); restoring it returned to 9 passed. |
| Full behavioural testing of the hook is not possible in this repository, because no component or DOM renderer is installed. | Recorded as a limit, not worked around. The assertions are source-contract and pure-function only. Real browser coverage is a Work Unit 2 requirement. |

## Independent verification of Work Unit 2 and its resolutions

An independent read-only verification returned **no blockers** and four findings. Two were resolved here, two are recorded as follow-ups.

### Resolved: the chart invited a comparison and displayed no value

The chart rendered each bar at `value / maximum * 100` width against a shared global maximum, so it communicated only a relative proportion, and its bars carried no value at all. That is the closest this surface came to the comparative presentation the canonical requirements forbid.

Resolution: each chart measure now renders its **raw value** as visible text, the chart's accessible name states that no differences or percentages are calculated, and the treatment line says the same. The CSS measure row gained a column for the value.

### Resolved: chart and table equivalence was unproven

The browser suite asserted only that the chart was visible, which an empty or wrongly populated chart would also satisfy. The suite now reads all six chart values for the three-month range and asserts each one equals the corresponding summary-table value, so the chart and the table are proven to carry the same measures.

### Corrected claim: the browser suite is NOT reliably green

An earlier draft of this record claimed all ten browser tests passed. That claim was produced by a single run and is superseded. The pre-existing account-detail journey `a native link opens the routed history with the server-derived balance and a single transfer row` is intermittently failing, and every observed failure is that same test.

| Run | Source | Result for that test |
| --- | --- | --- |
| 1 | writer | passed |
| 2 | independent verifier | **failed**: after clicking a link whose `href` was correct, the browser stayed at `/accounts` |
| 3 | parent, full suite | passed (10/10) |
| 4 | parent, full suite after the chart change | **failed** (9 passed, 1 failed) |
| 5 | parent, that test alone | passed in 13.0s |
| 6 | parent, full suite | passed (10/10) |
| 7 | parent, full suite | passed (10/10) |

Characterisation: the test passes in isolation and passes in roughly five of seven full-suite runs. It is therefore a timing or load-sensitive failure rather than a deterministic defect of the account-detail surface, whose page and route are unchanged by this work unit. Two candidate causes remain undistinguished: a pre-existing hydration or navigation race in that journey, or added load from the new browser test, which seeds a three-month range and a twenty-four-month range earlier in the same sequentially-run suite. Root-causing it needs the Playwright trace from a failing run, which was not captured.

This is recorded as an open follow-up, NOT as a green result. The product behaviour of Work Unit 2 is verified; the reliability of one pre-existing browser journey is not.

### Follow-ups left open by the verifier

- No browser assertion covers a range in which **every** month is empty, the loading live-region announcement, or the retry action after an API failure.
- The per-month collapsible content is asserted by heading and treatment labels, not by every rendered value, table caption, or `scope` attribute.
- The forbidden-control scan looks at interactive elements, so a non-interactive element carrying a derived percentage or delta would evade it. No such element exists today, and the chart now states that no percentages or differences are calculated.

## Final Work Unit 2 line totals

| Area | Added | Deleted |
| --- | --- | --- |
| `apps/web/app/reports/trends/page.tsx` (new, 164 lines) | 164 | 0 |
| `apps/web/e2e/reports-account-detail.spec.ts` | 147 | 0 |
| `apps/web/app/globals.css` | 33 | 4 |
| `apps/web/test/reports.test.ts` | 20 | 1 |
| `apps/web/app/components/shell/AppShell.tsx` | 4 | 2 |
| **Total** | **368** | **7** |

375 changed lines against the 400-line budget. OpenSpec bookkeeping is excluded and reported separately by the writer.

## Work Unit 2 — Rendered surface, chart, navigation, and browser coverage

### Task outcomes

- Task 5 — RED: added source-contract assertions for the route, controls, disclosures, policies, chart/table, and absence of period pending-release data; added a seeded Playwright journey before implementing the route. The pre-implementation `npm run test:web` run observed 45 passing and 3 failing assertions for the missing navigation entry, missing route, and still-fixed five-column mobile grid.
- Task 6 — GREEN: implemented `/reports/trends`, its month-by-month treatment, accessible summary table, response-measure chart, flow-only total, navigation entry, and adaptive mobile navigation.
- Task 7 — TRIANGULATE: browser coverage seeds August and October 2026 activity with September empty; checks all six compact navigation entries at 320px in one row, the disclosures, policy identifiers, revision, row measures, flow total, keyboard expansion, 24-month navigation, inverted and overlong rejection with no stale result, API failure clearing, and absence of forbidden controls/period pending-release figures.
- Task 8 — REFACTOR: final web tests, typecheck, build, and the full database-backed Chromium suite all passed. The browser suite ran all ten tests with no skips.

### TDD evidence

| Task | RED | GREEN | TRIANGULATE / REFACTOR |
|---|---|---|---|
| 5 | Before implementation, `npm run test:web`: 45 passed, 3 failed. Failures were the absent `/reports/trends` navigation entry, absent route, and the old fixed-five-column CSS assertion. | After the surface landed, `npm run test:web`: 48 passed, 0 failed. | The real browser test was added before implementation; its first execution exposed a table locator/caption-name mismatch, corrected by naming the caption “Resumen mensual…”. |
| 6 | Covered by the same pre-implementation RED run. | Route, range controls, disclosures, chart/table, details, total panel, navigation, and styles implemented. | `npm run typecheck:web` and `npm run build:web` clean; final browser suite passed all ten tests. |
| 7 | — | — | Seeded three-month and 24-month ranges, empty month, keyboard disclosure, inverted/overlong inputs, mocked API failure, rendered control exclusions, and 320px one-row navigation all passed in Chromium. |
| 8 | — | — | Final exact validation sequence passed: web tests (48), typecheck, production build, and all ten browser tests. |

### Files and changed-line counts

Counts below are added/deleted lines relative to Work Unit 1 commit `537242a`. The implementation/test budget excludes the requested OpenSpec bookkeeping files, as in Work Unit 1.

| File | Added | Deleted |
|---|---:|---:|
| `apps/web/app/reports/trends/page.tsx` (new) | 164 | 0 |
| `apps/web/app/components/shell/AppShell.tsx` | 4 | 2 |
| `apps/web/app/globals.css` | 32 | 4 |
| `apps/web/test/reports.test.ts` | 20 | 1 |
| `apps/web/e2e/reports-account-detail.spec.ts` | 138 | 0 |
| **Implementation and test total** | **358** | **7** |
| `openspec/changes/add-multi-month-report-surface/tasks.md` | 4 | 4 |
| `openspec/changes/add-multi-month-report-surface/apply-progress.md` | 458 | 0 |
| **Bookkeeping total** | **462** | **4** |

Implementation/tests: **365 changed lines** (358 additions + 7 deletions), within the 400-line budget. Including required task/progress bookkeeping, the full transaction is **831 changed lines** (820 additions + 11 deletions); the larger raw count is dominated by the mandated exact command transcripts in `apply-progress.md`. The 400-line work-unit estimate is for implementation/tests, excluding bookkeeping as in Work Unit 1. No API, OpenAPI, existing single-month page, model, or hook files were changed.

### Approved treatment visibility

- The start and end are native month inputs, both labelled and described by a hint that explicitly says the selected endpoints are included. `readReportRange` validates the range before requesting; the page keys state to the current `{from,to}`, so changing a control immediately hides an old result. Invalid/inverted/overlong ranges and API failures show an alert and render no chart, summary rows, month details, or total panel.
- Prose directly below the controls says the series is recalculated from effective history and an ordinary edit or delete can change a previously shown month; category names are current budget labels, not historical labels; and the series is not durable. It also explicitly says months are presented side by side and this page does not analyse a trend.
- A successful response visibly supplies `report-policy/v2`, the monthly basis `report-policy/v1`, the returned inclusive range, and the revision.
- Each month has one ascending-order summary row with month row-header, income, expense, provisional count, and transfer subtotal. A month with zero income, zero expense, and no transfer items is labelled “Sin actividad registrada” and still has a full zero-valued detail.
- Each month’s `<details>` contains separate income/expense measures, its captioned category table (including archived/current labels), transfers and their outside-totals subtotal, provisional count and subtotals, and that month’s received/released/pending-release breakdown.
- The final period panel follows all month details, names itself “solo medidas de flujo,” and shows income, expense, category spending, provisional count and subtotals, plus a transfers subtotal explicitly outside the flow total. It accesses no period pending-release field; no such period figure is computed or displayed.
- Loading uses `role="status" aria-live="polite"`; errors use `role="alert"`. Tables have captions and scoped row/column headers, measures use `<dl>/<dt>/<dd>`, sections use `aria-labelledby`, wide tables scroll horizontally, and empty/archived states use text as well as styling.

### Chart, responsive navigation, and ambiguity resolutions

- The dependency-free chart maps only each response month’s income and expense to bar widths; it displays no derived numeric label, comparison, delta, percentage, change annotation, or trendline. Its `role="img"` has an accessible name. The adjacent captioned summary table contains the exact income/expense values plotted and also the other required monthly measures, so it is an equivalent and more complete accessible representation.
- Mobile navigation uses `repeat(auto-fit, minmax(min(44px, calc((100vw - 16px) / 6)), 1fr))`, allowing all six links to fit one row at compact widths; the mobile frame bottom padding is 84px. Browser coverage actually verified every link in the viewport and all six on one row at **320×820**, then opened the report link by keyboard.
- The task phrase about RouteGate placement conflicts with the existing `/reports` source order. I retained the existing convention (`RouteGate` wrapping `AppShell`) so the shell is not rendered for guest/setup states. The default range is the current month at both endpoints, matching `/reports` rather than inventing a multi-month preset. UI prose stays Spanish to match the existing report surface. The chart’s response-relative bar sizing is only a visual encoding; no derived value is surfaced.
- The pre-existing CSS source assertion expected exactly five mobile columns, which became false when adding the sixth route. Its exact replacement was:

  ```diff
  - assert.match(styles, /@media \(max-width: 980px\) \{[\s\S]*?\.mobile-nav \{[\s\S]*?repeat\(5, 1fr\)/);
  + assert.match(styles, /@media \(max-width: 980px\) \{[\s\S]*?\.mobile-nav \{[\s\S]*?repeat\(auto-fit, minmax\(/);
  ```

  The browser check strengthens this with six visible links in one row at 320px. No assertion was deleted.
- Earlier full Playwright attempts exposed a caption-name mismatch in the new test, intermittent failures of the existing account-link navigation wait, and one transient registration redirect timeout. Those attempts were not concealed: the caption was clarified, and the existing account journey now waits for network idle before clicking and asserts the link’s exact `href`. Its pre-existing URL assertion—including its predicate and default timeout—remains unchanged; exact diff:

  ```diff
  + await page.waitForLoadState('networkidle');
  + await expect(accountLink).toHaveAttribute('href', `/accounts/${seed.principalId}`);
    await accountLink.click();
    await expect(page).toHaveURL(new RegExp(`/accounts/${seed.principalId}$`));
  ```

  The focused journey then passed, and the final full browser execution passed all ten journeys. No pre-existing browser assertion was weakened or removed.
- The first typecheck found the missing `reportRangeLabel` import; it was added, and subsequent typecheck/build passed. CodeGraph exploration timed out, so I fell back to the specifically requested files and scoped route/shell/style inspection. No API or single-month implementation changes were made.

### Build-artifact restoration

`npm run typecheck:web`/`npm run build:web` rewrote tracked `apps/web/tsconfig.tsbuildinfo`. After the final browser run it was restored from `HEAD`; working and committed hashes both equal `612855aa83b7ec6abdc9b185327763b867856ba9`. `git status --porcelain apps/web/` listed only the intended source/test files and new route; it did not list `tsconfig.tsbuildinfo`.

### Exact final validation output

#### `npm run test:web`

```text
> test:web
> node --experimental-strip-types --test apps/web/test/*.test.ts

TAP version 13
# Subtest: account history appends the requested cursor page without losing prior rows
ok 1 - account history appends the requested cursor page without losing prior rows
  ---
  duration_ms: 1.5343
  type: 'test'
  ...
# Subtest: account history rejects pages for a changed account, cursor, or history version
ok 2 - account history rejects pages for a changed account, cursor, or history version
  ---
  duration_ms: 0.1837
  type: 'test'
  ...
# Subtest: account history accepts only the active request for its selected account and cursor
ok 3 - account history accepts only the active request for its selected account and cursor
  ---
  duration_ms: 0.1245
  type: 'test'
  ...
# Subtest: a repeated transfer identity remains a single visible account activity item
ok 4 - a repeated transfer identity remains a single visible account activity item
  ---
  duration_ms: 0.2227
  type: 'test'
  ...
# Subtest: append failure keeps loaded rows and cursor for retry or stale-history restart
ok 5 - append failure keeps loaded rows and cursor for retry or stale-history restart
  ---
  duration_ms: 0.1769
  type: 'test'
  ...
# Subtest: converts decimal UI amounts to exact minor units
ok 6 - converts decimal UI amounts to exact minor units
  ---
  duration_ms: 2.1133
  type: 'test'
  ...
# Subtest: rejects ambiguous or unsafe money inputs
ok 7 - rejects ambiguous or unsafe money inputs
  ---
  duration_ms: 0.679
  type: 'test'
  ...
# Subtest: formats minor units as a user-facing decimal amount
ok 8 - formats minor units as a user-facing decimal amount
  ---
  duration_ms: 22.7503
  type: 'test'
  ...
# Subtest: navigation is route-based and centered on the core user tasks
ok 9 - navigation is route-based and centered on the core user tasks
  ---
  duration_ms: 1.4507
  type: 'test'
  ...
# Subtest: registration signs in and proceeds directly to setup
ok 10 - registration signs in and proceeds directly to setup
  ---
  duration_ms: 0.3761
  type: 'test'
  ...
# Subtest: onboarding presents account, categories, and review as focused states
ok 11 - onboarding presents account, categories, and review as focused states
  ---
  duration_ms: 0.1744
  type: 'test'
  ...
# Subtest: normal UI uses decimal money while API remains minor-unit authoritative
ok 12 - normal UI uses decimal money while API remains minor-unit authoritative
  ---
  duration_ms: 0.3196
  type: 'test'
  ...
# Subtest: budget works directly on categories instead of three parallel planning forms
ok 13 - budget works directly on categories instead of three parallel planning forms
  ---
  duration_ms: 0.3402
  type: 'test'
  ...
# Subtest: transactions combine creation and history with advanced filters hidden behind intent
ok 14 - transactions combine creation and history with advanced filters hidden behind intent
  ---
  duration_ms: 0.1765
  type: 'test'
  ...
# Subtest: pending income is derived from persisted effective history
ok 15 - pending income is derived from persisted effective history
  ---
  duration_ms: 0.2149
  type: 'test'
  ...
# Subtest: CSV is kept in settings and server authority remains intact
ok 16 - CSV is kept in settings and server authority remains intact
  ---
  duration_ms: 0.177
  type: 'test'
  ...
# Subtest: development web runtime proxies same-origin API calls
ok 17 - development web runtime proxies same-origin API calls
  ---
  duration_ms: 0.4033
  type: 'test'
  ...
# Subtest: browser never becomes the financial authority
ok 18 - browser never becomes the financial authority
  ---
  duration_ms: 0.5994
  type: 'test'
  ...
# Subtest: active and archived accounts link to directly addressable account activity
ok 19 - active and archived accounts link to directly addressable account activity
  ---
  duration_ms: 0.3037
  type: 'test'
  ...
# Subtest: account activity keeps the server balance and renders bounded history states
ok 20 - account activity keeps the server balance and renders bounded history states
  ---
  duration_ms: 0.1749
  type: 'test'
  ...
# Subtest: account activity presents each transfer with both endpoints and no unsupported actions
ok 21 - account activity presents each transfer with both endpoints and no unsupported actions
  ---
  duration_ms: 0.1031
  type: 'test'
  ...
# Subtest: account activity layout collapses at the designed mobile breakpoint
ok 22 - account activity layout collapses at the designed mobile breakpoint
  ---
  duration_ms: 1.6939
  type: 'test'
  ...
# Subtest: a range is accepted only when both months are well formed, ordered, and within the maximum
ok 23 - a range is accepted only when both months are well formed, ordered, and within the maximum
  ---
  duration_ms: 1.7883
  type: 'test'
  ...
# Subtest: the inclusive length counts every month including across a year boundary
ok 24 - the inclusive length counts every month including across a year boundary
  ---
  duration_ms: 0.3489
  type: 'test'
  ...
# Subtest: the maximum is exactly twenty-four months and one month past it is rejected, never shortened
ok 25 - the maximum is exactly twenty-four months and one month past it is rejected, never shortened
  ---
  duration_ms: 0.2236
  type: 'test'
  ...
# Subtest: a range is labelled for the reader and never dresses an invalid month as one
ok 26 - a range is labelled for the reader and never dresses an invalid month as one
  ---
  duration_ms: 0.2766
  type: 'test'
  ...
# Subtest: the range contract exposes no period pending-release figure
ok 27 - the range contract exposes no period pending-release figure
  ---
  duration_ms: 0.4378
  type: 'test'
  ...
# Subtest: the range reader requests exactly from and to and nothing else
ok 28 - the range reader requests exactly from and to and nothing else
  ---
  duration_ms: 0.3795
  type: 'test'
  ...
# Subtest: an invalid or over-long range is rejected before any request is issued
ok 29 - an invalid or over-long range is rejected before any request is issued
  ---
  duration_ms: 0.4892
  type: 'test'
  ...
# Subtest: the range state is separate from the single-month state, keeps its own request guard, and each mode invalidates the other
ok 30 - the range state is separate from the single-month state, keeps its own request guard, and each mode invalidates the other
  ---
  duration_ms: 0.2913
  type: 'test'
  ...
# Subtest: the single-month reader and its request remain unchanged
ok 31 - the single-month reader and its request remain unchanged
  ---
  duration_ms: 0.4944
  type: 'test'
  ...
# Subtest: report months accept only a single YYYY-MM period and are labelled for the reader
ok 32 - report months accept only a single YYYY-MM period and are labelled for the reader
  ---
  duration_ms: 1.4398
  type: 'test'
  ...
# Subtest: the unresolved-policy projection is distinguishable from a monthly report
ok 33 - the unresolved-policy projection is distinguishable from a monthly report
  ---
  duration_ms: 0.2006
  type: 'test'
  ...
# Subtest: the report surface is discoverable from the primary navigation
ok 34 - the report surface is discoverable from the primary navigation
  ---
  duration_ms: 0.2552
  type: 'test'
  ...
# Subtest: the multi-month route presents months without derived totals or trend controls
ok 35 - the multi-month route presents months without derived totals or trend controls
  ---
  duration_ms: 0.3205
  type: 'test'
  ...
# Subtest: the report page works on exactly one selected YYYY-MM period
ok 36 - the report page works on exactly one selected YYYY-MM period
  ---
  duration_ms: 0.1916
  type: 'test'
  ...
# Subtest: category spending is a captioned table with column and row headers
ok 37 - category spending is a captioned table with column and row headers
  ---
  duration_ms: 0.9738
  type: 'test'
  ...
# Subtest: income and expense stay separate, labelled measures
ok 38 - income and expense stay separate, labelled measures
  ---
  duration_ms: 0.2229
  type: 'test'
  ...
# Subtest: transfers are listed once each with both accounts, date, amount, and an outside-totals subtotal
ok 39 - transfers are listed once each with both accounts, date, amount, and an outside-totals subtotal
  ---
  duration_ms: 0.19
  type: 'test'
  ...
# Subtest: provisional records and pending-release income are visible and labelled
ok 40 - provisional records and pending-release income are visible and labelled
  ---
  duration_ms: 0.4387
  type: 'test'
  ...
# Subtest: no comparison, trend, export, or later-roadmap control exists on the report surface
ok 41 - no comparison, trend, export, or later-roadmap control exists on the report surface
  ---
  duration_ms: 0.6256
  type: 'test'
  ...
# Subtest: loading, API failure, empty month, and unresolved policy are distinct states
ok 42 - loading, API failure, empty month, and unresolved policy are distinct states
  ---
  duration_ms: 0.3243
  type: 'test'
  ...
# Subtest: the report surface is keyboard reachable and announced to assistive technology
ok 43 - the report surface is keyboard reachable and announced to assistive technology
  ---
  duration_ms: 0.123
  type: 'test'
  ...
# Subtest: the web client consumes only the approved report route, in its single-month and range modes
ok 44 - the web client consumes only the approved report route, in its single-month and range modes
  ---
  duration_ms: 0.2044
  type: 'test'
  ...
# Subtest: the report surface reflows to a single column and scrolls its tables on narrow screens
ok 45 - the report surface reflows to a single column and scrolls its tables on narrow screens
  ---
  duration_ms: 0.415
  type: 'test'
  ...
# Subtest: every approved section renders together for a monthly report, so nothing is silently omitted
ok 46 - every approved section renders together for a monthly report, so nothing is silently omitted
  ---
  duration_ms: 0.297
  type: 'test'
  ...
# Subtest: the unresolved-policy state is separate from every totals path and can show no numbers
ok 47 - the unresolved-policy state is separate from every totals path and can show no numbers
  ---
  duration_ms: 0.1835
  type: 'test'
  ...
# Subtest: the single-month request cannot carry a second period or a comparison window
ok 48 - the single-month request cannot carry a second period or a comparison window
  ---
  duration_ms: 0.2382
  type: 'test'
  ...
1..48
# tests 48
# suites 0
# pass 48
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 257.9334
```

#### `npm run typecheck:web`

```text
> typecheck:web
> tsc -p apps/web/tsconfig.json --noEmit
```

#### `npm run build:web`

```text
> build:web
> next build apps/web

   ▲ Next.js 15.5.25

   Creating an optimized production build ...
 ✓ Compiled successfully in 3.3s
   Linting and checking validity of types ...
   Collecting page data ...
   Generating static pages (0/13) ...
   Generating static pages (3/13) 
   Generating static pages (6/13) 
   Generating static pages (9/13) 
 ✓ Generating static pages (13/13)
   Finalizing page optimization ...
   Collecting build traces ...

Route (app)                                 Size  First Load JS
┌ ○ /                                      496 B         108 kB
├ ○ /_not-found                            986 B         104 kB
├ ○ /accounts                            3.23 kB         114 kB
├ ƒ /accounts/[accountId]                3.13 kB         114 kB
├ ○ /budget                              3.83 kB         115 kB
├ ○ /login                               1.43 kB         112 kB
├ ○ /register                             1.4 kB         112 kB
├ ○ /reports                             3.66 kB         114 kB
├ ○ /reports/trends                      4.45 kB         115 kB
├ ○ /settings/data                       2.26 kB         113 kB
├ ○ /setup                               2.85 kB         110 kB
└ ○ /transactions                        4.81 kB         115 kB
+ First Load JS shared by all             103 kB
  ├ chunks/18-2c82660ce7c4918d.js        46.4 kB
  ├ chunks/87c73c54-24122e7b92478d00.js  54.2 kB
  └ other shared chunks (total)          1.99 kB


○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
```

#### `DATABASE_URL='postgresql://ynab:ynab_local@localhost:5434/ynab_dev' npm run test:e2e`

```text
> test:e2e
> playwright test --project=chromium


Running 10 tests using 1 worker

[WebServer]  ⚠ Cross origin request detected from 127.0.0.1 to /_next/* resource. In a future major version of Next.js, you will need to explicitly configure "allowedDevOrigins" in next.config to allow this.
[WebServer] Read more: https://nextjs.org/docs/app/api-reference/config/next-config-js/allowedDevOrigins
  ok  1 [chromium] › apps\web\e2e\budgeting.spec.ts:31:1 › new user moves from registration to focused onboarding and budget without resume clicks (11.9s)
  ok  2 [chromium] › apps\web\e2e\budgeting.spec.ts:48:1 › daily workflow uses routed budget, one transaction dialog, automatic history, and browser navigation (9.8s)
  ok  3 [chromium] › apps\web\e2e\budgeting.spec.ts:71:1 › unreleased income remains actionable after reload (4.7s)
  ok  4 [chromium] › apps\web\e2e\budgeting.spec.ts:84:1 › CSV lives under settings instead of daily navigation (5.5s)
  ok  5 [chromium] › apps\web\e2e\reports-account-detail.spec.ts:138:3 › multi-month report surface › presents a seeded inclusive range and removes results after invalid ranges or failure (7.2s)
  ok  6 [chromium] › apps\web\e2e\reports-account-detail.spec.ts:255:3 › single-month report surface › renders the policy-approved treatments and proves comparison, trend, and export controls are absent at runtime (5.9s)
  ok  7 [chromium] › apps\web\e2e\reports-account-detail.spec.ts:338:3 › single-month report surface › rejects an invalid month instead of keeping the previous report on screen (3.8s)
  ok  8 [chromium] › apps\web\e2e\reports-account-detail.spec.ts:357:3 › account detail and activity surface › a native link opens the routed history with the server-derived balance and a single transfer row (7.3s)
  ok  9 [chromium] › apps\web\e2e\reports-account-detail.spec.ts:398:3 › account detail and activity surface › an archived account stays readable from the accounts list (4.0s)
  ok 10 [chromium] › apps\web\e2e\reports-account-detail.spec.ts:423:3 › account detail and activity surface › history continuation loads older activity past the first page and recovers from a stale cursor (8.3s)

  10 passed (1.4m)
```
