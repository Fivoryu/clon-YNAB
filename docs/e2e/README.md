# Recorrido E2E con capturas

Evidencia visual del producto tal como se entrega en el commit `2f5dd92` (`master`). Cada imagen
proviene de una ejecución real del navegador contra la aplicación en local: Next.js en
`http://127.0.0.1:3000`, la API HTTP en `http://127.0.0.1:3001` y PostgreSQL 16 como autoridad
financiera. No hay maquetas, datos inventados en el DOM ni componentes aislados: es la interfaz
completa, con navegación, estados de carga, validaciones y mensajes reales.

El recorrido empieza en la pantalla de acceso, sigue con el alta y el onboarding de una cuenta
nueva, y continúa sobre una cuenta demo sembrada en la base de datos local con cuatro meses de
historial. Termina cerrando sesión, de modo que el ciclo documentado va del login al logout
pasando por todas las superficies entregadas.

## Cómo reproducirlo

Requiere Node.js 22+, PostgreSQL 16 (el `docker compose` del repositorio) y Chromium de Playwright.

```bash
npm ci
npx playwright install chromium
docker compose up -d postgres
DATABASE_URL=postgresql://ynab:ynab_local@localhost:5434/ynab_dev npm run db:generate
DATABASE_URL=postgresql://ynab:ynab_local@localhost:5434/ynab_dev npm run db:migrate
```

Las capturas se regeneran con un único comando, que levanta API y web, reconstruye la cuenta demo en
la base de datos de desarrollo local, recorre la aplicación y reescribe `screenshots/`:

```bash
npm run docs:screenshots
```

Para sembrar únicamente los datos en la base de datos local:

```bash
DATABASE_URL=postgresql://ynab:ynab_local@localhost:5434/ynab_dev npm run seed:demo
DATABASE_URL=postgresql://ynab:ynab_local@localhost:5434/ynab_dev npm run seed:demo -- --reset
```

`--reset` vacía la base de datos de desarrollo local (`TRUNCATE "User" CASCADE`) antes de sembrar.
Es la forma de volver a un estado determinista; sin el indicador, el sembrador es idempotente y no
toca datos existentes.

`npm run docs:screenshots` también reconstruye la semilla antes de capturar, porque el recorrido
modifica el estado demo a propósito (confirma una sugerencia, registra una transacción y crea un
usuario nuevo). Si la base de datos local contiene trabajo que no debe truncarse, exporta
`E2E_KEEP_DB=1` para sembrar de forma idempotente.

## Conjunto de datos sembrado

El sembrador (`scripts/seed-demo-data.mjs`) usa exclusivamente la API pública, así que el estado
sembrado pasa por las mismas validaciones, el mismo control de versión optimista y la misma
persistencia que la interfaz. Credenciales: `demo@presupuesto.local` / `demo-presupuesto-2026`.

| Elemento | Contenido |
| --- | --- |
| Cuentas | Cuenta principal, Efectivo y Ahorros activas; Cuenta antigua archivada |
| Categorías | Vivienda, Comida, Transporte, Servicios, Salud, Ocio, Educación y Ahorro activas; Vacaciones archivada con su objetivo conservado |
| Objetivos | Ocho objetivos de apartado mensual y un objetivo de saldo para una fecha (`Ahorro`, marzo de 2027) |
| Historial | Cuatro meses de ingresos, gastos, transferencias y asignaciones, con un ingreso pendiente de liberar en el mes actual |
| Estados de objetivo | Objetivos cumplidos, un objetivo en progreso con sugerencia de financiación y una categoría archivada legible |

El objetivo de `Ocio` se deja deliberadamente por debajo de su meta para que el presupuesto muestre
una sugerencia real en lugar de un tablero completamente satisfecho.

## Índice de capturas

`screenshots/manifest.json` registra, para cada imagen, el archivo, el título, la descripción y la
ruta donde se tomó. Es la fuente de verdad del orden publicado aquí.

### 1. Acceso y onboarding

