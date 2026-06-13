-- Cabarrus FutureScape Phase 8D school capacity/enrollment readiness tables.
--
-- This SQL prepares empty tables for future vetted school capacity and
-- enrollment data. It does not insert or fabricate values and does not
-- calculate parcel-level school constraint scores.

CREATE TABLE IF NOT EXISTS public.school_enrollment_history (
  enrollment_history_id text PRIMARY KEY,
  school_name text,
  school_name_normalized text,
  school_level text,
  school_system text,
  school_year integer,
  total_enrollment integer,
  matched_school_reference_id text,
  match_confidence text,
  source_name text,
  source_url text,
  notes text,
  ingested_at timestamptz DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.school_grade_enrollment_history (
  grade_enrollment_id text PRIMARY KEY,
  school_name text,
  school_name_normalized text,
  school_level text,
  school_system text,
  school_year integer,
  grade_level text,
  grade_enrollment integer,
  grade_capacity integer,
  grade_utilization_pct numeric,
  matched_school_reference_id text,
  match_confidence text,
  source_name text,
  source_url text,
  notes text,
  ingested_at timestamptz DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.school_capacity_history (
  capacity_history_id text PRIMARY KEY,
  school_name text,
  school_name_normalized text,
  school_level text,
  school_system text,
  school_year integer,
  functional_capacity integer,
  current_enrollment integer,
  available_seats integer,
  utilization_pct numeric,
  capacity_status text,
  matched_school_reference_id text,
  match_confidence text,
  source_name text,
  source_url text,
  notes text,
  ingested_at timestamptz DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.school_capacity_projection (
  projection_id text PRIMARY KEY,
  school_name text,
  school_name_normalized text,
  school_level text,
  school_system text,
  projection_year integer,
  projected_enrollment integer,
  projected_capacity integer,
  projected_utilization_pct numeric,
  projection_method text,
  matched_school_reference_id text,
  match_confidence text,
  source_name text,
  source_url text,
  notes text,
  ingested_at timestamptz DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.school_planned_capacity_changes (
  planned_change_id text PRIMARY KEY,
  school_name text,
  school_name_normalized text,
  school_level text,
  school_system text,
  project_name text,
  project_type text,
  planned_capacity_added integer,
  planned_capacity_removed integer,
  net_capacity_change integer,
  expected_open_year integer,
  status text,
  matched_school_reference_id text,
  match_confidence text,
  source_name text,
  source_url text,
  notes text,
  ingested_at timestamptz DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.school_capacity_ingestion_qa (
  qa_id text PRIMARY KEY,
  dataset_name text,
  source_file text,
  school_name text,
  school_name_normalized text,
  school_level text,
  school_system text,
  issue_type text,
  severity text,
  issue_description text,
  recommended_fix text,
  row_number integer,
  created_at timestamptz DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.school_capacity (
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

COMMENT ON TABLE public.school_enrollment_history IS
  'Historical school enrollment rows prepared for future vetted CFS school capacity analysis.';

COMMENT ON TABLE public.school_grade_enrollment_history IS
  'Optional grade-level enrollment and capacity rows for future school capacity analysis.';

COMMENT ON TABLE public.school_capacity_history IS
  'Historical school capacity/enrollment snapshots. Future public.school_capacity is derived from latest available year.';

COMMENT ON TABLE public.school_capacity_projection IS
  'Future projected school enrollment/capacity rows. Does not drive scores until vetted.';

COMMENT ON TABLE public.school_planned_capacity_changes IS
  'Future planned school capacity expansion/reduction records.';

COMMENT ON TABLE public.school_capacity_ingestion_qa IS
  'Validation issues captured during future school capacity/enrollment ingestion.';

COMMENT ON TABLE public.school_capacity IS
  'Current school capacity snapshot derived from vetted school_capacity_history rows. Empty until real source data exists.';

CREATE INDEX IF NOT EXISTS school_enrollment_history_school_idx
  ON public.school_enrollment_history (school_name_normalized, school_level, school_system, school_year);

CREATE INDEX IF NOT EXISTS school_grade_enrollment_history_school_idx
  ON public.school_grade_enrollment_history (school_name_normalized, school_level, school_system, school_year, grade_level);

CREATE INDEX IF NOT EXISTS school_capacity_history_school_idx
  ON public.school_capacity_history (school_name_normalized, school_level, school_system, school_year);

CREATE INDEX IF NOT EXISTS school_capacity_projection_school_idx
  ON public.school_capacity_projection (school_name_normalized, school_level, school_system, projection_year);

CREATE INDEX IF NOT EXISTS school_planned_capacity_changes_school_idx
  ON public.school_planned_capacity_changes (school_name_normalized, school_level, school_system, expected_open_year);

CREATE INDEX IF NOT EXISTS school_capacity_ingestion_qa_dataset_idx
  ON public.school_capacity_ingestion_qa (dataset_name, severity, issue_type);

CREATE INDEX IF NOT EXISTS school_capacity_name_level_idx
  ON public.school_capacity (school_name_normalized, school_level, school_system);

CREATE INDEX IF NOT EXISTS school_capacity_reference_idx
  ON public.school_capacity (school_reference_id);

CREATE INDEX IF NOT EXISTS school_capacity_status_idx
  ON public.school_capacity (capacity_status);

ANALYZE public.school_enrollment_history;
ANALYZE public.school_grade_enrollment_history;
ANALYZE public.school_capacity_history;
ANALYZE public.school_capacity_projection;
ANALYZE public.school_planned_capacity_changes;
ANALYZE public.school_capacity_ingestion_qa;
ANALYZE public.school_capacity;
