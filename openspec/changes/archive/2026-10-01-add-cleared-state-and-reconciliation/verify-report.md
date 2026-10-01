# Verify Report: Cleared State and Manual Reconciliation

## Verdict at closure

All thirteen verification claims for Work Unit 3 were supported on behaviour, and the two outstanding items were **artifact** defects rather than implementation defects: a contract this change stated with wrong arithmetic, and a missing `supersedesEventId` assertion in the rebuild test. Both were corrected and observed passing. Work Units 1, 2a, 2b and 4 were independently verified during the phase; each verification is recorded below with its verdict.

## Independent verifications run

| Unit | Verdicts | What the verifications changed |
| --- | --- | --- |
| WU1 | FAIL, FAIL, FAIL, PASS-with-caveats | Found the raw-SQL/fallback divergence, the `budget-store` projection omission, the `WORKING + reconciled` hole, and the in-memory replacement-path bypass. Three of the four rounds were refutations. |
| Change B | PASS-with-caveats | Confirmed both durable adapters fold once per read, enumerated every balance-derivation and client-facing projection site, and found no supported path still consuming raw history. |
| WU2a | PASS-with-caveats | Confirmed the signed cleared-balance effect, neutrality, the shared guard, adapter parity, and that the eligibility widening preserved authorization boundaries. The one runtime gap it could not close — a cross-budget adversarial attempt — the parent then wrote and ran, and it passed on both adapters. |
| WU2b | FAIL, FAIL, PASS-with-caveats | Refuted the pairing guarantee twice: no post-write assertion at either store boundary plus a fold bypass for a transfer effect without a `transferId`; then the in-memory whole-state and seed paths bypassing validation. Both were closed and re-verified. |
| WU3 | FAIL (artifact-scoped) | Confirmed all thirteen claims on behaviour. Refuted a contract this change states, and found one missing assertion. Both fixed by the parent. |

## Defects found by verification, not by the author

This is the phase's most substantive finding about the process, so it is stated plainly: **independent verification found defects in every single unit, and found them in work whose own tests were green.** The reason is consistent across all of them — the green suite exercised a path that was not the path that runs.

- WU1's green suite passed on a mock fallback while production used raw SQL.
- WU2a's green suite passed while the eligibility widening's authorization boundary was asserted by no runtime test.
- WU2b's green suite passed while two write paths bypassed the invariant that replaced the dropped database constraint.
- WU4's green suite passed while the page component failed to typecheck and to build.

## Coverage gap closed at WU3

The rebuild test asserted the locked replacement's `reconciled`, `cleared`, and `reconciliationId`, but not its `supersedesEventId`. The parent added it and it passes: the locked replacement links to the event it supersedes, that link resolves within the same transaction identity, and the superseded event stays unlocked and immutable.

## Re-verification judged unnecessary, and why

After correcting the contract whose arithmetic was wrong and adding the missing assertion, no re-verification was run. That judgement is recorded rather than implied: the verifier's own analysis established that the behaviour complied with all thirteen of its claims under the corrected reading, so the outstanding items were the requirement's wording and one absent assertion, both fixed and observed passing. This is a scope judgement by the parent, not a satisfied claim.

## Open item carried forward

The shared write assertion derives the resulting effective set without applying tombstone semantics, so a callback that appends a tombstone for a transfer effect while leaving the deleted effect in its array would pass the assertion and persist an unreadable state. Reachability today is nil: every delete path splices the deleted event out, and the public delete route rejects transfers outright. It is written up in `tasks.md` as its own slice rather than left as an implicit gap.

## Provenance

These reports were produced by the parent orchestrator, not by an SDD phase agent, under the project owner's instruction to use the gentle-ai subagents rather than the SDD ones. They do not carry `gentle-ai.verify-result/v1` machine front matter and claim no such schema. The verifications they summarize were performed by `gentle-ai-verify` subagents reading the working tree, and the four correction rounds the parent performed inline are recorded as such in `apply-progress.md`.
