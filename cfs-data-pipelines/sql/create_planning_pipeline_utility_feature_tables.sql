-- Phase 16A planning intent, development pipeline, utility proxy, and parcel enrichment tables.
-- These are current-context/readiness features only. They do not activate or expose predictions.

CREATE TABLE IF NOT EXISTS public.central_area_plan_raw (
    raw_central_area_plan_id bigserial PRIMARY KEY,
    source_key text NOT NULL,
    source_name text NOT NULL,
    source_objectid text,
    layer_id integer NOT NULL,
    layer_role text NOT NULL,
    source_url text NOT NULL,
    source_spatial_reference jsonb,
    attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
    geometry geometry(Geometry, 4326),
    ingested_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.central_area_plan_clean (
    central_area_plan_id bigserial PRIMARY KEY,
    source_key text NOT NULL,
    source_name text NOT NULL,
    source_objectid text,
    layer_id integer NOT NULL,
    layer_role text NOT NULL,
    plan_label text,
    plan_category text,
    future_land_use text,
    growth_alignment_class text,
    concord_only boolean NOT NULL DEFAULT true,
    current_context_only boolean NOT NULL DEFAULT true,
    time_safe_for_training boolean NOT NULL DEFAULT false,
    source_url text NOT NULL,
    attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
    geometry geometry(Geometry, 4326),
    geometry_ft geometry(Geometry, 2264),
    geometry_area_acres double precision,
    cleaned_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.accela_plan_reviews_raw (
    raw_accela_plan_review_id bigserial PRIMARY KEY,
    source_key text NOT NULL,
    source_name text NOT NULL,
    source_objectid text,
    layer_id integer NOT NULL,
    source_url text NOT NULL,
    source_spatial_reference jsonb,
    attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
    geometry geometry(Geometry, 4326),
    ingested_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.accela_plan_reviews_clean (
    accela_plan_review_id bigserial PRIMARY KEY,
    source_key text NOT NULL,
    source_name text NOT NULL,
    source_objectid text,
    plan_review_id text,
    official_parcel_id text,
    pin14 text,
    parcel_number_raw text,
    project_name text,
    address text,
    review_type text,
    review_status text,
    file_date date,
    days_open integer,
    pipeline_signal_type text NOT NULL DEFAULT 'current_plan_review',
    early_pipeline_signal boolean NOT NULL DEFAULT true,
    current_context_only boolean NOT NULL DEFAULT true,
    time_safe_for_training boolean NOT NULL DEFAULT false,
    source_url text NOT NULL,
    attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
    geometry geometry(Geometry, 4326),
    geometry_ft geometry(Geometry, 2264),
    cleaned_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.utility_proxy_wsacc_raw (
    raw_utility_proxy_id bigserial PRIMARY KEY,
    source_key text NOT NULL,
    source_name text NOT NULL,
    source_objectid text,
    layer_id integer NOT NULL,
    utility_layer_role text NOT NULL,
    source_url text NOT NULL,
    source_spatial_reference jsonb,
    attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
    geometry geometry(Geometry, 4326),
    ingested_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.utility_proxy_wsacc_clean (
    utility_proxy_id bigserial PRIMARY KEY,
    source_key text NOT NULL,
    source_name text NOT NULL,
    source_objectid text,
    layer_id integer NOT NULL,
    utility_layer_role text NOT NULL,
    utility_label text,
    district_name text,
    pipe_size text,
    pipe_material text,
    install_year integer,
    utility_proxy_type text,
    true_capacity_available boolean NOT NULL DEFAULT false,
    capacity_status text NOT NULL DEFAULT 'not_capacity_data',
    current_context_only boolean NOT NULL DEFAULT true,
    time_safe_for_training boolean NOT NULL DEFAULT false,
    source_url text NOT NULL,
    attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
    geometry geometry(Geometry, 4326),
    geometry_ft geometry(Geometry, 2264),
    geometry_length_ft double precision,
    geometry_area_acres double precision,
    cleaned_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tax_parcel_full_raw (
    raw_tax_parcel_full_id bigserial PRIMARY KEY,
    source_key text NOT NULL,
    source_name text NOT NULL,
    source_objectid text,
    layer_id integer NOT NULL,
    source_url text NOT NULL,
    source_spatial_reference jsonb,
    attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
    geometry geometry(Geometry, 4326),
    ingested_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tax_parcel_value_enrichment (
    tax_parcel_value_enrichment_id bigserial PRIMARY KEY,
    source_key text NOT NULL,
    source_name text NOT NULL,
    source_objectid text,
    official_parcel_id text,
    pin14 text,
    parcel_number_raw text,
    owner_name text,
    situs_address text,
    land_value numeric,
    improvement_value numeric,
    total_value numeric,
    assessed_value numeric,
    tax_value numeric,
    acreage double precision,
    current_context_only boolean NOT NULL DEFAULT true,
    time_safe_for_training boolean NOT NULL DEFAULT false,
    base_table_overwrite_allowed boolean NOT NULL DEFAULT false,
    source_url text NOT NULL,
    attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
    geometry geometry(Geometry, 4326),
    geometry_ft geometry(Geometry, 2264),
    cleaned_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.parcel_central_area_plan_features (
    official_parcel_id text PRIMARY KEY,
    pin14 text,
    inside_central_area_plan boolean NOT NULL DEFAULT false,
    central_area_future_land_use text,
    central_area_future_land_use_growth_alignment text,
    inside_primary_activity_area boolean NOT NULL DEFAULT false,
    inside_service_node boolean NOT NULL DEFAULT false,
    inside_special_corridor boolean NOT NULL DEFAULT false,
    inside_special_use_area boolean NOT NULL DEFAULT false,
    distance_to_nearest_service_node_ft double precision,
    distance_to_nearest_special_corridor_ft double precision,
    concord_only_context boolean NOT NULL DEFAULT true,
    current_context_only boolean NOT NULL DEFAULT true,
    time_safe_for_training boolean NOT NULL DEFAULT false,
    planning_intent_data_quality text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.parcel_accela_plan_review_features (
    official_parcel_id text PRIMARY KEY,
    pin14 text,
    active_plan_review_count integer NOT NULL DEFAULT 0,
    open_plan_review_count integer NOT NULL DEFAULT 0,
    recent_plan_review_count integer NOT NULL DEFAULT 0,
    latest_plan_review_status text,
    latest_plan_review_type text,
    latest_plan_review_file_date date,
    max_plan_review_days_open integer,
    early_pipeline_signal_flag boolean NOT NULL DEFAULT false,
    current_context_only boolean NOT NULL DEFAULT true,
    time_safe_for_training boolean NOT NULL DEFAULT false,
    plan_review_data_quality text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.parcel_utility_proxy_features (
    official_parcel_id text PRIMARY KEY,
    pin14 text,
    distance_to_nearest_wsacc_manhole_ft double precision,
    distance_to_nearest_wsacc_sewer_line_ft double precision,
    inside_wsacc_district_proxy boolean NOT NULL DEFAULT false,
    nearest_wsacc_district_name text,
    utility_proxy_service_context_flag boolean NOT NULL DEFAULT false,
    true_utility_capacity_available boolean NOT NULL DEFAULT false,
    utility_capacity_status text NOT NULL DEFAULT 'not_capacity_data',
    current_context_only boolean NOT NULL DEFAULT true,
    time_safe_for_training boolean NOT NULL DEFAULT false,
    utility_proxy_data_quality text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.parcel_tax_value_enrichment_features (
    official_parcel_id text PRIMARY KEY,
    pin14 text,
    tax_parcel_full_match_found boolean NOT NULL DEFAULT false,
    tax_full_land_value numeric,
    tax_full_improvement_value numeric,
    tax_full_total_value numeric,
    tax_full_assessed_value numeric,
    tax_full_acreage double precision,
    value_enrichment_gap_flags text[],
    base_parcels_overwritten boolean NOT NULL DEFAULT false,
    current_context_only boolean NOT NULL DEFAULT true,
    time_safe_for_training boolean NOT NULL DEFAULT false,
    tax_enrichment_data_quality text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.parcel_planning_pipeline_utility_features (
    official_parcel_id text PRIMARY KEY,
    pin14 text,
    inside_central_area_plan boolean NOT NULL DEFAULT false,
    central_area_future_land_use text,
    central_area_future_land_use_growth_alignment text,
    inside_primary_activity_area boolean NOT NULL DEFAULT false,
    inside_service_node boolean NOT NULL DEFAULT false,
    inside_special_corridor boolean NOT NULL DEFAULT false,
    inside_special_use_area boolean NOT NULL DEFAULT false,
    active_plan_review_count integer NOT NULL DEFAULT 0,
    early_pipeline_signal_flag boolean NOT NULL DEFAULT false,
    distance_to_nearest_wsacc_manhole_ft double precision,
    distance_to_nearest_wsacc_sewer_line_ft double precision,
    inside_wsacc_district_proxy boolean NOT NULL DEFAULT false,
    utility_proxy_service_context_flag boolean NOT NULL DEFAULT false,
    true_utility_capacity_available boolean NOT NULL DEFAULT false,
    tax_parcel_full_match_found boolean NOT NULL DEFAULT false,
    tax_full_land_value numeric,
    tax_full_improvement_value numeric,
    tax_full_total_value numeric,
    current_context_only boolean NOT NULL DEFAULT true,
    time_safe_for_training boolean NOT NULL DEFAULT false,
    include_in_strict_baseline boolean NOT NULL DEFAULT false,
    include_in_future_model boolean NOT NULL DEFAULT true,
    feature_caveat text NOT NULL DEFAULT 'current_context_only_not_time_safe_for_training',
    data_quality_summary text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_central_area_plan_raw_source
    ON public.central_area_plan_raw (source_key, layer_role);
CREATE INDEX IF NOT EXISTS idx_central_area_plan_raw_geometry
    ON public.central_area_plan_raw USING gist (geometry);
CREATE INDEX IF NOT EXISTS idx_central_area_plan_clean_source
    ON public.central_area_plan_clean (source_key, layer_role);
CREATE INDEX IF NOT EXISTS idx_central_area_plan_clean_geometry
    ON public.central_area_plan_clean USING gist (geometry);
CREATE INDEX IF NOT EXISTS idx_central_area_plan_clean_geometry_ft
    ON public.central_area_plan_clean USING gist (geometry_ft);

CREATE INDEX IF NOT EXISTS idx_accela_plan_reviews_clean_parcel
    ON public.accela_plan_reviews_clean (official_parcel_id, pin14);
CREATE INDEX IF NOT EXISTS idx_accela_plan_reviews_clean_status
    ON public.accela_plan_reviews_clean (review_status, file_date);
CREATE INDEX IF NOT EXISTS idx_accela_plan_reviews_clean_geometry_ft
    ON public.accela_plan_reviews_clean USING gist (geometry_ft);

CREATE INDEX IF NOT EXISTS idx_utility_proxy_clean_role
    ON public.utility_proxy_wsacc_clean (utility_layer_role);
CREATE INDEX IF NOT EXISTS idx_utility_proxy_clean_geometry_ft
    ON public.utility_proxy_wsacc_clean USING gist (geometry_ft);

CREATE INDEX IF NOT EXISTS idx_tax_parcel_value_enrichment_parcel
    ON public.tax_parcel_value_enrichment (official_parcel_id, pin14);
CREATE INDEX IF NOT EXISTS idx_tax_parcel_value_enrichment_geometry
    ON public.tax_parcel_value_enrichment USING gist (geometry);

CREATE INDEX IF NOT EXISTS idx_parcel_central_area_plan_flags
    ON public.parcel_central_area_plan_features (
        inside_central_area_plan,
        inside_primary_activity_area,
        inside_special_corridor
    );
CREATE INDEX IF NOT EXISTS idx_parcel_accela_review_flags
    ON public.parcel_accela_plan_review_features (
        early_pipeline_signal_flag,
        active_plan_review_count
    );
CREATE INDEX IF NOT EXISTS idx_parcel_utility_proxy_flags
    ON public.parcel_utility_proxy_features (
        inside_wsacc_district_proxy,
        utility_proxy_service_context_flag
    );
CREATE INDEX IF NOT EXISTS idx_parcel_planning_pipeline_utility_flags
    ON public.parcel_planning_pipeline_utility_features (
        inside_central_area_plan,
        early_pipeline_signal_flag,
        utility_proxy_service_context_flag,
        current_context_only,
        time_safe_for_training
    );
