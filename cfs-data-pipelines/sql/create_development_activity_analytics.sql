-- Cabarrus FutureScape Phase 3 development activity analytics.
--
-- Builds parcel, time, and zoning summaries from the Real Property
-- Permit-to-Parcel relationship model. This is analytics preparation only:
-- it does not modify the frontend dashboard, build APIs, create UI, delete
-- permit source tables, or treat the SharePoint source as a real-time feed.

DROP TABLE IF EXISTS public.development_activity_parcel_summary;
DROP TABLE IF EXISTS public.development_activity_time_summary;
DROP TABLE IF EXISTS public.development_activity_zoning_summary;

CREATE TABLE public.development_activity_parcel_summary AS
WITH activity_anchor AS (
  SELECT MAX(activity_date) AS anchor_date
  FROM public.real_property_permit_parcel_relationship
  WHERE activity_date IS NOT NULL
),
parcel_context AS (
  SELECT
    parcel.official_parcel_id,
    parcel.objectid_1,
    parcel.pin14,
    parcel.subdiv_name,
    parcel.nbh_name,
    parcel.parcel_quality_status,
    parcel.valuation_band,
    parcel.parcel_size_category,
    zoning.zoning_jurisdiction_name,
    zoning.planning_jurisdiction_name,
    zoning.dominant_zoning_code_raw,
    zoning.dominant_zoning_general_normalized,
    zoning.zoning_assignment_confidence,
    qa.governance_warning_categories,
    qa.primary_governance_warning,
    qa.safe_for_dashboard
  FROM public.parcels_enriched AS parcel
  LEFT JOIN public.parcel_zoning_overlay_v2 AS zoning
    ON zoning.official_parcel_id = parcel.official_parcel_id
  LEFT JOIN public.parcel_zoning_intelligence_qa AS qa
    ON qa.official_parcel_id = parcel.official_parcel_id
),
matched_activity AS (
  SELECT *
  FROM public.real_property_permit_parcel_relationship
  WHERE has_parcel_match
),
activity_rollup AS (
  SELECT
    official_parcel_id,
    COUNT(DISTINCT permit_id) AS total_permit_count,
    MIN(activity_date) AS first_permit_date,
    MAX(activity_date) AS latest_permit_date,
    COUNT(DISTINCT activity_year) FILTER (WHERE activity_year IS NOT NULL) AS active_year_count,
    COUNT(DISTINCT permit_id) FILTER (
      WHERE activity_date >= (SELECT anchor_date FROM activity_anchor) - INTERVAL '1 year'
    ) AS recent_permit_count_1yr,
    COUNT(DISTINCT permit_id) FILTER (
      WHERE activity_date >= (SELECT anchor_date FROM activity_anchor) - INTERVAL '3 years'
    ) AS recent_permit_count_3yr,
    SUM(permit_amount) AS total_permit_amount,
    AVG(permit_amount) AS avg_permit_amount,
    COUNT(DISTINCT permit_id) FILTER (WHERE has_multiple_parcel_matches) AS ambiguous_permit_count,
    BOOL_OR(has_multiple_parcel_matches) AS has_ambiguous_permit_flag,
    COUNT(*) FILTER (WHERE co_date_future_outlier) AS co_date_future_outlier_count
  FROM matched_activity
  GROUP BY official_parcel_id
),
permit_type_rank AS (
  SELECT
    official_parcel_id,
    permit_type_normalized,
    ROW_NUMBER() OVER (
      PARTITION BY official_parcel_id
      ORDER BY COUNT(DISTINCT permit_id) DESC,
               MAX(activity_date) DESC NULLS LAST,
               permit_type_normalized
    ) AS type_rank
  FROM matched_activity
  WHERE permit_type_normalized IS NOT NULL
  GROUP BY official_parcel_id, permit_type_normalized
),
work_type_rank AS (
  SELECT
    official_parcel_id,
    work_type_normalized,
    ROW_NUMBER() OVER (
      PARTITION BY official_parcel_id
      ORDER BY COUNT(DISTINCT permit_id) DESC,
               MAX(activity_date) DESC NULLS LAST,
               work_type_normalized
    ) AS work_rank
  FROM matched_activity
  WHERE work_type_normalized IS NOT NULL
  GROUP BY official_parcel_id, work_type_normalized
),
latest_status AS (
  SELECT DISTINCT ON (official_parcel_id)
    official_parcel_id,
    permit_status_normalized AS latest_permit_status
  FROM matched_activity
  ORDER BY
    official_parcel_id,
    activity_date DESC NULLS LAST,
    permit_id DESC
),
scored AS (
  SELECT
    context.official_parcel_id,
    context.objectid_1,
    context.pin14,
    context.subdiv_name,
    context.nbh_name,
    context.parcel_quality_status,
    context.valuation_band,
    context.parcel_size_category,
    context.zoning_jurisdiction_name,
    context.planning_jurisdiction_name,
    context.dominant_zoning_code_raw,
    context.dominant_zoning_general_normalized,
    context.zoning_assignment_confidence,
    context.governance_warning_categories,
    context.primary_governance_warning,
    context.safe_for_dashboard,
    COALESCE(rollup.total_permit_count, 0)::integer AS total_permit_count,
    rollup.first_permit_date,
    rollup.latest_permit_date,
    COALESCE(rollup.active_year_count, 0)::integer AS active_year_count,
    COALESCE(rollup.recent_permit_count_1yr, 0)::integer AS recent_permit_count_1yr,
    COALESCE(rollup.recent_permit_count_3yr, 0)::integer AS recent_permit_count_3yr,
    COALESCE(rollup.total_permit_amount, 0)::numeric AS total_permit_amount,
    rollup.avg_permit_amount,
    permit_type_rank.permit_type_normalized AS dominant_permit_type,
    work_type_rank.work_type_normalized AS dominant_work_type,
    latest_status.latest_permit_status,
    COALESCE(rollup.ambiguous_permit_count, 0)::integer AS ambiguous_permit_count,
    COALESCE(rollup.has_ambiguous_permit_flag, false) AS has_unmatched_or_ambiguous_permit_flag,
    COALESCE(rollup.co_date_future_outlier_count, 0)::integer AS co_date_future_outlier_count,
    (SELECT anchor_date FROM activity_anchor) AS activity_anchor_date,
    ROUND(
      LEAST(
        100,
        (
          COALESCE(rollup.total_permit_count, 0) * 4
          + COALESCE(rollup.recent_permit_count_1yr, 0) * 8
          + COALESCE(rollup.recent_permit_count_3yr, 0) * 4
          + COALESCE(rollup.active_year_count, 0) * 2
          + CASE
              WHEN COALESCE(rollup.total_permit_amount, 0) > 0
                THEN LEAST(20, LN(COALESCE(rollup.total_permit_amount, 0) + 1) / LN(10) * 3)
              ELSE 0
            END
        )::numeric
      ),
      2
    ) AS development_activity_score
  FROM parcel_context AS context
  LEFT JOIN activity_rollup AS rollup
    ON rollup.official_parcel_id = context.official_parcel_id
  LEFT JOIN permit_type_rank
    ON permit_type_rank.official_parcel_id = context.official_parcel_id
   AND permit_type_rank.type_rank = 1
  LEFT JOIN work_type_rank
    ON work_type_rank.official_parcel_id = context.official_parcel_id
   AND work_type_rank.work_rank = 1
  LEFT JOIN latest_status
    ON latest_status.official_parcel_id = context.official_parcel_id
)
SELECT
  *,
  CASE
    WHEN total_permit_count = 0 THEN 'no_activity'
    WHEN development_activity_score < 15 THEN 'low_activity'
    WHEN development_activity_score < 35 THEN 'moderate_activity'
    WHEN development_activity_score < 65 THEN 'high_activity'
    ELSE 'very_high_activity'
  END AS development_activity_class,
  now()::timestamptz AS summarized_at
