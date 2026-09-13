import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyAssignment,
  calculateAccountBalance,
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
