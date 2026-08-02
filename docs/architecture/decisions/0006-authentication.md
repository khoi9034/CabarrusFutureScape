# ADR 0006: Principal authentication adapters

- Status: Accepted
- Date: 2026-08-02

## Context

Demo must stay anonymous and local development must remain usable, while an
enterprise deployment cannot permit anonymous writes.

## Decision

Authentication modes are `off`, `local_dev`, and `oidc`. Demo uses `off` and
does not expose write APIs. Local development uses a named development principal.
Enterprise uses a verified OIDC bearer principal. Existing Entra token handling
is the first OIDC adapter, not an identity-provider dependency in domain code.

## Consequences

Request identity is explicit and testable. Enterprise startup fails when OIDC
requirements are incomplete, while no identity secret enters browser settings.

## Alternatives

- A hard-coded anonymous enterprise user was rejected as unsafe.
- Requiring cloud identity for local development was rejected as needless.

## Implementation status

Implemented foundation: Entra JWT verification and request middleware exist.
The canonical principal and local development adapter are Product V1 scope.

## Deferred work

Identity registration, group synchronization, MFA policy, break-glass accounts,
and lifecycle provisioning are deferred to the sponsoring organization.
