# Cabarrus FutureScape

Cabarrus FutureScape (CFS) is the frontend foundation for a Cabarrus County, NC digital twin and growth intelligence platform. The long-term product vision combines GIS, planning, infrastructure, analytics, parcel intelligence, simulation, and executive decision support.

## Current Phase

V1 Product Layout Redesign, building on completed GIS Map Intelligence, Parcel
Intelligence, Zoning Intelligence, Development Activity, FEMA flood constraint
intelligence, permit intelligence segmentation, and FastAPI integration.

This cleanup turns the working technical prototype into a cleaner product
experience for portfolio demonstrations, interviews, and stakeholder
presentations. It does not add data sources, forecasting, school constraints,
transportation constraints, backend changes, or PostGIS schema changes. The
goal is less control clutter and more planning intelligence.

Current product modes:

- `Overview`: default map exploration workspace for parcel search, 3D SceneView,
  active map layers, selected parcel status, and concise headline metrics.
- `Due Diligence`: selected parcel deep-dive with parcel summary, development
  activity, permit timeline, FEMA flood constraints, and map context.
- `Executive Print`: report-style selected parcel summary with a print button,
  selected parcel summary, development summary, constraint summary, latest
  permits, map snapshot placeholder, and executive notes.

Developer-only surfaces:

- `Temporal Analysis`
- `System Status`
- role/scenario/report diagnostics

These remain collapsed or hidden unless `NEXT_PUBLIC_CFS_DEVELOPER_MODE=true`
is configured.

The left rail is now an `Explore / Layers` panel. Map layer controls are
collapsed by default under `Map Layers`, preserving:

- Development Hotspots
- Flood Constraints
- FEMA Flood Zones
- Infrastructure Readiness
- Opportunity Extrusions

Advanced planning/readiness/scoring controls are collapsed to reduce visual
noise.

The bottom KPI bar is reduced to four executive cards:

- Growth Activity
- Constraint Exposure
- Development Activity
- Total Parcels

All existing FastAPI/static fallback behavior, parcel search, parcel focus, 3D
parcel cage highlight, Development Hotspots, Flood Constraints, FEMA Flood
Zones, selected parcel flood panel, and permit events remain preserved.

Executive Print uses `window.print()` and print CSS that hides app chrome and
formats the report on a light/white print surface for readability while keeping
the on-screen CFS interface dark.

## Permit Intelligence Segmentation

CFS now includes a descriptive permit intelligence segmentation layer for
Real Property Permit records. This is an interpretable rules-based framework,
not a prediction model.

Module files:

- `models/permit_intelligence/README.md`
- `models/permit_intelligence/permit_segmentation_rules.yaml`
- `models/permit_intelligence/classify_permit_segments.py`
- `models/permit_intelligence/create_parcel_permit_segment_summary.py`

PostGIS outputs:

- `public.permit_intelligence_segments`
- `public.parcel_permit_segment_summary`

Generated outputs:

- `outputs/permit_segmentation_validation.json`
- `outputs/permit_segment_summary.csv`
- `outputs/permit_growth_signal_summary.csv`
- `outputs/permit_status_stage_summary.csv`
- `outputs/permit_value_class_summary.csv`
- `outputs/permit_segment_by_year_summary.csv`
- `outputs/permit_segment_examples.csv`
- `outputs/parcel_permit_segment_summary_validation.json`
- `outputs/parcel_permit_segment_top_residential_growth.csv`
- `outputs/parcel_permit_segment_top_commercial_activity.csv`
- `outputs/parcel_permit_segment_top_redevelopment_signal.csv`
- `outputs/parcel_permit_segment_top_major_value.csv`
- `outputs/permit_intelligence_segmentation_summary.json`

Current segmentation result:

- Permit source rows: `64,426`
- Permit segment rows: `64,426`
- Unique permit IDs: `64,426`
- Parcel permit segment summary rows: `43,474`
- Segment row count matches source row count: `true`
- Parcel summary rows match matched parcels with permit activity: `true`

Top permit segments:

- `residential_growth`: `42,206`
- `redevelopment_signal`: `7,866`
- `administrative_or_unknown`: `5,792`
- `commercial_activity`: `2,993`
- `accessory_or_misc`: `2,251`
- `minor_maintenance`: `1,866`
- `demolition`: `1,421`

The `permit_signal_score` is a 0-100 descriptive signal score derived from
permit segment, value class, status stage, and configured keyword rules. It is
not a prediction probability and should not be exposed as a forecast.

Dashboard/API integration:

- `GET /development/permit-segments/statistics` exposes countywide permit
  segment, growth signal, status stage, value class, and development domain
  distributions.
- `GET /development/permit-segments/{official_parcel_id}` exposes selected
  parcel permit segment rollups from `public.parcel_permit_segment_summary`.
- `GET /development/permit-segments/options` exposes lookup values for future
  dropdown/filter surfaces.
- `GET /development/parcel/{official_parcel_id}/permits` now includes permit
  segment, growth signal, status stage, value class, development domain, and
  signal score fields on each permit event.
- `GET /development/hotspots` can filter hotspot parcels by permit segment,
  growth signal, status stage, value class, and development domain while
  preserving the previous activity class, jurisdiction, time, sort, and limit
  filters.

Frontend integration:

- The Development Activity section includes a compact `Permit Intelligence
  Segments` panel so users can distinguish residential growth, commercial
  activity, redevelopment signals, minor maintenance, demolition, active
  construction, and high/major value permits.
- The selected parcel development activity card shows dominant segment,
  dominant growth signal, active construction, redevelopment, high/major value
  permits, and max/average signal scores when available.
- Selected parcel permit event rows show compact segment badges without
  replacing the underlying permit type, work type, status, amount, or
  relationship confidence.
- Development Hotspot controls include segment, growth signal, status stage,
  and value class filters, and the map legend explains hotspots as meaningful
  permit intelligence rather than raw permit counts alone.

Prediction readiness is documented in
`docs/backend/permit_segmentation_and_prediction_readiness.md`. Future
prediction should wait for audited labels, temporal holdout validation, leakage
controls, parcel constraint overlays, and stakeholder agreement on target
definitions.

## Phase 7A FEMA Flood Constraint Ingestion

Phase 7A creates the first production-ready flood constraint source pipeline.
It avoids nationwide FEMA downloads by calculating the Cabarrus footprint from
`public.parcels_enriched` with `ST_Extent(geometry)` and sending that envelope
to FEMA NFHL Layer 28 with `esriSpatialRelIntersects`.

FEMA source:

- Layer: FEMA NFHL Flood Hazard Zones, Layer 28
- URL: `https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28`
- Role: authoritative regulatory floodplain/floodway constraint source

Pipeline files:

- `cfs-data-pipelines/inspect/inspect_cabarrus_extent.py`
- `cfs-data-pipelines/ingest/ingest_fema_nfhl_flood_zones.py`
- `cfs-data-pipelines/inspect/inspect_fema_nfhl_flood_zones.py`
- `cfs-data-pipelines/sql/create_fema_nfhl_flood_zones_clean.sql`
- `cfs-data-pipelines/transform/create_fema_nfhl_flood_zones_clean.py`

PostGIS tables:

- `public.fema_nfhl_flood_zones_raw`
- `public.fema_nfhl_flood_zones_clean`

Generated outputs:

- `cfs-data-pipelines/outputs/cabarrus_extent_validation.json`
- `cfs-data-pipelines/outputs/fema_nfhl_flood_zone_ingest_summary.json`
- `cfs-data-pipelines/outputs/fema_nfhl_flood_zones_profile.json`
- `cfs-data-pipelines/outputs/fema_nfhl_flood_zones_columns.csv`
- `cfs-data-pipelines/outputs/fema_nfhl_flood_zone_clean_validation.json`
- `outputs/phase7a_fema_flood_ingestion_summary.json`

Current Phase 7A result:

- Cabarrus envelope: `xmin=-80.78714859986353`, `ymin=35.185001484384316`,
  `xmax=-80.29542844362561`, `ymax=35.55345527610693`
- Parcel count used for extent: `110,017`
- Raw FEMA feature count: `7,712`
- Clean FEMA feature count: `7,712`
- Raw invalid geometries: `195`
- Clean invalid geometries: `0`
- Clean geometry type: `ST_MultiPolygon`
- Clean SRID: `4326`

Discovered FEMA fields:

- Flood zone code: `FLD_ZONE`
- Floodway/subtype context: `ZONE_SUBTY`
- Special Flood Hazard Area flag: `SFHA_TF`
- Additional zone field present but empty in this extract: `DUAL_ZONE`

Normalized flood severity mapping:

- `floodway` -> `severe`
- `special_flood_hazard_area` -> `high`
- `moderate_flood_hazard` -> `moderate`
- `minimal_flood_hazard` -> `low`

Phase 7A does not create parcel flood overlay results, frontend flood panels,
SceneView flood layers, TIFF comparison, or forecasting. The next phase is
Phase 7B: Parcel Flood Constraint Overlay.

## Phase 7B Parcel Flood Constraint Overlay

Phase 7B creates one parcel-level flood constraint row for every parcel in
`public.parcels_enriched`.

Core files:

- `cfs-data-pipelines/sql/create_parcel_flood_constraint_overlay.sql`
- `cfs-data-pipelines/transform/create_parcel_flood_constraint_overlay.py`

PostGIS table:

- `public.parcel_flood_constraint_overlay`

Generated outputs:

- `outputs/parcel_flood_constraint_overlay_validation.json`
- `outputs/parcel_flood_constraint_summary.csv`
- `outputs/parcel_flood_constraint_high_review.csv`
- `outputs/phase7b_parcel_flood_overlay_summary.json`

Overlay logic:

- Intersects `public.parcels_enriched` with
  `public.fema_nfhl_flood_zones_clean`.
- Calculates intersection area in acres using geography.
- Aggregates all flood overlaps per parcel.
- Assigns `dominant_flood_zone` by largest overlapped area.
- Assigns parcel severity from the highest-risk overlap:
  `floodway=severe`, `special_flood_hazard_area=high`,
  `moderate_flood_hazard=moderate`, `minimal_flood_hazard=low`,
  no overlap=`none`.
- Separates review/scoring from low-risk Zone X so minimal flood mapping does
  not become a fake regulatory development constraint.

Current Phase 7B result:

- Overlay rows: `110,017`
- Parcel rows matched: `110,017`
- Invalid overlay geometries: `0`
- Output SRID: `4326`
- Floodplain present: `8,661`
- Floodway present: `3,229`
- SFHA present: `7,254`
- Flood review required: `7,989`
- High/severe buildability impact: `6,362`

Severity distribution:

- `low`: `101,356`
- `high`: `4,025`
- `severe`: `3,229`
- `moderate`: `1,407`

Important caveat:

FEMA Layer 28 maps Zone X across most parcels, so `minimal_flood_present` is
widespread and `no_flood_constraint_count` is `0` if any FEMA zone overlap is
counted. CFS should treat Zone X as low-risk mapped context, while SFHA,
floodway, and meaningful moderate-hazard overlap drive review and buildability
impact.

Phase 7B does not add frontend flood panels, SceneView flood rendering,
FastAPI constraint endpoints, TIFF comparison, or prediction models. The next
step is flood constraint API planning and dashboard-safe display review.

## Phase 7C Flood Constraint API Contract

Phase 7C creates backend planning artifacts for future flood constraint API
implementation. It does not build FastAPI endpoints, frontend panels,
SceneView flood rendering, TIFF comparison, or forecasting.

Created docs:

- `docs/backend/flood_constraint_api_contract.md`
- `docs/backend/flood_constraint_data_dictionary.md`
- `docs/backend/flood_constraint_response_examples.md`

Generated output:

- `outputs/phase7c_flood_constraint_api_contract_summary.json`

Planned endpoints:

- `GET /constraints/flood/statistics`
- `GET /constraints/flood/{official_parcel_id}`
- `GET /constraints/flood/filter`
- `GET /constraints/flood/high-review`
- `GET /constraints/flood/summary`

Required filter fields:

- `floodplain_present`
- `floodway_present`
- `sfha_present`
- `moderate_flood_present`
- `flood_review_required`
- `buildability_impact`
- `flood_severity_class`
- `dominant_flood_zone`
- percent constrained min/max

Recommended parcel flood detail payload:

- parcel identity: `official_parcel_id`, `pin14`
- FEMA zone context: `dominant_flood_zone`, `flood_zone_codes`
- flags: `floodplain_present`, `floodway_present`, `sfha_present`
- area metrics: constrained acres, floodway acres, SFHA acres, percent
  constrained
- review/scoring: `flood_review_required`, `buildability_impact`,
  `flood_constraint_score`, `overlay_confidence`

Backend readiness:

- Source table ready: `public.parcel_flood_constraint_overlay`
- Contract docs ready
- Response examples ready
- API implementation complete in Phase 7D
- Frontend and SceneView integration pending

## Phase 7D Flood Constraint FastAPI Endpoints

Phase 7D implements the planned flood constraint endpoints as read-only FastAPI
routes backed by `public.parcel_flood_constraint_overlay`.

Created backend files:

- `backend/app/routers/constraints_router.py`
- `backend/app/repositories/constraints_repository.py`
- `backend/app/services/constraints_service.py`
- `backend/app/schemas/constraints.py`
- `backend/tests/test_flood_constraints.py`

Implemented endpoints:

- `GET /constraints/flood/statistics`
- `GET /constraints/flood/{official_parcel_id}`
- `GET /constraints/flood/filter`
- `GET /constraints/flood/high-review`
- `GET /constraints/flood/summary`

Supported filters:

- `floodplain_present`
- `floodway_present`
- `sfha_present`
- `moderate_flood_present`
- `flood_review_required`
- `buildability_impact`
- `flood_severity_class`
- `dominant_flood_zone`
- `percent_constrained_min`
- `percent_constrained_max`

Current global endpoint metrics:

- Total parcels: `110,017`
- Floodway parcels: `3,229`
- SFHA parcels: `7,254`
- Flood review required parcels: `7,989`
- High/severe buildability parcels: `6,362`

Phase 7D does not modify the frontend, SceneView, PostGIS schema, school
constraints, or forecasting.

## Phase 7E Frontend Flood Constraint Integration

Phase 7E connects the completed flood constraint FastAPI endpoints to the
frontend while preserving the existing parcel search/detail, map focus,
selected parcel boundary highlight, and Development Hotspots behavior.

Created frontend files:

- `src/lib/api/constraints.ts`
- `src/types/api/constraints.ts`
- `src/hooks/useSelectedParcelFloodConstraint.ts`
- `src/hooks/useFloodConstraintSummary.ts`
- `src/hooks/useFloodConstraintLayer.ts`
- `src/lib/adapters/selectedParcelFloodConstraintAdapter.ts`
- `src/lib/adapters/floodConstraintSummaryAdapter.ts`
- `src/lib/adapters/floodConstraintMapAdapter.ts`
- `src/types/map/floodConstraints.ts`
- `src/components/dashboard/SelectedParcelFloodConstraintPanel.tsx`
- `src/components/dashboard/FloodConstraintSummaryPanel.tsx`

Frontend behavior:

- The selected parcel workflow now shows a compact FEMA flood constraint panel
  with dominant flood zone, floodway/SFHA flags, percent constrained, review
  status, buildability impact, severity class, and constraint score.
- The old disabled/mock `Flood Risk` layer row is repurposed as
  `Flood Constraints` with FEMA NFHL / API status.
- The flood layer is off by default. When enabled, it calls
  `GET /constraints/flood/high-review`, limits rendering to high-review
  parcels, enriches those records with existing parcel `map_focus` centroids,
  and draws temporary SceneView markers.
- Flood markers use color, size, and shape to communicate FEMA constraint
  meaning. Red triangles mean severe/floodway, orange kites mean high/SFHA, and
  yellow circles mean moderate flood constraint review. Low/minimal records are
  not rendered in the default high-review layer.
- Marker size grows with `flood_constraint_score` or
  `percent_parcel_constrained`, whichever is stronger for the selected record.
  Clicking a marker dispatches the existing parcel inspect flow so the selected
  parcel card, map focus, parcel boundary highlight, development activity, and
  permit events update normally.
- Clicking a flood marker opens a compact movable flood constraint info card
  with parcel ID, zone, floodway/SFHA flags, percent constrained, buildability
  impact, severity, and score while still reusing the selected parcel workflow.
- The Parcel Intelligence section now includes a compact countywide flood
  summary from `GET /constraints/flood/summary`.

Phase 7E does not modify PostGIS schema, build forecasting, use the old TIFF as
the primary source, render all parcels, or start school constraints. Remaining
flood UI work includes richer filtering for the flood layer, optional selected
parcel flood geometry display, and dedicated constraint dashboard placement.

## Phase 7F FEMA Flood Zone Polygon Visualization

Phase 7F adds FEMA NFHL Layer 28 polygon visualization as a separate map layer
from parcel-based Flood Constraints markers.

Layer separation:

- `Flood Constraints`: parcel-based review intelligence, high-review parcel
  markers, and selected parcel flood detail.
- `FEMA Flood Zones`: official FEMA NFHL Layer 28 source polygons, transparent
  map reference, and zone-focused inspection.

Backend endpoint:

- `GET /constraints/flood/zones`

Supported backend parameters:

- `flood_severity_class`: `severe`, `high`, or `moderate`.
- `flood_constraint_type`: normalized FEMA constraint type, such as
  `floodway` or `special_flood_hazard_area`.
- `extent`: optional WGS84 envelope in `xmin,ymin,xmax,ymax` format.
- `limit`: default `500`, max `1000`; `limit=0` is only accepted with an
  extent and returns all matching polygons for that visible extent.
- `offset`: default `0`.

Frontend behavior:

- The Layer Registry now includes a separate `FEMA Flood Zones` row under
  Risk, labeled as official FEMA NFHL Layer 28 polygons with API status.
- The layer is off by default. When enabled, it uses
  `GET /constraints/flood/zones` and renders a dedicated SceneView graphics
  layer: `cfs-fema-flood-zones-layer`.
- The layer does not select parcels. Clicking a FEMA polygon opens an
  informational zone card with flood zone code, severity, constraint type,
  FEMA area ID, source object ID, and source layer.
- Polygon styling uses transparent fills and visible outlines:
  red for severe/floodway, orange for high/SFHA, yellow for moderate, and
  light blue-gray for minimal/low context.
- Controls support severity filtering and capped loading of `100`, `500`, or
  visible-extent polygons.

Performance approach:

- Do not render all Cabarrus FEMA polygons by default.
- Use capped API requests by default.
- Use extent-based loading for the visible extent mode.
- Toggle-off clears only the `cfs-fema-flood-zones-layer` and preserves parcel
  focus, selected parcel boundary cages, flood review markers, and Development
  Hotspots.

