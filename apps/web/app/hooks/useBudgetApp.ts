'use client';

import { useState, type FormEvent } from 'react';
import type {
  Budget,
  CommandResult,
  CsvDiagnostic,
  CsvImportResult,
  HistoryItem,
  HistoryKind,
  HistoryMutation,
  HistoryResponse,
  Summary,
} from '../models';

class RequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

const currentMonth = () => new Date().toISOString().slice(0, 7);

export function useBudgetApp() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [budget, setBudget] = useState<Budget | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [month, setMonth] = useState(currentMonth);
  const [opening, setOpening] = useState('');
  const [accountName, setAccountName] = useState('Cash');
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [newAccountName, setNewAccountName] = useState('');
  const [newAccountKind, setNewAccountKind] = useState<'cash' | 'checking'>('cash');
  const [newAccountOpening, setNewAccountOpening] = useState('');
  const [transferSourceId, setTransferSourceId] = useState('');
  const [transferDestinationId, setTransferDestinationId] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferDate, setTransferDate] = useState('');
  const [transferPayee, setTransferPayee] = useState('');
  const [transferMemo, setTransferMemo] = useState('');
  const [categoryNames, setCategoryNames] = useState('Bills, Food');
  const [incomeAmount, setIncomeAmount] = useState('');
  const [incomePayee, setIncomePayee] = useState('');
  const [incomeMemo, setIncomeMemo] = useState('');
  const [spendingAmount, setSpendingAmount] = useState('');
  const [spendingPayee, setSpendingPayee] = useState('');
  const [spendingMemo, setSpendingMemo] = useState('');
  const [assignAmount, setAssignAmount] = useState('');
  const [unassignAmount, setUnassignAmount] = useState('');
  const [moveAmount, setMoveAmount] = useState('');
  const [incomeDate, setIncomeDate] = useState('');
  const [spendingDate, setSpendingDate] = useState('');
  const [spendingCategoryId, setSpendingCategoryId] = useState('');
  const [assignCategoryId, setAssignCategoryId] = useState('');
  const [unassignCategoryId, setUnassignCategoryId] = useState('');
  const [moveSourceId, setMoveSourceId] = useState('');
  const [moveDestinationId, setMoveDestinationId] = useState('');
  const [latestIncome, setLatestIncome] = useState<CommandResult | null>(null);
  const [message, setMessage] = useState('');
  const [history, setHistory] = useState<HistoryResponse | null>(null);
  const [historyMonth, setHistoryMonth] = useState('');
  const [historyAccount, setHistoryAccount] = useState('');
  const [historyKind, setHistoryKind] = useState<HistoryKind>('');
  const [historyCategory, setHistoryCategory] = useState('');
  const [historyFrom, setHistoryFrom] = useState('');
  const [historyTo, setHistoryTo] = useState('');
  const [historyQuery, setHistoryQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editPayee, setEditPayee] = useState('');
  const [editMemo, setEditMemo] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [accountFormOpen, setAccountFormOpen] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvDiagnostics, setCsvDiagnostics] = useState<CsvDiagnostic[]>([]);

  const call = async <T,>(url: string, options: RequestInit = {}): Promise<T> => {
    const response = await fetch(url, { credentials: 'include', ...options });
    const result = await response.json() as { data?: T; error?: { message?: string } };
    if (!response.ok) throw new RequestError(result.error?.message || 'Request failed', response.status);
    return result.data as T;
  };

  const command = (url: string, input: unknown) => call<CommandResult>(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'Idempotency-Key': crypto.randomUUID(),
      'If-Match': `W/"${budget?.version ?? 0}"`,
    },
    body: JSON.stringify(input),
  });

  const refresh = async (targetMonth = month, targetBudget = budget) => {
    if (!targetBudget) return;
    const [dashboard, report, latest] = await Promise.all([
      call<Summary>(`/api/v1/budgets/${targetBudget.id}/dashboard?month=${encodeURIComponent(targetMonth)}`),
      call<Summary>(`/api/v1/budgets/${targetBudget.id}/summary?month=${encodeURIComponent(targetMonth)}`),
      call<Budget>(`/api/v1/budgets/${targetBudget.id}`),
    ]);
    setSummary(report || dashboard);
    setBudget(latest);
    setSelectedAccountId(current => current || latest.account?.id || '');
  };

  const adoptBudget = (next: Budget) => {
    setBudget(next);
    setSelectedAccountId(next.account?.id || next.accounts[0]?.id || '');
    if (next.account) {
      setAccountName(next.account.name);
      setOpening(String(next.account.openingBalanceMinor));
    }
    if (next.categories.length) {
      setCategoryNames(next.categories.filter(category => !category.archived).map(category => category.name).join(', '));
    }
  };

  const authenticate = async (event: FormEvent, action: 'register' | 'sign-in') => {
    event.preventDefault();
    try {
      await call(`/api/v1/auth/${action}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      setMessage(action === 'register' ? 'Account created. Sign in to continue.' : 'Signed in. Start or resume your budget setup.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Authentication failed');
    }
  };

  const startOrResume = async () => {
    try {
      const resumed = await call<Budget>('/api/v1/budgets');
      adoptBudget(resumed);
      setMessage(resumed.setupStep === 'COMPLETE' ? 'Budget loaded.' : 'Budget setup resumed.');
      if (resumed.setupStep === 'COMPLETE') await refresh(month, resumed);
    } catch (error) {
      if (!(error instanceof RequestError) || error.status !== 404) {
        setMessage(error instanceof Error ? error.message : 'Unable to load setup');
        return;
      }
      try {
        const created = await call<Budget>('/api/v1/budgets', { method: 'POST' });
        adoptBudget(created);
        setMessage('Budget started. Complete setup to unlock budgeting.');
      } catch (createError) {
        setMessage(createError instanceof Error ? createError.message : 'Unable to start setup');
      }
    }
  };

  const saveSetup = async (event: FormEvent) => {
    event.preventDefault();
    if (!budget) return;
    try {
      const saved = await call<Budget>(`/api/v1/budgets/${budget.id}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          openingBalanceMinor: opening === '' ? undefined : Number(opening),
          accountName,
          accountType: 'checking',
          categories: categoryNames.split(','),
        }),
      });
      setBudget(saved);
      setMessage(saved.setupStep === 'COMPLETE' ? 'Setup complete. Your budget is ready.' : 'Setup saved. Resume when ready.');
      if (saved.setupStep === 'COMPLETE') await refresh(month, saved);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save setup');
    }
  };

  const runCommand = async (work: () => Promise<CommandResult>, success: string) => {
    try {
      const result = await work();
      setBudget(current => current ? { ...current, version: result.version } : current);
      setMessage(success);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to update budget');
    }
  };

  const recordIncome = (event: FormEvent) => {
    event.preventDefault();
    runCommand(
      () => command(`/api/v1/budgets/${budget!.id}/income`, {
        amountMinor: Number(incomeAmount),
        ...(selectedAccountId ? { accountId: selectedAccountId } : {}),
        ...(incomeDate ? { date: incomeDate } : {}),
        payee: incomePayee || null,
        memo: incomeMemo || null,
      }).then(result => { setLatestIncome(result); return result; }),
      'Income recorded. Release it explicitly before assigning it.',
    );
  };

  const releaseIncome = () => latestIncome && runCommand(
    () => command(`/api/v1/budgets/${budget!.id}/income/${latestIncome.id}/release`, {}),
    'Income released and ready to assign.',
  );

  const recordSpending = (event: FormEvent) => {
    event.preventDefault();
    runCommand(
      () => command(`/api/v1/budgets/${budget!.id}/spending`, {
        amountMinor: Number(spendingAmount),
        categoryId: spendingCategoryId,
        ...(selectedAccountId ? { accountId: selectedAccountId } : {}),
        ...(spendingDate ? { date: spendingDate } : {}),
        payee: spendingPayee || null,
        memo: spendingMemo || null,
      }),
      'Spending recorded.',
    );
  };

  const assign = (event: FormEvent) => {
    event.preventDefault();
    runCommand(() => command(`/api/v1/budgets/${budget!.id}/allocations`, {
      categoryId: assignCategoryId,
      amountMinor: Number(assignAmount),
      month,
    }), 'Money assigned.');
  };

  const unassign = (event: FormEvent) => {
    event.preventDefault();
    runCommand(() => command(`/api/v1/budgets/${budget!.id}/allocations/unassign`, {
      categoryId: unassignCategoryId,
      amountMinor: Number(unassignAmount),
      month,
    }), 'Money unassigned.');
  };

  const move = (event: FormEvent) => {
    event.preventDefault();
    runCommand(() => command(`/api/v1/budgets/${budget!.id}/allocations/move`, {
      sourceCategoryId: moveSourceId,
      destinationCategoryId: moveDestinationId,
      amountMinor: Number(moveAmount),
      month,
    }), 'Money moved.');
  };

  const createAccount = (event: FormEvent) => {
    event.preventDefault();
    runCommand(() => command(`/api/v1/budgets/${budget!.id}/accounts`, {
      name: newAccountName,
      kind: newAccountKind,
      ...(newAccountOpening ? { openingBalanceMinor: Number(newAccountOpening) } : {}),
    }), 'Account created.').then(() => {
      setNewAccountName('');
      setNewAccountOpening('');
      setAccountFormOpen(false);
    });
  };

  const archiveAccount = (account: Budget['accounts'][number]) => runCommand(
    () => command(`/api/v1/budgets/${budget!.id}/accounts/${account.id}/archive`, {}),
    'Account archived.',
  );

  const recordTransfer = (event: FormEvent) => {
    event.preventDefault();
    runCommand(() => command(`/api/v1/budgets/${budget!.id}/transfers`, {
      sourceAccountId: transferSourceId,
      destinationAccountId: transferDestinationId,
      amountMinor: Number(transferAmount),
      date: transferDate,
      payee: transferPayee || null,
      memo: transferMemo || null,
    }), 'Transfer recorded.');
  };

  const exportCsv = async () => {
    if (!budget) return;
    try {
      const response = await fetch(`/api/v1/budgets/${budget.id}/transactions/export`, { credentials: 'include' });
      if (!response.ok) {
        const result = await response.json() as { error?: { message?: string } };
        throw new RequestError(result.error?.message || 'CSV export failed', response.status);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'transactions.csv';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setMessage('CSV exported.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to export CSV');
    }
  };

  const importCsv = async (event: FormEvent) => {
    event.preventDefault();
    if (!budget || !csvFile) return;
    if (csvFile.size > 10_485_760) {
      setCsvDiagnostics([{ row: 0, field: 'file', code: 'FILE_TOO_LARGE', message: 'CSV must not exceed 10 MiB' }]);
      setMessage('CSV is too large.');
      return;
    }
    try {
      const response = await fetch(`/api/v1/budgets/${budget.id}/transactions/import`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'Idempotency-Key': crypto.randomUUID(),
          'If-Match': `W/"${budget.version}"`,
        },
        body: csvFile,
      });
      const result = await response.json() as {
        data?: CsvImportResult;
        error?: { message?: string; details?: { diagnostics?: CsvDiagnostic[] } };
      };
      if (!response.ok) {
        setCsvDiagnostics(result.error?.details?.diagnostics ?? []);
        throw new RequestError(result.error?.message || 'CSV import failed', response.status);
      }
      const imported = result.data!;
      setCsvDiagnostics(imported.diagnostics);
      setBudget(current => current ? { ...current, version: imported.version } : current);
      setMessage(`Imported ${imported.accepted} CSV rows.`);
      setCsvFile(null);
      await refresh();
      await loadHistory();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to import CSV');
    }
  };

  const signOut = async () => {
    try {
      await call('/api/v1/auth/sign-out', { method: 'POST' });
      setBudget(null);
      setSummary(null);
      setHistory(null);
      setCsvFile(null);
      setCsvDiagnostics([]);
      setMessage('Signed out.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to sign out');
    }
  };

  const activeCategories = budget?.categories.filter(category => !category.archived) ?? [];
  const activeAccounts = budget?.accounts.filter(account => !account.archived) ?? [];

  const loadHistory = async (targetMonth = historyMonth) => {
    if (!budget) return;
    try {
      const params = new URLSearchParams();
      for (const [key, value] of [
        ['month', targetMonth],
        ['account', historyAccount],
        ['kind', historyKind],
        ['category', historyCategory],
        ['from', historyFrom],
        ['to', historyTo],
        ['q', historyQuery],
      ]) if (value) params.set(key, value);
      const result = await call<HistoryResponse>(`/api/v1/budgets/${budget.id}/transactions${params.toString() ? `?${params}` : ''}`);
      setHistory(result);
      setBudget(current => current ? { ...current, version: result.version } : current);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load transaction history');
    }
  };

  const beginHistoryEdit = (item: HistoryItem) => {
    setEditingId(item.transactionId);
    setEditAmount(String(item.amountMinor));
    setEditDate(item.date);
    setEditCategory('');
    setEditPayee(item.payee ?? '');
    setEditMemo(item.memo ?? '');
    setDeletingId(null);
  };

  const saveHistoryEdit = async (event: FormEvent, item: HistoryItem) => {
    event.preventDefault();
    if (!budget) return;
    try {
      const result = await call<HistoryMutation>(`/api/v1/budgets/${budget.id}/transactions/${item.transactionId}`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          'Idempotency-Key': crypto.randomUUID(),
          'If-Match': `W/"${budget.version}"`,
        },
        body: JSON.stringify({
          amountMinor: Number(editAmount),
          date: editDate,
          payee: editPayee || null,
          memo: editMemo || null,
          ...(item.kind === 'SPENDING' && editCategory ? { categoryId: editCategory } : {}),
        }),
      });
      setBudget(current => current ? { ...current, version: result.version } : current);
      setEditingId(null);
      setMessage('Transaction updated.');
      await refresh(month);
      await loadHistory();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to update transaction');
    }
  };

  const confirmHistoryDelete = async (event: FormEvent, item: HistoryItem) => {
    event.preventDefault();
    if (!budget) return;
    try {
      const result = await call<HistoryMutation>(`/api/v1/budgets/${budget.id}/transactions/${item.transactionId}`, {
        method: 'DELETE',
        headers: {
          'content-type': 'application/json',
          'Idempotency-Key': crypto.randomUUID(),
          'If-Match': `W/"${budget.version}"`,
        },
        body: JSON.stringify({ confirmed: true, ...(deleteReason ? { reason: deleteReason } : {}) }),
      });
      setBudget(current => current ? { ...current, version: result.version } : current);
      setDeletingId(null);
      setDeleteReason('');
      setMessage('Transaction deleted.');
      await refresh(month);
      await loadHistory();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to delete transaction');
    }
  };

  return {
    email, setEmail, password, setPassword, budget, summary, month, setMonth, opening, setOpening,
    accountName, setAccountName, selectedAccountId, setSelectedAccountId, newAccountName, setNewAccountName,
    newAccountKind, setNewAccountKind, newAccountOpening, setNewAccountOpening, transferSourceId, setTransferSourceId,
    transferDestinationId, setTransferDestinationId, transferAmount, setTransferAmount, transferDate, setTransferDate,
    transferPayee, setTransferPayee, transferMemo, setTransferMemo, categoryNames, setCategoryNames, incomeAmount,
    setIncomeAmount, incomePayee, setIncomePayee, incomeMemo, setIncomeMemo, spendingAmount, setSpendingAmount,
    spendingPayee, setSpendingPayee, spendingMemo, setSpendingMemo, assignAmount, setAssignAmount, unassignAmount,
    setUnassignAmount, moveAmount, setMoveAmount, incomeDate, setIncomeDate, spendingDate, setSpendingDate,
    spendingCategoryId, setSpendingCategoryId, assignCategoryId, setAssignCategoryId, unassignCategoryId,
    setUnassignCategoryId, moveSourceId, setMoveSourceId, moveDestinationId, setMoveDestinationId, latestIncome, message,
    history, historyMonth, setHistoryMonth, historyAccount, setHistoryAccount, historyKind, setHistoryKind,
    historyCategory, setHistoryCategory, historyFrom, setHistoryFrom, historyTo, setHistoryTo, historyQuery,
    setHistoryQuery, editingId, setEditingId, editAmount, setEditAmount, editDate, setEditDate, editCategory, setEditCategory,
    editPayee, setEditPayee, editMemo, setEditMemo, deletingId, setDeletingId, deleteReason, setDeleteReason,
    accountFormOpen, setAccountFormOpen, csvFile, setCsvFile, csvDiagnostics, setCsvDiagnostics, activeCategories,
    activeAccounts, authenticate, startOrResume, saveSetup, refresh, recordIncome, releaseIncome, recordSpending,
    assign, unassign, move, createAccount, archiveAccount, recordTransfer, exportCsv, importCsv, signOut, loadHistory,
    beginHistoryEdit, saveHistoryEdit, confirmHistoryDelete,
  };
}

export type BudgetAppController = ReturnType<typeof useBudgetApp>;
