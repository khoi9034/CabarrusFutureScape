# Development Activity Data Dictionary

Backend planning dictionary for future Development Activity API responses.

Source tables:

- `public.real_property_permit_clean`
- `public.real_property_permit_parcel_relationship`
- `public.development_activity_parcel_summary`
- `public.development_activity_time_summary`
- `public.development_activity_zoning_summary`

## Permit Source Fields

| Field | Source | Type | API Use |
| --- | --- | --- | --- |
| `permit_id` | real property permit clean | text | Stable permit identifier. Unique in the clean permit table. |
| `permit_number` | real property permit clean | text | Human-readable permit number for display/search. |
| `permit_date` | real property permit clean | date | Source permit date. |
| `activity_date` | real property permit clean / relationship | date | Canonical date used for temporal analysis. |
| `activity_year` | real property permit clean / relationship | integer | Year filter and aggregate key. |
| `activity_month` | real property permit clean / relationship | integer | Month filter and aggregate key. |
| `parcel_number` | real property permit clean / relationship | text | Source parcel/PIN join field. |
| `parcel_number_normalized` | relationship | text | Normalized join key used for parcel relationship QA. |
| `parcel_id_source` | real property permit clean | text | Source parcel ID field if present. |
| `permit_code` | real property permit clean / relationship | text | Source permit code. |
| `permit_type` | real property permit clean / relationship | text | Source permit type. |
| `permit_type_normalized` | relationship / time summary | text | Normalized permit category for filters. |
| `work_type` | real property permit clean / relationship | text | Source work type. |
| `work_type_normalized` | relationship / time summary | text | Normalized work category for filters. |
| `permit_status` | real property permit clean / relationship | text | Source permit status. |
| `permit_status_normalized` | relationship / time summary | text | Normalized permit status for filters. |
| `permit_amount` | real property permit clean / relationship | numeric | Permit valuation/amount for summaries. |
| `building_number` | real property permit clean | text | Building number if present. |
| `appraiser` | real property permit clean / relationship | text | Appraiser/source staff field if present. |
| `co_date` | real property permit clean | date | Certificate of occupancy date. |
| `co_date_future_outlier` | clean / relationship | boolean | QA flag for future/outlier CO dates. |
| `missing_or_invalid_permit_date` | clean | boolean | QA flag for date usability. |

## Permit-to-Parcel Relationship Fields

| Field | Source | Type | API Use |
| --- | --- | --- | --- |
| `relationship_id` | relationship | text | Stable relationship row key. |
| `official_parcel_id` | relationship / parcel summary | text | Stable CFS parcel ID. |
| `objectid_1` | relationship / parcel summary | bigint | Parcel source object key. |
| `pin14` | relationship / parcel summary | text | Parcel business identifier, not globally unique. |
| `has_parcel_match` | relationship | boolean | Whether permit resolved to a parcel. |
| `has_multiple_parcel_matches` | relationship | boolean | Whether permit resolved ambiguously. |
| `missing_parcel_match` | relationship | boolean | Whether permit did not resolve to a parcel. |
| `relationship_method` | relationship | text | Exact or normalized join strategy. |
| `relationship_confidence` | relationship | text | `high`, `medium`, `low`, or `no_match`. |
| `parcel_quality_status` | relationship / parcel summary | text | Parcel quality class carried into permit context. |
| `valuation_band` | relationship / parcel summary | text | Parcel valuation class. |
| `parcel_size_category` | relationship / parcel summary | text | Parcel size class. |
| `governance_warning_categories` | relationship | text[] | Parcel zoning governance warnings carried through. |

## Zoning Context Fields

| Field | Source | Type | API Use |
| --- | --- | --- | --- |
| `zoning_jurisdiction_name` | relationship / summaries | text | Zoning source jurisdiction. |
| `dominant_zoning_code_raw` | relationship / summaries | text | Raw dominant zoning code. |
| `dominant_zoning_general_normalized` | relationship / summaries | text | Conservative normalized zoning category. |
| `zoning_assignment_confidence` | relationship / parcel summary | text | Zoning overlay confidence. |
| `planning_jurisdiction_name` | parcel summary | text | Planning/ETJ context when available. |

## Parcel Activity Summary Fields

