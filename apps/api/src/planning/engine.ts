export type MinorUnits = number;
export type AccountKind = 'CASH' | 'CHECKING';
export type AccountState = { id: string; name: string; kind: AccountKind; archived: boolean; createdAt?: string; openingBalanceMinor: MinorUnits; balanceMinor?: MinorUnits; clearedBalanceMinor?: MinorUnits };
// The ONE definition of which event kinds contribute to an account balance.
// Every balance projection consumes `isBalanceEvent`; a literal kind list in a projection is a defect.
// This site does NOT answer the separate question of which items a reconciliation may lock: a
// reconciliation adjustment is created already reconciled, so it is never a lock candidate.
export const BALANCE_EVENT_KINDS = ['INCOME', 'SPENDING', 'TRANSFER_OUT', 'TRANSFER_IN', 'RECONCILIATION_ADJUSTMENT'] as const;
export type BalanceEventKind = (typeof BALANCE_EVENT_KINDS)[number];
export const isBalanceEvent = (kind: string): kind is BalanceEventKind => (BALANCE_EVENT_KINDS as readonly string[]).includes(kind);
// A DIFFERENT question from the balance predicate, and deliberately its own list: which effective
// statement items a reconciliation may lock. A reconciliation adjustment is created already
// reconciled, so it is never a lock candidate. Keeping the lists separate is what makes that
// explicit; a future kind must be placed in each of them deliberately.
export const LOCKABLE_EVENT_KINDS = ['INCOME', 'SPENDING', 'TRANSFER_OUT', 'TRANSFER_IN'] as const;
export type LockableEventKind = (typeof LOCKABLE_EVENT_KINDS)[number];
export const isLockableEvent = (kind: string): kind is LockableEventKind => (LOCKABLE_EVENT_KINDS as readonly string[]).includes(kind);
export type AccountBalanceEvent = { accountId?: string; kind: BalanceEventKind; amountMinor: MinorUnits; cleared?: boolean };
export type ClearedState = { status?: 'POSTED' | 'WORKING'; cleared?: boolean; reconciled?: boolean };
export const clearedStateViolation = (event: ClearedState): string | null => {
  if (event.reconciled === true && event.status === 'WORKING') return 'A WORKING financial event cannot be reconciled';
  if (event.reconciled === true && event.cleared !== true) return 'A reconciled financial event must be cleared';
  if (event.cleared === true && event.status === 'WORKING') return 'A WORKING financial event cannot be cleared';
  return null;
};

export const orderAccounts = <T extends { id: string; createdAt?: string }>(accounts: readonly T[]) => [...accounts].sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? '') || a.id.localeCompare(b.id));
export const oldestAccount = <T extends { id: string; createdAt?: string }>(accounts: readonly T[]) => orderAccounts(accounts)[0] ?? null;

const integer = (value: number, name: string, min?: number) => {
  if (!Number.isSafeInteger(value) || (min !== undefined && value < min)) {
    throw new Error(`${name} must be an integer minor-unit amount`);
  }
  return value;
};
const positive = (value: number, name: string) => integer(value, name, 1);

export type RtaInput = {
  openingBalanceMinor: MinorUnits;
  releasedIncomeMinor: MinorUnits;
  unreleasedIncomeMinor: MinorUnits;
  priorCarryMinor: MinorUnits;
  assignedMinor: MinorUnits;
};
export const calculateAccountBalance = (input: { openingBalanceMinor: MinorUnits; incomeMinor: MinorUnits; spendingMinor: MinorUnits }) => {
  integer(input.openingBalanceMinor, 'openingBalanceMinor');
  integer(input.incomeMinor, 'incomeMinor', 0);
  integer(input.spendingMinor, 'spendingMinor', 0);
  return input.openingBalanceMinor + input.incomeMinor - input.spendingMinor;
};

export const calculateAccountBalances = <T extends AccountState>(accounts: readonly T[], events: readonly AccountBalanceEvent[]) => {
  // A kind outside the single source is rejected rather than silently debited. An unknown value must
  // never be absorbed by a fallback branch: that pattern has caused silent financial defects here
  // before, most recently as a no-op callback default that skipped a whole validation path.
  for (const event of events) if (!isBalanceEvent(event.kind)) throw new Error(`${String(event.kind)} is not a balance event kind`);
  const ordered = orderAccounts(accounts);
  const fallback = oldestAccount(ordered)?.id;
  return ordered.map(account => {
    const balances = events.reduce((total, event) => {
      if ((event.accountId ?? fallback) !== account.id) return total;
      integer(event.amountMinor, 'event.amountMinor', event.kind === 'RECONCILIATION_ADJUSTMENT' ? undefined : 0);
      const effect = event.kind === 'RECONCILIATION_ADJUSTMENT' ? event.amountMinor : event.kind === 'INCOME' || event.kind === 'TRANSFER_IN' ? event.amountMinor : -event.amountMinor;
      return {
        balanceMinor: total.balanceMinor + effect,
        clearedBalanceMinor: total.clearedBalanceMinor + (event.cleared ? effect : 0),
      };
    }, { balanceMinor: account.openingBalanceMinor, clearedBalanceMinor: account.openingBalanceMinor });
    integer(balances.balanceMinor, 'account balance');
    integer(balances.clearedBalanceMinor, 'cleared account balance');
    return { ...account, ...balances };
  });
};

