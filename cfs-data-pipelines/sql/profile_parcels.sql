-- Cabarrus FutureScape parcel profile verification examples.
-- These queries inspect the public.parcels table after ArcGIS REST ingestion.

SELECT COUNT(*) AS parcel_count
FROM public.parcels;

SELECT ST_GeometryType(geometry) AS geometry_type, COUNT(*) AS feature_count
FROM public.parcels
GROUP BY ST_GeometryType(geometry)
ORDER BY feature_count DESC;

SELECT ST_SRID(geometry) AS srid, COUNT(*) AS feature_count
FROM public.parcels
GROUP BY ST_SRID(geometry)
ORDER BY srid;

SELECT COUNT(*) AS invalid_geometry_count
FROM public.parcels
WHERE NOT ST_IsValid(geometry);

SELECT COUNT(*) AS null_geometry_count
FROM public.parcels
WHERE geometry IS NULL;

SELECT
  ST_XMin(extent) AS xmin,
  ST_YMin(extent) AS ymin,
  ST_XMax(extent) AS xmax,
  ST_YMax(extent) AS ymax
FROM (
  SELECT ST_Extent(geometry)::box2d AS extent
  FROM public.parcels
  WHERE geometry IS NOT NULL
) AS bounds;

SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'parcels'
ORDER BY indexname;
