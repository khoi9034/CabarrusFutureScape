# Enterprise Product V1 frontend persistence audit

> **Retired historical reference:** The Investments product and CASE-1 workflow are retired and are not part of the active Demo, Local, Enterprise, acceptance, or deployment surface. This document is retained only as historical design or evidence and must not be used as an operating runbook.

The initial audit was performed on 2026-08-02 on
`product/cfs-enterprise-v1` at
`897a809eaea0c6bb833a1d615424022bbfae5d04`. The implementation state below
describes the later working tree. An 18-workflow dirty-working-tree browser run
passed; final-head browser and soak acceptance remain pending and must not be
inferred from that pre-commit report.

## Original finding at 897a809

The Product V1 database, service layer, and `/api/v1` routes existed, but the
normal user interfaces did not prove or use that persistence consistently.
Earlier persistence and soak checks called APIs directly, so they could not
prove that a user action reached PostgreSQL.

| Capability | Original frontend path | Original persistence at 897a809 | Decisive gap |
| --- | --- | --- | --- |
| Planning Snapshots | `src/hooks/useDashboardState.tsx` | `readStoredPlanningSnapshotLibrary`, `writeStoredPlanningSnapshotLibrary`, and the save/select/delete handlers treated `localStorage` as the library | Normal Local Planning saves did not call `/api/v1/planning/snapshots`. |
| Planning report drafts | `src/components/dashboard/DueDiligenceReview.tsx` | `REPORT_DRAFTS_STORAGE_KEY` and `localStorage` | Local report drafts were browser records, not `/api/v1/reports` records. |
| Economics scenarios | `EnterpriseScenarioConfigurePanel` in `src/components/economics/EconomicsShell.tsx` | Component state calculated an illustrative scenario; there was no saved Product V1 scenario library | The UI did not list, create, update, version, or archive `/api/v1/economics/scenarios`. |
| Economics and Investments Report Bucket | `src/components/economics/EconomicsShell.tsx` | `REPORT_BUCKET_SESSION_KEY` initialization and write effects used `sessionStorage` | Local Report Bucket actions did not call `/api/v1/reports/bucket`. |
| Ask CFS conversations | `src/components/dashboard/AskCfsPanel.tsx` | Answer generation used the existing Ask CFS service and turns lived in component memory | Normal use did not create Product V1 conversations/messages or restore them after refresh. |

## Implemented-state inventory

This table records the intended post-integration ownership. “Implemented” means
the code path exists; it does not mean final browser acceptance has passed.

