-- Phase 13C transportation-enhanced exploratory feature matrix.
--
-- This creates a separate table from Phase 10B/10E. Transportation fields are
-- current-context only and are not strict historical training features.

DROP TABLE IF EXISTS public.parcel_development_prediction_features_transportation_enhanced;

CREATE TABLE public.parcel_development_prediction_features_transportation_enhanced AS
SELECT
    z.*,
    a.distance_to_nearest_road_ft,
    a.road_density_1000ft,
    a.road_density_half_mile,
    a.distance_to_nearest_rail_ft,
    COALESCE(a.rail_corridor_within_half_mile, false) AS rail_corridor_within_half_mile,
    pt.nearest_stip_project_distance_ft,
    COALESCE(pt.stip_project_within_half_mile, false) AS stip_project_within_half_mile,
    COALESCE(pt.stip_project_within_1_mile, false) AS stip_project_within_1_mile,
    COALESCE(pt.stip_project_count_within_1_mile, 0)::integer
      AS stip_project_count_within_1_mile,
    COALESCE(pt.stip_project_count_within_3_miles, 0)::integer
      AS stip_project_count_within_3_miles,
    COALESCE(pt.planned_transportation_investment_flag, false)
      AS planned_transportation_investment_flag,
    pt.nearest_aadt_station_distance_ft,
    pt.nearest_aadt_value,
    pt.max_aadt_within_half_mile,
    pt.max_aadt_within_1_mile,
    pt.avg_aadt_within_1_mile,
    COALESCE(pt.aadt_station_count_within_1_mile, 0)::integer
      AS aadt_station_count_within_1_mile,
    true AS transportation_current_context_only_flag,
    false AS transportation_time_safe_for_training_flag,
    (a.official_parcel_id IS NOT NULL) AS transportation_accessibility_joined_flag,
    (pt.official_parcel_id IS NOT NULL) AS transportation_plan_traffic_joined_flag,
    'phase13c_transportation_enhanced_v1'::text
      AS transportation_enhanced_feature_set_version,
    now() AS transportation_enhanced_created_at
FROM public.parcel_development_prediction_features_zoning_enhanced z
LEFT JOIN public.parcel_transportation_accessibility_features a
  ON a.official_parcel_id = z.official_parcel_id
LEFT JOIN public.parcel_transportation_plan_traffic_features pt
  ON pt.official_parcel_id = z.official_parcel_id;

ALTER TABLE public.parcel_development_prediction_features_transportation_enhanced
    ADD PRIMARY KEY (official_parcel_id, snapshot_year);

CREATE INDEX parcel_dev_pred_transportation_enhanced_snapshot_idx
    ON public.parcel_development_prediction_features_transportation_enhanced (snapshot_year);

CREATE INDEX parcel_dev_pred_transportation_enhanced_current_context_idx
    ON public.parcel_development_prediction_features_transportation_enhanced (
      transportation_current_context_only_flag,
      transportation_time_safe_for_training_flag
    );

CREATE INDEX parcel_dev_pred_transportation_enhanced_stip_idx
    ON public.parcel_development_prediction_features_transportation_enhanced (
      planned_transportation_investment_flag,
      stip_project_within_1_mile
    );
