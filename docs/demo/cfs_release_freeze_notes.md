# CFS Release Freeze Notes

## Release Freeze Posture

Cabarrus FutureScape is in a demo-safe release checkpoint. The current prototype is suitable for portfolio walkthroughs, internal stakeholder demos, and technical review, with the model research clearly labeled as internal and not production-ready.

This freeze should prioritize stability, clear messaging, and preservation of completed phase artifacts. New data sources, model training, schema changes, and UI redesigns should wait until after the freeze is explicitly lifted.

## Current Capabilities

- Parcel search, selected parcel detail, and SceneView parcel focus.
- Selected parcel Due Diligence with zoning, permit/development activity, flood context, school assignment, and report-ready context.
- Development Hotspots with permit segment concentration styling.
- FEMA NFHL flood constraint markers and FEMA flood zone polygons.
- Read-only school assignment based on attendance-zone polygon overlap.
- Presentation-derived school utilization seed, clearly caveated as preliminary and needing verification.
- Transportation accessibility, STIP, AADT, planning/pipeline/utility source and feature research artifacts.
- New construction permit label factory and internal model research artifacts.
- Methodology workspace explaining data sources, assumptions, limitations, and model governance.
- Executive Print mode for a selected-parcel report style view.

## Model Safety Status

The development prediction work remains internal model research only.

- `model_active = false`
- `prediction_probability_available = false`
- `production_ready = false`
- `public_exposure_allowed = false`
- No parcel-level prediction probability endpoint should exist.
- No parcel-level ranking class endpoint should exist.
- No frontend parcel-level prediction or ranking display should exist.

Allowed aggregate-only model endpoints:

- `/development/prediction/features/summary`
- `/development/prediction/ranking/summary`
- `/development/prediction/transportation-accessibility/summary`
- `/development/prediction/transportation-plan-traffic/summary`

## Data Still Needed

- Official school enrollment, functional capacity, grade-level enrollment, projections, and planned capacity changes.
- Official rezoning case history with approval dates, old zoning, new zoning, status, jurisdiction, and geometry.
- Future land use and adopted small-area plan GIS layers with dates and policy status.
- Local transportation project GIS with project status, dates, funding, and geometry.
- Utility capacity and service-area readiness data from authoritative owners.
- Economic and market context suitable for time-aware modeling.

## Demo Startup Steps

From the project root:

```powershell
cd C:\CabarrusFutureScape
npm run dev:cfs
```

Expected local URLs:

- Frontend: `http://localhost:3000`
- Backend: `http://127.0.0.1:8000`
- API docs: `http://127.0.0.1:8000/docs`
- Service health: `http://127.0.0.1:8000/health`
- Database health: `http://127.0.0.1:8000/health/database`

Emergency cleanup, only when stale local servers are blocking startup:

```powershell
taskkill /F /IM node.exe
taskkill /F /IM python.exe
if (Test-Path ".next") { Remove-Item ".next" -Recurse -Force }
npm run dev:cfs
```

The emergency command kills all local Node and Python processes, so use it only when port cleanup is truly needed.

## Recommended Demo Flow

1. Open Overview and introduce CFS as parcel-centric planning intelligence.
2. Search for `CFS-PARCEL-0149726579`.
3. Confirm the map focuses the selected parcel and the Active Selection overlay updates.
4. Open Due Diligence and review parcel, zoning, flood, permit, and school context.
5. Toggle live map layers selectively: Development Hotspots, Flood Constraints, FEMA Flood Zones, and School Utilization Seed.
6. Open Methodology and explain data sources, assumptions, limitations, and internal-only model governance.
7. Open Executive Print for a report-style selected parcel summary.

## What Not To Claim

- Do not claim parcel-level predictions are public or production-ready.
- Do not claim exact development probabilities.
- Do not claim the model forecasts that a parcel will develop.
- Do not call presentation-derived school utilization official capacity data.
- Do not call school capacity scored until official enrollment/capacity data is loaded and validated.
- Do not claim map-detected zoning changes are official rezoning approvals.
- Do not claim current-context transportation or planning features are time-safe historical features.

## Known Limitations

- School capacity scoring is inactive because official enrollment and functional capacity are not loaded.
- Presentation-derived utilization values are preliminary and require verification.
- Historical zoning is useful for map-change detection, but exact rezoning approval dates still require official case records.
- Some transportation and planning features are current-context only and should not be used for production backtesting claims.
- Model calibration is weak, so exact probabilities should not be displayed.
- Runtime logs are tracked in the repository and should not be included in release commits.

## Freeze Rules

- Do not add new datasets during the freeze.
- Do not train or retrain models during the freeze.
- Do not expose predictions or ranking classes in the frontend.
- Do not add public parcel-level prediction endpoints.
- Do not modify PostGIS schemas.
- Do not rebuild ingestion pipelines.
- Do not delete completed output artifacts.

## Recommended Next Work After Freeze

1. Cleanly commit release-ready code, docs, config, tests, and artifacts while excluding runtime logs.
2. Decide whether tracked runtime logs should be restored before commit or removed from version control in a separate hygiene change.
3. Run a recorded demo walkthrough using the release candidate checklist.
4. Resume data acquisition for official school capacity, rezoning case history, future land use, utility capacity, and transportation project GIS.
