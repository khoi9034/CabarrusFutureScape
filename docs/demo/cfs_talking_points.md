# CFS Talking Points

## 30-Second Summary

CFS is a parcel-based planning intelligence prototype that combines GIS overlays, permit activity, constraints, and internal model research to support county planning review. It helps a reviewer search a parcel, inspect due-diligence context, understand flood and school constraints, and explain the data/model assumptions behind the dashboard.

The system is intentionally careful: development ranking research is internal only, exact prediction probabilities are not exposed, and school utilization values are clearly labeled as presentation-derived until official enrollment and capacity data are added.

## 2-Minute Summary

Cabarrus FutureScape turns parcel review into an interactive planning workflow. A user can search by parcel ID, PIN, owner, address, subdivision, or neighborhood, then select a parcel and see live parcel intelligence. The 3D map focuses on that parcel, draws a selected-parcel cage, and keeps real overlays separate from placeholders.

The prototype connects several evidence streams:

- parcels and zoning context;
- permit and development activity;
- new construction permit labels for internal model research;
- FEMA NFHL flood constraints and flood zone polygons;
- public CCS school attendance-zone assignment;
- presentation-derived school utilization seed values with clear verification caveats;
- historical zoning snapshots and zoning map-change foundation for future modeling.

The prediction work is not public-facing. Methodology mode explains that model research is internal, not production-ready, and aggregate-only. CFS does not show parcel-level probabilities or parcel-level ranking classes.

## Technical Architecture Summary

- Frontend: Next.js, React, TypeScript, Tailwind-style utility classes, ArcGIS SceneView.
- Backend: FastAPI with parcel, development, flood, school, and model-readiness endpoints.
- Database: PostGIS tables for parcels, permits, flood overlays, school assignments, zoning history, and model research artifacts.
- Data pipelines: Python ingestion, transformation, QA, and modeling scripts.
- GIS: ArcGIS SceneView for 3D map exploration, temporary graphics layers for selectable overlays, and transparent reference layers for FEMA and school zones.
- Runtime: local full stack via `npm run dev:cfs`, with Next.js at `http://localhost:3000` and FastAPI at `http://127.0.0.1:8000`.

## GIS/Data Engineering Summary

CFS uses parcels as the shared planning unit. It overlays regulatory, administrative, and activity datasets onto parcels so each selected parcel can show a compact due-diligence profile.

Key GIS/data engineering pieces:

- FEMA NFHL Layer 28 was ingested and converted into clean flood zone polygons.
- Parcel flood overlay calculates review flags, constrained acres, percent constrained, floodway presence, SFHA presence, and buildability impact.
- School assignment uses attendance-zone polygon overlap, not nearest school distance.
- Historical zoning layers support time-aware zoning snapshots and map-change detection, while current zoning remains current-context only.
- Development hotspots and permit events use parcel-permit relationships and permit segmentation.

## Model/AI Summary

CFS includes internal development ranking research based on new construction labels, time-safe parcel/development features, and zoning-enhanced features. The research compares baseline and zoning-enhanced models and shows aggregate performance in Methodology.

Important boundaries:

- The model is not production-ready.
- Calibration is weak.
- Exact prediction probabilities are not displayed.
- Parcel-level ranking classes are not displayed.
- There is no public parcel prediction endpoint.
- Methodology shows aggregate status and safety flags only.

## Responsible AI Caveats

- Internal ranking research is for QA and methodology review only.
- CFS does not claim that a parcel will develop.
- CFS does not provide exact parcel probabilities.
- CFS does not automate planning decisions.
- Future public model use would require stronger calibration, governance review, official rezoning dates, future land use, accessibility/utilities, official school capacity, and economic controls.

## What Is Real vs Prototype

Real or API-backed in the current prototype:

- parcel search and selected parcel detail;
- selected parcel geometry/focus;
- permit/development activity and permit events;
- development hotspot markers;
- FEMA flood constraints and FEMA flood zone polygons;
- school assignment from attendance zones;
- presentation-derived school utilization seed display;
- model readiness and aggregate ranking research status.

Prototype, placeholder, or limited:

- school utilization seed values are presentation-derived and need verification;
- official school capacity/enrollment scoring is not active;
- infrastructure readiness remains placeholder/readiness context;
- Executive Print is a report-preview workflow, not final PDF automation;
- prediction model research remains internal and aggregate-only.

## Future Roadmap

- Add verified school enrollment, functional capacity, grade-level history, projections, and planned capacity changes.
- Add official rezoning case dates and old/new zoning records.
- Add future land use.
- Add road/accessibility and water/sewer utility readiness.
- Add transportation, fire/EMS, heat/runoff, and environmental sensitivity constraints.
- Improve model calibration and year-by-year validation.
- Decide through governance review whether ranked classes can ever be shown as experimental planning signals.
- Package production deployment, authentication, audit logging, and report export.
