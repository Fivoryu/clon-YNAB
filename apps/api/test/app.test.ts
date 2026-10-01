import test from 'node:test';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { BudgetApp, ApiError } from '../src/app.ts';
import { createServer } from '../src/server.ts';

const setup = { openingBalanceMinor: 12500, categories: ['Bills', 'Food'] };

test('register and sign in create an opaque authenticated session', () => {
  const app = new BudgetApp();
  app.register('owner@example.test', 'correct horse');
  const signedIn = app.signIn('owner@example.test', 'correct horse');
  assert.match(signedIn.data.sessionToken, /^[a-f0-9]{64}$/);
  assert.equal(app.authenticate(signedIn.data.sessionToken).email, 'owner@example.test');
  assert.notEqual(signedIn.data.sessionToken, app.signIn('owner@example.test', 'correct horse').data.sessionToken);
});

test('sign out revokes a session and expiry denies it', () => {
  let now = 1_000;
  const app = new BudgetApp(() => now);
  app.register('owner@example.test', 'correct horse');
  const token = app.signIn('owner@example.test', 'correct horse').data.sessionToken;
  app.signOut(token);
  assert.throws(() => app.authenticate(token), (e: ApiError) => e.code === 'UNAUTHENTICATED');
  const token2 = app.signIn('owner@example.test', 'correct horse').data.sessionToken;
  now += 8 * 60 * 60 * 1000 + 1;
  assert.throws(() => app.authenticate(token2), (e: ApiError) => e.code === 'UNAUTHENTICATED');
});

test('setup is resumable, idempotent by state, and completes deterministically', () => {
  const app = new BudgetApp();
  app.register('owner@example.test', 'correct horse');
  const token = app.signIn('owner@example.test', 'correct horse').data.sessionToken;
  const budget = app.createBudget(token).data;
  const partial = app.saveSetup(token, budget.id, { categories: ['Bills', 'Food'] }).data;
  assert.equal(partial.setupStep, 'ACCOUNT');
  const complete = app.saveSetup(token, budget.id, setup).data;
  assert.equal(complete.setupStep, 'COMPLETE');
  assert.equal(complete.categories.length, 2);
  assert.equal(app.saveSetup(token, budget.id, setup).data.categories.length, 2);
  assert.equal(app.getBudget(token, budget.id).data.account?.openingBalanceMinor, 12500);
});

test('setup persists the chosen account kind instead of coercing every account to cash', () => {
  const app = new BudgetApp();
  app.register('owner@example.test', 'correct horse');
  const token = app.signIn('owner@example.test', 'correct horse').data.sessionToken;
  const budget = app.createBudget(token).data;

  const checking = app.saveSetup(token, budget.id, { ...setup, accountName: 'Banco', accountType: 'checking' }).data;
  assert.equal(checking.account?.kind, 'CHECKING');
  assert.equal(checking.accounts.length, 1);
  assert.equal(checking.accounts[0].kind, 'CHECKING');
  assert.equal(app.getBudget(token, budget.id).data.accounts[0].kind, 'CHECKING');

  // Re-submitting setup with another supported kind updates the account in place, without duplicating it.
  const cash = app.saveSetup(token, budget.id, { ...setup, accountName: 'Banco', accountType: 'cash' }).data;
  assert.equal(cash.accounts.length, 1);
  assert.equal(cash.accounts[0].kind, 'CASH');
  assert.equal(app.getBudget(token, budget.id).data.accounts[0].kind, 'CASH');

  // Omitting the type keeps the persisted kind instead of resetting it to the default.
  const resubmitted = app.saveSetup(token, budget.id, { ...setup, accountName: 'Banco', accountType: 'checking' }).data;
  const withoutType = app.saveSetup(token, budget.id, { ...setup, accountName: 'Banco' }).data;
  assert.equal(resubmitted.accounts[0].kind, 'CHECKING');
  assert.equal(withoutType.accounts[0].kind, 'CHECKING');

  // An unsupported kind is still rejected and leaves the persisted kind untouched.
  assert.throws(() => app.saveSetup(token, budget.id, { ...setup, accountType: 'card' }), (e: ApiError) => e.code === 'VALIDATION_ERROR');
  assert.equal(app.getBudget(token, budget.id).data.accounts[0].kind, 'CHECKING');
});

test('HTTP budget resume requires auth and resumes the authenticated budget', async (t) => {
  const server = createServer(new BudgetApp());
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => server.close());
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const email = `http-${randomUUID()}@example.test`;
  const register = await fetch(`${baseUrl}/api/v1/auth/register`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'correct horse' }),
  });
  assert.equal(register.status, 201);
  const signIn = await fetch(`${baseUrl}/api/v1/auth/sign-in`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'correct horse' }),
  });
  assert.equal(signIn.status, 200);
  const { data: session } = await signIn.json() as { data: { sessionToken: string } };
  const unauthenticated = await fetch(`${baseUrl}/api/v1/budgets`);
  assert.equal(unauthenticated.status, 401);
  assert.equal((await unauthenticated.json()).error.code, 'UNAUTHENTICATED');
  const create = await fetch(`${baseUrl}/api/v1/budgets`, { method: 'POST', headers: { cookie: `sid=${session.sessionToken}` } });
  assert.equal(create.status, 201);
  const created = await create.json();
  const resumed = await fetch(`${baseUrl}/api/v1/budgets`, { headers: { cookie: `sid=${session.sessionToken}` } });
  assert.equal(resumed.status, 200);
  assert.equal((await resumed.json()).data.id, created.data.id);
});

test('budget authorization hides foreign budgets and category lifecycle is owner-only', () => {
  const app = new BudgetApp();
  app.register('a@example.test', 'correct horse');
  app.register('b@example.test', 'correct horse');
  const a = app.signIn('a@example.test', 'correct horse').data.sessionToken;
  const b = app.signIn('b@example.test', 'correct horse').data.sessionToken;
  const budget = app.createBudget(a).data;
  assert.throws(() => app.getBudget(b, budget.id), (e: ApiError) => e.code === 'NOT_FOUND');
  assert.throws(() => app.saveSetup(a, budget.id, { accountType: 'card' }), (e: ApiError) => e.code === 'VALIDATION_ERROR');
  const category = app.saveSetup(a, budget.id, setup).data.categories[0];
  app.renameCategory(a, budget.id, category.id, 'Essentials');
  app.archiveCategory(a, budget.id, category.id);
  assert.equal(app.getBudget(a, budget.id).data.categories[0].archived, true);
});

test('foreign users receive NOT_FOUND before setup validation', () => {
  const app = new BudgetApp();
  app.register('owner@example.test', 'correct horse');
  app.register('foreign@example.test', 'correct horse');
  const owner = app.signIn('owner@example.test', 'correct horse').data.sessionToken;
  const foreign = app.signIn('foreign@example.test', 'correct horse').data.sessionToken;
  const budget = app.createBudget(owner).data;
  assert.throws(() => app.saveSetup(foreign, budget.id, { accountType: 'card' }), (e: ApiError) => e.code === 'NOT_FOUND');
});
