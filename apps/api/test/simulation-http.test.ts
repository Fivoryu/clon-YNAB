import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { BudgetApp } from '../src/app.ts';
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
  const email = `simulation-http-${randomUUID()}@example.test`;
  app.register(email, 'correct horse');
  const token = app.signIn(email, 'correct horse').data.sessionToken;
  const budget = app.createBudget(token).data;
  app.saveSetup(token, budget.id, { openingBalanceMinor: 1000, categories: ['Food'] });
  const running = await start(app);
  return { app, token, budget, ...running };
};

const headers = (token: string, extra: Record<string, string> = {}) => ({ cookie: `sid=${token}`, 'content-type': 'application/json', ...extra });
const body = (response: Response) => response.json() as Promise<any>;

 test('HTTP simulation routes expose envelopes, headers, revisions, and all nine projections', async t => {
  const { server, base, token, budget } = await prepare();
  t.after(() => server.close());
  const root = `${base}/api/v1/budgets/${budget.id}/simulations`;
  const profiles = await fetch(`${root}/profiles`, { headers: { cookie: `sid=${token}`, 'x-request-id': 'profiles-1' } });
  assert.equal(profiles.status, 200);
  assert.equal((await body(profiles)).requestId, 'profiles-1');

  const create = await fetch(`${root}/runs`, { method: 'POST', headers: headers(token, { 'idempotency-key': 'create-http', 'x-request-id': 'create-1' }), body: JSON.stringify({ profileCode: 'BO_INSPIRED_A', fixtureVersion: '2026-01', seed: 'http-seed' }) });
  assert.equal(create.status, 201);
  const created = await body(create);
  assert.equal(created.data.run.state, 'DISCONNECTED');
  assert.equal(created.data.simulationRevision, 0);
  const runId = created.data.run.runId;

  const startRun = await fetch(`${root}/runs/${runId}/start`, { method: 'POST', headers: headers(token, { 'idempotency-key': 'start-http', 'if-match': '0' }), body: '{}' });
  assert.equal(startRun.status, 200);
  const started = await body(startRun);
  assert.equal(started.data.run.state, 'CONNECTING');
  assert.equal(started.data.simulationRevision, 1);

  const replay = await fetch(`${root}/runs/${runId}/start`, { method: 'POST', headers: headers(token, { 'idempotency-key': 'start-http', 'if-match': '0' }), body: '{}' });
  assert.deepEqual((await body(replay)).data, started.data);

  const advance = await fetch(`${root}/runs/${runId}/advance`, { method: 'POST', headers: headers(token, { 'idempotency-key': 'advance-http', 'if-match': '1' }), body: '{}' });
  assert.equal(advance.status, 200);
  const advanced = await body(advance);
  assert.equal(advanced.data.run.state, 'CONNECTED');

  const retry = await fetch(`${root}/runs/${runId}/retry`, { method: 'POST', headers: headers(token, { 'idempotency-key': 'retry-http', 'if-match': '2' }), body: '{}' });
  assert.equal(retry.status, 409);

  const inspect = await fetch(`${root}/runs/${runId}/inspect`, { method: 'POST', headers: headers(token, { 'idempotency-key': 'inspect-http', 'if-match': '2' }), body: JSON.stringify({ view: 'STATUS' }) });
  assert.equal(inspect.status, 200);
  assert.equal((await body(inspect)).data.view, 'STATUS');

  for (const suffix of [`runs/${runId}`, `runs/${runId}/candidates`, `runs/${runId}/checkpoints`, `runs/${runId}/audit`]) {
    const response = await fetch(`${root}/${suffix}`, { headers: { cookie: `sid=${token}` } });
    assert.equal(response.status, 200, suffix);
    assert.ok((await body(response)).data);
  }

  const missingKey = await fetch(`${root}/runs`, { method: 'POST', headers: headers(token), body: JSON.stringify({ profileCode: 'BO_INSPIRED_A', fixtureVersion: '2026-01', seed: 'missing-key' }) });
  assert.equal(missingKey.status, 400);
  assert.equal((await body(missingKey)).error.code, 'VALIDATION_ERROR');
  const missingMatch = await fetch(`${root}/runs/${runId}/advance`, { method: 'POST', headers: headers(token, { 'idempotency-key': 'missing-match' }), body: '{}' });
  assert.equal(missingMatch.status, 400);
  assert.equal((await body(missingMatch)).error.code, 'VALIDATION_ERROR');
  const oversized = await fetch(`${root}/runs`, { method: 'POST', headers: headers(token, { 'idempotency-key': 'oversized' }), body: JSON.stringify({ profileCode: 'BO_INSPIRED_A', fixtureVersion: '2026-01', seed: 'x'.repeat(1_048_576) }) });
  assert.equal(oversized.status, 400);
  assert.equal((await body(oversized)).error.message, 'Request body is too large');

  const unsupported = await fetch(`${root}/runs/${runId}/apply`, { method: 'POST', headers: headers(token, { 'idempotency-key': 'unsupported', 'if-match': '2' }), body: '{}' });
  assert.equal(unsupported.status, 404);
  assert.equal((await body(unsupported)).error.code, 'NOT_FOUND');
});

