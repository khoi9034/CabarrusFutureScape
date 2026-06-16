# CFS Final Release Notes

## Release Candidate

Cabarrus FutureScape Demo-Ready Release Candidate

Date: June 15, 2026

## Current Capabilities

CFS currently supports:

- parcel search and selected parcel map focus;
- selected parcel cage/highlight in the 3D SceneView;
- Due Diligence review for parcel, zoning, development, flood, school,
  transportation, utility proxy, and model-governance context;
- Executive Print report preview;
- Methodology transparency for data sources, assumptions, limitations, and
  model safety;
- live map layers for Development Hotspots, Flood Constraints, FEMA Flood
  Zones, and School Utilization Seed;
- final demo, handoff, portfolio, and leadership documentation.

## Demo Flow

1. Start the local full stack with `npm run dev:cfs`.
2. Open the frontend at `http://localhost:3000`.
3. Do not use `http://127.0.0.1:3000` for UI testing because local Next dev HMR
   origin protection can make the page appear loaded while leaving it less
   interactive.
4. Confirm the backend is available at `http://127.0.0.1:8000`.
5. Search for demo parcel `CFS-PARCEL-0149726579`.
6. Show Active Selection and map focus.
7. Open Due Diligence.
8. Open Executive Print.
9. Open Methodology and explain model safety.

## Safety Status

CFS is an internal planning intelligence prototype.

Current model safety status:

- `model_active=false`
- `prediction_probability_available=false`
- `production_ready=false`
- `public_exposure_allowed=false`
- no parcel-level prediction probabilities are exposed;
- no parcel-level ranking classes are exposed;
- no public parcel-level prediction endpoint exists;
- Methodology shows aggregate model-governance status only.

## Known Limitations

- CFS is not production-ready.
- School utilization values are presentation-derived and require official
  verification.
- Official school capacity scoring is not active.
- Utility context is proxy/context only and does not confirm available capacity.
- Model calibration remains under review, so exact probabilities are not shown.
- Some planning, pipeline, and utility features remain current-context only or
  incomplete for production modeling.
- Future land use, official rezoning case records, countywide development
  pipeline data, true utility capacity, and official school capacity data are
  still needed.

## Missing Data Needed

Priority data requests:

- official school enrollment and capacity by school and year;
- true utility capacity, service availability, and planned utility extension
  data;
- official rezoning case records with dates, decisions, old zoning, and new
  zoning;
- countywide future land use and adopted plan GIS layers;
- countywide development pipeline and subdivision approval records;
- dated local transportation project data.

## Validation Status

Phase 19C release-lock validation should include:

- `npm run typecheck`
- `npm run lint`
- `npm run build -- --webpack`
- local smoke test at `http://localhost:3000`

The detailed validation result is recorded in
`outputs/phase19c_final_release_lock_summary.json`.

## How To Start The App

```powershell
npm run dev:cfs
```

Use:

- Frontend: `http://localhost:3000`
- Backend: `http://127.0.0.1:8000`
- FastAPI docs: `http://127.0.0.1:8000/docs`
- Health: `http://127.0.0.1:8000/health`
- Database health: `http://127.0.0.1:8000/health/database`

## What Not To Claim

Do not claim:

- CFS is production-ready.
- CFS predicts exact parcel development probability.
- CFS exposes parcel-level model ranking classes.
- CFS confirms official utility capacity.
- CFS has official school capacity scoring.
- CFS makes entitlement, permitting, or investment decisions.

Approved positioning:

"CFS is a demo-ready internal planning intelligence prototype with
parcel-based due diligence, constraint review, executive reporting, and
aggregate-only model governance."

## Recommended Next Step

Commit the final release-candidate documentation and app state after validation
passes, then use the final package index and executive one-pager for the
higher-up update.
