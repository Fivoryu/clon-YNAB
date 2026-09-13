# Budget Engine Research

## Purpose and boundary

This document defines an implementation-neutral research model for the budget engine of the YNAB clone. It is intended to make the domain rules testable before application code is written.

The document uses four labels:

- **Observed** — behavior stated by an identified public, official YNAB source.
- **Inferred** — a conceptual relationship derived from observed behavior; it is not a claim about YNAB's internal implementation.
- **Clone decision** — a proposed rule for this independent academic clone.
- **Open question** — a behavior that still requires product confirmation or a deliberate decision.

**Boundary statement:** This is not a description of YNAB's private implementation, database, source code, or complete production formulas. Public help articles establish observable product behavior only. The clone may choose different internal structures and may deliberately support a smaller, explicit rule set.

## Purpose and scope

**Clone decision:** The bounded first vertical slice covers this deliberately narrow monthly planning loop:

1. Calculate **Ready to Assign** from realized cash, an explicit opening balance, supported realized inflows, and any explicitly supported prior carry.
2. Let a user assign or unassign money and move assigned money between categories for a planning month.
3. Track category **Assigned**, **Activity**, and **Available** as distinct concepts.
4. Carry positive category availability into the next planning month with a deterministic calculation.
5. Rebuild summaries deterministically from authoritative account, transaction, and assignment movements.

**Clone decision:** The first slice uses a cash/checking-style account and one user-owned budget. Credit-card behavior, future-income behavior, refunds, closed-month corrections, reconciliation, targets, and scheduled transactions are outside this slice.

**Open question:** Full-MVP behavior for future assignments, positive credit-card balances, cash overspending deductions, credit-card payment state, refunds, closed months, and broader account types remains unresolved unless explicitly scoped in a later slice. Scheduled transactions are in the surrounding domain; their documented pre-occurrence behavior is recorded below because it constrains future planning.

## Terminology

| Term | Working meaning in this document | Classification |
|---|---|---|
| **Ready to Assign (RTA)** | Money currently available to assign to spending categories. It is a budget-level amount, not a category balance. | **Observed** product concept; exact clone equation is **Inferred** and proposed below. |
| **Assigned** | Money deliberately allocated to a category in a particular month. | **Observed** vocabulary; the storage and calculation model are **Clone decisions**. |
| **Activity** | The month's categorized money movement, such as spending, returns, or other category-affecting transactions. Spending is negative activity in the conceptual equations below. | **Observed** vocabulary; the sign and supported transaction types are **Clone decisions**. |
| **Available** | Money currently available for a category after permitted carryover, assignments, and activity. | **Observed** product concept; the equation below is **Inferred**, not official. |
| **Future assignment** | An assignment made in a later planning month rather than the current month. | **Observed** as a component in the RTA breakdown; the clone's editing and reservation policy is an **Open question**. |
| **Cash overspending** | Category overspending funded from cash, producing a negative category result that is handled differently at month rollover. | **Observed** behavior. |
| **Credit overspending** | Category overspending funded by a credit-card transaction, leaving additional card debt rather than fully funding the card-payment category. | **Observed** behavior. |
| **Target** | A desired category planning state, such as setting aside, refilling, or reaching a balance by a period. It is not itself money or a transaction. | **Observed** concept; the MVP subset is a **Clone decision/Open question**. |

## Observed official product facts

### Ready to Assign and the plan header

**Observed:** The official plan-header guidance describes Ready to Assign as cash-based money that has not yet been assigned to spending categories.

**Observed:** The documented RTA breakdown includes prior Ready to Assign leftover and current cash inflows or starting balances. It subtracts current assignments, future assignments, and prior cash overspending.

**Observed:** The same guidance documents cases in which a positive credit-card balance may contribute to the amount shown as Ready to Assign.

**Observed:** These facts describe the user-visible breakdown. They do not disclose a complete internal formula or implementation.

### Month rollover

**Observed:** Positive category Available remains available when the month rolls over.

**Observed:** Assigned resets for the new month unless future planning has already assigned money in that month.

**Observed:** Cash overspending is deducted from the new month's Ready to Assign.

**Observed:** Credit overspending becomes an underfunded credit-card payment alert rather than being treated the same way as cash overspending.

