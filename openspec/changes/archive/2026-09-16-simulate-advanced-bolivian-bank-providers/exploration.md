# Exploration: simulate-advanced-bolivian-bank-providers

## Status and boundary

- **Idea:** Ready for proposal, subject to keeping the provider simulation explicitly local, fictionalized, and non-financial.
- **Scope:** Add advanced simulated banking-provider behavior for Bolivia: connection and sync states, pending/posted transactions, duplicates, failures, retries, timeouts, partial sync, idempotency, and auditability.
- **Explicit safety boundary:** No external APIs, network calls, real credentials, banking authentication, official bank integration, account verification, payment initiation, transfers, withdrawals, deposits, or real-money movement.
- **Naming boundary:** Provider profiles may be labeled as “Bolivia-inspired” presets using names such as Banco Unión-inspired, BNB-inspired, Banco Bisa-inspired, BancoSol-inspired, or Mercantil Santa Cruz-inspired. They MUST be presented as test personas, not official integrations, and MUST NOT use official logos, credentials, endpoints, or claims of bank affiliation.

## Repository and OpenSpec evidence

- `openspec/config.yaml` requires English artifacts and English structural headings and SHALL/MUST terminology.
- CodeGraph was unavailable in this executor tool surface. `.codegraph/` was checked before targeted repository inspection; no index or source files were modified. Targeted reads/grep were used as a documented fallback.
- Canonical specs currently describe a deliberately manual budgeting slice. `openspec/specs/transaction-history/spec.md` and `openspec/specs/csv-manual-import-export/spec.md` explicitly exclude banking synchronization and pending/uncleared concepts. `openspec/specs/reporting/spec.md` excludes sync, pending, and uncleared reporting. This change must be additive and must not silently reinterpret those exclusions.
- Existing archived explorations establish the project convention of separating Observed, Inferred, Clone decision, Proposed, Open question, risks, and bounded recommendation.

## Current architecture and extension points

### Application and HTTP boundary

- `apps/api/src/app.ts` is the application service boundary. It owns public budget projection, account selection, authorization, financial command dispatch, transaction history mapping, and report reads.
- `apps/api/src/server.ts` has a small explicit route matcher. New simulation endpoints would need narrowly scoped routes and the existing authentication, `{ data, requestId }`/`{ error, requestId }` envelopes, and safe non-disclosing authorization behavior.
- `apps/api/openapi.yaml` is the contract authority for implemented routes. Simulation routes and DTOs should be added only during proposal/implementation after the public behavior is fixed.
- `apps/web/app/models.ts`, `apps/web/app/hooks/useBudgetApp.ts`, and `apps/web/app/components/BudgetWorkspace.tsx` form the current client boundary. The current UI is budgeting-first and has no provider/sync model; UI work should follow the API/domain decision rather than leak simulated bank branding into ordinary account flows.

### Domain, persistence, and consistency

- `apps/api/src/persistence/financial-store.ts` defines `FinancialState`, `FinancialEvent`, `TransferState`, PostgreSQL loading, append-only event persistence, budget locking, receipt-based versioning, and idempotent command execution.
- `apps/api/src/persistence/in-memory-budget-store.ts` provides the fast test adapter and must not become the only proof of simulation correctness; PostgreSQL behavior remains authoritative for durable audit and concurrency semantics.
- `apps/api/src/persistence/budget-store.ts` persists budget/account/category setup and projects canonical account state. It is an extension point only if a simulated provider is explicitly attached to an account; existing `AccountKind` currently covers only `CASH` and `CHECKING`.
- `apps/api/prisma/schema.prisma` has `Budget`, `Account`, `FinancialEvent`, `Transfer`, `CommandReceipt`, and deletion-audit models. Existing `FinancialEventKind` represents budgeting effects and transfer legs, not an external-provider lifecycle. Reusing those events for provider attempts would conflate simulated ingestion with authoritative budgeting effects.
- `apps/api/src/planning/transaction-history.ts`, `apps/api/src/planning/csv.ts`, and `apps/api/src/reports/report-service.ts` implement effective history, manual CSV, and financial equations. Provider simulation should feed an explicit staging/ingestion boundary, not bypass these normalizers or directly mutate balances.