test('HTTP rejects credentials and deferred controls without simulation mutation', async t => {
  const { server, base, token, budget } = await prepare();
  t.after(() => server.close());
  const root = `${base}/api/v1/budgets/${budget.id}/simulations`;
  const credential = await fetch(`${root}/runs`, { method: 'POST', headers: headers(token, { 'idempotency-key': 'http-credential' }), body: JSON.stringify({ profileCode: 'BO_INSPIRED_A', fixtureVersion: '2026-01', seed: 'offline', credentials: { password: 'secret' } }) });
  assert.equal(credential.status, 400);
  const credentialError = await body(credential);
  assert.equal(credentialError.error.code, 'VALIDATION_ERROR');
  assert.doesNotMatch(JSON.stringify(credentialError), /secret|password|credential/i);
  const created = await fetch(`${root}/runs`, { method: 'POST', headers: headers(token, { 'idempotency-key': 'http-credential' }), body: JSON.stringify({ profileCode: 'BO_INSPIRED_A', fixtureVersion: '2026-01', seed: 'offline' }) });
  assert.equal(created.status, 201);
  const runId = (await body(created)).data.run.runId;
  const beforeAudit = (await body(await fetch(`${root}/runs/${runId}/audit`, { headers: { cookie: `sid=${token}` } }))).data;
  for (const action of ['connect', 'link', 'apply', 'poll', 'worker', 'money-movement']) {
    const response = await fetch(`${root}/runs/${runId}/${action}`, { method: 'POST', headers: headers(token, { 'idempotency-key': `deferred-${action}`, 'if-match': '0' }), body: '{}' });
    assert.equal(response.status, 404, action);
    const error = await body(response);
    assert.equal(error.error.code, 'NOT_FOUND', action);
    assert.doesNotMatch(JSON.stringify(error), /provider|credential|secret|endpoint/i);
  }
  const afterAudit = (await body(await fetch(`${root}/runs/${runId}/audit`, { headers: { cookie: `sid=${token}` } }))).data;
  assert.deepEqual(afterAudit, beforeAudit);
});

test('HTTP simulation authorization and safe errors disclose no foreign resources', async t => {
  const { server, base, budget, token, app } = await prepare();
  t.after(() => server.close());
  const foreignEmail = `foreign-${randomUUID()}@example.test`;
  app.register(foreignEmail, 'correct horse');
  const foreignToken = app.signIn(foreignEmail, 'correct horse').data.sessionToken;
  const root = `${base}/api/v1/budgets/${budget.id}/simulations`;
  const unauth = await fetch(`${root}/profiles`);
  assert.equal(unauth.status, 401);
  const foreign = await fetch(`${root}/profiles`, { headers: { cookie: `sid=${foreignToken}` } });
  assert.equal(foreign.status, 404);
  assert.equal((await body(foreign)).error.message, 'Resource not found');
  const malformed = await fetch(`${root}/runs`, { method: 'POST', headers: headers(token, { 'idempotency-key': 'malformed' }), body: '{' });
  assert.equal(malformed.status, 400);
  assert.equal((await body(malformed)).error.code, 'VALIDATION_ERROR');
  assert.doesNotMatch(JSON.stringify(await body(await fetch(`${root}/profiles`, { headers: { cookie: `sid=${token}` } }))), /credential|endpoint|password/i);
});
