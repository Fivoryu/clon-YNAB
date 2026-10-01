# Design: Cleared State and Manual Reconciliation

**Draft for owner review. This design is written after the owner approved the scope boundary on 2026-09-29; it is not implementation authorization.**

## Context

The repository already persists `FinancialEvent.reconciled` and already rejects a reconciled item on the ordinary edit and delete paths. Nothing can set the flag, no cleared balance exists, and no reconciliation record exists. This design makes the existing dimension reachable, adds the cleared dimension beside it, and adds the balance and the event that give reconciliation meaning.

Two properties dominate every decision below:

1. **Financial neutrality of cleared state.** Clearing is a statement-matching fact, not a financial event. It must not move money, and it must not become a way to move money.
2. **No silent repair.** A reconciliation that does not match must either change nothing or change exactly the difference the owner explicitly confirmed.

## 1. Data model

### 1.1 `FinancialEvent` additions

| Field | Type | Purpose |
| --- | --- | --- |
| `cleared` | `Boolean @default(false)` | The item matched external account state |
| `reconciliationId` | `String? @db.Uuid` | The reconciliation that locked this item, when reconciled |

`reconciled` is reused unchanged as the lock. It is not replaced, so the existing guard at `apps/api/src/planning/transaction-history.ts:69` keeps working and no existing row changes meaning.

Invariant: `reconciled: true` implies `cleared: true`. The persistence layer MUST reject a row that violates it, and no command may construct one.

### 1.2 Derived public state

```
clearedState = reconciled ? 'RECONCILED' : cleared ? 'CLEARED' : 'UNCLEARED'
```

It is derived at projection time and never stored, exactly like target state in the previous phase. `status` (`POSTED`/`WORKING`) is untouched and remains a separate axis.

### 1.3 New `FinancialEventKind` values

- `RECONCILIATION_ADJUSTMENT` — the single account-local correction a confirmed mismatch creates.

`reconciled` and `cleared` are state, not kinds, so the `RECONCILIATION` lock is not a kind. The lock is expressed as superseding replacements of the affected items (section 3), each carrying `reconciled: true` and `reconciliationId`.

### 1.4 New `Reconciliation` model

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | `Uuid` | Reconciliation identity |
| `budgetId` | `Uuid` | Owning budget |
| `accountId` | `Uuid` | Reconciled account |
| `actorId` | `Uuid` | Actor identity |
| `confirmedClearedBalanceMinor` | `BigInt` | The external balance the owner confirmed |
| `observedClearedBalanceMinor` | `BigInt` | The computed cleared balance observed before adjustment |
| `adjustmentMinor` | `BigInt` | The confirmed adjustment, `0` when the balances matched |
| `reason` | `String?` | Required when `adjustmentMinor <> 0` |
| `month` | `VarChar(7)` | Budget month of the reconciliation, derived from its timestamp and the budget timezone |
| `createdAt` | `Timestamptz(6)` | Timestamp |
| Uniqueness | `@@unique([budgetId, id])` | Budget-scoped identity, matching the existing relation pattern |

Relation to `Budget` and `Account` follows the existing explicit-action style introduced by the schema-alignment change, so the schema continues to describe the database exactly.

### 1.5 Migration `0009_cleared_state_and_reconciliation`

1. `ALTER TABLE "FinancialEvent" ADD COLUMN "cleared" BOOLEAN NOT NULL DEFAULT false;`
2. `ALTER TABLE "FinancialEvent" ADD COLUMN "reconciliationId" UUID;` plus the foreign key.
3. `ALTER TYPE "FinancialEventKind" ADD VALUE 'RECONCILIATION_ADJUSTMENT';`
4. Create the `Reconciliation` table and its indexes.

Step 3 is the only risky step: on older PostgreSQL, `ALTER TYPE ... ADD VALUE` cannot run inside a transaction block. The migration must be validated against the documented local database (`localhost:5434`) before the phase closes, and the risk is recorded in `tasks.md` as a parent gate.

