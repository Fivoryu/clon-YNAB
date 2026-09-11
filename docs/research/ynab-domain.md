# YNAB Domain Research

## Purpose

This document describes the observable behavior and conceptual model of YNAB that is relevant to an academic clone. It separates public evidence from assumptions made for our implementation.

## Executive summary

YNAB is a forward-looking, category-based budgeting system. Its central loop is:

1. Define spending priorities as categories.
2. Work only with money that is available now.
3. Assign that money to categories.
4. Record or import actual transactions.
5. Compare category availability with the plan.
6. Move money when priorities change.

The product is therefore more than a transaction register. The budget plan and category balances are first-class domain state.

## The YNAB method

The official YNAB method is commonly presented through four rules:

1. **Give Every Dollar a Job** — decide what currently available money should do before spending it.
2. **Embrace Your True Expenses** — prepare for large, irregular, or less frequent expenses by treating them as part of the plan.
3. **Roll With the Punches** — adjust category allocations when reality changes instead of treating the original plan as immutable.
4. **Age Your Money** — work toward using older money and getting ahead of upcoming expenses.

The current public YNAB method page also frames the workflow around deciding what money is for now, later, and for flexibility. This is product methodology, not a claim about the internal source code.

## Product concepts observed in official guidance

### Categories and category groups

The getting-started guide describes pre-built categories grouped into category groups, and allows users to customize names and add categories over time. Categories represent intended jobs for money: bills, groceries, savings, travel, and similar priorities.

### Targets

The guide describes targets for recurring, weekly, annual, and date-based needs. Examples include:

- setting aside a monthly amount;
- replenishing an amount every week;
- saving a known amount by a future date.

For the clone, a target should be treated as a planning aid. It must not silently create money or authorize spending.

### Accounts

The guide distinguishes the money currently available from money expected in the future. It recommends starting with real checking, savings, and regularly used credit-card accounts. Future income is not treated as available until it arrives.

An account answers **where money is held**. A category answers **what money is for**. These are deliberately different concepts.

### Transactions

The guide states that users record or import transactions as they spend and earn. Transactions affect account balances and category activity. Income adds money to the available pool; categorized spending reduces the relevant category availability.

Transfers between two owned accounts should move money between accounts without becoming ordinary category spending.

### Month rollover and reassignment

The guide states that category jobs can be reassigned and that the user continues the plan when the month rolls over. A month is therefore a useful planning boundary, but the budget is not reset to zero at the end of every month.

## Conceptual accounting model

This is an **inferred clone model**, not an assertion about YNAB's private implementation.

```text
Account balance answers:  Where is the money?
Category availability answers: What can this money still do?
Budget allocation answers:  What job did the user assign?
Transaction activity answers: What actually happened?
```

A transaction may need both an account-side representation and a budget-side effect. That is why a simple `expenses` table is insufficient for a faithful clone.

### Core invariants

- Monetary values use integer minor units, never floating-point arithmetic.
- A transaction has exactly one source account.
- A normal spending transaction has one category or multiple split lines.
- The sum of split lines equals the transaction amount.
- A transfer has a source account and destination account and does not require a spending category.
- A transaction cannot spend from an archived category unless the product explicitly supports that migration.
- Only realized income is available for assignment; expected future income is not included.
- Changes that affect account balances and category balances are committed atomically.
- Every budget and financial record is tenant-scoped to an authorized user or budget member.

## Relevant product areas for the clone

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

The public API documentation describes an HTTPS REST API using JSON. It exposes resources for plans, accounts, categories, money movements, months, payees, scheduled transactions, and transactions. The documented base URL is `https://api.ynab.com/v1`.

The API documentation also describes:

- a predictable `data` response wrapper;
- personal access tokens and OAuth applications;
- UTC dates;
- delta requests using `server_knowledge` and `last_knowledge_of_server` for supported resources;
- resource-specific endpoints instead of always fetching an entire plan.

These observations are useful architectural signals, but we are building an independent clone and are not required to reproduce the public API.

## What we should not assume

The public marketing and developer documentation do not prove:

- the internal database schema;
- the exact budget calculation implementation;
- the exact bank-import provider behavior;
- all edge cases for credit cards, refunds, overspending, or closed months;
- the complete permissions model of the commercial product;
- the exact algorithm used by targets or reports.

Those areas must be labeled as open questions until verified through additional public help documentation or defined as explicit clone decisions.

## Research sources

Accessed: **2026-09-10**.

1. [The YNAB Method](https://www.ynab.com/ynab-method) — official explanation of the product method and the role of money as intentional spending.
2. [The Ultimate Get Started Guide](https://www.ynab.com/guide/the-ultimate-get-started-guide) — official onboarding guidance for categories, non-monthly expenses, targets, accounts, current money, and transaction recording/import.
3. [YNAB API Documentation](https://api.ynab.com/) — official public API overview, resources, authentication, response format, dates, and delta requests.

## Open research questions

- What exact states and transitions are required for a monthly budget?
- How should overspending be represented and resolved at month rollover?
- Which credit-card rules are required for the academic scope?
- Are refunds modeled as income, negative spending, or category-specific adjustments?
- What is the minimum reconciliation workflow?
- Which user roles and sharing rules are needed?
- What should happen when a category is renamed, moved, hidden, or archived?
