# ADR 0005: Reviewable database migrations

- Status: Accepted
- Date: 2026-08-02

## Context

Some legacy workflow services create tables lazily. Enterprise Product V1 needs
repeatable schema state without rebuilding or dropping authoritative datasets.

## Decision

Use a version table and ordered, reviewable Product V1 migrations. Migration is
an explicit operator command, never application startup behavior. Tests operate
on an isolated database or schema. One-step rollback is limited to Product V1
migrations and must not touch canonical source tables. See
[database and migrations](../database-and-migrations.md).

## Consequences

Schema changes become reviewable and reversible within their documented scope.
Operators must run a preflight and retain a backup before hosted upgrades.

## Alternatives

- Runtime `CREATE TABLE IF NOT EXISTS` was rejected as unversioned.
- Rebuilding `cfs_dev` was rejected because it contains authoritative work.

## Implementation status

Contract-ready. Migration status, check, upgrade, and rollback commands are the
acceptance surface; no migration is claimed as run by this ADR.

## Deferred work

Managed-database maintenance windows, zero-downtime multi-version migrations,
and automated production rollback are deferred.