## Relevant existing capabilities

| Capability | Current evidence | Relevance |
|---|---|---|
| Owner-only access and non-disclosure | `identity-access` spec; `BudgetApp.requireBudget` and session authentication | Simulated providers and run histories must be budget-scoped and owner-authorized. |
| Canonical accounts and account lifecycle | `account-management` spec; `accounts[]`, account IDs, archived state | A simulation may attach to a supported account, but provider identity must not replace stable account identity. |
| Append-only financial effects | `budgeting` and `transaction-history` specs; `FinancialEvent` folding | Imported/simulated candidates need a separate lifecycle before becoming ordinary income/spending. |
| Idempotency and optimistic concurrency | canonical budgeting/transfer/history specs; `FinancialStore.execute` and `CommandReceipt` | Start/sync/retry commands and replay behavior should use the same budget-scoped semantics. |
| Transfer neutrality | `transfers` and `reporting` specs | Simulation MUST never create a real transfer or alter category/RTA equations as a side effect. |
| Effective history and audit identity | transaction-history spec and deletion audit model | Accepted simulated records need provenance and auditability without exposing raw provider secrets or pretending to be bank audit. |
| Manual import boundary | CSV spec | A simulation can produce deterministic candidate records, but it must not silently turn a provider run into an import or bypass validation. |

## Proposed simulation model

### Fixture/state-machine recommendation

Recommend a **fixture-backed deterministic state machine**, not ad-hoc mocks.

- A provider profile is immutable metadata plus a named behavior preset: display label, fictional provider code, supported simulated capabilities, latency/failure policy, duplicate policy, and fixture seed/version.
- A simulation run is a durable, owner-visible local scenario with a state machine such as `DISCONNECTED -> CONNECTING -> CONNECTED -> SYNCING -> PARTIAL|FAILED|TIMED_OUT|SUCCEEDED`, with retry transitions constrained by the fixture.
- Provider records remain candidates with explicit lifecycle states such as `PENDING`, `POSTED`, `DUPLICATE`, `REJECTED`, or `APPLIED`. Candidate identity should be stable within a fixture/run and separate from YNAB transaction identity.
- Fixtures should define ordered pages/batches, source record IDs, timestamps/dates, amounts, memo/payee samples, expected duplicate keys, failure injection points, timeout behavior, and retry outcomes. A seed plus fixture version makes runs reproducible.
- A state machine gives tests a single oracle for legal transitions, deterministic partial progress, retry/idempotency behavior, and audit entries. Ad-hoc mocks would scatter timing and failure branches across route tests, making duplicate and retry behavior difficult to reproduce and review.

### Suggested separation of concerns

1. **Provider catalog/profile layer:** local, non-network metadata only; no official integration claims.
2. **Simulation engine:** pure transition logic over fixture state; injectable clock/seed, no HTTP client.
3. **Run store:** durable run state, cursor/checkpoint, attempt outcome, and audit trail. Prefer separate simulation tables or a clearly namespaced state model rather than adding provider fields to `FinancialEvent`.
4. **Candidate projection:** maps fixture records to a reviewable, provenance-rich candidate DTO. It MUST NOT update account balances or category equations.
5. **Explicit application boundary:** if a later proposal permits applying a candidate, it must call the existing income/spending command invariants, require explicit owner confirmation, and be idempotent. This exploration does not authorize that behavior.

## Safe simulated provider profiles

Use neutral labels such as `BO_UNION_INSPIRED`, `BO_BNB_INSPIRED`, `BO_BISA_INSPIRED`, `BO_BANCOSOL_INSPIRED`, and `BO_MERCANTIL_SC_INSPIRED`. Profiles should differ only in deterministic fixture behavior, for example:

- one profile emits pending records before posted replacements;
- one emits duplicate records across pages;
- one fails after a checkpoint and succeeds on retry;
- one produces a timeout at a known state-machine transition;
- one returns a partial batch with a bounded diagnostic;
- one exercises idempotent replay of the same run request.

