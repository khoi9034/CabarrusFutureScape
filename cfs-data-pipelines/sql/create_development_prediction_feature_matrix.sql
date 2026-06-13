DROP TABLE IF EXISTS public.parcel_development_prediction_features;

CREATE TABLE public.parcel_development_prediction_features AS
WITH label_base AS (
  SELECT
    l.*,
    make_date(l.snapshot_year, 12, 31) AS snapshot_end_date
  FROM public.parcel_development_prediction_labels l
  WHERE l.snapshot_year >= COALESCE(
      NULLIF(current_setting('cfs.snapshot_start_year', true), '')::integer,
      l.snapshot_year
    )
    AND l.snapshot_year <= COALESCE(
      NULLIF(current_setting('cfs.snapshot_end_year', true), '')::integer,
      l.snapshot_year
    )
),
parcel_context AS (
  SELECT
    p.official_parcel_id,
    p.objectid_1,
    p.pin14,
    p.parcel_area_acres_calc AS parcel_area_acres,
    p.landvalue_numeric AS land_value,
    p.buildingvalue_numeric AS improvement_value,
    p.assessedvalue_numeric AS total_value,
    p.value_per_acre,
    p.parcel_size_category,
    p.valuation_band,
    p.parcel_quality_status,
    NULL::text AS property_class_code,
    NULL::text AS property_use_code,
    (
      COALESCE(p.landvalue_numeric, 0) > 0
      AND COALESCE(p.buildingvalue_numeric, 0) = 0
    ) AS vacant_or_underbuilt_flag
  FROM public.parcels_enriched p
),
zoning_context AS (
  SELECT
    z.official_parcel_id,
    z.dominant_zoning_code_raw AS zoning_code,
    z.zoning_jurisdiction_name AS zoning_jurisdiction,
    z.dominant_zoning_general_normalized AS zoning_category,
    z.zoning_assignment_confidence AS zoning_assignment_quality,
    NOT COALESCE(z.has_no_zoning_match, false) AS zoning_known_flag,
    (
      COALESCE(z.has_no_zoning_match, false)
      OR COALESCE(z.has_multiple_zoning_jurisdictions, false)
      OR COALESCE(z.has_nearly_equal_overlap_split, false)
      OR COALESCE(z.has_tiny_sliver_overlap, false)
    ) AS zoning_review_required_flag,
    z.planning_jurisdiction_name,
    z.planning_boundary_type,
    CASE
      WHEN z.planning_jurisdiction_name IS NULL THEN NULL
      WHEN z.planning_jurisdiction_name ILIKE '%cabarrus county%' THEN NULL
      WHEN z.planning_jurisdiction_name ILIKE '%unincorporated%' THEN NULL
      ELSE z.planning_jurisdiction_name
    END AS municipality,
    CASE
      WHEN z.planning_boundary_type ILIKE '%etj%' THEN true
      WHEN z.planning_boundary_type IS NULL THEN NULL
      ELSE false
    END AS etj_flag,
    (
      z.zoning_jurisdiction_name ILIKE '%unincorporated%'
      OR z.zoning_jurisdiction_name ILIKE '%cabarrus county%'
    ) AS county_unincorporated_flag
  FROM public.parcel_zoning_overlay_v2 z
),
flood_context AS (
  SELECT
    official_parcel_id,
    flood_review_required,
    floodway_present,
    sfha_present,
    moderate_flood_present,
    minimal_flood_present,
    flood_constraint_score,
    flood_severity_class,
    percent_parcel_constrained,
    dominant_flood_zone,
    buildability_impact
  FROM public.parcel_flood_constraint_overlay
),
school_context AS (
  SELECT
    official_parcel_id,
    elementary_school_name,
    middle_school_name,
    high_school_name,
    has_elementary_assignment,
    has_middle_assignment,
    has_high_assignment,
    school_assignment_confidence,
    school_assignment_review_required,
    COALESCE(data_quality_flags, ARRAY[]::text[]) AS data_quality_flags,
    (
      NOT COALESCE(has_elementary_assignment, false)
      OR NOT COALESCE(has_middle_assignment, false)
      OR NOT COALESCE(has_high_assignment, false)
    ) AS school_missing_assignment_flag,
    'not_available'::text AS school_capacity_status,
    NULL::numeric AS school_constraint_score,
    'not_scored'::text AS school_constraint_class
  FROM public.parcel_school_summary
),
development_current_context AS (
  SELECT
    official_parcel_id,
    total_permit_count AS total_permit_count_current_context,
    recent_permit_count_1yr AS recent_permit_count_1yr_current_context,
    recent_permit_count_3yr AS recent_permit_count_3yr_current_context,
    development_activity_score AS development_activity_score_current_context,
    development_activity_class AS development_activity_class_current_context,
    dominant_permit_type AS dominant_permit_type_current_context,
    dominant_work_type AS dominant_work_type_current_context
  FROM public.development_activity_parcel_summary
),
permit_events AS (
  SELECT
    r.official_parcel_id,
    r.permit_id,
    COALESCE(r.activity_date, r.permit_date, s.permit_date)::date AS activity_date,
    COALESCE(r.permit_amount, s.permit_amount) AS permit_amount,
    s.is_residential_growth,
    s.is_commercial_activity,
    s.is_redevelopment_signal,
    s.is_demolition,
    s.is_major_value
  FROM public.real_property_permit_parcel_relationship r
  LEFT JOIN public.permit_intelligence_segments s
    ON s.permit_id = r.permit_id
  WHERE r.official_parcel_id IS NOT NULL
    AND COALESCE(r.activity_date, r.permit_date, s.permit_date) IS NOT NULL
),
permit_features AS (
  SELECT
    b.official_parcel_id,
    b.snapshot_year,
    COUNT(DISTINCT pe.permit_id) FILTER (
      WHERE pe.activity_date > b.snapshot_end_date - INTERVAL '1 year'
        AND pe.activity_date <= b.snapshot_end_date
    )::integer AS permits_prior_1yr,
    COUNT(DISTINCT pe.permit_id) FILTER (
      WHERE pe.activity_date > b.snapshot_end_date - INTERVAL '3 years'
        AND pe.activity_date <= b.snapshot_end_date
    )::integer AS permits_prior_3yr,
    COUNT(DISTINCT pe.permit_id) FILTER (
      WHERE pe.activity_date > b.snapshot_end_date - INTERVAL '5 years'
        AND pe.activity_date <= b.snapshot_end_date
    )::integer AS permits_prior_5yr,
    COUNT(DISTINCT pe.permit_id) FILTER (
      WHERE pe.activity_date > b.snapshot_end_date - INTERVAL '3 years'
        AND pe.activity_date <= b.snapshot_end_date
        AND COALESCE(pe.is_major_value, false)
    )::integer AS major_permits_prior_3yr,
    COUNT(DISTINCT pe.permit_id) FILTER (
      WHERE pe.activity_date > b.snapshot_end_date - INTERVAL '3 years'
        AND pe.activity_date <= b.snapshot_end_date
        AND COALESCE(pe.is_residential_growth, false)
    )::integer AS residential_growth_permits_prior_3yr,
    COUNT(DISTINCT pe.permit_id) FILTER (
      WHERE pe.activity_date > b.snapshot_end_date - INTERVAL '3 years'
        AND pe.activity_date <= b.snapshot_end_date
        AND COALESCE(pe.is_commercial_activity, false)
    )::integer AS commercial_activity_permits_prior_3yr,
    COUNT(DISTINCT pe.permit_id) FILTER (
      WHERE pe.activity_date > b.snapshot_end_date - INTERVAL '3 years'
        AND pe.activity_date <= b.snapshot_end_date
        AND COALESCE(pe.is_redevelopment_signal, false)
    )::integer AS redevelopment_permits_prior_3yr,
    COUNT(DISTINCT pe.permit_id) FILTER (
      WHERE pe.activity_date > b.snapshot_end_date - INTERVAL '3 years'
        AND pe.activity_date <= b.snapshot_end_date
        AND COALESCE(pe.is_demolition, false)
    )::integer AS demolition_permits_prior_3yr,
    NULL::integer AS nearby_permit_activity_prior_3yr,
    CASE
      WHEN MAX(pe.activity_date) FILTER (WHERE pe.activity_date <= b.snapshot_end_date) IS NULL THEN NULL
      ELSE ROUND(
        EXTRACT(
          epoch FROM (
            b.snapshot_end_date::timestamp
            - MAX(pe.activity_date) FILTER (WHERE pe.activity_date <= b.snapshot_end_date)::timestamp
          )
        ) / 31557600.0,
        2
      )
    END AS years_since_last_permit,
    COALESCE(
      BOOL_OR(COALESCE(pe.is_major_value, false))
        FILTER (WHERE pe.activity_date <= b.snapshot_end_date),
      false
    ) AS had_prior_major_development_flag
  FROM label_base b
  LEFT JOIN permit_events pe
    ON pe.official_parcel_id = b.official_parcel_id
   AND pe.activity_date <= b.snapshot_end_date
  GROUP BY b.official_parcel_id, b.snapshot_year, b.snapshot_end_date
),
new_construction_events AS (
  SELECT
    r.official_parcel_id,
    c.new_construction_permit_id,
    c.permit_file_date,
    c.permit_type_class,
    c.construction_status,
    c.major_development_flag
  FROM public.new_construction_permit_parcel_relationship r
  JOIN public.new_construction_permits_clean c
    ON c.new_construction_permit_id = r.new_construction_permit_id
  WHERE r.official_parcel_id IS NOT NULL
    AND c.permit_file_date IS NOT NULL
),
new_construction_features AS (
  SELECT
    b.official_parcel_id,
    b.snapshot_year,
    COUNT(DISTINCT nc.new_construction_permit_id) FILTER (
      WHERE nc.permit_file_date > b.snapshot_end_date - INTERVAL '1 year'
        AND nc.permit_file_date <= b.snapshot_end_date
    )::integer AS new_construction_permits_prior_1yr,
    COUNT(DISTINCT nc.new_construction_permit_id) FILTER (
      WHERE nc.permit_file_date > b.snapshot_end_date - INTERVAL '3 years'
        AND nc.permit_file_date <= b.snapshot_end_date
    )::integer AS new_construction_permits_prior_3yr,
    COUNT(DISTINCT nc.new_construction_permit_id) FILTER (
      WHERE nc.permit_file_date > b.snapshot_end_date - INTERVAL '5 years'
        AND nc.permit_file_date <= b.snapshot_end_date
    )::integer AS new_construction_permits_prior_5yr,
    COUNT(DISTINCT nc.new_construction_permit_id) FILTER (
      WHERE nc.permit_file_date > b.snapshot_end_date - INTERVAL '3 years'
        AND nc.permit_file_date <= b.snapshot_end_date
        AND nc.permit_type_class = 'residential_new_construction'
    )::integer AS residential_new_construction_prior_3yr,
    COUNT(DISTINCT nc.new_construction_permit_id) FILTER (
      WHERE nc.permit_file_date > b.snapshot_end_date - INTERVAL '3 years'
        AND nc.permit_file_date <= b.snapshot_end_date
        AND nc.permit_type_class = 'commercial_new_construction'
    )::integer AS commercial_new_construction_prior_3yr,
    COUNT(DISTINCT nc.new_construction_permit_id) FILTER (
      WHERE nc.permit_file_date > b.snapshot_end_date - INTERVAL '3 years'
        AND nc.permit_file_date <= b.snapshot_end_date
        AND nc.construction_status = 'completed'
    )::integer AS completed_new_construction_prior_3yr,
    COUNT(DISTINCT nc.new_construction_permit_id) FILTER (
      WHERE nc.permit_file_date > b.snapshot_end_date - INTERVAL '3 years'
        AND nc.permit_file_date <= b.snapshot_end_date
        AND nc.construction_status = 'permitted_not_completed'
    )::integer AS active_uncompleted_new_construction_prior_3yr,
    CASE
      WHEN MAX(nc.permit_file_date) FILTER (WHERE nc.permit_file_date <= b.snapshot_end_date) IS NULL THEN NULL
      ELSE ROUND(
        EXTRACT(
          epoch FROM (
            b.snapshot_end_date::timestamp
            - MAX(nc.permit_file_date) FILTER (WHERE nc.permit_file_date <= b.snapshot_end_date)::timestamp
          )
        ) / 31557600.0,
        2
      )
    END AS years_since_last_new_construction
  FROM label_base b
  LEFT JOIN new_construction_events nc
    ON nc.official_parcel_id = b.official_parcel_id
   AND nc.permit_file_date <= b.snapshot_end_date
  GROUP BY b.official_parcel_id, b.snapshot_year, b.snapshot_end_date
)
SELECT
  b.official_parcel_id,
  COALESCE(b.pin14, pc.pin14) AS pin14,
  b.snapshot_year,
  b.snapshot_end_date,
  pc.objectid_1,
  pc.parcel_area_acres,
  pc.land_value,
  pc.improvement_value,
  pc.total_value,
  pc.value_per_acre,
  pc.parcel_size_category,
  pc.valuation_band,
  pc.parcel_quality_status,
  pc.property_class_code,
  pc.property_use_code,
  pc.vacant_or_underbuilt_flag,
  z.zoning_code,
  z.zoning_jurisdiction,
  z.zoning_category,
  z.zoning_assignment_quality,
  z.zoning_known_flag,
  z.zoning_review_required_flag,
  z.planning_jurisdiction_name,
  z.planning_boundary_type,
  z.municipality,
  z.etj_flag,
  z.county_unincorporated_flag,
  f.flood_review_required,
  f.floodway_present,
  f.sfha_present,
  f.moderate_flood_present,
  f.minimal_flood_present,
  f.flood_constraint_score,
  f.flood_severity_class,
  f.percent_parcel_constrained,
  f.dominant_flood_zone,
  f.buildability_impact,
  s.elementary_school_name,
  s.middle_school_name,
  s.high_school_name,
  s.has_elementary_assignment,
  s.has_middle_assignment,
  s.has_high_assignment,
  s.school_missing_assignment_flag,
  s.school_assignment_confidence,
  s.school_assignment_review_required,
  s.data_quality_flags AS school_data_quality_flags,
  s.school_capacity_status,
  s.school_constraint_score,
  s.school_constraint_class,
  pf.permits_prior_1yr,
  pf.permits_prior_3yr,
  pf.permits_prior_5yr,
  pf.major_permits_prior_3yr,
  pf.residential_growth_permits_prior_3yr,
  pf.commercial_activity_permits_prior_3yr,
  pf.redevelopment_permits_prior_3yr,
  pf.demolition_permits_prior_3yr,
  pf.nearby_permit_activity_prior_3yr,
  pf.years_since_last_permit,
  pf.had_prior_major_development_flag,
  nf.new_construction_permits_prior_1yr,
  nf.new_construction_permits_prior_3yr,
  nf.new_construction_permits_prior_5yr,
  nf.residential_new_construction_prior_3yr,
  nf.commercial_new_construction_prior_3yr,
  nf.completed_new_construction_prior_3yr,
  nf.active_uncompleted_new_construction_prior_3yr,
  nf.years_since_last_new_construction,
  d.total_permit_count_current_context,
  d.recent_permit_count_1yr_current_context,
  d.recent_permit_count_3yr_current_context,
  d.development_activity_score_current_context,
  d.development_activity_class_current_context,
  d.dominant_permit_type_current_context,
  d.dominant_work_type_current_context,
  b.new_construction_next_1yr,
  b.new_construction_next_3yr,
  b.residential_new_construction_next_3yr,
  b.commercial_new_construction_next_3yr,
  b.co_issued_next_3yr,
  b.first_future_new_construction_date,
  b.future_permit_count_3yr,
  b.label_source,
  'phase10b_v1'::text AS feature_set_version,
  'mixed_time_safe_and_current_context_features'::text AS temporal_leakage_status,
  now()::timestamptz AS feature_created_at
