import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';

const password = 'playwright-password';
const openingBalanceMinor = 100000;
const spendingMinor = 2575;
const commandHeaders = (version: number) => ({ 'Idempotency-Key': randomUUID(), 'If-Match': `W/"${version}"` });
type Account = { id: string; name: string; archived: boolean; balanceMinor: number; clearedBalanceMinor: number };
type Budget = { id: string; version: number; accounts: Account[]; categories: { id: string; name: string }[] };

async function seed(page: Page): Promise<{ budget: Budget; account: Account; categoryId: string; spendingId: string }> {
  const request = page.request;
  const email = `cleared-${randomUUID()}@example.com`;
  expect((await request.post('/api/v1/auth/register', { data: { email, password } })).ok()).toBeTruthy();
  expect((await request.post('/api/v1/auth/sign-in', { data: { email, password } })).ok()).toBeTruthy();
  const created = await request.post('/api/v1/budgets', { data: {} });
  const setup = await request.put(`/api/v1/budgets/${(await created.json()).data.id}`, {
    data: { openingBalanceMinor, accountName: 'Principal', accountType: 'checking', categories: ['Comida'] },
  });
  const setupBudget = (await setup.json()).data as Budget;
  const account = setupBudget.accounts[0];
  const categoryId = setupBudget.categories[0].id;
  const spending = await request.post(`/api/v1/budgets/${setupBudget.id}/spending`, {
    data: { accountId: account.id, categoryId, amountMinor: spendingMinor, date: '2026-09-10', payee: 'Mercado' },
    headers: commandHeaders(setupBudget.version),
  });
  expect(spending.status()).toBe(201);
  const budget = await readBudget(page, setupBudget.id);
  return { budget, account: accountFor(budget, account.id), categoryId, spendingId: (await spending.json()).data.id as string };
}

async function readBudget(page: Page, budgetId: string): Promise<Budget> {
  const response = await page.request.get(`/api/v1/budgets/${budgetId}`);
  expect(response.ok()).toBeTruthy();
  return (await response.json()).data as Budget;
}

const accountFor = (budget: Budget, accountId: string) => budget.accounts.find(item => item.id === accountId)!;
const inputAmount = (minor: number) => `${Math.floor(Math.abs(minor) / 100)}.${String(Math.abs(minor) % 100).padStart(2, '0')}`;

