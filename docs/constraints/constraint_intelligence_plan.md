# Constraint Intelligence Plan

Cabarrus FutureScape Phase 7 planning foundation for parcel-level constraint
intelligence. This is a planning and governance artifact only. It does not
ingest layers, modify PostGIS schemas, build APIs, build frontend panels,
change SceneView behavior, or introduce forecasting.

## Purpose

Constraint Intelligence will help CFS explain where growth opportunity is
limited or requires review because parcel, infrastructure, public service, or
environmental conditions create approval, cost, safety, or timing risk.

Phase 7 should begin with deterministic spatial overlays and transparent
governance rules. Forecasting should wait until source datasets, parcel joins,
quality flags, severity definitions, and human review workflows are stable.

## Starting Domains

Phase 7 starts with two domains:

1. Flood / Floodway Constraint
2. School Capacity / District Constraint

These are intentionally different kinds of constraints:

- Flood constraints are primarily spatial polygon overlays against parcels.
- School constraints begin as district/assignment context and may later become
  capacity pressure intelligence when enrollment and utilization data are
  approved.

## Top Constraint Categories

1. Flood / Floodway Constraint
2. School Capacity / District Constraint
3. Transportation Access Constraint
4. Water / Sewer Constraint
5. Fire / EMS Coverage Constraint
6. Heat / Impervious / Runoff Constraint
7. Environmental Sensitivity Constraint

## Future Source Tables

Phase 7 should create these tables only when ingestion work begins:

- `public.constraint_layer_registry`
- `public.parcel_constraint_overlay`
- `public.parcel_constraint_summary`
- `public.parcel_constraint_flags`
- `public.parcel_constraint_score`

No schema changes are part of this planning task.

## Future Table Roles

`public.constraint_layer_registry`

- One row per governed constraint source layer.
- Tracks source name, category, jurisdiction, steward, refresh cadence,
  geometry type, source authority, effective date, access level, and readiness.

`public.parcel_constraint_overlay`

- One row per parcel/constraint feature intersection or assignment.
- Stores overlap area, overlap percentage, distance where relevant, severity,
  method, source layer ID, and QA flags.

`public.parcel_constraint_summary`

- One row per parcel with summarized constraint posture.
- Stores dominant constraint category, highest severity, total constrained area,
  review flags, and dashboard-safe status.

`public.parcel_constraint_flags`

- One row per parcel/flag category.
- Supports transparent dashboard badges, review queues, and export/report
  packages.

`public.parcel_constraint_score`

- One row per parcel with normalized score fields.
- Stores `constraint_score`, severity class, buildability impact, scoring
  version, and source freshness metadata.

## Implementation Order

1. Register/validate FEMA NFHL URLs. Complete.
2. Ingest FEMA NFHL Layer 28 Flood Hazard Zones for the Cabarrus County extent.
   Complete in Phase 7A.
3. Clean flood hazard zones. Complete in Phase 7A.
4. Overlay flood hazard zones with parcels. Complete in Phase 7B.
5. Generate parcel flood flags/scores. Complete in Phase 7B.
6. Plan flood constraint API/frontend integration.
7. Compare/reference the existing Google Cloud flood TIFF later.
8. Add school constraint ingestion + parcel overlay.
9. Add transportation access.
10. Add water/sewer readiness.
11. Add fire/EMS coverage.
12. Add heat/impervious/runoff.
13. Add environmental sensitivity.
14. Add multi-constraint overlay score.
15. Add forecasting/prediction only after deterministic constraint overlays and
    governance are stable.

## Registered Flood Source Authority

Phase 7 flood source registration records FEMA NFHL as the authoritative
regulatory source and preserves the existing Google Cloud TIFF as modeled/static
reference:

- Primary: FEMA NFHL Flood Hazard Zones, Layer 28,
  `https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28`
- QA/reference: FEMA NFHL Flood Hazard Boundaries, Layer 27,
  `https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/27`
- Future hydrology/reference: FEMA NFHL Water Areas, Layer 32,
  `https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/32`
- Modeled/static reference: existing Google Cloud flood TIFF in
  `gs://cfs-model-data-khoi/`

Documented local validation commands:

```powershell
gcloud config get-value project
gcloud storage ls gs://cfs-model-data-khoi/metadata/cfs_engine_registry/
```

Expected Google Cloud project:

```text
newproject-461002
```

Do not delete, overwrite, or demote the existing TIFF. It remains valuable for
future raster comparison and prediction inputs, but FEMA NFHL Layer 28 should be
used first for regulatory parcel flood constraints.

Phase 7A FEMA Layer 28 ingestion result:

- Cabarrus extent source: `public.parcels_enriched`
- Extent method: `ST_Extent(geometry)` converted to an ArcGIS REST envelope
- Raw table: `public.fema_nfhl_flood_zones_raw`
- Clean table: `public.fema_nfhl_flood_zones_clean`
- Raw/clean feature count: `7,712`
- Clean geometry: `ST_MultiPolygon`, SRID `4326`, `0` invalid geometries
- Primary fields discovered: `FLD_ZONE`, `ZONE_SUBTY`, `SFHA_TF`
- Next table work: parcel flood constraint overlay, summary, flags, and score

Phase 7B parcel flood overlay result:

- Overlay table: `public.parcel_flood_constraint_overlay`
- Row count: `110,017`, matching `public.parcels_enriched`
- Floodplain present: `8,661` parcels
- Floodway present: `3,229` parcels
- SFHA present: `7,254` parcels
- Flood review required: `7,989` parcels
- High/severe buildability impact: `6,362` parcels
- Clean output geometry: `ST_MultiPolygon`, SRID `4326`, `0` invalid
  geometries
- Next work: flood constraint API contract/planning and dashboard-safe display
  review

## Overlay Principles

- Keep every domain auditable back to source layer, source feature ID, and
  scoring rule version.
- Use deterministic geospatial methods before predictive methods.
- Preserve raw source attributes alongside normalized CFS fields.
- Store parcel-level flags separately from scores so review workflows can
  explain why a parcel was flagged.
- Surface uncertainty as data quality status, not as hidden filtering.
- Maintain `dashboard_safe` separately from severity. A severe but well-sourced
  floodway flag can be dashboard-safe; an uncertain school capacity estimate may
  require review.

## Forecasting Should Wait

Forecasting should not start in Phase 7 because:

- Constraint source authority and refresh cadence are not fully governed yet.
- School capacity and enrollment data may require ownership, privacy, and
  interpretation review.
- Multiple constraint domains use different geometry and severity models.
- Parcel overlay QA must be measured before model features can be trusted.
- Executive users need transparent deterministic flags before probabilistic
  growth projections.
- Future forecasts should be trained against stable, reviewed historical data
  and should expose confidence, assumptions, and governance limits.

## Phase 7 Readiness Definition

Constraint Intelligence is ready for implementation when each selected source
has:

- approved steward and owner metadata
- source URL or file delivery path
- source access classification
- geometry type and spatial reference
- key fields and severity fields
- refresh cadence
- overlay method
- QA checks
- dashboard-safe display fields
- review-required conditions
