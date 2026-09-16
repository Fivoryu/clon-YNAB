# Technical Design: Deterministic Local Bank-Provider Simulation

## Decision summary

Implement the approved first slice as a new, isolated simulation subsystem. A pure fixture/state-machine engine will run immutable, synthetic fixtures from a local catalog. `BudgetApp` will expose owner-scoped orchestration, while a new simulation persistence adapter will own PostgreSQL tables, simulation revisions, checkpoints, attempts, candidate history, audit ordering, and command receipts. The subsystem will not call `FinancialStore`, write `FinancialEvent`, use `CommandReceipt`, change the budget version, or enter any financial projection.

The API will add synchronous JSON routes for profile listing, run creation, start, one-step advance, retry, and inspection. There will be no worker, queue, polling, webhook, external provider client, credential field, candidate application route, account-linking route, or money movement. The web application remains unchanged in this slice; existing web tests remain regression coverage for the budgeting-only UI boundary.

This document changes only this design artifact. The files listed below are implementation work and MUST NOT be changed during the design phase.

## Context and repository constraints

The existing API is a small TypeScript service:

- `apps/api/src/app.ts` authenticates sessions, owner-scopes budgets, normalizes commands, and maps domain results to `{ data, requestId }` envelopes.
- `apps/api/src/server.ts` performs explicit route matching, JSON body parsing, cookie extraction, request-ID handling, and `If-Match` parsing.
- `apps/api/src/persistence/financial-store.ts` locks the budget row and uses `CommandReceipt` count as the financial budget version. It folds `FinancialEvent` and `Transfer` into canonical financial state.
- `apps/api/src/persistence/in-memory-budget-store.ts` and `InMemoryFinancialStore` provide serialized fast-test behavior, but are not durability evidence.
- `apps/api/src/persistence/budget-store.ts` is the owner-scoped canonical budget/account/category reader.
- `apps/api/prisma/schema.prisma` models financial authority and uses composite budget/account/category foreign keys.
- `apps/api/openapi.yaml` is the API contract authority.
- `apps/api/test/openapi.test.ts`, HTTP tests, and PostgreSQL tests assert route shape, envelopes, authorization, rollback, idempotency, and restart behavior. `apps/web/test/page.test.ts` asserts that the browser remains server-authoritative and budgeting-focused.

Canonical transaction-history, reporting, transfer, and CSV specifications explicitly exclude banking synchronization and pending/uncleared concepts. The simulation capability is additive: simulated records are candidates, not transactions, and are never passed to existing financial normalizers or report equations.

## Goals and non-goals

### Goals

- Expose a local catalog of fictional, Bolivia-inspired test personas using neutral codes and simulation-only labels.
- Run versioned, seeded, bounded fixtures through a deterministic state machine.
- Support `DISCONNECTED`, `CONNECTING`, `CONNECTED`, `SYNCING`, `PARTIAL`, `FAILED`, `TIMED_OUT`, and `SUCCEEDED`; never make `APPLIED` reachable.
- Persist runs, attempts, checkpoints, synthetic records, candidates, candidate lifecycle history, audit entries, profiles, and simulation idempotency receipts separately from financial state.
- Make create/start/advance/retry/inspect synchronous and replay-safe.
- Return owner-authorized, budget-scoped, provenance-rich read-only candidate projections.
- Prove PostgreSQL atomicity, restart/rebuild consistency, non-disclosure, deterministic retry, duplicate handling, timeout, partial progress, and financial neutrality.

### Non-goals

No external API, network call, webhook, worker, queue, polling process, scraping, live data, real credential, banking authentication, account verification, official bank integration, account linking, balance synchronization, payment, deposit, withdrawal, transfer, or real-money movement is introduced. No candidate can be edited, deleted, reconciled, imported, applied, or converted into a `FinancialEvent`. Existing account, budgeting, history, reporting, transfer, and CSV semantics remain unchanged. No web simulation surface is added in this slice.

## Domain design

### Immutable profile catalog

The application owns a finite catalog of persisted, immutable profile definitions. The initial public-safe codes are neutral, for example `BO_INSPIRED_A` through `BO_INSPIRED_E`, with labels such as `Bolivia-inspired fictional preset A`. The implementation MUST not seed named-bank labels until the naming/legal decision is complete. A profile contains synthetic behavior metadata only:

