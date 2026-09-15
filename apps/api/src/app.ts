import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { applyAssignment, calculateAccountBalances, moveAssignment, monthForDate, oldestAccount, releaseIncome, unassign, type AccountState } from './planning/engine.ts';
import { assertEligibleTransaction, buildDeleteTombstone, buildReplacement, filterHistoryItems, normalizeMetadata, normalizeMetadataPatch, parseTransactionDate, type HistoryFilter } from './planning/transaction-history.ts';
import { ReportService, type FinancialSummary } from './reports/report-service.ts';
import { canonicalImportDigest, parseTransactionCsv, projectEffectiveCsvRows, serializeTransactionCsv, type CsvDiagnostic } from './planning/csv.ts';
import { FinancialStore, PersistenceError, type FinancialEvent, type FinancialState, type TransferState } from './persistence/financial-store.ts';
import { BudgetStoreError, type BudgetStore, type BudgetState, type StoredUser } from './persistence/budget-store.ts';
import { InMemoryBudgetStore, InMemoryFinancialStore } from './persistence/in-memory-budget-store.ts';

type Clock = () => number;
export type Envelope<T> = { data: T; requestId: string };
export type User = { id: string; email: string };
export type Category = { id: string; name: string; archived: boolean };
export type PublicAccount = { id: string; name: string; kind: 'CASH' | 'CHECKING'; archived: boolean; openingBalanceMinor: number; balanceMinor: number };
    export type Budget = { id: string; setupStep: 'ACCOUNT' | 'CATEGORIES' | 'COMPLETE'; timezone: 'UTC'; version: number; accounts: PublicAccount[]; accountBalanceMinor: number; account: PublicAccount | null; categories: Category[] };
    export type AccountInput = { name?: unknown; kind?: unknown; openingBalanceMinor?: unknown };
    export type AccountPatch = { name?: unknown };
export type SetupInput = { openingBalanceMinor?: number; accountName?: string; accountType?: string; categories?: string[] };
export type CommandOptions = { idempotencyKey?: string; expectedVersion?: number };
export type CsvImportResult = { rows: number; accepted: number; rejected: number; diagnostics: CsvDiagnostic[]; diagnosticsTruncated: boolean; version: number };
export type TransactionEditInput = { amountMinor?: unknown; date?: unknown; categoryId?: unknown; payee?: unknown; memo?: unknown };
export type TransactionDeleteInput = { confirmed?: unknown; reason?: unknown };
export type AccountReference = Pick<PublicAccount, 'id' | 'name' | 'kind' | 'archived'>;
export type TransferHistoryItem = { transactionId: string; kind: 'TRANSFER'; date: string; amountMinor: number; sourceAccount: AccountReference; destinationAccount: AccountReference; payee: string | null; memo: string | null; createdAt: string };
export type TransactionHistoryItem = { transactionId: string; kind: 'INCOME' | 'SPENDING'; date: string; amountMinor: number; accountId?: string; category?: Category | null; payee: string | null; memo: string | null; createdAt?: string; state: 'ELIGIBLE' | 'PROTECTED' } | TransferHistoryItem;
export type { FinancialSummary };

export class ApiError extends Error {
  readonly code: 'UNAUTHENTICATED' | 'NOT_FOUND' | 'CONFLICT' | 'VALIDATION_ERROR' | 'UNSUPPORTED_MEDIA_TYPE' | 'INTERNAL_ERROR';
  readonly status: number;
  readonly details?: unknown;
  constructor(code: 'UNAUTHENTICATED' | 'NOT_FOUND' | 'CONFLICT' | 'VALIDATION_ERROR' | 'UNSUPPORTED_MEDIA_TYPE' | 'INTERNAL_ERROR', message: string, status = code === 'NOT_FOUND' ? 404 : code === 'CONFLICT' ? 409 : code === 'VALIDATION_ERROR' ? 400 : code === 'UNSUPPORTED_MEDIA_TYPE' ? 415 : code === 'INTERNAL_ERROR' ? 500 : 401, details?: unknown) {
    super(message); this.code = code; this.status = status; this.details = details;
  }
}

const ok = <T>(data: T, requestId = randomUUID()): Envelope<T> => ({ data, requestId });
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const publicAccount = (account: AccountState): PublicAccount => ({ id: account.id, name: account.name, kind: account.kind, archived: account.archived, openingBalanceMinor: account.openingBalanceMinor, balanceMinor: account.balanceMinor ?? account.openingBalanceMinor });
    const publicBudget = (b: BudgetState): Budget => { const accounts = b.accounts?.length ? b.accounts : b.account ? [{ ...b.account, kind: b.account.kind ?? 'CASH', archived: b.account.archived ?? false }] : []; const projected = accounts.map(publicAccount); const alias = projected.find(account => account.id === b.account?.id) ?? oldestAccount(projected) ?? null; return { id: b.id, setupStep: b.setupStep, timezone: b.timezone, version: b.version, accounts: projected, accountBalanceMinor: projected.reduce((sum, account) => sum + account.balanceMinor, 0), account: alias, categories: b.categories.map(c => ({ id: c.id, name: c.name, archived: c.archived })) }; };
const amount = (value: unknown, name = 'amountMinor') => { if (!Number.isSafeInteger(value as number) || (value as number) <= 0) throw new ApiError('VALIDATION_ERROR', `${name} must be a positive integer minor-unit amount`); return value as number; };
const month = (value: unknown) => { if (typeof value !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) throw new ApiError('VALIDATION_ERROR', 'month must be YYYY-MM'); return value; };
const dateMonth = (value: unknown, timezone: string) => { try { return monthForDate(typeof value === 'string' ? value : new Date(), timezone); } catch { throw new ApiError('VALIDATION_ERROR', 'date is invalid'); } };
const metadata = (input: unknown) => { try { return normalizeMetadata(input as { payee?: unknown; memo?: unknown }); } catch (error) { throw new ApiError('VALIDATION_ERROR', error instanceof Error ? error.message : 'metadata is invalid'); } };
const metadataPatch = (input: unknown) => { try { return normalizeMetadataPatch(input); } catch (error) { throw new ApiError('VALIDATION_ERROR', error instanceof Error ? error.message : 'metadata is invalid'); } };

