-- Cabarrus FutureScape Phase 8E presentation-derived school utilization seed.
--
-- This is a temporary planning presentation seed. It does not contain official
-- enrollment, functional capacity, available seats, grade-level counts, or
-- projections. It must not populate or overwrite public.school_capacity.

CREATE TABLE IF NOT EXISTS public.school_presentation_utilization_seed (
  seed_id text PRIMARY KEY,
  school_abbreviation text,
  school_name text,
  school_name_normalized text,
  school_level text,
  school_year text,
  utilization_pct numeric,
  utilization_class text,
  matched_school_reference_id text,
  match_confidence text,
  source_name text,
  source_confidence text,
  needs_verification boolean DEFAULT true,
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

COMMENT ON TABLE public.school_presentation_utilization_seed IS
  'Temporary CCS capital-planning-presentation-derived utilization seed. Not official capacity data and not used to populate public.school_capacity.';

CREATE INDEX IF NOT EXISTS school_presentation_util_seed_school_idx
  ON public.school_presentation_utilization_seed (
    school_name_normalized,
    school_level,
    school_year
  );

CREATE INDEX IF NOT EXISTS school_presentation_util_seed_class_idx
  ON public.school_presentation_utilization_seed (utilization_class);

CREATE INDEX IF NOT EXISTS school_presentation_util_seed_source_idx
  ON public.school_presentation_utilization_seed (
    source_confidence,
    needs_verification
  );

CREATE OR REPLACE VIEW public.school_utilization_seed_current AS
WITH ranked AS (
  SELECT
    seed.*,
    ROW_NUMBER() OVER (
      PARTITION BY seed.school_name_normalized, seed.school_level
      ORDER BY seed.school_year DESC, seed.ingested_at DESC
    ) AS row_rank
  FROM public.school_presentation_utilization_seed AS seed
)
SELECT
  school_name,
  school_name_normalized,
  school_level,
  school_year,
  utilization_pct,
  utilization_class,
  source_confidence,
  needs_verification,
  matched_school_reference_id,
  match_confidence
FROM ranked
WHERE row_rank = 1;

COMMENT ON VIEW public.school_utilization_seed_current IS
  'Current latest presentation-derived utilization seed per school. Provisional visualization/testing only; not official capacity data.';

ANALYZE public.school_presentation_utilization_seed;
ANALYZE public.school_capacity_ingestion_qa;
