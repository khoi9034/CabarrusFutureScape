# Development Activity Temporal Query Specification

Planning specification for future time-enabled development activity API
queries. This document defines request behavior only. It does not implement
FastAPI, direct frontend-to-PostGIS access, map animation, or live permit
services.

## Query Goals

Temporal queries should power:

- development activity dashboards
- permit trend panels
- time slider controls
- future SceneView time filtering
- hotspot map requests
- year-over-year executive summaries
- permit intelligence drilldowns

Primary source tables:

- `public.development_activity_time_summary`
- `public.development_activity_parcel_summary`
- `public.development_activity_zoning_summary`
- `public.real_property_permit_parcel_relationship`

## Supported Temporal Modes

### `single_year`

Required:

- `year`

Optional:

- `permit_type`
- `work_type`
- `zoning_jurisdiction`
- `zoning_code`
- `activity_class`
- `permit_status`
- `bbox`

Behavior:

- Resolve `start_date` to `YYYY-01-01`.
- Resolve `end_date` to `YYYY-12-31`.
- Aggregate by year unless `include_monthly_breakdown=true`.

### `month`

Required:

- `year`
- `month`

Behavior:

- Resolve to the first and last day of the month.
- Return bucket summary and optional feature list.
- `month` without `year` is invalid.

### `date_range`

Required:

- `start_date`
- `end_date`

Behavior:

- Use inclusive date filtering.
- Reject ranges where `start_date > end_date`.
- For wide ranges, prefer aggregate summaries unless `include_features=true`
  and the result is below the feature cap.

### `rolling_12`

Required:

- `anchor_date`, defaulting to source max activity date if omitted.

Behavior:

- Use the 12 months ending at `anchor_date`.
- Return total counts plus monthly buckets.

### `rolling_36`

Required:

- `anchor_date`, defaulting to source max activity date if omitted.

Behavior:

- Use the 36 months ending at `anchor_date`.
- Return total counts plus annual or monthly buckets depending on `grain`.

### `year_over_year`

Required:

- `year`

Optional:

- `comparison_year`, default `year - 1`.

Behavior:

- Return current year, comparison year, delta, and percent change.
- Support the same permit, work, jurisdiction, zoning, and status filters.

## Filter Parameters

| Parameter | Type | Notes |
| --- | --- | --- |
| `year` | integer | Four-digit year. |
| `month` | integer | `1` through `12`, requires `year`. |
| `start_date` | date | Inclusive ISO date. |
| `end_date` | date | Inclusive ISO date. |
| `anchor_date` | date | Used for rolling windows. |
| `permit_type` | string | Normalized permit type. |
| `work_type` | string | Normalized work type. |
| `zoning_jurisdiction` | string | Zoning source jurisdiction. |
| `zoning_code` | string | Raw dominant zoning code. |
| `activity_class` | string | Parcel activity class. |
| `permit_status` | string | Normalized permit status. |
| `bbox` | string | `minx,miny,maxx,maxy` in EPSG:4326. |
| `include_features` | boolean | Default `false`. |
| `include_geometry` | boolean | Default `false`. |
| `geometry_format` | string | `centroid`, `geojson`, or `none`. |
| `limit` | integer | Default `25`, max `500`. |
| `cursor` | string | Opaque cursor for feature pagination. |

## Query Resolution Rules

1. Validate temporal mode and required parameters.
2. Resolve the effective date window.
3. Validate categorical filters against metadata endpoints.
4. Choose the best source:
   - time summary for trend aggregates
   - zoning summary for zoning aggregates
   - parcel summary for hotspots
   - relationship table for combined detailed filters
5. Apply spatial constraints only on geometry-enabled tables or materialized
   views.
6. Return query metadata explaining the source table and any caveats.

## Aggregate Query Patterns

### Year Trend

```sql
SELECT
  activity_year,
  SUM(permit_count) AS permit_count,
  SUM(active_parcel_count) AS active_parcel_count,
  SUM(source_permit_amount_total) AS permit_amount_total
FROM public.development_activity_time_summary
WHERE activity_year BETWEEN :start_year AND :end_year
GROUP BY activity_year
ORDER BY activity_year;
```

### Month Trend

