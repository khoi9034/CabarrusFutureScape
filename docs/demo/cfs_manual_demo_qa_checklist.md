# CFS Manual Demo QA Checklist

Use this before recording screenshots or presenting the prototype.

## Runtime Startup

- [ ] Run `npm run dev:cfs`.
- [ ] Confirm frontend is available at `http://localhost:3000`.
- [ ] Confirm backend is available at `http://127.0.0.1:8000`.
- [ ] Confirm `.env.local` uses `NEXT_PUBLIC_USE_BACKEND_API=true`.
- [ ] Confirm `.env.local` uses `NEXT_PUBLIC_CFS_API_BASE_URL=http://127.0.0.1:8000`.

## API Health

- [ ] `GET /health` returns `200`.
- [ ] `GET /health/database` returns `200`.
- [ ] `GET /parcels/search?q=CFS-PARCEL-0149726579` returns `200`.
- [ ] `GET /parcels/CFS-PARCEL-0149726579?include_geometry=true` returns `200`.
- [ ] `GET /development/hotspots?limit=1` returns `200`.
- [ ] `GET /development/new-construction/statistics` returns `200`.
- [ ] `GET /development/prediction/features/summary` returns `200`.
- [ ] `GET /development/prediction/ranking/summary` returns `200`.
- [ ] `GET /constraints/flood/summary` returns `200`.
- [ ] `GET /constraints/flood/zones?limit=1` returns `200`.
- [ ] `GET /constraints/schools/statistics` returns `200`.
- [ ] `GET /constraints/schools/utilization-seed` returns `200`.

## Parcel Search

- [ ] Search `CFS-PARCEL-0149726579` from the top search bar.
- [ ] Search results appear.
- [ ] Selecting the result calls parcel detail with `include_geometry=true`.
- [ ] Selected parcel card updates.
- [ ] Active selection overlay updates.
- [ ] SceneView zooms/focuses.
- [ ] Parcel cage/highlight is visible.

## Layer Toggles

- [ ] `Development Hotspots` toggles on and off.
- [ ] Development Hotspots require or clearly encourage permit segment selection.
- [ ] Hotspot marker click selects parcel and preserves selected parcel flow.
- [ ] `Flood Constraints` toggles on and off.
- [ ] Flood marker click shows flood information and selects parcel if expected.
- [ ] `FEMA Flood Zones` toggles on and off.
- [ ] FEMA polygon click shows source polygon information without selecting a parcel.
- [ ] `School Utilization Seed` toggles on and off.
- [ ] `County Boundary` and `Parcel Intelligence` remain stable.

## School Hover/Click

- [ ] Hovering school utilization zones shows readable detail where supported.
- [ ] Clicking a school utilization zone shows zone detail without changing selected parcel.
- [ ] The UI says presentation-derived and needs verification.
- [ ] The UI does not claim official overcrowding.
- [ ] The UI does not claim official capacity scoring.

## Flood Click

- [ ] Flood marker card shows parcel ID and flood constraint details.
- [ ] Severe/high/moderate marker styling is readable.
- [ ] Flood click does not break selected parcel cage.
- [ ] Flood layer can be turned off and clears graphics.

## Methodology

- [ ] Methodology mode loads.
- [ ] `Development Prediction Research Status` appears.
- [ ] Aggregate ranking distribution appears.
- [ ] Safety flags are visible: `model_active=false`, `prediction_probability_available=false`, `production_ready=false`, `public_exposure_allowed=false`.
- [ ] No parcel-level predictions appear.
- [ ] No exact probabilities appear.
- [ ] Wording says internal research and not production-ready.

## Executive Print

- [ ] Executive Print mode loads.
- [ ] Selected parcel evidence appears if a parcel is selected.
- [ ] Flood, school, and development caveats are clear.
- [ ] No prediction probabilities or parcel ranking classes appear.
- [ ] Print mode does not show broken empty cards.

## Fullscreen Map

- [ ] Fullscreen/focused map mode opens.
- [ ] Left layer rail remains usable.
- [ ] Right intelligence panel and bottom KPI strip do not clutter map exploration.
- [ ] Map controls are not blocked by focus cards.
- [ ] Exiting fullscreen restores the workspace cleanly.

## Console and Network

- [ ] Browser console has no new errors.
- [ ] No repeated API 404/500 errors.
- [ ] No global `CFS API request failed` banner.
- [ ] No prediction endpoint is called for parcel-level scores.

## Prediction Exposure Guardrail

- [ ] No exact prediction probability appears.
- [ ] No parcel-level ranking class appears.
- [ ] No public parcel prediction endpoint exists.
- [ ] Model wording stays internal-only, aggregate-only, and not production-ready.
