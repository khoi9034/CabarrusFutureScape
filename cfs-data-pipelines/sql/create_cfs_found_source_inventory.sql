-- Phase 13A optional source inventory table.
-- Metadata only. Do not use this table to ingest full source geometries.

CREATE TABLE IF NOT EXISTS public.cfs_found_source_inventory (
    source_key text PRIMARY KEY,
    source_name text NOT NULL,
    source_url text NOT NULL,
    jurisdiction text,
    geography_scope text,
    geometry_type text,
    record_count integer,
    feature_group text,
    model_use_status text,
    time_safe_for_training boolean NOT NULL DEFAULT false,
    current_context_only boolean NOT NULL DEFAULT true,
    caveats text,
    profiled_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cfs_found_source_inventory_feature_group
    ON public.cfs_found_source_inventory (feature_group);

CREATE INDEX IF NOT EXISTS idx_cfs_found_source_inventory_scope
    ON public.cfs_found_source_inventory (geography_scope);