export class BudgetApp {
  private readonly now: Clock;
  private readonly budgetStore: BudgetStore;
  private readonly financialStore: Pick<FinancialStore, 'execute' | 'load'> | InMemoryFinancialStore;
  private readonly reports = new ReportService();
  constructor(now: Clock = Date.now, store?: BudgetStore | FinancialStore, financialStore?: FinancialStore) {
    this.now = now;
    if (store instanceof FinancialStore) { this.budgetStore = new InMemoryBudgetStore(); this.financialStore = store; }
    else { this.budgetStore = store ?? new InMemoryBudgetStore(); this.financialStore = financialStore ?? (this.budgetStore instanceof InMemoryBudgetStore ? new InMemoryFinancialStore(this.budgetStore) : new FinancialStore()); }
  }
  private storeError(error: unknown): never { if (error instanceof BudgetStoreError) throw new ApiError(error.code, error.message); throw error; }
  private result<T>(value: T | Promise<T>, requestId: string | undefined, map: (value: T) => unknown) { return value instanceof Promise ? value.then(item => map(item)).catch(error => this.storeError(error)) : map(value); }

  register(email: string, password: string, requestId?: string) {
    const normalized = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized) || password.length < 8) throw new ApiError('VALIDATION_ERROR', 'Email or password is invalid');
    const user = { id: randomUUID(), email: normalized, passwordHash: this.hash(password) };
    try { return this.result(this.budgetStore.createUser(user), requestId, () => ok<User>({ id: user.id, email: user.email }, requestId)); } catch (error) { return this.storeError(error); }
  }
  signIn(email: string, password: string, requestId?: string) {
    const found = this.budgetStore.findUser(email.trim().toLowerCase());
    const sign = (user: StoredUser | null) => {
      if (!user || !this.verify(password, user.passwordHash)) throw new ApiError('UNAUTHENTICATED', 'Invalid credentials');
      const token = randomBytes(32).toString('hex');
      try { return this.result(this.budgetStore.createSession({ tokenHash: digest(token), userId: user.id, expiresAt: this.now() + 8 * 60 * 60 * 1000 }), requestId, () => ok({ user: { id: user.id, email: user.email }, sessionToken: token }, requestId)); } catch (error) { return this.storeError(error); }
    };
    return found instanceof Promise ? found.then(sign) : sign(found);
  }
  signOut(token: string) { try { return this.budgetStore.revokeSession(digest(token)); } catch (error) { return this.storeError(error); } }
  authenticate(token: string): User | Promise<User> {
    const found = this.budgetStore.findSession(digest(token));
    const resolve = (session: { userId: string; expiresAt: number; revoked: boolean } | null) => {
      if (!session || session.revoked || session.expiresAt <= this.now()) throw new ApiError('UNAUTHENTICATED', 'Authentication required');
      const foundUser = this.budgetStore.findUserById(session.userId);
      const user = (candidate: StoredUser | null) => { if (!candidate) throw new ApiError('UNAUTHENTICATED', 'Authentication required'); return { id: candidate.id, email: candidate.email }; };
      return foundUser instanceof Promise ? foundUser.then(user) : user(foundUser);
    };
    return found instanceof Promise ? found.then(resolve) : resolve(found);
  }
  createBudget(token: string, requestId?: string) {
    const auth = this.authenticate(token);
    const create = (user: User) => {
      const found = this.budgetStore.findUserById(user.id);
      const persist = (owner: StoredUser | null) => {
        if (!owner) throw new ApiError('UNAUTHENTICATED', 'Authentication required');
        const state: BudgetState = { id: randomUUID(), setupStep: 'ACCOUNT', timezone: 'UTC', version: 0, account: null, categories: [], events: [] };
        try { return this.result(this.budgetStore.createBudget(owner.id, state), requestId, saved => ok(publicBudget(saved), requestId)); } catch (error) { return this.storeError(error); }
      };
      return found instanceof Promise ? found.then(persist) : persist(found);
    };
    return auth instanceof Promise ? auth.then(create) : create(auth);
  }
  getBudget(token: string, budgetId: string, requestId?: string) { return this.result(this.requireBudget(token, budgetId), requestId, budget => ok(publicBudget(budget), requestId)); }
  resumeBudget(token: string, requestId?: string) {
    const auth = this.authenticate(token);
    const resume = (user: User) => {
      const owner = this.budgetStore.findUserById(user.id);
      const load = (stored: StoredUser | null) => { if (!stored?.budgetId) throw new ApiError('NOT_FOUND', 'Resource not found'); return this.result(this.budgetStore.loadBudget(user.id, stored.budgetId), requestId, budget => budget ? ok(publicBudget(budget), requestId) : (() => { throw new ApiError('NOT_FOUND', 'Resource not found'); })()); };
      return owner instanceof Promise ? owner.then(load) : load(owner);
    };
    return auth instanceof Promise ? auth.then(resume) : resume(auth);
  }
  async createAccount(token: string, budgetId: string, input: AccountInput, requestId?: string, options: CommandOptions = {}) {
    const normalized = this.normalizeAccount(input);
    return this.financial(token, budgetId, 'account-create', normalized, requestId, options, (budget, _events, version) => {
      this.ready(budget);
      const account: AccountState = { id: randomUUID(), name: normalized.name, kind: normalized.kind, archived: false, createdAt: new Date(this.now()).toISOString(), openingBalanceMinor: normalized.openingBalanceMinor, balanceMinor: normalized.openingBalanceMinor };
      budget.accounts = [...(budget.accounts ?? (budget.account ? [{ ...budget.account, kind: budget.account.kind ?? 'CASH', archived: budget.account.archived ?? false }] : [])), account];
      return { account: publicAccount(account), version };
    }, undefined, true, true);
  }
  async renameAccount(token: string, budgetId: string, accountId: string, input: AccountPatch, requestId?: string, options: CommandOptions = {}) {
    if (!input || typeof input.name !== 'string' || !input.name.trim()) throw new ApiError('VALIDATION_ERROR', 'Account name is required');
    const normalized = { name: input.name.trim() };
    return this.financial(token, budgetId, 'account-rename', { accountId, ...normalized }, requestId, options, (budget, _events, version) => {
      const account = this.accountById(budget, accountId); account.name = normalized.name;
      return { account: publicAccount(account), version };
    }, undefined, true, true);
  }
  async archiveAccount(token: string, budgetId: string, accountId: string, requestId?: string, options: CommandOptions = {}) {
    return this.financial(token, budgetId, 'account-archive', { accountId }, requestId, options, (budget, _events, version) => {
      const account = this.accountById(budget, accountId); account.archived = true;
      return { account: publicAccount(account), version };
    }, undefined, true, true);
  }
  async recordTransfer(token: string, budgetId: string, input: { sourceAccountId?: unknown; destinationAccountId?: unknown; amountMinor?: unknown; date?: unknown; payee?: unknown; memo?: unknown }, requestId?: string, options: CommandOptions = {}) {
    const userInput = this.normalizeTransfer(input);
    return this.financial(token, budgetId, 'transfer', userInput, requestId, options, (budget, events, version) => {
      this.ready(budget);
      const source = this.activeAccount(budget, userInput.sourceAccountId); const destination = this.activeAccount(budget, userInput.destinationAccountId);
      if (source.id === destination.id) throw new ApiError('CONFLICT', 'Transfer accounts must differ');
      const transferId = randomUUID(); const createdAt = new Date(this.now()).toISOString();
      const transfer: TransferState = { id: transferId, sourceAccountId: source.id, destinationAccountId: destination.id, amountMinor: userInput.amountMinor, businessDate: userInput.date, month: userInput.month, createdAt, payee: userInput.payee, memo: userInput.memo };
      budget.transfers = [...(budget.transfers ?? []), transfer];
      events.push({ id: randomUUID(), kind: 'TRANSFER_OUT', amountMinor: userInput.amountMinor, accountId: source.id, transferId, businessDate: userInput.date, month: userInput.month, createdAt }, { id: randomUUID(), kind: 'TRANSFER_IN', amountMinor: userInput.amountMinor, accountId: destination.id, transferId, businessDate: userInput.date, month: userInput.month, createdAt });
      const accounts = this.projectAccounts(budget, events); const sourceAfter = accounts.find(account => account.id === source.id)!; const destinationAfter = accounts.find(account => account.id === destination.id)!;
      return { transferId, sourceAccountId: source.id, destinationAccountId: destination.id, amountMinor: userInput.amountMinor, date: userInput.date, payee: userInput.payee, memo: userInput.memo, sourceAccount: publicAccount(sourceAfter), destinationAccount: publicAccount(destinationAfter), accountBalanceMinor: accounts.reduce((sum, account) => sum + (account.balanceMinor ?? 0), 0), version };
    });
  }
  private normalizeTransfer(input: { sourceAccountId?: unknown; destinationAccountId?: unknown; amountMinor?: unknown; date?: unknown; payee?: unknown; memo?: unknown }) {
    if (!input || typeof input.sourceAccountId !== 'string' || typeof input.destinationAccountId !== 'string' || typeof input.date !== 'string') throw new ApiError('VALIDATION_ERROR', 'Transfer accounts and date are required');
    const value = amount(input.amountMinor); let parsed: { date: string; month: string };
    try { parsed = parseTransactionDate(input.date, 'UTC'); } catch { throw new ApiError('VALIDATION_ERROR', 'date must be YYYY-MM-DD'); }
    return { sourceAccountId: input.sourceAccountId, destinationAccountId: input.destinationAccountId, amountMinor: value, date: parsed.date, month: parsed.month, ...metadata(input) };
  }
  private normalizeAccount(input: AccountInput) {
    if (!input || typeof input.name !== 'string' || !input.name.trim()) throw new ApiError('VALIDATION_ERROR', 'Account name is required');
    if (typeof input.kind !== 'string' || !['cash', 'checking'].includes(input.kind.trim().toLowerCase())) throw new ApiError('VALIDATION_ERROR', 'Only cash or checking accounts are supported');
    const openingBalanceMinor = input.openingBalanceMinor === undefined ? 0 : input.openingBalanceMinor;
    if (!Number.isSafeInteger(openingBalanceMinor as number)) throw new ApiError('VALIDATION_ERROR', 'Opening balance must be an integer minor-unit amount');
    return { name: input.name.trim(), kind: input.kind.trim().toUpperCase() as 'CASH' | 'CHECKING', openingBalanceMinor: openingBalanceMinor as number };
  }
  private accountById(budget: FinancialState, accountId: string) {
    const accounts = budget.accounts ?? (budget.account ? [{ ...budget.account, kind: budget.account.kind ?? 'CASH', archived: budget.account.archived ?? false }] : []);
    const account = accounts.find(candidate => candidate.id === accountId);
    if (!account) throw new ApiError('NOT_FOUND', 'Resource not found');
    budget.accounts = accounts;
    return account;
  }

  saveSetup(token: string, budgetId: string, input: SetupInput, requestId?: string) {
    const current = this.requireBudget(token, budgetId);
    const save = (budget: BudgetState) => {
      if (input.accountType && !['cash', 'checking'].includes(input.accountType)) throw new ApiError('VALIDATION_ERROR', 'Only cash or checking accounts are supported');
      if (input.openingBalanceMinor !== undefined && (!Number.isInteger(input.openingBalanceMinor) || !Number.isSafeInteger(input.openingBalanceMinor))) throw new ApiError('VALIDATION_ERROR', 'Opening balance must be integer minor units');
      if (input.categories) { const names = [...new Set(input.categories.map(name => name.trim()).filter(Boolean))]; budget.categories = names.map(name => budget.categories.find(category => category.name === name) ?? { id: randomUUID(), name, archived: false }); }
      if (input.openingBalanceMinor !== undefined) budget.account = { id: budget.account?.id ?? randomUUID(), name: input.accountName?.trim() || budget.account?.name || 'Cash', openingBalanceMinor: input.openingBalanceMinor };
      budget.setupStep = budget.account ? (budget.categories.some(category => !category.archived) ? 'COMPLETE' : 'CATEGORIES') : 'ACCOUNT';
      try { return this.result(this.budgetStore.saveBudget((budget as any).ownerId, budget), requestId, saved => ok(publicBudget(saved), requestId)); } catch (error) { return this.storeError(error); }
    };
    return current instanceof Promise ? current.then(save) : save(current);
  }
  createCategory(token: string, budgetId: string, name: string, requestId?: string) { return this.changeCategory(token, budgetId, requestId, budget => { const trimmed = name.trim(); if (!trimmed) throw new ApiError('VALIDATION_ERROR', 'Category name is required'); if (budget.categories.some(c => !c.archived && c.name.toLowerCase() === trimmed.toLowerCase())) throw new ApiError('CONFLICT', 'Category already exists'); budget.categories.push({ id: randomUUID(), name: trimmed, archived: false }); }); }
  renameCategory(token: string, budgetId: string, categoryId: string, name: string, requestId?: string) { return this.changeCategory(token, budgetId, requestId, budget => { const category = budget.categories.find(c => c.id === categoryId); if (!category) throw new ApiError('NOT_FOUND', 'Resource not found'); if (!name.trim()) throw new ApiError('VALIDATION_ERROR', 'Category name is required'); category.name = name.trim(); }); }
  archiveCategory(token: string, budgetId: string, categoryId: string, requestId?: string) { return this.changeCategory(token, budgetId, requestId, budget => { const category = budget.categories.find(c => c.id === categoryId); if (!category) throw new ApiError('NOT_FOUND', 'Resource not found'); category.archived = true; budget.setupStep = budget.account && budget.categories.some(c => !c.archived) ? 'COMPLETE' : 'CATEGORIES'; }); }
  private changeCategory(token: string, budgetId: string, requestId: string | undefined, change: (budget: BudgetState) => void) {
    const current = this.requireBudget(token, budgetId); const save = (budget: BudgetState) => { change(budget); try { return this.result(this.budgetStore.saveBudget((budget as any).ownerId, budget), requestId, saved => ok(publicBudget(saved), requestId)); } catch (error) { return this.storeError(error); } }; return current instanceof Promise ? current.then(save) : save(current);
  }

  async recordIncome(token: string, budgetId: string, input: { amountMinor: unknown; date?: unknown; accountId?: unknown; payee?: unknown; memo?: unknown }, requestId?: string, options: CommandOptions = {}) {
    const normalized = { ...input, ...metadata(input) };
        return this.financial(token, budgetId, 'income', normalized, requestId, options, (budget, events, version) => {
      this.ready(budget); const account = this.activeAccount(budget, normalized.accountId); const value = amount(normalized.amountMinor); const id = randomUUID(); const parsed = typeof normalized.date === 'string' ? parseTransactionDate(normalized.date, budget.timezone) : undefined; events.push({ id, transactionId: id, kind: 'INCOME', amountMinor: value, month: parsed?.month ?? dateMonth(normalized.date, budget.timezone), ...(parsed ? { businessDate: parsed.date } : {}), accountId: account.id, status: 'POSTED', reconciled: false, createdAt: new Date(this.now()).toISOString(), payee: normalized.payee, memo: normalized.memo });
      return { id, amountMinor: value, payee: normalized.payee, memo: normalized.memo, released: false, accountBalanceMinor: this.balance(budget, events), version };
    });
  }
  async releaseIncome(token: string, budgetId: string, incomeId: string, requestId?: string, options: CommandOptions = {}) {
    return this.financial(token, budgetId, 'release', { incomeId }, requestId, options, (budget, events, version) => {
      this.ready(budget); const income = events.find(e => e.id === incomeId && e.kind === 'INCOME'); if (!income) throw new ApiError('NOT_FOUND', 'Resource not found');
      const released = events.filter(e => e.kind === 'INCOME_RELEASE' && e.relatedEventId === incomeId).reduce((sum, e) => sum + e.amountMinor, 0);
      const releasedNow = releaseIncome({ realizedMinor: income.amountMinor, releasedMinor: released }).releasedNowMinor;
      if (releasedNow) events.push({ id: randomUUID(), kind: 'INCOME_RELEASE', amountMinor: releasedNow, month: income.month, relatedEventId: incomeId });
      return { incomeId, releasedNowMinor: releasedNow, released: true, version };
    });
  }
  async recordSpending(token: string, budgetId: string, input: { amountMinor: unknown; categoryId: string; date?: unknown; accountId?: unknown; payee?: unknown; memo?: unknown }, requestId?: string, options: CommandOptions = {}) {
    const normalized = { ...input, ...metadata(input) };
        return this.financial(token, budgetId, 'spending', normalized, requestId, options, (budget, events, version) => {
      this.ready(budget); const account = this.activeAccount(budget, normalized.accountId); this.activeCategory(budget, normalized.categoryId); const value = amount(normalized.amountMinor); const parsed = typeof normalized.date === 'string' ? parseTransactionDate(normalized.date, budget.timezone) : undefined; const monthValue = parsed?.month ?? dateMonth(normalized.date, budget.timezone); const id = randomUUID();
      events.push({ id, transactionId: id, kind: 'SPENDING', amountMinor: value, categoryId: normalized.categoryId, month: monthValue, ...(parsed ? { businessDate: parsed.date } : {}), accountId: account.id, status: 'POSTED', reconciled: false, createdAt: new Date(this.now()).toISOString(), payee: normalized.payee, memo: normalized.memo }); return { id, amountMinor: value, categoryId: normalized.categoryId, month: monthValue, payee: normalized.payee, memo: normalized.memo, accountBalanceMinor: this.balance(budget, events), version };
    });
  }
  async assign(token: string, budgetId: string, input: { categoryId: string; amountMinor: unknown; month: string }, requestId?: string, options: CommandOptions = {}) {
    return this.financial(token, budgetId, 'assignment', input, requestId, options, (budget, events, version) => {
      this.ready(budget); this.activeCategory(budget, input.categoryId); const value = amount(input.amountMinor); const monthValue = month(input.month); const state = this.reports.read(budget, monthValue, events); const id = randomUUID();
      events.push({ id, kind: 'ASSIGNMENT', amountMinor: value, categoryId: input.categoryId, month: monthValue }); const next = this.reports.read(budget, monthValue, events); return { id, categoryId: input.categoryId, amountMinor: value, rtaMinor: next.rta.amountMinor, assignedMinor: next.categories.find(c => c.id === input.categoryId)!.assignedMinor, previousRtaMinor: state.rta.amountMinor, version };
    });
  }
  async unassign(token: string, budgetId: string, input: { categoryId: string; amountMinor: unknown; month: string }, requestId?: string, options: CommandOptions = {}) {
    return this.financial(token, budgetId, 'unassignment', input, requestId, options, (budget, events, version) => {
      this.ready(budget); this.activeCategory(budget, input.categoryId); const value = amount(input.amountMinor); const monthValue = month(input.month); const state = this.reports.read(budget, monthValue, events); const category = state.categories.find(c => c.id === input.categoryId)!;
      if (value > category.assignedMinor) throw new ApiError('CONFLICT', 'Cannot unassign more than assigned'); const id = randomUUID(); events.push({ id, kind: 'UNASSIGNMENT', amountMinor: value, categoryId: input.categoryId, month: monthValue }); const next = this.reports.read(budget, monthValue, events); return { id, categoryId: input.categoryId, amountMinor: value, rtaMinor: next.rta.amountMinor, assignedMinor: next.categories.find(c => c.id === input.categoryId)!.assignedMinor, version };
    });
  }
  async move(token: string, budgetId: string, input: { sourceCategoryId: string; destinationCategoryId: string; amountMinor: unknown; month: string }, requestId?: string, options: CommandOptions = {}) {
    return this.financial(token, budgetId, 'move', input, requestId, options, (budget, events, version) => {
      this.ready(budget); if (input.sourceCategoryId === input.destinationCategoryId) throw new ApiError('VALIDATION_ERROR', 'Move categories must differ'); this.activeCategory(budget, input.sourceCategoryId); this.activeCategory(budget, input.destinationCategoryId);
      const value = amount(input.amountMinor); const monthValue = month(input.month); const state = this.reports.read(budget, monthValue, events); const source = state.categories.find(c => c.id === input.sourceCategoryId)!; if (value > source.assignedMinor) throw new ApiError('CONFLICT', 'Cannot move more than assigned');
      const id = randomUUID(); events.push({ id, kind: 'MOVE', amountMinor: value, sourceCategoryId: input.sourceCategoryId, destinationCategoryId: input.destinationCategoryId, month: monthValue }); return { id, ...moveAssignment({ assignedMinor: source.assignedMinor }, { assignedMinor: state.categories.find(c => c.id === input.destinationCategoryId)!.assignedMinor }, value), version };
    });
  }
  async exportTransactionsCsv(token: string, budgetId: string) {
    const user = await this.authenticate(token);
    await this.requireBudget(token, budgetId);
    try {
      const state = await this.financialStore.load(user.id, budgetId);
      return serializeTransactionCsv(projectEffectiveCsvRows(state.rawEvents ?? state.events, state.transfers ?? []));
    } catch (error) {
      if (error instanceof PersistenceError) throw new ApiError(error.code, error.message);
      throw error;
    }
  }

  async importTransactionsCsv(token: string, budgetId: string, bytes: Uint8Array, requestId?: string, options: CommandOptions = {}) {
    await this.authenticate(token);
    await this.requireBudget(token, budgetId);
    const parsed = parseTransactionCsv(bytes);
    if (parsed.diagnostics.length || parsed.rejected > 0 || parsed.rows === 0) {
      const details = { rows: parsed.rows, accepted: parsed.accepted, rejected: parsed.rejected, diagnostics: parsed.diagnostics, diagnosticsTruncated: parsed.diagnosticsTruncated };
      throw new ApiError('VALIDATION_ERROR', 'CSV validation failed', 400, details);
    }
    if (!Number.isSafeInteger(options.expectedVersion)) throw new ApiError('VALIDATION_ERROR', 'If-Match is required');
    const payloadDigest = canonicalImportDigest(budgetId, options.expectedVersion!, parsed.values);
    return this.financial(token, budgetId, 'csv-import', { rows: parsed.values }, requestId, options, (budget, events, version, append = () => {}) => {
      this.ready(budget);
      const accounts = budget.accounts ?? (budget.account ? [{ ...budget.account, kind: budget.account.kind ?? 'CASH', archived: budget.account.archived ?? false }] : []);
      const categories = budget.categories;
      const resourceDiagnostics: CsvDiagnostic[] = [];
      let resourceRejected = 0;
      for (let index = 0; index < parsed.values.length; index += 1) {
        const row = parsed.values[index];
        const accountIds = row.type === 'TRANSFER' ? row.account.split('=>') : [row.account];
        const unavailableAccount = accountIds.some(id => !accounts.some(account => account.id.toLowerCase() === id && !account.archived));
        const unavailableCategory = row.type === 'SPENDING' && !categories.some(category => category.id.toLowerCase() === row.category && !category.archived);
        if (unavailableAccount || unavailableCategory) {
          resourceRejected += 1;
          if (resourceDiagnostics.length < 1_000) resourceDiagnostics.push({ row: index + 2, field: unavailableAccount ? 'account' : 'category', code: 'RESOURCE_UNAVAILABLE', message: 'Referenced resource is unavailable' });
        }
      }
      if (resourceRejected) {
        throw new ApiError('VALIDATION_ERROR', 'CSV validation failed', 400, { rows: parsed.rows, accepted: parsed.rows - resourceRejected, rejected: resourceRejected, diagnostics: resourceDiagnostics, diagnosticsTruncated: resourceRejected > resourceDiagnostics.length });
      }

      const createdAtBase = this.now();
      for (let index = 0; index < parsed.values.length; index += 1) {
        const row = parsed.values[index];
        const createdAt = new Date(createdAtBase + index).toISOString();
        const parsedDate = parseTransactionDate(row.date, budget.timezone);
        if (row.type === 'TRANSFER') {
          const [sourceAccountId, destinationAccountId] = row.account.split('=>');
          const transferId = randomUUID();
          budget.transfers = [...(budget.transfers ?? []), { id: transferId, sourceAccountId, destinationAccountId, amountMinor: row.amountMinor, businessDate: row.date, month: parsedDate.month, createdAt, payee: row.payee, memo: row.memo }];
          const out: FinancialEvent = { id: randomUUID(), kind: 'TRANSFER_OUT', amountMinor: row.amountMinor, accountId: sourceAccountId, transferId, businessDate: row.date, month: parsedDate.month, createdAt };
          const incoming: FinancialEvent = { id: randomUUID(), kind: 'TRANSFER_IN', amountMinor: row.amountMinor, accountId: destinationAccountId, transferId, businessDate: row.date, month: parsedDate.month, createdAt };
          events.push(out, incoming); append(out); append(incoming);
        } else {
          const id = randomUUID();
          const event: FinancialEvent = { id, transactionId: id, kind: row.type, amountMinor: row.amountMinor, accountId: row.account, businessDate: row.date, month: parsedDate.month, ...(row.type === 'SPENDING' ? { categoryId: row.category } : {}), status: 'POSTED', reconciled: false, createdAt, payee: row.payee, memo: row.memo };
          events.push(event); append(event);
        }
      }
      return { rows: parsed.rows, accepted: parsed.rows, rejected: 0, diagnostics: [], diagnosticsTruncated: false, version } satisfies CsvImportResult;
    }, undefined, true, false, payloadDigest);
  }

  async listTransactions(token: string, budgetId: string, requestedFilter?: string | HistoryFilter, requestId?: string) {
    const user = await this.authenticate(token); await this.requireBudget(token, budgetId);
        const filter: HistoryFilter = typeof requestedFilter === 'string' ? { month: month(requestedFilter) } : (requestedFilter ?? {});
    try {
          const state = await this.financialStore.load(user.id, budgetId);
          if (filter.accountId !== undefined && !(state.accounts ?? []).some(account => account.id === filter.accountId)) throw new ApiError('NOT_FOUND', 'Resource not found');
          if (filter.categoryId !== undefined && !state.categories.some(category => category.id === filter.categoryId)) throw new ApiError('NOT_FOUND', 'Resource not found');
          const items = this.historyItems(state);
          const searchable = items.map(item => {
            const category = item.kind === 'SPENDING' ? item.category : undefined;
            const accountNames = item.kind === 'TRANSFER' ? [item.sourceAccount.name, item.destinationAccount.name] : [state.accounts?.find(account => account.id === item.accountId)?.name].filter((name): name is string => Boolean(name));
            return { ...item, categoryId: category?.id, categoryName: category?.name, accountNames, sourceAccountId: item.kind === 'TRANSFER' ? item.sourceAccount.id : undefined, destinationAccountId: item.kind === 'TRANSFER' ? item.destinationAccount.id : undefined };
          });
          const filtered = filterHistoryItems(searchable, filter).map(item => items.find(candidate => candidate.transactionId === item.transactionId)!);
          return ok({ items: filtered, version: state.version }, requestId);
        } catch (error) { if (error instanceof PersistenceError) throw new ApiError(error.code, error.message); throw error; }
  }
  async getTransaction(token: string, budgetId: string, transactionId: string, requestId?: string) {
    const user = await this.authenticate(token); await this.requireBudget(token, budgetId);
    try { const state = await this.financialStore.load(user.id, budgetId); const item = this.historyItems(state).find(candidate => candidate.transactionId === transactionId); if (!item) throw new ApiError('NOT_FOUND', 'Resource not found'); return ok({ item, version: state.version }, requestId); } catch (error) { if (error instanceof PersistenceError) throw new ApiError(error.code, error.message); throw error; }
  }
  async editTransaction(token: string, budgetId: string, transactionId: string, input: TransactionEditInput, requestId?: string, options: CommandOptions = {}) {
        const normalizedInput = { ...input, ...metadataPatch(input) };
    return this.financial(token, budgetId, 'transaction-edit', { transactionId, input: normalizedInput, expectedVersion: options.expectedVersion }, requestId, options, (budget, events, version, append = () => {}) => {
      this.ready(budget); if (events.some(event => event.transferId === transactionId)) throw new ApiError('CONFLICT', 'Transfers cannot be edited'); const current = this.findTransaction(events, transactionId); if (!current) throw new ApiError('NOT_FOUND', 'Resource not found'); this.ensureEligible(current, budget, events);
      if (!input || typeof input !== 'object' || Object.keys(input).length === 0 || Object.keys(normalizedInput).some(key => !['amountMinor', 'date', 'categoryId', 'payee', 'memo'].includes(key))) throw new ApiError('VALIDATION_ERROR', 'Unsupported transaction edit field');
      if (current.kind === 'INCOME' && normalizedInput.categoryId !== undefined) throw new ApiError('VALIDATION_ERROR', 'Income cannot have a category');
      const parsed = normalizedInput.date === undefined ? undefined : (() => { if (typeof normalizedInput.date !== 'string') throw new ApiError('VALIDATION_ERROR', 'date is invalid'); try { return parseTransactionDate(normalizedInput.date, budget.timezone); } catch { throw new ApiError('VALIDATION_ERROR', 'date is invalid'); } })();
      let category: Category | undefined;
      if (normalizedInput.categoryId !== undefined) { if (typeof normalizedInput.categoryId !== 'string') throw new ApiError('VALIDATION_ERROR', 'categoryId is invalid'); category = budget.categories.find(candidate => candidate.id === normalizedInput.categoryId); if (!category) throw new ApiError('NOT_FOUND', 'Resource not found'); if (category.archived && category.id !== current.categoryId) throw new ApiError('CONFLICT', 'Replacement category must be active'); }
      let replacement: FinancialEvent;
      try { replacement = {
            ...buildReplacement(current, { amountMinor: normalizedInput.amountMinor as number | undefined, ...(parsed ? { businessDate: parsed.date } : {}), ...(normalizedInput.categoryId !== undefined ? { categoryId: normalizedInput.categoryId as string } : {}), ...metadataPatch(normalizedInput), timezone: budget.timezone }, category ? { categoryId: category.id, categoryBudgetId: budget.id, categoryArchived: category.archived, budgetId: budget.id } : undefined),
            createdAt: new Date(this.now()).toISOString(),
          }; } catch (error) { if (error instanceof Error && error.message.startsWith('CONFLICT:')) throw new ApiError('CONFLICT', error.message.slice(9)); if (error instanceof Error) throw new ApiError('VALIDATION_ERROR', error.message); throw error; }
      events.splice(events.indexOf(current), 1, replacement); append(replacement); return { item: this.historyItem(replacement, budget, events), version };
    }, undefined, true);
  }
  async deleteTransaction(token: string, budgetId: string, transactionId: string, input: TransactionDeleteInput, requestId?: string, options: CommandOptions = {}) {
    return this.financial(token, budgetId, 'transaction-delete', { transactionId, input, expectedVersion: options.expectedVersion }, requestId, options, (budget, events, version, append = () => {}) => {
      this.ready(budget); if (events.some(event => event.transferId === transactionId)) throw new ApiError('CONFLICT', 'Transfers cannot be deleted'); const current = this.findTransaction(events, transactionId); if (!current) throw new ApiError('NOT_FOUND', 'Resource not found'); this.ensureEligible(current, budget, events);
      if (!input || input.confirmed !== true || Object.keys(input).some(key => !['confirmed', 'reason'].includes(key))) throw new ApiError('VALIDATION_ERROR', 'Deletion confirmation is required'); if (input.reason !== undefined && typeof input.reason !== 'string') throw new ApiError('VALIDATION_ERROR', 'reason must be a string');
      const tombstone = { ...buildDeleteTombstone(current), status: current.status ?? 'POSTED', reconciled: false } as FinancialEvent; events.splice(events.indexOf(current), 1); append(tombstone); return { id: transactionId, deleted: true, version };
    }, userId => ({ actorId: userId, transactionId, requestId, reason: typeof input?.reason === 'string' ? input.reason : undefined }), true);
  }
  async getFinancialSummary(token: string, budgetId: string, requestedMonth: string, requestId?: string) { return this.readSummary(token, budgetId, requestedMonth, requestId); }
  async getDashboard(token: string, budgetId: string, requestedMonth: string, requestId?: string) { return this.readSummary(token, budgetId, requestedMonth, requestId); }

  private async financial<T>(token: string, budgetId: string, command: string, input: unknown, requestId: string | undefined, options: CommandOptions, work: (budget: FinancialState, events: FinancialEvent[], version: number, append: (event: FinancialEvent) => void) => T, audit?: (userId: string) => { actorId: string; transactionId: string; requestId?: string; reason?: string }, requireVersion = false, persistAccounts = false, payloadDigest?: string) {
    const user = await this.authenticate(token); await this.requireBudget(token, budgetId); const key = options.idempotencyKey?.trim(); if (!key) throw new ApiError('VALIDATION_ERROR', 'Idempotency-Key is required'); if (requireVersion && !Number.isSafeInteger(options.expectedVersion)) throw new ApiError('VALIDATION_ERROR', 'If-Match is required');
    try {
      const stored = await this.financialStore.execute({ ownerId: user.id, budgetId, command, input, idempotencyKey: key, expectedVersion: options.expectedVersion, work, ...(audit ? { deletionAudit: audit(user.id) } : {}), ...(persistAccounts ? { persistAccounts: true } : {}), ...(payloadDigest ? { payloadDigest } : {}) });
      return ok(stored.result, requestId);
    } catch (error) {
      if (error instanceof PersistenceError) throw new ApiError(error.code, error.message);
      throw error;
    }
  }
  private historyItems(state: FinancialState) { const ordinary = state.events.filter(event => event.kind === 'INCOME' || event.kind === 'SPENDING').map(event => this.historyItem(event, state, state.events)); const transfers = (state.transfers ?? []).map(transfer => this.transferHistoryItem(transfer, state)); return [...ordinary, ...transfers].sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt ?? '').localeCompare(a.createdAt ?? '') || b.transactionId.localeCompare(a.transactionId)); }
  private transferHistoryItem(transfer: TransferState, state: FinancialState): TransferHistoryItem { const accounts = state.accounts ?? []; const source = accounts.find(account => account.id === transfer.sourceAccountId); const destination = accounts.find(account => account.id === transfer.destinationAccountId); if (!source || !destination) throw new Error('Malformed transfer account reference'); return { transactionId: transfer.id, kind: 'TRANSFER', date: transfer.businessDate, amountMinor: transfer.amountMinor, sourceAccount: { id: source.id, name: source.name, kind: source.kind, archived: source.archived }, destinationAccount: { id: destination.id, name: destination.name, kind: destination.kind, archived: destination.archived }, payee: transfer.payee ?? null, memo: transfer.memo ?? null, createdAt: transfer.createdAt }; }
  private historyItem(event: FinancialEvent, state: FinancialState, events: FinancialEvent[]): TransactionHistoryItem {
    const transactionId = event.transactionId ?? event.id; const category = event.categoryId ? state.categories.find(candidate => candidate.id === event.categoryId) : undefined; const protectedIncome = event.kind === 'INCOME' && events.some(candidate => candidate.kind === 'INCOME_RELEASE' && (candidate.relatedEventId === event.id || candidate.relatedEventId === transactionId));
    return { transactionId, kind: event.kind as 'INCOME' | 'SPENDING', date: event.businessDate ?? `${event.month ?? '1970-01'}-01`, amountMinor: event.amountMinor, ...(event.accountId ? { accountId: event.accountId } : {}), ...(event.kind === 'SPENDING' ? { category: category ? { id: category.id, name: category.name, archived: category.archived } : null } : {}), payee: event.payee ?? null, memo: event.memo ?? null, ...(event.createdAt ? { createdAt: event.createdAt } : {}), state: protectedIncome ? 'PROTECTED' : 'ELIGIBLE' };
  }
  private findTransaction(events: FinancialEvent[], id: string) { return events.find(event => (event.transactionId ?? event.id) === id && (event.kind === 'INCOME' || event.kind === 'SPENDING')); }
  private ensureEligible(event: FinancialEvent, budget: FinancialState, events: FinancialEvent[]) { const released = event.kind === 'INCOME' && events.some(candidate => candidate.kind === 'INCOME_RELEASE' && (candidate.relatedEventId === event.id || candidate.relatedEventId === (event.transactionId ?? event.id))); try { assertEligibleTransaction(event, { supportedAccountId: budget.account?.id ?? '', released }); } catch (error) { throw new ApiError('CONFLICT', error instanceof Error ? error.message.replace(/^CONFLICT:\s*/, '') : 'Transaction is not eligible'); } }
  private async readSummary(token: string, budgetId: string, requestedMonth: string, requestId?: string) {
    const user = await this.authenticate(token); await this.requireBudget(token, budgetId); const requested = month(requestedMonth);
    try {
      const state = await this.financialStore.load(user.id, budgetId);
      return ok(this.reports.read(state, requested), requestId);
    } catch (error) {
      if (error instanceof PersistenceError) throw new ApiError(error.code, error.message);
      throw error;
    }
  }
  private projectAccounts(budget: FinancialState, events: FinancialEvent[]) { const accounts = budget.accounts ?? (budget.account ? [{ ...budget.account, kind: budget.account.kind ?? 'CASH', archived: budget.account.archived ?? false }] : []); return calculateAccountBalances(accounts, events.filter(event => ['INCOME', 'SPENDING', 'TRANSFER_OUT', 'TRANSFER_IN'].includes(event.kind)).map(event => ({ accountId: event.accountId, kind: event.kind as 'INCOME' | 'SPENDING' | 'TRANSFER_OUT' | 'TRANSFER_IN', amountMinor: event.amountMinor }))); }
  private balance(budget: FinancialState, events: FinancialEvent[]) { return this.projectAccounts(budget, events).reduce((sum, account) => sum + (account.balanceMinor ?? 0), 0); }
  private ready(budget: FinancialState) { if (budget.setupStep !== 'COMPLETE' || !this.activeAccount(budget)) throw new ApiError('CONFLICT', 'Budget setup is incomplete'); }
  private activeAccount(budget: FinancialState, requested?: unknown) { const accounts = budget.accounts ?? (budget.account ? [{ ...budget.account, kind: budget.account.kind ?? 'CASH', archived: budget.account.archived ?? false }] : []); if (requested !== undefined && typeof requested !== 'string') throw new ApiError('VALIDATION_ERROR', 'accountId is invalid'); const account = requested === undefined ? oldestAccount(accounts.filter(candidate => !candidate.archived)) : accounts.find(candidate => candidate.id === requested); if (!account) throw new ApiError('NOT_FOUND', 'Resource not found'); if (account.archived) throw new ApiError('CONFLICT', 'Archived accounts cannot receive new activity'); budget.accounts = accounts; return account; }
  private activeCategory(budget: FinancialState, id: string) { const category = budget.categories.find(c => c.id === id); if (!category) throw new ApiError('NOT_FOUND', 'Resource not found'); if (category.archived) throw new ApiError('CONFLICT', 'Archived categories cannot receive new activity'); return category; }
  private requireBudget(token: string, budgetId: string) {
    const auth = this.authenticate(token);
    const load = (user: User) => { const budget = this.budgetStore.loadBudget(user.id, budgetId); const found = (state: BudgetState | null) => { if (!state) throw new ApiError('NOT_FOUND', 'Resource not found'); return Object.assign(state, { ownerId: user.id }); }; return budget instanceof Promise ? budget.then(found) : found(budget); };
    return auth instanceof Promise ? auth.then(load) : load(auth);
  }
  private hash(password: string) { const salt = randomBytes(16); return `${salt.toString('hex')}:${scryptSync(password, salt, 32).toString('hex')}`; }
  private verify(password: string, encoded: string) { const [salt, expected] = encoded.split(':'); const actual = scryptSync(password, Buffer.from(salt, 'hex'), 32); return timingSafeEqual(actual, Buffer.from(expected, 'hex')); }
}

export const errorEnvelope = (error: unknown, requestId = randomUUID()) => { const e = error instanceof ApiError ? error : new ApiError('INTERNAL_ERROR', 'Internal server error', 500); return { status: e.status, body: { error: { code: e.code, message: e.message, requestId, ...(e.details !== undefined ? { details: e.details } : {}) } } }; };
