# CFS Production Serving Table Dependency Map

Generated: 2026-06-22

This map supports the production-serving database subset restore. It intentionally excludes raw/source-heavy, staging, diagnostics, and model-training tables from the production database.

## Target State

- Local/source database remains the full raw and research warehouse.
- Production database receives only clean/summary/API-required serving objects.
- Model research endpoints must not expose exact probabilities or raw scores; heavy feature/ranking tables are excluded for this first production subset.
- Missing production-only data should return safe unavailable/data-needed states rather than fabricated values.

## Subset Estimate

- Selected serving tables: 28
- Selected supporting views: 1
- Selected rows: 1,262,422
- Selected estimated table size: 1.05 GiB
- Excluded tables: 67
- Excluded rows: 11,954,424
- Excluded estimated table size: 7.95 GiB

## Endpoint Dependencies

| Endpoint path | Tables used | Required for production UI | Current query source | Can use clean/summary table | Include/exclude decision | Notes |
|---|---|---:|---|---|---|---|
| /parcels/statistics | parcels_enriched, parcel_zoning_overlay_v2, parcel_zoning_intelligence_qa | yes | SQLAlchemy joins in ParcelRepository._base_from | yes | include | Parcel quality, zoning, and safe-dashboard counts. |
| /parcels/search | parcels_enriched, parcel_zoning_overlay_v2, parcel_zoning_intelligence_qa | yes | SQLAlchemy joins in ParcelRepository | yes | include | Global parcel search depends on these tables. |
| /parcels/{official_parcel_id} | parcels_enriched, parcel_zoning_overlay_v2, parcel_zoning_intelligence_qa | yes | SQLAlchemy joins plus PostGIS geometry in parcels_enriched | yes | include | Needed for parcel focus/highlight and context panels. |
| /parcels/zoning-summary | parcels_enriched, parcel_zoning_overlay_v2, parcel_zoning_intelligence_qa | yes | ParcelRepository zoning summary queries | yes | include | Zoning dashboard summary. |
| /parcels/governance-warnings | parcels_enriched, parcel_zoning_overlay_v2, parcel_zoning_intelligence_qa | yes | ParcelRepository governance warning queries | yes | include | Supports governance warning panels. |
| /development/statistics | real_property_permit_parcel_relationship, development_activity_parcel_summary | yes | DevelopmentRepository get_statistics | yes | include | Observed activity counts for dashboard and Indicator Center. |
| /development/trends | real_property_permit_parcel_relationship | yes | DevelopmentRepository get_trends | yes | include | Permit trend charts. |
| /development/hotspots | development_activity_parcel_summary, real_property_permit_parcel_relationship, parcels_enriched | yes | DevelopmentRepository get_hotspots | yes | include | Explore Countywide Development Hotspots. |
| /development/permit-segments/statistics | permit_intelligence_segments, parcel_permit_segment_summary | yes | DevelopmentRepository permit segment queries | yes | include | Layer selector and Indicator Center permit type chart. |
| /development/new-construction/statistics | new_construction_permits_clean, new_construction_permit_parcel_relationship | yes | DevelopmentRepository new construction summary queries | yes | include | New construction monitoring. |
| /development/new-construction/parcel/{official_parcel_id} | parcel_new_construction_summary | yes | DevelopmentRepository parcel new-construction query | yes | include | Selected parcel context. |
| /development/new-construction/labels/summary | parcel_development_prediction_labels | no | Research/training label summary | no | exclude | Not needed by production UI; heavy label table excluded. |
| /development/prediction/features/summary | parcel_development_prediction_features*, development_prediction_model_experiment_scores | yes, degraded allowed | to_regclass-guarded research summary | fallback | exclude | Returns safe unavailable/model-governance state when feature matrices are absent. |
| /development/prediction/ranking/summary | development_prediction_ranking_classes, development_prediction_ranking_explanations | yes, degraded allowed | to_regclass-guarded ranking summary | fallback | exclude | Returns safe unavailable state; avoids restoring parcel-level research bands. |
| /development/model-research/preview | development_prediction_ranking_classes, development_prediction_ranking_explanations, parcels_enriched | yes, degraded allowed | to_regclass-guarded preview | fallback | exclude ranking tables | Model Lab loads with preview unavailable instead of restoring ranking artifacts. |
| /development/prediction/transportation-accessibility/summary | parcel_transportation_accessibility_features, transportation_centerlines_clean, transportation_rail_clean | yes | to_regclass-guarded summary | yes | include | Transportation context is production UI context, not prediction output. |
| /development/prediction/transportation-plan-traffic/summary | parcel_transportation_plan_traffic_features, transportation_stip_projects_clean, transportation_aadt_stations_clean | yes | to_regclass-guarded summary | yes | include | STIP/AADT context for reports/panels. |
| /constraints/flood/statistics | parcel_flood_constraint_overlay | yes | ConstraintsRepository get_flood_statistics | yes | include | Floodplain Review metrics. |
| /constraints/flood/{official_parcel_id} | parcel_flood_constraint_overlay | yes | ConstraintsRepository parcel lookup | yes | include | Selected parcel flood context. |
| /constraints/flood/high-review | parcel_flood_constraint_overlay | yes | ConstraintsRepository high-review filter | yes | include | Map review markers. |
| /constraints/flood/zones | fema_nfhl_flood_zones_clean | yes | ConstraintsRepository flood-zone geometry query | yes | include | Floodplain layer geometry; clean NFHL table only. |
| /constraints/schools/statistics | parcel_school_summary, parcel_school_assignment, school_reference, school_zones, school_capacity | yes | SchoolConstraintsRepository get_statistics | yes | include | School assignment and capacity-data-needed metrics. |
| /constraints/schools/{official_parcel_id} | parcels_enriched, parcel_school_summary, parcel_school_assignment | yes | SchoolConstraintsRepository parcel detail query | yes | include | Selected parcel school context. |
| /constraints/schools/utilization-seed | school_utilization_seed_current view, school_presentation_utilization_seed | yes | SchoolConstraintsRepository utilization seed view query | yes | include | Preliminary school capacity watch. |
| /constraints/schools/utilization-zones | school_zones, school_presentation_utilization_seed | yes | SchoolConstraintsRepository utilization zone query | yes | include | School capacity layer/monitoring context. |
| /constraints/schools/lea-pupil-context | school_lea_pupil_context | yes | SchoolConstraintsRepository LEA context query | yes | include | LEA pupil context panel. |
| /indicators/summary | development, flood, school serving tables | yes | Indicator router composes Development/Flood/School services | yes | include | Indicator Center critical signals and charts. |
| /indicators/school-utilization-detail | school_utilization_seed_current view, school_presentation_utilization_seed | yes | Indicator router via SchoolConstraintsService | yes | include | School Capacity Watch drilldown. |

