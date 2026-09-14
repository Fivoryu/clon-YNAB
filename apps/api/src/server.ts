import { createServer as createHttpServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { BudgetApp, errorEnvelope } from './app.ts';
import { PrismaBudgetStore } from './persistence/budget-store.ts';
import { FinancialStore } from './persistence/financial-store.ts';

const prisma = new PrismaClient();
const json = (res: any, status: number, body: unknown, cookie?: string) => { res.writeHead(status, { 'content-type': 'application/json', ...(cookie ? { 'set-cookie': cookie } : {}) }); res.end(JSON.stringify(body)); };
const bodyOf = async (req: any) => { let text = ''; for await (const chunk of req) text += chunk; return text ? JSON.parse(text) : {}; };
const tokenOf = (req: any) => (req.headers.cookie ?? '').split(';').map((part: string) => part.trim()).find((part: string) => part.startsWith('sid='))?.slice(4) ?? '';
const cookie = (token: string, maxAge = 8 * 60 * 60) => `sid=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
const commandOptions = (req: any) => { const raw = req.headers['if-match']?.toString().replace(/^W\//, '').replace(/^"|"$/g, ''); return { idempotencyKey: req.headers['idempotency-key']?.toString(), expectedVersion: raw === undefined ? undefined : Number(raw) }; };

export const createServer = (app = new BudgetApp(Date.now, new PrismaBudgetStore(prisma), new FinancialStore(prisma))) => createHttpServer(async (req, res) => {
  const requestId = req.headers['x-request-id']?.toString() || randomUUID();
  try {
    const input = await bodyOf(req); const url = new URL(req.url || '/', 'http://localhost'); const path = url.pathname; const token = tokenOf(req);
    if (req.method === 'POST' && path === '/api/v1/auth/register') return json(res, 201, await app.register(input.email, input.password, requestId));
    if (req.method === 'POST' && path === '/api/v1/auth/sign-in') { const result = await app.signIn(input.email, input.password, requestId); return json(res, 200, result, cookie(result.data.sessionToken)); }
    if (req.method === 'POST' && path === '/api/v1/auth/sign-out') { await app.signOut(token); return json(res, 200, { data: null, requestId }, cookie('', 0)); }
    if (req.method === 'GET' && path === '/api/v1/budgets') return json(res, 200, await app.resumeBudget(token, requestId));
    const match = path.match(/^\/api\/v1\/budgets(?:\/([^/]+))?(?:\/(.*))?$/); const budgetId = match?.[1]; const action = match?.[2];
    if (req.method === 'POST' && budgetId === undefined) return json(res, 201, await app.createBudget(token, requestId));
    if (budgetId && req.method === 'GET' && !action) return json(res, 200, await app.getBudget(token, budgetId, requestId));
    if (budgetId && req.method === 'PUT' && !action) return json(res, 200, await app.saveSetup(token, budgetId, input, requestId));
    if (budgetId && req.method === 'POST' && action === 'categories') return json(res, 201, await app.createCategory(token, budgetId, input.name, requestId));
    const category = action?.match(/^categories\/([^/]+)(?:\/(archive))?$/);
    if (budgetId && category?.[1] && req.method === 'PATCH' && !category[2]) return json(res, 200, await app.renameCategory(token, budgetId, category[1], input.name, requestId));
    if (budgetId && category?.[1] && category[2] === 'archive' && req.method === 'POST') return json(res, 200, await app.archiveCategory(token, budgetId, category[1], requestId));
    if (budgetId && req.method === 'POST' && action === 'income') return json(res, 201, await app.recordIncome(token, budgetId, input, requestId, commandOptions(req)));
    const release = action?.match(/^income\/([^/]+)\/release$/);
    if (budgetId && release?.[1] && req.method === 'POST') return json(res, 200, await app.releaseIncome(token, budgetId, release[1], requestId, commandOptions(req)));
    if (budgetId && req.method === 'POST' && action === 'spending') return json(res, 201, await app.recordSpending(token, budgetId, input, requestId, commandOptions(req)));
    if (budgetId && req.method === 'GET' && action === 'transactions') return json(res, 200, await app.listTransactions(token, budgetId, url.searchParams.get('month') || undefined, requestId));
    const transaction = action?.match(/^transactions\/([^/]+)$/);
    if (budgetId && transaction?.[1] && req.method === 'GET') return json(res, 200, await app.getTransaction(token, budgetId, transaction[1], requestId));
    if (budgetId && transaction?.[1] && req.method === 'PATCH') return json(res, 200, await app.editTransaction(token, budgetId, transaction[1], input, requestId, commandOptions(req)));
    if (budgetId && transaction?.[1] && req.method === 'DELETE') return json(res, 200, await app.deleteTransaction(token, budgetId, transaction[1], input, requestId, commandOptions(req)));
    if (budgetId && req.method === 'POST' && action === 'allocations') return json(res, 200, await app.assign(token, budgetId, input, requestId, commandOptions(req)));
    if (budgetId && req.method === 'POST' && action === 'allocations/unassign') return json(res, 200, await app.unassign(token, budgetId, input, requestId, commandOptions(req)));
    if (budgetId && req.method === 'POST' && action === 'allocations/move') return json(res, 200, await app.move(token, budgetId, input, requestId, commandOptions(req)));
    if (budgetId && req.method === 'GET' && action === 'summary') return json(res, 200, await app.getFinancialSummary(token, budgetId, url.searchParams.get('month') || '', requestId));
    if (budgetId && req.method === 'GET' && action === 'dashboard') return json(res, 200, await app.getDashboard(token, budgetId, url.searchParams.get('month') || '', requestId));
    return json(res, 404, { error: { code: 'NOT_FOUND', message: 'Resource not found', requestId } });
  } catch (error) { const result = errorEnvelope(error, requestId); return json(res, result.status, result.body); }
});

export const server = createServer();
if (process.argv[1]?.endsWith('server.ts')) server.listen(Number(process.env.PORT || 3001));
