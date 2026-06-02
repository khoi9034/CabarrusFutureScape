-- Cabarrus FutureScape local PostGIS verification queries.
-- Run after `python ingest/ingest_tax_parcels.py` completes successfully.

SELECT COUNT(*) AS parcel_count
FROM public.parcels;

SELECT ST_GeometryType(geometry) AS geometry_type, COUNT(*) AS feature_count
FROM public.parcels
GROUP BY ST_GeometryType(geometry)
ORDER BY feature_count DESC;

SELECT ST_SRID(geometry) AS srid, COUNT(*) AS feature_count
FROM public.parcels
GROUP BY ST_SRID(geometry);

SELECT *
FROM public.parcels
LIMIT 5;

SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'parcels'
ORDER BY indexname;
