'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'next/navigation';
import { AppShell } from '../../components/shell/AppShell';
import { RouteGate } from '../../components/shell/RouteGate';
import { MoneyInput } from '../../components/ui/MoneyInput';
import { formatMoney, parseMoneyToMinor } from '../../lib/money';
import { useBudget } from '../../providers/BudgetAppProvider';
import { isHistoryItemEligibleForClearing, type Account, type HistoryItem, type Schedule, type ScheduleInput } from '../../models';

function parseExternalBalance(value: string) {
  const match = value.trim().replace(/\s/g, '').match(/^(-?)(\d+)(?:[.,](\d{0,2}))?$/);
  if (!match) throw new Error('Ingresa un saldo válido con hasta dos decimales.');
  const minor = Number(BigInt(`${match[1]}${match[2]}${(match[3] ?? '').padEnd(2, '0')}`));
  if (!Number.isSafeInteger(minor)) throw new Error('El saldo es demasiado grande.');
  return minor;
}

function formatServerDifference(value: number | string) {
  const minor = Number(value);
  return `${minor < 0 ? '−' : ''}${formatMoney(Math.abs(minor))}`;
}

function AccountActivityRow({ item, busy, onToggle }: { item: HistoryItem; busy: boolean; onToggle: (cleared: boolean) => void }) {
  const label = item.kind === 'SPENDING' ? 'Gasto' : item.kind === 'INCOME' ? 'Ingreso' : 'Transferencia';
  const context = item.kind === 'TRANSFER' ? `${item.sourceAccount.name} → ${item.destinationAccount.name}` : item.kind === 'SPENDING' ? item.category?.name ?? 'Gasto sin categoría' : 'Ingreso';
  const sign = item.kind === 'SPENDING' ? '−' : item.kind === 'INCOME' ? '+' : '';
  const reconciled = item.clearedState === 'RECONCILED';
  const cleared = item.clearedState === 'CLEARED';
  const eligible = isHistoryItemEligibleForClearing(item);
  const canToggle = item.clearedState !== 'RECONCILED' && eligible;
  const amountTone = item.kind === 'SPENDING' ? 'negative' : item.kind === 'INCOME' ? 'positive' : '';

  return <li className="transaction-row" data-testid={`account-activity-${item.transactionId}`}>
    <span className={`transaction-icon ${item.kind.toLowerCase()}`} aria-hidden="true">{item.kind === 'TRANSFER' ? '↔' : sign}</span>
    <div className="transaction-copy">
      <div><strong>{item.payee || label}</strong><span className="pill">{label}</span></div>
      <small>{item.date} · {context}{item.memo ? ` · ${item.memo}` : ''}</small>
      <span className={`pill account-cleared-state${reconciled ? ' reconciled' : ''}`} data-testid={`cleared-state-${item.transactionId}`}>{reconciled ? 'Conciliado' : cleared ? 'Marcado' : 'Pendiente'}</span>
    </div>
    <strong className={amountTone}>{sign}{formatMoney(item.amountMinor)}</strong>
    <div className="transaction-actions">{canToggle ? <button type="button" className="icon-button compact" aria-pressed={cleared} aria-label={cleared ? 'Quitar marca de revisado' : 'Marcar como revisado'} onClick={() => onToggle(!cleared)} disabled={busy}>{cleared ? '✓' : '○'}</button> : null}</div>
  </li>;
}

