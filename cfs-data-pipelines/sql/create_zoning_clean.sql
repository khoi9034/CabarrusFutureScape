-- Cabarrus FutureScape Phase 2 Current Zoning clean layer.
--
-- public.zoning is the raw ArcGIS REST landing table. This transform creates
-- public.zoning_clean as a local-development overlay layer prepared for a
-- future parcel-zoning spatial join pilot. It does not connect the frontend,
-- APIs, zoning joins, forecasting, or AI systems.

DROP TABLE IF EXISTS public.zoning_clean;

CREATE TABLE public.zoning_clean AS
WITH normalized AS (
  SELECT
    objectid::bigint AS source_objectid,
    NULLIF(btrim(zoningcode), '') AS zoning_code,
    NULLIF(btrim(zoning_gen), '') AS zoning_general,
    shape_starea AS source_shape_starea,
    shape_stlength AS source_shape_stlength,
    ST_Multi(
      ST_CollectionExtract(
        ST_MakeValid(ST_SetSRID(geometry, 4326)),
        3
      )
    )::geometry(MultiPolygon, 4326) AS geometry
  FROM public.zoning
  WHERE geometry IS NOT NULL
),
filtered AS (
  SELECT *
  FROM normalized
  WHERE geometry IS NOT NULL
    AND NOT ST_IsEmpty(geometry)
)
SELECT
  'CFS-ZONING-' || lpad(source_objectid::text, 10, '0') AS zoning_internal_id,
  source_objectid,
  zoning_code,
  zoning_general,
  COALESCE(zoning_code, zoning_general, 'UNCLASSIFIED') AS zoning_label,
  source_shape_starea,
  source_shape_stlength,
  now()::timestamptz AS transformed_at,
  geometry
FROM filtered;

COMMENT ON TABLE public.zoning_clean IS
  'Cleaned CFS current zoning overlay layer derived from public.zoning for local Phase 2 parcel-zoning join planning.';
COMMENT ON COLUMN public.zoning_clean.zoning_internal_id IS
  'Stable CFS zoning feature ID generated from the source OBJECTID.';
COMMENT ON COLUMN public.zoning_clean.geometry IS
  'Geometry repaired with ST_MakeValid, polygonal components extracted, coerced to MultiPolygon, and kept in SRID 4326.';

ALTER TABLE public.zoning_clean
  ADD CONSTRAINT zoning_clean_pkey PRIMARY KEY (zoning_internal_id);

CREATE UNIQUE INDEX IF NOT EXISTS zoning_clean_source_objectid_uidx
  ON public.zoning_clean (source_objectid);

CREATE INDEX IF NOT EXISTS zoning_clean_zoning_code_idx
  ON public.zoning_clean (zoning_code);

CREATE INDEX IF NOT EXISTS zoning_clean_zoning_general_idx
  ON public.zoning_clean (zoning_general);

CREATE INDEX IF NOT EXISTS zoning_clean_zoning_label_idx
  ON public.zoning_clean (zoning_label);

CREATE INDEX IF NOT EXISTS zoning_clean_geometry_gix
  ON public.zoning_clean USING GIST (geometry);

ANALYZE public.zoning_clean;
