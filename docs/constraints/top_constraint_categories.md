# Top Constraint Categories

This document defines the first seven CFS constraint categories for future
parcel overlays, map layers, dashboard summaries, and backend APIs. These are
planning definitions only; no live layers or schemas are created here.

| Rank | Constraint | Why It Matters | Likely Data Source | Geometry | Parcel Overlay Method | Severity Levels | Suggested Parcel Flags | Dashboard / Map Use | Future API / UI Use |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Flood / Floodway | Flood exposure can reduce buildability, add review steps, increase mitigation cost, and affect public safety. | Existing mock flood risk layer; future authoritative floodplain/floodway service or approved hazard GIS layer. | Polygon | Intersect parcel geometry with floodplain and floodway polygons; calculate affected acres and percent overlap. | none, low, moderate, high, severe | `has_floodplain_overlap`, `has_floodway_overlap`, `flood_review_required`, `buildability_impacted` | Constraint overlay, selected parcel badges, executive risk packets. | `/constraints/flood-summary`, parcel detail constraint flags, map layer toggle. |
| 2 | School Capacity / District | Growth affects school assignment areas, capacity planning, and public service review. | School district/assignment boundaries; school facility points; future capacity/enrollment tables if approved. | Polygon and point/table | Assign parcels to elementary, middle, and high school districts; later join utilization/capacity by school. | unknown, low, moderate, high, severe | `school_assignment_available`, `school_capacity_review_required`, `school_growth_pressure` | Selected parcel school context, district map layer, review badges. | `/constraints/school-summary`, parcel school context, filter by school district. |
| 3 | Transportation Access | Road access, corridor proximity, congestion, and capital project timing shape development feasibility. | Roads/corridors, access classifications, traffic counts, capital project layers. | Polyline and polygon | Distance to corridors/intersections; intersect with access management districts; summarize nearest facility and readiness. | low, moderate, high, severe | `transportation_access_review`, `limited_access_context`, `corridor_pressure` | Corridor readiness overlays and infrastructure role views. | `/constraints/transportation-summary`, map extent corridor review. |
| 4 | Water / Sewer | Utility availability and capacity can be the gating factor for development timing. | Utility service areas, mains, pump stations, capacity flags, CIP project layers. | Polyline, point, polygon | Distance/proximity to service; service-area containment; capacity status by system. | available, constrained, unavailable, restricted | `water_service_review`, `sewer_service_review`, `capacity_constraint` | Infrastructure readiness panel and confidential reviewer layers. | Server-side redacted API due to sensitive infrastructure attributes. |
| 5 | Fire / EMS Coverage | Emergency response coverage affects service adequacy, annexation review, and growth readiness. | Station locations, response districts, travel-time polygons, service areas. | Point and polygon | Assign parcels to coverage zones; calculate distance/travel-time class if available. | covered, monitor, constrained, severe | `fire_ems_review_required`, `coverage_gap`, `response_time_constraint` | Public safety service context and executive readiness metrics. | `/constraints/public-safety-summary`, response district filters. |
| 6 | Heat / Impervious / Runoff | Impervious surface and heat exposure affect stormwater, resilience, and neighborhood quality. | Impervious surface layers, land cover, heat index, stormwater/runoff models. | Raster-derived polygon or polygon | Intersect parcel with impervious/heat zones; summarize percent area and severity. | low, moderate, high, severe | `high_impervious_context`, `heat_review_required`, `runoff_review_required` | Environmental/resilience overlays and mitigation review. | `/constraints/resilience-summary`, parcel heat/runoff details. |
| 7 | Environmental Sensitivity | Sensitive habitats, stream buffers, wetlands, slopes, or conservation areas can limit or shape development. | Wetlands, streams, buffers, conservation lands, soils, slopes, habitat layers. | Polygon and polyline | Intersect with buffers/sensitivity polygons; calculate percent and constrained acres. | low, moderate, high, severe | `environmental_review_required`, `buffer_overlap`, `sensitive_area_overlap` | Environmental review map layers and parcel constraint badges. | `/constraints/environmental-summary`, exportable review packets. |

## Shared Severity Language

- `low`: context only; unlikely to block review.
- `moderate`: review may be needed depending on proposal or site design.
- `high`: likely to require mitigation, coordination, or timing review.
- `severe`: potentially major buildability, service, safety, or approval impact.
- `unknown`: source quality or coverage is insufficient for a confident rating.

## Common Dashboard Flags

- `review_required`
- `dashboard_safe`
- `source_unknown`
- `geometry_quality_review`
- `missing_owner_metadata`
- `buildability_impacted`
- `service_capacity_review`
- `public_safety_review`
- `environmental_review`
