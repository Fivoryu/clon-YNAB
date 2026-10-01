'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  Account,
  AccountHistoryState,
  Budget,
  CategoryTargetInput,
  CommandResult,
  CsvDiagnostic,
  CsvImportResult,
  HistoryItem,
  HistoryKind,
  HistoryMutation,
  HistoryResponse,
  MonthlyReportProjection,
  MonthlyReportState,
  MultiMonthReport,
  MultiMonthReportState,
  Summary,
  ScheduleGenerationInput,
  ScheduleGenerationResult,
  ScheduleInput,
  ScheduleListResult,
  ScheduleRemoveResult,
  ScheduleResult,
} from '../models';
import { appendAccountHistoryPage, isCurrentAccountHistoryPageRequest, isReportMonth, isReportRange, markAccountHistoryAppendError, reportRangeError } from '../models';

type SessionStatus = 'checking' | 'guest' | 'setup' | 'ready';
export type Notice = { kind: 'success' | 'error' | 'info'; text: string } | null;
export type HistoryFilters = { month?: string; account?: string; kind?: HistoryKind; category?: string; from?: string; to?: string; q?: string };

class RequestError extends Error {
  constructor(message: string, readonly status: number, readonly details?: unknown) {
    super(message);
  }
}

const currentMonth = () => new Date().toISOString().slice(0, 7);
const today = () => new Date().toISOString().slice(0, 10);

async function apiCall<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, { credentials: 'include', ...options });
  const result = await response.json() as { data?: T; error?: { message?: string; details?: unknown } };
  if (!response.ok) throw new RequestError(result.error?.message || 'No se pudo completar la solicitud.', response.status, result.error?.details);
  return result.data as T;
}