test.describe('cleared account activity', () => {
  test('marks, matches, and confirms a mismatch only after review', async ({ page }) => {
    test.setTimeout(180_000);
    const seedData = await seed(page);
    const { budget, account, categoryId } = seedData;
    const commands: { url: string; headers: Record<string, string>; body: unknown }[] = [];
    page.on('request', request => {
      if (request.url().includes('/cleared') || request.url().includes('/reconciliation')) {
        commands.push({ url: request.url(), headers: request.headers(), body: request.postDataJSON() });
      }
    });

    await page.goto(`/accounts/${account.id}`);
    const summary = page.getByRole('region', { name: 'Resumen de Principal' });
    await expect(summary.getByText('Saldo actual')).toBeVisible();
    await expect(summary.getByText('Saldo marcado')).toBeVisible();
    const firstRow = page.getByTestId(`account-activity-${seedData.spendingId}`);
    await expect(firstRow.getByRole('button', { name: 'Marcar como revisado' })).toBeVisible();
    await firstRow.getByRole('button', { name: 'Marcar como revisado' }).click();
    await expect(firstRow.getByText('Marcado', { exact: true })).toBeVisible();
    const markedBudget = await readBudget(page, budget.id);
    expect(accountFor(markedBudget, account.id).balanceMinor).toBe(account.balanceMinor);
    expect(accountFor(markedBudget, account.id).clearedBalanceMinor).toBe(account.clearedBalanceMinor - spendingMinor);
    expect(commands[0].headers['if-match']).toBe(`W/"${budget.version}"`);
    expect(commands[0].headers['idempotency-key']).toBeTruthy();

    await page.getByRole('button', { name: 'Conciliar cuenta' }).click();
    let dialog = page.getByRole('dialog', { name: 'Conciliar cuenta' });
    await expect(dialog.getByText('Saldo marcado', { exact: true })).toBeVisible();
    await dialog.getByLabel('Saldo informado por el banco').fill(inputAmount(accountFor(markedBudget, account.id).clearedBalanceMinor));
    await dialog.getByRole('button', { name: 'Revisar saldo' }).click();
    await expect(firstRow.getByText('Conciliado', { exact: true })).toBeVisible();
    await expect(firstRow.getByRole('button')).toHaveCount(0);
    const matchingBudget = await readBudget(page, budget.id);
    expect(accountFor(matchingBudget, account.id).balanceMinor).toBe(accountFor(markedBudget, account.id).balanceMinor);
    expect(commands[1].headers['if-match']).toBe(`W/"${markedBudget.version}"`);
    expect(commands[1].headers['idempotency-key']).not.toBe(commands[0].headers['idempotency-key']);

    const nextSpending = await page.request.post(`/api/v1/budgets/${budget.id}/spending`, {
      data: { accountId: account.id, categoryId, amountMinor: 500, date: '2026-09-11', payee: 'Farmacia' },
      headers: commandHeaders(matchingBudget.version),
    });
    expect(nextSpending.status()).toBe(201);
    const nextSpendingId = (await nextSpending.json()).data.id as string;
    await page.reload();
    const nextRow = page.getByTestId(`account-activity-${nextSpendingId}`);
    await nextRow.getByRole('button', { name: 'Marcar como revisado' }).click();
    await expect(nextRow.getByText('Marcado', { exact: true })).toBeVisible();
    const beforeMismatch = await readBudget(page, budget.id);
    const externalBalance = accountFor(beforeMismatch, account.id).clearedBalanceMinor + 2000;

    await page.setViewportSize({ width: 320, height: 800 });
    await page.getByRole('button', { name: 'Conciliar cuenta' }).click();
    dialog = page.getByRole('dialog', { name: 'Conciliar cuenta' });
    await expect(dialog).toBeInViewport();
    await dialog.getByLabel('Saldo informado por el banco').fill(inputAmount(externalBalance));
    await dialog.getByRole('button', { name: 'Revisar saldo' }).click();
    await expect(dialog.getByText('Aún no se ha realizado ningún cambio.')).toBeVisible();
    await expect(dialog.getByText('Diferencia')).toBeVisible();
    await expect(dialog.locator('.reconciliation-mismatch strong')).toHaveText('20,00');
    await expect(nextRow.getByText('Marcado', { exact: true })).toBeVisible();
    const afterReview = await readBudget(page, budget.id);
    expect(accountFor(afterReview, account.id).balanceMinor).toBe(accountFor(beforeMismatch, account.id).balanceMinor);
    expect(accountFor(afterReview, account.id).clearedBalanceMinor).toBe(accountFor(beforeMismatch, account.id).clearedBalanceMinor);
    await expect(dialog.getByRole('button', { name: 'Confirmar y conciliar' })).toBeDisabled();
    await dialog.getByLabel('Motivo').fill('Diferencia del estado de cuenta');
    await dialog.getByLabel('Confirmo que deseo aplicar el ajuste').focus();
    await page.keyboard.press('Space');
    await expect(dialog.getByLabel('Confirmo que deseo aplicar el ajuste')).toBeChecked();
    const confirm = dialog.getByRole('button', { name: 'Confirmar y conciliar' });
    await confirm.focus();
    await page.keyboard.press('Enter');
    await expect(nextRow.getByText('Conciliado', { exact: true })).toBeVisible();
    expect(commands[4].headers['if-match']).toBe(`W/"${beforeMismatch.version}"`);
    expect(commands[4].headers['idempotency-key']).not.toBe(commands[3].headers['idempotency-key']);
    expect(commands[4].body).toMatchObject({ confirmAdjustment: true, reason: 'Diferencia del estado de cuenta' });
    await expect(page.getByText(/no se pueden desbloquear, revertir ni corregir/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /desbloquear|revertir|corregir/i })).toHaveCount(0);
  });

  test('an eligible movement on an archived account can still be marked', async ({ page }) => {
    test.setTimeout(180_000);
    const seedData = await seed(page);
    const created = await page.request.post(`/api/v1/budgets/${seedData.budget.id}/accounts`, {
      data: { name: 'Ahorros', kind: 'checking', openingBalanceMinor: 0 },
      headers: commandHeaders(seedData.budget.version),
    });
    expect(created.status()).toBe(201);
    const archivedAccount = (await created.json()).data.account as Account;
    const current = await readBudget(page, seedData.budget.id);
    const spending = await page.request.post(`/api/v1/budgets/${seedData.budget.id}/spending`, {
      data: { accountId: archivedAccount.id, categoryId: seedData.categoryId, amountMinor: 500, date: '2026-09-12', payee: 'Café' },
      headers: commandHeaders(current.version),
    });
    expect(spending.status()).toBe(201);
    const spendingId = (await spending.json()).data.id as string;
    const beforeArchive = await readBudget(page, seedData.budget.id);
    const archive = await page.request.post(`/api/v1/budgets/${seedData.budget.id}/accounts/${archivedAccount.id}/archive`, { headers: commandHeaders(beforeArchive.version) });
    expect(archive.ok()).toBeTruthy();

    await page.goto(`/accounts/${archivedAccount.id}`);
    const row = page.getByTestId(`account-activity-${spendingId}`);
    await row.getByRole('button', { name: 'Marcar como revisado' }).click();
    await expect(row.getByText('Marcado', { exact: true })).toBeVisible();
    expect(accountFor(await readBudget(page, seedData.budget.id), archivedAccount.id).clearedBalanceMinor).toBe(-500);
  });
});
