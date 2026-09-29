'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '../../components/shell/AppShell';
import { RouteGate } from '../../components/shell/RouteGate';
import { formatMoney } from '../../lib/money';
import { useBudget } from '../../providers/BudgetAppProvider';
import { reportMonthLabel, reportRangeLabel, type MonthlyReport, type MonthlyReportCategorySpending, type MultiMonthReport } from '../../models';

const currentMonth = () => new Date().toISOString().slice(0, 7);

function CategoryTable({ categories, caption }: { categories: MonthlyReportCategorySpending[]; caption: string }) {
  return <div className="report-table-scroll"><table className="report-table">
    <caption>{caption}</caption>
    <thead><tr><th scope="col">Categoría</th><th scope="col">Gasto</th></tr></thead>
    <tbody>{categories.length ? categories.map(category => <tr key={category.id}>
      <th scope="row">{category.name}{category.archived ? <span className="report-flag">Categoría archivada</span> : null}</th>
      <td>{formatMoney(category.spendingMinor)}</td>
    </tr>) : <tr><th scope="row">Sin categorías</th><td>{formatMoney(0)}</td></tr>}</tbody>
  </table></div>;
}

function MeasureChart({ months }: { months: MonthlyReport[] }) {
  const maximum = Math.max(1, ...months.flatMap(month => [month.incomeMinor, month.expenseMinor]));
  return <section className="card report-section" aria-labelledby="report-chart-title">
    <h2 id="report-chart-title">Ingresos y gastos por mes</h2>
    <p className="report-treatment">Medidas presentadas lado a lado; esta vista no analiza una tendencia y no calcula diferencias ni porcentajes.</p>
    <div className="report-chart-scroll"><div className="report-chart" role="img" aria-label="Gráfico de ingresos y gastos por mes con el valor de cada medida. Los meses aparecen lado a lado; no se calculan diferencias ni porcentajes.">
      {months.map(month => <div className="report-chart-month" key={month.month}>
        <strong>{reportMonthLabel(month.month)}</strong>
        {([['Ingresos', month.incomeMinor, 'income'], ['Gastos', month.expenseMinor, 'expense']] as const).map(([label, value, kind]) => <div className="report-chart-measure" key={kind}>
          <span>{label}</span><span className="report-chart-value">{formatMoney(value)}</span><span className="report-chart-track"><i className={`report-chart-bar ${kind}`} style={{ width: `${value / maximum * 100}%` }} /></span>
        </div>)}
      </div>)}
    </div></div>
  </section>;
}

function SummaryTable({ report }: { report: MultiMonthReport }) {
  return <section className="card report-section" aria-labelledby="report-summary-title">
    <h2 id="report-summary-title">Resumen por mes</h2>
    <div className="report-table-scroll"><table className="report-table report-summary-table">
      <caption>Resumen mensual del rango solicitado. Esta tabla presenta las mismas medidas y es la representación equivalente y accesible del gráfico.</caption>
      <thead><tr><th scope="col">Mes</th><th scope="col">Ingresos</th><th scope="col">Gastos</th><th scope="col">Movimientos provisionales</th><th scope="col">Subtotal de transferencias</th></tr></thead>
      <tbody>{report.months.map(month => <tr key={month.month}>
        <th scope="row">{reportMonthLabel(month.month)}</th><td>{formatMoney(month.incomeMinor)}</td><td>{formatMoney(month.expenseMinor)}</td>
        <td>{month.provisional.count}</td><td>{formatMoney(month.transfers.totalMinor)}</td>
      </tr>)}</tbody>
    </table></div>
  </section>;
}

