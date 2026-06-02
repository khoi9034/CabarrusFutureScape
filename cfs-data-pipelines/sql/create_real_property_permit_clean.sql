-- Create the primary Phase 3 clean Real Property Permit table.
--
-- This transform standardizes the authoritative-candidate SharePoint permit
-- CSV. It does not overwrite the 2015 public OpenData pilot tables, build
-- permit-to-parcel relationships, connect APIs, modify the frontend, or attach
-- geometry. Parcel geometry should be introduced later through a governed
-- ParcelNumber/PIN relationship model.

DROP TABLE IF EXISTS public.real_property_permit_clean;

CREATE TABLE public.real_property_permit_clean AS
WITH normalized AS (
  SELECT
    NULLIF(BTRIM(permitid), '') AS permit_id,
    NULLIF(BTRIM(permitnumber), '') AS permit_number,
    NULLIF(BTRIM(permitdate), '') AS permit_date_raw,
    NULLIF(BTRIM(parcelnumber), '') AS parcel_number,
    NULLIF(BTRIM(parcelid), '') AS parcel_id_source,
    NULLIF(BTRIM(permitcode), '') AS permit_code_raw,
    NULLIF(BTRIM(permitamount), '') AS permit_amount_raw,
    NULLIF(BTRIM(permitnotes), '') AS permit_notes,
    NULLIF(BTRIM(buildingnumber), '') AS building_number,
    NULLIF(BTRIM(worktype), '') AS work_type_raw,
    NULLIF(BTRIM(permittype), '') AS permit_type_raw,
    NULLIF(BTRIM(codate), '') AS co_date_raw,
    NULLIF(BTRIM(permitstatus), '') AS permit_status_raw,
    NULLIF(BTRIM(appraiser), '') AS appraiser,
    NULLIF(BTRIM(cfs_source_id), '') AS cfs_source_id,
    NULLIF(BTRIM(cfs_source_name), '') AS cfs_source_name,
    NULLIF(BTRIM(cfs_source_url), '') AS cfs_source_url,
    NULLIF(BTRIM(cfs_source_final_url), '') AS cfs_source_final_url,
    NULLIF(BTRIM(cfs_source_filename), '') AS cfs_source_filename,
    NULLIF(BTRIM(cfs_source_last_modified), '') AS source_last_modified,
    NULLIF(BTRIM(cfs_source_etag), '') AS cfs_source_etag,
    NULLIF(BTRIM(cfs_ingested_at), '') AS cfs_ingested_at
  FROM public.real_property_permit
),
parsed AS (
  SELECT
    *,
    CASE
      WHEN permit_date_raw ~* '^\d{1,2}/\d{1,2}/\d{4}\s+\d{1,2}:\d{2}:\d{2}\s+(AM|PM)$'
        THEN to_timestamp(permit_date_raw, 'MM/DD/YYYY HH12:MI:SS AM')::date
      WHEN permit_date_raw ~* '^\d{1,2}/\d{1,2}/\d{4}$'
        THEN to_date(permit_date_raw, 'MM/DD/YYYY')
      WHEN permit_date_raw ~ '^\d{4}-\d{2}-\d{2}'
        THEN permit_date_raw::date
      ELSE NULL
    END AS permit_date,
    CASE
      WHEN co_date_raw ~* '^\d{1,2}/\d{1,2}/\d{4}\s+\d{1,2}:\d{2}:\d{2}\s+(AM|PM)$'
        THEN to_timestamp(co_date_raw, 'MM/DD/YYYY HH12:MI:SS AM')::date
      WHEN co_date_raw ~* '^\d{1,2}/\d{1,2}/\d{4}$'
        THEN to_date(co_date_raw, 'MM/DD/YYYY')
      WHEN co_date_raw ~ '^\d{4}-\d{2}-\d{2}'
        THEN co_date_raw::date
      ELSE NULL
    END AS co_date,
    CASE
      WHEN permit_amount_raw IS NOT NULL
        AND regexp_replace(permit_amount_raw, '[$,\s]', '', 'g') ~ '^-?\d+(\.\d+)?$'
        THEN regexp_replace(permit_amount_raw, '[$,\s]', '', 'g')::numeric
      ELSE NULL
    END AS permit_amount,
    CASE
      WHEN source_last_modified IS NOT NULL THEN source_last_modified::timestamptz
      ELSE NULL
    END AS source_last_modified_at
  FROM normalized
)
SELECT
  permit_id AS real_property_permit_internal_id,
  permit_id,
  permit_number,
  permit_date,
  permit_date AS activity_date,
  EXTRACT(YEAR FROM permit_date)::integer AS activity_year,
  EXTRACT(MONTH FROM permit_date)::integer AS activity_month,
  permit_date_raw,
  parcel_number,
  parcel_id_source,
  permit_code_raw AS permit_code,
  lower(regexp_replace(permit_code_raw, '[^0-9A-Za-z]+', '_', 'g')) AS permit_code_normalized,
  permit_amount_raw,
  permit_amount,
  permit_notes,
  building_number,
  work_type_raw,
  lower(regexp_replace(work_type_raw, '[^0-9A-Za-z]+', '_', 'g')) AS work_type_normalized,
  permit_type_raw,
  lower(regexp_replace(permit_type_raw, '[^0-9A-Za-z]+', '_', 'g')) AS permit_type_normalized,
  co_date_raw,
  co_date,
  permit_status_raw,
  lower(regexp_replace(permit_status_raw, '[^0-9A-Za-z]+', '_', 'g')) AS permit_status_normalized,
  appraiser,
  CASE
    WHEN permit_date_raw IS NULL THEN 'missing'
    WHEN permit_date IS NULL THEN 'invalid'
    WHEN permit_date > CURRENT_DATE THEN 'future_outlier'
    ELSE 'valid'
  END AS permit_date_quality_status,
  CASE
    WHEN co_date_raw IS NULL THEN 'missing'
    WHEN co_date IS NULL THEN 'invalid'
    WHEN co_date > CURRENT_DATE THEN 'future_outlier'
    ELSE 'valid'
  END AS co_date_quality_status,
  (permit_date_raw IS NULL OR permit_date IS NULL OR permit_date > CURRENT_DATE) AS has_invalid_or_future_permit_date,
  (co_date_raw IS NOT NULL AND (co_date IS NULL OR co_date > CURRENT_DATE)) AS has_invalid_or_future_co_date,
  cfs_source_id,
  cfs_source_name,
  cfs_source_url,
  cfs_source_final_url,
  cfs_source_filename,
  source_last_modified,
  source_last_modified_at,
  cfs_source_etag,
  cfs_ingested_at,
  now() AS transformed_at
