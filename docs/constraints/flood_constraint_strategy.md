# Flood Constraint Strategy

Flood constraints are the recommended first Phase 7 ingestion and parcel overlay
layer because the project already carries mock flood risk context and an
existing floodplain candidate service placeholder.

Phase 7A now ingests the authoritative FEMA NFHL Layer 28 flood hazard zones for
the Cabarrus parcel extent. This document records the source authority, current
ingestion result, and the future parcel overlay rules. It does not connect a
frontend flood panel, modify SceneView, compare the Google Cloud TIFF, or build
forecasting.

## Purpose

Flood Constraint Intelligence should identify parcels affected by floodplain or
floodway geography and explain how much of each parcel is constrained.

Primary use cases:

- selected parcel risk context
- executive flood review packets
- dashboard-safe constraint flags
- future SceneView flood layer toggle
- parcel buildability review support

## Registered Flood Sources

Current readiness:

- Existing mock layer ID: `flood-risk`
- Existing candidate service registry ID: `floodplain-layer`
- Existing dataset registry ID: `floodplain`
- Registered source config: `config/constraint_sources.json`
- Source status: FEMA Layer 28 ingested and cleaned for Cabarrus extent

Primary regulatory source:

- FEMA NFHL Flood Hazard Zones
- URL: `https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28`
- Layer ID: `28`
- Geometry: polygon
- Role: authoritative regulatory constraint source for the first parcel
  floodplain/floodway overlay

Supporting QA/reference source:

- FEMA NFHL Flood Hazard Boundaries
- URL: `https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/27`
- Layer ID: `27`
- Geometry: polyline
- Role: QA/reference for flood boundary review, not the first parcel area
  overlay

Future hydrology/reference source:

- FEMA NFHL Water Areas
- URL: `https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/32`
- Layer ID: `32`
- Geometry: polygon
- Role: future hydrology/environmental context, not the first regulatory flood
  overlay

Existing modeled/static reference:

- Google Cloud project: `newproject-461002`
- Google Cloud bucket: `gs://cfs-model-data-khoi/`
- Role: modeled reference or future prediction input
- Authority: not authoritative for regulatory parcel flood constraints
- Important: do not delete existing TIFF/raster data

Future authoritative source should document:

- source authority
- effective date
- FEMA/local adoption status where applicable
- floodplain vs floodway distinction
- field domain values
- update cadence
- public/internal data classification

## Google Cloud Reference Validation

These commands are documentation-only checks for the local operator. They are
not run by CFS and do not connect the dashboard or backend to Google Cloud:

```powershell
gcloud config get-value project
gcloud storage ls gs://cfs-model-data-khoi/metadata/cfs_engine_registry/
```

Expected project:

```text
newproject-461002
```

Expected bucket:

```text
gs://cfs-model-data-khoi/
```

The Google Cloud TIFF remains valuable for future modeled flood risk,
static/raster comparison, and possible prediction input. It should be compared
against FEMA NFHL later, after the regulatory FEMA parcel overlay is stable.

## Expected Geometry

- Floodplain: polygon
- Floodway: polygon
- Optional cross-section or advisory layers: polyline/polygon, later phase

All future overlay work should normalize geometry to SRID `4326` only if the
project continues to use WGS84 for public-facing map payloads. Analysis may use
projected geometry internally for area calculations.

## Parcel Overlay Method

Phase 7A completed:

1. Validate FEMA NFHL Layer 28 metadata and Cabarrus County query extent.
2. Ingest Layer 28 flood hazard zone polygons into a raw table.
3. Clean geometry with `ST_MakeValid`.
4. Normalize flood zone fields and source metadata.

Phase 7B should:

5. Intersect with `public.parcels_enriched`.
6. Calculate overlap area and percent of parcel affected.
7. Separate floodplain and floodway overlap using `FLD_ZONE` and `ZONE_SUBTY`.
8. Assign parcel severity and buildability impact.
9. Preserve source feature IDs and effective dates.
10. Use Layer 27 only for boundary QA/reference.
11. Reserve Layer 32 for later hydrology/environmental context.
12. Compare/reference the Google Cloud TIFF later, without treating it as the
    primary regulatory source.

Recommended calculations:

- `floodplain_overlap_area_sq_m`
- `floodplain_overlap_acres`
- `floodplain_overlap_pct`
- `floodway_overlap_area_sq_m`
- `floodway_overlap_acres`
- `floodway_overlap_pct`
- `dominant_flood_zone`
- `flood_severity_class`
- `review_required`
- `buildability_impact`

## Severity Rules

Initial deterministic rules should remain conservative:

| Rule | Severity |
| --- | --- |
| No floodplain or floodway overlap | `low` or `none` |
| Floodplain overlap below 5 percent and no floodway | `low` |
| Floodplain overlap 5 to 25 percent and no floodway | `moderate` |
| Floodplain overlap above 25 percent and no floodway | `high` |
| Any floodway overlap below 5 percent | `high` |
| Floodway overlap at or above 5 percent | `severe` |
| Missing source zone fields or geometry uncertainty | `unknown` with `review_required=true` |

These thresholds are planning defaults only. They should be reviewed by flood,
environmental, and planning staff before operational use.

## Suggested Parcel Flags

- `has_floodplain_overlap`
- `has_floodway_overlap`
- `flood_review_required`
- `flood_source_unknown`
- `flood_effective_date_missing`
- `buildability_impacted`
- `flood_geometry_review`

## Buildability Impact

Suggested categories:

- `none`: no mapped overlap
- `minor`: small floodplain edge overlap
- `moderate`: meaningful floodplain overlap that may affect site layout
- `major`: large floodplain overlap or floodway presence
- `severe`: floodway or high-percent overlap likely to constrain development
- `unknown`: insufficient source quality

## Future Map Layer Support

Map support should be incremental:

1. Flood constraint layer toggle.
2. Selected parcel flood badge and summary.
3. Parcel flood footprint highlight as a separate overlay.
4. Executive flood review packet export.
5. Optional map filters for severity and review-required status.

Do not render flood constraints as permanent parcel styling until source
authority and dashboard-safe flags are reviewed.

## Source Authority Decision

FEMA NFHL Layer 28 is the first flood constraint ingestion candidate because it
contains the regulatory flood hazard zone polygons needed for parcel area
overlay. Layer 27 is a boundary/line QA layer, and Layer 32 is water-area
context for later hydrology work. The existing Google Cloud TIFF remains in
place and should be retained, but it is modeled/static reference material rather
than the authoritative regulatory parcel flood constraint source.

Forecasting and prediction should wait until the FEMA regulatory overlay,
parcel flood flags, and QA outputs have been validated.

## Phase 7A FEMA Ingestion Result

Implemented pipeline:

- Extent validation: `cfs-data-pipelines/inspect/inspect_cabarrus_extent.py`
- FEMA raw ingest: `cfs-data-pipelines/ingest/ingest_fema_nfhl_flood_zones.py`
- Raw profile: `cfs-data-pipelines/inspect/inspect_fema_nfhl_flood_zones.py`
- Clean SQL: `cfs-data-pipelines/sql/create_fema_nfhl_flood_zones_clean.sql`
- Clean runner: `cfs-data-pipelines/transform/create_fema_nfhl_flood_zones_clean.py`

PostGIS tables:

- Raw: `public.fema_nfhl_flood_zones_raw`
- Clean: `public.fema_nfhl_flood_zones_clean`

Cabarrus filtering approach:

- Extent source: `public.parcels_enriched`
- Extent method: `ST_Extent(geometry)`
- ArcGIS REST filter: envelope geometry, `esriGeometryEnvelope`,
  `esriSpatialRelIntersects`
- Cabarrus envelope:
  `xmin=-80.78714859986353`, `ymin=35.185001484384316`,
  `xmax=-80.29542844362561`, `ymax=35.55345527610693`
- Parcel count used for extent: `110,017`

Layer 28 ingestion intentionally avoids a nationwide FEMA download. The service
reported `7,712` flood hazard zone features intersecting the Cabarrus parcel
extent. The service returned repeated errors for some large paginated GeoJSON
requests, so the ingest falls back to object-ID chunks after first applying the
Cabarrus envelope filter.

Discovered FEMA flood fields:

- Flood zone code: `FLD_ZONE`
- Floodway / subtype context: `ZONE_SUBTY`
- Special Flood Hazard Area flag: `SFHA_TF`
- Additional zone field present but empty for this extract: `DUAL_ZONE`
- Source identifiers: `OBJECTID`, `FLD_AR_ID`, `GFID`, `GlobalID`

Clean QA:

- Raw feature count: `7,712`
- Clean feature count: `7,712`
- Raw invalid geometries: `195`
- Clean invalid geometries: `0`
- Clean geometry type: `ST_MultiPolygon`
- Clean SRID: `4326`

Flood zone distribution:

| Flood zone | Feature count |
| --- | ---: |
| `X` | `4,329` |
| `AE` | `3,383` |

Normalized constraint/severity mapping:

| Constraint type | Severity | Feature count |
| --- | --- | ---: |
| `minimal_flood_hazard` | `low` | `3,474` |
| `special_flood_hazard_area` | `high` | `3,100` |
| `moderate_flood_hazard` | `moderate` | `855` |
| `floodway` | `severe` | `283` |

Clean indexes:

- GiST on `geometry`
- btree on `flood_zone_code`
- btree on `flood_constraint_type`
- btree on `flood_severity_class`

Phase 7A is ready for Phase 7B parcel flood overlay. The overlay should still
calculate parcel-specific floodplain/floodway area and percent affected before
any dashboard-safe flood badge or API is introduced.

