# Proposal: Simulate Advanced Bolivian Bank Providers

## Intent

Add a deterministic, local-only simulation capability for Bolivia-inspired provider personas. The capability gives owners a safe way to exercise connection and synchronization edge cases without contacting banks, handling credentials, changing financial truth, or moving real money.

## Business problem and product outcome

The current budgeting slice has no reproducible provider-like workflow for testing pending/posted records, duplicate delivery, partial progress, or retry failures. This makes ingestion behavior difficult to demonstrate and verify. After this change, an owner can select a clearly fictional test profile, run a reproducible scenario, inspect checkpoints and audit entries, and review provenance-rich candidate records without changing balances, categories, reports, history, transfers, or CSV data.

## Capabilities

- **New:** `bank-provider-simulation` — local profile catalog, fixture-backed state machine, durable runs/checkpoints/audit, and read-only candidate projections.
- **Modified:** None. `identity-access`, `account-management`, `budgeting`, `transaction-history`, `reporting`, `transfers`, and `csv-manual-import-export` remain authoritative and are reused without redefining their existing financial or manual-import semantics.

## Confirmed scope

- Fictional/test-only Bolivia-inspired presets with neutral codes and labels; no logos, live URLs, affiliation claims, credentials, or institution data.
- A pure deterministic fixture/state-machine engine with a fixture version and seed, injected clock, ordered batches, stable source record IDs, pending/posted records, duplicate policy, failure points, timeout behavior, and deterministic retry outcomes.
- Synchronous local run controls limited to create/start, advance, retry, and inspect status, candidates, checkpoints, and audit. Runs MUST be reproducible and idempotent for the same budget, run/request identity, fixture version, and seed.
- Isolated persistence for profiles, runs, attempts, checkpoints, simulated records, and audit entries. Provider attempts and candidates MUST NOT reuse `FinancialEvent` as budgeting effects.
- Owner-authorized, budget-scoped read-only candidate projections with stable candidate identity and provenance. Candidates MUST remain outside ordinary financial equations and reports.
- API/OpenAPI and focused domain, authorization, PostgreSQL atomicity, retry, timeout, partial-sync, duplicate, checkpoint, audit, and no-network contract coverage needed to expose this slice.

## Explicit non-goals

- External APIs, network calls, webhooks, workers, polling infrastructure, scraping, live data, real credentials, banking authentication, account verification, or official bank integration.
- Payments, transfers, deposits, withdrawals, account linking, account balance synchronization, or any real-money movement.
- Applying, importing, editing, deleting, reconciling, or otherwise converting candidates into ordinary YNAB transactions. Candidate application requires a later separately approved capability.
- Changes to canonical account balances, RTA, category Activity/Assigned/Available, transfers, effective transaction history, reports, or CSV import/export.
- Claims that a preset models any named bank’s actual systems, reliability, policies, or formats. Legal/product review of public labels remains a later gate.

## Affected areas

- **New domain and persistence:** simulation catalog, fixture schema, state-transition validator, run/checkpoint engine, candidate identity, and isolated PostgreSQL state.
- **API/server/OpenAPI:** narrowly scoped owner-authorized simulation routes using existing authentication, non-disclosure, validation, and response-envelope conventions.
- **Web:** no ordinary account-flow or bank-branding changes; any later surface MUST be clearly marked as local simulation with a no-network/no-money status.
- **Existing capabilities:** integration tests MUST prove that simulation state is invisible to ordinary financial projections and manual CSV behavior.

## Dependencies

The implementation depends on the existing server-managed session and owner-only budget authorization, PostgreSQL as the durable authority, established budget-scoped idempotency/versioning conventions, and the existing API envelope/OpenAPI contract. It also depends on a separately approved naming/legal review before exposing any Bolivia-inspired public labels.

## Risks and rollback

- **Misleading affiliation:** fictional labels, no logos/URLs/credentials, and explicit simulation banners contain this risk.
- **Financial contamination:** separate tables/models and candidate-only projections prevent simulated records from becoming effects.
- **Nondeterministic retries:** pure transitions, fixture seed/version, stable IDs, checkpoints, and atomic attempt persistence make replay testable.
- **Scope drift toward aggregation:** no-network and no-application invariants MUST be enforced in domain, API, tests, and UI.

Rollback can disable simulation routes and new run creation while preserving existing budgeting data. It MUST not rewrite financial events or delete ordinary budget history. A schema or migration validation failure MUST leave the existing budgeting read/write path available.

## Success criteria

- Repeated runs with identical profile, fixture version, seed, and commands produce identical states, candidates, checkpoints, diagnostics, and audit ordering.
- Tests demonstrate legal connection/sync transitions and deterministic pending/posted, duplicate, failure, retry, timeout, partial-sync, and idempotent-replay outcomes.
- Unauthorized or foreign-budget access is non-disclosing; PostgreSQL restart/rebuild preserves run, checkpoint, candidate, and audit state.
- Simulation operations advance neither budget version nor financial equations and create no `FinancialEvent`, transfer, transaction-history, report, or CSV record.
- No test or runtime path performs network I/O or accepts/persists real credentials.
- Candidate application is absent and explicitly deferred to a later approved proposal.

## Deferred decisions

The follow-on spec/design phase must finalize candidate deduplication keys, pending-to-posted representation, bounded retention/limits, supported profile labels, and the exact route/DTO surface without expanding the confirmed boundary.
