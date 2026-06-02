-- Cabarrus FutureScape Phase 2 Parcel Intelligence clean table.
--
-- public.parcels is the raw ArcGIS REST landing table. This transform creates
-- public.parcels_clean as the curated local-development parcel table for
-- validation and early intelligence workflows. It does not connect the
-- frontend dashboard or any production services.

DROP TABLE IF EXISTS public.parcels_clean;

CREATE TABLE public.parcels_clean AS
WITH normalized AS (
  SELECT
    objectid_1::bigint AS objectid_1,
    NULLIF(btrim(pin14), '') AS pin14,
    objectid::bigint AS source_objectid,
    NULLIF(btrim(oldpin), '') AS oldpin,
    NULLIF(btrim(propertyreal_id), '') AS propertyreal_id,
    NULLIF(btrim(legaldesc), '') AS legaldesc,
    NULLIF(btrim(subdiv_name), '') AS subdiv_name,
    NULLIF(btrim(nbh_name), '') AS nbh_name,
    NULLIF(btrim(acctname1), '') AS acctname1,
    NULLIF(btrim(acctname2), '') AS acctname2,
    NULLIF(btrim(mailaddr1), '') AS mailaddr1,
    NULLIF(btrim(mailaddr2), '') AS mailaddr2,
    NULLIF(btrim(mailcity), '') AS mailcity,
    NULLIF(btrim(mailstate), '') AS mailstate,
    NULLIF(btrim(mailzipcode), '') AS mailzipcode,
    saleyear,
    salemonth,
    saleprice,
    NULLIF(btrim(deedbook), '') AS deedbook,
    NULLIF(btrim(deedpage), '') AS deedpage,
    shape_starea,
    shape_stlength,
    CASE
      WHEN NULLIF(btrim(marketvalue), '') IS NULL THEN NULL
      WHEN btrim(marketvalue) ~ '^[-+]?[0-9,]+(\.[0-9]+)?$'
        THEN replace(btrim(marketvalue), ',', '')::numeric
      ELSE NULL
    END AS marketvalue_numeric,
    CASE
      WHEN NULLIF(btrim(assessedvalue), '') IS NULL THEN NULL
      WHEN btrim(assessedvalue) ~ '^[-+]?[0-9,]+(\.[0-9]+)?$'
        THEN replace(btrim(assessedvalue), ',', '')::numeric
      ELSE NULL
    END AS assessedvalue_numeric,
    CASE
      WHEN NULLIF(btrim(landvalue), '') IS NULL THEN NULL
      WHEN btrim(landvalue) ~ '^[-+]?[0-9,]+(\.[0-9]+)?$'
        THEN replace(btrim(landvalue), ',', '')::numeric
      ELSE NULL
    END AS landvalue_numeric,
    CASE
      WHEN NULLIF(btrim(deferredvalue), '') IS NULL THEN NULL
      WHEN btrim(deferredvalue) ~ '^[-+]?[0-9,]+(\.[0-9]+)?$'
        THEN replace(btrim(deferredvalue), ',', '')::numeric
      ELSE NULL
    END AS deferredvalue_numeric,
    CASE
      WHEN NULLIF(btrim(buildingvalue), '') IS NULL THEN NULL
      WHEN btrim(buildingvalue) ~ '^[-+]?[0-9,]+(\.[0-9]+)?$'
        THEN replace(btrim(buildingvalue), ',', '')::numeric
      ELSE NULL
    END AS buildingvalue_numeric,
    CASE
      WHEN NULLIF(btrim(obxfvalue), '') IS NULL THEN NULL
      WHEN btrim(obxfvalue) ~ '^[-+]?[0-9,]+(\.[0-9]+)?$'
        THEN replace(btrim(obxfvalue), ',', '')::numeric
      ELSE NULL
    END AS obxfvalue_numeric,
    ST_Multi(
      ST_CollectionExtract(
        ST_MakeValid(ST_SetSRID(geometry, 4326)),
        3
      )
    )::geometry(MultiPolygon, 4326) AS geometry
  FROM public.parcels
  WHERE geometry IS NOT NULL
),
measured AS (
  SELECT
    *,
    ST_Area(geometry::geography) AS parcel_area_sq_m
  FROM normalized
  WHERE geometry IS NOT NULL
    AND NOT ST_IsEmpty(geometry)
)
SELECT
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
  parcel_area_sq_m,
  parcel_area_sq_m / 4046.8564224 AS parcel_area_acres_calc,
  CASE
    WHEN landvalue_numeric IS NOT NULL
      AND parcel_area_sq_m > 0
    THEN landvalue_numeric / (parcel_area_sq_m / 4046.8564224)
    ELSE NULL
  END AS value_per_acre,
  now()::timestamptz AS transformed_at,
  geometry
FROM measured;

COMMENT ON TABLE public.parcels_clean IS
  'Curated CFS parcel table derived from public.parcels for local Phase 2 Parcel Intelligence planning.';
COMMENT ON COLUMN public.parcels_clean.objectid_1 IS
  'Internal stable primary key candidate from the source layer. Profiled as unique in the initial ingestion.';
COMMENT ON COLUMN public.parcels_clean.pin14 IS
  'Business parcel identifier. Preserved for joins and search, but not treated as unique because duplicates/nulls exist in the source profile.';
COMMENT ON COLUMN public.parcels_clean.geometry IS
  'Geometry repaired with ST_MakeValid, polygonal components extracted, coerced to MultiPolygon, and kept in SRID 4326.';

DO $$
BEGIN
  IF (
    SELECT COUNT(*)
    FROM public.parcels_clean
    WHERE objectid_1 IS NULL
  ) = 0
  AND (
    SELECT COUNT(*)
    FROM (
      SELECT objectid_1
      FROM public.parcels_clean
      GROUP BY objectid_1
      HAVING COUNT(*) > 1
    ) AS duplicate_objectids
  ) = 0 THEN
    ALTER TABLE public.parcels_clean
      ADD CONSTRAINT parcels_clean_pkey PRIMARY KEY (objectid_1);
  ELSE
    RAISE WARNING
      'Skipping parcels_clean primary key because objectid_1 is null or duplicated.';
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS parcels_clean_pin14_idx
  ON public.parcels_clean (pin14);

CREATE INDEX IF NOT EXISTS parcels_clean_subdiv_name_idx
  ON public.parcels_clean (subdiv_name);

CREATE INDEX IF NOT EXISTS parcels_clean_nbh_name_idx
  ON public.parcels_clean (nbh_name);

CREATE INDEX IF NOT EXISTS parcels_clean_marketvalue_numeric_idx
  ON public.parcels_clean (marketvalue_numeric);

CREATE INDEX IF NOT EXISTS parcels_clean_assessedvalue_numeric_idx
  ON public.parcels_clean (assessedvalue_numeric);

CREATE INDEX IF NOT EXISTS parcels_clean_geometry_gix
  ON public.parcels_clean USING GIST (geometry);

ANALYZE public.parcels_clean;
