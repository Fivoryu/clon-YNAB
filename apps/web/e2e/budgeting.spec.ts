import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

const password = 'playwright-password';

async function registerThroughUi(page: any) {
  const email = `ux-${randomUUID()}@example.com`;
  await page.goto('/register');
  await page.getByLabel('Correo').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByLabel('Repite la contraseña').fill(password);
  await page.getByRole('button', { name: 'Crear cuenta y continuar' }).click();
  await expect(page).toHaveURL(/\/setup/);
  return email;
}

async function seedReadyBudget(page: any) {
  const email = `ready-${randomUUID()}@example.com`;
  const request = page.request;
  const register = await request.post('/api/v1/auth/register', { data: { email, password } });
  expect(register.ok()).toBeTruthy();
  const signIn = await request.post('/api/v1/auth/sign-in', { data: { email, password } });
  expect(signIn.ok()).toBeTruthy();
  const created = await request.post('/api/v1/budgets', { data: {} });
  const budget = (await created.json()).data;
  const setup = await request.put(`/api/v1/budgets/${budget.id}`, { data: { openingBalanceMinor: 100000, accountName: 'Principal', accountType: 'checking', categories: ['Comida', 'Transporte'] } });
  expect(setup.ok()).toBeTruthy();
  return (await setup.json()).data;
}

test('new user moves from registration to focused onboarding and budget without resume clicks', async ({ page }) => {
  await registerThroughUi(page);
  await expect(page.getByRole('heading', { name: 'Tu cuenta principal' })).toBeVisible();
  await page.getByLabel('Nombre').fill('Banco');
  await page.getByLabel('Saldo actual').fill('1250.50');
  await page.getByRole('button', { name: 'Guardar y continuar' }).click();
  await expect(page.getByRole('heading', { name: 'Elige tus primeras categorías' })).toBeVisible();
  await page.getByLabel('Nueva categoría').fill('Salud');
  await page.getByRole('button', { name: 'Agregar' }).click();
  await page.getByRole('button', { name: 'Revisar' }).click();
  await expect(page.getByRole('heading', { name: 'Tu presupuesto empieza con esto' })).toBeVisible();
  await page.getByRole('button', { name: 'Abrir mi presupuesto' }).click();
  await expect(page).toHaveURL(/\/budget/);
  await expect(page.getByText('Disponible para asignar')).toBeVisible();
  await expect(page.getByText(/1[.\s]?250,50|1,250\.50/)).toBeVisible();
});

test('daily workflow uses routed budget, one transaction dialog, automatic history, and browser navigation', async ({ page }) => {
  await seedReadyBudget(page);
  await page.goto('/budget');
  await expect(page.getByRole('heading', { name: 'Presupuesto' })).toBeVisible();
  const food = page.getByTestId(/category-/).filter({ hasText: 'Comida' });
  await food.getByRole('button', { name: 'Ajustar' }).click();
  await food.getByLabel('Monto a agregar').fill('300.00');
  await food.getByRole('button', { name: 'Guardar cambio' }).click();
  await page.getByRole('link', { name: 'Transacciones' }).click();
  await expect(page).toHaveURL(/\/transactions/);
  await page.getByRole('button', { name: '+ Nueva transacción' }).click();
  await page.getByLabel('Monto').fill('25.75');
  await page.getByLabel('Categoría').selectOption({ label: 'Comida' });
  await page.getByLabel('Comercio / persona').fill('Mercado');
  await page.getByRole('button', { name: 'Guardar transacción' }).click();
  await expect(page.getByRole('region', { name: 'Historial de transacciones' })).toContainText('Mercado');
  await expect(page.getByRole('region', { name: 'Historial de transacciones' })).toContainText(/25,75|25\.75/);
  await page.getByRole('link', { name: 'Cuentas' }).click();
  await expect(page).toHaveURL(/\/accounts/);
  await page.goBack();
  await expect(page).toHaveURL(/\/transactions/);
});

test('unreleased income remains actionable after reload', async ({ page }) => {
  const budget = await seedReadyBudget(page);
  const current = (await (await page.request.get(`/api/v1/budgets/${budget.id}`)).json()).data;
  const income = await page.request.post(`/api/v1/budgets/${budget.id}/income`, { data: { amountMinor: 45000, accountId: current.account.id, date: '2026-09-17', payee: 'Cliente' }, headers: { 'Idempotency-Key': randomUUID(), 'If-Match': `W/"${current.version}"` } });
  expect(income.ok()).toBeTruthy();
  await page.goto('/transactions');
  await expect(page.getByText('Libera el dinero que ya recibiste')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: /Cliente.*Liberar/ })).toBeVisible();
  await page.getByRole('button', { name: /Cliente.*Liberar/ }).click();
  await expect(page.getByText('Libera el dinero que ya recibiste')).toHaveCount(0);
});

test('CSV lives under settings instead of daily navigation', async ({ page }) => {
  await seedReadyBudget(page);
  await page.goto('/settings/data');
  await expect(page.getByRole('heading', { name: 'Configuración' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Importar y exportar CSV' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Descargar CSV' })).toBeVisible();
  await page.getByRole('link', { name: 'Presupuesto' }).click();
  await expect(page.getByText('Importar y exportar transacciones')).toHaveCount(0);
});
