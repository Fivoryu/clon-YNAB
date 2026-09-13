# Non-Functional Requirements

## Purpose and scope

This document defines quality constraints and measurable targets for the academic YNAB-style clone. It complements [Functional Requirements](functional-requirements.md) and does not expand the MVP boundary. It distinguishes constraints that must hold for financial correctness and safety from provisional targets that require validation with the team and course environment.

These requirements describe the independent clone. They do not claim private YNAB infrastructure, schema, formulas, operational limits, or security controls.

## Evidence legend and quality distinction

Evidence labels apply to external observations, inferred semantics, clone decisions, and unresolved questions:

- **Observed** — behavior supported by a cited public source in the project research. It describes observable product behavior, not private implementation.
- **Inferred** — a conceptual relationship derived from observed behavior; it is not an official implementation detail.
- **Clone decision** — an explicit product, engineering, or quality rule for this independent academic clone.
- **Open question** — an unresolved behavior, threshold, policy, or implementation choice that must be decided before the affected requirement is implementation-ready.

Requirement statements and operational/verification criteria are clone quality constraints or targets by default and therefore are **Clone decision** statements unless they carry an explicit **Observed**, **Inferred**, or **Open question** label. Any external observation, inference, decision, or unresolved policy remains explicitly labeled; unresolved policy must remain **Open question** rather than being hidden inside a target.

Priority and delivery status are separate dimensions: **P0**, **P1**, and **P2** express importance, while delivery status is **first slice**, **later MVP slice**, or **deferred/out of MVP**. A later-MVP P0 constraint or behavior is not part of the bounded first slice.

This document separates three kinds of content:

- **Product-quality goal:** the user-visible or operational quality the clone should provide.
- **Clone decision:** a binding constraint or chosen mechanism for this project, subject to later approved change.
- **Open question:** a decision that is deliberately not hidden inside a quality target.

A **constraint** is mandatory for every conforming implementation. A **target** is a provisional measurable goal used for evaluation and may be revised after profiling or usability evidence. Deferred/future requirements are marked explicitly and are not prerequisites for the first vertical slice.

## NFR-SEC — Security, authentication, authorization, and isolation

- **ID:** NFR-SEC
- **Name:** Protect identities, budgets, and financial data
- **Priority/status:** P0 — baseline constraint for all budget-scoped behavior.
- **Scope:** Registration/sign-in, sessions, server-side authorization, tenant isolation, API boundaries, database constraints, and data protection.
- **Requirement statements:**
  - **Clone decision:** Every budget-scoped request shall authenticate the user and authorize access to the selected budget before reading or mutating data.
  - **Clone decision:** Every account, category, transaction, allocation, month, target, and summary shall be tenant-scoped; one budget must not affect another budget's calculations.
  - **Clone decision:** Passwords shall never be stored directly; local credentials shall use a well-tested password-hashing library.
  - **Clone decision:** The first slice uses local email/password with server-managed opaque sessions. Session cookies shall be `httpOnly`, `secure` in production, same-site/CSRF protected as applicable, explicitly server-expiring, and revoked on logout; no long-lived browser tokens are used. External identity providers are deferred/out of MVP and are not an implementation blocker.
  - **Clone decision:** Foreign budgets and resources use one uniform non-disclosing `NOT_FOUND` response. API and database constraints shall complement application authorization checks.
  - **Open question:** Future roles, collaboration, and member permissions remain open; the first-slice local session and uniform non-disclosing policy are accepted.
- **Operational/verification criteria:**
  - **Given** a session for budget A **When** a request addresses budget B without membership **Then** no B data is returned and no B mutation occurs, and the response is uniform non-disclosing `NOT_FOUND`.
  - **Given** a request without a valid session **When** it reaches a budget endpoint **Then** it is rejected before domain mutation with `UNAUTHENTICATED`.
  - **Given** an integration test that queries equivalent identifiers across two budgets **When** it runs **Then** no cross-budget record, balance, or summary is observable.
  - **Target:** Security checks are covered by automated authorization/integration tests before the first release candidate.