function MonthTreatment({ report }: { report: MonthlyReport }) {
  const month = report.month;
  const empty = report.incomeMinor === 0 && report.expenseMinor === 0 && report.transfers.items.length === 0;
  const id = (section: string) => `report-${section}-${month}`;
  const { transfers, provisional, incomeRelease } = report;
  return <>
    {empty ? <p className="report-empty-note">Sin actividad registrada en {reportMonthLabel(month)}. Los detalles del mes aparecen en cero.</p> : null}
    <section className="card report-section" aria-labelledby={id('measures')}>
      <h2 id={id('measures')}>Ingresos y gastos del mes</h2>
      <p className="report-treatment">Los ingresos y los gastos son medidas distintas. Ninguna incluye transferencias.</p>
      <dl className="report-measure-list">
        <div className="report-measure"><dt>Ingresos del mes</dt><dd>{formatMoney(report.incomeMinor)}</dd></div>
        <div className="report-measure"><dt>Gastos del mes</dt><dd>{formatMoney(report.expenseMinor)}</dd></div>
      </dl>
    </section>
    <section className="card report-section" aria-labelledby={id('categories')}>
      <h2 id={id('categories')}>Gasto por categoría</h2>
      <CategoryTable categories={report.categories} caption={`Gasto del mes ${month} por categoría, incluidas las archivadas y las que no tuvieron gasto.`} />
    </section>
    <section className="card report-section" aria-labelledby={id('transfers')}>
      <h2 id={id('transfers')}>Transferencias del mes</h2>
      <p className="report-treatment" data-treatment={transfers.treatment}>Las transferencias quedan fuera de los totales de ingresos y gastos y no aparecen como gasto por categoría.</p>
      {transfers.items.length ? <div className="report-table-scroll"><table className="report-table">
        <caption>Transferencias entre cuentas del mes {month}.</caption>
        <thead><tr><th scope="col">Origen</th><th scope="col">Destino</th><th scope="col">Fecha</th><th scope="col">Monto</th></tr></thead>
        <tbody>{transfers.items.map(item => <tr key={item.transferId}>
          <th scope="row">{item.sourceAccount.name}</th><td>{item.destinationAccount.name}</td><td>{item.date}</td><td>{formatMoney(item.amountMinor)}</td>
        </tr>)}</tbody>
      </table></div> : <p className="report-empty-note">No hubo transferencias en este mes.</p>}
      <p className="report-total-line">Subtotal de transferencias (fuera de los totales de ingresos y gastos): <strong>{formatMoney(transfers.totalMinor)}</strong></p>
    </section>
    <section className="card report-section" aria-labelledby={id('provisional')}>
      <h2 id={id('provisional')}>Movimientos provisionales</h2>
      <p className="report-treatment" data-treatment={provisional.treatment}>Los movimientos provisionales ya están incluidos en los totales del mes y también se muestran aparte.</p>
      <dl className="report-measure-list">
        <div className="report-measure"><dt>Movimientos provisionales</dt><dd>{provisional.count}</dd></div>
        <div className="report-measure"><dt>Ingresos provisionales</dt><dd>{formatMoney(provisional.incomeMinor)}</dd></div>
        <div className="report-measure"><dt>Gastos provisionales</dt><dd>{formatMoney(provisional.expenseMinor)}</dd></div>
      </dl>
    </section>
    <section className="card report-section" aria-labelledby={id('release')}>
      <h2 id={id('release')}>Ingresos pendientes de liberar</h2>
      <p className="report-treatment" data-treatment={incomeRelease.treatment}>El ingreso recibido cuenta completo en los ingresos del mes. Liberarlo es una decisión de asignación, no una nueva medida del ingreso.</p>
      <dl className="report-measure-list">
        <div className="report-measure"><dt>Recibido</dt><dd>{formatMoney(incomeRelease.receivedMinor)}</dd></div>
        <div className="report-measure"><dt>Liberado</dt><dd>{formatMoney(incomeRelease.releasedMinor)}</dd></div>
        <div className="report-measure"><dt>Pendiente de liberar</dt><dd>{formatMoney(incomeRelease.pendingMinor)}</dd></div>
      </dl>
    </section>
  </>;
}

