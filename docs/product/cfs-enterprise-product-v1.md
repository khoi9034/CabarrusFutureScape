# Cabarrus FutureScape Enterprise Product V1

## Purpose

Enterprise Product V1 is a single-organization foundation for durable planning
work, governed APIs, authorization, audit, controlled ingestion, and portable
deployment. It reuses the same Planning, Economics, Investments, Ask CFS, Power
BI, and GIS domain services used by the standalone demo and local product.

It is not a production deployment and does not provision cloud resources.

## Runtime products

| Mode | Data | Identity | Persistence | Status |
| --- | --- | --- | --- | --- |
| Demo | Sanitized same-origin static assets | Off | Labeled browser session only | Implemented foundation |
| Local | FastAPI and local PostGIS | Local development principal | Product API and PostgreSQL | Product V1 target |
| Enterprise | Hosted compatible API and managed PostGIS | OIDC principal | Authenticated organization/project records | Contract-ready |

Runtime mode never silently substitutes demo business data after a local or
enterprise failure. Static geographic context remains the documented exception.

## Product V1 capabilities

- Stable `/api/v1` product contracts alongside existing routes.
- Explicit principals, six fixed roles, route and object authorization.
- Projects and versioned work across Planning, Economics, and Investments.
- Safe Ask CFS conversation metadata and summaries without hidden prompts.
- Append-only, redacted audit events.
- Persistent source registry, ingestion runs, and data-quality results.
- Artifact metadata and provider-neutral storage.
- Durable background-job records with inline local execution.
- Restrained Data Administration visibility with no destructive UI actions.
- Reviewable migrations, non-root containers, and sanitized CI contracts.

## Product boundaries

- Raw authoritative datasets stay outside product-work tables.
- Public demo writes never call enterprise write APIs.
- Enterprise writes require authenticated permission and object ownership.
- No secrets, hidden prompts, or raw private source payloads are persisted in
  product metadata, audit, jobs, or conversations.
- Existing CASE artifacts remain unchanged and are referenced by metadata.
- The internal development model remains governed and aggregate-only.

## Status vocabulary

- **Implemented**: executable code or configuration exists on this branch.
- **Locally verified**: a named check was actually run and recorded in the
  implementation report.
- **Contract-ready**: interface and behavior are defined without provisioned
  infrastructure.
- **Deferred**: requires an approved organization, service, policy, or measured
  workload.

This document does not claim check results. See the branch implementation report
for commands and evidence.

## Related decisions

- [Runtime modes](../architecture/decisions/0002-runtime-modes.md)
- [Repository boundaries](../architecture/decisions/0003-data-repository-boundaries.md)
- [Persistence](../architecture/decisions/0009-persistence.md)
- [Deployment](../architecture/decisions/0013-deployment.md)
