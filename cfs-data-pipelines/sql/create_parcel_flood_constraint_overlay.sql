-- Cabarrus FutureScape Phase 7B parcel flood constraint overlay.
--
-- Builds one row per parcel by intersecting public.parcels_enriched with
-- authoritative FEMA NFHL Layer 28 flood hazard zones. Dominant zone is based
-- on largest overlap area, while severity uses the highest-risk overlap so
-- small floodways are not hidden by larger low-risk Zone X areas.

DROP TABLE IF EXISTS public.parcel_flood_constraint_overlay;

CREATE TEMP TABLE tmp_fema_nfhl_flood_zones_subdivided
ON COMMIT DROP AS
SELECT
  flood_zone_internal_id,
  flood_zone_code,
  flood_constraint_type,
  flood_severity_class,
  is_floodway,
  sfha_tf,
  zone_subtype_raw,
  (ST_Dump(ST_Subdivide(geometry, 256))).geom::geometry(Polygon, 4326) AS geometry
FROM public.fema_nfhl_flood_zones_clean
WHERE geometry IS NOT NULL;

CREATE INDEX tmp_fema_nfhl_flood_zones_subdivided_gix
  ON tmp_fema_nfhl_flood_zones_subdivided
  USING GIST (geometry);

ANALYZE tmp_fema_nfhl_flood_zones_subdivided;