```ts
type SimulationProfile = {
  code: string;
  displayLabel: string;
  description: string;
  fixtureVersion: string;
  fixture: FixtureDefinition;
  enabled: boolean;
};
```

`fixture` is validated at load/migration time and is never accepted from an HTTP caller. It contains no endpoint, URL, logo, institution name, credential, authentication, or affiliation field. The catalog route is still under `/budgets/{budgetId}` so authentication and budget authorization happen before profile results are disclosed. A profile request containing any provider-shaped object or forbidden field is rejected before persistence and without any network operation.

### Fixture contract

`apps/api/src/simulation/types.ts` will define the shared contract. A fixture is immutable after catalog publication:

```ts
type FixtureDefinition = {
  profileCode: string;
  fixtureVersion: string;
  maxCommands: number;
  transitions: FixtureTransition[];
  batches: FixtureBatch[];
  duplicatePolicy: 'MARK_DUPLICATE';
  retryPolicy: RetryPolicy;
};

type FixtureBatch = {
  index: number;
  records: FixtureRecord[];
};

type FixtureRecord = {
  sourceRecordId: string;
  businessDate: string;
  amountMinor: number;
  status: 'PENDING' | 'POSTED' | 'REJECTED';
  payee: string | null;
  memo: string | null;
};
```

Transition definitions identify the current state, next state, batch cursor effect, and optional deterministic failure or timeout outcome. A retry policy identifies which outcome states may resume, the checkpoint cursor to use, and the bounded retry outcome. Failure and timeout are modeled as fixture results, not real timers. No wall-clock sleep is used.

Records are ordered by fixture batch index and record index. `sourceRecordId` is stable within a fixture version. A duplicate delivery has the same source ID and a later delivery ordinal; it produces a `DUPLICATE` candidate under the profile's deterministic policy and never produces an ordinary transaction.

### Run and transition state

A run stores `profileCode`, `fixtureVersion`, `seed`, the immutable fixture identity, an injected-clock-derived event timeline, cursor, current state, revision, command count, and last safe diagnostic. The run ID is generated once on accepted creation and persisted; its value is part of the run identity. Candidate IDs, attempt IDs, checkpoint IDs, and audit IDs are derived from persisted run/sequence identities or are persisted before the response, so a replay or restart never changes them.

The legal state graph is:

```text
DISCONNECTED --start--> CONNECTING
CONNECTING --advance--> CONNECTED
CONNECTED --advance--> SYNCING
SYNCING --advance--> PARTIAL | FAILED | TIMED_OUT | SUCCEEDED
PARTIAL --retry--> SYNCING | FAILED | TIMED_OUT | SUCCEEDED
FAILED --retry--> SYNCING | FAILED | TIMED_OUT | SUCCEEDED
TIMED_OUT --retry--> SYNCING | FAILED | TIMED_OUT | SUCCEEDED
```

`advance` follows exactly one fixture-defined transition. A batch can be committed at a checkpoint before a subsequent fixture-defined failure/timeout is returned, so `FAILED` or `TIMED_OUT` retains all prior committed candidates and the last checkpoint. `retry` resumes from that checkpoint and is legal only when the fixture retry policy allows it. `SUCCEEDED` and all other unsupported jumps reject with a stable conflict and no mutation. `APPLIED` has no enum value in the reachable API response and no transition in the engine.

The pure engine signature will be equivalent to:

```ts
type EngineContext = {
  profile: SimulationProfile;
  seed: string;
  clock: () => number; // injected; never client supplied
  limits: SimulationLimits;
};

type RunSnapshot = {
  state: SimulationRunState;
  cursor: number;
  revision: number;
  processedRecordCount: number;
};

type TransitionPlan = {
  next: RunSnapshot;
  outcome: 'STARTED' | 'ADVANCED' | 'RETRIED' | 'FAILED' | 'TIMED_OUT' | 'PARTIAL' | 'SUCCEEDED';
  deliveries: FixtureDelivery[];
  checkpoint?: CheckpointPlan;
  diagnostic?: SafeDiagnostic;
};

function applyCommand(
  context: EngineContext,
  command: 'START' | 'ADVANCE' | 'RETRY',
  run: RunSnapshot,
  persistedCheckpoint: CheckpointSnapshot | null,
): TransitionPlan;
```