The migration is additive. Every existing transaction keeps its values, its `cleared` value defaults to false, and its existing `reconciled` value keeps its meaning; a pre-existing row therefore projects as `UNCLEARED` unless it was already reconciled.

## 2. Cleared transitions

### 2.1 Command

`PATCH /api/v1/budgets/{budgetId}/transactions/{itemId}/cleared`

- Body: `{ "cleared": boolean }` plus the established `version` and idempotency semantics.
- `itemId` is the history item identity: the transaction identity for income and spending, the transfer identity for a `TRANSFER` item.
- Response: the updated history item and the new budget version.

### 2.2 Rules

| Condition | Result |
| --- | --- |
| Item is `RECONCILED` | `CONFLICT`, no mutation |
| Item is `WORKING` and `cleared: true` | `CONFLICT`, no mutation — the shared guard in `apps/api/src/planning/engine.ts` is the single source of truth for this rejection, and it is the same rejection every adapter already applies on write |
| Item account is archived | Allowed — the transition is financially neutral and changes no balance |
| Item is a transfer | Both paired effects change atomically; financial content untouched |
| Otherwise | Superseding replacement with the new `cleared` value |

Eligibility reuses `assertEligibleTransaction`'s account-scoped evaluation (section 5), not the alias binding. A cleared-state transition is deliberately **not** routed through the ordinary edit path, so a cleared item stays editable and a transfer stays non-editable.

### 2.3 Financial neutrality

The replacement copies every financial field from the effective event and changes only `cleared` (and the chain linkage `supersedesEventId`, `id`, `createdAt`). A test MUST assert that no budgeting value moves.

## 3. Reconciliation

### 3.1 Command

`POST /api/v1/budgets/{budgetId}/accounts/{accountId}/reconciliation`

- Body:

| Field | Type | Notes |
| --- | --- | --- |
| `confirmedClearedBalanceMinor` | integer | Required, signed |
| `confirmAdjustment` | boolean | Default `false` |
| `reason` | string | Required when an adjustment is applied |
| `date` | `YYYY-MM-DD` | Optional; defaults to the reconciliation timestamp in the budget timezone |

- Plus the established version and idempotency semantics.
- Response: `{ reconciliationId, accountId, observedClearedBalanceMinor, confirmedClearedBalanceMinor, adjustmentMinor, lockedCount, month, version }`.

### 3.2 Algorithm

```
authorize owner(budget); reject if account archived
observed = clearedBalance(account)                       # section 4
difference = confirmed - observed
if difference != 0 and not confirmAdjustment:
    return CONFLICT { observed, confirmed, difference }  # no mutation
if difference != 0:
    require reason
    append RECONCILIATION_ADJUSTMENT effect (difference, account, reconciliation) 
record Reconciliation{ observed, confirmed, difference, reason, month }
for each effective item on account with cleared and not reconciled:
    append superseding replacement with reconciled=true,
        cleared=true, reconciliationId
commit atomically with one version bump; write the command receipt
```

The lock loop is one superseding replacement per affected item. This is deliberate: it keeps reconciled protection derivable from persisted history, so a rebuild reproduces it with no extra state, and it reuses the immutable-replacement machinery the previous phase already trusts. The alternative — a single reconciliation watermark consulted during eligibility — was rejected because eligibility would then depend on event ordering rather than the item's own effective record.

### 3.3 Adjustment as a non-assignable account-state correction

`RECONCILIATION_ADJUSTMENT` is an account-state correction, not money to assign:

- It affects the reconciled account's working and cleared balance by exactly the difference.
- It enters Ready to Assign **nowhere**. RTA keeps its five input fields and its formula, unchanged: the amount is still computed from four contributing terms, because `unreleasedIncomeMinor` is reported but excluded from the amount.
- It enters no income, expense, category Activity, Assigned, Available, or transfer measure.
- It is never presented in the canonical monthly summary, the single-month report, the multi-month series, or any report measure. It is attributable only in the reconciliation audit record.

