-- Cabarrus FutureScape Phase 2 parcel jurisdiction / planning-boundary overlay.
--
-- Builds one planning-context row per parcel from public.parcels_enriched and
-- public.planning_boundaries_clean. This is a routing/readiness layer for
-- future zoning source selection. It does not assign zoning and should not be
-- treated as a zoning overlay.

DROP TABLE IF EXISTS public.parcel_jurisdiction_overlay;

CREATE TABLE public.parcel_jurisdiction_overlay AS
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
intersection_candidates AS (
  SELECT
    parcel.official_parcel_id,
    parcel.objectid_1,
    parcel.pin14,
    parcel.parcel_area_sq_m,
    boundary.boundary_internal_id,
    boundary.jurisdiction_name AS planning_jurisdiction_name,
    boundary.boundary_type AS planning_boundary_type,
    boundary.boundary_name,
    ST_CollectionExtract(
      ST_Intersection(parcel.geometry, boundary.geometry),
      3
    ) AS overlap_geometry
  FROM parcel_base AS parcel
  JOIN public.planning_boundaries_clean AS boundary
    ON parcel.geometry && boundary.geometry
   AND ST_Intersects(parcel.geometry, boundary.geometry)
),
valid_overlaps AS (
  SELECT
    official_parcel_id,
    objectid_1,
    pin14,
    parcel_area_sq_m,
    boundary_internal_id,
    planning_jurisdiction_name,
    planning_boundary_type,
    boundary_name,
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
ranked_overlaps AS (
  SELECT
    *,
    ROW_NUMBER() OVER (
      PARTITION BY official_parcel_id
      ORDER BY overlap_pct DESC NULLS LAST,
               overlap_area_sq_m DESC,
               planning_jurisdiction_name,
               boundary_internal_id
    ) AS jurisdiction_rank,
    COUNT(*) OVER (PARTITION BY official_parcel_id) AS jurisdiction_overlap_count,
    SUM(overlap_area_sq_m) OVER (PARTITION BY official_parcel_id) AS total_overlap_area_sq_m
  FROM overlap_metrics
),
dominant_jurisdiction AS (
  SELECT
    official_parcel_id,
    objectid_1,
    pin14,
    boundary_internal_id AS dominant_boundary_internal_id,
    planning_jurisdiction_name,
    planning_boundary_type,
    boundary_name,
    jurisdiction_overlap_count,
    overlap_area_sq_m AS dominant_jurisdiction_overlap_area_sq_m,
    overlap_pct AS dominant_jurisdiction_overlap_pct,
    CASE
      WHEN parcel_area_sq_m > 0
      THEN LEAST(1.0, total_overlap_area_sq_m / parcel_area_sq_m)
      ELSE NULL
    END AS total_jurisdiction_overlap_pct
  FROM ranked_overlaps
  WHERE jurisdiction_rank = 1
)
SELECT
  parcel.official_parcel_id,
  parcel.objectid_1,
  parcel.pin14,
  dominant.dominant_boundary_internal_id,
  dominant.planning_jurisdiction_name,
  dominant.planning_boundary_type,
  dominant.boundary_name,
  COALESCE(dominant.jurisdiction_overlap_count, 0) AS jurisdiction_overlap_count,
  dominant.dominant_jurisdiction_overlap_area_sq_m,
  dominant.dominant_jurisdiction_overlap_pct,
  dominant.total_jurisdiction_overlap_pct,
  CASE
    WHEN dominant.official_parcel_id IS NULL THEN 'no_match'
    WHEN dominant.dominant_jurisdiction_overlap_pct >= 0.95 THEN 'high'
    WHEN dominant.dominant_jurisdiction_overlap_pct >= 0.75 THEN 'medium'
    ELSE 'low'
  END AS jurisdiction_assignment_confidence,
  COALESCE(dominant.jurisdiction_overlap_count, 0) > 1 AS has_multiple_jurisdictions,
  dominant.official_parcel_id IS NULL AS has_no_planning_boundary_match,
  CASE
    WHEN dominant.official_parcel_id IS NULL THEN 'no_match'
    WHEN dominant.jurisdiction_overlap_count > 1
      AND dominant.dominant_jurisdiction_overlap_pct < 0.75 THEN 'multi_boundary_low_confidence'
    WHEN dominant.jurisdiction_overlap_count > 1 THEN 'multi_boundary_assigned'
    WHEN dominant.dominant_jurisdiction_overlap_pct < 0.75 THEN 'single_boundary_low_confidence'
    ELSE 'assigned'
  END AS jurisdiction_join_status,
  parcel.parcel_area_sq_m,
  parcel.parcel_area_acres_calc,
  parcel.parcel_quality_status,
  parcel.nbh_name,
  parcel.subdiv_name,
  now()::timestamptz AS joined_at,
  parcel.geometry
FROM parcel_base AS parcel
LEFT JOIN dominant_jurisdiction AS dominant
  ON dominant.official_parcel_id = parcel.official_parcel_id;

COMMENT ON TABLE public.parcel_jurisdiction_overlay IS
  'CFS parcel planning-boundary overlay. One row per parcel with dominant ETJ/planning context for future zoning source routing.';
COMMENT ON COLUMN public.parcel_jurisdiction_overlay.planning_jurisdiction_name IS
  'Dominant planning/ETJ jurisdiction from public.planning_boundaries_clean. This is context, not a zoning assignment.';
COMMENT ON COLUMN public.parcel_jurisdiction_overlay.dominant_jurisdiction_overlap_pct IS
  'Largest planning boundary intersection area divided by parcel area, capped at 1.0.';
COMMENT ON COLUMN public.parcel_jurisdiction_overlay.jurisdiction_assignment_confidence IS
  'high >= 0.95, medium >= 0.75 and < 0.95, low < 0.75, no_match for parcels without planning boundary overlap.';

ALTER TABLE public.parcel_jurisdiction_overlay
  ADD CONSTRAINT parcel_jurisdiction_overlay_pkey PRIMARY KEY (official_parcel_id);

CREATE INDEX IF NOT EXISTS parcel_jurisdiction_overlay_pin14_idx
  ON public.parcel_jurisdiction_overlay (pin14);

CREATE INDEX IF NOT EXISTS parcel_jurisdiction_overlay_planning_jurisdiction_idx
  ON public.parcel_jurisdiction_overlay (planning_jurisdiction_name);

CREATE INDEX IF NOT EXISTS parcel_jurisdiction_overlay_boundary_type_idx
  ON public.parcel_jurisdiction_overlay (planning_boundary_type);

CREATE INDEX IF NOT EXISTS parcel_jurisdiction_overlay_join_status_idx
  ON public.parcel_jurisdiction_overlay (jurisdiction_join_status);

CREATE INDEX IF NOT EXISTS parcel_jurisdiction_overlay_confidence_idx
  ON public.parcel_jurisdiction_overlay (jurisdiction_assignment_confidence);

CREATE INDEX IF NOT EXISTS parcel_jurisdiction_overlay_geometry_gix
  ON public.parcel_jurisdiction_overlay USING GIST (geometry);

ANALYZE public.parcel_jurisdiction_overlay;
