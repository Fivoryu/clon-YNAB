# YNAB E2E Coverage for the New Surfaces

## Objective

Add real browser-level (Playwright) coverage for the two surfaces delivered by `ynab-screen-parity-roadmap`: the account detail/activity view and the single-month report at `/reports`.

## Problem and rationale

Independent verification of Work Unit 4 reported that every assertion about `/reports` was a Node source-contract assertion over the page source, with no render, DOM, viewport, or screen-reader execution. The same is true of the account detail view from Work Unit 2. Playwright is already installed and configured (`playwright.config.ts`, `npm run test:e2e`, `apps/web/e2e/budgeting.spec.ts`), so a real runtime harness exists and was simply not used for these surfaces. Source-contract tests can pass while the rendered behavior is broken, which is exactly the gap the verifier could not close.

## Scope and constraints

- Add Playwright coverage for `/reports` and the account detail/activity route.
- Assert real rendered behavior: visible text, accessible roles and names, URLs, and runtime absence of forbidden controls.
- Create test data through the public API, following the existing `seedReadyBudget` helper convention.
- Do not modify `docker-compose.yml`, `README.md`, or any `apps/api/` file.
- Do not add a new dependency; Playwright is already installed.
- Do not commit or push.

## Environment note

Host port 5434 is currently occupied by an unrelated project's container (`roomforge-local-dev-postgres-1`), so the repository's own Compose port is not usable right now without touching that container. A dedicated, isolated PostgreSQL 16 container was started for this work with the repository's own credentials and all six Prisma migrations applied, reachable at `localhost:5435`. Run the suite with the database URL passed per process:

```bash
DATABASE_URL='postgresql://ynab:ynab_local@localhost:5435/ynab_dev' npm run test:e2e
```

The repository files were not changed for this. The port collision itself is a separate follow-up decision for the project owner.

## Required coverage

Report surface (`/reports`, reached through the primary navigation):

- The Reports navigation entry is reachable and navigates to `/reports`.
- The selected period is identified in the rendered page.
- Category spending renders as a real table with an accessible name and a category row.
- Income and expense are separately discernible rendered values.
- After creating a transfer through the API, the transfers section renders the transfer with both account names and a subtotal explicitly labelled as outside the income/expense totals, and the transfer amount is not added to income or expense.
- After creating an unreleased income record, the pending-release breakdown renders received, released, and pending values.
- The provisional section renders (a zero count is acceptable and must still render).
- The policy identifier `report-policy/v1` is visible.
- Forbidden controls are absent at runtime, not just in source: no month comparison, no trend control, no export control.
- An invalid month is rejected in the UI rather than silently showing a wrong report.

Account detail surface:

- From `/accounts`, a native link opens the account detail route and the URL carries the account identity.
- The server-derived balance is rendered.
- Activity rows render for that account, and a transfer appears once with both endpoints.
- Archived accounts remain readable.
- The continuation control and its states behave as designed; if reaching older-than-500 history requires seeding more than 500 records, either do it deliberately with a recorded runtime cost or state the limit honestly instead of faking the assertion.

## Checks

- Playwright Chromium, run as `DATABASE_URL='postgresql://ynab:ynab_local@localhost:5435/ynab_dev' npm run test:e2e`.
- The pre-existing `apps/web/e2e/budgeting.spec.ts` must still pass.
- No source-contract test may be weakened to make the browser suite pass.

## Tasks