| Concept | Implemented frontend owner | Repository/provider | API and database model | Implementation state | Required final browser proof |
| --- | --- | --- | --- | --- | --- |
| Planning Snapshots | `src/hooks/usePlanningSnapshotLibrary.ts` through `useDashboardState` | Demo repository in `sessionStorage`; API repository in Local/Enterprise | `/api/v1/planning/snapshots`; `planning_snapshots`, `planning_snapshot_versions` | Working-tree browser pass; final-head acceptance pending | Create, refresh, reopen, rename, sections/notes update, conflict review, version, frontend/backend restart, archive, audit, cleanup. |
| Planning report drafts | `src/hooks/usePlanningReportDrafts.ts` and `DueDiligenceReview` | Demo report repository in `sessionStorage`; API report repository in Local/Enterprise | `/api/v1/reports`; `reports` with `report_type=planning_snapshot_draft` | Working-tree browser pass; final-head acceptance pending | Save, refresh, reopen, rename, conflict review, archive, audit, cleanup. |
| Economics scenarios | `EnterpriseScenarioConfigurePanel` in `EconomicsShell` | Demo scenario repository in `sessionStorage`; API scenario repository in Local/Enterprise | `/api/v1/economics/scenarios`; `economic_scenarios`, `economic_scenario_versions` | Working-tree browser pass; final-head acceptance pending | Change assumptions, save, refresh, reopen, rename/notes, version, compare, frontend/backend restart, archive, audit, cleanup. |
| Economics and Investments Report Bucket | Shared state in `EconomicsShell` | Demo bucket repository in `sessionStorage`; API bucket repository in Local/Enterprise | `/api/v1/reports/bucket`; `report_bucket_items` | List/add/print-selection/archive implemented; deterministic ordering/reorder remains limited as documented below | Add from both products, refresh, print-selection update, frontend/backend restart, remove, audit, cleanup. |
| Existing Investments records | `EconomicsShell` and `src/lib/investmentIntelligenceService.ts` | Existing demo adapter or existing FastAPI/PostgreSQL services | Existing Investment routes/tables; Product V1 adds `/api/v1/investments/property-reviews` | Local paths preserved; Enterprise mutations through legacy compatibility routes remain restricted | Existing Investment browser regression plus Product V1 Report Bucket/property-review coverage. |
| Ask CFS conversation turns | `src/components/dashboard/AskCfsPanel.tsx` | Demo conversation repository in `sessionStorage`; API conversation repository in Local/Enterprise; answer generation remains the existing Ask CFS service | `/api/v1/ask-cfs/conversations`, messages, reset; `ask_cfs_conversations`, `ask_cfs_messages` | Working-tree browser pass; final-head acceptance pending | Ask/follow-up, safe message persistence, refresh recovery, reset, audit, secret/hidden-prompt exclusion, cleanup. |
| Current principal and permissions | `src/hooks/useProductPrincipal.tsx`, installed by `EntraAuthGate` | Demo principal or Product API principal; no browser role authority | `GET /api/v1/me`; persisted `users` and principal adapters | Working-tree role/denial UX pass; server authorization remains authoritative | Viewer denial/read behavior, Planner Planning write, Analyst Economics write, Report Author bucket write, backend denial UX. |
| Investment display preferences | `EconomicsShell` | `localStorage` | No Product record | Intentional non-authoritative device preference | Confirm it is not presented as saved business data. |
| Dashboard layout preferences | `src/lib/dashboard/workspaceStorage.ts` and `useDashboardState.tsx` | `localStorage` | No currently exposed Product preference route | Intentional non-authoritative UI preference | No Product write assertion required. |
| Entra/MSAL token cache | `src/lib/auth/entra.ts` | `sessionStorage` | Identity-provider session, not Product data | Intentional authentication state | Authorization and backend-denial coverage. |

Legacy Planning Snapshot and report-draft records are detected and identified as
local-only. They are not uploaded or deleted automatically.

## Exact Product API contract used by the frontend

These envelopes apply to the new Product router endpoints. Existing legacy
routers also mounted beneath `/api/v1` retain their existing response contracts.

- Success: `{ data, request_id, timestamp, provenance, pagination? }`.
- Collection pagination on the wire: `{ page, page_size, total }`; the typed
  client maps `page_size` to `pageSize`.
- Error: `{ error: { code, message, details? }, request_id, timestamp }`.
- `403` maps to permission denial, `409` to conflict, `422` to validation, and
  unavailable dependencies to the client’s unavailable state.
- Reads accept an `AbortSignal` and may retry one retryable failure once.
  Creates, updates, versions, resets, and archives are never retried
  automatically.

| Operation | Request | Response/behavior |
| --- | --- | --- |
| Principal | `GET /api/v1/me` | One principal record with subject, user/organization IDs, roles, permissions, and authenticated state. |
| List resource | `GET {collection}?page=&page_size=&project_id=&status=&sort=` | Record array plus required pagination. Active lists exclude archived records unless `status=Archived`. |
| Get resource | `GET {collection}/{id}` | One authorized record. |
| Create resource | `POST {collection}` | Server-generated ID/ownership/timestamps; `201` for generic Product resources. |
| Update resource | `PATCH {collection}/{id}?expected_updated_at={timestamp}` | Partial update. A stale supplied timestamp returns `409`; protected server fields are rejected. |
| Version snapshot/scenario | `POST {collection}/{id}/versions` with `{ "note": string | null }` | Appends a version row and increments `current_version`. There is no GET version-history or restore endpoint. |
| Archive resource | `POST {collection}/{id}/archive` | Sets `archived_at` and, where the model has it, `status=Archived`; the record leaves the normal active list. |
| Ask message list/add | `GET` or `POST /api/v1/ask-cfs/conversations/{id}/messages` | Paginated safe messages on GET; one safe message on POST. |
| Ask reset | `POST /api/v1/ask-cfs/conversations/{id}/reset` | Deletes retained messages, sets `reset_at`, updates the conversation, and appends an audit event. |