FROM scored;

COMMENT ON TABLE public.development_activity_parcel_summary IS
  'CFS parcel-level development activity summary derived from Real Property Permit-to-Parcel relationships.';
COMMENT ON COLUMN public.development_activity_parcel_summary.activity_anchor_date IS
  'Dataset max activity_date used for trailing 1-year and 3-year recent permit counts.';
COMMENT ON COLUMN public.development_activity_parcel_summary.has_unmatched_or_ambiguous_permit_flag IS
  'True when a parcel has attached low-confidence/multiple-parcel permit relationships. Unmatched permits have no parcel row and are reported in validation outputs.';

ALTER TABLE public.development_activity_parcel_summary
  ADD CONSTRAINT development_activity_parcel_summary_pkey PRIMARY KEY (official_parcel_id);

CREATE INDEX IF NOT EXISTS dev_activity_parcel_pin14_idx
  ON public.development_activity_parcel_summary (pin14);

CREATE INDEX IF NOT EXISTS dev_activity_parcel_class_idx
  ON public.development_activity_parcel_summary (development_activity_class);

CREATE INDEX IF NOT EXISTS dev_activity_parcel_score_idx
  ON public.development_activity_parcel_summary (development_activity_score);

CREATE INDEX IF NOT EXISTS dev_activity_parcel_latest_date_idx
  ON public.development_activity_parcel_summary (latest_permit_date);

CREATE INDEX IF NOT EXISTS dev_activity_parcel_zoning_jurisdiction_idx
  ON public.development_activity_parcel_summary (zoning_jurisdiction_name);

CREATE INDEX IF NOT EXISTS dev_activity_parcel_zoning_general_idx
  ON public.development_activity_parcel_summary (dominant_zoning_general_normalized);

