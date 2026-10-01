import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

/**
 * Captures the complete product walkthrough published in `docs/e2e/README.md`.
 *
 * The journey is deliberately linear and narrative: a new visitor arrives at the login screen,
 * creates an account, finishes onboarding and sees an empty budget. Then the session switches to
 * the seeded demo budget (`demo@presupuesto.local`) that carries months of realistic history, and
 * the remaining screens are captured from that data set before signing out again.
 */

const screenshotsDir = fileURLToPath(new URL('./screenshots', import.meta.url));

const demoEmail = process.env.DEMO_EMAIL ?? 'demo@presupuesto.local';
const demoPassword = process.env.DEMO_PASSWORD ?? 'demo-presupuesto-2026';
const newUserPassword = 'playwright-password';

const isoMonth = (date: Date) => date.toISOString().slice(0, 7);
const shiftMonth = (month: string, delta: number) => {
  const [year, index] = month.split('-').map(Number);
  return new Date(Date.UTC(year, index - 1 + delta, 1)).toISOString().slice(0, 7);
};
const currentMonth = isoMonth(new Date());

type Capture = { file: string; title: string; description: string; route: string };
const captures: Capture[] = [];
let sequence = 0;

const SIDEBAR_BAND_ID = 'docs-capture-sidebar-band';

/**
 * A `position: fixed` sidebar keeps its viewport height during a full-page capture, which would
 * publish a 900px dark block followed by an empty left column. Painting the same band behind the
 * whole document reproduces what a reader actually sees while scrolling, without touching layout.
 */
async function paintSidebarBand(page: Page, enabled: boolean) {
  await page.evaluate(([id, on]) => {
    const existing = document.getElementById(id);
    if (!on) { existing?.remove(); return; }
    if (existing) return;
    const style = document.createElement('style');
    style.id = id;
    style.textContent = 'body{background-image:linear-gradient(to right,#18372d 0 252px,transparent 252px);background-repeat:no-repeat}';
    document.head.appendChild(style);
  }, [SIDEBAR_BAND_ID, enabled] as const);
}

/**
 * Saves one documentation screenshot. Surfaces that grow without bound (the history list, modal
 * dialogs rendered on top of it, and the narrow mobile layout) are captured at viewport size so
 * the published image stays readable; everything else is captured full page.
 */
async function capture(page: Page, slug: string, title: string, description: string, { fullPage = true }: { fullPage?: boolean } = {}) {
  sequence += 1;
  const file = `${String(sequence).padStart(2, '0')}-${slug}.png`;
  // Two animation frames keep the capture free of in-flight transitions and focus rings.
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(null)))));
  await paintSidebarBand(page, fullPage && await page.locator('.sidebar').isVisible());
  await page.screenshot({ path: path.join(screenshotsDir, file), fullPage });
  captures.push({ file, title, description, route: new URL(page.url()).pathname.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i, '{id}') });
}

test.describe.configure({ mode: 'serial' });

