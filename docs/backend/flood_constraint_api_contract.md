# Flood Constraint API Contract

Cabarrus FutureScape Phase 7C backend readiness contract for future read-only
flood constraint intelligence services.

This document designs the service contract only. It does not implement FastAPI
endpoints, authentication, caching, frontend integration, SceneView rendering,
PostGIS schema changes, Google Cloud TIFF comparison, AI, or forecasting.

## Purpose

The future Flood Constraint API will expose governed parcel-level floodplain,
floodway, SFHA, buildability impact, and review-readiness payloads from the
FEMA NFHL Layer 28 parcel overlay.

Primary source table:

- `public.parcel_flood_constraint_overlay`
- `public.fema_nfhl_flood_zones_clean` for FEMA source polygon visualization

Current readiness baseline:

- Total parcels: `110,017`
- Flood review parcels: `7,989`
- Floodway parcels: `3,229`
- SFHA parcels: `7,254`
- High/severe buildability impact parcels: `6,362`
- Source authority: FEMA NFHL Layer 28 Flood Hazard Zones
- Output geometry: valid `ST_MultiPolygon`, SRID `4326`

## Contract Principles

- Keep the API read-only.
- Return one flood constraint record per `official_parcel_id`.
- Keep FEMA zone codes visible and do not hide low-risk Zone X context.
- Distinguish low-risk mapped Zone X from review-driving SFHA/floodway overlap.
- Treat `flood_constraint_score` as deterministic planning intelligence, not a
  prediction model.
- Surface `overlay_confidence` and caveats with each parcel detail response.
- Default list endpoints to bounded pagination and deterministic sorting.
- Keep future map geometry requests explicit and bounded.

## Endpoint Inventory

### `GET /constraints/flood/statistics`

Return top-level flood constraint statistics for an optional filter scope.

Key parameters:

- `floodplain_present`: optional boolean.
- `floodway_present`: optional boolean.
- `sfha_present`: optional boolean.
- `moderate_flood_present`: optional boolean.
- `flood_review_required`: optional boolean.
- `buildability_impact`: `none`, `low`, `moderate`, `high`, or `severe`.
- `flood_severity_class`: `none`, `low`, `moderate`, `high`, or `severe`.
- `dominant_flood_zone`: FEMA zone code, such as `AE`, `X`, or
  `NO_FEMA_OVERLAP`.
- `min_percent_constrained`, `max_percent_constrained`.

Returns:

- total parcel count
- floodplain parcel count
- floodway parcel count
- SFHA parcel count
- review-required parcel count
- high/severe buildability count
- severity distribution
- dominant zone distribution
- buildability impact distribution
- filters applied
- source metadata

### `GET /constraints/flood/{official_parcel_id}`

Fetch a full flood constraint detail payload for one parcel.

Key parameters:

- `include_geometry`: optional boolean, default `false`.
- `geometry_format`: optional `centroid`, `extent`, or `geojson`.
- `include_source_fields`: optional boolean, default `false`.

Returns:

- parcel identity
- dominant FEMA flood zone
- all FEMA zone codes intersecting the parcel
- floodplain, floodway, SFHA, moderate, and minimal flags
- constrained area and percent metrics
- review-required flag
- buildability impact
- flood constraint score
- overlay confidence
- optional geometry payload

404 behavior:

```json
{
  "detail": "Flood constraint record not found"
}
```

### `GET /constraints/flood/filter`

Return paginated parcel flood constraint rows matching structured filters.

Key parameters:

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
- `min_constraint_score`
- `max_constraint_score`
- `overlay_confidence`
- `limit`: default `25`, max `100`.
- `offset`: default `0` for initial implementation.
- `sort`: supported sort key.

Returns:

- filters applied
- total count
- paginated flood constraint rows
- pagination metadata

### `GET /constraints/flood/high-review`

Return parcels that require flood review or have high/severe buildability
impact.

Key parameters:

- `buildability_impact`: optional scope, default high/severe/review-required.
- `floodway_only`: optional boolean.
- `sfha_only`: optional boolean.
- `min_percent_constrained`.
- `min_constraint_score`.
- `limit`: default `25`, max `100`.
- `offset`: default `0`.
- `sort`: default `flood_constraint_score_desc`.

Returns:

- review parcel rows
- floodway/SFHA flags
- constrained acres and percentages
- scoring and buildability fields
- review reason categories

### `GET /constraints/flood/summary`

Return executive-safe aggregate summaries for dashboard cards, charts, and
review queues.

Key parameters:

- same filters as `/constraints/flood/statistics`
- optional `group_by`: `severity`, `buildability_impact`, `dominant_zone`, or
  `review_required`

Returns:

- severity rollups
- buildability impact rollups
- dominant zone rollups
- review-required rollups
- top review categories
- caveats for Zone X interpretation

### `GET /constraints/flood/zones`

