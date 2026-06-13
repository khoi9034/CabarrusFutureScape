# School Constraint Data Dictionary

Cabarrus FutureScape Phase 8A data dictionary for school constraint ingestion
and parcel attendance-zone assignment.

No FastAPI school endpoints are implemented in Phase 8A. This document defines
the data model that future read-only endpoints can use.

## Source Tables

### `public.school_reference_raw`

Raw Cabarrus school reference point features from `MapServer/144`.

| Field | Role | Notes |
| --- | --- | --- |
| `objectid` / `source_objectid` | source identifier | Original ArcGIS object ID. |
| `level_` | source level | School level when supplied. |
| `status` | source metadata | Preserved for QA. |
| `parktype` | source metadata | Preserved for QA. |
| `code` | source code | Source school code/label context. |
| `label` | display name | Source short label. |
| `school` | school name | Source school name. |
| `add_` | address | Source address field. |
| `geometry` | point geometry | Reference point only; not used for parcel assignment. |

### `public.school_reference`

Clean school reference dictionary. Includes public CCS CFS V1 records and
excluded QA records.

| Field | Type | Description |
| --- | --- | --- |
| `school_reference_id` | text | Deterministic CFS reference ID. |
| `school_name_short` | text | Short display name when available. |
| `school_name_full` | text | Full school name when available. |
| `school_name_normalized` | text | Normalized name used for zone matching. |
| `school_level` | text | `elementary`, `middle`, `high`, or null/unknown. |
| `school_type` | text | `public` or `non_cfs_v1`. |
| `school_system` | text | Source-inferred system such as `CCS` or `KCS`. |
| `address` | text | Reference address. |
| `include_in_cfs_v1` | boolean | True for public CCS elementary/middle/high school references. |
| `exclusion_reason` | text | Reason excluded from CFS V1, when applicable. |
| `source_layer` | text | Source layer label. |
| `source_objectid` | text | Source object ID. |
| `geometry` | geometry(Point,4326) | Reference point geometry. |

## Attendance Zone Tables

Raw zone tables:

- `public.school_zones_elementary_raw`
- `public.school_zones_middle_raw`
- `public.school_zones_high_raw`

Clean merged zone table:

### `public.school_zones`

| Field | Type | Description |
| --- | --- | --- |
| `zone_id` | text | Deterministic CFS zone ID. |
| `school_name_raw` | text | Source zone school name. |
| `school_name_normalized` | text | Normalized name for reference matching. |
| `school_level` | text | `elementary`, `middle`, or `high`. |
| `school_system` | text | Inferred or matched school system, such as `CCS` or `KCS`. |
| `matched_school_reference_id` | text | Matching `public.school_reference` ID when available. |
| `match_confidence` | text | `normalized_exact`, `fuzzy_review`, or unmatched QA value. |
| `include_in_cfs_v1` | boolean | True when zone is eligible for CFS V1 assignment. |
| `exclusion_reason` | text | Reason excluded, when applicable. |
| `source_layer` | text | Source layer label. |
| `source_layer_id` | integer | ArcGIS layer ID: 140, 141, or 142. |
| `source_objectid` | text | Source ArcGIS object ID. |
| `geometry` | geometry(MultiPolygon,4326) | Attendance-zone polygon. |

## Parcel Assignment Table

### `public.parcel_school_assignment`

One row per parcel from `public.parcels_enriched`.

| Field | Type | Description |
| --- | --- | --- |
| `official_parcel_id` | text | Stable CFS parcel identifier. |
| `pin14` | text | Parcel PIN. |
| `objectid_1` | bigint | Parcel source object ID. |
| `elementary_zone_id` | text | Assigned elementary zone by largest overlap. |
| `elementary_school_name` | text | Assigned elementary school name. |
| `elementary_school_name_normalized` | text | Normalized elementary school name. |
| `elementary_overlap_area_acres` | numeric | Parcel overlap area with selected elementary zone. |
| `elementary_overlap_percent` | numeric | Percent of parcel covered by selected elementary zone. |
| `elementary_match_confidence` | text | Reference-name match confidence. |
| `middle_zone_id` | text | Assigned middle zone by largest overlap. |
| `middle_school_name` | text | Assigned middle school name. |
| `middle_school_name_normalized` | text | Normalized middle school name. |
| `middle_overlap_area_acres` | numeric | Parcel overlap area with selected middle zone. |
| `middle_overlap_percent` | numeric | Percent of parcel covered by selected middle zone. |
| `middle_match_confidence` | text | Reference-name match confidence. |
| `high_zone_id` | text | Assigned high zone by largest overlap. |
| `high_school_name` | text | Assigned high school name. |
| `high_school_name_normalized` | text | Normalized high school name. |
| `high_overlap_area_acres` | numeric | Parcel overlap area with selected high zone. |
| `high_overlap_percent` | numeric | Percent of parcel covered by selected high zone. |
| `high_match_confidence` | text | Reference-name match confidence. |
| `*_zone_overlap_count` | integer | Number of overlapping zones for that school level. |
| `has_*_assignment` | boolean | True when a level assignment exists. |
| `missing_*_zone` | boolean | True when no zone assignment exists. |
| `multiple_*_zone_overlap` | boolean | True when a parcel overlaps more than one zone for a level. |
| `any_unmatched_school_reference` | boolean | True when a selected zone lacks an exact reference match. |
| `school_assignment_review_required` | boolean | True when assignment QA warnings exist. |
| `school_assignment_confidence` | text | `high`, `medium`, `review`, or `low`. |
| `assignment_method` | text | `attendance_zone_largest_overlap` or `no_attendance_zone_available`. |
| `data_quality_flags` | text[] | QA flags for downstream API/UI use. |
| `geometry` | geometry(MultiPolygon,4326) | Parcel geometry. |

