#!/usr/bin/env node
/**
 * Seeds a rich, realistic demo budget into the local PostgreSQL dev database.
 *
 * The script only talks to the public HTTP API, so the seeded state follows exactly the same
 * validation, versioning and persistence paths the web client uses. It is idempotent: when the
 * demo budget is already present it reports the existing state and exits without writing.
 *
 * Usage:
 *   DATABASE_URL=postgresql://ynab:ynab_local@localhost:5434/ynab_dev npm run seed:demo
 *   DATABASE_URL=... npm run seed:demo -- --reset   # truncates the local dev database first
 *
 * The API must be reachable at API_URL (default http://127.0.0.1:3001).
 */
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const API_URL = process.env.API_URL ?? 'http://127.0.0.1:3001';
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://ynab:ynab_local@localhost:5434/ynab_dev?schema=public';
const DEMO_EMAIL = process.env.DEMO_EMAIL ?? 'demo@presupuesto.local';
const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? 'demo-presupuesto-2026';

const MINOR = 100;
const money = (value) => Math.round(value * MINOR);

const today = new Date();
const isoMonth = (date) => date.toISOString().slice(0, 7);
const shiftMonth = (month, delta) => {
  const [year, index] = month.split('-').map(Number);
  return new Date(Date.UTC(year, index - 1 + delta, 1)).toISOString().slice(0, 7);
};
const day = (month, value) => `${month}-${String(value).padStart(2, '0')}`;

const currentMonth = isoMonth(today);
const historyMonths = [shiftMonth(currentMonth, -3), shiftMonth(currentMonth, -2), shiftMonth(currentMonth, -1), currentMonth];
const futureMonth = shiftMonth(currentMonth, 6);

let cookie = '';
let version = null;
let budgetId = null;

async function request(method, path, body, { command = false, allowNotFound = false } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (cookie) headers.cookie = cookie;
  if (command) {
    headers['Idempotency-Key'] = randomUUID();
    if (version !== null) headers['If-Match'] = `W/"${version}"`;
  }
  const response = await fetch(`${API_URL}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  if (response.headers.getSetCookie) {
    const session = response.headers.getSetCookie().find((entry) => entry.startsWith('sid='));
    if (session && !session.startsWith('sid=;')) cookie = session.split(';')[0];
  }
  if (allowNotFound && response.status === 404) return null;
  if (!response.ok) throw new Error(`${method} ${path} -> ${response.status}: ${text.slice(0, 500)}`);
  return text ? JSON.parse(text).data : null;
}

/** Runs one mutating command and keeps the optimistic-concurrency version in sync afterwards. */
async function command(method, path, body) {
  const result = await request(method, path, body, { command: true });
  if (result && typeof result.version === 'number') version = result.version;
  else await refresh();
  return result;
}

async function refresh() {
  const budget = await request('GET', `/api/v1/budgets/${budgetId}`);
  version = budget.version;
  return budget;
}

async function resetDatabase() {
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });
  try {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "User" CASCADE');
  } finally {
    await prisma.$disconnect();
  }
}

const incomePlan = [
  { day: 5, amount: money(4800), payee: 'Salario mensual', release: true },
  { day: 18, amount: money(950), payee: 'Consultoría freelance', release: true, months: [shiftMonth(currentMonth, -2)] },
  { day: 12, amount: money(620), payee: 'Consultoría freelance', release: false, months: [currentMonth] },
];

const spendingPlan = [
  { day: 3, amount: money(800), category: 'Vivienda', payee: 'Alquiler', account: 'Cuenta principal' },
  { day: 7, amount: money(212.4), category: 'Comida', payee: 'Mercado del barrio', memo: 'Compra semanal', account: 'Cuenta principal' },
  { day: 14, amount: money(164.9), category: 'Comida', payee: 'Supermercado', account: 'Cuenta principal' },
  { day: 21, amount: money(193.75), category: 'Comida', payee: 'Mercado del barrio', memo: 'Compra semanal', account: 'Efectivo' },
  { day: 27, amount: money(78.4), category: 'Comida', payee: 'Feria', account: 'Efectivo' },
  { day: 4, amount: money(121.5), category: 'Transporte', payee: 'Combustible', account: 'Cuenta principal' },
  { day: 16, amount: money(45), category: 'Transporte', payee: 'Transporte público', account: 'Efectivo' },
  { day: 8, amount: money(92.3), category: 'Servicios', payee: 'Energía eléctrica', account: 'Cuenta principal' },
  { day: 9, amount: money(65), category: 'Servicios', payee: 'Internet', account: 'Cuenta principal' },
  { day: 10, amount: money(38.7), category: 'Servicios', payee: 'Agua potable', account: 'Cuenta principal' },
  { day: 11, amount: money(54.2), category: 'Salud', payee: 'Farmacia', account: 'Efectivo' },
  { day: 13, amount: money(28), category: 'Ocio', payee: 'Cine', account: 'Cuenta principal' },
  { day: 22, amount: money(96.5), category: 'Ocio', payee: 'Restaurante', memo: 'Cumpleaños', account: 'Cuenta principal' },
  { day: 15, amount: money(120), category: 'Educación', payee: 'Curso en línea', account: 'Cuenta principal' },
];

const monthlyTargets = [
  { category: 'Vivienda', assign: money(800) },
  { category: 'Comida', assign: money(450) },
  { category: 'Transporte', assign: money(180) },
  { category: 'Servicios', assign: money(220) },
  { category: 'Salud', assign: money(120) },
  { category: 'Ocio', assign: money(150) },
  { category: 'Educación', assign: money(200) },
  { category: 'Vacaciones', assign: money(300) },
  { category: 'Ahorro', assign: money(500) },
];

const targetDefinitions = [
  { category: 'Vivienda', kind: 'MONTHLY_SET_ASIDE', amountMinor: money(800) },
  { category: 'Comida', kind: 'MONTHLY_SET_ASIDE', amountMinor: money(450) },
  { category: 'Transporte', kind: 'MONTHLY_SET_ASIDE', amountMinor: money(180) },
  { category: 'Servicios', kind: 'MONTHLY_SET_ASIDE', amountMinor: money(220) },
  { category: 'Salud', kind: 'MONTHLY_SET_ASIDE', amountMinor: money(120) },
  { category: 'Ocio', kind: 'MONTHLY_SET_ASIDE', amountMinor: money(150) },
  { category: 'Educación', kind: 'MONTHLY_SET_ASIDE', amountMinor: money(200) },
  { category: 'Vacaciones', kind: 'MONTHLY_SET_ASIDE', amountMinor: money(300) },
  { category: 'Ahorro', kind: 'BALANCE_BY_DATE', amountMinor: money(3000), targetMonth: futureMonth },
];

async function registerDemoUser() {
  const registered = await fetch(`${API_URL}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: DEMO_EMAIL, password: DEMO_PASSWORD }),
  });
  if (!registered.ok && registered.status !== 409) {
    throw new Error(`register -> ${registered.status}: ${(await registered.text()).slice(0, 300)}`);
  }
  await request('POST', '/api/v1/auth/sign-in', { email: DEMO_EMAIL, password: DEMO_PASSWORD });
}