Return bounded FEMA NFHL Layer 28 source polygons for map visualization.
This endpoint is separate from parcel flood review markers and should not
select parcels automatically.

Key parameters:

- `flood_severity_class`: optional `severe`, `high`, or `moderate`.
- `flood_constraint_type`: optional normalized source type such as `floodway`,
  `special_flood_hazard_area`, or `moderate_flood_hazard`.
- `extent`: optional WGS84 envelope in `xmin,ymin,xmax,ymax` format.
- `limit`: default `500`, max `1000`.
- `offset`: default `0`.

Special pagination behavior:

- `limit=0` is accepted only when `extent` is provided and returns all FEMA
  polygons intersecting that bounded visible extent.
- Requests without an extent are always capped.

Returns:

- FEMA identifiers: `flood_zone_internal_id`, `source_objectid`,
  `fld_ar_id`, `globalid`, and `gfid`
- normalized flood fields: `flood_zone_code`, `flood_constraint_type`,
  `flood_severity_class`, `source_layer`
- lightweight GeoJSON `Polygon` or `MultiPolygon` geometry in SRID 4326
- filters applied
- `limit`, `offset`, and `total_count`

## Shared Filter Fields

All list/aggregate endpoints should support:

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

Optional later filters:

- `min_floodway_pct`
- `max_floodway_pct`
- `min_sfha_pct`
- `max_sfha_pct`
- `overlay_confidence`
- `bbox`
- `include_geometry`
- FEMA source polygon extent filter for `/constraints/flood/zones`

## Pagination Strategy

Initial implementation may use bounded offset pagination:

```text
limit=25
max_limit=100
offset=0
```

Production endpoints should move to keyset pagination for large review queues:

```text
cursor=<opaque encoded sort key + official_parcel_id>
```

Every paginated response should include:

- `limit`
- `offset` or `cursor`
- `total_count`
- `has_more`

## Sorting Strategy

Supported sorts:

- `official_parcel_id`
- `dominant_flood_zone`
- `flood_severity_class`
- `buildability_impact`
- `percent_parcel_constrained`
- `percent_parcel_floodway`
- `percent_parcel_sfha`
- `flood_constraint_score`
- `flood_review_required`

Default sorts:

- `/filter`: `official_parcel_id ASC`
- `/high-review`: `flood_constraint_score DESC, percent_parcel_constrained DESC`
- `/summary`: `parcel_count DESC`

Every sort should use `official_parcel_id` as a stable tie-breaker.

## Error Handling Strategy

Standard error shape:

```json
{
  "error": {
    "code": "invalid_request",
    "message": "Unsupported flood_severity_class value.",
    "details": {
      "field": "flood_severity_class",
      "allowed_values": ["none", "low", "moderate", "high", "severe"]
    },
    "request_id": "req_..."
  }
}
```

Recommended error codes:

- `invalid_request`
- `flood_constraint_record_not_found`
- `unsupported_sort`
- `invalid_pagination`
- `query_too_large`
- `internal_error`

## Performance Planning

Recommended existing/required indexes:

- Primary key on `official_parcel_id`.
- btree on `pin14`.
- btree on `dominant_flood_zone`.
- btree on `flood_severity_class`.
- btree on `flood_review_required`.
- btree on `buildability_impact`.
- btree on `flood_constraint_score`.
- GiST on `geometry`.

For `public.fema_nfhl_flood_zones_clean`:

- btree on `flood_zone_code`.
- btree on `flood_constraint_type`.
- btree on `flood_severity_class`.
- GiST on `geometry`.

Likely query patterns:

- Countywide statistics from the full overlay.
- Filter review queue by `flood_review_required=true`.
- Filter severe/high parcels by `buildability_impact`.
- Sort high-review parcels by `flood_constraint_score`.
- Fetch selected parcel flood detail by `official_parcel_id`.
- Future map viewport filtering by `bbox`.
- FEMA source polygon visualization filtered by visible map extent and
  severity.

Materialized view candidates:

- `public.flood_constraint_statistics_mv`
- `public.flood_constraint_review_queue_mv`
- `public.flood_constraint_zone_summary_mv`
- `public.flood_constraint_map_centroids_mv`
- Optional simplified FEMA flood zone map view if raw polygon density becomes
  expensive for browser rendering.

Caching opportunities:

- Cache countywide `/statistics` and `/summary` payloads.
- Cache stable filter option counts for severity, impact, and zone code.
- Use short TTL cache for review queues after each overlay refresh.
- Cache selected parcel detail only if backend includes overlay refresh metadata.

## Future Spatial Support

Future spatial filters should be bounded:

- `bbox=minx,miny,maxx,maxy`
- `include_geometry=false` by default
- `geometry_format=centroid` preferred for map lists
- full parcel geometry only for selected parcel detail or explicit review export

Do not ship all parcel or FEMA source geometries to the frontend for a
countywide flood layer. Use capped requests, visible extent filters, simplified
geometries, or centroid/materialized map payloads when the map view is dense.
