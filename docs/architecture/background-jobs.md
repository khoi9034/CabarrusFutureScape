# Background Jobs

## Model

A background-job record includes:

- stable job ID and job type;
- status (`queued`, `running`, `completed`, or `failed`);
- safe payload and result references, not embedded secrets;
- idempotency key;
- attempt and bounded retry policy;
- redacted error summary;
- created, started, and completed timestamps; and
- actor, project/organization, and audit references.

The inline provider owns its one-way `running` to `completed`/`failed`
transition; Product V1 exposes no public status-transition endpoint. An
idempotency key is globally and permanently unique in this single-organization
foundation, so replay returns the original record even after completion.

## Providers

`inline` executes synchronously in local Product V1 while maintaining the same
durable job lifecycle. `external_worker` defines the future handoff/claim/result
contract but is invalid until a configured provider exists.

Inline execution is appropriate for current bounded report and validation work.
It is not represented as asynchronous when it is not.

## Retry and failure

Inline execution attempts work once and records the configured attempt ceiling
for a future worker; it does not retry automatically. Error metadata is redacted,
and audit links the job to the initiating request and final state.

## Operations

Administration shows status, attempt, duration, and safe error summary. Product
V1 offers no arbitrary payload editor, execute-as-user control, or unbounded
retry button.

## Status

The provider-neutral record and inline provider are Product V1 scope. Redis,
Celery, queue hosting, distributed locks, scheduling, worker autoscaling, and
dead-letter infrastructure are deferred until measured workloads require them.