async function seed() {
  await registerDemoUser();
  const existing = await request('GET', '/api/v1/budgets', undefined, { allowNotFound: true });
  if (existing && existing.setupStep === 'COMPLETE') {
    budgetId = existing.id;
    const accounts = existing.accounts.length;
    const categories = existing.categories.length;
    const summary = await request('GET', `/api/v1/budgets/${budgetId}/summary?month=${currentMonth}`);
    console.log(`Demo budget already seeded (${accounts} accounts, ${categories} categories, RTA ${(summary.rta.amountMinor / MINOR).toFixed(2)}).`);
    console.log(`Credentials: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
    return { skipped: true };
  }

  const budget = existing ?? (await request('POST', '/api/v1/budgets', {}));
  budgetId = budget.id;
  const setup = await request('PUT', `/api/v1/budgets/${budgetId}`, {
    openingBalanceMinor: money(400),
    accountName: 'Cuenta principal',
    accountType: 'checking',
    categories: ['Vivienda', 'Comida', 'Transporte', 'Servicios', 'Salud', 'Ocio'],
  });
  version = setup.version;

  const accounts = new Map(setup.accounts.map((account) => [account.name, account]));
  for (const extra of [
    { name: 'Efectivo', kind: 'cash', openingBalanceMinor: money(60) },
    { name: 'Ahorros', kind: 'checking', openingBalanceMinor: money(1200) },
    { name: 'Cuenta antigua', kind: 'checking', openingBalanceMinor: 0 },
  ]) {
    const created = await command('POST', `/api/v1/budgets/${budgetId}/accounts`, extra);
    accounts.set(created.account.name, created.account);
  }

  const categories = new Map(setup.categories.map((category) => [category.name, category]));
  for (const name of ['Educación', 'Ahorro', 'Vacaciones']) {
    await request('POST', `/api/v1/budgets/${budgetId}/categories`, { name });
  }
  for (const category of await refresh().then((budget) => budget.categories)) categories.set(category.name, category);

  for (const definition of targetDefinitions) {
    const category = categories.get(definition.category);
    const { category: _ignored, ...body } = definition;
    await command('PUT', `/api/v1/budgets/${budgetId}/categories/${category.id}/target`, body);
  }

  for (const month of historyMonths) {
    for (const item of incomePlan) {
      if (item.months && !item.months.includes(month)) continue;
      const income = await command('POST', `/api/v1/budgets/${budgetId}/income`, {
        amountMinor: item.amount,
        accountId: accounts.get('Cuenta principal').id,
        date: day(month, item.day),
        payee: item.payee,
      });
      if (item.release) await command('POST', `/api/v1/budgets/${budgetId}/income/${income.id}/release`, {});
    }

    // Leave the current month's Ocio deliberately underfunded so the budget screen renders a
    // distinct funding suggestion instead of a fully satisfied target.
    const underfunded = month === currentMonth ? 'Ocio' : null;
    for (const plan of monthlyTargets) {
      const category = categories.get(plan.category);
      const amount = plan.category === underfunded ? Math.round(plan.assign * 0.4) : plan.assign;
      await command('POST', `/api/v1/budgets/${budgetId}/allocations`, { categoryId: category.id, amountMinor: amount, month });
    }

    for (const item of spendingPlan) {
      const drift = item.category === 'Comida' || item.category === 'Ocio' ? 1 + (historyMonths.indexOf(month) % 3) * 0.05 : 1;
      await command('POST', `/api/v1/budgets/${budgetId}/spending`, {
        amountMinor: Math.round(item.amount * drift),
        categoryId: categories.get(item.category).id,
        accountId: accounts.get(item.account).id,
        date: day(month, item.day),
        payee: item.payee,
        ...(item.memo ? { memo: item.memo } : {}),
      });
    }

    await command('POST', `/api/v1/budgets/${budgetId}/transfers`, {
      sourceAccountId: accounts.get('Cuenta principal').id,
      destinationAccountId: accounts.get('Ahorros').id,
      amountMinor: money(500),
      date: day(month, 26),
      payee: 'Ahorro mensual',
    });

    // Keeps the cash account funded by the monthly withdrawal instead of drifting negative.
    await command('POST', `/api/v1/budgets/${budgetId}/transfers`, {
      sourceAccountId: accounts.get('Cuenta principal').id,
      destinationAccountId: accounts.get('Efectivo').id,
      amountMinor: money(420),
      date: day(month, 2),
      payee: 'Retiro de efectivo',
    });
  }

  const previousMonth = historyMonths[2];
  await command('POST', `/api/v1/budgets/${budgetId}/allocations/move`, {
    sourceCategoryId: categories.get('Vacaciones').id,
    destinationCategoryId: categories.get('Ahorro').id,
    amountMinor: money(120),
    month: previousMonth,
  });

  // Distribute almost every remaining unit of the current month so the budget screen opens on a
  // realistic small "available to assign" balance instead of an unbudgeted pile of money. Ocio is
  // deliberately excluded so its target stays visibly underfunded and renders a funding suggestion.
  const projected = await request('GET', `/api/v1/budgets/${budgetId}/summary?month=${currentMonth}`);
  const remaining = projected.rta.amountMinor - money(250);
  if (remaining > 0) {
    const funded = monthlyTargets.filter((plan) => plan.category !== 'Ocio' && plan.category !== 'Vacaciones');
    const weight = funded.reduce((sum, plan) => sum + plan.assign, 0);
    let allocated = 0;
    for (let index = 0; index < funded.length; index += 1) {
      const share = index === funded.length - 1 ? remaining - allocated : Math.floor((remaining * funded[index].assign) / weight);
      allocated += share;
      await command('POST', `/api/v1/budgets/${budgetId}/allocations`, { categoryId: categories.get(funded[index].category).id, amountMinor: share, month: currentMonth });
    }
  }

  await command('POST', `/api/v1/budgets/${budgetId}/categories/${categories.get('Vacaciones').id}/archive`, {});
  await command('POST', `/api/v1/budgets/${budgetId}/accounts/${accounts.get('Cuenta antigua').id}/archive`, {});

  const finalBudget = await refresh();
  const summary = await request('GET', `/api/v1/budgets/${budgetId}/summary?month=${currentMonth}`);
  console.log(`Seeded demo budget for ${DEMO_EMAIL}: ${finalBudget.accounts.length} accounts, ${finalBudget.categories.length} categories, version ${finalBudget.version}.`);
  console.log(`Current month ${currentMonth}: RTA ${(summary.rta.amountMinor / MINOR).toFixed(2)}, ${summary.categories.length} categories projected.`);
  console.log(`Credentials: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  return { skipped: false };
}

/**
 * Seeds the demo budget. `reset` truncates the local dev database first, which makes repeated runs
 * deterministic; without it the function is idempotent and leaves existing data untouched.
 */
export async function seedDemoData({ reset = false } = {}) {
  if (reset) {
    console.log('Resetting the local dev database (TRUNCATE "User" CASCADE) ...');
    await resetDatabase();
  }
  return seed();
}

const isDirectRun = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) await seedDemoData({ reset: process.argv.includes('--reset') });