test('complete E2E walkthrough from login to the current product surface', async ({ page }) => {
  await mkdir(screenshotsDir, { recursive: true });

  // ---------------------------------------------------------------- New visitor: access
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Inicia sesión' })).toBeVisible();
  await capture(page, 'login', 'Inicio de sesión', 'Puerta de entrada: autenticación local con correo y contraseña sobre sesiones administradas por el servidor.');

  await page.getByRole('link', { name: 'Crear una cuenta' }).click();
  await expect(page).toHaveURL(/\/register/);
  await capture(page, 'register', 'Crear una cuenta', 'Registro separado del inicio de sesión; al completarlo la sesión se abre automáticamente.');

  // ---------------------------------------------------------------- New visitor: onboarding
  const newUserEmail = `walkthrough-${randomUUID()}@example.com`;
  await page.getByLabel('Correo').fill(newUserEmail);
  await page.getByLabel('Contraseña', { exact: true }).fill(newUserPassword);
  await page.getByLabel('Repite la contraseña').fill(newUserPassword);
  await page.getByRole('button', { name: 'Crear cuenta y continuar' }).click();

  await expect(page).toHaveURL(/\/setup/);
  await expect(page.getByRole('heading', { name: 'Tu cuenta principal' })).toBeVisible();
  await capture(page, 'setup-account', 'Onboarding · cuenta', 'Primer paso: la cuenta principal y su saldo actual, origen de todo el presupuesto.');

  await page.getByLabel('Nombre').fill('Banco');
  await page.getByLabel('Saldo actual').fill('1250.50');
  await page.getByRole('button', { name: 'Guardar y continuar' }).click();

  await expect(page.getByRole('heading', { name: 'Elige tus primeras categorías' })).toBeVisible();
  await page.getByLabel('Nueva categoría').fill('Salud');
  await page.getByRole('button', { name: 'Agregar' }).click();
  await page.getByLabel('Nueva categoría').fill('Ocio');
  await page.getByRole('button', { name: 'Agregar' }).click();
  await capture(page, 'setup-categories', 'Onboarding · categorías', 'Segundo paso: las prioridades de gasto que ordenan el plan mensual.');

  await page.getByRole('button', { name: 'Revisar' }).click();
  await expect(page.getByRole('heading', { name: 'Tu presupuesto empieza con esto' })).toBeVisible();
  await capture(page, 'setup-review', 'Onboarding · revisión', 'Tercer paso: resumen verificable antes de abrir el presupuesto.');

  await page.getByRole('button', { name: 'Abrir mi presupuesto' }).click();
  await expect(page).toHaveURL(/\/budget/);
  await expect(page.getByText('Disponible para asignar', { exact: true })).toBeVisible();
  await capture(page, 'budget-fresh', 'Presupuesto recién creado', 'Estado inicial: el saldo de apertura está disponible para asignar y aún no existe historial.');

  // ---------------------------------------------------------------- Switch to the seeded demo budget
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel('Correo').fill(demoEmail);
  await page.getByLabel('Contraseña').fill(demoPassword);
  await capture(page, 'login-demo', 'Inicio de sesión de la cuenta demo', 'La cuenta sembrada en la base de datos local concentra meses de historia real.');

  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/budget/);
  await expect(page.getByRole('heading', { name: 'Presupuesto' })).toBeVisible();
  await expect(page.getByText('Disponible para asignar', { exact: true })).toBeVisible();
  await capture(page, 'budget-overview', 'Presupuesto mensual', 'Disponible para asignar, saldo total en cuentas, asignado del mes y categorías con objetivo; incluye el aviso de ingresos pendientes de liberar.');

  const budgetResponse = await page.request.get('/api/v1/budgets');
  expect(budgetResponse.ok()).toBeTruthy();
  const budget = (await budgetResponse.json()).data as { id: string; accounts: { id: string; name: string }[]; categories: { id: string; name: string }[] };
  const categoryId = (name: string) => budget.categories.find((category) => category.name === name)!.id;
  const accountId = (name: string) => budget.accounts.find((account) => account.name === name)!.id;

  const foodRow = page.getByTestId(`category-${categoryId('Comida')}`);
  await foodRow.getByRole('button', { name: 'Editar objetivo' }).click();
  await expect(foodRow.getByLabel('Tipo de objetivo')).toBeVisible();
  await capture(page, 'budget-target-editor', 'Objetivo de categoría en contexto', 'El objetivo se define y se edita dentro de la fila de la categoría, sin salir del presupuesto.');
  await foodRow.getByRole('button', { name: 'Cancelar' }).click();

  const leisureRow = page.getByTestId(`category-${categoryId('Ocio')}`);
  await expect(leisureRow.locator('.target-suggestion')).toBeVisible();
  await capture(page, 'budget-target-suggestion', 'Sugerencia de financiación', 'Una categoría por debajo de su objetivo propone una asignación concreta y explica cuánto falta.');

  await leisureRow.getByRole('button', { name: 'Revisar sugerencia' }).click();
  await capture(page, 'budget-target-confirm', 'Confirmación explícita de la sugerencia', 'La sugerencia no se aplica sola: requiere confirmación y mantiene el control en manos de la persona.');
  await leisureRow.getByRole('button', { name: 'Confirmar asignación' }).click();

  await page.getByTestId(`category-${categoryId('Ahorro')}`).getByRole('button', { name: 'Ajustar' }).click();
  await capture(page, 'budget-adjust-panel', 'Ajuste contextual del plan', 'Agregar, retirar o mover dinero sobre la misma categoría, con el saldo disponible siempre a la vista.');
  await page.getByTestId(`category-${categoryId('Ahorro')}`).getByRole('button', { name: 'Ajustar' }).click();

  await page.getByRole('button', { name: 'Mes anterior' }).click();
  await capture(page, 'budget-previous-month', 'Mes anterior', 'La misma superficie, un mes anterior: las asignaciones y el historial se reconstruyen por mes.');
  await page.getByRole('button', { name: 'Mes siguiente' }).click();

  // ---------------------------------------------------------------- Transactions
  await page.getByRole('link', { name: 'Transacciones' }).click();
  await expect(page).toHaveURL(/\/transactions/);
  await expect(page.getByRole('region', { name: 'Historial de transacciones' })).toBeVisible();
  await capture(page, 'transactions-history', 'Historial de transacciones', 'Historial cargado automáticamente con filtros por cuenta, categoría, tipo y rango de fechas.', { fullPage: false });

  await page.getByRole('button', { name: '+ Nueva transacción' }).click();
  await expect(page.getByRole('heading', { name: 'Registrar transacción' })).toBeVisible();
  await page.getByLabel('Monto').fill('36.80');
  await page.getByLabel('Categoría').selectOption({ label: 'Comida' });
  await page.getByLabel('Comercio / persona').fill('Panadería del barrio');
  await page.getByLabel('Nota').fill('Desayuno de trabajo');
  await capture(page, 'transaction-new-expense', 'Registrar un gasto', 'Un único diálogo cubre gasto, ingreso y transferencia.', { fullPage: false });

  await page.getByRole('button', { name: 'Transferencia' }).click();
  await page.getByLabel('Hacia la cuenta').selectOption({ label: 'Ahorros' });
  await page.getByLabel('Referencia').fill('Traspaso a ahorro');
  await capture(page, 'transaction-new-transfer', 'Registrar una transferencia', 'La transferencia pide origen y destino y produce un único movimiento canónico en el historial.', { fullPage: false });
  await page.getByRole('button', { name: 'Gasto' }).click();
  // Switching kind relabels the field but keeps its value, so restore the expense payee before saving.
  await page.getByLabel('Comercio / persona').fill('Panadería del barrio');
  await page.getByRole('button', { name: 'Guardar transacción' }).click();

  const history = page.getByRole('region', { name: 'Historial de transacciones' });
  await expect(history).toContainText('Panadería del barrio');
  await capture(page, 'transactions-after-save', 'Historial actualizado', 'El movimiento recién registrado aparece en el historial efectivo sin recargar la página.', { fullPage: false });

  await page.getByRole('button', { name: 'Editar transacción' }).first().click();
  await expect(page.getByRole('heading', { name: 'Editar transacción' })).toBeVisible();
  await capture(page, 'transaction-edit', 'Editar una transacción', 'Los movimientos ordinarios admiten edición de monto, fecha, categoría, comercio y nota.', { fullPage: false });
  await page.getByRole('button', { name: 'Cancelar' }).click();

  await page.getByRole('button', { name: 'Eliminar transacción' }).first().click();
  await expect(page.getByRole('heading', { name: '¿Eliminar esta transacción?' })).toBeVisible();
  await capture(page, 'transaction-delete-confirm', 'Eliminar una transacción', 'El borrado es explícito, auditado y protegido por confirmación.', { fullPage: false });
  await page.getByRole('button', { name: 'Cancelar' }).click();

  await page.getByLabel('Buscar transacciones').fill('Mercado');
  await page.getByRole('button', { name: 'Buscar', exact: true }).click();
  await expect(history).toContainText('Mercado');
  await capture(page, 'transactions-search', 'Búsqueda literal', 'La búsqueda revisa comercio, nota y cuenta con coincidencia literal.', { fullPage: false });

  // ---------------------------------------------------------------- Accounts
  await page.getByRole('link', { name: 'Cuentas' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Cuentas' })).toBeVisible();
  await capture(page, 'accounts', 'Cuentas', 'Saldo total, saldos por cuenta, cuentas archivadas con su historial conservado y alta de nuevas cuentas.');

  await page.getByRole('button', { name: '+ Añadir cuenta' }).click();
  await expect(page.getByRole('heading', { name: 'Añadir al presupuesto' })).toBeVisible();
  await page.getByLabel('Nombre').first().fill('Fondo de emergencia');
  await page.getByLabel('Tipo').first().selectOption('checking');
  await page.getByLabel('Saldo inicial').fill('500.00');
  await capture(page, 'account-new-form', 'Añadir una cuenta al presupuesto', 'El alta de cuentas vive en la superficie de cuentas, no dentro del flujo diario de gastos.');
  await page.getByRole('button', { name: 'Cancelar' }).click();

  await page.getByRole('button', { name: 'Renombrar' }).first().click();
  await expect(page.getByRole('heading', { name: 'Renombrar cuenta' })).toBeVisible();
  await capture(page, 'account-rename', 'Renombrar una cuenta', 'El ciclo de vida de la cuenta incluye renombrar y archivar sin perder el historial.');
  await page.getByRole('button', { name: 'Cancelar' }).click();

  await page.getByRole('button', { name: 'Archivar' }).first().click();
  await expect(page.getByRole('heading', { name: /¿Archivar/ })).toBeVisible();
  await capture(page, 'account-archive-confirm', 'Archivar una cuenta', 'Archivar es reversible a nivel de datos: la cuenta sale del uso diario y su historial se conserva.');
  await page.getByRole('button', { name: 'Cancelar' }).click();

  await page.goto(`/accounts/${accountId('Cuenta principal')}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Cuenta principal' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Movimientos' })).toBeVisible();
  await capture(page, 'account-detail', 'Detalle de cuenta', 'Movimientos de una cuenta concreta y su saldo derivado del historial autoritativo.', { fullPage: false });

  // ---------------------------------------------------------------- Reports
  await page.getByRole('link', { name: 'Reportes' }).click();
  await expect(page).toHaveURL(/\/reports$/);
  await page.getByLabel('Mes del reporte').fill(currentMonth);
  await expect(page.getByRole('heading', { name: 'Ingresos y gastos del mes' })).toBeVisible();
  await capture(page, 'report-monthly', 'Reporte mensual', 'Ingresos, gastos, gasto por categoría, transferencias, movimientos provisionales e ingresos pendientes de liberar, con la política de reporte declarada.');

  await page.getByRole('link', { name: 'Meses lado a lado' }).click();
  await expect(page).toHaveURL(/\/reports\/trends/);
  await page.getByLabel('Mes de inicio').fill(shiftMonth(currentMonth, -3));
  await page.getByLabel('Mes de fin').fill(currentMonth);
  await expect(page.getByRole('table', { name: /Resumen mensual/ })).toBeVisible();
  await capture(page, 'report-trends', 'Meses lado a lado', 'Rango inclusivo de hasta 24 meses: resumen mensual, gráfico de flujo, detalle por mes y totales del periodo.');

  // ---------------------------------------------------------------- Data settings
  await page.getByRole('link', { name: 'Configuración' }).click();
  await expect(page).toHaveURL(/\/settings\/data/);
  await expect(page.getByRole('region', { name: 'Importar y exportar CSV' })).toBeVisible();
  await capture(page, 'settings-csv', 'Importar y exportar CSV', 'Herramientas de datos fuera del flujo cotidiano: exportación determinista del historial efectivo.');

  // The CSV contract is strict: UTF-8 without BOM, CRLF records including the final terminator, and
  // canonical UUIDs for account and category. The fixture mixes one valid row with two invalid rows,
  // which is enough to render the all-or-nothing diagnostics panel without persisting anything.
  const importFixture = path.join(tmpdir(), `ynab-import-${randomUUID()}.csv`);
  const crlf = (line: string) => `${line}\r\n`;
  await writeFile(
    importFixture,
    [
      'date,type,account,amountMinor,category,payee,memo',
      `2026-08-05,SPENDING,${accountId('Cuenta principal')},1850,${categoryId('Comida')},Mercado,Compra semanal`,
      `2026-08-06,UNKNOWN,${accountId('Cuenta principal')},100,,`,
      `2026-08-07,SPENDING,${accountId('Cuenta principal')},0,${categoryId('Comida')},Feria,`,
    ].map(crlf).join(''),
    'utf8',
  );
  await page.getByLabel('Archivo CSV').setInputFiles(importFixture);
  await page.getByRole('button', { name: 'Importar CSV' }).click();
  await expect(page.getByRole('heading', { name: 'Revisa estas filas' })).toBeVisible();
  await capture(page, 'settings-csv-diagnostics', 'Diagnóstico de importación', 'La importación es todo-o-nada: los errores se listan por fila y campo y ninguna fila se guarda.');

  // ---------------------------------------------------------------- Mobile surface
  await page.setViewportSize({ width: 320, height: 820 });
  await page.goto('/budget');
  await expect(page.getByRole('navigation', { name: 'Navegación móvil' })).toBeVisible();
  await capture(page, 'mobile-budget', 'Presupuesto en móvil', 'La misma superficie en 320 px: la barra inferior conserva las seis secciones con sus etiquetas completas y se desplaza en horizontal en lugar de partir las palabras.', { fullPage: false });

  await page.getByRole('navigation', { name: 'Navegación móvil' }).getByRole('link', { name: 'Meses lado a lado' }).click();
  await expect(page).toHaveURL(/\/reports\/trends$/);
  await page.getByLabel('Mes de inicio').fill(shiftMonth(currentMonth, -3));
  await page.getByLabel('Mes de fin').fill(currentMonth);
  await expect(page.getByRole('table', { name: /Resumen mensual/ })).toBeVisible();
  await capture(page, 'mobile-trends', 'Meses lado a lado en móvil', 'El reporte comparativo también se adapta al ancho mínimo soportado.', { fullPage: false });

  // ---------------------------------------------------------------- Closing the loop
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page).toHaveURL(/\/login/);
  await capture(page, 'logout', 'Cierre de sesión', 'El ciclo termina donde empezó: la sesión se revoca y la persona vuelve a la pantalla de acceso.');

  await writeFile(
    path.join(screenshotsDir, 'manifest.json'),
    `${JSON.stringify({ generatedAt: new Date().toISOString(), baseUrl: 'http://127.0.0.1:3000', captures }, null, 2)}\n`,
    'utf8',
  );
});
