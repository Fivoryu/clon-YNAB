import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';

const password = 'playwright-password';
const today = new Date().toISOString().slice(0, 10);
const headers = (version: number) => ({ 'Idempotency-Key': randomUUID(), 'If-Match': `W/"${version}"` });
type Budget = { id: string; version: number; accounts: { id: string; name: string }[]; categories: { id: string; name: string }[] };
type Write = { method: string; path: string; headers: Record<string, string>; body: unknown };

async function seed(page: Page): Promise<Budget> {
  const email = `schedules-${randomUUID()}@example.com`;
  expect((await page.request.post('/api/v1/auth/register', { data: { email, password } })).ok()).toBeTruthy();
  expect((await page.request.post('/api/v1/auth/sign-in', { data: { email, password } })).ok()).toBeTruthy();
  const created = await page.request.post('/api/v1/budgets', { data: {} });
  const setup = await page.request.put(`/api/v1/budgets/${(await created.json()).data.id}`, {
    data: { openingBalanceMinor: 10000, accountName: 'Principal', accountType: 'checking', categories: ['Comida'] },
  });
  expect(setup.ok()).toBeTruthy();
  return (await setup.json()).data as Budget;
}

async function readBudget(page: Page, id: string): Promise<Budget> {
  const response = await page.request.get(`/api/v1/budgets/${id}`);
  expect(response.ok()).toBeTruthy();
  return (await response.json()).data as Budget;
}

