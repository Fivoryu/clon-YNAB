import test from 'node:test';
import assert from 'node:assert/strict';
import { appendAccountHistoryPage, isCurrentAccountHistoryPageRequest, markAccountHistoryAppendError, type AccountHistorySnapshot, type AccountHistoryState, type HistoryItem, type HistoryResponse } from '../app/models.ts';

const firstItem: HistoryItem = {
  transactionId: 'transfer-1', kind: 'TRANSFER', date: '2026-09-20', amountMinor: 2500,
  payee: 'Ahorro', memo: null,
  sourceAccount: { id: 'checking', name: 'Diaria', kind: 'CHECKING', archived: false },
  destinationAccount: { id: 'savings', name: 'Ahorro', kind: 'CASH', archived: false }, createdAt: '2026-09-20T10:00:00Z',
};
const secondItem: HistoryItem = {
  transactionId: 'income-2', kind: 'INCOME', date: '2026-09-19', amountMinor: 8000,
  payee: 'Trabajo', memo: null, state: 'ELIGIBLE', accountId: 'checking',
};
const current: AccountHistorySnapshot = {
  accountId: 'checking', items: [firstItem], version: 12, nextCursor: 'cursor-1',
};

test('account history appends the requested cursor page without losing prior rows', () => {
  const page: HistoryResponse = { items: [secondItem], version: 12, nextCursor: null };
  const appended = appendAccountHistoryPage(current, 'checking', 'cursor-1', page);
  assert.deepEqual(appended?.items.map(item => item.transactionId), ['transfer-1', 'income-2']);
  assert.equal(appended?.nextCursor, null);
  assert.equal(appended?.version, 12);
  assert.equal(appended?.items.filter(item => item.kind === 'TRANSFER').length, 1);
});

test('account history rejects pages for a changed account, cursor, or history version', () => {
  const stalePage: HistoryResponse = { items: [secondItem], version: 13, nextCursor: null };
  assert.equal(appendAccountHistoryPage(current, 'savings', 'cursor-1', stalePage), null);
  assert.equal(appendAccountHistoryPage(current, 'checking', 'cursor-old', stalePage), null);
  assert.equal(appendAccountHistoryPage(current, 'checking', 'cursor-1', stalePage), null);
});

test('account history accepts only the active request for its selected account and cursor', () => {
  assert.equal(isCurrentAccountHistoryPageRequest(current, 'checking', 'cursor-1', 7, 7), true);
  assert.equal(isCurrentAccountHistoryPageRequest(current, 'checking', 'cursor-1', 6, 7), false);
  assert.equal(isCurrentAccountHistoryPageRequest(current, 'savings', 'cursor-1', 7, 7), false);
  assert.equal(isCurrentAccountHistoryPageRequest(current, 'checking', 'cursor-old', 7, 7), false);
});

test('a repeated transfer identity remains a single visible account activity item', () => {
  const repeatedTransferPage: HistoryResponse = { items: [firstItem], version: 12, nextCursor: null };
  const appended = appendAccountHistoryPage(current, 'checking', 'cursor-1', repeatedTransferPage);
  assert.deepEqual(appended?.items.map(item => item.transactionId), ['transfer-1']);
});

test('append failure keeps loaded rows and cursor for retry or stale-history restart', () => {
  const loading: AccountHistoryState = { ...current, loading: false, appending: true, error: null, errorKind: null };
  const retryable = markAccountHistoryAppendError(loading, 'Network unavailable', false);
  assert.deepEqual(retryable.items.map(item => item.transactionId), ['transfer-1']);
  assert.equal(retryable.nextCursor, 'cursor-1');
  assert.equal(retryable.errorKind, 'append');
  const stale = markAccountHistoryAppendError(loading, 'History changed', true);
  assert.equal(stale.errorKind, 'stale-cursor');
  assert.deepEqual(stale.items.map(item => item.transactionId), ['transfer-1']);
});
