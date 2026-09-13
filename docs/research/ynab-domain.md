# YNAB Domain Research

## Purpose

This document describes the observable behavior and conceptual model of YNAB that is relevant to an academic clone. It separates public evidence from assumptions made for our implementation.

## Executive summary

**Observed:** YNAB is a forward-looking, category-based budgeting system. Its central loop is:

1. **Observed:** Define spending priorities as categories.
2. **Observed:** Work only with money that is available now.
3. **Observed:** Assign that money to categories.
4. **Observed:** Record or import actual transactions.
5. **Observed:** Compare category availability with the plan.
6. **Observed:** Move money when priorities change.

**Inferred:** The product is therefore more than a transaction register. The budget plan and category balances are first-class domain state.

## The YNAB method

**Observed:** The official YNAB method is commonly presented through four rules:

1. **Observed:** **Give Every Dollar a Job** — decide what currently available money should do before spending it.
2. **Observed:** **Embrace Your True Expenses** — prepare for large, irregular, or less frequent expenses by treating them as part of the plan.
3. **Observed:** **Roll With the Punches** — adjust category allocations when reality changes instead of treating the original plan as immutable.
4. **Observed:** **Age Your Money** — work toward using older money and getting ahead of upcoming expenses.

**Observed:** The current public YNAB method page also frames the workflow around deciding what money is for now, later, and for flexibility. **Inferred:** This is product methodology, not a claim about the internal source code.

## Product concepts observed in official guidance

### Categories and category groups

**Observed:** The getting-started guide describes pre-built categories grouped into category groups, and allows users to customize names and add categories over time. **Observed:** Categories represent intended jobs for money: bills, groceries, savings, travel, and similar priorities.

### Targets

**Observed:** The guide describes targets for recurring, weekly, annual, and date-based needs. Examples include:

- **Observed:** setting aside a monthly amount;
- **Observed:** replenishing an amount every week;
- **Observed:** saving a known amount by a future date.

**Clone decision:** For the clone, a target should be treated as a planning aid. It must not silently create money or authorize spending.

### Accounts

- **Observed:** The guide distinguishes the money currently available from money expected in the future.
- **Observed:** Official guidance recommends starting with real checking, savings, and regularly used credit-card accounts.
- **Observed:** Future income is not treated as available until it arrives.

**Inferred:** An account answers **where money is held**. A category answers **what money is for**. These are deliberately different concepts.

### Transactions

**Observed:** The guide states that users record or import transactions as they spend and earn. **Observed:** Transactions affect account balances and category activity. **Observed:** Income adds money to the available pool; categorized spending reduces the relevant category availability.

**Clone decision:** Transfers between two owned accounts should move money between accounts without becoming ordinary category spending.

### Month rollover and reassignment

**Observed:** The guide states that category jobs can be reassigned and that the user continues the plan when the month rolls over. **Inferred:** A month is therefore a useful planning boundary, but the budget is not reset to zero at the end of every month.

## Observed official behavior

**Observed:** The following behaviors are **Observed** from official YNAB support guidance. **Inferred:** They describe public product behavior, not YNAB's internal implementation.

### Transaction editing and deletion

