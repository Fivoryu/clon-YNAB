# YNAB Screen Parity Audit

## Objective

Document how the current academic YNAB clone compares with publicly described YNAB web features, identify screen and capability gaps, and recommend a feasible next screen batch without implementing UI or backend behavior in this task.

## Problem and rationale

The clone already has a working budgeting core and several transaction/account flows, but its navigable surface and domain coverage are smaller than YNAB's public feature set. A repository-backed, source-cited gap analysis will distinguish screen-only opportunities from capabilities that first need domain/API support.

## Scope and constraints

- Research official public YNAB web/product and help materials and compare them with the existing repository.
- Create `docs/research/ynab-screen-parity.md` and add it to `docs/README.md`.
- Treat this as an academic project; document functional comparisons without presenting the clone as the official product.
- Do not implement new routes, UI, domain models, API endpoints, or database changes.
- Any later screen implementation must follow the project's OpenSpec workflow; this research note is context only and does not start an implementation change.
- Keep existing user changes untouched. At start, `master` had pre-existing changes in root `README.md`, `docker-compose.yml`, `.codegraph/`, `.pi/`, and two unrelated `odd/tasks` files.
- Documentation-only: TDD and application test runner are not applicable. Verify report structure, repository evidence, citations, and Markdown diff hygiene.
- No commit was requested; leave delivery as a working-tree change.

## Tasks

- [x] T1 — Map current routes, screen flows, and relevant API/domain support.
  - Evidence: bounded `gentle-ai-explore` audit returned eight routes and confirmed the core budget, transaction, account, onboarding, and CSV flows are API-wired.
- [x] T2 — Research official public YNAB web features and workflows.
  - Evidence: official YNAB feature/goal/debt pages and official support search results for Plan, account registers, scheduled transactions, reconciliation, and Reflect reports were reviewed on 2026-09-22.
- [x] T3 — Write the parity-gap report and link it from the documentation index.
  - Evidence: added `docs/research/ynab-screen-parity.md` and linked it in the reading order in `docs/README.md`.
- [x] T4 — Read back the report and verify claims, links, scope, and changed-file hygiene.
  - Evidence: parent read back both changed documents and compared repository claims with the bounded audit; delegated and parent `git diff --check -- docs/README.md docs/research/ynab-screen-parity.md` checks passed.

## Acceptance criteria

- The report separates observed official behavior, repository-verified current capability, inference, and clone recommendations.
- Every priority gap has concrete repository evidence and distinguishes a missing route from a missing backend/domain capability.
- Recommendations account for the existing MVP boundary and identify dependencies rather than implying that adding pages alone creates feature parity.
- Official sources are linked, and the report states the research check date and evidence limitations.
- The documentation index links the new report; unrelated working-tree changes remain untouched.

## Progress and verification

- Status: T1–T4 complete.
- Verification: delegated and parent `git diff --check -- docs/README.md docs/research/ynab-screen-parity.md` passed; parent read back both changed files and checked the report against the repository audit and cited sources.
- Runtime tests/build: not applicable to this documentation-only work.
- User selected the complete phased screen/capability roadmap and confirmed this project uses OpenSpec.
- Session SDD preflight confirmed: `execution=auto`, `artifact_store=openspec`, `delivery_strategy=ask-on-risk`, `review_budget=400`.
- OpenSpec exploration: `openspec/changes/ynab-screen-parity-roadmap/explore.md`.
- User selected the reporting sequence: first a basic monthly view (spending by category and income vs. expenses), then multi-month trends as a later phase.
- User asked the proposal to explicitly propose expanding the academic MVP boundary (not treat expansion as approved), include transfers and working/pending transactions in the first report, and make older account history reachable beyond 500 items; pagination mechanics remain for design.
- OpenSpec proposal: `openspec/changes/ynab-screen-parity-roadmap/proposal.md` was explicitly approved by the user. Approval authorizes moving to OpenSpec specifications only; it does not authorize implementation. No existing MVP decision docs or application code were changed.

