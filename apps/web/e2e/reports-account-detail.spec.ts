import { randomUUID } from 'node:crypto';
import { expect, test, type Locator, type Page } from '@playwright/test';

const password = 'playwright-password';
const reportingMonth = '2026-09';

const openingBalanceMinor = 100000;
const incomeMinor = 45000;
const expenseMinor = 2575;
const transferMinor = 20000;
const principalBalanceMinor = openingBalanceMinor + incomeMinor - expenseMinor - transferMinor;
const savingsBalanceMinor = transferMinor;

type AccountSnapshot = { id: string; name: string; archived: boolean; balanceMinor: number };
type CategorySnapshot = { id: string; name: string; archived: boolean };
type BudgetSnapshot = { id: string; version: number; accounts: AccountSnapshot[]; categories: CategorySnapshot[] };

const commandHeaders = (version: number) => ({ 'Idempotency-Key': randomUUID(), 'If-Match': `W/"${version}"` });

async function seedReadyBudget(page: Page): Promise<BudgetSnapshot> {
  const email = `ready-${randomUUID()}@example.com`;
  const request = page.request;
  const register = await request.post('/api/v1/auth/register', { data: { email, password } });
  expect(register.ok()).toBeTruthy();
  const signIn = await request.post('/api/v1/auth/sign-in', { data: { email, password } });
  expect(signIn.ok()).toBeTruthy();
  const created = await request.post('/api/v1/budgets', { data: {} });
  const budget = (await created.json()).data;
  const setup = await request.put(`/api/v1/budgets/${budget.id}`, {
    data: { openingBalanceMinor, accountName: 'Principal', accountType: 'checking', categories: ['Comida', 'Transporte'] },
  });
  expect(setup.ok()).toBeTruthy();
  return (await setup.json()).data as BudgetSnapshot;
}

async function reloadBudget(page: Page, budgetId: string): Promise<BudgetSnapshot> {
  const response = await page.request.get(`/api/v1/budgets/${budgetId}`);
  expect(response.ok(), 'GET budget should succeed').toBeTruthy();
  return (await response.json()).data as BudgetSnapshot;
}

async function postCommand(page: Page, url: string, data: unknown, version: number) {
  return page.request.post(url, { data: data as Record<string, unknown>, headers: commandHeaders(version) });
}

/** Reads a rendered money value and returns it as integer minor units, independent of locale separators. */
async function readMinor(locator: Locator): Promise<number> {
  const raw = (await locator.innerText()).trim();
  const normalized = raw.replace(/\s/g, '').replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '');
  const value = Number(normalized);
  expect(Number.isFinite(value), `rendered money "${raw}" should be numeric`).toBe(true);
  return Math.round(Math.abs(value) * 100);
}

/** The `<dd>` of a rendered report measure identified by its visible term. */
const measure = (page: Page, term: string): Locator => page.locator('.report-measure').filter({ hasText: term }).locator('dd');

type ReportSeed = { budgetId: string; principalId: string; savingsId: string };

