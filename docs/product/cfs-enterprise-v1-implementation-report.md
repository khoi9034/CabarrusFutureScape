# Cabarrus FutureScape Enterprise Product V1 Implementation Report

- Status date: 2026-08-02
- Branch: product/cfs-enterprise-v1
- Base commit: a2749492d90dd934cc171c9d475f3e228cbe1ec1
- Initial branch-guard commit: e5d7232e1403cac889092107f62a5901a2b51b7b

## Executive status

Enterprise Product V1 is implemented and locally verified as a
single-organization foundation. It adds governed product persistence,
versioned APIs, identity and authorization boundaries, append-only audit,
source and ingestion governance, data-quality records, artifact and job
provider contracts, administration visibility, migration tooling,
containers, CI, security documentation, and acceptance checks.

This branch is not a production deployment. No cloud resource, identity
registration, production database, production object store, worker,
monitoring service, backup service, deployment, merge, or release tag was
created or changed.

## Status by capability

| Capability | Status | Evidence |
| --- | --- | --- |
| Runtime modes and providers | Implemented; locally verified | One validated demo/local/enterprise matrix, legacy aliases, fail-early backend and frontend checks, and check:runtime-config. |
| Database migrations | Implemented; locally verified | Revision 0001_product_v1, version table, upgrade/status/check/rollback-one commands, immutable audit and ingestion triggers, and disposable PostgreSQL schema tests. |
| Product model | Implemented; locally verified | 21 Product V1 tables with stable IDs, ownership, foreign keys, indexes, timestamps, version records, and no copied authoritative datasets. |
| Product persistence | Implemented; locally verified | Planning, Economics, Investments workflow records, reports, safe Ask CFS conversation state, source governance, artifacts, jobs, and audit through shared SQLAlchemy services. |
| API V1 | Implemented; locally verified | /api/v1 health, principal, product resources, Ask CFS, data sources, ingestion, artifacts, jobs, audit, and administration; existing routes remain mounted. |
| Authentication and roles | Implemented; locally verified | Off/local_dev/oidc adapters, persisted users, organization context, and six fixed roles. Enterprise writes cannot run anonymously. |
| Authorization | Implemented; locally verified | Explicit route permissions, organization/object checks, persisted-role enforcement, denial audit, and local/OIDC next-request demotion coverage. |
| Audit | Implemented; locally verified | Append-only redacted events for mutations, versions, archive, report/artifact, ingestion, denial, jobs, and role changes. |
| Source registry | Implemented; locally verified | Governed registry CRUD/status/export, scoped administration summary, Data & Methods exposure, and evidence links for Product contexts and reports. |
| Ingestion and quality | Implemented; locally verified | Adapter-stage-validate-dry-run-explicit-apply boundary, checksum/schema/SRID/geometry/duplicate/null/reconciliation/freshness rules, immutable runs, and stored results. |
| Artifact storage | Local implementation; future contract-ready | Atomic local writes with root guard, read-only public-static access, metadata/checksum/policy tracking, and object-storage contract. |
| Background jobs | Local implementation; future contract-ready | Durable job state, global idempotency key, bounded attempts, inline local provider, and external-worker contract. |
| Administration | Implemented; locally verified | Read-only demo view plus permission-controlled local/enterprise source, ingestion, migration, job, audit, and user-role views. No destructive UI controls. |
| Containers and CI | Contract/static checks locally verified | Non-root frontend/backend images, health checks, explicit ports, enterprise-local Compose reference, and no-deploy PostgreSQL/PostGIS GitHub Actions validation. |
| Enterprise cloud operations | Deferred | Managed hosting/PostGIS, Entra registration, object storage, external worker, monitoring, backups, restore drills, and organization onboarding require approved infrastructure and policy. |

## Runtime and security boundaries

- Demo remains standalone, uses same-origin sanitized assets, keeps writes in
  labeled session storage, and does not call Product V1 write APIs.
- Local uses FastAPI, local PostgreSQL/PostGIS, a local-development principal,
  durable Product V1 records, and audit events.
- Enterprise requires an authenticated OIDC principal, an organization, exact
  HTTPS CORS origins, enterprise providers, and authorized API writes.
- Persisted user roles override stale token or environment roles on every
  Product V1 request. Inactive, ambiguous, and cross-organization user
  mappings are denied.
- Sensitive keys and values are recursively redacted before Product JSON or
  audit persistence. Hidden prompts, tokens, credentials, and API keys are
  covered by tests.
- Public-static artifacts are read-only. Local artifact paths are constrained
  to the configured root, downloads require policy and authorization, and
  writes use staging/finalization with compensation.
- Product APIs use validated schemas and SQLAlchemy-bound values. Exact HTTPS
  CORS configuration rejects wildcards, HTTP, loopback hosts, credentials,
  paths, queries, and fragments in enterprise mode.

## Migrations and data ownership

Revision 0001_product_v1 creates:

- organizations, users, user_preferences
- projects, project_members, project_workflow_states
- planning_snapshots, planning_snapshot_versions
- economic_scenarios, economic_scenario_versions
- property_reviews
- reports, report_bucket_items
- ask_cfs_conversations, ask_cfs_messages
- data_sources, ingestion_runs, data_quality_results
- artifacts, audit_events, background_jobs