These differences are test scenarios, not claims about the real banks’ systems, reliability, formats, or policies. Avoid real logos, login screens, credentials, live URLs, scraped data, or institution-specific promises.

## Affected areas

| Area | Expected impact in a later proposal/implementation |
|---|---|
| New domain module | Add profile catalog, fixture schema, transition validator, deterministic run engine, candidate identity, and failure policies. |
| Persistence | Add isolated simulation-run, simulated-record, checkpoint, and audit persistence; preserve PostgreSQL atomicity and budget ownership. |
| API/server | Add owner-authorized local simulation setup/run/status/retry/read endpoints only; document stable envelopes and bounded payloads in OpenAPI. |
| Existing financial commands | Reuse, do not duplicate, amount/date/metadata/account/category/idempotency validation if explicit candidate application is later approved. |
| Reports/history/CSV | Keep simulation attempts and unapplied candidates out of ordinary financial reports, effective transaction history, and CSV export unless a future spec explicitly defines a projection. |
| Web | Add a clearly marked “Simulation” surface, with no official-integration wording and explicit “no real money/network” status. |
| Tests | Unit-test pure transitions and fixture determinism; API-test authorization and envelopes; PostgreSQL-test atomicity, retry/idempotency, checkpoints, and audit persistence. |
| Canonical specs | Later proposal likely adds a new capability spec and narrowly updates excluded-capability language only where necessary; do not modify canonical specs during exploration. |

## Risks and containment

| Risk | Containment |
|---|---|
| Users mistake a preset for official bank connectivity | Use “inspired”/fictional labeling, simulation-only banners, no logos/URLs/credentials, and contract tests for prohibited network behavior. |
| Candidate records change real budget equations accidentally | Store candidates separately and require an explicit, separately specified application command through existing financial invariants. |
| Retries duplicate records or advance state twice | Stable run/request identity, fixture record IDs, checkpoint transitions, budget-scoped idempotency, and atomic persistence tests. |
| Failure/timeout behavior becomes nondeterministic | Fixture seed/version and pure state-machine transitions; injectable clock and no real timers/network. |
| Provider names imply unsupported facts | Treat names as labels only; document no fidelity claim and keep behavior fictional. |
| Raw fixture data leaks sensitive-looking information | Use synthetic names, amounts, IDs, dates, and bounded diagnostics; never accept or persist real credentials. |
| Scope expands into real aggregation or money movement | Keep no-network/no-credentials/no-transfer invariants in API, domain, tests, and UI acceptance criteria. |

## Open questions for proposal

1. Is the first vertical slice read-only simulation runs and candidate review, or should it also explicitly apply selected candidates to budgeting transactions?
2. Should simulated providers attach to an existing `CASH`/`CHECKING` account, or should simulation accounts be a separate type that cannot participate in transfers?
3. Which run controls are required: start, advance one transition, retry, reset, and inspect audit, or a smaller set?
4. Should run progression be synchronous command stepping (recommended for determinism) or a simulated asynchronous poll model with no worker infrastructure?
5. What exact candidate deduplication key is desired: fixture source ID, provider/profile plus source ID, or a run-independent normalized fingerprint?
6. Should pending-to-posted replacement be visible as one candidate with lifecycle history or as linked candidate revisions?
7. What bounded limits apply to profiles, fixture records, attempts, diagnostics, and audit retention?
8. Which Bolivia-inspired labels are acceptable after legal/product review, and should all public UI labels use “fictional preset” wording?

## Bounded recommendation

Proceed to proposal with a small vertical slice: a local profile catalog, one deterministic fixture/state-machine engine, run/checkpoint/audit persistence isolated from financial events, and owner-authorized read-only candidate projections. Prove pending/posted, duplicates, failure, timeout, partial sync, retry, and idempotent replay without changing balances, RTA, category values, transfers, history, reports, or CSV. Defer candidate application and any real-provider resemblance beyond neutral labels to a separately approved decision.

## Persistence

This exploration is persisted in the active OpenSpec backend at `openspec/changes/simulate-advanced-bolivian-bank-providers/exploration.md`. Engram was unavailable in this session, so no Engram persistence is claimed.
