# Parcel Intelligence API Contract

Cabarrus FutureScape Phase 2 backend readiness contract for future read-only
parcel intelligence services.

This document designs the service contract only. It does not implement FastAPI
endpoints, authentication, caching, frontend integration, vector search, AI, or
forecasting.

## Purpose

The future Parcel Intelligence API will expose governed parcel, valuation,
zoning, QA, and search/filter payloads from the local PostGIS intelligence
tables.

Primary source tables:

- `public.parcels_enriched`
- `public.parcel_zoning_overlay_v2`
- `public.parcel_zoning_intelligence_qa`

Current readiness baseline:

- Total parcels: `110,017`
- Zoning assigned: `109,984`
- Zoning no-match: `33`
- QA safe-for-dashboard: `74,781`
- QA review parcels: `35,236`

## Contract Principles

- Return one parcel intelligence record per `official_parcel_id`.
- Keep raw jurisdictional zoning codes visible.
- Do not force zoning equivalency across municipalities.
- Surface QA warning categories in every parcel detail response.
- Treat `safe_for_dashboard` as a frontend-readiness signal, not a legal status.
- Keep planning jurisdiction context separate from zoning assignment.
- Default all list endpoints to pagination and deterministic sorting.
- Spatial query support is planned, but should remain read-only and bounded.

## Endpoint Inventory

### `GET /parcels/search`

Search parcels by identifiers, owner/account text, mailing address,
subdivision, neighborhood, zoning, jurisdiction, and partial text query.

Key parameters:

- `q`: free text search query.
- `fields`: optional comma-separated field scope.
- `limit`: page size, default `25`, max `100`.
- `cursor`: opaque cursor for keyset pagination.
- `sort`: supported sort key.
- `include_geometry`: default `false`.
- `bbox`, `radius`, `polygon`: future spatial constraints.

Returns:

- lightweight parcel search result list
- match highlights
- zoning summary
- QA status and warning categories
- pagination metadata

### `GET /parcels/{official_parcel_id}`

Fetch a full parcel intelligence payload by stable CFS parcel ID.

Key parameters:

- `include_geometry`: default `true`.
- `geometry_format`: `geojson`, `centroid`, or `none`.
- `include_raw_fields`: default `false`.

Returns:

- parcel identity
- owner/mailing fields
- valuation fields
- size/classification fields
- zoning assignment
- planning context
- QA/governance warnings
- geometry or centroid

### `GET /parcels/filter`

Filter parcels by operational categories.

Key parameters:

- `zoning_jurisdiction`
- `zoning_category`
- `zoning_code`
- `subdivision`
- `neighborhood`
- `parcel_size_category`
- `valuation_band`
- `parcel_quality_status`
- `zoning_confidence`
- `governance_warning`
- `municipality`
- `planning_jurisdiction`
- `min_acres`, `max_acres`
- `min_value`, `max_value`
- `bbox`, `radius`, `polygon`
- `limit`, `cursor`, `sort`

Returns:

- filtered parcel result list
- filter counts where inexpensive
- pagination metadata

### `GET /parcels/statistics`

Return aggregate statistics for the current filter/search scope.

Key parameters:

- all filter parameters accepted by `/parcels/filter`
- optional `group_by`: `zoning_jurisdiction`, `zoning_category`,
  `valuation_band`, `parcel_quality_status`, `governance_warning`,
  `neighborhood`, `subdivision`

Returns:

- parcel counts
- acreage summaries
- valuation summaries
- QA counts
- zoning confidence distribution

### `GET /parcels/zoning-summary`

Return zoning distribution and QA summaries by jurisdiction/code/category.

Key parameters:

- `zoning_jurisdiction`
- `planning_jurisdiction`
- `include_review_only`
- `include_no_match`
- `limit`

Returns:

- zoning jurisdiction distribution
- dominant zoning code distribution
- confidence distribution
- multi-zone/multi-jurisdiction counts
- no-match counts

### `GET /parcels/governance-warnings`

Return parcels or aggregates that need governance review.

Key parameters:

- `warning`: one or more QA warning categories.
- `primary_warning`: primary warning category.
- `zoning_jurisdiction`
- `zoning_confidence`
- `limit`
- `cursor`
- `sort`

