# School Capacity Ingestion Plan

Phase 8D prepares CFS to ingest vetted school capacity, enrollment,
grade-level enrollment, projections, and planned expansion data when those
files are received. It does not ingest real data, fabricate values, calculate
scores, modify the frontend, or modify SceneView.

## Data Concepts

Enrollment is the number of students assigned to or attending a school for a
given school year.

Capacity is the vetted functional or program capacity for that school. CFS must
not invent capacity from building size, housing units, permits, or school point
locations.

Utilization is enrollment divided by capacity. It can be supplied by the source
or calculated later when both enrollment and capacity are present.

Grade-level data is optional but preferred because school pressure may be
different by grade band, especially during boundary changes or phased
expansions.

Projections and planned expansions are future planning inputs. They do not
drive parcel school constraint scores until the source and method are reviewed.

## Input Templates

Templates live in `data_templates/schools/`:

- `school_capacity_template.csv`
- `school_enrollment_history_template.csv`
- `school_grade_enrollment_history_template.csv`
- `school_capacity_projection_template.csv`
- `school_planned_capacity_changes_template.csv`

Received files should be placed in `data/schools/raw/` and left unchanged.
Cleaned/intermediate files can move through `data/schools/staging/`, while
standardized reviewed files can be placed in `data/schools/processed/`.
Validation reports belong in `data/schools/qa/`.

## PostGIS Readiness Tables

The readiness SQL is:

- `cfs-data-pipelines/sql/create_school_capacity_readiness_tables.sql`

It creates:

- `public.school_enrollment_history`
- `public.school_grade_enrollment_history`
- `public.school_capacity_history`
- `public.school_capacity_projection`
- `public.school_planned_capacity_changes`
- `public.school_capacity_ingestion_qa`

It also preserves `public.school_capacity` as the current snapshot table.

## Validation Rules

The validator checks:

- required columns;
- valid school/projection years;
- non-negative numeric enrollment/capacity values;
- utilization consistency when enrollment and capacity are present;
- school level values: `elementary`, `middle`, `high`, or `review_required`;
- school system preservation, with CCS as current CFS V1 scope;
- generated normalized names when missing;
- reference matching by normalized name, level, and system;
- duplicates by school/year or school/year/grade;
- over-capacity rows as review flags, not errors;
- missing capacity/enrollment as review flags;
- no fabricated values.

## Dry-Run Commands

```powershell
python cfs-data-pipelines/ingest/ingest_school_capacity_data.py --file data/schools/raw/example.csv --dataset capacity --dry-run
python cfs-data-pipelines/ingest/ingest_school_capacity_data.py --file data/schools/raw/example.csv --dataset enrollment_history --dry-run
python cfs-data-pipelines/ingest/ingest_school_capacity_data.py --file data/schools/raw/example.csv --dataset grade_enrollment --dry-run
python cfs-data-pipelines/ingest/ingest_school_capacity_data.py --file data/schools/raw/example.csv --dataset projection --dry-run
python cfs-data-pipelines/ingest/ingest_school_capacity_data.py --file data/schools/raw/example.csv --dataset planned_capacity --dry-run
```

Dry-run mode validates files and writes a last-run summary, but does not write
source rows to PostGIS.

## Current Snapshot

`cfs-data-pipelines/transform/create_current_school_capacity_snapshot.py`
builds `public.school_capacity` from the latest year in
`public.school_capacity_history`.

If no history rows exist, the script exits successfully and reports that no
current capacity snapshot is available. It does not fail and does not create
fake values.

When real data exists later, status classes are:

- `not_available`: enrollment or capacity missing;
- `under_capacity`: utilization below 85%;
- `near_capacity`: utilization 85% to below 100%;
- `over_capacity`: utilization 100% to below 115%;
- `severely_over_capacity`: utilization 115% or higher.

Parcel-level `school_constraint_score` remains out of scope for Phase 8D.

## Presentation-Derived Utilization Seed

Phase 8E adds a temporary presentation-derived utilization seed while CFS waits
for official enrollment and capacity files.

The seed file is:

- `data/schools/raw/presentation_utilization_seed_sy2024_2025.csv`

The seed stores utilization percentages manually read from CCS capital planning
presentation maps. It does not include enrollment counts, functional capacity,
available seats, grade-level data, projections, or planned expansion seats.

Presentation-derived utilization classes are calculated directly from the
available percentage:

- `under_capacity`: utilization below 80%;
- `approaching_capacity`: utilization 80% to below 100%;
- `over_capacity`: utilization 100% to 110%;
- `severely_over_capacity`: utilization above 110%.

These labels are visualization/testing classes only. They do not activate
official school capacity scoring.

The seed SQL and importer are:

- `cfs-data-pipelines/sql/create_school_presentation_utilization_seed.sql`
- `cfs-data-pipelines/ingest/ingest_school_presentation_utilization_seed.py`

The seed creates a separate table and view:

- `public.school_presentation_utilization_seed`
- `public.school_utilization_seed_current`

It must not populate `public.school_capacity`, and it must be replaced or
validated when official capacity/enrollment files arrive.

## District-Level LEA Pupil Context

Phase 9G adds a separate districtwide LEA pupil context ingest for the uploaded
CCS `lea_pupil_info.csv` file.

Project copy:

- `data/schools/raw/lea_pupil_info_2025.csv`

Pipeline files:

- `cfs-data-pipelines/sql/create_school_lea_pupil_context.sql`
- `cfs-data-pipelines/ingest/ingest_lea_pupil_context.py`

PostGIS table:

- `public.school_lea_pupil_context`

The LEA file includes district-level rows for `Enrollment`, `ADM`, `ADA`, and
`MLD`, with columns for kindergarten, grades 1 through 13, and total. The
importer normalizes the wide file into one row per measure and grade. The 2025
districtwide Enrollment total is `36,287`.

This context is useful for understanding districtwide pupil scale by grade and
measure. It is not school-level enrollment, not functional capacity, not
available seats, and not utilization. It must not populate
`public.school_capacity` and must not activate parcel school capacity scoring.

Commands:

```powershell
python cfs-data-pipelines/ingest/ingest_lea_pupil_context.py --dry-run
python cfs-data-pipelines/ingest/ingest_lea_pupil_context.py --truncate-and-load
```

## Future Implementation Path

1. Receive vetted capacity/enrollment files.
2. Place original files in `data/schools/raw/`.
3. Run dry-run validation.
4. Review `public.school_capacity_ingestion_qa` and QA reports.
5. Ingest approved rows into history tables.
6. Build current snapshot.
7. Only after source-owner review, design parcel-level capacity scoring.