CREATE TABLE public.parcel_flood_constraint_overlay AS
WITH parcel_base AS (
  SELECT
    official_parcel_id,
    pin14,
    objectid_1,
    COALESCE(
      NULLIF(parcel_area_acres_calc, 0),
      ST_Area(geometry::geography) / 4046.8564224
    ) AS parcel_area_acres,
    geometry
  FROM public.parcels_enriched
  WHERE geometry IS NOT NULL
),
intersection_candidates AS (
  SELECT
    parcel.official_parcel_id,
    COALESCE(
      NULLIF(parcel.parcel_area_acres_calc, 0),
      ST_Area(parcel.geometry::geography) / 4046.8564224
    ) AS parcel_area_acres,
    flood.flood_zone_internal_id,
    flood.flood_zone_code,
    flood.flood_constraint_type,
    flood.flood_severity_class,
    flood.is_floodway,
    flood.sfha_tf,
    flood.zone_subtype_raw,
    ST_CollectionExtract(
      ST_Intersection(parcel.geometry, flood.geometry),
      3
    ) AS overlap_geometry
  FROM public.parcels_enriched AS parcel
  JOIN tmp_fema_nfhl_flood_zones_subdivided AS flood
    ON parcel.geometry && flood.geometry
   AND ST_Intersects(parcel.geometry, flood.geometry)
  WHERE parcel.geometry IS NOT NULL
),
valid_overlaps AS (
  SELECT
    official_parcel_id,
    parcel_area_acres,
    flood_zone_internal_id,
    flood_zone_code,
    flood_constraint_type,
    flood_severity_class,
    is_floodway,
    sfha_tf,
    zone_subtype_raw,
    overlap_geometry,
    ST_Area(overlap_geometry::geography) / 4046.8564224 AS overlap_area_acres
  FROM intersection_candidates
  WHERE overlap_geometry IS NOT NULL
    AND NOT ST_IsEmpty(overlap_geometry)
),
overlap_metrics AS (
  SELECT
    *,
    CASE
      WHEN parcel_area_acres > 0
      THEN LEAST(1.0, overlap_area_acres / parcel_area_acres)
      ELSE NULL
    END AS overlap_pct,
    CASE flood_severity_class
      WHEN 'severe' THEN 4
      WHEN 'high' THEN 3
      WHEN 'moderate' THEN 2
      WHEN 'low' THEN 1
      ELSE 0
    END AS severity_rank
  FROM valid_overlaps
  WHERE overlap_area_acres > 0
),
zone_overlap_rollup AS (
  SELECT
    official_parcel_id,
    flood_zone_code,
    flood_constraint_type,
    flood_severity_class,
    BOOL_OR(is_floodway) AS is_floodway,
    BOOL_OR(sfha_tf IN ('T', 'TRUE', 'Y', 'YES')) AS is_sfha,
    MAX(severity_rank) AS severity_rank,
    SUM(overlap_area_acres) AS zone_overlap_area_acres
  FROM overlap_metrics
  GROUP BY
    official_parcel_id,
    flood_zone_code,
    flood_constraint_type,
    flood_severity_class
),
dominant_overlap AS (
  SELECT
    official_parcel_id,
    flood_zone_code AS dominant_flood_zone,
    flood_constraint_type AS dominant_flood_constraint_type,
    flood_severity_class AS dominant_flood_zone_severity,
    zone_overlap_area_acres AS dominant_flood_zone_area_acres
  FROM (
    SELECT
      *,
      ROW_NUMBER() OVER (
        PARTITION BY official_parcel_id
        ORDER BY zone_overlap_area_acres DESC,
                 severity_rank DESC,
                 flood_zone_code,
                 flood_constraint_type
      ) AS overlap_rank
    FROM zone_overlap_rollup
  ) AS ranked
  WHERE overlap_rank = 1
),
area_rollup AS (
  SELECT
    official_parcel_id,
    COUNT(*) AS flood_zone_overlap_count,
    ARRAY_AGG(DISTINCT flood_zone_code ORDER BY flood_zone_code)
      FILTER (WHERE flood_zone_code IS NOT NULL) AS flood_zone_codes,
    BOOL_OR(flood_constraint_type = 'floodway' OR is_floodway) AS floodway_present,
    BOOL_OR(sfha_tf IN ('T', 'TRUE', 'Y', 'YES')) AS sfha_present,
    BOOL_OR(flood_constraint_type = 'moderate_flood_hazard') AS moderate_flood_present,
    BOOL_OR(flood_constraint_type = 'minimal_flood_hazard') AS minimal_flood_present,
    MAX(severity_rank) AS max_severity_rank,
    CASE
      WHEN COUNT(*) FILTER (
        WHERE flood_constraint_type IN (
          'floodway',
          'special_flood_hazard_area',
          'moderate_flood_hazard'
        )
      ) > 0
      THEN ST_Area(
        ST_UnaryUnion(
          ST_Collect(overlap_geometry) FILTER (
            WHERE flood_constraint_type IN (
              'floodway',
              'special_flood_hazard_area',
              'moderate_flood_hazard'
            )
          )
        )::geography
      ) / 4046.8564224
      ELSE 0
    END AS flood_constrained_area_acres,
    CASE
      WHEN COUNT(*) FILTER (
        WHERE flood_constraint_type = 'floodway' OR is_floodway
      ) > 0
      THEN ST_Area(
        ST_UnaryUnion(
          ST_Collect(overlap_geometry) FILTER (
            WHERE flood_constraint_type = 'floodway' OR is_floodway
          )
        )::geography
      ) / 4046.8564224
      ELSE 0
    END AS floodway_area_acres,
    CASE
      WHEN COUNT(*) FILTER (
        WHERE sfha_tf IN ('T', 'TRUE', 'Y', 'YES')
      ) > 0
      THEN ST_Area(
        ST_UnaryUnion(
          ST_Collect(overlap_geometry) FILTER (
            WHERE sfha_tf IN ('T', 'TRUE', 'Y', 'YES')
          )
        )::geography
      ) / 4046.8564224
      ELSE 0
    END AS sfha_area_acres,
    MIN(overlap_area_acres) AS min_overlap_area_acres,
    MAX(overlap_area_acres) AS max_overlap_area_acres,
    SUM(overlap_area_acres) AS raw_overlap_area_acres
  FROM overlap_metrics
  GROUP BY official_parcel_id
),
scored AS (
  SELECT
    parcel.official_parcel_id,
    parcel.pin14,
    parcel.objectid_1,
    parcel.parcel_area_acres,
    COALESCE(rollup.flood_zone_overlap_count, 0) AS flood_zone_overlap_count,
    COALESCE(rollup.flood_zone_codes, ARRAY[]::text[]) AS flood_zone_codes,
    COALESCE(rollup.floodway_present, FALSE) AS floodway_present,
    COALESCE(rollup.sfha_present, FALSE) AS sfha_present,
    COALESCE(rollup.moderate_flood_present, FALSE) AS moderate_flood_present,
    COALESCE(rollup.minimal_flood_present, FALSE) AS minimal_flood_present,
    COALESCE(rollup.max_severity_rank, 0) AS max_severity_rank,
    COALESCE(dominant.dominant_flood_zone, 'NO_FEMA_OVERLAP') AS dominant_flood_zone,
    COALESCE(dominant.dominant_flood_constraint_type, 'no_flood_constraint')
      AS dominant_flood_constraint_type,
    COALESCE(rollup.flood_constrained_area_acres, 0) AS flood_constrained_area_acres,
    COALESCE(rollup.floodway_area_acres, 0) AS floodway_area_acres,
    COALESCE(rollup.sfha_area_acres, 0) AS sfha_area_acres,
    CASE
      WHEN parcel.parcel_area_acres > 0
      THEN LEAST(
        100.0,
        COALESCE(rollup.flood_constrained_area_acres, 0) / parcel.parcel_area_acres * 100.0
      )
      ELSE NULL
    END AS percent_parcel_constrained,
    CASE
      WHEN parcel.parcel_area_acres > 0
      THEN LEAST(
        100.0,
        COALESCE(rollup.floodway_area_acres, 0) / parcel.parcel_area_acres * 100.0
      )
      ELSE NULL
    END AS percent_parcel_floodway,
    CASE
      WHEN parcel.parcel_area_acres > 0
      THEN LEAST(
        100.0,
        COALESCE(rollup.sfha_area_acres, 0) / parcel.parcel_area_acres * 100.0
      )
      ELSE NULL
    END AS percent_parcel_sfha,
    rollup.min_overlap_area_acres,
    rollup.max_overlap_area_acres,
    rollup.raw_overlap_area_acres,
    parcel.geometry
  FROM parcel_base AS parcel
  LEFT JOIN area_rollup AS rollup
    ON rollup.official_parcel_id = parcel.official_parcel_id
  LEFT JOIN dominant_overlap AS dominant
    ON dominant.official_parcel_id = parcel.official_parcel_id
)
SELECT
  official_parcel_id,
  pin14,
  objectid_1,
  floodway_present OR sfha_present OR moderate_flood_present AS floodplain_present,
  floodway_present,
  sfha_present,
  moderate_flood_present,
  minimal_flood_present,
  dominant_flood_zone,
  flood_zone_codes,
  dominant_flood_constraint_type,
  CASE max_severity_rank
    WHEN 4 THEN 'severe'
    WHEN 3 THEN 'high'
    WHEN 2 THEN 'moderate'
    WHEN 1 THEN 'low'
    ELSE 'none'
  END AS flood_severity_class,
  ROUND(parcel_area_acres::numeric, 4) AS parcel_area_acres,
  ROUND(flood_constrained_area_acres::numeric, 4) AS flood_constrained_area_acres,
  ROUND(floodway_area_acres::numeric, 4) AS floodway_area_acres,
  ROUND(sfha_area_acres::numeric, 4) AS sfha_area_acres,
  ROUND(percent_parcel_constrained::numeric, 4) AS percent_parcel_constrained,
  ROUND(percent_parcel_floodway::numeric, 4) AS percent_parcel_floodway,
  ROUND(percent_parcel_sfha::numeric, 4) AS percent_parcel_sfha,
  (
    floodway_present
    OR sfha_present
    OR COALESCE(percent_parcel_constrained, 0) >= 5.0
  ) AS flood_review_required,
  CASE
    WHEN floodway_present OR COALESCE(percent_parcel_constrained, 0) >= 50.0
      THEN 'severe'
    WHEN (sfha_present AND COALESCE(percent_parcel_sfha, 0) >= 10.0)
      OR COALESCE(percent_parcel_constrained, 0) >= 25.0
      THEN 'high'
    WHEN (sfha_present OR moderate_flood_present)
      AND COALESCE(percent_parcel_constrained, 0) >= 5.0
      THEN 'moderate'
    WHEN COALESCE(percent_parcel_constrained, 0) > 0
      OR minimal_flood_present
      THEN 'low'
    ELSE 'none'
  END AS buildability_impact,
  ROUND(
    CASE
      WHEN floodway_present
        THEN LEAST(100.0, 85.0 + COALESCE(percent_parcel_floodway, 0) * 0.15
                         + COALESCE(percent_parcel_constrained, 0) * 0.05)
      WHEN sfha_present
        THEN LEAST(85.0, 65.0 + COALESCE(percent_parcel_sfha, 0) * 0.20)
      WHEN moderate_flood_present
        THEN LEAST(60.0, 35.0 + COALESCE(percent_parcel_constrained, 0) * 0.20)
      WHEN minimal_flood_present
        THEN 10.0
      ELSE 0.0
    END::numeric,
    2
  ) AS flood_constraint_score,
  CASE
    WHEN parcel_area_acres IS NULL OR parcel_area_acres <= 0 THEN 'low'
    WHEN flood_zone_overlap_count > 0
      AND COALESCE(max_overlap_area_acres, 0) < 0.0001 THEN 'medium'
    ELSE 'high'
  END AS overlay_confidence,
  flood_zone_overlap_count,
  ROUND(COALESCE(min_overlap_area_acres, 0)::numeric, 6) AS min_overlap_area_acres,
  ROUND(COALESCE(max_overlap_area_acres, 0)::numeric, 6) AS max_overlap_area_acres,
  ROUND(COALESCE(raw_overlap_area_acres, 0)::numeric, 4) AS raw_overlap_area_acres,
  NOW()::timestamptz AS overlaid_at,
  ST_Multi(
    ST_CollectionExtract(
      ST_MakeValid(
        CASE
          WHEN ST_SRID(geometry) = 0 THEN ST_SetSRID(geometry, 4326)
          WHEN ST_SRID(geometry) <> 4326 THEN ST_Transform(geometry, 4326)
          ELSE geometry
        END
      ),
      3
    )
  )::geometry(MultiPolygon, 4326) AS geometry
