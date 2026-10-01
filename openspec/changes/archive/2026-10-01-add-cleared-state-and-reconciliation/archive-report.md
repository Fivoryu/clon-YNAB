# Archive Report: Cleared State and Manual Reconciliation

- Status: ARCHIVED
- Change: `add-cleared-state-and-reconciliation`
- Archived as: `2026-10-01-add-cleared-state-and-reconciliation`
- Task status at archive: complete. All 20 implementation tasks across five work units and every owner gate and parent gate are checked.
- Canonical specs updated: `account-management` (+2), `budgeting` (+1 added, 2 modified), `guided-budgeting-ux` (+1), `reporting` (1 modified), `transaction-history` (+2 added, 3 modified). Totals: +6 added, ~6 modified. All seven canonical scenario names in the modified requirements were preserved verbatim and verified before archiving.

## Delivered

| Commit | Content |
| --- | --- |
| `274e283` | Everything below. Committed together with `fold-effective-history-in-balance-projections`, because the two changes modify the same projection lines and cannot be separated into two green commits. |

- **Cleared state as an explicit dimension.** `cleared` and `reconciliationId` persisted, `clearedState` of `UNCLEARED`/`CLEARED`/`RECONCILED` derived and never stored, invariant `reconciled ⇒ cleared ⇒ not WORKING` enforced by one shared guard in `engine.ts` that every write path calls.
- **Cleared transitions** for income, spending, and transfers, financially neutral except for the cleared balance, through `PATCH /api/v1/budgets/{budgetId}/transactions/{itemId}/cleared`.
- **A per-account cleared balance**, exposed on the account surface and deliberately absent from a report's embedded accounts.
- **Manual reconciliation** at `POST /api/v1/budgets/{budgetId}/accounts/{accountId}/reconciliation`: equal balances record and lock; a mismatch without confirmation returns `CONFLICT` and mutates nothing; a mismatch with confirmation requires a reason and creates exactly one adjustment; an archived account is rejected.
- **A non-assignable adjustment.** It changes only the reconciled account's balances and never enters Ready to Assign. The resulting change in the divergence between account balances and Ready to Assign is a documented limit.
- **Reconciled locking** as superseding replacements carrying `reconciliationId`, reproducible from persisted history.
- **Migration `0009`** adds the cleared and reconciliation columns, the `RECONCILIATION_ADJUSTMENT` kind, and the `Reconciliation` table. **Migration `0010`** replaces the transfer-effect unique constraint with a plain index and moves the pairing guarantee to a shared application invariant enforced at every write boundary of both adapters.
- **The account activity surface**: the working/cleared balance pair, an accessible cleared toggle, a reconciled treatment with no ordinary mutation affordance, and a reconcile dialog that requires an explicit confirmation and a reason before applying a mismatch.
- **The three product documents** updated so cleared state and reconciliation read as delivered, with the remaining open scope still reading as open.

## Contract delivered

A cleared balance is a statement-matching fact, not a financial event: clearing moves no money. A reconciliation confirms an external balance against server-derived cleared history, and it never repairs a mismatch silently — it either changes nothing or changes exactly the difference the owner confirmed with a reason. The adjustment is an account-state correction, so the plan does not see that money; that divergence is stated as a limit rather than hidden behind an invented component.

## Verification

See `verify-report.md`. Independent verification ran on every unit and found defects in all of them, in work whose own suite was green. Eight correction rounds followed, and each one was a coverage or artifact defect rather than a mis-stated implementation: two durable balance projections dropping the cleared state, raw SQL behind a client-capability fallback, a `WORKING` item counting as cleared, a guard bypassable through the same-length replacement path, the pairing invariant placed on the read fold instead of the write boundary, two balance projections omitting the new event kind, and a BigInt literal that broke `typecheck` and `build` while the web suite reported 60 passed.

Runtime evidence at closure: `npm test` **232 passed, 0 failed, 0 skipped** against the documented database (160 at phase start), 213 with 179 passed and 34 skipped without it, `npm run test:web` **60 passed** (53 at start), `npm run test:e2e` **15 passed** (13 at start), `npm run typecheck:web` clean, `npm run build:web` compiled, `npx prisma validate` clean, ten migrations with `migrate diff` emitting 74 pre-existing rename statements and none naming this change's objects, and `openspec validate --all --strict` reporting 10 passed and 0 failed.

## Open follow-ups carried forward

- **The write assertion does not model tombstones** when deriving the resulting effective set. Reachability today is nil: every delete path splices the deleted event out and the public delete route rejects transfers. Recorded in `tasks.md` as its own slice; the fix is to fold the resulting history, including tombstone application, instead of trusting the callback's array.
- **The repository-wide `RenameForeignKey`/`RenameIndex` naming drift** (74 statements) predates this phase, touches no object of this change, and belongs to its own alignment change.
- **The in-memory whole-state representation contract**: `state.events` holds the effective set, unlike the durable table which keeps the chain and folds on read. Both write boundaries now validate, and `clone()` deliberately does not fold, because folding on read would silently repair an invalid seed instead of rejecting it.
- **The account-versus-Ready-to-Assign divergence** a reconciliation adjustment creates is a documented limit. Resolving it inside the plan is not provided by this scope.
- **Unlock, revert, and correction of reconciled history**, and **import matching** against it, remain unavailable and documented as such.
- **A green `npm run test:web` is not a build signal**: that suite does not typecheck page components. Typecheck and build must be run explicitly.
- **The web test suite cannot detect a broken page component**; the browser suite plus `build:web` are the only signals for that surface.

## Side fix recorded, outside this change's scope

`openspec/specs/guided-budgeting-ux/spec.md` carried a placeholder Purpose left by the archive of `improve-guided-budgeting-ux` on 2026-09-17. It was the only reason `openspec validate --all --strict` failed. Since this change added a requirement to that capability, the Purpose was written to describe it, turning strict validation from 9/10 to 10/10. This is recorded rather than presented as part of the delivered feature.

## Next steps

The remaining roadmap capabilities each need their own scope review and their own change: scheduled and repeating transactions, credit cards, and loans with a payoff simulator. None is approved by this archive.