- [x] E2E-1 — Write the Playwright journey covering the report surface, using API-seeded data for spending, transfer, and unreleased income. Acceptance: every required report-surface assertion above is a real browser assertion and passes.
  - Delivered in `apps/web/e2e/reports-account-detail.spec.ts` (333 lines) as the `single-month report surface` suite (2 tests).
  - Runtime evidence: `DATABASE_URL='postgresql://ynab:ynab_local@localhost:5435/ynab_dev' npx playwright test --project=chromium -g "single-month report surface"` -> `2 passed (1.6m)` including web/API startup; the two tests themselves measured 10.8s and 3.1s.
  - Every required report bullet is asserted from rendered DOM: navigation link click -> `/reports`; rendered period heading and `Mes: 2026-09`; `p.report-policy code` text `report-policy/v1`; category `<table>` matched by its `<caption>` accessible name with a real `Comida` row (rowheader role) and archived `Transporte` row; separate income/expense measures read from the rendered `<dd>` and compared numerically to 45000/2575 minor units; transfer `<table>` by accessible name with `Principal`/`Ahorros`/`2026-09-20`/20000 in one row plus the subtotal line labelled "fuera de los totales de ingresos y gastos"; provisional section rendered with count `0`; release breakdown received 45000 / released 0 / pending 45000; `data-treatment` markers `OUTSIDE_INCOME_EXPENSE_TOTALS`, `INCLUDED_PROVISIONAL`, `PENDING_RELEASE` present.
  - Runtime absence (not source text): within `main` the suite asserts 0 buttons, 0 links, 0 `select`, 0 comboboxes, exactly 1 `input` and it is `type="month"`, exactly 2 tables, and 0 elements matching `/tendencia|comparación|comparar meses/i`.
  - Invalid-month rejection: clearing the month control renders `Mes: sin seleccionar`, `Mes no válido`, the `role="alert"` `Elige un mes válido en formato AAAA-MM.`, and removes the totals heading, both tables and the policy line.
- [x] E2E-2 — Write the Playwright journey covering account detail and activity, including archived-account read access and an honest statement about the older-than-500 continuation. Acceptance: navigation, balance, activity, and single-transfer rendering are asserted at runtime.
  - Runtime evidence: `npx playwright test --project=chromium -g "account detail and activity surface"` -> `3 passed (42.2s)`; tests measured 12.8s / 3.7s / 7.6s.
  - Account detail: clicking the native `Ver actividad de Principal` link lands on `/accounts/<uuid>` (asserted URL), the `Resumen de Principal` region renders the server-derived balance `122425` minor units and `Saldo actual`, the `Actividad de Principal` list renders exactly 3 items (spending `Mercado`/`Comida`, income, transfer), and the transfer appears once with both endpoints (`Principal → Ahorros`) and no duplicate.
  - End-of-history state asserted (`Has llegado al final de la actividad disponible.`) with no continuation button when the account has 3 records.
  - Archived accounts: after `POST /accounts/{id}/archive`, the archived account is opened from the `Cuentas archivadas` disclosure, the URL carries its id, `Cuenta archivada` and the preserved balance `20000` render, and the transfer appears once.
  - Older-than-500 continuation is proven, not skipped: 501 records are seeded deliberately with one CSV import request (`POST /budgets/{id}/transactions/import`, 501 `SPENDING` rows, `accepted: 501`, `rejected: 0`), the first page renders exactly 500 rows with the `Cargar actividad anterior` control, an extra record added between pages produces the designed stale-cursor state (`El historial cambió. Reinícialo para cargar la actividad actualizada.` + `Reiniciar historial`, no partial append), a reset returns to 500 rows, and the second continuation loads to 502 rows and the end state. Measured runtime cost: 7.6-8.6s for that test, including seeding and rendering 500-502 rows.
- [x] E2E-3 — Run the full Playwright suite, confirm the pre-existing journey still passes, and record the exact command and output, including runtime cost and any test that could not be made meaningful.
  - Closed after three owner-authorized locator fixes in `apps/web/e2e/budgeting.spec.ts` (3 added / 3 removed, no assertion removed or relaxed). Final state: **9 of 9 tests pass**, run twice back to back: `9 passed (1.2m)` and `9 passed (1.4m)` with `workers: 1`. Verbatim outputs in "Full suite run" below; the three ambiguities and their exact fixes in "Authorized pre-existing locator fixes".
  - History: baseline before any fix was `7 passed, 2 failed (1.2m)`; after the first two authorized fixes it was `8 passed, 1 failed (1.3m)` because the line-10 failure had been masking a third ambiguity at line 45; after the third authorized fix it is `9 passed` twice.
  - No assertion in `apps/web/e2e/budgeting.spec.ts` was made less strict and nothing in `apps/web/test/` was touched, so no source-contract test was weakened.