```sql
SELECT
  activity_year,
  activity_month,
  SUM(permit_count) AS permit_count,
  SUM(active_parcel_count) AS active_parcel_count
FROM public.development_activity_time_summary
WHERE activity_year = :year
GROUP BY activity_year, activity_month
ORDER BY activity_year, activity_month;
```

### Zoning Activity

```sql
SELECT
  zoning_jurisdiction_name,
  dominant_zoning_code_raw,
  dominant_zoning_general_normalized,
  SUM(permit_count) AS permit_count,
  SUM(active_parcel_count) AS active_parcel_count
FROM public.development_activity_zoning_summary
WHERE zoning_jurisdiction_name = :zoning_jurisdiction
GROUP BY
  zoning_jurisdiction_name,
  dominant_zoning_code_raw,
  dominant_zoning_general_normalized
ORDER BY permit_count DESC;
```

### Detailed Combined Temporal Query

For combined filters not fully represented by summary tables, query the
relationship layer or a future materialized view:

```sql
SELECT
  official_parcel_id,
  COUNT(DISTINCT permit_id) AS permit_count,
  MAX(activity_date) AS latest_activity_date,
  SUM(permit_amount) AS permit_amount_total
FROM public.real_property_permit_parcel_relationship
WHERE activity_date BETWEEN :start_date AND :end_date
  AND permit_type = :permit_type
  AND zoning_jurisdiction_name = :zoning_jurisdiction
GROUP BY official_parcel_id
ORDER BY permit_count DESC, latest_activity_date DESC
LIMIT :limit;
```

## Spatial Query Planning

Future spatial support should be implemented only after geometry-enabled API
views are defined.

Supported spatial modes:

- `bbox`: map extent query.
- `viewport`: bbox plus zoom and display constraints.
- `radius`: activity around a point.
- `polygon`: custom planning area.

Rules:

- Reject unbounded feature-level spatial queries.
- Enforce max bbox area for feature payloads.
- Prefer aggregate responses for wide county extents.
- Return centroids by default for hotspot map requests.
- Simplify geometries server-side by zoom level if polygon geometry is needed.
- Keep spatial result limits separate from aggregate summaries.

Example bbox planning query:

```sql
SELECT
  official_parcel_id,
  total_permit_count,
  latest_permit_date,
  development_activity_class,
  ST_AsGeoJSON(ST_Centroid(geometry)) AS centroid
FROM public.development_activity_parcel_summary
WHERE geometry && ST_MakeEnvelope(:minx, :miny, :maxx, :maxy, 4326)
  AND latest_permit_date BETWEEN :start_date AND :end_date
ORDER BY development_activity_score DESC
LIMIT :limit;
```

## Time-Enabled Map Filtering

Future SceneView integration should use a staged path:

1. API returns summary-only temporal counts.
2. API returns bounded hotspot centroids for the current extent.
3. SceneView updates development hotspot graphics for explicit user queries.
4. Time slider changes query parameters but does not auto-play by default.
5. Animated playback is added only after API performance and UX limits are
   validated.

Do not stream full countywide permit records to the browser for animation.

## Response Metadata

Every temporal response should include:

- `mode`
- `resolved_date_window`
- `filters`
- `source_tables`
- `source_max_activity_date`
- `generated_at`
- `cache_status`
- `warnings`
- `pagination` when feature rows are returned

## Validation Rules

- `month` requires `year`.
- `rolling_12` and `rolling_36` may use default `anchor_date`.
- `date_range` requires both `start_date` and `end_date`.
- `start_date` must be before or equal to `end_date`.
- `include_geometry=true` requires `include_features=true`.
- `bbox` must be EPSG:4326 and `minx < maxx`, `miny < maxy`.
- `limit` must be positive and no greater than the endpoint max.
- Unknown categorical values should return `400`, unless
  `allow_unknown_filter_values=true` is explicitly supported for exploration.

## Performance Requirements

Initial targets for local development:

- Metadata endpoints: under `100 ms`.
- Aggregate trend endpoints: under `300 ms`.
- Hotspot list endpoints: under `500 ms`.
- Bounded map extent queries: under `1000 ms`.
- Wide extent or polygon queries: return aggregate fallback or `413`.

Production targets should be set after real infrastructure and cache strategy
are known.
