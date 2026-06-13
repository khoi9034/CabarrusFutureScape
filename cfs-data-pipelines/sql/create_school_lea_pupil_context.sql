-- Cabarrus FutureScape Phase 9G district-level LEA pupil context.
-- This table stores LEA-wide pupil counts only. It must not be used as
-- school-level capacity, parcel-level capacity pressure, or official scoring.

CREATE TABLE IF NOT EXISTS public.school_lea_pupil_context (
  lea_pupil_context_id text PRIMARY KEY,
  school_year integer NOT NULL,
  lea text NOT NULL,
  lea_name text,
  month text,
  measure_type text NOT NULL,
  grade_level text NOT NULL,
  pupil_count integer,
  source_file text,
  source_confidence text NOT NULL DEFAULT 'uploaded_lea_pupil_file',
  notes text,
  ingested_at timestamptz NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.school_lea_pupil_context IS
  'District-level CCS LEA pupil context by measure and grade. Not school-level capacity and not used for school constraint scoring.';

CREATE UNIQUE INDEX IF NOT EXISTS school_lea_pupil_context_unique_idx
  ON public.school_lea_pupil_context (
    school_year,
    lea,
    month,
    measure_type,
    grade_level
  );

CREATE INDEX IF NOT EXISTS school_lea_pupil_context_year_measure_idx
  ON public.school_lea_pupil_context (school_year, measure_type);

CREATE INDEX IF NOT EXISTS school_lea_pupil_context_grade_idx
  ON public.school_lea_pupil_context (grade_level);
