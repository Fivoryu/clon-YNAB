import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const models = read('../app/models.ts');
const controller = read('../app/hooks/useBudgetApp.ts');
const account = read('../app/accounts/[accountId]/page.tsx');
const styles = read('../app/globals.css');
const has = (source: string, pattern: RegExp, message: string) => assert.ok(pattern.test(source), message);

test('account activity lists only schedules belonging to that account', () => {
  has(controller, /readSchedules[\s\S]*?\/schedules`/, 'the budget schedule list is loaded');
  has(account, /schedule\.accountId === accountId/, 'the account page scopes the list to its route account');
  has(account, /Movimientos periódicos/, 'the schedule area is rendered in account context');
});

test('schedule input distinguishes spending from income without client identity or income category', () => {
  has(models, /export type ScheduleInput =/, 'the request type is explicit');
  has(models, /flow: 'INCOME'; categoryId: null/, 'income carries an explicit null category, as the API requires');
  has(models, /flow: 'SPENDING'; categoryId: string/, 'spending requires a category');
  has(account, /flow === 'SPENDING' \? \{ \.\.\.common, flow, categoryId \} : \{ \.\.\.common, flow, categoryId: null \}/, 'income serialization sends an explicit null category');
  // Behavioural proof for this contract lives in the browser suite: an income schedule is created
  // through the real API, which rejects an omitted categoryId. A same-shaped local re-implementation
  // would only duplicate the production expression and prove nothing.
});

test('schedule create and removal use the frozen endpoints and fresh current-version headers', () => {
  has(controller, /\/schedules`/, 'create uses the schedule collection');
  has(controller, /\/schedules\/\$\{scheduleId\}`/, 'remove uses the schedule item');
  assert.ok(controller.includes("'DELETE', undefined"), 'remove sends no request body');
  has(controller, /'Idempotency-Key': crypto\.randomUUID\(\)/, 'each mutation creates a fresh key');
  has(controller, /'If-Match': `W\//, 'each mutation sends the current budget version');
  has(controller, /\.\.\.\(body === undefined \? \{\} : \{ body: JSON\.stringify\(body\) \}\)/, 'bodyless operations stay bodyless');
});

test('generation uses the inclusive date and refreshes ordinary account history', () => {
  has(models, /export type ScheduleGenerationInput = \{ cutoffDate: string \}/, 'the request contains the cutoff date');
  has(controller, /\/schedules\/generate/, 'generation uses the frozen operation');
  has(account, /app\.generateSchedules\(\{ cutoffDate \}\)/, 'the selected cutoff is submitted');
  has(account, /app\.readAccountHistory\(accountId\)/, 'new transactions are reloaded into account history');
});

test('empty schedule state and both limits are disclosed in Spanish', () => {
  has(account, /No hay movimientos periódicos para esta cuenta/, 'the empty state is explicit');
  has(account, /No es posible modificar un movimiento periódico/, 'the no-edit limit is disclosed');
  has(account, /Los movimientos registrados aparecen en el historial como cualquier otro movimiento/, 'history treatment is disclosed');
});

test('generation disclosure reflects its budget-wide effect', () => {
  has(account, /todas tus cuentas/, 'the global effect is clear from the account page');
  has(account, /Registrar movimientos hasta esta fecha/, 'generation requires an explicit action');
});

test('schedule presentation adapts to compact layouts', () => {
  has(styles, /\.schedule-manager\s*\{/, 'the schedule surface has dedicated presentation');
  has(styles, /@media \(max-width: 720px\)[\s\S]*?\.schedule-manager/, 'compact layout rules include the schedule surface');
});
