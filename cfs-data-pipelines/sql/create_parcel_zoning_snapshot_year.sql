-- Phase 10D-1 parcel-year zoning snapshots from historical zoning only.
--
-- SQLAlchemy supplies :start_year, :end_year, and :stale_year_threshold.
-- The query never uses current zoning sources as historical fallback.

DROP TABLE IF EXISTS public.parcel_zoning_snapshot_year;

CREATE TABLE public.parcel_zoning_snapshot_year (
    official_parcel_id text NOT NULL,
    pin14 text,
    snapshot_year integer NOT NULL,
    zoning_code text,
    zoning_general_category text,
    zoning_jurisdiction text,
    zoning_source_year integer,
    zoning_source_name text,
    zoning_source_age_years integer,
    zoning_assignment_quality text NOT NULL,
    zoning_known_flag boolean NOT NULL,
    zoning_review_required_flag boolean NOT NULL,
    temporal_status text NOT NULL,
    current_context_only boolean NOT NULL DEFAULT false,
    overlay_area_acres numeric,
    overlay_pct numeric,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (official_parcel_id, snapshot_year)
);

CREATE TEMP TABLE tmp_historical_parcel_zoning_source_overlay
ON COMMIT DROP AS
WITH parcel_areas AS (
    SELECT
        p.official_parcel_id,
        p.pin14,
        p.geometry,
        NULLIF(ST_Area(p.geometry), 0) AS parcel_area_planar,
        NULLIF(ST_Area(p.geometry::geography) / 4046.8564224, 0) AS parcel_area_acres
    FROM public.parcels_enriched p
    WHERE p.geometry IS NOT NULL
),
raw_intersections AS (
    SELECT
        p.official_parcel_id,
        p.pin14,
        z.source_key,
        z.source_name,
        z.jurisdiction,
        z.source_year,
        z.zoning_code_normalized AS zoning_code,
        z.zoning_general_category,
        ST_Area(i.geometry) AS overlay_area_planar,
        ROUND((ST_Area(i.geometry) / p.parcel_area_planar)::numeric, 6) AS overlay_pct,
        ROUND(((ST_Area(i.geometry) / p.parcel_area_planar) * p.parcel_area_acres)::numeric, 6)
          AS overlay_area_acres
    FROM parcel_areas p
    JOIN public.historical_zoning_clean z
      ON z.schema_quality = 'usable'
     AND z.geometry IS NOT NULL
     AND p.geometry && z.geometry
     AND ST_Intersects(p.geometry, z.geometry)
    CROSS JOIN LATERAL (
        SELECT ST_CollectionExtract(ST_MakeValid(ST_Intersection(p.geometry, z.geometry)), 3) AS geometry
    ) i
    WHERE ST_Area(i.geometry) > 0
),
ranked_intersections AS (
    SELECT
        *,
        ROW_NUMBER() OVER (
            PARTITION BY official_parcel_id, source_key
            ORDER BY overlay_area_planar DESC, zoning_code
        ) AS overlap_rank
    FROM raw_intersections
)
SELECT *
FROM ranked_intersections
WHERE overlap_rank = 1;

CREATE INDEX tmp_historical_parcel_zoning_source_overlay_idx
    ON tmp_historical_parcel_zoning_source_overlay (source_year, jurisdiction, official_parcel_id);

CREATE INDEX tmp_historical_parcel_zoning_source_overlay_parcel_idx
    ON tmp_historical_parcel_zoning_source_overlay (official_parcel_id);

ANALYZE tmp_historical_parcel_zoning_source_overlay;