### Overspending

**Observed:** Cash overspending is shown in red.

**Observed:** Credit overspending is shown in yellow.

**Observed:** When spending is mixed, cash is taken first. The remaining shortage can therefore become credit overspending after the available cash has been consumed.

### Negative Ready to Assign

**Observed:** A negative Ready to Assign amount means that more money has been assigned than the plan currently has available.

**Observed:** The general correction described by the official guidance is to move money back from categories until Ready to Assign returns to zero or a non-negative amount.

### Targets

**Observed:** Targets belong to categories.

**Observed:** Set-aside, refill, and balance-by-period target behaviors differ. They express different planning needs and should not be treated as interchangeable labels for one calculation.

### Scheduled transactions

**Observed:** Scheduled transactions are future or repeating register entries.

**Observed:** A scheduled transaction does not affect the plan before it occurs.

**Observed:** Scheduled transactions are normally uncleared when generated, with a documented cash-account behavior that may differ.

**Open question:** The clone still needs an explicit policy for when scheduled entries become actual transactions and how the cash-account exception is represented.

## Inferred semantic relationships

The following relationships are conceptual interpretations for the clone. They are **not official YNAB formulas** and are not presented as claims about private implementation.

### Category relationship

**Inferred:** For a category and planning month, a useful semantic relationship is:

```text
Available = permitted carryover + Assigned + Activity
```

In this relationship:

- **permitted carryover** is the amount brought into the month under the rollover policy;
- **Assigned** is money deliberately allocated in the month;
- **Activity** is the net category activity during the month, where spending is negative and returns or category inflows are positive.

**Inferred:** This equation explains why Assigned and Activity must remain distinct. Two categories may have the same Available while having different assignment and spending histories.

**Open question:** The equation does not specify every special case, including credit-card payment movement, cash overspending rollover, refunds, closed months, or category lifecycle events.

### Ready to Assign relationship

**Inferred:** For the bounded first vertical slice, the semantic RTA relationship is:

```text
RTA(first slice) = realized opening cash
                + realized cash inflows available to the plan
                + explicitly supported prior carry
                - current assignments
```

**Clone decision:** The first-slice equation does not count future income as realized. Spending that was already funded by an assignment changes account balance and category `Activity`/`Available`; it is not subtracted from RTA a second time.

The terms are deliberately descriptive rather than schema names. The equation is a clone decision for this bounded slice, not an official YNAB formula.

**Inferred:** RTA is a budget-level control total. Category Available is a category-and-month result. They are related by assignments and activity, but they are not interchangeable balances.

**Open question:** Full-MVP treatment of future assignments, qualifying positive credit-card balances, prior cash overspending deductions, credit-card payment state, and other special cases remains unresolved. Public observations about those behaviors are retained above; they are not first-slice formula terms.

**Boundary:** Neither equation is a complete private YNAB formula. The first-slice equation intentionally omits unresolved full-MVP terms.

### Overspending relationship

**Inferred:** A category may have negative Available after activity. The funding source of the transaction determines whether the negative result is classified as cash overspending or credit overspending.

**Inferred:** For mixed spending, classifying cash-funded activity first is necessary to reproduce the documented cash-first behavior. The classification is not determined only by the category's final numeric Available.

**Inferred:** Rollover must preserve the distinction between a positive category balance, cash overspending, and credit overspending because the observed next-month outcomes differ.

## Clone decisions

The following are proposed rules for the independent clone. They are not assertions about YNAB's private implementation.

### Monetary representation and money creation

- **Clone decision:** Store all monetary values as integer minor units, such as cents. Do not use floating-point values for balances, assignments, activity, targets, or comparisons.
- **Clone decision:** Only realized money is assignable. In the first slice, realized money is the explicit cash opening balance and occurred cash income/inflows available to the plan; expected future income is not assignable.
- **Clone decision:** Assignments may redistribute existing available money but must never mint money.
- **Clone decision:** A command that increases an assignment must have a corresponding reduction in RTA or a corresponding reduction in another category through a move.
- **Clone decision:** The first slice permits an explicit negative RTA state; it must not hide, clamp, or silently repair that state. Later command-specific overassignment policies remain open.

### Distinct monthly values

