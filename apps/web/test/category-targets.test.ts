import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const models = read('../app/models.ts');
const controller = read('../app/hooks/useBudgetApp.ts');
const budget = read('../app/budget/page.tsx');
const styles = read('../app/globals.css');

test('category target state is optional on the monthly summary category', () => {
  assert.match(models, /type CategoryTargetProgress = \{/);
  assert.match(models, /export type CategoryTargetState =\s*\| \(CategoryTargetProgress & \{ kind: 'MONTHLY_SET_ASIDE' \}\)\s*\| \(CategoryTargetProgress & \{ kind: 'BALANCE_BY_DATE'; targetMonth: string \}\)/);
  for (const field of ['amountMinor', 'progressMinor', 'remainingMinor', 'status']) assert.match(models, new RegExp(`${field}:`));
  assert.match(models, /target\?: CategoryTargetState/);
});

test('target writes use the current version and only serialize the selected target input', () => {
  assert.match(controller, /const changeCategoryTarget = async \(categoryId: string, target: CategoryTargetInput \| null\)/);
  assert.match(controller, /method: target \? 'PUT' : 'DELETE'/);
  assert.match(controller, /JSON\.stringify\(target\)/);
  assert.match(controller, /'Idempotency-Key': crypto\.randomUUID\(\)/);
  assert.match(controller, /'If-Match': `W\/"\$\{budget\.version\}"`/);
  assert.match(controller, /await sync\(\{ \.\.\.budget, version: result\.version \}/);
});

test('target presentation stays in the category context and confirmation uses the existing assignment command', () => {
  assert.match(budget, /className="target-state"/);
  assert.match(budget, /category\.target/);
  assert.match(budget, /app\.assign\(category\.id, target\.remainingMinor\)/);
  assert.match(budget, /kind === 'MONTHLY_SET_ASIDE' \? \{ kind, amountMinor \} : \{ kind, amountMinor, targetMonth \}/);
  assert.match(budget, /!category\.archived && target\.remainingMinor > 0/);
  assert.match(budget, /const showTargetDisclosure = app\.month < app\.today\.slice\(0, 7\) \|\| \(target\?\.kind === 'BALANCE_BY_DATE' && app\.month < target\.targetMonth\)/, 'the disclosure must cover any past month for every target kind, not only a dated target before its month');
  assert.match(budget, /\{showTargetDisclosure && <p className="target-disclosure">/);
  assert.match(budget, /no se conserva el historial del objetivo/);
  assert.match(budget, /className="target-suggestion"/);
  assert.match(budget, /Confirmar asignación/);
  for (const label of ['Apartado mensual', 'Saldo para una fecha', 'Monto objetivo', 'Progreso', 'Falta', 'Estado']) assert.ok(budget.includes(label), `missing Spanish label: ${label}`);
  assert.match(budget, /Se muestra la definición actual/);
});

test('target suggestion is visually separate from Ready to Assign and collapses on compact layouts', () => {
  assert.match(styles, /\.target-suggestion\s*\{/);
  assert.match(styles, /\.target-state\s*\{/);
  assert.match(styles, /@media \(max-width: 720px\)[\s\S]*?\.target-state/);
});
