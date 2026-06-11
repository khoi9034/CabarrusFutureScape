-- Cabarrus FutureScape Phase 8A parcel school summary.
--
-- Combines parcel school attendance-zone assignment with the empty Phase 8A
-- capacity placeholder. No school capacity score is produced until real
-- capacity/enrollment data exists.

DROP TABLE IF EXISTS public.parcel_school_summary;

CREATE TABLE public.parcel_school_summary AS
WITH summary_base AS (
  SELECT
    assignment.official_parcel_id,
    assignment.pin14,
    assignment.objectid_1,
    assignment.elementary_zone_id,
    assignment.elementary_school_name,
    assignment.elementary_school_name_normalized,
    assignment.middle_zone_id,
    assignment.middle_school_name,
    assignment.middle_school_name_normalized,
    assignment.high_zone_id,
    assignment.high_school_name,
    assignment.high_school_name_normalized,
    assignment.has_elementary_assignment,
    assignment.has_middle_assignment,
    assignment.has_high_assignment,
    assignment.school_assignment_confidence,
    assignment.school_assignment_review_required,
    assignment.assignment_method,
    assignment.data_quality_flags AS assignment_quality_flags,
    elementary_capacity.capacity_status AS elementary_capacity_status_raw,
    elementary_capacity.utilization_percent AS elementary_utilization_percent,
    elementary_capacity.available_seats AS elementary_available_seats,
    middle_capacity.capacity_status AS middle_capacity_status_raw,
    middle_capacity.utilization_percent AS middle_utilization_percent,
    middle_capacity.available_seats AS middle_available_seats,
    high_capacity.capacity_status AS high_capacity_status_raw,
    high_capacity.utilization_percent AS high_utilization_percent,
    high_capacity.available_seats AS high_available_seats,
    COALESCE(elementary_capacity.capacity_data_available, FALSE)
      OR COALESCE(middle_capacity.capacity_data_available, FALSE)
      OR COALESCE(high_capacity.capacity_data_available, FALSE)
      AS any_capacity_data_available,
    assignment.geometry
  FROM public.parcel_school_assignment AS assignment
  LEFT JOIN public.school_capacity AS elementary_capacity
    ON elementary_capacity.school_level = 'elementary'
   AND elementary_capacity.school_system = 'CCS'
   AND elementary_capacity.school_name_normalized = assignment.elementary_school_name_normalized
  LEFT JOIN public.school_capacity AS middle_capacity
    ON middle_capacity.school_level = 'middle'
   AND middle_capacity.school_system = 'CCS'
   AND middle_capacity.school_name_normalized = assignment.middle_school_name_normalized
  LEFT JOIN public.school_capacity AS high_capacity
    ON high_capacity.school_level = 'high'
   AND high_capacity.school_system = 'CCS'
   AND high_capacity.school_name_normalized = assignment.high_school_name_normalized
)
SELECT
  official_parcel_id,
  pin14,
  objectid_1,
  elementary_zone_id,
  elementary_school_name,
  elementary_school_name_normalized,
  COALESCE(elementary_capacity_status_raw, 'not_available') AS elementary_capacity_status,
  elementary_utilization_percent,
  elementary_available_seats,
  middle_zone_id,
  middle_school_name,
  middle_school_name_normalized,
  COALESCE(middle_capacity_status_raw, 'not_available') AS middle_capacity_status,
  middle_utilization_percent,
  middle_available_seats,
  high_zone_id,
  high_school_name,
  high_school_name_normalized,
  COALESCE(high_capacity_status_raw, 'not_available') AS high_capacity_status,
  high_utilization_percent,
  high_available_seats,
  has_elementary_assignment,
  has_middle_assignment,
  has_high_assignment,
  school_assignment_confidence,
  school_assignment_review_required,
  assignment_method,
  any_capacity_data_available AS school_capacity_data_available,
  FALSE AS school_capacity_review_required,
  NULL::numeric AS school_capacity_score,
  NULL::numeric AS school_constraint_score,
  'not_scored'::text AS school_constraint_class,
  CASE
    WHEN NOT has_elementary_assignment
      OR NOT has_middle_assignment
      OR NOT has_high_assignment
      THEN 'assignment_incomplete'
    WHEN NOT any_capacity_data_available
      THEN 'assignment_available_capacity_pending'
    ELSE 'assignment_and_capacity_available'
  END AS school_summary_status,
  CASE
    WHEN NOT any_capacity_data_available THEN 'capacity_data_needed'
    WHEN school_assignment_review_required THEN 'assignment_review'
    ELSE 'monitor'
  END AS recommended_action,
  ARRAY_REMOVE(
    COALESCE(assignment_quality_flags, ARRAY[]::text[])
    || ARRAY[
      CASE WHEN NOT any_capacity_data_available THEN 'capacity_not_available' END,
      CASE
        WHEN NOT has_elementary_assignment
          OR NOT has_middle_assignment
          OR NOT has_high_assignment
          THEN 'attendance_assignment_incomplete'
      END
    ]::text[],
    NULL
  ) AS data_quality_flags,
  NOW()::timestamptz AS summarized_at,
  geometry
FROM summary_base;

COMMENT ON TABLE public.parcel_school_summary IS
  'CFS Phase 8A parcel school assignment/capacity summary. Capacity scoring remains null until real capacity data exists.';

ALTER TABLE public.parcel_school_summary
  ADD CONSTRAINT parcel_school_summary_pkey PRIMARY KEY (official_parcel_id);

CREATE INDEX IF NOT EXISTS parcel_school_summary_pin14_idx
  ON public.parcel_school_summary (pin14);

CREATE INDEX IF NOT EXISTS parcel_school_summary_elementary_idx
  ON public.parcel_school_summary (elementary_school_name_normalized);

CREATE INDEX IF NOT EXISTS parcel_school_summary_middle_idx
  ON public.parcel_school_summary (middle_school_name_normalized);

CREATE INDEX IF NOT EXISTS parcel_school_summary_high_idx
  ON public.parcel_school_summary (high_school_name_normalized);

CREATE INDEX IF NOT EXISTS parcel_school_summary_status_idx
  ON public.parcel_school_summary (school_summary_status);

CREATE INDEX IF NOT EXISTS parcel_school_summary_constraint_class_idx
  ON public.parcel_school_summary (school_constraint_class);

CREATE INDEX IF NOT EXISTS parcel_school_summary_geometry_gix
  ON public.parcel_school_summary
  USING GIST (geometry);

ANALYZE public.parcel_school_summary;
