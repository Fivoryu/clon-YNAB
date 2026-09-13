# Functional Requirements

## Purpose and scope

This document defines the functional contract for the academic YNAB-style budgeting clone. It turns the accepted MVP boundary and the actor/use-case catalogue into stable, reviewable requirements without claiming parity with the commercial product or knowledge of its private schema, formulas, or implementation.

The bounded first vertical slice covers the already-documented authentication boundary, one user-owned budget, one cash/checking-style account with an explicit opening balance, categories, realized money, monthly planning, RTA/Available, assignment and category moves, one realized income command, one categorized cash/checking spending command, dashboard/month summaries, and positive rollover. These transaction commands accept positive input amounts and support posted/working state only. Authorization, atomic account/plan effects, deterministic calculation/rebuild, and scoped idempotency are part of their test expectations. Broader MVP behavior remains documented for later slices: other account types, splits, transfers, ordinary edit/delete flows, reconciliation, cleared or pending state, overspending variants, refunds/reimbursements/returns, targets, scheduled transactions, and advanced credit-card behavior.

For the bounded first slice, the budget engine is authoritative for `Ready to Assign`, `Assigned`, `Activity`, `Available`, positive rollover, and their derived summaries. Later-slice overspending classifications and special formulas remain questions in [Budget engine research](../research/budget-engine.md#open-questions); this document does not silently choose them.

## Evidence legend

Evidence labels apply to claims about original YNAB behavior, inferred semantics, clone policies, and unresolved questions:

- **Observed** — behavior supported by a cited public source in the project research. It describes observable product behavior, not private implementation.
- **Inferred** — a conceptual relationship derived from observed behavior; it is not an official implementation detail.
- **Clone decision** — an explicit product or domain rule for this independent academic clone.
- **Open question** — an unresolved behavior or policy that must be decided before the affected behavior is implementation-ready.

Structured requirement fields and Given/When/Then acceptance criteria are normative clone-contract statements by default and therefore are **Clone decision** statements unless they carry an explicit **Observed**, **Inferred**, or **Open question** label. Unresolved policy must remain explicitly marked **Open question**. A public observation is never presented as a private YNAB schema or formula.

## Requirement conventions

- Priorities use the actor/use-case vocabulary: **P0** identifies core product importance/foundation, **P1** identifies later controlled financial history/basic card importance, and **P2** identifies deferred planning automation. Priority does not determine delivery status.
- The related actor is the initiating or authoritative actor named in [Actors and use cases](actors-and-use-cases.md).
- Error names use the stable categories from [System architecture](../architecture/system-overview.md): `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `VALIDATION_ERROR`, `CONFLICT`, `INSUFFICIENT_AVAILABLE_FUNDS`, and `INTERNAL_ERROR`. **Clone decision:** API success uses `{data,requestId}` and errors use `{error:{code,message,requestId}}`, with conventional HTTP mappings documented by the system architecture.
- Preconditions, expected flows, possible errors, and Given/When/Then acceptance criteria are normative clone-contract statements by default; they are **Clone decision** statements unless explicitly labeled otherwise. They do not assert that the commercial product uses the same internal design.
- Any unresolved behavior or policy in a structured field must remain explicitly labeled **Open question**.
- Priority and delivery status are separate: **P0**, **P1**, and **P2** express importance, while delivery status is **first slice**, **later MVP slice**, or **deferred/out of MVP**. A P0 later-MVP item is not part of the bounded first slice.

## FR-AUTH — Authentication and budget access

- **ID:** FR-AUTH
- **Name:** Authenticate and authorize budget access
- **Priority:** P0
- **Related actor:** Authenticated user; Budget member is the future-ready authorization boundary.
- **Description:** **Clone decision:** The system shall let a user register or sign in and shall require an authenticated, budget-authorized context for every budget-scoped read or write. **Clone decision:** The system shall not expose another user's budget or records.
- **Preconditions:** The user has valid registration or sign-in input; the authentication/session boundary is available; the requested budget exists for the authorized user.
- **Expected flow:**
  1. The user submits registration or sign-in data.
  2. The system validates and authenticates the identity.
  3. The system creates or refreshes a protected server-managed opaque session.
  4. The system resolves authorized budget membership.
  5. Each later budget request is checked server-side before domain processing.
- **Business rules:**
  - **Clone decision:** Authentication is required before budget access.
  - **Clone decision:** Authorization is checked on the server for every budget-scoped resource; client-provided budget identifiers or balances are not authority.
  - **Clone decision:** Foreign budgets and resources return one uniform non-disclosing `NOT_FOUND` response.
  - **Open question:** Future roles and collaboration remain deferred; local email/password, opaque sessions, cookie protections, expiry, and logout revocation are accepted for the first slice.
- **Possible errors:** Invalid input → `VALIDATION_ERROR`; failed authentication → `UNAUTHENTICATED`; foreign budget/resource → uniform non-disclosing `NOT_FOUND`; duplicate registration or incompatible state → `CONFLICT`; service failure → `INTERNAL_ERROR`.
- **Acceptance criteria:**
  - **Given** an unauthenticated request **When** it reads or changes a budget **Then** the system returns `UNAUTHENTICATED` and performs no budget mutation.
  - **Given** a user authenticated for budget A **When** the user requests budget B without authorization **Then** the system does not disclose B's data and returns uniform non-disclosing `NOT_FOUND`.
  - **Given** valid credentials **When** the user signs in **Then** the system returns a protected authenticated result containing only authorized budget context; logout revokes the session and server-configured expiry ends it.
- **Traceability:** UC-01; applies to all UC-02–UC-16. MVP: [Account and budget setup](mvp-scope.md#account-and-budget-setup), [Acceptance criteria for the first vertical slice](mvp-scope.md#acceptance-criteria-for-the-first-vertical-slice). Architecture: [Domain model](../architecture/domain-model.md#identity-and-access), [System architecture](../architecture/system-overview.md#security-boundaries). NFR: NFR-SEC, NFR-PRIVACY.

## FR-BUDGET — Create and configure a budget

- **ID:** FR-BUDGET
- **Name:** Create and configure the budget plan
- **Priority:** P0
- **Related actor:** Authenticated user; Budget system/engine.
- **Description:** **Clone decision:** An authorized user shall create and configure a tenant-scoped budget with an active planning month, categories, one supported cash/checking-style account, and an explicit opening balance. Opening-transaction and broader account variants are later MVP slice behavior.
- **Preconditions:** The user is authenticated and allowed to create the MVP budget; names, month, account types, and opening amounts are valid; the setup/opening command carries an idempotency key.
- **Expected flow:**
  1. The user supplies a budget name, active planning month, and the budget timezone (default `UTC` in the first slice).
  2. The system creates the budget and ownership/membership boundary.
  3. The user creates category groups and categories.
  4. The user creates the supported cash/checking-style account and enters its explicit opening balance.
  5. The engine records realized opening cash and calculates the initial summary.
- **Business rules:**
  - **Clone decision:** The first slice supports one user-owned budget; the model remains compatible with a future membership boundary.
  - **Clone decision:** The first slice supports a cash/checking-style account with an explicit opening balance; the system must not invent an opening pool. The budget stores one explicit IANA timezone, defaults to `UTC`, and does not allow timezone changes after creation in the first slice.
  - **Clone decision:** Account and initial plan effects commit atomically. Setup/opening movement uses an idempotency key; same-payload replay returns the same logical result and a different payload returns `CONFLICT`.
  - **Open question:** Whether setup is one transaction or a resumable workflow and which broader account types are supported in later slices.
- **Possible errors:** Missing access → `UNAUTHENTICATED` or `FORBIDDEN`; invalid name/month/amount/type → `VALIDATION_ERROR`; duplicate setup entity → `CONFLICT`; missing reference → `NOT_FOUND`; failed atomic setup → `INTERNAL_ERROR` with no partial state.
- **Acceptance criteria:**
  - **Given** an authenticated user with valid setup data **When** the user creates a budget **Then** the budget, active month, requested structure, and explicit opening money are returned with an initial summary.
  - **Given** invalid opening data **When** setup is submitted **Then** the system rejects it with `VALIDATION_ERROR` and creates no partial financial state.
  - **Given** a starting account balance **When** setup succeeds **Then** the account balance and the engine's assignable-money result reflect the same realized amount.
- **Traceability:** UC-02. MVP: [Account and budget setup](mvp-scope.md#account-and-budget-setup), [Journey 1: create a first plan](mvp-scope.md#journey-1-create-a-first-plan). Architecture: [Domain model](../architecture/domain-model.md#bounded-areas), [System architecture](../architecture/system-overview.md#data-and-consistency-strategy), [ADR-001](../decisions/ADR-001-modular-monolith.md#decision). NFR: NFR-DATA, NFR-TIME, NFR-REL.

## FR-ACCOUNT — Manage accounts

- **ID:** FR-ACCOUNT
- **Name:** Manage accounts and account balances
- **Priority:** P0
- **Related actor:** Authenticated user; Budget system/engine.
- **Description:** **Clone decision:** The first slice shall create, rename, archive, list, and inspect one owned cash/checking-style account with an explicit opening balance and an authoritative working balance. Cleared/uncleared balances and broader account types are later MVP slice behavior.
- **Preconditions:** The user is authorized for the budget; the account belongs to that budget for update/read operations; account names, types, and opening values are valid.
- **Expected flow:**
  1. The user requests an account operation.
  2. The system validates lifecycle state and tenant ownership.
  3. The account module records metadata or an explicit opening movement.
  4. The engine recalculates affected summaries.
  5. The system returns the account and relevant derived balances.
- **Business rules:**
  - **Inferred:** An account answers where money is held; a category answers what money is for.
  - **Clone decision:** Archived accounts cannot receive new ordinary transactions.
  - **Clone decision:** Historical references remain explainable after rename or archive.
  - **Open question:** Broader account types, account closure, cleared/uncleared behavior, and positive credit-card balance treatment remain unresolved in [Budget engine research](../research/budget-engine.md#open-questions).
- **Possible errors:** Missing access → `UNAUTHENTICATED` or `FORBIDDEN`; absent account → `NOT_FOUND`; invalid name/type/lifecycle transition → `VALIDATION_ERROR`; conflicting name or stale update → `CONFLICT`; persistence failure → `INTERNAL_ERROR`.
- **Acceptance criteria:**
  - **Given** an authorized user and a valid account request **When** the account is created **Then** it belongs only to the selected budget and is visible in that budget's account list.
  - **Given** an archived account **When** the user records a new ordinary transaction against it **Then** the system rejects the command with `VALIDATION_ERROR`.
  - **Given** authoritative first-slice transaction history **When** the account summary is requested **Then** the working balance is derived consistently from that history; cleared and uncleared balances remain later MVP slice behavior.
- **Traceability:** UC-02, UC-03, UC-07, UC-08, UC-10, UC-13, UC-15. MVP: [Account and budget setup](mvp-scope.md#account-and-budget-setup), [Transactions](mvp-scope.md#transactions). Architecture: [Domain model](../architecture/domain-model.md#accounts-and-ledger), [System architecture](../architecture/system-overview.md#backend-module-responsibilities).

## FR-CATEGORY — Manage category groups and categories

- **ID:** FR-CATEGORY
- **Name:** Manage category structure and lifecycle
- **Priority:** P0
- **Related actor:** Authenticated user; Budget system/engine.
- **Description:** **Clone decision:** The user shall create, rename, archive, list, and organize category groups and categories that belong to the selected budget and receive monthly allocation/activity values. The first slice requires only create, rename, and archive while preserving historical references.
- **Preconditions:** The user is authorized; the budget exists; referenced groups/categories belong to the same budget; names and lifecycle operations are valid.
- **Expected flow:**
  1. The user creates or changes a group or category.
  2. The system validates names, ownership, and lifecycle state.
  3. The system preserves historical references and recalculates affected read models where required.
  4. New allocations and categorized transactions may reference only writable categories.
- **Business rules:**
  - **Observed:** Public guidance describes categories grouped by category groups and customized over time.
  - **Inferred:** A category represents a job for money, distinct from the account where money is held.
  - **Clone decision:** An archived category cannot receive new assignments or activity unless an explicit migration policy allows it.
  - **Clone decision:** The first slice supports create, rename, and archive while preserving historical references.
  - **Open question:** Moving, hiding, deleting, and migrating categories or historical assignments remains unresolved; see [budget-engine category lifecycle questions](../research/budget-engine.md#open-questions).
- **Possible errors:** Unauthorized access → `FORBIDDEN` or non-disclosing `NOT_FOUND`; missing entity → `NOT_FOUND`; invalid or duplicate name/lifecycle state → `VALIDATION_ERROR` or `CONFLICT`; calculation/persistence failure → `INTERNAL_ERROR`.
- **Acceptance criteria:**
  - **Given** an authorized user **When** a valid category is created under a budget group **Then** it is listed in that budget and can be used by applicable planning commands.
  - **Given** an archived category **When** the user attempts a new assignment **Then** the system rejects the command without changing historical values.
  - **Given** a category with historical activity **When** its display name changes **Then** historical transactions remain linked and explainable.
- **Traceability:** UC-02, UC-03, UC-05, UC-06, UC-08, UC-09, UC-13, DU-01. MVP: [Account and budget setup](mvp-scope.md#account-and-budget-setup), [Budgeting](mvp-scope.md#budgeting), [Transactions](mvp-scope.md#transactions). Architecture: [Domain model](../architecture/domain-model.md#budget-planning), [System architecture](../architecture/system-overview.md#backend-module-responsibilities).

## FR-PLANNING — Assign and move money

- **ID:** FR-PLANNING
- **Name:** Plan monthly category allocations
- **Priority:** P0
- **Related actor:** Authenticated user; Budget system/engine.
- **Description:** **Clone decision:** The system shall calculate and expose `Ready to Assign`, `Assigned`, `Activity`, and `Available`, and shall let an authorized user assign realized money or move assigned money between categories for a planning month.
- **Preconditions:** The user is authorized; the month and categories exist and are writable; authoritative account, transaction, allocation, and rollover history is readable; amount is valid.
- **Expected flow:**
  1. The user selects a month and assigns money or chooses a source and destination category for a move, supplying an idempotency key.
  2. The system validates budget ownership, lifecycle state, amount, and month.
  3. The engine applies the first-slice policy, which permits an explicit negative RTA, and writes an auditable movement.
  4. The engine recalculates RTA and the affected category values.
  5. The system returns the updated components and summaries.
- **Business rules:**
  - **Observed:** Public guidance distinguishes unassigned money, category assignments, category activity, and category availability.
  - **Clone decision:** Assignments and moves redistribute existing money; they must not mint money. Each first-slice assignment, unassignment, or move uses an idempotency key; same-payload replay returns the same logical result and a different payload returns `CONFLICT`.
  - **Clone decision:** `Assigned`, `Activity`, and `Available` remain distinct values.
  - **Clone decision:** For the bounded first slice, the semantic equations are `RTA = realized opening cash + realized cash inflows + explicitly supported prior carry - current assignments` and `Available = permitted carryover + Assigned + signed Activity`. Negative RTA is visible, is not clamped or silently repaired, and is corrected through an unassignment or move-back allocation to the unassigned pool.
  - **Clone decision:** Future income is not realized, and spending already funded by an assignment is not subtracted from RTA a second time.
  - **Open question:** Full-MVP treatment of future assignments, positive credit-card balances, cash overspending deductions, credit-card payment state, refunds, closed months, and other special cases remains unresolved in [Budget engine research](../research/budget-engine.md#open-questions).
- **Possible errors:** Invalid month/category/amount → `VALIDATION_ERROR`; insufficient money under a reject policy → `INSUFFICIENT_AVAILABLE_FUNDS`; cross-budget reference → uniform non-disclosing `NOT_FOUND`; stale plan or idempotency conflict → `CONFLICT`; failed atomic movement → `INTERNAL_ERROR` with no partial change.
- **Acceptance criteria:**
  - **Given** realized money and a writable category **When** the user assigns an accepted amount **Then** the category's Assigned/Available and budget RTA are recalculated without creating money.
  - **Given** source and destination categories in the same month **When** the user moves money **Then** the source decreases and destination increases by the same amount, while RTA is conserved.
  - **Given** a first-slice assignment that exceeds realized assignable cash **When** the month is recalculated **Then** negative RTA is visible and not silently clamped or repaired.
  - **Given** negative RTA **When** the user unassigns or moves money back to the unassigned pool **Then** the correction changes the allocation movement and restores RTA without creating money.
      - **Given** the same idempotency key and identical setup, assignment, move, income, or spending payload **When** the command is retried **Then** the same logical result is replayed without duplicate financial effects; a different payload returns `CONFLICT`.
  - **Open question:** A later command policy may reject some overassignments; that policy is not part of the bounded first slice.
- **Traceability:** UC-04, UC-05, UC-06, UC-13, UC-14. MVP: [Budgeting](mvp-scope.md#budgeting), [Journey 3: adapt the plan](mvp-scope.md#journey-3-adapt-the-plan). Research/architecture: [Budget engine research](../research/budget-engine.md#purpose-and-scope), [Domain model](../architecture/domain-model.md#state-and-calculation-vocabulary), [System architecture](../architecture/system-overview.md#data-and-consistency-strategy). NFR: NFR-DATA, NFR-REL.

## FR-TRANSACTION — Record and maintain transactions

- **ID:** FR-TRANSACTION
- **Name:** Record first-slice transactions; maintain later transaction variants
- **Priority:** P0
- **Related actor:** Authenticated user; Budget system/engine.
- **Description:** **Clone decision:** The bounded first slice supports exactly one realized income command and one categorized cash/checking spending command. Both commands accept positive input amounts and support posted/working state only. Transaction dates are date-only business dates interpreted in the budget's explicit IANA timezone; event timestamps are UTC, and the browser timezone does not decide month boundaries. Account-side and plan-side effects commit atomically or not at all. Splits, transfers, ordinary edit/delete, cards, refunds/reimbursements/returns, reconciliation, and cleared-state behavior are later MVP slice policies; this P0 requirement does not make them first-slice delivery.
- **Preconditions:** The user is authorized; the referenced account belongs to the same budget and is writable; the spending category belongs to the same budget and is writable; the command's positive amount, date-only business date, and payee/source are valid; the command carries an idempotency key.
- **Expected flow:**
  1. The user submits a realized income or categorized cash/checking spending command with a positive amount.
  2. The system validates ownership, lifecycle state, dates, amount, posted/working state, and idempotency identity.
  3. The engine computes account-side and plan-side effects from authoritative state; client-provided balances are not used.
  4. The system commits the transaction and all effects atomically, or commits nothing.
  5. The system returns the posted transaction and updated authoritative account/category/RTA summaries.
- **Business rules:**
  - **Observed:** Public guidance describes recording/importing transactions, editing fields, and deleting a transaction with its account and plan effects. These observations do not define this clone's first-slice policy.
  - **Clone decision:** Income increases the realized account working balance and the assignable pool.
  - **Clone decision:** Spending decreases the supported account working balance and signed category `Activity`; `Available` is recalculated from authoritative history. Spending already funded by an assignment is not subtracted from RTA a second time.
  - **Clone decision:** The first slice accepts only posted/working transactions on one cash/checking-style account and one category for spending. Cleared, pending, uncleared, and reconciliation behavior are later MVP slice/P1 scope.
  - **Clone decision:** For these financial creation commands, the same idempotency key plus the same command payload replays the same logical result; the same key plus a different payload returns `CONFLICT`.
  - **Clone decision:** The server, not the client, calculates balances and effects, and authoritative transaction history plus derived summaries have a deterministic rebuild path.
  - **Clone decision — later MVP slice:** When split transactions are accepted, the parent amount shall equal the split-line sum exactly in integer minor units, the account shall change once, category effects shall apply per line, and the command shall be atomic.
  - **Clone decision — later MVP slice:** For a posted, non-reconciled transaction, an ordinary edit shall replace the old account and plan effects with recalculated effects atomically.
  - **Clone decision — later MVP slice:** For a posted, non-reconciled transaction, ordinary deletion shall require explicit confirmation, remove account and plan effects atomically, and record an audit event.
  - **Clone decision — later MVP slice:** Minimum audit identity is the actor, transaction identity, request/correlation identity where applicable, timestamp, and reason when available. Audit visibility is limited to the authorized relevant budget/user boundary.
  - **Open question:** Closed-month propagation, stale-version details, reconciled correction mechanism, audit retention period, export/report presentation, and audit immutability remain unresolved in [ADR-002](../decisions/ADR-002-financial-history.md) and [budget-engine research](../research/budget-engine.md#open-questions).
- **Possible errors:** Invalid fields/lifecycle/state/amount → `VALIDATION_ERROR`; unauthorized or foreign reference → `FORBIDDEN` or `NOT_FOUND`; same idempotency key with a different payload or stale request → `CONFLICT`; failed atomic write → `INTERNAL_ERROR`.
- **Acceptance criteria:**
  - **Given** a valid positive income command **When** it is posted **Then** the account working balance and realized assignable-money result increase atomically.
  - **Given** a valid positive spending command **When** it is posted **Then** the account working balance decreases, signed category Activity decreases, and category Available is recalculated in one consistency boundary.
  - **Given** the same idempotency key and identical command payload **When** the creation command is retried **Then** the same logical result is replayed without duplicate financial effects.
  - **Given** an idempotency key already used with a different command payload **When** the command is submitted **Then** the system returns `CONFLICT` and changes no financial state.
  - **Given** the same authoritative transaction history **When** account and plan summaries are rebuilt **Then** the same values are produced and no client-provided balance is treated as authoritative.
  - **Later-MVP criterion — Given** a split transaction **When** it is accepted **Then** its lines sum exactly to the parent amount in integer minor units, the account changes once, each line applies its category effect, and all effects commit atomically.
  - **Later-MVP criterion — Given** a posted, non-reconciled transaction **When** it is edited or explicitly confirmed for deletion **Then** the affected effects are recalculated or removed atomically and deletion records the minimum authorized audit identity.
  - **Later-slice criterion — Given** a transfer, a card transaction, a refund/return, or reconciliation state **When** it is requested **Then** the system follows the separately documented later policy rather than implying first-slice support.
- **Traceability:** UC-07, UC-08, UC-09, UC-10, UC-11, UC-12, UC-13, UC-15, UC-16. MVP: [Transactions](mvp-scope.md#transactions); first slice covers only the realized income/categorized spending path. Architecture/decision: [Domain model](../architecture/domain-model.md#transaction-types), [System architecture](../architecture/system-overview.md#request-flow), [ADR-002](../decisions/ADR-002-financial-history.md#decision). NFR: NFR-DATA, NFR-REL, NFR-OBS, NFR-TIME.

## FR-TRANSFER — Transfer money between accounts

- **ID:** FR-TRANSFER
- **Name:** Record account-to-account transfers
- **Priority:** P0
- **Related actor:** Authenticated user; Budget system/engine.
- **Description:** **Clone decision:** The system shall record a linked transfer between two distinct owned accounts, decreasing the source and increasing the destination by equal opposite amounts without ordinary spending-category activity. **Clone decision:** Transfers are a later MVP slice P0 requirement and are outside the approved bounded first vertical/Group 2B transaction slice.
- **Preconditions:** The user is authorized; both accounts belong to the same budget and are writable; accounts are distinct; amount and date are valid.
- **Expected flow:**
  1. The user selects source and destination accounts and enters amount/date/memo.
  2. The system validates ownership, lifecycle, and amount.
  3. The engine records linked transfer sides.
  4. The source decreases and destination increases atomically.
  5. The system returns both account results without ordinary category reduction.
- **Business rules:**
  - **Inferred:** A transfer changes where money is held, not what ordinary spending category it serves.
  - **Clone decision:** A transfer cannot cross budget boundaries and cannot use the same account on both sides.
  - **Clone decision:** Both sides are one consistency boundary and retries must not duplicate the transfer.
  - **Open question:** Specialized credit-card payment presentation is not part of basic transfer behavior.
- **Possible errors:** Same account/invalid amount/date/archived account → `VALIDATION_ERROR`; foreign account → `FORBIDDEN` or `NOT_FOUND`; duplicate/stale request → `CONFLICT`; one-sided persistence risk → `INTERNAL_ERROR` with no side committed.
- **Acceptance criteria:**
  - **Given** two writable accounts in one budget **When** a valid transfer is posted **Then** the source decreases and destination increases by equal minor-unit amounts.
  - **Given** a valid transfer **When** the monthly category summary is recalculated **Then** no ordinary spending category Activity is reduced by the transfer.
  - **Given** a retried request with the same idempotency identity **When** it is processed twice **Then** only one transfer effect exists.
- **Traceability:** UC-10, UC-13. MVP: [Transactions](mvp-scope.md#transactions), [Journey 4: transfer money](mvp-scope.md#journey-4-transfer-money). Architecture: [Domain model](../architecture/domain-model.md#transaction-types), [System architecture](../architecture/system-overview.md#data-and-consistency-strategy).

## FR-RECONCILIATION — Manual account reconciliation

- **ID:** FR-RECONCILIATION
- **Name:** Reconcile cleared account history
- **Priority:** P1
- **Related actor:** Authenticated user; Bank/financial institution is an external reference only; Budget system/engine.
- **Description:** **Observed:** Public guidance describes comparing an account with bank state, confirming cleared balance, protecting reconciled transactions, and reducing duplicate-import risk. **Clone decision:** Manual reconciliation is a later MVP slice/P1 capability, outside the bounded first slice, and shall not require bank credentials or automatic synchronization.
- **Preconditions:** The user is authorized; the account exists; the user has an external reference balance; transactions have cleared-state values.
- **Expected flow:**
  1. The user reviews or marks transactions cleared.
  2. The system calculates the cleared balance.
  3. The user enters or confirms the external cleared balance.
  4. The system validates the comparison under the selected policy.
  5. On success, the system records a reconciliation event and protects reconciled transactions by default.
- **Business rules:**
  - **Clone decision:** The bank is a manual reference in MVP; no credentials or automatic import are required.
  - **Clone decision:** Posted/working is first-slice only. Cleared, pending, and uncleared transitions, plus cleared-vs-working balance effects, are later MVP slice/P1 behavior and are blocking dependencies only before reconciliation is implemented.
  - **Clone decision:** A successful reconciliation records an audit event and confirmed cleared balance.
  - **Clone decision:** Reconciled history cannot be hard-deleted by default, and ordinary edit/delete paths return `CONFLICT`.
  - **Open question:** Adjustment transaction, unlock, correction, matching, and import policies remain unresolved in [ADR-002](../decisions/ADR-002-financial-history.md#open-questions).
- **Possible errors:** Unauthorized account → `FORBIDDEN`; missing account → `NOT_FOUND`; invalid external amount/state → `VALIDATION_ERROR`; mismatch or protected change → `CONFLICT`; audit/persistence failure → `INTERNAL_ERROR`.
- **Acceptance criteria:**
  - **Given** cleared transactions and an external balance that matches under the policy **When** the user confirms reconciliation **Then** the system records the event, confirms the balance, and protects the reconciled history.
  - **Given** a mismatching external balance **When** reconciliation is submitted **Then** the system reports the mismatch without silently creating money or changing transactions.
  - **Given** a reconciled transaction **When** the user edits or deletes it through an ordinary path **Then** the system returns `CONFLICT`.
- **Traceability:** UC-15, UC-03, UC-11, UC-12. MVP: later MVP slice/P1; see [Transactions](mvp-scope.md#transactions) and the later acceptance criteria. Architecture/decision: [Domain model](../architecture/domain-model.md#reconciliation-behavior), [System architecture](../architecture/system-overview.md#security-boundaries), [ADR-002](../decisions/ADR-002-financial-history.md#decision).

## FR-ROLLOVER — Monthly rollover

- **ID:** FR-ROLLOVER
- **Name:** Carry monthly plan state forward
- **Priority:** P0
- **Related actor:** Authenticated user; Budget system/engine.
- **Description:** **Observed:** Public guidance distinguishes positive category availability, cash overspending, and credit overspending at month rollover. **Clone decision:** The first slice calculates positive Available carryover into the next planning month deterministically and without inventing money; cash/card overspending rollover remains later scope.
- **Preconditions:** The budget and selected months exist; authoritative assignments, transactions, and category states can be calculated.
- **Expected flow:**
  1. The user selects or reaches the next planning month.
  2. The engine calculates each category's ending Available; funding-source classification is later MVP slice behavior.
  3. Permitted positive availability becomes next-month carryover.
  4. New-month Assigned starts at zero in the first slice; future assignments are later MVP slice behavior.
  5. The system returns the new-month summary and explainable carryover components.

  Cash and credit overspending outcomes are retained as later MVP slice behavior.
- **Business rules:**
  - **Observed:** Positive Available rolls over; public guidance also distinguishes cash and credit overspending at rollover.
  - **Clone decision:** The first slice preserves positive Available as permitted carryover, with separate Assigned, Activity, and Available values, and calculates it deterministically from authoritative history.
  - **Open question:** Cash overspending deductions, credit-card payment state, refunds, closed-month propagation, and partial-correction formulas remain later MVP slice questions in [budget-engine research](../research/budget-engine.md#open-questions).
- **Possible errors:** Missing month/budget → `NOT_FOUND`; invalid selector → `VALIDATION_ERROR`; historical inconsistency or concurrent operation → `CONFLICT`; unresolved unsupported special case → explicit `VALIDATION_ERROR`/unsupported-policy result; engine failure → `INTERNAL_ERROR`.
- **Acceptance criteria:**
  - **Given** positive category Available at month end **When** the next month is calculated **Then** the permitted amount is carried forward without inventing new Assigned money.
  - **Later-slice criterion — Given** cash overspending **When** rollover is calculated **Then** the configured cash consequence is visible in next-month RTA and is not treated as credit overspending.
  - **Later-slice criterion — Given** credit overspending **When** rollover is calculated **Then** the configured underfunded card-payment state is visible and is not silently converted to cash overspending.
- **Traceability:** UC-14, UC-04, UC-05, UC-08, UC-16. MVP: [Budgeting](mvp-scope.md#budgeting), [Acceptance criteria for the first vertical slice](mvp-scope.md#acceptance-criteria-for-the-first-vertical-slice). Research/architecture: [Budget engine research](../research/budget-engine.md#month-rollover), [Domain model](../architecture/domain-model.md#state-and-calculation-vocabulary).

## FR-CREDIT-CARD — Basic credit-card behavior

- **ID:** FR-CREDIT-CARD
- **Name:** Distinguish basic credit-card spending and overspending
- **Priority:** P1
- **Related actor:** Authenticated user; Budget system/engine.
- **Description:** **Observed:** Public guidance distinguishes cash overspending from credit-card overspending, including different visual and rollover consequences. **Clone decision:** Basic credit-card behavior is a later P1 slice outside the bounded first vertical slice; the first slice uses only a cash/checking-style account and does not imply card support.
- **Preconditions:** A supported credit-card account and valid categorized spending exist; the engine knows the category/month and funding source.
- **Expected flow:**
  1. The user records credit-card spending through the normal transaction flow.
  2. The engine applies category Activity and determines any shortage by funding source.
  3. The system displays credit overspending distinctly from cash overspending.
  4. At rollover, the engine emits the defined basic underfunded payment state.
- **Business rules:**
  - **Observed:** Credit-card overspending is publicly described as distinct from cash overspending; mixed spending is cash-first.
  - **Clone decision:** Later P1 basic support may include the additional debt/underfunded-payment consequence; advanced card workflows remain out of scope.
  - **Clone decision:** Any later credit-card logic must use integer minor units and atomic account/plan effects.
  - **Open question:** Exact payment-category formula, positive card balances, refunds, mixed-spending ordering, and correction behavior remain unresolved in [budget-engine research](../research/budget-engine.md#open-questions).
- **Possible errors:** Unsupported account type or invalid category → `VALIDATION_ERROR`; ambiguous mixed classification → `CONFLICT` or explicit unsupported-policy result; unauthorized record → `FORBIDDEN`/`NOT_FOUND`; calculation failure → `INTERNAL_ERROR`.
- **Acceptance criteria:**
  - **Given** a category shortage caused by supported credit-card spending **When** the month is calculated **Then** the shortage is classified and displayed as credit overspending, not cash overspending.
  - **Given** mixed cash and credit spending **When** the engine applies the defined basic policy **Then** cash is consumed first and the remaining shortage is the credit portion, without silently treating all spending as credit overspending.
  - **Given** a request for advanced card parity **When** it is evaluated against MVP scope **Then** the system does not imply support; the feature is marked deferred/out of scope.
- **Traceability:** UC-16, UC-08, UC-09, UC-14, UC-13. MVP: [Transactions](mvp-scope.md#transactions), [Out of scope for MVP](mvp-scope.md#out-of-scope-for-mvp). Research: [YNAB domain research](../research/ynab-domain.md#ready-to-assign-and-overspending), [Budget engine research](../research/budget-engine.md#overspending).

## FR-TARGET — Category targets and target status

- **ID:** FR-TARGET
- **Name:** Define deferred category targets
- **Priority:** P2
- **Related actor:** Authenticated user; Budget system/engine.
- **Description:** **Observed:** Public guidance describes category targets for set-aside, refill, and balance-by-period needs. **Clone decision:** A future target feature shall represent a planning instruction and may show a suggestion/status; it shall not create money or assign it automatically.
- **Preconditions:** The user is authorized; the category exists; target type, amount, and period are valid under the future target policy.
- **Expected flow:**
  1. The user creates or edits a target on a category.
  2. The system stores the target separately from money and transactions.
  3. The engine calculates a status or suggested assignment from category state.
  4. The user must explicitly assign money if the suggestion is accepted.
- **Business rules:**
  - **Clone decision:** Targets belong to exactly one category and are not account balances, assignments, or transactions.
  - **Clone decision:** Creating/evaluating a target does not change RTA, Assigned, Activity, Available, or account balances.
  - **Clone decision:** The feature is deferred P2 and is not required for the first vertical slice.
  - **Open question:** MVP target subset, carryover, partial months, skipped periods, overspending, and suggestion timing remain unresolved in [budget-engine research](../research/budget-engine.md#open-questions).
- **Possible errors:** Missing/archived category → `NOT_FOUND` or `VALIDATION_ERROR`; invalid target type/period/amount → `VALIDATION_ERROR`; conflicting target state → `CONFLICT`; unsupported target behavior → explicit deferred/unsupported result; calculation failure → `INTERNAL_ERROR`.
- **Acceptance criteria:**
  - **Given** a valid target definition **When** it is saved **Then** it is linked to the category and does not change any monetary balance.
  - **Given** a target status or suggestion **When** it is calculated **Then** it is explainable from category state and applying it requires an explicit assignment command.
  - **Given** an MVP implementation that has not accepted the target milestone **When** a target command is requested **Then** the system identifies the feature as deferred rather than silently applying a partial formula.
- **Traceability:** DU-01, UC-03, UC-05, UC-13. MVP: [Out of scope for MVP](mvp-scope.md#out-of-scope-for-mvp), [Suggested delivery slices](mvp-scope.md#suggested-delivery-slices). Research/architecture: [YNAB domain research](../research/ynab-domain.md#targets), [Domain model](../architecture/domain-model.md#budget-planning).

## FR-SCHEDULED — Scheduled and repeating transactions

- **ID:** FR-SCHEDULED
- **Name:** Define deferred scheduled transactions
- **Priority:** P2
- **Related actor:** Authenticated user; Scheduler/generation process; Budget system/engine.
- **Description:** **Observed:** Public guidance describes future or repeating register entries that have no plan effect before occurrence. **Clone decision:** A future scheduled-transaction feature shall generate an ordinary transaction only at a defined occurrence and shall be idempotent.
- **Preconditions:** The scheduling milestone is accepted; the user is authorized; account/category and recurrence data are valid; the generation process has an explicit timezone and occurrence policy.
- **Expected flow:**
  1. The user creates or edits a future/repeating schedule.
  2. Before occurrence, the schedule is visible as a plan for a future register item but does not change account or budget values.
  3. At the defined occurrence, the scheduler creates one ordinary transaction.
  4. The transaction follows normal validation, authorization, budget-engine, and atomicity rules.
  5. Retrying the same occurrence does not duplicate effects.
- **Business rules:**
  - **Clone decision:** Scheduled entries are P2 and out of the first MVP.
  - **Observed:** A not-yet-occurred scheduled transaction has no plan effect.
  - **Clone decision:** Generation uses a stable occurrence identity or equivalent idempotency mechanism.
  - **Open question:** Generation timing, budget timezone, missed occurrences, retries, edits after generation, and the documented cash-account cleared-state exception remain open.
- **Possible errors:** Invalid recurrence/date/timezone/account/category → `VALIDATION_ERROR`; foreign reference → `FORBIDDEN`/`NOT_FOUND`; duplicate occurrence → `CONFLICT` or idempotent replay; unavailable scheduler → safe retry without duplicate effects; persistence failure → `INTERNAL_ERROR`.
- **Acceptance criteria:**
  - **Given** a schedule whose occurrence has not arrived **When** the plan is calculated **Then** account balance, Activity, Available, and RTA remain unchanged by the schedule.
  - **Given** one eligible occurrence **When** generation succeeds **Then** exactly one ordinary transaction and its atomic account/plan effects exist.
  - **Given** the same occurrence is processed twice **When** the second attempt runs **Then** it does not duplicate the transaction or financial effects.
  - **Given** the P2 milestone is not accepted **When** scheduling is requested **Then** the system identifies the capability as deferred rather than implying MVP support.
- **Traceability:** DU-02, UC-08, UC-11, UC-13, UC-14. MVP: [Out of scope for MVP](mvp-scope.md#out-of-scope-for-mvp), [Suggested delivery slices](mvp-scope.md#suggested-delivery-slices). Research/architecture: [Budget engine research](../research/budget-engine.md#scheduled-transactions), [Domain model](../architecture/domain-model.md#automation-and-integration), [System architecture](../architecture/system-overview.md#logical-components).

## Traceability matrix

| Requirement | Relevant use cases | MVP scope section(s) | Domain/architecture/decision traceability |
|---|---|---|---|
| FR-AUTH | UC-01; applies to UC-02–UC-16 | [Account and budget setup](mvp-scope.md#account-and-budget-setup) | [Domain model: identity](../architecture/domain-model.md#identity-and-access); [System architecture: security](../architecture/system-overview.md#security-boundaries) |
| FR-BUDGET | UC-02 | [Account and budget setup](mvp-scope.md#account-and-budget-setup) | [Domain model: bounded areas](../architecture/domain-model.md#bounded-areas); [ADR-001](../decisions/ADR-001-modular-monolith.md#decision) |
| FR-ACCOUNT | UC-02, UC-03, UC-07, UC-08, UC-10, UC-13, UC-15 | [Account and budget setup](mvp-scope.md#account-and-budget-setup); [Transactions](mvp-scope.md#transactions) | [Domain model: accounts](../architecture/domain-model.md#accounts-and-ledger); [System architecture: modules](../architecture/system-overview.md#backend-module-responsibilities) |
| FR-CATEGORY | UC-02, UC-03, UC-05, UC-06, UC-08, UC-09, UC-13; DU-01 | [Account and budget setup](mvp-scope.md#account-and-budget-setup); [Budgeting](mvp-scope.md#budgeting) | [Domain model: planning](../architecture/domain-model.md#budget-planning) |
| FR-PLANNING | UC-04, UC-05, UC-06, UC-13, UC-14 | [Budgeting](mvp-scope.md#budgeting) | [Budget engine research](../research/budget-engine.md#purpose-and-scope); [Domain model: vocabulary](../architecture/domain-model.md#state-and-calculation-vocabulary) |
| FR-TRANSACTION | UC-07, UC-08, UC-09, UC-11, UC-12, UC-13, UC-16 | [Transactions](mvp-scope.md#transactions) | [Domain model: transaction types](../architecture/domain-model.md#transaction-types); [ADR-002](../decisions/ADR-002-financial-history.md#decision) |
| FR-TRANSFER | UC-10, UC-13 | [Transactions](mvp-scope.md#transactions) | [Domain model: transaction types](../architecture/domain-model.md#transaction-types); [System architecture: consistency](../architecture/system-overview.md#data-and-consistency-strategy) |
| FR-RECONCILIATION | UC-15; UC-03, UC-11, UC-12 | [Transactions](mvp-scope.md#transactions) | [Domain model: reconciliation](../architecture/domain-model.md#reconciliation-behavior); [ADR-002](../decisions/ADR-002-financial-history.md#decision) |
| FR-ROLLOVER | UC-14, UC-04, UC-05, UC-08, UC-16 | [Budgeting](mvp-scope.md#budgeting) | [Budget engine research: rollover](../research/budget-engine.md#month-rollover); [Domain model: vocabulary](../architecture/domain-model.md#state-and-calculation-vocabulary) |
| FR-CREDIT-CARD | UC-16, UC-08, UC-09, UC-14, UC-13 | [Transactions](mvp-scope.md#transactions); [Out of scope for MVP](mvp-scope.md#out-of-scope-for-mvp) | [YNAB domain research](../research/ynab-domain.md#ready-to-assign-and-overspending); [Budget engine research](../research/budget-engine.md#overspending) |
| FR-TARGET | DU-01; UC-03, UC-05, UC-13 | [Out of scope for MVP](mvp-scope.md#out-of-scope-for-mvp); [Suggested delivery slices](mvp-scope.md#suggested-delivery-slices) | [Domain model: planning](../architecture/domain-model.md#budget-planning); [Budget engine research: targets](../research/budget-engine.md#targets) |
| FR-SCHEDULED | DU-02; UC-08, UC-11, UC-13, UC-14 | [Out of scope for MVP](mvp-scope.md#out-of-scope-for-mvp); [Suggested delivery slices](mvp-scope.md#suggested-delivery-slices) | [Domain model: automation](../architecture/domain-model.md#automation-and-integration); [System architecture: logical components](../architecture/system-overview.md#logical-components) |

## Explicit non-goals and unresolved policies

- **Clone decision:** Bank synchronization, real financial-institution credentials, collaboration, mobile-native behavior, multiple currencies, advanced reports, notifications, AI recommendations, and advanced credit-card parity are outside MVP.
- **Open question:** The bounded first-slice RTA, Available, positive-rollover, and cash-account decisions are documented above. Full-MVP future-assignment, positive-card-balance, overspending, refund, card-payment, mixed-spending, closed-month, category-lifecycle, reconciliation-correction, target, and scheduled-generation policies must be resolved before implementation of the affected later behavior.
- **Clone decision:** No requirement in this document authorizes private YNAB schema, formula, or implementation claims.