Existing investment_engagement, investment_saved_search,
investment_candidate_intake, investment_saved_item, and
investment_underwriting_scenario tables remain authoritative equivalents.
Product V1 does not duplicate them or silently synchronize them. Tests run in
disposable schemas and do not rebuild, drop, or migrate canonical cfs_dev
source tables.

## API and workflow implementation

The /api/v1 router standardizes request IDs, timestamps, validation errors,
pagination, filtering, sorting, conflicts, provenance, principal context, and
authorization. Product resources support create/reopen/version/archive
workflows for Planning and Economics, governed Investment lifecycle
integration, report metadata and buckets, safe Ask CFS conversation
metadata/messages/reset, source governance, ingestion runs, artifact
downloads, background jobs, audit reads, and restrained administration.

The compatibility boundary is deliberate: existing unversioned local product
routes remain available, while enterprise mutations through legacy
Investment compatibility routes are rejected. No raw database table is
exposed.

## Verification evidence

The completed branch verification included:

- Python compileall: passed.
- Full backend suite: 417 passed, 204 skipped, 2 warnings.
- Product V1 suite: 63 passed against SQLite fixtures and again against an
  isolated schema in local PostgreSQL/PostGIS; zero Product test schemas
  remained afterward.
- TypeScript typecheck, ESLint, and production webpack build: passed.
- Production build: Next.js 16.2.6 with ArcGIS 5.0.19; 10,964 ArcGIS asset
  files totaling 44,951,889 bytes were included.
- Runtime, API contract, migration, persistence, authorization, audit,
  ingestion, container-contract, and Product V1 orchestrator checks: passed.
- Existing acceptance, demo functionality, demo interactions, presentation,
  data provenance, enterprise readiness, Product hardening, Ask CFS, Power
  BI, production map, map resilience, interactive map, local data, local APIs, local
  interactions, and local presentation checks: passed.
- Local API regression: 192/192 endpoint cases, 332 OpenAPI paths, and zero
  cleanup failures.
- Ask CFS regression: 125/125.
- Interactive map regression: all 30 cases, including desktop/mobile/slow
  network/external-service-blocked sessions and forced WebGL fallback.
- Public production-map acceptance: 30/30 cases across 22 sessions (10
  desktop, 5 mobile, 3 slow, 3 external-service-blocked, and 1 forced WebGL);
  all normal sessions used ArcGIS, 10,964 same-origin SDK assets had zero
  404s, and only the forced WebGL session used the emergency fallback.
- Browser QA for Data Administration: desktop and 390-pixel mobile views,
  zero console errors, and no horizontal document overflow after correction.
- Container and Compose contracts: passed. An actual local Docker image build
  was not claimed because the installed Linux Docker daemon was not running;
  CI is configured to build both images.

No hosted database was used. The ambient hosted DATABASE_URL was deliberately
ignored; PostgreSQL verification used only localhost:5433/cfs_dev and
disposable schemas.

## Soak

The mandatory unshortened Product V1 soak passed:

- 3,116 seconds of active soak time
- 17 health rounds
- persisted Planning work and Economics scenarios
- disposable Investment lifecycle and cleanup
- Ask CFS and Power BI checks
- interactive map, authorization, audit, ingestion dry run, and artifact
  download checks
- frontend and backend restart verification
- archival cleanup of disposable Product history and deletion of exact legacy
  Investment records; no active soak records remained
- unchanged protected-file hashes and canonical relation counts

The full command completed successfully in 3,780.5 seconds, including setup,
regression, restart, cleanup, and teardown.

## Preservation

The branch guard began from a2749492d90dd934cc171c9d475f3e228cbe1ec1,
and main and origin/main remained at that commit throughout implementation.
The protected output summaries and production-map image remain unmodified by
this work, unstaged, and uncommitted. CASE-1 values, the workbook, PowerPoint,
nine CASE artifacts, raw/canonical data, the public release tag, and the
interactive GIS runtime architecture were not changed. The production site
was not deployed.

## Known limits and deferred work

- FutureObjectStorageArtifactStore and ExternalWorkerJobProvider are contracts,
  not live cloud adapters.
- OIDC support is implemented at the application boundary; Entra application
  registration, referrer/redirect policy, conditional access, and tenant
  administration are deferred.
- Runtime configuration remains deployment-managed; the administration page
  intentionally has no configuration mutation controls.
- Controlled ingestion apply fails closed unless an approved domain adapter
  is supplied. There is no automatic scheduling or unreviewed overwrite.
- Geometry validation checks structure and expected SRID; it is not a
  topology-repair or full RFC conformance engine.
- Source evidence is connected to Product contexts, reports, registry export,
  and Data & Methods, but not retrofitted into every legacy export or
  conversation implementation.
- Application request limits enforce declared Content-Length. The eventual
  gateway must also cap chunked bodies and provide rate limiting.
- Backup/restore objectives, restore drills, monitoring thresholds, managed
  deployment, and first-organization onboarding remain operational work.
- Preservation evidence covers protected/CASE hashes and canonical relation
  counts; it is not a byte-for-byte hash of all database contents.

## Review and merge

Review the logical commits and run npm run check:product-v1 first. For full
acceptance, provide a disposable PostgreSQL/PostGIS test target and run the
documented regression and soak commands. Merge only after human review and
approved infrastructure/security decisions. Do not deploy this branch merely
because its local foundation checks pass.
