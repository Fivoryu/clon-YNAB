import { createHash } from 'node:crypto';
import { BudgetStoreError, type BudgetState, type BudgetStore, type NewSession, type NewUser, type StoredSession, type StoredUser } from './budget-store.ts';
import { assertTransferPairingAtWrite, isFinancialEventCleared, PersistenceError, type ScheduleState } from './financial-store.ts';
import { calculateAccountBalances, clearedStateViolation, isBalanceEvent, oldestAccount, type BalanceEventKind } from '../planning/engine.ts';
import { validateScheduleDefinition } from '../planning/schedules.ts';
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export class InMemoryBudgetStore implements BudgetStore {
  private readonly users = new Map<string, StoredUser>(); private readonly sessions = new Map<string, StoredSession>(); private readonly budgets = new Map<string, BudgetState>(); private readonly receipts = new Map<string, Map<string, { payloadDigest: string; result: unknown }>>(); private readonly queues = new Map<string, Promise<unknown>>();
  createUser(user: NewUser) { if (this.users.has(user.email)) throw new BudgetStoreError('CONFLICT', 'Account already exists'); this.users.set(user.email, { ...user }); }
  findUser(email: string) { return this.users.get(email) ? { ...this.users.get(email)! } : null; }
  findUserById(id: string) { const user = [...this.users.values()].find(candidate => candidate.id === id); return user ? { ...user } : null; }
  createSession(session: NewSession) { this.sessions.set(session.tokenHash, { userId: session.userId, expiresAt: session.expiresAt, revoked: false }); }
  findSession(tokenHash: string) { const session = this.sessions.get(tokenHash); return session ? { ...session } : null; }
  revokeSession(tokenHash: string) { const session = this.sessions.get(tokenHash); if (session) session.revoked = true; }
  createBudget(ownerId: string, state: BudgetState) { const user = this.findUserById(ownerId); if (!user) throw new BudgetStoreError('NOT_FOUND'); if (user.budgetId) throw new BudgetStoreError('CONFLICT', 'A user can own only one budget'); this.validateWholeState(state); this.budgets.set(state.id, this.clone(state)); this.users.set(user.email, { ...user, budgetId: state.id }); return this.clone(state); }
  loadBudget(ownerId: string, budgetId: string) { const user = this.findUserById(ownerId); const state = user?.budgetId === budgetId ? this.budgets.get(budgetId) : undefined; return state ? this.clone(state) : null; }
  saveBudget(ownerId: string, state: BudgetState) {
    if (!this.loadBudget(ownerId, state.id)) throw new BudgetStoreError('NOT_FOUND');
    const stored = this.budgets.get(state.id);
    if (state.schedules === undefined && (stored?.schedules?.length ?? 0) > 0) {
      throw new BudgetStoreError('CONFLICT', 'Cannot save budget state without schedules; existing schedules would be lost');
    }
    this.validateWholeState(state);
    this.budgets.set(state.id, this.clone(state));
    return this.clone(state);
  }
  private validateWholeState(state: BudgetState) {
    // In-memory events are the EFFECTIVE set; unlike Prisma's full chain, they are never folded on read.
    const eventIds = new Set(state.events.map(event => event.id));
    if (state.events.some(event => event.supersedesEventId && eventIds.has(event.supersedesEventId))) throw new PersistenceError('CONFLICT', 'In-memory budget events must contain only the effective event set');
    assertTransferPairingAtWrite(state.events, [], (state.transfers ?? []).map(transfer => transfer.id));
    for (const event of state.events) { const violation = clearedStateViolation(event); if (violation) throw new PersistenceError('CONFLICT', violation); }
    const accounts = new Set((state.accounts?.length ? state.accounts : state.account ? [state.account] : []).map(account => account.id));
    const categories = new Set(state.categories.map(category => category.id));
    const scheduleIds = new Set<string>();
    for (const schedule of state.schedules ?? []) {
      if (!validateScheduleDefinition(schedule) || schedule.budgetId !== state.id || !accounts.has(schedule.accountId) || (schedule.categoryId !== null && !categories.has(schedule.categoryId)) || scheduleIds.has(schedule.id)) {
        throw new PersistenceError('CONFLICT', 'Invalid schedule state');
      }
      scheduleIds.add(schedule.id);
    }
  }
  async executeFinancial<T>(command: any): Promise<{ result: T; version: number; replayed?: true }> {
    const previous = this.queues.get(command.budgetId) ?? Promise.resolve();
    const run = previous.then(() => this.executeFinancialNow<T>(command), () => this.executeFinancialNow<T>(command));
    this.queues.set(command.budgetId, run);
    try { return await run; } finally { if (this.queues.get(command.budgetId) === run) this.queues.delete(command.budgetId); }
  }
  private async executeFinancialNow<T>(command: any): Promise<{ result: T; version: number; replayed?: true }> { let state = this.loadBudget(command.ownerId, command.budgetId); if (!state && command.seed) state = this.createBudget(command.ownerId, command.seed); if (!state) throw new PersistenceError('NOT_FOUND', 'Resource not found'); const receipts = this.receipts.get(state.id) ?? new Map(); this.receipts.set(state.id, receipts); const payloadDigest = command.payloadDigest ?? digest({ command: command.command, input: command.input, expectedVersion: command.expectedVersion }); const receipt = receipts.get(command.idempotencyKey); if (receipt) { if (receipt.payloadDigest !== payloadDigest) throw new PersistenceError('CONFLICT', 'Idempotency key was reused with a different payload'); return { result: receipt.result as T, version: state.version, replayed: true }; } if (command.expectedVersion !== undefined && command.expectedVersion !== state.version) throw new PersistenceError('CONFLICT', 'Budget version is stale'); const events = state.events.map((event: any) => ({ ...event })); const appended: any[] = []; const result = command.work(state, events, state.version + 1, (event: any) => appended.push(event)); if (command.persistSchedule) { const schedule = command.persistSchedule as ScheduleState; const schedules = state.schedules ?? []; const index = schedules.findIndex((candidate: ScheduleState) => candidate.id === schedule.id); state.schedules = index < 0 ? [...schedules, { ...schedule }] : schedules.map((candidate: ScheduleState) => candidate.id === schedule.id ? { ...schedule } : candidate); } if (command.deleteScheduleId) state.schedules = (state.schedules ?? []).filter((schedule: ScheduleState) => schedule.id !== command.deleteScheduleId); const newEvents = appended.length ? appended : events.slice(state.events.length); assertTransferPairingAtWrite(events, newEvents, (state.transfers ?? []).map(transfer => transfer.id)); for (const event of newEvents) { const violation = clearedStateViolation(event); if (violation) throw new PersistenceError('CONFLICT', violation); } state.events = events; state.version += 1; this.saveBudget(command.ownerId, state); receipts.set(command.idempotencyKey, { payloadDigest, result }); return { result, version: state.version }; }
  async loadFinancial(ownerId: string, budgetId: string) { const state = this.loadBudget(ownerId, budgetId); if (!state) throw new PersistenceError('NOT_FOUND', 'Resource not found'); return state; }
  findReceipt(ownerId: string, budgetId: string, idempotencyKey: string) {
    if (!this.loadBudget(ownerId, budgetId)) throw new PersistenceError('NOT_FOUND', 'Resource not found');
    const receipt = this.receipts.get(budgetId)?.get(idempotencyKey);
    return receipt ? { payloadDigest: receipt.payloadDigest, result: receipt.result } : null;
  }
  private clone(state: BudgetState): BudgetState { const events = state.events.map(event => ({ ...event, payee: event.payee ?? null, memo: event.memo ?? null })); const source = state.accounts?.length ? state.accounts : (state.account ? [{ ...state.account, kind: state.account.kind ?? 'CASH', archived: state.account.archived ?? false }] : []); const accounts = calculateAccountBalances(source, events.filter(event => isBalanceEvent(event.kind)).map(event => ({ accountId: event.accountId, kind: event.kind as BalanceEventKind, amountMinor: event.amountMinor, cleared: isFinancialEventCleared(event) }))); const alias = oldestAccount(accounts); return { ...state, account: alias ? { id: alias.id, name: alias.name, openingBalanceMinor: alias.openingBalanceMinor, archived: alias.archived, kind: alias.kind, createdAt: alias.createdAt } : null, accounts, transfers: (state.transfers ?? []).map(transfer => ({ ...transfer, payee: transfer.payee ?? null, memo: transfer.memo ?? null })), reconciliations: (state.reconciliations ?? []).map(record => ({ ...record })), categories: state.categories.map(category => ({ ...category })), schedules: (state.schedules ?? []).map(schedule => ({ ...schedule })), events }; }
}
export class InMemoryFinancialStore { private readonly store: InMemoryBudgetStore; constructor(store: InMemoryBudgetStore) { this.store = store; } execute<T>(command: any) { return this.store.executeFinancial<T>(command); } load(ownerId: string, budgetId: string) { return this.store.loadFinancial(ownerId, budgetId); } findReceipt(ownerId: string, budgetId: string, idempotencyKey: string) { return this.store.findReceipt(ownerId, budgetId, idempotencyKey); } }
