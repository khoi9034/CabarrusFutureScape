# CFS Enterprise Hardening Notes

Phase 15A focuses on release-candidate stability without changing the data model,
training models, or exposing parcel-level predictions.

## Runtime Surfaces

- Next.js frontend: `http://localhost:3000`
- FastAPI backend: `http://127.0.0.1:8000`
- API root: `http://127.0.0.1:8000`
- API docs: `http://127.0.0.1:8000/docs`
- Health checks: `/health` and `/health/database`

## Frontend Guardrails

- Major dashboard regions are wrapped in local error boundaries:
  - 3D SceneView
  - map layer rail
  - intelligence panel
  - Methodology
  - Executive Print
  - county metrics
- API errors are classified as HTTP, timeout, unreachable backend, malformed
  response, cancellation, or unknown failure.
- Layer hooks do not fetch when their layer toggle is off.
- Methodology mode does not render the SceneView.
- Prediction research remains aggregate-only and internal.

## Data Status Transparency

The Methodology workspace includes a local platform diagnostics card that checks:

- backend API mode and base URL
- FastAPI root
- service health
- PostGIS health
- development aggregate endpoint
- flood aggregate endpoint
- school aggregate endpoint
- model aggregate endpoint and prediction-safety flags

The diagnostics card is intentionally read-only and does not request parcel-level
prediction scores or ranking classes.

## Performance Guardrails

- School, flood, FEMA, and development hotspot map layers remain off by default.
- Heavy map layers are loaded only when toggled on.
- The selected-parcel hook preserves hydrated parcel intelligence when the same
  parcel is selected again.
- Sidebar resize/collapse state does not remount the SceneView.

## Known Limits

- CFS is still a local prototype/release candidate.
- Some readiness layers remain placeholders or internal research summaries.
- School capacity scoring is inactive until verified enrollment and capacity
  data is ingested.
- Development ranking research is not production-ready and should not be used as
  a parcel-level decision tool.
