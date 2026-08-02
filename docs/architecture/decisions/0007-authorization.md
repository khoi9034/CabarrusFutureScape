# ADR 0007: Explicit role and object authorization

- Status: Accepted
- Date: 2026-08-02

## Context

Coarse read/write/admin checks do not express who may update a Planning Snapshot,
approve ingestion, create reports, or inspect audit history.

## Decision

Authorize named permissions for Viewer, Planner, Analyst, Report Author, Data
Steward, and Administrator. Enforce permissions at routes and again against the
target object's organization/project membership. Denials are safe and audited.

## Consequences

UI visibility is convenience only; the API remains authoritative. New write
routes must select a permission and an ownership rule before release.

## Alternatives

- UI-only authorization was rejected as bypassable.
- Administrator/non-administrator alone was rejected as excessive privilege.

## Implementation status

Contract-ready. The permission matrix is documented in
[user roles and workflows](../../product/user-roles-and-workflows.md) and checked
by `check:authorization`.

## Deferred work

Custom roles, attribute-based policies, delegated administration, and policy as
code are deferred until the fixed role set proves insufficient.
