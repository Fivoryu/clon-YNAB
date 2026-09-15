# Proposal: Implement Multi-Account Transfers

## Intent

Extend the implemented first slice from one manual account to multiple manual `CASH`/`CHECKING` accounts and same-budget account-to-account transfers. The change SHALL preserve existing first-slice behavior, support migration of existing single-account budgets, and establish a durable, authorized, concurrency-safe transfer capability without attempting broader YNAB parity.

## Business problem

A budget currently models one account, so users cannot represent money held in separate cash or checking accounts or move money between those accounts. This makes account-level balances and transaction history incomplete, while introducing multiple accounts without strict conservation, authorization, or migration rules would risk incorrect balances and loss of trust.

## Target users and situations

- Users who maintain more than one manual cash or checking account in the same budget.
- Users who need to record a transfer between those accounts while preserving a single budget’s financial truth.
- Existing first-slice users and API clients whose budgets and singular `account` responses must continue to work during migration.

## Product outcome

Users can add and manage supported manual accounts after setup, see canonical account-level balances alongside the existing aggregate balance, and record a same-budget transfer as one durable operation. A transfer visibly changes the source and destination balances by equal and opposite amounts, appears in `/transactions` as `kind: "TRANSFER"`, and does not alter ordinary category activity or RTA. Existing clients and single-account budgets continue to function.

## Capabilities

1. **Canonical multi-account budget projection**
   - `accounts[]` becomes the canonical account collection.
   - The existing singular `account` field remains temporarily as an alias for the oldest account, preserving first-slice compatibility.
   - Existing `accountBalanceMinor` remains the aggregate balance; individual balances are exposed in `accounts[]`.

2. **Account lifecycle**
   - Support additional manual `CASH` and `CHECKING` accounts after setup.
   - Preserve existing account identity, history, and opening information when reading or migrating legacy single-account budgets.
   - Archived accounts remain readable for history but cannot receive new movements or participate in transfers.

3. **Same-budget transfers**
   - Support positive-minor-unit transfers between two distinct accounts in the same budget.
   - Apply equal and opposite account effects atomically.
   - Include transfers in `/transactions` with `kind: "TRANSFER"`.

4. **Financial integrity and compatibility**
   - Enforce authorization, ownership, archived-account protection, idempotency, optimistic concurrency, and PostgreSQL durability.
   - Keep transfers out of ordinary category Activity and RTA calculations.
   - Preserve existing income, spending, category movement, summary, and first-slice API behavior.

## Confirmed scope

- Multiple manual `CASH`/`CHECKING` accounts.
- Account creation after initial setup, plus the account lifecycle behavior required to protect archived accounts.
- Same-budget account-to-account transfers with equal/opposite effects.
- Migration compatibility for existing single-account budgets and clients.
- Canonical `accounts[]`, temporary oldest-account `account` alias, aggregate `accountBalanceMinor`, and per-account balances.
- `/transactions` transfer history with `kind: "TRANSFER"`.
- Atomicity, idempotency, optimistic concurrency, authorization, archived-account protection, and PostgreSQL durability.
- Required impact across API behavior, OpenAPI contract, web behavior, and tests, to be specified and implemented in later phases.
- Regression protection for all existing first-slice behavior.

Payee and memo implementation is explicitly deferred to the separate metadata/history change. Transfer history and contracts SHALL remain compatible with that future work: this change must not make transfer identity, persistence, or `/transactions` evolution dependent on payee/memo fields. The deferred change will define optional, trimmed, case-insensitive partial-searchable payee (maximum 200 characters) and memo (maximum 1000 characters) behavior.

## Explicit non-goals

- Card, investment, loan, or other account kinds.
- Split transactions, reconciliation, bank synchronization, imports, or CSV workflows.
- Broader YNAB parity or redesign of existing budgeting semantics.
- Ordinary category activity, Assigned, Available, or RTA changes caused by transfers.
- Payee or memo implementation in this change.
- Removing the legacy `account` alias.
- Replacing or rewriting the first-slice income, spending, category movement, setup, or history behavior beyond the minimum compatibility needed for this capability.

## Business rules

- The server MUST accept only supported manual `CASH` and `CHECKING` accounts for this change.
- A source and destination MUST be distinct accounts owned by the selected budget. Cross-budget or unknown account identifiers MUST not disclose resources or permit writes.
- Archived accounts MUST reject new ordinary movements and transfers as either source or destination; existing history remains readable.
- Transfer amounts MUST be positive safe integer minor units. The source effect is negative and the destination effect is positive for the same amount.
- Both transfer sides, their durable record, and the idempotency outcome MUST commit or roll back together in PostgreSQL.
- Repeating an identical idempotent command MUST replay its original result without duplicate effects. Reusing its key with a different payload MUST conflict without changing state.
- Stale optimistic-concurrency versions MUST conflict. Client-provided balances MUST never be authoritative writes.
- Transfers MUST be excluded from ordinary income, spending, category Activity, Assigned, Available, and RTA calculations; aggregate balance remains conserved while individual balances change.
- `accounts[]` MUST be the canonical response collection. `account` MUST be derived as the oldest account alias during the compatibility period, and existing single-account responses MUST remain usable.
- `/transactions` MUST identify transfers with `kind: "TRANSFER"` without changing the meaning of existing transaction kinds.

