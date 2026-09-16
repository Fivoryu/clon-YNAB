# Bank Provider Simulation Specification

## Purpose

Provide a local-only, deterministic simulation of fictional Bolivia-inspired provider personas so an authorized budget owner can exercise provider-like lifecycle and synchronization outcomes without network access, credentials, official integration, or financial effects.

## Requirements

### Requirement: Fictional local provider profiles

The system MUST expose only clearly fictional, Bolivia-inspired test profiles identified by neutral codes and labels. Profiles MUST NOT include official logos, live URLs, credentials, authentication prompts, institution data, or claims of affiliation, fidelity, reliability, or policy. Every profile presentation MUST identify the capability as local simulation.

#### Scenario: Owner selects a fictional profile

- GIVEN an authenticated owner views the local profile catalog
- WHEN the owner selects a supported Bolivia-inspired profile
- THEN the profile MUST be described as fictional/local simulation and MUST expose only synthetic behavior metadata

#### Scenario: Official integration is implied

- GIVEN a profile request contains an official endpoint, logo, credential, or named affiliation claim
- WHEN the request is validated
- THEN it MUST be rejected without persistence or network activity

### Requirement: No-network and no-credentials boundary

Simulation operations MUST execute without network I/O and MUST NOT accept, persist, transmit, or request real provider credentials, banking authentication, account verification, or external provider data. The capability MUST NOT perform payments, deposits, withdrawals, transfers, account linking, balance synchronization, or any real-money movement.

#### Scenario: A simulation run is executed offline

- GIVEN a valid local profile, fixture version, seed, and owner-authorized budget
- WHEN the owner creates or advances a run
- THEN the run MUST complete using local synthetic inputs only and MUST perform no network operation

#### Scenario: Credentials are supplied

- GIVEN a create or control request contains credential or authentication fields
- WHEN the request is validated
- THEN it MUST be rejected safely and MUST persist neither the credentials nor a run derived from them

### Requirement: Versioned deterministic fixtures and stable replay

Each run MUST identify its immutable profile, fixture version, and seed. For the same budget, run/request identity, profile, fixture version, seed, injected clock inputs, and command sequence, the system MUST produce identical observable states, candidate projections, checkpoints, diagnostics, attempt outcomes, and audit ordering. Fixture records MUST have stable source record identities and deterministic ordered batches.

#### Scenario: Identical commands reproduce a run

- GIVEN two runs with the same authorized budget, profile, fixture version, seed, clock inputs, and controls
- WHEN both runs are executed through the same command sequence
- THEN their states, candidates, checkpoints, failures, diagnostics, and audit entries MUST be identical

#### Scenario: A different fixture version changes the scenario identity

- GIVEN a run request uses the same profile and seed but a different fixture version
- WHEN the run is created
- THEN it MUST be treated as a distinct deterministic scenario and MUST NOT overwrite or replay the prior run

### Requirement: Legal simulation lifecycle transitions

The simulation state machine MUST allow only defined lifecycle transitions. It MUST support `DISCONNECTED`, `CONNECTING`, `CONNECTED`, `SYNCING`, `PARTIAL`, `FAILED`, `TIMED_OUT`, and `SUCCEEDED`; transitions MUST preserve ordered progress and MUST reject illegal jumps or transitions from terminal states. `APPLIED` MUST NOT be reachable in this slice.

#### Scenario: A run follows a legal sync path

- GIVEN a newly created run in `DISCONNECTED`
- WHEN the owner starts it and advances its fixture-defined transitions
- THEN it MUST progress only through legal states and MUST finish in the fixture-defined outcome

#### Scenario: An illegal transition is requested

- GIVEN a run in a state that does not permit the requested transition
- WHEN the owner attempts that transition
- THEN the request MUST return a stable validation or conflict result and MUST leave state, candidates, checkpoints, and audit history unchanged

#### Scenario: Application is attempted

- GIVEN a candidate in any simulation lifecycle state
- WHEN a caller requests application to ordinary budgeting
- THEN the capability MUST report application unavailable and MUST leave the candidate and budget unchanged

### Requirement: Synchronous bounded run controls

The capability MUST provide synchronous controls limited to create, start, advance, retry, and inspect. Each accepted control MUST return its resulting run outcome without requiring workers, queues, polling, webhooks, or background processing. Controls MUST validate bounded inputs and MUST not expose controls for application, reset-to-financial-state, or real provider connection.

#### Scenario: Owner advances a run synchronously

- GIVEN an owner-authorized run with an available fixture transition
- WHEN the owner calls advance
- THEN the response MUST contain the resulting state and bounded progress without requiring a later asynchronous job

