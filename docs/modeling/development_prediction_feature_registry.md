# Development Prediction Feature Registry

Phase 10B creates a parcel-year feature matrix for future development prediction work. It does **not** train a model, publish probabilities, or change the dashboard.

The registry in `config/development_prediction_features.json` is the source of truth for feature group, source table, temporal status, leakage risk, and whether a feature is safe for a baseline or future model.

## Temporal Policy

Features fall into three categories:

- `time_safe`: derived only from records dated on or before December 31 of `snapshot_year`.
- `current_context`: useful for planning review, but not a historical snapshot.
- `not_available`: deliberately null or placeholder until the correct source exists.

The Phase 10A label columns remain targets only:

- `new_construction_next_1yr`
- `new_construction_next_3yr`
- `residential_new_construction_next_3yr`
- `commercial_new_construction_next_3yr`
- `co_issued_next_3yr`

## Feature Groups

- `parcel_static_features`: parcel area, valuation, size and quality fields.
- `zoning_features`: current dominant zoning and assignment confidence.
- `flood_constraint_features`: FEMA NFHL-derived parcel flood constraint attributes.
- `school_assignment_features`: attendance-zone assignment fields and explicit capacity-not-available placeholders.
- `permit_history_features`: prior-window permit counts by date and segment.
- `new_construction_history_features`: prior-window staff-provided new-construction permit history.
- `development_pressure_features`: current-context dashboard activity fields for review only.
- `jurisdiction_features`: current planning/zoning jurisdiction context.
- `future_placeholder_features`: planned features that are intentionally null in Phase 10B.

## Leakage Caveats

Current zoning, current school assignment, current parcel valuation, and current development activity summaries are not historical snapshots. They may be useful for present-day due diligence, but should not be treated as fully time-safe model features until historical source series exist.

The matrix includes a `temporal_leakage_status` field set to `mixed_time_safe_and_current_context_features` to make this caveat visible in downstream review.

## Phase 10D-0 Current Zoning Readiness

Phase 10D-0 registered and inspected current Cabarrus County and municipal
zoning sources without creating zoning-change features. The source inventory is
recorded in `config/current_zoning_sources.json` and the output artifacts:

- `outputs/current_zoning_source_schema_inventory.json`
- `outputs/current_zoning_source_schema_inventory.csv`
- `outputs/zoning_change_readiness_assessment.json`

The registry includes explicit current-context fields:

- `current_zoning_code`
- `current_zoning_jurisdiction`
- `current_zoning_general_category`
- `zoning_case_number_available_flag`

These fields are marked `current_context_only`, `time_safe=false`, and
`include_in_strict_baseline=false`. Case-number-like fields are possible future
join keys only; they are not zoning-change events without dated approval records
and old/new zoning fields.

## Phase 10D-1 Historical Zoning Features

Phase 10D-1 adds a historical zoning foundation from the separate lowercase
`opendata/MapServer` historical service. The raw/clean staging tables are:

- `public.historical_zoning_raw`
- `public.historical_zoning_clean`

The parcel-ready foundation tables are:

- `public.parcel_zoning_snapshot_year`
- `public.parcel_zoning_change_events`

Future-ready zoning features were added to the registry, including source-age,
prior change-window flags, change counts, latest change type, intensity
increase, growth-supportive rezoning signal, confidence, and temporal status.
They are time-safe only when the zoning source year or detected change year is
less than or equal to the snapshot year.

These fields are not included in the current strict baseline and should not be
used to overwrite Phase 10B feature matrices. Phase 10E evaluates them in the
separate
`public.parcel_development_prediction_features_zoning_enhanced` matrix.

Phase 10E confirms that the zoning-enhanced matrix preserves the Phase 10B row
count (`1,430,221`) and has zero detected source-year or change-year leakage.
The internal comparison improved test PR-AUC and top-5% lift, but the model is
still disabled for production and frontend use. Historical zoning map changes
remain map-change detections, not official rezoning approvals.

## Phase 12A Transportation and Accessibility Readiness

Phase 12A registers and inspects transportation/accessibility source candidates
without changing the Phase 10B feature matrix. The source registry is
`config/transportation_accessibility_sources.json`.

Candidate future feature names include:

- `distance_to_nearest_road`
- `distance_to_major_road`
- `distance_to_highway_or_corridor`
- `distance_to_rail_corridor`
- `road_density_near_parcel`
- `intersection_density_near_parcel`
- `corridor_access_score`
- `near_planned_transportation_project`
- `transportation_accessibility_score`