function ReconciliationDialog({ account, accountId, onClose }: { account: Account; accountId: string; onClose: () => void }) {
  const app = useBudget();
  const [externalBalance, setExternalBalance] = useState('');
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [mismatch, setMismatch] = useState<{ differenceMinor: number | string } | null>(null);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (app.busy || (mismatch !== null && (!reason.trim() || !confirmed))) return;
    try {
      const confirmedClearedBalanceMinor = parseExternalBalance(externalBalance);
      const input = mismatch === null
        ? { confirmedClearedBalanceMinor, confirmAdjustment: false }
        : { confirmedClearedBalanceMinor, confirmAdjustment: true, reason: reason.trim() };
      const result = await app.reconcileAccount(accountId, input);
      if (result?.kind === 'mismatch') { setMismatch({ differenceMinor: result.differenceMinor }); setReason(''); setConfirmed(false); }
      if (result?.kind === 'completed') onClose();
    } catch (error) { app.setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'No se pudo conciliar la cuenta.' }); }
  };
  return <div className="modal-backdrop" role="presentation"><section className="modal reconciliation-dialog" role="dialog" aria-modal="true" aria-labelledby="reconciliation-title">
    <div className="modal-head"><div><p className="section-kicker">Actividad de la cuenta</p><h2 id="reconciliation-title">Conciliar cuenta</h2></div><button type="button" className="icon-button" aria-label="Cerrar" onClick={onClose}>×</button></div>
    <p className="reconciliation-balance"><span>Saldo marcado</span><strong>{formatMoney(account.clearedBalanceMinor)}</strong></p>
    <form onSubmit={submit}>
      <label htmlFor="external-cleared-balance">Saldo informado por el banco</label>
      <input id="external-cleared-balance" type="text" inputMode="decimal" value={externalBalance} onChange={event => { setExternalBalance(event.target.value); setMismatch(null); setReason(''); setConfirmed(false); }} required />
      <small>Si los saldos coinciden, se conciliará la actividad marcada.</small>
      {mismatch ? <div className="reconciliation-mismatch" role="status"><span>Diferencia</span><strong>{formatServerDifference(mismatch.differenceMinor)}</strong><p>Aún no se ha realizado ningún cambio.</p>
        <label htmlFor="reconciliation-reason">Motivo</label><textarea id="reconciliation-reason" value={reason} onChange={event => { setReason(event.target.value); setConfirmed(false); }} required />
        <label className="reconciliation-confirm"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />Confirmo que deseo aplicar el ajuste</label>
      </div> : null}
      <div className="form-actions"><button type="button" className="secondary" onClick={onClose}>Cancelar</button><button type="submit" disabled={app.busy || (mismatch !== null && (!reason.trim() || !confirmed))}>{app.busy ? 'Guardando…' : mismatch ? 'Confirmar y conciliar' : 'Revisar saldo'}</button></div>
    </form>
  </section></div>;
}

