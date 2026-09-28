# Sync Report: YNAB Screen and Capability Roadmap

- Status: PASS
- Change: `ynab-screen-parity-roadmap`
- Source specs: `openspec/changes/ynab-screen-parity-roadmap/specs/guided-budgeting-ux/spec.md`, `.../reporting/spec.md`, `.../transaction-history/spec.md`
- Canonical specs: `openspec/specs/guided-budgeting-ux/spec.md`, `openspec/specs/reporting/spec.md`, `openspec/specs/transaction-history/spec.md`
- Operation: `openspec archive` merged three deltas into existing canonical specs.
- Applied totals: `+ 5`, `~ 1`, `- 0`, `→ 0`.
  - `guided-budgeting-ux`: 2 requirements added.
  - `reporting`: 2 requirements added, 1 requirement modified.
  - `transaction-history`: 1 requirement added.
- MODIFIED requirements: `reporting` — "Unsupported reporting concepts are excluded". The canonical version is now the scoped variant that permits the basic single-month report's accounting treatment for supported transfers and working or pending records, while keeping every other excluded concept unavailable and forbidding the treatment from implying a cleared/uncleared, reconciliation, or multi-month workflow.
- REMOVED requirements: none.
- Pre-archive validation: `openspec validate ynab-screen-parity-roadmap` reported valid. An earlier validation failed because the delta's MODIFIED block renamed the canonical scenario "A deferred concept is requested"; the delta was corrected to preserve the canonical scenario name and its semantics before archiving, so nothing was silently dropped.
- Active same-domain change warnings: none. `openspec list` reports no active changes after archiving.
- Destructive merge approval: not applicable. All three targets were additive except the single MODIFIED reporting requirement, whose replaced block retains the canonical scenario.

## Consequence for later phases

The single-month prohibition is now canonical at `openspec/specs/reporting/spec.md:80`: "It MUST identify the selected month and MUST NOT combine months, compare multiple months, or present multi-month trends." A later multi-month change must therefore MODIFY a canonical requirement instead of contradicting an open change's delta.
