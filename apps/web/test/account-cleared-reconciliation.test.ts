import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const page = read('../app/accounts/[accountId]/page.tsx');
const controller = read('../app/hooks/useBudgetApp.ts');
const models = read('../app/models.ts');

test('account activity renders both balances from the account projection', () => {
  assert.match(models, /clearedBalanceMinor:\s*number/);
  assert.match(page, /formatMoney\(account\.balanceMinor\)/);
  assert.match(page, /formatMoney\(account\.clearedBalanceMinor\)/);
  assert.doesNotMatch(page, /summary\??\.[\s\S]{0,80}clearedBalanceMinor/);
});

test('cleared toggle sends the current version and a fresh idempotency key', () => {
  assert.match(controller, /transactions\/\$\{item\.transactionId\}\/cleared/);
  assert.match(controller, /'Idempotency-Key':\s*crypto\.randomUUID\(\)/);
  assert.match(controller, /'If-Match':\s*`W\/"\$\{budget\.version\}"`/);
  assert.match(page, /setTransactionCleared/);
});

test('reconciled rows are distinguished and expose no ordinary mutation actions', () => {
  const row = page.match(/function AccountActivityRow[\s\S]*?\n}/)?.[0] ?? '';
  assert.match(row, /item\.clearedState === 'RECONCILED'/);
  assert.match(row, /Conciliado/);
  assert.match(row, /item\.clearedState !== 'RECONCILED'/);
  assert.doesNotMatch(row, /Editar|Eliminar|onEdit|onDelete/);
});

test('reconciliation dialog displays the account projection cleared balance', () => {
  assert.match(page, /Conciliar cuenta/);
  assert.match(page, /formatMoney\(account\.clearedBalanceMinor\)/);
  assert.match(page, /aria-labelledby="reconciliation-title"/);
});

test('mismatch requires a reason and explicit confirmation before reconciliation', () => {
  assert.match(page, /differenceMinor/);
  assert.match(page, /reason/);
  assert.match(page, /type="checkbox"/);
  assert.match(page, /confirmAdjustment:\s*false/);
  assert.match(page, /confirmAdjustment:\s*true/);
  assert.match(page, /Aún no se ha realizado ningún cambio/);
});

test('unlock, revert, and correction are unavailable rather than offered as actions', () => {
  assert.match(page, /no se pueden desbloquear, revertir ni corregir/i);
  assert.doesNotMatch(page, /<button[^>]*>[^<]*(?:Desbloquear|Revertir|Corregir)/i);
  assert.doesNotMatch(page, /<a[^>]*>[^<]*(?:Desbloquear|Revertir|Corregir)/i);
});

test('the surface never calculates a cleared balance or adjustment', () => {
  assert.doesNotMatch(page, /(?:clearedBalanceMinor|adjustmentMinor)\s*[+*/-]/);
  assert.doesNotMatch(page, /confirmedClearedBalanceMinor\s*[-+]\s*observedClearedBalanceMinor/);
  assert.doesNotMatch(page, /app\.summary/);
});
