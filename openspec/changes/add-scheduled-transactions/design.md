# Design: Scheduled Transactions

## 1. Context and what already exists

The phase adds one persisted planning entity and one explicit generation command. It does not add a runtime, a worker, a queue, or a money formula.

Verified starting facts (read-only exploration, 2026-10-01):

- `assertSupportedCommand` lists `scheduled` among the deferred commands (`apps/api/src/planning/engine.ts:146-150`), but **it has no production caller**: the only callers are `apps/api/test/engine.test.ts:15,101-102`. What keeps scheduling unavailable today is the absence of routes, not that set. The new capability MUST NOT rely on that set for any guarantee.
- The ordinary command path already provides the atomicity, authorization and idempotency this phase needs: `FinancialStore.execute` writes the events, the version and the receipt in one transaction, replays the saved result for the same payload digest, and returns `CONFLICT` when a key is reused with a different payload (`apps/api/src/persistence/financial-store.ts:122-157`, especially `:129-135`). The receipt key is unique per budget (`apps/api/prisma/schema.prisma:313-322`).
- Transaction creation today goes `server.ts` route → `app.ts` `recordIncome`/`recordSpending` (`apps/api/src/app.ts:307-312`, `:323-328`) → `this.financial(...)` (`:592-596`) → `financialStore.execute`. Creation **omits** `cleared` and the adapter defaults it to `false` (`financial-store.ts:230`).
- The cleared-state invariant has one shared guard, `clearedStateViolation` (`engine.ts:20-24`), which both persistence adapters call (`financial-store.ts:219-220`; `in-memory-budget-store.ts:22`). It forbids a cleared or reconciled `WORKING` event, and requires a reconciled event to be cleared. A posted transaction may be cleared.
- The budget timezone is a literal type, not a variable: `FinancialState.timezone: 'UTC'` (`financial-store.ts:47`) with `String @default("UTC")` in Prisma (`schema.prisma:120`). The month is derived through `Intl.DateTimeFormat` with that zone (`engine.ts:129-143`).
- The closest precedent for adding a persisted planning entity is `CategoryTarget` (`schema.prisma:180-189`): its own table keyed by the category, written through an additive `persistTarget` capability on `FinancialStore`, loaded in `readState` into `FinancialState.targets`, and projected in exactly one place. Both financial adapters carry it.
- No schedule or occurrence table, code, route, or job exists anywhere. The next migration number is `0011`.

## 2. Resolved decisions

| Decision | Choice | Consequence |
| --- | --- | --- |
| Recurrence shape | One monthly cadence: `dayOfMonth` 1-31 + `intervalMonths` 1-12 | No second anchor, no second date arithmetic; weekly/annual stay out |
| Generation timing | Explicit owner-triggered command with an inclusive cut-off date | No background execution, no timezone/cron policy, deterministic and replayable |
| Posting | Auto-post per eligible occurrence | No "pending occurrence" state, no additional persisted lifecycle |
| Cash exception | Cleared only for `AccountKind.CASH`; every other generated transaction uncleared | Requires `cleared` to be explicit at every creation site |
| Catch-up | Every occurrence up to the cut-off is generated, each with its own identity | No "missed occurrence" policy and no cursor |
| Surface | API plus an account-scoped web surface | Matches every previous phase; browser coverage is mandatory |

## 3. Data model

New enum and table, added in migration `0011_scheduled_transactions`:

```
enum ScheduledFlow { INCOME, SPENDING }

model ScheduledTransaction {
  id            String        @id @db.Uuid
  budgetId      String        @db.Uuid
  accountId     String        @db.Uuid
  categoryId    String?       @db.Uuid
  flow          ScheduledFlow
  amountMinor   BigInt
  payee         String?
  memo          String?
  dayOfMonth    Int
  intervalMonths Int
  startDate     DateTime      @db.Date
  createdAt     DateTime      @default(now()) @db.Timestamptz(6)
  updatedAt     DateTime      @updatedAt @db.Timestamptz(6)

  budget   Budget    @relation(fields: [budgetId], references: [id], onUpdate: NoAction, onDelete: Restrict)
  account  Account   @relation(fields: [budgetId, accountId], references: [budgetId, id], onUpdate: NoAction, onDelete: Restrict)
  category Category? @relation(fields: [budgetId, categoryId], references: [budgetId, id], onUpdate: NoAction, onDelete: Restrict)

  @@index([budgetId])
  @@index([budgetId, accountId])
}
```

Design notes:

