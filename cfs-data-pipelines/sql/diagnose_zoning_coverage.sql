-- Cabarrus FutureScape zoning coverage diagnostics.
--
-- These queries investigate why public.parcel_zoning_overlay has many parcels
-- with no zoning match. They are diagnostic only: no assignments are forced,
-- no source layers are ingested, and no frontend/API systems are connected.

-- Overall parcel-zoning join counts.
SELECT
  COUNT(*) AS total_parcels,
  COUNT(*) FILTER (WHERE NOT has_no_zoning_match) AS assigned_parcels,
  COUNT(*) FILTER (WHERE has_no_zoning_match) AS no_match_parcels,
  COUNT(*) FILTER (WHERE has_multiple_zoning) AS multi_zoning_parcels
FROM public.parcel_zoning_overlay;

-- Extent comparison for parcels, zoning, assigned parcels, and no-match parcels.
WITH extents AS (
  SELECT 'all_parcels' AS layer_name, ST_Extent(geometry)::box2d AS extent
  FROM public.parcels_enriched
  UNION ALL
  SELECT 'zoning_clean' AS layer_name, ST_Extent(geometry)::box2d AS extent
  FROM public.zoning_clean
  UNION ALL
  SELECT 'assigned_parcels' AS layer_name, ST_Extent(geometry)::box2d AS extent
  FROM public.parcel_zoning_overlay
  WHERE NOT has_no_zoning_match
  UNION ALL
  SELECT 'no_match_parcels' AS layer_name, ST_Extent(geometry)::box2d AS extent
  FROM public.parcel_zoning_overlay
  WHERE has_no_zoning_match
)
SELECT
  layer_name,
  ST_XMin(extent) AS xmin,
  ST_YMin(extent) AS ymin,
  ST_XMax(extent) AS xmax,
  ST_YMax(extent) AS ymax
FROM extents
ORDER BY layer_name;

-- Top no-match neighborhoods.
SELECT
  COALESCE(parcel.nbh_name, '(missing)') AS neighborhood,
  COUNT(*) AS no_match_count,
  ROUND(SUM(overlay.parcel_area_acres_calc)::numeric, 2) AS no_match_area_acres,
  COUNT(*) FILTER (WHERE parcel.parcel_quality_status = 'trusted') AS trusted_count,
  COUNT(*) FILTER (WHERE parcel.parcel_quality_status = 'review') AS review_count
FROM public.parcel_zoning_overlay AS overlay
JOIN public.parcels_enriched AS parcel
  ON parcel.official_parcel_id = overlay.official_parcel_id
WHERE overlay.has_no_zoning_match
GROUP BY COALESCE(parcel.nbh_name, '(missing)')
ORDER BY no_match_count DESC, neighborhood
LIMIT 25;

-- Top no-match subdivisions.
SELECT
  COALESCE(parcel.subdiv_name, '(missing)') AS subdivision,
  COUNT(*) AS no_match_count,
  ROUND(SUM(overlay.parcel_area_acres_calc)::numeric, 2) AS no_match_area_acres,
  COUNT(*) FILTER (WHERE parcel.subdivision_quality_status <> 'valid') AS subdivision_review_count
FROM public.parcel_zoning_overlay AS overlay
JOIN public.parcels_enriched AS parcel
  ON parcel.official_parcel_id = overlay.official_parcel_id
WHERE overlay.has_no_zoning_match
GROUP BY COALESCE(parcel.subdiv_name, '(missing)')
ORDER BY no_match_count DESC, subdivision
LIMIT 25;

-- Approximate nearest zoning distance for no-match parcels.
-- Uses parcel representative points to keep the diagnostics lightweight.
no_match_distances AS (
  SELECT
    overlay.official_parcel_id,
    ST_Distance(
      ST_Transform(ST_PointOnSurface(overlay.geometry), 3857),
      nearest_zoning.geometry_3857
    ) AS nearest_zoning_distance_m
  FROM public.parcel_zoning_overlay AS overlay
  CROSS JOIN LATERAL (
    SELECT ST_Transform(zoning.geometry, 3857) AS geometry_3857
    FROM public.zoning_clean AS zoning
    ORDER BY ST_PointOnSurface(overlay.geometry) <-> zoning.geometry
    LIMIT 1
  ) AS nearest_zoning
  WHERE overlay.has_no_zoning_match
)
SELECT
  COUNT(*) AS no_match_count,
  ROUND(MIN(nearest_zoning_distance_m)::numeric, 2) AS min_distance_m,
  ROUND(percentile_cont(0.25) WITHIN GROUP (ORDER BY nearest_zoning_distance_m)::numeric, 2) AS p25_distance_m,
  ROUND(percentile_cont(0.50) WITHIN GROUP (ORDER BY nearest_zoning_distance_m)::numeric, 2) AS median_distance_m,
  ROUND(percentile_cont(0.75) WITHIN GROUP (ORDER BY nearest_zoning_distance_m)::numeric, 2) AS p75_distance_m,
  ROUND(percentile_cont(0.90) WITHIN GROUP (ORDER BY nearest_zoning_distance_m)::numeric, 2) AS p90_distance_m,
  ROUND(MAX(nearest_zoning_distance_m)::numeric, 2) AS max_distance_m
FROM no_match_distances;

-- No-match parcels outside the zoning extent bounding box.
WITH zoning_extent AS (
  SELECT ST_SetSRID(ST_Envelope(ST_Extent(geometry)::geometry), 4326) AS extent_geometry
  FROM public.zoning_clean
)
SELECT
  COUNT(*) AS no_match_count,
  COUNT(*) FILTER (WHERE NOT ST_Intersects(overlay.geometry, zoning_extent.extent_geometry))
    AS outside_zoning_extent_count,
  COUNT(*) FILTER (WHERE ST_Intersects(overlay.geometry, zoning_extent.extent_geometry))
    AS inside_zoning_extent_count
FROM public.parcel_zoning_overlay AS overlay
CROSS JOIN zoning_extent
WHERE overlay.has_no_zoning_match;
