# Development Prediction Label Factory

Phase 10A creates target labels for future development modeling. It does not
train a model and does not expose a prediction probability.

## Target Question

For each parcel, what eventually happened after a historical snapshot?

The future modeling question this supports is:

> What is the probability that a parcel receives a new construction permit
> within the next three years?

## Label Table

Table: `public.parcel_development_prediction_labels`

One row is generated per parcel per `snapshot_year`.

For snapshot year `Y`:

- Future starts on `January 1` of `Y + 1`.
- `new_construction_next_1yr` is true when a matched permit occurs in `Y + 1`.
- `new_construction_next_3yr` is true when a matched permit occurs from `Y + 1` through `Y + 3`.
- Residential/commercial label variants use the same forward-only window.
- CO labels are targets only; CO dates must not be used as features before they exist.

## Temporal Leakage Rule

Features for snapshot year `Y` must only use data available on or before
`December 31` of `Y`. Future permit and CO outcomes are target labels only.

## Why This Is Not a Model Yet

The label table records historical outcomes. A future model still needs a
carefully reviewed feature set, train/test split, baseline metrics, calibration,
and fairness/coverage review before any probability or score can be shown.

## Future Feature Families

- Zoning and zoning changes
- Parcel size, land value, and improvement value
- Vacant or developable land indicators
- Flood constraints
- School assignment and verified capacity/enrollment data
- Infrastructure and utility readiness
- Transportation and road access
- Nearby development activity
- Future land-use and planning policy context
