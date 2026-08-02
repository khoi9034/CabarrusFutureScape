# ADR 0003: Data and repository boundaries

- Status: Accepted
- Date: 2026-08-02

## Context

CFS already has frontend domain clients, FastAPI routers and services, and
backend repositories. Product V1 must not duplicate those layers for hosting.

## Decision

Keep domain services stable and select transport or storage at existing ports.
Demo adapters read sanitized same-origin assets; local and enterprise adapters
consume versioned APIs; repositories own persistence and governed queries. Raw
authoritative tables never become generic public CRUD resources. See
[data-provider boundaries](../data-provider-boundaries.md).

## Consequences

The public demo remains independent, while hosted deployment can replace
infrastructure without rewriting Planning, Economics, Investments, or Ask CFS.

## Alternatives

- A parallel enterprise application was rejected as duplicate product logic.
- One-interface-per-class wrappers were rejected where the existing service is
  already the useful seam.

## Implementation status

Implemented foundation: typed frontend clients, FastAPI services, repositories,
and demo assets exist. Product-work repositories are added only where persistent
records need them.

## Deferred work

Managed service bindings and performance-driven repository specialization are
deferred until real hosted workload evidence exists.