| Frontend domain | Create/update mapping |
| --- | --- |
| `PlanningSnapshot` | `title`, `included_sections`, `map_state`, `notes`, optional `project_id`, `review_status`, and bounded serializable context in `payload`. Server ID/timestamps replace browser identity in Local/Enterprise. Image data URLs are excluded; no durable artifact reference is currently created. |
| Planning report draft | `report_type=planning_snapshot_draft`, `title`, `status`, optional `project_id`, and the serializable draft in `payload`. |
| Economics configured scenario | `name`, `status`, `assumptions`, calculated `outputs`, `notes`, optional `comparison_set_id`/`project_id`, and calculation/schema metadata in `payload`. |
| `ReportBucketItem` | `object_type`, stable source `object_id`, `title`, safe `payload`, optional `report_id`/`project_id`, `position`, and `include_in_print`. |
| Ask CFS conversation/message | Conversation `title`, optional `project_id`/`retention_until`, and safe `product_context`; messages contain `role`, bounded `safe_question` or `safe_answer_summary`, bounded entity context, prompt/provider metadata, and safety status. |

## Runtime persistence matrix

| Capability | Demo | Local | Enterprise |
| --- | --- | --- | --- |
| Planning Snapshots | **Provider/source:** Demo repository and `sessionStorage`.<br>**API/permission:** No Product writes; session user may mutate.<br>**Refresh/restart:** Refresh in the same browser session reloads; a new session may reset.<br>**Failure/audit:** Storage failure is shown; no server audit. | **Provider/source:** API repository; PostgreSQL is authoritative.<br>**API/permission:** `/api/v1/planning/snapshots`; `planning:write`.<br>**Refresh/restart:** Reloads through API after refresh and owned process restart.<br>**Failure/audit:** Failed writes remain unsaved; server mutations append audit events. | **Provider/source:** Same API repository and organization-scoped PostgreSQL.<br>**API/permission:** Same route; OIDC principal plus `planning:write` and object scope.<br>**Refresh/restart:** Reloads through authenticated API.<br>**Failure/audit:** No browser fallback; denial/conflict/unavailable states are explicit; mutations are audited. |
| Planning report drafts | **Provider/source:** Demo report repository and `sessionStorage`.<br>**API/permission:** No Product writes.<br>**Refresh/restart:** Same-session reload only.<br>**Failure/audit:** Storage failure is shown; no server audit. | **Provider/source:** API report repository; PostgreSQL `reports` is authoritative.<br>**API/permission:** `/api/v1/reports`; `reports:write`.<br>**Refresh/restart:** Reloads after refresh/process restart.<br>**Failure/audit:** Failed writes remain unsaved; mutations are audited. | **Provider/source:** Same API repository and organization scope.<br>**API/permission:** Same route; OIDC plus `reports:write` and object scope.<br>**Refresh/restart:** Authenticated reload.<br>**Failure/audit:** Explicit denial/conflict/unavailable state; mutations are audited. |
| Economics scenarios | **Provider/source:** Demo repository and `sessionStorage`.<br>**API/permission:** No Product writes.<br>**Refresh/restart:** Same-session reload; a new session may reset.<br>**Failure/audit:** Storage failure is shown; no server audit. | **Provider/source:** API repository; PostgreSQL is authoritative.<br>**API/permission:** `/api/v1/economics/scenarios`; `economics:write`.<br>**Refresh/restart:** Reloads after refresh and owned process restart.<br>**Failure/audit:** Failed writes remain unsaved; mutations/versions/archive are audited. | **Provider/source:** Same API repository and organization scope.<br>**API/permission:** Same route; OIDC plus `economics:write` and object scope.<br>**Refresh/restart:** Authenticated reload.<br>**Failure/audit:** No browser fallback; explicit denial/conflict/unavailable state; mutations are audited. |
| Report Bucket | **Provider/source:** Demo repository and `sessionStorage`.<br>**API/permission:** No Product writes.<br>**Refresh/restart:** Same-session reload.<br>**Failure/audit:** Storage failure is shown; no server audit. | **Provider/source:** API repository; PostgreSQL is authoritative for Economics and Investments.<br>**API/permission:** `/api/v1/reports/bucket`; `reports:write`.<br>**Refresh/restart:** Reloads after refresh/process restart.<br>**Failure/audit:** Failed writes remain unsaved; create/update/archive are audited. | **Provider/source:** Same API repository and organization scope.<br>**API/permission:** Same route; OIDC plus `reports:write` and object scope.<br>**Refresh/restart:** Authenticated reload.<br>**Failure/audit:** Explicit denial/conflict/unavailable state; mutations are audited. |
| Ask CFS conversations | **Provider/source:** Demo repository and sanitized answer service; `sessionStorage` is the conversation source.<br>**API/permission:** No Product writes.<br>**Refresh/restart:** Same-session history only.<br>**Failure/audit:** Persistence failure is shown; no server audit. | **Provider/source:** Existing `/ai/search` answer service plus Product API/PostgreSQL for safe history.<br>**API/permission:** Conversation/message/reset routes; `ask_cfs:use`.<br>**Refresh/restart:** Safe history reloads through API.<br>**Failure/audit:** Answer may remain visible while unsaved history is reported; messages/reset are audited. | **Provider/source:** Same split with OIDC user/organization scope.<br>**API/permission:** Same routes and `ask_cfs:use`.<br>**Refresh/restart:** Authenticated safe-history reload.<br>**Failure/audit:** No browser fallback; denial/unavailable state is explicit; messages/reset are audited. |
| Existing Investments records | **Provider/source:** Sanitized demo adapter in `sessionStorage`.<br>**API/permission:** Existing demo behavior.<br>**Refresh/restart:** Session-scoped.<br>**Failure/audit:** No Product audit for demo records. | **Provider/source:** Existing FastAPI/PostgreSQL services.<br>**API/permission:** Existing Investment permissions/routes; shared bucket uses `reports:write`.<br>**Refresh/restart:** Server records reload.<br>**Failure/audit:** Existing service behavior plus Product audit for Product V1 records. | **Provider/source:** Governed compatibility boundary; shared bucket remains Product API-backed.<br>**API/permission:** Authenticated/scoped routes; legacy Investment mutations remain restricted.<br>**Refresh/restart:** Read/reload follows available governed APIs.<br>**Failure/audit:** No browser-only fallback; restricted mutations fail explicitly. |

