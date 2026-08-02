# ADR 0001: Single-organization Product V1

- Status: Accepted
- Date: 2026-08-02

## Context

CFS needs governed users, projects, persisted work, and audit history before a
real sponsoring organization or tenant-isolation policy has been selected.

## Decision

Product V1 serves one organization. Product records may carry an organization
identifier so ownership is explicit, but the application does not implement
tenant discovery, cross-tenant sharing, billing, or tenant-specific schemas.

## Consequences

Authorization remains understandable and every persistent object has one
ownership boundary. A later multi-organization release will require deliberate
row-isolation tests and onboarding workflows rather than a configuration flip.

## Alternatives

- Building multi-tenancy now was rejected because no second tenant exists.
- Omitting organization ownership was rejected because it makes later migration
  and audit interpretation needlessly difficult.

## Implementation status

Contract-ready. The Product V1 model supports optional organization ownership;
local verification evidence belongs in the implementation report.

## Deferred work

Tenant provisioning, domain verification, billing, tenant-specific encryption,
cross-tenant administration, and formal organization onboarding are deferred.
