-- Phase 16B planning / pipeline / utility enhanced exploratory feature matrix.
--
-- This extends the Phase 13C transportation-enhanced parcel-year matrix with
-- Phase 16A current-context planning, Accela pipeline, WSACC utility proxy, and
-- Tax Parcels Full enrichment fields. These features are explicitly not strict
-- historical training fields and must not be represented as production-ready
-- prediction inputs.

DROP TABLE IF EXISTS public.parcel_development_prediction_features_planning_pipeline_utility_enhanced;

CREATE TABLE public.parcel_development_prediction_features_planning_pipeline_utility_enhanced AS
SELECT
    t.*,
    COALESCE(ppu.inside_central_area_plan, false) AS inside_central_area_plan,
    ppu.central_area_future_land_use,
    ppu.central_area_future_land_use AS future_land_use_category,
    ppu.central_area_future_land_use_growth_alignment AS future_land_use_growth_alignment,
    COALESCE(ppu.inside_primary_activity_area, false) AS inside_primary_activity_area,
    COALESCE(ppu.inside_service_node, false) AS inside_service_node,
    COALESCE(ppu.inside_special_corridor, false) AS inside_special_corridor,
    COALESCE(ppu.inside_special_use_area, false) AS inside_special_use_area,
    NULL::double precision AS distance_to_primary_activity_area_ft,
    cap.distance_to_nearest_service_node_ft AS distance_to_service_node_ft,
    cap.distance_to_nearest_special_corridor_ft AS distance_to_special_corridor_ft,
    true AS concord_only_flag,

    COALESCE(acc.active_plan_review_count, 0) > 0 AS active_plan_review_on_parcel,
    COALESCE(acc.active_plan_review_count, 0) AS total_plan_review_count,
    COALESCE(acc.recent_plan_review_count, 0) AS recent_plan_review_count_12mo,
    NULL::integer AS recent_plan_review_count_36mo,
    NULL::integer AS plan_review_count_nearby_half_mile,
    acc.latest_plan_review_file_date,
    acc.latest_plan_review_status,
    acc.latest_plan_review_type,
    acc.max_plan_review_days_open AS max_days_open,
    COALESCE(
      COALESCE(acc.latest_plan_review_type, '')
        ~* '(major|subdivision|site|commercial|development|construction)',
      false
    ) AS review_type_major_flag,

    COALESCE(ppu.inside_wsacc_district_proxy, false) AS inside_wsacc_district,
    util.nearest_wsacc_district_name AS wsacc_district_name,
    ppu.distance_to_nearest_wsacc_sewer_line_ft AS distance_to_wsacc_sewer_line_ft,
    ppu.distance_to_nearest_wsacc_manhole_ft AS distance_to_nearest_manhole_ft,
    NULL::text AS nearest_utility_owner,
    NULL::text AS nearest_pipe_size,
    NULL::integer AS nearest_pipe_year,
    CASE
      WHEN ppu.distance_to_nearest_wsacc_sewer_line_ft IS NULL THEN NULL::integer
      WHEN ppu.distance_to_nearest_wsacc_sewer_line_ft <= 250 THEN 90
      WHEN ppu.distance_to_nearest_wsacc_sewer_line_ft <= 500 THEN 75
      WHEN ppu.distance_to_nearest_wsacc_sewer_line_ft <= 1000 THEN 60
      WHEN ppu.distance_to_nearest_wsacc_sewer_line_ft <= 2640 THEN 40
      ELSE 20
    END AS utility_access_proxy_score,
    false AS true_utility_capacity_available,

    tax.tax_full_improvement_value::double precision AS building_value,
    CASE
      WHEN tax.tax_full_improvement_value IS NOT NULL
       AND tax.tax_full_improvement_value > 0
        THEN (tax.tax_full_land_value / tax.tax_full_improvement_value)::double precision
      ELSE NULL::double precision
    END AS land_to_building_value_ratio,
    NULL::double precision AS sale_price,
    NULL::integer AS sale_year,
    NULL::integer AS sale_recency_years,
    NULL::boolean AS deferred_value_flag,
    COALESCE(
      tax.tax_full_land_value IS NOT NULL
      AND COALESCE(tax.tax_full_improvement_value, 0) = 0,
      false
    ) AS vacant_or_underbuilt_proxy,
    tax.tax_enrichment_data_quality AS value_enrichment_quality,
    tax.tax_full_land_value::double precision AS tax_enriched_land_value,
    tax.tax_full_total_value::double precision AS tax_enriched_total_value,

    true AS planning_pipeline_utility_current_context_only_flag,
    true AS concord_only_feature_flag,
    true AS utility_proxy_only_flag,
    false AS planning_pipeline_utility_time_safe_for_training_flag,
    'phase16b_v1'::text AS planning_pipeline_utility_feature_set_version,
    now() AS planning_pipeline_utility_enhanced_created_at
FROM public.parcel_development_prediction_features_transportation_enhanced t
LEFT JOIN public.parcel_planning_pipeline_utility_features ppu
  ON ppu.official_parcel_id = t.official_parcel_id
LEFT JOIN public.parcel_central_area_plan_features cap
  ON cap.official_parcel_id = t.official_parcel_id
LEFT JOIN public.parcel_accela_plan_review_features acc
  ON acc.official_parcel_id = t.official_parcel_id
LEFT JOIN public.parcel_utility_proxy_features util
  ON util.official_parcel_id = t.official_parcel_id
LEFT JOIN public.parcel_tax_value_enrichment_features tax
  ON tax.official_parcel_id = t.official_parcel_id;

ALTER TABLE public.parcel_development_prediction_features_planning_pipeline_utility_enhanced
    ADD PRIMARY KEY (official_parcel_id, snapshot_year);

CREATE INDEX parcel_dev_pred_ppu_enhanced_snapshot_idx
    ON public.parcel_development_prediction_features_planning_pipeline_utility_enhanced (snapshot_year);

CREATE INDEX parcel_dev_pred_ppu_enhanced_flags_idx
    ON public.parcel_development_prediction_features_planning_pipeline_utility_enhanced (
      planning_pipeline_utility_current_context_only_flag,
      planning_pipeline_utility_time_safe_for_training_flag,
      concord_only_feature_flag,
      utility_proxy_only_flag
    );

CREATE INDEX parcel_dev_pred_ppu_enhanced_plan_review_idx
    ON public.parcel_development_prediction_features_planning_pipeline_utility_enhanced (
      active_plan_review_on_parcel,
      recent_plan_review_count_36mo
    );

CREATE INDEX parcel_dev_pred_ppu_enhanced_planning_idx
    ON public.parcel_development_prediction_features_planning_pipeline_utility_enhanced (
      inside_central_area_plan,
      inside_primary_activity_area,
      inside_special_corridor
    );
