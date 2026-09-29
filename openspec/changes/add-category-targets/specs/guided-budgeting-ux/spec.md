## ADDED Requirements

### Requirement: Category targets are presented in category context with explicit confirmation

The Budget experience MUST present a targeted category's kind, amount, target month where the kind declares one, progress, remaining gap, and status within that category's own context, using Spanish product language and without exposing implementation terminology or raw field names. A category without a target MUST NOT present target state. Where a remaining gap is positive and the category is active, the experience MUST offer a suggestion whose confirmation invokes the existing assignment command; the system MUST NOT assign on its own, and the suggestion MUST be presented as distinct from Ready to Assign so it cannot be mistaken for money that is already available. An archived category MUST NOT offer an actionable target suggestion. A target shown while viewing a past month MUST be accompanied by the disclosure that the current definition is displayed and no target history is retained.

#### Scenario: A targeted category shows its state and suggestion in context

- GIVEN a budget category has a target with a positive remaining gap and is active
- WHEN the owner views the budget for a month
- THEN that category presents its target kind, amount, progress, remaining gap, and status
- AND it offers a suggestion to assign the gap

#### Scenario: Confirming the suggestion assigns through the existing command

- GIVEN a category presents a target suggestion
- WHEN the owner confirms it
- THEN the assignment MUST be performed by the existing assignment command
- AND the displayed values MUST be refreshed from the server

#### Scenario: An archived category offers no actionable suggestion

- GIVEN a category with a target is archived
- WHEN the owner views the budget
- THEN its target state MAY remain readable
- AND no actionable assignment suggestion MUST be offered for it

#### Scenario: A category without a target shows no target state

- GIVEN a category has no target
- WHEN the owner views the budget
- THEN no target kind, amount, progress, remaining gap, or status MUST be shown for that category
