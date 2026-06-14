-- Phase 10E zoning-enhanced feature matrix.
--
-- This creates a separate table from Phase 10B. It does not overwrite labels,
-- baseline features, or Phase 10C artifacts.

DROP TABLE IF EXISTS public.parcel_development_prediction_features_zoning_enhanced;

CREATE TABLE public.parcel_development_prediction_features_zoning_enhanced AS
WITH change_features AS (
    SELECT
        b.official_parcel_id,
        b.snapshot_year,
        COUNT(e.*) FILTER (
            WHERE e.change_year BETWEEN b.snapshot_year - 0 AND b.snapshot_year
        ) AS zoning_change_count_prior_1yr,
        COUNT(e.*) FILTER (
            WHERE e.change_year BETWEEN b.snapshot_year - 2 AND b.snapshot_year
        ) AS zoning_change_count_prior_3yr,
        COUNT(e.*) FILTER (
            WHERE e.change_year BETWEEN b.snapshot_year - 4 AND b.snapshot_year
        ) AS zoning_change_count_prior_5yr,
        MAX(e.change_year) AS latest_zoning_change_year,
        COUNT(e.*) FILTER (
            WHERE e.change_year BETWEEN b.snapshot_year - 4 AND b.snapshot_year
              AND e.zoning_intensity_change = 'increased'
        ) AS zoning_intensity_increased_count_prior_5yr,
        COUNT(e.*) FILTER (
            WHERE e.change_year BETWEEN b.snapshot_year - 4 AND b.snapshot_year
              AND e.zoning_intensity_change = 'decreased'
        ) AS zoning_intensity_decreased_count_prior_5yr,
        COUNT(e.*) FILTER (
            WHERE e.change_year BETWEEN b.snapshot_year - 4 AND b.snapshot_year
              AND e.new_general_category IN ('mixed_use_or_planned', 'commercial', 'industrial')
        ) AS rezoned_to_growth_supportive_count_prior_5yr,
        BOOL_OR(e.change_year > b.snapshot_year) AS has_future_change_leakage
    FROM public.parcel_development_prediction_features b
    LEFT JOIN public.parcel_zoning_change_events e
      ON e.official_parcel_id = b.official_parcel_id
     AND e.change_year <= b.snapshot_year
    GROUP BY b.official_parcel_id, b.snapshot_year
),
latest_change AS (
    SELECT DISTINCT ON (b.official_parcel_id, b.snapshot_year)
        b.official_parcel_id,
        b.snapshot_year,
        e.change_year,
        e.zoning_change_type,
        e.zoning_intensity_change,
        e.confidence
    FROM public.parcel_development_prediction_features b
    JOIN public.parcel_zoning_change_events e
      ON e.official_parcel_id = b.official_parcel_id
     AND e.change_year <= b.snapshot_year
    ORDER BY b.official_parcel_id, b.snapshot_year, e.change_year DESC, e.zoning_change_event_id DESC
)
SELECT
    b.*,
    s.zoning_code AS historical_zoning_code,
    s.zoning_general_category AS historical_zoning_general_category,
    s.zoning_jurisdiction AS historical_zoning_jurisdiction,
    s.zoning_source_year,
    s.zoning_source_age_years,
    s.temporal_status AS zoning_temporal_status,
    (s.temporal_status = 'exact_year') AS zoning_exact_year_flag,
    (s.temporal_status = 'prior_available_year') AS zoning_prior_available_year_flag,
    COALESCE(s.zoning_known_flag, false) AS zoning_history_available_flag,
    (COALESCE(cf.zoning_change_count_prior_1yr, 0) > 0) AS zoning_changed_prior_1yr,
    (COALESCE(cf.zoning_change_count_prior_3yr, 0) > 0) AS zoning_changed_prior_3yr,
    (COALESCE(cf.zoning_change_count_prior_5yr, 0) > 0) AS zoning_changed_prior_5yr,
    COALESCE(cf.zoning_change_count_prior_5yr, 0)::integer AS zoning_change_count_prior_5yr,
    CASE
        WHEN cf.latest_zoning_change_year IS NULL THEN NULL
        ELSE b.snapshot_year - cf.latest_zoning_change_year
    END AS years_since_last_zoning_change,
    cf.latest_zoning_change_year,
    lc.zoning_change_type AS latest_zoning_change_type,
    lc.zoning_intensity_change AS latest_zoning_intensity_change,
    (COALESCE(cf.zoning_intensity_increased_count_prior_5yr, 0) > 0)
      AS zoning_intensity_increased_prior_5yr,
    (COALESCE(cf.zoning_intensity_decreased_count_prior_5yr, 0) > 0)
      AS zoning_intensity_decreased_prior_5yr,
    (COALESCE(cf.rezoned_to_growth_supportive_count_prior_5yr, 0) > 0)
      AS rezoned_to_growth_supportive_prior_5yr,
    lc.confidence AS zoning_change_confidence,
    (cf.latest_zoning_change_year IS NOT NULL) AS zoning_map_change_only_flag,
    CASE
        WHEN s.zoning_source_year IS NOT NULL AND s.zoning_source_year > b.snapshot_year THEN true
        ELSE false
    END AS zoning_source_year_leakage_flag,
    COALESCE(cf.has_future_change_leakage, false) AS zoning_change_year_leakage_flag,
    'phase10e_zoning_enhanced_v1'::text AS zoning_enhanced_feature_set_version,
    now() AS zoning_enhanced_created_at
FROM public.parcel_development_prediction_features b
LEFT JOIN public.parcel_zoning_snapshot_year s
  ON s.official_parcel_id = b.official_parcel_id
 AND s.snapshot_year = b.snapshot_year
LEFT JOIN change_features cf
  ON cf.official_parcel_id = b.official_parcel_id
 AND cf.snapshot_year = b.snapshot_year
LEFT JOIN latest_change lc
  ON lc.official_parcel_id = b.official_parcel_id
 AND lc.snapshot_year = b.snapshot_year;

ALTER TABLE public.parcel_development_prediction_features_zoning_enhanced
    ADD PRIMARY KEY (official_parcel_id, snapshot_year);

CREATE INDEX parcel_dev_pred_zoning_enhanced_snapshot_idx
    ON public.parcel_development_prediction_features_zoning_enhanced (snapshot_year);

CREATE INDEX parcel_dev_pred_zoning_enhanced_temporal_idx
    ON public.parcel_development_prediction_features_zoning_enhanced (zoning_temporal_status);

CREATE INDEX parcel_dev_pred_zoning_enhanced_source_age_idx
    ON public.parcel_development_prediction_features_zoning_enhanced (zoning_source_age_years);

CREATE INDEX parcel_dev_pred_zoning_enhanced_change_idx
    ON public.parcel_development_prediction_features_zoning_enhanced (zoning_changed_prior_5yr);
