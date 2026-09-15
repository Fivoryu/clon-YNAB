import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalImportDigest, CSV_HEADER, CSV_MAX_BYTES, CSV_MAX_DIAGNOSTICS, CSV_MAX_ROWS, parseTransactionCsv, projectEffectiveCsvRows, serializeTransactionCsv } from '../src/planning/csv.ts';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
const bytes = (body: string) => new TextEncoder().encode(body);

test('CSV parser enforces exact UTF-8 header, CRLF, RFC4180 and seven fields', () => {
  const valid = `${CSV_HEADER}\r\n2026-09-15,SPENDING,${A},125,${C},"Market, Inc.","say ""hi""\r\nnext"\r\n`;
  const result = parseTransactionCsv(bytes(valid));
  assert.equal(result.rejected, 0);
  assert.equal(result.values[0].payee, 'Market, Inc.');
  assert.equal(result.values[0].memo, 'say "hi"\r\nnext');
  assert.equal(parseTransactionCsv(bytes(valid.replaceAll('\r\n', '\n'))).diagnostics[0].code, 'INVALID_HEADER');
  assert.equal(parseTransactionCsv(bytes(`\ufeff${valid}`)).diagnostics[0].code, 'INVALID_HEADER');
  assert.equal(parseTransactionCsv(bytes(`${CSV_HEADER}\r\n2026-09-15,INCOME,${A},5,,x\r\n`)).diagnostics[0].code, 'INVALID_COLUMN_COUNT');
});

test('CSV parser validates dates, amounts, kinds, transfer grammar, category rules and metadata', () => {
  const lines = [
    `2026-02-29,INCOME,${A},1,,,`,
    `2026-09-15,OTHER,${A},1,,,`,
    `2026-09-15,INCOME,${A},0,,,`,
    `2026-09-15,TRANSFER,${A}=>${A},1,,,`,
    `2026-09-15,SPENDING,${A},1,,,`,
    `2026-09-15,INCOME,${A},1,${C},,`,
  ];
  const result = parseTransactionCsv(bytes(`${CSV_HEADER}\r\n${lines.join('\r\n')}\r\n`));
  assert.deepEqual(result.diagnostics.map(item => item.code), ['INVALID_DATE', 'INVALID_TYPE', 'INVALID_AMOUNT', 'TRANSFER_GRAMMAR', 'INVALID_CATEGORY', 'INVALID_CATEGORY']);
  const normalized = parseTransactionCsv(bytes(`${CSV_HEADER}\r\n2026-09-15,TRANSFER,${A.toUpperCase()}=>${B.toUpperCase()},25,,\u2003Shop\u2003, memo \r\n`));
  assert.equal(normalized.rejected, 0);
  assert.equal(normalized.values[0].account, `${A}=>${B}`);
  assert.equal(normalized.values[0].payee, 'Shop');
  assert.equal(normalized.values[0].memo, 'memo');
});

test('serializer is canonical and digest normalizes metadata while preserving row order', () => {
  const parsed = parseTransactionCsv(bytes(`${CSV_HEADER}\r\n2026-09-15,INCOME,${A},10,, Alice ,\r\n2026-09-16,TRANSFER,${A}=>${B},5,,,\r\n`));
  const serialized = new TextDecoder().decode(serializeTransactionCsv(parsed.values));
  assert.equal(serialized, `${CSV_HEADER}\r\n2026-09-15,INCOME,${A},10,,Alice,\r\n2026-09-16,TRANSFER,${A}=>${B},5,,,\r\n`);
  const d1 = canonicalImportDigest('budget', 3, parsed.values);
  const d2 = canonicalImportDigest('budget', 3, [...parsed.values].reverse());
  assert.notEqual(d1, d2);
});

test('effective export is deterministic, excludes superseded/deleted effects and emits transfers once', () => {
  const rows = projectEffectiveCsvRows([
    { id: 'old', transactionId: 't1', kind: 'INCOME', amountMinor: 10, businessDate: '2026-09-15', accountId: A },
    { id: 'new', transactionId: 't1', supersedesEventId: 'old', kind: 'INCOME', amountMinor: 11, businessDate: '2026-09-15', accountId: A, payee: 'A' },
    { id: 'move', kind: 'MOVE', amountMinor: 2, month: '2026-09' },
    { id: 's1', transactionId: 's1', kind: 'SPENDING', amountMinor: 4, businessDate: '2026-09-14', accountId: A, categoryId: C },
    { id: 'out', kind: 'TRANSFER_OUT', amountMinor: 3, businessDate: '2026-09-13', accountId: A },
  ], [{ id: 'tr', sourceAccountId: A, destinationAccountId: B, amountMinor: 3, businessDate: '2026-09-13', payee: null, memo: 'x' }]);
  assert.deepEqual(rows.map(row => row.type), ['TRANSFER', 'SPENDING', 'INCOME']);
  assert.equal(rows.filter(row => row.type === 'TRANSFER').length, 1);
  assert.equal(rows.at(-1)?.amountMinor, 11);
});

test('limits are bounded at 10 MiB, 5000 data rows and 1000 diagnostics', () => {
  assert.equal(parseTransactionCsv(new Uint8Array(CSV_MAX_BYTES + 1)).diagnostics[0].code, 'FILE_TOO_LARGE');
  const valid = `2026-09-15,INCOME,${A},1,,,`;
  const over = parseTransactionCsv(bytes(`${CSV_HEADER}\r\n${Array.from({ length: CSV_MAX_ROWS + 1 }, () => valid).join('\r\n')}\r\n`));
  assert.equal(over.diagnostics[0].code, 'ROW_LIMIT_EXCEEDED');
  const invalid = parseTransactionCsv(bytes(`${CSV_HEADER}\r\n${Array.from({ length: 1100 }, () => `bad,INCOME,${A},1,,,`).join('\r\n')}\r\n`));
  assert.equal(invalid.diagnostics.length, CSV_MAX_DIAGNOSTICS);
  assert.equal(invalid.diagnosticsTruncated, true);
});
