# School Constraint Strategy

Phase 8A creates the school constraint data foundation for CFS. It focuses on
deterministic attendance-zone assignment only. Capacity, utilization, and
forecasting remain future work until a vetted school capacity/enrollment source
is approved.

This phase does not modify the frontend, SceneView, FastAPI endpoints, PostGIS
base parcel tables, or prediction models.

## Source Roles

Phase 8A registers and ingests four Cabarrus County Open Data layers:

| Source | Layer | Role | Geometry |
| --- | --- | --- | --- |
| Elementary School Attendance Zones | `MapServer/140` | Parcel elementary assignment | Polygon |
| Middle School Attendance Zones | `MapServer/141` | Parcel middle assignment | Polygon |
| High School Attendance Zones | `MapServer/142` | Parcel high assignment | Polygon |
| School Reference Points | `MapServer/144` | Name dictionary and QA reference | Point |

School points are never used to assign parcels by distance. They are preserved
as a reference dictionary for school name normalization and QA.

## CFS V1 Inclusion Policy

CFS V1 includes public elementary, middle, and high schools. Private, magnet,
and Other/non elementary-middle-high records are preserved in raw/QA outputs
but excluded from CFS V1 assignment outputs.

The current school reference ingest produced:

- raw school reference rows: `53`
- clean school reference rows: `53`
- CFS V1 included public elementary/middle/high reference rows: `41`
- excluded QA/reference rows: `12`

## Attendance Zone Ingestion

Phase 8A creates:

- `public.school_zones_elementary_raw`
- `public.school_zones_middle_raw`
- `public.school_zones_high_raw`
- `public.school_zones`

Current clean attendance zone results:

- elementary zones: `25`
- middle zones: `10`
- high zones: `9`
- merged clean zones: `44`
- included CFS V1 zones: `44`
- zone names needing school-reference QA: `6`

Unmatched reference names are preserved in
`outputs/school_zone_unmatched_names.csv` and do not block attendance-zone
assignment, because the polygon boundary is the authoritative assignment input.

## Parcel Assignment Method

`public.parcel_school_assignment` assigns each parcel to one elementary, one
middle, and one high attendance zone by polygon overlap:

1. Intersect `public.parcels_enriched.geometry` with `public.school_zones`.
2. Calculate overlap area in acres with geography-safe area.
3. For each parcel and school level, select the zone with the largest overlap.
4. Preserve overlap area, overlap percent, match confidence, and QA flags.
5. Flag missing, ambiguous, or non-exact reference conditions.

Current parcel assignment result:

- parcel assignment rows: `110,017`
- elementary assigned parcels: `108,279`
- middle assigned parcels: `108,272`
- high assigned parcels: `108,272`
- missing elementary assignment: `1,738`
- missing middle assignment: `1,745`
- missing high assignment: `1,745`

The output row count matches `public.parcels_enriched`.

## QA Interpretation

Assignment confidence values:

- `high`: all three levels assigned with strong overlap and no reference QA
  warning.
- `medium`: all three levels assigned but not fully high-confidence.
- `review`: assignment exists, but one or more QA warnings should be reviewed.
- `low`: no attendance zone assignment was available.

Review flags include:

- `missing_elementary_zone`
- `missing_middle_zone`
- `missing_high_zone`
- `multiple_elementary_zone_overlap`
- `multiple_middle_zone_overlap`
- `multiple_high_zone_overlap`
- `unmatched_or_non_exact_school_reference`

Large review counts are expected while zone names such as `West Cabarrus HS`,
`Roberta Road MS`, and `Hickory Ridge ES` need school-reference dictionary QA.

## Capacity Placeholder

`public.school_capacity` is intentionally empty in Phase 8A. It defines the
future shape for enrollment and capacity data:

- `enrollment`
- `program_capacity`
- `utilization_percent`
- `available_seats`
- `capacity_status`
- `school_year`
- source metadata

No capacity score is produced until real capacity/enrollment data exists.

## Parcel School Summary

`public.parcel_school_summary` combines attendance-zone assignment with the
capacity placeholder. It contains one row per parcel and keeps school capacity
fields as `not_available` or `NULL`.

Current summary result:

- parcel school summary rows: `110,017`
- non-null school constraint scores: `0`
- school constraint class: `not_scored`
- recommended action when capacity is missing: `capacity_data_needed`

## Generated Outputs

Phase 8A writes:

- `outputs/school_reference_validation.json`
- `outputs/school_reference_included_excluded_summary.csv`
- `outputs/school_zones_validation.json`
- `outputs/school_zone_match_qa.csv`
- `outputs/school_zone_unmatched_names.csv`
- `outputs/parcel_school_assignment_validation.json`
- `outputs/parcel_school_assignment_warnings.csv`
- `outputs/parcel_school_summary_validation.json`
- `outputs/phase8a_school_constraint_ingestion_summary.json`

## Future API and UI Path

Recommended next steps:

1. Review unmatched school reference names and decide whether to adjust the
   reference dictionary.
2. Define the school constraint API contract.
3. Add read-only FastAPI endpoints for selected parcel school assignment and
   countywide school assignment summaries.
4. Add frontend selected parcel school summary only after backend endpoints are
   stable.
5. Add capacity/enrollment scoring only after a vetted capacity source exists.

Forecasting should wait until attendance-zone assignment, capacity source
ownership, and school planning interpretation rules are stable.
