-- Cabarrus FutureScape Phase 2 zoning intelligence QA and governance pass.
--
-- Builds public.parcel_zoning_intelligence_qa from
-- public.parcel_zoning_overlay_v2. This table does not change zoning
-- assignment; it classifies records for future backend/API readiness review.

DROP TABLE IF EXISTS public.parcel_zoning_intelligence_qa;

CREATE TABLE public.parcel_zoning_intelligence_qa AS
WITH qa_base AS (
  SELECT
    overlay.*,
    ARRAY_REMOVE(
      ARRAY[
        CASE
          WHEN overlay.has_no_zoning_match
            THEN 'no_zoning_match'
        END,
        CASE
          WHEN overlay.zoning_assignment_confidence = 'low'
            THEN 'review_low_confidence'
        END,
        CASE
          WHEN overlay.has_multiple_zoning_jurisdictions
            THEN 'review_multi_jurisdiction'
        END,
        CASE
          WHEN overlay.has_nearly_equal_overlap_split
            THEN 'review_near_tie'
        END,
        CASE
          WHEN overlay.has_tiny_sliver_overlap
            THEN 'review_sliver_overlap'
        END,
        CASE
          WHEN NOT overlay.has_no_zoning_match
            AND (
              overlay.dominant_zoning_code_raw IS NULL
              OR NULLIF(btrim(overlay.dominant_zoning_code_raw), '') IS NULL
              OR overlay.dominant_zoning_general_normalized IS NULL
              OR overlay.dominant_zoning_general_normalized = 'unknown'
            )
            THEN 'jurisdiction_code_semantics_review'
        END
      ]::text[],
      NULL
    ) AS review_warning_categories
  FROM public.parcel_zoning_overlay_v2 AS overlay
),
qa_scored AS (
  SELECT
    qa_base.*,
    CASE
      WHEN cardinality(review_warning_categories) = 0
        THEN ARRAY['safe_for_dashboard']::text[]
      ELSE review_warning_categories
    END AS governance_warning_categories,
    cardinality(review_warning_categories) AS governance_warning_count,
    cardinality(review_warning_categories) = 0 AS safe_for_dashboard,
    cardinality(review_warning_categories) > 0 AS needs_governance_review,
    CASE
      WHEN 'no_zoning_match' = ANY(review_warning_categories)
        THEN 'no_zoning_match'
      WHEN 'review_low_confidence' = ANY(review_warning_categories)
        THEN 'review_low_confidence'
      WHEN 'review_multi_jurisdiction' = ANY(review_warning_categories)
        THEN 'review_multi_jurisdiction'
      WHEN 'review_near_tie' = ANY(review_warning_categories)
        THEN 'review_near_tie'
      WHEN 'review_sliver_overlap' = ANY(review_warning_categories)
        THEN 'review_sliver_overlap'
      WHEN 'jurisdiction_code_semantics_review' = ANY(review_warning_categories)
        THEN 'jurisdiction_code_semantics_review'
      ELSE 'safe_for_dashboard'
    END AS primary_governance_warning
  FROM qa_base
)
SELECT
  official_parcel_id,
  objectid_1,
  pin14,
  parcel_quality_status,
  nbh_name,
  subdiv_name,
  zoning_jurisdiction_name,
  planning_jurisdiction_name,
  planning_boundary_type,
  dominant_zoning_code_raw,
  dominant_zoning_general_raw,
  dominant_zoning_general_normalized,
  dominant_zoning_label_normalized,
  zoning_overlap_count,
  zoning_jurisdiction_overlap_count,
  dominant_overlap_pct,
  total_zoning_overlap_pct,
  second_zoning_jurisdiction_name,
  second_zoning_code_raw,
  second_zoning_general_normalized,
  second_zoning_label_normalized,
  second_overlap_pct,
  top_two_overlap_pct_gap,
  zoning_assignment_confidence,
  zoning_join_status,
  has_multiple_zoning,
  has_multiple_zoning_jurisdictions,
  has_no_zoning_match,
  municipal_zoning_dominates_county_overlap,
  has_nearly_equal_overlap_split,
  has_tiny_sliver_overlap,
  tiny_sliver_overlap_count,
  parcel_area_sq_m,
  parcel_area_acres_calc,
  governance_warning_categories,
  governance_warning_count,
  primary_governance_warning,
  safe_for_dashboard,
  needs_governance_review,
  CASE
    WHEN safe_for_dashboard THEN 'dashboard_ready_mock'
    WHEN primary_governance_warning = 'no_zoning_match' THEN 'missing_zoning_review'
    WHEN primary_governance_warning = 'jurisdiction_code_semantics_review' THEN 'code_semantics_review'
    ELSE 'spatial_assignment_review'
  END AS qa_status,
  now()::timestamptz AS qa_at,
  geometry
FROM qa_scored;

COMMENT ON TABLE public.parcel_zoning_intelligence_qa IS
  'CFS parcel zoning intelligence QA table. Flags v2 zoning assignments for future backend/API governance review.';
COMMENT ON COLUMN public.parcel_zoning_intelligence_qa.governance_warning_categories IS
  'Governance warnings. safe_for_dashboard appears only when no review warnings are present.';
COMMENT ON COLUMN public.parcel_zoning_intelligence_qa.safe_for_dashboard IS
  'True when the parcel has no zoning QA warning categories and can be considered safe for a mock dashboard/API planning surface.';
COMMENT ON COLUMN public.parcel_zoning_intelligence_qa.primary_governance_warning IS
  'Highest-priority QA warning using no-match, low-confidence, multi-jurisdiction, near-tie, sliver, code-semantics, then safe priority.';

ALTER TABLE public.parcel_zoning_intelligence_qa
  ADD CONSTRAINT parcel_zoning_intelligence_qa_pkey PRIMARY KEY (official_parcel_id);

CREATE INDEX IF NOT EXISTS parcel_zoning_intelligence_qa_objectid_1_idx
  ON public.parcel_zoning_intelligence_qa (objectid_1);

CREATE INDEX IF NOT EXISTS parcel_zoning_intelligence_qa_pin14_idx
  ON public.parcel_zoning_intelligence_qa (pin14);

CREATE INDEX IF NOT EXISTS parcel_zoning_intelligence_qa_safe_idx
  ON public.parcel_zoning_intelligence_qa (safe_for_dashboard);

CREATE INDEX IF NOT EXISTS parcel_zoning_intelligence_qa_primary_warning_idx
  ON public.parcel_zoning_intelligence_qa (primary_governance_warning);

CREATE INDEX IF NOT EXISTS parcel_zoning_intelligence_qa_zoning_jurisdiction_idx
  ON public.parcel_zoning_intelligence_qa (zoning_jurisdiction_name);

CREATE INDEX IF NOT EXISTS parcel_zoning_intelligence_qa_zoning_code_idx
  ON public.parcel_zoning_intelligence_qa (dominant_zoning_code_raw);

CREATE INDEX IF NOT EXISTS parcel_zoning_intelligence_qa_confidence_idx
  ON public.parcel_zoning_intelligence_qa (zoning_assignment_confidence);

CREATE INDEX IF NOT EXISTS parcel_zoning_intelligence_qa_geometry_gix
  ON public.parcel_zoning_intelligence_qa USING GIST (geometry);

ANALYZE public.parcel_zoning_intelligence_qa;
