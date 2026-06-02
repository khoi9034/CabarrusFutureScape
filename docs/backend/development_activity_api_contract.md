# Development Activity API Contract

Cabarrus FutureScape Phase 3 backend readiness contract for future read-only
development activity and temporal analytics services.

This document designs the service contract only. It does not implement FastAPI
endpoints, authentication, caching, frontend integration, vector search, AI, or
forecasting.

## Purpose

The future Development Activity API will expose governed permit, parcel
relationship, zoning development, hotspot, and time-slice analytics from the
local PostGIS intelligence tables.

Primary source tables:

- `public.real_property_permit_clean`
- `public.real_property_permit_parcel_relationship`
- `public.development_activity_parcel_summary`
- `public.development_activity_time_summary`
- `public.development_activity_zoning_summary`

Current readiness baseline:

- Permit records: `64,426`
- Permit-to-parcel match rate: `99.6973%`
- Parcels with permit activity: `43,474`
- Parcels without permit activity: `66,543`
- Recent 1-year activity parcels: `3,091`
- Recent 3-year activity parcels: `9,388`
- Activity date range: `1986-12-01` to `2025-12-31`
- Activity anchor date: `2025-12-31`

## Contract Principles

- Keep the API read-only for Phase 3.
- Treat Real Property Permit records as authoritative for permit intelligence.
- Preserve the historical 2015 spatial permit pilot separately.
- Return stable parcel context through `official_parcel_id` when matched.
- Surface unmatched and ambiguous permit relationships instead of hiding them.
- Keep zoning jurisdiction and raw zoning code semantics visible.
- Do not infer zoning equivalency across municipalities.
- Default all list endpoints to bounded pagination and deterministic sorting.
- Support temporal filters before map playback.
- Keep map extent and hotspot requests bounded to protect database performance.
- Return metadata describing generated/materialized source freshness.

## Endpoint Inventory

### `GET /development/statistics`

Return top-level development activity statistics for an optional filter scope.

Key parameters:

- `year`
- `month`
- `start_date`, `end_date`
- `permit_type`
- `work_type`
- `zoning_jurisdiction`
- `zoning_code`
- `activity_class`
- `permit_status`
- `bbox`
- `limit_context`: optional flag for future map viewport statistics

Returns:

- permit totals
- active parcel totals
- unmatched and ambiguous permit counts
- recent activity counts
- permit amount totals
- activity class distribution
- relationship QA summary
- source freshness metadata

Primary tables:

- `public.development_activity_parcel_summary`
- `public.development_activity_time_summary`
- `public.real_property_permit_parcel_relationship`

### `GET /development/trends`

Return annual or monthly permit trend aggregates.

Key parameters:

- `grain`: `year`, `month`, or `quarter`
- `year`
- `month`
- `start_date`, `end_date`
- `permit_type`
- `work_type`
- `zoning_jurisdiction`
- `zoning_code`
- `permit_status`
- `comparison`: optional `year_over_year`
- `limit`, `cursor`

Returns:

- ordered time buckets
- permit counts
- active parcel counts
- permit amount totals
- unmatched and ambiguous counts
- year-over-year deltas when requested

Primary table:

- `public.development_activity_time_summary`

### `GET /development/hotspots`

Return high-activity parcels for dashboard lists and future hotspot maps.

Key parameters:

- `year`
- `month`
- `start_date`, `end_date`
- `permit_type`
- `work_type`
- `zoning_jurisdiction`
- `zoning_code`
- `activity_class`
- `permit_status`
- `min_permit_count`
- `bbox`
- `include_geometry`: default `false`
- `geometry_format`: `centroid`, `geojson`, or `none`
- `limit`, `cursor`, `sort`

Returns:

- active parcel rows
- total permit count
- recent permit counts
- total and average permit amount
- dominant permit/work type
- latest permit status/date
- parcel/zoning context
- optional geometry or centroid

Primary table:

- `public.development_activity_parcel_summary`

### `GET /development/zoning-summary`

Return permit activity by zoning jurisdiction, zoning code, zoning category, and
permit type.

Key parameters:

- `zoning_jurisdiction`
- `zoning_code`
- `zoning_category`
- `permit_type`
- `work_type`
- `year`
- `month`
- `start_date`, `end_date`
- `permit_status`
- `limit`, `cursor`, `sort`

Returns:

- zoning jurisdiction
- raw zoning code
- normalized zoning category
- permit type
- permit count
- active parcel count
- permit amount totals
- ambiguous relationship count

Primary table:

- `public.development_activity_zoning_summary`

### `GET /development/activity-summary`

Return an executive-ready summary of current development activity.

Key parameters:

- same temporal and zoning filters as `/development/statistics`
- `include_top_jurisdictions`: default `true`
- `include_top_hotspots`: default `true`