## Authorized pre-existing locator fixes in `apps/web/e2e/budgeting.spec.ts`

Owner-authorized diff. `git diff --numstat -- apps/web/e2e/budgeting.spec.ts` reports exactly `3 3` (3 added / 3 removed), and `git diff -U0` shows no other line differs from HEAD:

```diff
@@ -7,7 +7,7 @@ async function registerThroughUi(page: any) {
   const email = `ux-${randomUUID()}@example.com`;
   await page.goto('/register');
   await page.getByLabel('Correo').fill(email);
-  await page.getByLabel('Contraseña').fill(password);
+  await page.getByLabel('Contraseña', { exact: true }).fill(password);
   await page.getByLabel('Repite la contraseña').fill(password);
   await page.getByRole('button', { name: 'Crear cuenta y continuar' }).click();
   await expect(page).toHaveURL(/\/setup/);
@@ -42,7 +42,7 @@ test('new user moves from registration to focused onboarding and budget without
   await page.getByRole('button', { name: 'Abrir mi presupuesto' }).click();
   await expect(page).toHaveURL(/\/budget/);
   await expect(page.getByText('Disponible para asignar')).toBeVisible();
-  await expect(page.getByText(/1[.\s]?250,50|1,250\.50/)).toBeVisible();
+  await expect(page.locator('.rta-card').getByText(/1[.\s]?250,50|1,250\.50/)).toBeVisible();
 });
 
 test('daily workflow uses routed budget, one transaction dialog, automatic history, and browser navigation', async ({ page }) => {
@@ -87,6 +87,6 @@ test('CSV lives under settings instead of daily navigation', async ({ page }) => {
   await expect(page.getByRole('heading', { name: 'Configuración' })).toBeVisible();
   await expect(page.getByRole('region', { name: 'Importar y exportar CSV' })).toBeVisible();
   await expect(page.getByRole('button', { name: 'Descargar CSV' })).toBeVisible();
-  await page.getByRole('link', { name: 'Presupuesto' }).click();
+  await page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('link', { name: 'Presupuesto' }).click();
   await expect(page.getByText('Importar y exportar transacciones')).toHaveCount(0);
```

The three pre-existing strict-mode ambiguities and their exact fixes:

1. `budgeting.spec.ts:10` (helper `registerThroughUi`) — `page.getByLabel('Contraseña')` resolved to 2 elements (`#register-password` and `#register-confirm`) because Playwright `getByLabel()` matches by substring, so `'Contraseña'` also matched the label `Repite la contraseña`. Fix: `page.getByLabel('Contraseña', { exact: true })`.
2. `budgeting.spec.ts:45` (first journey) — `page.getByText(/1[.\s]?250,50|1,250\.50/)` resolved to 2 elements: `<strong class="">1.250,50</strong>` in the "Disponible para asignar" RTA card and `<strong>1.250,50</strong>` in the "Saldo total en cuentas" card, because onboarding renders the seeded opening balance `1250.50` twice on `/budget`. Fix: `page.locator('.rta-card').getByText(...)`, scoping the assertion to the same card line 44 already asserts is visible, which makes it precise rather than merely non-ambiguous.
3. `budgeting.spec.ts:90` (CSV journey) — `page.getByRole('link', { name: 'Presupuesto' })` resolved to 2 elements (the brand link `Y Mi Presupuesto Planifica` and the sidebar nav link `◎ Presupuesto`) because accessible names match by substring. Fix: `page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('link', { name: 'Presupuesto' })`.

