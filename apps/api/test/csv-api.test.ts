import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { ApiError, BudgetApp } from '../src/app.ts';
import { CSV_HEADER } from '../src/planning/csv.ts';

const bytes = (value: string) => new TextEncoder().encode(value);
const prepare = async () => {
  const app = new BudgetApp(() => Date.parse('2026-09-15T12:00:00Z'));
  const email = `csv-${randomUUID()}@example.test`;
  app.register(email, 'correct horse');
  const token = app.signIn(email, 'correct horse').data.sessionToken;
  const created = app.createBudget(token).data;
  const setup = app.saveSetup(token, created.id, { openingBalanceMinor: 1000, accountName: 'Checking', categories: ['Food'] }).data;
  const second = (await app.createAccount(token, setup.id, { name: 'Savings', kind: 'checking', openingBalanceMinor: 500 }, undefined, { idempotencyKey: 'second-account', expectedVersion: 0 })).data;
  const budget = app.getBudget(token, setup.id).data;
  return { app, token, budget, firstAccountId: budget.account!.id, secondAccountId: second.account.id, categoryId: budget.categories[0].id };
};

const csv = (rows: string[]) => bytes(`${CSV_HEADER}\r\n${rows.join('\r\n')}\r\n`);

test('CSV import commits income, spending and transfer atomically and export round-trips effective history', async () => {
  const { app, token, budget, firstAccountId: a, secondAccountId: b, categoryId: c } = await prepare();
  const payload = csv([
    `2026-09-13,TRANSFER,${a}=>${b},100,,Bank move,`,
    `2026-09-14,SPENDING,${a},125,${c},Market,Groceries`,
    `2026-09-15,INCOME,${a},300,,Employer,September`,
  ]);
  const imported = (await app.importTransactionsCsv(token, budget.id, payload, 'req-csv', { idempotencyKey: 'csv-1', expectedVersion: 1 })).data;
  assert.deepEqual(imported, { rows: 3, accepted: 3, rejected: 0, diagnostics: [], diagnosticsTruncated: false, version: 2 });
  const replay = (await app.importTransactionsCsv(token, budget.id, payload, 'req-replay', { idempotencyKey: 'csv-1', expectedVersion: 1 })).data;
  assert.deepEqual(replay, imported);

  const history = (await app.listTransactions(token, budget.id)).data;
  assert.equal(history.items.length, 3);
  assert.equal(history.items.filter(item => item.kind === 'TRANSFER').length, 1);
  const summary = (await app.getFinancialSummary(token, budget.id, '2026-09')).data;
  assert.equal(summary.accountBalanceMinor, 1675);
  assert.equal(summary.categories[0].activityMinor, -125);

  const exported = new TextDecoder().decode(await app.exportTransactionsCsv(token, budget.id));
  assert.equal(exported, `${CSV_HEADER}\r\n2026-09-13,TRANSFER,${a}=>${b},100,,Bank move,\r\n2026-09-14,SPENDING,${a},125,${c},Market,Groceries\r\n2026-09-15,INCOME,${a},300,,Employer,September\r\n`);
});

test('CSV invalid resources roll back without receipt and corrected retry may reuse the key', async () => {
  const { app, token, budget, firstAccountId: a, categoryId: c } = await prepare();
  const missing = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const invalid = csv([`2026-09-15,SPENDING,${missing},25,${c},,`]);
  await assert.rejects(() => app.importTransactionsCsv(token, budget.id, invalid, undefined, { idempotencyKey: 'resource-key', expectedVersion: 1 }), (error: unknown) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.code, 'VALIDATION_ERROR');
    assert.equal((error.details as any).diagnostics[0].code, 'RESOURCE_UNAVAILABLE');
    return true;
  });
  assert.equal(app.getBudget(token, budget.id).data.version, 1);
  assert.equal((await app.listTransactions(token, budget.id)).data.items.length, 0);

  const valid = csv([`2026-09-15,SPENDING,${a},25,${c},,`]);
  const result = (await app.importTransactionsCsv(token, budget.id, valid, undefined, { idempotencyKey: 'resource-key', expectedVersion: 1 })).data;
  assert.equal(result.version, 2);
});

test('CSV import rejects stale versions and changed canonical payloads for the same idempotency key', async () => {
  const { app, token, budget, firstAccountId: a } = await prepare();
  const one = csv([`2026-09-15,INCOME,${a},10,, Alice ,`]);
  await assert.rejects(() => app.importTransactionsCsv(token, budget.id, one, undefined, { idempotencyKey: 'stale', expectedVersion: 0 }), (error: unknown) => error instanceof ApiError && error.code === 'CONFLICT');
  await app.importTransactionsCsv(token, budget.id, one, undefined, { idempotencyKey: 'same', expectedVersion: 1 });
  const changed = csv([`2026-09-15,INCOME,${a},11,,Alice,`]);
  await assert.rejects(() => app.importTransactionsCsv(token, budget.id, changed, undefined, { idempotencyKey: 'same', expectedVersion: 1 }), (error: unknown) => error instanceof ApiError && error.code === 'CONFLICT');
});

test('duplicate-looking CSV rows remain distinct transactions', async () => {
  const { app, token, budget, firstAccountId: a } = await prepare();
  const row = `2026-09-15,INCOME,${a},10,,Same,Same`;
  const result = (await app.importTransactionsCsv(token, budget.id, csv([row, row]), undefined, { idempotencyKey: 'duplicates', expectedVersion: 1 })).data;
  assert.equal(result.accepted, 2);
  const history = (await app.listTransactions(token, budget.id)).data.items;
  assert.equal(history.length, 2);
  assert.notEqual(history[0].transactionId, history[1].transactionId);
});

test('CSV resource diagnostics report the true rejected count while truncating details at 1000', async () => {
  const { app, token, budget, categoryId: c } = await prepare();
  const missing = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const rows = Array.from({ length: 1001 }, (_, index) => `2026-09-15,SPENDING,${missing},${index + 1},${c},,`);
  await assert.rejects(() => app.importTransactionsCsv(token, budget.id, csv(rows), undefined, { idempotencyKey: 'many-resources', expectedVersion: 1 }), (error: unknown) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.code, 'VALIDATION_ERROR');
    const details = error.details as any;
    assert.equal(details.rows, 1001);
    assert.equal(details.accepted, 0);
    assert.equal(details.rejected, 1001);
    assert.equal(details.diagnostics.length, 1000);
    assert.equal(details.diagnosticsTruncated, true);
    return true;
  });
  assert.equal(app.getBudget(token, budget.id).data.version, 1);
});