Phase 7F does not modify PostGIS schema, rebuild the flood overlay, use the old
TIFF as the primary source, build forecasting, or start school constraints.
Remaining flood UI work includes viewport-driven refresh polish, optional
simplification/level-of-detail for dense polygon views, and richer flood zone
filter presets.

## Tech Stack

- Next.js 16 App Router
- TypeScript
- Tailwind CSS 4
- React 19
- Lucide React icons
- ArcGIS Maps SDK for JavaScript installed via `@arcgis/core`

## Run Locally

For the full API-backed CFS prototype, use the guarded local launcher. It
starts/restarts both FastAPI and Next.js, writes the local frontend API flag,
then verifies the parcel, development, flood constraint, and FEMA flood zone
API endpoints before reporting the app ready:

```powershell
npm run dev:cfs
```

Then open:

```text
http://localhost:3000
```

This keeps the frontend from appearing healthy while the FastAPI process is
stale or unavailable.

Frontend-only static mode is still available:

```bash
npm install
npm run dev
```

Then open the local URL shown in the terminal, usually:

```text
http://localhost:3000
```

Useful checks:

```bash
npm run typecheck
npm run lint
npm run build
```

## FastAPI Backend Foundation

CFS now includes a read-only FastAPI backend under `backend/`. It exposes health
checks, database connectivity, parcel intelligence endpoints, development
activity endpoints, temporal query endpoints, and lookup endpoints for the
existing API contracts. It does not implement authentication, caching,
materialized view refresh, frontend writes, or direct browser-to-PostGIS access.

Install and run locally:

```powershell
cd C:\CabarrusFutureScape\backend
python -m pip install -r requirements.txt
$env:POSTGRES_HOST = "localhost"
$env:POSTGRES_PORT = "5433"
$env:POSTGRES_DB = "cfs_dev"
$env:POSTGRES_USER = "postgres"
$env:POSTGRES_PASSWORD = $env:CFS_POSTGRES_PASSWORD
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Health and docs:

```text
GET http://127.0.0.1:8000/health
GET http://127.0.0.1:8000/health/database
OpenAPI docs: http://127.0.0.1:8000/docs
OpenAPI JSON: http://127.0.0.1:8000/openapi.json
```

Backend environment variables are documented in `backend/.env.example`.
`POSTGRES_PASSWORD` is preferred for the API, while `CFS_POSTGRES_PASSWORD`
remains supported for local development against the existing PostGIS database.

## Folder Structure

```text
src/
  app/
    globals.css          Next.js app styles entrypoint
    layout.tsx           Root metadata, fonts, and document shell
    page.tsx             Dashboard route entrypoint
  components/
    dashboard/           Dashboard-specific panels and controls
    gis/                 GIS viewport components and SceneView boundary
    layout/              App-level dashboard layout shell
    ui/                  Reusable UI primitives
  data/
    intelligence/        Static generated parcel and development activity dashboard metrics
    mock/                Mock dashboard, layer, parcel, event, role, scenario, and report data
  hooks/
    useDashboardState.tsx Shared dashboard state provider and public hook
    useExecutiveBriefing.ts Mock comparison and briefing state
    useExecutiveReports.ts Mock report package, print mode, and export state
    useLayerVisibility.ts Layer visibility state
    useMapInteractionState.ts Scene status and map error state
    useRoleState.ts     Active county stakeholder role state
    useScenarioState.ts Scenario horizon and simulation control state
    useSelectedParcel.ts Parcel selection state
  lib/
    dashboard/           URL-safe dashboard state helpers
    gis/                 ArcGIS loading, SceneView factory, layer factory, service adapter, config, and registry helpers
    utils.ts             Shared formatting and class utilities
  styles/
    cfs-theme.css        CFS visual tokens and global utility classes
  types/
    gisServices.ts       Future GIS service adapter contracts
    index.ts             Shared TypeScript domain types
    mapInteractions.ts   Typed map click, hover, hit-test, identify, and selection events
    scenarioComparison.ts Mock scenario comparison and briefing domain types
    reports.ts           Mock report, briefing packet, and export domain types
    userRoles.ts         Frontend-only role metadata and role preset types
