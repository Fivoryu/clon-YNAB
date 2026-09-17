'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  Account,
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

type SessionStatus = 'checking' | 'guest' | 'setup' | 'ready';
export type Notice = { kind: 'success' | 'error' | 'info'; text: string } | null;
export type HistoryFilters = { month?: string; account?: string; kind?: HistoryKind; category?: string; from?: string; to?: string; q?: string };

class RequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

const currentMonth = () => new Date().toISOString().slice(0, 7);
const today = () => new Date().toISOString().slice(0, 10);

async function apiCall<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, { credentials: 'include', ...options });
  const result = await response.json() as { data?: T; error?: { message?: string } };
  if (!response.ok) throw new RequestError(result.error?.message || 'No se pudo completar la solicitud.', response.status);
  return result.data as T;
}

export function useBudgetApp() {
  const [status, setStatus] = useState<SessionStatus>('checking');
  const [budget, setBudget] = useState<Budget | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [month, setMonthState] = useState(currentMonth);
  const [history, setHistory] = useState<HistoryResponse | null>(null);
  const [historyFilters, setHistoryFilters] = useState<HistoryFilters>({});
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);
  const [csvDiagnostics, setCsvDiagnostics] = useState<CsvDiagnostic[]>([]);
  const [pendingIncomes, setPendingIncomes] = useState<(HistoryItem & { kind: 'INCOME'; state: 'ELIGIBLE' | 'PROTECTED' })[]>([]);

  const adoptBudget = useCallback((next: Budget) => {
    setBudget(next);
    setStatus(next.setupStep === 'COMPLETE' ? 'ready' : 'setup');
  }, []);

  const ensureBudget = useCallback(async () => {
    try {
      const resumed = await apiCall<Budget>('/api/v1/budgets');
      adoptBudget(resumed);
      return resumed;
    } catch (error) {
      if (!(error instanceof RequestError) || error.status !== 404) throw error;
      const created = await apiCall<Budget>('/api/v1/budgets', { method: 'POST' });
      adoptBudget(created);
      return created;
    }
  }, [adoptBudget]);

  const readSummary = useCallback(async (targetBudget: Budget, targetMonth: string) => {
    if (targetBudget.setupStep !== 'COMPLETE') return null;
    const result = await apiCall<Summary>(`/api/v1/budgets/${targetBudget.id}/summary?month=${encodeURIComponent(targetMonth)}`);
    setSummary(result);
    return result;
  }, []);

  const readHistory = useCallback(async (targetBudget: Budget, filters: HistoryFilters = {}) => {
    if (targetBudget.setupStep !== 'COMPLETE') return null;
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
    const result = await apiCall<HistoryResponse>(`/api/v1/budgets/${targetBudget.id}/transactions${params.toString() ? `?${params}` : ''}`);
    setHistory(result);
    setBudget(current => current ? { ...current, version: result.version } : current);
    return result;
  }, []);


  const readPendingIncomes = useCallback(async (targetBudget: Budget) => {
    if (targetBudget.setupStep !== 'COMPLETE') return [];
    const result = await apiCall<HistoryResponse>(`/api/v1/budgets/${targetBudget.id}/transactions?kind=INCOME`);
    const pending = result.items.filter((item): item is HistoryItem & { kind: 'INCOME'; state: 'ELIGIBLE' | 'PROTECTED' } => item.kind === 'INCOME' && item.state === 'ELIGIBLE');
    setPendingIncomes(pending);
    return pending;
  }, []);

  const sync = useCallback(async (targetBudget = budget, targetMonth = month, filters = historyFilters) => {
    if (!targetBudget || targetBudget.setupStep !== 'COMPLETE') return;
    const latest = await apiCall<Budget>(`/api/v1/budgets/${targetBudget.id}`);
    setBudget(latest);
    await Promise.all([readSummary(latest, targetMonth), readHistory(latest, filters), readPendingIncomes(latest)]);
  }, [budget, historyFilters, month, readHistory, readPendingIncomes, readSummary]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const resumed = await apiCall<Budget>('/api/v1/budgets');
        if (!active) return;
        adoptBudget(resumed);
        if (resumed.setupStep === 'COMPLETE') {
          await Promise.all([readSummary(resumed, currentMonth()), readHistory(resumed, {}), readPendingIncomes(resumed)]);
        }
      } catch (error) {
        if (!active) return;
        if (error instanceof RequestError && error.status === 401) {
          setStatus('guest');
          return;
        }
        if (error instanceof RequestError && error.status === 404) {
          try {
            const created = await apiCall<Budget>('/api/v1/budgets', { method: 'POST' });
            if (active) adoptBudget(created);
          } catch (nested) {
            if (nested instanceof RequestError && nested.status === 401) setStatus('guest');
            else setNotice({ kind: 'error', text: nested instanceof Error ? nested.message : 'No se pudo iniciar el presupuesto.' });
          }
          return;
        }
        setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'No se pudo recuperar la sesión.' });
        setStatus('guest');
      }
    })();
    return () => { active = false; };
  }, [adoptBudget, readHistory, readPendingIncomes, readSummary]);

  const authenticate = async (email: string, password: string, mode: 'login' | 'register') => {
    setBusy(true); setNotice(null);
    try {
      if (mode === 'register') {
        await apiCall('/api/v1/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
      }
      await apiCall('/api/v1/auth/sign-in', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
      const next = await ensureBudget();
      if (next.setupStep === 'COMPLETE') await Promise.all([readSummary(next, month), readHistory(next, {}), readPendingIncomes(next)]);
      setNotice({ kind: 'success', text: mode === 'register' ? 'Cuenta creada. Ya puedes preparar tu presupuesto.' : 'Sesión iniciada.' });
      return next;
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'No se pudo iniciar sesión.' });
      return null;
    } finally { setBusy(false); }
  };

  const signOut = async () => {
    setBusy(true);
    try {
      await apiCall('/api/v1/auth/sign-out', { method: 'POST' });
      setBudget(null); setSummary(null); setHistory(null); setPendingIncomes([]); setHistoryFilters({}); setStatus('guest');
      setNotice({ kind: 'info', text: 'Sesión cerrada.' });
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'No se pudo cerrar la sesión.' });
    } finally { setBusy(false); }
  };

  const saveSetupAccount = async (input: { accountName: string; accountType: 'cash' | 'checking'; openingBalanceMinor: number }) => {
    if (!budget) return null;
    setBusy(true); setNotice(null);
    try {
      const saved = await apiCall<Budget>(`/api/v1/budgets/${budget.id}`, {
        method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input),
      });
      adoptBudget(saved); setNotice({ kind: 'success', text: 'Cuenta principal guardada.' }); return saved;
    } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'No se pudo guardar la cuenta.' }); return null; }
    finally { setBusy(false); }
  };

  const saveSetupCategories = async (categories: string[]) => {
    if (!budget) return null;
    setBusy(true); setNotice(null);
    try {
      const saved = await apiCall<Budget>(`/api/v1/budgets/${budget.id}`, {
        method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ categories }),
      });
      adoptBudget(saved);
      if (saved.setupStep === 'COMPLETE') await Promise.all([readSummary(saved, month), readHistory(saved, {}), readPendingIncomes(saved)]);
      setNotice({ kind: 'success', text: 'Presupuesto listo para usar.' }); return saved;
    } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'No se pudieron guardar las categorías.' }); return null; }
    finally { setBusy(false); }
  };

  const financialCommand = async <T extends { version: number }>(url: string, body: unknown, success: string, method = 'POST'): Promise<T | null> => {
    if (!budget) return null;
    setBusy(true); setNotice(null);
    try {
      const result = await apiCall<T>(url, {
        method,
        headers: { 'content-type': 'application/json', 'Idempotency-Key': crypto.randomUUID(), 'If-Match': `W/"${budget.version}"` },
        body: JSON.stringify(body),
      });
      setBudget(current => current ? { ...current, version: result.version } : current);
      setNotice({ kind: 'success', text: success });
      await sync({ ...budget, version: result.version }, month, historyFilters);
      return result;
    } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'No se pudo actualizar el presupuesto.' }); return null; }
    finally { setBusy(false); }
  };

  const setMonth = async (nextMonth: string) => {
    setMonthState(nextMonth);
    if (budget?.setupStep === 'COMPLETE') {
      setBusy(true);
      try { await readSummary(budget, nextMonth); }
      catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'No se pudo cambiar de mes.' }); }
      finally { setBusy(false); }
    }
  };

  const assign = (categoryId: string, amountMinor: number) => financialCommand<CommandResult>(`/api/v1/budgets/${budget!.id}/allocations`, { categoryId, amountMinor, month }, 'Dinero asignado.');
  const unassign = (categoryId: string, amountMinor: number) => financialCommand<CommandResult>(`/api/v1/budgets/${budget!.id}/allocations/unassign`, { categoryId, amountMinor, month }, 'Asignación reducida.');
  const move = (sourceCategoryId: string, destinationCategoryId: string, amountMinor: number) => financialCommand<CommandResult>(`/api/v1/budgets/${budget!.id}/allocations/move`, { sourceCategoryId, destinationCategoryId, amountMinor, month }, 'Dinero movido.');

  const recordIncome = (input: { accountId: string; amountMinor: number; date?: string; payee?: string | null; memo?: string | null }) => financialCommand<CommandResult>(`/api/v1/budgets/${budget!.id}/income`, input, 'Ingreso registrado. Falta liberarlo para poder asignarlo.');
  const recordSpending = (input: { accountId: string; categoryId: string; amountMinor: number; date?: string; payee?: string | null; memo?: string | null }) => financialCommand<CommandResult>(`/api/v1/budgets/${budget!.id}/spending`, input, 'Gasto registrado.');
  const recordTransfer = (input: { sourceAccountId: string; destinationAccountId: string; amountMinor: number; date: string; payee?: string | null; memo?: string | null }) => financialCommand<CommandResult>(`/api/v1/budgets/${budget!.id}/transfers`, input, 'Transferencia registrada.');
  const releaseIncome = (incomeId: string) => financialCommand<CommandResult>(`/api/v1/budgets/${budget!.id}/income/${incomeId}/release`, {}, 'Ingreso liberado y disponible para asignar.');

  const createAccount = (input: { name: string; kind: 'cash' | 'checking'; openingBalanceMinor?: number }) => financialCommand<{ version: number; account: Account }>(`/api/v1/budgets/${budget!.id}/accounts`, input, 'Cuenta creada.');
  const renameAccount = (accountId: string, name: string) => financialCommand<{ version: number; account: Account }>(`/api/v1/budgets/${budget!.id}/accounts/${accountId}`, { name }, 'Cuenta renombrada.', 'PATCH');
  const archiveAccount = (accountId: string) => financialCommand<{ version: number; account: Account }>(`/api/v1/budgets/${budget!.id}/accounts/${accountId}/archive`, {}, 'Cuenta archivada.');

  const categoryMutation = async (url: string, options: RequestInit, success: string) => {
    if (!budget) return null;
    setBusy(true); setNotice(null);
    try {
      const next = await apiCall<Budget>(url, options); adoptBudget(next); setNotice({ kind: 'success', text: success }); await readSummary(next, month); return next;
    } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'No se pudo actualizar la categoría.' }); return null; }
    finally { setBusy(false); }
  };
  const createCategory = (name: string) => categoryMutation(`/api/v1/budgets/${budget!.id}/categories`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) }, 'Categoría creada.');
  const renameCategory = (categoryId: string, name: string) => categoryMutation(`/api/v1/budgets/${budget!.id}/categories/${categoryId}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) }, 'Categoría renombrada.');
  const archiveCategory = (categoryId: string) => categoryMutation(`/api/v1/budgets/${budget!.id}/categories/${categoryId}/archive`, { method: 'POST' }, 'Categoría archivada.');

  const applyHistoryFilters = async (filters: HistoryFilters) => {
    setHistoryFilters(filters);
    if (!budget) return;
    setBusy(true);
    try { await readHistory(budget, filters); }
    catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'No se pudo cargar el historial.' }); }
    finally { setBusy(false); }
  };

  const editTransaction = (item: HistoryItem, input: { amountMinor: number; date: string; categoryId?: string; payee?: string | null; memo?: string | null }) => financialCommand<HistoryMutation>(`/api/v1/budgets/${budget!.id}/transactions/${item.transactionId}`, input, 'Transacción actualizada.', 'PATCH');
  const deleteTransaction = (item: HistoryItem, reason?: string) => financialCommand<HistoryMutation>(`/api/v1/budgets/${budget!.id}/transactions/${item.transactionId}`, { confirmed: true, ...(reason ? { reason } : {}) }, 'Transacción eliminada.', 'DELETE');

  const exportCsv = async () => {
    if (!budget) return;
    setBusy(true); setNotice(null);
    try {
      const response = await fetch(`/api/v1/budgets/${budget.id}/transactions/export`, { credentials: 'include' });
      if (!response.ok) { const result = await response.json() as { error?: { message?: string } }; throw new RequestError(result.error?.message || 'No se pudo exportar el CSV.', response.status); }
      const blob = await response.blob(); const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
      anchor.href = url; anchor.download = 'transactions.csv'; document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
      setNotice({ kind: 'success', text: 'CSV exportado.' });
    } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'No se pudo exportar el CSV.' }); }
    finally { setBusy(false); }
  };

  const importCsv = async (file: File) => {
    if (!budget) return null;
    if (file.size > 10_485_760) { setCsvDiagnostics([{ row: 0, field: 'file', code: 'FILE_TOO_LARGE', message: 'El CSV no puede superar 10 MiB.' }]); setNotice({ kind: 'error', text: 'El archivo es demasiado grande.' }); return null; }
    setBusy(true); setNotice(null); setCsvDiagnostics([]);
    try {
      const response = await fetch(`/api/v1/budgets/${budget.id}/transactions/import`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'text/csv; charset=utf-8', 'Idempotency-Key': crypto.randomUUID(), 'If-Match': `W/"${budget.version}"` }, body: file });
      const result = await response.json() as { data?: CsvImportResult; error?: { message?: string; details?: { diagnostics?: CsvDiagnostic[] } } };
      if (!response.ok) { setCsvDiagnostics(result.error?.details?.diagnostics ?? []); throw new RequestError(result.error?.message || 'No se pudo importar el CSV.', response.status); }
      const imported = result.data!; setCsvDiagnostics(imported.diagnostics); setBudget(current => current ? { ...current, version: imported.version } : current);
      setNotice({ kind: 'success', text: `Se importaron ${imported.accepted} transacciones.` }); await sync({ ...budget, version: imported.version }); return imported;
    } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'No se pudo importar el CSV.' }); return null; }
    finally { setBusy(false); }
  };

  const activeCategories = useMemo(() => budget?.categories.filter(category => !category.archived) ?? [], [budget]);
  const activeAccounts = useMemo(() => budget?.accounts.filter(account => !account.archived) ?? [], [budget]);

  return {
    status, budget, summary, month, history, historyFilters, notice, setNotice, busy, csvDiagnostics,
    activeCategories, activeAccounts, pendingIncomes, today: today(),
    authenticate, signOut, saveSetupAccount, saveSetupCategories, setMonth, refresh: sync,
    assign, unassign, move, recordIncome, recordSpending, recordTransfer, releaseIncome,
    createAccount, renameAccount, archiveAccount, createCategory, renameCategory, archiveCategory,
    applyHistoryFilters, editTransaction, deleteTransaction, exportCsv, importCsv,
  };
}

export type BudgetAppController = ReturnType<typeof useBudgetApp>;
