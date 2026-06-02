-- Create the Phase 3 clean permit/development activity table.
--
-- This transform standardizes the first public OpenData permit pilot source.
-- It does not connect APIs, modify the frontend dashboard, join permits to
-- parcels, build temporal analytics, or treat this historical layer as the
-- authoritative current permitting system of record.

DROP TABLE IF EXISTS public.permit_activity_clean;

CREATE TABLE public.permit_activity_clean AS
WITH normalized AS (
  SELECT
    objectid::bigint AS source_objectid,
    NULLIF(BTRIM(permitnumber), '') AS permit_id,
    NULLIF(BTRIM(appname), '') AS application_name,
    NULLIF(BTRIM(pin14), '') AS pin14,
    NULLIF(BTRIM(ownername), '') AS owner_name,
    NULLIF(BTRIM(address), '') AS address,
    NULLIF(BTRIM(subdivision), '') AS subdivision,
    NULLIF(BTRIM(permitcategory), '') AS permit_category_raw,
    NULLIF(BTRIM(permitgroup), '') AS permit_group_raw,
    NULLIF(BTRIM(recordgroup), '') AS record_group_raw,
    NULLIF(BTRIM(permittype), '') AS permit_type_raw,
    NULLIF(BTRIM(permitsubtype), '') AS permit_subtype_raw,
    NULLIF(BTRIM(detaileddescription), '') AS detailed_description,
    NULLIF(BTRIM(status), '') AS permit_status_raw,
    NULLIF(BTRIM(lot), '') AS lot,
    NULLIF(BTRIM(filedate), '') AS file_date_raw,
    shape_starea,
    shape_stlength,
    cfs_source_id,
    cfs_source_name,
    cfs_source_url,
    cfs_source_year,
    cfs_ingested_at,
    geometry
  FROM public.permit_activity
),
dated AS (
  SELECT
    *,
    CASE
      WHEN file_date_raw ~ '^\d{4}\.\d{2}\.\d{2}$'
        THEN to_date(file_date_raw, 'YYYY.MM.DD')
      WHEN file_date_raw ~ '^\d{4}-\d{2}-\d{2}'
        THEN file_date_raw::date
      ELSE NULL
    END AS activity_date
  FROM normalized
)
SELECT
  source_objectid AS permit_activity_internal_id,
  source_objectid,
  permit_id,
  application_name,
  pin14,
  owner_name,
  address,
  subdivision,
  permit_status_raw,
  lower(regexp_replace(permit_status_raw, '[^0-9A-Za-z]+', '_', 'g')) AS permit_status_normalized,
  permit_type_raw,
  lower(regexp_replace(permit_type_raw, '[^0-9A-Za-z]+', '_', 'g')) AS permit_type_normalized,
  permit_category_raw,
  lower(regexp_replace(permit_category_raw, '[^0-9A-Za-z]+', '_', 'g')) AS permit_category_normalized,
  permit_group_raw,
  record_group_raw,
  permit_subtype_raw,
  detailed_description,
  lot,
  file_date_raw,
  activity_date,
  EXTRACT(YEAR FROM activity_date)::integer AS activity_year,
  EXTRACT(MONTH FROM activity_date)::integer AS activity_month,
  shape_starea,
  shape_stlength,
  cfs_source_id,
  cfs_source_name,
  cfs_source_url,
  cfs_source_year,
  cfs_ingested_at,
  CASE
    WHEN geometry IS NULL THEN NULL
    ELSE ST_Multi(
      ST_CollectionExtract(
        ST_MakeValid(
          CASE
            WHEN ST_SRID(geometry) = 4326 THEN geometry
            WHEN ST_SRID(geometry) = 0 THEN ST_SetSRID(geometry, 4326)
            ELSE ST_Transform(geometry, 4326)
          END
        ),
        3
      )
    )::geometry(MultiPolygon, 4326)
  END AS geometry,
  now() AS transformed_at
FROM dated;

CREATE INDEX IF NOT EXISTS permit_activity_clean_internal_id_idx
  ON public.permit_activity_clean (permit_activity_internal_id);

CREATE INDEX IF NOT EXISTS permit_activity_clean_permit_id_idx
  ON public.permit_activity_clean (permit_id);

CREATE INDEX IF NOT EXISTS permit_activity_clean_pin14_idx
  ON public.permit_activity_clean (pin14);

CREATE INDEX IF NOT EXISTS permit_activity_clean_status_idx
  ON public.permit_activity_clean (permit_status_normalized);

CREATE INDEX IF NOT EXISTS permit_activity_clean_type_idx
  ON public.permit_activity_clean (permit_type_normalized);

CREATE INDEX IF NOT EXISTS permit_activity_clean_category_idx
  ON public.permit_activity_clean (permit_category_normalized);

CREATE INDEX IF NOT EXISTS permit_activity_clean_activity_date_idx
  ON public.permit_activity_clean (activity_date);

CREATE INDEX IF NOT EXISTS permit_activity_clean_geometry_gix
  ON public.permit_activity_clean
  USING GIST (geometry);

ANALYZE public.permit_activity_clean;