| Captura | Momento |
| --- | --- |
| [01 · Inicio de sesión](screenshots/01-login.png) | `/login` · entrada al producto con sesiones administradas por el servidor |
| [02 · Crear una cuenta](screenshots/02-register.png) | `/register` · registro separado del acceso; al completarlo la sesión se abre sola |
| [03 · Onboarding · cuenta](screenshots/03-setup-account.png) | `/setup` · cuenta principal y saldo actual, origen del presupuesto |
| [04 · Onboarding · categorías](screenshots/04-setup-categories.png) | `/setup` · prioridades de gasto que ordenan el plan |
| [05 · Onboarding · revisión](screenshots/05-setup-review.png) | `/setup` · resumen verificable antes de abrir el presupuesto |
| [06 · Presupuesto recién creado](screenshots/06-budget-fresh.png) | `/budget` · saldo de apertura disponible para asignar, sin historial |

![Inicio de sesión](screenshots/01-login.png)
![Crear una cuenta](screenshots/02-register.png)
![Onboarding: cuenta](screenshots/03-setup-account.png)
![Onboarding: categorías](screenshots/04-setup-categories.png)
![Onboarding: revisión](screenshots/05-setup-review.png)
![Presupuesto recién creado](screenshots/06-budget-fresh.png)

### 2. Presupuesto mensual y objetivos de categoría

| Captura | Momento |
| --- | --- |
| [07 · Acceso a la cuenta demo](screenshots/07-login-demo.png) | `/login` · la cuenta sembrada concentra meses de historia |
| [08 · Presupuesto mensual](screenshots/08-budget-overview.png) | `/budget` · disponible para asignar, saldo total, asignado del mes, objetivos y aviso de ingresos pendientes |
| [09 · Objetivo en contexto](screenshots/09-budget-target-editor.png) | `/budget` · el objetivo se define dentro de la fila de la categoría |
| [10 · Sugerencia de financiación](screenshots/10-budget-target-suggestion.png) | `/budget` · una categoría bajo su meta propone cuánto falta |
| [11 · Confirmación de la sugerencia](screenshots/11-budget-target-confirm.png) | `/budget` · la sugerencia nunca se aplica sola |
| [12 · Ajuste contextual](screenshots/12-budget-adjust-panel.png) | `/budget` · agregar, retirar o mover dinero sobre la misma categoría |
| [13 · Mes anterior](screenshots/13-budget-previous-month.png) | `/budget` · la misma superficie reconstruida para otro mes |

![Acceso a la cuenta demo](screenshots/07-login-demo.png)
![Presupuesto mensual](screenshots/08-budget-overview.png)
![Objetivo en contexto](screenshots/09-budget-target-editor.png)
![Sugerencia de financiación](screenshots/10-budget-target-suggestion.png)
![Confirmación de la sugerencia](screenshots/11-budget-target-confirm.png)
![Ajuste contextual](screenshots/12-budget-adjust-panel.png)
![Mes anterior](screenshots/13-budget-previous-month.png)

### 3. Transacciones

| Captura | Momento |
| --- | --- |
| [14 · Historial](screenshots/14-transactions-history.png) | `/transactions` · historial automático con filtros e ingresos pendientes accionables |
| [15 · Registrar un gasto](screenshots/15-transaction-new-expense.png) | `/transactions` · gasto, ingreso y transferencia en un único diálogo |
| [16 · Registrar una transferencia](screenshots/16-transaction-new-transfer.png) | `/transactions` · origen y destino, con un único movimiento canónico |
| [17 · Historial actualizado](screenshots/17-transactions-after-save.png) | `/transactions` · el movimiento aparece sin recargar la página |
| [18 · Editar](screenshots/18-transaction-edit.png) | `/transactions` · monto, fecha, categoría, comercio y nota |
| [19 · Eliminar](screenshots/19-transaction-delete-confirm.png) | `/transactions` · borrado explícito, auditado y confirmado |
| [20 · Búsqueda literal](screenshots/20-transactions-search.png) | `/transactions` · búsqueda por comercio, nota y cuenta |

![Historial de transacciones](screenshots/14-transactions-history.png)
![Registrar un gasto](screenshots/15-transaction-new-expense.png)
![Registrar una transferencia](screenshots/16-transaction-new-transfer.png)
![Historial actualizado](screenshots/17-transactions-after-save.png)
![Editar una transacción](screenshots/18-transaction-edit.png)
![Eliminar una transacción](screenshots/19-transaction-delete-confirm.png)
![Búsqueda literal](screenshots/20-transactions-search.png)

