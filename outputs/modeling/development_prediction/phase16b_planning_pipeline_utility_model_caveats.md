# Phase 16B Planning / Pipeline / Utility Model Caveats

- This is an internal exploratory comparison only.
- Planning, Accela pipeline, WSACC utility proxy, and Tax Parcels Full fields
  are current-context inputs, not strict historical training features.
- Concord Central Area Plan fields are not countywide future land-use coverage.
- Accela plan review records are early pipeline signals, not approvals or
  completed development.
- WSACC proxy layers describe proximity/service context only. They do not
  report sewer allocation, remaining capacity, or buildable service rights.
- Tax Parcels Full enriches current value context and does not overwrite the
  base parcel table.
- No prediction probabilities are exposed in the frontend.
- No parcel-level ranking classes are exposed.
- No public parcel prediction endpoint is added.
- `production_ready=false`, `model_active=false`, and
  `prediction_probability_available=false` remain mandatory.
- Excluded incomplete future-window snapshot years: `[2023, 2024, 2025, 2026]`.

## Comparison Summary

```json
{
  "roc_auc": {
    "transportation_enhanced": 0.715771,
    "planning_pipeline_utility_enhanced": 0.770504,
    "absolute_improvement": 0.054733,
    "percent_improvement": 7.6467
  },
  "average_precision_pr_auc": {
    "transportation_enhanced": 0.083925,
    "planning_pipeline_utility_enhanced": 0.073322,
    "absolute_improvement": -0.010603,
    "percent_improvement": -12.6339
  },
  "precision_at_top_1_pct": {
    "transportation_enhanced": 0.108084,
    "planning_pipeline_utility_enhanced": 0.025431,
    "absolute_improvement": -0.082653,
    "percent_improvement": -76.4711
  },
  "precision_at_top_5_pct": {
    "transportation_enhanced": 0.136157,
    "planning_pipeline_utility_enhanced": 0.022541,
    "absolute_improvement": -0.113616,
    "percent_improvement": -83.4448
  },
  "recall_at_top_5_pct": {
    "transportation_enhanced": 0.177657,
    "planning_pipeline_utility_enhanced": 0.029412,
    "absolute_improvement": -0.148245,
    "percent_improvement": -83.4445
  },
  "lift_at_top_1_pct": {
    "transportation_enhanced": 2.820453,
    "planning_pipeline_utility_enhanced": 0.663636,
    "absolute_improvement": -2.156817,
    "percent_improvement": -76.4706
  },
  "lift_at_top_5_pct": {
    "transportation_enhanced": 3.553034,
    "planning_pipeline_utility_enhanced": 0.588219,
    "absolute_improvement": -2.964815,
    "percent_improvement": -83.4446
  },
  "brier_score": {
    "transportation_enhanced": 0.102484,
    "planning_pipeline_utility_enhanced": 0.07457,
    "absolute_improvement": -0.027914,
    "percent_improvement": -27.2374
  },
  "positive_rate": {
    "transportation_enhanced": 0.038321,
    "planning_pipeline_utility_enhanced": 0.038321,
    "absolute_improvement": 0.0,
    "percent_improvement": 0.0
  }
}
```
