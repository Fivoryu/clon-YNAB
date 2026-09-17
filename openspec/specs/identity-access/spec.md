# Identity and Access Specification

## Purpose

Provide local authentication and server-managed access for a personal budgeting workspace.

## Requirements

### Requirement: Local account authentication

The system MUST support registration and sign-in using a local email address and password, and MUST distinguish invalid credentials without disclosing whether an unrelated account or budget exists.

#### Scenario: A new user registers and signs in

- GIVEN an unused valid email address and an acceptable password
- WHEN the user registers and then signs in with those credentials
- THEN the system MUST authenticate the user and establish an authenticated session

#### Scenario: Invalid credentials are rejected

- GIVEN an existing account
- WHEN a user submits an invalid password or otherwise invalid credentials
- THEN the system MUST deny authentication without exposing protected budget data

### Requirement: Server-managed session lifecycle

The system MUST use an opaque, server-managed session for authenticated requests, MUST expire or revoke sessions according to the session policy, and MUST not treat client-supplied user or budget identifiers as proof of authorization.

#### Scenario: Authenticated access uses a valid session

- GIVEN a valid active session
- WHEN the user requests an authorized budgeting operation
- THEN the system MUST associate the operation with the session owner

#### Scenario: Missing or revoked session is denied

- GIVEN no active valid session
- WHEN a user requests a protected operation
- THEN the system MUST return an unauthenticated result and MUST NOT perform the operation

### Requirement: Owner-only budget access

The system MUST authorize every budget-scoped read and write against the authenticated owner and MUST use non-disclosing not-found behavior for foreign resources.

#### Scenario: A user cannot access another user's budget

- GIVEN a resource owned by a different user
- WHEN the authenticated user attempts to read or mutate it, including with a guessed identifier
- THEN the system MUST disclose neither the resource's existence nor its contents and MUST leave it unchanged
