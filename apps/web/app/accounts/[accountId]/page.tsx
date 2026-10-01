'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'next/navigation';
import { AppShell } from '../../components/shell/AppShell';
import { RouteGate } from '../../components/shell/RouteGate';
import { formatMoney } from '../../lib/money';
import { useBudget } from '../../providers/BudgetAppProvider';
import { isHistoryItemEligibleForClearing, type Account, type HistoryItem } from '../../models';

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
  const account = app.budget?.accounts.find(item => item.id === accountId);
  const history = app.accountHistory?.accountId === accountId ? app.accountHistory : null;

  useEffect(() => {
    if (accountId) void app.readAccountHistory(accountId);
  }, [accountId, app.readAccountHistory]);

  const retry = () => {
    if (history?.errorKind === 'append') void app.retryAccountHistory(accountId);
    else void app.resetAccountHistory(accountId);
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
