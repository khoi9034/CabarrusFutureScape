# Enterprise Migration Readiness

## Stable contracts

The current FastAPI OpenAPI document is the compatibility baseline. Presentation
domains expose typed filters, pagination where applicable, structured errors,
provenance, and health/readiness endpoints. A future `/api/v1` router may be
introduced behind compatibility routes; current frontend URLs should not be
broken solely for versioning.

Recommended hosting order:

1. Health/readiness and parcels
2. Planning intelligence and map overlays
3. Economics intelligence and governed exports
4. Ask CFS context/search
5. Reports and persistent investment workflows

## Database sequence

1. Inventory schemas, extensions, roles, row counts, SRIDs, and source dates.
2. Restore to managed PostgreSQL/PostGIS in a private network.
3. Run read-only readiness and API contract checks.
4. Point a staging API at the managed database using managed identity or a
   secret store.
5. Compare local and staging contract snapshots and representative records.
6. Schedule source pipelines with audit IDs and freshness alerts.
7. Cut over the API provider; do not expose raw tables.

## Identity and authorization

Local development keeps `CFS_API_AUTH_MODE=off`. Enterprise mode activates the
existing Entra/OIDC boundary.

| Role | Typical permission |
| --- | --- |
| Viewer | Authenticated read |
| Planner | Planning read and governed snapshots |
| Analyst | Economics, scenarios, and exports |
| Report Author | Governed report creation |
| Data Steward | Data-quality and pipeline administration |
| Administrator | Identity, role, and service administration |

The public demo remains anonymous and read-only/session-only. Persistent writes
require authentication and role checks. Broad multi-tenancy is intentionally
deferred until an organization requires it.

## Observability

Use request IDs and privacy-safe events for API readiness, provider selection,
failed domains, Ask CFS mode/fallback, Power BI export, map renderer/retry, and
report generation. Do not log prompts with private fields, owner/contact data,
credentials, connection strings, or tokens. Telemetry remains disabled locally
unless configured.

## Deferred work

No managed database, hosted API, identity tenant, Power BI Service workspace,
pipeline scheduler, or monitoring resource is provisioned. Those require an
organization, security owner, retention policy, network design, and budget.
