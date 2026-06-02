-- Cabarrus FutureScape Phase 2 parcel-zoning spatial overlay pilot.
--
-- Builds one zoning intelligence row per parcel from public.parcels_enriched
-- and public.zoning_clean. This is a local-development join-validation layer.
-- It does not connect APIs, the frontend dashboard, forecasting, or AI systems.

DROP TABLE IF EXISTS public.parcel_zoning_overlay;

CREATE TABLE public.parcel_zoning_overlay AS
WITH parcel_base AS (
  SELECT
    official_parcel_id,
    objectid_1,
    pin14,
    parcel_area_sq_m,
    parcel_area_acres_calc,
    parcel_quality_status,
    geometry
  FROM public.parcels_enriched
  WHERE geometry IS NOT NULL
),
intersection_candidates AS (
  SELECT
    parcel.official_parcel_id,
    parcel.objectid_1,
    parcel.pin14,
    parcel.parcel_area_sq_m,
    zoning.zoning_internal_id,
    zoning.zoning_code,
    zoning.zoning_general,
    zoning.zoning_label,
    ST_CollectionExtract(
      ST_Intersection(parcel.geometry, zoning.geometry),
      3
    ) AS overlap_geometry
  FROM parcel_base AS parcel
  JOIN public.zoning_clean AS zoning
    ON parcel.geometry && zoning.geometry
   AND ST_Intersects(parcel.geometry, zoning.geometry)
),
valid_overlaps AS (
  SELECT
    official_parcel_id,
    objectid_1,
    pin14,
    parcel_area_sq_m,
    zoning_internal_id,
    zoning_code,
    zoning_general,
    zoning_label,
    ST_Area(overlap_geometry::geography) AS overlap_area_sq_m
  FROM intersection_candidates
  WHERE NOT ST_IsEmpty(overlap_geometry)
),
overlap_metrics AS (
  SELECT
    *,
    CASE
      WHEN parcel_area_sq_m > 0
      THEN LEAST(1.0, overlap_area_sq_m / parcel_area_sq_m)
      ELSE NULL
    END AS overlap_pct
  FROM valid_overlaps
  WHERE overlap_area_sq_m > 0
),
ranked_overlaps AS (
  SELECT
    *,
    ROW_NUMBER() OVER (
      PARTITION BY official_parcel_id
      ORDER BY overlap_pct DESC NULLS LAST,
               overlap_area_sq_m DESC,
               zoning_code,
               zoning_general,
               zoning_internal_id
    ) AS zoning_rank,
    COUNT(*) OVER (PARTITION BY official_parcel_id) AS zoning_overlap_count,
    SUM(overlap_area_sq_m) OVER (PARTITION BY official_parcel_id) AS total_overlap_area_sq_m
  FROM overlap_metrics
),
dominant_zoning AS (
  SELECT
    official_parcel_id,
    objectid_1,
    pin14,
    zoning_internal_id AS dominant_zoning_internal_id,
    zoning_code AS dominant_zoning_code,
    zoning_general AS dominant_zoning_general,
    zoning_label AS dominant_zoning_label,
    zoning_overlap_count,
    overlap_area_sq_m AS dominant_overlap_area_sq_m,
    overlap_pct AS dominant_overlap_pct,
    CASE
      WHEN parcel_area_sq_m > 0
      THEN LEAST(1.0, total_overlap_area_sq_m / parcel_area_sq_m)
      ELSE NULL
    END AS total_zoning_overlap_pct
  FROM ranked_overlaps
  WHERE zoning_rank = 1
)
SELECT
  parcel.official_parcel_id,
  parcel.objectid_1,
  parcel.pin14,
  dominant.dominant_zoning_internal_id,
  dominant.dominant_zoning_code,
  dominant.dominant_zoning_general,
  dominant.dominant_zoning_label,
  COALESCE(dominant.zoning_overlap_count, 0) AS zoning_overlap_count,
  dominant.dominant_overlap_area_sq_m,
  dominant.dominant_overlap_pct,
  dominant.total_zoning_overlap_pct,
  CASE
    WHEN dominant.official_parcel_id IS NULL THEN 'no_match'
    WHEN dominant.dominant_overlap_pct >= 0.95 THEN 'high'
    WHEN dominant.dominant_overlap_pct >= 0.75 THEN 'medium'
    ELSE 'low'
  END AS zoning_assignment_confidence,
  COALESCE(dominant.zoning_overlap_count, 0) > 1 AS has_multiple_zoning,
  dominant.official_parcel_id IS NULL AS has_no_zoning_match,
  CASE
    WHEN dominant.official_parcel_id IS NULL THEN 'no_match'
    WHEN dominant.zoning_overlap_count > 1
      AND dominant.dominant_overlap_pct < 0.75 THEN 'multi_zone_low_confidence'
    WHEN dominant.zoning_overlap_count > 1 THEN 'multi_zone_assigned'
    WHEN dominant.dominant_overlap_pct < 0.75 THEN 'single_zone_low_confidence'
    ELSE 'assigned'
  END AS zoning_join_status,
  parcel.parcel_area_sq_m,
  parcel.parcel_area_acres_calc,
  parcel.parcel_quality_status,
  now()::timestamptz AS joined_at,
  parcel.geometry
FROM parcel_base AS parcel
LEFT JOIN dominant_zoning AS dominant
  ON dominant.official_parcel_id = parcel.official_parcel_id;

COMMENT ON TABLE public.parcel_zoning_overlay IS
  'CFS parcel-zoning spatial overlay pilot. One row per parcel with dominant zoning assignment and join confidence.';
COMMENT ON COLUMN public.parcel_zoning_overlay.dominant_overlap_pct IS
  'Largest zoning intersection area divided by parcel area, capped at 1.0.';
COMMENT ON COLUMN public.parcel_zoning_overlay.zoning_assignment_confidence IS
  'high >= 0.95, medium >= 0.75 and < 0.95, low < 0.75, no_match for parcels without zoning overlap.';

ALTER TABLE public.parcel_zoning_overlay
  ADD CONSTRAINT parcel_zoning_overlay_pkey PRIMARY KEY (official_parcel_id);

CREATE INDEX IF NOT EXISTS parcel_zoning_overlay_pin14_idx
  ON public.parcel_zoning_overlay (pin14);

CREATE INDEX IF NOT EXISTS parcel_zoning_overlay_dominant_zoning_code_idx
  ON public.parcel_zoning_overlay (dominant_zoning_code);

CREATE INDEX IF NOT EXISTS parcel_zoning_overlay_dominant_zoning_general_idx
  ON public.parcel_zoning_overlay (dominant_zoning_general);

CREATE INDEX IF NOT EXISTS parcel_zoning_overlay_zoning_join_status_idx
  ON public.parcel_zoning_overlay (zoning_join_status);

CREATE INDEX IF NOT EXISTS parcel_zoning_overlay_confidence_idx
  ON public.parcel_zoning_overlay (zoning_assignment_confidence);

CREATE INDEX IF NOT EXISTS parcel_zoning_overlay_geometry_gix
  ON public.parcel_zoning_overlay USING GIST (geometry);

ANALYZE public.parcel_zoning_overlay;
