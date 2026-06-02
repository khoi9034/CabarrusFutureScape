-- Cabarrus FutureScape Phase 2 trusted parcel intelligence layer.
--
-- public.parcels_enriched is built from public.parcels_clean and adds CFS
-- parcel ID policy, quality statuses, outlier flags, and search/filter-ready
-- classifications. This remains a local-development data layer. It does not
-- connect APIs, the frontend dashboard, zoning, floodplain, permits, AI, or
-- forecasting systems.

DROP TABLE IF EXISTS public.parcels_enriched;

CREATE TABLE public.parcels_enriched AS
WITH duplicate_pin14 AS (
  SELECT
    pin14,
    COUNT(*) AS pin14_group_count
  FROM public.parcels_clean
  WHERE pin14 IS NOT NULL
  GROUP BY pin14
),
source_geometry AS (
  -- public.parcels_clean contains repaired geometry. The raw table is only
  -- referenced here to keep a quality flag for records repaired from invalid
  -- source geometry.
  SELECT
    objectid_1::bigint AS objectid_1,
    NOT ST_IsValid(geometry) AS source_geometry_was_invalid
  FROM public.parcels
  WHERE geometry IS NOT NULL
),
valuation_stats AS (
  SELECT
    percentile_cont(0.995) WITHIN GROUP (ORDER BY value_per_acre)
      AS value_per_acre_p995
  FROM public.parcels_clean
  WHERE value_per_acre IS NOT NULL
    AND parcel_area_acres_calc >= 0.01
),
base AS (
  SELECT
    clean.*,
    'CFS-PARCEL-' || lpad(clean.objectid_1::text, 10, '0') AS official_parcel_id,
    COALESCE(duplicate_pin14.pin14_group_count, 0) AS pin14_group_count,
    COALESCE(duplicate_pin14.pin14_group_count, 0) > 1 AS has_duplicate_pin14,
    ST_IsValid(clean.geometry) AS has_valid_geometry,
    clean.parcel_area_acres_calc IS NOT NULL
      AND clean.parcel_area_acres_calc > 0 AS has_valid_area,
    clean.marketvalue_numeric IS NOT NULL
      OR clean.assessedvalue_numeric IS NOT NULL
      OR clean.landvalue_numeric IS NOT NULL
      OR clean.buildingvalue_numeric IS NOT NULL AS has_valid_value_fields,
    COALESCE(source_geometry.source_geometry_was_invalid, false)
      AS source_geometry_was_invalid,
    COALESCE(clean.marketvalue_numeric, clean.assessedvalue_numeric)
      AS valuation_basis,
    COUNT(*) OVER (PARTITION BY clean.nbh_name) AS neighborhood_parcel_count,
    (
      CASE WHEN clean.pin14 IS NULL THEN 1 ELSE 0 END +
      CASE WHEN clean.propertyreal_id IS NULL THEN 1 ELSE 0 END +
      CASE WHEN clean.legaldesc IS NULL THEN 1 ELSE 0 END +
      CASE WHEN clean.subdiv_name IS NULL THEN 1 ELSE 0 END +
      CASE WHEN clean.nbh_name IS NULL THEN 1 ELSE 0 END +
      CASE WHEN clean.mailaddr1 IS NULL THEN 1 ELSE 0 END +
      CASE WHEN clean.mailcity IS NULL THEN 1 ELSE 0 END +
      CASE WHEN clean.mailzipcode IS NULL THEN 1 ELSE 0 END +
      CASE WHEN clean.marketvalue_numeric IS NULL THEN 1 ELSE 0 END +
      CASE WHEN clean.assessedvalue_numeric IS NULL THEN 1 ELSE 0 END +
      CASE WHEN clean.landvalue_numeric IS NULL THEN 1 ELSE 0 END +
      CASE WHEN clean.buildingvalue_numeric IS NULL THEN 1 ELSE 0 END +
      CASE WHEN clean.saleprice IS NULL THEN 1 ELSE 0 END +
      CASE WHEN clean.deedbook IS NULL THEN 1 ELSE 0 END
    ) AS null_signal_count,
    (
      clean.subdiv_name IS NOT NULL
      AND (
      upper(clean.subdiv_name) IN (
        'NO SUBDIVISION',
        'ROWAN COUNTY PARCEL',
        'UNKNOWN',
        'N/A',
        'NA'
      )
      OR upper(clean.subdiv_name) LIKE '%COUNTY PARCEL%'
      OR upper(clean.subdiv_name) LIKE 'NO %'
      )
    ) AS is_suspicious_subdivision,
    valuation_stats.value_per_acre_p995
  FROM public.parcels_clean AS clean
  LEFT JOIN duplicate_pin14
    ON duplicate_pin14.pin14 = clean.pin14
  LEFT JOIN source_geometry
    ON source_geometry.objectid_1 = clean.objectid_1
  CROSS JOIN valuation_stats
),
classified AS (
  SELECT
    base.*,
    CASE
      WHEN NOT has_valid_geometry THEN 'invalid_or_missing'
      WHEN source_geometry_was_invalid THEN 'repaired_from_source'
      ELSE 'valid'
    END AS geometry_quality_status,
    CASE
      WHEN NOT has_valid_area THEN 'invalid_area'
      WHEN parcel_area_acres_calc < 0.01 THEN 'micro_area_review'
      WHEN parcel_area_acres_calc >= 500 THEN 'extreme_large_area_review'
      WHEN parcel_area_acres_calc >= 100 THEN 'large_area_review'
      ELSE 'valid'
    END AS area_quality_status,
    CASE
      WHEN NOT has_valid_value_fields THEN 'missing_values'
      WHEN deferredvalue_numeric < 0 THEN 'negative_deferred_value_review'
      WHEN value_per_acre IS NOT NULL
        AND value_per_acre_p995 IS NOT NULL
        AND value_per_acre > value_per_acre_p995 THEN 'extreme_value_per_acre_review'
      ELSE 'valid'
    END AS valuation_quality_status,
    CASE
      WHEN subdiv_name IS NULL THEN 'missing_subdivision'
      WHEN is_suspicious_subdivision THEN 'administrative_or_placeholder_review'
      ELSE 'valid'
    END AS subdivision_quality_status,
    CASE
      WHEN NOT has_valid_area THEN 'unknown'
      WHEN parcel_area_acres_calc < 0.01 THEN 'micro'
      WHEN parcel_area_acres_calc < 2 THEN 'residential_standard'
      WHEN parcel_area_acres_calc < 10 THEN 'estate'
      WHEN parcel_area_acres_calc < 100 THEN 'commercial_large'
      ELSE 'extreme_large'
    END AS parcel_size_category,
    CASE
      WHEN valuation_basis IS NULL THEN 'unknown'
      WHEN valuation_basis < 150000 THEN 'low'
      WHEN valuation_basis < 500000 THEN 'medium'
      WHEN valuation_basis < 1000000 THEN 'high'
      WHEN valuation_basis < 5000000 THEN 'luxury'
      ELSE 'ultra_high'
    END AS valuation_band,
    CASE
      WHEN nbh_name IS NULL THEN 'unknown'
      WHEN neighborhood_parcel_count < 50 THEN 'sparse'
      WHEN neighborhood_parcel_count < 200 THEN 'low'
      WHEN neighborhood_parcel_count < 500 THEN 'moderate'
      WHEN neighborhood_parcel_count < 1000 THEN 'high'
      ELSE 'very_high'
    END AS neighborhood_density_class
  FROM base
),
flagged AS (
  SELECT
    classified.*,
    array_remove(ARRAY[
      CASE WHEN source_geometry_was_invalid THEN 'source_geometry_repaired' END,
      CASE WHEN NOT has_valid_geometry THEN 'invalid_clean_geometry' END,
      CASE WHEN NOT has_valid_area THEN 'invalid_area' END,
      CASE WHEN parcel_area_acres_calc < 0.01 THEN 'tiny_area_outlier' END,
      CASE WHEN parcel_area_acres_calc >= 500 THEN 'huge_area_outlier' END,
      CASE
        WHEN value_per_acre IS NOT NULL
          AND value_per_acre_p995 IS NOT NULL
          AND value_per_acre > value_per_acre_p995
        THEN 'extreme_value_per_acre'
      END,
      CASE WHEN has_duplicate_pin14 THEN 'duplicate_pin14' END,
      CASE WHEN pin14 IS NULL THEN 'missing_pin14' END,
      CASE WHEN is_suspicious_subdivision THEN 'suspicious_subdivision' END,
      CASE WHEN subdiv_name IS NULL THEN 'missing_subdivision' END,
      CASE WHEN nbh_name IS NULL THEN 'missing_neighborhood' END,
      CASE WHEN NOT has_valid_value_fields THEN 'missing_value_fields' END,
      CASE WHEN null_signal_count >= 7 THEN 'null_heavy_record' END
    ]::text[], NULL) AS outlier_flags
  FROM classified
)
SELECT
  official_parcel_id,
  objectid_1,
  pin14,
  source_objectid,
  oldpin,
  propertyreal_id,
  legaldesc,
  subdiv_name,
  nbh_name,
  acctname1,
  acctname2,
  mailaddr1,
  mailaddr2,
  mailcity,
  mailstate,
  mailzipcode,
  saleyear,
  salemonth,
  saleprice,
  deedbook,
  deedpage,
  shape_starea,
  shape_stlength,
  marketvalue_numeric,
  assessedvalue_numeric,
  landvalue_numeric,
  deferredvalue_numeric,
  buildingvalue_numeric,
  obxfvalue_numeric,
  valuation_basis,
  parcel_area_sq_m,
  parcel_area_acres_calc,
  value_per_acre,
  CASE
    WHEN NOT has_valid_geometry
      OR NOT has_valid_area
      OR objectid_1 IS NULL THEN 'critical'
    WHEN cardinality(outlier_flags) > 0 THEN 'review'
    ELSE 'trusted'
  END AS parcel_quality_status,
  geometry_quality_status,
  area_quality_status,
  valuation_quality_status,
  subdivision_quality_status,
  outlier_flags,
  cardinality(outlier_flags) AS outlier_flag_count,
  has_duplicate_pin14,
  has_valid_geometry,
  has_valid_area,
  has_valid_value_fields,
  is_suspicious_subdivision AS is_probable_administrative_group,
  source_geometry_was_invalid,
  pin14_group_count,
  null_signal_count,
  parcel_size_category,
  valuation_band,
  neighborhood_density_class,
  neighborhood_parcel_count,
  value_per_acre_p995,
  transformed_at,
  now()::timestamptz AS enriched_at,
  geometry
