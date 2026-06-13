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

CFS V1 includes public Cabarrus County Schools (CCS) elementary, middle, and
high schools only. Kannapolis City Schools (KCS), private, magnet, and
Other/non elementary-middle-high records are preserved in raw/QA outputs but
excluded from CFS V1 assignment outputs.

The current school reference ingest produced:

- raw school reference rows: `53`
- clean school reference rows: `53`
- CFS V1 included public CCS elementary/middle/high reference rows: `34`
- excluded QA/reference rows: `19`
- exclusion reasons: `level_not_v1` = `11`, `non_ccs_not_v1` = `7`,
  `magnet_not_v1` = `1`

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
- included CFS V1 zones: `35`
- excluded/preserved QA zones: `9`
- zone names needing school-reference QA: `5`

Unmatched reference names are preserved in
`outputs/school_zone_unmatched_names.csv` and do not block attendance-zone
assignment, because the polygon boundary is the authoritative assignment input.
Included CCS zone names needing reference QA are `Hickory Ridge ES`,
`West Cabarrus HS`, and `Roberta Road MS`. Excluded non-CCS unmatched names
include `GW Carver ES` and `North Kannapolis ES`.

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
- elementary assigned parcels: `91,161`
- middle assigned parcels: `86,221`
- high assigned parcels: `91,161`
- missing elementary assignment: `18,856`
- missing middle assignment: `23,796`
- missing high assignment: `18,856`
- assignment review required: `75,143`
- parcels assigned to unmatched/non-exact reference zones: `51,714`

The output row count matches `public.parcels_enriched`.
Higher missing-assignment counts are expected under the CCS-only V1 policy
because KCS attendance areas are preserved for QA but excluded from the CFS V1
parcel assignment output.

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

Current confidence distribution:

- `high`: `34,200`
- `medium`: `1,988`
- `review`: `54,973`
- `low`: `18,856`

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
- capacity data available rows: `0`

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
- `outputs/phase8a_school_constraint_verification_or_ingestion_summary.json`

Phase 8B writes:

- `outputs/phase8b_school_constraint_qa_review.json`
- `outputs/phase8b_school_constraint_qa_issues.csv`
- `outputs/phase8b_school_constraint_qa_and_api_readiness_summary.json`

## Phase 8B QA and API Readiness

Phase 8B reviewed the Phase 8A outputs and classified the unresolved school
zone names. `Hickory Ridge ES`, `West Cabarrus HS`, and `Roberta Road MS` are
included CCS attendance zones that do not have same-level `school_reference`
records. They are treated as missing reference records and remain
review-required. They were not force-matched.

Excluded unmatched/non-CCS names such as `GW Carver ES` and
`North Kannapolis ES` remain preserved for QA/future use and are outside the
CFS V1 scope.

Read-only school assignment/QA API exposure is considered safe with caveats:

- assignments are based on attendance-zone polygon overlap;
- school point distance is not used;
- CFS V1 remains public CCS elementary/middle/high only;
- capacity/enrollment data is unavailable;
- school capacity and constraint scores remain `NULL` / `not_scored`.

Implemented Phase 8B endpoints:

- `GET /constraints/schools/statistics`
- `GET /constraints/schools/{official_parcel_id}`
- `GET /constraints/schools/filter`
- `GET /constraints/schools/district-summary`
- `GET /constraints/schools/qa-summary`

## Phase 8C Read-Only Frontend Integration

Phase 8C surfaces school assignment intelligence in the frontend while keeping
capacity/enrollment scoring inactive. The selected parcel Due Diligence area
uses `GET /constraints/schools/{official_parcel_id}` to show elementary,
middle, and high attendance-zone assignments from polygon overlap.

Frontend wording is intentionally constrained:

- null school constraint scores display as `Not scored`;
- `not_available` capacity status displays as `Capacity Data Needed`;
- missing assignments display as CCS V1 scope or assignment review caveats;
- capacity/enrollment data is not fabricated;
- private, magnet, KCS, Other, and non-level records remain excluded from CFS
  V1 display.

The countywide School Assignment Summary combines
`GET /constraints/schools/statistics` and `GET /constraints/schools/qa-summary`
to show assignment coverage, confidence distribution, capacity data status, and
known QA review zones.

## Phase 8D Capacity Ingestion Readiness

Phase 8D prepares the project for future school capacity and enrollment files.
It does not ingest real data, fabricate enrollment/capacity values, calculate
capacity scores, modify frontend UI, or change attendance-zone assignment.

Created readiness inputs:

- `data_templates/schools/school_capacity_template.csv`
- `data_templates/schools/school_enrollment_history_template.csv`
- `data_templates/schools/school_grade_enrollment_history_template.csv`
- `data_templates/schools/school_capacity_projection_template.csv`
- `data_templates/schools/school_planned_capacity_changes_template.csv`

Created readiness folders:

- `data/schools/raw/`
- `data/schools/staging/`
- `data/schools/processed/`
- `data/schools/qa/`

Created future capacity tables:

- `public.school_enrollment_history`
- `public.school_grade_enrollment_history`
- `public.school_capacity_history`
- `public.school_capacity_projection`
- `public.school_planned_capacity_changes`
- `public.school_capacity_ingestion_qa`

`public.school_capacity` remains the current snapshot table. It is still empty
until vetted capacity history rows exist.

Capacity status classes are prepared but not used for parcel scoring yet:

- `not_available`
- `under_capacity`
- `near_capacity`
- `over_capacity`
- `severely_over_capacity`

Future files should be dry-run validated with
`cfs-data-pipelines/ingest/ingest_school_capacity_data.py` before any PostGIS
write. `cfs-data-pipelines/transform/create_current_school_capacity_snapshot.py`
builds the current snapshot only after real capacity history rows exist.

## Future API and UI Path

Recommended next steps:

1. Review included unmatched school reference names and decide whether a
   governed school reference alias/source update is appropriate.
2. Dry-run validate future school capacity/enrollment files when received.
3. Build current school capacity snapshot only after vetted rows exist.
4. Add capacity/enrollment scoring only after a vetted capacity source exists.
5. Consider a future school map layer only after display policy and source
   governance are approved.

Forecasting should wait until attendance-zone assignment, capacity source
ownership, and school planning interpretation rules are stable.
