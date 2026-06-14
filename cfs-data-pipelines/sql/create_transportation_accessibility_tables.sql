-- Phase 12B transportation/accessibility staging and parcel feature tables.
-- Current-context only: do not treat these features as historical snapshots.

CREATE TABLE IF NOT EXISTS public.transportation_centerlines_raw (
    raw_centerline_id bigserial PRIMARY KEY,
    source_key text NOT NULL,
    source_name text NOT NULL,
    source_objectid text,
    layer_id integer,
    source_url text NOT NULL,
    source_spatial_reference jsonb,
    attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
    geometry geometry(Geometry, 4326),
    ingested_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.transportation_centerlines_clean (
    transportation_centerline_id bigserial PRIMARY KEY,
    source_key text NOT NULL,
    source_name text NOT NULL,
    source_objectid text,
    road_name text,
    road_type text,
    road_class text,
    route_type text,
    jurisdiction_or_maintenance text,
    speed_limit integer,
    one_way text,
    is_major_road boolean,
    major_road_classification_method text,
    geometry geometry(MultiLineString, 4326),
    geometry_ft geometry(MultiLineString, 2264),
    geometry_length_ft double precision,
    cleaned_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.transportation_rail_raw (
    raw_rail_id bigserial PRIMARY KEY,
    source_key text NOT NULL,
    source_name text NOT NULL,
    source_objectid text,
    layer_id integer,
    source_url text NOT NULL,
    source_spatial_reference jsonb,
    attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
    geometry geometry(Geometry, 4326),
    ingested_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.transportation_rail_clean (
    transportation_rail_id bigserial PRIMARY KEY,
    source_key text NOT NULL,
    source_name text NOT NULL,
    source_objectid text,
    rail_name text,
    rail_type text,
    is_corridor boolean NOT NULL DEFAULT false,
    road_name text,
    road_type text,
    road_class text,
    route_type text,
    jurisdiction_or_maintenance text,
    geometry geometry(Geometry, 4326),
    geometry_ft geometry(Geometry, 2264),
    geometry_length_ft double precision,
    cleaned_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.parcel_transportation_accessibility_features (
    official_parcel_id text PRIMARY KEY,
    pin14 text,
    distance_to_nearest_road_ft double precision,
    nearest_road_name text,
    nearest_road_type text,
    distance_to_nearest_major_road_ft double precision,
    nearest_major_road_name text,
    road_length_within_500ft double precision,
    road_length_within_1000ft double precision,
    road_length_within_half_mile double precision,
    road_density_1000ft double precision,
    road_density_half_mile double precision,
    intersection_count_within_1000ft integer,
    intersection_feature_status text NOT NULL DEFAULT 'not_built_unreliable_for_phase12b',
    distance_to_nearest_rail_ft double precision,
    rail_corridor_within_half_mile boolean,
    transportation_accessibility_data_quality text NOT NULL,
    current_context_only boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transportation_centerlines_raw_source
    ON public.transportation_centerlines_raw (source_key);

CREATE INDEX IF NOT EXISTS idx_transportation_centerlines_raw_geometry
    ON public.transportation_centerlines_raw USING gist (geometry);

CREATE INDEX IF NOT EXISTS idx_transportation_centerlines_clean_source
    ON public.transportation_centerlines_clean (source_key);

CREATE INDEX IF NOT EXISTS idx_transportation_centerlines_clean_major
    ON public.transportation_centerlines_clean (is_major_road)
    WHERE is_major_road IS TRUE;

CREATE INDEX IF NOT EXISTS idx_transportation_centerlines_clean_geometry
    ON public.transportation_centerlines_clean USING gist (geometry);

CREATE INDEX IF NOT EXISTS idx_transportation_centerlines_clean_geometry_ft
    ON public.transportation_centerlines_clean USING gist (geometry_ft);

CREATE INDEX IF NOT EXISTS idx_transportation_rail_raw_source
    ON public.transportation_rail_raw (source_key);

CREATE INDEX IF NOT EXISTS idx_transportation_rail_raw_geometry
    ON public.transportation_rail_raw USING gist (geometry);

CREATE INDEX IF NOT EXISTS idx_transportation_rail_clean_source
    ON public.transportation_rail_clean (source_key);

CREATE INDEX IF NOT EXISTS idx_transportation_rail_clean_corridor
    ON public.transportation_rail_clean (is_corridor);

CREATE INDEX IF NOT EXISTS idx_transportation_rail_clean_geometry
    ON public.transportation_rail_clean USING gist (geometry);

CREATE INDEX IF NOT EXISTS idx_transportation_rail_clean_geometry_ft
    ON public.transportation_rail_clean USING gist (geometry_ft);

CREATE INDEX IF NOT EXISTS idx_parcel_transportation_accessibility_pin14
    ON public.parcel_transportation_accessibility_features (pin14);

CREATE INDEX IF NOT EXISTS idx_parcel_transportation_accessibility_quality
    ON public.parcel_transportation_accessibility_features (
        transportation_accessibility_data_quality
    );
