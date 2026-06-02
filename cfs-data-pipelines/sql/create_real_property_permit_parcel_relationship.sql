-- Cabarrus FutureScape Phase 3 Real Property Permit-to-Parcel relationship.
--
-- Builds a governed relationship layer from the primary Real Property Permit
-- source to trusted parcel intelligence using ParcelNumber -> pin14. The Real
-- Property Permit CSV has no strong geometry, so this model intentionally does
-- not rely on geometry. The 2015 permit_activity_clean layer remains preserved
-- as a historical spatial pilot and is not required by this relationship model.

DROP TABLE IF EXISTS public.real_property_permit_parcel_relationship;

DROP TABLE IF EXISTS pg_temp.cfs_rpp_permit_base;
CREATE TEMP TABLE cfs_rpp_permit_base ON COMMIT DROP AS
SELECT
  permit_id,
  permit_number,
  parcel_number,
  NULLIF(btrim(parcel_number), '') AS parcel_number_exact_key,
  NULLIF(regexp_replace(lower(btrim(parcel_number)), '[^0-9a-z]+', '', 'g'), '') AS parcel_number_normalized,
  permit_date,
  activity_date,
  activity_year,
  activity_month,
  permit_code,
  permit_type_raw,
  permit_type_normalized,
  work_type_raw,
  work_type_normalized,
  permit_status_raw,
  permit_status_normalized,
  permit_amount,
  appraiser,
  has_invalid_or_future_co_date AS co_date_future_outlier
FROM public.real_property_permit_clean;

CREATE INDEX cfs_rpp_permit_base_permit_id_idx
  ON cfs_rpp_permit_base (permit_id);
CREATE INDEX cfs_rpp_permit_base_exact_key_idx
  ON cfs_rpp_permit_base (parcel_number_exact_key);
CREATE INDEX cfs_rpp_permit_base_normalized_idx
  ON cfs_rpp_permit_base (parcel_number_normalized);

DROP TABLE IF EXISTS pg_temp.cfs_rpp_parcel_base;
CREATE TEMP TABLE cfs_rpp_parcel_base ON COMMIT DROP AS
SELECT
  official_parcel_id,
  objectid_1,
  pin14,
  NULLIF(btrim(pin14), '') AS pin14_exact_key,
  NULLIF(regexp_replace(lower(btrim(pin14)), '[^0-9a-z]+', '', 'g'), '') AS pin14_normalized,
  parcel_quality_status,
  valuation_band,
  parcel_size_category
FROM public.parcels_enriched;

CREATE INDEX cfs_rpp_parcel_base_official_parcel_id_idx
  ON cfs_rpp_parcel_base (official_parcel_id);
CREATE INDEX cfs_rpp_parcel_base_exact_key_idx
  ON cfs_rpp_parcel_base (pin14_exact_key);
CREATE INDEX cfs_rpp_parcel_base_normalized_idx
  ON cfs_rpp_parcel_base (pin14_normalized);

DROP TABLE IF EXISTS pg_temp.cfs_rpp_exact_matches;
CREATE TEMP TABLE cfs_rpp_exact_matches ON COMMIT DROP AS
SELECT
  permit.permit_id,
  permit.permit_number,
  permit.parcel_number,
  permit.parcel_number_normalized,
  parcel.official_parcel_id,
  parcel.objectid_1,
  parcel.pin14,
  permit.permit_date,
  permit.activity_date,
  permit.activity_year,
  permit.activity_month,
  permit.permit_code,
  permit.permit_type_raw,
  permit.permit_type_normalized,
  permit.work_type_raw,
  permit.work_type_normalized,
  permit.permit_status_raw,
  permit.permit_status_normalized,
  permit.permit_amount,
  permit.appraiser,
  parcel.parcel_quality_status,
  parcel.valuation_band,
  parcel.parcel_size_category,
  'exact_pin14'::text AS relationship_method,
  permit.co_date_future_outlier
FROM cfs_rpp_permit_base AS permit
JOIN cfs_rpp_parcel_base AS parcel
  ON permit.parcel_number_exact_key = parcel.pin14_exact_key
WHERE permit.parcel_number_exact_key IS NOT NULL;

CREATE INDEX cfs_rpp_exact_matches_permit_id_idx
  ON cfs_rpp_exact_matches (permit_id);

DROP TABLE IF EXISTS pg_temp.cfs_rpp_normalized_matches;
CREATE TEMP TABLE cfs_rpp_normalized_matches ON COMMIT DROP AS
SELECT
  permit.permit_id,
  permit.permit_number,
  permit.parcel_number,
  permit.parcel_number_normalized,
  parcel.official_parcel_id,
  parcel.objectid_1,
  parcel.pin14,
  permit.permit_date,
  permit.activity_date,
  permit.activity_year,
  permit.activity_month,
  permit.permit_code,
  permit.permit_type_raw,
  permit.permit_type_normalized,
  permit.work_type_raw,
  permit.work_type_normalized,
  permit.permit_status_raw,
  permit.permit_status_normalized,
  permit.permit_amount,
  permit.appraiser,
  parcel.parcel_quality_status,
  parcel.valuation_band,
  parcel.parcel_size_category,
  'normalized_pin14'::text AS relationship_method,
  permit.co_date_future_outlier
