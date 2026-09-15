export type MinorUnits = number;
export type AccountKind = 'CASH' | 'CHECKING';
export type AccountState = { id: string; name: string; kind: AccountKind; archived: boolean; createdAt?: string; openingBalanceMinor: MinorUnits; balanceMinor?: MinorUnits };
export type AccountBalanceEvent = { accountId?: string; kind: 'INCOME' | 'SPENDING' | 'TRANSFER_OUT' | 'TRANSFER_IN'; amountMinor: MinorUnits };

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
  const ordered = orderAccounts(accounts);
  const fallback = oldestAccount(ordered)?.id;
  return ordered.map(account => {
    const balance = events.reduce((total, event) => {
      if ((event.accountId ?? fallback) !== account.id) return total;
      integer(event.amountMinor, 'event.amountMinor', 0);
      return total + (event.kind === 'INCOME' || event.kind === 'TRANSFER_IN' ? event.amountMinor : -event.amountMinor);
    }, account.openingBalanceMinor);
    integer(balance, 'account balance');
    return { ...account, balanceMinor: balance };
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
const deferred = new Set(['split', 'transfer', 'card', 'reconciliation', 'target', 'scheduled', 'future-income', 'refund', 'reimbursement', 'return', 'edit', 'delete', 'cleared', 'pending', 'uncleared']);
export const assertSupportedCommand = (command: string) => {
  const normalized = command.trim().toLowerCase();
  if (!supported.has(normalized) || deferred.has(normalized)) throw new Error(`Unsupported financial command: ${command}`);
};
