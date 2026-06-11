# School Constraint Strategy

School constraints are the recommended second Phase 7 domain after flood
constraints. The first school implementation should focus on district and
assignment context. Capacity and enrollment pressure should wait until school
data ownership and interpretation rules are approved.

This document does not ingest school layers, modify PostGIS, build APIs, or
add frontend panels.

## Purpose

School Constraint Intelligence should show which elementary, middle, and high
school assignment areas apply to a parcel and prepare a safe path toward future
capacity/readiness review.

Primary use cases:

- selected parcel school assignment context
- school district map overlays
- growth review around permit activity
- executive service capacity summaries
- future parcel filters by school district

## Candidate Sources

Initial spatial sources:

- elementary school attendance/district polygons
- middle school attendance/district polygons
- high school attendance/district polygons
- school facility point layer

Future non-spatial sources, if approved:

- enrollment
- program capacity
- utilization
- projected seats
- facility status
- capital project timelines

Capacity sources may be sensitive or interpretation-heavy. They should be
approved by the appropriate school/system steward before dashboard exposure.

## Expected Geometry

- school attendance boundaries: polygon
- school facility locations: point
- capacity/enrollment: table joined by school ID, not geometry

## Parcel Overlay Method

Recommended district assignment method:

1. Clean elementary, middle, and high school boundary polygons.
2. Normalize school name, school ID, level, and source metadata.
3. Intersect or point-on-surface assign each parcel to one boundary per school
   level.
4. Flag parcels with no district match or multiple district overlaps.
5. Preserve assignment method and confidence.

Recommended fields:

- `elementary_school_name`
- `elementary_school_id`
- `middle_school_name`
- `middle_school_id`
- `high_school_name`
- `high_school_id`
- `school_assignment_confidence`
- `school_boundary_overlap_count`
- `school_review_required`

## Future Capacity Readiness

Capacity should be introduced only after district assignment is stable.

Potential capacity fields:

- `enrollment`
- `capacity`
- `utilization_pct`
- `available_seats`
- `capacity_status`
- `source_school_year`
- `capacity_source_date`

Initial capacity severity examples:

| Capacity Status | Severity |
| --- | --- |
| below 85 percent utilization | `low` |
| 85 to 95 percent utilization | `moderate` |
| 95 to 105 percent utilization | `high` |
| above 105 percent utilization | `severe` |
| capacity data unavailable | `unknown` |

These are planning placeholders only and must be reviewed by school planning
stakeholders.

## Growth Pressure From Permit Activity

School constraints should eventually combine district assignment with permit
activity context, not predictive enrollment modeling.

Initial deterministic signals:

- permit count within school boundary
- residential permit count if permit type/domain supports it
- recent 1-year and 3-year permit activity near the parcel
- high-activity parcels inside a school boundary
- development hotspots by school district

Growth pressure should be represented as a context flag until school capacity
data is approved.

## Suggested Parcel Flags

- `school_assignment_available`
- `school_assignment_review_required`
- `multiple_school_boundary_overlap`
- `missing_school_boundary_match`
- `school_capacity_review_required`
- `school_growth_pressure_context`
- `school_capacity_data_unavailable`

## Dashboard / Map Support

Recommended rollout:

1. Selected parcel school assignment summary.
2. School district layer toggles for elementary, middle, and high.
3. School facility points.
4. District-level permit activity summaries.
5. Capacity context only when data ownership and dashboard-safe rules are
   approved.

## Future API Support

Potential endpoints after ingestion:

- `GET /constraints/school-summary`
- `GET /constraints/parcels/{official_parcel_id}/schools`
- `GET /constraints/schools/{school_id}/development-context`
- `GET /constraints/filter?constraint_category=school`