export default function AccountDetailPage() {
  const params = useParams<{ accountId: string }>();
  const accountId = typeof params.accountId === 'string' ? params.accountId : '';
  const app = useBudget();
  const [showReconciliation, setShowReconciliation] = useState(false);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [schedulesLoading, setSchedulesLoading] = useState(true);
  const [flow, setFlow] = useState<'INCOME' | 'SPENDING'>('SPENDING');
  const [categoryId, setCategoryId] = useState('');
  const [amount, setAmount] = useState('');
  const [payee, setPayee] = useState('');
  const [memo, setMemo] = useState('');
  const [dayOfMonth, setDayOfMonth] = useState(String(Number(app.today.slice(-2))));
  const [intervalMonths, setIntervalMonths] = useState('1');
  const [startDate, setStartDate] = useState(app.today);
  const [cutoffDate, setCutoffDate] = useState(app.today);
  const account = app.budget?.accounts.find(item => item.id === accountId);
  const history = app.accountHistory?.accountId === accountId ? app.accountHistory : null;

  useEffect(() => {
    let active = true;
    setSchedulesLoading(true);
    void app.readSchedules().then(result => {
      if (active) { setSchedules((result?.schedules ?? []).filter(schedule => schedule.accountId === accountId)); setSchedulesLoading(false); }
    });
    return () => { active = false; };
  }, [accountId, app.readSchedules]);

  useEffect(() => {
    if (accountId) void app.readAccountHistory(accountId);
  }, [accountId, app.readAccountHistory]);

  const retry = () => {
    if (history?.errorKind === 'append') void app.retryAccountHistory(accountId);
    else void app.resetAccountHistory(accountId);
  };
  const saveSchedule = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const amountMinor = parseMoneyToMinor(amount);
      const day = Number(dayOfMonth);
      const interval = Number(intervalMonths);
      const [year, month, date] = startDate.split('-').map(Number);
      const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
      if (date !== Math.min(day, lastDay)) throw new Error('La primera fecha debe coincidir con el día elegido o con el último día del mes.');
      const common = { accountId, amountMinor, dayOfMonth: day, intervalMonths: interval, startDate, ...(payee.trim() ? { payee: payee.trim() } : {}), ...(memo.trim() ? { memo: memo.trim() } : {}) };
      const input: ScheduleInput = flow === 'SPENDING' ? { ...common, flow, categoryId } : { ...common, flow, categoryId: null };
      const result = await app.createSchedule(input);
      if (result) { setSchedules(current => [...current, result.schedule]); setAmount(''); setPayee(''); setMemo(''); }
    } catch (error) { app.setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Revisa los datos del movimiento.' }); }
  };
  const removeSchedule = async (schedule: Schedule) => {
    if (await app.removeSchedule(schedule.id)) setSchedules(current => current.filter(item => item.id !== schedule.id));
  };
  const generateSchedules = async () => {
    if (await app.generateSchedules({ cutoffDate })) await app.readAccountHistory(accountId);
  };

  return <RouteGate gate="ready"><AppShell title={account?.name ?? 'Cuenta no encontrada'} subtitle={account ? 'Consulta el saldo actual y la actividad registrada en esta cuenta.' : undefined}>
    {!account ? <section className="card account-not-found">
      <p role="alert">No se encontró esta cuenta en el presupuesto.</p>
      <Link className="account-back-link" href="/accounts">Volver a cuentas</Link>
    </section> : <div className="account-detail">
      <Link className="account-back-link" href="/accounts">← Volver a cuentas</Link>
      <section className="account-detail-summary card" aria-label={`Resumen de ${account.name}`}>
        <div className="account-detail-identity">
          <p className="section-kicker">{account.archived ? 'Cuenta archivada' : 'Cuenta activa'}</p>
          <h2>{account.name}</h2>
          <span>{account.kind === 'CHECKING' ? 'Cuenta bancaria' : 'Efectivo'}{account.archived ? ' · historial conservado' : ''}</span>
        </div>
        <div className="account-detail-balances">
          <div className="account-detail-balance"><small>Saldo actual</small><strong>{formatMoney(account.balanceMinor)}</strong></div>
          <div className="account-cleared-balance"><small>Saldo marcado</small><strong>{formatMoney(account.clearedBalanceMinor)}</strong></div>
          {!account.archived ? <button type="button" className="secondary account-reconcile-action" onClick={() => setShowReconciliation(true)}>Conciliar cuenta</button> : null}
        </div>
      </section>
      {showReconciliation && !account.archived ? <ReconciliationDialog account={account} accountId={accountId} onClose={() => setShowReconciliation(false)} /> : null}

      <section className="card schedule-manager" aria-labelledby="schedule-title">
        <div className="section-heading"><div><p className="section-kicker">Organiza lo que viene</p><h2 id="schedule-title">Movimientos periódicos</h2><p className="muted">No afectan los saldos ni el presupuesto hasta que decidas registrarlos.</p></div></div>
        {schedulesLoading ? <p role="status">Cargando movimientos periódicos…</p> : schedules.length ? <ul className="schedule-list">
          {schedules.map(schedule => <li className="schedule-item" data-testid={`schedule-${schedule.id}`} key={schedule.id}>
            <div><strong>{schedule.payee || (schedule.flow === 'SPENDING' ? 'Gasto periódico' : 'Ingreso periódico')}</strong><span>{schedule.flow === 'SPENDING' ? 'Gasto' : 'Ingreso'}{schedule.categoryId ? ` · ${app.budget?.categories.find(category => category.id === schedule.categoryId)?.name ?? ''}` : ''}</span><small>{formatMoney(schedule.amountMinor)} · cada {schedule.intervalMonths === 1 ? 'mes' : `${schedule.intervalMonths} meses`} · día {schedule.dayOfMonth} · desde {schedule.startDate}</small>{schedule.memo ? <small>{schedule.memo}</small> : null}</div>
            <button type="button" className="ghost danger compact" onClick={() => void removeSchedule(schedule)} disabled={app.busy}>Quitar</button>
          </li>)}
        </ul> : <div className="empty-state schedule-empty"><strong>No hay movimientos periódicos para esta cuenta.</strong><span>Cuando guardes uno, aparecerá aquí.</span></div>}
        <p className="schedule-disclosure">No es posible modificar un movimiento periódico. Para cambiarlo, elimínalo y crea uno nuevo. Los movimientos registrados aparecen en el historial como cualquier otro movimiento.</p>
        {schedules.length > 0 ? <div className="schedule-generation"><p>Al registrar movimientos, se incluirán los movimientos periódicos de todas tus cuentas hasta la fecha elegida.</p><div className="field"><label htmlFor="schedule-cutoff">Fecha límite</label><input id="schedule-cutoff" type="date" value={cutoffDate} onChange={event => setCutoffDate(event.target.value)} required /></div><button type="button" onClick={() => void generateSchedules()} disabled={app.busy || !cutoffDate}>Registrar movimientos hasta esta fecha</button></div> : null}
        {!account.archived ? <form className="schedule-form" onSubmit={saveSchedule}>
          <h3>Agregar movimiento</h3>
          <div className="field"><label htmlFor="schedule-flow">Tipo de movimiento</label><select id="schedule-flow" value={flow} onChange={event => setFlow(event.target.value as 'INCOME' | 'SPENDING')}><option value="SPENDING">Gasto</option><option value="INCOME">Ingreso</option></select></div>
          {flow === 'SPENDING' ? <div className="field"><label htmlFor="schedule-category">Categoría</label><select id="schedule-category" value={categoryId} onChange={event => setCategoryId(event.target.value)} required><option value="">Elige una categoría</option>{app.activeCategories.map(category => <option value={category.id} key={category.id}>{category.name}</option>)}</select></div> : null}
          <MoneyInput id="schedule-amount" label="Monto del movimiento" value={amount} onChange={setAmount} />
          <div className="field"><label htmlFor="schedule-payee">Persona o comercio</label><input id="schedule-payee" value={payee} onChange={event => setPayee(event.target.value)} /></div>
          <div className="field"><label htmlFor="schedule-memo">Descripción adicional</label><input id="schedule-memo" value={memo} onChange={event => setMemo(event.target.value)} /></div>
          <div className="schedule-form-grid"><div className="field"><label htmlFor="schedule-day">Día del mes</label><input id="schedule-day" type="number" min="1" max="31" value={dayOfMonth} onChange={event => setDayOfMonth(event.target.value)} required /></div><div className="field"><label htmlFor="schedule-interval">Frecuencia en meses</label><input id="schedule-interval" type="number" min="1" max="12" value={intervalMonths} onChange={event => setIntervalMonths(event.target.value)} required /></div></div>
          <div className="field"><label htmlFor="schedule-start">Primera fecha</label><input id="schedule-start" type="date" value={startDate} onChange={event => setStartDate(event.target.value)} required /></div>
          <button type="submit" disabled={app.busy || (flow === 'SPENDING' && !categoryId)}>Guardar movimiento periódico</button>
        </form> : <p className="muted">Esta cuenta está archivada: no se pueden agregar movimientos periódicos.</p>}
      </section>

      <section className="card history-card account-history" aria-labelledby="account-activity-title">
        <div className="account-history-heading">
          <div><p className="section-kicker">Actividad de la cuenta</p><h2 id="account-activity-title">Movimientos</h2></div>
          <p>El saldo incluye toda la actividad, no solo las filas cargadas.</p>
        </div>
        <p className="account-reconciliation-note">Los movimientos conciliados son definitivos; no se pueden desbloquear, revertir ni corregir desde esta cuenta.</p>
        {!history || history.loading ? <p className="account-history-status" role="status" aria-live="polite">Cargando actividad…</p> : null}
        {history?.items.length === 0 && !history.error ? <div className="empty-state account-history-empty"><strong>No hay actividad para esta cuenta todavía.</strong><span>Los movimientos aparecerán aquí cuando se registren.</span></div> : null}
        {history && history.items.length > 0 ? <ul className="history-list account-history-list" aria-label={`Actividad de ${account.name}`}>
          {history.items.map(item => <AccountActivityRow key={item.transactionId} item={item} busy={app.busy} onToggle={cleared => void app.setTransactionCleared(item, cleared, accountId)} />)}
        </ul> : null}
        {history?.error ? <p className="account-history-error" role="alert">{history.error}</p> : null}
        {history?.errorKind === 'initial' || history?.errorKind === 'append' ? <button className="secondary account-history-action" type="button" onClick={retry}>Reintentar</button> : null}
        {history?.errorKind === 'stale-cursor' ? <button className="secondary account-history-action" type="button" onClick={retry}>Reiniciar historial</button> : null}
        {history?.appending ? <p className="account-history-status" role="status" aria-live="polite">Cargando más actividad…</p> : null}
        {history && !history.error && history.nextCursor ? <button className="secondary account-history-action" type="button" onClick={() => void app.loadMoreAccountHistory(accountId)} disabled={history.appending}>
          {history.appending ? 'Cargando…' : 'Cargar actividad anterior'}
        </button> : null}
        {history && history.items.length > 0 && !history.nextCursor && !history.error ? <p className="account-history-status" role="status">Has llegado al final de la actividad disponible.</p> : null}
      </section>
    </div>}
  </AppShell></RouteGate>;
}
