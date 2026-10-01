## ADDED Requirements

### Requirement: Cleared state and reconciliation are reachable in account activity

The account activity surface MUST let the owner see the cleared state of each item, change an eligible item between uncleared and cleared, and reconcile the selected account against a confirmed external cleared balance. The surface MUST show the account's cleared balance beside its working balance, MUST distinguish a reconciled item from a merely cleared one, and MUST NOT offer an ordinary edit or delete action for a reconciled item.

When a confirmed external balance differs from the computed cleared balance, the surface MUST show the difference and MUST require an explicit confirmation, with a reason, before any adjustment is applied. It MUST NOT present the adjustment as already applied, and it MUST NOT offer an unlock, revert, or correction action for reconciled history. All values shown MUST be server-derived; the surface MUST NOT compute a cleared balance, an adjustment, or a lock client-side.

#### Scenario: The owner sets a transaction's cleared state

- GIVEN the owner is viewing an account's activity
- WHEN the owner marks a posted, uncleared, not-reconciled item cleared
- THEN the item shows as cleared, the account's cleared balance updates from the server, and the working balance is unchanged

#### Scenario: The owner reconciles a matching balance

- GIVEN the owner is viewing an account's activity
- WHEN the owner confirms an external cleared balance equal to the server-derived cleared balance
- THEN the surface reports the completed reconciliation and shows the affected items as reconciled

#### Scenario: The owner sees a mismatch before confirming an adjustment

- GIVEN the confirmed external balance differs from the server-derived cleared balance
- WHEN the owner submits it
- THEN the surface MUST show the difference and MUST require an explicit confirmation and a reason before an adjustment is applied
- AND no adjustment MUST be shown as applied before that confirmation

#### Scenario: Reconciled history offers no ordinary mutation

- GIVEN an item is reconciled
- WHEN the owner views it in account activity
- THEN it MUST be distinguishable from a merely cleared item and MUST offer no ordinary edit or delete action

#### Scenario: An unlock or correction action is absent

- GIVEN a reconciled item is displayed
- WHEN the owner looks for a way to unlock, revert, or correct it
- THEN the surface MUST NOT offer such an action and MUST report the capability as unavailable
