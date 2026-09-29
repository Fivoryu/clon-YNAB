# Feature: Align Simulation Replay Flags Across Stores and Tests

## Objective
Align in-memory simulation replay responses with the Prisma simulation store by returning `replayed: true` only for replayed create, execute, and inspect commands, and update the parity tests without weakening their existing guarantees.

## Divergence and evidence
- `PrismaSimulationStore` already returns `{ ...saved, replayed: true }` for replayed `createRun`, `execute`, and `inspect` calls.
- `InMemorySimulationStore` currently returns the stored receipt unchanged in those replay paths.
- `SimulationResult` and `SimulationInspectResult` already declare the optional replay flag.
- Replay parity assertions in the simulation API, HTTP, and PostgreSQL tests currently compare replay results directly with first results, so they encode the divergent in-memory behavior.
- The PostgreSQL cleanup ordering fix that deletes `SimulationAuditEntry` before `SimulationCheckpoint` and `SimulationAttempt` is preserved.

## Fix
- `apps/api/src/persistence/simulation-store.ts`: added `replayed: true` to the InMemorySimulationStore receipt-return paths for `createRun` (line 77), `execute` (line 103), and `inspect` (line 130). First executions still return the stored result without the flag; the Prisma store was not changed.
- Updated six simulation replay-parity assertions: create and execute in `simulation-api.test.ts`, the BudgetApp replay in `simulation-api.test.ts`, the HTTP replay in `simulation-http.test.ts`, and both PostgreSQL execute replays in `simulation-postgres.test.ts`. Each now compares against the original payload plus `replayed: true`; existing projection/revision/outcome checks and PostgreSQL attempt/receipt counts remain intact. Added first-execution assertions where applicable to prove the flag is replay-only.
- Preserved the parent cleanup ordering in both PostgreSQL cleanup paths: `SimulationAuditEntry` is deleted before `SimulationCheckpoint` and `SimulationAttempt`.

## Checks
- Focused simulation suite: `node --experimental-strip-types --test apps/api/test/simulation-api.test.ts apps/api/test/simulation-http.test.ts apps/api/test/simulation-postgres.test.ts` -> 14 tests, 10 passed, 0 failed, 4 skipped without `DATABASE_URL`.
- `npm test` -> 146 tests, 125 passed, 0 failed, 21 skipped without `DATABASE_URL`.
- `DATABASE_URL='postgresql://ynab:ynab_local@localhost:5434/ynab_dev' npm test` -> 146 tests, 145 passed, 1 failed, 0 skipped. All 21 database-gated tests ran. The remaining simulation failure is `PostgreSQL simulation commands remain financially neutral across failure, replay, and rebuild` at `apps/api/test/simulation-postgres.test.ts:107:1`: `SimulationDomainError: The requested simulation transition is not legal` (`ILLEGAL_TRANSITION`), from the in-memory comparison path at `apps/api/src/persistence/simulation-store.ts:108:18` / `apps/api/src/simulation/engine.ts:89:90`.

## Changed-line count
Task implementation delta, excluding pre-existing parent changes in `apps/api/openapi.yaml` and the PostgreSQL cleanup reorder: 15 added lines and 9 removed lines across the four source/test files. Per file: `simulation-store.ts` 3/3; `simulation-api.test.ts` 6/3; `simulation-http.test.ts` 2/1; `simulation-postgres.test.ts` 4/2 for this task. New task record: 27 lines. The working tree also retains the parent's pre-existing OpenAPI and PostgreSQL cleanup changes.

## OpenAPI decision and remaining follow-up
`apps/api/openapi.yaml` already documents `replayed: { type: boolean }` on `SimulationResult` (line 621), but it does not document sibling `diagnostic`; repository search found no `diagnostic` property on that schema. The conditional addition therefore does not apply: OpenAPI was not edited. Follow-up: document optional `diagnostic` on `SimulationResult` if that contract is intended to be exposed.

## Third defect layer: identical command sequence exposes projection divergence

