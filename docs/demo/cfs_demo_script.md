# CFS Demo Script

## 1. Open Overview

Start the local stack:

```powershell
npm run dev:cfs
```

Open:

```text
http://localhost:3000
```

Talking points:

- CFS is a parcel-centric planning intelligence prototype.
- The map is the primary exploration surface.
- The top search bar is the primary parcel entry point.
- The right panel provides concise selected-parcel context.
- The bottom pulse bar summarizes countywide growth and constraint posture.

## 2. Search a Parcel

Search:

```text
CFS-PARCEL-0149726579
```

Select the result.

Expected result:

- selected parcel card updates;
- active selection overlay updates;
- map focuses on the parcel;
- parcel cage/boundary highlight appears;
- owner, PIN, zoning, quality, and source are visible.

Talking points:

- Search is API-backed in local mode.
- Selection hydrates parcel detail with geometry.
- The map focus uses the selected parcel response, not a static fallback.

## 3. Open Due Diligence

Switch to `Due Diligence`.

Show:

- Selected Parcel summary;
- Development Activity;
- Permit Events;
- Flood Constraint status;
- School Assignment;
- presentation-derived school utilization caveat.

Talking points:

- Flood context comes from FEMA NFHL regulatory data and parcel overlay.
- Permit events come from the authoritative permit-to-parcel relationship.
- School assignment uses attendance-zone polygon overlap, not school point
  distance.
- School capacity scoring is not active until verified capacity and enrollment
  files are ingested.

## 4. Toggle Map Layers

Return to `Overview`, open `Map Layers`, and demonstrate:

- Development Hotspots;
- Flood Constraints;
- FEMA Flood Zones;
- School Utilization Seed;
- County Boundary;
- Parcel Intelligence if needed.

Layer talking points:

- Development Hotspots require a permit segment selection to avoid generic
  all-permit dots.
- Flood Constraints are parcel-based high-review markers.
- FEMA Flood Zones are the source polygons that generated the flood constraint
  overlay.
- School Utilization Seed is presentation-derived and needs verification.
- Placeholder readiness layers should be described as future concepts.

## 5. Open Methodology

Switch to `Methodology`.

Show:

- active data inputs;
- assumptions and limitations;
- school capacity caveats;
- Development Prediction Research Status.

Talking points:

- Internal model research is aggregate-only in the UI.
- Exact prediction probabilities are not shown.
- Parcel-level ranking classes are not shown.
- Calibration is weak, so the model remains internal QA.
- Future public use requires official rezoning dates, future land use,
  accessibility/utilities, official school capacity, economic controls, and
  governance review.

## 6. Open Executive Print

Switch to `Executive Print`.

Show:

- report-style selected parcel summary;
- development summary;
- constraint summary;
- latest permit events;
- executive notes.

Talking points:

- This mode is designed for portfolio screenshots and stakeholder reporting.
- Map snapshot export is still a future phase.
- The report summarizes evidence; it does not expose prediction scores.

## Recommended Close

Close with:

- what CFS already does: parcel due diligence, real permit/flood/school
  overlays, map exploration, transparency;
- what remains future: official school capacity, transportation/utilities,
  future land use, calibrated public model review, production hardening.
