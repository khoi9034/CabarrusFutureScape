# Development Prediction Zoning-Enhanced Model Card

## Status

Phase 10E is an internal model-comparison experiment. It is not production
ready, does not expose prediction probabilities, and does not add a frontend or
public API prediction experience.

## Data

Feature table:

`public.parcel_development_prediction_features_zoning_enhanced`

The table preserves Phase 10B rows and appends historical zoning snapshot and
map-change features from:

- `public.parcel_zoning_snapshot_year`
- `public.parcel_zoning_change_events`

## Temporal Split

- Train: `2014-2019`
- Validation: `2020-2021`
- Test: `2022-2022`

Years after 2022 are excluded for the 3-year target because their full future
window is incomplete.

## Zoning Feature Caveats

- Historical zoning source years must be `<= snapshot_year`.
- Zoning change years must be `<= snapshot_year`.
- Current zoning is never used as historical zoning.
- Post-2015 zoning context is stale when the most recent historical source is
  2015.
- Detected zoning changes are map changes, not official rezoning approvals.

## Metrics

```json
{
  "experiment_id": "phase10e_zoning_enhanced_v1",
  "target": "new_construction_next_3yr",
  "model_active": false,
  "prediction_probability_available": false,
  "production_ready": false,
  "phase10c_reference_metrics": {
    "experiment_id": "phase10c_new_construction_next_3yr_strict_time_safe_baseline_20260612_235209",
    "target": "new_construction_next_3yr",
    "feature_set": "strict_time_safe_baseline",
    "model_active": false,
    "prediction_probability_available": false,
    "production_ready": false,
    "best_model_name": "hist_gradient_boosting",
    "models": {
      "logistic_regression": {
        "validation": {
          "row_count": 220034,
          "positive_count": 8611,
          "positive_rate": 0.039135,
          "roc_auc": 0.607809,
          "average_precision_pr_auc": 0.051234,
          "precision_at_top_1_pct": 0.010904,
          "precision_at_top_5_pct": 0.017542,
          "recall_at_top_5_pct": 0.022413,
          "lift_at_top_5_pct": 0.448252,
          "brier_score": 0.234494,
          "confusion_matrix_threshold_0_5": {
            "true_negative": 56612,
            "false_positive": 154811,
            "false_negative": 202,
            "true_positive": 8409
          }
        },
        "test": {
          "row_count": 110017,
          "positive_count": 4216,
          "positive_rate": 0.038321,
          "roc_auc": 0.605749,
          "average_precision_pr_auc": 0.051172,
          "precision_at_top_1_pct": 0.009083,
          "precision_at_top_5_pct": 0.008726,
          "recall_at_top_5_pct": 0.011385,
          "lift_at_top_5_pct": 0.227698,
          "brier_score": 0.241427,
          "confusion_matrix_threshold_0_5": {
            "true_negative": 29899,
            "false_positive": 75902,
            "false_negative": 103,
            "true_positive": 4113
          }
        }
      },
      "hist_gradient_boosting": {
        "validation": {
          "row_count": 220034,
          "positive_count": 8611,
          "positive_rate": 0.039135,
          "roc_auc": 0.638043,
          "average_precision_pr_auc": 0.054323,
          "precision_at_top_1_pct": 0.03771,
          "precision_at_top_5_pct": 0.076441,
          "recall_at_top_5_pct": 0.097666,
          "lift_at_top_5_pct": 1.953262,
          "brier_score": 0.216887,
          "confusion_matrix_threshold_0_5": {
            "true_negative": 63993,
            "false_positive": 147430,
            "false_negative": 245,
            "true_positive": 8366
          }
        },
        "test": {
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
      }
    }
  },
  "retrained_baseline": {
    "best_model_name": "hist_gradient_boosting",
    "models": {
      "logistic_regression": {
        "validation": {
          "row_count": 220034,
          "positive_count": 8611,
          "positive_rate": 0.039135,
          "roc_auc": 0.607809,
          "average_precision_pr_auc": 0.051234,
          "precision_at_top_1_pct": 0.010904,
          "precision_at_top_5_pct": 0.016088,
          "recall_at_top_5_pct": 0.020555,
          "lift_at_top_5_pct": 0.411091,
          "brier_score": 0.234494,
          "confusion_matrix_threshold_0_5": {
            "true_negative": 56612,
            "false_positive": 154811,
            "false_negative": 202,
            "true_positive": 8409
          }
        },
        "test": {
          "row_count": 110017,
          "positive_count": 4216,
          "positive_rate": 0.038321,
          "roc_auc": 0.605749,
          "average_precision_pr_auc": 0.051172,
          "precision_at_top_1_pct": 0.009083,
          "precision_at_top_5_pct": 0.008726,
          "recall_at_top_5_pct": 0.011385,
          "lift_at_top_5_pct": 0.227698,
          "brier_score": 0.241427,
          "confusion_matrix_threshold_0_5": {
            "true_negative": 29899,
            "false_positive": 75902,
            "false_negative": 103,
            "true_positive": 4113
          }
        }
      },
      "hist_gradient_boosting": {
        "validation": {
          "row_count": 220034,
          "positive_count": 8611,
          "positive_rate": 0.039135,
          "roc_auc": 0.638514,
          "average_precision_pr_auc": 0.054578,
          "precision_at_top_1_pct": 0.040891,
          "precision_at_top_5_pct": 0.028813,
          "recall_at_top_5_pct": 0.036813,
          "lift_at_top_5_pct": 0.736247,
          "brier_score": 0.217276,
          "confusion_matrix_threshold_0_5": {
            "true_negative": 63894,
            "false_positive": 147529,
            "false_negative": 235,
            "true_positive": 8376
          }
        },
        "test": {
          "row_count": 110017,
          "positive_count": 4216,
          "positive_rate": 0.038321,
          "roc_auc": 0.650408,
          "average_precision_pr_auc": 0.054665,
          "precision_at_top_1_pct": 0.022707,
          "precision_at_top_5_pct": 0.027086,
          "recall_at_top_5_pct": 0.035342,
          "lift_at_top_5_pct": 0.706812,
          "brier_score": 0.208555,
          "confusion_matrix_threshold_0_5": {
            "true_negative": 35276,
            "false_positive": 70525,
            "false_negative": 132,
            "true_positive": 4084
          }
        }
      }
    }
  },
  "zoning_enhanced": {
    "best_model_name": "hist_gradient_boosting",
    "models": {
      "logistic_regression": {
        "validation": {
          "row_count": 220034,
          "positive_count": 8611,
          "positive_rate": 0.039135,
          "roc_auc": 0.605347,
          "average_precision_pr_auc": 0.056819,
          "precision_at_top_1_pct": 0.006361,
          "precision_at_top_5_pct": 0.06417,
          "recall_at_top_5_pct": 0.081988,
          "lift_at_top_5_pct": 1.639718,
          "brier_score": 0.239856,
          "confusion_matrix_threshold_0_5": {
            "true_negative": 132532,
            "false_positive": 78891,
            "false_negative": 3840,
            "true_positive": 4771
          }
        },
        "test": {
          "row_count": 110017,
          "positive_count": 4216,
          "positive_rate": 0.038321,
          "roc_auc": 0.542955,
          "average_precision_pr_auc": 0.04535,
          "precision_at_top_1_pct": 0.002725,
          "precision_at_top_5_pct": 0.026722,
          "recall_at_top_5_pct": 0.034867,
          "lift_at_top_5_pct": 0.697324,
          "brier_score": 0.281834,
          "confusion_matrix_threshold_0_5": {
            "true_negative": 55688,
            "false_positive": 50113,
            "false_negative": 2115,
            "true_positive": 2101
          }
        }
      },
      "hist_gradient_boosting": {
        "validation": {
          "row_count": 220034,
          "positive_count": 8611,
          "positive_rate": 0.039135,
          "roc_auc": 0.74412,
          "average_precision_pr_auc": 0.118972,
          "precision_at_top_1_pct": 0.265334,
          "precision_at_top_5_pct": 0.1517,
          "recall_at_top_5_pct": 0.193822,
          "lift_at_top_5_pct": 3.876331,
          "brier_score": 0.14532,
          "confusion_matrix_threshold_0_5": {
            "true_negative": 169312,
            "false_positive": 42111,
            "false_negative": 4406,
            "true_positive": 4205
          }
        },
        "test": {
          "row_count": 110017,
          "positive_count": 4216,
          "positive_rate": 0.038321,
          "roc_auc": 0.684217,
          "average_precision_pr_auc": 0.071174,
          "precision_at_top_1_pct": 0.144414,
          "precision_at_top_5_pct": 0.065443,
          "recall_at_top_5_pct": 0.085389,
          "lift_at_top_5_pct": 1.707733,
          "brier_score": 0.142259,
          "confusion_matrix_threshold_0_5": {
            "true_negative": 85829,
            "false_positive": 19972,
            "false_negative": 2800,
            "true_positive": 1416
          }
        }
      }
    }
  },
  "comparison_on_selected_best_models": {
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
  },
  "improvement_meaningful": true,
  "zoning_features_appear_important": true,
  "top_zoning_features": [
    {
      "model_name": "logistic_regression",
      "feature_set_name": "zoning_enhanced_history",
      "feature_name": "historical_zoning_code_HC",
      "coefficient": -6.10277615,
      "absolute_coefficient": 6.10277615,
      "feature_group": "historical_zoning_features",
      "temporal_status": "historical_snapshot_time_safe",
      "leakage_risk": "low_to_medium_staleness_review",
      "is_zoning_feature": true
    },
    {
      "model_name": "logistic_regression",
      "feature_set_name": "zoning_enhanced_history",
      "feature_name": "historical_zoning_code_MX-CC1",
      "coefficient": -3.39185623,
      "absolute_coefficient": 3.39185623,
      "feature_group": "historical_zoning_features",
      "temporal_status": "historical_snapshot_time_safe",
      "leakage_risk": "low_to_medium_staleness_review",
      "is_zoning_feature": true
    },
    {
      "model_name": "logistic_regression",
      "feature_set_name": "zoning_enhanced_history",
      "feature_name": "historical_zoning_code_NOT-YET-ZONED",
      "coefficient": -2.78598248,
      "absolute_coefficient": 2.78598248,
      "feature_group": "historical_zoning_features",
      "temporal_status": "historical_snapshot_time_safe",
      "leakage_risk": "low_to_medium_staleness_review",
      "is_zoning_feature": true
    },
    {
      "model_name": "logistic_regression",
      "feature_set_name": "zoning_enhanced_history",
      "feature_name": "historical_zoning_jurisdiction_Midland",
      "coefficient": -2.69187177,
      "absolute_coefficient": 2.69187177,
      "feature_group": "historical_zoning_features",
      "temporal_status": "historical_snapshot_time_safe",
      "leakage_risk": "low_to_medium_staleness_review",
      "is_zoning_feature": true
    },
    {
      "model_name": "logistic_regression",
      "feature_set_name": "zoning_enhanced_history",
      "feature_name": "latest_zoning_change_type_code_and_category_changed",
      "coefficient": 2.64325468,
      "absolute_coefficient": 2.64325468,
      "feature_group": "historical_zoning_features",
      "temporal_status": "historical_snapshot_time_safe",
      "leakage_risk": "low_to_medium_staleness_review",
      "is_zoning_feature": true
    },
    {
      "model_name": "logistic_regression",
      "feature_set_name": "zoning_enhanced_history",
      "feature_name": "historical_zoning_code_PID",
      "coefficient": -2.53684304,
      "absolute_coefficient": 2.53684304,
      "feature_group": "historical_zoning_features",
      "temporal_status": "historical_snapshot_time_safe",
      "leakage_risk": "low_to_medium_staleness_review",
      "is_zoning_feature": true
    },
    {
      "model_name": "logistic_regression",
      "feature_set_name": "zoning_enhanced_history",
      "feature_name": "historical_zoning_code_TND",
      "coefficient": 2.32791897,
      "absolute_coefficient": 2.32791897,
      "feature_group": "historical_zoning_features",
      "temporal_status": "historical_snapshot_time_safe",
      "leakage_risk": "low_to_medium_staleness_review",
      "is_zoning_feature": true
    },
    {
      "model_name": "logistic_regression",
      "feature_set_name": "zoning_enhanced_history",
      "feature_name": "zoning_map_change_only_flag",
      "coefficient": 2.26115712,
      "absolute_coefficient": 2.26115712,
      "feature_group": "historical_zoning_features",
      "temporal_status": "historical_snapshot_time_safe",
      "leakage_risk": "low_to_medium_staleness_review",
      "is_zoning_feature": true
    },
    {
      "model_name": "logistic_regression",
      "feature_set_name": "zoning_enhanced_history",
      "feature_name": "latest_zoning_intensity_change_decreased",
      "coefficient": -2.14783688,
      "absolute_coefficient": 2.14783688,
      "feature_group": "historical_zoning_features",
      "temporal_status": "historical_snapshot_time_safe",
      "leakage_risk": "low_to_medium_staleness_review",
      "is_zoning_feature": true
    },
    {
      "model_name": "logistic_regression",
      "feature_set_name": "zoning_enhanced_history",
      "feature_name": "historical_zoning_code_O-I",
      "coefficient": 2.05478953,
      "absolute_coefficient": 2.05478953,
      "feature_group": "historical_zoning_features",
      "temporal_status": "historical_snapshot_time_safe",
      "leakage_risk": "low_to_medium_staleness_review",
      "is_zoning_feature": true
    },
    {
      "model_name": "logistic_regression",
      "feature_set_name": "zoning_enhanced_history",
      "feature_name": "historical_zoning_jurisdiction_Locust",
      "coefficient": 1.9988818,
      "absolute_coefficient": 1.9988818,
      "feature_group": "historical_zoning_features",
      "temporal_status": "historical_snapshot_time_safe",
      "leakage_risk": "low_to_medium_staleness_review",
      "is_zoning_feature": true
    },
    {
      "model_name": "logistic_regression",
      "feature_set_name": "zoning_enhanced_history",
      "feature_name": "historical_zoning_code_CURM-2",
      "coefficient": -1.89427911,
      "absolute_coefficient": 1.89427911,
      "feature_group": "historical_zoning_features",
      "temporal_status": "historical_snapshot_time_safe",
      "leakage_risk": "low_to_medium_staleness_review",
      "is_zoning_feature": true
    },
    {
      "model_name": "logistic_regression",
      "feature_set_name": "zoning_enhanced_history",
      "feature_name": "historical_zoning_code_PUD",
      "coefficient": 1.87043422,
      "absolute_coefficient": 1.87043422,
      "feature_group": "historical_zoning_features",
      "temporal_status": "historical_snapshot_time_safe",
      "leakage_risk": "low_to_medium_staleness_review",
      "is_zoning_feature": true
    },
    {
      "model_name": "logistic_regression",
      "feature_set_name": "zoning_enhanced_history",
      "feature_name": "latest_zoning_intensity_change_lateral_or_code_only",
      "coefficient": 1.81658228,
      "absolute_coefficient": 1.81658228,
      "feature_group": "historical_zoning_features",
      "temporal_status": "historical_snapshot_time_safe",
      "leakage_risk": "low_to_medium_staleness_review",
      "is_zoning_feature": true
    },
    {
      "model_name": "logistic_regression",
      "feature_set_name": "zoning_enhanced_history",
      "feature_name": "latest_zoning_change_type_zoning_code_changed",
      "coefficient": -1.7955403,
      "absolute_coefficient": 1.7955403,
      "feature_group": "historical_zoning_features",
      "temporal_status": "historical_snapshot_time_safe",
      "leakage_risk": "low_to_medium_staleness_review",
      "is_zoning_feature": true
    }
  ]
}
```