```

## Phase 2 Parcel Intelligence Dashboard

The dashboard now includes a Parcel Intelligence section in the right rail and replaces the bottom parcel KPI with metrics derived from generated pipeline outputs.

Data source artifacts:

- `cfs-data-pipelines/outputs/parcel_zoning_intelligence_qa_summary.json`
- `cfs-data-pipelines/outputs/parcels_enriched_summary.json`

The new dashboard panels surface:

- Total parcels, zoned parcels, high/low confidence parcels, unmatched parcels, safe-for-dashboard parcels, review parcels, and multi-jurisdiction parcels
- Zoning parcel distribution for Concord, Kannapolis, Cabarrus County, Harrisburg, Midland, Mt. Pleasant, and Locust
- Governance warning counts for jurisdiction code semantics review, sliver overlap, multi-jurisdiction review, low confidence review, near tie review, and no zoning match
- Parcel quality counts for trusted, review, and critical parcel classes
- Executive summary statements such as zoning coverage, dashboard readiness, governance review volume, and unmatched parcel count

This is not a live database integration. The frontend imports static generated artifacts from the local pipeline outputs so the dashboard can show real Phase 2 parcel intelligence results without FastAPI, direct PostGIS access, authentication, or frontend database credentials.

## Phase 2 Parcel Search And Filter UX

The dashboard now includes a Parcel Discovery panel for searching, filtering, and inspecting generated parcel intelligence records.

Core files:

- `cfs-data-pipelines/inspect/export_parcel_search_index.py` exports a geometry-free static search artifact from the existing Phase 2 parcel intelligence tables.
- `public/intelligence/parcel-search-index.json` is the generated browser-facing parcel search index.
- `src/data/intelligence/parcelSearchData.ts` loads and normalizes the compact static artifact without bundling it into the JavaScript build.
- `src/components/dashboard/ParcelSearchPanel.tsx` owns the local search/filter/detail workflow.
- `src/components/dashboard/ParcelFilterPanel.tsx` exposes structured filters.
- `src/components/dashboard/ParcelResultList.tsx` displays parcel results.
- `src/components/dashboard/ParcelDetailDrawer.tsx` displays selected parcel intelligence details.
- `src/components/dashboard/ParcelSearchState.ts` defines local search state, filters, and command-palette event wiring.

Supported search fields:

- `official_parcel_id`
- `pin14`
- Owner/account names from `acctname1` and `acctname2`
- Mailing address fields
- Subdivision
- Neighborhood
- Zoning code
- Zoning jurisdiction
- Partial text across the indexed parcel context

Supported filters:

- Zoning jurisdiction
- Zoning category
- Parcel quality status
- Zoning confidence
- Governance warning category
- Valuation band
- Subdivision
- Neighborhood

Parcel result cards show parcel ID, PIN14, owner/account label, subdivision, neighborhood, zoning jurisdiction, zoning code, parcel quality status, zoning confidence, and warning count. Selecting a result opens the detail drawer with identity, location context, zoning, quality, valuation, and planning context.

The command palette can also surface generated parcel intelligence results for typed queries and dispatches them into the Parcel Discovery panel. This keeps the generated parcel index separate from the existing mock SceneView parcel selection model until a backend/API parcel service is introduced.

This remains static and frontend-only. There is no FastAPI endpoint, direct browser-to-PostGIS connection, authentication layer, permit workflow, or live database query in the dashboard.

## Phase 3 Development Activity Dashboard

The dashboard now includes Development Activity intelligence panels in the right rail. These panels surface generated Real Property Permit analytics without connecting the browser to PostGIS or a backend API.

Core files:

- `src/data/intelligence/developmentActivityMetrics.ts` normalizes generated development activity outputs for dashboard use.
- `src/components/dashboard/DevelopmentActivityPanel.tsx` displays core permit activity metrics and activity class distribution.
- `src/components/dashboard/DevelopmentTrendPanel.tsx` displays annual and recent monthly trend readiness.
- `src/components/dashboard/DevelopmentHotspotsPanel.tsx` displays top active parcels from the generated activity outputs.
- `src/components/dashboard/DevelopmentZoningPanel.tsx` displays top zoning jurisdiction, code, and type combinations by permit count.

Generated source artifacts:

- `cfs-data-pipelines/outputs/development_activity_parcel_summary_validation.json`
- `cfs-data-pipelines/outputs/development_activity_top_parcels.csv`
- `cfs-data-pipelines/outputs/development_activity_year_summary.csv`
- `cfs-data-pipelines/outputs/development_activity_month_summary.csv`
- `cfs-data-pipelines/outputs/development_activity_zoning_summary.csv`

Core metrics surfaced:

- Total permit records: `64,426`
- Parcels with permit activity: `43,474`
- Parcels without permit activity: `66,543`
- Recent 1-year activity parcels: `3,091`
- Recent 3-year activity parcels: `9,388`
- Activity date range: `1986-12-01` to `2025-12-31`
- Activity anchor date: `2025-12-31`

Activity class distribution:

- `very_high_activity`: `551`
- `high_activity`: `2,430`
- `moderate_activity`: `27,425`
- `low_activity`: `13,068`
- `no_activity`: `66,543`

The data layer imports the generated validation JSON, which carries the same top parcel, annual trend, monthly trend, and zoning summary records exported to companion CSV files. The CSV artifact paths are preserved in the data source metadata for auditability and future backend migration.

This remains static and generated-output based. There is no live permit API, direct PostGIS connection, temporal slider UI, hotspot map rendering, authentication layer, or real-time permit feed in the dashboard yet.

## Phase 3 Temporal Analysis Framework

The dashboard now includes a frontend-only temporal analysis framework for future permit maps, growth playback, and time-enabled analytics.

Core files:

- `src/data/intelligence/developmentTemporalIndex.ts` exposes available years, recent months, min/max dates, activity anchor date, permit totals by year/month, zoning activity summaries, permit categories, work type metadata, activity classes, and future query-preview helpers.
- `src/hooks/useTemporalAnalysisState.ts` owns selected year, month, rolling window, date range, permit type, work type, zoning jurisdiction, zoning category, activity class, static query results, static trend summary, and reset behavior.
- `src/hooks/useTemporalQuery.ts` owns the feature-flagged `GET /development/temporal-query` handoff and static fallback state.
- `src/lib/adapters/temporalQueryAdapter.ts` normalizes live temporal API responses and generated static temporal artifacts into the same UI shape.
- `src/components/dashboard/TemporalAnalysisPanel.tsx` adds the compact temporal intelligence shell.
- `src/components/dashboard/TemporalFilterControls.tsx` provides year, month, rolling window, date range, permit type, work type, zoning jurisdiction, zoning category, and activity class controls.
- `src/components/dashboard/TemporalTrendSummary.tsx` summarizes the selected time context and trend direction.
- `src/components/dashboard/TemporalQueryPreview.tsx` previews the API request or static SQL shape without altering the map.

Generated source artifacts:

- `cfs-data-pipelines/outputs/development_activity_year_summary.csv`
- `cfs-data-pipelines/outputs/development_activity_month_summary.csv`
- `cfs-data-pipelines/outputs/development_activity_zoning_summary.csv`
- `cfs-data-pipelines/outputs/development_activity_parcel_summary_validation.json`

Supported temporal filters:

- Year
- Recent month
- Rolling 12-month or 36-month window
- Date range
- Permit type
- Work type
- Zoning jurisdiction
- Zoning category
- Activity class

With `NEXT_PUBLIC_USE_BACKEND_API=true`, the panel calls `GET /development/temporal-query` and passes year, month, `date_start`, `date_end`, `rolling_window`, permit type, work type, zoning jurisdiction, zoning category, and activity class. With the flag disabled, or if the backend fails, the panel uses static generated aggregates. The static SQL preview is intentionally display-only; it does not connect the frontend to PostGIS.

Future integration path:

1. Add lookup API integration for permit type, work type, jurisdiction, and activity class option lists.
2. Add map-safe development activity geometry sources for temporal extent queries.
3. Add SceneView layer filtering once map-safe time-enabled permit layers exist.
4. Add animated playback only after static filtering, backend query performance, and map layer governance are stable.

The SceneView remains unchanged in this task. No map animation, direct browser-to-PostGIS connection, or permit playback has been added.

## What Is Mocked

- Parcel summaries and sample parcel geometry
- Non-parcel KPI cards and trend values
- Scenario horizon presets
- Layer registry metadata
- Development pressure, readiness, tax opportunity, and risk scores
- Dashboard state and selected parcel behavior
- Client-side ArcGIS graphics layers
- GIS service adapter responses
- Future `FeatureLayer`, `SceneLayer`, and `MapImageLayer` service definitions
- Role presets, role KPI emphasis, role insights, and role-aware command suggestions
- Scenario comparison metrics, executive narratives, and briefing sections
- Executive report packages, briefing packets, print previews, and export history
- Animated temporal playback and hotspot map rendering

No direct browser database connection, live parcel or permit feed, forecasting model, AI system, or production GIS service is connected yet. FastAPI-backed parcel and development activity reads are available only through the Phase 5 feature flag and keep generated artifacts as fallback data.

## ArcGIS SceneView

The project has a dedicated client-side GIS architecture boundary:

- `src/components/gis/SceneViewContainer.tsx`
- `src/components/gis/MapViewportPlaceholder.tsx`
- `src/lib/gis/arcgisRuntime.ts`
- `src/lib/gis/gisConfig.ts`
- `src/lib/gis/gisServiceAdapter.ts`
- `src/lib/gis/layerFactory.ts`
- `src/lib/gis/layerRegistry.ts`
- `src/lib/gis/mapInteractionController.ts`
- `src/lib/gis/mockSceneLayers.ts`
- `src/lib/gis/sceneViewFactory.ts`
- `src/data/mock/layersMockData.ts`

`@arcgis/core` is loaded dynamically from the client-only `SceneViewContainer` to avoid SSR issues. The central viewport creates a real ArcGIS `Map` and `SceneView` centered around Concord / Cabarrus County, NC. Current layers are mock `GraphicsLayer` instances, but the layer registry now includes source metadata for future `FeatureLayer`, `SceneLayer`, `GraphicsLayer`, and `MapImageLayer` services.

The SceneView implementation includes:

- Client-only ArcGIS module loading
- Isolated SceneView factory
- Isolated mock layer creation and symbol updates
- Layer visibility synchronization
- Parcel hit-test selection for mock graphics
- Typed map interaction controller for clicks, hover readiness, hit-tests, identify preparation, and selection events
- Loading and degraded/error states
- Cleanup for click handles, layers, and SceneView instances

## Operational Layer Readiness

Operational layer definitions now support:

- ArcGIS layer kinds: `GraphicsLayer`, `FeatureLayer`, `SceneLayer`, and `MapImageLayer`
- Source statuses: `mock`, `placeholder`, `disabled`, and `live`
- Visibility and opacity metadata
- Optional service URL metadata
- Optional popup, renderer, and field metadata

Current dashboard layers stay in the `mock` workflow. `src/lib/gis/layerFactory.ts` reads those definitions and resolves them to the existing mock `GraphicsLayer` scene graphics from `src/lib/gis/mockSceneLayers.ts`, preserving the current parcel selection, layer toggles, and 3D mock visuals.

Future service-backed layers are represented as placeholder or disabled definitions in the registry. The factory has safe creation paths for `FeatureLayer`, `SceneLayer`, and `MapImageLayer`, but those paths no-op unless a layer is explicitly marked `live` and has a valid HTTPS ArcGIS service URL. This keeps production county services disconnected during Phase 1 while making the integration shape clear.

The service adapter in `src/lib/gis/gisServiceAdapter.ts` now exposes future-ready methods for retrieving layer definitions, creating one or many operational layers, syncing layer visibility, and updating opacity. Its current implementation remains mock-safe and frontend-only.

## Map Interaction Event Readiness

Map interaction events are now typed in `src/types/mapInteractions.ts` and coordinated through `src/lib/gis/mapInteractionController.ts`.

The current mock selection path is:

- `SceneViewContainer` registers ArcGIS `click` and lightweight `pointer-move` handlers after the SceneView is ready.
- `mapInteractionController` converts ArcGIS events into typed `MapClickEvent` and `MapHoverEvent` objects.
- On click, the controller runs `SceneView.hitTest`.
- If a mock graphic has a `parcelId`, the controller resolves it through the mock-safe GIS adapter and emits a typed selection event.
- Dashboard state receives the selection event and updates the selected parcel, parcel command panel, map label, and selected graphic styling.

Empty map clicks preserve the current selection. This matches the existing dashboard behavior and avoids accidental deselection while users orbit, pan, or click around the 3D scene. A typed `clearSelection` path exists in the controller for a future explicit clear-selection UI command.

The future identify/query path is prepared but not connected to production services. When a click does not resolve to a mock parcel graphic, the controller builds an `IdentifyQueryRequest` and routes it through `gisServiceAdapter.identifyFeatures`. The current adapter returns an empty mock-safe result; later phases can replace that method with real `FeatureLayer`, `SceneLayer`, or map-service identify/query logic.

## Shareable URL State

Dashboard intelligence state is synced to URL search params through `src/components/dashboard/DashboardUrlSync.tsx` and `src/lib/dashboard/urlState.ts`.

Supported params:

- `parcel`: selected mock parcel ID, for example `CAB-151-4823`
- `scenario`: active scenario horizon, for example `baseline`
- `year`: active simulation year, constrained to the current mock time horizon
- `intensity`: simulation intensity, constrained from `0` to `100`
- `layers`: comma-separated operational layer IDs, or `none` when every layer is off
- `role`: active frontend role preset, for example `county-executive` or `parcel-analyst`
- `compare`: active scenario comparison pair, for example `baseline,accelerated-growth`
- `briefing`: active mock briefing mode, for example `executive`, `planning`, `infrastructure`, or `risk`
- `report`: active mock report package, for example `executive-growth`
- `print`: active printable view mode, for example `briefing`, `summary`, `board-packet`, or `parcel-snapshot`
- `export`: active report intent, for example `executive`, `board`, `infrastructure`, `parcel`, or `scenario`

Valid URL params hydrate the dashboard on load. Parcel IDs are validated against the mock parcel data, scenario IDs against mock scenario presets, layer IDs against the layer registry, role IDs against the role registry, comparison pairs against mock comparison definitions, briefing modes against supported mock modes, report and print params against mock report registries, and workspace view modes against the workspace preset registry. Invalid values are ignored safely and do not connect to any production services.

Only meaningful dashboard state is URL-synced. Camera movement, tilt, zoom, and pointer movement are intentionally excluded for now so normal 3D navigation does not create noisy URLs. Future shareable intelligence views can add explicit map bookmarks once the view/camera model is designed.

## Command Palette And Search Readiness

The top search surface now opens a client-side command palette backed by:

- `src/components/dashboard/CommandPalette.tsx`
- `src/lib/dashboard/commandRegistry.ts`
- `src/lib/dashboard/searchMatcher.ts`
- `src/lib/dashboard/searchServiceAdapter.ts`
- `src/types/search.ts`

Supported mock searches include parcel IDs, parcel labels, zoning text, layer titles, layer categories, scenario names, comparison names, briefing titles, report packages, role names, event notices, workspace modes, and command keywords. Command actions can select mock parcels, toggle operational layers, switch scenario horizons, switch scenario comparison pairs, open mock executive briefings, run mock report exports, switch frontend role presets, set mock simulation year/intensity presets, and clear parcel selection.

When the command palette opens with no query, active-role command suggestions are prioritized from the role registry. This keeps the top command surface ready for role-aware workflows without connecting a service-backed search index.

The command palette does not write URL params directly. It calls the existing dashboard state actions, and `DashboardUrlSync` updates shareable URL state for parcel, scenario, simulation, and layer changes.

`searchServiceAdapter.ts` is the placeholder boundary for future service-backed parcel, place, layer, and command search. Phase 1 keeps that adapter frontend-only and mock-based; no production county services, backend search APIs, forecasting systems, or AI tools are connected.

## Executive View Modes And Workspace Readiness

The dashboard now supports mock operational view modes through:

- `src/types/workspace.ts`
- `src/lib/dashboard/workspacePresets.ts`
- `src/lib/dashboard/workspaceController.ts`
- `src/lib/dashboard/workspaceStorage.ts`
- `src/hooks/useWorkspaceState.ts`

Supported view modes are:

- `executive`: countywide summary of growth, readiness, revenue, and risk
- `parcel`: parcel intelligence and opportunity review
- `infrastructure`: service capacity and readiness review
- `growth`: development pressure and permit activity review
- `risk`: flood risk and constraint review
- `planning`: planning operations, policy, permits, and scenario envelopes

Each preset defines visible mock layers, a default scenario horizon, mock simulation settings, KPI focus metadata, panel preferences, map emphasis metadata, and section ordering metadata. The current UI applies the layer/scenario/simulation parts of each preset while preserving the existing dashboard shell.

Workspace mode is shareable through the `view` URL param, for example `?view=risk`. Invalid view values are ignored safely. Command palette search also includes view mode commands, and view changes still update URL state through `DashboardUrlSync` rather than duplicating URL logic.

`workspaceStorage.ts` defines a local saved-workspace shape and localStorage helper boundary for future saved layouts. No backend persistence, user accounts, production GIS services, forecasting, or AI systems are connected in Phase 1.

## Role-Based Dashboard Readiness

The dashboard now supports frontend-only stakeholder roles through:

- `src/types/userRoles.ts`
- `src/lib/dashboard/roleRegistry.ts`
- `src/lib/dashboard/roleController.ts`
- `src/hooks/useRoleState.ts`
- `src/components/dashboard/RoleIntelligencePanel.tsx`

Initial roles are:

- `county-executive`: countywide growth, infrastructure risk, critical notices, and executive KPI posture
- `planning-staff`: zoning review, permit activity, development pressure, and planning workflows
- `infrastructure-reviewer`: utility strain, transportation flags, corridor readiness, and risk overlays
- `parcel-analyst`: parcel boundaries, ownership review, nearby permit context, and identify/query focus

Each role defines a default workspace mode, visible mock operational layers, preferred scenario presets, preferred KPI cards, default dashboard panel metadata, frontend dashboard tools, mock map viewpoint metadata, command suggestions, role KPI summaries, and role-specific operational insights.

Switching roles from the top navigation or command palette applies the role preset through the same dashboard state actions used by workspace modes. Role changes update the active workspace mode, layer visibility, scenario posture, role-aware KPI ordering, default scenario comparison, briefing mode, role insight panel, and `role` URL param. Dashboard panels remain visually preserved in Phase 1; role panel metadata is exposed through state for future saved-layout and permission-aware rendering.

This is not authentication. There are no user accounts, permission checks, backend role assignments, or production authorization rules. Future auth can bind real users or groups to these role presets while preserving the frontend contract.

## Scenario Comparison And Executive Briefing Readiness

The dashboard now supports mock executive comparison workflows through:

- `src/types/scenarioComparison.ts`
- `src/data/mock/scenarioComparisonMockData.ts`
- `src/lib/dashboard/scenarioComparisonAdapter.ts`
- `src/hooks/useExecutiveBriefing.ts`
- `src/components/dashboard/ScenarioComparisonPanel.tsx`
- `src/components/dashboard/ExecutiveBriefingPanel.tsx`

Supported mock comparison workflows include:

- Baseline vs Accelerated Growth
- Baseline vs Infrastructure First
- Infill Priority vs Accelerated Growth
- Infrastructure First vs Accelerated Growth

Each comparison includes mock KPI deltas, trend direction, severity, fiscal opportunity shift, infrastructure readiness shift, parcel pressure shift, risk indicators, and executive narrative summaries. The intelligence panel presents a side-by-side comparison selector and a briefing-ready summary with top opportunities, top risks, infrastructure outlook, growth pressure summary, and mock recommendation text.

Comparison state is shareable through the `compare` URL param and briefing posture is shareable through the `briefing` URL param. Command palette search includes comparison and briefing commands such as `Compare Baseline vs Accelerated Growth` and `Open Executive Growth Brief`.

`scenarioComparisonAdapter.ts` is the future boundary for service-backed scenario analytics, PDF/report export, executive briefing packets, and AI-assisted briefing generation. Phase 1 remains mock-only: no forecasting engine, AI system, report renderer, or production county data service is connected.

## Export And Report Package Readiness

The dashboard now supports mock executive report and print workflows through:

- `src/types/reports.ts`
- `src/data/mock/reportMockData.ts`
- `src/lib/dashboard/reportExportAdapter.ts`
- `src/hooks/useExecutiveReports.ts`
- `src/components/dashboard/ExecutiveReportPanel.tsx`
- `src/components/dashboard/PrintLayoutPreview.tsx`

Supported mock report packages include:

- Executive Growth Briefing
- Infrastructure Readiness Packet
- Flood Risk Review Packet
- Parcel Opportunity Summary
- Scenario Comparison Export

The intelligence panel includes a report package selector, KPI summary blocks, mock export status, local export history, and a print-style preview surface for briefing, summary, board-packet, and parcel-snapshot modes. Export actions such as `Export Executive Packet`, `Open Print Layout`, `Generate Board Brief`, and `Export Scenario Comparison` update local dashboard state and URL-safe report params, but they do not generate real PDF files.

`reportExportAdapter.ts` is the future boundary for server-side PDF generation, board-packet automation, print rendering, citation-aware export packages, and AI-assisted report drafting. Phase 1 keeps this frontend-only and mock-based: no PDF service, document renderer, county record system, backend queue, or AI report generator is connected.

## Notification And Event Stream Readiness

The intelligence panel now includes a mock operational event stream backed by:

- `src/types/events.ts`
- `src/data/mock/eventsMockData.ts`
- `src/lib/dashboard/eventStreamAdapter.ts`
- `src/hooks/useOperationalEvents.ts`
- `src/components/dashboard/EventStreamPanel.tsx`

Supported mock event types include parcel alerts, permit activity, infrastructure flags, risk notices, zoning updates, system status messages, and scenario updates. Severities include `info`, `warning`, `critical`, and `success`.

The event stream can mark events read, dismiss events locally, filter to unread events, filter to the selected parcel, focus a related mock parcel, toggle a related mock layer, and switch a related scenario. These actions call existing dashboard state methods so parcel, layer, scenario, and URL/share behavior remain centralized.

Command palette search also includes recent operational events. Event commands jump to related parcel, layer, or scenario targets when mock target metadata exists.

`eventStreamAdapter.ts` is the future boundary for service-backed permit feeds, infrastructure alerts, risk notifications, scenario notices, and system status messages. Phase 1 keeps event state local to the browser; read/dismiss/filter state is not written to URL params and no production notification service is connected.

## Phase 1 Polish And Resilience

The dashboard shell has a targeted polish pass for responsive behavior, safer state surfaces, and accessibility readiness.

Responsive notes:

- Desktop keeps the three-zone operating layout: control rail, dominant SceneView, and intelligence rail.
- Tablet widths give the SceneView a full-width row, then place the control and intelligence rails below it.
- Narrow widths stack the map, controls, intelligence panels, and metrics with scroll-safe overflow.
- SceneView overlays compress on smaller screens so selected parcel labels and KPI stat chips do not push outside the map frame.

Accessibility and interaction improvements include:

- Clearer ARIA labels for command palette controls, report actions, event actions, sliders, layer toggles, and map viewport regions.
- Keyboard-visible focus rings for buttons, inputs, and selects.
- Command palette close affordance, escape handling, body-scroll containment, safer result scrolling, and a stronger no-results state.
- Active/inactive layer badges, mock-source badges, role/workspace status labels, event read/unread affordances, and mock-only report/export labels.
- Safer empty states for no reports, no comparisons, no command results, no matching events, no selected parcel, SceneView loading, and SceneView degraded/error states.

Remaining limitations:

- The app is still frontend-only and mock-backed.
- Production county services remain disconnected.
- Report/export buttons prepare local mock state only; no real PDF or print renderer is connected.
- Event read/dismiss/filter state is local to the browser session.
- Camera bookmarks and responsive map-view presets are not persisted yet.

## GIS Service Onboarding And Contract Readiness

Phase 1 now includes a planning-only architecture for future Cabarrus County ArcGIS service onboarding. No production GIS services are connected.

Core files:

- `src/types/gisContracts.ts` defines service definitions, layer contracts, field mappings, ownership metadata, connection statuses, parcel query contracts, and migration planning result types.
- `src/lib/gis/serviceRegistry.ts` lists safe placeholder candidate services for parcels, zoning, future land use, floodplain, transportation, utilities, and permit activity.
- `src/lib/gis/layerContractTemplates.ts` defines reusable contract templates for parcel, zoning, infrastructure, permit, and operational event layers.
- `src/lib/gis/gisIntegrationPlanner.ts` provides mock-safe planning helpers for contract validation, service readiness summaries, mock-to-live comparisons, migration planning, and integration risk summaries.
- `src/lib/gis/environmentConfig.ts` documents local, staging, production-disabled, and production environment modes. Live connections remain disabled in every Phase 1 mode.
- `src/components/dashboard/GISIntegrationReadinessPanel.tsx` surfaces candidate service readiness, onboarding stages, field mapping counts, disabled-production status, and first migration blockers inside the control rail.

Supported planning concepts:

- ArcGIS service candidates: parcel feature service, zoning feature layer, future land-use layer, floodplain map layer, transportation layer, utilities infrastructure layer, and permit activity service.
- Layer contracts: expected geometry type, ArcGIS service type, target mock replacement layer, required fields, optional fields, display labels, popup expectations, renderer expectations, and search fields.
- Ownership metadata: department, steward role, technical owner placeholder, update authority, and data sensitivity.
- Readiness statuses: `planned`, `schema-review`, `ready-for-testing`, `staging`, `disconnected`, and `production-disabled`.
- Environments: `local`, `staging`, `production-disabled`, and reserved `production`.

The registry uses `example.invalid` placeholder URLs only. This prevents accidental production service usage while still documenting the future onboarding shape. Real service activation should happen later through an approved environment strategy, reviewed field mappings, data-owner signoff, and a token/auth approach that does not leak credentials into client code.

Mock-to-live migration path:

1. Confirm service ownership, refresh cadence, and data sensitivity.
2. Validate the service schema against the layer contract template.
3. Test in a staging environment with mock fallback still available.
4. Update the operational layer registry only after approval.
5. Recheck SceneView rendering, URL state, identify/query, popups, reports, and command search after each layer migration.

## Initial Dataset Inventory And Data Registry

Phase 1 now includes a static CFS data registry for future GIS, planning, infrastructure, risk, demographic, and reporting datasets. This is a governance and planning layer only; it does not connect live data.

Core files:

- `src/types/dataRegistry.ts` defines dataset entries, categories, source types, geometry types, refresh cadences, access levels, quality statuses, integration statuses, owner metadata, field mappings, and usage contexts.
- `src/data/mock/dataRegistryMockData.ts` contains the first mock inventory entries.
- `src/lib/data/dataRegistry.ts` provides helpers for retrieving datasets, filtering by category/status, calculating readiness summaries, identifying risks, and checking references to service/layer/contract registries.
- `src/components/dashboard/DataRegistryPanel.tsx` displays dataset count, integration status summary, high-priority datasets, unknown/blocker warnings, and compact dataset readiness badges in the control rail.

Initial dataset categories include:

- Parcels
- Zoning
- Future Land Use
- Floodplain
- Roads / Transportation
- Utilities / Infrastructure
- Permit Activity
- Building Footprints
- Census / Demographics
- Parks / Public Facilities

Each registry entry tracks dataset name, category, expected geometry, source owner/steward placeholder, source type, access level, refresh cadence, quality status, integration status, expected key fields, related CFS layer ID, related service registry ID, notes, risks, and unknowns.

High-priority datasets for early Phase 2 planning are:

- `Parcels`: required for live identify/query and parcel intelligence.
- `Zoning`: required for planning review and parcel context.
- `Floodplain`: required for risk review and executive constraint reporting.
- `Utilities / Infrastructure`: required for readiness scoring but production-disabled until security review.
- `Permit Activity`: best candidate for a first approved non-production service pilot if staging access exists.

Supported dataset integration statuses are `mocked`, `candidate`, `contract-draft`, `schema-review`, `ready-for-staging`, `blocked`, `production-disabled`, and `not-started`.

Dataset registry entries reference the GIS service onboarding system through stable IDs such as `relatedServiceRegistryId`, `layerContractId`, and `relatedCfsLayerId`. This lets Phase 2 compare a dataset record, service candidate, layer contract, and dashboard layer before replacing any mock data.

Remaining unknowns include approved field lists, authoritative service endpoints, ownership signoff, refresh cadences, sensitive attribute handling, staging availability, and future token/auth strategy. All entries remain mock/static and frontend-only.

## Phase 5 API Integration Foundation

The frontend now has a feature-flagged FastAPI integration layer that allows backend-backed data to be adopted one dashboard surface at a time while preserving generated static artifacts.

Core files:

- `src/lib/api/client.ts` defines the frontend API client, base URL handling, GET helper, timeout behavior, and API error wrapper.
- `src/lib/api/parcels.ts` exposes typed parcel API methods for detail, search, filter, statistics, zoning summary, and governance warnings.
- `src/lib/api/development.ts` exposes typed development activity API methods for statistics, trends, hotspots, zoning summary, activity summary, temporal queries, and lookup options.
- `src/types/api/` mirrors the current FastAPI response schemas for frontend consumption.
- `src/lib/adapters/parcelDashboardMetricsAdapter.ts` normalizes backend parcel statistics and existing static parcel artifacts into the same UI shape.
- `src/lib/adapters/parcelStatisticsAdapter.ts` normalizes `GET /parcels/statistics` quality-status buckets into the Parcel Quality panel shape.
- `src/lib/adapters/parcelZoningSummaryAdapter.ts` normalizes `GET /parcels/zoning-summary` jurisdiction summaries into the Zoning Distribution panel shape.
- `src/lib/adapters/parcelGovernanceWarningsAdapter.ts` normalizes `GET /parcels/governance-warnings` warning summaries into the Governance Warnings panel shape.
- `src/lib/adapters/parcelSearchAdapter.ts` normalizes `GET /parcels/search` responses into the existing Parcel Discovery UI record shape.
- `src/lib/adapters/parcelFilterAdapter.ts` normalizes `GET /parcels/filter` responses into the existing Parcel Discovery UI record shape while preserving static owner and mailing context when available.
- `src/lib/adapters/parcelDetailAdapter.ts` normalizes `GET /parcels/{official_parcel_id}` responses into the existing Parcel Detail Drawer record shape.
- `src/lib/adapters/developmentStatisticsAdapter.ts` normalizes `GET /development/statistics` responses into core development metrics and activity class cards.
- `src/lib/adapters/developmentActivitySummaryAdapter.ts` normalizes `GET /development/activity-summary` broad rollups, including total permit amount and recent activity windows.
- `src/lib/adapters/developmentTrendsAdapter.ts` normalizes `GET /development/trends` annual and monthly trends into the existing timeline card shape.
- `src/lib/adapters/developmentHotspotsAdapter.ts` normalizes `GET /development/hotspots` rows into the top active parcel card shape.
- `src/lib/adapters/developmentZoningSummaryAdapter.ts` normalizes `GET /development/zoning-summary` rows into the permit density by zoning card shape.
- `src/lib/adapters/temporalQueryAdapter.ts` normalizes `GET /development/temporal-query` responses into the Temporal Analysis panel shape.
- `src/hooks/useParcelDashboardMetrics.ts` owns the first feature-flagged API handoff.
- `src/hooks/useParcelQualityMetrics.ts`, `src/hooks/useParcelZoningSummaryMetrics.ts`, and `src/hooks/useParcelGovernanceWarningsMetrics.ts` keep parcel summary panel API calls and fallbacks independent.
- `src/hooks/useDevelopmentStatistics.ts`, `src/hooks/useDevelopmentActivitySummary.ts`, `src/hooks/useDevelopmentTrends.ts`, `src/hooks/useDevelopmentHotspots.ts`, and `src/hooks/useDevelopmentZoningSummary.ts` keep development dashboard panel API calls and fallbacks independent.
- `src/hooks/useTemporalQuery.ts` keeps the Temporal Analysis panel API call and fallback independent.

Feature flags:

- `NEXT_PUBLIC_USE_BACKEND_API=false` keeps the dashboard in the existing static/generated-output mode.
- `NEXT_PUBLIC_USE_BACKEND_API=true` lets the first migrated dashboard surface request the FastAPI backend.
- `NEXT_PUBLIC_CFS_API_BASE_URL=http://127.0.0.1:8000` configures the local FastAPI base URL.

