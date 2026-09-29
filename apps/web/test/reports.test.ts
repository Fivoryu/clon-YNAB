import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  isMonthlyReportUnavailable,
  isReportMonth,
  reportMonthLabel,
  type MonthlyReport,
  type MonthlyReportProjection,
} from '../app/models.ts';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const reportPage = (() => { try { return read('../app/reports/page.tsx'); } catch { return ''; } })();
const shell = read('../app/components/shell/AppShell.tsx');
const controller = read('../app/hooks/useBudgetApp.ts');
const models = read('../app/models.ts');
const styles = read('../app/globals.css');

const approved: MonthlyReport = {
  month: '2026-02', policy: { id: 'report-policy/v1', month: '2026-02' }, incomeMinor: 150000, expenseMinor: 30000, version: 7,
  categories: [{ id: 'food', name: 'Food', archived: false, spendingMinor: 30000 }, { id: 'old', name: 'Old', archived: true, spendingMinor: 0 }],
  transfers: { treatment: 'OUTSIDE_INCOME_EXPENSE_TOTALS', totalMinor: 60000, items: [{ transferId: 'transfer-1', sourceAccount: { id: 'checking', name: 'Diaria', kind: 'CHECKING', archived: false }, destinationAccount: { id: 'savings', name: 'Ahorro', kind: 'CASH', archived: false }, date: '2026-02-14', amountMinor: 60000 }] },
  provisional: { treatment: 'INCLUDED_PROVISIONAL', count: 2, incomeMinor: 10000, expenseMinor: 2500 },
  incomeRelease: { treatment: 'PENDING_RELEASE', receivedMinor: 150000, releasedMinor: 125000, pendingMinor: 25000 },
};
const unresolvedPolicy: MonthlyReportProjection = { month: '2026-02', policy: { id: null, month: '2026-02' }, unavailable: { code: 'REPORT_POLICY_UNRESOLVED', treatment: 'NO_TOTALS_RETURNED' } };

test('report months accept only a single YYYY-MM period and are labelled for the reader', () => {
  assert.equal(isReportMonth('2026-02'), true);
  assert.equal(isReportMonth('2026-12'), true);
  assert.equal(isReportMonth('2026-2'), false);
  assert.equal(isReportMonth('2026-13'), false);
  assert.equal(isReportMonth('2026-00'), false);
  assert.equal(isReportMonth('2026-02-01'), false);
  assert.equal(isReportMonth(''), false);
  assert.equal(reportMonthLabel('2026-02'), 'febrero de 2026');
  assert.equal(reportMonthLabel('2026-01'), 'enero de 2026');
  assert.equal(reportMonthLabel('no es un mes'), 'no es un mes');
});

test('the unresolved-policy projection is distinguishable from a monthly report', () => {
  assert.equal(isMonthlyReportUnavailable(unresolvedPolicy), true);
  assert.equal(isMonthlyReportUnavailable(approved), false);
  assert.equal(unresolvedPolicy.policy.id, null);
  assert.equal(unresolvedPolicy.policy.month, '2026-02');
  assert.equal('incomeMinor' in unresolvedPolicy, false);
});

test('the report surface is discoverable from the primary navigation', () => {
  assert.match(shell, /href: '\/reports'/);
  assert.match(shell, /label: 'Reportes'/);
  assert.match(shell, /<nav aria-label="Navegación principal">/);
  assert.match(shell, /className="mobile-nav" aria-label="Navegación móvil"/);
  assert.match(shell, /nav\.map\(item => <Link[^>]*><span>\{item\.icon\}<\/span><small>\{item\.label\}<\/small><\/Link>\)/);
});

test('the report page works on exactly one selected YYYY-MM period', () => {
  assert.match(reportPage, /htmlFor="report-month"/);
  assert.match(reportPage, /type="month"/);
  assert.equal((reportPage.match(/type="month"/g) ?? []).length, 1);
  assert.doesNotMatch(reportPage, /type="date"|type="week"|type="range"|multiple/);
  assert.match(reportPage, /isReportMonth\(month\)/);
  assert.match(reportPage, /reportMonthLabel\(month\)/);
  assert.match(reportPage, /app\.readMonthlyReport\(month\)/);
  assert.match(controller, /reports\/monthly\?month=\$\{encodeURIComponent\(requestedMonth\)\}/);
});