- **Clone decision:** Expose Assigned, Activity, and Available as separate values in the monthly category result.
- **Clone decision:** Record enough authoritative movement history to explain how each value was produced.
- **Clone decision:** Do not use Available as a substitute for Assigned or Activity in commands, reports, or audit history.

### Atomicity and deterministic rebuilding

- **Clone decision:** A command that changes both account-side money and plan-side effects commits atomically. A partial account update or partial budget update is invalid.
- **Clone decision:** Derived monthly summaries can be cached, but the engine must provide a deterministic rebuild from authoritative records.
- **Clone decision:** Rebuilding the same account, month, and category history twice produces the same values and classifications.
- **Clone decision:** Client-provided balances are inputs for commands only; authoritative balances come from the engine's records and calculations.

### Initial month and rollover

- **Clone decision:** When the first-slice budget is initialized, the user must explicitly provide a cash/checking-style opening balance. The engine must not invent an opening pool; opening-transaction variants remain later scope.
- **Clone decision:** The initial month's realized starting balances enter the RTA calculation; no implicit prior-month category carryover exists unless an opening snapshot explicitly supplies it.
- **Clone decision:** Positive Available rolls into the next month as permitted carryover, with a deterministic calculation.
- **Clone decision:** New-month Assigned is zero in the first slice; future-month assignments remain later scope.
- **Open question:** Cash overspending deductions, credit overspending rollover, and underfunded card-payment state are later-slice behavior and are not part of the bounded first slice.

### Targets and scheduled entries

- **Clone decision:** A target belongs to exactly one category and stores a planning instruction, not an account balance, assignment, or transaction.
- **Clone decision:** Creating or editing a target does not mint money and does not itself change Assigned, Activity, or Available.
- **Clone decision:** The first target implementation should calculate a suggested assignment or status from the category state; applying that suggestion must remain an explicit assignment command.
- **Clone decision:** A scheduled transaction has no plan effect before its occurrence. When it occurs, it becomes an ordinary transaction under the engine's transaction rules.

## Concrete scenarios

The amounts below are expressed in dollars for readability; the clone stores their integer minor-unit equivalents. Scenarios 2, 3, and 8 inform the bounded first slice; Scenarios 1, 4–7, and 9–11 are later-slice reference scenarios and do not establish first-slice support. Each expected outcome is a proposed clone result grounded in the observed behavior and the decisions above.

### Scenario 1 — Ready to Assign breakdown

- **Given:** Prior RTA leftover is `$100`; current realized cash inflows and starting balances are `$500`; current assignments are `$350`; future assignments are `$75`; prior cash overspending is `$25`; no qualifying positive card balance applies.
- **When:** The engine calculates RTA.
- **Expected:** `RTA = 100 + 500 - 350 - 75 - 25 = $150`.
- **Classification:** The breakdown is **Observed**; the arithmetic presentation is an **Inferred** semantic equation and a **Clone decision** for the MVP.

### Scenario 2 — Positive Available carryover

- **Given:** Category `Rent reserve` has `$120` Available at the end of January and no overspending.
- **When:** February opens.
- **Expected:** February begins with `$120` permitted carryover. February Assigned is `$0` unless February already contains an explicit future assignment.
- **Classification:** Positive Available remaining is **Observed**; the exact opening representation is a **Clone decision**.

### Scenario 3 — Normal spending

- **Given:** March RTA is `$500`. The user assigns `$300` to `Groceries`. The category has a `$120` grocery transaction funded from cash.
- **When:** The transaction is recorded.
- **Expected:** `Groceries.Assigned = $300`, `Groceries.Activity = -$120`, and `Groceries.Available = $180` before any permitted carryover. RTA is reduced by the `$300` assignment, not by the spending transaction a second time.
- **Classification:** Keeping assignment and activity separate is a **Clone decision** derived from the **Inferred** category relationship.

### Scenario 4 — Cash overspending

- **Given:** `Dining` has `$50` Available. A `$65` transaction is funded from a cash account.
- **When:** The transaction is recorded and the month rolls over.
- **Expected:** The category has `Available = -$15`, the overspending is classified as cash overspending and displayed red, and the next month's RTA is reduced by `$15` according to the rollover policy.
- **Classification:** The color and rollover distinction are **Observed**; the exact stored representation is a **Clone decision**.

