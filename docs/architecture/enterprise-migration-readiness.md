# Enterprise Migration Readiness

## Stable contracts

The current FastAPI OpenAPI document is the compatibility baseline. Existing
routes remain supported while Product V1 adds `/api/v1` compatibility routes.
Presentation domains expose typed filters, pagination where applicable,
structured errors, provenance, request IDs, and health/readiness endpoints.

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

Local development uses `CFS_AUTH_MODE=local_dev`. Enterprise mode requires
`CFS_AUTH_MODE=oidc`; the existing Entra verifier is the first OIDC adapter.

| Role | Typical permission |
| --- | --- |
| Viewer | Authenticated read |
| Planner | Planning read and governed snapshots |
| Analyst | Economics, scenarios, and exports |
| Report Author | Governed report creation |
| Data Steward | Data-quality and pipeline administration |
| Administrator | Identity, role, and service administration |

The public demo remains anonymous and session-only. Persistent writes require
authentication, route permissions, and object ownership checks. Product V1 is
single-organization; broad multi-tenancy is deferred until a second organization
and isolation policy exist.

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
