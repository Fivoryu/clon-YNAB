# Trends Surface: Browser Suite Reliability

## Objective

Close the intermittent browser-suite failure recorded as an open follow-up when `add-multi-month-report-surface` was archived, and close the two browser-coverage gaps the independent verifier identified.

## The symptom

One pre-existing journey — `a native link opens the routed history with the server-derived balance and a single transfer row` — failed intermittently in full-suite runs: nine passed and two failed across eleven runs, always that same test, and it always passed in isolation.

## Root cause (determined, not guessed)

The symptom was misleading because it blamed one test. A capture run showed **three** failures at once, all with the identical shape: a click that should trigger client-side navigation left the URL unchanged.

| Failing journey | Expected | Observed |
| --- | --- | --- |
| Registration to onboarding | `/setup` | `/register` |
| Navigation to the new trends route | `/reports/trends` | `/budget` |
| Accounts list to account detail | `/accounts/<id>` | `/accounts` |

Every failure was the **first client-side navigation to a route that had not been compiled yet in that run**. The suite runs against `next dev`, which compiles a route on demand the first time a client navigates to it. On a cold cache that compile exceeds Playwright's default 5-second assertion timeout, so the navigation appears not to happen and the assertion fails.

This also explains why the flake appeared to be introduced by the trends surface work: that change added a **new route**, which is precisely a new cold-compilation target. The product page was never at fault.

### A/B evidence

| Cache state | Assertion timeout | Result |
| --- | --- | --- |
| Cold (`.next` removed) | 5 s (the previous default) | **2 failed**, both first navigations to an uncompiled route |
| Cold (`.next` removed) | 15 s | **11 passed**, 0 failed |
| Warm | 15 s | **11 passed**, 0 failed |

The only variable changed between the first two rows was the assertion timeout, so the cause is the timeout, not the route or the page. An earlier hypothesis — a rebuild while a reused dev server is serving — was tested and refuted, and is recorded as refuted rather than quietly dropped.

## Fix

`playwright.config.ts`:

- `expect: { timeout: 15_000 }`, with a comment explaining that the suite runs against `next dev` and that a first navigation to an on-demand-compiled route can take several seconds.
- The per-test timeout rose from 30 s to 45 s so a test performing several first navigations still fits.

No product code changed. No assertion was weakened, removed, or given a longer budget to hide a genuine failure: the failing assertions were correct and the timeout was simply too tight for the server mode the suite uses.

## Coverage gaps closed

- **An all-empty range.** A new browser test seeds a budget with no activity and requests a three-month range, then asserts three summary rows all reading zero, a period total of zero labelled as flow measures only with no pending-release text, and six chart values all reading zero.
- **The retry path after an API failure.** The existing failure scenario now asserts the loading status is gone, unroutes the forced failure, clicks `Reintentar`, and asserts the series returns and the alert clears.

## Coverage gap deliberately left open, with its reason

The loading live-region **announcement** is not asserted in the browser. The loading state resolves as soon as the response arrives, so asserting the announcement would require intercepting and holding the request, and the resulting assertion would test the interception rather than the product. What the browser suite does assert is that the loading status is absent once the request has failed, and the announcement itself remains covered by the source-contract suite. This is a recorded limit, not a silent omission.

## Final evidence

| Command | Result |
| --- | --- |
| `DATABASE_URL=... npm run test:e2e` cold | 11 passed, 0 failed |
| `DATABASE_URL=... npm run test:e2e` warm | 11 passed, 0 failed |
| `npm run test:web` | 48 passed, 0 failed |
| `npm run typecheck:web` | clean |
| `DATABASE_URL=... npm test` | 147 passed, 0 failed, 0 skipped |

## Note on the archived change

`openspec/changes/archive/2026-09-29-add-multi-month-report-surface/archive-report.md` records this flake as open. That file is the historical record of the state at archive time and is deliberately not rewritten. This document is the closure.