- Native `gentle-ai.sdd-status/v2` was read for `ynab-screen-parity-roadmap`: `nextRecommended=spec`, `blockedReasons=[]`, proposal `all_done`, and `actionContext.mode=repo-local` with the repository as the allowed edit root.

## Design phase

- Created `openspec/changes/ynab-screen-parity-roadmap/design.md` for the first tranche: account detail/activity with older history continuation and a basic single-month report. Multi-month trends and later roadmap features remain out of scope.
- Parent source audit found current history uses an effective-history projection, separately persisted transfers, a 500-record slice, and a `FinancialStore` history version distinct from `GET /budgets`' `Budget.version`. The initial cursor design was tightened to bind budget identity and supported filters, limit continuation to account-ID filtering, and require snapshot-consistent page data/version (or version recheck/retry). Current `FinancialStore.load` does not yet guarantee that snapshot consistency.
- The report's treatment of transfers, `WORKING` transactions, and pending/unreleased income remains an explicit accounting-policy gate; no report totals/formulas are approved. The MVP expansion remains under review. No application code, tests, or canonical MVP documents changed.
- Fresh native `gentle-ai.sdd-status/v2` after design returned `nextRecommended=tasks`, `proposal/specs/design=all_done`, no blockers, and repo-local action context. Tasks are the next planning phase; implementation remains unauthorized.

## Tasks phase

- Created `openspec/changes/ynab-screen-parity-roadmap/tasks.md` with four reviewable work units: history API/snapshot-consistent continuation, account activity UI, policy-approved single-month report API, and policy-approved report UI.
- Parent review confirmed task commands exist (`npm test`, `npm run test:web`, `npm run typecheck:web`, `npm run build:web`) and the repository has existing transaction-history API tests and web page tests. The untracked task artifact passed `git diff --no-index --check`; Git emitted only the configured LF-to-CRLF working-copy warning.
- The user selected “Authorize the full planned tranche,” approving the proposed MVP expansion and four-slice review plan. This is implementation authorization for the planned slices, but reporting remains independently blocked until the user approves a policy covering transfers, `WORKING` records, and pending/unreleased income. No commit/PR delivery action was requested.
- Work Unit 1 (history API and snapshot-consistent continuation) is complete: 7 implementation/test files, 266 changed lines (237 added/29 removed), under the 400-line limit. Cursor binds budget ID, normalized account-only filter, history version and exclusive sort anchor; history state is read with PostgreSQL `RepeatableRead`.
- TDD and independent verification passed: focused 20 passed/4 skipped; `npm test` 90 passed/20 skipped. PostgreSQL live integration tests skipped due missing DB configuration. Independent verifier reported no findings.
- Native ASSESS returned unassessable due undeclared untracked files; native inspect/status reported `rdd_disabled`. No native review was started or bypassed; the fail-closed assessment plan was followed with an independent read-only verifier. Parent recorded this in the OpenSpec task/progress artifacts.
- Work Unit 2 (account activity UI) is complete and parent-reviewed: seven implementation/test files, 342 changed lines (336 additions/6 deletions), within the 400-line slice budget. `npm run test:web`: 22 passed; `npm run typecheck:web`: passed. Independent verifier reported no code findings; it noted that typecheck had modified `apps/web/tsconfig.tsbuildinfo`, which was restored to the previously clean state and absent in a fresh inspect.
- Native ASSESS again returned `unassessable` because untracked files require explicit declaration; inspect/status reported `rdd_disabled`. No native review was started or bypassed; the fail-closed plan's independent verifier ran. No browser E2E or visual viewport test was run.
- Fresh native status after Work Unit 2: `nextRecommended=apply`, 10/20 tasks complete, no native blockers, repo-local action context. Report tasks remain gated by explicit accounting-policy approval; four-slice plan approved.

## Next step

Request explicit accounting-policy decisions before starting report API/UI work: define treatment for transfers, WORKING transactions, and pending/unreleased income without conflating transaction status with income-release state. Account history and detail slices are complete. Preserve the 500-item ceiling, 400-line per-slice review budget, and existing unrelated working-tree changes.