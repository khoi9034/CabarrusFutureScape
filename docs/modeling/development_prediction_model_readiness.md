# Development Prediction Model Readiness

Phase 10B prepares CFS for future development prediction modeling by building a parcel-year feature matrix. It intentionally stops before model training.

## Current Readiness

- Phase 10A future labels exist in `public.parcel_development_prediction_labels`.
- Phase 10B features are written to `public.parcel_development_prediction_features`.
- Time-safe prior permit windows are derived using event dates on or before each snapshot year-end.
- The backend readiness endpoint reports matrix coverage, label balance, missingness highlights, and leakage caveats.
- Phase 10C internal baseline experiments can be reviewed through generated
  artifacts and metadata, but remain disabled for production and frontend use.
- Phase 10E adds a separate zoning-enhanced feature matrix and internal model
  comparison. It improves the internal test metrics, but remains disabled for
  production and frontend use.

## Not Active Yet

- No production model is trained.
- No prediction probability is exposed.
- No frontend prediction display exists.
- Internal experiment scores, if written, are stored only in
  `public.development_prediction_model_experiment_scores` with
  `production_ready=false`.
- No school capacity pressure score is calculated from missing official enrollment/capacity data.
- No zoning change history is fabricated.

## Phase 10D-0 Zoning Source Readiness

Current county and municipal zoning services have been registered and profiled
for current-context use. The inventory found zoning code/category fields and
some possible link keys such as `CASE_NUMBE`, but it did not find a complete,
dated old-zoning/new-zoning event series across the registered sources.

Current zoning can support present-day parcel intelligence and explicitly
current-context exploratory models. It is not safe for strict historical
training because the current zoning map must not be assumed to represent past
snapshot years.

Zoning-change feature engineering is not ready until CFS receives or builds a
source with dated rezoning/planning case records, old zoning, new zoning,
jurisdiction, decision/status, and parcel or case geometry.

Phase 10D-1 now provides a historical zoning map-change foundation from
2005-2015 source layers. This makes future zoning-enhanced model comparison
possible, but it still does not equal official rezoning case history. The
generated snapshot/change tables can support candidate features if each feature
uses only source years or change years less than or equal to the model snapshot
year.

The existing Phase 10C baseline remains unchanged. No production model is active
and no prediction probability is exposed.

## Phase 10E Zoning-Enhanced Comparison

Phase 10E creates
`public.parcel_development_prediction_features_zoning_enhanced` by preserving
the Phase 10B parcel-year matrix and appending historical zoning snapshot and
zoning map-change fields. The enhanced matrix has `1,430,221` rows, matching
the base feature matrix, with zero detected source-year or change-year leakage.

The internal comparison retrains the strict time-safe baseline against a
zoning-enhanced feature set for target `new_construction_next_3yr`.

Temporal split:

- train: 2014-2019;
- validation: 2020-2021;
- test: 2022;
- excluded incomplete future-window years: 2023-2026.

Selected test metrics:

- retrained baseline PR-AUC: `0.054665`;
- zoning-enhanced PR-AUC: `0.071174`;
- retrained baseline lift at top 5%: `0.706812`;
- zoning-enhanced lift at top 5%: `1.707733`.

The result suggests historical zoning context is useful, but the model is still
internal only. Detected zoning changes are map-change detections, not official
rezoning approvals. Post-2015 zoning context remains time-safe but stale when
the 2015 historical source is reused as `prior_available_year`.

Generated Phase 10E artifacts:

- `public.parcel_development_prediction_features_zoning_enhanced`
- `outputs/modeling/development_prediction/phase10e_model_comparison_metrics.json`
- `outputs/modeling/development_prediction/phase10e_zoning_enhanced_feature_importance.csv`
- `outputs/modeling/development_prediction/phase10e_zoning_enhanced_predictions_sample.csv`
- `outputs/modeling/development_prediction/phase10e_temporal_split_summary.json`
- `outputs/modeling/development_prediction/phase10e_model_caveats.md`
- `outputs/phase10e_zoning_enhanced_model_comparison_summary.json`
- `docs/modeling/development_prediction_zoning_enhanced_model_card.md`

The backend readiness endpoint reports zoning-enhanced matrix and internal
experiment availability, but `model_active=false`,
`prediction_probability_available=false`, and `production_ready=false` remain
hard requirements.

## Phase 10F Model QA

Phase 10F audits the Phase 10C and Phase 10E comparison before any production
discussion. It standardizes model metrics in
`cfs-data-pipelines/modeling/development_model_metrics.py`.

The audit found that the earlier baseline lift@top 5% discrepancy was not a
target, split, or formula mismatch. Both artifacts used the same 2022 test
population and the same lift definition. The difference came from separate
histogram-gradient-boosting fits and large equal-probability buckets near the
top-5% cutoff, which make naive top-k metrics sensitive to row order.

Going forward CFS uses:

`lift@top_k = precision@top_k / overall_positive_rate`

with tie-aware expected positives at the cutoff score bucket.

Phase 10F standardized test metrics:

- baseline PR-AUC: `0.054665`;
- zoning-enhanced PR-AUC: `0.071174`;
- baseline tie-aware lift at top 5%: `1.265508`;
- zoning-enhanced tie-aware lift at top 5%: `1.774988`.

Calibration review found weak probability calibration. The model may be useful
for internal ranking research, but exact probabilities should not be shown.
Future user-facing output, if any, should use reviewed rank bands/classes after
calibration and governance review.

Generated Phase 10F artifacts:

- `outputs/modeling/development_prediction/phase10f_metric_audit.json`
- `outputs/modeling/development_prediction/phase10f_metric_discrepancy_review.md`
- `outputs/modeling/development_prediction/phase10f_standardized_model_comparison_metrics.json`
- `outputs/modeling/development_prediction/phase10f_standardized_topk_summary.csv`
- `outputs/modeling/development_prediction/phase10f_calibration_bins.csv`
- `outputs/modeling/development_prediction/phase10f_calibration_review.json`
- `outputs/modeling/development_prediction/phase10f_top_ranked_parcel_review.csv`
- `outputs/modeling/development_prediction/phase10f_feature_importance_review.csv`
- `outputs/modeling/development_prediction/phase10f_zoning_feature_importance_summary.json`
- `outputs/modeling/development_prediction/phase10f_year_by_year_performance.csv`
- `outputs/phase10f_development_prediction_model_qa_summary.json`
- `docs/modeling/development_prediction_model_qa_report.md`

## Phase 10G Internal Ranking Classes

Phase 10G creates an internal rank-class prototype from the latest
zoning-enhanced experiment scores. It does not expose exact probabilities and
does not add a parcel-level prediction endpoint.

Internal tables:

- `public.development_prediction_ranking_classes`
- `public.development_prediction_ranking_explanations`

Class distribution for `phase10e_zoning_enhanced_v1`:

- `very_high_development_signal`: `1,101` parcels;
- `high_development_signal`: `4,400` parcels;
- `moderate_development_signal`: `11,002` parcels;
- `low_development_signal`: `93,514` parcels.

The explanation table stores lightweight driver summaries such as historical
zoning context, recent permit history, parcel characteristics, flood context,
and school attendance-zone context. It does not use fake missing factors and is
not a full SHAP/causal explanation layer.

The aggregate-only readiness endpoint is:

- `GET /development/prediction/ranking/summary`

It returns class distribution and guardrail flags only. It does not return exact
probabilities or parcel-level ranking records. `production_ready=false`,
`public_exposure_allowed=false`, and `prediction_probability_available=false`
remain required.

## Phase 12A Transportation and Accessibility Readiness

Phase 12A inventories road, rail, corridor, and context boundary sources for
future accessibility features. It does not create model features, retrain the
internal model, or expose prediction output.

Transportation/accessibility is the next candidate feature group, but it is not
yet included in the model. Current road and rail layers can support
current-context proximity and distance features after geometry QA and field
mapping. They are not automatically time-safe for historical backtesting unless
historical centerlines, dated road construction records, or dated adopted
transportation projects are available.

Future model readiness requires:

- confirmed road name, road class/function, route type, and maintenance fields;
- geometry QA for road and rail distance calculations;
- internal transportation plan records with expected year, status, geometry,
  funding status, and project type;
- explicit leakage controls so no future road/project record is used before it
  was known.

Cabarrus REST services may move during ongoing layer organization. If a URL
fails, CFS should inspect service roots and update the source registry before
marking a source unavailable.

## Phase 12B Transportation Feature Table

Phase 12B ingests the current dedicated Cabarrus County Centerlines layer and
rail reference layers, then creates
`public.parcel_transportation_accessibility_features`.

Feature engineering status:

- parcel rows: `110,017`;
- road clean rows: `14,455`;
- rail clean rows: `64`;
- nearest-road distance: populated;
- road density within 1,000 feet and half mile: populated;
- rail distance and half-mile rail corridor flag: populated;
- major-road distance: intentionally null because source classification is too
  sparse;
- intersection count: intentionally null until network topology QA is done.

These features are useful for a future Phase 12C internal comparison, but they
remain current-context. They are excluded from the strict baseline and should
not be used as time-safe historical features until CFS has historical roads or
dated transportation project records.

## Phase 13A Found Source Readiness

Phase 13A registers and inspects found planning and transportation layers:

- Concord Land Use Plan 2030;
- NCDOT 2026-2035 STIP projects;
- NCDOT AADT traffic count stations;
- Concord Planning Cases.

All four sources are ready for future feature engineering but remain
current-context in this phase. Concord layers are Concord-only and cannot stand
in for countywide future land use or countywide official rezoning records.

Potential model feature groups:

- planning policy context: Concord future land use category and growth-area
  proximity;
- transportation project context: STIP project proximity and project-year
  fields;
- traffic demand context: nearest AADT station and traffic count value;
- planning case activity: Concord planning-case proximity and recent case
  activity, if date/status fields support it.