test('owners manage, generate, replay, and remove account schedules accessibly', async ({ page }) => {
  test.setTimeout(120_000);
  const budget = await seed(page);
  const checking = budget.accounts[0];
  const categoryId = budget.categories[0].id;
  const cashResponse = await page.request.post(`/api/v1/budgets/${budget.id}/accounts`, {
    data: { name: 'Efectivo', kind: 'cash', openingBalanceMinor: 0 }, headers: headers(budget.version),
  });
  expect(cashResponse.status()).toBe(201);
  const cash = (await cashResponse.json()).data.account as { id: string; name: string };
  const writes: Write[] = [];
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    if (path.includes('/schedules') && request.method() !== 'GET') writes.push({
      method: request.method(), path, headers: request.headers(), body: request.postData() ? request.postDataJSON() : undefined,
    });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/accounts/${checking.id}`);
  const manager = page.getByRole('region', { name: 'Movimientos periódicos' });
  await expect(manager).toBeVisible();
  await expect(manager.getByText('No hay movimientos periódicos para esta cuenta')).toBeVisible();
  await expect(manager).toContainText('No es posible modificar un movimiento periódico');
  await expect(manager).toContainText('Los movimientos registrados aparecen en el historial como cualquier otro movimiento');
  expect(await manager.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);

  await manager.getByLabel('Tipo de movimiento').selectOption('SPENDING');
  await manager.getByLabel('Categoría').selectOption(categoryId);
  await manager.getByLabel('Monto del movimiento').fill('25.50');
  await manager.getByLabel('Persona o comercio').fill('Compra del mes');
  const save = manager.getByRole('button', { name: 'Guardar movimiento periódico' });
  const beforeSpending = await readBudget(page, budget.id);
  await save.focus();
  await page.keyboard.press('Enter');
  await expect(manager.getByText('Compra del mes')).toBeVisible();
  expect(writes[0].body).toEqual({ accountId: checking.id, categoryId, flow: 'SPENDING', amountMinor: 2550, payee: 'Compra del mes', dayOfMonth: Number(today.slice(-2)), intervalMonths: 1, startDate: today });
  expect(writes[0].body).not.toHaveProperty('id');
  expect(writes[0].headers['if-match']).toBe(`W/"${beforeSpending.version}"`);
  expect(writes[0].headers['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/i);

  await page.goto(`/accounts/${cash.id}`);
  const cashManager = page.getByRole('region', { name: 'Movimientos periódicos' });
  await expect(cashManager.getByText('No hay movimientos periódicos para esta cuenta')).toBeVisible();
  await cashManager.getByLabel('Tipo de movimiento').selectOption('INCOME');
  await expect(cashManager.getByLabel('Categoría')).toHaveCount(0);
  await cashManager.getByLabel('Monto del movimiento').fill('40.00');
  await cashManager.getByLabel('Persona o comercio').fill('Ingreso mensual');
  const beforeIncome = await readBudget(page, budget.id);
  await cashManager.getByRole('button', { name: 'Guardar movimiento periódico' }).click();
  await expect(cashManager.getByText('Ingreso mensual')).toBeVisible();
  expect(writes[1].body).toEqual({ accountId: cash.id, categoryId: null, flow: 'INCOME', amountMinor: 4000, payee: 'Ingreso mensual', dayOfMonth: Number(today.slice(-2)), intervalMonths: 1, startDate: today });
  expect(writes[1].body).toHaveProperty('categoryId', null);
  expect(writes[1].body).not.toHaveProperty('id');
  expect(writes[1].headers['if-match']).toBe(`W/"${beforeIncome.version}"`);
  expect(writes[1].headers['idempotency-key']).not.toBe(writes[0].headers['idempotency-key']);

  await cashManager.getByLabel('Fecha límite').fill(today);
  const generate = cashManager.getByRole('button', { name: 'Registrar movimientos hasta esta fecha' });
  const beforeGeneration = await readBudget(page, budget.id);
  await generate.click();
  const cashRows = page.locator('.account-history-list .transaction-row');
  await expect(cashRows).toHaveCount(1);
  await expect(cashRows.first()).toContainText('Ingreso mensual');
  await expect(cashRows.first().getByTestId(/cleared-state-/)).toHaveText('Marcado');
  expect(writes[2].body).toEqual({ cutoffDate: today });
  expect(writes[2].headers['if-match']).toBe(`W/"${beforeGeneration.version}"`);
  expect(writes[2].headers['idempotency-key']).not.toBe(writes[1].headers['idempotency-key']);

  const beforeReplay = await readBudget(page, budget.id);
  await generate.click();
  await expect(cashRows).toHaveCount(1);
  expect(writes[3].body).toEqual({ cutoffDate: today });
  expect(writes[3].headers['if-match']).toBe(`W/"${beforeReplay.version}"`);
  expect(writes[3].headers['idempotency-key']).not.toBe(writes[2].headers['idempotency-key']);
  expect(await cashRows.allTextContents()).toHaveLength(1);

  await page.goto(`/accounts/${checking.id}`);
  const checkingManager = page.getByRole('region', { name: 'Movimientos periódicos' });
  const spendRow = page.locator('.account-history-list .transaction-row');
  await expect(spendRow).toHaveCount(1);
  await expect(spendRow.first()).toContainText('Compra del mes');
  await expect(spendRow.first().getByTestId(/cleared-state-/)).toHaveText('Pendiente');
  const schedule = checkingManager.locator('.schedule-item').filter({ hasText: 'Compra del mes' });
  const currentSchedules = await page.request.get(`/api/v1/budgets/${budget.id}/schedules`);
  const scheduleId = ((await currentSchedules.json()).data.schedules as { id: string; accountId: string }[]).find(item => item.accountId === checking.id)!.id;
  const beforeRemove = await readBudget(page, budget.id);
  const remove = schedule.getByRole('button', { name: 'Quitar' });
  await remove.focus();
  await page.keyboard.press('Enter');
  await expect(schedule).toHaveCount(0);
  await expect(spendRow).toHaveCount(1, 'removing a schedule must retain its already registered history');
  expect(writes[4].method).toBe('DELETE');
  expect(writes[4].path).toBe(`/api/v1/budgets/${budget.id}/schedules/${scheduleId}`);
  expect(writes[4].body).toBeUndefined();
  expect(writes[4].headers['if-match']).toBe(`W/"${beforeRemove.version}"`);
  expect(writes[4].headers['idempotency-key']).not.toBe(writes[0].headers['idempotency-key']);
  const visible = await page.getByRole('main').innerText();
  expect(visible).not.toMatch(/INCOME|SPENDING|amountMinor|categoryId|dayOfMonth|intervalMonths|startDate|idempotency|endpoint|UUID/);
});
