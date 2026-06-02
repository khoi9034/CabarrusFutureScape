# Parcel Intelligence Data Dictionary

Backend planning dictionary for future Parcel Intelligence API responses.

Source tables:

- `public.parcels_enriched`
- `public.parcel_zoning_overlay_v2`
- `public.parcel_zoning_intelligence_qa`

## Identity Fields

| Field | Source | Type | API Use |
| --- | --- | --- | --- |
| `official_parcel_id` | all three tables | text | Stable CFS parcel key and endpoint path ID. |
| `objectid_1` | parcels / overlays | bigint | Internal source object key from parcel ingestion. |
| `pin14` | parcels / overlays | text | Business parcel identifier. Searchable, not unique. |
| `oldpin` | parcels | text | Legacy parcel identifier if present. |
| `propertyreal_id` | parcels | text | Property record identifier if present. |

## Ownership And Mailing Fields

| Field | Source | Type | API Use |
| --- | --- | --- | --- |
| `acctname1` | parcels | text | Owner/account search and display. |
| `acctname2` | parcels | text | Secondary owner/account display. |
| `mailaddr1` | parcels | text | Mailing address search/display. |
| `mailaddr2` | parcels | text | Mailing address display. |
| `mailcity` | parcels | text | Mailing city search clue, not municipality authority. |
| `mailstate` | parcels | text | Mailing state display/filter. |
| `mailzipcode` | parcels | text | Mailing ZIP search/filter. |

## Location And Context Fields

| Field | Source | Type | API Use |
| --- | --- | --- | --- |
| `subdiv_name` | parcels / overlays | text | Subdivision search/filter and hotspot analysis. |
| `nbh_name` | parcels / overlays | text | Neighborhood search/filter and hotspot analysis. |
| `legaldesc` | parcels | text | Detail display, not default search unless needed. |
| `planning_jurisdiction_name` | zoning v2 / QA | text | Planning/ETJ context. Not zoning authority. |
| `planning_boundary_type` | zoning v2 / QA | text | Boundary type, currently `etj` where available. |

## Valuation Fields

| Field | Source | Type | API Use |
| --- | --- | --- | --- |
| `marketvalue_numeric` | parcels | numeric | Detail display, range filters, statistics. |
| `assessedvalue_numeric` | parcels | numeric | Detail display, range filters, statistics. |
| `landvalue_numeric` | parcels | numeric | Land value analysis. |
| `deferredvalue_numeric` | parcels | numeric | Tax/value context. |
| `buildingvalue_numeric` | parcels | numeric | Improvement value context. |
| `obxfvalue_numeric` | parcels | numeric | Other building/feature value context. |
| `valuation_basis` | parcels | numeric | Preferred value for summary/statistics. |
| `value_per_acre` | parcels | double | Opportunity/valuation intensity signal. |
| `valuation_band` | parcels | text | Filter and aggregate bucket. |

## Parcel Quality And Size Fields

| Field | Source | Type | API Use |
| --- | --- | --- | --- |
| `parcel_quality_status` | parcels / overlays | text | Filter and response QA signal. |
| `geometry_quality_status` | parcels | text | Detail QA signal. |
| `area_quality_status` | parcels | text | Detail QA signal. |
| `valuation_quality_status` | parcels | text | Detail QA signal. |
| `subdivision_quality_status` | parcels | text | Detail QA signal. |
| `outlier_flags` | parcels | text[] | Detail warning list. |
| `outlier_flag_count` | parcels | integer | Sorting/filter support. |
| `parcel_area_sq_m` | parcels / overlays | double | Area display/statistics. |
| `parcel_area_acres_calc` | parcels / overlays | double | Area display/filter. |
| `parcel_size_category` | parcels | text | Filter category. |
| `has_valid_geometry` | parcels | boolean | Backend QA. |
| `has_valid_area` | parcels | boolean | Backend QA. |
| `has_valid_value_fields` | parcels | boolean | Backend QA. |
| `has_duplicate_pin14` | parcels | boolean | Identifier caution. |

