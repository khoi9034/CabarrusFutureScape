# Parcel Constraint Overlay Strategy

This document defines the future parcel overlay model for Constraint
Intelligence. It is a planning artifact only and does not create tables or run
spatial joins.

## Design Goal

Every constraint should become explainable parcel-level intelligence:

- what source layer created the flag
- how the parcel was matched
- how much of the parcel is affected, if spatial
- how severe the constraint is
- whether review is required
- whether the value is safe to show on the dashboard

## Overlay Method Types

`intersection_area`

- For polygon-to-polygon overlays such as floodplain or environmental areas.
- Stores constrained acres and percent parcel affected.

`containment_assignment`

- For district context such as school boundaries or service districts.
- Uses parcel point-on-surface or dominant overlap.

`nearest_distance`

- For proximity questions such as road access or fire/EMS station context.
- Stores distance and nearest feature metadata.

`service_area`

- For fire/EMS, water/sewer, transportation, or school service polygons.
- Stores contained/not-contained status and source zone.

`attribute_join`

- For capacity tables joined by source IDs after spatial assignment.
- Stores source year, join quality, and steward metadata.

## Future Table: `public.parcel_constraint_overlay`

Recommended core fields:

- `overlay_id`
- `official_parcel_id`
- `objectid_1`
- `pin14`
- `constraint_category`
- `constraint_layer_id`
- `source_feature_id`
- `source_feature_label`
- `overlay_method`
- `overlap_area_sq_m`
- `overlap_acres`
- `overlap_pct`
- `distance_m`
- `dominant_assignment`
- `severity`
- `review_required`
- `dashboard_safe`
- `buildability_impact`
- `quality_status`
- `source_effective_date`
- `source_refresh_date`
- `transformed_at`

## Future Table: `public.parcel_constraint_summary`

Recommended core fields:

- `official_parcel_id`
- `constraint_count`
- `review_required_count`
- `highest_severity`
- `dominant_constraint_category`
- `total_constrained_acres`
- `flood_severity`
- `school_severity`
- `transportation_severity`
- `water_sewer_severity`
- `fire_ems_severity`
- `heat_runoff_severity`
- `environmental_severity`
- `dashboard_safe`
- `transformed_at`

## QA Rules

Every overlay should report:

- source row count
- parcel row count
- matched parcel count
- unmatched parcel count
- invalid geometry count before/after cleaning
- overlap counts by severity
- null key field counts
- sample review-required records
- source freshness metadata

## Geometry Rules

- Clean invalid source geometry before parcel overlay.
- Use `ST_PointOnSurface` for assignment when parcel centroid may fall outside a
  parcel.
- Use projected geometry for area/distance calculations when practical.
- Store output geometries in SRID `4326` only when needed for map/API payloads.
- Never hide no-match or multiple-match records.