Confirmed for all three: no assertion was removed, relaxed, or rewritten in kind. Fixes 1 and 3 only narrow the locator that feeds the same action, and every downstream assertion (`toHaveURL(/\/setup/)`, `getByText('Importar y exportar transacciones')` `toHaveCount(0)`) is byte-identical to HEAD. Fix 2 keeps the same regex on the same `toBeVisible()` call and only narrows its scope from "somewhere on the page" to the card that owns the value, which is a strengthening. `apps/web/test/` is untouched (`git status --short apps/web/test/` is empty), so no source-contract test was weakened.

## Full suite run (final, after all three authorized fixes)

Command (exactly as required), executed twice back to back:

```bash
DATABASE_URL='postgresql://ynab:ynab_local@localhost:5435/ynab_dev' npm run test:e2e
```

Run 1 output:

```text
> test:e2e
> playwright test --project=chromium


Running 9 tests using 1 worker

[WebServer]  ⚠ Cross origin request detected from 127.0.0.1 to /_next/* resource. In a future major version of Next.js, you will need to explicitly configure "allowedDevOrigins" in next.config to allow this.
[WebServer] Read more: https://nextjs.org/docs/app/api-reference/config/next-config-js/allowedDevOrigins
  ok 1 [chromium] › apps\web\e2e\budgeting.spec.ts:31:1 › new user moves from registration to focused onboarding and budget without resume clicks (9.6s)
  ok 2 [chromium] › apps\web\e2e\budgeting.spec.ts:48:1 › daily workflow uses routed budget, one transaction dialog, automatic history, and browser navigation (8.3s)
  ok 3 [chromium] › apps\web\e2e\budgeting.spec.ts:71:1 › unreleased income remains actionable after reload (4.3s)
  ok 4 [chromium] › apps\web\e2e\budgeting.spec.ts:84:1 › CSV lives under settings instead of daily navigation (3.9s)
  ok 5 [chromium] › apps\web\e2e\reports-account-detail.spec.ts:119:3 › single-month report surface › renders the policy-approved treatments and proves comparison, trend, and export controls are absent at runtime (4.8s)
  ok 6 [chromium] › apps\web\e2e\reports-account-detail.spec.ts:202:3 › single-month report surface › rejects an invalid month instead of keeping the previous report on screen (2.4s)
  ok 7 [chromium] › apps\web\e2e\reports-account-detail.spec.ts:221:3 › account detail and activity surface › a native link opens the routed history with the server-derived balance and a single transfer row (6.2s)
  ok 8 [chromium] › apps\web\e2e\reports-account-detail.spec.ts:260:3 › account detail and activity surface › an archived account stays readable from the accounts list (2.9s)
  ok 9 [chromium] › apps\web\e2e\reports-account-detail.spec.ts:285:3 › account detail and activity surface › history continuation loads older activity past the first page and recovers from a stale cursor (7.3s)

  9 passed (1.2m)
```

Run 2 output (stability check, same command):

