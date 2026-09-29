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
  ['/api/v1/budgets/{budgetId}/categories/{categoryId}/target', 'put', '200', true, true, ['ValidationError', 'Unauthenticated', 'NotFound', 'Conflict']], ['/api/v1/budgets/{budgetId}/categories/{categoryId}/target', 'delete', '200', false, true, ['ValidationError', 'Unauthenticated', 'NotFound', 'Conflict']],
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
  ['/api/v1/budgets/{budgetId}/reports/monthly', 'get', '200', false, true, ['ValidationError', 'Unauthenticated', 'NotFound']],
] as const;
test('OpenAPI covers every implemented API route and its contract boundary', () => {
  for (const [path, method, success, body, secured, errors] of routes) {
    const block = operationBlock(path, method);
    assert.match(block, new RegExp(`['"]?${success}['"]?:`), `${method.toUpperCase()} ${path} is missing success response`);
    if (body) assert.match(block, /requestBody:[\s\S]*?components\/schemas/, `${method.toUpperCase()} ${path} is missing request body schema`);
    for (const parameter of ['RequestId', ...(path.includes('{budgetId}') ? ['BudgetId'] : []), ...(path.includes('{categoryId}') ? ['CategoryId'] : []), ...(path.includes('{incomeId}') ? ['IncomeId'] : []), ...(path.includes('{transactionId}') ? ['TransactionId'] : []), ...(path.endsWith('/summary') || path.endsWith('/dashboard') || path.endsWith('/reports/monthly') ? ['Month'] : []), ...(path.includes('/income') || path.endsWith('/spending') || path.endsWith('/target') || path.includes('/allocations') || ((method === 'patch' || method === 'delete') && path.includes('/transactions/')) ? ['IdempotencyKey', path.endsWith('/target') ? 'RequiredIfMatch' : 'IfMatch'] : [])]) assert.match(block, new RegExp(`components/parameters/${parameter}`), `${method.toUpperCase()} ${path} is missing ${parameter}`);
    if (secured) assert.match(block, /security:[\s\S]*?cookieAuth/, `${method.toUpperCase()} ${path} is missing cookie auth`);
    for (const error of errors) assert.match(block, new RegExp(`#/components/responses/${error}`), `${method.toUpperCase()} ${path} is missing ${error}`);
  }
  for (const parameter of ['BudgetId', 'CategoryId', 'IncomeId', 'TransactionId', 'Month', 'MonthOptional', 'RequestId', 'IdempotencyKey', 'IfMatch']) assert.match(document, new RegExp(`^    ${parameter}:`, 'm'), `missing shared parameter ${parameter}`);
  for (const schema of ['SuccessEnvelope', 'ErrorEnvelope', 'User', 'Session', 'Budget', 'Category', 'CategoryTargetInput', 'CategoryTarget', 'CategoryTargetState', 'CategoryTargetResult', 'CategoryTargetEnvelope', 'FinancialSummary', 'IncomeInput', 'SpendingInput', 'AllocationInput', 'MoveInput', 'TransactionEditInput', 'TransactionDeleteInput', 'TransactionHistoryItem', 'TransactionListEnvelope', 'TransactionEnvelope', 'DeleteEnvelope', 'MonthlyReport', 'MonthlyReportCategory', 'MonthlyReportTransferItem', 'MonthlyReportEnvelope']) assert.match(document, new RegExp(`^    ${schema}:`, 'm'), `missing DTO schema ${schema}`);
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
    const lineStart = document.lastIndexOf('\n', start) + 1;
    const indent = /^[ \t]*/.exec(document.slice(lineStart))![0].length;
    const tail = document.slice(start);
    const boundary = [...tail.matchAll(/\n([ \t]*)(?=\S)/g)].find((match) => match[1].length <= indent);
    const end = boundary && boundary.index !== undefined ? start + boundary.index : document.length;
    return document.slice(start, end);
  };
  for (const response of ['SessionSuccess', 'EmptySuccess']) {
    assert.match(responseBlock(response), /headers: \{ Set-Cookie: \{[\s\S]*?schema: \{ type: string \}/, `${response} must declare Set-Cookie`);
  }
  assert.match(document, /Idempotency-Key[\s\S]*?replay/i);
  assert.match(document, /If-Match[\s\S]*?expected version/i);
  assert.match(document, /month[\s\S]*?YYYY-MM/);
  assert.match(document, /transfer[\s\S]*?reconciliation[\s\S]*?unsupported/i);
});

test('OpenAPI documents target kinds, conditional months, summary state, and null removal results', () => {
  const block = operationBlock('/api/v1/budgets/{budgetId}/categories/{categoryId}/target', 'put');
  assert.match(block, /IdempotencyKey/);
  assert.match(block, /RequiredIfMatch/);
  assert.match(block, /CategoryTargetInput/);
  assert.match(document, /CategoryTargetInput:[\s\S]*MONTHLY_SET_ASIDE[\s\S]*BALANCE_BY_DATE[\s\S]*targetMonth/);
  assert.match(document, /CategoryTargetResult:[^\n]*target:[^\n]*nullable: true/);
  assert.match(document, /CategoryTargetState:[\s\S]*progressMinor:[^\n]*type: integer[\s\S]*remainingMinor:[^\n]*minimum: 0[\s\S]*status:[^\n]*MET, UNDERFUNDED, OVERDUE/);
  assert.match(document, /CategorySummary:[^\n]*target: \{ allOf: \[\{ \$ref: '#\/components\/schemas\/CategoryTargetState' \}\] \}/, 'an untargeted category omits the property entirely, so the summary target is not nullable');
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

test('OpenAPI declares components at the document root and every component reference resolves', (t) => {
  const lines = document.split(/\r?\n/);
  const indentOf = (line: string) => line.length - line.trimStart().length;
  const topLevelKeys = new Set(
    lines
      .filter((line) => line.length > 0 && indentOf(line) === 0 && /^[A-Za-z0-9_]+:/.test(line))
      .map((line) => line.slice(0, line.indexOf(':') + 1)),
  );

  assert.ok(topLevelKeys.has('components:'), 'components: must be declared at column 0');
  assert.ok(topLevelKeys.has('paths:'), 'paths: must be declared at column 0');

  const pathsIndex = lines.indexOf('paths:');
  const componentsIndex = lines.indexOf('components:');
  assert.notEqual(pathsIndex, -1, 'paths: must be declared at column 0');
  assert.notEqual(componentsIndex, -1, 'components: must be declared at column 0');
  assert.ok(pathsIndex < componentsIndex, 'components: must follow paths: at the document root');

  // paths: must not contain a nested components key.
  const nextTopLevelIndex = lines.findIndex((line, index) => index > pathsIndex && line.length > 0 && indentOf(line) === 0);
  const pathsEnd = nextTopLevelIndex === -1 ? lines.length : nextTopLevelIndex;
  const nestedComponents = lines.slice(pathsIndex + 1, pathsEnd).filter((line) => /^[ \t]+components\s*:/.test(line));
  assert.deepEqual(nestedComponents, [], 'paths: must not contain a nested components key');

  // Collect the sections declared directly under components: and the entries declared under each section.
  const sections: string[] = [];
  const declarations = new Map<string, Set<string>>();
  let currentSection: string | null = null;
  for (let index = componentsIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim().length === 0) continue;
    const indent = indentOf(line);
    if (indent === 0) break;
    const key = /^([A-Za-z0-9_]+):/.exec(line.trim());
    if (!key) continue;
    if (indent === 2) {
      currentSection = key[1];
      sections.push(currentSection);
      declarations.set(currentSection, new Set());
    } else if (indent === 4 && currentSection) {
      declarations.get(currentSection)!.add(key[1]);
    }
  }
  assert.deepEqual(sections.slice().sort(), ['parameters', 'responses', 'schemas', 'securitySchemes'], 'components sections must be exactly securitySchemes, parameters, responses, and schemas');

  // Every #/components/<section>/<name> reference anywhere in the document must resolve to a declared entry.
  const references = [...document.matchAll(/#\/components\/([A-Za-z0-9]+)\/([A-Za-z0-9_]+)/g)].map((match) => ({ section: match[1], name: match[2] }));
  assert.ok(references.length > 0, 'expected the document to reference at least one component');
  const unresolved = references.filter(({ section, name }) => !declarations.get(section)?.has(name));
  assert.deepEqual(unresolved, [], `unresolved component references: ${JSON.stringify(unresolved)}`);
  t.diagnostic(`resolved ${references.length} #/components references across ${sections.length} sections`);
});

test('OpenAPI documents the extended report route, its two modes, and its resolvable range components', () => {
  const parameters = ['RangeFrom', 'RangeTo'];
  const schemas = ['MultiMonthReport', 'MultiMonthReportPolicy', 'MultiMonthReportTotal', 'MultiMonthReportDisclosure', 'MultiMonthReportEnvelope'];
  const block = operationBlock('/api/v1/budgets/{budgetId}/reports/monthly', 'get');

  assert.deepEqual([...block.matchAll(/components\/parameters\/([A-Za-z]+)/g)].map(match => match[1]), ['RequestId', 'BudgetId', 'Month', 'RangeFrom', 'RangeTo']);
  for (const name of parameters) {
    assert.match(document, new RegExp(`^    ${name}:`, 'm'), `missing shared parameter ${name}`);
    assert.match(block, new RegExp(`components/parameters/${name}`), `reports/monthly must reference ${name}`);
  }
  for (const name of schemas) {
    assert.match(document, new RegExp(`^    ${name}:`, 'm'), `missing DTO schema ${name}`);
    assert.match(document, new RegExp(`#/components/schemas/${name}`), `schema ${name} must be referenced so the reference-resolution check covers it`);
  }
  assert.match(document, /MonthlyReportSuccess: \{ description: [^\n]*oneOf: \[\{ \$ref: '#\/components\/schemas\/MonthlyReportEnvelope' \}, \{ \$ref: '#\/components\/schemas\/MultiMonthReportEnvelope' \}\]/, 'the 200 response must cover exactly the single-month and range envelopes');
  assert.doesNotMatch(document, /reports\/months/, 'range mode extends the existing route instead of adding a sibling');
});

test('OpenAPI documents the manual CSV import/export contract and limits', () => {
  const exportBlock = operationBlock('/api/v1/budgets/{budgetId}/transactions/export', 'get');
  assert.match(exportBlock, /text\/csv/);
  assert.match(exportBlock, /Content-Disposition/);
  assert.match(exportBlock, /cookieAuth/);
  assert.match(exportBlock, /InternalError/);

  const importBlock = operationBlock('/api/v1/budgets/{budgetId}/transactions/import', 'post');
  for (const value of ['text/csv', 'IdempotencyKey', 'RequiredIfMatch', 'CsvImportSuccess', 'ValidationError', 'Unauthenticated', 'NotFound', 'Conflict', 'UnsupportedMediaType', 'InternalError']) assert.match(importBlock, new RegExp(value.replace('/', '\\/')));
  assert.match(importBlock, /10 MiB/);
  assert.match(importBlock, /5000 data rows/);
  assert.match(importBlock, /1000 returned diagnostics/);
  assert.match(importBlock, /date,type,account,amountMinor,category,payee,memo/);
  assert.match(importBlock, /sourceAccountId=>destinationAccountId/);
  assert.match(document, /CsvDiagnostic:/);
  assert.match(document, /CsvImportDetails:/);
  assert.match(document, /CsvImportResult:/);
  assert.match(document, /UNSUPPORTED_MEDIA_TYPE/);
  assert.match(document, /pattern: '\^\(\?:\[0-9\]\+\|"\[0-9\]\+"\|W\/"\[0-9\]\+"\)\$'/);
});