Current migration status:

- Migrated: `ParcelIntelligencePanel` can load `GET /parcels/statistics` when the backend feature flag is enabled.
- Migrated: `ParcelQualityPanel` can load quality buckets from `GET /parcels/statistics` when the backend feature flag is enabled.
- Migrated: `ZoningDistributionPanel` can load jurisdiction coverage from `GET /parcels/zoning-summary` when the backend feature flag is enabled.
- Migrated: `GovernanceWarningsPanel` can load warning summaries from `GET /parcels/governance-warnings` when the backend feature flag is enabled.
- Migrated: `ParcelSearchPanel` can call `GET /parcels/search` for searches of three or more characters when the backend feature flag is enabled.
- Migrated: `ParcelFilterPanel` can call `GET /parcels/filter` for structured filter-only parcel discovery when the backend feature flag is enabled.
- Migrated: `ParcelDetailDrawer` can hydrate selected search results from `GET /parcels/{official_parcel_id}` when the backend feature flag is enabled.
- Migrated: `DevelopmentActivityPanel` can load `GET /development/statistics` and `GET /development/activity-summary` when the backend feature flag is enabled.
- Migrated: `DevelopmentTrendPanel` can load `GET /development/trends` when the backend feature flag is enabled.
- Migrated: `DevelopmentHotspotsPanel` can load `GET /development/hotspots` when the backend feature flag is enabled.
- Migrated: `DevelopmentZoningPanel` can load `GET /development/zoning-summary` when the backend feature flag is enabled.
- Migrated: `TemporalAnalysisPanel` can load `GET /development/temporal-query` when the backend feature flag is enabled.
- Preserved: static parcel metrics and `public/intelligence/parcel-search-index.json` remain the immediate fallback and the default mode.
- Preserved: generated development activity artifacts remain the fallback for all migrated development panels.
- Preserved: generated temporal artifacts remain the fallback for the Temporal Analysis panel.
- Not migrated yet: Command Palette, reports, event stream, and SceneView still use their existing static or mock pathways.

