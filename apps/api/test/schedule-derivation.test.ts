import assert from 'node:assert/strict';
import test from 'node:test';
import {
  generatedCleared,
  occurrenceIdentity,
  scheduleOccurrences,
  validateScheduleDefinition,
  type ScheduleDefinition,
} from '../src/planning/schedules.ts';

const definition = (overrides: Partial<ScheduleDefinition> = {}): ScheduleDefinition => ({
  accountId: 'account-1',
  categoryId: 'category-1',
  flow: 'SPENDING',
  amountMinor: 1250,
  payee: 'Grocer',
  memo: 'Monthly groceries',
  dayOfMonth: 15,
  intervalMonths: 1,
  startDate: '2026-01-15',
  ...overrides,
});

test('the first derived occurrence is exactly the schedule start date', () => {
  assert.deepEqual(scheduleOccurrences(definition({ startDate: '2026-01-17', dayOfMonth: 17 }), '2026-01-17'), ['2026-01-17']);
});

test('the declared day and first occurrence date share one clamped calendar-day invariant', () => {
  for (const [startDate, dayOfMonth] of [
    ['2026-01-31', 31],
    ['2026-02-28', 31],
    ['2024-02-29', 31],
    ['2026-04-30', 30],
  ] as const) {
    assert.equal(validateScheduleDefinition(definition({ startDate, dayOfMonth })), true);
  }
  assert.equal(validateScheduleDefinition(definition({ startDate: '2026-01-15', dayOfMonth: 31 })), false);
});

test('consecutive occurrences are separated by intervalMonths calendar months', () => {
  assert.deepEqual(
    scheduleOccurrences(definition({ startDate: '2026-01-10', dayOfMonth: 10, intervalMonths: 3 }), '2026-10-10'),
    ['2026-01-10', '2026-04-10', '2026-07-10', '2026-10-10'],
  );
});

test('a schedule steps across a year boundary from its original monthly cadence', () => {
  assert.deepEqual(
    scheduleOccurrences(definition({ startDate: '2026-12-31', dayOfMonth: 31 }), '2027-02-28'),
    ['2026-12-31', '2027-01-31', '2027-02-28'],
  );
});

test('a declared day beyond the month length clamps to that month’s last day', () => {
  assert.deepEqual(
    scheduleOccurrences(definition({ startDate: '2026-01-31', dayOfMonth: 31 }), '2026-04-30'),
    ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30'],
  );
});

test('clamping one occurrence does not change the declared day for later months', () => {
  assert.deepEqual(
    scheduleOccurrences(definition({ startDate: '2026-01-31', dayOfMonth: 31 }), '2026-03-31'),
    ['2026-01-31', '2026-02-28', '2026-03-31'],
  );
});

test('February clamps to February 28 in non-leap years and February 29 in leap years', () => {
  assert.deepEqual(
    scheduleOccurrences(definition({ startDate: '2025-01-31', dayOfMonth: 31 }), '2025-02-28'),
    ['2025-01-31', '2025-02-28'],
  );
  assert.deepEqual(
    scheduleOccurrences(definition({ startDate: '2024-01-31', dayOfMonth: 31 }), '2024-02-29'),
    ['2024-01-31', '2024-02-29'],
  );
});

test('the inclusive cut-off includes an occurrence and a cut-off before the start yields none', () => {
  const schedule = definition({ startDate: '2026-05-20', dayOfMonth: 20 });
  assert.deepEqual(scheduleOccurrences(schedule, '2026-05-20'), ['2026-05-20']);
  assert.deepEqual(scheduleOccurrences(schedule, '2026-05-19'), []);
});

test('intervals of 1 and 12 months are accepted while 0 and 13 are rejected', () => {
  assert.equal(validateScheduleDefinition(definition({ intervalMonths: 1 })), true);
  assert.equal(validateScheduleDefinition(definition({ intervalMonths: 12 })), true);
  assert.equal(validateScheduleDefinition(definition({ intervalMonths: 0 })), false);
  assert.equal(validateScheduleDefinition(definition({ intervalMonths: 13 })), false);
});

test('dayOfMonth must be between 1 and 31', () => {
  assert.equal(validateScheduleDefinition(definition({ dayOfMonth: 0 })), false);
  assert.equal(validateScheduleDefinition(definition({ dayOfMonth: 32 })), false);
});

test('the start date remains the first occurrence when it is the end of a short month', () => {
  assert.deepEqual(
    scheduleOccurrences(definition({ startDate: '2026-02-28', dayOfMonth: 31 }), '2026-04-30'),
    ['2026-02-28', '2026-03-31', '2026-04-30'],
  );
});

test('income forbids a category and spending requires one', () => {
  assert.equal(validateScheduleDefinition(definition({ flow: 'INCOME', categoryId: 'category-1' })), false);
  assert.equal(validateScheduleDefinition(definition({ flow: 'SPENDING', categoryId: null })), false);
  assert.equal(validateScheduleDefinition(definition({ flow: 'INCOME', categoryId: null })), true);
});

test('the definition validator rejects invalid amounts and malformed calendar dates', () => {
  for (const amountMinor of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(validateScheduleDefinition(definition({ amountMinor })), false);
  }
  for (const startDate of ['2026-2-01', '2026-02-29', '2026-13-01', 'not-a-date']) {
    assert.equal(validateScheduleDefinition(definition({ startDate })), false);
  }
});

test('occurrence identities are stable and distinct for different schedules and dates', () => {
  assert.equal(occurrenceIdentity('schedule-1', '2026-03-31'), 'sch:schedule-1:2026-03-31');
  assert.equal(occurrenceIdentity('schedule-1', '2026-03-31'), occurrenceIdentity('schedule-1', '2026-03-31'));
  assert.notEqual(occurrenceIdentity('schedule-1', '2026-03-31'), occurrenceIdentity('schedule-2', '2026-03-31'));
  assert.notEqual(occurrenceIdentity('schedule-1', '2026-03-31'), occurrenceIdentity('schedule-1', '2026-04-30'));
});

test('generated transactions are cleared only for cash accounts', () => {
  assert.equal(generatedCleared('CASH'), true);
  assert.equal(generatedCleared('CHECKING'), false);
  assert.equal(generatedCleared('UNKNOWN'), false);
});
