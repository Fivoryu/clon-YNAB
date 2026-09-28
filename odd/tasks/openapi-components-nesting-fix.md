# Feature: Fix OpenAPI Components Nesting and Add a Structural Regression Check

## Objective
Make `apps/api/openapi.yaml` structurally valid: declare `components:` at the document root so every `#/components/...` reference resolves, and add a dependency-free regression check that fails on the broken nesting.

## Defect
`apps/api/openapi.yaml` declared the top-level keys `openapi`, `info`, `servers`, and `paths` at column 0, but `components:` (line 452) was indented by two spaces, exactly like the route keys and the four section keys below it. YAML therefore parsed `components`, `securitySchemes`, `parameters`, `responses`, and `schemas` as sibling keys under `paths`, producing `paths.components` and no top-level `components`. Every `$ref: '#/components/...'` in the document was unresolvable by a strict OpenAPI/YAML consumer.

## Why
Two independent verifiers flagged the nesting as a pre-existing structural defect that predates the reporting work and invalidated the whole contract document for strict consumers.

## Scope and constraints
- Edit only `apps/api/openapi.yaml` and `apps/api/test/openapi.test.ts`.
- Do not change API behavior, routes, schema meanings, or response shapes.
- Do not touch `apps/api/src/` or `apps/web/`.
- Do not install dependencies and do not add a YAML library.
- Do not commit and do not push.
- Preserve pre-existing untracked `.codegraph/` and `.pi/`.

## Root-cause refinement (deviation from the prescribed edit)
The task prescribed dedenting lines 452-654 by exactly two spaces and updating the parameter/schema assertions from four spaces to two. Both prescriptions were verified against the real bytes before editing and are incorrect for this file:

- Line 452 `  components:` is indented 2, and lines 453 (`  securitySchemes:`), plus `parameters:`, `responses:`, and `schemas:`, are also indented 2. Entries under those sections are indented 4.
- A uniform 2-space dedent of 452-654 therefore moves all five keys to column 0 as siblings; it does not nest the sections under `components`.
- The two prescribed "facts" were checked and are true (no block scalars in 452-654; minimum indent in range is exactly 2), but they only prove the edit is whitespace-preserving, not that it fixes the nesting.
- The correct fix is that only line 452 is over-indented: the section keys are already at the correct indent (2) to be children of a column-0 `components:`.

In-memory structural evaluation of each candidate (same logic as the new regression check):

| Candidate | `components:` col | sections under `components` | refs resolved |
| --- | --- | --- | --- |
| HEAD (broken) | none | n/a | 0/432 |
| Uniform 2-space dedent 452-654 (prescribed) | 0 | `[]` | 0/432 |
| Dedent only line 452 (applied) | 0 | `securitySchemes, parameters, responses, schemas` | 432/432 |

Consequence for the assertions: because the applied fix keeps section entries at indent 4 under sections at indent 2, the shared-parameter assertion `^    <Name>:` (4 spaces) and the schema assertion `    <Name>:` (4 spaces) remain correct and were left unchanged. Changing them to 2 spaces would have broken the anchored parameter assertion or weakened the schema assertion, so no assertion was weakened.

## Fix
- `apps/api/openapi.yaml`: dedent line 452 from `  components:` to `components:` (one line, leading whitespace only). No other line, content, addition, or removal.
- `apps/api/test/openapi.test.ts`:
  - Replaced the `responseBlock` helper's fixed eight-space slice (`document.indexOf('\n        ', ...)`) with structural slicing: it finds the named response's own indentation and slices to the next line whose indentation is less than or equal to it.
  - Added the structural regression test `OpenAPI declares components at the document root and every component reference resolves`.
  - Confirmed `operationBlock`'s `components` boundary still bounds each path block: the new `\ncomponents:` line at column 0 now caps the last path block instead of falling through to end-of-file.

## New regression check
Test: `OpenAPI declares components at the document root and every component reference resolves` (dependency-free; string and indentation logic only).

Asserts:
- `components:` and `paths:` are declared at column 0.
- `paths:` (the block from `paths:` to the next column-0 key) contains no nested `components` key.
- The sections declared directly under `components:` are exactly `securitySchemes`, `parameters`, `responses`, and `schemas`.
- Every `#/components/<section>/<name>` match in the document resolves to an entry declared under that section.

It reports the validated reference count via `t.diagnostic`; observed: `resolved 432 #/components references across 4 sections`.

## Whitespace-only proof
- `git diff -w -- apps/api/openapi.yaml` -> empty (only an LF/CRLF warning on stderr).
- `git diff --numstat -- apps/api/openapi.yaml` -> `1	1`.

## Changed-line totals
- `apps/api/openapi.yaml`: `1	1`.
- `apps/api/test/openapi.test.ts`: `59	2`.

## Checks
- `node --experimental-strip-types --test apps/api/test/openapi.test.ts` -> 4 pass, 0 fail.
- `npm test` (repository root) -> tests 120, pass 100, fail 0, skipped 20, duration ~5097 ms. The 20 skips are the PostgreSQL-gated tests and are expected without `DATABASE_URL` (`DATABASE_URL` was unset).

## RED/GREEN evidence
- Strict TDD was not activated by the parent.
- RED (structural regression check against the pre-fix shape): temporarily re-indented line 452, confirming `git diff --stat HEAD -- apps/api/openapi.yaml` was empty (exact pre-fix bytes). The new test failed with `components: must be declared at column 0`, while the other three tests passed. The fixed state was then restored and `git diff --numstat` returned to `1	1`.
- GREEN: `npm test` -> 0 failures with the fix applied.

## Progress
- Verified both prescribed facts (no block scalars in 452-654; minimum indent exactly 2).
- Verified the prescribed uniform dedent does not fix the nesting; applied the minimal correct fix instead.
- Updated the test helper and added the regression check.
- Ran the focused test and the full suite; captured the RED proof against the pre-fix shape.
- No commit and no push.

## Parent review and hardening closure

- Independent verification returned no blockers and confirmed the deviation was correct: all five keys sat at indent 2, so the prescribed uniform dedent would have left `components` with no children and all 432 references unresolved. The minimal one-line fix is the correct one.
- The verifier independently recounted the references: 432 occurrences, 113 unique, all resolving. It noted that references span 3 sections (`securitySchemes` is referenced by name, not by `$ref`), so the diagnostic's "4 sections" counts declared sections. Cosmetic only.
- The verifier also noted that the schema-coverage assertion loop was not line-anchored, unlike the parameter loop. The owner authorized the hardening, so the loop now asserts `^    <Name>:` with the multiline flag. All 21 schema names have exactly one indent-4 line-start declaration, so the anchored assertion passes and is strictly stronger. `npm test` after the hardening: 120 tests, 100 passed, 20 skipped, 0 failed.
- Remaining acknowledged limit: no OpenAPI/YAML validator is installed, so structural validity and reference resolution are proven, but full strict semantic validity of the document is not certified.

## Next step
Delivery decisions, then the next roadmap phase.