FROM cfs_rpp_permit_base AS permit
JOIN cfs_rpp_parcel_base AS parcel
  ON permit.parcel_number_normalized = parcel.pin14_normalized
WHERE permit.parcel_number_normalized IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM cfs_rpp_exact_matches AS exact
    WHERE exact.permit_id = permit.permit_id
  );

CREATE INDEX cfs_rpp_normalized_matches_permit_id_idx
  ON cfs_rpp_normalized_matches (permit_id);

DROP TABLE IF EXISTS pg_temp.cfs_rpp_all_matches;
CREATE TEMP TABLE cfs_rpp_all_matches ON COMMIT DROP AS
SELECT * FROM cfs_rpp_exact_matches
UNION ALL
SELECT * FROM cfs_rpp_normalized_matches;

CREATE INDEX cfs_rpp_all_matches_permit_id_idx
  ON cfs_rpp_all_matches (permit_id);

DROP TABLE IF EXISTS pg_temp.cfs_rpp_candidate_matches;
CREATE TEMP TABLE cfs_rpp_candidate_matches ON COMMIT DROP AS
SELECT * FROM cfs_rpp_all_matches
UNION ALL
SELECT
  permit.permit_id,
  permit.permit_number,
  permit.parcel_number,
  permit.parcel_number_normalized,
  NULL::text AS official_parcel_id,
  NULL::bigint AS objectid_1,
  NULL::text AS pin14,
  permit.permit_date,
  permit.activity_date,
  permit.activity_year,
  permit.activity_month,
  permit.permit_code,
  permit.permit_type_raw,
  permit.permit_type_normalized,
  permit.work_type_raw,
  permit.work_type_normalized,
  permit.permit_status_raw,
  permit.permit_status_normalized,
  permit.permit_amount,
  permit.appraiser,
  NULL::text AS parcel_quality_status,
  NULL::text AS valuation_band,
  NULL::text AS parcel_size_category,
  'no_match'::text AS relationship_method,
  permit.co_date_future_outlier
FROM cfs_rpp_permit_base AS permit
WHERE NOT EXISTS (
  SELECT 1
  FROM cfs_rpp_all_matches AS matched
  WHERE matched.permit_id = permit.permit_id
);

CREATE INDEX cfs_rpp_candidate_matches_permit_id_idx
  ON cfs_rpp_candidate_matches (permit_id);
CREATE INDEX cfs_rpp_candidate_matches_parcel_id_idx
  ON cfs_rpp_candidate_matches (official_parcel_id);

CREATE TABLE public.real_property_permit_parcel_relationship AS
WITH match_rollup AS (
  SELECT
    permit_id,
    COUNT(*) FILTER (WHERE official_parcel_id IS NOT NULL) AS parcel_match_count,
    COUNT(*) FILTER (WHERE relationship_method = 'exact_pin14') AS exact_match_count,
    COUNT(*) FILTER (WHERE relationship_method = 'normalized_pin14') AS normalized_match_count
  FROM cfs_rpp_candidate_matches
  GROUP BY permit_id
),
relationship_base AS (
  SELECT
    candidate.*,
    rollup.parcel_match_count,
    rollup.exact_match_count,
    rollup.normalized_match_count,
    zoning.zoning_jurisdiction_name,
    zoning.dominant_zoning_code_raw,
    zoning.dominant_zoning_general_normalized,
    zoning.zoning_assignment_confidence,
    qa.governance_warning_categories
  FROM cfs_rpp_candidate_matches AS candidate
  JOIN match_rollup AS rollup
    ON rollup.permit_id = candidate.permit_id
  LEFT JOIN public.parcel_zoning_overlay_v2 AS zoning
    ON zoning.official_parcel_id = candidate.official_parcel_id
  LEFT JOIN public.parcel_zoning_intelligence_qa AS qa
    ON qa.official_parcel_id = candidate.official_parcel_id
)
SELECT
  md5(
    concat_ws(
      '|',
      'real_property_permit_parcel_relationship',
      permit_id,
      COALESCE(official_parcel_id, 'no_parcel_match')
    )
  ) AS relationship_id,
  permit_id,
  permit_number,
  parcel_number,
  parcel_number_normalized,
  official_parcel_id,
  objectid_1,
  pin14,
  permit_date,
  activity_date,
  activity_year,
  activity_month,
  permit_code,
  permit_type_raw AS permit_type,
  permit_type_normalized,
  work_type_raw AS work_type,
  work_type_normalized,
  permit_status_raw AS permit_status,
  permit_status_normalized,
  permit_amount,
  appraiser,
  parcel_quality_status,
  valuation_band,
  parcel_size_category,
  zoning_jurisdiction_name,
  dominant_zoning_code_raw,
  dominant_zoning_general_normalized,
  zoning_assignment_confidence,
  governance_warning_categories,
  relationship_method,
  CASE
    WHEN parcel_match_count = 0 THEN 'no_match'
    WHEN parcel_match_count > 1 THEN 'low'
    WHEN relationship_method = 'exact_pin14' THEN 'high'
    WHEN relationship_method = 'normalized_pin14' THEN 'medium'
    ELSE 'no_match'
  END AS relationship_confidence,
  parcel_match_count > 0 AS has_parcel_match,
  parcel_match_count > 1 AS has_multiple_parcel_matches,
  parcel_match_count = 0 AS missing_parcel_match,
  co_date_future_outlier,
  now()::timestamptz AS transformed_at