FROM label_base b
LEFT JOIN parcel_context pc
  ON pc.official_parcel_id = b.official_parcel_id
LEFT JOIN zoning_context z
  ON z.official_parcel_id = b.official_parcel_id
LEFT JOIN flood_context f
  ON f.official_parcel_id = b.official_parcel_id
LEFT JOIN school_context s
  ON s.official_parcel_id = b.official_parcel_id
LEFT JOIN permit_features pf
  ON pf.official_parcel_id = b.official_parcel_id
 AND pf.snapshot_year = b.snapshot_year
LEFT JOIN new_construction_features nf
  ON nf.official_parcel_id = b.official_parcel_id
 AND nf.snapshot_year = b.snapshot_year
LEFT JOIN development_current_context d
  ON d.official_parcel_id = b.official_parcel_id;

ALTER TABLE public.parcel_development_prediction_features
  ADD PRIMARY KEY (official_parcel_id, snapshot_year);

CREATE INDEX idx_development_prediction_features_snapshot_year
  ON public.parcel_development_prediction_features (snapshot_year);

CREATE INDEX idx_development_prediction_features_next3
  ON public.parcel_development_prediction_features (new_construction_next_3yr);

CREATE INDEX idx_development_prediction_features_feature_set
  ON public.parcel_development_prediction_features (feature_set_version);