```text
> test:e2e
> playwright test --project=chromium


Running 9 tests using 1 worker

[WebServer]  ⚠ Cross origin request detected from 127.0.0.1 to /_next/* resource. In a future major version of Next.js, you will need to explicitly configure "allowedDevOrigins" in next.config to allow this.
[WebServer] Read more: https://nextjs.org/docs/app/api-reference/config/next-config-js/allowedDevOrigins
  ok 1 [chromium] › apps\web\e2e\budgeting.spec.ts:31:1 › new user moves from registration to focused onboarding and budget without resume clicks (13.5s)
  ok 2 [chromium] › apps\web\e2e\budgeting.spec.ts:48:1 › daily workflow uses routed budget, one transaction dialog, automatic history, and browser navigation (10.0s)
  ok 3 [chromium] › apps\web\e2e\budgeting.spec.ts:71:1 › unreleased income remains actionable after reload (4.3s)
  ok 4 [chromium] › apps\web\e2e\budgeting.spec.ts:84:1 › CSV lives under settings instead of daily navigation (3.4s)
  ok 5 [chromium] › apps\web\e2e\reports-account-detail.spec.ts:119:3 › single-month report surface › renders the policy-approved treatments and proves comparison, trend, and export controls are absent at runtime (4.9s)
  ok 6 [chromium] › apps\web\e2e\reports-account-detail.spec.ts:202:3 › single-month report surface › rejects an invalid month instead of keeping the previous report on screen (2.8s)
  ok 7 [chromium] › apps\web\e2e\reports-account-detail.spec.ts:221:3 › account detail and activity surface › a native link opens the routed history with the server-derived balance and a single transfer row (6.1s)
  ok 8 [chromium] › apps\web\e2e\reports-account-detail.spec.ts:260:3 › account detail and activity surface › an archived account stays readable from the accounts list (3.3s)
  ok 9 [chromium] › apps\web\e2e\reports-account-detail.spec.ts:285:3 › account detail and activity surface › history continuation loads older activity past the first page and recovers from a stale cursor (9.4s)

  9 passed (1.4m)
```

Final counts: **9 passed, 0 failed on both runs**, total runtime 1.2m and 1.4m with `workers: 1`, including Playwright-managed web/API startup. The new spec's 5 tests ran in 4.8/2.4/6.2/2.9/7.3s (run 1) and 4.9/2.8/6.1/3.3/9.4s (run 2); no flake, retry, or timing workaround was needed.

Earlier runs kept for history: baseline before any fix was `7 passed, 2 failed (1.2m)` (`budgeting.spec.ts:31` and `:84`); after only the first two authorized fixes it was `8 passed, 1 failed (1.3m)` (`budgeting.spec.ts:31` failing at line 45 on the strict-mode violation described above).

## Pre-existing failures in `apps/web/e2e/budgeting.spec.ts` (all three now fixed)

### Baseline (before any fix, new spec excluded from the run)

The first two failures were Playwright strict-mode locator ambiguities. They reproduce with the new spec absent from the run:

```bash
DATABASE_URL='postgresql://ynab:ynab_local@localhost:5435/ynab_dev' npx playwright test --project=chromium apps/web/e2e/budgeting.spec.ts
# -> 2 failed, 2 passed (36.6s)
```

- `budgeting.spec.ts:10` `getByLabel('Contraseña')` matched both `#register-password` and `#register-confirm` ("Repite la contraseña") because `getByLabel` matches by substring by default.
- `budgeting.spec.ts:90` `getByRole('link', { name: 'Presupuesto' })` matched both the brand link (`Y Mi Presupuesto`) and the nav link (`◎ Presupuesto`), again by substring.

`git diff HEAD -- apps/web/e2e/budgeting.spec.ts` was empty at that point, so the file was unmodified from HEAD and the failures were not caused by this work unit. No assertion in that spec or in any `apps/web/test/*.test.ts` source-contract test was weakened.

### Third ambiguity, revealed after the first two fixes

Once line 10 was fixed, that test progressed and stopped at line 45 on a third strict-mode violation, which the line-10 failure had been masking in every earlier run:

```text
strict mode violation: getByText(/1[.\s]?250,50|1,250\.50/) resolved to 2 elements:
    1) <strong class="">1.250,50</strong>   -> the "Disponible para asignar" (RTA) card
    2) <strong>1.250,50</strong>              -> the "Saldo total en cuentas" metric card
```

Reason: after onboarding, the seeded opening balance `1250.50` is rendered by two different cards on `/budget`, so the loose amount regex had two visible matches. Both elements exist at HEAD, so this too is a pre-existing ambiguity in the same file, not something this work unit introduced. The owner authorized Option A2 (`page.locator('.rta-card').getByText(...)`), which tightens the scoping to the card that owns the value.

### Fix authorization trail

