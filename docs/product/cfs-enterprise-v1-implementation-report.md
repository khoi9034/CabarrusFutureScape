# Cabarrus FutureScape Enterprise Product V1 Implementation Report

> **Retired historical reference:** The Investments product and CASE-1 workflow are retired and are not part of the active Demo, Local, Enterprise, acceptance, or deployment surface. This document is retained only as historical design or evidence and must not be used as an operating runbook.

- Status date: 2026-08-03
- Branch: `product/cfs-enterprise-v1`
- Stable main base: `a2749492d90dd934cc171c9d475f3e228cbe1ec1`
- Initial branch-guard commit: `e5d7232e1403cac889092107f62a5901a2b51b7b`
- Frontend persistence work began at: `897a809eaea0c6bb833a1d615424022bbfae5d04`
- Final accepted frontend-integration HEAD: **PENDING**

## Executive status

The backend Enterprise Product V1 foundation existed and had lower-level local
verification before this frontend mission. It provides governed persistence,
versioned Product APIs, identity and authorization boundaries, append-only
audit, source and ingestion governance, data-quality records, artifact/job
provider contracts, migration tooling, containers, CI, and security
documentation.

The original frontend verification at `897a809` failed because Planning
Snapshots and Planning report drafts used `localStorage`, the shared Report
Bucket used `sessionStorage`, Economics had no Product scenario library, and
Ask CFS conversation history lived in component memory. Direct API tests did
not prove that normal buttons and forms reached PostgreSQL.

The current source integrates those interfaces through runtime-selected
repositories: Demo remains session-only, while Local/Enterprise select Product
API repositories. A full dirty-working-tree browser run passed the actual UI,
API, database, audit, restart, authorization, Demo-isolation, malformed-record,
and cleanup paths. Because those changes were not yet committed, that report is
development evidence rather than immutable final-head acceptance. A committed
rerun and the unshortened UI-inclusive soak remain required below.

This branch is not a production deployment. No merge or deployment is
authorized by this implementation report.

## Status by capability

| Capability | Status | Evidence boundary |
| --- | --- | --- |
| Runtime modes and providers | Backend foundation previously verified | Validated demo/local/enterprise configuration matrix, legacy aliases, and fail-early checks. Final regression remains pending. |
| Database migrations | Backend foundation previously verified | Revision `0001_product_v1`, version table, explicit upgrade/status/check/rollback-one commands, immutable audit/ingestion triggers, and disposable-schema tests. Final regression remains pending. |
| Product model | Backend foundation previously verified | 21 Product V1 tables with stable IDs, ownership, constraints, timestamps, and version records. |
| Product persistence service | Backend foundation previously verified | SQLAlchemy services for Planning, Economics, reports/bucket, safe Ask CFS history, source governance, artifacts, jobs, and audit. This did not by itself prove UI wiring. |
| Frontend persistence | Working-tree browser pass; final-head acceptance pending | Runtime repositories and actual Planning, Economics, Investments Report Bucket, and Ask CFS controls are wired. The 18-workflow working-tree run passed UI/API/database/restart/archive/audit/cleanup; an immutable committed rerun remains pending. |
| API V1 | Backend foundation previously verified; contract extended | Product health/principal/resources, Ask CFS, data sources, ingestion, artifacts, jobs, audit, and administration. Ask message GET support was added for history restoration. Final contract regression is pending. |
| Authentication and six roles | Backend foundation plus working-tree UI pass | Off/local-development/OIDC adapters, persisted users, organization context, and six fixed roles. Nine simulated-principal/denial browser cases passed; hosted Entra interactive acceptance remains deferred. |
| Authorization | Backend foundation previously verified; UI gates implemented | Server permission and organization/object checks remain authoritative. Non-administrators require project access; Administrators may administer same-organization objects without project membership but cannot cross organizations. Viewer-only reads are limited to approved Product records, except the viewer’s own Ask CFS conversations. |
| Audit | Backend foundation plus working-tree UI-created evidence | Append-only redacted events exist for Product mutations, versions, archives, Ask messages/reset, denial, jobs, ingestion, and role changes. The working-tree browser run verified audit rows for its disposable server records; committed-head proof remains pending. |
| Source registry and ingestion quality | Backend foundation previously verified | Governed source registry and adapter-stage-validate-dry-run-explicit-apply boundary. Final regression is pending. |
| Artifact storage and jobs | Local implementations; future contracts | Guarded local artifact storage and inline jobs exist; object storage and external worker providers are contracts only. |
| Administration | Backend/frontend foundation previously verified | Permission-controlled source, ingestion, migration, job, audit, and user-role visibility with no destructive UI controls. |
| Containers and CI | Static contracts previously verified | Non-root images, health checks, explicit ports, Enterprise-local Compose reference, and no-deploy PostgreSQL/PostGIS CI. Final contract check is pending. |
| Enterprise cloud operations | Deferred | Managed hosting/PostGIS, Entra registration, object storage, external workers, monitoring, backups, restore drills, retention policy, and onboarding require approved infrastructure and policy. |

