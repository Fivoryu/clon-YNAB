import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';

const password = 'playwright-password';
const monthNow = new Date().toISOString().slice(0, 7);
const shiftMonth = (month: string, delta: number) => {
  const [year, index] = month.split('-').map(Number);
  return new Date(Date.UTC(year, index - 1 + delta, 1)).toISOString().slice(0, 7);
};
const monthLabel = (month: string) => {
  const [year, index] = month.split('-').map(Number);
  return new Intl.DateTimeFormat('es-BO', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(year, index - 1, 1)));
};
const commandHeaders = (version: number) => ({ 'Idempotency-Key': randomUUID(), 'If-Match': `W/"${version}"` });

type Seed = { id: string; version: number; categories: { id: string; name: string }[] };
async function seedBudget(page: Page): Promise<Seed> {
  const email = `targets-${randomUUID()}@example.com`;
  expect((await page.request.post('/api/v1/auth/register', { data: { email, password } })).ok()).toBeTruthy();
  expect((await page.request.post('/api/v1/auth/sign-in', { data: { email, password } })).ok()).toBeTruthy();
  const created = await page.request.post('/api/v1/budgets', { data: {} });
  const budget = (await created.json()).data;
  const setup = await page.request.put(`/api/v1/budgets/${budget.id}`, {
    data: { openingBalanceMinor: 10000, accountName: 'Principal', accountType: 'checking', categories: ['Comida', 'Transporte'] },
  });
  expect(setup.ok()).toBeTruthy();
  return (await setup.json()).data as Seed;
}

async function reloadBudget(page: Page, budgetId: string): Promise<Seed> {
  const response = await page.request.get(`/api/v1/budgets/${budgetId}`);
  expect(response.ok()).toBeTruthy();
  return (await response.json()).data as Seed;
}