These fields are not active model features yet. Current road and rail layers
are current-context candidates until historical centerlines or dated planned
transportation project records are available. If they are added to future model
experiments, strict baseline inclusion should remain false unless each feature
can prove source records were available on or before the snapshot year.

Cabarrus REST services may move during ongoing layer organization. If a URL
fails, inspect the service roots and update the registry before marking a
source unavailable.

## Phase 12B Transportation Feature Engineering

Phase 12B creates `public.parcel_transportation_accessibility_features` with
one row per parcel. The table currently has `110,017` rows and matches
`public.parcels_enriched`.

Current-context candidate features added to the registry:

- `distance_to_nearest_road_ft`
- `distance_to_nearest_major_road_ft`
- `road_density_1000ft`
- `road_density_half_mile`
- `intersection_count_within_1000ft`
- `distance_to_nearest_rail_ft`
- `rail_corridor_within_half_mile`

All Phase 12B transportation features are marked `time_safe=false`,
`current_context_only=true`, `include_in_future_model=true`, and
`include_in_strict_baseline=false`. They should not be used in strict
historical backtests until historical roads or dated transportation project
records exist.

Major-road distance and intersection count are present as schema fields but
intentionally null in Phase 12B. Major-road classification was too sparse for
countywide use, and intersection extraction requires network topology QA.

## Phase 13A Found Planning and Transportation Sources

Phase 13A registers already-found planning and transportation sources without
ingesting full geometries or changing the feature matrix. The source registry is
`config/found_planning_transportation_sources.json`.

Future candidate fields:

- `concord_future_land_use_category`
- `distance_to_concord_future_land_use_growth_area`
- `near_ncdot_stip_project`
- `distance_to_nearest_stip_project`
- `stip_project_type`
- `stip_project_year_range`
- `nearest_aadt_station_value`
- `distance_to_nearest_aadt_station`
- `near_concord_planning_case`
- `concord_case_count_within_half_mile`
- `concord_recent_case_activity_flag`

Concord source candidates are jurisdiction-limited and must not be treated as
countywide. NCDOT STIP and AADT are transportation context candidates and should
be spatially filtered to Cabarrus County in a future ingestion phase.

No Phase 13A source is marked time-safe for historical model training. These
features should remain excluded from the strict baseline until leakage and
temporal availability are reviewed.

## Phase 13B STIP and AADT Feature Engineering

Phase 13B ingests two Phase 13A-ready sources and creates
`public.parcel_transportation_plan_traffic_features` with one row per parcel.
It does not alter the Phase 10B feature matrix, train a model, expose
predictions, or change the dashboard.

Feature table status:

- parcel feature rows: `110,017`;
- STIP clean rows: `18` Cabarrus-related project records;
- AADT clean rows: `642` Cabarrus stations;
- `current_context_only=true`;
- `time_safe_for_training=false`.

New current-context candidate fields:

- `nearest_stip_project_distance_ft`
- `stip_project_within_half_mile`
- `stip_project_within_1_mile`
- `stip_project_count_within_1_mile`
- `planned_transportation_investment_flag`
- `nearest_aadt_station_distance_ft`
- `nearest_aadt_value`
- `max_aadt_within_1_mile`
- `avg_aadt_within_1_mile`
- `traffic_demand_context_quality`

These fields are marked `current_context_only=true`, `time_safe=false`,
`include_in_future_model=true`, and `include_in_strict_baseline=false`. STIP is
a funded/planned project context layer, not a complete local transportation
plan. AADT station proximity is a traffic-demand proxy and should not be
interpreted as parcel-specific trip generation.

## Phase 13C Transportation-Enhanced Feature Set

Phase 13C creates a separate exploratory matrix:

- `public.parcel_development_prediction_features_transportation_enhanced`

This matrix appends Phase 12B road/rail accessibility features and Phase 13B
STIP/AADT features to the Phase 10E zoning-enhanced parcel-year matrix. It has
`1,430,221` rows, matches the zoning-enhanced matrix, and has zero duplicate
parcel-year rows.

The Phase 13C feature set is named
`zoning_transportation_current_context`. It is internal exploratory research
only because the transportation inputs are current/planned context.

Guardrails:

- `transportation_current_context_only_flag=true` for every row;
- `transportation_time_safe_for_training_flag=false` for every row;
- `include_in_strict_baseline=false`;
- no public prediction endpoint;
- no frontend prediction display;
- `production_ready=false`.