#### Scenario: Unsupported control is requested

- GIVEN a caller requests polling, background execution, account linking, or candidate application
- WHEN the request is handled
- THEN it MUST be rejected or clearly marked unavailable and MUST not mutate simulation or financial state

### Requirement: Owner authorization and non-disclosure

Every profile, run, candidate, checkpoint, attempt, and audit read or mutation MUST require an authenticated session and authorization to the selected budget. Access to a foreign or inaccessible budget or its guessed identifiers MUST use safe non-disclosing behavior and MUST reveal neither existence nor contents.

#### Scenario: The owner inspects a run

- GIVEN a valid session for the owner of the selected budget
- WHEN the owner inspects an authorized run
- THEN the system MUST return only that budget's simulation data

#### Scenario: A foreign run is addressed

- GIVEN a valid session belonging to another budget owner
- WHEN the caller requests a guessed run, candidate, checkpoint, or audit identifier
- THEN the system MUST return the established non-disclosing result and MUST not reveal whether it exists

### Requirement: Isolated durable simulation state

Simulation profiles, runs, attempts, checkpoints, simulated records, candidates, and audit entries MUST be durably persisted as simulation state separate from authoritative financial events and ordinary transaction history. Simulation operations MUST NOT create or alter `FinancialEvent`, transfer, account balance, category values, RTA, Assigned, Activity, Available, budget version, report, or CSV state.

#### Scenario: A successful simulation advances

- GIVEN a budget with known financial projections and version
- WHEN a run creates candidates and checkpoints
- THEN only isolated simulation state MUST change; all financial projections and the budget version MUST remain identical

#### Scenario: A failed simulation command rolls back

- GIVEN an advance that would persist a state, candidate, checkpoint, and audit entry
- WHEN the durable operation fails
- THEN none of that operation's simulation state MUST be partially persisted

### Requirement: Stable candidate identity and provenance

Each candidate MUST have a stable identity independent of ordinary transaction identity and MUST retain provenance sufficient to identify its budget, run, profile, fixture version, seed, stable source record ID, batch/checkpoint context, and lifecycle history. Candidate projections MUST expose synthetic record data and status without exposing credentials or implying a live provider relationship.

#### Scenario: A candidate is inspected repeatedly

- GIVEN a candidate produced by a deterministic fixture
- WHEN the owner inspects it before and after replay or restart
- THEN its candidate identity, source identity, provenance, and effective lifecycle state MUST remain stable

#### Scenario: A duplicate source record is delivered

- GIVEN the fixture delivers the same stable source record more than once
- WHEN the run processes the duplicate
- THEN the candidate outcome MUST follow the fixture's deterministic duplicate policy, MUST remain provenance-linked, and MUST not create an ordinary transaction

### Requirement: Candidate lifecycle is read-only

Candidates MUST support only simulation lifecycle states `PENDING`, `POSTED`, `DUPLICATE`, and `REJECTED` in this slice. `APPLIED` MUST be absent from reachable behavior and response transitions. Candidate reads MUST be side-effect free, and candidates MUST NOT affect balances, financial events, transfers, effective transaction history, reports, CSV, or budget versions.

#### Scenario: Pending and posted records are reviewed

- GIVEN a fixture emits a pending record followed by a posted record
- WHEN the owner advances and inspects candidates
- THEN the statuses and provenance MUST reflect the deterministic fixture lifecycle while ordinary history and balances remain unchanged

#### Scenario: A candidate mutation is requested

- GIVEN a readable pending, posted, duplicate, or rejected candidate
- WHEN the caller attempts to edit, delete, reconcile, import, or apply it
- THEN the request MUST be unavailable or rejected and MUST not mutate candidate or financial state

### Requirement: Deterministic failure, timeout, partial sync, and retry

Fixture-defined failures, timeouts, and partial synchronization outcomes MUST be deterministic for the run seed and fixture version. A failure or timeout MUST preserve the last committed checkpoint and processed candidate outcomes, MUST expose bounded safe diagnostics, and MUST permit only fixture-legal retry transitions. Retry MUST not repeat committed effects or create duplicate attempts for the same idempotent request.

#### Scenario: Failure after a checkpoint

- GIVEN a run has durably committed a checkpoint and then reaches its fixture failure point
- WHEN advance reports failure
- THEN the run MUST be `FAILED`, prior checkpoint and candidate state MUST remain, and the diagnostic MUST contain no secrets or raw provider payload

#### Scenario: Timeout is deterministic

- GIVEN a fixture transition configured to time out
- WHEN equivalent runs reach that transition
- THEN both MUST report `TIMED_OUT` with equivalent bounded diagnostics and progress

