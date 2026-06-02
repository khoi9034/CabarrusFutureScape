-- Cabarrus FutureScape Phase 2 multi-jurisdiction zoning foundation.
--
-- This table normalizes schema shape across zoning jurisdictions while
-- preserving raw zoning codes. It does not pretend zoning classes are
-- equivalent across municipalities and does not run parcel-zoning overlays.

DROP TABLE IF EXISTS public.zoning_jurisdictional_clean;

CREATE TABLE public.zoning_jurisdictional_clean AS
WITH source_rows AS (
  SELECT
    'county' AS source_id,
    'Cabarrus County / Unincorporated' AS jurisdiction_name,
    'public.zoning_county' AS source_table,
    'https://location.cabarruscounty.us/arcgisservices/rest/services/opendata/MapServer/35' AS source_url,
    objectid::bigint AS source_objectid,
    zoningcode::text AS zoning_code_raw,
    zoning_gen::text AS zoning_general_raw,
    NULL::text AS zoning_type_raw,
    NULL::text AS base_district_raw,
    NULL::text AS conditional_raw,
    shape_starea AS source_shape_starea,
    shape_stlength AS source_shape_stlength,
    geometry
  FROM public.zoning_county

  UNION ALL
  SELECT
    'concord',
    'Concord',
    'public.zoning_concord',
    'https://location.cabarruscounty.us/arcgisservices/rest/services/opendata/MapServer/36',
    objectid::bigint,
    zoningcode::text,
    NULL::text,
    NULL::text,
    NULL::text,
    NULL::text,
    shape_starea,
    shape_stlength,
    geometry
  FROM public.zoning_concord

  UNION ALL
  SELECT
    'harrisburg',
    'Harrisburg',
    'public.zoning_harrisburg',
    'https://location.cabarruscounty.us/arcgisservices/rest/services/opendata/MapServer/37',
    objectid::bigint,
    zoningcode::text,
    zoning_gen::text,
    NULL::text,
    NULL::text,
    NULL::text,
    shape_starea,
    shape_stlength,
    geometry
  FROM public.zoning_harrisburg

  UNION ALL
  SELECT
    'kannapolis',
    'Kannapolis',
    'public.zoning_kannapolis',
    'https://location.cabarruscounty.us/arcgisservices/rest/services/opendata/MapServer/38',
    objectid::bigint,
    zoningcode::text,
    NULL::text,
    NULL::text,
    base_distr::text,
    conditiona::text,
    shape_starea,
    shape_stlength,
    geometry
  FROM public.zoning_kannapolis

  UNION ALL
  SELECT
    'locust',
    'Locust',
    'public.zoning_locust',
    'https://location.cabarruscounty.us/arcgisservices/rest/services/opendata/MapServer/39',
    objectid_1::bigint,
    zoningcode::text,
    NULL::text,
    zoning::text,
    NULL::text,
    NULL::text,
    shape_starea,
    shape_stlength,
    geometry
  FROM public.zoning_locust

  UNION ALL
  SELECT
    'midland',
    'Midland',
    'public.zoning_midland',
    'https://location.cabarruscounty.us/arcgisservices/rest/services/opendata/MapServer/40',
    objectid::bigint,
    zoningcode::text,
    NULL::text,
    zoning_typ::text,
    NULL::text,
    NULL::text,
    shape_starea,
    shape_stlength,
    geometry
  FROM public.zoning_midland

  UNION ALL
  SELECT
    'mount_pleasant',
    'Mt. Pleasant',
    'public.zoning_mount_pleasant',
    'https://location.cabarruscounty.us/arcgisservices/rest/services/opendata/MapServer/41',
    objectid::bigint,
    zoningcode::text,
    NULL::text,
    NULL::text,
    NULL::text,
    NULL::text,
    shape_starea,
    shape_stlength,
    geometry
  FROM public.zoning_mount_pleasant
),
normalized AS (
  SELECT
    source_id,
    jurisdiction_name,
    source_table,
    source_url,
    source_objectid,
    NULLIF(btrim(zoning_code_raw), '') AS zoning_code_raw,
    NULLIF(btrim(zoning_general_raw), '') AS zoning_general_raw,
    NULLIF(btrim(zoning_type_raw), '') AS zoning_type_raw,
    NULLIF(btrim(base_district_raw), '') AS base_district_raw,
    NULLIF(btrim(conditional_raw), '') AS conditional_raw,
    source_shape_starea,
    source_shape_stlength,
    ST_Multi(
      ST_CollectionExtract(
        ST_MakeValid(ST_SetSRID(geometry, 4326)),
        3
      )
    )::geometry(MultiPolygon, 4326) AS geometry
  FROM source_rows
  WHERE geometry IS NOT NULL
),
classified AS (
  SELECT
    *,
    upper(
      COALESCE(
        zoning_code_raw,
        zoning_type_raw,
        base_district_raw,
        zoning_general_raw,
        'UNKNOWN'
      )
    ) AS zoning_label_normalized,
    upper(
      concat_ws(
        ' ',
        zoning_code_raw,
        zoning_general_raw,
        zoning_type_raw,
        base_district_raw,
        conditional_raw
      )
    ) AS classification_text
  FROM normalized
  WHERE geometry IS NOT NULL
    AND NOT ST_IsEmpty(geometry)
)
SELECT
  'CFS-ZONING-' || source_id || '-' || lpad(source_objectid::text, 10, '0')
    AS zoning_jurisdictional_id,
  jurisdiction_name,
  source_table,
  source_url,
  source_objectid,
  zoning_code_raw,
  zoning_general_raw,
  zoning_type_raw,
  base_district_raw,
  conditional_raw,
  zoning_label_normalized,
  CASE
    WHEN classification_text LIKE '%MIX%'
      OR classification_text ~ '(^| )M[UX]($|[- ]|[0-9])'
      THEN 'mixed_use'
    WHEN classification_text LIKE '%OFFICE%'
      OR classification_text ~ '(^| )OI($|[- ]|[0-9])'
      THEN 'office'
    WHEN classification_text LIKE '%INDUSTRIAL%'
      OR classification_text ~ '(^| )(LI|GI|IND)($|[- ]|[0-9])'
      THEN 'industrial'
    WHEN classification_text LIKE '%COMMERCIAL%'
      OR classification_text ~ '(^| )(GC|LC|HC|CC|NB|CB)($|[- ]|[0-9])'
      THEN 'commercial'
    WHEN classification_text LIKE '%AGRICULT%'
      OR classification_text ~ '(^| )(AO|AG|A)(-|$| )'
      THEN 'agricultural'
    WHEN classification_text LIKE '%RESIDENTIAL%'
      OR classification_text ~ '(^| )(R|RE|RS|RM|RV|RL|RH|LDR|MDR|HDR|CR)($|[- ]|[0-9])'
      THEN 'residential'
    ELSE 'unknown'
  END AS zoning_general_normalized,
  source_shape_starea,
  source_shape_stlength,
  now()::timestamptz AS transformed_at,
  geometry