Consequence, accepted by the owner on 2026-09-29 and documented rather than hidden: after an adjustment the aggregate account balance and Ready to Assign diverge by the adjustment, and that money is not assignable. The system MUST NOT mask this by inventing an RTA component, and MUST NOT silently repair it. Resolving the divergence inside the plan is not provided by this scope; the canonical *RTA source and explainability* requirement is modified so the exclusion is canonical rather than an exception buried in a delta.

`ReportService.read` is modified only to pass the cleared flag into the balance projection. Its RTA inputs and formula are unchanged, and no new RTA input is added.

### 3.4 Out of scope, deliberately

Unlock, revert, and correction of reconciled history; import and duplicate matching. Reconciled items are terminal in this phase. The mismatch path is the only correction mechanism, and it always requires explicit confirmation.

## 4. Cleared balance

```
clearedBalance(account) =
    openingBalanceMinor(account)
  + Σ effective account effects where transaction.clearedState ∈ {CLEARED, RECONCILED}
```

The split is by SURFACE, not by data. This was ambiguous in an earlier revision of these artifacts and two requirements pulled against each other until it was settled here:

- The **account surface projection** MUST expose `clearedBalanceMinor`. That is the `accounts[]` of the public budget response reached through `getBudget`/`publicBudget`, and it is what the account surface and the cleared-balance tests read.
- The **canonical monthly summary's embedded accounts** MUST NOT expose `clearedBalanceMinor`. The summary is a report, and the reporting requirements forbid a report from presenting a cleared balance. Its accounts still carry the working balance.
- A **reconciliation command's response** MAY report the observed and confirmed cleared balances: that is the command contract, not a report.

The alternative reading — exposing the cleared balance inside the summary because the summary embeds an account collection — was rejected because it would make the reporting exclusion depend on which nested object a field sits in, which is exactly the kind of ambiguity that gets resolved differently by different readers.

It is computed at projection time from the same effective-history fold the working balance already uses, in one revision. The opening balance is treated as cleared because it is the account's starting statement position.

Placement: `calculateAccountBalances` in `apps/api/src/planning/engine.ts` already reduces account effects and is the single balance-projection boundary. It gains a cleared reduction over the same ordered events; `AccountBalanceEvent` gains an optional cleared flag so the pure function stays pure and testable. `FinancialStore.readState` and `BudgetApp.projectAccounts` pass the flag through, which today they drop (`apps/api/src/persistence/financial-store.ts:148`). `PublicAccount` gains `clearedBalanceMinor`.

The cleared balance changes no budgeting equation, and the working balance and `accountBalanceMinor` keep their current formulas exactly.

## 5. The account-scoped eligibility fix

`ensureEligible` currently validates against `budget.account?.id`, the compatibility alias (`apps/api/src/app.ts:516`). Phase A cannot work correctly without changing this:

- Cleared transitions and reconciliation are per-account operations, and
- an ordinary edit on any account other than the alias is currently impossible.

The fix: resolve the transaction's own `accountId`, require that account to exist in the authorized budget, and pass it to `assertEligibleTransaction`. Eligibility then means "an account of this budget", not "the oldest account of this budget".

This is a deliberate behavior change. It widens what is editable and is called out as such in `tasks.md`, with a test that edits a transaction in a non-alias account.

## 6. API surface

| Method | Path | Purpose |
| --- | --- | --- |
| `PATCH` | `/api/v1/budgets/{budgetId}/transactions/{itemId}/cleared` | Cleared-state transition |
| `POST` | `/api/v1/budgets/{budgetId}/accounts/{accountId}/reconciliation` | Manual reconciliation |

History items gain `clearedState`. Account projections gain `clearedBalanceMinor`. `apps/api/openapi.yaml` documents both paths, the new enum, and the new field. The existing `deferred` command set in `apps/api/src/planning/engine.ts:117` drops `reconciliation`, `cleared`, and `uncleared`, and keeps `card`, `scheduled`, `split`, and the rest — the set exists to reject unsupported financial *commands*, and these three stop being unsupported.

## 7. Web surface

`apps/web/app/accounts/[accountId]/page.tsx` is the account activity surface and the natural home. It gains:

