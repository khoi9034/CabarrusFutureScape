# ADR 0012: Provider-neutral background jobs

- Status: Accepted
- Date: 2026-08-02

## Context

Report generation and controlled ingestion need durable job identity, but V1 has
no measured need for a queue cluster.

## Decision

Persist a provider-neutral job record and run jobs inline locally. Job records
carry type, status, payload/result references, idempotency key, attempts, bounded
retry policy, errors, timestamps, and audit links. An external-worker adapter is
a contract only. See [background jobs](../background-jobs.md).

## Consequences

Local behavior is deterministic and observable. Long-running jobs will occupy an
API worker until an external provider is deliberately selected.

## Alternatives

- Redis/Celery was rejected without workload evidence.
- Fire-and-forget threads were rejected because state and failure are lost.

## Implementation status

Contract-ready with inline execution as the Product V1 implementation. No
external worker is provisioned.

## Deferred work

Queue selection, worker autoscaling, dead-letter handling, distributed leases,
and scheduled execution are deferred.
