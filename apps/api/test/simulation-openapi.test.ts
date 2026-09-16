import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const document = readFileSync(new URL('../openapi.yaml', import.meta.url), 'utf8');
const operationBlock = (path: string, method: string) => {
  const start = document.indexOf(`  ${path}:`);
  assert.notEqual(start, -1, `missing OpenAPI path ${path}`);
  const nextPath = document.indexOf('\n  /', start + 1);
  const components = document.indexOf('\ncomponents:', start + 1);
  const pathBlock = document.slice(start, Math.min(nextPath === -1 ? document.length : nextPath, components === -1 ? document.length : components));
  const operation = pathBlock.indexOf(`\n    ${method}:`);
  assert.notEqual(operation, -1, `${method.toUpperCase()} ${path} is missing`);
  return pathBlock;
};

test('OpenAPI documents every scoped simulation route and required authorization headers', () => {
  const routes = [
    ['/api/v1/budgets/{budgetId}/simulations/profiles', 'get', false],
    ['/api/v1/budgets/{budgetId}/simulations/runs', 'post', true],
    ['/api/v1/budgets/{budgetId}/simulations/runs/{runId}/start', 'post', true],
    ['/api/v1/budgets/{budgetId}/simulations/runs/{runId}/advance', 'post', true],
    ['/api/v1/budgets/{budgetId}/simulations/runs/{runId}/retry', 'post', true],
    ['/api/v1/budgets/{budgetId}/simulations/runs/{runId}', 'get', false],
    ['/api/v1/budgets/{budgetId}/simulations/runs/{runId}/candidates', 'get', false],
    ['/api/v1/budgets/{budgetId}/simulations/runs/{runId}/checkpoints', 'get', false],
    ['/api/v1/budgets/{budgetId}/simulations/runs/{runId}/audit', 'get', false],
    ['/api/v1/budgets/{budgetId}/simulations/runs/{runId}/inspect', 'post', true],
  ] as const;
  for (const [path, method, mutating] of routes) {
    const block = operationBlock(path, method);
    assert.match(block, /responses:/);
    assert.match(block, /Success|Simulation/);
    assert.match(block, /cookieAuth/);
    assert.match(block, /RequestId/);
    assert.match(block, /NotFound/);
    if (mutating) assert.match(block, /IdempotencyKey/);
    if (['start', 'advance', 'retry', 'inspect'].some(control => path.endsWith(`/${control}`))) assert.match(block, /SimulationIfMatch/);
  }
});

test('OpenAPI simulation schemas state bounded fictional no-network and financial-neutral boundaries', () => {
  for (const schema of ['SimulationProfile', 'SimulationRun', 'SimulationCandidate', 'SimulationCheckpoint', 'SimulationAudit', 'SimulationProjection', 'SimulationCreateInput', 'SimulationInspectInput']) assert.match(document, new RegExp(`^    ${schema}:`, 'm'));
  assert.match(document, /^    SimulationRunState:[\s\S]*enum: \[DISCONNECTED, CONNECTING, CONNECTED, SYNCING, PARTIAL, FAILED, TIMED_OUT, SUCCEEDED\]/m);
  assert.match(document, /^    SimulationCandidateStatus:[\s\S]*enum: \[PENDING, POSTED, DUPLICATE, REJECTED\]/m);
  assert.doesNotMatch(document, /APPLIED/);
  assert.match(document, /fictional[\s\S]*local simulation[\s\S]*no network[\s\S]*no real money/i);
  assert.match(document, /credentials[\s\S]*not accepted/i);
  assert.match(document, /FinancialEvent|budget version|CSV/i);
  assert.match(document, /application[\s\S]*deferred/i);
  assert.match(document, /^    SimulationIfMatch:/m);
  assert.match(document, /SimulationSuccessEnvelope/);
  assert.match(document, /SimulationError/);
});
