# Sync Report: Category Targets

- Status: PASS
- Change: `add-category-targets`
- Source specs: `openspec/changes/add-category-targets/specs/budgeting/spec.md`, `.../specs/reporting/spec.md`, `.../specs/guided-budgeting-ux/spec.md`
- Canonical specs: `openspec/specs/budgeting/spec.md`, `openspec/specs/reporting/spec.md`, `openspec/specs/guided-budgeting-ux/spec.md`
- Operation: `openspec archive` merged three deltas into existing canonical specs.
- Applied totals: `+ 5`, `~ 1`, `- 0`, `→ 0`.
  - `budgeting`: three requirements added — the target definition, the invariant that a target changes no financial value, and the derived state for a requested month.
  - `reporting`: one requirement added for the target state in the dashboard and monthly summary, and one requirement modified.
  - `guided-budgeting-ux`: one requirement added for presentation with explicit confirmation.
- MODIFIED requirements: `Unsupported reporting concepts are excluded` retained its canonical scenario and now permits category target state on the dashboard and the canonical monthly summary while keeping it out of the report endpoints and keeping every other excluded concept unavailable.
- REMOVED requirements: none.
- Pre-archive validation: `openspec validate add-category-targets` reported valid.
- Active same-domain change warnings: none. No active changes remain after archiving.
- Destructive merge approval: not applicable. The five additions were new requirements and the single modification retained its canonical scenario.

## Consequences for later phases

The budgeting capability now canonically covers one target per category of either kind, the invariant that a target moves no money, and the derivation for a requested month. A future change that wants weekly, annual, or custom rhythms, refill behaviour, snooze, more than one target per category, or target history must modify these requirements explicitly rather than treating them as unspecified. The reporting capability now canonically permits target state on the dashboard and the monthly summary and still forbids it in the report endpoints.