FROM scored;

COMMENT ON TABLE public.parcel_flood_constraint_overlay IS
  'CFS parcel-level FEMA NFHL Layer 28 flood constraint overlay. One row per parcel from public.parcels_enriched.';
COMMENT ON COLUMN public.parcel_flood_constraint_overlay.dominant_flood_zone IS
  'Flood zone code with the largest parcel overlap area. Severity is calculated separately from highest-risk overlap.';
COMMENT ON COLUMN public.parcel_flood_constraint_overlay.flood_constrained_area_acres IS
  'Unioned area of floodway, special flood hazard area, and moderate flood hazard overlaps. Minimal Zone X is tracked separately and not counted as constrained area.';
COMMENT ON COLUMN public.parcel_flood_constraint_overlay.percent_parcel_constrained IS
  'Flood constrained area divided by parcel area, expressed as 0-100 percent.';
COMMENT ON COLUMN public.parcel_flood_constraint_overlay.flood_constraint_score IS
  'Deterministic planning score from 0-100 based on highest flood severity and affected parcel percentage. Not a prediction model.';

ALTER TABLE public.parcel_flood_constraint_overlay
  ADD CONSTRAINT parcel_flood_constraint_overlay_pkey PRIMARY KEY (official_parcel_id);

CREATE INDEX IF NOT EXISTS parcel_flood_constraint_overlay_objectid_1_idx
  ON public.parcel_flood_constraint_overlay (objectid_1);

CREATE INDEX IF NOT EXISTS parcel_flood_constraint_overlay_pin14_idx
  ON public.parcel_flood_constraint_overlay (pin14);

CREATE INDEX IF NOT EXISTS parcel_flood_constraint_overlay_zone_idx
  ON public.parcel_flood_constraint_overlay (dominant_flood_zone);

CREATE INDEX IF NOT EXISTS parcel_flood_constraint_overlay_severity_idx
  ON public.parcel_flood_constraint_overlay (flood_severity_class);

CREATE INDEX IF NOT EXISTS parcel_flood_constraint_overlay_review_idx
  ON public.parcel_flood_constraint_overlay (flood_review_required);

CREATE INDEX IF NOT EXISTS parcel_flood_constraint_overlay_buildability_idx
  ON public.parcel_flood_constraint_overlay (buildability_impact);

CREATE INDEX IF NOT EXISTS parcel_flood_constraint_overlay_score_idx
  ON public.parcel_flood_constraint_overlay (flood_constraint_score);

CREATE INDEX IF NOT EXISTS parcel_flood_constraint_overlay_geometry_gix
  ON public.parcel_flood_constraint_overlay
  USING GIST (geometry);

ANALYZE public.parcel_flood_constraint_overlay;