## Largest Included Tables

| Table | Rows | Estimated size | Reason |
|---|---:|---:|---|
| `fema_nfhl_flood_zones_clean` | 7,712 | 190.4 MiB | Used directly by production API/frontend serving endpoints. |
| `parcels_enriched` | 110,017 | 113.4 MiB | Used directly by production API/frontend serving endpoints. |
| `parcel_school_summary` | 110,017 | 109.9 MiB | Used directly by production API/frontend serving endpoints. |
| `parcel_school_assignment` | 110,017 | 106.4 MiB | Used directly by production API/frontend serving endpoints. |
| `parcel_zoning_overlay_v2` | 110,017 | 103.0 MiB | Used directly by production API/frontend serving endpoints. |
| `parcel_zoning_intelligence_qa` | 110,017 | 92.5 MiB | Used directly by production API/frontend serving endpoints. |
| `parcel_flood_constraint_overlay` | 110,017 | 78.0 MiB | Used directly by production API/frontend serving endpoints. |
| `parcel_transportation_accessibility_features` | 110,017 | 70.7 MiB | Used directly by production API/frontend serving endpoints. |
| `development_activity_parcel_summary` | 110,017 | 49.5 MiB | Used directly by production API/frontend serving endpoints. |
| `real_property_permit_parcel_relationship` | 67,277 | 46.8 MiB | Used directly by production API/frontend serving endpoints. |

## Largest Excluded Tables

| Table | Rows | Estimated size | Classification | Reason |
|---|---:|---:|---|---|
| `parcel_development_prediction_features_planning_pipeline_utilit` | 1,430,221 | 1.66 GiB | Training / Research Table | Model-training or parcel-level research artifact; production returns safe governance/unavailable states instead. |
| `parcel_development_prediction_features_transportation_enhanced` | 1,430,221 | 1.38 GiB | Training / Research Table | Model-training or parcel-level research artifact; production returns safe governance/unavailable states instead. |
| `parcel_development_prediction_features_zoning_enhanced` | 1,430,221 | 1.17 GiB | Training / Research Table | Model-training or parcel-level research artifact; production returns safe governance/unavailable states instead. |
| `parcel_development_prediction_features` | 1,430,221 | 988.2 MiB | Training / Research Table | Model-training or parcel-level research artifact; production returns safe governance/unavailable states instead. |
| `parcel_zoning_snapshot_year` | 2,420,374 | 666.5 MiB | Optional Heavy Table | Useful for local warehouse/rebuilds but not required by first production UI. |
| `parcel_development_prediction_labels` | 1,430,221 | 279.4 MiB | Training / Research Table | Model-training or parcel-level research artifact; production returns safe governance/unavailable states instead. |
| `tax_parcel_value_enrichment` | 110,215 | 243.6 MiB | Optional Heavy Table | Useful for local warehouse/rebuilds but not required by first production UI. |
| `tax_parcel_full_raw` | 110,215 | 220.5 MiB | Raw / Source / Staging Table | Raw/source/staging/diagnostic table excluded from serving database. |
| `fema_nfhl_flood_zones_raw` | 7,712 | 191.2 MiB | Raw / Source / Staging Table | Raw/source/staging/diagnostic table excluded from serving database. |
| `development_prediction_model_experiment_scores` | 440,068 | 190.7 MiB | Training / Research Table | Model-training or parcel-level research artifact; production returns safe governance/unavailable states instead. |

## Degraded But Safe Endpoints

- `/development/prediction/features/summary` returns a safe unavailable/governance state when feature matrices are absent.
- `/development/prediction/ranking/summary` returns a safe unavailable state when ranking tables are absent.
- `/development/model-research/preview` returns `preview_available: false` when ranking tables are absent, so Model Lab can load without restoring parcel-level ranking artifacts.
- `/development/new-construction/labels/summary` is research/training-oriented and is not required by the production UI subset.

## Restore Guardrails

- Do not run a full public schema data restore.
- Do not restore raw/source-heavy/staging/training tables by default.
- Enable PostGIS on the target only after explicit restore approval.
- If the target contains existing rows in selected tables, stop before truncating or overwriting.
- Temporary dumps must be created outside the repo and removed after restore.