- a working/cleared balance pair in the account header, and
- a per-row cleared indicator with an accessible toggle for eligible rows, and
- a reconciled indicator with no edit or delete affordance, and
- a reconcile action opening a dialog: the server-derived cleared balance, an input for the external balance, and, on mismatch, the difference plus a required reason and an explicit confirmation step before applying.

`apps/web/app/models.ts` gains `clearedState` and `clearedBalanceMinor`. Client state follows the existing typed pattern in `apps/web/app/hooks/useBudgetApp.ts`. The surface computes nothing: the cleared balance, the difference, and the adjustment all come from the server.

## 8. Reports and summary are unchanged

Cleared state and reconciliation belong to the account surface only.

- The account surface MAY present cleared state and reconciliation.
- The canonical monthly summary, the dashboard, the single-month report, and the multi-month series MUST NOT present a cleared balance, a cleared or uncleared state, a reconciliation workflow, reconciliation state, or a reconciliation adjustment — not as a report measure, not as income, not as expense, not as category spending, and not as a Ready-to-Assign component.
- The RTA formula and its five input fields are unchanged; the amount is still computed from the same four contributing terms.

What this costs, stated plainly: a reconciliation adjustment moves real account money that the plan never sees. The divergence between the aggregate account balance and Ready to Assign is a known, documented limit of this phase, and the only place the adjustment is attributable is the reconciliation audit record.

Tests must prove the negative: a reconciliation adjustment leaves the monthly summary's RTA and its inputs, and both report responses, identical to before the adjustment, and no cleared or reconciliation field appears in either report.

## 9. Verification strategy

| Layer | What it proves |
| --- | --- |
| Pure domain (`apps/api/test/engine.test.ts`, new cleared-balance cases) | Cleared balance math, opening-as-cleared, neutrality of transitions |
| Planning (`apps/api/test/transaction-history-planning.test.ts`) | Account-scoped eligibility, cleared transitions on income/spending/transfer, reconciled rejection |
| API (`new cleared-and-reconciliation API tests`) | Routes, envelopes, `CONFLICT` mismatch with disclosed difference, idempotent replay, stale version, non-disclosure |
| PostgreSQL (`financial-persistence` / new reconciliation persistence tests) | Atomicity, rollback, lock reproduction after rebuild, adjustment reproduced once, migration `0009` applies |
| Reports (`reports` / `monthly-report-api` / `multi-month-report`) | A reconciliation adjustment leaves the summary's RTA and its inputs, and both report responses, unchanged; neither report contains any cleared or reconciliation field |
| Web (`apps/web/test/*`) | Toggle, balance pair, mismatch confirmation flow, no mutation affordance on reconciled rows |
| Browser (`apps/web/e2e/*`) | The owner journey: clear an item, reconcile a matching balance, see a mismatch and confirm |

Runtime evidence at closure MUST include `npm test` against the documented database with zero skips, `npm run test:web`, `npm run typecheck:web`, `npm run build:web`, and `npm run test:e2e`.

## 10. Decisions taken at the implementation gate

Recorded 2026-09-29, before any code was written. These are closed, not open:

1. **Model.** `cleared` is added beside the existing `reconciled`; `clearedState` is derived and never stored; `reconciled ⇒ cleared` is an invariant.
2. **Reason rule.** A reason is required only when an adjustment is applied, never for a matching reconciliation.
3. **`WORKING` and clearing.** A `WORKING` item is not clearable.
4. **Lock write model.** One superseding replacement per locked item, accepted so reconciled protection is reproducible from persisted history.
5. **Account-scoped eligibility.** Authorized as a deliberate behavior change: edits, cleared transitions, and reconciliation work on any active account of the budget, not only the compatibility alias.
6. **Adjustment model.** The reconciliation adjustment is a non-assignable account-state correction. It never enters Ready to Assign and is never presented in any summary or report. The resulting divergence between account balances and Ready to Assign is an accepted, documented limit of this scope, not a defect to be masked.

The only thing this design leaves genuinely open is whether a future phase should give the reconciling owner a way to resolve that divergence inside the plan. It is out of scope here and is not implied by this change.