All three fixes were explicitly authorized by the project owner in sequence (Option A for lines 10 and 90, then Option A2 for line 45) and are recorded in the diff above. No fourth ambiguity remains: the suite is green on two consecutive runs.

## Seeding approach and data volume

All data is created through the public API from `page.request`, reusing the `seedReadyBudget` convention from `budgeting.spec.ts` (`register` -> `sign-in` -> `POST /budgets` -> `PUT /budgets/{id}` with `openingBalanceMinor: 100000`, account `Principal`, categories `Comida`/`Transporte`), `randomUUID()` idempotency keys and `If-Match: W/"<version>"` versions refreshed with `GET /budgets/{id}` before each write.

- Per report/account test: 1 user + 1 budget + 1 extra account (`Ahorros`, opening 0) + 1 spending (2575 Comida) + 1 unreleased income (45000) + 1 transfer (20000 Principal -> Ahorros), all in `2026-09`; the report test additionally archives `Transporte`.
- Continuation test only: plus 501 `SPENDING` rows (100 minor units each, `2026-08-01`) created through a single `POST /budgets/{id}/transactions/import` CSV request, and 1 extra spending row (999, `2026-08-02`) added to invalidate the page-1 cursor. 502 records in one account, which is the minimum needed to exercise the 500-record page boundary.

## Coverage limits recorded honestly

- The provisional/`WORKING` section can only be asserted as rendered with count `0`. No public API command writes `status: 'WORKING'` (the report policy records the same limit), so a non-zero provisional breakdown is not reachable from the browser suite. The section's presence, its `INCLUDED_PROVISIONAL` treatment marker and its three zero measures are asserted.
- The unresolved-policy `REPORT_POLICY_UNRESOLVED` state is not reachable through the public API (`projectMonthlyReport` always resolves `report-policy/v1`), so no browser assertion claims it.
- No source-contract assertion was relaxed; `apps/web/test/reports.test.ts`, `apps/web/test/account-history.test.ts` and the rest were not touched.

## Acceptance criteria

- The report and account-detail surfaces have runtime browser coverage, not source-contract coverage.
- Every approved `report-policy/v1` treatment that is reachable through the API is asserted as actually rendered.
- Runtime absence of comparison, trend, and export controls is proven, not inferred from source text.
- The pre-existing browser journey still passes and no existing test was weakened. **Met: 9 of 9 tests pass on two consecutive full runs; the three pre-existing ambiguous locators were narrowed with owner authorization and no assertion was removed or relaxed.**
- The exact command, pass/fail counts, and any coverage limitation are recorded.

## Progress and verification

- Status: **E2E-1, E2E-2 and E2E-3 all complete.** Full suite green twice: `9 passed (1.2m)` and `9 passed (1.4m)`.
- Delivered artifact: `apps/web/e2e/reports-account-detail.spec.ts` (333 lines, 5 tests / 2 suites, sha256 `d0a8bd178f391f0e71a122ed52e2f7ed819d5f34320e7bb97d49199eded3afd3`, unchanged since review).
- Other edited file: `apps/web/e2e/budgeting.spec.ts`, `git diff --numstat` = `3 3` (3 added / 3 removed), all three authorized narrowings of ambiguous locators; no assertion removed, relaxed, or rewritten, and every downstream assertion byte-identical to HEAD. `apps/web/test/` was not touched (`git status --short apps/web/test/` empty).
- Suite state: `DATABASE_URL='postgresql://ynab:ynab_local@localhost:5435/ynab_dev' npm run test:e2e` -> 9 tests, **9 passed, 0 failed** (1.2m and 1.4m on the two runs).
- Environment: isolated PostgreSQL on `localhost:5435`; migrations applied and verified with `prisma migrate status`. Nothing was committed or pushed (`git diff --cached` empty).
- Remaining open items: none blocking. Recorded coverage limits stand (non-zero `WORKING` provisional breakdown and the `REPORT_POLICY_UNRESOLVED` state are not reachable through the public API).
