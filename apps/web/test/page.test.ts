import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const root = read('../app/page.tsx');
const controller = read('../app/hooks/useBudgetApp.ts');
const shell = read('../app/components/shell/AppShell.tsx');
const login = read('../app/login/page.tsx');
const register = read('../app/register/page.tsx');
const setup = read('../app/setup/page.tsx');
const budget = read('../app/budget/page.tsx');
const transactions = read('../app/transactions/page.tsx');
const accounts = read('../app/accounts/page.tsx');
const data = read('../app/settings/data/page.tsx');
const money = read('../app/lib/money.ts');
const web = [root, controller, shell, login, register, setup, budget, transactions, accounts, data, money].join('\n');
const nextConfig = read('../../../next.config.mjs');

test('navigation is route-based and centered on four user tasks', () => {
  for (const route of ['/budget', '/transactions', '/accounts', '/settings/data']) assert.match(shell, new RegExp(route.replaceAll('/', '\\/')));
  for (const label of ['Presupuesto', 'Transacciones', 'Cuentas', 'Configuración']) assert.match(shell, new RegExp(label));
  assert.doesNotMatch(shell, /label: 'Overview'|label: 'Plan'|label: 'Activity'|label: 'History'|label: 'Data'/);
  assert.match(root, /router\.replace\('\/login'\)/);
  assert.match(root, /router\.replace\('\/setup'\)/);
  assert.match(root, /router\.replace\('\/budget'\)/);
});

test('registration signs in and proceeds directly to setup', () => {
  assert.match(register, /authenticate\(email, password, 'register'\)/);
  assert.match(controller, /auth\/register/);
  assert.match(controller, /auth\/sign-in/);
  assert.match(register, /router\.push\('\/setup'\)/);
  assert.doesNotMatch(web, /Start or resume setup|Account created\. Sign in to continue/);
});

test('onboarding presents account, categories, and review as focused states', () => {
  assert.match(setup, /'account' \| 'categories' \| 'review'/);
  assert.match(setup, /Tu cuenta principal/);
  assert.match(setup, /Elige tus primeras categorías/);
  assert.match(setup, /Tu presupuesto empieza con esto/);
  assert.match(setup, /chip-list/);
  assert.doesNotMatch(setup, /categories\.split\(','\)/);
});

test('normal UI uses decimal money while API remains minor-unit authoritative', () => {
  assert.match(money, /minor \/ 100/);
  assert.match(money, /Math\.round\(amount \* 100\)/);
  assert.match(controller, /amountMinor/);
  for (const source of [budget, transactions, accounts, setup]) assert.doesNotMatch(source, /minor units/i);
  assert.match(budget, /formatMoney/);
  assert.match(transactions, /parseMoneyToMinor/);
});

test('budget works directly on categories instead of three parallel planning forms', () => {
  assert.match(budget, /Disponible para asignar/);
  assert.match(budget, /Ajusta cada prioridad directamente/);
  assert.match(budget, /Agregar/);
  assert.match(budget, /Retirar/);
  assert.match(budget, /Mover/);
  assert.match(budget, /createCategory/);
  assert.match(budget, /renameCategory/);
  assert.match(budget, /archiveCategory/);
  assert.doesNotMatch(budget, /Load dashboard|Load month summary/);
});

test('transactions combine creation and history with advanced filters hidden behind intent', () => {
  assert.match(transactions, /Nueva transacción/);
  assert.match(transactions, /Gasto/);
  assert.match(transactions, /Ingreso/);
  assert.match(transactions, /Transferencia/);
  assert.match(transactions, /Buscar transacciones/);
  assert.match(transactions, /Filtros/);
  assert.match(controller, /readHistory/);
  assert.doesNotMatch(transactions, /Load history/);
});

test('pending income is derived from persisted effective history', () => {
  assert.match(controller, /pendingIncomes/);
  assert.match(controller, /transactions\?kind=INCOME/);
  assert.match(controller, /item\.kind === 'INCOME' && item\.state === 'ELIGIBLE'/);
  assert.match(transactions, /Libera el dinero que ya recibiste/);
  assert.match(transactions, /releaseIncome\(item\.transactionId\)/);
  assert.doesNotMatch(controller, /latestIncome/);
});

test('CSV is kept in settings and server authority remains intact', () => {
  assert.match(data, /Importar y exportar transacciones/);
  assert.match(controller, /transactions\/export/);
  assert.match(controller, /transactions\/import/);
  assert.match(controller, /10_485_760/);
  assert.match(controller, /Idempotency-Key/);
  assert.match(controller, /If-Match/);
  assert.doesNotMatch(budget, /CSV|Import CSV|Download CSV/);
  assert.doesNotMatch(transactions, /CSV|Import CSV|Download CSV/);
});

test('development web runtime proxies same-origin API calls', () => {
  assert.match(nextConfig, /source:\s*['"]\/api\/v1\/:path\*['"]/);
  assert.match(nextConfig, /destination:\s*['"]http:\/\/localhost:3001\/api\/v1\/:path\*['"]/);
});

test('browser never becomes the financial authority', () => {
  assert.doesNotMatch(web, /calculateAccountBalance|calculateRta|parseTransactionCsv|FinancialEvent|TransferState/);
  assert.match(controller, /credentials:\s*['"]include['"]/);
  assert.match(controller, /crypto\.randomUUID\(\)/);
});