FROM parsed;

CREATE UNIQUE INDEX IF NOT EXISTS real_property_permit_clean_permit_id_uidx
  ON public.real_property_permit_clean (permit_id)
  WHERE permit_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS real_property_permit_clean_permit_number_idx
  ON public.real_property_permit_clean (permit_number);

CREATE INDEX IF NOT EXISTS real_property_permit_clean_parcel_number_idx
  ON public.real_property_permit_clean (parcel_number);

CREATE INDEX IF NOT EXISTS real_property_permit_clean_permit_date_idx
  ON public.real_property_permit_clean (permit_date);

CREATE INDEX IF NOT EXISTS real_property_permit_clean_activity_year_idx
  ON public.real_property_permit_clean (activity_year);

CREATE INDEX IF NOT EXISTS real_property_permit_clean_activity_month_idx
  ON public.real_property_permit_clean (activity_month);

CREATE INDEX IF NOT EXISTS real_property_permit_clean_permit_status_idx
  ON public.real_property_permit_clean (permit_status_normalized);

CREATE INDEX IF NOT EXISTS real_property_permit_clean_permit_type_idx
  ON public.real_property_permit_clean (permit_type_normalized);

CREATE INDEX IF NOT EXISTS real_property_permit_clean_work_type_idx
  ON public.real_property_permit_clean (work_type_normalized);

ANALYZE public.real_property_permit_clean;
