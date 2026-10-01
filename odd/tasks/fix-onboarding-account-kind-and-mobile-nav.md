# Feature: Fix onboarding account kind, compact navigation, and screenshot fidelity

## Goal

Close three defects surfaced by the E2E screenshot walkthrough: the onboarding account type is
accepted and silently discarded, the compact navigation breaks words at 320 px, and full-page
captures misrepresent the fixed sidebar.

## Origin

The screenshot evidence in `docs/e2e/` made all three visible. The first two are product defects;
the third is a defect in the capture harness.

## Non-goals

- No backfill or repair of accounts already persisted with the wrong kind (owner decision).
- No renaming of navigation labels (owner decision: keep the labels).
- No change to `openspec/changes/add-cleared-state-and-reconciliation/**`, which another live
  session owns in the same working tree.

## Requirements traced

- `openspec/specs/account-management/spec.md` — "the canonical account collection, including each
  account's identity, supported kind, lifecycle state...". The onboarding account reports `CASH`
  even when the owner chose a bank account.
- `openspec/specs/guided-budgeting-ux/spec.md:181` — authenticated navigation "SHALL remain usable
  on desktop and compact/mobile layouts while preserving the same information architecture". It does
  not mandate one row or that all items be simultaneously in view.

## Root causes

1. `BudgetApp.saveSetup` validates `input.accountType` and then builds the account without `kind`,
   so `publicBudget` and the persistence layer both coerce `?? 'CASH'`.
2. `PrismaBudgetStore.saveBudget` writes `kind` on `create` but omits it from `update`, so a later
   setup submission can never correct the kind.
3. `.mobile-nav small` uses `overflow-wrap: anywhere` with a column narrower than the longest label,
   which breaks words inside the word.
4. The Playwright full-page capture keeps `.sidebar` at `height: 100vh`, so a 2900 px document
   renders a 900 px dark block and an empty left column below it.

## Allowed edit surfaces

- `apps/api/src/app.ts`
- `apps/api/src/persistence/budget-store.ts`
- `apps/api/test/app.test.ts`
- `apps/web/app/globals.css`
- `apps/web/app/components/shell/AppShell.tsx`
- `apps/web/e2e/reports-account-detail.spec.ts`
- `apps/web/test/reports.test.ts`
- `docs/e2e/walkthrough.spec.ts`
- `docs/e2e/README.md`
- `next.config.mjs`
- `odd/tasks/fix-onboarding-account-kind-and-mobile-nav.md`

## Tasks

- [x] 1. Honor the onboarding account type end to end, with regression tests.
- [x] 2. Make the compact navigation usable at 320 px without breaking labels.
- [x] 3. Fix the capture harness so published images show the real layout.
- [x] 4. Regenerate and verify the 32 captures.
- [x] 5. Verify the whole change and report.

## Evidence

**Task 1 — account kind**

- The regression test fails before the fix (`expected: 'CHECKING', actual: 'CASH'`) and passes after.
- Proof against the real PostgreSQL path: the demo seed creates its account through the onboarding
  request, and the row moved from `CASH` to `CHECKING`; re-submitting with `cash` updates it to
  `CASH` in place. Capture 21 now shows `Cuenta bancaria` for `Cuenta principal`.
- `budget-store.ts:35` omitted `kind` from the upsert `update`, so the kind was immutable after the
  first insert. Without that second fix, the re-submission case could not work.

**Task 2 — compact navigation**

- Browser measurements at 320 px: every label reports `lines: 1` and `overflows: false`; the bar
  reports `rows: 1` and `scrollable: true`; the active item is fully visible after navigating to the
  last section, with no manual scrolling; at 720 px the bar no longer needs to scroll.
- `apps/web/test/reports.test.ts` locked the previous grid implementation. The assertion now locks
  the behaviour instead: the bar exists in the `max-width: 980px` block, is a flex row, scrolls
  horizontally, and its labels never use `overflow-wrap`.
- `apps/web/e2e/reports-account-detail.spec.ts` asserted that all six links fit in the viewport at
  once, which the chosen design cannot satisfy. It now asserts one row, no mid-word break, horizontal
  scrollability, every section reachable, and the active item in view.

**Task 3 — capture fidelity**

- Full-page captures paint the sidebar band behind the whole document. Before: a 900px dark block
  over an empty left column in a 2879px image. After: a continuous column.
- `next.config.mjs` disables the development indicator, which covered the first compact bar label.
  Verified: the `nextjs-portal` host remains but its box is `0x0` at `y=900`, so nothing renders.

**Task 5 — full verification**

- `npm test` → 167/167. `npm run test:web` → 53/53. `npm run typecheck:web` → clean.
- `npm run build:web` → compiled successfully.
- `npm run test:e2e` → 13/13.
- `npm run docs:screenshots` → passed; 32 captures, 32 files, all referenced, no broken links.

**Not mine, left untouched**

- `apps/web/tsconfig.tsbuildinfo` is tracked and dirty from typecheck runs. The concurrent session
  owns that artifact for this window and reverts it in its own step; reverting it here would destroy
  who-dirtied-it traceability.
- Commit: not created. The harness rule is to never commit without an explicit user request, and the
  repository has a concurrent writer in the same working tree, so creating a branch would move the
  ground under it. Staging command for the human:

```bash
git add apps/api/src/app.ts apps/api/src/persistence/budget-store.ts apps/api/test/app.test.ts \
  apps/web/app/globals.css apps/web/app/components/shell/AppShell.tsx \
  apps/web/e2e/reports-account-detail.spec.ts apps/web/test/reports.test.ts next.config.mjs \
  docs/e2e docs/README.md package.json scripts/seed-demo-data.mjs \
  odd/tasks/e2e-screenshot-docs.md odd/tasks/fix-onboarding-account-kind-and-mobile-nav.md
```
