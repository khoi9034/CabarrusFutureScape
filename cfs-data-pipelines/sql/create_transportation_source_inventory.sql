-- Phase 12A optional source profile table.
-- This table is for transportation/accessibility source metadata only.
-- Do not use this script to ingest full road or rail geometries.

CREATE TABLE IF NOT EXISTS public.transportation_source_inventory (
    source_key text PRIMARY KEY,
    source_name text NOT NULL,
    service_root_url text NOT NULL,
    layer_id integer,
    full_layer_url text NOT NULL,
    fallback_url text,
    geometry_type text,
    record_count integer,
    primary_name_field text,
    road_class_field text,
    route_type_field text,
    current_or_historical text NOT NULL DEFAULT 'current_context',
    current_context_usable boolean NOT NULL DEFAULT false,
    time_safe_for_prediction boolean NOT NULL DEFAULT false,
    prediction_feature_role text,
    notes text,
    profiled_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transportation_source_inventory_layer_id
    ON public.transportation_source_inventory (layer_id);

CREATE INDEX IF NOT EXISTS idx_transportation_source_inventory_prediction_role
    ON public.transportation_source_inventory (prediction_feature_role);