Returns:

- governance warning rows
- affected parcel counts
- hotspot fields
- recommended review notes

## Pagination Strategy

Use keyset pagination for production endpoints.

Default:

```text
limit=25
max_limit=100
cursor=<opaque encoded sort key + official_parcel_id>
```

Offset pagination may be allowed only in internal diagnostics. Public API
contracts should avoid large offsets because parcel queries may combine text,
spatial filters, joins, and sorting.

## Sorting Strategy

Supported sorts:

- `official_parcel_id`
- `pin14`
- `parcel_area_acres_calc`
- `marketvalue_numeric`
- `assessedvalue_numeric`
- `valuation_basis`
- `zoning_jurisdiction_name`
- `dominant_zoning_code_raw`
- `zoning_assignment_confidence`
- `primary_governance_warning`
- `updated_at` or future materialized view refresh timestamp

Every sort must use `official_parcel_id` as a stable tie-breaker.

## Error Handling Strategy

Standard error shape:

```json
{
  "error": {
    "code": "invalid_request",
    "message": "Unsupported zoning_confidence value.",
    "details": {
      "field": "zoning_confidence",
      "allowed_values": ["high", "medium", "low", "no_match"]
    },
    "request_id": "req_..."
  }
}
```

Recommended error codes:

- `invalid_request`
- `parcel_not_found`
- `invalid_cursor`
- `invalid_geometry`
- `query_too_large`
- `unsupported_sort`
- `internal_error`

## Spatial Query Support

Future spatial filters:

- `bbox`: `minx,miny,maxx,maxy` in EPSG:4326.
- `radius`: `lon,lat,meters`.
- `polygon`: GeoJSON polygon or server-side saved polygon reference.
- `viewport`: same as bbox, intended for map viewport queries.

Initial limits:

- reject polygons with excessive vertex counts
- reject radius queries above configured maximum distance
- enforce `limit <= 100`
- default `include_geometry=false` for list queries

## Performance Requirements

Target initial response goals for local/staging:

- detail lookup by `official_parcel_id`: under `100 ms`
- search/filter first page: under `500 ms`
- aggregate statistics: under `1.5 s`
- map viewport query: under `750 ms` for bounded extent

Required indexes:

- `parcels_enriched.official_parcel_id`
- `parcels_enriched.objectid_1`
- `parcels_enriched.pin14`
- `parcels_enriched.subdiv_name`
- `parcels_enriched.nbh_name`
- `parcels_enriched.parcel_quality_status`
- `parcels_enriched.parcel_size_category`
- `parcels_enriched.valuation_band`
- `parcels_enriched.geometry` GiST
- `parcel_zoning_overlay_v2.official_parcel_id`
- `parcel_zoning_overlay_v2.zoning_jurisdiction_name`
- `parcel_zoning_overlay_v2.dominant_zoning_code_raw`
- `parcel_zoning_overlay_v2.dominant_zoning_general_normalized`
- `parcel_zoning_overlay_v2.zoning_assignment_confidence`
- `parcel_zoning_overlay_v2.geometry` GiST
- `parcel_zoning_intelligence_qa.official_parcel_id`
- `parcel_zoning_intelligence_qa.safe_for_dashboard`
- `parcel_zoning_intelligence_qa.primary_governance_warning`
- `parcel_zoning_intelligence_qa.zoning_jurisdiction_name`
- `parcel_zoning_intelligence_qa.dominant_zoning_code_raw`
- `parcel_zoning_intelligence_qa.geometry` GiST

Future candidates:

- trigram indexes for owner/address/subdivision/neighborhood text search
- materialized view for joined parcel detail
- materialized aggregate table for zoning summaries
- tile/viewport cache for map queries
- API response cache for statistics and zoning summary endpoints

## Readiness Assessment

Ready for backend/API planning:

- source tables exist
- one-row-per-parcel zoning overlay exists
- QA table exists
- warning categories are explicit
- indexes exist for core lookup and QA filters

Not ready for production:

- no FastAPI implementation yet
- no authentication/authorization model
- no API rate limits
- no cache invalidation policy
- no governed zoning codebook by jurisdiction
- no official municipality boundary fabric
- no production deployment or monitoring plan