### Evidence
- The strict cursor-driven `BO_INSPIRED_A` fixture requires `START` before `ADVANCE`; the in-memory comparison run previously omitted `START`, causing `ILLEGAL_TRANSITION` before the normalized comparison could execute.
- Both runs now receive `START` and three effective `ADVANCE` commands. The durable run retains the replay of the same `neutral-advance` idempotency key, and the in-memory run receives the equivalent effective first `ADVANCE`; both finish at `PARTIAL`, cursor `4`, revision `4`, command count `4`, and attempt count `4`.
- The full `assert.deepEqual(normalizeProjection(durableProjection), normalizeProjection(memoryProjection))` remains unchanged and executes.

### Fix
- `apps/api/test/simulation-postgres.test.ts`: create both runs before commands, start the in-memory run, and mirror the durable run's effective first `ADVANCE` before the existing two-command loop. No assertion was deleted, weakened, relaxed, or reordered around.

### Exact command results
- `npm test` -> `146` tests, `125` passed, `0` failed, `21` skipped, `0` todo.
- `DATABASE_URL='postgresql://ynab:ynab_local@localhost:5434/ynab_dev' npm test` -> `146` tests, `145` passed, `1` failed, `0` skipped, `0` todo. All `21` database-gated tests ran.
- The database-gated failure is `PostgreSQL simulation commands remain financially neutral across failure, replay, and rebuild` at `apps/api/test/simulation-postgres.test.ts:107:1`, assertion at line `141:12`: `AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal`.

### Final state
- The original `ILLEGAL_TRANSITION` is fixed and the normalized comparison now runs, but it exposes a real adapter divergence. The durable projection has candidate and provenance `sourceRecordId: 'bo_inspired_a-source-1'`; the in-memory projection has `sourceRecordId: 'synthetic-source-1'` in both locations. All other reported normalized run, checkpoint, audit, and candidate fields match. Per the task constraint, no expectation was adjusted and work stops here pending resolution of that adapter divergence.

## Fourth defect layer: stale seed versus code catalog divergence

### Evidence and `listProfiles` decision
- The migration seeds five enabled rows (`BO_INSPIRED_A` through `BO_INSPIRED_E`) with the same metadata shape generated by the catalog: display labels `Bolivia-inspired fictional preset A` through `E`, the shared fictional description, fixture version `2026-01`, and `enabled: true`.
- Direct comparison of the enabled database rows with `listSimulationProfiles()` agrees for every seeded profile. The new database-gated guard also compares `PrismaSimulationStore.listProfiles()` with `listSimulationProfiles()` and passes. `listProfiles` therefore remains unchanged.
- The seeded fixture is stale: it has two batches with one record each and `synthetic-source-1`; the catalog has four batches sized `1, 2, 1, 1` and source IDs `bo_inspired_a-source-1`, `bo_inspired_a-source-2`, and `bo_inspired_a-source-3` (with the corresponding code-derived IDs for the other profiles).

### Single-source fix and drift guard
- `PrismaSimulationStore.profile` still uses the database row only as the enabled/available referential gate. It now returns `getSimulationProfile(code, fixtureVersion)`, so the database `fixture` column is not read for behavior. A missing or disabled row remains `NOT_FOUND`.
- An enabled row missing from the catalog becomes `SimulationPersistenceError('VALIDATION_ERROR', ...)` with both its code and fixture version in the message; the test inserts `BO_UNKNOWN_DRIFT/2026-01` and verifies this failure through `createRun`.
- The database-gated guard verifies every enabled seeded row resolves through `getSimulationProfile`, confirms each seeded fixture differs from the catalog fixture, and deep-equals the durable adapter's resolved profile (including fixture) to the catalog profile. This proves the seeded column is ignored rather than merely matching by accident.
- No use of `catalogDigest()` was necessary because direct metadata and fixture deep comparisons provide the required drift evidence.

### Exact command results
- `npm test` -> `1..147`, `# tests 147`, `# suites 0`, `# pass 125`, `# fail 0`, `# cancelled 0`, `# skipped 22`, `# todo 0`, `# duration_ms 8458.9757`.
- `DATABASE_URL='postgresql://ynab:ynab_local@localhost:5434/ynab_dev' npm test` -> `1..147`, `# tests 147`, `# suites 0`, `# pass 147`, `# fail 0`, `# cancelled 0`, `# skipped 0`, `# todo 0`, `# duration_ms 10470.3533`.
- All 22 database-gated tests ran in the database-enabled command; none were skipped. The normalized financial-neutrality `assert.deepEqual` now executes fully and passes.
