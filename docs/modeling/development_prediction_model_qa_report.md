# Development Prediction Model QA Report

Phase 10F audits Phase 10C and Phase 10E development prediction experiments.
It does not activate a model, expose probabilities, or add a frontend/public
prediction endpoint.

## Metric Audit

Lift is standardized as:

`lift@top_k = precision@top_k / overall_positive_rate`

Phase 10F uses tie-aware top-k metrics so equal scores at the cutoff do not
depend on row order.

The Phase 10C versus Phase 10E baseline lift discrepancy is attributed to
separate histogram-gradient-boosting fits and tied ranking buckets, not a
different target, test year, or lift formula.

## Standardized Test Metrics

- Baseline PR-AUC: `0.054665`
- Zoning-enhanced PR-AUC: `0.071174`
- Baseline lift@top 5%: `1.265508`
- Zoning-enhanced lift@top 5%: `1.774988`

## Calibration

Calibration assessment:
`weak_probability_calibration`

Recommendation: keep model outputs as internal rank/risk scores only. Do not
show exact probabilities.

## Explainability

Top zoning signals are listed in
`outputs/modeling/development_prediction/phase10f_feature_importance_review.csv`
and summarized in
`outputs/modeling/development_prediction/phase10f_zoning_feature_importance_summary.json`.

Zoning features remain historical map-context signals. They are not official
rezoning case approvals.

## Phase 10G Ranking Class Prototype

Phase 10G converts the internal Phase 10E experimental score order into rank
classes:

- `very_high_development_signal`: top 1%;
- `high_development_signal`: top 5% excluding top 1%;
- `moderate_development_signal`: top 15% excluding top 5%;
- `low_development_signal`: remaining parcels.

These are percentile/rank classes only. Exact probabilities are not stored in
the ranking class table, are not exposed through the API, and are not shown in
the frontend.

Internal tables:

- `public.development_prediction_ranking_classes`
- `public.development_prediction_ranking_explanations`

The explanation table uses lightweight rule-based summaries from existing
feature values and Phase 10F feature-importance context. It is not SHAP and
does not claim causal drivers.

## Production Readiness

- `model_active=false`
- `prediction_probability_available=false`
- `production_ready=false`
- no frontend prediction exposure
- no public prediction endpoint
- ranking classes remain internal and `public_exposure_allowed=false`

## Phase 13C Transportation Experiment QA Note

Phase 13C adds an exploratory comparison using current-context transportation
features from road/rail accessibility, STIP project proximity, and AADT traffic
count context. The experiment id is:

- `phase13c_transportation_enhanced_v1`

The transportation-enhanced feature matrix has `1,430,221` parcel-year rows,
matching the Phase 10E zoning-enhanced matrix, and has zero duplicate
parcel-year groups.

Standardized 2022 test comparison:

- zoning-enhanced PR-AUC: `0.071174`
- transportation-enhanced PR-AUC: `0.087668`
- zoning-enhanced lift@top 5%: `1.774988`
- transportation-enhanced lift@top 5%: `4.108047`
- zoning-enhanced precision@top 1%: `0.144414`
- transportation-enhanced precision@top 1%: `0.133515`

Interpretation: transportation context improved PR-AUC and the top-5% ranking
band, but did not improve the top-1% band. This is a useful internal research
signal, not a production readiness decision.

Every transportation feature is flagged `current_context_only=true` and
`time_safe_for_training=false`. The comparison should not be represented as a
strict historical backtest until CFS has dated transportation project records,
historical road network context, historical AADT by year, and documented
availability rules for each snapshot year.

No parcel-level transportation-enhanced predictions, exact probabilities, or
ranking classes are exposed in the frontend or through public parcel-level
endpoints.

## Phase 16B Planning Pipeline Utility Experiment QA Note

Phase 16B adds an exploratory comparison using current-context planning,
pipeline, utility-proxy, and tax-enrichment fields. The experiment id is:

- `phase16b_planning_pipeline_utility_enhanced_v1`

The planning/pipeline/utility-enhanced feature matrix has `1,430,221`
parcel-year rows, matching the Phase 13C transportation-enhanced matrix, and
has zero duplicate parcel-year groups.

Standardized 2022 test comparison:

- transportation-enhanced PR-AUC: `0.083925`
- planning/pipeline/utility-enhanced PR-AUC: `0.073322`
- transportation-enhanced lift@top 5%: `3.553034`
- planning/pipeline/utility-enhanced lift@top 5%: `0.588219`
- transportation-enhanced precision@top 1%: `0.108084`
- planning/pipeline/utility-enhanced precision@top 1%: `0.025431`

Interpretation: the Phase 16B features improved ROC-AUC but materially
weakened PR-AUC, precision@top-k, and lift@top-k. Because CFS prioritizes
rare-event ranking quality over broad discrimination alone, this experiment
does not improve the internal development ranking layer.

Guardrails:

- Central Area Plan features are Concord-only and current-context, not
  countywide future land use.
- Accela plan reviews are early pipeline signals, not approvals or completed
  development.
- WSACC layers are utility proximity proxies only and do not report true
  capacity, allocation, or remaining service.
- Tax Parcels Full values are current enrichment context and not historical
  valuation snapshots.
- No parcel-level probabilities, ranking classes, or frontend prediction
  surfaces are exposed.

## Phase 16C Ablation Review

Phase 16C tested the Phase 16B groups separately to identify the noisy pieces.
The tax/value-only ablation was the only variant that improved both PR-AUC and
lift@top 5% over the transportation-enhanced base:

- base PR-AUC: `0.082744`
- tax/value-only PR-AUC: `0.137928`
- base lift@top 5%: `3.889837`
- tax/value-only lift@top 5%: `4.051123`

Other groups did not pass the ranking-governance test:

- Accela plan review improved PR-AUC but reduced lift@top 5% to `1.840557`.
- Central Area Plan improved PR-AUC but reduced lift@top 5% to `3.576753`.
- Utility proxy improved PR-AUC but reduced lift@top 5% to `3.590984`.
- Full Phase 16B reduced PR-AUC and collapsed lift@top 5% to `0.711556`.

Recommendation:

- keep tax/value enrichment as an internal follow-up candidate only;
- exclude the full Phase 16B bundle from the current best internal model;
- keep Accela, Central Area Plan, and utility proxy in dashboards or source QA
  until better temporal/countywide/capacity data exists;
- keep metadata flags as governance metadata, not model drivers.

No production model is activated. No frontend prediction surface or public
parcel-level endpoint is added.

## Phase 16D Current Best Internal Model Governance

Phase 16D records the Phase 16C recommendation as the current best internal
research variant:

- current best variant: `transportation_plus_tax_value_only`;
- readable label: Zoning + Transportation + Tax/Value;
- experiment id: `phase16c_planning_pipeline_utility_ablation_v1`;
- model status: internal research only;
- production ready: no;
- public exposure allowed: no;
- prediction probabilities available: no.

Included in the current best internal research framing:

- new construction permit labels and permit history;
- historical zoning and zoning map-change context;
- transportation accessibility, STIP, and AADT context;
- tax/value enrichment.

Excluded from the current best internal variant:

- Accela plan reviews, because temporal/status semantics need QA and top-k
  ranking degraded;
- Central Area Plan features, because they are Concord-only/current-context and
  not countywide future land use;
- utility proxy fields, because they are service-proximity context only and not
  true capacity/allocation;
- metadata/current-context flags, because they are governance notes rather than
  model drivers.

The Methodology workspace should show only aggregate governance status. It must
not show parcel-level rankings, parcel-level model outputs, or public model
claims.

## Next Step

Add official rezoning case dates, future land use, time-safe transportation
project history, historical AADT, accessibility controls, and calibrated
temporal validation before any user-facing risk class.
