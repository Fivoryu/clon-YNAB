import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { applyAssignment, calculateAccountBalance, calculateCategory, calculateRta, moveAssignment, monthForDate, positiveRollover, releaseIncome, unassign } from './planning/engine.ts';

type Clock = () => number;
export type Envelope<T> = { data: T; requestId: string };
export type User = { id: string; email: string };
export type Category = { id: string; name: string; archived: boolean };
export type Budget = { id: string; setupStep: 'ACCOUNT' | 'CATEGORIES' | 'COMPLETE'; timezone: 'UTC'; version: number; account: { id: string; name: string; openingBalanceMinor: number } | null; categories: Category[] };
type StoredUser = User & { passwordHash: string; budgetId?: string };
type FinancialEvent = { id: string; kind: 'INCOME' | 'INCOME_RELEASE' | 'SPENDING' | 'ASSIGNMENT' | 'UNASSIGNMENT' | 'MOVE'; amountMinor: number; month?: string; categoryId?: string; sourceCategoryId?: string; destinationCategoryId?: string; relatedEventId?: string };
type Receipt = { payloadDigest: string; result: unknown };
type StoredBudget = Budget & { events: FinancialEvent[]; receipts: Map<string, Receipt> };
type StoredSession = { userId: string; expiresAt: number; revoked: boolean };
export type SetupInput = { openingBalanceMinor?: number; accountName?: string; accountType?: string; categories?: string[] };
export type CommandOptions = { idempotencyKey?: string; expectedVersion?: number };
export type FinancialSummary = { month: string; accountBalanceMinor: number; rta: ReturnType<typeof calculateRta>; categories: (Category & ReturnType<typeof calculateCategory>)[]; version: number };

export class ApiError extends Error {
  readonly code: 'UNAUTHENTICATED' | 'NOT_FOUND' | 'CONFLICT' | 'VALIDATION_ERROR';
  readonly status: number;
  constructor(code: 'UNAUTHENTICATED' | 'NOT_FOUND' | 'CONFLICT' | 'VALIDATION_ERROR', message: string, status = code === 'NOT_FOUND' ? 404 : code === 'CONFLICT' ? 409 : code === 'VALIDATION_ERROR' ? 400 : 401) {
    super(message); this.code = code; this.status = status;
  }
}

const ok = <T>(data: T, requestId = randomUUID()): Envelope<T> => ({ data, requestId });
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const publicBudget = (b: StoredBudget): Budget => ({ id: b.id, setupStep: b.setupStep, timezone: b.timezone, version: b.version, account: b.account ? { ...b.account } : null, categories: b.categories.map(c => ({ ...c })) });
const amount = (value: unknown, name = 'amountMinor') => { if (!Number.isSafeInteger(value as number) || (value as number) <= 0) throw new ApiError('VALIDATION_ERROR', `${name} must be a positive integer minor-unit amount`); return value as number; };
const month = (value: unknown) => { if (typeof value !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) throw new ApiError('VALIDATION_ERROR', 'month must be YYYY-MM'); return value; };
const dateMonth = (value: unknown, timezone: string) => { try { return monthForDate(typeof value === 'string' ? value : new Date(), timezone); } catch { throw new ApiError('VALIDATION_ERROR', 'date is invalid'); } };

export class BudgetApp {
  private readonly users = new Map<string, StoredUser>();
  private readonly sessions = new Map<string, StoredSession>();
  private readonly budgets = new Map<string, StoredBudget>();
  private readonly now: Clock;
  constructor(now: Clock = Date.now) { this.now = now; }