- **No occurrence table.** The record that an occurrence happened is the ordinary command's receipt, which is the mechanism the contract asks for ("a stable occurrence identity or equivalent idempotency mechanism", `functional-requirements.md:357`). A second table would be a second authority for the same fact.
- **No `nextOccurrence` cursor.** Same reason. The eligible set is derived from `startDate`, the interval and the cut-off.
- **No `archived` flag.** The capability has no archive semantics; removal is removal, and a removed schedule stops generating while already generated occurrences remain ordinary history.
- **`payee`/`memo` are optional**, mirroring the normalized metadata contract the transaction commands already accept.
- The table is *not* referenced by any projection. That is what makes "no effect before occurrence" structural rather than a rule someone must remember.

## 4. Occurrence derivation

A new pure module, `apps/api/src/planning/schedules.ts`, with no I/O:

- `scheduleOccurrences(schedule, cutoffDate): string[]` — calendar dates (`YYYY-MM-DD`) from `startDate`, stepping `intervalMonths`, keeping only dates on or before the cut-off, each clamped to the month's last day when `dayOfMonth` exceeds that month's length. Clamping is per occurrence and does **not** mutate `dayOfMonth`, so a 31st schedule recovers its day in a longer month.
- `occurrenceIdentity(scheduleId, occurrenceDate): string` — `sch:<scheduleId>:<YYYY-MM-DD>`.
- `generatedCleared(accountKind): boolean` — `true` for `CASH`, `false` otherwise.
- `validateScheduleDefinition(...)` — the field-level rules, including flow/category coupling.

Date arithmetic MUST be done on calendar components (year, month, day), never through millisecond offsets or local time, so a month boundary or a leap day cannot shift an occurrence. Month derivation stays subject to the existing budget timezone (`'UTC'`).

## 5. Generation flow and the single idempotency authority

`generateScheduledTransactions(budgetId, cutoffDate, requestIdempotencyKey)`:

1. Resolve the owner, the budget and the schedules in one read.
2. For each schedule, derive its eligible occurrences on or before the cut-off.
3. For each occurrence, submit the **existing** ordinary command with `Idempotency-Key = occurrenceIdentity(scheduleId, occurrenceDate)` and the schedule's account, category, amount, payee, memo, and `cleared = generatedCleared(account.kind)`.
4. Return an aggregate result: the occurrences considered, created, and replayed.

Two receipt levels, one mechanism:

- the **request-level** key deduplicates an identical generation request;
- the **per-occurrence** key deduplicates across differing or overlapping ranges, which is what makes replay and concurrency safe.

There is no third source of truth and no cursor. A partially failed run leaves nothing partially created because each occurrence is its own committed transaction; the retry creates exactly the missing ones.

Bound: occurrences are enumerated from the schedule's own `startDate`, and the caller always supplies the cut-off, so a long-overdue schedule generates its backlog deterministically rather than unboundedly.

## 6. Cleared-value coverage

`cleared` becomes an explicit parameter of the internal transaction creation path with **no implicit default at the call sites**, and every call site passes it:

| Call site | Value |
| --- | --- |
| `recordIncome` (public route) | `false` |
| `recordSpending` (public route) | `false` |
| generation, cash account | `true` |
| generation, non-cash account | `false` |

Each call site gets a test in **both** persistence adapters. This is the specific defect class ("the rule is right, the list of sites is wrong") that produced most of the previous phase's corrections.

## 7. Canonical modification, and why it is minimal

Both modifications preserve their canonical scenario name and bullet text verbatim, adding exactly one sentence:

- `reporting` / *Unsupported reporting concepts are excluded*: the added sentence distinguishes a generated transaction (ordinary, and therefore accounted for normally) from a schedule (never represented). Without it, a reader must decide for themselves whether a generated transaction appearing in the summary violates the exclusion that names scheduled transactions.
- `transaction-history` / *Bounded transaction-history scope*: the added sentence states that schedule management belongs to the other capability and that a generated transaction is governed by the history scope.

Nothing else in either requirement is reworded. `report-policy/v1` and `report-policy/v2` are not touched.

## 8. Surfaces to change

| # | Surface | Files |
| --- | --- | --- |
| 1 | Schema and migration | `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/0011_scheduled_transactions/` |
| 2 | Durable persistence | `apps/api/src/persistence/financial-store.ts` (load into state, additive write capability) |
| 3 | In-memory persistence | `apps/api/src/persistence/in-memory-budget-store.ts` — **both adapters or neither** |
| 4 | Pure domain | new `apps/api/src/planning/schedules.ts` |
| 5 | Commands and routes | `apps/api/src/app.ts`, `apps/api/src/server.ts` |
| 6 | Contract | `apps/api/openapi.yaml` |
| 7 | Web | `apps/web/app/accounts/[accountId]/page.tsx`, `apps/web/app/models.ts`, `apps/web/app/hooks/useBudgetApp.ts`, `apps/web/app/globals.css` |
| 8 | Tests | `apps/api/test/` (per adapter, HTTP, projection), `apps/web/test/`, `apps/web/e2e/` |
| 9 | Specs and product docs | this change's deltas; the three product-scope documents |