function PeriodTotal({ report }: { report: MultiMonthReport }) {
  const total = report.total;
  return <section className="card report-section report-period-total" aria-labelledby="report-period-total-title">
    <h2 id="report-period-total-title">Total del periodo — solo medidas de flujo</h2>
    <p className="report-treatment">Este panel cubre únicamente las medidas de flujo especificadas para el periodo.</p>
    <dl className="report-measure-list">
      <div className="report-measure"><dt>Ingresos del periodo</dt><dd>{formatMoney(total.incomeMinor)}</dd></div>
      <div className="report-measure"><dt>Gastos del periodo</dt><dd>{formatMoney(total.expenseMinor)}</dd></div>
      <div className="report-measure"><dt>Movimientos provisionales del periodo</dt><dd>{total.provisional.count}</dd></div>
      <div className="report-measure"><dt>Ingresos provisionales del periodo</dt><dd>{formatMoney(total.provisional.incomeMinor)}</dd></div>
      <div className="report-measure"><dt>Gastos provisionales del periodo</dt><dd>{formatMoney(total.provisional.expenseMinor)}</dd></div>
    </dl>
    <CategoryTable categories={total.categories} caption="Gasto por categoría del periodo, con las etiquetas actuales del presupuesto." />
    <p className="report-total-line">Subtotal de transferencias (fuera del total de medidas de flujo): <strong>{formatMoney(total.transfers.totalMinor)}</strong></p>
  </section>;
}

export default function ReportTrendsPage() {
  const app = useBudget();
  const [from, setFrom] = useState(currentMonth);
  const [to, setTo] = useState(currentMonth);
  useEffect(() => { void app.readReportRange(from, to); }, [from, to, app.readReportRange]);

  const state = app.reportRange?.from === from && app.reportRange.to === to ? app.reportRange : null;
  const report = state?.report ?? null;
  return <RouteGate gate="ready"><AppShell title="Reporte de meses lado a lado" subtitle="Consulta medidas mensuales; esta vista no analiza una tendencia.">
    <section className="card report-controls report-range-controls" aria-labelledby="report-range-title">
      <h2 id="report-range-title">Selecciona un rango inclusivo</h2>
      <div className="report-range-inputs">
        <div className="field"><label htmlFor="report-range-from">Mes de inicio</label><input id="report-range-from" type="month" value={from} onChange={event => setFrom(event.target.value)} aria-describedby="report-range-hint" /></div>
        <div className="field"><label htmlFor="report-range-to">Mes de fin</label><input id="report-range-to" type="month" value={to} onChange={event => setTo(event.target.value)} aria-describedby="report-range-hint" /></div>
      </div>
      <p id="report-range-hint" className="muted">El rango incluye el mes de inicio y el mes de fin. El máximo es 24 meses; elige ambos meses con los controles o desde el teclado.</p>
    </section>
    <section className="card report-disclosures" aria-labelledby="report-disclosures-title">
      <h2 id="report-disclosures-title">Alcance de esta serie</h2>
      <p>Se recalcula desde el historial efectivo: una edición o eliminación ordinaria puede cambiar un mes ya informado.</p>
      <p>Las etiquetas de categoría son las actuales del presupuesto, no las que estaban vigentes durante cada mes.</p>
      <p>Esta serie no es un registro duradero.</p>
      <p>Los meses se presentan lado a lado; esta vista no analiza una tendencia.</p>
      {report ? <dl className="report-range-meta">
        <div><dt>Política de la serie (report-policy/v2)</dt><dd><code>{report.policy.id}</code></dd></div>
        <div><dt>Base por mes (report-policy/v1)</dt><dd><code>{report.policy.monthBasis}</code></dd></div>
        <div><dt>Rango solicitado</dt><dd>{reportRangeLabel(report.policy.from, report.policy.to)} ({report.policy.from}–{report.policy.to})</dd></div>
        <div><dt>Revisión</dt><dd>{report.version}</dd></div>
      </dl> : null}
    </section>
    {!state || state.loading ? <p className="report-status" role="status" aria-live="polite">Cargando el reporte del rango…</p> : null}
    {state?.error ? <div className="report-error" role="alert"><p>{state.error}</p>{state.errorKind === 'initial' ? <button type="button" className="secondary" onClick={() => void app.readReportRange(from, to)}>Reintentar</button> : null}</div> : null}
    {report ? <>
      <MeasureChart months={report.months} />
      <SummaryTable report={report} />
      <div className="report-month-list">{report.months.map(month => <details className="report-month-detail" key={month.month}>
        <summary>{reportMonthLabel(month.month)}{month.incomeMinor === 0 && month.expenseMinor === 0 && month.transfers.items.length === 0 ? <span> · Sin actividad registrada</span> : null}</summary>
        <div className="report-month-body"><MonthTreatment report={month} /></div>
      </details>)}</div>
      <PeriodTotal report={report} />
    </> : null}
  </AppShell></RouteGate>;
}