This keeps frontend and backend migration reversible. If the backend is unavailable, times out, or returns an invalid shape, migrated parcel surfaces fall back to generated static artifacts without changing the rest of the dashboard.

Parcel Search API behavior:

- Blank searches can use the backend parcel filter endpoint when the backend flag is enabled.
- Queries shorter than three characters with typed text stay on the generated static search index.
- Queries of three or more characters call `GET /parcels/search` when `NEXT_PUBLIC_USE_BACKEND_API=true`.
- Supported backend filters are passed through for zoning jurisdiction, zoning category, parcel quality status, zoning confidence, and valuation band.
- When a text search is active, subdivision, neighborhood, zoning code, parcel size, safe-for-dashboard, and governance warning filters remain client-side filters over the normalized result set.
- Selected search results still open the existing parcel detail drawer and can dispatch SceneView-safe map focus when backend `map_focus` data is available.

Parcel Filter API behavior:

- With `NEXT_PUBLIC_USE_BACKEND_API=true` and no active text search, structured filter changes call `GET /parcels/filter`.
- Supported backend filters include zoning jurisdiction, zoning category, zoning code, parcel quality status, zoning confidence, governance warning, valuation band, parcel size category, subdivision, neighborhood, safe-for-dashboard, limit, and offset.
- Backend filter rows are normalized into the existing Parcel Discovery result shape, then merged with static search-index records when available so owner and mailing context remain visible.
- If the filter endpoint fails, times out, or returns an invalid shape, Parcel Discovery falls back to the generated static search index and shows a non-blocking fallback status.
- The static search index remains the default mode when `NEXT_PUBLIC_USE_BACKEND_API=false`.