test('category spending is a captioned table with column and row headers', () => {
  assert.match(reportPage, /<table className="report-table">/);
  assert.match(reportPage, /<caption>/);
  assert.match(reportPage, /<th scope="col">Categoría<\/th>/);
  assert.match(reportPage, /<th scope="col">Gasto del mes<\/th>/);
  assert.match(reportPage, /<th scope="row">/);
  assert.match(reportPage, /category\.name/);
  assert.match(reportPage, /category\.archived/);
  assert.match(reportPage, /formatMoney\(category\.spendingMinor\)/);
});

test('income and expense stay separate, labelled measures', () => {
  assert.match(reportPage, /aria-labelledby="report-totals-title"/);
  assert.match(reportPage, /id="report-totals-title"/);
  assert.match(reportPage, /<dt>Ingresos del mes<\/dt>/);
  assert.match(reportPage, /<dt>Gastos del mes<\/dt>/);
  assert.match(reportPage, /formatMoney\(report\.incomeMinor\)/);
  assert.match(reportPage, /formatMoney\(report\.expenseMinor\)/);
});

test('transfers are listed once each with both accounts, date, amount, and an outside-totals subtotal', () => {
  assert.match(reportPage, /data-treatment=\{transfers\.treatment\}/);
  assert.match(reportPage, /transfer\.sourceAccount\.name/);
  assert.match(reportPage, /transfer\.destinationAccount\.name/);
  assert.match(reportPage, /transfer\.date/);
  assert.match(reportPage, /formatMoney\(transfer\.amountMinor\)/);
  assert.match(reportPage, /Subtotal de transferencias \(fuera de los totales de ingresos y gastos\)/);
  assert.match(reportPage, /formatMoney\(transfers\.totalMinor\)/);
  assert.doesNotMatch(reportPage, /incomeMinor \+|expenseMinor \+|transfers\.totalMinor \+|sumMinor/);
});

test('provisional records and pending-release income are visible and labelled', () => {
  assert.match(reportPage, /Movimientos provisionales/);
  assert.match(reportPage, /data-treatment=\{provisional\.treatment\}/);
  assert.match(reportPage, /provisional\.count/);
  assert.match(reportPage, /formatMoney\(provisional\.incomeMinor\)/);
  assert.match(reportPage, /formatMoney\(provisional\.expenseMinor\)/);
  assert.match(reportPage, /Ingresos pendientes de liberar/);
  assert.match(reportPage, /data-treatment=\{incomeRelease\.treatment\}/);
  assert.match(reportPage, /<dt>Recibido<\/dt>/);
  assert.match(reportPage, /<dt>Liberado<\/dt>/);
  assert.match(reportPage, /<dt>Pendiente de liberar<\/dt>/);
  assert.match(reportPage, /formatMoney\(incomeRelease\.pendingMinor\)/);
});

test('no comparison, trend, export, or later-roadmap control exists on the report surface', () => {
  for (const forbidden of [/trend/i, /comparar/i, /periodComparison/, /monthRange/, /Exportar/, /Descargar/, /CSV|csv/, /Programad/, /Reconcilia/, /Tarjeta de crédito/, /Préstamo/, /Dividir transacción/, /Objetivo de ahorro/]) {
    assert.doesNotMatch(reportPage, forbidden);
  }
  assert.doesNotMatch(shell, /Comparar meses|Tendencias|Reportes avanzados/);
  assert.match(reportPage, /policy\.id/);
});

test('loading, API failure, empty month, and unresolved policy are distinct states', () => {
  assert.match(reportPage, /role="status" aria-live="polite"/);
  assert.match(reportPage, /Cargando el reporte del mes/);
  assert.match(reportPage, /role="alert"/);
  assert.match(reportPage, /Reintentar/);
  assert.match(reportPage, /Mes no válido/);
  assert.match(reportPage, /Sin actividad registrada en/);
  assert.match(reportPage, /isMonthlyReportUnavailable/);
  assert.match(reportPage, /report-unavailable/);
  assert.match(reportPage, /no muestra ningún total/);
  assert.match(controller, /errorKind: 'invalid-month'/);
  assert.match(controller, /reportRequestId/);
});

