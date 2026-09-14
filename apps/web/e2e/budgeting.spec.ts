import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';

test('completes the first-slice budgeting journey with server-reported values', async ({ page }) => {
  const email = `ynab-e2e-${randomUUID()}@example.com`;
  const password = 'playwright-password';
  const summary = page.getByLabel('Month summary');
  const category = (name: string) => summary.getByRole('listitem').filter({ hasText: name });
  const summaryValue = (label: string) => summary.locator('dt').filter({ hasText: new RegExp(`^${label}$`) }).locator('..').locator('dd');

  await page.goto('/');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('status')).toHaveText('Account created. Sign in to continue.');

  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('status')).toHaveText('Signed in. Start or resume your budget setup.');
  await page.getByRole('button', { name: 'Start or resume setup' }).click();
  await expect(page.getByRole('heading', { name: 'Budget setup' })).toBeVisible();

  await page.getByLabel('Account name').fill('Checking');
  await page.getByLabel('Opening balance (minor units)').fill('500');
  await page.getByLabel('Categories (comma separated)').fill('Bills, Food');
  await page.getByRole('button', { name: 'Save and complete setup' }).click();
  await expect(page.getByRole('status')).toHaveText('Setup complete. Your budget is ready.');
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

  await page.getByRole('button', { name: 'Load dashboard' }).click();
  await expect(summaryValue('Account balance')).toHaveText('500 minor units');
  await page.getByRole('button', { name: 'Load month summary' }).click();
  await expect(summary.getByRole('heading', { name: /Month summary/ })).toBeVisible();

  const incomeForm = page.locator('form').filter({ has: page.getByRole('heading', { name: 'Record income' }) });
  const assignmentForm = page.locator('form').filter({ has: page.getByRole('heading', { name: /^Assign$/ }) });
  const spendingForm = page.locator('form').filter({ has: page.getByRole('heading', { name: 'Record spending' }) });

  await incomeForm.getByLabel('Amount (minor units)').fill('1000');
  await incomeForm.getByRole('button', { name: 'Record income' }).click();
  await expect(page.getByRole('status')).toHaveText('Income recorded. Release it explicitly before assigning it.');
  await expect(summaryValue('Unreleased income')).toHaveText('1000 minor units');

  await incomeForm.getByRole('button', { name: 'Release income' }).click();
  await expect(page.getByRole('status')).toHaveText('Income released and ready to assign.');
  await expect(summaryValue('Released income')).toHaveText('1000 minor units');
  await expect(summaryValue('Unreleased income')).toHaveText('0 minor units');

  await assignmentForm.getByLabel('Amount (minor units)').fill('600');
  await assignmentForm.getByLabel('Assignment category').selectOption({ label: 'Bills' });
  await assignmentForm.getByRole('button', { name: 'Assign money' }).click();
  await expect(page.getByRole('status')).toHaveText('Money assigned.');
  await expect(summaryValue('Ready to assign')).toHaveText('900 minor units');
  await expect(category('Bills')).toContainText('Assigned: 600');

  await spendingForm.getByLabel('Amount (minor units)').fill('150');
  await spendingForm.getByLabel('Spending category').selectOption({ label: 'Bills' });
  await spendingForm.getByRole('button', { name: 'Record spending' }).click();
  await expect(page.getByRole('status')).toHaveText('Spending recorded.');
  await expect(summaryValue('Account balance')).toHaveText('1350 minor units');
  await expect(category('Bills')).toContainText('Assigned: 600 · Available: 450 · Activity: -150');
});

