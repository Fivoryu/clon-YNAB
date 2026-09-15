import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const document = readFileSync(new URL('../openapi.yaml', import.meta.url), 'utf8');
const operationBlock = (path: string, method: string) => {
  const start = document.indexOf(`  ${path}:`);
  assert.notEqual(start, -1, `missing OpenAPI path ${path}`);
  const nextPath = document.indexOf('\n  /', start + 1);
  const components = document.indexOf('\ncomponents:', start + 1);
  const pathBlock = document.slice(start, Math.min(nextPath === -1 ? document.length : nextPath, components === -1 ? document.length : components));
  const operation = pathBlock.indexOf(`\n    ${method}:`);
  assert.notEqual(operation, -1, `${method.toUpperCase()} ${path} is missing`);
  const remainder = pathBlock.slice(operation + 1); const nextMethod = remainder.search(/\n    [a-z][a-z-]*:/);
  return pathBlock.slice(0, operation) + remainder.slice(0, nextMethod === -1 ? remainder.length : nextMethod);
};
const routes = [
  ['/api/v1/auth/register', 'post', '201', true, false, ['Conflict']], ['/api/v1/auth/sign-in', 'post', '200', true, false, ['Unauthenticated']],
  ['/api/v1/auth/sign-out', 'post', '200', false, false, []],
  ['/api/v1/budgets', 'get', '200', false, true, ['Unauthenticated', 'NotFound']], ['/api/v1/budgets', 'post', '201', false, true, ['Unauthenticated', 'Conflict']],
  ['/api/v1/budgets/{budgetId}', 'get', '200', false, true, ['Unauthenticated', 'NotFound']], ['/api/v1/budgets/{budgetId}', 'put', '200', true, true, ['ValidationError', 'Unauthenticated', 'NotFound']],
  ['/api/v1/budgets/{budgetId}/categories', 'post', '201', true, true, ['ValidationError', 'Unauthenticated', 'NotFound', 'Conflict']],
  ['/api/v1/budgets/{budgetId}/categories/{categoryId}', 'patch', '200', true, true, ['ValidationError', 'Unauthenticated', 'NotFound']], ['/api/v1/budgets/{budgetId}/categories/{categoryId}/archive', 'post', '200', false, true, ['Unauthenticated', 'NotFound']],
  ['/api/v1/budgets/{budgetId}/income', 'post', '201', true, true, ['ValidationError', 'Unauthenticated', 'NotFound', 'Conflict']],
  ['/api/v1/budgets/{budgetId}/income/{incomeId}/release', 'post', '200', false, true, ['ValidationError', 'Unauthenticated', 'NotFound', 'Conflict']],
  ['/api/v1/budgets/{budgetId}/spending', 'post', '201', true, true, ['ValidationError', 'Unauthenticated', 'NotFound', 'Conflict']],
  ['/api/v1/budgets/{budgetId}/transactions', 'get', '200', false, true, ['ValidationError', 'Unauthenticated', 'NotFound']],
  ['/api/v1/budgets/{budgetId}/transactions/{transactionId}', 'get', '200', false, true, ['Unauthenticated', 'NotFound']],
  ['/api/v1/budgets/{budgetId}/transactions/{transactionId}', 'patch', '200', true, true, ['ValidationError', 'Unauthenticated', 'NotFound', 'Conflict']],
  ['/api/v1/budgets/{budgetId}/transactions/{transactionId}', 'delete', '200', true, true, ['ValidationError', 'Unauthenticated', 'NotFound', 'Conflict']],
  ['/api/v1/budgets/{budgetId}/allocations', 'post', '200', true, true, ['ValidationError', 'Unauthenticated', 'NotFound', 'Conflict']],
  ['/api/v1/budgets/{budgetId}/allocations/unassign', 'post', '200', true, true, ['ValidationError', 'Unauthenticated', 'NotFound', 'Conflict']], ['/api/v1/budgets/{budgetId}/allocations/move', 'post', '200', true, true, ['ValidationError', 'Unauthenticated', 'NotFound', 'Conflict']],
  ['/api/v1/budgets/{budgetId}/summary', 'get', '200', false, true, ['ValidationError', 'Unauthenticated', 'NotFound']],
  ['/api/v1/budgets/{budgetId}/dashboard', 'get', '200', false, true, ['ValidationError', 'Unauthenticated', 'NotFound']],
] as const;
test('OpenAPI covers every implemented API route and its contract boundary', () => {
  for (const [path, method, success, body, secured, errors] of routes) {
    const block = operationBlock(path, method);
    assert.match(block, new RegExp(`['"]?${success}['"]?:`), `${method.toUpperCase()} ${path} is missing success response`);
    if (body) assert.match(block, /requestBody:[\s\S]*?components\/schemas/, `${method.toUpperCase()} ${path} is missing request body schema`);
    for (const parameter of ['RequestId', ...(path.includes('{budgetId}') ? ['BudgetId'] : []), ...(path.includes('{categoryId}') ? ['CategoryId'] : []), ...(path.includes('{incomeId}') ? ['IncomeId'] : []), ...(path.includes('{transactionId}') ? ['TransactionId'] : []), ...(path.endsWith('/summary') || path.endsWith('/dashboard') ? ['Month'] : []), ...(path.includes('/income') || path.endsWith('/spending') || path.includes('/allocations') || ((method === 'patch' || method === 'delete') && path.includes('/transactions/')) ? ['IdempotencyKey', 'IfMatch'] : [])]) assert.match(block, new RegExp(`components/parameters/${parameter}`), `${method.toUpperCase()} ${path} is missing ${parameter}`);
    if (secured) assert.match(block, /security:[\s\S]*?cookieAuth/, `${method.toUpperCase()} ${path} is missing cookie auth`);
    for (const error of errors) assert.match(block, new RegExp(`#/components/responses/${error}`), `${method.toUpperCase()} ${path} is missing ${error}`);
  }
  for (const parameter of ['BudgetId', 'CategoryId', 'IncomeId', 'TransactionId', 'Month', 'MonthOptional', 'RequestId', 'IdempotencyKey', 'IfMatch']) assert.match(document, new RegExp(`^    ${parameter}:`, 'm'), `missing shared parameter ${parameter}`);
  for (const schema of ['SuccessEnvelope', 'ErrorEnvelope', 'User', 'Session', 'Budget', 'Category', 'FinancialSummary', 'IncomeInput', 'SpendingInput', 'AllocationInput', 'MoveInput', 'TransactionEditInput', 'TransactionDeleteInput', 'TransactionHistoryItem', 'TransactionListEnvelope', 'TransactionEnvelope', 'DeleteEnvelope']) assert.match(document, new RegExp(`    ${schema}:`), `missing DTO schema ${schema}`);
  assert.match(document, /cookieAuth:[\s\S]*?in: cookie[\s\S]*?name: sid/);
  assert.match(document, /X-Request-ID/);
  const requestIdSchemas = [...document.matchAll(/requestId: \{([^}]*)\}/g)].map(([_, schema]) => schema);
  assert.equal(requestIdSchemas.length, 2);
  for (const schema of requestIdSchemas) {
    assert.match(schema, /type: string/);
    assert.match(schema, /minLength: 1/);
    assert.match(schema, /description: Non-empty request ID/);
    assert.doesNotMatch(schema, /format: uuid/);
  }
  const responseBlock = (name: string) => {
    const start = document.indexOf(`${name}:`);
    assert.notEqual(start, -1, `missing shared response ${name}`);
    const next = document.indexOf('\n        ', start + 1);
    return document.slice(start, next === -1 ? document.length : next);
  };
  for (const response of ['SessionSuccess', 'EmptySuccess']) {
    assert.match(responseBlock(response), /headers: \{ Set-Cookie: \{[\s\S]*?schema: \{ type: string \}/, `${response} must declare Set-Cookie`);
  }
  assert.match(document, /Idempotency-Key[\s\S]*?replay/i);
  assert.match(document, /If-Match[\s\S]*?expected version/i);
  assert.match(document, /month[\s\S]*?YYYY-MM/);
  assert.match(document, /transfer[\s\S]*?reconciliation[\s\S]*?unsupported/i);
});

test('OpenAPI documents the bounded multi-account and transfer contract', () => {
  for (const [path, method] of [
    ['/api/v1/budgets/{budgetId}/accounts', 'post'],
    ['/api/v1/budgets/{budgetId}/accounts/{accountId}', 'patch'],
    ['/api/v1/budgets/{budgetId}/accounts/{accountId}/archive', 'post'],
    ['/api/v1/budgets/{budgetId}/transfers', 'post'],
  ]) {
    const block = operationBlock(path, method);
    assert.match(block, /IdempotencyKey/);
    assert.match(block, /IfMatch/);
    assert.match(block, /cookieAuth/);
    assert.match(block, /ValidationError/);
    assert.match(block, /NotFound/);
    assert.match(block, /Conflict/);
  }
  assert.match(document, /accounts:\s*\{ type: array, items: \{ \$ref: '#\/components\/schemas\/Account' \} \}/);
  assert.match(document, /accountBalanceMinor:[^\n]*type: integer/);
  assert.match(document, /balanceMinor:[^\n]*type: integer/);
  assert.match(document, /TransferInput:[\s\S]*sourceAccountId[\s\S]*destinationAccountId[\s\S]*amountMinor[\s\S]*date/);
  assert.match(document, /TransferHistoryItem:[\s\S]*kind:[^\n]*TRANSFER[\s\S]*sourceAccount[\s\S]*destinationAccount/);
  assert.match(document, /FinancialResult:[\s\S]*TransferResult/);
  assert.match(document, /InternalError/);
  assert.doesNotMatch(document, /\/api\/v1\/budgets\/\{budgetId\}\/\/(?:imports|cards|splits|reconciliation)/i);
});
