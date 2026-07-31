# CFS Runtime Modes

## Canonical setting

Use one frontend mode:

```text
NEXT_PUBLIC_CFS_RUNTIME_MODE=demo | local | enterprise
```

The backend uses:

```text
CFS_RUNTIME_MODE=local | enterprise
CFS_DATA_PROVIDER=local_postgis | enterprise_service
CFS_AI_PROVIDER=none | openai
CFS_API_AUTH_MODE=off | entra
```

`NEXT_PUBLIC_CFS_DEPLOYMENT_MODE=demo|live` remains compatible. `demo` maps to
Demo and `live` or the deprecated `auto` value maps to Local Live. `auto` never
enables demo data when the API is missing.

## Demo

- Provider: `sanitized_demo_extract`
- Static same-origin JSON, GeoJSON, CSV, ZIP, and deterministic browser services
- No backend, private data, or provider key
- UI label: `Portfolio Demo`
- Session-only writes are not represented as persistent records

## Local Live

- Provider: `local_postgis` through FastAPI
- Database: local `cfs_dev` PostgreSQL/PostGIS
- UI label: `Live Local Data`
- Ask CFS deterministic baseline; optional backend-only provider enhancement
- Failed business domains return `Local data unavailable`
- Demo business rows are never substituted

Sanitized county boundaries, roads, municipalities, hydrography, and place
labels are the sole static-data exception. They are geographic display context,
not analytical metrics.

## Enterprise

- Provider: a hosted implementation of the current API contracts
- PostGIS-compatible managed database
- Entra/OIDC authentication and role authorization
- External monitoring and scheduled pipelines
- Power BI Service refresh against governed exports

Enterprise mode is a contract and configuration target. No cloud resource is
provisioned by this repository.

## Diagnostics

The browser keeps the last 200 non-private adapter events in
`window.__cfsDataProvenance`. Each event contains runtime mode, domain, dataset
path, origin, and timestamp. `npm run check:data-provenance` verifies the mode
guards and local/demo export boundaries. A separate bounded
`window.__cfsTechnicalEvents` buffer records privacy-safe readiness, adapter,
Ask CFS mode/fallback, Power BI export, map renderer/fallback/retry, failed
domain, and report-generation events without sending telemetry off-device.