export function useBudgetApp() {
  const [status, setStatus] = useState<SessionStatus>('checking');
  const [budget, setBudget] = useState<Budget | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [month, setMonthState] = useState(currentMonth);
  const [history, setHistory] = useState<HistoryResponse | null>(null);
  const [accountHistory, setAccountHistory] = useState<AccountHistoryState | null>(null);
  const accountHistoryRequestId = useRef(0);
  const [report, setReport] = useState<MonthlyReportState | null>(null);
  const reportRequestId = useRef(0);
  const [reportRange, setReportRange] = useState<MultiMonthReportState | null>(null);
  const reportRangeRequestId = useRef(0);
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

  const readSchedules = useCallback(async () => {
    if (!budget?.id || budget.setupStep !== 'COMPLETE') return null;
    try {
      const result = await apiCall<ScheduleListResult>(`/api/v1/budgets/${budget.id}/schedules`);
      setBudget(current => current ? { ...current, version: result.version } : current);
      return result;
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'No se pudieron cargar los movimientos periódicos.' });
      return null;
    }
  }, [budget?.id, budget?.setupStep]);

  const readAccountHistory = useCallback(async (accountId: string) => {
    const budgetId = budget?.id;
    if (!budgetId || budget?.setupStep !== 'COMPLETE') return null;
    const requestId = ++accountHistoryRequestId.current;
    const initial: AccountHistoryState = {
      accountId, items: [], version: 0, nextCursor: null, loading: true, appending: false, error: null, errorKind: null,
    };
    setAccountHistory(initial);
    const params = new URLSearchParams({ account: accountId });
    try {
      const result = await apiCall<HistoryResponse>(`/api/v1/budgets/${budgetId}/transactions?${params}`);
      if (requestId !== accountHistoryRequestId.current) return null;
      setAccountHistory({ ...initial, items: result.items, version: result.version, nextCursor: result.nextCursor, loading: false });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo cargar la actividad de esta cuenta.';
      setAccountHistory(current => requestId === accountHistoryRequestId.current
        ? { ...initial, loading: false, error: message, errorKind: 'initial' }
        : current);
      return null;
    }
  }, [budget?.id, budget?.setupStep]);

  const loadMoreAccountHistory = useCallback(async (accountId: string) => {
    const budgetId = budget?.id;
    const current = accountHistory;
    const cursor = current?.nextCursor;
    if (!budgetId || !current || current.accountId !== accountId || current.version === null || !cursor || current.appending || current.loading) return null;
    const requestId = accountHistoryRequestId.current;
    setAccountHistory(snapshot => snapshot && isCurrentAccountHistoryPageRequest(snapshot, accountId, cursor, requestId, accountHistoryRequestId.current)
      ? { ...snapshot, appending: true, error: null, errorKind: null }
      : snapshot);
    const params = new URLSearchParams({ account: accountId, cursor });
    try {
      const result = await apiCall<HistoryResponse>(`/api/v1/budgets/${budgetId}/transactions?${params}`);
      if (requestId !== accountHistoryRequestId.current) return null;
      setAccountHistory(snapshot => {
        if (!snapshot || !isCurrentAccountHistoryPageRequest(snapshot, accountId, cursor, requestId, accountHistoryRequestId.current)) return snapshot;
        const appended = appendAccountHistoryPage(snapshot, accountId, cursor, result);
        if (!appended) return markAccountHistoryAppendError(snapshot, 'El historial cambió. Reinícialo para cargar la actividad actualizada.', true);
        return { ...appended, loading: false, appending: false, error: null, errorKind: null };
      });
      return result;
    } catch (error) {
      if (requestId !== accountHistoryRequestId.current) return null;
      const stale = error instanceof RequestError && error.status === 409;
      const message = stale
        ? 'El historial cambió. Reinícialo para cargar la actividad actualizada.'
        : error instanceof Error ? error.message : 'No se pudo cargar más actividad.';
      setAccountHistory(snapshot => snapshot && isCurrentAccountHistoryPageRequest(snapshot, accountId, cursor, requestId, accountHistoryRequestId.current)
        ? markAccountHistoryAppendError(snapshot, message, stale)
        : snapshot);
      return null;
    }
  }, [accountHistory, budget?.id]);

  const retryAccountHistory = useCallback((accountId: string) => (
    accountHistory?.accountId === accountId && accountHistory.errorKind === 'append'
      ? loadMoreAccountHistory(accountId)
      : readAccountHistory(accountId)
  ), [accountHistory, loadMoreAccountHistory, readAccountHistory]);

  const readMonthlyReport = useCallback(async (month: string) => {
    const budgetId = budget?.id;
    if (!budgetId || budget?.setupStep !== 'COMPLETE') return null;
    const requestedMonth = month.trim();
    const requestId = ++reportRequestId.current;
    reportRangeRequestId.current += 1;
    if (!isReportMonth(requestedMonth)) {
      const invalid: MonthlyReportState = { month: requestedMonth, projection: null, loading: false, error: 'Elige un mes válido en formato AAAA-MM.', errorKind: 'invalid-month' };
      setReport(invalid);
      return invalid;
    }
    const loading: MonthlyReportState = { month: requestedMonth, projection: null, loading: true, error: null, errorKind: null };
    setReport(loading);
    try {
      const projection = await apiCall<MonthlyReportProjection>(`/api/v1/budgets/${budgetId}/reports/monthly?month=${encodeURIComponent(requestedMonth)}`);
      if (requestId !== reportRequestId.current) return null;
      const loaded: MonthlyReportState = { month: requestedMonth, projection, loading: false, error: null, errorKind: null };
      setReport(loaded);
      return loaded;
    } catch (error) {
      if (requestId !== reportRequestId.current) return null;
      const message = error instanceof Error ? error.message : 'No se pudo cargar el reporte del mes.';
      const failed: MonthlyReportState = { month: requestedMonth, projection: null, loading: false, error: message, errorKind: 'initial' };
      setReport(failed);
      return failed;
    }
  }, [budget?.id, budget?.setupStep]);

  const readReportRange = useCallback(async (from: string, to: string) => {
    const budgetId = budget?.id;
    if (!budgetId || budget?.setupStep !== 'COMPLETE') return null;
    const requestedFrom = from.trim();
    const requestedTo = to.trim();
    const requestId = ++reportRangeRequestId.current;
    reportRequestId.current += 1;
    if (!isReportRange(requestedFrom, requestedTo)) {
      const invalid: MultiMonthReportState = { from: requestedFrom, to: requestedTo, report: null, loading: false, error: reportRangeError(requestedFrom, requestedTo) ?? 'Elige un rango válido.', errorKind: 'invalid-range' };
      setReportRange(invalid);
      return invalid;
    }
    const loading: MultiMonthReportState = { from: requestedFrom, to: requestedTo, report: null, loading: true, error: null, errorKind: null };
    setReportRange(loading);
    try {
      const report = await apiCall<MultiMonthReport>(`/api/v1/budgets/${budgetId}/reports/monthly?from=${encodeURIComponent(requestedFrom)}&to=${encodeURIComponent(requestedTo)}`);
      if (requestId !== reportRangeRequestId.current) return null;
      const loaded: MultiMonthReportState = { from: requestedFrom, to: requestedTo, report, loading: false, error: null, errorKind: null };
      setReportRange(loaded);
      return loaded;
    } catch (error) {
      if (requestId !== reportRangeRequestId.current) return null;
      const message = error instanceof Error ? error.message : 'No se pudo cargar el reporte del rango.';
      const failed: MultiMonthReportState = { from: requestedFrom, to: requestedTo, report: null, loading: false, error: message, errorKind: 'initial' };
      setReportRange(failed);
      return failed;
    }
  }, [budget?.id, budget?.setupStep]);

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
      accountHistoryRequestId.current += 1; reportRequestId.current += 1; reportRangeRequestId.current += 1;
      setBudget(null); setSummary(null); setHistory(null); setAccountHistory(null); setReport(null); setReportRange(null); setPendingIncomes([]); setHistoryFilters({}); setStatus('guest');
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
  const scheduleCommand = async <T extends { version: number }>(url: string, method: 'POST' | 'DELETE', body: unknown, success: (result: T) => string): Promise<T | null> => {
    if (!budget) return null;
    setBusy(true); setNotice(null);
    try {
      const result = await apiCall<T>(url, {
        method,
        headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), 'Idempotency-Key': crypto.randomUUID(), 'If-Match': `W/"${budget.version}"` },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      setBudget(current => current ? { ...current, version: result.version } : current);
      setNotice({ kind: 'success', text: success(result) });
      await sync({ ...budget, version: result.version }, month, historyFilters);
      return result;
    } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'No se pudo completar la acción.' }); return null; }
    finally { setBusy(false); }
  };

  const createSchedule = (input: ScheduleInput) => scheduleCommand<ScheduleResult>(`/api/v1/budgets/${budget!.id}/schedules`, 'POST', input, () => 'Movimiento periódico guardado.');
  const removeSchedule = (scheduleId: string) => scheduleCommand<ScheduleRemoveResult>(`/api/v1/budgets/${budget!.id}/schedules/${scheduleId}`, 'DELETE', undefined, () => 'Movimiento periódico eliminado.');
  const generateSchedules = (input: ScheduleGenerationInput) => scheduleCommand<ScheduleGenerationResult>(`/api/v1/budgets/${budget!.id}/schedules/generate`, 'POST', input, result => `Se registraron ${result.created} movimiento${result.created === 1 ? '' : 's'} y ${result.replayed} movimiento${result.replayed === 1 ? '' : 's'} ya estaban en el historial.`);

  const changeCategoryTarget = async (categoryId: string, target: CategoryTargetInput | null) => {
    if (!budget) return null;
    setBusy(true); setNotice(null);
    try {
      const result = await apiCall<{ version: number }>(`/api/v1/budgets/${budget.id}/categories/${categoryId}/target`, {
        method: target ? 'PUT' : 'DELETE',
        headers: { ...(target ? { 'content-type': 'application/json' } : {}), 'Idempotency-Key': crypto.randomUUID(), 'If-Match': `W/"${budget.version}"` },
        ...(target ? { body: JSON.stringify(target) } : {}),
      });
      setBudget(current => current ? { ...current, version: result.version } : current);
      setNotice({ kind: 'success', text: target ? 'Objetivo actualizado.' : 'Objetivo eliminado.' });
      await sync({ ...budget, version: result.version }, month, historyFilters);
      return result;
    } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'No se pudo actualizar el objetivo.' }); return null; }
    finally { setBusy(false); }
  };

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
  const setTransactionCleared = async (item: HistoryItem, cleared: boolean, accountId: string) => {
    const result = await financialCommand<HistoryMutation>(`/api/v1/budgets/${budget!.id}/transactions/${item.transactionId}/cleared`, { cleared }, cleared ? 'Movimiento marcado.' : 'Marca retirada.', 'PATCH');
    if (result) await readAccountHistory(accountId);
    return result;
  };
  const reconcileAccount = async (accountId: string, input: { confirmedClearedBalanceMinor: number; confirmAdjustment: boolean; reason?: string }) => {
    if (!budget) return null;
    setBusy(true); setNotice(null);
    try {
      const result = await apiCall<{ version: number }>(`/api/v1/budgets/${budget.id}/accounts/${accountId}/reconciliation`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'Idempotency-Key': crypto.randomUUID(), 'If-Match': `W/"${budget.version}"` },
        body: JSON.stringify(input),
      });
      setBudget(current => current ? { ...current, version: result.version } : current);
      setNotice({ kind: 'success', text: 'Conciliación completada.' });
      await sync({ ...budget, version: result.version }, month, historyFilters);
      await readAccountHistory(accountId);
      return { kind: 'completed' as const };
    } catch (error) {
      const difference = error instanceof RequestError && error.details && typeof error.details === 'object'
        ? (error.details as { differenceMinor?: unknown }).differenceMinor : undefined;
      if (!input.confirmAdjustment && error instanceof RequestError && error.status === 409 && (typeof difference === 'number' || typeof difference === 'string')) {
        return { kind: 'mismatch' as const, differenceMinor: difference };
      }
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'No se pudo conciliar la cuenta.' });
      return null;
    } finally { setBusy(false); }
  };

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
    status, budget, summary, month, history, accountHistory, report, historyFilters, notice, setNotice, busy, csvDiagnostics,
    activeCategories, activeAccounts, pendingIncomes, today: today(),
    authenticate, signOut, saveSetupAccount, saveSetupCategories, setMonth, refresh: sync,
    assign, unassign, move, recordIncome, recordSpending, recordTransfer, releaseIncome,
    createAccount, renameAccount, archiveAccount, createCategory, renameCategory, archiveCategory, changeCategoryTarget,
    readSchedules, createSchedule, removeSchedule, generateSchedules,
    applyHistoryFilters, readAccountHistory, resetAccountHistory: readAccountHistory, loadMoreAccountHistory, retryAccountHistory,
    readMonthlyReport, readReportRange, reportRange,
    editTransaction, deleteTransaction, setTransactionCleared, reconcileAccount, exportCsv, importCsv,
  };
}

export type BudgetAppController = ReturnType<typeof useBudgetApp>;