async function seedReportActivity(page: Page): Promise<ReportSeed> {
  const budget = await seedReadyBudget(page);
  const principal = budget.accounts.find(account => account.name === 'Principal')!;
  const comida = budget.categories.find(category => category.name === 'Comida')!;
  const transporte = budget.categories.find(category => category.name === 'Transporte')!;

  const createdAccount = await postCommand(page, `/api/v1/budgets/${budget.id}/accounts`, { name: 'Ahorros', kind: 'checking', openingBalanceMinor: 0 }, budget.version);
  expect(createdAccount.status(), 'creating the destination account should succeed').toBe(201);
  const savings = (await createdAccount.json()).data.account as AccountSnapshot;

  const withAccount = await reloadBudget(page, budget.id);
  const spending = await postCommand(page, `/api/v1/budgets/${budget.id}/spending`, { amountMinor: expenseMinor, categoryId: comida.id, accountId: principal.id, date: `${reportingMonth}-10`, payee: 'Mercado' }, withAccount.version);
  expect(spending.status(), 'recording spending should succeed').toBe(201);

  const afterSpending = await reloadBudget(page, budget.id);
  const income = await postCommand(page, `/api/v1/budgets/${budget.id}/income`, { amountMinor: incomeMinor, accountId: principal.id, date: `${reportingMonth}-17`, payee: 'Cliente' }, afterSpending.version);
  expect(income.status(), 'recording income should succeed').toBe(201);
  expect((await income.json()).data.released, 'the seeded income must stay unreleased').toBe(false);

  const afterIncome = await reloadBudget(page, budget.id);
  const transfer = await postCommand(page, `/api/v1/budgets/${budget.id}/transfers`, { sourceAccountId: principal.id, destinationAccountId: savings.id, amountMinor: transferMinor, date: `${reportingMonth}-20`, payee: 'Ahorro mensual' }, afterIncome.version);
  expect(transfer.status(), 'recording the transfer should succeed').toBe(201);

  const archiveCategory = await page.request.post(`/api/v1/budgets/${budget.id}/categories/${transporte.id}/archive`);
  expect(archiveCategory.ok(), 'archiving a category should succeed').toBeTruthy();

  return { budgetId: budget.id, principalId: principal.id, savingsId: savings.id };
}

type AccountSeed = ReportSeed & { spendingId: string; incomeId: string; transferId: string };

async function seedAccountActivity(page: Page): Promise<AccountSeed> {
  const budget = await seedReadyBudget(page);
  const principal = budget.accounts.find(account => account.name === 'Principal')!;
  const comida = budget.categories.find(category => category.name === 'Comida')!;

  const createdAccount = await postCommand(page, `/api/v1/budgets/${budget.id}/accounts`, { name: 'Ahorros', kind: 'checking', openingBalanceMinor: 0 }, budget.version);
  expect(createdAccount.status()).toBe(201);
  const savings = (await createdAccount.json()).data.account as AccountSnapshot;

  const withAccount = await reloadBudget(page, budget.id);
  const spending = await postCommand(page, `/api/v1/budgets/${budget.id}/spending`, { amountMinor: expenseMinor, categoryId: comida.id, accountId: principal.id, date: `${reportingMonth}-10`, payee: 'Mercado' }, withAccount.version);
  expect(spending.status()).toBe(201);
  const spendingId = (await spending.json()).data.id as string;

  const afterSpending = await reloadBudget(page, budget.id);
  const income = await postCommand(page, `/api/v1/budgets/${budget.id}/income`, { amountMinor: incomeMinor, accountId: principal.id, date: `${reportingMonth}-17`, payee: 'Cliente' }, afterSpending.version);
  expect(income.status()).toBe(201);
  const incomeId = (await income.json()).data.id as string;

  const afterIncome = await reloadBudget(page, budget.id);
  const transfer = await postCommand(page, `/api/v1/budgets/${budget.id}/transfers`, { sourceAccountId: principal.id, destinationAccountId: savings.id, amountMinor: transferMinor, date: `${reportingMonth}-20`, payee: 'Ahorro mensual' }, afterIncome.version);
  expect(transfer.status()).toBe(201);
  const transferId = (await transfer.json()).data.transferId as string;

  return { budgetId: budget.id, principalId: principal.id, savingsId: savings.id, spendingId, incomeId, transferId };
}

async function seedMultiMonthActivity(page: Page): Promise<void> {
  const budget = await seedReadyBudget(page);
  const principal = budget.accounts.find(account => account.name === 'Principal')!;
  const comida = budget.categories.find(category => category.name === 'Comida')!;
  const created = await postCommand(page, `/api/v1/budgets/${budget.id}/accounts`, { name: 'Ahorros', kind: 'checking', openingBalanceMinor: 0 }, budget.version);
  expect(created.status()).toBe(201);
  const savings = (await created.json()).data.account as AccountSnapshot;
  let current = await reloadBudget(page, budget.id);
  const spending = await postCommand(page, `/api/v1/budgets/${budget.id}/spending`, { amountMinor: expenseMinor, categoryId: comida.id, accountId: principal.id, date: '2026-08-10', payee: 'Mercado' }, current.version);
  expect(spending.status()).toBe(201);
  current = await reloadBudget(page, budget.id);
  const income = await postCommand(page, `/api/v1/budgets/${budget.id}/income`, { amountMinor: incomeMinor, accountId: principal.id, date: '2026-10-17', payee: 'Cliente' }, current.version);
  expect(income.status()).toBe(201);
  expect((await income.json()).data.released).toBe(false);
  current = await reloadBudget(page, budget.id);
  const transfer = await postCommand(page, `/api/v1/budgets/${budget.id}/transfers`, { sourceAccountId: principal.id, destinationAccountId: savings.id, amountMinor: transferMinor, date: '2026-10-20', payee: 'Ahorro mensual' }, current.version);
  expect(transfer.status()).toBe(201);
}