### Scenario 5 — Credit overspending

- **Given:** `Travel` has `$50` Available. A `$65` transaction is charged to a credit-card account.
- **When:** The transaction is recorded and the month rolls over.
- **Expected:** The category has a `$15` shortage classified as credit overspending, displayed yellow, and the next result contains an underfunded credit-card payment alert rather than treating the `$15` as cash overspending.
- **Classification:** The outcome is **Observed**; the alert state and calculation record are **Clone decisions**.

### Scenario 6 — Mixed spending is cash-first

- **Given:** `Household` has `$100` Available. The user records `$80` of cash-account spending and `$50` of credit-card spending in the same category and month.
- **When:** The engine classifies the activity.
- **Expected:** The first `$100` of total spending is covered by available cash/category funding; the remaining `$30` is classified as credit overspending. The engine must not classify the entire `$130` as credit overspending merely because one transaction used a card.
- **Classification:** Cash-first treatment is **Observed**; the transaction-order-independent classification algorithm is a **Clone decision/Open question**.

### Scenario 7 — Future assignment

- **Given:** Current-month RTA is `$100`. The user assigns `$60` to a category in the next month and assigns nothing in the current month.
- **When:** The current plan header is calculated.
- **Expected:** Current RTA is `$40` after reserving the future assignment. Current-month category Available is unchanged because the assignment belongs to the later month. No future income is created or treated as realized.
- **Classification:** The future-assignment subtraction is **Observed**; the command and visibility policy are **Clone decisions**.

### Scenario 8 — Negative RTA

- **Given:** Realized money available for assignment is `$100`. The user assigns `$120` while the clone permits overassignment.
- **When:** The current month is recalculated.
- **Expected:** RTA is visibly `-$20`. The engine does not clamp it to zero. A correction that moves `$20` back from a category restores RTA to `$0`.
- **Classification:** Negative RTA and the general correction are **Observed**; permitting the command and the exact move command are **Open questions/Clone decisions**.

### Scenario 9 — Target interaction

- **Given:** `Emergency reserve` has `$50` Available. Its target is “set aside `$200` this month.” RTA is `$300`.
- **When:** The target status is calculated.
- **Expected:** The target reports a `$150` suggested amount or shortfall. It does not change Available or RTA. If the user explicitly assigns `$150`, Available becomes `$200` and RTA becomes `$150`.
- **Classification:** Target ownership and differing target behaviors are **Observed**; suggestion-versus-automatic-assignment is a **Clone decision**.

### Scenario 10 — Target balance-by-period

- **Given:** A category must reach `$1,000` by December and currently has `$400` Available in September. The clone's target calculation considers three remaining planning months.
- **When:** The target status is calculated.
- **Expected:** The target communicates the remaining `$600` requirement and a clone-defined monthly suggestion; it does not create `$600` or change the category until the user assigns money. The exact treatment of new activity and partial months remains an open policy.
- **Classification:** The target type is **Observed**; the monthly suggestion algorithm is a **Clone decision/Open question**.

### Scenario 11 — Scheduled transaction before occurrence

- **Given:** A `$75` rent transaction is scheduled for October 30 but has not occurred.
- **When:** The September or October plan is calculated before October 30.
- **Expected:** The scheduled entry does not change account balance, Activity, Available, or RTA before occurrence. When generated at occurrence, it is processed as a transaction and follows the applicable cash or credit rules.
- **Classification:** The lack of pre-occurrence plan effect is **Observed**; generation timing and the cash-account exception remain **Open questions**.

## Engine invariants

The following are **Clone decision** invariants proposed for implementation and tests. Invariants concerning card funding, overspending classification, targets, and scheduled generation apply only when those later slices are accepted:

