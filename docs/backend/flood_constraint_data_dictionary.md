# Flood Constraint Data Dictionary

Cabarrus FutureScape Phase 7C data dictionary for future flood constraint API
implementation.

Primary table:

- `public.parcel_flood_constraint_overlay`
- `public.fema_nfhl_flood_zones_clean` for source polygon visualization

Source lineage:

- `public.parcels_enriched`
- `public.fema_nfhl_flood_zones_clean`
- FEMA NFHL Layer 28 Flood Hazard Zones

## Table Role

`public.parcel_flood_constraint_overlay` stores one deterministic FEMA flood
constraint intelligence row per parcel. It is ready for read-only API planning
but is not yet connected to FastAPI or the frontend.

`public.fema_nfhl_flood_zones_clean` stores cleaned FEMA NFHL Layer 28 source
polygons for map reference. It is not parcel intelligence by itself; parcel
review flags and scores come from `public.parcel_flood_constraint_overlay`.

## Parcel Overlay Fields

| Field | Type | API Role | Description |
| --- | --- | --- | --- |
| `official_parcel_id` | text | identifier | Stable CFS parcel identifier. Primary lookup key. |
| `pin14` | text | identifier | Business parcel/PIN value, not guaranteed globally unique. |
| `objectid_1` | bigint | identifier | Internal stable parcel source object ID candidate. |
| `floodplain_present` | boolean | flag | True when floodway, SFHA, or moderate flood hazard overlap exists. |
| `floodway_present` | boolean | flag | True when any floodway overlap exists. |
| `sfha_present` | boolean | flag | True when FEMA `SFHA_TF` indicates Special Flood Hazard Area overlap. |
| `moderate_flood_present` | boolean | flag | True when moderate flood hazard overlap exists. |
| `minimal_flood_present` | boolean | flag | True when minimal/low-risk Zone X context exists. |
| `dominant_flood_zone` | text | category | FEMA zone code with the largest parcel overlap area. |
| `flood_zone_codes` | text[] | category list | Distinct FEMA flood zone codes intersecting the parcel. |
| `dominant_flood_constraint_type` | text | category | Constraint type associated with the dominant zone by area. |
| `flood_severity_class` | text | category | Highest-risk parcel flood severity: `none`, `low`, `moderate`, `high`, `severe`. |
| `parcel_area_acres` | numeric | measure | Parcel area in acres. |
| `flood_constrained_area_acres` | numeric | measure | Unioned area of floodway, SFHA, and moderate hazard overlap. |
| `floodway_area_acres` | numeric | measure | Unioned floodway overlap area in acres. |
| `sfha_area_acres` | numeric | measure | Unioned SFHA overlap area in acres. |
| `percent_parcel_constrained` | numeric | measure | Percent of parcel constrained by floodway, SFHA, or moderate hazard. |
| `percent_parcel_floodway` | numeric | measure | Percent of parcel overlapped by floodway. |
| `percent_parcel_sfha` | numeric | measure | Percent of parcel overlapped by SFHA. |
| `flood_review_required` | boolean | review flag | True for floodway, SFHA, or constrained parcel area at least 5 percent. |
| `buildability_impact` | text | category | Deterministic planning impact: `none`, `low`, `moderate`, `high`, `severe`. |
| `flood_constraint_score` | numeric | score | Deterministic 0-100 planning score. Not predictive. |
| `overlay_confidence` | text | quality | Overlay confidence from source geometry and overlap quality. |
| `flood_zone_overlap_count` | integer | QA | Number of FEMA zone overlap fragments contributing to the parcel. |
| `min_overlap_area_acres` | numeric | QA | Smallest overlap fragment area. |
| `max_overlap_area_acres` | numeric | QA | Largest overlap fragment area. |
| `raw_overlap_area_acres` | numeric | QA | Raw summed overlap area before union-based constrained area interpretation. |
| `overlaid_at` | timestamptz | metadata | Overlay creation timestamp. |
| `geometry` | geometry | spatial | Valid parcel MultiPolygon geometry, SRID 4326. |

## FEMA Source Polygon Fields

| Field | Type | API Role | Description |
| --- | --- | --- | --- |
| `flood_zone_internal_id` | bigint | identifier | Stable internal FEMA flood zone row identifier used by CFS. |
| `source_objectid` | bigint | identifier | FEMA source object ID from Layer 28. |
| `fld_ar_id` | text | identifier | FEMA flood area identifier when available. |
| `globalid` | text | identifier | FEMA global ID when available. |
| `gfid` | text | identifier | FEMA GFID/source identifier when available. |
| `flood_zone_code` | text | category | FEMA flood zone code, such as `AE` or `X`. |
| `zone_subtype_raw` | text | source field | Raw FEMA subtype context from `ZONE_SUBTY`. |
| `sfha_tf` | text | source flag | Raw FEMA Special Flood Hazard Area flag. |
| `flood_constraint_type` | text | category | Normalized source type: `floodway`, `special_flood_hazard_area`, `moderate_flood_hazard`, or `minimal_flood_hazard`. |
| `flood_severity_class` | text | category | Source polygon severity: `low`, `moderate`, `high`, or `severe`. |
| `source_layer` | text | metadata | Source layer label, currently FEMA NFHL Layer 28 Flood Hazard Zones. |
| `geometry` | geometry | spatial | Valid FEMA MultiPolygon geometry, SRID 4326. Returned as lightweight GeoJSON by `/constraints/flood/zones`. |

## Enumerations

`flood_severity_class`:

- `none`
- `low`
- `moderate`
- `high`
- `severe`

`buildability_impact`:

- `none`
- `low`
- `moderate`
- `high`
- `severe`

`dominant_flood_constraint_type`:

- `no_flood_constraint`
- `minimal_flood_hazard`
- `moderate_flood_hazard`
- `special_flood_hazard_area`
- `floodway`

`overlay_confidence`:

- `high`
- `medium`
- `low`

## Dashboard-Safe Interpretation

Recommended display labels:

- `floodway_present=true`: Floodway review required.
- `sfha_present=true`: SFHA review required.
- `moderate_flood_present=true`: Moderate flood hazard context.
- `minimal_flood_present=true`: FEMA Zone X / low-risk mapped context.

Do not describe widespread Zone X as a high-impact development constraint.
Dashboard and API copy should distinguish low-risk mapped flood context from
SFHA/floodway review constraints.

## Refresh and Governance

Refresh cadence should follow FEMA NFHL update policy and local planning review.
Each future refresh should rerun:

1. FEMA Layer 28 ingestion.
2. FEMA flood zone clean transform.
3. Parcel flood overlay.
4. API QA validation.
5. Dashboard-safe governance review.

## Future Join Readiness

Future APIs may join flood constraints with:

- parcel identity and owner context from `public.parcels_enriched`
- zoning from `public.parcel_zoning_overlay_v2`
- development activity from `public.development_activity_parcel_summary`
- future school, transportation, utility, and environmental constraints

These joins should remain read-only and should not mutate the flood overlay
table.
