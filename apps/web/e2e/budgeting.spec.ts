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
