import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
const nextConfig = readFileSync(new URL('../../../next.config.mjs', import.meta.url), 'utf8');

test('web journey keeps the API contract at the browser boundary', () => {
  for (const route of [
    '/api/v1/auth/sign-out', '/api/v1/budgets', '/dashboard', '/summary',
    '/income', '/release', '/spending', '/allocations', '/allocations/unassign', '/allocations/move',
  ]) assert.match(page, new RegExp(route.replaceAll('/', '\\/')));
  assert.match(page, /auth\/\$\{action\}/);
  assert.match(page, /register/);
  assert.match(page, /sign-in/);
  assert.match(page, /Idempotency-Key/);
  assert.match(page, /If-Match/);
  assert.match(page, /credentials:\s*['"]include['"]/);
});

test('development web runtime proxies same-origin API calls', () => {
  assert.match(nextConfig, /source:\s*['"]\/api\/v1\/:path\*['"]/);
  assert.match(nextConfig, /destination:\s*['"]http:\/\/localhost:3001\/api\/v1\/:path\*['"]/);
});

test('history workflow stays at the browser API boundary', () => {
  for (const route of ['/transactions', 'Idempotency-Key', 'If-Match']) assert.match(page, new RegExp(route.replaceAll('/', '\\/')));
  assert.match(page, /Transaction history/);
  assert.match(page, /Load history/);
  assert.match(page, /Keep current category/);
  assert.match(page, /Confirm delete/);
  assert.match(page, /crypto\.randomUUID\(\)/);
});