The engine performs no I/O, UUID generation, database access, HTTP call, or financial calculation. Seeded branching uses a documented deterministic pseudo-random helper with checked integer arithmetic. The seed, fixture version, command sequence, and injected clock values are stored as run inputs/evidence; server time is never accepted from the caller.

### Candidate identity and provenance

The first slice chooses a run-scoped source identity: one normal candidate identity is derived from `(runId, sourceRecordId, deliveryOrdinal)` and is independent of ordinary transaction IDs. Pending-to-posted is one candidate identity with append-only candidate lifecycle entries, not a replacement candidate. A duplicate delivery is a separate candidate with the same source record ID and a `DUPLICATE` status, linked to the original source identity in provenance. This gives reviewers a visible duplicate outcome without creating a financial record.

The public projection is:

```ts
type SimulationCandidate = {
  id: string;
  runId: string;
  status: 'PENDING' | 'POSTED' | 'DUPLICATE' | 'REJECTED';
  sourceRecordId: string;
  businessDate: string;
  amountMinor: number;
  payee: string | null;
  memo: string | null;
  provenance: {
    budgetId: string;
    profileCode: string;
    fixtureVersion: string;
    seed: string;
    sourceRecordId: string;
    deliveryOrdinal: number;
    batchIndex: number;
    checkpointId: string | null;
    attemptId: string;
  };
  lifecycle: CandidateLifecycleEntry[];
};
```

The projection exposes synthetic fields and bounded safe diagnostics only. It does not expose fixture JSON, raw payloads, credentials, endpoint data, SQL errors, or language implying a live provider relationship. Candidate reads are side-effect free. There is no application DTO or route; requests using guessed application paths are unavailable and cannot mutate either candidate or budget state.

## HTTP and application contracts

### Routes

Add these exact owner-scoped routes under `/api/v1/budgets/{budgetId}/simulations`:

| Method | Route | Purpose | Mutation |
|---|---|---|---|
| `GET` | `/profiles` | List enabled fictional local profiles | No |
| `POST` | `/runs` | Create a `DISCONNECTED` run | Yes |
| `POST` | `/runs/{runId}/start` | Execute the start control | Yes |
| `POST` | `/runs/{runId}/advance` | Execute one fixture transition | Yes |
| `POST` | `/runs/{runId}/retry` | Resume from the last checkpoint | Yes |
| `GET` | `/runs/{runId}` | Read status/progress | No |
| `GET` | `/runs/{runId}/candidates` | Read candidate projections | No |
| `GET` | `/runs/{runId}/checkpoints` | Read ordered checkpoints | No |
| `GET` | `/runs/{runId}/audit` | Read ordered simulation audit | No |
| `POST` | `/runs/{runId}/inspect` | Return one requested inspect projection and record one idempotent inspect activity | Yes (audit only) |

`GET` reads do not require idempotency and do not append audit entries. The explicit `inspect` control exists to satisfy audited command identity: it accepts a bounded `view` (`STATUS`, `CANDIDATES`, `CHECKPOINTS`, or `AUDIT`), records one `INSPECT` audit entry without changing run state or revision, and stores/replays its result by request identity. Candidate GET remains strictly side-effect free.

Create and every mutating run control require `Idempotency-Key`. Start, advance, retry, and inspect also require the existing integer/quoted/weak-quoted `If-Match` syntax, interpreted as the run's `simulationRevision`, not the financial budget version. Create has no run revision and therefore uses only its idempotency key. `X-Request-ID` remains optional and is returned in every envelope. No route accepts a client timestamp, credential, endpoint, URL, logo, authentication, account, or financial transaction field.

Create input is:

```json
{
  "profileCode": "BO_INSPIRED_A",
  "fixtureVersion": "2026-01",
  "seed": "demo-seed-01"
}
```

The create response contains `{ run, simulationRevision: 0 }`. Control responses contain the resulting run snapshot, bounded outcome, newly committed attempt/checkpoint summaries, and candidate deltas. Inspect responses contain only the selected projection. All successful responses use `{ data, requestId }`; all errors use `{ error, requestId }`.

Stable status mapping is:

- `401 UNAUTHENTICATED`: missing, expired, or revoked session.
- `404 NOT_FOUND`: inaccessible budget, foreign/unknown run, candidate, checkpoint, or audit ID; no existence details are disclosed.
- `400 VALIDATION_ERROR`: malformed body, unsupported property, invalid profile/fixture/seed, invalid header, illegal bound, or forbidden provider-shaped field.
- `409 CONFLICT`: illegal state transition, stale simulation revision, idempotency payload conflict, unsupported retry, exhausted command/attempt limit, or durable uniqueness conflict.
- `500 INTERNAL_ERROR`: unexpected failure with a generic message and no SQL, stack, fixture payload, network, or foreign-resource details.

There are intentionally no `415` simulation routes because all simulation endpoints consume JSON; an unsupported method/content shape is a validation or generic route failure under existing server behavior.

### Application orchestration

`BudgetApp` will gain a `SimulationStore` dependency after the existing financial-store arguments, preserving current constructor call sites. Production construction in `startProductionServer` will pass `new PrismaSimulationStore(prisma)`; the default in-memory app will pass `InMemorySimulationStore` tied to the in-memory budget owner boundary.

Each app method follows the established order:

1. Authenticate the session using the existing server-managed cookie.
2. Resolve the selected budget through `requireBudget`, which uses the authenticated owner and preserves non-disclosing `NOT_FOUND` behavior.
3. Normalize and bound input before fixture lookup or persistence. Canonicalize the command payload before digesting it.
4. Call the simulation store with authenticated `ownerId`, `budgetId`, run identity, request identity, expected simulation revision, and injected clock.
5. Map `PersistenceError` and domain diagnostics to existing `ApiError` codes and return the standard envelope.

The simulation path MUST NOT call `financial()`, `FinancialStore.execute`, `BudgetStore.saveBudget`, `ReportService`, or any existing transaction command. It may use the existing authentication and budget reader solely for authorization. Simulation revision, audit sequence, and idempotency are independent of `Budget.version` and `CommandReceipt`.

## Persistence design

### Prisma models and isolation

Add isolated models to `apps/api/prisma/schema.prisma`. Names below are the contract; exact Prisma relation syntax will follow the existing composite tenant-FK style:

- `SimulationProfile`: immutable `code`, `fixtureVersion`, neutral display metadata, validated fixture JSON, enabled flag, and unique `(code, fixtureVersion)`.
- `SimulationScope`: one row per budget, containing `budgetId`, a simulation audit sequence, and a simulation lock/version sequence. It is the simulation serialization boundary and does not update `Budget`.
- `SimulationRun`: budget, profile code/version, seed, state, cursor, revision, command/attempt counters, safe diagnostic fields, and timestamps. It has a budget-scoped unique identity.
- `SimulationAttempt`: budget/run, ordered attempt sequence, idempotent request key, command, prior/result states, outcome, bounded diagnostic, and event timestamp.
- `SimulationCheckpoint`: budget/run, ordered sequence, cursor, state, processed count, and checkpoint timestamp.
- `SimulatedRecord`: budget/run, fixture source ID, batch index, delivery ordinal, synthetic date/amount/status/payee/memo, and checkpoint/attempt provenance.
- `SimulationCandidate`: budget/run, simulated-record link, stable candidate identity, current status, synthetic projected fields, and provenance JSON. Its budget/run and budget/record references are tenant-scoped.
- `SimulationCandidateEvent`: append-only candidate lifecycle changes with prior/result status, attempt/checkpoint IDs, and ordered event timestamp.
- `SimulationAuditEntry`: budget/run, monotonically ordered scope sequence, actor, request identity, command, prior/result state, outcome, attempt/checkpoint links, and safe diagnostic fields.
- `SimulationCommandReceipt`: budget-scoped idempotency key, command, canonical payload digest, sanitized result JSON, optional run ID, and creation timestamp.

All child tables include `budgetId` and use composite `(budgetId, parentId)` foreign keys where the parent has a tenant-scoped unique key. Amounts are PostgreSQL `BIGINT` only where numeric arithmetic is needed; checked conversion to safe JavaScript integers occurs at the domain boundary. Dates are `DATE`; event times are UTC timestamps. JSON columns contain only bounded fixture/provenance/result data after validation.