## 9. Rollback boundaries

- **Schema:** the table and enum are additive and referenced by no projection, so reverting the code leaves them inert.
- **Commands/routes:** reverting `app.ts`, `server.ts` and `openapi.yaml` removes the capability without touching history.
- **Generation:** reverting generation removes the ability to create occurrences; already generated transactions are ordinary history and stay.
- **Web:** the account-surface changes roll back together and leave the API intact.

## 10. Known limits, recorded rather than hidden

- A schedule cannot be edited; only removed and recreated.
- An already generated occurrence cannot be corrected through this capability; ordinary edit/delete remains deferred in this repository.
- Occurrence dates are calendar dates in a single budget timezone. Multi-timezone budgets remain unsupported, as they already are everywhere else.
- `.env.example` documents PostgreSQL on port `5432` while `docker-compose.yml` and `playwright.config.ts` use `5434`. Found during this phase's read-only exploration; it is a documentation defect in an unrelated file and is recorded as a follow-up rather than fixed here.

## 11. Decisions taken during apply

### 11.1 The anchor-day CHECK constraint lives in `0012`, not in `0011`

`0011_scheduled_transactions` was applied to the local database while this Work Unit was being written, so it was not edited afterwards. Editing an already-applied migration changes Prisma's recorded checksum and makes `migrate deploy` fail. The constraint that enforces `day(startDate) = min(dayOfMonth, daysInMonth(startDate))` therefore went into the additive `0012_schedule_anchor_invariant`. Evidence that `0011` is untouched: the `_prisma_migrations` checksum recorded for it equals the SHA-256 of the file on disk.

Prisma cannot express CHECK constraints, so `schema.prisma` carries no counterpart for any of them, exactly as with the pre-existing `FinancialEvent` constraints. That is a known modelling gap in Prisma, not a schema/model divergence to fix here.

### 11.2 An explicit `schedules: []` is legitimate; an omitted collection is not

`InMemoryBudgetStore.saveBudget` rejects a state whose `schedules` is `undefined` while the stored budget has schedules, but it ACCEPTS an explicit empty array. That asymmetry is deliberate, and an independent verification round proposed removing it; the proposal was rejected with this reasoning:

**Removing the last schedule legitimately produces an explicit empty array.** Deleting the final schedule goes through `command.deleteScheduleId`, which filters the loaded collection down to `[]` and then saves. Rejecting `[]` would make it impossible to delete the last schedule. The discriminator that matters is therefore `undefined` versus `[]`: `undefined` means "this caller did not provide schedules", which is suspicious when schedules exist; `[]` means "there are explicitly none", which is a legal state. The in-memory `schedules ?? []` defaults elsewhere are type-level consequences of the field being optional, not failure masks: they never turn a failed or unavailable read into an empty success, because there is no delegate to fail.

### 11.3 `PrismaBudgetStore` is deliberately deferred to Work Unit 2

The repository has three persistence objects, not two. `PrismaBudgetStore` (`apps/api/src/persistence/budget-store.ts`) is the setup store used by `saveSetup`; its `read` returns a `BudgetState` without schedules, and its `saveBudget` does not touch schedule rows. It is neither of the two financial adapters this Work Unit extends, and half-extending it would be worse than leaving it: giving its `read` schedules while its `saveBudget` cannot persist them would create a new asymmetry rather than remove one.

Consequence for Work Unit 2: the schedule commands and the list command MUST read through the schedule-aware path (`FinancialStore` / the in-memory financial adapter), not through `PrismaBudgetStore`. If any command ends up depending on `PrismaBudgetStore`, that store must be extended in both directions in the same Work Unit, with a test per direction.

### 11.4 Recorded finding: this repository has no working API typecheck

Discovered while reviewing Work Unit 1, and recorded rather than fixed because it is unrelated to this phase's scope:

- `package.json` has `typecheck:web` but no API typecheck, and there is no `tsconfig.json` under `apps/api`.
- `npm test` runs `node --experimental-strip-types`, which strips types without checking them, so API type errors are invisible to the test suite.
- The root `tsconfig.json` looks like an API typecheck but is dead configuration: every file that imports with a `.ts` extension fails `TS5097`, and with that noise suppressed it still reports about 600 pre-existing errors across `apps/api` and `apps/web`.

Workaround used for this phase, which gives a usable signal for the touched files:

```
npx tsc --noEmit --allowImportingTsExtensions -p tsconfig.json 2>&1 | grep -v TS5097 | grep -E "<touched files>"
```

A real API typecheck is a candidate for its own small change. It matters because the previous phase's most deceptive defect (a BigInt literal that broke the web build while 60 web tests stayed green) is the same class: a green test suite that does not typecheck the code it exercises.
