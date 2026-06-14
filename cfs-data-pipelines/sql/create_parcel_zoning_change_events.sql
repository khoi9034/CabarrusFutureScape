-- Phase 10D-1 parcel zoning map-change event foundation.
--
-- These events compare historical zoning snapshots across available source
-- years. They are not official rezoning case events unless source records have
-- dates, case decisions, and old/new zoning fields.

DROP TABLE IF EXISTS public.parcel_zoning_change_events;

CREATE TABLE public.parcel_zoning_change_events (
    zoning_change_event_id bigserial PRIMARY KEY,
    official_parcel_id text NOT NULL,
    pin14 text,
    change_year integer NOT NULL,
    previous_zoning_code text,
    new_zoning_code text,
    previous_general_category text,
    new_general_category text,
    zoning_jurisdiction text,
    previous_source_year integer,
    new_source_year integer NOT NULL,
    zoning_change_type text NOT NULL,
    zoning_intensity_change text NOT NULL,
    confidence text NOT NULL,
    temporal_status text NOT NULL,
    notes text,
    created_at timestamptz NOT NULL DEFAULT now()
);

WITH exact_snapshots AS (
    SELECT
        official_parcel_id,
        pin14,
        snapshot_year,
        zoning_code,
        zoning_general_category,
        zoning_jurisdiction,
        zoning_source_year,
        zoning_assignment_quality,
        overlay_pct
    FROM public.parcel_zoning_snapshot_year
    WHERE zoning_known_flag
      AND zoning_source_year = snapshot_year
      AND zoning_code IS NOT NULL
),
ordered AS (
    SELECT
        *,
        LAG(zoning_code) OVER (
            PARTITION BY official_parcel_id
            ORDER BY snapshot_year
        ) AS previous_zoning_code,
        LAG(zoning_general_category) OVER (
            PARTITION BY official_parcel_id
            ORDER BY snapshot_year
        ) AS previous_general_category,
        LAG(zoning_jurisdiction) OVER (
            PARTITION BY official_parcel_id
            ORDER BY snapshot_year
        ) AS previous_zoning_jurisdiction,
        LAG(zoning_source_year) OVER (
            PARTITION BY official_parcel_id
            ORDER BY snapshot_year
        ) AS previous_source_year,
        LAG(zoning_assignment_quality) OVER (
            PARTITION BY official_parcel_id
            ORDER BY snapshot_year
        ) AS previous_assignment_quality
    FROM exact_snapshots
),
changes AS (
    SELECT
        *,
        CASE
            WHEN zoning_general_category IS DISTINCT FROM previous_general_category
             AND zoning_code IS DISTINCT FROM previous_zoning_code
                THEN 'code_and_category_changed'
            WHEN zoning_general_category IS DISTINCT FROM previous_general_category
                THEN 'category_changed'
            WHEN zoning_code IS DISTINCT FROM previous_zoning_code
                THEN 'zoning_code_changed'
            WHEN zoning_jurisdiction IS DISTINCT FROM previous_zoning_jurisdiction
                THEN 'jurisdiction_context_changed'
            ELSE 'no_change'
        END AS zoning_change_type
    FROM ordered
    WHERE previous_source_year IS NOT NULL
      AND (
        zoning_code IS DISTINCT FROM previous_zoning_code
        OR zoning_general_category IS DISTINCT FROM previous_general_category
        OR zoning_jurisdiction IS DISTINCT FROM previous_zoning_jurisdiction
      )
),
ranked_changes AS (
    SELECT
        *,
        CASE zoning_general_category
            WHEN 'agricultural_or_rural' THEN 1
            WHEN 'residential' THEN 2
            WHEN 'institutional' THEN 2
            WHEN 'mixed_use_or_planned' THEN 3
            WHEN 'commercial' THEN 3
            WHEN 'industrial' THEN 4
            ELSE NULL
        END AS new_intensity_rank,
        CASE previous_general_category
            WHEN 'agricultural_or_rural' THEN 1
            WHEN 'residential' THEN 2
            WHEN 'institutional' THEN 2
            WHEN 'mixed_use_or_planned' THEN 3
            WHEN 'commercial' THEN 3
            WHEN 'industrial' THEN 4
            ELSE NULL
        END AS previous_intensity_rank
    FROM changes
)
INSERT INTO public.parcel_zoning_change_events (
    official_parcel_id,
    pin14,
    change_year,
    previous_zoning_code,
    new_zoning_code,
    previous_general_category,
    new_general_category,
    zoning_jurisdiction,
    previous_source_year,
    new_source_year,
    zoning_change_type,
    zoning_intensity_change,
    confidence,
    temporal_status,
    notes
)
SELECT
    official_parcel_id,
    pin14,
    snapshot_year AS change_year,
    previous_zoning_code,
    zoning_code AS new_zoning_code,
    previous_general_category,
    zoning_general_category AS new_general_category,
    zoning_jurisdiction,
    previous_source_year,
    zoning_source_year AS new_source_year,
    zoning_change_type,
    CASE
        WHEN previous_intensity_rank IS NULL OR new_intensity_rank IS NULL THEN 'review_required'
        WHEN new_intensity_rank > previous_intensity_rank THEN 'increased'
        WHEN new_intensity_rank < previous_intensity_rank THEN 'decreased'
        ELSE 'lateral_or_code_only'
    END AS zoning_intensity_change,
    CASE
        WHEN (zoning_source_year - previous_source_year) = 1
         AND zoning_assignment_quality IN ('high', 'medium')
         AND previous_assignment_quality IN ('high', 'medium')
            THEN 'high'
        WHEN (zoning_source_year - previous_source_year) <= 3 THEN 'medium'
        ELSE 'low'
    END AS confidence,
    'historical_map_change_detected' AS temporal_status,
    CASE
        WHEN (zoning_source_year - previous_source_year) > 1
            THEN 'Change detected between non-consecutive historical source years; exact approval date is unknown.'
        ELSE 'Change detected between consecutive historical source-year maps; not an official rezoning case event.'
    END AS notes
FROM ranked_changes;

CREATE INDEX parcel_zoning_change_events_parcel_idx
    ON public.parcel_zoning_change_events (official_parcel_id);

CREATE INDEX parcel_zoning_change_events_year_idx
    ON public.parcel_zoning_change_events (change_year);

CREATE INDEX parcel_zoning_change_events_type_idx
    ON public.parcel_zoning_change_events (zoning_change_type);

CREATE INDEX parcel_zoning_change_events_confidence_idx
    ON public.parcel_zoning_change_events (confidence);
