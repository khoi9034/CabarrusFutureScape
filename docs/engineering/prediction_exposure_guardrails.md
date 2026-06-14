# Prediction Exposure Guardrails

CFS includes internal development ranking research, but it is not public-facing
and not production-ready.

## Allowed Public API Surface

Only aggregate development prediction endpoints are allowed:

- `GET /development/prediction/features/summary`
- `GET /development/prediction/ranking/summary`
- `GET /development/prediction/transportation-accessibility/summary`
- `GET /development/prediction/transportation-plan-traffic/summary`

Do not add parcel-level prediction or ranking endpoints without a separate
governance decision.

Endpoints that must not exist in the public API include any parcel-scoped path
such as:

- `/development/prediction/{official_parcel_id}`
- `/development/prediction/ranking/{official_parcel_id}`
- `/development/prediction/scores/{official_parcel_id}`
- `/development/prediction/probability/{official_parcel_id}`

## Frontend Rules

- Do not show exact prediction probabilities.
- Do not show parcel-level ranking classes.
- Do not add a prediction map layer.
- Do not describe internal ranking classes as final forecasts.
- Keep language to: internal research, model QA, development signal research,
  not production-ready, calibration review required.

Avoid language such as:

- predicted probability
- this parcel will develop
- final risk score
- public forecast
- production model

## Required Flags

Prediction aggregate responses must continue to communicate:

- `model_active = false`
- `prediction_probability_available = false`
- `production_ready = false`
- `public_exposure_allowed = false` where applicable

## Verification Commands

```powershell
$openapi = Invoke-RestMethod http://127.0.0.1:8000/openapi.json
$openapi.paths.PSObject.Properties.Name |
  Where-Object { $_ -like "/development/prediction*" }

$summary = Invoke-RestMethod http://127.0.0.1:8000/development/prediction/features/summary
$summary.model_active
$summary.prediction_probability_available
$summary.production_ready
```

Expected route inventory:

- `/development/prediction/features/summary`
- `/development/prediction/ranking/summary`
- `/development/prediction/transportation-accessibility/summary`
- `/development/prediction/transportation-plan-traffic/summary`

Expected flags are all `false`.

## Why This Boundary Exists

Phase 10F found weak probability calibration. Ranking research may help internal
QA, but CFS still needs official rezoning dates, future land use, transportation
project timing, utilities, verified school capacity, economic controls, and
governance review before any parcel-level signal is considered for public
display.