test.describe('multi-month report surface', () => {
  test('presents a seeded inclusive range and removes results after invalid ranges or failure', async ({ page }) => {
    test.setTimeout(180_000);
    await seedMultiMonthActivity(page);
    await page.setViewportSize({ width: 320, height: 820 });
    await page.goto('/budget');

    const mobileNav = page.getByRole('navigation', { name: 'Navegación móvil' });
    const mobileLinks = await mobileNav.getByRole('link').all();
    expect(mobileLinks).toHaveLength(6);
    for (const link of mobileLinks) await expect(link).toBeInViewport();
    const navRows = await mobileNav.locator('a').evaluateAll(links => new Set(links.map(link => Math.round(link.getBoundingClientRect().top))).size);
    expect(navRows).toBe(1);
    const trendsLink = mobileNav.getByRole('link', { name: 'Meses lado a lado' });
    await expect(trendsLink).toBeVisible();
    await expect(trendsLink).toHaveAttribute('href', '/reports/trends');
    await trendsLink.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/reports\/trends$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Reporte de meses lado a lado' })).toBeVisible();

    const start = page.getByLabel('Mes de inicio');
    const end = page.getByLabel('Mes de fin');
    await expect(start).toHaveAttribute('aria-describedby', 'report-range-hint');
    await expect(end).toHaveAttribute('aria-describedby', 'report-range-hint');
    await expect(page.locator('#report-range-hint')).toContainText('incluye el mes de inicio y el mes de fin');
    await start.fill('2026-08');
    await end.fill('2026-10');

    const main = page.getByRole('main');
    const summary = page.getByRole('table', { name: /Resumen mensual/ });
    await expect(summary.locator('tbody tr')).toHaveCount(3);
    await expect(summary.getByRole('rowheader').nth(0)).toHaveText('agosto de 2026');
    await expect(summary.getByRole('rowheader').nth(1)).toHaveText('septiembre de 2026');
    await expect(summary.getByRole('rowheader').nth(2)).toHaveText('octubre de 2026');
    const rows = summary.locator('tbody tr');
    expect(await readMinor(rows.nth(0).locator('td').nth(0))).toBe(0);
    expect(await readMinor(rows.nth(0).locator('td').nth(1))).toBe(expenseMinor);
    expect(await readMinor(rows.nth(1).locator('td').nth(0))).toBe(0);
    expect(await readMinor(rows.nth(1).locator('td').nth(1))).toBe(0);
    expect(await readMinor(rows.nth(2).locator('td').nth(0))).toBe(incomeMinor);
    expect(await readMinor(rows.nth(2).locator('td').nth(3))).toBe(transferMinor);
    await expect(page.locator('.report-month-detail summary').nth(1)).toContainText('Sin actividad registrada');
    const chart = page.getByRole('img', { name: /ingresos y gastos por mes/i });
    await expect(chart).toBeVisible();
    const chartValues = chart.locator('.report-chart-value');
    await expect(chartValues).toHaveCount(6);
    expect(await readMinor(chartValues.nth(0))).toBe(0);
    expect(await readMinor(chartValues.nth(1))).toBe(expenseMinor);
    expect(await readMinor(chartValues.nth(2))).toBe(0);
    expect(await readMinor(chartValues.nth(3))).toBe(0);
    expect(await readMinor(chartValues.nth(4))).toBe(incomeMinor);
    expect(await readMinor(chartValues.nth(5))).toBe(0);

    await expect(main.getByText(/edición o eliminación ordinaria puede cambiar/i)).toBeVisible();
    await expect(main.getByText(/etiquetas de categoría son las actuales/i)).toBeVisible();
    await expect(main.getByText(/no es un registro duradero/i)).toBeVisible();
    await expect(main.getByText(/meses se presentan lado a lado.*no analiza una tendencia/i)).toBeVisible();
    await expect(main.getByText('report-policy/v2', { exact: true })).toBeVisible();
    await expect(main.getByText('report-policy/v1', { exact: true })).toBeVisible();
    await expect(page.locator('.report-range-meta')).toContainText('2026-08');
    await expect(page.locator('.report-range-meta')).toContainText('2026-10');
    await expect(page.locator('.report-range-meta')).toContainText(/Revisión[\s\S]*\d+/);

    const period = page.getByRole('region', { name: /Total del periodo/ });
    await expect(period).toContainText(/solo medidas de flujo/i);
    expect(await readMinor(measure(page, 'Ingresos del periodo'))).toBe(incomeMinor);
    expect(await readMinor(measure(page, 'Gastos del periodo'))).toBe(expenseMinor);
    expect(await readMinor(period.locator('.report-total-line strong'))).toBe(transferMinor);
    await expect(period.getByText(/pendiente de liberar/i)).toHaveCount(0);
    await expect(period.getByRole('table')).toHaveCount(1);
    const categoryTotal = period.getByRole('table').getByRole('rowheader', { name: 'Comida' }).locator('..').locator('td');
    expect(await readMinor(categoryTotal)).toBe(expenseMinor);
    await expect(measure(page, 'Movimientos provisionales del periodo')).toHaveText('0');
    const monthListFollows = await page.locator('.report-month-list').evaluate(months => Boolean(
      months.compareDocumentPosition(document.querySelector('.report-period-total')!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ));
    expect(monthListFollows).toBe(true);

    const details = page.locator('.report-month-detail');
    await expect(details).toHaveCount(3);
    const october = details.nth(2);
    const octoberSummary = october.locator('summary');
    await octoberSummary.focus();
    await page.keyboard.press('Enter');
    await expect(october).toHaveAttribute('open', '');
    for (const heading of [/Ingresos y gastos del mes/, /Gasto por categoría/, /Transferencias del mes/, /Movimientos provisionales/, /Ingresos pendientes de liberar/]) {
      await expect(october.getByRole('heading', { name: heading })).toBeVisible();
    }
    await expect(october).toContainText('fuera de los totales de ingresos y gastos');
    await expect(october).toContainText('Pendiente de liberar');

    const forbiddenControls = await main.locator('button, a, input, select, summary, [role="button"], [role="link"], [role="tab"]').evaluateAll(elements => elements.flatMap(element => {
      const name = `${element.textContent ?? ''} ${element.getAttribute('aria-label') ?? ''}`;
      return /compar|percent|porcentaje|delta|trend|tendencia|export|descargar/i.test(name) ? [name] : [];
    }));
    expect(forbiddenControls).toEqual([]);

    await start.fill('2024-10');
    await end.fill('2026-09');
    await expect(summary.locator('tbody tr')).toHaveCount(24);
    await expect(details).toHaveCount(24);

    await start.fill('2026-10');
    await expect(main.getByRole('alert')).toContainText(/inicio no puede ser posterior/i);
    await expect(page.locator('.report-summary-table, .report-chart, .report-month-detail, .report-period-total')).toHaveCount(0);

    await start.fill('2026-01');
    await end.fill('2026-08');
    await expect(summary.locator('tbody tr')).toHaveCount(8);
    await end.fill('2028-01');
    await expect(main.getByRole('alert')).toContainText(/superar 24 meses/i);
    await expect(page.locator('.report-summary-table, .report-chart, .report-month-detail, .report-period-total')).toHaveCount(0);

    await start.fill('2026-08');
    await end.fill('2026-10');
    await expect(summary.locator('tbody tr')).toHaveCount(3);
    await page.route(/\/api\/v1\/budgets\/[^/]+\/reports\/monthly\?from=/, route => route.fulfill({
      status: 500, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Test range failure.' } }),
    }));
    await start.fill('2026-07');
    await expect(main.getByRole('alert')).toContainText('Test range failure.');
    await expect(page.locator('.report-summary-table, .report-chart, .report-month-detail, .report-period-total')).toHaveCount(0);
    await expect(main.getByRole('status')).toHaveCount(0);

    await page.unroute(/\/api\/v1\/budgets\/[^/]+\/reports\/monthly\?from=/);
    await main.getByRole('button', { name: 'Reintentar' }).click();
    await expect(summary.locator('tbody tr')).toHaveCount(4, { timeout: 15_000 });
    await expect(main.getByRole('alert')).toHaveCount(0);
  });

  test('renders an all-empty range with explicit zeros and no pending-release total', async ({ page }) => {
    await seedReadyBudget(page);
    await page.goto('/reports/trends');
    const start = page.getByLabel('Mes de inicio');
    const end = page.getByLabel('Mes de fin');
    await start.fill('2026-01');
    await end.fill('2026-03');

    const main = page.getByRole('main');
    await expect(main.getByRole('alert')).toHaveCount(0);
    const summary = page.getByRole('table', { name: /Resumen mensual/ });
    await expect(summary.locator('tbody tr')).toHaveCount(3, { timeout: 15_000 });
    for (const index of [0, 1, 2]) {
      expect(await readMinor(summary.locator('tbody tr').nth(index).locator('td').nth(0))).toBe(0);
      expect(await readMinor(summary.locator('tbody tr').nth(index).locator('td').nth(1))).toBe(0);
    }

    const period = page.locator('.report-period-total');
    await expect(period).toContainText(/solo medidas de flujo/i);
    await expect(period).not.toContainText(/pendiente de liberar/i);
    expect(await readMinor(period.getByText(/Ingresos del periodo/i).locator('..').locator('dd'))).toBe(0);
    expect(await readMinor(period.getByText(/Gastos del periodo/i).locator('..').locator('dd'))).toBe(0);

    const chartValues = page.getByRole('img', { name: /ingresos y gastos por mes/i }).locator('.report-chart-value');
    await expect(chartValues).toHaveCount(6);
    for (const index of [0, 1, 2, 3, 4, 5]) expect(await readMinor(chartValues.nth(index))).toBe(0);
  });
});

test.describe('single-month report surface', () => {
  test('renders the policy-approved treatments and proves comparison, trend, and export controls are absent at runtime', async ({ page }) => {
    await seedReportActivity(page);

    await page.goto('/budget');
    const primaryNav = page.getByRole('navigation', { name: 'Navegación principal' });
    await expect(primaryNav.getByRole('link', { name: /Reportes/ })).toBeVisible();
    await primaryNav.getByRole('link', { name: /Reportes/ }).click();
    await expect(page).toHaveURL(/\/reports$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Reporte mensual' })).toBeVisible();

    await page.getByLabel('Mes del reporte').fill(reportingMonth);
    await expect(page.getByRole('heading', { level: 2, name: 'septiembre de 2026' })).toBeVisible();
    await expect(page.locator('p.report-period')).toHaveText(`Mes: ${reportingMonth}`);
    await expect(page.locator('p.report-policy code')).toHaveText('report-policy/v1');
    await expect(page.locator('p.report-source')).toContainText('report-policy/v1');
    await expect(page.locator('p.report-source')).toContainText('versión');

    // Income and expense are separate rendered measures.
    await expect(page.getByRole('heading', { level: 2, name: 'Ingresos y gastos del mes' })).toBeVisible();
    await expect(page.getByText('Ninguna de las dos incluye transferencias.')).toBeVisible();
    const incomeMeasure = await readMinor(measure(page, 'Ingresos del mes'));
    const expenseMeasure = await readMinor(measure(page, 'Gastos del mes'));
    expect(incomeMeasure, 'income must be the realized income of the month').toBe(incomeMinor);
    expect(expenseMeasure, 'expense must be the spending of the month').toBe(expenseMinor);
    expect(incomeMeasure, 'the transfer must not be added to income').not.toBe(incomeMinor + transferMinor);
    expect(expenseMeasure, 'the transfer must not be added to expense').not.toBe(expenseMinor + transferMinor);

    // Category spending is a real table with an accessible name and a category row.
    const categoriesTable = page.getByRole('table', { name: /Gasto del mes 2026-09 repartido por categoría/ });
    await expect(categoriesTable).toBeVisible();
    const comidaRow = categoriesTable.locator('tbody tr').filter({ hasText: 'Comida' });
    await expect(comidaRow).toHaveCount(1);
    await expect(comidaRow.getByRole('rowheader', { name: 'Comida' })).toBeVisible();
    expect(await readMinor(comidaRow.locator('td')), 'Comida spending must be rendered').toBe(expenseMinor);
    const transporteRow = categoriesTable.locator('tbody tr').filter({ hasText: 'Transporte' });
    await expect(transporteRow).toHaveCount(1);
    expect(await readMinor(transporteRow.locator('td')), 'an archived category with no spending must still render').toBe(0);
    await expect(transporteRow.getByText('Categoría archivada')).toBeVisible();
    await expect(categoriesTable.getByText('Ahorros'), 'the transfer destination must not appear as category spending').toHaveCount(0);

    // The transfer is visible once with both account names and a subtotal outside the totals.
    const transfersTable = page.getByRole('table', { name: /Transferencias entre cuentas del mes 2026-09/ });
    await expect(transfersTable).toBeVisible();
    const transferRows = transfersTable.locator('tbody tr');
    await expect(transferRows).toHaveCount(1);
    const transferRow = transferRows.first();
    await expect(transferRow.locator('th')).toHaveText('Principal');
    await expect(transferRow.locator('td').nth(0)).toHaveText('Ahorros');
    await expect(transferRow.locator('td').nth(1)).toHaveText(`${reportingMonth}-20`);
    expect(await readMinor(transferRow.locator('td').nth(2))).toBe(transferMinor);
    const subtotal = page.locator('p.report-total-line');
    await expect(subtotal).toContainText('fuera de los totales de ingresos y gastos');
    expect(await readMinor(subtotal.locator('strong'))).toBe(transferMinor);
    await expect(page.locator('[data-treatment="OUTSIDE_INCOME_EXPENSE_TOTALS"]')).toBeVisible();

    // The provisional section renders even when its count is zero.
    await expect(page.getByRole('heading', { level: 2, name: 'Movimientos provisionales' })).toBeVisible();
    await expect(measure(page, 'Movimientos provisionales')).toHaveText('0');
    expect(await readMinor(measure(page, 'Ingresos provisionales'))).toBe(0);
    expect(await readMinor(measure(page, 'Gastos provisionales'))).toBe(0);
    await expect(page.locator('[data-treatment="INCLUDED_PROVISIONAL"]')).toBeVisible();

    // The pending-release breakdown of the unreleased income record.
    await expect(page.getByRole('heading', { level: 2, name: 'Ingresos pendientes de liberar' })).toBeVisible();
    expect(await readMinor(measure(page, 'Recibido'))).toBe(incomeMinor);
    expect(await readMinor(measure(page, 'Liberado'))).toBe(0);
    expect(await readMinor(measure(page, 'Pendiente de liberar'))).toBe(incomeMinor);
    await expect(page.locator('[data-treatment="PENDING_RELEASE"]')).toBeVisible();

    // Runtime absence of comparison, trend, and export controls.
    const main = page.getByRole('main');
    await expect(main.getByRole('button', { name: /comparar|comparación|tendencia|exportar|export|descargar/i })).toHaveCount(0);
    await expect(main.getByRole('link', { name: /comparar|tendencia|exportar|export|descargar/i })).toHaveCount(0);
    await expect(main.getByRole('combobox')).toHaveCount(0);
    await expect(main.locator('button')).toHaveCount(0);
    await expect(main.locator('a')).toHaveCount(0);
    await expect(main.locator('select')).toHaveCount(0);
    await expect(main.locator('input')).toHaveCount(1);
    await expect(main.locator('input[type="month"]')).toHaveCount(1);
    await expect(main.locator('table')).toHaveCount(2);
    await expect(main.getByText(/tendencia|comparación|comparar meses/i)).toHaveCount(0);
  });

  test('rejects an invalid month instead of keeping the previous report on screen', async ({ page }) => {
    await seedReportActivity(page);

    await page.goto('/reports');
    await page.getByLabel('Mes del reporte').fill(reportingMonth);
    await expect(page.getByRole('heading', { level: 2, name: 'Ingresos y gastos del mes' })).toBeVisible();

    await page.getByLabel('Mes del reporte').fill('');
    await expect(page.locator('p.report-period')).toHaveText('Mes: sin seleccionar');
    await expect(page.getByRole('heading', { level: 2, name: 'Mes no válido' })).toBeVisible();
    await expect(page.locator('div.report-error[role="alert"]')).toContainText('Elige un mes válido en formato AAAA-MM.');
    await expect(page.getByRole('heading', { level: 2, name: 'Ingresos y gastos del mes' })).toHaveCount(0);
    await expect(page.getByRole('table')).toHaveCount(0);
    await expect(page.locator('p.report-policy')).toHaveCount(0);
    await expect(page.getByRole('main').locator('button')).toHaveCount(0);
  });
});

test.describe('account detail and activity surface', () => {
  test('a native link opens the routed history with the server-derived balance and a single transfer row', async ({ page }) => {
    const seed = await seedAccountActivity(page);

    await page.goto('/accounts');
    await page.waitForLoadState('networkidle');
    const accountLink = page.getByRole('link', { name: 'Ver actividad de Principal' });
    await expect(accountLink).toBeVisible();
    await expect(accountLink).toHaveAttribute('href', `/accounts/${seed.principalId}`);
    await accountLink.click();
    await expect(page).toHaveURL(new RegExp(`/accounts/${seed.principalId}$`));

    const summary = page.getByRole('region', { name: 'Resumen de Principal' });
    await expect(summary).toBeVisible();
    await expect(summary.getByText('Saldo actual')).toBeVisible();
    expect(await readMinor(summary.locator('.account-detail-balance strong')), 'the balance is derived by the server from opening balance, income, spending, and the transfer').toBe(principalBalanceMinor);

    const activity = page.getByRole('list', { name: 'Actividad de Principal' });
    await expect(activity).toBeVisible();
    await expect(activity.getByRole('listitem')).toHaveCount(3);

    const spendingRow = page.getByTestId(`account-activity-${seed.spendingId}`);
    await expect(spendingRow).toContainText('Gasto');
    await expect(spendingRow).toContainText('Comida');
    await expect(spendingRow).toContainText('Mercado');
    expect(await readMinor(spendingRow.locator('strong').last())).toBe(expenseMinor);

    const incomeRow = page.getByTestId(`account-activity-${seed.incomeId}`);
    await expect(incomeRow).toContainText('Ingreso');
    expect(await readMinor(incomeRow.locator('strong').last())).toBe(incomeMinor);

    const transferRow = page.getByTestId(`account-activity-${seed.transferId}`);
    await expect(transferRow).toHaveCount(1);
    await expect(transferRow).toContainText('Transferencia');
    await expect(transferRow).toContainText('Principal → Ahorros');
    expect(await readMinor(transferRow.locator('strong').last())).toBe(transferMinor);
    await expect(page.getByText('Principal → Ahorros'), 'a transfer must appear once, not once per endpoint').toHaveCount(1);

    await expect(page.getByRole('button', { name: 'Cargar actividad anterior' })).toHaveCount(0);
    await expect(page.getByText('Has llegado al final de la actividad disponible.')).toBeVisible();
  });

  test('an archived account stays readable from the accounts list', async ({ page }) => {
    const seed = await seedAccountActivity(page);

    const current = await reloadBudget(page, seed.budgetId);
    const archived = await page.request.post(`/api/v1/budgets/${seed.budgetId}/accounts/${seed.savingsId}/archive`, { headers: commandHeaders(current.version) });
    expect(archived.ok(), 'archiving the account should succeed').toBeTruthy();

    await page.goto('/accounts');
    const archivedGroup = page.locator('details.archived-accounts');
    await expect(archivedGroup).toBeVisible();
    await archivedGroup.locator('summary').click();
    await expect(archivedGroup.getByText('Archivada · historial conservado')).toBeVisible();
    await archivedGroup.getByRole('link', { name: 'Ver actividad de Ahorros' }).click();
    await expect(page).toHaveURL(new RegExp(`/accounts/${seed.savingsId}$`));

    await expect(page.getByText('Cuenta archivada')).toBeVisible();
    const summary = page.getByRole('region', { name: 'Resumen de Ahorros' });
    await expect(summary).toBeVisible();
    expect(await readMinor(summary.locator('.account-detail-balance strong'))).toBe(savingsBalanceMinor);

    await expect(page.getByRole('list', { name: 'Actividad de Ahorros' })).toContainText('Principal → Ahorros');
    await expect(page.getByText('Principal → Ahorros')).toHaveCount(1);
    await expect(page.getByText('Has llegado al final de la actividad disponible.')).toBeVisible();
  });

  test('history continuation loads older activity past the first page and recovers from a stale cursor', async ({ page }) => {
    test.setTimeout(240_000);
    const budget = await seedReadyBudget(page);
    const principal = budget.accounts.find(account => account.name === 'Principal')!;
    const comida = budget.categories.find(category => category.name === 'Comida')!;

    // The history endpoint pages at 500 records, so reaching the continuation control on a
    // single account costs 501 deliberate seeded records. One CSV import request creates them.
    const bulkRows = 501;
    const lines = ['date,type,account,amountMinor,category,payee,memo'];
    for (let index = 0; index < bulkRows; index += 1) lines.push(`2026-08-01,SPENDING,${principal.id},100,${comida.id},Historial ${index},carga`);
    const beforeImport = await reloadBudget(page, budget.id);
    const imported = await page.request.post(`/api/v1/budgets/${budget.id}/transactions/import`, {
      headers: { 'content-type': 'text/csv; charset=utf-8', ...commandHeaders(beforeImport.version) },
      data: `${lines.join('\r\n')}\r\n`,
    });
    expect(imported.status(), 'the bulk history import should succeed').toBe(201);
    const importResult = (await imported.json()).data as { accepted: number; rejected: number };
    expect(importResult.accepted).toBe(bulkRows);
    expect(importResult.rejected).toBe(0);

    await page.goto(`/accounts/${principal.id}`);
    const rows = page.locator('[data-testid^="account-activity-"]');
    await expect(rows).toHaveCount(500, { timeout: 60_000 });
    const more = page.getByRole('button', { name: 'Cargar actividad anterior' });
    await expect(more).toBeVisible();
    await expect(page.getByText('Has llegado al final de la actividad disponible.')).toHaveCount(0);

    // The history changes between the first page and the continuation request.
    const current = await reloadBudget(page, budget.id);
    const extra = await postCommand(page, `/api/v1/budgets/${budget.id}/spending`, { amountMinor: 999, categoryId: comida.id, accountId: principal.id, date: '2026-08-02', payee: 'Extra' }, current.version);
    expect(extra.status()).toBe(201);

    await more.click();
    await expect(page.getByText('El historial cambió. Reinícialo para cargar la actividad actualizada.')).toBeVisible();
    await expect(rows, 'a stale continuation must not append a partial page').toHaveCount(500);
    await expect(page.getByRole('button', { name: 'Reiniciar historial' })).toBeVisible();

    await page.getByRole('button', { name: 'Reiniciar historial' }).click();
    await expect(rows).toHaveCount(500, { timeout: 60_000 });
    const moreAgain = page.getByRole('button', { name: 'Cargar actividad anterior' });
    await expect(moreAgain).toBeVisible();
    await moreAgain.click();
    await expect(rows, 'the continuation must load the records past the first page').toHaveCount(502, { timeout: 60_000 });
    await expect(page.getByText('Has llegado al final de la actividad disponible.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cargar actividad anterior' })).toHaveCount(0);
    await expect(page.locator('.account-history-error')).toHaveCount(0);
  });
});
