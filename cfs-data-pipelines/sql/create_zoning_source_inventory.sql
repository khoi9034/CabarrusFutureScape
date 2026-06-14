-- Phase 10D-0 current zoning source inventory.
--
-- This table stores source metadata only. It does not ingest zoning geometry,
-- rebuild parcel overlays, or create zoning-change events.

CREATE TABLE IF NOT EXISTS public.zoning_source_inventory (
    source_key text PRIMARY KEY,
    source_name text NOT NULL,
    jurisdiction text NOT NULL,
    service_url text NOT NULL,
    layer_id integer NOT NULL,
    geometry_type text,
    zoning_code_field text,
    case_number_field text,
    date_field text,
    current_or_historical text NOT NULL,
    time_safe_for_prediction boolean NOT NULL,
    current_context_usable boolean NOT NULL,
    notes text,
    profiled_at timestamptz NOT NULL DEFAULT now()
);