No simulation model relates to `FinancialEvent`, `Transfer`, `OpeningBalance`, `BudgetMonth`, `CommandReceipt`, account, category, or transaction history. The only relation to `Budget` is ownership/authorization and the simulation scope's lock row. Database constraints enforce positive safe-range-compatible amounts, valid enum states, non-negative cursors/sequences, bounded string lengths, and uniqueness for run/request/attempt/checkpoint/candidate identities.

### Transaction protocol

`apps/api/src/persistence/simulation-store.ts` will expose methods analogous to, but separate from, `FinancialStore`:

```ts
interface SimulationStore {
  listProfiles(ownerId: string, budgetId: string): Promise<SimulationProfileSummary[]>;
  createRun(command: CreateSimulationCommand): Promise<SimulationResult>;
  execute(command: SimulationControlCommand): Promise<SimulationResult>;
  inspect(command: SimulationInspectCommand): Promise<SimulationInspectResult>;
  loadRun(query: OwnerScopedRunQuery): Promise<SimulationRunProjection>;
  listCandidates(query: OwnerScopedRunQuery): Promise<SimulationCandidateProjection[]>;
  listCheckpoints(query: OwnerScopedRunQuery): Promise<SimulationCheckpointProjection[]>;
  listAudit(query: OwnerScopedRunQuery): Promise<SimulationAuditProjection[]>;
}
```

For a create or control transaction, PostgreSQL will:

1. Locate the budget by `(budgetId, ownerId)` and return `NOT_FOUND` otherwise.
2. Lock or create the `SimulationScope` row. This serializes simulation commands per budget without advancing the financial version or taking part in financial equations.
3. Look up `(budgetId, idempotencyKey)` in `SimulationCommandReceipt`. Same digest returns the saved result; a different digest returns `CONFLICT` before mutation.
4. For a new control, lock the run, compare `If-Match` with `SimulationRun.revision`, and load the immutable profile plus persisted checkpoint/candidate state.
5. Invoke the pure engine with the stored fixture, seed, cursor, last checkpoint, and injected clock value. The engine returns a complete transition plan or a stable validation/conflict diagnostic.
6. Persist the attempt, any synthetic deliveries, candidate lifecycle events/current projections, checkpoint, run state/revision/counters, audit entry, and sanitized receipt in one transaction. Allocate audit/attempt/checkpoint sequences while holding the scope lock.
7. Commit all simulation rows together, or roll back every row from that command. A failed database write MUST leave no partial candidate, checkpoint, attempt, audit entry, receipt, or run revision.

A fixture failure or timeout is an accepted deterministic outcome and therefore commits the failed attempt, diagnostic, prior checkpoint, and resulting run state. An unexpected persistence error is a transaction failure and produces no partial state. Retrying a response-lost command uses the same idempotency key and returns the stored result.

`InMemorySimulationStore` will use a per-budget promise queue, clone state before applying a plan, use the same canonical digest and pure engine, and publish only after all writes succeed. Its behavior proves API/domain parity; PostgreSQL remains the authority for constraints, lock serialization, rollback, restart, and rebuild evidence.

### Idempotency and deterministic ordering

Canonical digests are SHA-256 over a stable JSON representation containing route/command, budget ID, run ID when present, profile/version/seed for create, normalized body, and expected simulation revision. Object keys are sorted and undefined fields are omitted. Credentials and client actor identity are never included because they are not accepted input. Key reuse with a different canonical payload conflicts. A receipt replay does not create an attempt, checkpoint, candidate, lifecycle event, audit entry, or revision.

Audit order is `SimulationScope.sequence ASC`; within an attempt, candidate lifecycle and checkpoint links use their durable sequence. Reads sort profiles by code/version, candidates by checkpoint sequence then stable candidate ID, checkpoints/attempts by sequence, and audit by scope sequence. No database retrieval order is observable.

## Limits, diagnostics, and safety

The initial implementation constants will be explicit and shared by domain, API, and persistence validation:

| Resource | Limit |
|---|---:|
| Catalog results | 50 profiles |
| Profile/fixture versions and seed | 128 Unicode code points each |
| Fixture batches | 100 |
| Records per fixture | 5,000 |
| Commands per run | 100 |
| Attempts per run | 20 |
| Candidates per run | 5,000 |
| Checkpoints per run | 500 |
| Audit entries per budget | 10,000 |
| Diagnostic message | 512 Unicode code points |
| JSON response body | 1 MiB |

