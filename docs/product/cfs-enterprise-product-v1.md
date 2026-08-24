# Cabarrus FutureScape Enterprise Product V1

## Purpose

Enterprise Product V1 is a single-organization foundation for durable planning
work, governed APIs, authorization, audit, controlled ingestion, and portable
deployment. It reuses the same Planning, Economics, and Master Data workspaces,
their shared Ask CFS intelligence layer, and the same Power BI and GIS domain
services used by the Demo and Local runtime modes.

Ask CFS is embedded across the three workspaces; it is not a fourth runtime
product or a route around workspace permissions and data governance.

It is not a production deployment and does not provision cloud resources.

## Runtime products

| Mode | Data | Identity | Persistence | Status |
| --- | --- | --- | --- | --- |
| Demo | Sanitized same-origin static assets | Off | Labeled browser session only | Standalone browser-session behavior |
| Local | FastAPI and local PostGIS | Local development principal | Product API and PostgreSQL | API-backed implementation |
| Enterprise | Hosted compatible API and managed PostGIS | OIDC principal | Authenticated organization/project records | API/OIDC contract; infrastructure is not provisioned here |

Runtime mode never silently substitutes demo business data after a local or
enterprise failure. Static geographic context remains the documented exception.

## Frontend persistence matrix

Each cell names the persistence provider and source of truth, API route and
permission, refresh behavior, failure behavior, and audit behavior.

| Capability | Demo | Local | Enterprise |
| --- | --- | --- | --- |
| Planning Snapshots | **Provider/source:** demo repository in `sessionStorage`; the browser session is authoritative. **Route/permission:** no Product API or server permission. **Refresh:** reloads within the same tab session; a new session may reset work. **Failure:** reports session-storage failure and does not call the Product API. **Audit:** none. | **Provider/source:** API repository and PostgreSQL; the server record is authoritative. **Route/permission:** `/api/v1/planning/snapshots`; `data:read` to read and `planning:write` to mutate. **Refresh:** reloads from the API after browser or owned-service restart. **Failure:** remains visibly unsaved; no browser-storage fallback. **Audit:** create, update, version, and archive mutations append Product V1 events. | **Provider/source:** the same API repository and hosted compatible PostgreSQL; the authenticated organization record is authoritative. **Route/permission:** the Local route and permissions with an OIDC principal. **Refresh:** reloads from the API. **Failure:** permission, conflict, and availability errors remain visible and unsaved. **Audit:** the same mutation events identify the authenticated principal. |
| Planning report drafts | **Provider/source:** demo report repository in `sessionStorage`; the browser session is authoritative. **Route/permission:** no Product API or server permission. **Refresh:** reloads within the same tab session. **Failure:** reports session-storage failure. **Audit:** none. | **Provider/source:** API report repository and PostgreSQL. **Route/permission:** `/api/v1/reports`; `data:read` to read and `reports:write` to mutate. **Refresh:** reloads from the API after browser or owned-service restart. **Failure:** remains visibly unsaved; no browser-storage fallback. **Audit:** create, update, and archive mutations append Product V1 events. | **Provider/source:** the same API report repository and hosted compatible PostgreSQL. **Route/permission:** the Local route and permissions with OIDC organization scope. **Refresh:** reloads from the API. **Failure:** permission, conflict, and availability errors remain visible and unsaved. **Audit:** the same mutation events identify the authenticated principal. |
| Economics scenarios | **Provider/source:** demo repository in `sessionStorage`; the browser session is authoritative. **Route/permission:** no Product API or server permission. **Refresh:** reloads within the same tab session. **Failure:** reports session-storage failure. **Audit:** none. | **Provider/source:** API repository and PostgreSQL; server assumptions, output snapshot, notes, and versions are authoritative. **Route/permission:** `/api/v1/economics/scenarios`; `data:read` to read and `economics:write` to mutate. **Refresh:** reloads from the API after browser or owned-service restart. **Failure:** remains visibly unsaved; no browser-storage fallback. **Audit:** create, update, version, and archive mutations append Product V1 events. | **Provider/source:** the same API repository and hosted compatible PostgreSQL. **Route/permission:** the Local route and permissions with an OIDC principal. **Refresh:** reloads from the API. **Failure:** permission, conflict, and availability errors remain visible and unsaved. **Audit:** the same mutation events identify the authenticated principal. |
| Shared Report Bucket | **Provider/source:** demo repository in `sessionStorage`; the browser session is authoritative. **Route/permission:** no Product API or server permission. **Refresh:** reloads within the same tab session. **Failure:** reports session-storage failure. **Audit:** none. | **Provider/source:** shared API repository and PostgreSQL for Economics. Planning report drafts use `/api/v1/reports` instead. **Route/permission:** `/api/v1/reports/bucket`; `data:read` to read and `reports:write` to mutate. **Refresh:** reloads from the API after browser or owned-service restart. **Failure:** remains visibly unsaved; no browser-storage fallback. **Audit:** create, update, and archive mutations append Product V1 events. | **Provider/source:** the same shared API repository and hosted compatible PostgreSQL. **Route/permission:** the Local route and permissions with OIDC organization scope. **Refresh:** reloads from the API. **Failure:** permission, conflict, and availability errors remain visible and unsaved. **Audit:** the same mutation events identify the authenticated principal. |
| Shared Ask CFS conversations | **Provider/source:** deterministic Ask CFS behavior plus the demo conversation repository in `sessionStorage`; the browser session is authoritative. **Route/permission:** no Product V1 writes or server permission. **Refresh:** safe summaries reload within the same tab session. **Failure:** reports session-storage failure. **Audit:** none. | **Provider/source:** `/ai/search` remains the answer engine; the Product API and PostgreSQL are authoritative for safe conversation/message metadata. **Route/permission:** `/api/v1/ask-cfs/conversations`; `data:read` to list/read and `ask_cfs:use` to create, message, reset, or archive. **Refresh:** reloads safe messages from the API. **Failure:** remains visibly unsaved; no demo fallback. **Audit:** conversation mutations, safe messages, and resets append Product V1 events. | **Provider/source:** the same split with OIDC identity and hosted compatible PostgreSQL. **Route/permission:** the Local routes and permissions with user and organization scope. **Refresh:** reloads from the API. **Failure:** permission and availability errors remain visible and unsaved. **Audit:** the same events identify the authenticated principal. `retention_until` is stored metadata; automatic retention enforcement is not implemented. |

Local and Enterprise Product-record browser storage is limited to transient UI
preferences or unsaved component state; authentication session state is separate.
A failed API write remains visibly unsaved; it never
falls back to a browser record or displays a false success. Mutations use
server permissions, optimistic concurrency where supported, request IDs, and
append-only audit events. Legacy browser Planning Snapshots are left local and
are not uploaded without an explicit future import workflow.

## Product V1 capabilities

- Stable `/api/v1` product contracts alongside existing routes.
- Explicit principals, six fixed roles, route and object authorization.
- Projects and versioned work across Planning and Economics.
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
- Enterprise writes require authenticated permission and organization scope;
  non-administrators also require project access for project-owned records.
- Product JSON and audit events recursively redact sensitive keys and labeled
  credential, token, API-key, hidden-prompt, and secret text patterns. This is
  a bounded safeguard, not a content-classification guarantee for arbitrary
  unlabeled sensitive prose.
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
