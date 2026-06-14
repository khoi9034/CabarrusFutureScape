# Phase 10E Zoning-Enhanced Model Caveats

- This is an internal model comparison only.
- No prediction probabilities are exposed in the frontend.
- No public prediction endpoint is added.
- `production_ready=false`, `model_active=false`, and
  `prediction_probability_available=false` remain mandatory.
- Excluded incomplete future-window snapshot years: `[2023, 2024, 2025, 2026]`.
- Historical zoning snapshots never use current zoning as past zoning.
- Zoning source years and map-change years are constrained to be less than or
  equal to the model snapshot year.
- Zoning changes are map-change detections, not official rezoning case
  approvals.
- Post-2015 zoning snapshots are time-safe but stale when they use the latest
  2015 historical source as `prior_available_year`.

## Comparison Summary

```json
{
  "roc_auc": {
    "baseline": 0.650408,
    "zoning_enhanced": 0.684217,
    "absolute_improvement": 0.033809,
    "percent_improvement": 5.1981
  },
  "average_precision_pr_auc": {
    "baseline": 0.054665,
    "zoning_enhanced": 0.071174,
    "absolute_improvement": 0.016509,
    "percent_improvement": 30.2003
  },
  "precision_at_top_1_pct": {
    "baseline": 0.022707,
    "zoning_enhanced": 0.144414,
    "absolute_improvement": 0.121707,
    "percent_improvement": 535.9889
  },
  "precision_at_top_5_pct": {
    "baseline": 0.027086,
    "zoning_enhanced": 0.065443,
    "absolute_improvement": 0.038357,
    "percent_improvement": 141.6119
  },
  "recall_at_top_5_pct": {
    "baseline": 0.035342,
    "zoning_enhanced": 0.085389,
    "absolute_improvement": 0.050047,
    "percent_improvement": 141.6077
  },
  "lift_at_top_5_pct": {
    "baseline": 0.706812,
    "zoning_enhanced": 1.707733,
    "absolute_improvement": 1.000921,
    "percent_improvement": 141.6106
  },
  "brier_score": {
    "baseline": 0.208555,
    "zoning_enhanced": 0.142259,
    "absolute_improvement": -0.066296,
    "percent_improvement": -31.7883
  }
}
```
