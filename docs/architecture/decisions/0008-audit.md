# ADR 0008: Append-only product audit

- Status: Accepted
- Date: 2026-08-02

## Context

Persisted planning decisions, reports, permissions, ingestion, and AI mode
changes need an accountable history without storing secrets or hidden prompts.

## Decision

Record append-only audit events with actor, request ID, action, object reference,
timestamp, and redacted metadata. Application roles may read according to policy
but cannot update events. Corrections are new events, not edits.

## Consequences

Important actions are traceable. Audit metadata must remain intentionally small,
and database privileges must prevent ordinary mutation.

## Alternatives

- General application logs were rejected because they are not durable business
  history.
- Full request/prompt capture was rejected for privacy and secret exposure.

## Implementation status

Contract-ready. Audit behavior and redaction are exercised by `check:audit`;
retention policy remains an organizational decision.

## Deferred work

External SIEM export, cryptographic sealing, legal hold, and final retention
periods are deferred.