export const aggregateAccountBalance = (accounts: readonly AccountState[], events: readonly AccountBalanceEvent[]) => calculateAccountBalances(accounts, events).reduce((sum, account) => sum + account.balanceMinor!, 0);
export type RtaBreakdown = RtaInput & { amountMinor: MinorUnits };

export const calculateRta = (input: RtaInput): RtaBreakdown => {
  integer(input.openingBalanceMinor, 'openingBalanceMinor');
  integer(input.releasedIncomeMinor, 'releasedIncomeMinor', 0);
  integer(input.unreleasedIncomeMinor, 'unreleasedIncomeMinor', 0);
  integer(input.priorCarryMinor, 'priorCarryMinor', 0);
  integer(input.assignedMinor, 'assignedMinor', 0);
  return {
    openingBalanceMinor: input.openingBalanceMinor,
    releasedIncomeMinor: input.releasedIncomeMinor,
    unreleasedIncomeMinor: input.unreleasedIncomeMinor,
    priorCarryMinor: input.priorCarryMinor,
    assignedMinor: input.assignedMinor,
    amountMinor: input.openingBalanceMinor + input.releasedIncomeMinor + input.priorCarryMinor - input.assignedMinor,
  };
};

export type CategoryValues = { carryoverMinor: MinorUnits; assignedMinor: MinorUnits; activityMinor: MinorUnits; availableMinor: MinorUnits };
export const calculateCategory = (input: Omit<CategoryValues, 'availableMinor'>): CategoryValues => {
  integer(input.carryoverMinor, 'carryoverMinor', 0);
  integer(input.assignedMinor, 'assignedMinor', 0);
  integer(input.activityMinor, 'activityMinor');
  return { ...input, availableMinor: input.carryoverMinor + input.assignedMinor + input.activityMinor };
};
export const positiveRollover = (availableMinor: MinorUnits) => Math.max(0, integer(availableMinor, 'availableMinor'));

export const applyAssignment = (state: { rtaMinor: MinorUnits; assignedMinor: MinorUnits }, amountMinor: MinorUnits) => {
  positive(amountMinor, 'amountMinor');
  integer(state.rtaMinor, 'rtaMinor');
  integer(state.assignedMinor, 'assignedMinor', 0);
  return { rtaMinor: state.rtaMinor - amountMinor, assignedMinor: state.assignedMinor + amountMinor };
};
export const unassign = (state: { rtaMinor: MinorUnits; assignedMinor: MinorUnits }, amountMinor: MinorUnits) => {
  positive(amountMinor, 'amountMinor');
  if (amountMinor > state.assignedMinor) throw new Error('Cannot unassign more than assigned');
  return { rtaMinor: state.rtaMinor + amountMinor, assignedMinor: state.assignedMinor - amountMinor };
};
export const moveAssignment = (source: { assignedMinor: MinorUnits }, destination: { assignedMinor: MinorUnits }, amountMinor: MinorUnits) => {
  positive(amountMinor, 'amountMinor');
  if (amountMinor > source.assignedMinor) throw new Error('Cannot move more than assigned');
  return { source: { assignedMinor: source.assignedMinor - amountMinor }, destination: { assignedMinor: destination.assignedMinor + amountMinor }, amountMinor };
};

export type IncomeState = { realizedMinor: MinorUnits; releasedMinor: MinorUnits };
export const releaseIncome = (state: IncomeState) => {
  integer(state.realizedMinor, 'realizedMinor', 0);
  integer(state.releasedMinor, 'releasedMinor', 0);
  if (state.releasedMinor > state.realizedMinor) throw new Error('Released income exceeds realized income');
  const remaining = state.realizedMinor - state.releasedMinor;
  return { state: remaining ? { ...state, releasedMinor: state.realizedMinor } : state, releasedNowMinor: remaining, changed: remaining > 0 };
};

export const monthForDate = (value: string | Date, timezone = 'UTC') => {
  let date: Date;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) throw new Error('Invalid transaction date');
  } else {
    date = value instanceof Date ? new Date(value) : new Date(value);
    if (Number.isNaN(date.getTime())) throw new Error('Invalid transaction date');
  }
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit' }).formatToParts(date);
  const year = parts.find(part => part.type === 'year')?.value;
  const month = parts.find(part => part.type === 'month')?.value;
  if (!year || !month) throw new Error('Invalid budget timezone');
  return `${year}-${month}`;
};

const supported = new Set(['income', 'release', 'spending', 'assignment', 'unassignment', 'move']);
const deferred = new Set(['split', 'transfer', 'card', 'target', 'scheduled', 'future-income', 'refund', 'reimbursement', 'return', 'edit', 'delete', 'pending']);
export const assertSupportedCommand = (command: string) => {
  const normalized = command.trim().toLowerCase();
  if (!supported.has(normalized) || deferred.has(normalized)) throw new Error(`Unsupported financial command: ${command}`);
};