## Known integration limits

- Planning map/dashboard image data URLs remain transient in the current
  browser session. The saved payload records
  `durable_artifact_reference: null`; governed artifact upload/linking is not
  connected to this workflow.
- Planning and Economics expose explicit version creation and the current
  version number. The API has no GET version-history or prior-version restore
  endpoint, so the UI cannot list or restore old versions.
- Economics stores a deterministic client-calculated output snapshot and a
  calculation schema version. The backend does not recalculate it; the
  frontend fails closed on unsupported schemas, assumptions, or output
  mismatches rather than opening a valid-looking scenario.
- Report Bucket create records a `position`, but the Product list sort
  allowlist and current UI do not provide deterministic position ordering or
  a reorder control. List/add/print-selection/archive persistence is the
  implemented boundary.
- Ask CFS has a nullable `retention_until` field but no configured expiry
  policy or enforcement job. Reset deletes messages immediately and records an
  audit event; broader retention policy remains operational work.
- Enterprise mutations through legacy Investment compatibility routes remain
  restricted until a governed Enterprise adapter is approved.

## Acceptance boundary

Lower-level API tests remain service coverage, not frontend acceptance.
Completion requires `check:frontend-persistence` to drive the real controls,
observe the resulting API requests, reload and restart, verify PostgreSQL and
audit rows, archive through supported APIs, and clean up disposable records.
The unshortened Product V1 soak must exercise those browser phases with the same
UI-created IDs across frontend-only and backend-only restarts.

Working-tree browser acceptance passed 18 workflows, 148 observed Product
requests, 11 disposable/database/cleanup records, nine authorization UX cases,
both owned restart verifications, and Demo isolation with zero Product API
requests. Its recorded HEAD predates the uncommitted integration, so it is not
final-head evidence.

**Final-head browser acceptance: PENDING.**

**Unshortened UI-inclusive soak: PENDING.**