Fixtures and create/control bodies are validated completely before a run is created or changed. Diagnostics have stable codes such as `PROFILE_UNAVAILABLE`, `FIXTURE_UNAVAILABLE`, `INVALID_SEED`, `ILLEGAL_TRANSITION`, `STALE_REVISION`, `FIXTURE_FAILURE`, `FIXTURE_TIMEOUT`, `PARTIAL_SYNC`, `LIMIT_EXCEEDED`, `UNSUPPORTED_CONTROL`, and `RESOURCE_UNAVAILABLE`. Messages are safe bounded text and never contain raw fixture data, credentials, SQL, network details, stack traces, or foreign-resource existence.

The security invariants are enforced in both domain and HTTP tests:

- profile codes select server-owned fixtures; callers cannot upload a fixture or provider metadata;
- all reads and writes use session owner plus budget predicates before resource detail;
- no simulation operation imports a network client or credential type;
- no simulation table is read by financial projections, history, reports, or CSV;
- candidate application and ordinary transaction identifiers are absent from the route and DTO unions;
- all state-changing rows are atomic and replay-safe.

### Threat matrix

**Not applicable.** This design adds authenticated application HTTP routes and PostgreSQL persistence, but no shell command, subprocess, VCS operation, PR automation, or external integration. The shell/subprocess/VCS/PR threat matrix therefore does not apply; HTTP authorization, input validation, non-disclosure, persistence isolation, and no-network invariants are covered by the contracts and tests above.

## Data flow

1. The server extracts the session cookie, request ID, JSON body, idempotency key, and (for controls) expected simulation revision using existing parsing conventions.
2. `BudgetApp` authenticates and owner-scopes the budget before looking up profile/run/candidate details.
3. The simulation store obtains the simulation scope lock, checks the budget-scoped simulation receipt, and locks the selected run for a new command.
4. The catalog fixture and persisted run/checkpoint are passed to the pure deterministic engine. It validates the legal transition, consumes the next bounded batch/record deliveries, and computes a transition plan without I/O.
5. The store atomically persists simulation state, candidate lifecycle/provenance, checkpoint, attempt, audit, and idempotency outcome.
6. The response projects the resulting run/candidates from simulation tables and returns the standard envelope. Financial state is not loaded or rewritten for a simulation command.
7. Financial budget reads continue through `BudgetStore`/`FinancialStore`; they cannot see simulation tables. Candidate and audit reads use only owner-scoped simulation queries.
8. A fresh process or PostgreSQL restart reloads the same persisted rows. Projection is a pure fold of run, records, candidate lifecycle, checkpoints, and audits, so repeated rebuilds produce the same output without inserts or financial effects.

## Concrete file impact

### New files

- `apps/api/src/simulation/types.ts` — state, fixture, candidate, diagnostic, limit, and command interfaces.
- `apps/api/src/simulation/catalog.ts` — neutral fictional profile catalog, fixture validation, forbidden-field validation, and profile projection.
- `apps/api/src/simulation/engine.ts` — pure deterministic transition graph, seeded fixture delivery, checkpoint planning, retry/failure/timeout logic, and safe diagnostics.
- `apps/api/src/simulation/projection.ts` — stable candidate/run/checkpoint/audit projections and deterministic ordering.
- `apps/api/src/persistence/simulation-store.ts` — Prisma transaction boundary, owner-scoped queries, atomic writes, receipt replay/conflict, and restart loading.
- `apps/api/src/persistence/in-memory-simulation-store.ts` — queued parity adapter and cloned test state.
- `apps/api/prisma/migrations/0006_bank_provider_simulation/migration.sql` — additive tables, enums, indexes, composite tenant constraints, checks, and neutral catalog seed.
- `apps/api/test/simulation-domain.test.ts` — pure catalog, fixture determinism, legal transitions, candidate identity/lifecycle, duplicate, checkpoint, retry, timeout, partial, limits, and diagnostics tests.
- `apps/api/test/simulation-api.test.ts` — in-memory app authorization, idempotency, non-disclosure, no-application, and financial-neutrality tests.
- `apps/api/test/simulation-http.test.ts` — route methods, headers, envelopes, status mapping, bounded bodies, and request IDs.
- `apps/api/test/simulation-postgres.test.ts` — PostgreSQL constraints, atomic rollback, concurrent commands, restart/rebuild, idempotency, and no-financial-row/version assertions.
- `apps/api/test/simulation-openapi.test.ts` — structural route/DTO/error coverage, or an extension to the existing OpenAPI test.