## Capacity Placeholder

### `public.school_capacity`

Empty Phase 8A placeholder for future vetted capacity/enrollment data.

| Field | Description |
| --- | --- |
| `school_capacity_id` | Future capacity row ID. |
| `school_reference_id` | Future link to school reference. |
| `school_name_normalized` | Future join key. |
| `school_level` | Elementary/middle/high. |
| `school_system` | School system. |
| `school_year` | Source school year. |
| `enrollment` | Future enrollment value. |
| `program_capacity` | Future capacity value. |
| `utilization_percent` | Future utilization calculation. |
| `available_seats` | Future available-seat calculation. |
| `capacity_status` | Future status class. |
| `capacity_data_available` | True only when real capacity data exists. |

Phase 8A row count is `0`. No capacity score is produced.

## Parcel Summary Table

### `public.parcel_school_summary`

Combines `public.parcel_school_assignment` with `public.school_capacity`.

| Field | Description |
| --- | --- |
| `official_parcel_id`, `pin14`, `objectid_1` | Parcel identity. |
| `elementary_*`, `middle_*`, `high_*` | Assigned schools and capacity placeholders. |
| `school_assignment_confidence` | Assignment confidence. |
| `school_assignment_review_required` | Assignment QA review flag. |
| `school_capacity_data_available` | False until real capacity data exists. |
| `school_capacity_review_required` | False in Phase 8A without capacity data. |
| `school_capacity_score` | Null in Phase 8A. |
| `school_constraint_score` | Null in Phase 8A. |
| `school_constraint_class` | `not_scored` in Phase 8A. |
| `school_summary_status` | Assignment/capacity readiness status. |
| `recommended_action` | `capacity_data_needed`, `assignment_review`, or `monitor`. |
| `data_quality_flags` | Assignment and capacity QA flags. |
| `geometry` | Parcel MultiPolygon, SRID 4326. |

## Current Phase 8A Counts

- school reference raw rows: `53`
- school reference clean rows: `53`
- CFS V1 included public CCS school references: `34`
- excluded/preserved school references: `19`
- clean school zones: `44`
- CFS V1 included school zones: `35`
- excluded/preserved school zones: `9`
- parcel school assignment rows: `110,017`
- assignment review required parcels: `75,143`
- parcel school summary rows: `110,017`
- school capacity rows: `0`
- non-null school constraint scores: `0`

Excluded reference rows remain available for QA and future policy expansion:
`level_not_v1` = `11`, `non_ccs_not_v1` = `7`, and `magnet_not_v1` = `1`.
KCS attendance zones are preserved in source/QA tables but are not used for CFS
V1 parcel assignment.

## Phase 8B API Readiness Notes

Implemented read-only endpoints:

- `GET /constraints/schools/{official_parcel_id}`
- `GET /constraints/schools/statistics`
- `GET /constraints/schools/filter`
- `GET /constraints/schools/district-summary`
- `GET /constraints/schools/qa-summary`

These endpoints expose assignment, capacity-readiness, and QA status. They do
not expose a final school capacity score because `public.school_capacity` is
empty and no vetted enrollment/capacity source has been ingested.

Core response caveats:

- `capacity_status` remains `not_available`.
- `school_capacity_score` remains `NULL`.
- `school_constraint_score` remains `NULL`.
- `school_constraint_class` remains `not_scored`.
- `recommended_action` remains `capacity_data_needed` while capacity is absent.

Future endpoints may add:

- `GET /constraints/schools/zones`
- `GET /constraints/schools/summary`

Capacity scoring should remain unavailable until real enrollment/capacity data is
ingested and reviewed.
