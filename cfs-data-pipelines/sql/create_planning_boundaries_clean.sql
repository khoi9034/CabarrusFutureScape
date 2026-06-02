-- Cabarrus FutureScape Phase 2 planning / ETJ boundary clean table.
--
-- This table cleans the ETJ Boundary source. It is a planning/jurisdiction
-- context layer, not a zoning assignment layer.

DROP TABLE IF EXISTS public.planning_boundaries_clean;

CREATE TABLE public.planning_boundaries_clean AS
WITH normalized AS (
  SELECT
    objectid::bigint AS source_objectid,
    NULLIF(btrim(district), '') AS boundary_name,
    shape_starea AS source_shape_starea,
    shape_stlength AS source_shape_stlength,
    ST_Multi(
      ST_CollectionExtract(
        ST_MakeValid(ST_SetSRID(geometry, 4326)),
        3
      )
    )::geometry(MultiPolygon, 4326) AS geometry
  FROM public.planning_boundaries
  WHERE geometry IS NOT NULL
),
classified AS (
  SELECT
    source_objectid,
    boundary_name,
    CASE
      WHEN boundary_name ILIKE 'City of %'
        THEN btrim(regexp_replace(boundary_name, '^City of[[:space:]]+', '', 'i'))
      WHEN boundary_name ILIKE 'Town of %'
        THEN btrim(regexp_replace(boundary_name, '^Town of[[:space:]]+', '', 'i'))
      ELSE boundary_name
    END AS jurisdiction_name,
    source_shape_starea,
    source_shape_stlength,
    geometry
  FROM normalized
  WHERE geometry IS NOT NULL
    AND NOT ST_IsEmpty(geometry)
)
SELECT
  'CFS-PLANNING-BOUNDARY-' || lpad(source_objectid::text, 10, '0')
    AS boundary_internal_id,
  source_objectid,
  boundary_name,
  jurisdiction_name,
  'etj' AS boundary_type,
  'https://location.cabarruscounty.us/arcgisservices/rest/services/opendata/MapServer/32'
    AS source_url,
  source_shape_starea,
  source_shape_stlength,
  now()::timestamptz AS transformed_at,
  geometry
FROM classified;

COMMENT ON TABLE public.planning_boundaries_clean IS
  'Cleaned CFS planning/ETJ boundary source. Use for jurisdiction context only; do not treat as zoning.';
COMMENT ON COLUMN public.planning_boundaries_clean.boundary_type IS
  'Inferred from the source layer name ETJ Boundary. Verify with governance before production use.';

ALTER TABLE public.planning_boundaries_clean
  ADD CONSTRAINT planning_boundaries_clean_pkey PRIMARY KEY (boundary_internal_id);

CREATE INDEX IF NOT EXISTS planning_boundaries_clean_jurisdiction_idx
  ON public.planning_boundaries_clean (jurisdiction_name);

CREATE INDEX IF NOT EXISTS planning_boundaries_clean_type_idx
  ON public.planning_boundaries_clean (boundary_type);

CREATE INDEX IF NOT EXISTS planning_boundaries_clean_name_idx
  ON public.planning_boundaries_clean (boundary_name);

CREATE INDEX IF NOT EXISTS planning_boundaries_clean_geometry_gix
  ON public.planning_boundaries_clean USING GIST (geometry);

ANALYZE public.planning_boundaries_clean;