## Top Zoning Coefficient Signals

- `historical_zoning_code_HC`: coefficient `-6.10277615`
- `historical_zoning_code_MX-CC1`: coefficient `-3.39185623`
- `historical_zoning_code_NOT-YET-ZONED`: coefficient `-2.78598248`
- `historical_zoning_jurisdiction_Midland`: coefficient `-2.69187177`
- `latest_zoning_change_type_code_and_category_changed`: coefficient `2.64325468`
- `historical_zoning_code_PID`: coefficient `-2.53684304`
- `historical_zoning_code_TND`: coefficient `2.32791897`
- `zoning_map_change_only_flag`: coefficient `2.26115712`
- `latest_zoning_intensity_change_decreased`: coefficient `-2.14783688`
- `historical_zoning_code_O-I`: coefficient `2.05478953`
- `historical_zoning_jurisdiction_Locust`: coefficient `1.9988818`
- `historical_zoning_code_CURM-2`: coefficient `-1.89427911`

## Future Improvements

- Official rezoning case dates with old/new zoning.
- Future land-use and subdivision approval records.
- Road/accessibility and utility capacity.
- Official school enrollment/capacity.
- Economic and year controls.

## Phase 10F QA Addendum


Phase 10F audited the Phase 10C and Phase 10E metric discrepancy and
standardized top-k metrics with tie-aware cutoff handling.

- Standardized baseline PR-AUC: `0.054665`
- Standardized zoning-enhanced PR-AUC: `0.071174`
- Standardized baseline lift@top 5%: `1.265508`
- Standardized zoning-enhanced lift@top 5%: `1.774988`
- Calibration assessment: `weak_probability_calibration`

This model remains internal only. Exact probabilities should not be shown in
the frontend; any future user-facing output should be reviewed as rank bands or
classes after calibration and governance review.

## Phase 10G Ranking Class Addendum

Phase 10G creates an internal ranking class prototype from the
`phase10e_zoning_enhanced_v1` score order. It does not expose exact
probabilities and does not make the model production-ready.

Internal tables:

- `public.development_prediction_ranking_classes`
- `public.development_prediction_ranking_explanations`

Class rules:

- top 1%: `very_high_development_signal`
- top 5%: `high_development_signal`
- top 15%: `moderate_development_signal`
- remaining: `low_development_signal`

The explanation layer uses lightweight rule-based summaries from available
feature context. It is intended for internal review only and should not be
treated as causal explanation or official parcel scoring.