test('supports focused transaction history correction and deletion', async ({ page }) => {
  const email = `history-e2e-${randomUUID()}@example.com`;
  const password = 'playwright-password';
  const request = page.request;
  const post = async (path: string, body: unknown, headers: Record<string, string> = {}) => {
    const response = await request.post(path, { data: body, headers: { 'Idempotency-Key': randomUUID(), ...headers } });
    expect(response.ok()).toBeTruthy();
    return response.json() as Promise<{ data: any }>;
  };
  await post('/api/v1/auth/register', { email, password });
  await post('/api/v1/auth/sign-in', { email, password });
  const created = await post('/api/v1/budgets', {});
  const budgetId = created.data.id;
  await request.put(`/api/v1/budgets/${budgetId}`, { data: { openingBalanceMinor: 500, categories: ['Bills', 'Food'] } });
  const budget = await (await request.get(`/api/v1/budgets/${budgetId}`)).json() as { data: any };
  const bills = budget.data.categories.find((category: any) => category.name === 'Bills').id;
  const food = budget.data.categories.find((category: any) => category.name === 'Food').id;
  await post(`/api/v1/budgets/${budgetId}/spending`, { amountMinor: 150, categoryId: bills, date: '2026-02-10' });
  await post(`/api/v1/budgets/${budgetId}/spending`, { amountMinor: 40, categoryId: bills, date: '2026-02-12' });
  await post(`/api/v1/budgets/${budgetId}/income`, { amountMinor: 1000, date: '2026-02-15' });
  const history = await (await request.get(`/api/v1/budgets/${budgetId}/transactions`)).json() as { data: any };
  const income = history.data.items.find((item: any) => item.kind === 'INCOME');
  const seed = history.data.items.find((item: any) => item.amountMinor === 150);
  const retained = history.data.items.find((item: any) => item.amountMinor === 40);
  await post(`/api/v1/budgets/${budgetId}/income/${income.transactionId}/release`, {}, { 'If-Match': `W/"${history.data.version}"` });
  await request.post(`/api/v1/budgets/${budgetId}/categories/${bills}/archive`);

  await page.goto('/');
  await page.getByRole('button', { name: 'Start or resume setup' }).click();
  await expect(page.getByRole('heading', { name: 'Transaction history' })).toBeVisible();
  const historySection = page.getByRole('region', { name: 'Transaction history' });
  await historySection.getByRole('button', { name: 'Load history' }).click();
  await expect(historySection.getByTestId(`transaction-${seed.transactionId}`)).toContainText('150 minor units');
  await expect(historySection).toContainText('Bills (archived)');
  await expect(historySection).toContainText('Protected · released income');

  const seedRow = historySection.getByTestId(`transaction-${seed.transactionId}`);
  await seedRow.getByRole('button', { name: 'Edit' }).click();
  const editForm = seedRow.locator('form');
  await editForm.getByLabel('Amount (minor units)').fill('175');
  await editForm.getByLabel('Date').fill('2026-02-11');
  await editForm.getByLabel('Category').selectOption(food);
  await editForm.getByRole('button', { name: 'Save history edit' }).click();
  await expect(page.getByRole('status')).toHaveText('Transaction updated.');
  await expect(historySection.getByTestId(`transaction-${seed.transactionId}`)).toContainText('175 minor units');
  await expect(historySection.getByTestId(`transaction-${seed.transactionId}`)).toContainText('Food');

  const retainedRow = historySection.getByTestId(`transaction-${retained.transactionId}`);
  await retainedRow.getByRole('button', { name: 'Edit' }).click();
  const retainedEditForm = retainedRow.locator('form');
  await retainedEditForm.getByLabel('Amount (minor units)').fill('45');
  await retainedEditForm.getByRole('button', { name: 'Save history edit' }).click();
  await expect(retainedRow).toContainText('Bills (archived)');

  await retainedRow.getByRole('button', { name: 'Delete' }).click();
  await expect(retainedRow.getByRole('textbox', { name: 'Delete reason (optional)' })).toBeVisible();
  await retainedRow.getByRole('textbox', { name: 'Delete reason (optional)' }).fill('Entered by mistake');
  await retainedRow.getByRole('button', { name: 'Confirm delete' }).click();
  await expect(page.getByRole('status')).toHaveText('Transaction deleted.');
  await expect(historySection.getByTestId(`transaction-${retained.transactionId}`)).toHaveCount(0);
  const accountBalance = page.getByLabel('Month summary').locator('dt').filter({ hasText: /^Account balance$/ }).locator('..').locator('dd');
  await expect(accountBalance).toHaveText('1325 minor units');
});
