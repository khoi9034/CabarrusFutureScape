# Cabarrus Insights V1 production-readiness audit

Audited 2026-10-01 on `product/cfs-ask-docked-panel-v1`. “Ready” below means
verified for the governed local/internal presentation profile; it does not mean
County-hosted production has been approved.

## Decision

**READY WITH DOCUMENTED BLOCKERS.** The application, local PostGIS data,
startup/stop tooling, core workflows, deterministic Ask Insights, and focused
tests are ready for internal handoff. The `enterprise` contract fails closed,
but the County-hosted runtime is not operational until the deployment owner
supplies the infrastructure and policy items listed below.

## Audit matrix

| Area | Classification | Evidence / limitation |
| --- | --- | --- |
| Next.js frontend | READY | Production build, typecheck, browser smoke, and runtime-mode validation pass. |
| FastAPI backend | READY | Health/readiness, bounded errors, typed routes, and focused tests pass locally. |
| PostgreSQL/PostGIS | READY WITH LIMITATION | `cfs_dev` and core relations pass; hosted production database and least-privilege roles are deployment work. |
| Environment configuration | READY | Browser/server templates contain placeholders only; invalid runtime matrices fail at startup. |
| Authentication | READY WITH LIMITATION | Local-dev principal and OIDC validation boundary exist; County Entra registration, groups, MFA/conditional access, and emergency-account policy remain external. |
| Authorization/audit | READY WITH LIMITATION | Route permissions and append-only audit contracts are tested; final County role assignments/retention remain policy decisions. |
| Management | READY | Period-bound observed KPIs, freshness, handoff, and fallback behavior use governed APIs. |
| Analyst/map | READY WITH LIMITATION | Same-origin fallback and approved layers work; optional public tiles/EagleView depend on approved external services. |
| Master Data | READY WITH LIMITATION | Governed preview/filter/join/export permissions exist; data-steward production roles and large-export gateway limits require deployment configuration. |
| Planning Files/Snapshots | READY WITH LIMITATION | Local PostGIS persistence and legacy compatibility are verified; object storage is not implemented for enterprise mode. |
| Ask Insights/GIS Agent | READY | Fixed tools, read-only analysis, expiring handles, deterministic fallback, provenance, and explicit save flow are tested. OpenAI is optional. |
| ArcGIS assets/basemap | READY WITH LIMITATION | SDK assets are same-origin; OpenFreeMap is optional and same-origin fallback remains. |
| Ingestion/refresh | READY WITH LIMITATION | Permit refresh Phase 1 stages, validates, transactionally publishes, preserves last-known-good, and invalidates caches. Other datasets remain later phases. |
| Local/public demo | READY | Local is PostGIS-backed/frozen; public demo is sanitized/static and backend-independent. |
| Internal-production runtime | NOT PRODUCTION READY | Contract exists, but object storage, external job runner, County identity, production database, monitoring, TLS/DNS, and operations ownership are not provisioned here. |
| Backup/restore | READY WITH LIMITATION | Guarded local backup command and restore runbook exist; no approved schedule, retention, off-host copy, RPO/RTO, or completed isolated restore drill. |
| Logging/error handling | READY WITH LIMITATION | Safe local startup/backend/refresh logs and user-safe errors exist; centralized monitoring/SIEM, retention, and alert routing remain external. |
| Secrets | READY WITH LIMITATION | No verified real secret is tracked; ignored local provider configuration exists and must be rotated/managed under County policy before handoff. |
| Tests/build | READY | Focused backend, auth, Ask/GIS, parcel, Master Data, Planning Files, typecheck, build, and smoke gates are the release evidence. |
| Future ideas | FUTURE | Case Review, Development Pipeline, Parcel Review Package, EagleView production integration, richer school/utility data, alerts, reports, and mobility modeling. |

## Verified local data posture

`npm.cmd run check:local-data` reports Planning, Addresses, Development, Flood,
Economics, Transportation, Development Signals, Snapshots, and WSACC available.
Schools are available with the explicit official-capacity limitation; WSACC is
available as infrastructure/proximity context, not capacity confirmation.

Source dates are governed metadata, not promises of real-time currency. Run the
readiness command at each release and see `docs/DATA_SOURCES.md`.

## Security conclusions

- Enterprise mode requires `enterprise_api`, `oidc`, `object_storage`, an
  external worker, tenant/audience/organization identifiers, and exact HTTPS
  CORS origins. Missing values fail startup.
- Database/provider/identity secrets remain server-side; `NEXT_PUBLIC_*` is
  browser-safe configuration only.
- Ask Insights exposes no arbitrary SQL, code execution, URL fetch, source edit,
  or destructive tool. Temporary result handles expire; persistent saves use
  the existing authorized route.
- Product authorization is enforced at FastAPI routes; UI visibility is not the
  security boundary.
- The current scan found no tracked private-key block, GitHub token, AWS access
  key, or verified provider credential. Pattern candidates were examples,
  tests, CSS/text identifiers, or placeholders. `.env.local` and `backend.env`
  are ignored and untracked; their values were not printed.

## Deployment blockers

Before anyone labels the system County-production-ready, an accountable County
owner must complete and approve:

1. supported VM/container platform, production Next.js/FastAPI topology, DNS,
   TLS, firewall rules, patching, and capacity;
2. managed PostGIS target, least-privilege app/migration roles, encryption,
   backup retention, off-host copy, RPO/RTO, and an isolated restore drill;
3. Entra/OIDC app registrations, group-to-role assignments, MFA/conditional
   access, emergency access, and identity lifecycle;
4. approved server secret store and rotation for database, OpenAI, EagleView,
   staging, and identity configuration;
5. object-storage and external-worker implementations required by enterprise
   mode, or an approved ADR changing that contract;
6. scheduled permit refresh, alerting, source-owner SLAs, and reviewed workers
   for any additional live datasets;
7. centralized logs/metrics/alerts, audit retention, incident response,
   vulnerability scanning, penetration review, and support ownership;
8. privacy/data classification and export approval for production users.

No deployment, merge, release tag, or model retraining is performed by this
handoff audit. `v1.0.0-internal` is a reasonable future tag only after the
blockers appropriate to the intended host are accepted; do not create it
without explicit approval.
