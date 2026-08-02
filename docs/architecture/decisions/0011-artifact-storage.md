# ADR 0011: Artifact storage providers

- Status: Accepted
- Date: 2026-08-02

## Context

CFS serves approved static CASE artifacts and generates reports, but provider
details must not leak into domain workflows or permit arbitrary file access.

## Decision

Use one ArtifactStore contract with public-static and local-file implementations.
An object-storage implementation remains a contract until infrastructure is
approved. Metadata records checksum, size, content type, sensitivity, creator,
provider key, and download policy. See [artifact storage](../artifact-storage.md).

## Consequences

Downloads can be authorized and audited consistently. Existing CASE files remain
unchanged and are referenced rather than copied into product tables.

## Alternatives

- Database binary storage was rejected for V1.
- Direct caller-selected paths were rejected for traversal and policy risk.

## Implementation status

Partial foundation: CASE downloads use a closed allowlist. Provider-neutral
metadata and stores are Product V1 scope; object storage is contract-only.

## Deferred work

Cloud buckets, signed URLs, malware scanning, lifecycle tiers, and customer
retention rules are deferred.
