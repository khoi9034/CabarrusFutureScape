DROP TABLE IF EXISTS public.fema_nfhl_flood_zones_clean;

CREATE TABLE public.fema_nfhl_flood_zones_clean AS
WITH repaired AS (
  SELECT
    ROW_NUMBER() OVER (ORDER BY objectid NULLS LAST, globalid NULLS LAST) AS flood_zone_internal_id,
    objectid AS source_objectid,
    NULLIF(BTRIM(fld_ar_id::text), '') AS fld_ar_id,
    NULLIF(BTRIM(globalid::text), '') AS globalid,
    NULLIF(BTRIM(gfid::text), '') AS gfid,
    NULLIF(BTRIM(fld_zone::text), '') AS fld_zone_raw,
    NULLIF(BTRIM(zone_subty::text), '') AS zone_subtype_raw,
    NULLIF(BTRIM(sfha_tf::text), '') AS sfha_tf_raw,
    NULLIF(BTRIM(static_bfe::text), '') AS static_bfe_raw,
    NULLIF(BTRIM(v_datum::text), '') AS vertical_datum_raw,
    NULLIF(BTRIM(depth::text), '') AS depth_raw,
    NULLIF(BTRIM(len_unit::text), '') AS length_unit_raw,
    NULLIF(BTRIM(source_cit::text), '') AS source_citation,
    NULLIF(BTRIM(source_url::text), '') AS source_url,
    ST_MakeValid(
      CASE
        WHEN ST_SRID(geometry) = 0 THEN ST_SetSRID(geometry, 4326)
        WHEN ST_SRID(geometry) <> 4326 THEN ST_Transform(geometry, 4326)
        ELSE geometry
      END
    ) AS repaired_geometry
  FROM public.fema_nfhl_flood_zones_raw
  WHERE geometry IS NOT NULL
),
polygonal AS (
  SELECT
    *,
    ST_Multi(ST_CollectionExtract(repaired_geometry, 3))::geometry(MultiPolygon, 4326)
      AS geometry
  FROM repaired
),
normalized AS (
  SELECT
    flood_zone_internal_id,
    source_objectid,
    fld_ar_id,
    globalid,
    gfid,
    UPPER(fld_zone_raw) AS flood_zone_code,
    zone_subtype_raw,
    UPPER(sfha_tf_raw) AS sfha_tf,
    static_bfe_raw,
    vertical_datum_raw,
    depth_raw,
    length_unit_raw,
    source_citation,
    source_url,
    geometry
  FROM polygonal
  WHERE geometry IS NOT NULL
    AND NOT ST_IsEmpty(geometry)
)
SELECT
  flood_zone_internal_id,
  source_objectid,
  fld_ar_id,
  globalid,
  gfid,
  flood_zone_code,
  zone_subtype_raw,
  sfha_tf,
  static_bfe_raw,
  vertical_datum_raw,
  depth_raw,
  length_unit_raw,
  source_citation,
  CASE
    WHEN zone_subtype_raw ILIKE '%FLOODWAY%' OR flood_zone_code = 'FW'
      THEN TRUE
    ELSE FALSE
  END AS is_floodway,
  CASE
    WHEN zone_subtype_raw ILIKE '%FLOODWAY%' OR flood_zone_code = 'FW'
      THEN 'floodway'
    WHEN sfha_tf IN ('T', 'TRUE', 'Y', 'YES')
      OR flood_zone_code IN ('A', 'AE', 'AH', 'AO', 'A99', 'AR', 'AR/AE', 'AR/AO', 'V', 'VE')
      THEN 'special_flood_hazard_area'
    WHEN flood_zone_code = 'X'
      AND (
        zone_subtype_raw ILIKE '%0.2%'
        OR zone_subtype_raw ILIKE '%500%'
        OR zone_subtype_raw ILIKE '%REDUCED%'
      )
      THEN 'moderate_flood_hazard'
    WHEN flood_zone_code = 'X'
      THEN 'minimal_flood_hazard'
    WHEN flood_zone_code = 'D'
      THEN 'undetermined_flood_hazard'
    ELSE 'unknown'
  END AS flood_constraint_type,
  CASE
    WHEN zone_subtype_raw ILIKE '%FLOODWAY%' OR flood_zone_code = 'FW'
      THEN 'severe'
    WHEN sfha_tf IN ('T', 'TRUE', 'Y', 'YES')
      OR flood_zone_code IN ('A', 'AE', 'AH', 'AO', 'A99', 'AR', 'AR/AE', 'AR/AO', 'V', 'VE')
      THEN 'high'
    WHEN flood_zone_code = 'X'
      AND (
        zone_subtype_raw ILIKE '%0.2%'
        OR zone_subtype_raw ILIKE '%500%'
        OR zone_subtype_raw ILIKE '%REDUCED%'
      )
      THEN 'moderate'
    WHEN flood_zone_code = 'X'
      THEN 'low'
    ELSE 'unknown'
  END AS flood_severity_class,
  'FEMA NFHL Layer 28 Flood Hazard Zones'::text AS source_layer,
  source_url,
  NOW() AS transformed_at,
  geometry
FROM normalized;

CREATE UNIQUE INDEX IF NOT EXISTS fema_nfhl_flood_zones_clean_internal_id_idx
  ON public.fema_nfhl_flood_zones_clean (flood_zone_internal_id);

CREATE INDEX IF NOT EXISTS fema_nfhl_flood_zones_clean_geometry_gix
  ON public.fema_nfhl_flood_zones_clean
  USING GIST (geometry);

CREATE INDEX IF NOT EXISTS fema_nfhl_flood_zones_clean_zone_idx
  ON public.fema_nfhl_flood_zones_clean (flood_zone_code);

CREATE INDEX IF NOT EXISTS fema_nfhl_flood_zones_clean_constraint_type_idx
  ON public.fema_nfhl_flood_zones_clean (flood_constraint_type);

CREATE INDEX IF NOT EXISTS fema_nfhl_flood_zones_clean_severity_idx
  ON public.fema_nfhl_flood_zones_clean (flood_severity_class);

ANALYZE public.fema_nfhl_flood_zones_clean;