### Modified files during implementation

- `apps/api/src/app.ts` — simulation DTOs, dependency injection, owner-authorized orchestration, and control methods; no financial method changes.
- `apps/api/src/server.ts` — explicit simulation route matching and JSON body/header dispatch; existing routes remain unchanged.
- `apps/api/prisma/schema.prisma` — isolated simulation enums/models and relations.
- `apps/api/openapi.yaml` — simulation paths, headers, schemas, limits, safety descriptions, and stable responses.
- `package.json` only if a focused simulation test script is needed; existing `test` and `verify` semantics remain intact.
- `apps/web/test/page.test.ts` only if a regression assertion is needed to document that no provider UI or financial client calculation was added. No web application source is planned.

No canonical spec, task file, ordinary persistence model, financial planner, report service, CSV module, or unrelated file is part of this implementation slice.

## Testing strategy

### Pure/domain tests

- Assert all legal transitions and every illegal jump, including terminal-state protection and unreachable `APPLIED`.
- Run identical fixture/version/seed/clock/command inputs twice and compare normalized states, deliveries, diagnostics, checkpoint plans, candidate projections, and audit payloads.
- Change fixture version or seed and prove scenario identity/output changes without overwriting a prior run.
- Exercise pending-to-posted lifecycle, stable source IDs, duplicate delivery policy, rejected records, ordered batches, partial prefixes, failure after checkpoint, deterministic timeout, legal retry, retry without repeated candidate effects, and command/attempt limits.
- Assert stable safe diagnostics and absence of credentials, raw fixture payloads, SQL, network details, and stack traces.
- Assert profile labels/metadata remain fictional and requests containing endpoints, URLs, logos, credentials, authentication, or affiliation claims are rejected.

### In-memory application and HTTP tests

- Create a complete owner budget, list profiles, create/start/advance/retry/inspect, and read each projection.
- Assert missing sessions, foreign budgets, guessed run/candidate/checkpoint/audit IDs, and malformed controls are non-disclosing and non-mutating.
- Assert same idempotency key/payload replays exactly; changed payload, run, seed, or expected revision conflicts without mutation.
- Assert stale simulation revisions conflict while `Budget.version`, `FinancialEvent` history, reports, categories, transfers, and CSV results remain byte/value equivalent.
- Assert inspection receipts/audit activity are replay-safe and candidate GETs are side-effect free.
- Assert unsupported polling, worker, linking, application, and provider-connectivity paths are absent/unavailable and do not mutate state.
- Extend OpenAPI structural coverage for every new route, required security/header references, DTO enum, bounded fields, standard envelopes, and forbidden application/network descriptions.

### PostgreSQL tests

- Read the migration and verify every simulation table, enum, index, composite budget-scoped foreign key, uniqueness constraint, and bounded check. Verify the migration is additive and leaves existing tables/rows available.
- Commit a run, restart with a fresh Prisma client/app, and compare run state, attempts, checkpoints, candidate identities/status/lifecycle/provenance, diagnostics, and audit ordering.
- Rebuild projections repeatedly from persisted simulation records and assert no duplicate candidate, checkpoint, attempt, audit, or receipt rows.
- Inject a failure after candidate/checkpoint planning but before commit and assert all rows from that command roll back. Separately verify fixture-defined failure commits its prior checkpoint and safe failure outcome.
- Run concurrent clients against the same budget/run and assert scope/run locks, revision conflicts, serialized audit order, and one receipt/attempt per accepted request. Repeat concurrent identical idempotency requests and assert one committed outcome.
- Assert simulation creates no `FinancialEvent`, `Transfer`, `CommandReceipt`, account/category effect, report change, CSV row, or budget-version advancement.
- Assert PostgreSQL and in-memory normalized projections match for the same fixed clock/fixture inputs; do not treat in-memory success as durability evidence.

### Web regression

The first slice adds no web route or UI. Keep `apps/web/test/page.test.ts` green and retain its assertions that browser code uses authenticated API calls, does not calculate financial values, and has no provider/credential flow. A later UI proposal may consume these simulation DTOs only after a separate approved scope and naming/legal review.

## Migration, rollout, and rollback

### Forward rollout

