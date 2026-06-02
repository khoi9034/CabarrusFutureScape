# Parcel Filter Specification

Future endpoints:

```http
GET /parcels/filter
GET /parcels/statistics
GET /parcels/zoning-summary
GET /parcels/governance-warnings
```

This document defines filter semantics only. It does not implement API routes
or connect the frontend.

## Core Filter Fields

| Filter | Source Field | Notes |
| --- | --- | --- |
| `zoning_jurisdiction` | `qa.zoning_jurisdiction_name` | Examples: Concord, Kannapolis, Cabarrus County / Unincorporated. |
| `zoning_category` | `qa.dominant_zoning_general_normalized` | Conservative category only. |
| `zoning_code` | `qa.dominant_zoning_code_raw` | Raw jurisdictional zoning code. |
| `subdivision` | `parcel.subdiv_name` or `qa.subdiv_name` | Exact or partial mode. |
| `neighborhood` | `parcel.nbh_name` or `qa.nbh_name` | Exact or partial mode. |
| `parcel_size_category` | `parcel.parcel_size_category` | From enriched parcel layer. |
| `valuation_band` | `parcel.valuation_band` | From enriched parcel layer. |
| `parcel_quality_status` | `parcel.parcel_quality_status` | `trusted`, `review`, etc. |
| `zoning_confidence` | `qa.zoning_assignment_confidence` | `high`, `medium`, `low`, `no_match`. |
| `governance_warning` | `qa.governance_warning_categories` | Array contains match. |
| `primary_warning` | `qa.primary_governance_warning` | Highest-priority warning. |
| `municipality` | future jurisdiction overlay | Do not derive from `mailcity`. |
| `planning_jurisdiction` | `qa.planning_jurisdiction_name` | ETJ/planning context where available. |

## Range Filters

| Filter | Source Field |
| --- | --- |
| `min_acres` / `max_acres` | `parcel.parcel_area_acres_calc` |
| `min_market_value` / `max_market_value` | `parcel.marketvalue_numeric` |
| `min_assessed_value` / `max_assessed_value` | `parcel.assessedvalue_numeric` |
| `min_value_per_acre` / `max_value_per_acre` | `parcel.value_per_acre` |
| `min_warning_count` / `max_warning_count` | `qa.governance_warning_count` |

## Boolean Filters

| Filter | Source Field |
| --- | --- |
| `safe_for_dashboard` | `qa.safe_for_dashboard` |
| `needs_governance_review` | `qa.needs_governance_review` |
| `has_multiple_zoning` | `qa.has_multiple_zoning` |
| `has_multiple_zoning_jurisdictions` | `qa.has_multiple_zoning_jurisdictions` |
| `has_no_zoning_match` | `qa.has_no_zoning_match` |
| `has_nearly_equal_overlap_split` | `qa.has_nearly_equal_overlap_split` |
| `has_tiny_sliver_overlap` | `qa.has_tiny_sliver_overlap` |

## Spatial Filters

Future spatial filters:

- `bbox=minx,miny,maxx,maxy`
- `radius=lon,lat,meters`
- `polygon=<GeoJSON polygon or saved geometry id>`
- `viewport=minx,miny,maxx,maxy`

Rules:

- All coordinates are EPSG:4326 unless specified.
- Use GiST geometry indexes.
- Use bounded result limits.
- Default list responses should return centroid, not full geometry.
- Polygon filters should reject excessive vertex counts.

## Filter Endpoint Parameters

Example:

```http
GET /parcels/filter?zoning_jurisdiction=Concord&zoning_confidence=high&safe_for_dashboard=true&limit=25
```

Supported parameters:

- all core filters
- all range filters
- all boolean filters
- spatial filters
- `limit`
- `cursor`
- `sort`
- `include_geometry`
- `geometry_format`

## Statistics Endpoint Parameters

Example:

```http
GET /parcels/statistics?zoning_jurisdiction=Concord&group_by=valuation_band
```

Supported `group_by` values:

- `zoning_jurisdiction`
- `zoning_category`
- `zoning_code`
- `valuation_band`
- `parcel_size_category`
- `parcel_quality_status`
- `zoning_confidence`
- `governance_warning`
- `primary_warning`
- `subdivision`
- `neighborhood`

Statistics should include:

- `parcel_count`
- `total_area_acres`
- `avg_area_acres`
- `total_valuation_basis`
- `avg_valuation_basis`
- `safe_for_dashboard_count`
- `review_count`

## Zoning Summary Endpoint

Example:

```http
GET /parcels/zoning-summary?zoning_jurisdiction=Kannapolis
```

Return:

- assigned parcels by jurisdiction
- code/category counts
- confidence counts
- multi-zone counts
- multi-jurisdiction counts
- no-match count
- unknown category count

## Governance Warnings Endpoint

Example:

```http
GET /parcels/governance-warnings?warning=review_multi_jurisdiction&limit=25
```

Supported warnings:

- `safe_for_dashboard`
- `review_low_confidence`
- `review_multi_jurisdiction`
- `review_near_tie`
- `review_sliver_overlap`
- `no_zoning_match`
- `jurisdiction_code_semantics_review`

Return warning rows from `public.parcel_zoning_intelligence_qa` with parcel
identity, zoning assignment, overlap diagnostics, and hotspot fields.

## Query Planning Notes

Likely query base:

```sql
FROM public.parcel_zoning_intelligence_qa AS qa
JOIN public.parcels_enriched AS parcel
  ON parcel.official_parcel_id = qa.official_parcel_id
```

Materialized view candidate:

```text
public.parcel_intelligence_api_view
```

Possible columns:

- parcel identity
- owner/mailing display fields
- valuation fields
- size fields
- zoning v2 fields
- QA warning fields
- centroid geometry
- simplified display geometry for map results

## Validation Rules

- Reject unknown enum values.
- Reject contradictory range filters.
- Reject spatial queries that exceed configured maximum extent.
- Require `limit <= 100`.
- Require deterministic sort keys.
- Return empty result sets as `200 OK`, not errors.
