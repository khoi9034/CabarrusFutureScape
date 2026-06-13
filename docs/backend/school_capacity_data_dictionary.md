# School Capacity Data Dictionary

Phase 8D school capacity readiness tables prepare for future vetted data. They
are currently empty and should remain empty until real source files are
provided.

## Join Keys

School capacity/enrollment rows use:

- `school_name_normalized`
- `school_level`
- `school_system`

`matched_school_reference_id` is added after matching to
`public.school_reference`. It is not required in raw source files.

## `public.school_enrollment_history`

| Field | Description |
| --- | --- |
| `enrollment_history_id` | Deterministic history row ID. |
| `school_name` | Source school name. |
| `school_name_normalized` | Normalized school join key. |
| `school_level` | `elementary`, `middle`, `high`, or `review_required`. |
| `school_system` | School system, currently CCS for CFS V1. |
| `school_year` | Enrollment school year. |
| `total_enrollment` | Total enrollment for the school/year. |
| `matched_school_reference_id` | Future match to `public.school_reference`. |
| `match_confidence` | Match status such as `normalized_exact` or review. |
| `source_name`, `source_url`, `notes` | Source metadata. |
| `ingested_at` | Ingestion timestamp. |

## `public.school_grade_enrollment_history`

Stores optional grade-level enrollment and capacity.

| Field | Description |
| --- | --- |
| `grade_enrollment_id` | Deterministic grade row ID. |
| `grade_level` | Source grade label. |
| `grade_enrollment` | Enrollment for the grade/year. |
| `grade_capacity` | Optional capacity for that grade/year. |
| `grade_utilization_pct` | Optional source utilization percent. |

Other identity, match, source, and timestamp fields mirror
`school_enrollment_history`.

## `public.school_capacity_history`

Historical school capacity and enrollment snapshots.

| Field | Description |
| --- | --- |
| `capacity_history_id` | Deterministic capacity history row ID. |
| `school_year` | Capacity/enrollment school year. |
| `functional_capacity` | Vetted functional/program capacity. |
| `current_enrollment` | Enrollment for the same school/year. |
| `available_seats` | Optional source value or later calculation. |
| `utilization_pct` | Optional source value or later calculation. |
| `capacity_status` | Optional source status. |

## `public.school_capacity_projection`

Future planning input for projected enrollment and capacity.

| Field | Description |
| --- | --- |
| `projection_id` | Deterministic projection row ID. |
| `projection_year` | Projection year. |
| `projected_enrollment` | Projected student count. |
| `projected_capacity` | Projected capacity. |
| `projected_utilization_pct` | Optional utilization projection. |
| `projection_method` | Source-described projection method. |

## `public.school_planned_capacity_changes`

Future planned expansion/reduction records.

| Field | Description |
| --- | --- |
| `planned_change_id` | Deterministic planned-change row ID. |
| `project_name` | Project or capital plan name. |
| `project_type` | Addition, renovation, replacement, closure, etc. |
| `planned_capacity_added` | Seats added. |
| `planned_capacity_removed` | Seats removed. |
| `net_capacity_change` | Net seat change. |
| `expected_open_year` | Planned opening/completion year. |
| `status` | Planning/construction status. |

## `public.school_capacity_ingestion_qa`

Validation issues produced during future source-file ingestion.

| Field | Description |
| --- | --- |
| `qa_id` | Deterministic QA row ID. |
| `dataset_name` | Source dataset type. |
| `source_file` | File being validated/ingested. |
| `issue_type` | Validation issue category. |
| `severity` | `error`, `review`, `info`, or blocking category. |
| `issue_description` | Human-readable issue. |
| `recommended_fix` | Suggested source-owner or analyst fix. |
| `row_number` | Source row number if applicable. |

## `public.school_capacity`

Current snapshot table. It remains empty until real history rows exist.

Important current behavior:

- `capacity_data_available` is false when no vetted data exists.
- `capacity_status` is `not_available` when capacity or enrollment is missing.
- `school_constraint_score` is not calculated in Phase 8D.

## `public.school_presentation_utilization_seed`

Temporary presentation-derived utilization seed table from Phase 8E. This table
is not official capacity data and does not populate `public.school_capacity`.

| Field | Description |
| --- | --- |
| `seed_id` | Deterministic seed row ID. |
| `school_abbreviation` | Presentation map abbreviation. |
| `school_name` | School name read from the presentation map. |
| `school_name_normalized` | Normalized match key. |
| `school_level` | `elementary`, `middle`, or `high`. |
| `school_year` | Seed school year, currently `2024-2025`. |
| `utilization_pct` | Presentation-derived utilization percentage. |
| `utilization_class` | Provisional direct percentage class: `under_capacity` below 80%, `approaching_capacity` from 80% to below 100%, `over_capacity` from 100% through 110%, and `severely_over_capacity` above 110%. |
| `matched_school_reference_id` | Optional match to included CCS `public.school_reference`. |
| `match_confidence` | `normalized_exact` or `unmatched_reference_review`. |
| `source_name` | Presentation source name. |
| `source_confidence` | Always `presentation_derived` for this seed. |
| `needs_verification` | Always true until official files verify/replace the value. |
| `notes` | Source caveat and verification note. |
| `ingested_at` | Ingestion timestamp. |

## `public.school_utilization_seed_current`

Read-only helper view selecting the latest presentation-derived utilization seed
row per school and level.

This view is suitable for provisional API display/testing only. It does not
contain enrollment, functional capacity, available seats, grade-level data, or
official school capacity scores.

Phase 8E read-only endpoints:

- `GET /constraints/schools/utilization-seed`
- `GET /constraints/schools/utilization-seed/{official_parcel_id}`

## `public.school_lea_pupil_context`

District-level LEA pupil context from the uploaded CCS pupil information file.
This table is not school-level capacity data and does not populate
`public.school_capacity`.

| Field | Description |
| --- | --- |
| `lea_pupil_context_id` | Deterministic row ID. |
| `school_year` | Source school year, currently `2025`. |
| `lea` | LEA code, currently `130`. |
| `lea_name` | LEA name, currently Cabarrus County Schools. |
| `month` | Source month/status label. |
| `measure_type` | District-level measure: `Enrollment`, `ADM`, `ADA`, or `MLD`. |
| `grade_level` | `kindergarten`, `grade_1` through `grade_13`, or `total`. |
| `pupil_count` | Districtwide count for the measure and grade. |
| `source_file` | Project source CSV path. |
| `source_confidence` | `uploaded_lea_pupil_file`. |
| `notes` | Caveat that this is district-level context only. |
| `ingested_at` | Ingestion timestamp. |

Phase 9G read-only endpoints:

- `GET /constraints/schools/lea-pupil-context`
- `GET /constraints/schools/lea-pupil-context/summary`

The summary endpoint exposes district-level totals by measure and Enrollment by
grade. It explicitly reports `school_capacity_table_updated = false` and
`school_capacity_scores_enabled = false`.

## Capacity Status Classes

- `not_available`: enrollment or capacity missing.
- `under_capacity`: utilization below 85%.
- `near_capacity`: utilization 85% to below 100%.
- `over_capacity`: utilization 100% to below 115%.
- `severely_over_capacity`: utilization 115% or higher.
