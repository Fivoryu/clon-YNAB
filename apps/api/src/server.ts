import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { BudgetApp, errorEnvelope } from './app.ts';

const app = new BudgetApp();
const json = (res: any, status: number, body: unknown, cookie?: string) => { res.writeHead(status, { 'content-type': 'application/json', ...(cookie ? { 'set-cookie': cookie } : {}) }); res.end(JSON.stringify(body)); };
const bodyOf = async (req: any) => { let text = ''; for await (const chunk of req) text += chunk; return text ? JSON.parse(text) : {}; };
const tokenOf = (req: any) => (req.headers.cookie ?? '').split(';').map((part: string) => part.trim()).find((part: string) => part.startsWith('sid='))?.slice(4) ?? '';
const cookie = (token: string, maxAge = 8 * 60 * 60) => `sid=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
const commandOptions = (req: any) => { const raw = req.headers['if-match']?.toString().replace(/^W\//, '').replace(/^"|"$/g, ''); return { idempotencyKey: req.headers['idempotency-key']?.toString(), expectedVersion: raw === undefined ? undefined : Number(raw) }; };

export const server = createServer(async (req, res) => {
  const requestId = req.headers['x-request-id']?.toString() || randomUUID();
  try {
    const input = await bodyOf(req); const url = new URL(req.url || '/', 'http://localhost'); const path = url.pathname; const token = tokenOf(req);
    if (req.method === 'POST' && path === '/api/v1/auth/register') return json(res, 201, app.register(input.email, input.password, requestId));
    if (req.method === 'POST' && path === '/api/v1/auth/sign-in') { const result = app.signIn(input.email, input.password, requestId); return json(res, 200, result, cookie(result.data.sessionToken)); }
    if (req.method === 'POST' && path === '/api/v1/auth/sign-out') { app.signOut(token); return json(res, 200, { data: null, requestId }, cookie('', 0)); }
    if (req.method === 'GET' && path === '/api/v1/budgets') return json(res, 200, app.resumeBudget(token, requestId));
    const match = path.match(/^\/api\/v1\/budgets(?:\/([^/]+))?(?:\/(.*))?$/); const budgetId = match?.[1]; const action = match?.[2];
    if (req.method === 'POST' && budgetId === undefined) return json(res, 201, app.createBudget(token, requestId));
    if (budgetId && req.method === 'GET' && !action) return json(res, 200, app.getBudget(token, budgetId, requestId));
    if (budgetId && req.method === 'PUT' && !action) return json(res, 200, app.saveSetup(token, budgetId, input, requestId));
    if (budgetId && req.method === 'POST' && action === 'categories') return json(res, 201, app.createCategory(token, budgetId, input.name, requestId));
    const category = action?.match(/^categories\/([^/]+)(?:\/(archive))?$/);
    if (budgetId && category?.[1] && req.method === 'PATCH' && !category[2]) return json(res, 200, app.renameCategory(token, budgetId, category[1], input.name, requestId));
    if (budgetId && category?.[1] && category[2] === 'archive' && req.method === 'POST') return json(res, 200, app.archiveCategory(token, budgetId, category[1], requestId));
    if (budgetId && req.method === 'POST' && action === 'income') return json(res, 201, app.recordIncome(token, budgetId, input, requestId, commandOptions(req)));
    const release = action?.match(/^income\/([^/]+)\/release$/);
    if (budgetId && release?.[1] && req.method === 'POST') return json(res, 200, app.releaseIncome(token, budgetId, release[1], requestId, commandOptions(req)));
    if (budgetId && req.method === 'POST' && action === 'spending') return json(res, 201, app.recordSpending(token, budgetId, input, requestId, commandOptions(req)));
    if (budgetId && req.method === 'POST' && action === 'allocations') return json(res, 200, app.assign(token, budgetId, input, requestId, commandOptions(req)));
    if (budgetId && req.method === 'POST' && action === 'allocations/unassign') return json(res, 200, app.unassign(token, budgetId, input, requestId, commandOptions(req)));
    if (budgetId && req.method === 'POST' && action === 'allocations/move') return json(res, 200, app.move(token, budgetId, input, requestId, commandOptions(req)));
    if (budgetId && req.method === 'GET' && action === 'summary') return json(res, 200, app.getFinancialSummary(token, budgetId, url.searchParams.get('month') || '', requestId));
    if (budgetId && req.method === 'GET' && action === 'dashboard') return json(res, 200, app.getDashboard(token, budgetId, url.searchParams.get('month') || '', requestId));
    return json(res, 404, { error: { code: 'NOT_FOUND', message: 'Resource not found', requestId } });
  } catch (error) { const result = errorEnvelope(error, requestId); return json(res, result.status, result.body); }
});

if (process.argv[1]?.endsWith('server.ts')) server.listen(Number(process.env.PORT || 3001));
