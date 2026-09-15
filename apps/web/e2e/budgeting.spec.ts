import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';

const openSection = async (page: any, name: 'Overview' | 'Plan' | 'Activity' | 'Accounts' | 'History' | 'Data') => {
  await page.getByRole('navigation', { name: 'Budget workspace' }).getByRole('button', { name: new RegExp(`^${name}`) }).click();
};

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
  await expect(page.getByRole('heading', { name: 'Prepare your workspace.' })).toBeVisible();

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

  await openSection(page, 'Activity');
  const incomeForm = page.locator('form').filter({ has: page.getByRole('heading', { name: 'Record income' }) });
  const spendingForm = page.locator('form').filter({ has: page.getByRole('heading', { name: 'Record spending' }) });

  await incomeForm.getByLabel('Amount (minor units)').fill('1000');
  await incomeForm.getByRole('button', { name: 'Record income' }).click();
  await expect(page.getByRole('status')).toHaveText('Income recorded. Release it explicitly before assigning it.');
  await openSection(page, 'Overview');
  await expect(summaryValue('Unreleased income')).toHaveText('1000 minor units');
  await openSection(page, 'Activity');

  await incomeForm.getByRole('button', { name: 'Release income' }).click();
  await expect(page.getByRole('status')).toHaveText('Income released and ready to assign.');
  await openSection(page, 'Overview');
  await expect(summaryValue('Released income')).toHaveText('1000 minor units');
  await expect(summaryValue('Unreleased income')).toHaveText('0 minor units');
  await openSection(page, 'Plan');
  const assignmentForm = page.locator('form').filter({ has: page.getByRole('heading', { name: /^Assign$/ }) });

  await assignmentForm.getByLabel('Amount (minor units)').fill('600');
  await assignmentForm.getByLabel('Assignment category').selectOption({ label: 'Bills' });
  await assignmentForm.getByRole('button', { name: 'Assign money' }).click();
  await expect(page.getByRole('status')).toHaveText('Money assigned.');
  await openSection(page, 'Overview');
  await expect(summaryValue('Ready to assign')).toHaveText('900 minor units');
  await expect(category('Bills')).toContainText('Assigned: 600');
  await openSection(page, 'Activity');

  await spendingForm.getByLabel('Amount (minor units)').fill('150');
  await spendingForm.getByLabel('Spending category').selectOption({ label: 'Bills' });
  await spendingForm.getByRole('button', { name: 'Record spending' }).click();
  await expect(page.getByRole('status')).toHaveText('Spending recorded.');
  await openSection(page, 'Overview');
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
  await openSection(page, 'History');
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
  await openSection(page, 'Overview');
  const accountBalance = page.getByLabel('Month summary').locator('dt').filter({ hasText: /^Account balance$/ }).locator('..').locator('dd');
  await expect(accountBalance).toHaveText('1325 minor units');
});

test('integrates account lifecycle and transfers from server projections', async ({ page }) => {
  const email = `accounts-e2e-${randomUUID()}@example.com`;
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
  await request.put(`/api/v1/budgets/${budgetId}`, { data: { openingBalanceMinor: 1000, accountName: 'Checking', categories: ['Bills'] } });

  await page.goto('/');
  await page.getByRole('button', { name: 'Start or resume setup' }).click();
  await openSection(page, 'Accounts');
  await expect(page.getByRole('heading', { name: 'Accounts', exact: true })).toBeVisible();
  const accounts = page.getByRole('region', { name: 'Accounts' });
  await expect(accounts.getByText('Checking', { exact: true })).toBeVisible();
  const summary = page.getByLabel('Month summary');
  const rta = () => summary.getByText(/Ready to assign/).locator('..');
  const category = () => summary.getByRole('listitem').filter({ hasText: 'Bills' });
  await accounts.getByRole('button', { name: 'Create account' }).click();
  await accounts.getByLabel('New account name').fill('Cash');
  await accounts.getByLabel('New account kind').selectOption('cash');
  await accounts.getByRole('button', { name: 'Save account' }).click();
  await expect(accounts.getByText('Cash', { exact: true })).toBeVisible();
  await accounts.getByRole('button', { name: 'Create account' }).click();
  await accounts.getByLabel('New account name').fill('Archive me');
  await accounts.getByLabel('New account kind').selectOption('cash');
  await accounts.getByRole('button', { name: 'Save account' }).click();
  const archived = accounts.getByTestId(/account-/).filter({ hasText: 'Archive me' });
  await archived.getByRole('button', { name: 'Archive' }).click();
  await expect(archived).toContainText('Archived');

  await openSection(page, 'Overview');
  await page.getByRole('button', { name: 'Load month summary' }).click();
  const beforeRta = await rta().locator('dd').innerText();
  const beforeCategory = await category().locator('span').innerText();
  await openSection(page, 'Activity');
  await page.getByLabel('Transfer source').selectOption({ label: 'Checking' });
  await page.getByLabel('Transfer destination').selectOption({ label: 'Cash' });
  await page.getByLabel('Transfer amount (minor units)').fill('250');
  await page.getByLabel('Transfer date').fill('2026-03-15');
  await page.getByRole('button', { name: 'Record transfer' }).click();
  await expect(page.getByRole('status')).toHaveText('Transfer recorded.');
  await openSection(page, 'Overview');
  await expect(rta().locator('dd')).toHaveText(beforeRta);
  await expect(category().locator('span')).toHaveText(beforeCategory);
  await openSection(page, 'Accounts');
  await expect(page.getByText('Checking · 750 minor units')).toBeVisible();
  await expect(page.getByText('Cash · 250 minor units')).toBeVisible();

  await page.reload();
  await page.getByRole('button', { name: 'Start or resume setup' }).click();
  await openSection(page, 'History');
  await page.getByRole('button', { name: 'Load history' }).click();
  await expect(page.getByRole('list', { name: 'Transaction history' })).toContainText('Transfer');
  await expect(page.getByRole('list', { name: 'Transaction history' }).getByText('250 minor units')).toHaveCount(1);
      await expect(page.getByLabel('History search')).toBeVisible();
      await expect(page.getByLabel('History account')).toBeVisible();
      await openSection(page, 'Activity');
      await expect(page.getByLabel('Payee')).toHaveCount(3);
      await expect(page.getByLabel('Memo')).toHaveCount(3);
});

