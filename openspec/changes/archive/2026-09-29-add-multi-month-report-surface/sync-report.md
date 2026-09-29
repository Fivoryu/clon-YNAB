# Sync Report: Multi-Month Report Surface

- Status: PASS
- Change: `add-multi-month-report-surface`
- Source specs: `openspec/changes/add-multi-month-report-surface/specs/reporting/spec.md` and `.../specs/guided-budgeting-ux/spec.md`
- Canonical specs: `openspec/specs/reporting/spec.md` and `openspec/specs/guided-budgeting-ux/spec.md`
- Operation: `openspec archive` merged two deltas into existing canonical specs.
- Applied totals: `+ 2`, `~ 2`, `- 0`, `→ 0`.
  - `reporting`: added `Multi-month series is presented with visible disclosures and a flow-only total`; modified `Unsupported reporting concepts are excluded`.
  - `guided-budgeting-ux`: added `Multi-month report view is reachable in the authenticated experience`; modified `Basic monthly report is reachable in the authenticated experience`.
- MODIFIED requirements: both preserved their canonical scenario names and bodies, so nothing was silently dropped. The single-month requirement now states that a separately specified multi-month view may additionally be reachable and that the single-month entry gains no multi-month behaviour within itself. The exclusion requirement now permits the bounded series and a chart that renders only measures already in the response and adds no derived or comparative value, while keeping month-to-month comparison, percentage change, trend fields, and every other excluded concept unavailable.
- REMOVED requirements: none.
- Pre-archive validation: `openspec validate add-multi-month-report-surface` reported valid.
- Active same-domain change warnings: none. No active changes remain after archiving.
- Destructive merge approval: not applicable. The two additions were new requirements and the two modifications retained their canonical scenarios.

## Consequence for later phases

The reporting capability now canonically covers the API contract, its presentation, and its reachability. A future change that wants month-over-month comparison, percentage change, or trend fields must modify these canonical requirements explicitly rather than treating them as unspecified.