## Runtime and security boundaries

- Demo uses same-origin sanitized assets and session repositories. It must not
  call Product V1 write APIs.
- Local uses FastAPI, local PostgreSQL/PostGIS, a local-development principal,
  durable Product V1 records, and audit events.
- Enterprise requires an authenticated OIDC principal, organization scope,
  exact HTTPS CORS origins, enterprise providers, and server-authorized writes.
- Persisted roles override stale token/environment roles on Product requests.
  Inactive, ambiguous, and cross-organization mappings are denied.
- Sensitive JSON keys and labeled credential/token/API-key/hidden-prompt text
  patterns are recursively redacted before Product JSON or audit persistence.
  This is a bounded safeguard, not arbitrary-prose content classification.
- Local and Enterprise failures do not silently fall back to a demo/browser
  Product record. Unsaved edits may remain in component memory only while the
  UI reports that they are not saved.
- Public-static artifacts are read-only. Local artifact paths are constrained
  to the configured root and downloads require policy and authorization.
- Existing legacy routers also mounted below `/api/v1` retain their legacy
  response shapes. New Product-router endpoints use the documented Product
  envelopes, request IDs, provenance, and pagination.

## Migrations and data ownership

Revision `0001_product_v1` creates:

- organizations, users, user_preferences
- projects, project_members, project_workflow_states
- planning_snapshots, planning_snapshot_versions
- economic_scenarios, economic_scenario_versions
- property_reviews
- reports, report_bucket_items
- ask_cfs_conversations, ask_cfs_messages
- data_sources, ingestion_runs, data_quality_results
- artifacts, audit_events, background_jobs

Existing `investment_engagement`, `investment_saved_search`,
`investment_candidate_intake`, `investment_saved_item`, and
`investment_underwriting_scenario` tables remain authoritative equivalents.
Product V1 does not duplicate or silently synchronize them. Migration tests use
disposable schemas and must not rebuild, drop, or migrate canonical `cfs_dev`
source tables.

## API and workflow implementation

The Product router standardizes request IDs, timestamps, Product error
envelopes, page/page-size pagination, allowlisted filtering/sorting, optimistic
conflicts, provenance, principal context, and authorization. The exact
frontend contract and field mappings are recorded in
`cfs-enterprise-v1-frontend-integration-audit.md`.

Planning and Economics support list/get/create/update/version/archive. Reports
and the shared Report Bucket support list/get/create/update/archive. Ask CFS
supports conversation list/get/create/update/archive plus paginated safe
messages and reset. `GET /api/v1/me` supplies the frontend principal.

The compatibility boundary is deliberate: existing unversioned local product
routes remain available, while Enterprise mutations through legacy Investment
compatibility routes remain restricted. No raw database table or unrestricted
SQL is exposed.

## Frontend persistence integration

One typed client in `src/lib/product` validates Product envelopes and records,
preserves request IDs/provenance, maps authorization/conflict/validation/
unavailable errors, supports cancellation, retries eligible reads at most
once, and never automatically retries writes. One runtime selector supplies
session-backed Demo repositories or API-backed Local/Enterprise repositories.

- Planning Snapshots load, create, rename, update notes/sections, version,
  reopen, and archive through `/api/v1/planning/snapshots`. Failed or conflicted
  changes remain unsaved; loading latest metadata does not overwrite retained
  local edits. Legacy browser snapshots are detected but not uploaded or
  deleted automatically.
- Planning report drafts use `/api/v1/reports` with
  `report_type=planning_snapshot_draft`. Legacy local drafts remain local and
  are not silently imported.
