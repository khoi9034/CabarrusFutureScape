# ADR 0013: Portable deployment boundary

- Status: Accepted
- Date: 2026-08-02

## Context

Product V1 must be reviewable and container-ready without deploying or coupling
the application to an unapproved cloud platform.

## Decision

Provide non-root frontend and backend images, health checks, explicit ports, and
an enterprise-local Compose reference that receives configuration from the
environment and connects to an approved external PostgreSQL/PostGIS database.
CI validates without logging into, pushing to, or deploying on a cloud platform.
See [enterprise deployment](../enterprise-deployment.md).

The reference runs canonical `local` + `local_api` + `local_dev` mode. Promotion
to hosted enterprise changes the providers together to `enterprise`,
`enterprise_api`, `oidc`, `object_storage`, and `external_worker`; mixed unsafe
configurations fail validation.

## Consequences

The same artifacts can later target a managed platform. Public browser variables
are fixed at frontend build time; server secrets remain runtime-only.

## Alternatives

- Provisioning a vendor stack now was rejected because no deployment is approved.
- Packaging raw `cfs_dev` data in Compose was rejected as unsafe.

## Implementation status

Implemented on the Product V1 branch: container definitions, health contracts,
and sanitized validation workflow. Local check evidence is recorded separately;
no deployment is claimed.

## Deferred work

Registry, managed database, hosted identity, networking, TLS termination,
monitoring, backups, scaling, and production rollout are deferred.