- **Traceability:** FR-AUTH, FR-BUDGET, FR-ACCOUNT, FR-CATEGORY, FR-TRANSACTION, FR-RECONCILIATION. [System architecture: security boundaries](../architecture/system-overview.md#security-boundaries); [Domain model: identity and access](../architecture/domain-model.md#identity-and-access); [ADR-001](../decisions/ADR-001-modular-monolith.md#guardrails).
- **Open questions:** Future member roles, collaboration, and permissions; later-provider authentication/session lifecycle questions.

## NFR-DATA — Money precision, consistency, and atomicity

- **ID:** NFR-DATA
- **Name:** Preserve exact and consistent financial state
- **Priority/status:** P0 — baseline constraint for financial correctness.
- **Scope:** Monetary representation, first-slice transaction/allocation writes, posted/working state, split validation for the later MVP slice, derived summaries, database transactions, and rebuild behavior.
- **Requirement statements:**
  - **Clone decision:** All monetary values shall use integer minor units; floating-point arithmetic shall not be authoritative.
  - **Clone decision:** PostgreSQL is authoritative for financial state and history; one canonical Prisma schema and migration owner belongs to the API persistence boundary. A command affecting account-side and plan-side effects shall commit atomically or commit nothing in one PostgreSQL database transaction.
  - **Clone decision:** Setup/opening movement, assignments, moves, realized income, and categorized spending are first-slice mutating financial commands. Each uses an idempotency key; same-payload replay returns the same logical result and a different payload returns `CONFLICT`. Stale writes use optimistic version checks and return `CONFLICT` rather than overwrite authoritative state. First-slice income and categorized spending accept positive input amounts and support posted/working state only; cleared, pending, and uncleared transitions, cleared-vs-working balance effects, and reconciliation behavior are later MVP slice/P1 scope. These are blocking dependencies only before reconciliation is implemented.
  - **Clone decision — later MVP slice:** Split lines shall equal the parent amount exactly in integer minor units; the account changes once, category effects apply per line, and the command is atomic when split transactions are accepted.
  - **Clone decision:** Derived balances may be cached only as derived data and shall have a deterministic rebuild path from authoritative transaction history and other authoritative movements.
  - **Clone decision:** Client-provided final balances shall never be accepted as authoritative writes.
  - **Inferred:** Keeping account balance, category allocation, category activity, and category availability as distinct dimensions supports explainability and prevents accidental substitution.
  - **Open question:** The bounded first-slice RTA and Available equations are accepted; full-MVP card-payment, refund, overspending, and closed-month formulas remain open in [Budget engine research](../research/budget-engine.md#open-questions).
- **Operational/verification criteria:**
  - **Given** `$0.01` and `$0.02` inputs **When** they are added **Then** the result is exact in minor units with no floating-point drift.
  - **Given** a command that fails after validating one side of an account/plan change **When** the transaction boundary exits **Then** neither side is changed.
  - **Given** split lines whose sum differs from the total **When** the command is submitted **Then** it returns `VALIDATION_ERROR` and persists no partial lines.
  - **Given** the same authoritative history **When** summaries are rebuilt twice **Then** values and classifications are identical.
      - **Given** an account-side and plan-side command effect **When** either side cannot be committed **Then** the command commits neither side.
- **Traceability:** FR-PLANNING, FR-TRANSACTION, FR-TRANSFER, FR-ROLLOVER, FR-CREDIT-CARD. [Budget engine research: invariants](../research/budget-engine.md#engine-invariants); [System architecture: data and consistency](../architecture/system-overview.md#data-and-consistency-strategy); [ADR-001: guardrails](../decisions/ADR-001-modular-monolith.md#guardrails).
- **Open questions:** Later account qualification, overassignment and full formula details, and authoritative audit/event retention model remain open; the bounded first-slice equations and persistence/concurrency rules are accepted.

## NFR-PERF — Response-time and calculation performance

- **ID:** NFR-PERF
- **Name:** Keep core read and write workflows responsive
- **Priority/status:** P1 — provisional product-quality target; thresholds require validation and profiling.
- **Scope:** Dashboard, monthly summary, transaction list, RTA/category calculation, and ordinary financial writes in the academic deployment shape.
- **Requirement statements:**
  - **Product-quality goal:** The dashboard and monthly summary should feel responsive for the expected academic MVP dataset.
  - **Product-quality goal:** Ordinary transaction, transfer, assignment, and category-move requests should return without requiring client-side balance calculation.
  - **Clone decision:** Correctness and explainability take precedence over premature caching or optimization.
  - **Target (provisional):** For a representative local MVP dataset, p95 dashboard/monthly-summary response should be at or below 1 second and p95 ordinary financial-write response at or below 1 second, excluding network and cold-start effects.
  - **Open question:** Representative dataset size, hosted-environment budget, pagination thresholds, and final response-time targets must be agreed before performance is treated as a release gate.
- **Operational/verification criteria:**
  - **Given** an agreed representative fixture and warm local services **When** dashboard and monthly-summary endpoints are measured **Then** p95 latency is recorded against the provisional target.
  - **Given** a transaction or allocation command **When** it succeeds **Then** the response includes authoritative derived values without requiring a second client-side calculation.
  - **Given** a dataset exceeding the agreed transaction-list page size **When** the list is requested **Then** pagination prevents an unbounded response.
- **Traceability:** FR-PLANNING, FR-TRANSACTION, FR-ACCOUNT, FR-ROLLOVER. [System architecture: goals](../architecture/system-overview.md#goals), [System architecture: data and consistency](../architecture/system-overview.md#data-and-consistency-strategy), [Technology stack: API conventions](../architecture/stack.md#api-conventions).
- **Open questions:** Dataset and hardware assumptions; whether p95 thresholds apply in CI/hosted evaluation; profiling point at which cached read models are justified.

## NFR-REL — Determinism, idempotency, and recovery

- **ID:** NFR-REL
- **Name:** Produce repeatable and recoverable financial behavior
- **Priority/status:** P0 — determinism and atomicity are baseline constraints; broader recovery is a P1 operational target.
- **Scope:** Budget-engine rebuilds, retryable commands, transfers, scheduled generation, failure handling, stale writes, and recovery diagnostics.
- **Requirement statements:**
  - **Clone decision:** Rebuilding the same authoritative history shall produce the same summaries, classifications, and alerts.
  - **Clone decision:** First-slice mutating financial commands (setup/opening movement, assignments, moves, realized income, and categorized spending) shall carry an idempotency key. The same key plus the same command payload replays the same logical result; the same key plus a different payload returns `CONFLICT`.
  - **Clone decision:** Stale concurrent financial writes shall return `CONFLICT` rather than overwrite authoritative history.
  - **Clone decision:** A failed atomic command shall leave authoritative state unchanged and expose a request identifier for diagnosis.
  - **Product-quality goal:** The system should provide a documented rebuild/reconciliation path for derived data before production-like evaluation.
  - **Open question:** Broader idempotency coverage for later-slice commands, transfers, imports, and scheduled generation, plus the exact recovery tooling/retention policy, remains unresolved.
- **Operational/verification criteria:**
  - **Given** the same account, category, transaction, allocation, and rollover history **When** the engine rebuilds twice **Then** all returned values and classifications match.
  - **Given** the same idempotency key and identical first-slice mutating command payload **When** the financial creation command is submitted twice **Then** the same logical result is replayed and only one financial effect exists.
      - **Given** an idempotency key already used with a different first-slice mutating command payload **When** the command is submitted **Then** it returns `CONFLICT` and preserves authoritative state.
  - **Given** a stale version **When** a write is attempted **Then** it returns `CONFLICT` and preserves the newer state.
  - **Given** a deliberately failed multi-effect command **When** recovery inspection runs **Then** no one-sided account/plan state is present.
- **Traceability:** FR-PLANNING, FR-TRANSACTION, FR-TRANSFER, FR-ROLLOVER, FR-SCHEDULED, FR-RECONCILIATION. [Budget engine research: deterministic rebuilding](../research/budget-engine.md#atomicity-and-deterministic-rebuilding); [Domain model: consistency](../architecture/domain-model.md#consistency-requirements); [System architecture: data and consistency](../architecture/system-overview.md#data-and-consistency-strategy).
- **Open questions:** Idempotency scope for manual commands; rebuild trigger and permissions; recovery after database/service interruption; scheduled retry policy.

## NFR-UX — Accessible, understandable, responsive user experience

- **ID:** NFR-UX
- **Name:** Make financial state understandable and usable
- **Priority/status:** P1 — product-quality baseline for the MVP UI; detailed visual acceptance remains to be validated.
- **Scope:** Web client, forms, dashboard, category summaries, transaction workflows, validation feedback, keyboard use, and responsive layouts.
- **Requirement statements:**
  - **Product-quality goal:** Core workflows shall be usable with keyboard navigation, clear labels, visible focus, sufficient contrast, and semantic form controls.
  - **Product-quality goal:** Validation errors shall explain what the user must correct and shall identify the affected field or operation without exposing internals.
  - **Product-quality goal:** Dashboard, monthly summary, account, category, and transaction views shall remain usable on supported desktop and narrow viewport sizes.
  - **Clone decision:** Negative RTA, cash overspending, credit overspending, and protected reconciliation states shall be visible as distinct states, not encoded only by color.
  - **Clone decision:** Deferred features shall be identified as deferred rather than appearing partially supported.
  - **Open question:** Target accessibility conformance level, supported browser/viewport matrix, and final copy/design system require team confirmation.
- **Operational/verification criteria:**
  - **Given** a required or invalid form field **When** submission fails **Then** the user receives an actionable message associated with the field or operation.
  - **Given** a user navigating the main budgeting journey by keyboard **When** focus moves through the interface **Then** the current focus is visible and the journey remains operable.
  - **Given** a category with negative RTA or overspending **When** it is shown **Then** the state is conveyed through text/structure as well as color.
  - **Given** a supported narrow viewport **When** the dashboard is loaded **Then** primary values and actions remain readable and usable without hidden critical information.
- **Traceability:** FR-AUTH, FR-PLANNING, FR-TRANSACTION, FR-RECONCILIATION, FR-ROLLOVER, FR-CREDIT-CARD. [MVP scope: basic feedback](mvp-scope.md#basic-feedback); [Technology stack](../architecture/stack.md#recommendation).
- **Open questions:** WCAG target; exact responsive breakpoints; browser/device support; final content and interaction review process.

## NFR-MAINT — Modularity, documentation, linting, and tests

- **ID:** NFR-MAINT
- **Name:** Keep the academic implementation understandable and verifiable
- **Priority/status:** P0 — baseline engineering constraint for maintainability; coverage thresholds are provisional targets.
- **Scope:** Backend module boundaries, domain services, documentation, formatting/linting, unit/integration/end-to-end tests, and change review.
- **Requirement statements:**
  - **Clone decision:** The implementation shall preserve explicit modules for identity, budgets, accounts, categories, transactions, planning, and reports; modules communicate through application services or stable contracts rather than each other's repositories.
  - **Clone decision:** Domain calculations shall not depend on HTTP or UI code.
  - **Clone decision:** Public functional and non-functional behavior shall remain documented before implementation of ambiguous rules.
  - **Clone decision:** The project shall expose and run repository scripts for format check, lint, unit/integration tests, E2E where the environment permits, and build in CI or the agreed evaluation command. The first-slice matrix is the implementation entry-gate verification baseline.
  - **Product-quality goal:** The mandatory first-slice test matrix includes unit tests for money arithmetic, bounded RTA/Available, and allocation rules; integration tests for authorization isolation, PostgreSQL atomicity, idempotency replay/conflict, optimistic concurrency, and deterministic rebuild; and Playwright E2E for the primary journey. Later-slice split, transfer, rollover, and reconciliation tests remain roadmap coverage.
  - **Open question:** No numeric coverage threshold is established; coverage is a non-blocking target. CI provider and whether OpenAPI contract checks are required remain open; this does not start SDD/OpenSpec work.
- **Operational/verification criteria:**
  - **Given** a change to a domain rule **When** the focused test suite runs **Then** the affected behavior is covered without requiring UI-only verification.
  - **Given** an import or module dependency **When** architecture checks run **Then** modules do not reach directly into another module's repository.
  - **Given** a pull-request candidate **When** the agreed quality commands run **Then** repository format-check, lint, unit/integration, permitted E2E, and build scripts report results without silently skipping failures.
  - **Given** a requirement with unresolved policy **When** implementation planning begins **Then** the question is resolved or the feature remains explicitly deferred.
- **Traceability:** All FRs, especially FR-PLANNING, FR-TRANSACTION, FR-TRANSFER, FR-ROLLOVER, and FR-RECONCILIATION. [System architecture: backend modules](../architecture/system-overview.md#backend-module-responsibilities); [System architecture: testing](../architecture/system-overview.md#testing-strategy); [ADR-001: guardrails](../decisions/ADR-001-modular-monolith.md#guardrails); [Technology stack](../architecture/stack.md#recommendation).
- **Open questions:** Coverage and lint thresholds; contract-testing scope; exact module dependency enforcement; documentation review cadence.

## NFR-OBS — Safe logging, metrics, and request identifiers

- **ID:** NFR-OBS
- **Name:** Diagnose requests without exposing financial secrets
- **Priority/status:** P1 — operational target for the API; safe logging constraints are mandatory.
- **Scope:** Request logs, error responses, metrics, correlation/request identifiers, domain failures, and future background processes.
- **Requirement statements:**
  - **Clone decision:** Error responses shall use `{error:{code,message,requestId}}`; success responses shall use `{data,requestId}`. The request identifier must support diagnosis without exposing passwords, tokens, bank credentials, or unnecessary financial payloads.
  - **Clone decision:** Structured logs should record request outcome, stable error category, module/operation, and timing while minimizing financial values and identifiers.
      - **Clone decision:** Minimal diagnostic identity for a first-slice financial command shall include the affected command/resource identity where available, plus the request and idempotency identities.
  - **Clone decision — later MVP slice:** Minimum audit identity for transaction history and deletion shall include the actor, transaction identity, request/correlation identity where applicable, timestamp, and reason when available. Visibility is limited to the authorized relevant budget/user boundary.
  - **Product-quality goal:** Metrics should make authentication failures, authorization denials, validation/conflict rates, errors, request latency, and rebuild/generation failures observable.
  - **Clone decision:** Logs and metrics shall not be treated as an authoritative financial ledger.
  - **Open question:** Full audit retention, deletion history, reconciled corrections, log retention, metric backend, sampling, alert thresholds, and whether a background worker will exist are later/future operational policies.
- **Operational/verification criteria:**
  - **Given** a failed API request **When** the error is returned and logged **Then** the response and log share a request identifier and use a stable error category without exposing raw database errors or unnecessary financial payloads.
  - **Given** a request containing credentials or financial payloads **When** it is logged **Then** credentials are absent and financial data is minimized or redacted.
  - **Given** a repeated error category **When** metrics are inspected **Then** failures and latency can be grouped without requiring raw transaction payloads.
- **Traceability:** FR-AUTH, FR-TRANSACTION, FR-RECONCILIATION, FR-SCHEDULED. [System architecture: error handling](../architecture/system-overview.md#error-handling); [System architecture: security](../architecture/system-overview.md#security-boundaries); [API conventions](../architecture/stack.md#api-conventions).
- **Open questions:** Retention and access to logs; exact redaction policy; metric/alert tooling; request-ID propagation through future scheduler/import adapters.

## NFR-PRIVACY — Minimize sensitive financial data exposure

- **ID:** NFR-PRIVACY
- **Name:** Avoid credential and unnecessary financial-data disclosure
- **Priority/status:** P0 — baseline privacy constraint; retention details are open.
- **Scope:** Credentials, session material, financial payloads, logs, errors, support/debug workflows, and future integrations.
- **Requirement statements:**
  - **Clone decision:** Passwords, session secrets, access tokens, and bank credentials shall never appear in logs, user-facing errors, or ordinary analytics.
  - **Clone decision:** The API shall return only the financial fields required by the operation or view; full payloads are not logged by default.
  - **Clone decision:** Bank synchronization and real financial-institution credentials are out of MVP; no requirement authorizes collecting them now.
  - **Product-quality goal:** Access to financial records should be limited to the authorized user/budget boundary and the minimum operational personnel/fixtures required for evaluation.
  - **Open question:** Data retention, deletion/export rights, encryption-at-rest configuration, and future import-provider credential storage remain unresolved.
- **Operational/verification criteria:**
  - **Given** invalid credentials or an internal failure **When** an error is returned **Then** the message does not reveal secrets or raw database details.
  - **Given** request/response logging is enabled **When** a transaction or authentication request is processed **Then** credentials are never logged and financial fields are minimized/redacted.
  - **Given** a test fixture for one budget **When** another user queries it **Then** authorization prevents access and no sensitive existence detail is disclosed beyond the configured error policy.
- **Traceability:** FR-AUTH, FR-ACCOUNT, FR-TRANSACTION, FR-RECONCILIATION, FR-SCHEDULED. [System architecture: security boundaries](../architecture/system-overview.md#security-boundaries); [MVP scope: out of scope](mvp-scope.md#out-of-scope-for-mvp); [Actors and use cases: stable errors](actors-and-use-cases.md#stable-error-categories).
- **Open questions:** Retention/deletion/export policy; encryption-at-rest expectations; fixture handling; future provider token lifecycle.

## NFR-TIME — Date, timezone, and monthly-calendar semantics

- **ID:** NFR-TIME
- **Name:** Make financial dates and month boundaries explicit
- **Priority/status:** P0 — date correctness and the accepted first-slice timezone policy are baseline constraints.
- **Scope:** Transaction dates, timestamps, active planning months, rollover, reconciliation, scheduled occurrences, and API/database date handling.
- **Requirement statements:**
  - **Clone decision:** A transaction date is a date-only calendar/business date interpreted in the budget timezone, while event timestamps are stored and compared in UTC.
  - **Clone decision:** A planning month uses an explicit `YYYY-MM`-style calendar boundary and must not depend on the browser's local timezone by accident. The first slice stores one explicit IANA budget timezone, defaults it to `UTC`, and does not permit timezone changes after budget creation.
  - **Clone decision:** Rollover and summaries use the budget's configured timezone; the browser timezone never decides month boundaries.
  - **Product-quality goal:** UI, API, engine, and persistence shall display and interpret the same date/month for a given budget.
  - **Open question:** DST behavior, scheduled occurrence cutoff, and historical timezone changes remain deferred/Open question; they do not alter the accepted first-slice UTC-default policy.
- **Operational/verification criteria:**
  - **Given** a transaction near UTC midnight **When** it is viewed in a budget **Then** its calendar date follows the explicit budget-date policy rather than an accidental client timezone.
  - **Given** the last day of a planning month **When** rollover is calculated **Then** the transaction and category activity are assigned to the documented month boundary.
  - **Given** a future scheduled occurrence **When** generation is evaluated **Then** the scheduler uses the same configured budget timezone and occurrence policy as the UI/API.
- **Traceability:** FR-BUDGET, FR-TRANSACTION, FR-ROLLOVER, FR-RECONCILIATION, FR-SCHEDULED. [Technology stack: data modeling](../architecture/stack.md#data-modeling-guidelines); [Budget engine research: open questions](../research/budget-engine.md#open-questions); [Actors and use cases: pre-implementation questions](actors-and-use-cases.md#pre-implementation-questions).
- **Open questions:** DST; date-only versus instant transport details; scheduled cutoff and closed-month boundaries. Budget timezone selection is `UTC` by default and timezone changes are disallowed after creation in the first slice.

## NFR-BACKUP — Future backup and recovery strategy

- **ID:** NFR-BACKUP
- **Name:** Define future backup and financial recovery controls
- **Priority/status:** P2 — deferred/future requirement; not a first-vertical-slice delivery gate.
- **Scope:** Database backups, restore testing, derived-summary rebuilds, exports, disaster recovery, retention, and operational ownership.
- **Requirement statements:**
  - **Product-quality goal:** A future deployment should be able to recover authoritative financial history and rebuild derived summaries without inventing or losing money.
  - **Clone decision:** PostgreSQL authoritative records and documented rebuild behavior are the future recovery foundation; cached summaries are not the sole source of truth.
  - **Clone decision:** Backup/restore design is deferred from the academic MVP and must not be implied by the current local Docker Compose shape.
  - **Target (provisional):** Before any production-like deployment, the team should define backup frequency, retention, restore ownership, and a tested restore/rebuild exercise.
  - **Open question:** Backup destination, encryption, retention period, RPO/RTO, export format, point-in-time recovery, and who may restore or inspect financial data are undecided.
- **Operational/verification criteria:**
  - **Given** an approved future backup design **When** a restore exercise runs **Then** authoritative transactions, allocations, reconciliation events, and tenant boundaries are restored and derived summaries rebuild deterministically.
  - **Given** a derived-summary cache is unavailable **When** a recovery/rebuild operation runs **Then** the system can recreate summaries from authoritative records or reports a bounded failure without fabricating values.
  - **Given** the current Phase 1/MVP scope **When** deployment is evaluated **Then** backup capability is marked deferred rather than represented as complete.
- **Traceability:** FR-BUDGET, FR-ACCOUNT, FR-PLANNING, FR-TRANSACTION, FR-RECONCILIATION, FR-ROLLOVER. [System architecture: data and consistency](../architecture/system-overview.md#data-and-consistency-strategy); [System architecture: deployment shape](../architecture/system-overview.md#deployment-shape); [ADR-002](../decisions/ADR-002-financial-history.md#consequences).
- **Open questions:** Backup/restore owner; RPO/RTO; encryption and retention; export/import format; restore authorization and audit process.

## Cross-cutting traceability matrix

| NFR | Functional requirements | Primary architecture/research/decision references | Status |
|---|---|---|---|
| NFR-SEC | FR-AUTH, FR-BUDGET, FR-ACCOUNT, FR-CATEGORY, FR-TRANSACTION, FR-RECONCILIATION | [System security](../architecture/system-overview.md#security-boundaries); [Domain identity](../architecture/domain-model.md#identity-and-access); [Actors and use cases](actors-and-use-cases.md) | P0 constraint; Group 3 first-slice policy accepted |
| NFR-DATA | FR-PLANNING, FR-TRANSACTION, FR-TRANSFER, FR-ROLLOVER, FR-CREDIT-CARD | [Budget invariants](../research/budget-engine.md#engine-invariants); [Consistency strategy](../architecture/system-overview.md#data-and-consistency-strategy); [ADR-001](../decisions/ADR-001-modular-monolith.md#decision) | P0 constraint; first-slice persistence policy accepted |
| NFR-PERF | FR-PLANNING, FR-TRANSACTION, FR-ACCOUNT, FR-ROLLOVER | [Architecture goals](../architecture/system-overview.md#goals); [API conventions](../architecture/stack.md#api-conventions) | P1 provisional target |
| NFR-REL | FR-PLANNING, FR-TRANSACTION, FR-TRANSFER, FR-ROLLOVER, FR-SCHEDULED, FR-RECONCILIATION | [Deterministic rebuilding](../research/budget-engine.md#atomicity-and-deterministic-rebuilding); [Domain consistency](../architecture/domain-model.md#consistency-requirements); [System consistency](../architecture/system-overview.md#data-and-consistency-strategy) | P0/P1 constraint and target; first-slice idempotency/concurrency accepted |
| NFR-UX | FR-AUTH, FR-PLANNING, FR-TRANSACTION, FR-RECONCILIATION, FR-ROLLOVER, FR-CREDIT-CARD | [MVP basic feedback](mvp-scope.md#basic-feedback); [Stack recommendation](../architecture/stack.md#recommendation) | P1 quality baseline |
| NFR-MAINT | All FRs, especially FR-PLANNING, FR-TRANSACTION, FR-TRANSFER, FR-ROLLOVER | [Backend modules](../architecture/system-overview.md#backend-module-responsibilities); [Testing](../architecture/system-overview.md#testing-strategy); [ADR-001](../decisions/ADR-001-modular-monolith.md#guardrails) | P0 constraint; numeric threshold open |
| NFR-OBS | FR-AUTH, FR-TRANSACTION, FR-RECONCILIATION, FR-SCHEDULED | [Error handling](../architecture/system-overview.md#error-handling); [Security](../architecture/system-overview.md#security-boundaries) | P1 target, safety constraints mandatory |
| NFR-PRIVACY | FR-AUTH, FR-ACCOUNT, FR-TRANSACTION, FR-RECONCILIATION, FR-SCHEDULED | [Security](../architecture/system-overview.md#security-boundaries); [MVP out of scope](mvp-scope.md#out-of-scope-for-mvp) | P0 constraint |
| NFR-TIME | FR-BUDGET, FR-TRANSACTION, FR-ROLLOVER, FR-RECONCILIATION, FR-SCHEDULED | [Data modeling](../architecture/stack.md#data-modeling-guidelines); [Budget-engine questions](../research/budget-engine.md#open-questions) | P0 constraint; first-slice UTC-default policy accepted, later DST policy open |
| NFR-BACKUP | FR-BUDGET, FR-ACCOUNT, FR-PLANNING, FR-TRANSACTION, FR-RECONCILIATION, FR-ROLLOVER | [Consistency strategy](../architecture/system-overview.md#data-and-consistency-strategy); [Deployment](../architecture/system-overview.md#deployment-shape); [ADR-002](../decisions/ADR-002-financial-history.md#consequences) | P2 deferred/future |

## Pre-implementation decisions and open questions

Group 3 closes the first-slice authentication/session, authorization isolation, timezone, stack, persistence/concurrency/idempotency, API envelope, and verification-gate decisions. The following later-slice or refinement questions remain explicitly open; they are intentionally not hidden inside a performance number or technical assumption:

1. **Authentication:** closed for the first slice as local email/password with server-managed opaque sessions; external identity providers are deferred/out of MVP.
2. **Authorization:** future member roles, ownership transfer, collaboration boundary, and member permissions.
3. **Financial formulas:** full-MVP RTA, Available, rollover, credit-card payment, refund, positive-card-balance, and mixed-spending policies; see [Budget engine open questions](../research/budget-engine.md#open-questions).
4. **Time semantics:** DST behavior, scheduled occurrence cutoff, and whether a historical timezone can change; the first-slice timezone defaults to UTC and cannot change after creation.
5. **Reliability:** broader later-slice idempotency scope, rebuild permissions, and recovery after interruption remain open; first-slice stale-write and idempotency behavior is accepted.
6. **Performance:** representative dataset, evaluation hardware, p95 targets, pagination thresholds, and criteria for introducing cached read models.
7. **UX/accessibility:** WCAG target, supported browser/viewport matrix, error-copy standard, and visual review process.
8. **Observability/privacy:** log retention, redaction rules, metric backend, alert thresholds, access to diagnostics, and financial-data retention/deletion/export policy.
9. **Maintainability:** numeric coverage threshold, CI provider, module-boundary enforcement, and contract-test scope; the mandatory first-slice test matrix and repository verification scripts are accepted.
10. **Backup:** backup destination, encryption, retention, RPO/RTO, restore owner, export format, and restore audit process.
11. **Deferred automation:** target subset, scheduled-generation timing, retry/missed-occurrence policy, and the P2 acceptance gate.

Until these questions are resolved, the affected behavior remains a documented constraint/target with an explicit open policy, not an implicit implementation promise.