#### Scenario: Retry resumes from the checkpoint

- GIVEN a failed or timed-out run with a legal retry outcome
- WHEN the owner retries it
- THEN the run MUST resume from the last committed checkpoint according to the fixture, without reapplying prior candidate outcomes

#### Scenario: Partial synchronization is inspected

- GIVEN a fixture returns only a bounded prefix of its ordered batches
- WHEN the owner inspects the run
- THEN the run MUST report `PARTIAL`, preserve processed records and checkpoint position, and not claim unprocessed records were synchronized

### Requirement: Idempotent command replay

Create, start, advance, retry, and equivalent inspect requests MUST have stable request identity and budget-scoped idempotency semantics. Repeating an identical command MUST replay the original result without advancing state, creating an attempt, duplicating candidates, adding a second checkpoint, or adding a second equivalent audit action. Reusing a request identity with a different canonical payload MUST conflict without mutation.

#### Scenario: An advance is replayed

- GIVEN an advance request has committed for a run
- WHEN the owner retries the same request identity and canonical payload
- THEN the original result MUST be returned and run state, candidates, checkpoints, attempts, and audit entries MUST not advance again

#### Scenario: Idempotency payload changes

- GIVEN a request identity was committed with one run control and payload
- WHEN it is reused with a different control, run, seed, or expected state
- THEN the request MUST conflict and MUST not mutate any state

### Requirement: Bounded resources and safe diagnostics

The capability MUST enforce explicit bounded limits for profile catalog results, fixture records and batches, run commands, attempts, candidates, checkpoints, audit entries, and diagnostic size. Over-limit requests or fixtures MUST be rejected before partial persistence. Diagnostics MUST use stable codes and safe bounded messages and MUST NOT include credentials, secrets, raw fixture payloads, SQL details, network details, or foreign-resource existence.

#### Scenario: A fixture exceeds a limit

- GIVEN a fixture or command exceeds an applicable record, batch, attempt, candidate, checkpoint, audit, or payload limit
- WHEN it is validated
- THEN the operation MUST fail with a stable bounded diagnostic and MUST persist no partial run state

#### Scenario: An internal failure is reported

- GIVEN a simulation operation encounters an unexpected persistence or engine error
- WHEN an error response is produced
- THEN it MUST contain a safe stable diagnostic and request identity only, without internal stack, query, secret, or unrelated budget details

### Requirement: Ordered auditable state changes

Every committed simulation state change MUST append an audit entry containing actor, budget, run, command/request identity, event time, prior state, resulting state or outcome, and relevant checkpoint/attempt identity without sensitive data. Audit entries MUST have deterministic ordering for equivalent runs, and failed atomic operations MUST append no orphan or partial entry.

#### Scenario: A run is audited in order

- GIVEN an owner creates, starts, advances, and inspects a run
- WHEN the audit stream is read
- THEN entries MUST appear in deterministic command order with state transitions and attempt/checkpoint provenance

#### Scenario: Audit state is rebuilt

- GIVEN persisted simulation state is rebuilt after a restart
- WHEN the audit stream is inspected
- THEN ordering and entry content MUST match the pre-restart effective simulation history

### Requirement: PostgreSQL restart and rebuild consistency

PostgreSQL MUST remain the durable authority for simulation state. After restart, reload, or rebuilding derived projections from persisted simulation records, the system MUST reproduce the same runs, states, attempts, checkpoints, candidates, provenance, diagnostics, and audit ordering exactly once. Rebuild MUST not create financial effects or advance a budget version.

#### Scenario: A completed run survives restart

- GIVEN a run containing retries, partial progress, duplicate outcomes, candidates, checkpoints, and audits
- WHEN PostgreSQL is restarted and the run is reloaded
- THEN all effective simulation state MUST be available with the same identities, statuses, ordering, and provenance

#### Scenario: Rebuild is repeated

- GIVEN the same persisted simulation records
- WHEN derived simulation views are rebuilt more than once
- THEN each rebuild MUST yield the same state without duplicate candidates, checkpoints, attempts, or audit entries

### Requirement: Explicit deferred boundaries

This capability MUST defer candidate application, real provider integration, account linking, and real money movement to separately approved capabilities. It MUST also defer official naming/legal claims and any conversion of simulation records into ordinary transactions. Existing identity, account, budgeting, transaction-history, reporting, transfer, and CSV semantics MUST remain authoritative and unchanged.

#### Scenario: A deferred capability is requested

- GIVEN a caller requests real provider connectivity, account linking, candidate application, or money movement
- WHEN the request is handled
- THEN it MUST be unavailable or rejected, MUST disclose no integration capability, and MUST leave all simulation and financial state unchanged