1. Validate the schema and migration locally; confirm existing migrations `0001` through `0005` remain applied and that the migration only adds simulation objects.
2. Apply `0006_bank_provider_simulation` and generate the Prisma client. Verify table/constraint/index existence and seed only neutral fictional profile codes.
3. Deploy readers and store/domain code with simulation routes disabled by `SIMULATION_ENABLED=false`. Run existing API, financial, report, history, CSV, and web regression suites plus simulation migration checks.
4. Enable profile listing in a controlled environment, then enable run creation and controls after PostgreSQL atomicity, restart, non-disclosure, no-network, and idempotency checks pass. No financial route or budget-version behavior changes.
5. Monitor simulation row counts, command/attempt/diagnostic limit conflicts, transaction failures, and route error codes. Operational retention and rate limits remain explicit deployment decisions, not hidden behavior.

### Rollback and containment

Before any simulation rows exist, disable the feature and a reviewed reverse migration MAY remove unused additive objects. Once rows exist, rollback is route disablement plus forward-compatible readers; do not delete simulation evidence, alter financial history, or remove tables used by persisted runs. A failed command rolls back only its simulation transaction. A lost response is recovered by replaying its idempotency key. A fixture or naming problem is contained by disabling the affected profile/run creation while preserving other profiles and all ordinary budgeting behavior.

## Open questions

1. **Operational limits:** Are the initial per-run/per-budget limits above acceptable, and what retention/pruning policy applies to simulation attempts, candidate lifecycle entries, and audit rows? This must be decided before production exposure because pruning can affect replay and rebuild guarantees.
2. **Concurrency policy:** Should the simulation scope serialize all runs in a budget, or should independent runs use per-run locks with only a bounded audit-sequence allocator? The first implementation uses the simpler per-budget simulation scope lock.
3. **Clock policy:** What production clock/reproducibility contract is required when API runs use wall time, and should the API expose a server-selected clock profile rather than only persisting injected test-clock evidence?
4. **Profile catalog lifecycle:** May profile fixtures be added/disabled without a migration, or must every fixture version be cataloged and reviewed in a release? The first slice treats persisted profiles as immutable.
5. **Naming/legal review:** Which Bolivia-inspired labels, if any, may be exposed publicly, and must every label retain “fictional preset” plus “local simulation/no network/no real money” wording? Until approved, use neutral codes and labels only.
6. **Duplicate/pending semantics:** Is the selected run-scoped source identity and single pending-to-posted candidate acceptable for a future application workflow, or should a later capability define a run-independent deduplication fingerprint and linked revisions?
7. **Future application boundary:** If candidates are ever applied, what explicit confirmation, account mapping, financial command invariants, and cross-run deduplication rules must a separate proposal add? This slice intentionally provides no migration path or hidden hook for application.

## Review workload and delivery boundary

The complete implementation crosses domain, persistence/migration, HTTP/OpenAPI, and tests and is unlikely to fit one review under the 400 changed-line budget. Recommended ordered work units are:

1. **Fixture/domain core (250–340 authored lines):** types, neutral catalog, deterministic engine, projections, and pure tests.
2. **Isolated durable state (320–390 authored lines):** Prisma models/migration, Prisma/in-memory stores, transaction protocol, restart/rollback/concurrency tests.
3. **API and OpenAPI (280–370 authored lines):** `BudgetApp`, explicit `server.ts` routes, envelopes, authorization/non-disclosure, idempotency/revision tests, and contract schema.
4. **Regression verification (150–240 authored lines):** financial isolation, no-network contract checks, existing API/OpenAPI/web regression, and focused rollout evidence.

If a work unit exceeds 400 authored changed lines or introduces a new delivery boundary, pause for the explicit delivery decision required by the session context. No commit, push, shell automation, subprocess, VCS operation, or PR automation is part of this design.

## Design result

- **change:** `simulate-advanced-bolivian-bank-providers`
- **artifact:** `openspec/changes/simulate-advanced-bolivian-bank-providers/design.md`
- **status:** complete
- **nextRecommended:** apply
- **blockedReasons:** none
- **scope:** approved first slice only; deterministic local simulation with isolated persistence and read-only candidates
- **skill_resolution:** fallback-path (the available cognitive-doc-design skill was loaded from its declared path; no parent-injected skill path was present)
