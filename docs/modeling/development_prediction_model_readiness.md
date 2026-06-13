# Development Prediction Model Readiness

Phase 10B prepares CFS for future development prediction modeling by building a parcel-year feature matrix. It intentionally stops before model training.

## Current Readiness

- Phase 10A future labels exist in `public.parcel_development_prediction_labels`.
- Phase 10B features are written to `public.parcel_development_prediction_features`.
- Time-safe prior permit windows are derived using event dates on or before each snapshot year-end.
- The backend readiness endpoint reports matrix coverage, label balance, missingness highlights, and leakage caveats.
- Phase 10C internal baseline experiments can be reviewed through generated
  artifacts and metadata, but remain disabled for production and frontend use.

## Not Active Yet

- No production model is trained.
- No prediction probability is exposed.
- No frontend prediction display exists.
- Internal experiment scores, if written, are stored only in
  `public.development_prediction_model_experiment_scores` with
  `production_ready=false`.
- No school capacity pressure score is calculated from missing official enrollment/capacity data.
- No zoning change history is fabricated.

## Recommended Modeling Sequence

1. Freeze feature registry and leakage policy.
2. Train an internal baseline model using only `time_safe` fields.
3. Compare against a current-context exploratory model only for planning research.
4. Validate by snapshot year, parcel geography, jurisdiction, and label rarity.
5. Publish model documentation before exposing any probability to users.

## Required Before Production

- Historical valuation snapshots or removal of current valuation from backtests.
- Historical zoning or explicit current-context-only model framing.
- Official school enrollment/capacity data before school capacity pressure is modeled.
- Spatial neighborhood features with documented temporal windows.
- Independent validation of class imbalance and calibration.
