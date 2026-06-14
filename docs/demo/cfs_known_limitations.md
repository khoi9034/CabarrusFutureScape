# CFS Known Limitations

## Runtime and Environment

- CFS is a local prototype, not a deployed production system.
- The frontend expects `NEXT_PUBLIC_USE_BACKEND_API=true` and
  `NEXT_PUBLIC_CFS_API_BASE_URL=http://127.0.0.1:8000`.
- Local performance depends on browser GPU, ArcGIS runtime assets, PostGIS
  responsiveness, and active map layer limits.
- Dev mode shows the Next.js developer tools button.

## Parcel and Zoning

- Parcel intelligence is strong for selected parcel workflows, but some fields
  retain data-quality and governance warnings.
- Current zoning is useful for current context.
- Historical zoning map-change detections are not official rezoning case
  approvals.
- Official rezoning case dates, old zoning, new zoning, decision status, and
  case geometry are still needed for stronger model features.

## Development and Permit Intelligence

- Permit segmentation is descriptive and rule-based.
- Permit hotspots show concentration by selected permit segment.
- Permit events are tied to parcel relationships, but they should still be
  reviewed for relationship confidence where needed.
- New construction labels support internal modeling and QA, not public
  prediction display.

## Flood Constraints

- FEMA NFHL Layer 28 is the authoritative regulatory source used for the first
  flood constraint overlay.
- FEMA Flood Zones are rendered as source/reference polygons.
- Flood Constraints are parcel-based high-review markers.
- Flood analysis is not a final engineering determination.

## School Constraints

- CFS V1 displays public CCS elementary, middle, and high attendance-zone
  assignments.
- Assignment is based on attendance-zone polygon overlap, not school point
  distance.
- KCS, private, magnet, Other, and non-level records are preserved for future
  QA but excluded from V1 display.
- Official school capacity, enrollment, grade-level history, projections, and
  planned expansion data are not yet ingested.
- School capacity scores remain disabled.

## Presentation-Derived School Utilization

- SY 2024-2025 utilization values were read from planning presentation maps.
- Values are labeled presentation-derived and need verification.
- The seed does not include enrollment counts, functional capacity, available
  seats, grade-level data, or projections.
- The seed must not overwrite the official capacity ingestion pipeline.

## Model Research

- Development ranking research is internal-only.
- Calibration is weak, so exact probabilities are not displayed.
- No public parcel prediction endpoint exists.
- No parcel-level ranking class is displayed in the frontend.
- `model_active=false`, `prediction_probability_available=false`, and
  `production_ready=false` remain required.
- Future work needs official rezoning dates, future land use, accessibility and
  utility features, school capacity, economic controls, and governance review.

## Map and UI

- Development Hotspots, Flood Constraints, FEMA Flood Zones, and School
  Utilization Seed are optional layers.
- Placeholder readiness layers are not authoritative.
- Map snapshot export in Executive Print is still a future phase.
- The dashboard is designed for demo and due-diligence review, not final public
  decision automation.