Future time-safe transportation modeling requires historical road network
snapshots, dated STIP or local project records, construction/completion dates,
historical AADT by year, and clear source-availability rules for each
`snapshot_year`.

## Phase 14A Missing Feature Groups

Phase 14A does not add active features. It registers the next high-value
feature groups that should be requested before public-facing prediction is
considered.

Missing feature groups and future feature examples:

- utilities and infrastructure readiness:
  `water_service_area_flag`, `sewer_service_area_flag`,
  `utility_capacity_status`, `wastewater_basin`,
  `capacity_limited_area_flag`, `planned_utility_extension_within_1_mile`,
  `utility_project_year`, `service_readiness_score`;
- future land use and small-area plans:
  `future_land_use_category`, `growth_area_flag`, `activity_center_flag`,
  `employment_area_flag`, `mixed_use_node_flag`, `preservation_area_flag`,
  `plan_policy_alignment`;
- local transportation projects:
  `local_project_within_half_mile`, `local_project_within_1_mile`,
  `project_type`, `project_status`, `funded_project_flag`, `expected_year`,
  `future_access_improvement_flag`;
- official rezoning case records:
  `official_rezoning_prior_1yr`, `official_rezoning_prior_3yr`,
  `official_rezoning_prior_5yr`, `approval_date`, `old_zoning`,
  `new_zoning`, `decision_status`, `years_since_official_rezoning`;
- development pipeline and subdivision approvals:
  `approved_subdivision_flag`, `in_review_development_flag`,
  `approved_units_nearby`, `multifamily_pipeline_flag`, `project_status`,
  `approval_date`, `expected_buildout_year`;
- suitability and land supply:
  `vacant_land_flag`, `underbuilt_flag`, `developable_land_score`,
  `septic_suitability`, `constraint_weighted_land_supply`,
  `residential_suitability_score`, `commercial_suitability_score`,
  `industrial_suitability_score`;
- parks, greenways, and bike-ped amenities:
  `planned_greenway_proximity`, `park_access_score`,
  `trail_corridor_proximity`, `bike_ped_access_context`,
  `open_space_priority_flag`.

Guardrails:

- these features are not in the current feature matrix;
- no fake values should be created;
- current-context sources must not be treated as historical sources;
- each received source must pass schema, geometry, sensitivity, and temporal
  safety review before ingestion;
- no public prediction endpoint or frontend prediction display should be added
  from these planned feature groups.

## Phase 16A Planning Pipeline Utility Features

Phase 16A creates a current-context planning and infrastructure-readiness
foundation from REST-ready sources that were discovered after the Phase 14A
missing-data package:

- Concord Central Area Plan layers:
  boundary, primary activity areas, service nodes, special corridors, special
  use areas, and future land use;
- Cabarrus Accela Plan Reviews;
- RevalMap WSACC utility proxy layers:
  manholes, sewer lines, and districts;
- Tax Parcels Full, loaded only as a separate enrichment/gap-check source.

The combined parcel table is:

- `public.parcel_planning_pipeline_utility_features`

Feature examples:

- `inside_central_area_plan`
- `central_area_future_land_use`
- `inside_primary_activity_area`
- `inside_special_corridor`
- `active_plan_review_count`
- `early_pipeline_signal_flag`
- `distance_to_nearest_wsacc_manhole_ft`
- `distance_to_nearest_wsacc_sewer_line_ft`
- `inside_wsacc_district_proxy`
- `true_utility_capacity_available`
- `tax_parcel_full_match_found`
- `tax_full_total_value`

Guardrails:

- Concord Central Area Plan layers are Concord/Central Area only, not a
  countywide future land-use layer.
- Accela plan reviews are early pipeline signals, not development approvals or
  completed development.
- RevalMap WSACC layers are utility proximity/service-context proxies only; they
  do not report capacity, allocation, or remaining seats/flow.
- Tax Parcels Full is kept separate and does not overwrite
  `public.parcels_enriched`.
- Every Phase 16A feature is marked `current_context_only=true`,
  `time_safe=false`, `include_in_future_model=true`, and
  `include_in_strict_baseline=false`.

Phase 16A prepares future exploratory model comparison only. It does not train a
model, expose prediction probabilities, expose ranking classes, or mark any
model production-ready.

## Phase 16B Planning Pipeline Utility Enhanced Feature Matrix

Phase 16B creates a separate exploratory model-comparison matrix:

- `public.parcel_development_prediction_features_planning_pipeline_utility_enhanced`

The table preserves the Phase 13C transportation-enhanced parcel-year
cardinality (`1,430,221` rows) and adds planning, development-pipeline,
utility-proxy, and tax-enrichment fields from Phase 16A.

Additional model-comparison fields include:

- planning context:
  `future_land_use_category`, `future_land_use_growth_alignment`,
  `inside_primary_activity_area`, `inside_service_node`,
  `inside_special_corridor`, `distance_to_service_node_ft`;
- Accela pipeline context:
  `active_plan_review_on_parcel`, `total_plan_review_count`,
  `recent_plan_review_count_12mo`, `latest_plan_review_status`,
  `latest_plan_review_type`, `max_days_open`;
- utility proxy context:
  `distance_to_wsacc_sewer_line_ft`,
  `distance_to_nearest_manhole_ft`, `utility_access_proxy_score`;
- tax enrichment:
  `building_value`, `land_to_building_value_ratio`,
  `tax_enriched_land_value`, `tax_enriched_total_value`;
- guardrails:
  `planning_pipeline_utility_current_context_only_flag`,
  `concord_only_feature_flag`, `utility_proxy_only_flag`,
  `planning_pipeline_utility_time_safe_for_training_flag`.

Feature policy:

- all Phase 16B fields are `current_context_only=true`;
- all Phase 16B fields are excluded from the strict baseline;
- Concord Central Area Plan fields must not be treated as countywide future
  land-use coverage;
- WSACC utility proxy fields must not be treated as true sewer capacity or
  allocation;
- Tax Parcels Full enrichment must not be treated as historical valuation
  snapshots.

## Phase 16C Ablation Governance

Phase 16C tested the Phase 16B feature families separately against the Phase 13C
transportation-enhanced base.

Recommendation by feature group:

- Tax parcel value enrichment: keep as an internal follow-up candidate because
  the tax/value-only ablation improved PR-AUC and lift@top 5%. It still needs
  historical assessment snapshots before any production use.
- Accela plan review activity: exclude from the current best model. It improved
  PR-AUC but sharply reduced lift@top 5%; it needs temporal filtering, status
  semantics, and jurisdiction QA.
- Central Area Plan / future land use: exclude from the current best model. It
  remains Concord-only and reduced lift@top 5%; it needs countywide coverage and
  adoption/effective dates.
- Utility proxy: exclude from the current best model. It remains a proximity
  proxy, not true utility capacity, and reduced lift@top 5%.
- Metadata/current-context flags: keep as governance metadata only, not model
  drivers.

The full Phase 16B feature bundle is not recommended for the current internal
ranking model.

## Phase 16D Current Best Feature Governance

Phase 16D adds a registry-level current-best decision:

- current best internal feature set: `transportation_plus_tax_value_only`;
- experiment id: `phase16c_planning_pipeline_utility_ablation_v1`;
- model status: internal research only;
- production ready: `false`;
- prediction probability available: `false`;
- public exposure allowed: `false`.

The feature governance matrix is stored at:

- `outputs/modeling/development_prediction/feature_group_governance_matrix.csv`

Current-best feature groups:

- permits/new construction labels;
- parcel base and value context;
- historical zoning;
- transportation accessibility;
- STIP/AADT;
- tax/value enrichment.

Feature groups excluded from the current best model:

- Accela plan reviews;
- Central Area Plan / Concord-only future land use context;
- utility proxy;
- metadata/current-context flags.

Excluded groups may remain useful for dashboards, QA, data-readiness planning,
or future model comparison, but they should not be treated as production model
drivers without better temporal coverage, countywide scope, and authoritative
source data.

## Phase 23A Model Lab Display Policy

The Model Lab UI can reference feature registry decisions, but only as
aggregate model-governance information.

Allowed Model Lab display:

- current best internal variant: Zoning + Transportation + Tax/Value;
- best ablation feature set: `transportation_plus_tax_value_only`;
- included groups: historical zoning, transportation accessibility / STIP /
  AADT, and tax/value enrichment;
- excluded groups: Accela plan reviews, Central Area Plan, utility proxy, and
  current-context metadata flags;
- aggregate metrics from Phase 16C/16D outputs;
- caveats and missing official data.

Not allowed:

- exact parcel-level probabilities;
- raw parcel model scores;
- official parcel ranking classes;
- public prediction endpoint responses;
- production-ready model wording.
