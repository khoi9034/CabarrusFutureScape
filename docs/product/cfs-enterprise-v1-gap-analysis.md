# Cabarrus FutureScape Enterprise Product V1 Gap Analysis

> **Retired historical reference:** The Investments product and CASE-1 workflow are retired and are not part of the active Demo, Local, Enterprise, acceptance, or deployment surface. This document is retained only as historical design or evidence and must not be used as an operating runbook.

- Status date: 2026-08-02
- Baseline: `a2749492d90dd934cc171c9d475f3e228cbe1ec1`
- Assessment rule: documentation and future-facing configuration are not counted as implementation.

## Classification

| Capability | Baseline status | Evidence and Product V1 gap |
| --- | --- | --- |
| Runtime modes | Partial | The frontend distinguished demo/local/enterprise and the backend distinguished local/enterprise, but accepted different provider names and silently normalized invalid frontend values. Artifact and job providers were absent. Product V1 needs one validated matrix with legacy aliases. |
| Repository adapters | Partial | Typed frontend clients, FastAPI services, injected SQLAlchemy sessions, and parcel/development repositories are reusable. Several Investment services still combine persistence and request-time table creation. Product V1 needs schema ownership and shared identity/audit boundaries, not another domain stack. |
| API versioning | Missing | Only unversioned FastAPI routers were mounted. Product V1 needs `/api/v1` compatibility routes plus stable product-resource contracts while preserving current paths. |
| Database migrations | Missing | SQL pipeline files are data-build scripts, not application migrations. Several Investment services run `CREATE TABLE IF NOT EXISTS` on demand. There was no application version table, reviewed upgrade, status, compatibility check, or guarded rollback. |
| User model | Partial | JWT claims produced an in-memory object ID, roles, and scopes. No organization, persisted user, preferences, memberships, or local-development principal existed. |
| Authentication | Partial | Entra JWT/JWKS validation and an MSAL browser adapter existed. Naming was `entra`, not canonical `oidc`; no `local_dev` principal existed; enterprise mode could be configured with authentication off. |
| Permissions | Partial | Coarse public/read/write/admin path classification existed for selected routes. It did not cover Product V1 roles, versioned paths, per-route permissions, or organization/object ownership. Dashboard personas are presentation presets and are not security roles. |
| Audit | Missing | Technical browser events and telemetry existed, but there was no durable append-only audit record, sensitive-field redaction policy, or mutation/denial history. |
| Persistence | Partial | Investment saved items, recent work, saved searches, engagements, intake, and underwriting used PostgreSQL. Planning snapshots remained browser storage; Economics product scenarios/report buckets and Ask CFS conversations were not durable. |
| Planning Snapshots | Partial | The UI had a validated snapshot shape, map capture, browser save/reopen/version-like behavior, and print output. It lacked server ownership, immutable versions, review state, and audit. |
| Economics scenarios | Partial | Scenario controls, deterministic outputs, comparisons, exports, and report views existed. Product scenario records, versions, project ownership, notes, and audit were missing. |
| Investments projects | Partial | `investment_engagement` and related services covered much of a project workflow; saved searches, shortlist-like items, candidates, underwriting, reports, and CASE artifacts existed. Organization ownership, canonical migrations, workflow history, and consistent audit were missing. |
| Reports | Partial | Planning/Investment report generation and Power BI exports existed, but report metadata, report-bucket records, artifact policy, versions, and download audit were incomplete. |
| Ask CFS conversations | Partial | Grounded deterministic/provider behavior, prompt registry, safety checks, scoped UI history, and fallback metadata existed. Stable conversations/messages, retention/reset records, organization context, and audit were missing. |
| Source registry | Partial | Rich static frontend metadata and Investment source metadata existed. There was no persistent governed registry with authority, stewardship, dates, refresh expectations, licensing, limitations, and lifecycle status. |
| Ingestion | Partial | Domain pipelines already supplied parsing, dry runs, checksums in places, geometry checks, and reconciliation logic. There was no uniform adapter-stage-validate-dry-run-explicit-apply boundary or immutable run history. |
| Data quality | Partial | Extensive domain-specific validation existed for parcels, permits, flood, schools, economics, WSACC, and CASE artifacts. Results were not represented by one persistent governed result model. |
| Artifact storage | Partial | Static public files, generated CASE downloads, and a closed download allowlist existed. There was no provider-neutral store, durable metadata, sensitivity/download policy, local root guard, or future object-storage contract. |
| Background jobs | Missing | There was no durable job/idempotency/retry model, inline provider boundary, or external-worker contract. |
| Containers | Partial | A non-root backend image and strong ignore rules existed. The frontend image, health checks, enterprise-local Compose reference, and container contract check were missing. |
| CI | Missing | The only workflow deployed the backend from `main`; no no-deploy Product V1 validation workflow or sanitized isolated database suite existed. |
| Operations | Partial | Local start/stop and presentation scripts plus Azure design notes existed. Enterprise configuration, migration, ingestion, artifact, job, audit, incident, and onboarding procedures were incomplete. |
| Backup/recovery | Contract only | Azure notes referenced managed backup concepts, but no Product V1 backup ownership, restore drill, recovery objective, or verified recovery procedure existed. |
| Organization onboarding | Missing | No organization bootstrap, first-administrator, role assignment, source stewardship, configuration validation, or go-live checklist existed. |

## Reuse map

- Keep FastAPI routers/services and typed frontend clients as the domain boundary.
- Reuse the existing Entra/MSAL implementation as the OIDC adapter.
- Reconcile `investment_engagement`, `investment_saved_search`, `investment_saved_item`, `investment_candidate_intake`, and `investment_underwriting_scenario` with Product V1 concepts; do not copy CASE records or authoritative datasets into product-work tables.
- Keep demo data static and demo writes session-only. Keep local analytical reads on the existing PostGIS repositories.
- Put identity, authorization, product persistence, audit, ingestion governance, artifacts, and jobs around the shared services rather than forking Planning, Economics, Investments, or Ask CFS.

## Highest-risk gaps

1. Backend tests inherited live `cfs_dev` credentials, and three dry-run subprocesses wrote canonical output summaries. Test isolation must be fixed before regression.
2. Request-time DDL made schema ownership implicit and unreviewable. Product V1 tables need explicit reviewed migrations with a guarded rollback.
3. Path-only authorization would under-protect new and versioned writes. Every Product V1 route needs explicit permission metadata and object organization checks.
4. Browser-only Planning/Economics/Ask state could not meet refresh/reopen/audit requirements outside demo mode.
5. Artifact downloads and ingestion apply operations need narrow allowlists, path guards, permissions, and audit before enterprise use.

## Deliberate V1 boundaries

Single-organization V1 may keep `organization_id` optional for local compatibility, but enterprise requests must resolve an organization. Cloud provisioning, identity registration, object-storage credentials, an external worker, scheduling, automatic ingestion apply, multi-tenant billing, and production deployment remain deferred contracts.