test('imports and exports canonical CSV without client-side financial authority', async ({ page }) => {
  const email = `csv-e2e-${randomUUID()}@example.com`;
  const password = 'playwright-password';
  const request = page.request;
  const post = async (path: string, body: unknown, headers: Record<string, string> = {}) => {
    const response = await request.post(path, { data: body, headers });
    expect(response.ok()).toBeTruthy();
    return response.json() as Promise<{ data: any }>;
  };
  await post('/api/v1/auth/register', { email, password });
  await post('/api/v1/auth/sign-in', { email, password });
  const created = await post('/api/v1/budgets', {});
  const budgetId = created.data.id;
  await request.put(`/api/v1/budgets/${budgetId}`, { data: { openingBalanceMinor: 1000, accountName: 'Checking', categories: ['Food'] } });
  const first = (await (await request.get(`/api/v1/budgets/${budgetId}`)).json() as any).data;
  const secondResponse = await request.post(`/api/v1/budgets/${budgetId}/accounts`, { data: { name: 'Savings', kind: 'checking', openingBalanceMinor: 500 }, headers: { 'Idempotency-Key': randomUUID(), 'If-Match': `W/"${first.version}"` } });
  expect(secondResponse.ok()).toBeTruthy();
  const second = (await secondResponse.json() as any).data.account;
  const current = (await (await request.get(`/api/v1/budgets/${budgetId}`)).json() as any).data;
  const account = current.account.id;
  const category = current.categories[0].id;
  const csv = `date,type,account,amountMinor,category,payee,memo\r\n2026-09-13,TRANSFER,${account}=>${second.id},100,,Move,\r\n2026-09-14,SPENDING,${account},125,${category},Market,Food\r\n2026-09-15,INCOME,${account},300,,Employer,Pay\r\n`;

  await page.goto('/');
  await page.getByRole('button', { name: 'Start or resume setup' }).click();
  await openSection(page, 'Data');
  const csvRegion = page.getByRole('region', { name: 'CSV import and export' });
  await csvRegion.getByLabel('CSV file').setInputFiles({ name: 'transactions.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await csvRegion.getByRole('button', { name: 'Import CSV' }).click();
  await expect(page.getByRole('status')).toHaveText('Imported 3 CSV rows.');
  await openSection(page, 'History');
  await page.getByRole('button', { name: 'Load history' }).click();
  const history = page.getByRole('list', { name: 'Transaction history' });
  await expect(history.getByRole('listitem')).toHaveCount(3);
  await expect(history).toContainText('Transfer');
  await expect(history).toContainText('Market');

  await openSection(page, 'Data');
  const refreshedCsvRegion = page.getByRole('region', { name: 'CSV import and export' });
  const downloadPromise = page.waitForEvent('download');
  await refreshedCsvRegion.getByRole('button', { name: 'Download CSV' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('transactions.csv');
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const exported = Buffer.concat(chunks).toString('utf8');
  expect(exported).toContain('date,type,account,amountMinor,category,payee,memo\r\n');
  expect(exported).toContain(`2026-09-13,TRANSFER,${account}=>${second.id},100,,Move,\r\n`);
  expect(exported).toContain(`2026-09-14,SPENDING,${account},125,${category},Market,Food\r\n`);
  expect(exported).toContain(`2026-09-15,INCOME,${account},300,,Employer,Pay\r\n`);
});
