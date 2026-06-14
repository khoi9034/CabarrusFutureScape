# Phase 13C Transportation-Enhanced Model Caveats

- This is an internal exploratory comparison only.
- Transportation features are current-context only and are not strict
  historical training features.
- No prediction probabilities are exposed in the frontend.
- No parcel-level ranking classes are exposed.
- No public parcel prediction endpoint is added.
- `production_ready=false`, `model_active=false`, and
  `prediction_probability_available=false` remain mandatory.
- Excluded incomplete future-window snapshot years: `[2023, 2024, 2025, 2026]`.
- STIP is a 2026-2035 planned/funded project program and does not represent a
  complete local transportation plan history.
- AADT station proximity is traffic-demand context, not parcel-specific trip
  generation.
- Future production-safe transportation modeling would need historical road
  networks, dated STIP/project records, construction/completion dates,
  historical AADT by year, and local transportation project GIS.

## Comparison Summary

```json
{
  "roc_auc": {
    "zoning_enhanced": 0.684217,
    "transportation_enhanced": 0.702248,
    "absolute_improvement": 0.018031,
    "percent_improvement": 2.6353
  },
  "average_precision_pr_auc": {
    "zoning_enhanced": 0.071174,
    "transportation_enhanced": 0.087668,
    "absolute_improvement": 0.016494,
    "percent_improvement": 23.1742
  },
  "precision_at_top_1_pct": {
    "zoning_enhanced": 0.144414,
    "transportation_enhanced": 0.133515,
    "absolute_improvement": -0.010899,
    "percent_improvement": -7.5471
  },
  "precision_at_top_5_pct": {
    "zoning_enhanced": 0.06802,
    "transportation_enhanced": 0.157426,
    "absolute_improvement": 0.089406,
    "percent_improvement": 131.4408
  },
  "recall_at_top_5_pct": {
    "zoning_enhanced": 0.088752,
    "transportation_enhanced": 0.205408,
    "absolute_improvement": 0.116656,
    "percent_improvement": 131.4404
  },
  "lift_at_top_1_pct": {
    "zoning_enhanced": 3.768504,
    "transportation_enhanced": 3.484089,
    "absolute_improvement": -0.284415,
    "percent_improvement": -7.5472
  },
  "lift_at_top_5_pct": {
    "zoning_enhanced": 1.774988,
    "transportation_enhanced": 4.108047,
    "absolute_improvement": 2.333059,
    "percent_improvement": 131.4408
  },
  "brier_score": {
    "zoning_enhanced": 0.142259,
    "transportation_enhanced": 0.100041,
    "absolute_improvement": -0.042218,
    "percent_improvement": -29.6769
  },
  "positive_rate": {
    "zoning_enhanced": 0.038321,
    "transportation_enhanced": 0.038321,
    "absolute_improvement": 0.0,
    "percent_improvement": 0.0
  }
}
```
