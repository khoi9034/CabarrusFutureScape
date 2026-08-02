# ADR 0002: Canonical runtime modes

- Status: Accepted
- Date: 2026-08-02

## Context

The standalone demo, local PostGIS product, and future hosted product must share
domain services without silently crossing data or write boundaries.

## Decision

Use `demo`, `local`, and `enterprise` as canonical runtime modes with explicit
data, authentication, AI, artifact, and job providers. Invalid combinations
fail during configuration validation. Existing public variables remain mapped
for compatibility. See [runtime modes](../runtime-modes.md).

## Consequences

Demo stays static and session-only; local uses the API and local persistence;
enterprise requires an authenticated API configuration. Provider choice is
visible and testable instead of inferred from a failed request.

## Alternatives

- Automatic fallback from live data to demo rows was rejected as misleading.
- Separate application builds were rejected because they duplicate domain logic.

## Implementation status

The three-mode architecture is implemented in existing provider boundaries.
Strict Product V1 validation is exercised by `check:runtime-config`; this ADR
does not claim a particular local run result.

## Deferred work

Hosted environment values, secret-store integration, and organization-specific
policy are deferred until a deployment is approved.