### 4. Cuentas

| Captura | Momento |
| --- | --- |
| [21 · Cuentas](screenshots/21-accounts.png) | `/accounts` · saldo total, saldos por cuenta y cuentas archivadas |
| [22 · Añadir cuenta](screenshots/22-account-new-form.png) | `/accounts` · alta fuera del flujo diario de gastos |
| [23 · Renombrar cuenta](screenshots/23-account-rename.png) | `/accounts` · renombrar sin perder historial |
| [24 · Archivar cuenta](screenshots/24-account-archive-confirm.png) | `/accounts` · archivar conserva el historial |
| [25 · Detalle de cuenta](screenshots/25-account-detail.png) | `/accounts/{id}` · movimientos y saldo derivado del historial autoritativo |

![Cuentas](screenshots/21-accounts.png)
![Añadir una cuenta](screenshots/22-account-new-form.png)
![Renombrar una cuenta](screenshots/23-account-rename.png)
![Archivar una cuenta](screenshots/24-account-archive-confirm.png)
![Detalle de cuenta](screenshots/25-account-detail.png)

### 5. Reportes

| Captura | Momento |
| --- | --- |
| [26 · Reporte mensual](screenshots/26-report-monthly.png) | `/reports` · ingresos, gastos, gasto por categoría, transferencias, movimientos provisionales y política `report-policy/v1` |
| [27 · Meses lado a lado](screenshots/27-report-trends.png) | `/reports/trends` · rango inclusivo de hasta 24 meses sin análisis de tendencia |

![Reporte mensual](screenshots/26-report-monthly.png)
![Meses lado a lado](screenshots/27-report-trends.png)

### 6. Datos, móvil y cierre

| Captura | Momento |
| --- | --- |
| [28 · Importar y exportar CSV](screenshots/28-settings-csv.png) | `/settings/data` · exportación determinista del historial efectivo |
| [29 · Diagnóstico de importación](screenshots/29-settings-csv-diagnostics.png) | `/settings/data` · importación todo-o-nada con errores por fila y campo |
| [30 · Presupuesto en móvil](screenshots/30-mobile-budget.png) | `/budget` · la misma superficie en 320 px, con etiquetas completas y barra desplazable |
| [31 · Meses lado a lado en móvil](screenshots/31-mobile-trends.png) | `/reports/trends` · el reporte también se adapta al ancho mínimo |
| [32 · Cierre de sesión](screenshots/32-logout.png) | `/login` · la sesión se revoca y el ciclo vuelve al inicio |

![Importar y exportar CSV](screenshots/28-settings-csv.png)
![Diagnóstico de importación](screenshots/29-settings-csv-diagnostics.png)
![Presupuesto en móvil](screenshots/30-mobile-budget.png)
![Meses lado a lado en móvil](screenshots/31-mobile-trends.png)
![Cierre de sesión](screenshots/32-logout.png)

## Alcance y límites de esta evidencia

- Las capturas son evidencia visual, no una prueba automatizada. Las aserciones funcionales viven
  en `apps/web/e2e/*.spec.ts` (`npm run test:e2e`) y no dependen de este directorio.
- La ejecución de capturas guarda una transacción (`Panadería del barrio`) en la cuenta demo para
  documentar el alta real y confirma una sugerencia de financiación. Por eso el arnés reconstruye la
  semilla al inicio; `npm run seed:demo -- --reset` la restaura manualmente.
- Cada ejecución registra además un usuario nuevo en la base de datos local para documentar el
  onboarding. Ambos efectos se limitan a la base de datos de desarrollo local.
- El historial de la captura 14 y los diálogos sobre el historial se capturan a tamaño de viewport
  porque la lista crece sin límite; el resto se captura a página completa.
- Las capturas de página completa pintan la banda lateral del sidebar a lo largo de todo el
documento. El sidebar real es `position: fixed` y mide `100vh`, así que sin esa banda una imagen de
2 800 px publicaría un bloque oscuro de 900 px y una columna izquierda vacía debajo.
- El indicador de desarrollo de Next.js está desactivado en `next.config.mjs` para que no tape la
  primera sección de la barra móvil ni aparezca en la evidencia publicada.