- **Observed:** Deleting a transaction removes the transaction and its account and plan effects. Editing can change the amount, payee, category, date, cleared state, memo, repetition, and account. Source: [How to Edit and Delete Transactions](https://support.ynab.com/en_us/how-to-edit-and-delete-transactions-BJG4oS1s).

### Ready to Assign and overspending

- **Observed:** Ready to Assign can be negative when more money has been assigned than is available. Source: [When Ready to Assign Is Negative](https://support.ynab.com/en_us/when-ready-to-assign-is-negative-an-overview-HylZA0zCc).
- **Observed:** Cash overspending is shown in red, while credit-card overspending is shown in yellow. In mixed spending, cash is taken first. Source: [Overspending in YNAB](https://support.ynab.com/en_us/overspending-in-ynab-a-guide-ryWoxEyi).
- **Observed:** Planned credit-card spending moves money to the credit-card payment category. Credit-card overspending leaves additional debt on the card instead. Sources: [Overspending in YNAB](https://support.ynab.com/en_us/overspending-in-ynab-a-guide-ryWoxEyi) and [Credit Card Overspending](https://support.ynab.com/en_us/credit-card-overspending-an-overview-HkMGpSbJs).

### Month rollover

- **Observed:** Positive Available rolls over into the next month. Cash overspending is deducted from the next month's Ready to Assign, while credit overspending becomes an underfunded credit-card payment alert. Source: [When the Month Rolls Over](https://support.ynab.com/en_us/when-the-month-rolls-over-a-guide-rkyyd6qC9).

### Targets and scheduled transactions

- **Observed:** Targets belong to categories and support set-aside, refill, and balance-by-period behaviors. Source: [How to Use Targets](https://support.ynab.com/en_us/how-to-use-targets-rk5kkI9ks).
- **Observed:** Scheduled transactions are future or repeating register items; they do not affect the plan before they occur. Source: [Scheduled Transactions](https://support.ynab.com/en_us/scheduled-transactions-a-guide-BygrAIFA9).

### Reconciliation

- **Observed:** Reconciliation compares the account with the bank state, confirms the cleared balance, locks reconciled transactions, and reduces duplicate imports. Source: [Reconciling Accounts](https://support.ynab.com/en_us/reconciling-accounts-a-guide-BJFE3fHys).

### Refunds and returns

- **Observed:** Official guidance describes refunds and returns as a distinct credit-card workflow. The exact clone treatment remains open. Source: [Credit Card Refunds and Returns](https://support.ynab.com/en_us/credit-card-refunds-and-returns-H1J7qDWkj).

## Clone decisions and open questions

- **Clone decision:** The clone must preserve the observed behaviors above where they are included in the product scope.
- **Open question:** The exact clone formulas for Ready to Assign, category Available, overspending rollover, and credit-card payment movement remain unspecified here; no formula is inferred from these observations.
- **Open question:** The command policy for deleting reconciled transactions, including whether to void or create an adjustment, remains separate from the observed deletion behavior.

## Conceptual accounting model

**Inferred:** This is an inferred clone model, not an assertion about YNAB's private implementation.

```text
Account balance answers:  Where is the money?
Category availability answers: What can this money still do?
Budget allocation answers:  What job did the user assign?
Transaction activity answers: What actually happened?
```

**Clone decision:** A transaction may need both an account-side representation and a budget-side effect. That is why a simple `expenses` table is insufficient for a faithful clone.

### Core invariants

- **Clone decision:** Monetary values use integer minor units, never floating-point arithmetic.
- **Clone decision:** A transaction has exactly one source account.
- **Clone decision:** A normal spending transaction has one category or multiple split lines.
- **Clone decision:** The sum of split lines equals the transaction amount.
- **Clone decision:** A transfer has a source account and destination account and does not require a spending category.
- **Clone decision:** A transaction cannot spend from an archived category unless the product explicitly supports that migration.
- **Clone decision:** Only realized income is available for assignment; expected future income is not included.
- **Clone decision:** Changes that affect account balances and category balances are committed atomically.
- **Clone decision:** Every budget and financial record is tenant-scoped to an authorized user or budget member.

## Relevant product areas for the clone

**Clone decision:** The following priorities define the MVP product areas.

| Area | Importance for MVP | Notes |
|---|---:|---|
| Budget setup | High | Defines the plan and planning month. |
| Category groups and categories | High | Core envelope structure. |
| Cash, checking, savings accounts | High | Establishes the money available now. |
| Manual transactions | High | Most important write workflow. |
| Income allocation | High | Feeds the ready-to-assign amount. |
| Monthly category availability | High | Main feedback loop. |
| Transfers | High | Needed when multiple accounts exist. |
| Credit-card behavior | Medium | Important but adds specialized rules. |
| Targets/goals | Medium | Valuable planning feature after the core loop works. |
| Scheduled transactions | Medium | Good second milestone. |
| Bank import/synchronization | Low for academic MVP | Requires providers, credentials, retries, and reconciliation. |
| Reports | Low for first slice | Useful after ledger and budget calculations are trustworthy. |

## Official API observations

- **Observed:** The public API documentation describes a REST API over HTTPS that uses JSON.
- **Observed:** The API exposes resources for plans, accounts, categories, money movements, months, payees, scheduled transactions, and transactions.
- **Observed:** The documented base URL is `https://api.ynab.com/v1`.

- **Observed:** The API documentation describes a predictable `data` response wrapper.
- **Observed:** The API documentation describes personal access tokens and OAuth applications.
- **Observed:** The API documentation describes UTC dates.
- **Observed:** The API documentation describes delta requests using `server_knowledge` and `last_knowledge_of_server` for supported resources.
- **Observed:** The API documentation describes resource-specific endpoints instead of always fetching an entire plan.

**Inferred:** These observations are useful architectural signals, but we are building an independent clone. **Clone decision:** We are not required to reproduce the public API.

## What we should not assume

**Observed:** The public marketing and developer documentation do not prove:

- **Open question:** the internal database schema;
- **Open question:** the exact budget calculation implementation;
- **Open question:** the exact bank-import provider behavior;
- **Open question:** all edge cases for credit cards, refunds, overspending, or closed months;
- **Open question:** the complete permissions model of the commercial product;
- **Open question:** the exact algorithm used by targets or reports.

**Open question:** Those areas must be labeled as open questions until verified through additional public help documentation or defined as explicit clone decisions.

## Research sources

Accessed: **2026-09-10**.

1. [The YNAB Method](https://www.ynab.com/ynab-method) — **Observed:** official explanation of the product method and the role of money as intentional spending.
2. [The Ultimate Get Started Guide](https://www.ynab.com/guide/the-ultimate-get-started-guide) — **Observed:** official onboarding guidance for categories, non-monthly expenses, targets, accounts, current money, and transaction recording/import.
3. [YNAB API Documentation](https://api.ynab.com/) — **Observed:** official public API overview, resources, authentication, response format, dates, and delta requests.
4. [How to Edit and Delete Transactions](https://support.ynab.com/en_us/how-to-edit-and-delete-transactions-BJG4oS1s) — **Observed:** official support guidance for transaction editing and deletion effects.
5. [Overspending in YNAB](https://support.ynab.com/en_us/overspending-in-ynab-a-guide-ryWoxEyi) — **Observed:** official support guidance for cash, credit-card, and mixed overspending.
6. [When the Month Rolls Over](https://support.ynab.com/en_us/when-the-month-rolls-over-a-guide-rkyyd6qC9) — **Observed:** official support guidance for positive Available and overspending rollover.
7. [When Ready to Assign Is Negative](https://support.ynab.com/en_us/when-ready-to-assign-is-negative-an-overview-HylZA0zCc) — **Observed:** official support guidance for a negative Ready to Assign state.
8. [Reconciling Accounts](https://support.ynab.com/en_us/reconciling-accounts-a-guide-BJFE3fHys) — **Observed:** official support guidance for bank comparison, cleared balances, locked transactions, and duplicate imports.
9. [How to Use Targets](https://support.ynab.com/en_us/how-to-use-targets-rk5kkI9ks) — **Observed:** official support guidance for category targets and target behaviors.
10. [Scheduled Transactions](https://support.ynab.com/en_us/scheduled-transactions-a-guide-BygrAIFA9) — **Observed:** official support guidance for future and repeating register items.
11. [Credit Card Overspending](https://support.ynab.com/en_us/credit-card-overspending-an-overview-HkMGpSbJs) — **Observed:** official support guidance for credit-card overspending and additional debt.
12. [Credit Card Refunds and Returns](https://support.ynab.com/en_us/credit-card-refunds-and-returns-H1J7qDWkj) — **Observed:** official support guidance for credit-card refunds and returns.

## Open research questions

- **Open question:** What exact states and transitions are required for a monthly budget?
- **Open question:** What exact clone formulas represent Ready to Assign, category Available, overspending rollover, and credit-card payment movement?
- **Open question:** Which additional credit-card rules are required for the academic scope?
- **Open question:** Are refunds modeled as income, negative spending, or category-specific adjustments?
- **Open question:** What exact clone policy is needed for reconciliation adjustments, unlocks, and import matching?
- **Open question:** Which user roles and sharing rules are needed?
- **Open question:** What should happen when a category is renamed, moved, hidden, or archived?