1. **Money conservation:** Assignments and category moves redistribute existing assignable money; no command mints money.
2. **Minor-unit arithmetic:** Every monetary calculation is exact integer arithmetic in the configured minor unit.
3. **RTA reconciliation:** The displayed RTA equals the deterministic semantic breakdown for the selected plan state, including applicable deductions and reservations.
4. **Assignment conservation:** Increasing one category's assignment without reducing another category or RTA must reduce RTA by the same amount.
5. **Category equation:** For every category and month, `Available` equals permitted carryover plus `Assigned` plus signed `Activity`, subject to explicit special-case policies.
6. **Distinct dimensions:** Assigned, Activity, and Available cannot be silently collapsed into one stored or returned value.
7. **Source classification:** Every overspending shortage is classified as cash or credit according to the funding source, with mixed spending applying cash-first behavior.
8. **Rollover distinction:** Positive Available, cash overspending, and credit overspending produce their distinct next-month outcomes.
9. **Realized-money boundary:** Future income cannot increase current assignable money before it is recorded as realized.
10. **Target neutrality:** Creating or evaluating a target does not change money, assignments, activity, or account balances.
11. **Atomic updates:** A command affecting both an account and a plan either commits all required effects or commits none.
12. **Deterministic rebuild:** Rebuilding from the same authoritative history produces the same summaries, classifications, and alerts.
13. **Idempotent generation:** If scheduled transaction generation is included, processing the same occurrence twice does not duplicate its account or plan effects.
14. **Budget isolation:** Records from one budget cannot affect another budget's RTA, categories, accounts, or targets.

## Acceptance criteria for the bounded first vertical slice

These are **Clone decision** acceptance criteria for the bounded first vertical slice. This is a clone decision for an academic clone, not an official YNAB formula or acceptance contract.

- **AC-1 — Realized-cash RTA:** Given an explicit opening cash balance and realized cash inflows, the engine returns RTA as realized opening cash plus realized inflows plus explicitly supported prior carry minus current assignments; future income is excluded.
- **AC-2 — Distinct category values:** Given an assignment and a categorized spending transaction, the engine returns separate `Assigned`, signed `Activity`, and `Available` values and does not double-subtract the already-funded spending from RTA.
- **AC-3 — Negative RTA:** Given an allowed overassignment, the engine exposes negative RTA without clamping or silently repairing it; an unassignment or move-back allocation to the unassigned pool can correct it.
- **AC-4 — Positive rollover:** Given positive category `Available`, the next planning month receives that amount as permitted carryover with deterministic results; cash/card overspending rollover is not implied.
- **AC-5 — Cash account boundary:** The first slice accepts the supported cash/checking-style account and explicit opening balance; broader account types and credit cards are deferred.
- **AC-6 — Atomicity and rebuild:** A failed account-plus-plan command changes neither side, and rebuilding from the same authoritative history reproduces the same summaries.
- **AC-7 — Precision:** Values such as `$0.01 + $0.02` remain exact and do not exhibit floating-point rounding.

## Acceptance criteria for later/full-MVP behavior

The following broader criteria remain documented for later slices; they are not claimed as delivered by the bounded first vertical slice:

- **AC-8 — RTA breakdown:** Given the inputs in Scenario 1, the engine returns `$150` and exposes each contributing and subtracting component.
- **AC-9 — Cash overspending:** Given Scenario 4, the engine records a `$15` cash shortage, marks it red, and applies the defined next-month RTA deduction.
- **AC-10 — Credit overspending:** Given Scenario 5, the engine records a `$15` credit shortage, marks it yellow, and emits an underfunded card-payment state rather than a cash-overspending deduction.
- **AC-11 — Mixed funding:** Given Scenario 6, the engine applies cash-first classification and reports `$30` as credit overspending.
- **AC-12 — Future planning:** Given Scenario 7, the engine reserves `$60` against current RTA without recording future income or changing current-month category Available.
- **AC-13 — Target neutrality:** Given Scenarios 9 and 10, target evaluation changes neither balances nor assignments; explicit assignment is required to change them.
- **AC-14 — Scheduled entries:** Given Scenario 11, a not-yet-occurred scheduled transaction has no plan effect.
- **AC-15 — No minting:** Every successful assignment increase can be reconciled to RTA or an equal category reduction.
- **AC-16 — Full deterministic rebuild:** Rebuilding all monthly summaries from authoritative history reproduces the same values and classifications as the normal calculation path.

## Open questions

The following questions must be resolved before the budget engine's behavior is treated as implementation-ready:

1. **Cash-account qualification:** The first slice supports one cash/checking-style account. For full MVP, which account types count as cash for RTA, cash overspending, and mixed-spending classification? Are checking, savings, and other positive-balance accounts all equivalent?
2. **Positive card balances:** Under exactly which account, transaction, and timing conditions does a positive credit-card balance contribute to RTA?
3. **Refunds:** Is a refund category activity, income, a reversal of the original spending, or a distinct transaction type? How do cash and credit-card refunds differ?
4. **Credit-card payment formula:** How is the payment-category amount calculated for planned card spending, card payments, card refunds, and credit overspending?
5. **Negative RTA command policy:** The first slice permits an explicit negative RTA and correction through unassignment/category move. For full MVP, may users assign while RTA is negative, or only view and correct it, and which command paths may create or resolve it?
6. **Future assignments:** Can users assign arbitrarily far into future months? Does editing a future assignment immediately reserve current RTA, and how are assignments moved between months?
7. **Category lifecycle:** What happens to Assigned, Activity, Available, targets, and historical data when a category is renamed, hidden, archived, deleted, or moved between groups?
8. **Target carryover:** How does each target type treat positive carryover, prior activity, skipped months, partial months, and overspending?
9. **Partial overspending correction:** If a user corrects only part of a shortage, how are the remaining cash or credit portions carried and displayed?
10. **Closed months:** Can historical months be edited after close? If so, which recalculations propagate to later months and which records are locked?
11. **MVP target subset:** Which target behaviors belong in the first implementation: set-aside, refill, balance-by-period, or only a read-only target status?
12. **Mixed-spending ordering:** When several cash and credit transactions are entered in different orders, should classification be based on chronological transaction order, account funding totals, or a deterministic category-level allocation?
13. **Starting balances:** The first slice treats the explicit cash/checking-style opening balance as realized cash. For full MVP, are all opening balances treated as realized cash inflows for RTA, or are some account types and positive card balances handled separately?
14. **Scheduled generation:** When exactly does a scheduled transaction become an ordinary transaction, and how is the documented cash-account uncleared behavior represented?
15. **Target assignment timing:** If a target suggests a monthly amount, is the suggestion calculated at month open, on demand, or after every relevant transaction?
16. **Audit model:** Which assignment and rollover movements must be individually explainable to the user, and how long must that history be retained?

## Source register

**Access date for all sources: 2026-09-10.** The following are official YNAB support articles used for the **Observed** claims in this document:

1. [The Plan Header](https://support.ynab.com/en_us/the-plan-header-BkmiuJ_C9) — **Observed:** Ready to Assign is cash-based unassigned money; its documented breakdown includes prior RTA leftover and current cash inflows or starting balances, and subtracts current assignments, future assignments, and prior cash overspending; documented positive-card-balance cases may contribute.
2. [When the Month Rolls Over: A Guide](https://support.ynab.com/en_us/when-the-month-rolls-over-a-guide-rkyyd6qC9) — **Observed:** positive Available remains; Assigned resets unless future planning has assigned money; cash overspending is deducted from new-month RTA; credit overspending becomes an underfunded card-payment alert.
3. [Overspending in YNAB: A Guide](https://support.ynab.com/en_us/overspending-in-ynab-a-guide-ryWoxEyi) — **Observed:** cash overspending is red, credit overspending is yellow, and cash is used first in mixed spending.
4. [When Ready to Assign Is Negative: An Overview](https://support.ynab.com/en_us/when-ready-to-assign-is-negative-an-overview-HylZA0zCc) — **Observed:** negative RTA indicates overassignment and the general correction is moving money back until the amount is corrected.
5. [How to Use Targets](https://support.ynab.com/en_us/how-to-use-targets-rk5kkI9ks) — **Observed:** targets belong to categories and set-aside, refill, and balance-by-period behaviors differ.
6. [Scheduled Transactions: A Guide](https://support.ynab.com/en_us/scheduled-transactions-a-guide-BygrAIFA9) — **Observed:** scheduled transactions are future or repeating register entries, do not affect the plan before occurrence, and are normally uncleared except for documented cash-account behavior.

**Boundary statement:** These sources are public product-support materials, not source-code or schema documentation. They support the claims marked **Observed** only. The equations, scenarios, invariants, acceptance criteria, and policy proposals marked **Inferred**, **Clone decision**, or **Open question** belong to this independent clone and must not be presented as official YNAB implementation details.