## Affected areas

- **API/application:** budget projections, account lifecycle commands, transfer validation/results, authorization, history mapping, and summary calculations.
- **Persistence/domain:** account collection representation, legacy migration compatibility, paired transfer effects, idempotency/version handling, and PostgreSQL transaction boundaries.
- **OpenAPI:** document the canonical collection, compatibility alias, account operations, transfer operation, headers/envelopes, errors, and transfer history kind.
- **Web:** consume `accounts[]` and per-account balances while preserving first-slice workflows; expose only the bounded account and transfer experience approved for this change.
- **Tests:** regression coverage for first-slice behavior; API, authorization, lifecycle, migration, transfer conservation, idempotency, concurrency, archived-account, history, category/RTA isolation, and PostgreSQL durability coverage.

No application source, tests, Prisma schema/migrations, OpenAPI, web files, `.codegraph/`, or `.pi/` files are changed by this proposal phase.

## Risks and tradeoffs

- **Compatibility ambiguity:** A singular alias can diverge from the collection. Deriving both from one canonical projection and testing zero/one/multiple-account cases contains this risk.
- **Migration/data loss:** Removing the one-account limitation incorrectly could lose identities or opening balances. Migration must be additive, reviewed, and verified against real legacy rows before rollout.
- **Transfer double-application:** Retries or concurrent commands could create duplicate effects. Transaction-scoped receipt checks, version checks, and database-enforced uniqueness are required in design/implementation.
- **Reporting contamination:** Treating transfers as income, spending, or category movement would corrupt RTA and activity. Explicit transfer semantics and report regression tests are required.
- **Scope expansion:** Account features can quickly become banking parity. Limiting this change to manual `CASH`/`CHECKING` accounts and same-budget transfers protects reviewability.
- **Deferred metadata:** Leaving payee/memo out now may temporarily limit search/detail behavior, but separating it avoids coupling this foundational transfer work to the metadata/history scope.

## Rollback and containment

- Roll out schema and application compatibility in an order that allows legacy single-account reads throughout deployment; do not remove the alias while old clients remain supported.
- Gate new account and transfer writes behind the approved capability boundary so failures can stop new writes without invalidating existing income/spending data.
- Preserve immutable legacy account identities and existing financial history; rollback MUST not rewrite or delete historical events.
- If transfer processing fails, the whole command MUST roll back, including receipt state, so no one-sided movement is observable.
- If migration validation fails, stop before enabling multi-account writes and continue serving the legacy single-account path.

## Success criteria

- Existing first-slice setup, income, spending, category movement, summary, history, and client compatibility tests remain green.
- A legacy single-account budget loads without data loss, exposes the same usable `account` alias, and also projects `accounts[]` and aggregate balance consistently.
- A budget can add supported accounts after setup; archived accounts cannot receive ordinary movements or participate in transfers.
- A successful transfer produces equal/opposite source and destination effects, changes individual balances, preserves aggregate `accountBalanceMinor`, and changes neither ordinary category Activity nor RTA.
- Transfers appear in `/transactions` as `kind: "TRANSFER"` and do not alter the semantics of existing kinds.
- Duplicate retries replay safely, payload conflicts are rejected, stale versions conflict, unauthorized/cross-budget requests are protected, and PostgreSQL rollback/durability behavior is demonstrated.
- OpenAPI, web behavior, and tests describe and enforce the same bounded contract.
- Payee/memo remain unimplemented here while the transfer contract remains extensible for the separate metadata/history change.

## Remaining spec/design questions

1. What exact account create, rename, archive, and (if supported) unarchive operations are in the first implementation slice, and what opening-balance rules apply to accounts added after setup?
2. What deterministic definition of “oldest account” should the alias use when legacy and newly created accounts coexist, and what is the planned alias sunset policy?
3. What transfer date and budget-timezone rules apply to `/transactions`, and which existing history filters must include `TRANSFER`?
4. What authoritative paired transfer representation and query/rebuild semantics will preserve a distinct identity from category `MOVE` while supporting durable equal/opposite effects?
5. Do account metadata mutations and transfers share the same budget version/idempotency stream, and what deployment sequencing is required for mixed API/schema versions?

These questions belong in the subsequent spec/design work; they do not expand the confirmed scope or authorize implementation of deferred payee/memo behavior.