## Phase 7B Parcel Flood Overlay Result

Implemented pipeline:

- Overlay SQL: `cfs-data-pipelines/sql/create_parcel_flood_constraint_overlay.sql`
- Transform runner:
  `cfs-data-pipelines/transform/create_parcel_flood_constraint_overlay.py`

PostGIS table:

- `public.parcel_flood_constraint_overlay`

The overlay writes exactly one row per parcel from `public.parcels_enriched`.
It uses the cleaned FEMA Layer 28 table,
`public.fema_nfhl_flood_zones_clean`, and keeps the Google Cloud TIFF out of
the regulatory scoring path.

Performance and geometry approach:

- FEMA polygons are subdivided into a temporary indexed table for overlay
  performance.
- Parcel joins use native parcel geometry and GiST spatial filtering.
- Areas are calculated in acres from geography.
- Output parcel geometry is valid `ST_MultiPolygon` in SRID `4326`.

Overlay logic:

- `dominant_flood_zone` is the flood zone with the largest parcel overlap area.
- `flood_severity_class` is the highest-risk overlap on the parcel, so a small
  floodway still drives a `severe` classification even if Zone X is the largest
  area.
- `flood_constrained_area_acres` unions floodway, SFHA, and moderate-hazard
  overlaps. Minimal Zone X is tracked separately as low risk and is not counted
  as constrained area.
- `flood_review_required` is true when floodway is present, SFHA is present, or
  constrained parcel area is at least 5 percent.
- `flood_constraint_score` is deterministic 0-100 scoring. It is not a
  forecast or prediction model.

Validation result:

- Parcel rows: `110,017`
- Overlay rows: `110,017`
- Null `official_parcel_id`: `0`
- Invalid overlay geometries: `0`
- Clean output SRID: `4326`
- Out-of-range percent values: `0`

Parcel counts:

| Metric | Parcel count |
| --- | ---: |
| Floodplain present | `8,661` |
| Floodway present | `3,229` |
| SFHA present | `7,254` |
| Moderate hazard present | `6,995` |
| Minimal Zone X present | `109,049` |
| Flood review required | `7,989` |
| High or severe buildability impact | `6,362` |

Severity distribution:

| Severity | Parcel count | Share |
| --- | ---: | ---: |
| `low` | `101,356` | `92.1276%` |
| `high` | `4,025` | `3.6585%` |
| `severe` | `3,229` | `2.9350%` |
| `moderate` | `1,407` | `1.2789%` |

Buildability impact distribution:

| Impact | Parcel count | Share |
| --- | ---: | ---: |
| `low` | `102,582` | `93.2420%` |
| `severe` | `4,880` | `4.4357%` |
| `high` | `1,482` | `1.3471%` |
| `moderate` | `1,073` | `0.9753%` |

Important caveat:

FEMA Layer 28 maps low-risk Zone X across most of Cabarrus, so
`minimal_flood_present` is widespread and `no_flood_constraint_count` is `0`
when interpreted as any FEMA zone overlap. CFS should not treat low-risk Zone X
as a regulatory development constraint. Dashboard and API language should
distinguish low-risk mapped Zone X from SFHA/floodway/moderate constraint
review.

## Phase 7C Backend Contract Result

Phase 7C creates backend/API planning artifacts for flood constraint
intelligence. It does not implement FastAPI endpoints.

Created docs:

- `docs/backend/flood_constraint_api_contract.md`
- `docs/backend/flood_constraint_data_dictionary.md`
- `docs/backend/flood_constraint_response_examples.md`

Generated summary:

- `outputs/phase7c_flood_constraint_api_contract_summary.json`

Planned endpoints:

- `GET /constraints/flood/statistics`
- `GET /constraints/flood/{official_parcel_id}`
- `GET /constraints/flood/filter`
- `GET /constraints/flood/high-review`
- `GET /constraints/flood/summary`

Core filter fields:

- `floodplain_present`
- `floodway_present`
- `sfha_present`
- `moderate_flood_present`
- `flood_review_required`
- `buildability_impact`
- `flood_severity_class`
- `dominant_flood_zone`
- `min_percent_constrained`
- `max_percent_constrained`

Backend readiness:

- Data source table is ready: `public.parcel_flood_constraint_overlay`.
- API contract is ready.
- Response examples are ready.
- Data dictionary is ready.
- FastAPI router/repository/service/schema implementation is still future work.

## Future API Support

Potential endpoints after contract implementation:

- `GET /constraints/flood/statistics`
- `GET /constraints/flood/{official_parcel_id}`
- `GET /constraints/flood/filter`
- `GET /constraints/flood/high-review`
- `GET /constraints/flood/summary`
- Future map-safe endpoint: `GET /constraints/flood/map?bbox=...`
