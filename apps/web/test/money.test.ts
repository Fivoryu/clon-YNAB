import test from 'node:test';
import assert from 'node:assert/strict';
import { formatMoney, minorToInput, parseMoneyToMinor, parseOptionalMoneyToMinor } from '../app/lib/money.ts';

test('converts decimal UI amounts to exact minor units', () => {
  assert.equal(parseMoneyToMinor('125.50'), 12550);
  assert.equal(parseMoneyToMinor('125,50'), 12550);
  assert.equal(parseMoneyToMinor('0.01'), 1);
  assert.equal(minorToInput(12550), '125.50');
});

test('rejects ambiguous or unsafe money inputs', () => {
  assert.throws(() => parseMoneyToMinor('1.234'));
  assert.throws(() => parseMoneyToMinor('-1'));
  assert.throws(() => parseMoneyToMinor('0'));
  assert.equal(parseOptionalMoneyToMinor('0'), 0);
  assert.equal(parseOptionalMoneyToMinor(''), undefined);
});

test('formats minor units as a user-facing decimal amount', () => {
  assert.match(formatMoney(123456), /1[.\s]?234,56|1,234\.56/);
});