Returns:

- narrative-safe metric summary
- top activity classes
- top zoning jurisdictions
- top permit categories
- hotspot highlights
- QA caveats

Primary tables:

- `public.development_activity_parcel_summary`
- `public.development_activity_zoning_summary`
- `public.development_activity_time_summary`

### `GET /development/temporal-query`

Return a flexible temporal query payload for time slider controls and future
map filtering.

Key parameters:

- `mode`: `single_year`, `month`, `date_range`, `rolling_12`, `rolling_36`,
  or `year_over_year`
- `year`
- `month`
- `start_date`, `end_date`
- `anchor_date`
- `permit_type`
- `work_type`
- `zoning_jurisdiction`
- `zoning_code`
- `activity_class`
- `permit_status`
- `bbox`
- `include_features`: default `false`
- `include_geometry`: default `false`
- `limit`, `cursor`

Returns:

- resolved date window
- aggregate counts
- trend comparison
- matching parcel count
- matching permit count
- optional feature summaries for bounded map requests
- query metadata and warnings

Primary tables:

- `public.development_activity_time_summary`
- `public.development_activity_parcel_summary`
- `public.real_property_permit_parcel_relationship`

### `GET /development/permit-types`

Return supported permit type values and counts.

Parameters:

- optional temporal and jurisdiction filters

Returns:

- permit type list
- counts
- latest activity date per type

### `GET /development/work-types`

Return supported work type values and counts.

Parameters:

- optional temporal and jurisdiction filters

Returns:

- work type list
- counts
- latest activity date per work type

### `GET /development/jurisdictions`

Return zoning jurisdictions represented in development activity summaries.

Parameters:

- optional temporal, permit type, and work type filters

Returns:

- jurisdiction list
- permit counts
- active parcel counts
- permit amount totals

### `GET /development/activity-classes`

Return development activity class metadata.

Parameters:

- optional jurisdiction and temporal filters

Returns:

- `no_activity`
- `low_activity`
- `moderate_activity`
- `high_activity`
- `very_high_activity`
- parcel counts
- average score

## Shared Filter Model

Supported filters:

- `year`: four-digit activity year.
- `month`: one-based month within `year`.
- `start_date`, `end_date`: inclusive ISO date range.
- `rolling_window`: future alias for `rolling_12` or `rolling_36`.
- `permit_type`: normalized permit category.
- `work_type`: normalized work type.
- `zoning_jurisdiction`: zoning source jurisdiction.
- `zoning_code`: raw dominant zoning code.
- `activity_class`: development activity class.
- `permit_status`: normalized permit status.
- `bbox`: `minx,miny,maxx,maxy` in EPSG:4326.
- `include_geometry`: default `false`.

Invalid filters should return `400` with a structured validation error. Empty
result sets should return `200` with empty arrays and zero counts.

## Pagination Strategy

- Default `limit`: `25` for feature/list endpoints.
- Maximum `limit`: `500` for internal dashboard requests.
- Aggregate endpoints may omit pagination if they return bounded group lists.
- Use opaque cursor pagination for hotspots and feature-level temporal queries.
- Cursor should encode the primary sort keys and stable tie-breaker.
- Avoid offset pagination for large permit or parcel result sets.

## Sorting Strategy

Supported hotspot sort keys:

- `development_activity_score_desc`
- `total_permit_count_desc`
- `latest_permit_date_desc`
- `total_permit_amount_desc`
- `recent_1yr_desc`
- `recent_3yr_desc`

Supported trend sort keys:

- `activity_period_asc`
- `activity_period_desc`
- `permit_count_desc`

Supported zoning summary sort keys:

- `permit_count_desc`
- `active_parcel_count_desc`
- `permit_amount_desc`
- `zoning_jurisdiction_asc`

Every sort should include a deterministic tie-breaker such as
`official_parcel_id`, `permit_id`, or full grouping key.

## Aggregation Strategy

Default aggregate sources:

- Statistics: pre-aggregated summaries where possible.
- Trends: `public.development_activity_time_summary`.
- Zoning: `public.development_activity_zoning_summary`.
- Hotspots: `public.development_activity_parcel_summary`.

When filters cross dimensions not fully represented by a summary table, the API
should either:

1. Query relationship-level records from
   `public.real_property_permit_parcel_relationship`.
2. Use a purpose-built materialized view.
3. Return a documented preview estimate only if explicitly requested.

Frontend production endpoints should avoid silent estimate behavior.

## Caching Recommendations

- Cache metadata endpoints such as permit types, work types, jurisdictions, and
  activity classes for 1 to 24 hours.