FROM classified;

COMMENT ON TABLE public.zoning_jurisdictional_clean IS
  'Conservative CFS multi-jurisdiction zoning foundation. Raw zoning codes are preserved; broad categories are only approximate planning labels.';

ALTER TABLE public.zoning_jurisdictional_clean
  ADD CONSTRAINT zoning_jurisdictional_clean_pkey PRIMARY KEY (zoning_jurisdictional_id);

CREATE INDEX IF NOT EXISTS zoning_jurisdictional_clean_jurisdiction_idx
  ON public.zoning_jurisdictional_clean (jurisdiction_name);

CREATE INDEX IF NOT EXISTS zoning_jurisdictional_clean_code_idx
  ON public.zoning_jurisdictional_clean (zoning_code_raw);

CREATE INDEX IF NOT EXISTS zoning_jurisdictional_clean_general_idx
  ON public.zoning_jurisdictional_clean (zoning_general_normalized);

CREATE INDEX IF NOT EXISTS zoning_jurisdictional_clean_label_idx
  ON public.zoning_jurisdictional_clean (zoning_label_normalized);

CREATE INDEX IF NOT EXISTS zoning_jurisdictional_clean_geometry_gix
  ON public.zoning_jurisdictional_clean USING GIST (geometry);

ANALYZE public.zoning_jurisdictional_clean;