test('the report surface is keyboard reachable and announced to assistive technology', () => {
  assert.match(reportPage, /<label htmlFor="report-month">Mes del reporte<\/label>/);
  assert.match(reportPage, /aria-describedby="report-month-hint"/);
  assert.match(reportPage, /className="card report-controls"/);
  assert.match(reportPage, /<button type="button" className="secondary" onClick=\{\(\) => void app\.readMonthlyReport\(month\)\}>Reintentar<\/button>/);
  assert.match(reportPage, /aria-labelledby="report-categories-title"/);
  assert.match(reportPage, /aria-labelledby="report-transfers-title"/);
});

test('the web client consumes only the approved report route, in its single-month and range modes', () => {
  assert.equal((controller.match(/reports\/monthly/g) ?? []).length, 2, 'the approved route is reached in exactly two modes');
  assert.equal((controller.match(/reports\/monthly\?month=/g) ?? []).length, 1, 'exactly one single-month request');
  assert.equal((controller.match(/reports\/monthly\?from=/g) ?? []).length, 1, 'exactly one range request');
  assert.doesNotMatch(controller, /reports\/(?!monthly)/, 'no other report endpoint is called');
  assert.match(controller, /readMonthlyReport/);
  assert.match(controller, /readReportRange/);
  assert.match(controller, /report, setReport/);
  assert.match(models, /export function isReportMonth/);
  assert.match(models, /export function reportMonthLabel/);
  assert.match(models, /export function isMonthlyReportUnavailable/);
  assert.match(models, /OUTSIDE_INCOME_EXPENSE_TOTALS/);
  assert.match(models, /INCLUDED_PROVISIONAL/);
  assert.match(models, /PENDING_RELEASE/);
});

test('the report surface reflows to a single column and scrolls its tables on narrow screens', () => {
  assert.match(styles, /\.report-measure-list \{/);
  assert.match(styles, /\.report-table-scroll \{/);
  assert.match(styles, /\.report-table-scroll \{[\s\S]*?overflow-x: auto/);
  assert.match(styles, /@media \(max-width: 720px\) \{[\s\S]*?\.report-measure-list \{ grid-template-columns: 1fr; \}/);
  assert.match(styles, /@media \(max-width: 980px\) \{[\s\S]*?\.mobile-nav \{[\s\S]*?repeat\(5, 1fr\)/);
});

test('every approved section renders together for a monthly report, so nothing is silently omitted', () => {
  assert.match(reportPage, /<TotalsSection report=\{monthly\} \/>[\s\S]*?<CategorySection report=\{monthly\} \/>[\s\S]*?<TransfersSection report=\{monthly\} \/>[\s\S]*?<ProvisionalSection report=\{monthly\} \/>[\s\S]*?<IncomeReleaseSection report=\{monthly\} \/>/);
  assert.match(reportPage, /No hubo transferencias en este mes\./);
  assert.match(reportPage, /<th scope="row">Sin categorías<\/th>/);
  assert.match(reportPage, /Sin actividad registrada en \{reportMonthLabel\(monthly\.month\)\}/);
});

test('the unresolved-policy state is separate from every totals path and can show no numbers', () => {
  assert.match(reportPage, /projection && !isMonthlyReportUnavailable\(projection\) \? projection : null/);
  assert.match(reportPage, /\{unavailable \? <section className="card report-unavailable" role="alert"/);
  assert.match(reportPage, /\{monthly \? <>/);
  assert.doesNotMatch(reportPage, /\+=|sum\(|reduce\(/);
});

test('the single-month request cannot carry a second period or a comparison window', () => {
  assert.equal((controller.match(/reports\/monthly\?month=/g) ?? []).length, 1);
  assert.doesNotMatch(controller, /reports\/monthly\?month=[^\n`]*&/);
  assert.match(controller, /if \(requestId !== reportRequestId\.current\) return null;/);
  assert.doesNotMatch(reportPage, /<div[^>]*onClick/);
  assert.doesNotMatch(reportPage, /monthFrom|monthTo|periodFrom|periodTo|priorMonth|previousMonth|nextMonth|Comparar/);
});
