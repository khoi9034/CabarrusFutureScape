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

## Phase 14A Missing High-Value Planning Data

Phase 14A pauses model expansion and creates a missing-data acquisition package
for the strongest planning datasets not yet available in CFS. It does not
modify PostGIS schemas, train a model, change existing feature matrices, expose
predictions, or alter frontend/backend workflows.

Current included feature groups:

- parcel characteristics and current parcel intelligence;
- current and historical zoning map snapshots;
- zoning map-change detections;
- permit history and permit segmentation;
- staff-provided new construction permit labels;
- FEMA flood constraints;
- school attendance-zone assignment and presentation-derived utilization seed;
- road/rail accessibility;
- NCDOT STIP and AADT current/planned transportation context.

Strongest missing feature groups:

- WSACC utility capacity and utility project GIS;
- countywide small-area plan and future land use GIS;
- local planned road projects and future transportation network;
- official countywide/municipal rezoning case records;
- development pipeline and subdivision approvals;
- plan-based suitability and land supply;
- parks, greenways, and bike-ped future amenity GIS.

Why better planning data is needed before public prediction:

- current utility capacity is not represented;
- future land use is incomplete outside Concord;
- local transportation projects are missing beyond NCDOT STIP;
- official rezoning approval records are missing, so current zoning-change
  signals remain map-change detections;
- development pipeline records are missing before the permit stage;
- suitability and land supply layers are not yet available;
- model calibration remains weak and exact probabilities should not be shown.

Recommended next ingestion sequence:

1. WSACC / utilities.
2. Future land use / small-area plans.
3. Local transportation projects.
4. Official rezoning case records.
5. Development pipeline / subdivision approvals.
6. Suitability / land supply.
7. Parks / greenways / bike-ped amenities.

Phase 14A docs:

- `docs/data_requests/cfs_missing_data_tracker.md`
- `docs/data_requests/cfs_new_source_intake_checklist.md`
- `docs/data_requests/cfs_next_data_request_action_plan.md`
- `docs/modeling/missing_feature_groups_roadmap.md`

## Phase 16A Planning Pipeline Utility Readiness

Phase 16A starts converting a subset of newly found planning and infrastructure
sources into parcel-level readiness features without training a new model.

Created source registry:

- `config/planning_pipeline_utility_sources.json`

Created source inventory:

- `outputs/planning_pipeline_utility_source_schema_inventory.json`
- `outputs/planning_pipeline_utility_source_schema_inventory.csv`

Created feature tables:

- `public.parcel_central_area_plan_features`
- `public.parcel_accela_plan_review_features`
- `public.parcel_utility_proxy_features`
- `public.parcel_tax_value_enrichment_features`
- `public.parcel_planning_pipeline_utility_features`

Model-readiness interpretation:

- Concord Central Area Plan features are current-context and Concord-only.
- Accela plan reviews are early pipeline signals only, not approvals.
- RevalMap WSACC layers are utility proximity proxies, not true capacity data.
- Tax Parcels Full is separate enrichment and does not overwrite the base parcel
  table.
- Every Phase 16A feature is excluded from strict baseline training until
  source availability dates and historical snapshots exist.

Current required model flags remain unchanged:

- `model_active=false`
- `prediction_probability_available=false`
- `production_ready=false`

Phase 16A makes the project more ready for a future Phase 16B exploratory model
comparison, but it is not itself a model comparison and should not be presented
as forecast output.

## Phase 16B Planning Pipeline Utility Comparison

Phase 16B builds:

- `public.parcel_development_prediction_features_planning_pipeline_utility_enhanced`
- internal experiment `phase16b_planning_pipeline_utility_enhanced_v1`

The matrix preserves the Phase 13C row count of `1,430,221` parcel-year rows and
adds current-context planning intent, Accela pipeline signal, WSACC utility
proxy, and Tax Parcels Full enrichment fields.

Standardized 2022 test comparison:

- transportation-enhanced PR-AUC: `0.083925`
- planning/pipeline/utility-enhanced PR-AUC: `0.073322`
- transportation-enhanced lift@top 5%: `3.553034`
- planning/pipeline/utility-enhanced lift@top 5%: `0.588219`
- transportation-enhanced precision@top 5%: `0.136157`
- planning/pipeline/utility-enhanced precision@top 5%: `0.022541`

Interpretation:

- Phase 16B improved ROC-AUC but degraded PR-AUC and high-priority top-k
  ranking metrics.
- The added fields are not ready to improve the internal ranking layer without
  more source governance and feature cleanup.
- Current model safety flags remain unchanged:
  `model_active=false`, `prediction_probability_available=false`, and
  `production_ready=false`.

Important caveats:

- Central Area Plan fields are Concord-only and current-context.
- Accela plan reviews are early pipeline signals, not approvals.
- WSACC fields are utility proximity proxies only, not capacity/allocation.
- Tax enrichment is current-context and not a historical assessment series.
- No parcel-level probabilities, ranking classes, or public prediction endpoint
  are exposed from this experiment.

## Phase 16C Feature Ablation Governance

Phase 16C audited why the full Phase 16B bundle weakened the ranking objective.
It tested:

1. transportation-enhanced base;
2. transportation plus tax/value enrichment only;
3. transportation plus Accela plan review only;
4. transportation plus Central Area Plan only;
5. transportation plus utility proxy only;
6. transportation plus all Phase 16B fields.

Results on the 2022 test split:

- base PR-AUC: `0.082744`, lift@top 5%: `3.889837`;
- tax/value-only PR-AUC: `0.137928`, lift@top 5%: `4.051123`;
- Accela-only PR-AUC: `0.092404`, lift@top 5%: `1.840557`;
- Central Area-only PR-AUC: `0.090397`, lift@top 5%: `3.576753`;
- utility-only PR-AUC: `0.089515`, lift@top 5%: `3.590984`;
- full Phase 16B PR-AUC: `0.071244`, lift@top 5%: `0.711556`.

Governance decision:

- current best internal ablation variant:
  `transportation_plus_tax_value_only`;
- experiment id: `phase16c_planning_pipeline_utility_ablation_v1`;
- full Phase 16B feature set recommended: `false`;
- model remains inactive and internal-only.

The tax/value-only improvement is not a production decision. It needs
historical value snapshots, calibration review, and governance review before any
public or operational use.

## Phase 16D Current Best Internal Model Registry

Phase 16D freezes the current governance decision into an explicit registry and
dashboard-facing aggregate status. The current best internal model variant is:

- model name: `Zoning + Transportation + Tax/Value Internal Ranking Variant`;
- experiment id: `phase16c_planning_pipeline_utility_ablation_v1`;
- feature set: `transportation_plus_tax_value_only`;
- target: `new_construction_next_3yr`;
- status: internal research only.

This variant is selected because the Phase 16C tax/value-only ablation produced
the strongest internal ranking performance after feature-group review:

- transportation base PR-AUC: `0.082744`;
- transportation plus tax/value PR-AUC: `0.137928`;
- transportation base lift@top 5%: `3.889837`;
- transportation plus tax/value lift@top 5%: `4.051123`.

The full Phase 16B feature set is not recommended because it reduced PR-AUC and
collapsed lift@top 5% relative to the transportation base. Accela plan review,
Central Area Plan, utility proxy, and metadata/current-context flags remain
planning-context or QA features only until better source governance is available.

Current required model flags remain:

- `model_active=false`;
- `prediction_probability_available=false`;
- `production_ready=false`;
- `public_exposure_allowed=false`.

No parcel-level probabilities, parcel-level ranking classes, public prediction
endpoint, or frontend prediction surface should be added from Phase 16D.

## Phase 23A Integrated Model Lab

Phase 23A makes the existing development model research easier to explain in
the UI. It adds an aggregate-only `Model Lab` surface in Overview and a
matching Development Model Lab explanation in Methodology.

Displayed aggregate research facts:

- historical outcome: new construction permits;
- target: new construction permit within next 3 years;
- feature unit: parcel-year;
- feature rows: `1,430,221`;
- current best internal variant: Zoning + Transportation + Tax/Value;
- best ablation feature set: `transportation_plus_tax_value_only`;
- Phase 16C current-best PR-AUC: `0.137928`;
- Phase 16C current-best lift@top 5%: `4.051123`.

Feature groups shown as helpful:

- historical zoning;
- transportation accessibility / STIP / AADT;
- tax/value enrichment.

Feature groups shown as excluded for now:

- Accela plan reviews;
- Central Area Plan layers;
- utility proxy;
- current-context metadata flags.

Phase 23A does not train a model, add a public prediction endpoint, expose
exact parcel probabilities, expose parcel-level ranking classes, or mark the
model production-ready.

## Phase 23C Development Research Signal Clarity

Phase 23C refines the Model Lab map preview into one safe overlay:
`Development Research Signal`. The overlay is off by default and uses relative
signal bands only:

- higher research signal;
- moderate research signal;
- lower research signal;
- insufficient data.

These bands are relative internal ranking context, not exact parcel
probabilities. Marker explanations summarize why a parcel or area was
highlighted using safe contextual drivers: historical zoning, transportation
accessibility, tax/value enrichment, and new construction permit-label research.

Phase 23C also carries the selected model research context into Planning
Snapshots and Executive Summaries with the required caveat that it is internal
research only, not an official parcel score.

## Phase 23D Model Lab Progressive Map Display

Phase 23D keeps the same saved research outputs and safety rules, but changes
how Model Lab presents the research map:

- countywide zoom uses an aggregated research surface rather than a dense point
  cloud;
- medium zoom uses clustered research markers;
- close parcel-scale zoom uses individual safe research markers;
- the right Intelligence panel shows concise overlay status, current display
  mode, key aggregate metrics, and a collapsible "How these stats are
  calculated" explanation;
- Planning Snapshots and Executive Summaries record the display mode and whether
  the selected context was a heatmap cell, cluster, or parcel-scale marker.

This remains a relative research-signal preview only. It does not expose exact
probabilities, raw model scores, or official parcel prediction classes, and it
does not change `model_active=false`, `prediction_probability_available=false`,
`production_ready=false`, or `public_exposure_allowed=false`.

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
