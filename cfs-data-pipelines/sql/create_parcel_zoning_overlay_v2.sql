-- Cabarrus FutureScape Phase 2 multi-source parcel zoning overlay v2.
--
-- Builds one zoning intelligence row per parcel using every normalized zoning
-- jurisdiction in public.zoning_jurisdictional_clean. Dominant assignment is
-- based on largest spatial overlap percentage only. Planning boundary context
-- is joined as supporting metadata and is not treated as zoning.

DROP TABLE IF EXISTS public.parcel_zoning_overlay_v2;

CREATE TABLE public.parcel_zoning_overlay_v2 AS
WITH parcel_base AS (
  SELECT
    official_parcel_id,
    objectid_1,
    pin14,
    parcel_area_sq_m,
    parcel_area_acres_calc,
    parcel_quality_status,
    nbh_name,
    subdiv_name,
    ST_MakeValid(geometry) AS geometry
  FROM public.parcels_enriched
  WHERE geometry IS NOT NULL
),
planning_context AS (
  SELECT
    official_parcel_id,
    planning_jurisdiction_name,
    planning_boundary_type,
    jurisdiction_join_status AS planning_jurisdiction_join_status,
    jurisdiction_assignment_confidence AS planning_jurisdiction_confidence
  FROM public.parcel_jurisdiction_overlay
),
intersection_candidates AS (
  SELECT
    parcel.official_parcel_id,
    parcel.objectid_1,
    parcel.pin14,
    parcel.parcel_area_sq_m,
    zoning.zoning_jurisdictional_id,
    zoning.jurisdiction_name AS zoning_jurisdiction_name,
    zoning.source_table,
    zoning.source_url,
    zoning.source_objectid,
    zoning.zoning_code_raw,
    zoning.zoning_general_raw,
    zoning.zoning_general_normalized,
    zoning.zoning_label_normalized,
    ST_CollectionExtract(
      ST_Intersection(parcel.geometry, zoning.geometry),
      3
    ) AS overlap_geometry
  FROM parcel_base AS parcel
  JOIN public.zoning_jurisdictional_clean AS zoning
    ON parcel.geometry && zoning.geometry
   AND ST_Intersects(parcel.geometry, zoning.geometry)
),
valid_overlaps AS (
  SELECT
    official_parcel_id,
    objectid_1,
    pin14,
    parcel_area_sq_m,
    zoning_jurisdictional_id,
    zoning_jurisdiction_name,
    source_table,
    source_url,
    source_objectid,
    zoning_code_raw,
    zoning_general_raw,
    zoning_general_normalized,
    zoning_label_normalized,
    ST_Area(overlap_geometry::geography) AS overlap_area_sq_m
  FROM intersection_candidates
  WHERE overlap_geometry IS NOT NULL
    AND NOT ST_IsEmpty(overlap_geometry)
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
overlap_rollup AS (
  SELECT
    official_parcel_id,
    COUNT(*) AS zoning_overlap_count,
    COUNT(DISTINCT zoning_jurisdiction_name) AS zoning_jurisdiction_overlap_count,
    SUM(overlap_area_sq_m) AS total_overlap_area_sq_m,
    COUNT(*) FILTER (WHERE overlap_pct < 0.01) AS tiny_sliver_overlap_count,
    MAX(overlap_pct) FILTER (
      WHERE zoning_jurisdiction_name = 'Cabarrus County / Unincorporated'
    ) AS county_max_overlap_pct,
    MAX(overlap_pct) FILTER (
      WHERE zoning_jurisdiction_name <> 'Cabarrus County / Unincorporated'
    ) AS municipal_max_overlap_pct
  FROM overlap_metrics
  GROUP BY official_parcel_id
),
ranked_overlaps AS (
  SELECT
    metrics.*,
    ROW_NUMBER() OVER (
      PARTITION BY metrics.official_parcel_id
      ORDER BY metrics.overlap_pct DESC NULLS LAST,
               metrics.overlap_area_sq_m DESC,
               metrics.zoning_jurisdiction_name,
               metrics.zoning_code_raw,
               metrics.zoning_jurisdictional_id
    ) AS zoning_rank
  FROM overlap_metrics AS metrics
),
dominant_zoning AS (
  SELECT
    ranked.official_parcel_id,
    ranked.objectid_1,
    ranked.pin14,
    ranked.zoning_jurisdictional_id AS dominant_zoning_jurisdictional_id,
    ranked.zoning_jurisdiction_name,
    ranked.source_table AS dominant_zoning_source_table,
    ranked.source_url AS dominant_zoning_source_url,
    ranked.source_objectid AS dominant_zoning_source_objectid,
    ranked.zoning_code_raw AS dominant_zoning_code_raw,
    ranked.zoning_general_raw AS dominant_zoning_general_raw,
    ranked.zoning_general_normalized AS dominant_zoning_general_normalized,
    ranked.zoning_label_normalized AS dominant_zoning_label_normalized,
    ranked.overlap_area_sq_m AS dominant_overlap_area_sq_m,
    ranked.overlap_pct AS dominant_overlap_pct,
    CASE
      WHEN ranked.parcel_area_sq_m > 0
      THEN LEAST(1.0, rollup.total_overlap_area_sq_m / ranked.parcel_area_sq_m)
      ELSE NULL
    END AS total_zoning_overlap_pct,
    rollup.zoning_overlap_count,
    rollup.zoning_jurisdiction_overlap_count,
    rollup.tiny_sliver_overlap_count,
    rollup.county_max_overlap_pct,
    rollup.municipal_max_overlap_pct
  FROM ranked_overlaps AS ranked
  JOIN overlap_rollup AS rollup
    ON rollup.official_parcel_id = ranked.official_parcel_id
  WHERE ranked.zoning_rank = 1
),
second_zoning AS (
  SELECT
    official_parcel_id,
    zoning_jurisdictional_id AS second_zoning_jurisdictional_id,
    zoning_jurisdiction_name AS second_zoning_jurisdiction_name,
    zoning_code_raw AS second_zoning_code_raw,
    zoning_general_normalized AS second_zoning_general_normalized,
    zoning_label_normalized AS second_zoning_label_normalized,
    overlap_area_sq_m AS second_overlap_area_sq_m,
    overlap_pct AS second_overlap_pct
  FROM ranked_overlaps
  WHERE zoning_rank = 2
)
SELECT
  parcel.official_parcel_id,
  parcel.objectid_1,
  parcel.pin14,
  parcel.parcel_quality_status,
  parcel.nbh_name,
  parcel.subdiv_name,
  dominant.dominant_zoning_jurisdictional_id,
  dominant.zoning_jurisdiction_name,
  planning.planning_jurisdiction_name,
  planning.planning_boundary_type,
  planning.planning_jurisdiction_join_status,
  planning.planning_jurisdiction_confidence,
  dominant.dominant_zoning_source_table,
  dominant.dominant_zoning_source_url,
  dominant.dominant_zoning_source_objectid,
  dominant.dominant_zoning_code_raw,
  dominant.dominant_zoning_general_raw,
  dominant.dominant_zoning_general_normalized,
  dominant.dominant_zoning_label_normalized,
  COALESCE(dominant.zoning_overlap_count, 0) AS zoning_overlap_count,
  COALESCE(dominant.zoning_jurisdiction_overlap_count, 0) AS zoning_jurisdiction_overlap_count,
  dominant.dominant_overlap_area_sq_m,
  dominant.dominant_overlap_pct,
  dominant.total_zoning_overlap_pct,
  second.second_zoning_jurisdictional_id,
  second.second_zoning_jurisdiction_name,
  second.second_zoning_code_raw,
  second.second_zoning_general_normalized,
  second.second_zoning_label_normalized,
  second.second_overlap_area_sq_m,
  second.second_overlap_pct,
  CASE
    WHEN dominant.dominant_overlap_pct IS NOT NULL
     AND second.second_overlap_pct IS NOT NULL
    THEN dominant.dominant_overlap_pct - second.second_overlap_pct
    ELSE NULL
  END AS top_two_overlap_pct_gap,
  COALESCE(dominant.tiny_sliver_overlap_count, 0) AS tiny_sliver_overlap_count,
  dominant.county_max_overlap_pct,
  dominant.municipal_max_overlap_pct,
  CASE
    WHEN dominant.official_parcel_id IS NULL THEN 'no_match'
    WHEN dominant.dominant_overlap_pct >= 0.95 THEN 'high'
    WHEN dominant.dominant_overlap_pct >= 0.75 THEN 'medium'
    ELSE 'low'
  END AS zoning_assignment_confidence,
  COALESCE(dominant.zoning_overlap_count, 0) > 1 AS has_multiple_zoning,
  COALESCE(dominant.zoning_jurisdiction_overlap_count, 0) > 1 AS has_multiple_zoning_jurisdictions,
  dominant.official_parcel_id IS NULL AS has_no_zoning_match,
  CASE
    WHEN dominant.official_parcel_id IS NULL THEN 'no_match'
    WHEN dominant.zoning_jurisdiction_overlap_count > 1
      AND dominant.dominant_overlap_pct < 0.75 THEN 'multi_jurisdiction_low_confidence'
    WHEN dominant.zoning_jurisdiction_overlap_count > 1 THEN 'multi_jurisdiction_assigned'
    WHEN dominant.zoning_overlap_count > 1
      AND dominant.dominant_overlap_pct < 0.75 THEN 'multi_zone_low_confidence'
    WHEN dominant.zoning_overlap_count > 1 THEN 'multi_zone_assigned'
    WHEN dominant.dominant_overlap_pct < 0.75 THEN 'single_zone_low_confidence'
    ELSE 'assigned'
  END AS zoning_join_status,
  (
    dominant.zoning_jurisdiction_name IS DISTINCT FROM 'Cabarrus County / Unincorporated'
    AND COALESCE(dominant.county_max_overlap_pct, 0) > 0
    AND COALESCE(dominant.municipal_max_overlap_pct, 0) > COALESCE(dominant.county_max_overlap_pct, 0)
  ) AS municipal_zoning_dominates_county_overlap,
  (
    second.second_overlap_pct IS NOT NULL
    AND dominant.dominant_overlap_pct IS NOT NULL
    AND dominant.dominant_overlap_pct - second.second_overlap_pct <= 0.05
  ) AS has_nearly_equal_overlap_split,
  COALESCE(dominant.tiny_sliver_overlap_count, 0) > 0 AS has_tiny_sliver_overlap,
  parcel.parcel_area_sq_m,
  parcel.parcel_area_acres_calc,
  now()::timestamptz AS joined_at,
  parcel.geometry
FROM parcel_base AS parcel
LEFT JOIN dominant_zoning AS dominant
  ON dominant.official_parcel_id = parcel.official_parcel_id
LEFT JOIN second_zoning AS second
  ON second.official_parcel_id = parcel.official_parcel_id
LEFT JOIN planning_context AS planning
  ON planning.official_parcel_id = parcel.official_parcel_id;

COMMENT ON TABLE public.parcel_zoning_overlay_v2 IS
  'CFS multi-source parcel zoning overlay v2. Uses all normalized jurisdictional zoning polygons and assigns dominant zoning by largest parcel overlap percentage.';
COMMENT ON COLUMN public.parcel_zoning_overlay_v2.planning_jurisdiction_name IS
  'Supporting planning/ETJ context from parcel_jurisdiction_overlay. This is not used as zoning and is not a sole routing authority.';
COMMENT ON COLUMN public.parcel_zoning_overlay_v2.dominant_overlap_pct IS
  'Largest zoning intersection area divided by parcel area, capped at 1.0.';
COMMENT ON COLUMN public.parcel_zoning_overlay_v2.zoning_assignment_confidence IS
  'high >= 0.95, medium >= 0.75 and < 0.95, low < 0.75, no_match for parcels without zoning overlap.';
COMMENT ON COLUMN public.parcel_zoning_overlay_v2.municipal_zoning_dominates_county_overlap IS
  'True when the dominant zoning source is municipal and its overlap is strictly larger than the county zoning overlap.';

ALTER TABLE public.parcel_zoning_overlay_v2
  ADD CONSTRAINT parcel_zoning_overlay_v2_pkey PRIMARY KEY (official_parcel_id);

CREATE INDEX IF NOT EXISTS parcel_zoning_overlay_v2_objectid_1_idx
  ON public.parcel_zoning_overlay_v2 (objectid_1);

CREATE INDEX IF NOT EXISTS parcel_zoning_overlay_v2_pin14_idx
  ON public.parcel_zoning_overlay_v2 (pin14);

CREATE INDEX IF NOT EXISTS parcel_zoning_overlay_v2_zoning_jurisdiction_idx
  ON public.parcel_zoning_overlay_v2 (zoning_jurisdiction_name);

CREATE INDEX IF NOT EXISTS parcel_zoning_overlay_v2_planning_jurisdiction_idx
  ON public.parcel_zoning_overlay_v2 (planning_jurisdiction_name);

CREATE INDEX IF NOT EXISTS parcel_zoning_overlay_v2_zoning_code_idx
  ON public.parcel_zoning_overlay_v2 (dominant_zoning_code_raw);

CREATE INDEX IF NOT EXISTS parcel_zoning_overlay_v2_zoning_general_idx
  ON public.parcel_zoning_overlay_v2 (dominant_zoning_general_normalized);

CREATE INDEX IF NOT EXISTS parcel_zoning_overlay_v2_confidence_idx
  ON public.parcel_zoning_overlay_v2 (zoning_assignment_confidence);

CREATE INDEX IF NOT EXISTS parcel_zoning_overlay_v2_join_status_idx
  ON public.parcel_zoning_overlay_v2 (zoning_join_status);

CREATE INDEX IF NOT EXISTS parcel_zoning_overlay_v2_geometry_gix
  ON public.parcel_zoning_overlay_v2 USING GIST (geometry);

ANALYZE public.parcel_zoning_overlay_v2;
