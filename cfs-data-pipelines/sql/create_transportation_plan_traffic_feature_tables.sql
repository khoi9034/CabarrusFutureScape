-- Phase 13B STIP/AADT transportation planning and traffic context tables.
-- Current-context only: do not treat these features as strict historical inputs.

CREATE TABLE IF NOT EXISTS public.transportation_stip_projects_raw (
    raw_stip_project_id bigserial PRIMARY KEY,
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

CREATE TABLE IF NOT EXISTS public.transportation_stip_projects_clean (
    stip_project_id bigserial PRIMARY KEY,
    source_key text NOT NULL,
    source_name text NOT NULL,
    source_objectid text,
    project_name text,
    project_description text,
    project_type text,
    route_name text,
    county text,
    jurisdiction text,
    project_status text,
    funding_status text,
    start_year integer,
    end_year integer,
    fiscal_year integer,
    construction_year integer,
    source_year_range text,
    geometry geometry(Geometry, 4326),
    geometry_ft geometry(Geometry, 2264),
    geometry_length_ft double precision,
    geometry_type text,
    source_url text NOT NULL,
    source_confidence text NOT NULL DEFAULT 'source_reported_current_context',
    cleaned_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.transportation_aadt_stations_raw (
    raw_aadt_station_id bigserial PRIMARY KEY,
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

CREATE TABLE IF NOT EXISTS public.transportation_aadt_stations_clean (
    aadt_station_id bigserial PRIMARY KEY,
    source_key text NOT NULL,
    source_name text NOT NULL,
    source_objectid text,
    station_id text,
    route_name text,
    road_name text,
    aadt_value integer,
    count_year integer,
    vehicle_classification text,
    geometry geometry(Point, 4326),
    geometry_ft geometry(Point, 2264),
    source_url text NOT NULL,
    source_confidence text NOT NULL DEFAULT 'source_reported_current_context',
    cleaned_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.parcel_transportation_plan_traffic_features (
    official_parcel_id text PRIMARY KEY,
    pin14 text,
    nearest_stip_project_distance_ft double precision,
    nearest_stip_project_name text,
    nearest_stip_project_type text,
    nearest_stip_project_year integer,
    stip_project_within_half_mile boolean NOT NULL DEFAULT false,
    stip_project_within_1_mile boolean NOT NULL DEFAULT false,
    stip_project_count_within_1_mile integer NOT NULL DEFAULT 0,
    stip_project_count_within_3_miles integer NOT NULL DEFAULT 0,
    planned_transportation_investment_flag boolean NOT NULL DEFAULT false,
    planned_transportation_context_quality text NOT NULL,
    nearest_aadt_station_distance_ft double precision,
    nearest_aadt_station_route text,
    nearest_aadt_value integer,
    nearest_aadt_count_year integer,
    max_aadt_within_half_mile integer,
    max_aadt_within_1_mile integer,
    avg_aadt_within_1_mile double precision,
    aadt_station_count_within_1_mile integer NOT NULL DEFAULT 0,
    traffic_demand_context_quality text NOT NULL,
    current_context_only boolean NOT NULL DEFAULT true,
    time_safe_for_training boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transportation_stip_raw_source
    ON public.transportation_stip_projects_raw (source_key);

CREATE INDEX IF NOT EXISTS idx_transportation_stip_raw_geometry
    ON public.transportation_stip_projects_raw USING gist (geometry);

CREATE INDEX IF NOT EXISTS idx_transportation_stip_clean_source
    ON public.transportation_stip_projects_clean (source_key);

CREATE INDEX IF NOT EXISTS idx_transportation_stip_clean_year
    ON public.transportation_stip_projects_clean (construction_year, start_year);

CREATE INDEX IF NOT EXISTS idx_transportation_stip_clean_geometry
    ON public.transportation_stip_projects_clean USING gist (geometry);

CREATE INDEX IF NOT EXISTS idx_transportation_stip_clean_geometry_ft
    ON public.transportation_stip_projects_clean USING gist (geometry_ft);

CREATE INDEX IF NOT EXISTS idx_transportation_aadt_raw_source
    ON public.transportation_aadt_stations_raw (source_key);

CREATE INDEX IF NOT EXISTS idx_transportation_aadt_raw_geometry
    ON public.transportation_aadt_stations_raw USING gist (geometry);

CREATE INDEX IF NOT EXISTS idx_transportation_aadt_clean_source
    ON public.transportation_aadt_stations_clean (source_key);

CREATE INDEX IF NOT EXISTS idx_transportation_aadt_clean_year_value
    ON public.transportation_aadt_stations_clean (count_year, aadt_value);

CREATE INDEX IF NOT EXISTS idx_transportation_aadt_clean_geometry
    ON public.transportation_aadt_stations_clean USING gist (geometry);

CREATE INDEX IF NOT EXISTS idx_transportation_aadt_clean_geometry_ft
    ON public.transportation_aadt_stations_clean USING gist (geometry_ft);

CREATE INDEX IF NOT EXISTS idx_parcel_transportation_plan_traffic_pin14
    ON public.parcel_transportation_plan_traffic_features (pin14);

CREATE INDEX IF NOT EXISTS idx_parcel_transportation_plan_traffic_flags
    ON public.parcel_transportation_plan_traffic_features (
        planned_transportation_investment_flag,
        current_context_only,
        time_safe_for_training
    );
