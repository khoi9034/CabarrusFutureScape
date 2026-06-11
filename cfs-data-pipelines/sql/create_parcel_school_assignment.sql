-- Cabarrus FutureScape Phase 8A parcel school attendance-zone assignment.
--
-- Creates exactly one row per parcel. Elementary, middle, and high assignment
-- use attendance-zone polygon overlap only; school point distance is never used.

DROP TABLE IF EXISTS public.parcel_school_assignment;

CREATE TEMP TABLE tmp_school_zones_subdivided
ON COMMIT DROP AS
SELECT
  zone_id,
  school_name_raw,
  school_name_normalized,
  school_level,
  school_system,
  matched_school_reference_id,
  match_confidence,
  source_layer,
  source_layer_id,
  source_objectid,
  (ST_Dump(ST_Subdivide(geometry, 256))).geom::geometry(Polygon, 4326) AS geometry
FROM public.school_zones
WHERE include_in_cfs_v1
  AND geometry IS NOT NULL;

CREATE INDEX tmp_school_zones_subdivided_gix
  ON tmp_school_zones_subdivided
  USING GIST (geometry);

ANALYZE tmp_school_zones_subdivided;

CREATE TABLE public.parcel_school_assignment AS
WITH parcel_base AS (
  SELECT
    official_parcel_id,
    pin14,
    objectid_1,
    COALESCE(
      NULLIF(parcel_area_acres_calc, 0),
      CASE
        WHEN geometry IS NOT NULL THEN ST_Area(geometry::geography) / 4046.8564224
        ELSE NULL
      END
    ) AS parcel_area_acres,
    geometry
  FROM public.parcels_enriched
),
intersection_candidates AS (
  SELECT
    parcel.official_parcel_id,
    parcel.parcel_area_acres,
    zone.zone_id,
    zone.school_name_raw,
    zone.school_name_normalized,
    zone.school_level,
    zone.school_system,
    zone.matched_school_reference_id,
    zone.match_confidence,
    ST_CollectionExtract(
      ST_Intersection(parcel.geometry, zone.geometry),
      3
    ) AS overlap_geometry
  FROM parcel_base AS parcel
  JOIN tmp_school_zones_subdivided AS zone
    ON parcel.geometry && zone.geometry
   AND ST_Intersects(parcel.geometry, zone.geometry)
  WHERE parcel.geometry IS NOT NULL
),
valid_overlaps AS (
  SELECT
    official_parcel_id,
    parcel_area_acres,
    zone_id,
    school_name_raw,
    school_name_normalized,
    school_level,
    school_system,
    matched_school_reference_id,
    match_confidence,
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
      THEN LEAST(100.0, overlap_area_acres / parcel_area_acres * 100.0)
      ELSE NULL
    END AS overlap_percent
  FROM valid_overlaps
  WHERE overlap_area_acres > 0
),
level_counts AS (
  SELECT
    official_parcel_id,
    school_level,
    COUNT(DISTINCT zone_id) AS zone_overlap_count,
    BOOL_OR(matched_school_reference_id IS NULL) AS has_unmatched_reference,
    BOOL_OR(match_confidence NOT IN ('normalized_exact')) AS has_non_exact_reference_match
  FROM overlap_metrics
  GROUP BY official_parcel_id, school_level
),
ranked_overlaps AS (
  SELECT
    *,
    ROW_NUMBER() OVER (
      PARTITION BY official_parcel_id, school_level
      ORDER BY overlap_area_acres DESC, overlap_percent DESC NULLS LAST, zone_id
    ) AS overlap_rank
  FROM overlap_metrics
),
best_overlaps AS (
  SELECT *
  FROM ranked_overlaps
  WHERE overlap_rank = 1
),
pivot_best AS (
  SELECT
    official_parcel_id,

    MAX(zone_id) FILTER (WHERE school_level = 'elementary') AS elementary_zone_id,
    MAX(school_name_raw) FILTER (WHERE school_level = 'elementary') AS elementary_school_name,
    MAX(school_name_normalized) FILTER (WHERE school_level = 'elementary')
      AS elementary_school_name_normalized,
    MAX(overlap_area_acres) FILTER (WHERE school_level = 'elementary')
      AS elementary_overlap_area_acres,
    MAX(overlap_percent) FILTER (WHERE school_level = 'elementary')
      AS elementary_overlap_percent,
    MAX(match_confidence) FILTER (WHERE school_level = 'elementary')
      AS elementary_match_confidence,

    MAX(zone_id) FILTER (WHERE school_level = 'middle') AS middle_zone_id,
    MAX(school_name_raw) FILTER (WHERE school_level = 'middle') AS middle_school_name,
    MAX(school_name_normalized) FILTER (WHERE school_level = 'middle')
      AS middle_school_name_normalized,
    MAX(overlap_area_acres) FILTER (WHERE school_level = 'middle')
      AS middle_overlap_area_acres,
    MAX(overlap_percent) FILTER (WHERE school_level = 'middle')
      AS middle_overlap_percent,
    MAX(match_confidence) FILTER (WHERE school_level = 'middle')
      AS middle_match_confidence,

    MAX(zone_id) FILTER (WHERE school_level = 'high') AS high_zone_id,
    MAX(school_name_raw) FILTER (WHERE school_level = 'high') AS high_school_name,
    MAX(school_name_normalized) FILTER (WHERE school_level = 'high')
      AS high_school_name_normalized,
    MAX(overlap_area_acres) FILTER (WHERE school_level = 'high')
      AS high_overlap_area_acres,
    MAX(overlap_percent) FILTER (WHERE school_level = 'high')
      AS high_overlap_percent,
    MAX(match_confidence) FILTER (WHERE school_level = 'high')
      AS high_match_confidence
  FROM best_overlaps
  GROUP BY official_parcel_id
),
pivot_counts AS (
  SELECT
    official_parcel_id,
    MAX(zone_overlap_count) FILTER (WHERE school_level = 'elementary')
      AS elementary_zone_overlap_count,
    MAX(zone_overlap_count) FILTER (WHERE school_level = 'middle')
      AS middle_zone_overlap_count,
    MAX(zone_overlap_count) FILTER (WHERE school_level = 'high')
      AS high_zone_overlap_count,
    BOOL_OR(has_unmatched_reference OR has_non_exact_reference_match)
      AS any_unmatched_school_reference
  FROM level_counts
  GROUP BY official_parcel_id
),
assignment_flags AS (
  SELECT
    parcel.official_parcel_id,
    parcel.pin14,
    parcel.objectid_1,
    parcel.parcel_area_acres,
    best.elementary_zone_id,
    best.elementary_school_name,
    best.elementary_school_name_normalized,
    ROUND(COALESCE(best.elementary_overlap_area_acres, 0)::numeric, 4)
      AS elementary_overlap_area_acres,
    ROUND(COALESCE(best.elementary_overlap_percent, 0)::numeric, 4)
      AS elementary_overlap_percent,
    best.elementary_match_confidence,
    best.middle_zone_id,
    best.middle_school_name,
    best.middle_school_name_normalized,
    ROUND(COALESCE(best.middle_overlap_area_acres, 0)::numeric, 4)
      AS middle_overlap_area_acres,
    ROUND(COALESCE(best.middle_overlap_percent, 0)::numeric, 4)
      AS middle_overlap_percent,
    best.middle_match_confidence,
    best.high_zone_id,
    best.high_school_name,
    best.high_school_name_normalized,
    ROUND(COALESCE(best.high_overlap_area_acres, 0)::numeric, 4)
      AS high_overlap_area_acres,
    ROUND(COALESCE(best.high_overlap_percent, 0)::numeric, 4)
      AS high_overlap_percent,
    best.high_match_confidence,
    COALESCE(counts.elementary_zone_overlap_count, 0) AS elementary_zone_overlap_count,
    COALESCE(counts.middle_zone_overlap_count, 0) AS middle_zone_overlap_count,
    COALESCE(counts.high_zone_overlap_count, 0) AS high_zone_overlap_count,
    best.elementary_zone_id IS NULL AS missing_elementary_zone,
    best.middle_zone_id IS NULL AS missing_middle_zone,
    best.high_zone_id IS NULL AS missing_high_zone,
    COALESCE(counts.elementary_zone_overlap_count, 0) > 1
      AS multiple_elementary_zone_overlap,
    COALESCE(counts.middle_zone_overlap_count, 0) > 1
      AS multiple_middle_zone_overlap,
    COALESCE(counts.high_zone_overlap_count, 0) > 1
      AS multiple_high_zone_overlap,
    COALESCE(counts.any_unmatched_school_reference, FALSE)
      AS any_unmatched_school_reference,
    parcel.geometry
  FROM parcel_base AS parcel
  LEFT JOIN pivot_best AS best
    ON best.official_parcel_id = parcel.official_parcel_id
  LEFT JOIN pivot_counts AS counts
    ON counts.official_parcel_id = parcel.official_parcel_id
)
SELECT
  official_parcel_id,
  pin14,
  objectid_1,
  elementary_zone_id,
  elementary_school_name,
  elementary_school_name_normalized,
  elementary_overlap_area_acres,
  elementary_overlap_percent,
  elementary_match_confidence,
  middle_zone_id,
  middle_school_name,
  middle_school_name_normalized,
  middle_overlap_area_acres,
  middle_overlap_percent,
  middle_match_confidence,
  high_zone_id,
  high_school_name,
  high_school_name_normalized,
  high_overlap_area_acres,
  high_overlap_percent,
  high_match_confidence,
  elementary_zone_overlap_count,
  middle_zone_overlap_count,
  high_zone_overlap_count,
  NOT missing_elementary_zone AS has_elementary_assignment,
  NOT missing_middle_zone AS has_middle_assignment,
  NOT missing_high_zone AS has_high_assignment,
  missing_elementary_zone,
  missing_middle_zone,
  missing_high_zone,
  multiple_elementary_zone_overlap,
  multiple_middle_zone_overlap,
  multiple_high_zone_overlap,
  any_unmatched_school_reference,
  (
    missing_elementary_zone
    OR missing_middle_zone
    OR missing_high_zone
    OR multiple_elementary_zone_overlap
    OR multiple_middle_zone_overlap
    OR multiple_high_zone_overlap
    OR any_unmatched_school_reference
    OR COALESCE(elementary_overlap_percent, 0) < 80
    OR COALESCE(middle_overlap_percent, 0) < 80
    OR COALESCE(high_overlap_percent, 0) < 80
  ) AS school_assignment_review_required,
  CASE
    WHEN elementary_zone_id IS NULL
      AND middle_zone_id IS NULL
      AND high_zone_id IS NULL
      THEN 'low'
    WHEN missing_elementary_zone
      OR missing_middle_zone
      OR missing_high_zone
      OR multiple_elementary_zone_overlap
      OR multiple_middle_zone_overlap
      OR multiple_high_zone_overlap
      OR any_unmatched_school_reference
      THEN 'review'
    WHEN COALESCE(elementary_overlap_percent, 0) >= 95
      AND COALESCE(middle_overlap_percent, 0) >= 95
      AND COALESCE(high_overlap_percent, 0) >= 95
      THEN 'high'
    ELSE 'medium'
  END AS school_assignment_confidence,
  CASE
    WHEN elementary_zone_id IS NULL
      AND middle_zone_id IS NULL
      AND high_zone_id IS NULL
      THEN 'no_attendance_zone_available'
    ELSE 'attendance_zone_largest_overlap'
  END AS assignment_method,
  ARRAY_REMOVE(ARRAY[
    CASE WHEN missing_elementary_zone THEN 'missing_elementary_zone' END,
    CASE WHEN missing_middle_zone THEN 'missing_middle_zone' END,
    CASE WHEN missing_high_zone THEN 'missing_high_zone' END,
    CASE WHEN multiple_elementary_zone_overlap THEN 'multiple_elementary_zone_overlap' END,
    CASE WHEN multiple_middle_zone_overlap THEN 'multiple_middle_zone_overlap' END,
    CASE WHEN multiple_high_zone_overlap THEN 'multiple_high_zone_overlap' END,
    CASE WHEN any_unmatched_school_reference THEN 'unmatched_or_non_exact_school_reference' END
  ]::text[], NULL) AS data_quality_flags,
  NOW()::timestamptz AS overlaid_at,
  CASE
    WHEN geometry IS NULL THEN NULL
    ELSE ST_Multi(
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
    )::geometry(MultiPolygon, 4326)
  END AS geometry
