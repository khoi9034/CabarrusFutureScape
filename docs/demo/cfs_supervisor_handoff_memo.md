# CFS Supervisor Handoff Memo

## Project Summary

Cabarrus FutureScape is a local, internal planning intelligence prototype for
parcel due diligence, growth review, constraint visibility, and model
governance. It is designed to help planning and GIS staff quickly explain what
is known about a parcel, what caveats matter, and what should be reviewed next.

## Current App Status

CFS is demo-ready as a local prototype. It supports:

- parcel search and selected parcel review;
- 3D map focus and selected parcel cage/boundary highlight;
- Due Diligence workflow;
- Executive Print report preview;
- Methodology transparency;
- live FastAPI-backed parcel, development, flood, and school APIs;
- aggregate-only model research status.

It is not production-deployed and it is not a public prediction tool.

## Local Startup Steps

From the project root:

```powershell
cd C:\CabarrusFutureScape
npm run dev:cfs
```

Expected URLs:

- Frontend: `http://localhost:3000`
- Backend root: `http://127.0.0.1:8000`
- FastAPI docs: `http://127.0.0.1:8000/docs`
- Health: `http://127.0.0.1:8000/health`
- Database health: `http://127.0.0.1:8000/health/database`

Use `http://localhost:3000` for the UI demo. Avoid
`http://127.0.0.1:3000`.

Demo parcel:

- `CFS-PARCEL-0149726579`

## Major Capabilities

- Search parcels by parcel ID, PIN, owner/account, address, subdivision, or
  neighborhood.
- Focus the 3D map on a selected parcel.
- Review parcel snapshot, priority flags, zoning, permit activity, flood,
  school, transportation, utility proxy, and model research status.
- Toggle real map layers such as Development Hotspots, Flood Constraints, FEMA
  Flood Zones, and School Utilization Seed.
- Generate a report-preview layout through Executive Print.
- Review data assumptions, limitations, and model safety in Methodology.

## Major Caveats

- CFS is an internal prototype, not a production decision system.
- Model outputs are not public-facing.
- Exact parcel-level prediction probabilities are not shown.
- Parcel-level ranking classes are not shown.
- Official school capacity and enrollment are not loaded.
- Presentation-derived school utilization requires verification.
- Utility layers are proxy/context only and do not confirm capacity.
- Historical zoning changes are map-change detections, not official rezoning
  approval records.

## Validation Status

Latest demo validation passed:

- `npm run typecheck`
- `npm run lint`
- `npm run build -- --webpack`
- `npm run dev:cfs`

Phase 18C browser dry run passed with known warnings only:

- known ArcGIS draped graphics label-placement warnings;
- known placeholder/disabled layer warnings for mock/internal layers.

## Current Best Internal Model Status

Current best internal research variant:

- Zoning + Transportation + Tax/Value

Safety status:

- `model_active=false`
- `prediction_probability_available=false`
- `production_ready=false`
- `public_exposure_allowed=false`

The model is internal research only and should not be described as a public
forecast or production decision tool.

## Where Docs and Screenshots Live

Core demo docs:

- `docs/demo/cfs_demo_walkthrough.md`
- `docs/demo/cfs_leadership_brief.md`
- `docs/demo/cfs_capability_matrix.md`
- `docs/demo/cfs_what_not_to_claim.md`
- `docs/demo/cfs_final_demo_checklist.md`
- `docs/demo/cfs_higher_up_presentation_outline.md`

Screenshots:

- `docs/demo/screenshots/`

Latest summary artifacts:

- `outputs/phase18c_demo_dry_run_results.json`
- `outputs/phase18c_final_demo_evidence_package_summary.json`

## Recommended Next Work

1. Commit and checkpoint the demo-ready package.
2. Share the handoff packet with a supervisor or technical reviewer.
3. Request official missing data from partner departments.
4. Add official data ingestion only after source files or service access are
   confirmed.
5. Continue model validation internally; do not expose prediction outputs.

## Data Requests Needed From Other Departments

- WSACC or utility provider: true service area, available capacity, allocation,
  and planned extensions.
- Schools: official enrollment, functional capacity, grade-level enrollment,
  projections, and planned capacity changes.
- Planning/GIS: countywide future land use and small-area plan GIS.
- Planning/Clerk/Boards: official rezoning case records with dates, old zoning,
  new zoning, status, and geometry or parcel links.
- Transportation: planned local road projects with geometry, dates, status, and
  funding.
