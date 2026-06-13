# Development Prediction Baseline Model Card

Experiment ID: `phase10c_new_construction_next_3yr_strict_time_safe_baseline_20260612_235209`

## Status

This is an internal Phase 10C experiment only. It is **not** production ready,
does not expose predictions in the frontend, and does not support public parcel
decision-making.

## Target

Primary target used: `new_construction_next_3yr`.

The target is a Phase 10A future label. It is never used as a feature.

## Training Data

Source table: `public.parcel_development_prediction_features`

Only mature snapshot years are used. For the 3-year target, years after `2022`
are excluded because their full future window is not observable from the current
permit extract.

Temporal split:

- Train: `2014-2019`
- Validation: `2020-2021`
- Test: `2022-2022`

## Feature Set

Feature set: `strict_time_safe_baseline`

The strict baseline uses prior-window permit and new-construction history only.
Current zoning, valuation, school assignment, flood, and all-time development
activity fields are excluded from the strict model unless the explicitly marked
exploratory feature set is used.

## Test Metrics

```json
{
  "row_count": 110017,
  "positive_count": 4216,
  "positive_rate": 0.038321,
  "roc_auc": 0.651077,
  "average_precision_pr_auc": 0.054985,
  "precision_at_top_1_pct": 0.024523,
  "precision_at_top_5_pct": 0.078713,
  "recall_at_top_5_pct": 0.102704,
  "lift_at_top_5_pct": 2.054024,
  "brier_score": 0.208022,
  "confusion_matrix_threshold_0_5": {
    "true_negative": 35361,
    "false_positive": 70440,
    "false_negative": 131,
    "true_positive": 4085
  }
}
```

## Important Features

- `new_construction_permits_prior_5yr` (model_feature): coefficient `-0.94143868`
- `permits_prior_5yr` (model_feature): coefficient `-0.60844088`
- `years_since_last_permit` (model_feature): coefficient `-0.55138637`
- `residential_growth_permits_prior_3yr` (permit_history_features): coefficient `-0.4082771`
- `commercial_new_construction_prior_3yr` (model_feature): coefficient `0.34027401`
- `commercial_activity_permits_prior_3yr` (permit_history_features): coefficient `0.30994131`
- `major_permits_prior_3yr` (model_feature): coefficient `0.30973344`
- `new_construction_permits_prior_3yr` (new_construction_history_features): coefficient `0.27488898`
- `completed_new_construction_prior_3yr` (new_construction_history_features): coefficient `0.25378928`
- `active_uncompleted_new_construction_prior_3yr` (model_feature): coefficient `0.17685022`

## Limitations

- This is descriptive baseline research, not a production prediction product.
- Labels are sparse and class-imbalanced, so PR-AUC, precision@k, and lift are
  more important than accuracy.
- Current zoning changes, subdivision approvals, market/economic controls,
  infrastructure readiness, road/accessibility, and official school capacity
  are not in the strict baseline.
- Official school capacity/enrollment is not active.
- No fairness, governance, calibration, or external validation approval has
  been completed.

## Future Improvements Needed

- Historical zoning change series.
- Future land-use and subdivision approval features.
- Road/accessibility and infrastructure readiness.
- Official school capacity/enrollment.
- Market/economic controls.
- Parcel vacancy and underbuilt indicators validated against historical values.
