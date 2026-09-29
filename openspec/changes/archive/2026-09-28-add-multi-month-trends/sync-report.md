# Sync Report: Multi-Month Trends (API Contract)

- Status: PASS
- Change: `add-multi-month-trends`
- Source spec: `openspec/changes/add-multi-month-trends/specs/reporting/spec.md`
- Canonical spec: `openspec/specs/reporting/spec.md`
- Operation: `openspec archive` merged one delta into an existing canonical spec.
- Applied totals: `+ 2`, `~ 2`, `- 0`, `→ 0`.
  - Added: `Bounded multi-month report series` (6 scenarios) and `Multi-month series discloses recomputation and current labels`.
  - Modified: `Single-month basic report` and `Unsupported reporting concepts are excluded`.
- MODIFIED requirements: both preserved their canonical scenario names and bodies, so nothing was silently dropped. The single-month requirement now permits combining months **only** through the separately specified bounded series, whose every per-month value must remain the single-month report. The exclusion requirement now names the bounded series as permitted while keeping month-to-month comparison, percentage change, trend fields, and every other excluded concept unavailable.
- REMOVED requirements: none.
- Pre-archive validation: `openspec validate add-multi-month-trends` reported valid.
- Active same-domain change warnings: none. `openspec list` reports no active changes after archiving.
- Destructive merge approval: not applicable. The two additions were new requirements and the two modifications retained their canonical scenarios.

## Consequence for later phases

The reporting capability now canonically contains both the single-month requirement and the bounded multi-month series, so the deferred trends surface change can build on a canonical read contract instead of reopening it. It must still respect the flow-only period total and must not introduce comparison, percentage change, or trend fields, which remain excluded.
