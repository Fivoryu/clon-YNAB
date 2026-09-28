'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import { AppShell } from '../../components/shell/AppShell';
import { RouteGate } from '../../components/shell/RouteGate';
import { formatMoney } from '../../lib/money';
import { useBudget } from '../../providers/BudgetAppProvider';
import type { HistoryItem } from '../../models';

function AccountActivityRow({ item }: { item: HistoryItem }) {
  const label = item.kind === 'SPENDING' ? 'Gasto' : item.kind === 'INCOME' ? 'Ingreso' : 'Transferencia';
  const context = item.kind === 'TRANSFER'
    ? `${item.sourceAccount.name} → ${item.destinationAccount.name}`
    : item.kind === 'SPENDING' ? item.category?.name ?? 'Gasto sin categoría' : 'Ingreso';
  const sign = item.kind === 'SPENDING' ? '−' : item.kind === 'INCOME' ? '+' : '';
  const amountTone = item.kind === 'SPENDING' ? 'negative' : item.kind === 'INCOME' ? 'positive' : '';

  return <li className="transaction-row" data-testid={`account-activity-${item.transactionId}`}>
    <span className={`transaction-icon ${item.kind.toLowerCase()}`} aria-hidden="true">{item.kind === 'TRANSFER' ? '↔' : sign}</span>
    <div className="transaction-copy">
      <div><strong>{item.payee || label}</strong><span className="pill">{label}</span></div>
      <small>{item.date} · {context}{item.memo ? ` · ${item.memo}` : ''}</small>
    </div>
    <strong className={amountTone}>{sign}{formatMoney(item.amountMinor)}</strong>
  </li>;
}

export default function AccountDetailPage() {
  const params = useParams<{ accountId: string }>();
  const accountId = typeof params.accountId === 'string' ? params.accountId : '';
  const app = useBudget();
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
        <div className="account-detail-balance">
          <small>Saldo actual</small>
          <strong>{formatMoney(account.balanceMinor)}</strong>
          <small>Saldo de la cuenta, actualizado por el presupuesto</small>
        </div>
      </section>

      <section className="card history-card account-history" aria-labelledby="account-activity-title">
        <div className="account-history-heading">
          <div><p className="section-kicker">Actividad de la cuenta</p><h2 id="account-activity-title">Movimientos</h2></div>
          <p>El saldo incluye toda la actividad, no solo las filas cargadas.</p>
        </div>
        {!history || history.loading ? <p className="account-history-status" role="status" aria-live="polite">Cargando actividad…</p> : null}
        {history?.items.length === 0 && !history.error ? <div className="empty-state account-history-empty"><strong>No hay actividad para esta cuenta todavía.</strong><span>Los movimientos aparecerán aquí cuando se registren.</span></div> : null}
        {history && history.items.length > 0 ? <ul className="history-list account-history-list" aria-label={`Actividad de ${account.name}`}>
          {history.items.map(item => <AccountActivityRow key={item.transactionId} item={item} />)}
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
