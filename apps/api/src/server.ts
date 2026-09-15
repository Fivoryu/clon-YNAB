import { createServer as createHttpServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { BudgetApp, errorEnvelope } from './app.ts';
import { PrismaBudgetStore } from './persistence/budget-store.ts';
import { FinancialStore } from './persistence/financial-store.ts';
import { parseTransactionDate, type HistoryFilter } from './planning/transaction-history.ts';

const prisma = new PrismaClient();
const json = (res: any, status: number, body: unknown, cookie?: string) => { res.writeHead(status, { 'content-type': 'application/json', ...(cookie ? { 'set-cookie': cookie } : {}) }); res.end(JSON.stringify(body)); };
const bodyOf = async (req: any) => { let text = ''; for await (const chunk of req) text += chunk; return text ? JSON.parse(text) : {}; };
const tokenOf = (req: any) => (req.headers.cookie ?? '').split(';').map((part: string) => part.trim()).find((part: string) => part.startsWith('sid='))?.slice(4) ?? '';
const cookie = (token: string, maxAge = 8 * 60 * 60) => `sid=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
const commandOptions = (req: any) => { const raw = req.headers['if-match']?.toString().replace(/^W\//, '').replace(/^"|"$/g, ''); return { idempotencyKey: req.headers['idempotency-key']?.toString(), expectedVersion: raw === undefined ? undefined : Number(raw) }; };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const parseHistoryQuery = (url: URL): HistoryFilter => {
  if (new TextEncoder().encode(url.search.slice(1)).length > 4096) throw new Error('history query is too long');
  const allowed = new Set(['month', 'account', 'kind', 'category', 'from', 'to', 'q']); const seen = new Set<string>(); const filter: HistoryFilter = {};
  for (const [key, value] of url.searchParams.entries()) {
    if (!allowed.has(key) || seen.has(key)) throw new Error('history query contains an unknown or repeated parameter');
    seen.add(key);
    if (key === 'month') { if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) throw new Error('month must be YYYY-MM'); filter.month = value; }
    else if (key === 'from' || key === 'to') { try { parseTransactionDate(value); } catch { throw new Error(`${key} must be YYYY-MM-DD`); } filter[key] = value; }
    else if (key === 'kind') { if (!['INCOME', 'SPENDING', 'TRANSFER'].includes(value)) throw new Error('kind is invalid'); filter.kind = value as HistoryFilter['kind']; }
    else if (key === 'account' || key === 'category') { if (!uuid.test(value)) throw new Error(`${key} is invalid`); filter[key === 'account' ? 'accountId' : 'categoryId'] = value.toLowerCase(); }
    else { const trimmed = value.replace(/^\p{White_Space}+/u, '').replace(/\p{White_Space}+$/u, ''); if ([...trimmed].length > 200) throw new Error('q must be at most 200 code points'); if (trimmed) filter.q = trimmed; }
  }
  if (filter.from && filter.to && filter.from > filter.to) throw new Error('from must not be later than to');
  return filter;
};

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
    if (budgetId && req.method === 'POST' && action === 'accounts') return json(res, 201, await app.createAccount(token, budgetId, input, requestId, commandOptions(req)));
    if (budgetId && req.method === 'POST' && action === 'transfers') return json(res, 201, await app.recordTransfer(token, budgetId, input, requestId, commandOptions(req)));
    const account = action?.match(/^accounts\/([^/]+)(?:\/(archive))?$/);
    if (budgetId && account?.[1] && req.method === 'PATCH' && !account[2]) return json(res, 200, await app.renameAccount(token, budgetId, account[1], input, requestId, commandOptions(req)));
    if (budgetId && account?.[1] && account[2] === 'archive' && req.method === 'POST') return json(res, 200, await app.archiveAccount(token, budgetId, account[1], requestId, commandOptions(req)));
    if (budgetId && req.method === 'POST' && action === 'categories') return json(res, 201, await app.createCategory(token, budgetId, input.name, requestId));
    const category = action?.match(/^categories\/([^/]+)(?:\/(archive))?$/);
    if (budgetId && category?.[1] && req.method === 'PATCH' && !category[2]) return json(res, 200, await app.renameCategory(token, budgetId, category[1], input.name, requestId));
    if (budgetId && category?.[1] && category[2] === 'archive' && req.method === 'POST') return json(res, 200, await app.archiveCategory(token, budgetId, category[1], requestId));
    if (budgetId && req.method === 'POST' && action === 'income') return json(res, 201, await app.recordIncome(token, budgetId, input, requestId, commandOptions(req)));
    const release = action?.match(/^income\/([^/]+)\/release$/);
    if (budgetId && release?.[1] && req.method === 'POST') return json(res, 200, await app.releaseIncome(token, budgetId, release[1], requestId, commandOptions(req)));
    if (budgetId && req.method === 'POST' && action === 'spending') return json(res, 201, await app.recordSpending(token, budgetId, input, requestId, commandOptions(req)));
    if (budgetId && req.method === 'GET' && action === 'transactions') { await app.authenticate(token); return json(res, 200, await app.listTransactions(token, budgetId, parseHistoryQuery(url), requestId)); }
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