FROM assignment_flags;

COMMENT ON TABLE public.parcel_school_assignment IS
  'CFS Phase 8A parcel school assignment by attendance-zone polygon overlap. One row per parcel; school point distance is not used.';

ALTER TABLE public.parcel_school_assignment
  ADD CONSTRAINT parcel_school_assignment_pkey PRIMARY KEY (official_parcel_id);

CREATE INDEX IF NOT EXISTS parcel_school_assignment_pin14_idx
  ON public.parcel_school_assignment (pin14);

CREATE INDEX IF NOT EXISTS parcel_school_assignment_objectid_idx
  ON public.parcel_school_assignment (objectid_1);

CREATE INDEX IF NOT EXISTS parcel_school_assignment_elementary_zone_idx
  ON public.parcel_school_assignment (elementary_zone_id);

CREATE INDEX IF NOT EXISTS parcel_school_assignment_middle_zone_idx
  ON public.parcel_school_assignment (middle_zone_id);

CREATE INDEX IF NOT EXISTS parcel_school_assignment_high_zone_idx
  ON public.parcel_school_assignment (high_zone_id);

CREATE INDEX IF NOT EXISTS parcel_school_assignment_confidence_idx
  ON public.parcel_school_assignment (school_assignment_confidence);

CREATE INDEX IF NOT EXISTS parcel_school_assignment_review_idx
  ON public.parcel_school_assignment (school_assignment_review_required);

CREATE INDEX IF NOT EXISTS parcel_school_assignment_geometry_gix
  ON public.parcel_school_assignment
  USING GIST (geometry);

ANALYZE public.parcel_school_assignment;
