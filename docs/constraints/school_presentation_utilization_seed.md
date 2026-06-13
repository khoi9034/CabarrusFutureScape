# School Presentation Utilization Seed

Phase 8E creates a temporary school utilization seed from Cabarrus County
Schools capital planning presentation maps for SY 2024-2025.

This is not official enrollment or capacity ingestion. Values were manually
read from presentation map labels and must be verified against official school
enrollment and capacity files when received.

## Source

- source name: Cabarrus County Schools Capital Planning Presentation
- source confidence: `presentation_derived`
- school year: `2024-2025`
- needs verification: `true`

## Seed File

Raw seed file:

- `data/schools/raw/presentation_utilization_seed_sy2024_2025.csv`

The seed includes:

- school abbreviation
- school name
- normalized school name
- school level
- school year
- utilization percent
- utilization class
- source metadata
- verification flag

The seed does not include:

- enrollment counts
- functional capacity
- available seats
- grade-level enrollment
- projections
- planned expansion seats

## Utilization Classes

Presentation-derived utilization classes are only provisional display/testing
classes:

- `under_capacity`: utilization below 80%
- `approaching_capacity`: utilization 80% to below 100%
- `over_capacity`: utilization 100% to 110%
- `severely_over_capacity`: utilization above 110%

These differ from the future official capacity snapshot classes prepared in
Phase 8D. Official classes should be reviewed again when vetted capacity and
enrollment rows arrive. Legacy `near_capacity` values, if encountered in older
exports, should be displayed as "Approaching capacity" and reloaded with the
current importer when practical.

## PostGIS Objects

SQL:

- `cfs-data-pipelines/sql/create_school_presentation_utilization_seed.sql`

Created objects:

- `public.school_presentation_utilization_seed`
- `public.school_utilization_seed_current`

The current view exposes the latest presentation-derived row per school and
school level. It is read-only helper context and does not populate
`public.school_capacity`.

## Importer

Importer:

- `cfs-data-pipelines/ingest/ingest_school_presentation_utilization_seed.py`

Commands:

```powershell
python cfs-data-pipelines/ingest/ingest_school_presentation_utilization_seed.py --dry-run
python cfs-data-pipelines/ingest/ingest_school_presentation_utilization_seed.py --truncate-and-load
```

The importer:

- normalizes school names;
- recalculates utilization classes from the presentation percent;
- matches included CCS `public.school_reference` rows by normalized name and
  school level;
- writes unmatched/review rows to `public.school_capacity_ingestion_qa`;
- does not create enrollment, capacity, available-seat, or score values;
- does not write to `public.school_capacity`.

## Read-Only API

Phase 8E adds read-only endpoints:

- `GET /constraints/schools/utilization-seed`
- `GET /constraints/schools/utilization-seed/{official_parcel_id}`

The parcel endpoint joins assigned elementary, middle, and high attendance-zone
schools to the presentation seed where a normalized match exists. It keeps:

- `source_confidence = presentation_derived`
- `needs_verification = true`
- `school_constraint_score = null`
- `school_constraint_class = not_scored`
- `final_capacity_scoring_enabled = false`

## Replacement Path

When official enrollment and capacity files arrive:

1. Preserve this presentation seed for provenance and comparison.
2. Dry-run validate official files with the Phase 8D importer.
3. Load vetted official rows into capacity/enrollment history tables.
4. Build the official current capacity snapshot.
5. Design official parcel school capacity scoring only after source-owner
   review.

This seed should never overwrite official capacity records.

## Related District-Level LEA Pupil Context

Phase 9G adds a separate districtwide LEA pupil context table from the uploaded
`lea_pupil_info.csv` file:

- project copy: `data/schools/raw/lea_pupil_info_2025.csv`
- table: `public.school_lea_pupil_context`
- endpoints:
  - `GET /constraints/schools/lea-pupil-context`
  - `GET /constraints/schools/lea-pupil-context/summary`

This file provides district-level CCS grade counts for `Enrollment`, `ADM`,
`ADA`, and `MLD`. It includes a 2025 districtwide Enrollment total of `36,287`.

It is not a school-level enrollment file, does not include functional capacity,
does not include available seats, and does not verify the presentation-derived
utilization percentages. It should be used as districtwide context only while
CFS waits for official school-level enrollment and capacity files.
