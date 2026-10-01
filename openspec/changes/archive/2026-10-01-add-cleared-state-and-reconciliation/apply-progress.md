# Apply Progress: Cleared State and Manual Reconciliation

## Scope delivered

| Unit | Content | Reviewer | Changed lines |
| --- | --- | --- | --- |
| WU1 | `cleared` and `reconciliationId` columns, migration `0009`, `Reconciliation` model, persistence plumbing, per-account cleared-balance projection, account-scoped eligibility groundwork | verified (4 correction rounds) | 279 → 342-396 by attribution |
| WU2a | cleared-state transitions for income and spending, account-scoped eligibility widening, derived `clearedState` on history items, `PATCH .../cleared`, OpenAPI, deferred-set change | verified | ~386 |
| WU2b | transfer clearing on both paired effects, shared pairing invariant at every write boundary, migration `0010` replacing the unique constraint with a plain index | verified (3 correction rounds) | ~336-400 |
| WU3 | reconciliation command, non-assignable adjustment, reconciled locking, audit record, route, OpenAPI | verified | ~350-380 |
| WU4 | account activity surface: balance pair, cleared toggle, reconciled treatment, mismatch confirmation dialog, browser coverage | parent-run closure checks | 359 |
| WU5 | product documents updated to delivered, with the remaining open scope retained | self-checked | docs only |

## Runtime evidence at closure

- `npm test` with the documented database: **232 passed, 0 failed, 0 skipped** (baseline 160 at phase start).
- `npm test` without the database: 213 tests, 179 passed, 34 skipped.
- `npm run test:web`: **60 passed** (baseline 53).
- `npm run test:e2e`: **15 passed** (baseline 13), after clearing `apps/web/.next`.
- `npm run typecheck:web`: clean.
- `npm run build:web`: compiled, `/accounts/[accountId]` present.
- `npx prisma validate`: valid. `npx prisma migrate status`: ten migrations, schema up to date.
- `npx prisma migrate diff`: 74 rename statements (34 foreign key, 40 index), none of them naming `FinancialEvent_budgetId_transferId_kind_idx` and none touching this change's objects.
- `npx openspec validate --strict`: valid.

## Correction rounds and defects

This phase cost eight correction rounds. **Every one of the eight was a coverage defect or an artifact defect, not a mis-stated rule in the implementation.** They are recorded individually because the pattern is the finding:

1. Durable balance projections dropped the cleared state (`budget-store.ts`).
2. The in-memory store had the same omission.
3. The new columns were read and written through raw SQL behind a client-capability fallback, so mock tests exercised a different path from production and the generated client could not see the columns.
4. `isFinancialEventCleared` counted a `WORKING` item as cleared, and the write guard did not reject that state.
5. The in-memory guard was bypassable through the same-length replacement path used by the ordinary edit command, because that adapter invoked the command callback with three arguments instead of four.
6. The pairing invariant replaced a database constraint but was placed on the read fold instead of the write boundary.
7. Two balance-projection sites omitted the new `RECONCILIATION_ADJUSTMENT` kind.
8. A bespoke money formatter using BigInt literals broke `typecheck` and `build` while `npm run test:web` reported 60 passed, because that suite does not typecheck page components.

Two of these were found by the parent rather than by the author or the verifier: the raw-SQL divergence and the BigInt build break.

## Deviations from the plan, recorded

- **The change was re-scoped mid-phase.** The owner decided a reconciliation adjustment is NOT assignable, which required rewriting the added budgeting requirement, removing the reporting carve-out entirely, and additionally modifying the canonical `RTA source and explainability` requirement so the exclusion is canonical rather than an exception buried in a delta.
- **WU2 was split into WU2a and WU2b** at 385 changed lines, rather than absorbing the transfer work into a slice already near the 400-line guard. WU3 fitted inside the guard and was not split.
- **A specification ambiguity had to be settled.** `account-management` required "the account projection" to expose the cleared balance while `reporting` forbade a report from presenting one, and the summary embeds an account collection. Resolved BY SURFACE in `design.md` section 4: the account surface exposes it, a report's embedded accounts do not, a reconciliation response may report its observed and confirmed balances.
- **A requirement stated wrong arithmetic and was corrected.** The budget requirement and its scenario required the ABSOLUTE gap between the aggregate account balance and Ready to Assign to equal the cumulative adjustment. That gap also reflects unreleased income and permitted carry (measured 325 before and 342 after a 17 adjustment). Corrected to state that the CHANGE in the divergence equals the signed adjustment.
- **A sibling change was opened mid-phase.** `fold-effective-history-in-balance-projections` fixes a pre-existing defect found while verifying WU1: both durable adapters projected account balances from RAW history, so a superseded event still counted. The owner approved fixing it before WU3 so the cleared balance and the reconciliation projection were not built on wrong balances.
- **One defect is open and recorded, not silently closed:** the shared write assertion does not model tombstones when deriving the resulting effective set. Reachability today is nil (every delete path splices, and the public delete route rejects transfers), and it is written up in `tasks.md` as its own slice.

## Working-tree state

Everything above is **uncommitted**, by the owner's instruction. The working tree also contains another session's changes to `apps/web/app/components/shell/AppShell.tsx`, `apps/web/app/globals.css`, `apps/web/e2e/reports-account-detail.spec.ts`, `apps/web/test/reports.test.ts`, `docs/README.md`, `next.config.mjs`, `package.json`, `docs/e2e/**`, `scripts/**`, and an onboarding `kind` fix that co-edited `apps/api/src/app.ts`, `apps/api/src/persistence/budget-store.ts`, and `apps/api/test/app.test.ts`. Those are a different scope and are not attributed to this change.

Consequence, recorded because it affected verification: with no per-slice commits, three independent measurements of WU2b's size produced ~100, ~227, and ~336 lines, the per-slice 400-line budget could not be certified, and a verifier could not diff the untracked test files to prove that no assertion had been weakened when cleared-balance assertions moved from the summary to the account surface.