- Economics scenarios persist assumptions, client-calculated output snapshots,
  analyst notes, comparison state, and calculation schema metadata through
  `/api/v1/economics/scenarios`, with explicit version creation and optimistic
  concurrency.
- Economics and Investments share `/api/v1/reports/bucket` for list, add,
  include-in-print updates, and archive. Display preferences remain
  non-authoritative browser state.
- Ask CFS keeps the existing answer service while persisting only bounded safe
  conversation metadata, questions, answer summaries, and allowlisted entity
  context. Reset deletes persisted messages, updates `reset_at`, and is audited.
- `GET /api/v1/me` supplies compact persistence/identity status and gates
  Planning, Economics, and Report Bucket controls. The server still enforces
  every mutation.

`check:frontend-persistence` drives real controls and uses direct GET/read-only
SQL only as secondary verification. Its phased mode preserves the same
UI-created IDs across owned frontend-only and backend-only restarts and then
cleans them through supported archive/reset routes. The working-tree pass below
proves those capabilities; the final-head section remains the release boundary.

## Historical foundation verification (superseded for frontend acceptance)

Before this frontend mission, the branch recorded the following foundation
results:

- Python compileall passed.
- Backend suite: 417 passed, 204 skipped, 2 warnings.
- Product V1 suite: 63 passed with fixtures and an isolated local
  PostgreSQL/PostGIS schema; zero disposable Product test schemas remained.
- TypeScript, ESLint, webpack build, runtime, API contract, migration,
  persistence, authorization, audit, ingestion, container-contract, and Product
  orchestrator checks passed.
- Existing acceptance, demo, presentation, Ask CFS (125/125), Power BI, map,
  local-data/API/interaction/presentation, and Product-hardening checks passed.
- The then-current local API regression recorded 192/192 endpoint cases and
  332 OpenAPI paths.
- The interactive-map regression recorded 30 cases; production-map acceptance
  recorded 30/30 cases across 22 sessions with ArcGIS primary in normal
  sessions and SVG only in the forced-WebGL session.

Those counts are historical evidence for the backend/product foundation and
stable product at the prior branch state. They do **not** prove the new frontend
persistence wiring and must not be reported as final-head results.

## Final-head verification evidence

No successful final-head frontend persistence report is recorded in this
document yet. Populate this section only from fresh reports produced after the
integration commits.

| Evidence | Required result | Recorded result |
| --- | --- | --- |
| Branch HEAD and run timestamps | Final branch commit and fresh start/end timestamps | **PENDING** |
| `check:frontend-persistence` | Planning, Economics, both Report Bucket entry points, Ask CFS, Demo isolation, authorization, database/audit proof, and cleanup pass | **PENDING** |
| Fresh local stack | `stop:cfs`, `present:cfs`, local data/API/interaction/presentation checks pass at final HEAD | **PENDING** |
| Frontend/build regression | Typecheck, lint, webpack build pass | **PENDING** |
| Backend regression | Compileall and full pytest pass with exact counts | **PENDING** |
| Existing product regression | Every requested demo/map/Ask/Power BI/CASE/presentation/readiness/hardening check passes | **PENDING** |
| Product V1 regression | Runtime/API/migrations/persistence/frontend/auth/audit/ingestion/containers/orchestrator checks pass | **PENDING** |
| Disposable data | Exact UI-created counts, archive/reset cleanup, zero active leftovers | **PENDING** |
| Preservation | Protected hashes and canonical relation counts match their branch-guard baselines | **PENDING** |

### Working-tree browser evidence (not final-head evidence)

The full browser checker passed from `2026-08-03T05:47:05.220Z` through
`2026-08-03T06:05:04.347Z`. Its recorded Git HEAD remained the pre-integration
commit `897a809eaea0c6bb833a1d615424022bbfae5d04`, so the report identifies a
dirty source tree and cannot satisfy the final-head row above.

- 18/18 UI workflows passed.
- 148 Product requests were observed: 143 successful, including 33 successful
  writes, with 19 request IDs captured.
- 11 disposable records, 11 read-only database proofs, and 11 supported cleanup
  results passed; archived rows and audit history intentionally remain.
- Nine authorization UX cases passed. They use simulated principals/denials;
  backend tests remain the server-enforcement proof.