Parcel Summary Panel API behavior:

- `ParcelIntelligencePanel` and `ParcelQualityPanel` can request `GET /parcels/statistics` when `NEXT_PUBLIC_USE_BACKEND_API=true`.
- `ZoningDistributionPanel` can request `GET /parcels/zoning-summary` when `NEXT_PUBLIC_USE_BACKEND_API=true`.
- `GovernanceWarningsPanel` can request `GET /parcels/governance-warnings` when `NEXT_PUBLIC_USE_BACKEND_API=true`.
- Each panel owns its own request and fallback state, so one backend failure does not downgrade every parcel intelligence panel.
- API, loading, static, and fallback badges identify the active source for each panel.
- If an endpoint fails, times out, or returns an invalid shape, only that panel falls back to its generated static artifact data.

Development Dashboard API behavior:

- `DevelopmentActivityPanel` can request `GET /development/statistics` for core metrics and `GET /development/activity-summary` for broad rollups.
- `DevelopmentTrendPanel` can request `GET /development/trends` for annual and monthly permit timelines.
- `DevelopmentHotspotsPanel` can request `GET /development/hotspots` for top active parcels.
- `DevelopmentZoningPanel` can request `GET /development/zoning-summary` for permit density by zoning jurisdiction, code, and category.
- Each development panel owns its own request and fallback state, so one backend failure does not downgrade every development panel.
- API, loading, static, and fallback badges identify the active source for each panel.
- If an endpoint fails, times out, or returns an invalid shape, only that panel falls back to generated static development activity artifacts.

Temporal Panel API behavior:

- `TemporalAnalysisPanel` can request `GET /development/temporal-query` when `NEXT_PUBLIC_USE_BACKEND_API=true`.
- Supported API filters are year, month, `date_start`, `date_end`, `rolling_window`, permit type, work type, zoning jurisdiction, zoning category, and activity class.
- The temporal hook passes `limit=50` and leaves `bbox` and `include_geometry` inactive because map extent filtering is not connected yet.
- The trend summary and query preview use a normalized API/static view model, so backend responses and generated artifacts render through the same UI surface.
- If the temporal endpoint fails, times out, or returns an invalid shape, only the Temporal Analysis panel falls back to generated static temporal artifacts.
- SceneView playback, map layer filtering, and hotspot geometry rendering remain disconnected.

Parcel Detail API behavior:

- Selected search results open immediately using the existing static/search record.
- When `NEXT_PUBLIC_USE_BACKEND_API=true`, the drawer requests `GET /parcels/{official_parcel_id}` and overlays backend parcel detail fields when available.
- Backend detail hydration preserves static owner and mailing context because those fields are not part of the current parcel detail response yet.
- If the backend request fails, times out, returns `404`, or returns an invalid shape, the drawer keeps rendering the static selected parcel record and shows a non-blocking fallback status.
- Backend-enriched detail fields include `objectid_1`, market value, assessed value, valuation band, parcel size category, parcel quality status, zoning jurisdiction/code/category/confidence, governance warnings, safe-for-dashboard status, and planning jurisdiction.

Selected Parcel card behavior:

- `src/components/dashboard/ParcelSummaryPanel.tsx` now uses the selected Parcel Discovery record instead of the old mock parcel summary.
- When FastAPI detail hydration succeeds, the card displays real selected parcel intelligence: official parcel ID, PIN14, owner/account label when available, subdivision, neighborhood, zoning jurisdiction/code/category/confidence, assessed value, market value, valuation band, parcel size category, parcel quality status, safe-for-dashboard status, and governance warning categories.
- When backend detail is unavailable, the card preserves the selected static/search record and marks the source as static or fallback.
- When no parcel is selected, the card shows a clean empty state: “No parcel selected” and “Search and select a parcel to view live parcel intelligence.”
- `src/components/dashboard/SelectedParcelDevelopmentActivityPanel.tsx` now appears below the selected parcel card and shows real matched Real Property Permit activity for the active parcel when available.
- When `NEXT_PUBLIC_USE_BACKEND_API=true`, the panel requests `GET /development/hotspots?official_parcel_id={official_parcel_id}&limit=1` and displays total permits, latest permit date/status, dominant permit type, dominant work type, activity class, recent 1-year and 3-year counts, permit amount totals, first permit year, latest permit year, and active permit-year count.
- If the selected parcel has no activity row, the panel says “Development activity not yet available for this parcel.” If the backend is unavailable, it falls back only to generated top-activity parcel artifacts when the selected parcel is present there.
- `src/components/dashboard/SelectedParcelPermitEventsPanel.tsx` now appears below the selected parcel development activity card and lists the latest real permit events tied to the active parcel.
- When `NEXT_PUBLIC_USE_BACKEND_API=true`, the permit event panel requests `GET /development/parcel/{official_parcel_id}/permits` and displays date, permit type, work type, status, permit amount, permit number/ID, and relationship confidence for the latest 10 events.
- Permit event rows use `public.real_property_permit_parcel_relationship` through the backend endpoint. There is no static permit-event fallback and no use of the old 2015 `permit_activity_clean` pilot layer.
- Speculative demo metrics such as development pressure, infrastructure readiness, redevelopment potential, and tax opportunity are no longer shown as selected-parcel facts.

Intelligence Panel structure:

- `src/components/dashboard/IntelligencePanel.tsx` is organized behind a full-width section selector so the narrow right rail can scale beyond five intelligence modules without truncated horizontal tabs.
- The default `Overview` section now focuses on the selected parcel workflow: selected parcel card, selected parcel development activity, selected parcel permit events, and three compact countywide headline cards for total parcels, zoned parcels, and parcels with permit activity.
- When no parcel is selected, selected-parcel-specific activity and permit event panels stay in a `Waiting for parcel selection` state and do not request selected-parcel APIs.
- The `Parcel Intelligence` section contains Parcel Discovery/Search/Filter, the full Phase 2 parcel core metrics panel, zoning distribution, governance warnings, and parcel quality panels.
- The `Development Activity` section contains the full Phase 3 development activity metrics panel, development trend, hotspot summary, and zoning-development summary panels. The real Development Hotspots map toggle remains in the visible Operational Layers registry, not inside the Intelligence Panel.
- The `Temporal Analysis` section contains the temporal analysis, filters, trend summary, and query preview surface.
- The `System Status` section contains API/static mode status, scenario snapshot, executive briefing/report surfaces, role intelligence, operational events, mock parcel watchlist, and remaining mock/static caveats.
- The panel header and System Status section show whether the dashboard is running in FastAPI-backed mode or generated static fallback mode. API-integrated panels still preserve their independent static fallback behavior.

