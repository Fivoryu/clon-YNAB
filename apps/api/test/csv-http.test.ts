import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { BudgetApp } from '../src/app.ts';
import { CSV_HEADER } from '../src/planning/csv.ts';
import { createServer } from '../src/server.ts';

const start = async (app: BudgetApp) => {
  const server = createServer(app);
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return { server, base: `http://127.0.0.1:${address.port}` };
};

const prepare = async () => {
  const app = new BudgetApp(() => Date.parse('2026-09-15T12:00:00Z'));
  const email = `http-csv-${randomUUID()}@example.test`;
  app.register(email, 'correct horse');
  const token = app.signIn(email, 'correct horse').data.sessionToken;
  const created = app.createBudget(token).data;
  const setup = app.saveSetup(token, created.id, { openingBalanceMinor: 1000, categories: ['Food'] }).data;
  await app.createAccount(token, setup.id, { name: 'Savings', kind: 'checking', openingBalanceMinor: 0 }, undefined, { idempotencyKey: 'second', expectedVersion: 0 });
  const budget = app.getBudget(token, setup.id).data;
  return { app, token, budget };
};

test('HTTP CSV import/export enforces auth, media type, headers, request IDs and direct CSV bytes', async (t) => {
  const { app, token, budget } = await prepare();
  const { server, base } = await start(app); t.after(() => server.close());
  const row = `${CSV_HEADER}\r\n2026-09-15,INCOME,${budget.account!.id},25,,Employer,Pay\r\n`;
  const endpoint = `${base}/api/v1/budgets/${budget.id}/transactions/import`;

  const unauth = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'text/csv', 'idempotency-key': 'u', 'if-match': '1' }, body: row });
  assert.equal(unauth.status, 401);
  assert.equal((await unauth.json() as any).error.code, 'UNAUTHENTICATED');

  const badMedia = await fetch(endpoint, { method: 'POST', headers: { cookie: `sid=${token}`, 'content-type': 'application/json', 'idempotency-key': 'm', 'if-match': '1' }, body: row });
  assert.equal(badMedia.status, 415);
  assert.equal((await badMedia.json() as any).error.code, 'UNSUPPORTED_MEDIA_TYPE');

  const badMatch = await fetch(endpoint, { method: 'POST', headers: { cookie: `sid=${token}`, 'content-type': 'text/csv', 'idempotency-key': 'bad-match', 'if-match': '1.2' }, body: row });
  assert.equal(badMatch.status, 400);

  const imported = await fetch(endpoint, { method: 'POST', headers: { cookie: `sid=${token}`, 'content-type': 'text/csv; charset=UTF-8', 'idempotency-key': 'good', 'if-match': 'W/"1"', 'x-request-id': 'csv-request-1' }, body: row });
  assert.equal(imported.status, 201);
  const result = await imported.json() as any;
  assert.equal(result.requestId, 'csv-request-1');
  assert.equal(result.data.accepted, 1);
  assert.equal(result.data.version, 2);

  const exported = await fetch(`${base}/api/v1/budgets/${budget.id}/transactions/export`, { headers: { cookie: `sid=${token}` } });
  assert.equal(exported.status, 200);
  assert.match(exported.headers.get('content-type') ?? '', /^text\/csv; charset=utf-8/);
  assert.match(exported.headers.get('content-disposition') ?? '', /transactions\.csv/);
  assert.equal(await exported.text(), row);
});

test('HTTP CSV import maps validation, stale version, not-found and internal errors safely', async (t) => {
  const { app, token, budget } = await prepare();
  const { server, base } = await start(app); t.after(() => server.close());
  const endpoint = `${base}/api/v1/budgets/${budget.id}/transactions/import`;
  const invalid = `${CSV_HEADER}\r\nbad,INCOME,${budget.account!.id},25,,,\r\n`;
  const validation = await fetch(endpoint, { method: 'POST', headers: { cookie: `sid=${token}`, 'content-type': 'text/csv', 'idempotency-key': 'invalid', 'if-match': '1' }, body: invalid });
  assert.equal(validation.status, 400);
  const validationBody = await validation.json() as any;
  assert.equal(validationBody.error.code, 'VALIDATION_ERROR');
  assert.equal(validationBody.error.details.diagnostics[0].code, 'INVALID_DATE');

  const row = `${CSV_HEADER}\r\n2026-09-15,INCOME,${budget.account!.id},25,,,\r\n`;
  const stale = await fetch(endpoint, { method: 'POST', headers: { cookie: `sid=${token}`, 'content-type': 'text/csv', 'idempotency-key': 'stale', 'if-match': '0' }, body: row });
  assert.equal(stale.status, 409);
  assert.equal((await stale.json() as any).error.code, 'CONFLICT');

  const missing = await fetch(`${base}/api/v1/budgets/${randomUUID()}/transactions/export`, { headers: { cookie: `sid=${token}` } });
  assert.equal(missing.status, 404);

  const broken = new BudgetApp();
  (broken as any).exportTransactionsCsv = async () => { throw new Error('database details must not leak'); };
  const running = await start(broken); t.after(() => running.server.close());
  const failure = await fetch(`${running.base}/api/v1/budgets/${budget.id}/transactions/export`);
  assert.equal(failure.status, 500);
  const body = await failure.json() as any;
  assert.equal(body.error.code, 'INTERNAL_ERROR');
  assert.equal(body.error.message, 'Internal server error');
  assert.doesNotMatch(JSON.stringify(body), /database details/);
});
