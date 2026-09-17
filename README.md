# YNAB Clone — Academic Project

Modular-monolith budgeting application inspired by YNAB concepts. The clone uses its own implementation and contracts; it is not the official YNAB product.

## Stack

- Node.js 22+
- TypeScript
- Next.js 15 / React 19
- PostgreSQL 16
- Prisma 6
- Node test runner + Playwright

## Implemented scope

- Local authentication and server-managed sessions
- Budget setup with categories and cash/checking accounts
- Multiple accounts, rename/archive lifecycle, per-account and aggregate balances
- Assign, unassign and move budget money
- Realized income, categorized spending and explicit income release
- Effective transaction history with edit/delete for supported ordinary transactions
- Same-budget transfers with one canonical history item and paired durable effects
- Payee/memo metadata, history filters and literal search
- Dashboard/monthly summary derived from authoritative history
- Manual CSV import/export for `INCOME`, `SPENDING` and `TRANSFER`


## UX actual

La interfaz está organizada por tareas del usuario y usa rutas reales de Next.js:

- `/login` y `/register`: acceso separado; el registro inicia sesión automáticamente.
- `/setup`: onboarding progresivo de cuenta → categorías → revisión.
- `/budget`: presupuesto mensual, dinero disponible y ajustes contextuales por categoría.
- `/transactions`: historial cargado automáticamente y un único flujo para gasto, ingreso o transferencia.
- `/accounts`: gestión de cuentas activas/archivadas.
- `/settings/data`: importación/exportación CSV fuera del flujo cotidiano.

Los importes se muestran como valores decimales legibles en la UI y se convierten internamente a `amountMinor` antes de llamar a la API. La API y PostgreSQL siguen siendo la autoridad financiera.

## CSV contract

Canonical header:

```text
date,type,account,amountMinor,category,payee,memo
```

The format is strict UTF-8 without BOM, RFC 4180 quoting and CRLF record endings (including the final terminator). Import accepts at most 10 MiB and 5,000 data rows and returns at most 1,000 diagnostics. Transfers encode the account cell as `sourceAccountId=>destinationAccountId`. Imports are all-or-nothing, require `Idempotency-Key` and `If-Match`, and increment the budget version exactly once on success. Export is deterministic, effective-history-only and version-neutral.

Endpoints:

```text
GET  /api/v1/budgets/{budgetId}/transactions/export
POST /api/v1/budgets/{budgetId}/transactions/import
```

## Local setup

```bash
cp .env.example .env
npm ci
npm run db:generate
docker compose up -d postgres
npm run db:migrate
```

Export `DATABASE_URL` when your shell does not automatically load `.env`:

```bash
export DATABASE_URL=postgresql://ynab:ynab_local@localhost:5432/ynab_dev
```

Run the API and web app in separate terminals:

```bash
npm run dev:api
npm run dev:web
```

## Verification

Focused CSV tests:

```bash
npm run test:csv
```

Complete API/unit/integration suite:

```bash
npm test
```

Frontend checks:

```bash
npm run typecheck:web
npm run build:web
```

Browser journey (requires Playwright Chromium):

```bash
npx playwright install chromium
npm run test:e2e
```

Or run the non-browser verification bundle:

```bash
npm run verify
```

PostgreSQL-backed tests are designed to use `DATABASE_URL`. Tests that explicitly require a database skip when it is absent; with the local Compose database running they exercise durability, restart/rebuild, rollback, idempotency and concurrency.

## Database

The local Compose configuration exposes PostgreSQL at `localhost:5432` with database/user/password `ynab_dev` / `ynab` / `ynab_local` for development only. Prisma schema and migrations live under `apps/api/prisma`.

## Product boundaries

The current clone intentionally does not implement bank synchronization, cards/credit-card workflows, split transactions, reconciliation, scheduled transactions, background CSV jobs or multi-user collaboration. Those are explicit non-goals of the delivered slices rather than unfinished TODOs.
