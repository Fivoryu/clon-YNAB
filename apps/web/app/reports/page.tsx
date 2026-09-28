'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '../components/shell/AppShell';
import { RouteGate } from '../components/shell/RouteGate';
import { formatMoney } from '../lib/money';
import { useBudget } from '../providers/BudgetAppProvider';
import { isMonthlyReportUnavailable, isReportMonth, reportMonthLabel, type MonthlyReport } from '../models';

const currentMonth = () => new Date().toISOString().slice(0, 7);

function TotalsSection({ report }: { report: MonthlyReport }) {
  return <section className="card report-section" aria-labelledby="report-totals-title">
    <h2 id="report-totals-title">Ingresos y gastos del mes</h2>
    <p className="report-treatment">Los ingresos y los gastos son medidas distintas de un solo mes. Ninguna de las dos incluye transferencias.</p>
    <dl className="report-measure-list">
      <div className="report-measure"><dt>Ingresos del mes</dt><dd>{formatMoney(report.incomeMinor)}</dd></div>
      <div className="report-measure"><dt>Gastos del mes</dt><dd>{formatMoney(report.expenseMinor)}</dd></div>
    </dl>
  </section>;
}

function CategorySection({ report }: { report: MonthlyReport }) {
  return <section className="card report-section" aria-labelledby="report-categories-title">
    <h2 id="report-categories-title">Gasto por categoría</h2>
    <div className="report-table-scroll">
      <table className="report-table">
        <caption>Gasto del mes {report.month} repartido por categoría. Cada categoría del presupuesto aparece con su gasto, incluidas las archivadas y las que no tuvieron gasto.</caption>
        <thead><tr><th scope="col">Categoría</th><th scope="col">Gasto del mes</th></tr></thead>
        <tbody>
          {report.categories.length === 0
            ? <tr><th scope="row">Sin categorías</th><td>{formatMoney(0)}</td></tr>
            : report.categories.map(category => <tr key={category.id}>
              <th scope="row">{category.name}{category.archived ? <span className="report-flag">Categoría archivada</span> : null}</th>
              <td>{formatMoney(category.spendingMinor)}</td>
            </tr>)}
        </tbody>
      </table>
    </div>
  </section>;
}

function TransfersSection({ report }: { report: MonthlyReport }) {
  const { transfers } = report;
  return <section className="card report-section" aria-labelledby="report-transfers-title">
    <h2 id="report-transfers-title">Transferencias del mes</h2>
    <p className="report-treatment" data-treatment={transfers.treatment}>Una transferencia no es un ingreso ni un gasto: queda fuera de los totales y no aparece en el gasto por categoría.</p>
    {transfers.items.length === 0
      ? <p className="report-empty-note">No hubo transferencias en este mes.</p>
      : <div className="report-table-scroll">
        <table className="report-table">
          <caption>Transferencias entre cuentas del mes {report.month}: una fila por transferencia con cuenta de origen, cuenta de destino, fecha y monto.</caption>
          <thead><tr><th scope="col">Origen</th><th scope="col">Destino</th><th scope="col">Fecha</th><th scope="col">Monto</th></tr></thead>
          <tbody>{transfers.items.map(transfer => <tr key={transfer.transferId}>
            <th scope="row">{transfer.sourceAccount.name}</th>
            <td>{transfer.destinationAccount.name}</td>
            <td>{transfer.date}</td>
            <td>{formatMoney(transfer.amountMinor)}</td>
          </tr>)}</tbody>
        </table>
      </div>}
    <p className="report-total-line">Subtotal de transferencias (fuera de los totales de ingresos y gastos): <strong>{formatMoney(transfers.totalMinor)}</strong></p>
  </section>;
}

function ProvisionalSection({ report }: { report: MonthlyReport }) {
  const { provisional } = report;
  return <section className="card report-section" aria-labelledby="report-provisional-title">
    <h2 id="report-provisional-title">Movimientos provisionales</h2>
    <p className="report-treatment" data-treatment={provisional.treatment}>Los movimientos provisionales ya están incluidos en los totales del mes y se muestran aparte como provisionales.</p>
    <dl className="report-measure-list">
      <div className="report-measure"><dt>Movimientos provisionales</dt><dd>{provisional.count}</dd></div>
      <div className="report-measure"><dt>Ingresos provisionales</dt><dd>{formatMoney(provisional.incomeMinor)}</dd></div>
      <div className="report-measure"><dt>Gastos provisionales</dt><dd>{formatMoney(provisional.expenseMinor)}</dd></div>
    </dl>
  </section>;
}