## Phase 6 GIS Map Intelligence

Phase 6 has started with a map-safe parcel focus bridge between real parcel detail responses and the ArcGIS SceneView. Backend parcel detail now returns governed `map_focus` centroid and extent fields, plus opt-in `highlight_geometry` for selected parcel boundary display. The frontend can zoom the SceneView, draw a lightweight temporary focus marker, and outline the actively selected parcel without replacing the existing mock GraphicsLayer system.

Core files:

- `src/types/map/parcelFocus.ts` defines the parcel map focus contract, optional centroid, extent, selected-parcel highlight geometry, focus source, and focus status.
- `src/hooks/useParcelMapFocus.ts` owns selected parcel focus state, clear behavior, readiness status, focus request dispatch, and SceneView result handling.
- `src/lib/map/parcelMapFocus.ts` validates whether a parcel focus request has enough spatial information and emits typed focus request/result events.
- `src/lib/adapters/parcelDetailAdapter.ts` maps backend `map_focus.centroid`, `map_focus.extent`, and opt-in `highlight_geometry` into the frontend `ParcelMapFocus` contract.
- `src/components/dashboard/ParcelSearchPanel.tsx` now creates a parcel focus object when a parcel result is selected from search or command inspection.
- `src/components/dashboard/ParcelDetailDrawer.tsx` requests `GET /parcels/{official_parcel_id}?include_geometry=true` after a parcel result is selected, hydrates map focus from backend parcel detail, and surfaces focus status alongside FastAPI/static detail source status.
- `src/components/gis/SceneViewContainer.tsx` listens for parcel focus requests, calls `SceneView.goTo()` with centroid/extent targets, converts selected parcel GeoJSON `Polygon` or `MultiPolygon` into ArcGIS polygon rings, and maintains a non-destructive temporary focus marker/cage highlight layer.
- `src/hooks/useDevelopmentHotspotLayer.ts` loads map-safe hotspot marker candidates from `GET /development/hotspots?permit_segment={selected_segment}&limit=100` only when the layer toggle is enabled and a permit segment has been selected.
- `src/lib/adapters/developmentHotspotMapAdapter.ts` converts backend hotspot rows into map marker objects only when real centroid coordinates are present.
- `src/types/map/developmentHotspots.ts` defines the temporary hotspot layer state, marker contract, and layer status labels.

Current map focus status:

- `GET /parcels/{official_parcel_id}` can provide `map_focus.centroid.longitude`, `map_focus.centroid.latitude`, `map_focus.extent`, and `spatial_reference.wkid = 4326`.
- `GET /parcels/{official_parcel_id}?include_geometry=true` can also provide lightweight `highlight_geometry` for the selected parcel only.
- Typing/searching alone does not request or draw parcel boundaries. A boundary is highlighted only after the user clicks/selects a parcel result.
- When backend focus data and highlight geometry are available, parcel detail hydration dispatches a SceneView-safe focus request and the drawer can move from `Map focus ready` to `Parcel boundary highlighted`.
- Selected parcel boundaries render as a low translucent 3D cage/extrusion tied to ground placement instead of a flat offset fill. The cage keeps the parcel footprint readable in SceneView while letting buildings and property context remain visible through the highlight.
- If geometry is unavailable but centroid/extent exists, the SceneView keeps zoom and marker behavior and reports `Focused on map - boundary unavailable`.
- If backend focus data is missing, unavailable, or the SceneView is not ready, the drawer falls back to `Map focus pending geometry` or `Map focus failed` without breaking the dashboard.

Development hotspot map status:

- The visible `Permit Activity` row in the layer registry is repurposed and labeled as `Development Hotspots` when backend API mode is enabled. It controls the real temporary hotspot overlay instead of the old disabled mock permit layer.
- The `Development Hotspots` layer registry toggle is off by default.
- When enabled in backend API mode, the layer first asks the user to choose a
  permit segment. No generic all-permit markers are rendered until a segment is
  selected.
- The primary control is `Show permit concentration by`, with residential
  growth, commercial activity, redevelopment signal, minor maintenance,
  demolition, industrial activity, and institutional activity options.
- Segment selection calls the real development hotspots endpoint with
  `permit_segment={selected_segment}` and renders only parcels relevant to that
  selected segment in a dedicated `cfs-development-hotspots-layer`.
- Secondary filters for activity class, recent activity window, zoning
  jurisdiction, growth signal, status stage, value class, sort order, and result
  limit are collapsed under `Advanced filters`. Filter changes refetch
  `GET /development/hotspots` and clear/re-render the temporary marker layer.
- The hotspot layer also listens to the shared Temporal Analysis state. When the Temporal Analysis panel selects a year, month, date range, or rolling 12/36-month window, the hotspot request automatically includes `year`, `month`, `date_start`, `date_end`, and/or `rolling_window` so map markers reflect the active time context while preserving manual hotspot permit segment, activity class, jurisdiction, sort, and limit controls.
- The layer row displays the active temporal context, such as `2025 activity context` or `Rolling 12 month activity context`, and reports an empty state when no hotspots match the temporal filters.
- The hotspot row includes a simplified selected-segment legend. Color and shape
  match the chosen permit segment, while marker size uses three tiers based on
  selected segment permit concentration.
- Hotspot marker clicks disable the default ArcGIS popup and show a custom draggable map-overlay info card away from the top-center parcel focus beacon. The card shows parcel ID, PIN, selected permit segment, selected segment permit count, total permit count, recent 1-year permits, recent 3-year permits, activity class, dominant segment, growth signal, planning domain, high/major value permit counts, zoning jurisdiction, and zoning code.
- The hotspot layer does not use generated static artifacts because those do not carry map-safe coordinates. If the backend is unavailable or no coordinates are present, the UI reports an unavailable state and draws nothing.
- Hotspot marker clicks dispatch the existing parcel inspection event, so selected parcel detail hydration, selected parcel card updates, parcel boundary highlight, development activity, and permit event panels all reuse the same selected parcel flow.
- The layer clears all hotspot graphics when the toggle is disabled and never adds a permanent parcel or permit layer.

Safe SceneView behavior:

- Parcel selections create `ParcelMapFocus` objects with official parcel ID, PIN14, and focus source.
- If centroid, extent, and highlight geometry are missing, `resolveParcelMapFocus()` returns a no-op result instead of touching ArcGIS runtime objects.
- The focus marker and selected parcel boundary live in a dedicated hidden `cfs-parcel-focus-layer`, so existing mock GraphicsLayers, mock parcel hit-tests, layer toggles, and selection symbols remain unchanged.
- Development hotspot markers live in a separate hidden `cfs-development-hotspots-layer`, keeping hotspot rendering independent from selected parcel focus graphics.
- The focus layer is cleared during SceneView cleanup and is recreated only inside the client-side ArcGIS lifecycle.
- Each new selected parcel clears the previous marker/boundary before rendering the new one. Search result lists are never highlighted as a group.
- The selected parcel focus marker scales with SceneView zoom. It remains prominent when zoomed out, then becomes a smaller translucent ring at close parcel zooms so it does not obscure the selected parcel boundary highlight.

Future path:

- Temporal map filtering and playback
- Permit hotspot heat/cluster styling after map extent and performance guardrails are defined

## Dashboard State Architecture

Dashboard interaction state is exposed through `useDashboardState`, but the implementation is split into smaller hooks:

- `useLayerVisibility` controls active operational layer IDs and validates them against the layer registry.
- `useSelectedParcel` tracks selected parcel IDs, mock SceneView selections, real/static selected parcel intelligence records, source status, and clear/select actions.
- `useScenarioState` owns the active scenario horizon, simulation year, and intensity.
- `useMapInteractionState` owns SceneView status and error state.
- `useRoleState` owns the active frontend stakeholder role and role preset metadata.
- `useWorkspaceState` owns the active executive view mode and preset metadata.
- `useExecutiveBriefing` owns the active scenario comparison pair, briefing mode, mock narrative selection, comparison metrics, and briefing sections.
- `useExecutiveReports` owns the active report package, print mode, export intent, mock export state, and mock export history.
- `useOperationalEvents` owns mock event read, dismiss, filter, count, and selected-parcel event state.

The public dashboard API remains simple for UI components, while the internals are ready for future URL state and service-backed GIS workflows.

`src/lib/dashboard/urlState.ts` provides serialization and deserialization helpers for URL-safe dashboard state, including selected parcel ID, active scenario, simulation controls, active layer IDs, workspace view mode, active role, active comparison pair, briefing mode, active report package, print mode, and report export intent. `src/components/dashboard/DashboardUrlSync.tsx` hydrates valid values from the URL on load and updates the browser URL when those dashboard states change.

`src/lib/gis/gisServiceAdapter.ts` defines the mock implementation of the future GIS service boundary. The contract in `src/types/gisServices.ts` includes future methods for loading operational layer definitions, creating ArcGIS runtime layers, querying parcels, querying features by extent, syncing layer visibility, and updating opacity. Phase 1 keeps these methods mock/no-op where appropriate so real services can be connected later without rewriting dashboard components.

## Next Step

Next planned task: Phase 6 Temporal Map Filter Readiness.

That task should prepare SceneView-safe time-filtered map requests and layer-state boundaries while keeping animated playback separate.
