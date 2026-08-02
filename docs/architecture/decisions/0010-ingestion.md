# ADR 0010: Controlled ingestion lifecycle

- Status: Accepted
- Date: 2026-08-02

## Context

CFS has source-specific scripts and connectors, but enterprise administration
needs a consistent safe lifecycle and immutable evidence before applying data.

## Decision

Every controlled ingestion follows adapter, stage, validate, dry-run, and
explicit-apply steps. It records checksums, schema/SRID/geometry checks, duplicate
and null rates, row reconciliation, freshness, and immutable run results. Tests
write only to temporary fixtures and schemas. See [ingestion framework](../../data/ingestion-framework.md).

## Consequences

No source silently overwrites canonical tables. Apply requires Data Steward
permission and a successful staged validation.

## Alternatives

- Automatic scheduled overwrite was rejected as unsafe for V1.
- Replacing existing source adapters was rejected because they contain useful
  domain-specific validation.

## Implementation status

Partial foundation: source scripts, dry-run behavior, and connectors exist. The
Product V1 lifecycle and run records are contract-ready and checked separately.

## Deferred work

Scheduling, distributed workers, large-file multipart staging, and source-specific
approval chains are deferred.