WITH snapshot_years AS (
    SELECT generate_series(:start_year::integer, :end_year::integer)::integer AS snapshot_year
),
latest_source_by_year_jurisdiction AS (
    SELECT
        y.snapshot_year,
        z.jurisdiction,
        MAX(z.source_year) AS zoning_source_year
    FROM snapshot_years y
    JOIN public.historical_zoning_clean z
      ON z.source_year <= y.snapshot_year
     AND z.schema_quality = 'usable'
     AND z.geometry IS NOT NULL
    GROUP BY y.snapshot_year, z.jurisdiction
),
eligible_overlay AS (
    SELECT
        l.snapshot_year,
        o.official_parcel_id,
        o.pin14,
        o.source_key,
        o.source_name,
        o.jurisdiction,
        o.source_year,
        o.zoning_code,
        o.zoning_general_category,
        o.overlay_area_acres,
        o.overlay_pct
    FROM latest_source_by_year_jurisdiction l
    JOIN tmp_historical_parcel_zoning_source_overlay o
      ON o.jurisdiction = l.jurisdiction
     AND o.source_year = l.zoning_source_year
),
parcel_years AS (
    SELECT
        p.official_parcel_id,
        p.pin14,
        y.snapshot_year
    FROM public.parcels_enriched p
    CROSS JOIN snapshot_years y
    WHERE p.geometry IS NOT NULL
),
ranked_snapshot_candidates AS (
    SELECT
        py.official_parcel_id,
        py.snapshot_year,
        eo.zoning_code,
        eo.zoning_general_category,
        eo.jurisdiction AS zoning_jurisdiction,
        eo.source_year AS zoning_source_year,
        eo.source_name AS zoning_source_name,
        (py.snapshot_year - eo.source_year) AS zoning_source_age_years,
        eo.overlay_area_acres,
        eo.overlay_pct,
        ROW_NUMBER() OVER (
            PARTITION BY py.official_parcel_id, py.snapshot_year
            ORDER BY eo.overlay_area_acres DESC,
                     eo.source_year DESC,
                     eo.jurisdiction
        ) AS overlap_rank
    FROM parcel_years py
    JOIN eligible_overlay eo
      ON eo.snapshot_year = py.snapshot_year
     AND eo.official_parcel_id = py.official_parcel_id
),
best_intersections AS (
    SELECT *
    FROM ranked_snapshot_candidates
    WHERE overlap_rank = 1
)
INSERT INTO public.parcel_zoning_snapshot_year (
    official_parcel_id,
    pin14,
    snapshot_year,
    zoning_code,
    zoning_general_category,
    zoning_jurisdiction,
    zoning_source_year,
    zoning_source_name,
    zoning_source_age_years,
    zoning_assignment_quality,
    zoning_known_flag,
    zoning_review_required_flag,
    temporal_status,
    current_context_only,
    overlay_area_acres,
    overlay_pct
)
SELECT
    py.official_parcel_id,
    py.pin14,
    py.snapshot_year,
    bi.zoning_code,
    bi.zoning_general_category,
    bi.zoning_jurisdiction,
    bi.zoning_source_year,
    bi.zoning_source_name,
    bi.zoning_source_age_years,
    CASE
        WHEN bi.official_parcel_id IS NULL THEN 'no_match'
        WHEN bi.overlay_pct >= 0.95 THEN 'high'
        WHEN bi.overlay_pct >= 0.75 THEN 'medium'
        ELSE 'low'
    END AS zoning_assignment_quality,
    (bi.official_parcel_id IS NOT NULL) AS zoning_known_flag,
    (
        bi.official_parcel_id IS NULL
        OR COALESCE(bi.overlay_pct, 0) < 0.75
        OR COALESCE(bi.zoning_source_age_years, 999) > :stale_year_threshold::integer
    ) AS zoning_review_required_flag,
    CASE
        WHEN bi.official_parcel_id IS NULL THEN 'unavailable'
        WHEN bi.zoning_source_year = py.snapshot_year THEN 'exact_year'
        ELSE 'prior_available_year'
    END AS temporal_status,
    false AS current_context_only,
    bi.overlay_area_acres,
    bi.overlay_pct
FROM parcel_years py
LEFT JOIN best_intersections bi
  ON bi.official_parcel_id = py.official_parcel_id
 AND bi.snapshot_year = py.snapshot_year;

CREATE INDEX parcel_zoning_snapshot_year_snapshot_idx
    ON public.parcel_zoning_snapshot_year (snapshot_year);

CREATE INDEX parcel_zoning_snapshot_year_code_idx
    ON public.parcel_zoning_snapshot_year (zoning_code);

CREATE INDEX parcel_zoning_snapshot_year_jurisdiction_idx
    ON public.parcel_zoning_snapshot_year (zoning_jurisdiction);

CREATE INDEX parcel_zoning_snapshot_year_temporal_idx
    ON public.parcel_zoning_snapshot_year (temporal_status);

CREATE INDEX parcel_zoning_snapshot_year_review_idx
    ON public.parcel_zoning_snapshot_year (zoning_review_required_flag);
