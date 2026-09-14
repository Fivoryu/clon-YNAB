import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertEligibleTransaction,
  buildDeleteTombstone,
  buildReplacement,
  foldEffectiveHistory,
  parseTransactionDate,
  projectEffectiveHistory,
  sameTransactionMonth,
} from '../src/planning/transaction-history.ts';
import { monthForDate } from '../src/planning/engine.ts';

const income = (overrides = {}) => ({ id: 'income-1', transactionId: 'income-1', kind: 'INCOME' as const, accountId: 'account-1', amountMinor: 500, businessDate: '2026-02-15', month: '2026-02', status: 'POSTED' as const, reconciled: false, ...overrides });
const spending = (overrides = {}) => ({ id: 'spend-1', transactionId: 'spend-1', kind: 'SPENDING' as const, accountId: 'account-1', categoryId: 'archived', amountMinor: 75, businessDate: '2026-02-15', month: '2026-02', status: 'WORKING' as const, reconciled: false, ...overrides });

test('transaction dates are strict and same-month validation uses the budget timezone', () => {
  assert.equal(parseTransactionDate('2026-02-15', 'America/Los_Angeles').month, '2026-02');
  assert.equal(monthForDate('2026-02-01T00:30:00Z', 'America/Los_Angeles'), '2026-01');
  assert.throws(() => parseTransactionDate('2026-2-15', 'UTC'), /YYYY-MM-DD/);
  assert.throws(() => parseTransactionDate('2026-02-30', 'UTC'), /invalid/i);
  assert.equal(sameTransactionMonth('2026-02-01', '2026-02-28', 'UTC'), true);
  assert.equal(sameTransactionMonth('2026-02-28', '2026-03-01', 'UTC'), false);
});

test('effective history folds replacement chains and tombstones without old effects', () => {
  const replacement = { ...income({ id: 'income-2', amountMinor: 600, businessDate: '2026-02-20' }), supersedesEventId: 'income-1' };
  const second = { ...replacement, id: 'income-3', amountMinor: 650, supersedesEventId: 'income-2' };
  const tombstone = { ...buildDeleteTombstone(income(), '2026-02-21'), id: 'delete-1' };
  const release = { id: 'release-1', kind: 'INCOME_RELEASE', amountMinor: 600, relatedEventId: 'income-1' };
  assert.deepEqual(foldEffectiveHistory([income(), replacement, second, release]), [second, release]);
  assert.deepEqual(foldEffectiveHistory([income(), tombstone]), []);
  assert.throws(() => foldEffectiveHistory([income(), { ...replacement, kind: 'SPENDING', accountId: 'other' }]), /immutable|chain/i);
});

test('eligibility protects released and unsupported or reconciled transactions', () => {
  assert.equal(assertEligibleTransaction(income(), { supportedAccountId: 'account-1', released: false }), true);
  assert.throws(() => assertEligibleTransaction(income({ amountMinor: 0 }), { supportedAccountId: 'account-1' }), /positive/i);
  for (const kind of ['SPLIT', 'TRANSFER', 'CARD', 'REFUND', 'SCHEDULED', 'REPEATED', 'STATE_CHANGE']) {
    assert.throws(() => assertEligibleTransaction(income({ kind }), { supportedAccountId: 'account-1' }), /CONFLICT|eligible|supported/i);
  }
  for (const candidate of [income({ reconciled: true }), income({ status: 'CLEARED' }), income({ accountId: 'other' })]) {
    assert.throws(() => assertEligibleTransaction(candidate as any, { supportedAccountId: 'account-1' }), /CONFLICT|eligible|supported/i);
  }
});

test('replacement retains archived categories and requires active same-budget replacement', () => {
  const replacement = buildReplacement(spending(), { amountMinor: 80, businessDate: '2026-02-20' }, { categoryId: 'archived', categoryBudgetId: 'budget-1', categoryArchived: true, budgetId: 'budget-1' });
  assert.equal(replacement.categoryId, 'archived');
  const active = buildReplacement(spending(), { categoryId: 'new' }, { categoryId: 'new', categoryBudgetId: 'budget-1', categoryArchived: false, budgetId: 'budget-1' });
  assert.equal(active.categoryId, 'new');
  assert.throws(() => buildReplacement(spending(), { categoryId: 'new' }, { categoryId: 'new', categoryBudgetId: 'budget-1', categoryArchived: true, budgetId: 'budget-1' }), /active/i);
  assert.throws(() => buildReplacement(spending(), { categoryId: 'foreign' }, { categoryId: 'foreign', categoryBudgetId: 'budget-2', categoryArchived: false, budgetId: 'budget-1' }), /budget/i);
  assert.equal(projectEffectiveHistory([spending()], replacement)[0].amountMinor, 80);
  assert.equal(buildDeleteTombstone(spending(), '2026-02-21').amountMinor, 0);
});