FROM relationship_base;

COMMENT ON TABLE public.real_property_permit_parcel_relationship IS
  'CFS Real Property Permit-to-Parcel relationship layer. Uses ParcelNumber to trusted parcel pin14, with normalized fallback and QA flags.';
COMMENT ON COLUMN public.real_property_permit_parcel_relationship.relationship_method IS
  'exact_pin14, normalized_pin14, or no_match. Geometry is intentionally not used because the Real Property Permit CSV has no authoritative geometry.';
COMMENT ON COLUMN public.real_property_permit_parcel_relationship.relationship_confidence IS
  'high for one exact match, medium for one normalized match, low for multiple parcel matches, no_match for unmatched permits.';
COMMENT ON COLUMN public.real_property_permit_parcel_relationship.governance_warning_categories IS
  'Zoning governance warning categories carried through from parcel_zoning_intelligence_qa for future API/dashboard caution flags.';

ALTER TABLE public.real_property_permit_parcel_relationship
  ADD CONSTRAINT real_property_permit_parcel_relationship_pkey PRIMARY KEY (relationship_id);

CREATE INDEX IF NOT EXISTS real_property_permit_parcel_relationship_relationship_id_idx
  ON public.real_property_permit_parcel_relationship (relationship_id);

CREATE INDEX IF NOT EXISTS real_property_permit_parcel_relationship_permit_id_idx
  ON public.real_property_permit_parcel_relationship (permit_id);

CREATE INDEX IF NOT EXISTS real_property_permit_parcel_relationship_permit_number_idx
  ON public.real_property_permit_parcel_relationship (permit_number);

CREATE INDEX IF NOT EXISTS real_property_permit_parcel_relationship_parcel_number_idx
  ON public.real_property_permit_parcel_relationship (parcel_number);

CREATE INDEX IF NOT EXISTS real_property_permit_parcel_relationship_parcel_number_norm_idx
  ON public.real_property_permit_parcel_relationship (parcel_number_normalized);

CREATE INDEX IF NOT EXISTS real_property_permit_parcel_relationship_official_parcel_id_idx
  ON public.real_property_permit_parcel_relationship (official_parcel_id);

CREATE INDEX IF NOT EXISTS real_property_permit_parcel_relationship_pin14_idx
  ON public.real_property_permit_parcel_relationship (pin14);

CREATE INDEX IF NOT EXISTS real_property_permit_parcel_relationship_activity_date_idx
  ON public.real_property_permit_parcel_relationship (activity_date);

CREATE INDEX IF NOT EXISTS real_property_permit_parcel_relationship_activity_year_idx
  ON public.real_property_permit_parcel_relationship (activity_year);

CREATE INDEX IF NOT EXISTS real_property_permit_parcel_relationship_activity_month_idx
  ON public.real_property_permit_parcel_relationship (activity_month);

CREATE INDEX IF NOT EXISTS real_property_permit_parcel_relationship_permit_type_idx
  ON public.real_property_permit_parcel_relationship (permit_type_normalized);

CREATE INDEX IF NOT EXISTS real_property_permit_parcel_relationship_work_type_idx
  ON public.real_property_permit_parcel_relationship (work_type_normalized);

CREATE INDEX IF NOT EXISTS real_property_permit_parcel_relationship_permit_status_idx
  ON public.real_property_permit_parcel_relationship (permit_status_normalized);

CREATE INDEX IF NOT EXISTS real_property_permit_parcel_relationship_confidence_idx
  ON public.real_property_permit_parcel_relationship (relationship_confidence);

CREATE INDEX IF NOT EXISTS real_property_permit_parcel_relationship_zoning_jurisdiction_idx
  ON public.real_property_permit_parcel_relationship (zoning_jurisdiction_name);

ANALYZE public.real_property_permit_parcel_relationship;
