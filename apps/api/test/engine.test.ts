import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyAssignment,
  calculateAccountBalance,
  calculateAccountBalances,
  aggregateAccountBalance,
  calculateCategory,
  calculateRta,
  moveAssignment,
  monthForDate,
  positiveRollover,
  releaseIncome,
  unassign,
  assertSupportedCommand,
} from '../src/planning/engine.ts';

test('account balance uses exact minor-unit arithmetic', () => {
  assert.equal(calculateAccountBalance({ openingBalanceMinor: 1, incomeMinor: 2, spendingMinor: 1 }), 2);
});

test('cleared balances treat openings as cleared and include only cleared effective effects', () => {
  const accounts = [{ id: 'cash', name: 'Cash', kind: 'CASH' as const, archived: false, openingBalanceMinor: 1000 }];
  const events = [
    { accountId: 'cash', kind: 'INCOME' as const, amountMinor: 100, cleared: true },
    { accountId: 'cash', kind: 'SPENDING' as const, amountMinor: 25, cleared: false },
    { accountId: 'cash', kind: 'TRANSFER_OUT' as const, amountMinor: 5, cleared: true },
    { accountId: 'cash', kind: 'TRANSFER_IN' as const, amountMinor: 10, cleared: false },
  ];
  const [projected] = calculateAccountBalances(accounts, events);
  assert.equal(projected.clearedBalanceMinor, 1095);
  assert.equal(projected.balanceMinor, 1080);
  assert.equal(aggregateAccountBalance(accounts, events), 1080);
});

test('an account with no cleared history reports its opening balance as cleared', () => {
  const [projected] = calculateAccountBalances(
    [{ id: 'cash', name: 'Cash', kind: 'CASH', archived: false, openingBalanceMinor: -250 }],
    [{ accountId: 'cash', kind: 'INCOME', amountMinor: 100, cleared: false }],
  );
  assert.equal(projected.clearedBalanceMinor, -250);
  assert.equal(projected.balanceMinor, -150);
});

test('paired transfer effects change cleared balances according to each effect state', () => {
  const accounts = [
    { id: 'source', name: 'Source', kind: 'CASH' as const, archived: false, openingBalanceMinor: 500 },
    { id: 'destination', name: 'Destination', kind: 'CHECKING' as const, archived: false, openingBalanceMinor: 100 },
  ];
  const events = [
    { accountId: 'source', kind: 'TRANSFER_OUT' as const, amountMinor: 125, cleared: true },
    { accountId: 'destination', kind: 'TRANSFER_IN' as const, amountMinor: 125, cleared: false },
  ];
  const projected = new Map(calculateAccountBalances(accounts, events).map(item => [item.id, item]));
  const source = projected.get('source')!;
  const destination = projected.get('destination')!;
  assert.deepEqual([source.clearedBalanceMinor, destination.clearedBalanceMinor], [375, 100]);
  assert.deepEqual([source.balanceMinor, destination.balanceMinor], [375, 225]);
  assert.equal(aggregateAccountBalance(accounts, events), 600);
});

test('RTA keeps unreleased income out and does not subtract spending twice', () => {
  const rta = calculateRta({ openingBalanceMinor: 100, releasedIncomeMinor: 50, unreleasedIncomeMinor: 75, priorCarryMinor: 10, assignedMinor: 80 });
  assert.deepEqual(rta, { openingBalanceMinor: 100, releasedIncomeMinor: 50, unreleasedIncomeMinor: 75, priorCarryMinor: 10, assignedMinor: 80, amountMinor: 80 });
});

test('category values keep Assigned, Activity, and Available distinct', () => {
  assert.deepEqual(calculateCategory({ carryoverMinor: 20, assignedMinor: 100, activityMinor: -35 }), {
    carryoverMinor: 20, assignedMinor: 100, activityMinor: -35, availableMinor: 85,
  });
  assert.equal(positiveRollover(-1), 0);
  assert.equal(positiveRollover(85), 85);
});

test('assignments and moves conserve minor units while allowing negative RTA', () => {
  const assigned = applyAssignment({ rtaMinor: 10, assignedMinor: 0 }, 25);
  assert.deepEqual(assigned, { rtaMinor: -15, assignedMinor: 25 });
  assert.deepEqual(unassign(assigned, 10), { rtaMinor: -5, assignedMinor: 15 });
  assert.deepEqual(moveAssignment({ assignedMinor: 25 }, { assignedMinor: 5 }, 10), {
    source: { assignedMinor: 15 }, destination: { assignedMinor: 15 }, amountMinor: 10,
  });
});

test('income release is full and repeatable without double counting', () => {
  const first = releaseIncome({ realizedMinor: 75, releasedMinor: 0 });
  assert.deepEqual(first, { state: { realizedMinor: 75, releasedMinor: 75 }, releasedNowMinor: 75, changed: true });
  assert.deepEqual(releaseIncome(first.state), { state: first.state, releasedNowMinor: 0, changed: false });
});

test('month selection uses UTC by default and the budget timezone at boundaries', () => {
  assert.equal(monthForDate('2026-01-31'), '2026-01');
  assert.equal(monthForDate('2026-02-01T00:30:00Z', 'America/Los_Angeles'), '2026-01');
  assert.equal(monthForDate('2026-02-01T00:30:00Z', 'UTC'), '2026-02');
});

test('deferred transaction concepts are rejected', () => {
  assert.throws(() => assertSupportedCommand('transfer'), /unsupported/i);
  assert.doesNotThrow(() => assertSupportedCommand('spending'));
});