FROM flagged;

COMMENT ON TABLE public.parcels_enriched IS
  'Trusted CFS parcel intelligence enrichment layer built from public.parcels_clean for local Phase 2 planning.';
COMMENT ON COLUMN public.parcels_enriched.official_parcel_id IS
  'Stable CFS parcel ID generated from objectid_1: CFS-PARCEL-{zero-padded objectid_1}.';
COMMENT ON COLUMN public.parcels_enriched.pin14 IS
  'Business parcel identifier retained for search and future joins, but not unique.';
COMMENT ON COLUMN public.parcels_enriched.outlier_flags IS
  'Array of local quality/outlier flags for review before future APIs or analytics.';

ALTER TABLE public.parcels_enriched
  ADD CONSTRAINT parcels_enriched_pkey PRIMARY KEY (official_parcel_id);

CREATE UNIQUE INDEX IF NOT EXISTS parcels_enriched_objectid_1_uidx
  ON public.parcels_enriched (objectid_1);

CREATE INDEX IF NOT EXISTS parcels_enriched_pin14_idx
  ON public.parcels_enriched (pin14);

CREATE INDEX IF NOT EXISTS parcels_enriched_parcel_quality_status_idx
  ON public.parcels_enriched (parcel_quality_status);

CREATE INDEX IF NOT EXISTS parcels_enriched_subdivision_quality_status_idx
  ON public.parcels_enriched (subdivision_quality_status);

CREATE INDEX IF NOT EXISTS parcels_enriched_valuation_band_idx
  ON public.parcels_enriched (valuation_band);

CREATE INDEX IF NOT EXISTS parcels_enriched_parcel_size_category_idx
  ON public.parcels_enriched (parcel_size_category);

CREATE INDEX IF NOT EXISTS parcels_enriched_neighborhood_density_class_idx
  ON public.parcels_enriched (neighborhood_density_class);

CREATE INDEX IF NOT EXISTS parcels_enriched_subdiv_name_idx
  ON public.parcels_enriched (subdiv_name);

CREATE INDEX IF NOT EXISTS parcels_enriched_nbh_name_idx
  ON public.parcels_enriched (nbh_name);

CREATE INDEX IF NOT EXISTS parcels_enriched_geometry_gix
  ON public.parcels_enriched USING GIST (geometry);

ANALYZE public.parcels_enriched;
