-- Cabarrus FutureScape Phase 8A school capacity placeholder.
--
-- This table is intentionally empty until a vetted enrollment/capacity source
-- is approved. Do not fabricate capacity, utilization, seats, or scores.

DROP TABLE IF EXISTS public.school_capacity;

CREATE TABLE public.school_capacity (
  school_capacity_id text PRIMARY KEY,
  school_reference_id text,
  school_name_normalized text,
  school_level text,
  school_system text,
  school_year text,
  enrollment integer,
  program_capacity integer,
  utilization_percent numeric,
  available_seats integer,
  capacity_status text,
  capacity_data_available boolean DEFAULT false,
  source_name text,
  source_date date,
  source_notes text,
  created_at timestamptz DEFAULT NOW()
);

COMMENT ON TABLE public.school_capacity IS
  'Empty Phase 8A placeholder for future vetted school capacity/enrollment data. CFS V1 does not score school capacity without a real source.';

CREATE INDEX IF NOT EXISTS school_capacity_name_level_idx
  ON public.school_capacity (school_name_normalized, school_level, school_system);

CREATE INDEX IF NOT EXISTS school_capacity_reference_idx
  ON public.school_capacity (school_reference_id);

CREATE INDEX IF NOT EXISTS school_capacity_status_idx
  ON public.school_capacity (capacity_status);

ANALYZE public.school_capacity;