CREATE TABLE public.development_activity_time_summary AS
SELECT
  activity_year,
  activity_month,
  permit_type_normalized AS permit_type,
  work_type_normalized AS work_type,
  permit_status_normalized AS permit_status,
  COALESCE(zoning_jurisdiction_name, '(unmatched parcel)') AS zoning_jurisdiction_name,
  COUNT(DISTINCT permit_id) AS permit_count,
  COUNT(*) AS relationship_row_count,
  COUNT(DISTINCT official_parcel_id) FILTER (WHERE has_parcel_match) AS active_parcel_count,
  COUNT(DISTINCT permit_id) FILTER (WHERE missing_parcel_match) AS unmatched_permit_count,
  COUNT(DISTINCT permit_id) FILTER (WHERE has_multiple_parcel_matches) AS ambiguous_permit_count,
  COUNT(*) FILTER (WHERE co_date_future_outlier) AS co_date_future_outlier_count,
  SUM(permit_amount) AS total_permit_amount,
  AVG(permit_amount) AS avg_permit_amount,
  MIN(activity_date) AS first_permit_date,
  MAX(activity_date) AS latest_permit_date,
  now()::timestamptz AS summarized_at
FROM public.real_property_permit_parcel_relationship
GROUP BY
  activity_year,
  activity_month,
  permit_type_normalized,
  work_type_normalized,
  permit_status_normalized,
  COALESCE(zoning_jurisdiction_name, '(unmatched parcel)');

COMMENT ON TABLE public.development_activity_time_summary IS
  'CFS time-slice development activity summary by year, month, permit type, work type, status, and zoning jurisdiction.';

CREATE INDEX IF NOT EXISTS dev_activity_time_year_month_idx
  ON public.development_activity_time_summary (activity_year, activity_month);

CREATE INDEX IF NOT EXISTS dev_activity_time_permit_type_idx
  ON public.development_activity_time_summary (permit_type);

CREATE INDEX IF NOT EXISTS dev_activity_time_work_type_idx
  ON public.development_activity_time_summary (work_type);

CREATE INDEX IF NOT EXISTS dev_activity_time_status_idx
  ON public.development_activity_time_summary (permit_status);

CREATE INDEX IF NOT EXISTS dev_activity_time_zoning_idx
  ON public.development_activity_time_summary (zoning_jurisdiction_name);

CREATE TABLE public.development_activity_zoning_summary AS
SELECT
  COALESCE(zoning_jurisdiction_name, '(unmatched parcel)') AS zoning_jurisdiction_name,
  COALESCE(dominant_zoning_general_normalized, '(unknown)') AS dominant_zoning_general_normalized,
  COALESCE(dominant_zoning_code_raw, '(unknown)') AS dominant_zoning_code_raw,
  permit_type_normalized AS permit_type,
  COUNT(DISTINCT permit_id) AS permit_count,
  COUNT(*) AS relationship_row_count,
  COUNT(DISTINCT official_parcel_id) FILTER (WHERE has_parcel_match) AS active_parcel_count,
  COUNT(DISTINCT permit_id) FILTER (WHERE missing_parcel_match) AS unmatched_permit_count,
  COUNT(DISTINCT permit_id) FILTER (WHERE has_multiple_parcel_matches) AS ambiguous_permit_count,
  SUM(permit_amount) AS total_permit_amount,
  AVG(permit_amount) AS avg_permit_amount,
  MIN(activity_date) AS first_permit_date,
  MAX(activity_date) AS latest_permit_date,
  now()::timestamptz AS summarized_at
FROM public.real_property_permit_parcel_relationship
GROUP BY
  COALESCE(zoning_jurisdiction_name, '(unmatched parcel)'),
  COALESCE(dominant_zoning_general_normalized, '(unknown)'),
  COALESCE(dominant_zoning_code_raw, '(unknown)'),
  permit_type_normalized;

COMMENT ON TABLE public.development_activity_zoning_summary IS
  'CFS zoning development activity summary by jurisdiction, normalized zoning category/code, and permit type.';

CREATE INDEX IF NOT EXISTS dev_activity_zoning_jurisdiction_idx
  ON public.development_activity_zoning_summary (zoning_jurisdiction_name);

CREATE INDEX IF NOT EXISTS dev_activity_zoning_general_idx
  ON public.development_activity_zoning_summary (dominant_zoning_general_normalized);

CREATE INDEX IF NOT EXISTS dev_activity_zoning_code_idx
  ON public.development_activity_zoning_summary (dominant_zoning_code_raw);

CREATE INDEX IF NOT EXISTS dev_activity_zoning_permit_type_idx
  ON public.development_activity_zoning_summary (permit_type);

ANALYZE public.development_activity_parcel_summary;
ANALYZE public.development_activity_time_summary;
ANALYZE public.development_activity_zoning_summary;