- Cache unfiltered statistics and trend responses for 15 to 60 minutes.
- Cache bounded map extent queries for 1 to 5 minutes if request volume is high.
- Include `generated_at`, `source_max_activity_date`, and `cache_status` in
  responses.
- Invalidate caches after permit ingestion, relationship rebuild, or analytics
  table refresh.

## Materialized View Recommendations

Initial materialized view candidates:

- `mv_development_activity_api_statistics`
- `mv_development_activity_api_trends_monthly`
- `mv_development_activity_api_hotspots`
- `mv_development_activity_api_zoning_summary`
- `mv_development_activity_api_filter_facets`
- `mv_development_activity_api_extent_summary`

Refresh strategy:

- Manual or scheduled refresh after permit ingestion.
- Use `CONCURRENTLY` only after unique indexes exist.
- Track refresh timestamps in an API metadata table.

## Indexing Recommendations

Recommended indexes on existing tables:

- `real_property_permit_clean(permit_id)`
- `real_property_permit_clean(permit_date)`
- `real_property_permit_clean(activity_year, activity_month)`
- `real_property_permit_clean(permit_type)`
- `real_property_permit_clean(work_type)`
- `real_property_permit_clean(permit_status)`
- `real_property_permit_clean(parcel_number)`
- `real_property_permit_parcel_relationship(permit_id)`
- `real_property_permit_parcel_relationship(official_parcel_id)`
- `real_property_permit_parcel_relationship(activity_date)`
- `real_property_permit_parcel_relationship(activity_year, activity_month)`
- `real_property_permit_parcel_relationship(permit_type)`
- `real_property_permit_parcel_relationship(work_type)`
- `real_property_permit_parcel_relationship(permit_status)`
- `real_property_permit_parcel_relationship(zoning_jurisdiction_name)`
- `development_activity_parcel_summary(official_parcel_id)`
- `development_activity_parcel_summary(development_activity_class)`
- `development_activity_parcel_summary(latest_permit_date)`
- `development_activity_parcel_summary(total_permit_count)`
- `development_activity_parcel_summary(zoning_jurisdiction_name)`
- `development_activity_time_summary(activity_year, activity_month)`
- `development_activity_time_summary(permit_type)`
- `development_activity_time_summary(work_type)`
- `development_activity_time_summary(permit_status)`
- `development_activity_time_summary(zoning_jurisdiction_name)`
- `development_activity_zoning_summary(zoning_jurisdiction_name)`
- `development_activity_zoning_summary(dominant_zoning_code_raw)`
- `development_activity_zoning_summary(dominant_zoning_general_normalized)`
- `development_activity_zoning_summary(permit_type)`

Future spatial indexes:

- `development_activity_parcel_summary USING GIST (geometry)` if geometry is
  included in the API summary table.
- Parcel centroid materialized view `USING GIST (centroid_geometry)` for
  hotspot maps.

## Future PostGIS Map Support

Spatial query modes:

- `bbox`: dashboard map extent query.
- `radius`: development activity near a point.
- `polygon`: custom area or planning district analysis.
- `viewport`: same as `bbox` with zoom-level metadata.

Map-specific rules:

- Require a bounded spatial filter for feature-level map payloads.
- Default geometry response should be centroid or simplified geometry.
- Return aggregate tiles or binned hotspots for wide extents.
- Do not stream full parcel geometries for countywide time playback.
- Use server-side geometry simplification by zoom level when needed.

Future time-enabled map filtering:

- Use `/development/temporal-query` for time-slice summaries.
- Use a future `/development/map-features` endpoint only after performance QA.
- Keep animated playback client-driven but API-bounded by date window and extent.
- Return stable feature IDs so SceneView can update graphics without full redraws.

## Error Handling

Standard error shape:

```json
{
  "error": {
    "code": "invalid_filter",
    "message": "month requires year when mode is month",
    "details": {
      "field": "month",
      "value": 5
    }
  },
  "request_id": "dev-req-example"
}
```

Recommended HTTP statuses:

- `200`: valid query, including empty result sets.
- `400`: invalid filter or incompatible parameters.
- `404`: requested feature or metadata item not found.
- `413`: spatial query too large or polygon too complex.
- `422`: valid syntax but unsupported semantic combination.
- `500`: unexpected server error.

## Implementation Readiness

Ready:

- Source tables exist.
- Permit-to-parcel relationship model exists.
- Development activity summary tables exist.
- Dashboard currently consumes generated outputs from these tables.
- Temporal frontend state and query preview are in place.

Remaining blockers:

- FastAPI project/service scaffold.
- Database connection and settings management.
- API response model definitions.
- Query builder and validation layer.
- Spatial response strategy for hotspot maps.
- Cache and materialized view refresh strategy.
- Auth/authorization strategy if this leaves local development.
- Performance testing against representative temporal and extent queries.