test('owners manage targets in context and confirm a distinct suggestion by keyboard', async ({ page }) => {
  test.setTimeout(90_000);
  const budget = await seedBudget(page);
  const food = budget.categories.find(category => category.name === 'Comida')!;
  const transport = budget.categories.find(category => category.name === 'Transporte')!;
  const writes: { method: string; path: string; headers: Record<string, string>; body: unknown }[] = [];
  const assignments: { headers: Record<string, string>; body: unknown }[] = [];
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    if (path.endsWith('/target')) writes.push({ method: request.method(), path, headers: request.headers(), body: request.postData() ? request.postDataJSON() : undefined });
    if (path.endsWith('/allocations') && request.method() === 'POST') assignments.push({ headers: request.headers(), body: request.postDataJSON() });
  });

  await page.goto('/budget');
  const foodRow = page.getByTestId(`category-${food.id}`);
  const transportRow = page.getByTestId(`category-${transport.id}`);
  await expect(foodRow.locator('.target-state')).toHaveCount(0);
  await expect(foodRow.locator('.target-suggestion')).toHaveCount(0);
  await expect(transportRow.locator('.target-state')).toHaveCount(0);

  await foodRow.getByRole('button', { name: 'Definir objetivo' }).click();
  await foodRow.getByLabel('Tipo de objetivo').selectOption('MONTHLY_SET_ASIDE');
  await foodRow.getByLabel('Monto objetivo').fill('50.00');
  await foodRow.getByRole('button', { name: 'Guardar objetivo' }).click();
  const setAsideState = foodRow.locator('.target-state');
  await expect(setAsideState).toContainText('Apartado mensual');
  await expect(setAsideState).not.toContainText('Mes objetivo');
  for (const label of ['Monto objetivo', 'Apartado este mes', 'Falta', 'Estado']) await expect(setAsideState).toContainText(label);
  await expect(setAsideState.locator('dl > div').nth(1)).toContainText('0,00');
  await expect(setAsideState.locator('dl > div').nth(2)).toContainText('50,00');
  await expect(setAsideState).toContainText('50,00');
  await expect(setAsideState).toContainText('En progreso');
  await expect(setAsideState.locator('.target-disclosure')).toHaveCount(0, 'the current month is not a past month');
  await page.getByRole('button', { name: 'Mes anterior' }).click();
  const pastDisclosure = foodRow.locator('.target-state .target-disclosure');
  await expect(pastDisclosure).toBeVisible();
  await expect(pastDisclosure).toContainText('Se muestra la definición actual');
  await page.getByRole('button', { name: 'Mes siguiente' }).click();
  await expect(foodRow.locator('.target-state')).toContainText('Apartado mensual');
  expect(writes[0].body).toEqual({ kind: 'MONTHLY_SET_ASIDE', amountMinor: 5000 });
  expect(writes[0].method).toBe('PUT');
  expect(writes[0].path).toBe(`/api/v1/budgets/${budget.id}/categories/${food.id}/target`);
  expect(writes[0].headers['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/i);
  expect(writes[0].headers['if-match']).toBe(`W/"${budget.version}"`);
  expect(Object.keys(writes[0].body as object).sort()).toEqual(['amountMinor', 'kind']);

  let current = await reloadBudget(page, budget.id);
  const futureMonth = shiftMonth(monthNow, 1);
  await foodRow.getByRole('button', { name: 'Editar objetivo' }).click();
  await foodRow.getByLabel('Tipo de objetivo').selectOption('BALANCE_BY_DATE');
  await expect(foodRow.getByLabel('Mes objetivo')).toHaveValue('');
  await foodRow.getByLabel('Monto objetivo').fill('150.00');
  await foodRow.getByLabel('Mes objetivo').fill(futureMonth);
  await foodRow.getByRole('button', { name: 'Guardar objetivo' }).click();
  const datedState = foodRow.locator('.target-state');
  await expect(datedState).toContainText('Saldo para una fecha');
  for (const label of ['Monto objetivo', 'Mes objetivo', 'Saldo actual', 'Falta', 'Estado']) await expect(datedState).toContainText(label);
  await expect(datedState.locator('dl > div').nth(2)).toContainText('0,00');
  await expect(datedState.locator('dl > div').nth(3)).toContainText('150,00');
  await expect(datedState).toContainText('150,00');
  await expect(datedState).toContainText(monthLabel(futureMonth));
  await expect(datedState).toContainText('Se muestra la definición actual');
  await expect(datedState).toContainText('no se conserva el historial del objetivo');
  const targetText = await page.getByRole('main').innerText();
  expect(targetText).not.toMatch(/MONTHLY_SET_ASIDE|BALANCE_BY_DATE|amountMinor|targetMonth|progressMinor|remainingMinor|UNDERFUNDED|OVERDUE/);
  expect(writes[1].body).toEqual({ kind: 'BALANCE_BY_DATE', amountMinor: 15000, targetMonth: futureMonth });
  expect(writes[1].path).toBe(writes[0].path);
  expect(writes[1].headers['if-match']).toBe(`W/"${current.version}"`);
  expect(writes[1].headers['idempotency-key']).not.toBe(writes[0].headers['idempotency-key']);

  current = await reloadBudget(page, budget.id);
  const overAssignment = await page.request.post(`/api/v1/budgets/${budget.id}/allocations`, {
    data: { categoryId: transport.id, amountMinor: 15000, month: monthNow }, headers: commandHeaders(current.version),
  });
  expect(overAssignment.ok()).toBeTruthy();
  await page.reload();
  await page.setViewportSize({ width: 360, height: 780 });
  await expect(page.locator('.rta-card strong')).toHaveClass(/negative/);
  const suggestion = foodRow.locator('.target-suggestion');
  await expect(suggestion).toBeVisible();
  await expect(suggestion).toContainText('Sugerencia');
  await expect(suggestion).toContainText('No forma parte de tu disponible para asignar');
  await expect(transportRow).toHaveCount(1, 'the untargeted category row must exist for its absence of a suggestion to mean anything');
  await expect(transportRow.locator('.target-suggestion')).toHaveCount(0);
  await expect(foodRow.locator('.target-state')).toBeVisible();
  expect(await foodRow.locator('.target-state').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);

  current = await reloadBudget(page, budget.id);
  expect(assignments).toHaveLength(0);
  await suggestion.getByRole('button', { name: 'Revisar sugerencia' }).click();
  const confirm = suggestion.getByRole('button', { name: 'Confirmar asignación' });
  await confirm.focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => assignments.length).toBe(1);
  expect(assignments[0].body).toEqual({ categoryId: food.id, amountMinor: 15000, month: monthNow });
  expect(assignments[0].headers['if-match']).toBe(`W/"${current.version}"`);
  expect(assignments[0].headers['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/i);
  const metState = foodRow.locator('.target-state');
  await expect(metState).toContainText('Cumplida');
  await expect(metState.locator('dl > div').nth(2)).toContainText('150,00');
  await expect(metState.locator('dl > div').nth(3)).toContainText('0,00');
  await expect(foodRow.locator('.target-suggestion')).toHaveCount(0);

  const pastMonth = shiftMonth(monthNow, -1);
  current = await reloadBudget(page, budget.id);
  await foodRow.getByRole('button', { name: 'Editar objetivo' }).click();
  await foodRow.getByLabel('Monto objetivo').fill('200.00');
  await foodRow.getByLabel('Mes objetivo').fill(pastMonth);
  await foodRow.getByRole('button', { name: 'Guardar objetivo' }).click();
  await expect(foodRow.locator('.target-state')).toContainText('Vencida');
  await expect(foodRow.locator('.target-state')).toContainText('Falta');
  expect(writes[2].body).toEqual({ kind: 'BALANCE_BY_DATE', amountMinor: 20000, targetMonth: pastMonth });
  expect(writes[2].headers['if-match']).toBe(`W/"${current.version}"`);
  expect(writes[2].headers['idempotency-key']).not.toBe(writes[1].headers['idempotency-key']);

  current = await reloadBudget(page, budget.id);
  await foodRow.getByRole('button', { name: 'Quitar objetivo' }).click();
  await expect(foodRow.locator('.target-state')).toHaveCount(0);
  await expect(foodRow.locator('.target-suggestion')).toHaveCount(0);
  expect(writes.at(-1)?.method).toBe('DELETE');
  expect(writes.at(-1)?.path).toBe(writes[0].path);
  expect(writes.at(-1)?.headers['if-match']).toBe(`W/"${current.version}"`);
  expect(writes.at(-1)?.body).toBeUndefined();
  expect(writes.at(-1)?.headers['idempotency-key']).not.toBe(writes.at(-2)?.headers['idempotency-key']);
  const visibleText = await page.getByRole('main').innerText();
  expect(visibleText).not.toMatch(/MONTHLY_SET_ASIDE|BALANCE_BY_DATE|amountMinor|targetMonth|progressMinor|remainingMinor|UNDERFUNDED|OVERDUE/);
});
