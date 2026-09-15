export type Category = { id: string; name: string; archived: boolean };

export type Account = {
  id: string;
  name: string;
  kind: 'CASH' | 'CHECKING';
  archived: boolean;
  openingBalanceMinor: number;
  balanceMinor: number;
};

export type Budget = {
  id: string;
  setupStep: 'ACCOUNT' | 'CATEGORIES' | 'COMPLETE';
  version: number;
  accounts: Account[];
  accountBalanceMinor: number;
  account: Account | null;
  categories: Category[];
};

export type CategorySummary = Category & {
  carryoverMinor: number;
  assignedMinor: number;
  activityMinor: number;
  availableMinor: number;
};

export type Summary = {
  month: string;
  accountBalanceMinor: number;
  accounts: Account[];
  rta: {
    amountMinor: number;
    releasedIncomeMinor: number;
    unreleasedIncomeMinor: number;
    priorCarryMinor: number;
    assignedMinor: number;
  };
  categories: CategorySummary[];
  version: number;
};

export type CommandResult = {
  id?: string;
  transferId?: string;
  version: number;
  amountMinor?: number;
  released?: boolean;
  payee?: string | null;
  memo?: string | null;
};

export type CsvDiagnostic = { row: number; field: string; code: string; message: string };
export type CsvImportResult = {
  rows: number;
  accepted: number;
  rejected: number;
  diagnostics: CsvDiagnostic[];
  diagnosticsTruncated: boolean;
  version: number;
};

export type HistoryItem =
  | {
      transactionId: string;
      kind: 'INCOME' | 'SPENDING';
      date: string;
      amountMinor: number;
      category?: Category | null;
      payee: string | null;
      memo: string | null;
      state: 'ELIGIBLE' | 'PROTECTED';
      accountId?: string;
    }
  | {
      transactionId: string;
      kind: 'TRANSFER';
      date: string;
      amountMinor: number;
      payee: string | null;
      memo: string | null;
      sourceAccount: Pick<Account, 'id' | 'name' | 'kind' | 'archived'>;
      destinationAccount: Pick<Account, 'id' | 'name' | 'kind' | 'archived'>;
      createdAt: string;
    };

export type HistoryResponse = { items: HistoryItem[]; version: number };
export type HistoryKind = '' | 'INCOME' | 'SPENDING' | 'TRANSFER';
export type HistoryMutation = { version: number; item?: HistoryItem; deleted?: boolean };
