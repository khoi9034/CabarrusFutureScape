-- Phase 10D-1 historical zoning raw and clean staging tables.
--
-- This foundation stores historical zoning source layers separately from the
-- current zoning overlay. It must not overwrite parcel_zoning_overlay_v2 or use
-- current zoning as historical zoning.

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS public.historical_zoning_raw (
    historical_zoning_raw_id bigserial PRIMARY KEY,
    source_key text NOT NULL,
    source_name text NOT NULL,
    jurisdiction text NOT NULL,
    source_year integer NOT NULL,
    layer_id integer NOT NULL,
    source_objectid text,
    source_url text NOT NULL,
    attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
    geometry geometry(Geometry, 4326),
    ingested_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.historical_zoning_clean (
    historical_zoning_id bigserial PRIMARY KEY,
    source_key text NOT NULL,
    source_name text NOT NULL,
    jurisdiction text NOT NULL,
    source_year integer NOT NULL,
    layer_id integer NOT NULL,
    source_objectid text,
    zoning_code_raw text,
    zoning_code_normalized text,
    zoning_district_raw text,
    zoning_general_category text,
    case_number text,
    date_field_value text,
    geometry geometry(MultiPolygon, 4326),
    geometry_area_acres numeric,
    schema_quality text NOT NULL DEFAULT 'review_required',
    cleaned_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS historical_zoning_raw_source_idx
    ON public.historical_zoning_raw (source_key, source_year, jurisdiction);

CREATE INDEX IF NOT EXISTS historical_zoning_raw_geometry_gix
    ON public.historical_zoning_raw USING gist (geometry);

CREATE INDEX IF NOT EXISTS historical_zoning_clean_source_idx
    ON public.historical_zoning_clean (source_key, source_year, jurisdiction);

CREATE INDEX IF NOT EXISTS historical_zoning_clean_code_idx
    ON public.historical_zoning_clean (zoning_code_normalized);

CREATE INDEX IF NOT EXISTS historical_zoning_clean_category_idx
    ON public.historical_zoning_clean (zoning_general_category);

CREATE INDEX IF NOT EXISTS historical_zoning_clean_quality_idx
    ON public.historical_zoning_clean (schema_quality);

CREATE INDEX IF NOT EXISTS historical_zoning_clean_geometry_gix
    ON public.historical_zoning_clean USING gist (geometry);