  register(email: string, password: string, requestId?: string) {
    const normalized = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized) || password.length < 8) throw new ApiError('VALIDATION_ERROR', 'Email or password is invalid');
    if (this.users.has(normalized)) throw new ApiError('CONFLICT', 'Account already exists');
    const user: StoredUser = { id: randomUUID(), email: normalized, passwordHash: this.hash(password) }; this.users.set(normalized, user);
    return ok<User>({ id: user.id, email: user.email }, requestId);
  }
  signIn(email: string, password: string, requestId?: string) {
    const user = this.users.get(email.trim().toLowerCase());
    if (!user || !this.verify(password, user.passwordHash)) throw new ApiError('UNAUTHENTICATED', 'Invalid credentials');
    const token = randomBytes(32).toString('hex'); this.sessions.set(digest(token), { userId: user.id, expiresAt: this.now() + 8 * 60 * 60 * 1000, revoked: false });
    return ok({ user: { id: user.id, email: user.email }, sessionToken: token }, requestId);
  }
  signOut(token: string) { const session = this.sessions.get(digest(token)); if (session) session.revoked = true; }
  authenticate(token: string): User {
    const session = this.sessions.get(digest(token));
    if (!session || session.revoked || session.expiresAt <= this.now()) throw new ApiError('UNAUTHENTICATED', 'Authentication required');
    const user = [...this.users.values()].find(candidate => candidate.id === session.userId); if (!user) throw new ApiError('UNAUTHENTICATED', 'Authentication required');
    return { id: user.id, email: user.email };
  }
  createBudget(token: string, requestId?: string) {
    const user = this.authenticate(token); const stored = [...this.users.values()].find(candidate => candidate.id === user.id)!;
    if (stored.budgetId) throw new ApiError('CONFLICT', 'A user can own only one budget');
    const budget: StoredBudget = { id: randomUUID(), setupStep: 'ACCOUNT', timezone: 'UTC', version: 0, account: null, categories: [], events: [], receipts: new Map() };
    this.budgets.set(budget.id, budget); stored.budgetId = budget.id; return ok(publicBudget(budget), requestId);
  }
  getBudget(token: string, budgetId: string, requestId?: string) { return ok(publicBudget(this.requireBudget(token, budgetId)), requestId); }
  resumeBudget(token: string, requestId?: string) {
    const user = this.authenticate(token); const owner = [...this.users.values()].find(candidate => candidate.id === user.id);
    if (!owner?.budgetId) throw new ApiError('NOT_FOUND', 'Resource not found'); return ok(publicBudget(this.budgets.get(owner.budgetId)!), requestId);
  }
  saveSetup(token: string, budgetId: string, input: SetupInput, requestId?: string) {
    const budget = this.requireBudget(token, budgetId);
    if (input.accountType && !['cash', 'checking'].includes(input.accountType)) throw new ApiError('VALIDATION_ERROR', 'Only cash or checking accounts are supported');
    if (input.openingBalanceMinor !== undefined && (!Number.isInteger(input.openingBalanceMinor) || !Number.isSafeInteger(input.openingBalanceMinor))) throw new ApiError('VALIDATION_ERROR', 'Opening balance must be integer minor units');
    if (input.categories) { const names = [...new Set(input.categories.map(name => name.trim()).filter(Boolean))]; budget.categories = names.map(name => budget.categories.find(category => category.name === name) ?? { id: randomUUID(), name, archived: false }); }
    if (input.openingBalanceMinor !== undefined) budget.account = { id: budget.account?.id ?? randomUUID(), name: input.accountName?.trim() || budget.account?.name || 'Cash', openingBalanceMinor: input.openingBalanceMinor };
    budget.setupStep = budget.account ? (budget.categories.some(category => !category.archived) ? 'COMPLETE' : 'CATEGORIES') : 'ACCOUNT'; return ok(publicBudget(budget), requestId);
  }
  createCategory(token: string, budgetId: string, name: string, requestId?: string) {
    const budget = this.requireBudget(token, budgetId); const trimmed = name.trim();
    if (!trimmed) throw new ApiError('VALIDATION_ERROR', 'Category name is required');
    if (budget.categories.some(c => !c.archived && c.name.toLowerCase() === trimmed.toLowerCase())) throw new ApiError('CONFLICT', 'Category already exists');
    budget.categories.push({ id: randomUUID(), name: trimmed, archived: false }); return ok(publicBudget(budget), requestId);
  }
  renameCategory(token: string, budgetId: string, categoryId: string, name: string, requestId?: string) {
    const budget = this.requireBudget(token, budgetId); const category = budget.categories.find(c => c.id === categoryId); if (!category) throw new ApiError('NOT_FOUND', 'Resource not found');
    if (!name.trim()) throw new ApiError('VALIDATION_ERROR', 'Category name is required'); category.name = name.trim(); return ok(publicBudget(budget), requestId);
  }
  archiveCategory(token: string, budgetId: string, categoryId: string, requestId?: string) {
    const budget = this.requireBudget(token, budgetId); const category = budget.categories.find(c => c.id === categoryId); if (!category) throw new ApiError('NOT_FOUND', 'Resource not found');
    category.archived = true; budget.setupStep = budget.account && budget.categories.some(c => !c.archived) ? 'COMPLETE' : 'CATEGORIES'; return ok(publicBudget(budget), requestId);
  }

  recordIncome(token: string, budgetId: string, input: { amountMinor: unknown; date?: unknown }, requestId?: string, options: CommandOptions = {}) {
    return this.financial(token, budgetId, 'income', input, requestId, options, (budget, events, version) => {
      this.ready(budget); const value = amount(input.amountMinor); const id = randomUUID(); events.push({ id, kind: 'INCOME', amountMinor: value, month: dateMonth(input.date, budget.timezone) });
      return { id, amountMinor: value, released: false, accountBalanceMinor: this.balance(budget, events), version };
    });
  }
  releaseIncome(token: string, budgetId: string, incomeId: string, requestId?: string, options: CommandOptions = {}) {
    return this.financial(token, budgetId, 'release', { incomeId }, requestId, options, (budget, events, version) => {
      this.ready(budget); const income = events.find(e => e.id === incomeId && e.kind === 'INCOME'); if (!income) throw new ApiError('NOT_FOUND', 'Resource not found');
      const released = events.filter(e => e.kind === 'INCOME_RELEASE' && e.relatedEventId === incomeId).reduce((sum, e) => sum + e.amountMinor, 0);
      const releasedNow = releaseIncome({ realizedMinor: income.amountMinor, releasedMinor: released }).releasedNowMinor;
      if (releasedNow) events.push({ id: randomUUID(), kind: 'INCOME_RELEASE', amountMinor: releasedNow, month: income.month, relatedEventId: incomeId });
      return { incomeId, releasedNowMinor: releasedNow, released: true, version };
    });
  }
  recordSpending(token: string, budgetId: string, input: { amountMinor: unknown; categoryId: string; date?: unknown }, requestId?: string, options: CommandOptions = {}) {
    return this.financial(token, budgetId, 'spending', input, requestId, options, (budget, events, version) => {
      this.ready(budget); this.activeCategory(budget, input.categoryId); const value = amount(input.amountMinor); const monthValue = dateMonth(input.date, budget.timezone); const id = randomUUID();
      events.push({ id, kind: 'SPENDING', amountMinor: value, categoryId: input.categoryId, month: monthValue }); return { id, amountMinor: value, categoryId: input.categoryId, month: monthValue, accountBalanceMinor: this.balance(budget, events), version };
    });
  }
  assign(token: string, budgetId: string, input: { categoryId: string; amountMinor: unknown; month: string }, requestId?: string, options: CommandOptions = {}) {
    return this.financial(token, budgetId, 'assignment', input, requestId, options, (budget, events, version) => {
      this.ready(budget); this.activeCategory(budget, input.categoryId); const value = amount(input.amountMinor); const monthValue = month(input.month); const state = this.summary(budget, monthValue, events); const id = randomUUID();
      events.push({ id, kind: 'ASSIGNMENT', amountMinor: value, categoryId: input.categoryId, month: monthValue }); const next = this.summary(budget, monthValue, events); return { id, categoryId: input.categoryId, amountMinor: value, rtaMinor: next.rta.amountMinor, assignedMinor: next.categories.find(c => c.id === input.categoryId)!.assignedMinor, previousRtaMinor: state.rta.amountMinor, version };
    });
  }
  unassign(token: string, budgetId: string, input: { categoryId: string; amountMinor: unknown; month: string }, requestId?: string, options: CommandOptions = {}) {
    return this.financial(token, budgetId, 'unassignment', input, requestId, options, (budget, events, version) => {
      this.ready(budget); this.activeCategory(budget, input.categoryId); const value = amount(input.amountMinor); const monthValue = month(input.month); const state = this.summary(budget, monthValue, events); const category = state.categories.find(c => c.id === input.categoryId)!;
      if (value > category.assignedMinor) throw new ApiError('CONFLICT', 'Cannot unassign more than assigned'); const id = randomUUID(); events.push({ id, kind: 'UNASSIGNMENT', amountMinor: value, categoryId: input.categoryId, month: monthValue }); const next = this.summary(budget, monthValue, events); return { id, categoryId: input.categoryId, amountMinor: value, rtaMinor: next.rta.amountMinor, assignedMinor: next.categories.find(c => c.id === input.categoryId)!.assignedMinor, version };
    });
  }
  move(token: string, budgetId: string, input: { sourceCategoryId: string; destinationCategoryId: string; amountMinor: unknown; month: string }, requestId?: string, options: CommandOptions = {}) {
    return this.financial(token, budgetId, 'move', input, requestId, options, (budget, events, version) => {
      this.ready(budget); if (input.sourceCategoryId === input.destinationCategoryId) throw new ApiError('VALIDATION_ERROR', 'Move categories must differ'); this.activeCategory(budget, input.sourceCategoryId); this.activeCategory(budget, input.destinationCategoryId);
      const value = amount(input.amountMinor); const monthValue = month(input.month); const state = this.summary(budget, monthValue, events); const source = state.categories.find(c => c.id === input.sourceCategoryId)!; if (value > source.assignedMinor) throw new ApiError('CONFLICT', 'Cannot move more than assigned');
      const id = randomUUID(); events.push({ id, kind: 'MOVE', amountMinor: value, sourceCategoryId: input.sourceCategoryId, destinationCategoryId: input.destinationCategoryId, month: monthValue }); return { id, ...moveAssignment({ assignedMinor: source.assignedMinor }, { assignedMinor: state.categories.find(c => c.id === input.destinationCategoryId)!.assignedMinor }, value), version };
    });
  }
  getFinancialSummary(token: string, budgetId: string, requestedMonth: string, requestId?: string) { const budget = this.requireBudget(token, budgetId); return ok(this.summary(budget, month(requestedMonth), budget.events), requestId); }
  getDashboard(token: string, budgetId: string, requestedMonth: string, requestId?: string) { const budget = this.requireBudget(token, budgetId); return ok(this.summary(budget, month(requestedMonth), budget.events), requestId); }

  private financial<T>(token: string, budgetId: string, command: string, input: unknown, requestId: string | undefined, options: CommandOptions, work: (budget: StoredBudget, events: FinancialEvent[], version: number) => T) {
    const budget = this.requireBudget(token, budgetId); const key = options.idempotencyKey?.trim(); if (!key) throw new ApiError('VALIDATION_ERROR', 'Idempotency-Key is required');
    const payloadDigest = digest({ command, input }); const old = budget.receipts.get(key);
    if (old) { if (old.payloadDigest !== payloadDigest) throw new ApiError('CONFLICT', 'Idempotency key was reused with a different payload'); return ok(old.result as T, requestId); }
    if (options.expectedVersion !== undefined && options.expectedVersion !== budget.version) throw new ApiError('CONFLICT', 'Budget version is stale');
    const events = budget.events.map(event => ({ ...event })); const result = work(budget, events, budget.version + 1);
    budget.events = events; budget.version += 1; budget.receipts.set(key, { payloadDigest, result }); return ok(result, requestId);
  }
  private summary(budget: StoredBudget, requestedMonth: string, events: FinancialEvent[]): FinancialSummary {
    const income = events.filter(e => e.kind === 'INCOME' && e.month === requestedMonth).reduce((sum, e) => sum + e.amountMinor, 0); const released = events.filter(e => e.kind === 'INCOME_RELEASE' && e.month === requestedMonth).reduce((sum, e) => sum + e.amountMinor, 0);
    const accountIncome = events.filter(e => e.kind === 'INCOME').reduce((sum, e) => sum + e.amountMinor, 0); const spending = events.filter(e => e.kind === 'SPENDING').reduce((sum, e) => sum + e.amountMinor, 0);
    const prior = this.categoryCarry(budget, requestedMonth, events); const assigned = events.filter(e => e.month === requestedMonth && (e.kind === 'ASSIGNMENT' || e.kind === 'UNASSIGNMENT')).reduce((sum, e) => sum + (e.kind === 'ASSIGNMENT' ? e.amountMinor : -e.amountMinor), 0);
    const categories = budget.categories.map(category => ({ ...category, ...this.categoryValues(budget, category.id, requestedMonth, events) }));
    return { month: requestedMonth, accountBalanceMinor: calculateAccountBalance({ openingBalanceMinor: budget.account?.openingBalanceMinor ?? 0, incomeMinor: accountIncome, spendingMinor: spending }), rta: calculateRta({ openingBalanceMinor: budget.account?.openingBalanceMinor ?? 0, releasedIncomeMinor: released, unreleasedIncomeMinor: income - released, priorCarryMinor: prior, assignedMinor: assigned }), categories, version: budget.version };
  }
  private categoryCarry(budget: StoredBudget, requestedMonth: string, events: FinancialEvent[]) { const previous = previousMonth(requestedMonth); return budget.categories.reduce((sum, c) => sum + positiveRollover(this.categoryValues(budget, c.id, previous, events).availableMinor), 0); }
  private categoryValues(budget: StoredBudget, categoryId: string, requestedMonth: string, events: FinancialEvent[]) {
    const carry = this.categoryCarryFor(budget, categoryId, requestedMonth, events); const assigned = events.filter(e => e.month === requestedMonth).reduce((sum, e) => sum + (e.kind === 'ASSIGNMENT' && e.categoryId === categoryId ? e.amountMinor : e.kind === 'UNASSIGNMENT' && e.categoryId === categoryId ? -e.amountMinor : e.kind === 'MOVE' && e.destinationCategoryId === categoryId ? e.amountMinor : e.kind === 'MOVE' && e.sourceCategoryId === categoryId ? -e.amountMinor : 0), 0);
    const activity = -events.filter(e => e.kind === 'SPENDING' && e.month === requestedMonth && e.categoryId === categoryId).reduce((sum, e) => sum + e.amountMinor, 0); return calculateCategory({ carryoverMinor: carry, assignedMinor: Math.max(0, assigned), activityMinor: activity });
  }
  private categoryCarryFor(budget: StoredBudget, categoryId: string, requestedMonth: string, events: FinancialEvent[]) { const previous = previousMonth(requestedMonth); if (!events.some(e => e.month && e.month <= previous && (e.categoryId === categoryId || e.sourceCategoryId === categoryId || e.destinationCategoryId === categoryId))) return 0; return positiveRollover(this.categoryValues(budget, categoryId, previous, events).availableMinor); }
  private balance(budget: StoredBudget, events: FinancialEvent[]) { return calculateAccountBalance({ openingBalanceMinor: budget.account?.openingBalanceMinor ?? 0, incomeMinor: events.filter(e => e.kind === 'INCOME').reduce((s, e) => s + e.amountMinor, 0), spendingMinor: events.filter(e => e.kind === 'SPENDING').reduce((s, e) => s + e.amountMinor, 0) }); }
  private ready(budget: StoredBudget) { if (budget.setupStep !== 'COMPLETE' || !budget.account || budget.account.archived) throw new ApiError('CONFLICT', 'Budget setup is incomplete'); }
  private activeCategory(budget: StoredBudget, id: string) { const category = budget.categories.find(c => c.id === id); if (!category) throw new ApiError('NOT_FOUND', 'Resource not found'); if (category.archived) throw new ApiError('CONFLICT', 'Archived categories cannot receive new activity'); return category; }
  private requireBudget(token: string, budgetId: string) { const user = this.authenticate(token); const budget = this.budgets.get(budgetId); const owner = [...this.users.values()].find(candidate => candidate.id === user.id); if (!budget || !owner || owner.budgetId !== budget.id) throw new ApiError('NOT_FOUND', 'Resource not found'); return budget; }
  private hash(password: string) { const salt = randomBytes(16); return `${salt.toString('hex')}:${scryptSync(password, salt, 32).toString('hex')}`; }
  private verify(password: string, encoded: string) { const [salt, expected] = encoded.split(':'); const actual = scryptSync(password, Buffer.from(salt, 'hex'), 32); return timingSafeEqual(actual, Buffer.from(expected, 'hex')); }
}

const previousMonth = (value: string) => { const date = new Date(`${value}-01T00:00:00Z`); date.setUTCMonth(date.getUTCMonth() - 1); return date.toISOString().slice(0, 7); };
export const errorEnvelope = (error: unknown, requestId = randomUUID()) => { const e = error instanceof ApiError ? error : new ApiError('VALIDATION_ERROR', 'Request failed', 400); return { status: e.status, body: { error: { code: e.code, message: e.message, requestId } } }; };
