# CFS Runtime Modes

## Canonical settings

```text
CFS_RUNTIME_MODE=demo | local | enterprise
CFS_DATA_PROVIDER=static | local_api | enterprise_api
CFS_AUTH_MODE=off | local_dev | oidc
CFS_AI_PROVIDER=none | openai
CFS_ARTIFACT_PROVIDER=public_static | local_file | object_storage
CFS_JOB_PROVIDER=inline | external_worker
```

Browser-safe settings use matching `NEXT_PUBLIC_CFS_*` names where a value is
needed by the frontend. Invalid combinations fail configuration validation.

Compatibility remains explicit: `NEXT_PUBLIC_CFS_DEPLOYMENT_MODE=demo|live`,
`NEXT_PUBLIC_USE_BACKEND_API`, `local_postgis`, `enterprise_service`, and the
legacy `CFS_API_AUTH_MODE=off|entra` map to canonical values. Deprecated `auto`
never enables demo business data after an API failure.

## Demo

- Provider: `static`
- Static same-origin JSON, GeoJSON, CSV, ZIP, and deterministic browser services
- No backend, private data, or provider key
- UI label: `Portfolio Demo`
- Session-only writes are labeled and remain in browser session storage

## Local Live

- Provider: `local_api` through FastAPI to local PostGIS
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

Enterprise requires `enterprise_api`, `oidc`, the OIDC tenant/API audience, and
a provisioned `CFS_ORGANIZATION_ID`; it must not silently permit anonymous or
organization-less writes. Object storage and external workers remain unhealthy
contract adapters until implemented by an approved deployment. The
enterprise-local Compose reference intentionally runs `local` + `local_api` +
`local_dev`.

## Diagnostics

The browser keeps the last 200 non-private adapter events in
`window.__cfsDataProvenance`. Each event contains runtime mode, domain, dataset
path, origin, and timestamp. `npm run check:data-provenance` verifies the mode
guards and local/demo export boundaries. A separate bounded
`window.__cfsTechnicalEvents` buffer records privacy-safe readiness, adapter,
Ask CFS mode/fallback, Power BI export, map renderer/fallback/retry, failed
domain, and report-generation events without sending telemetry off-device.