## Zoning Assignment Fields

| Field | Source | Type | API Use |
| --- | --- | --- | --- |
| `zoning_jurisdiction_name` | zoning v2 / QA | text | Filter, aggregate, display. |
| `dominant_zoning_code_raw` | zoning v2 / QA | text | Raw zoning code display/search/filter. |
| `dominant_zoning_general_raw` | zoning v2 / QA | text | Source general category where available. |
| `dominant_zoning_general_normalized` | zoning v2 / QA | text | Conservative helper category. |
| `dominant_zoning_label_normalized` | zoning v2 / QA | text | Display/search label. |
| `zoning_overlap_count` | zoning v2 / QA | bigint | Number of zoning polygons intersecting parcel. |
| `zoning_jurisdiction_overlap_count` | zoning v2 / QA | bigint | Number of jurisdictions intersecting parcel. |
| `dominant_overlap_pct` | zoning v2 / QA | double | Dominant zoning overlap confidence input. |
| `total_zoning_overlap_pct` | zoning v2 / QA | double | Total zoning overlap coverage. |
| `zoning_assignment_confidence` | zoning v2 / QA | text | `high`, `medium`, `low`, `no_match`. |
| `zoning_join_status` | zoning v2 / QA | text | Assignment path/status. |
| `has_multiple_zoning` | zoning v2 / QA | boolean | Multi-zone warning input. |
| `has_multiple_zoning_jurisdictions` | zoning v2 / QA | boolean | Multi-jurisdiction warning input. |
| `has_no_zoning_match` | zoning v2 / QA | boolean | No-match warning input. |

## Zoning Ambiguity Fields

| Field | Source | Type | API Use |
| --- | --- | --- | --- |
| `second_zoning_jurisdiction_name` | zoning v2 / QA | text | Near-tie diagnostics. |
| `second_zoning_code_raw` | zoning v2 / QA | text | Near-tie diagnostics. |
| `second_overlap_pct` | zoning v2 / QA | double | Near-tie diagnostics. |
| `top_two_overlap_pct_gap` | zoning v2 / QA | double | Near-tie warning input. |
| `tiny_sliver_overlap_count` | zoning v2 / QA | bigint | Sliver warning input. |
| `municipal_zoning_dominates_county_overlap` | zoning v2 / QA | boolean | Routing diagnostic. |
| `has_nearly_equal_overlap_split` | zoning v2 / QA | boolean | Near-tie warning input. |
| `has_tiny_sliver_overlap` | zoning v2 / QA | boolean | Sliver warning input. |

## Governance QA Fields

| Field | Source | Type | API Use |
| --- | --- | --- | --- |
| `governance_warning_categories` | QA | text[] | All QA categories for API consumers. |
| `governance_warning_count` | QA | integer | Sorting/filter support. |
| `primary_governance_warning` | QA | text | Highest-priority warning. |
| `safe_for_dashboard` | QA | boolean | Dashboard/API readiness signal. |
| `needs_governance_review` | QA | boolean | Review routing signal. |
| `qa_status` | QA | text | Coarse QA status. |

Warning categories:

- `safe_for_dashboard`
- `review_low_confidence`
- `review_multi_jurisdiction`
- `review_near_tie`
- `review_sliver_overlap`
- `no_zoning_match`
- `jurisdiction_code_semantics_review`

## Geometry Fields

| Field | Source | Type | API Use |
| --- | --- | --- | --- |
| `geometry` | all three tables | geometry | Detail response or spatial query. |

List/search endpoints should default to `include_geometry=false`. Detail
endpoints may return GeoJSON geometry or centroid based on request parameters.

## Municipality Note

No authoritative municipality field currently exists in the parcel tables.
Future API support for `municipality` should come from a governed municipal
boundary or jurisdiction overlay, not from `mailcity`.