- Demo made zero Product API requests and used five session-repository keys.
- Zero unexpected API, console, page, or request failures occurred. The five
  expected browser responses were one injected `409` and four injected `403`s.
- Seed, frontend-only restart verification, backend-only restart verification,
  and cleanup phases passed with the same five UI-created IDs.
- A disposable multiword credential marker was absent from persisted Ask CFS
  records and replaced with `<redacted>`.

## Soak evidence

### Superseded foundation soak

The earlier foundation soak recorded 3,116 seconds of active time, 17 health
rounds, and 3,780.5 seconds for its full command. It exercised lower-level
Product records, existing product checks, owned process restarts, cleanup, and
protected/canonical comparisons. Because its persistence actions were API-led,
it did not prove that the actual Planning, Economics, Report Bucket, and Ask
CFS controls created those records. It is therefore superseded as acceptance
evidence for this frontend mission.

### Required UI-inclusive soak

`npm.cmd run check:product-v1-soak` must run unshortened for at least 2,700
active seconds. It must include successful browser acceptance rounds plus seed,
frontend-only restart verification, backend-only restart verification, and
cleanup phases using the same UI-created IDs. A short run using
`CFS_ALLOW_SHORT_SOAK=true` is checker development only and cannot satisfy this
requirement.

**UI-inclusive soak status: PENDING.**

## Preservation status

The Enterprise branch is based on stable main
`a2749492d90dd934cc171c9d475f3e228cbe1ec1`; this frontend mission began from
Enterprise HEAD `897a809eaea0c6bb833a1d615424022bbfae5d04`.
Protected output summaries and the production-map screenshot were already
local preservation targets at branch guard and must remain byte-for-byte equal
to their recorded baseline hashes. They must remain unstaged and uncommitted.

CASE-1 values, the workbook, PowerPoint, nine CASE artifacts, raw/canonical
data, the public release tag, main, and production are outside this branch’s
authorized mutation scope. Final hash/status/remote verification is
**PENDING**; this report does not infer it from source inspection.

## Known limits and deferred work

- Planning map/dashboard image data URLs are excluded from Product JSON and
  remain transient in the current browser session. The saved metadata records
  `durable_artifact_reference: null`; governed artifact upload/linking is not
  connected.
- Planning and Economics can create a version and display `current_version`,
  but the Product API has no GET version-history or prior-version restore
  endpoint.
- Economics persists deterministic client-calculated output snapshots and a
  calculation schema version. The backend does not recalculate outputs; the
  frontend rejects unsupported schemas, assumptions, or output mismatches on
  load instead of silently defaulting them.
- Report Bucket create persists a `position`, but the Product sort allowlist and
  current UI do not provide deterministic position ordering or a reorder
  control. List/add/print-selection/archive is the implemented boundary.
- Ask CFS stores a nullable `retention_until` value but has no configured expiry
  policy or enforcement job. Reset deletes messages immediately and records an
  audit event. Organization retention policy remains operational work.
- Pattern/key-based redaction cannot identify arbitrary unlabeled sensitive
  prose. Operational policy must still prohibit secrets in user-authored text.
- Enterprise mutations through legacy Investment compatibility routes remain
  restricted until a governed adapter is approved.
- `FutureObjectStorageArtifactStore` and `ExternalWorkerJobProvider` are
  contracts, not live cloud adapters.
- OIDC is implemented at the application boundary; Entra registration,
  redirect/conditional-access policy, and tenant administration are deferred.
- Controlled ingestion apply fails closed unless an approved domain adapter is
  supplied. There is no automatic scheduling or unreviewed overwrite.
- Geometry validation checks structure and expected SRID; it is not topology
  repair or a full RFC conformance engine.
- Gateway rate limiting/chunked-body limits, backup/restore objectives, restore
  drills, monitoring thresholds, managed deployment, and onboarding remain
  operational work.
- Preservation evidence covers named protected/CASE hashes and canonical
  relation counts, not a byte-for-byte hash of every database value.

## Review and merge

Do not merge or deploy based on the historical foundation evidence. Review the
logical Enterprise commits, run every documented final-head regression, run
`npm.cmd run check:frontend-persistence`, and complete the unshortened
UI-inclusive soak. Merge only after human review and approved infrastructure
and security decisions.
