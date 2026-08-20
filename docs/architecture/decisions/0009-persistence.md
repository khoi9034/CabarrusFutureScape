# ADR 0009: Mode-aware product persistence

> Scope update (2026-08-20): Investments and CASE-1 examples below are retained as decision history only; those surfaces are retired.

- Status: Accepted
- Date: 2026-08-02

## Context

Planning, Economics, Investments, and Ask CFS currently mix session behavior and
domain-specific workflow tables. Product V1 needs consistent reopen/versioning
semantics without making the public demo writable.

## Decision

Demo persists only labeled session data in the browser. Local persists Product
V1 work through FastAPI/PostgreSQL with a local principal. Enterprise uses the
same API contracts with authenticated organization/project context. Versions are
new immutable records; archive is a state transition rather than hidden deletion.

## Consequences

Refresh/reopen behavior is truthful by mode. Domain services remain shared, and
persistence failures never substitute demo data for real work.

## Alternatives

- Browser persistence for enterprise work was rejected as non-auditable.
- Duplicating an enterprise service layer was rejected as unnecessary.

## Implementation status

Partial foundation: demo session services and Investment workflow persistence
exist. Product V1 reconciles shared projects, versions, reports, and conversations.

## Deferred work

Offline synchronization, collaborative editing, and cross-organization sharing
are deferred.