function IncomeReleaseSection({ report }: { report: MonthlyReport }) {
  const { incomeRelease } = report;
  return <section className="card report-section" aria-labelledby="report-release-title">
    <h2 id="report-release-title">Ingresos pendientes de liberar</h2>
    <p className="report-treatment" data-treatment={incomeRelease.treatment}>El ingreso recibido cuenta completo en los ingresos del mes. Liberarlo es una decisión de asignación, no una nueva medida del ingreso.</p>
    <dl className="report-measure-list">
      <div className="report-measure"><dt>Recibido</dt><dd>{formatMoney(incomeRelease.receivedMinor)}</dd></div>
      <div className="report-measure"><dt>Liberado</dt><dd>{formatMoney(incomeRelease.releasedMinor)}</dd></div>
      <div className="report-measure"><dt>Pendiente de liberar</dt><dd>{formatMoney(incomeRelease.pendingMinor)}</dd></div>
    </dl>
  </section>;
}

export default function ReportsPage() {
  const app = useBudget();
  const [month, setMonth] = useState(currentMonth);
  const report = app.report?.month === month ? app.report : null;
  const projection = report?.projection ?? null;
  const unavailable = projection && isMonthlyReportUnavailable(projection) ? projection : null;
  const monthly = projection && !isMonthlyReportUnavailable(projection) ? projection : null;
  const policyId = projection?.policy.id ?? 'sin resolver';
  const emptyMonth = monthly !== null && monthly.incomeMinor === 0 && monthly.expenseMinor === 0 && monthly.transfers.items.length === 0 && monthly.provisional.count === 0;

  useEffect(() => { void app.readMonthlyReport(month); }, [month, app.readMonthlyReport]);

  return <RouteGate gate="ready"><AppShell title="Reporte mensual" subtitle="Revisa un solo mes con la política contable aprobada.">
    <section className="card report-controls">
      <div className="field">
        <label htmlFor="report-month">Mes del reporte</label>
        <input id="report-month" type="month" value={month} onChange={event => setMonth(event.target.value)} aria-describedby="report-month-hint" />
      </div>
      <p id="report-month-hint" className="muted">Se muestra un mes a la vez: elige el mes con el selector o desde el teclado.</p>
    </section>
    <section className="card report-heading">
      <p className="section-kicker">Periodo seleccionado</p>
      <h2>{isReportMonth(month) ? reportMonthLabel(month) : 'Mes no válido'}</h2>
      <p className="report-period">Mes: {month || 'sin seleccionar'}</p>
      {projection ? <p className="report-policy">Política contable del reporte: <code>{policyId}</code></p> : null}
    </section>
    {!report || report.loading ? <p className="report-status" role="status" aria-live="polite">Cargando el reporte del mes…</p> : null}
    {report?.error ? <div className="report-error" role="alert">
      <p>{report.error}</p>
      {report.errorKind === 'initial' ? <button type="button" className="secondary" onClick={() => void app.readMonthlyReport(month)}>Reintentar</button> : null}
    </div> : null}
    {unavailable ? <section className="card report-unavailable" role="alert" aria-labelledby="report-unavailable-title">
      <h2 id="report-unavailable-title">Reporte no disponible con la política actual</h2>
      <p>No se pudo resolver la política contable del reporte, así que este mes no muestra ningún total.</p>
      <p className="report-treatment">{unavailable.unavailable.code} · {unavailable.unavailable.treatment}</p>
    </section> : null}
    {monthly ? <>
      {emptyMonth ? <p className="report-empty-note">Sin actividad registrada en {reportMonthLabel(monthly.month)}. Los totales del mes aparecen en cero.</p> : null}
      <TotalsSection report={monthly} />
      <CategorySection report={monthly} />
      <TransfersSection report={monthly} />
      <ProvisionalSection report={monthly} />
      <IncomeReleaseSection report={monthly} />
      <p className="report-source">Reporte calculado por el servidor para un solo mes con la política {monthly.policy.id} (versión {monthly.version}).</p>
    </> : null}
  </AppShell></RouteGate>;
}
