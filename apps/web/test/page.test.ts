import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
const controller = readFileSync(new URL('../app/hooks/useBudgetApp.ts', import.meta.url), 'utf8');
const workspace = readFileSync(new URL('../app/components/BudgetWorkspace.tsx', import.meta.url), 'utf8');
const auth = readFileSync(new URL('../app/components/AuthScreen.tsx', import.meta.url), 'utf8');
const setup = readFileSync(new URL('../app/components/SetupScreen.tsx', import.meta.url), 'utf8');
const nav = readFileSync(new URL('../app/components/WorkspaceNav.tsx', import.meta.url), 'utf8');
const web = [page, controller, workspace, auth, setup, nav].join('\n');
const nextConfig = readFileSync(new URL('../../../next.config.mjs', import.meta.url), 'utf8');

test('web journey keeps the API contract at the browser boundary', () => {
  for (const route of [
    '/api/v1/auth/sign-out', '/api/v1/budgets', '/dashboard', '/summary',
    '/income', '/release', '/spending', '/allocations', '/allocations/unassign', '/allocations/move',
  ]) assert.match(web, new RegExp(route.replaceAll('/', '\\/')));
  assert.match(controller, /auth\/\$\{action\}/);
  assert.match(auth, /Create account/);
  assert.match(auth, /Sign in/);
  assert.match(controller, /Idempotency-Key/);
  assert.match(controller, /If-Match/);
  assert.match(controller, /credentials:\s*['"]include['"]/);
});

test('web boundary has no provider, credential, linking, or candidate-application flow', () => {
  assert.doesNotMatch(web, /provider|bank integration|account linking|candidate|apply simulation|real money/i);
  assert.doesNotMatch(auth, /provider|bank|credential|link account/i);
  assert.doesNotMatch(web, /calculateAccountBalance|calculateRta|parseTransactionCsv|FinancialEvent|TransferState/);
  assert.match(controller, /credentials:\s*['\"]include['\"]/);
  assert.match(controller, /Idempotency-Key/);
  assert.match(controller, /If-Match/);
  assert.match(controller, /transactions\/export/);
  assert.match(controller, /transactions\/import/);
  assert.match(workspace, /Transaction history/);
});

test('development web runtime proxies same-origin API calls', () => {
  assert.match(nextConfig, /source:\s*['"]\/api\/v1\/:path\*['"]/);
  assert.match(nextConfig, /destination:\s*['"]http:\/\/localhost:3001\/api\/v1\/:path\*['"]/);
});

test('history workflow stays at the browser API boundary', () => {
  for (const route of ['/transactions', 'Idempotency-Key', 'If-Match']) assert.match(web, new RegExp(route.replaceAll('/', '\\/')));
  assert.match(workspace, /Transaction history/);
  assert.match(workspace, /Load history/);
  assert.match(workspace, /Keep current category/);
  assert.match(workspace, /Confirm delete/);
  assert.match(controller, /crypto\.randomUUID\(\)/);
});

test('CSV workflow stays server-authoritative and exposes bounded manual import/export controls', () => {
  assert.match(controller, /transactions\/export/);
  assert.match(controller, /transactions\/import/);
  assert.match(controller, /text\/csv; charset=utf-8/);
  assert.match(controller, /10_485_760/);
  assert.match(workspace, /Download CSV/);
  assert.match(workspace, /Import CSV/);
  assert.match(workspace, /CSV diagnostics/);
  assert.match(controller, /await refresh\(\)/);
  assert.doesNotMatch(web, /calculateAccountBalance|calculateRta|parseTransactionCsv/);
});

test('UX separates access, setup, and focused workspace sections', () => {
  assert.match(page, /if \(!app\.budget\)/);
  assert.match(page, /AuthScreen/);
  assert.match(page, /SetupScreen/);
  assert.match(page, /BudgetWorkspace/);
  assert.match(workspace, /activeSection === 'overview'/);
  assert.match(workspace, /activeSection === 'plan'/);
  assert.match(workspace, /activeSection === 'activity'/);
  assert.match(workspace, /activeSection === 'accounts'/);
  assert.match(workspace, /activeSection === 'history'/);
  assert.match(workspace, /activeSection === 'data'/);
  assert.match(workspace, /Recommended now/);
  for (const label of ['Overview', 'Plan', 'Activity', 'Accounts', 'History', 'Data']) assert.match(nav, new RegExp(label));
  assert.doesNotMatch(auth, /Record income|Transaction history|CSV import and export/);
});
