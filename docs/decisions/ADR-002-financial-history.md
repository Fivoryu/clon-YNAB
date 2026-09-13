# ADR-002: Preserve Financial History While Allowing Posted-Transaction Deletion

- **Status:** Proposed
- **Date:** 2026-09-10
- **Decision owners:** Project team

## Context

The clone needs to correct ordinary transaction history without leaving stale account or plan effects. Official YNAB guidance says that deleting a transaction removes the transaction and its effects. This is an observation of public product behavior, not a claim about YNAB's internal implementation.

This ADR is a proposed later-MVP transaction-history policy. It does not change the bounded first slice, which supports only realized income and one-category cash/checking spending in posted/working state.

Reconciled transactions have a stronger historical role: they represent account state that was compared with the bank and confirmed. The MVP therefore needs a separate policy for correcting reconciled history instead of treating it as ordinary editable history.

## Decision

**Proposed later-MVP policy:** Allow ordinary deletion of posted, non-reconciled transactions, aligned with FR-TRANSACTION and UC-12, with these safeguards:

- require explicit user confirmation;
- record a later MVP slice audit event with the minimum identity of actor, transaction identity, request/correlation identity where applicable, timestamp, and reason when available;
- limit audit visibility to the authorized relevant budget/user boundary;
- remove the deleted transaction's account and plan effects atomically;
- disallow hard deletion of reconciled transactions by default, with ordinary edit/delete paths returning `CONFLICT`;
- leave the reconciled correction mechanism unresolved rather than selecting one in this ADR.

The deletion behavior is based on [How to Edit and Delete Transactions](https://support.ynab.com/en_us/how-to-edit-and-delete-transactions-BJG4oS1s).

This ADR defines the clone's policy. It does not describe or claim YNAB's internal data model or implementation.

## Consequences

### Positive

- Ordinary data-entry mistakes can be corrected without retaining stale financial effects.
- Account and plan views remain consistent after a confirmed deletion.
- The audit event preserves evidence that a deletion occurred.
- Reconciled history receives stronger protection than ordinary posted history.

### Negative

- Deletion requires an additional confirmation flow and audit storage.
- **Open question:** A void, immutable compensating adjustment, controlled unlock, or another reconciled-correction path would add domain and UI complexity.
- Removing posted effects can change historical balances and reports.
- The clone may temporarily have less correction capability for reconciled transactions until the separate path is defined.

## Open questions

- **Open question:** What retention policy applies to deletion and reconciliation audit events?
- **Open question:** Should a reconciled correction be represented as a void, an immutable compensating adjustment, a controlled unlock, or another mechanism?
- **Open question:** Which roles may confirm deletion or create a reconciled adjustment?
- **Open question:** How should deleted transactions appear in reports and exports?
- **Open question:** What audit immutability and unlock/review process is required for a reconciled transaction correction?

## Revisit triggers

Revisit this decision when reconciliation import matching, reporting, or multi-user audit requirements become part of the accepted scope.