These features should not be included in the strict baseline until temporal
availability is reviewed. The missing-data tracker remains important because
WSACC utility capacity/service-area GIS, countywide small-area plan/future land
use GIS, local planned road projects, countywide official rezoning records, and
development pipeline/subdivision approvals are still missing.

## Phase 13B STIP/AADT Feature Table

Phase 13B creates
`public.parcel_transportation_plan_traffic_features` from Cabarrus-filtered
NCDOT STIP and AADT sources. The table is ready for a future internal model
comparison, but it is not part of the strict baseline and does not activate any
prediction surface.

Current load:

- parcel rows: `110,017`;
- STIP clean rows: `18`;
- AADT clean rows: `642`;
- parcels within a half mile of a STIP project: `19,322`;
- parcels within one mile of a STIP project: `41,239`.

The generated fields include STIP project proximity/count flags and AADT
traffic-demand context. They remain current-context because STIP represents a
2026-2035 planned/funded project program and the AADT station table is not a
parcel-year historical feature source in this phase.

Aggregate-only endpoint:

- `GET /development/prediction/transportation-plan-traffic/summary`

The endpoint returns feature availability, row counts, proximity summaries,
missingness, quality distributions, and guardrail flags. It does not expose
parcel-level predictions, parcel-level rank classes, or exact probabilities.
`model_active=false` and `prediction_probability_available=false` remain
required.

## Phase 13C Transportation-Enhanced Exploratory Comparison

Phase 13C creates
`public.parcel_development_prediction_features_transportation_enhanced` as a
separate exploratory matrix. It preserves the Phase 10B base matrix and Phase
10E zoning-enhanced matrix.

Feature table status:

- row count: `1,430,221`;
- unique parcels: `110,017`;
- snapshot years: `2014-2026`;
- joins to Phase 12B accessibility and Phase 13B STIP/AADT tables succeeded for
  all parcel-year rows;
- duplicate parcel-year groups: `0`;
- all transportation fields are marked `current_context_only`;
- all transportation fields are marked `time_safe_for_training=false`.

Internal model comparison:

- target: `new_construction_next_3yr`;
- train: `2014-2019`;
- validation: `2020-2021`;
- test: `2022`;
- compared feature sets: `zoning_enhanced_history` and
  `zoning_transportation_current_context`;
- experiment id: `phase13c_transportation_enhanced_v1`.

Selected standardized test metrics:

- zoning-enhanced PR-AUC: `0.071174`;
- transportation-enhanced PR-AUC: `0.087668`;
- zoning-enhanced tie-aware lift at top 5%: `1.774988`;
- transportation-enhanced tie-aware lift at top 5%: `4.108047`;
- zoning-enhanced precision at top 1%: `0.144414`;
- transportation-enhanced precision at top 1%: `0.133515`.

Transportation context improved PR-AUC, precision at top 5%, recall at top 5%,
and lift at top 5% in this exploratory run. It did not improve top-1%
precision. Because the transportation fields are current/planned context, this
result is not a production model claim and should not be mixed with strict
time-safe backtesting.

The readiness endpoint now reports aggregate transportation-enhanced metadata:

- `transportation_enhanced_feature_matrix_available`;
- `transportation_enhanced_row_count`;
- `transportation_enhanced_model_experiment_available`;
- `latest_transportation_experiment_id`;
- `transportation_experiment_current_context_only`.

`model_active=false`, `prediction_probability_available=false`, and
`production_ready=false` remain required. No public parcel prediction endpoint
or frontend prediction UI is added.

Generated Phase 13C artifacts:

- `outputs/development_prediction_transportation_enhanced_feature_profile.json`
- `outputs/development_prediction_transportation_enhanced_missingness.csv`
- `outputs/development_prediction_transportation_enhanced_feature_leakage_review.csv`
- `outputs/modeling/development_prediction/phase13c_transportation_model_comparison_metrics.json`
- `outputs/modeling/development_prediction/phase13c_transportation_feature_importance.csv`
- `outputs/modeling/development_prediction/phase13c_transportation_predictions_sample.csv`
- `outputs/modeling/development_prediction/phase13c_transportation_model_caveats.md`
- `outputs/phase13c_transportation_enhanced_model_comparison_summary.json`

## Recommended Modeling Sequence

1. Freeze feature registry and leakage policy.
2. Train an internal baseline model using only `time_safe` fields.
3. Compare against a current-context exploratory model only for planning research.
4. Validate by snapshot year, parcel geography, jurisdiction, and label rarity.
5. Publish model documentation before exposing any probability to users.

## Required Before Production

- Historical valuation snapshots or removal of current valuation from backtests.
- Historical zoning or explicit current-context-only model framing.
- Official rezoning case dates and old/new zoning fields before any zoning
  feature is treated as official rezoning history.
- Additional model comparison and calibration before adding historical zoning
  features to any production baseline.
- Official school enrollment/capacity data before school capacity pressure is modeled.
- Spatial neighborhood features with documented temporal windows.
- Independent validation of class imbalance and calibration.
