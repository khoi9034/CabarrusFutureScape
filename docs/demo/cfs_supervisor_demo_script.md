# CFS Supervisor Demo Script

Use parcel `CFS-PARCEL-0149726579`.

## 1. Start With Overview

Action:

- Open `http://localhost:3000`.
- Start in `Overview`.

Say:

> Cabarrus FutureScape is a parcel-based planning intelligence prototype. The goal is to combine parcels, permits, constraints, and methodology transparency in one review workspace.

Point out:

- the top search bar;
- the 3D map;
- the left `Map Layers` rail;
- the concise Overview workspace.

## 2. Search Parcel

Action:

- Search `CFS-PARCEL-0149726579`.
- Select the result.

Say:

> Parcel search is the primary entry point. When a parcel is selected, the app hydrates parcel detail, map focus, selected parcel geometry, and related intelligence through the existing selected-parcel flow.

Confirm:

- selected parcel card updates;
- active selection overlay updates;
- map focuses on parcel;
- parcel cage/highlight is visible.

## 3. Open Due Diligence

Action:

- Switch to `Due Diligence`.

Say:

> Due Diligence is the detailed evidence view. It keeps parcel facts, development activity, permit events, flood context, and school assignment together without treating the dashboard as an automated decision system.

Point out:

- parcel characteristics;
- zoning context;
- development activity;
- permit timeline;
- flood summary;
- school assignment and utilization caveats.

## 4. Toggle Development Hotspots

Action:

- Return to `Overview`.
- Open `Map Layers`.
- Toggle `Development Hotspots`.
- Select a permit segment such as `Residential Growth`.

Say:

> Development Hotspots behave like a permit concentration layer. The user selects a permit segment first, then markers are sized by that segment's count or intensity. This avoids confusing all-permit dots.

Caveat:

> This is descriptive permit intelligence, not a prediction layer.

## 5. Toggle Flood Constraints

Action:

- Toggle `Flood Constraints`.
- Click a flood marker if practical.

Say:

> Flood Constraints are parcel-based high-review markers generated from FEMA NFHL flood zone overlays. They help identify parcels where engineering or floodplain review may be recommended.

Caveat:

> This is not a final engineering determination.

## 6. Toggle FEMA Flood Zones

Action:

- Toggle `FEMA Flood Zones`.

Say:

> FEMA Flood Zones are the actual regulatory source polygons. Keeping this separate from parcel review markers helps explain where the parcel constraints came from.

Point out:

- transparent polygons;
- floodway/SFHA/moderate legend;
- basemap remains readable.

## 7. Toggle School Utilization

Action:

- Toggle `School Utilization Seed`.
- Hover or click a zone if practical.

Say:

> School assignment uses attendance-zone polygon overlap. Utilization values are presentation-derived from SY 2024-2025 planning maps and need verification. Official school capacity scoring is not active.

Caveat:

> These values are not official enrollment, capacity, or available seats.

## 8. Explain Methodology

Action:

- Open `Methodology`.

Say:

> Methodology is where CFS documents data sources, assumptions, limitations, and what the system does not claim yet. This is important because a planning intelligence tool must be transparent before it becomes predictive.

Point out:

- active data inputs;
- assumptions;
- limitations;
- future roadmap.

## 9. Explain Model Research Status

Action:

- Scroll to `Development Prediction Research Status`.

Say:

> The model work is internal ranking research only. Calibration is weak, so the prototype does not show exact probabilities. It also does not expose parcel-level ranking classes or public prediction endpoints.

Point out:

- `Internal research only`;
- `Prediction probabilities: Not available`;
- `Public exposure: Not allowed`;
- aggregate distribution only;
- safety flags.

## 10. Open Executive Print

Action:

- Switch to `Executive Print`.

Say:

> Executive Print is a stakeholder-facing preview of how selected parcel evidence could be packaged for a report. It summarizes evidence and caveats, but it does not expose prediction scores.

Close with:

> CFS is ready as a portfolio/release-candidate prototype. The next production steps would be verified school capacity, more constraints, official rezoning history, future land use, utility/access features, model calibration, and governance review.