| Field | Source | Type | API Use |
| --- | --- | --- | --- |
| `total_permit_count` | parcel summary | integer | Primary hotspot count. |
| `first_permit_date` | parcel summary | date | First matched permit activity. |
| `latest_permit_date` | parcel summary | date | Latest matched permit activity. |
| `active_year_count` | parcel summary | integer | Count of years with permit activity. |
| `recent_permit_count_1yr` | parcel summary | integer | Recent trailing one-year activity. |
| `recent_permit_count_3yr` | parcel summary | integer | Recent trailing three-year activity. |
| `total_permit_amount` | parcel summary | numeric | Total permit amount for matched permits. |
| `avg_permit_amount` | parcel summary | numeric | Average permit amount. |
| `dominant_permit_type` | parcel summary | text | Most common permit type for the parcel. |
| `dominant_work_type` | parcel summary | text | Most common work type for the parcel. |
| `latest_permit_status` | parcel summary | text | Status on the latest permit activity. |
| `ambiguous_permit_count` | parcel summary | integer | Ambiguous relationship count. |
| `has_unmatched_or_ambiguous_permit_flag` | parcel summary | boolean | Hotspot QA caution. |
| `co_date_future_outlier_count` | parcel summary | integer | CO date QA count. |
| `development_activity_score` | parcel summary | numeric | Activity score for ranking. |
| `development_activity_class` | parcel summary | text | `no_activity`, `low_activity`, `moderate_activity`, `high_activity`, `very_high_activity`. |
| `activity_anchor_date` | parcel summary | date | Max activity date used for recent windows. |

## Time Summary Fields

| Field | Source | Type | API Use |
| --- | --- | --- | --- |
| `activity_year` | time summary | integer | Year bucket. |
| `activity_month` | time summary | integer | Month bucket. |
| `permit_type` | time summary | text | Permit type grouping. |
| `work_type` | time summary | text | Work type grouping. |
| `permit_status` | time summary | text | Permit status grouping. |
| `zoning_jurisdiction_name` | time summary | text | Zoning jurisdiction grouping. |
| `permit_count` | time summary | integer | Distinct permit count. |
| `relationship_row_count` | time summary | integer | Relationship row count, can exceed permit count for ambiguous joins. |
| `active_parcel_count` | time summary | integer | Distinct matched parcels. |
| `unmatched_permit_count` | time summary | integer | Distinct unmatched permits. |
| `ambiguous_permit_count` | time summary | integer | Distinct ambiguous permits. |
| `co_date_future_outlier_count` | time summary | integer | CO date QA count. |
| `source_permit_amount_total` | time summary | numeric | Source permit amount total. |
| `relationship_permit_amount_total` | time summary | numeric | Relationship-row amount total. |
| `first_permit_date` | time summary | date | First permit date in bucket. |
| `latest_permit_date` | time summary | date | Latest permit date in bucket. |

## Zoning Activity Summary Fields

| Field | Source | Type | API Use |
| --- | --- | --- | --- |
| `zoning_jurisdiction_name` | zoning summary | text | Zoning source jurisdiction. |
| `dominant_zoning_general_normalized` | zoning summary | text | Conservative category. |
| `dominant_zoning_code_raw` | zoning summary | text | Raw zoning code. |
| `permit_type` | zoning summary | text | Permit type grouping. |
| `permit_count` | zoning summary | integer | Distinct permit count. |
| `relationship_row_count` | zoning summary | integer | Relationship row count. |
| `active_parcel_count` | zoning summary | integer | Distinct matched parcels. |
| `unmatched_permit_count` | zoning summary | integer | Distinct unmatched permits. |
| `ambiguous_permit_count` | zoning summary | integer | Ambiguous permit count. |
| `total_permit_amount` | zoning summary | numeric | Total permit amount. |
| `avg_permit_amount` | zoning summary | numeric | Average permit amount. |
| `first_permit_date` | zoning summary | date | First permit date in group. |
| `latest_permit_date` | zoning summary | date | Latest permit date in group. |

## Response Metadata Fields

| Field | Type | API Use |
| --- | --- | --- |
| `generated_at` | timestamp | Analytics artifact or materialized view freshness. |
| `source_max_activity_date` | date | Max permit activity date represented. |
| `query_mode` | text | Temporal mode or aggregate source used. |
| `cache_status` | text | `hit`, `miss`, `bypass`, or `not_configured`. |
| `warnings` | array | Data quality or query caveats. |
| `pagination` | object | Cursor and page size metadata. |

## Data Quality Notes

- `permit_id` is unique in `public.real_property_permit_clean`.
- `parcel_number` is fully populated in the Real Property Permit source and is
  the primary join candidate.
- Permit-to-parcel matching is high quality, but unmatched and ambiguous cases
  must remain visible.
- CO dates include known future/outlier values and should not drive primary
  temporal filtering until QA rules are finalized.
- `activity_date` should be the default date for trends and time slider work.
- Zoning categories are conservative and do not create full municipal zoning
  equivalency.
