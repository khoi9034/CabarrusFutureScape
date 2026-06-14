# CFS Release Candidate Checklist

Use this before a portfolio demo, stakeholder walkthrough, or interview run.

## Runtime

- Confirm branch is `main`.
- Preserve existing work; do not reset or force-push.
- Do not commit `logs/backend-dev.log` or `logs/next-dev.log`.
- Start CFS from `C:\CabarrusFutureScape` with `npm run dev:cfs`.
- Confirm frontend: `http://localhost:3000`.
- Confirm backend: `http://127.0.0.1:8000`.
- Confirm `/health` and `/health/database` return 200.

## Demo Modes

- Overview loads with no selected parcel.
- Due Diligence loads with no selected parcel and shows a clean empty state.
- Methodology loads without rendering SceneView.
- Executive Print loads with no selected parcel.
- Errors appear as safe cards, not blank screens.

## Selected Parcel Smoke

Search and select `CFS-PARCEL-0149726579`.

Verify:

- selected parcel card updates;
- active selection overlay updates;
- parcel cage/highlight appears;
- zoning context appears;
- flood context appears;
- development/permit context appears;
- school assignment and presentation-derived utilization caveats appear;
- no valid selected parcel section says not found.

## Layer Rail

Verify these toggles without leaving layers on for the full demo unless needed:

- Development Hotspots;
- Flood Constraints;
- FEMA Flood Zones;
- School Utilization Seed;
- County Boundary;
- Parcel Intelligence.

Disabled, placeholder, local, and mock layers should not behave like production
services and should not switch the app into unsupported modes.

## Prediction Guardrails

Allowed aggregate prediction endpoints:

- `/development/prediction/features/summary`
- `/development/prediction/ranking/summary`
- `/development/prediction/transportation-accessibility/summary`
- `/development/prediction/transportation-plan-traffic/summary`

Must remain true:

- `model_active=false`;
- `prediction_probability_available=false`;
- `production_ready=false`;
- `public_exposure_allowed=false` where present.

Must not appear:

- parcel-level prediction probabilities;
- parcel-level ranking classes;
- public parcel prediction endpoint;
- map prediction layer;
- language implying official forecasts or production scoring.

## Source Registry Notes

Cabarrus REST layers may move between service folders. If a source URL fails,
check newer OpenData service roots, legacy fallback roots, layer IDs, and source
registry notes before declaring the source unavailable.
