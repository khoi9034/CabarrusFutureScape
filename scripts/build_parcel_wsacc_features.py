"""Build parcel-level WSACC sewer proxy features.

Uses the ingested WSACC sewer pipe/manhole/subbasin tables. Distances are
computed after transforming parcel and WSACC geometries to EPSG:2264, whose
units are feet for North Carolina StatePlane.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "backend"))

from app.database import get_engine  # noqa: E402

FEATURE_TABLE = "parcel_wsacc_utility_features"
MODEL_TABLE = "parcel_development_model_features"
SCREENING_TABLE = "parcel_development_screening_output"


def main() -> int:
    parser = argparse.ArgumentParser(description="Build parcel-level WSACC sewer proxy features.")
    parser.add_argument("--apply", action="store_true", help="Write derived PostGIS tables.")
    parser.add_argument("--dry-run", action="store_true", help="Preview counts without writing.")
    parser.add_argument("--limit", type=int, default=None, help="Optional parcel limit for QA.")
    args = parser.parse_args()

    engine = get_engine()
    try:
        with engine.begin() as connection:
            _prepare_temp_tables(connection, args.limit)
            if args.apply:
                _write_feature_table(connection)
                _write_model_tables(connection)
                result = _summary_counts(connection, FEATURE_TABLE)
                result["mode"] = "apply"
            else:
                result = _dry_run_counts(connection)
                result["mode"] = "dry_run"
    except SQLAlchemyError as exc:
        raise SystemExit(f"Database operation failed. Check local PostGIS settings. ({exc.__class__.__name__})") from exc

    print(json.dumps(result, indent=2, default=str))
    return 0


def _prepare_temp_tables(connection: Any, limit: int | None) -> None:
    _require_table(connection, "parcels_enriched")
    for table in ("wsacc_sewer_lines", "wsacc_manholes", "wsacc_basins"):
        _require_table(connection, table)

    limit_sql = f"LIMIT {int(limit)}" if limit else ""
    connection.execute(
        text(
            f"""
            CREATE TEMP TABLE _wsacc_parcels AS
            SELECT official_parcel_id AS parcel_id,
                   ST_Transform(geometry, 2264) AS geom_ft
            FROM public.parcels_enriched
            WHERE official_parcel_id IS NOT NULL
              AND geometry IS NOT NULL
            {limit_sql};
            CREATE INDEX ON _wsacc_parcels USING GIST (geom_ft);

            CREATE TEMP TABLE _wsacc_pipes AS
            SELECT COALESCE(source_properties::jsonb ->> 'WSACC_ID', source_properties::jsonb ->> 'OBJECTID') AS pipe_id,
                   ST_Transform(geometry, 2264) AS geom_ft
            FROM public.wsacc_sewer_lines
            WHERE geometry IS NOT NULL;
            CREATE INDEX ON _wsacc_pipes USING GIST (geom_ft);

            CREATE TEMP TABLE _wsacc_manholes AS
            SELECT COALESCE(source_properties::jsonb ->> 'WSACC_ID', source_properties::jsonb ->> 'OBJECTID') AS manhole_id,
                   ST_Transform(geometry, 2264) AS geom_ft
            FROM public.wsacc_manholes
            WHERE geometry IS NOT NULL;
            CREATE INDEX ON _wsacc_manholes USING GIST (geom_ft);

            CREATE TEMP TABLE _wsacc_basins AS
            SELECT COALESCE(source_properties::jsonb ->> 'SubBasin', source_properties::jsonb ->> 'Basin') AS subbasin_id,
                   CONCAT_WS(' - ', source_properties::jsonb ->> 'Basin', source_properties::jsonb ->> 'SubBasin') AS subbasin_name,
                   ST_Transform(geometry, 2264) AS geom_ft
            FROM public.wsacc_basins
            WHERE geometry IS NOT NULL;
            CREATE INDEX ON _wsacc_basins USING GIST (geom_ft);
            """
        )
    )


def _feature_select_sql() -> str:
    return """
      WITH nearest AS (
        SELECT
          p.parcel_id,
          pipe.pipe_id AS nearest_sewer_pipe_id,
          ST_Distance(p.geom_ft, pipe.geom_ft) AS distance_to_nearest_sewer_pipe_ft,
          mh.manhole_id AS nearest_manhole_id,
          ST_Distance(p.geom_ft, mh.geom_ft) AS distance_to_nearest_manhole_ft,
          basin.subbasin_id AS wsacc_subbasin_id,
          NULLIF(basin.subbasin_name, '') AS wsacc_subbasin_name,
          basin.subbasin_id IS NOT NULL AS inside_wsacc_subbasin_flag
        FROM _wsacc_parcels p
        LEFT JOIN LATERAL (
          SELECT pipe_id, geom_ft FROM _wsacc_pipes
          ORDER BY p.geom_ft <-> geom_ft
          LIMIT 1
        ) pipe ON TRUE
        LEFT JOIN LATERAL (
          SELECT manhole_id, geom_ft FROM _wsacc_manholes
          ORDER BY p.geom_ft <-> geom_ft
          LIMIT 1
        ) mh ON TRUE
        LEFT JOIN LATERAL (
          SELECT subbasin_id, subbasin_name
          FROM _wsacc_basins
          WHERE ST_Intersects(ST_PointOnSurface(p.geom_ft), geom_ft)
          ORDER BY ST_Area(geom_ft)
          LIMIT 1
        ) basin ON TRUE
      ),
      classified AS (
        SELECT
          parcel_id,
          distance_to_nearest_sewer_pipe_ft <= 250 AS sewer_pipe_within_250ft_flag,
          distance_to_nearest_sewer_pipe_ft <= 500 AS sewer_pipe_within_500ft_flag,
          distance_to_nearest_sewer_pipe_ft <= 1000 AS sewer_pipe_within_1000ft_flag,
          ROUND(distance_to_nearest_sewer_pipe_ft::numeric, 1) AS distance_to_nearest_sewer_pipe_ft,
          nearest_sewer_pipe_id,
          distance_to_nearest_manhole_ft <= 250 AS manhole_within_250ft_flag,
          distance_to_nearest_manhole_ft <= 500 AS manhole_within_500ft_flag,
          distance_to_nearest_manhole_ft <= 1000 AS manhole_within_1000ft_flag,
          ROUND(distance_to_nearest_manhole_ft::numeric, 1) AS distance_to_nearest_manhole_ft,
          nearest_manhole_id,
          wsacc_subbasin_id,
          wsacc_subbasin_name,
          inside_wsacc_subbasin_flag,
          CASE
            WHEN LEAST(distance_to_nearest_sewer_pipe_ft, distance_to_nearest_manhole_ft) <= 250 THEN 'Adjacent to sewer infrastructure'
            WHEN LEAST(distance_to_nearest_sewer_pipe_ft, distance_to_nearest_manhole_ft) <= 500 THEN 'Near sewer infrastructure'
            WHEN LEAST(distance_to_nearest_sewer_pipe_ft, distance_to_nearest_manhole_ft) <= 1000 THEN 'Moderate sewer proximity'
            WHEN distance_to_nearest_sewer_pipe_ft IS NULL AND distance_to_nearest_manhole_ft IS NULL THEN 'Data needed'
            ELSE 'Outside near-sewer proxy range'
          END AS sewer_proxy_class,
          CASE
            WHEN inside_wsacc_subbasin_flag AND LEAST(distance_to_nearest_sewer_pipe_ft, distance_to_nearest_manhole_ft) <= 500 THEN 'Strong sewer-proximity signal'
            WHEN LEAST(distance_to_nearest_sewer_pipe_ft, distance_to_nearest_manhole_ft) <= 1000 THEN 'Moderate sewer-proximity signal'
            WHEN inside_wsacc_subbasin_flag THEN 'Sewer basin context only'
            WHEN distance_to_nearest_sewer_pipe_ft IS NULL AND distance_to_nearest_manhole_ft IS NULL THEN 'Data needed'
            ELSE 'Limited utility-readiness evidence'
          END AS utility_readiness_proxy_class,
          CASE
            WHEN inside_wsacc_subbasin_flag AND LEAST(distance_to_nearest_sewer_pipe_ft, distance_to_nearest_manhole_ft) <= 500 THEN 'strong'
            WHEN inside_wsacc_subbasin_flag OR LEAST(distance_to_nearest_sewer_pipe_ft, distance_to_nearest_manhole_ft) <= 1000 THEN 'moderate'
            WHEN distance_to_nearest_sewer_pipe_ft IS NULL AND distance_to_nearest_manhole_ft IS NULL THEN 'data_needed'
            ELSE 'low'
          END AS sewer_proxy_confidence,
          'Capacity data not provided' AS utility_capacity_status,
          'Planned extension data not provided' AS planned_extension_status,
          ARRAY[
            'Sewer infrastructure proximity proxy only.',
            'Water service, sewer capacity, and planned extension data are not provided.'
          ]::text[] AS wsacc_notes,
          now() AS updated_at
        FROM nearest
      )
      SELECT * FROM classified
    """


def _write_feature_table(connection: Any) -> None:
    connection.execute(
        text(
            f"""
            DROP TABLE IF EXISTS public.{FEATURE_TABLE};
            CREATE TABLE public.{FEATURE_TABLE} AS
            {_feature_select_sql()};
            CREATE UNIQUE INDEX idx_{FEATURE_TABLE}_parcel_id ON public.{FEATURE_TABLE} (parcel_id);
            """
        )
    )


def _write_model_tables(connection: Any) -> None:
    connection.execute(
        text(
            f"""
            DROP TABLE IF EXISTS public.{MODEL_TABLE};
            CREATE TABLE public.{MODEL_TABLE} AS
            SELECT
              parcel_id,
              sewer_pipe_within_250ft_flag,
              sewer_pipe_within_500ft_flag,
              sewer_pipe_within_1000ft_flag,
              distance_to_nearest_sewer_pipe_ft,
              manhole_within_250ft_flag,
              manhole_within_500ft_flag,
              manhole_within_1000ft_flag,
              distance_to_nearest_manhole_ft,
              inside_wsacc_subbasin_flag,
              CASE sewer_proxy_class
                WHEN 'Adjacent to sewer infrastructure' THEN 4
                WHEN 'Near sewer infrastructure' THEN 3
                WHEN 'Moderate sewer proximity' THEN 2
                WHEN 'Outside near-sewer proxy range' THEN 1
                ELSE 0
              END AS sewer_proxy_class_encoded,
              CASE utility_readiness_proxy_class
                WHEN 'Strong sewer-proximity signal' THEN 4
                WHEN 'Moderate sewer-proximity signal' THEN 3
                WHEN 'Sewer basin context only' THEN 2
                WHEN 'Limited utility-readiness evidence' THEN 1
                ELSE 0
              END AS utility_readiness_proxy_class_encoded,
              CASE sewer_proxy_confidence
                WHEN 'strong' THEN 3
                WHEN 'moderate' THEN 2
                WHEN 'low' THEN 1
                ELSE 0
              END AS sewer_proxy_confidence_encoded,
              false AS permit_pressure_x_sewer_proxy,
              false AS vacant_or_underbuilt_x_sewer_proxy,
              false AS zoning_support_x_sewer_proxy,
              false AS corridor_access_x_sewer_proxy,
              false AS flood_constraint_x_sewer_proxy,
              false AS school_pressure_x_sewer_proxy,
              'current_context_proxy_only' AS model_feature_caveat
            FROM public.{FEATURE_TABLE};
            CREATE UNIQUE INDEX idx_{MODEL_TABLE}_parcel_id ON public.{MODEL_TABLE} (parcel_id);

            DROP TABLE IF EXISTS public.{SCREENING_TABLE};
            CREATE TABLE public.{SCREENING_TABLE} AS
            SELECT
              parcel_id,
              'Data needed'::text AS growth_pressure_band,
              sewer_proxy_class,
              utility_readiness_proxy_class,
              'Data needed'::text AS zoning_support_band,
              'Data needed'::text AS transportation_access_band,
              'Data needed'::text AS flood_constraint_band,
              'Data needed'::text AS school_service_pressure_band,
              'Data needed'::text AS economic_opportunity_band,
              CASE
                WHEN utility_readiness_proxy_class = 'Strong sewer-proximity signal' THEN 'Good candidate, verify zoning and utilities'
                WHEN utility_readiness_proxy_class = 'Moderate sewer-proximity signal' THEN 'Opportunity signal, capacity data needed'
                WHEN utility_readiness_proxy_class = 'Sewer basin context only' THEN 'Growth pressure but utility evidence limited'
                WHEN utility_readiness_proxy_class = 'Data needed' THEN 'Data needed before interpretation'
                ELSE 'Low near-term readiness signal'
              END AS development_readiness_band,
              ARRAY['Capacity data needed', 'Water service data needed', 'Planned extension data needed']::text[] AS due_diligence_flags,
              ARRAY['Verify utility capacity with WSACC', 'Review zoning, flood, school, and transportation context']::text[] AS suggested_next_checks
            FROM public.{FEATURE_TABLE};
            CREATE UNIQUE INDEX idx_{SCREENING_TABLE}_parcel_id ON public.{SCREENING_TABLE} (parcel_id);
            """
        )
    )


def _dry_run_counts(connection: Any) -> dict[str, Any]:
    connection.execute(text(f"CREATE TEMP TABLE _wsacc_features_preview AS {_feature_select_sql()};"))
    return _summary_counts(connection, "_wsacc_features_preview")


def _summary_counts(connection: Any, table_name: str) -> dict[str, Any]:
    total = connection.execute(text(f"SELECT COUNT(*) FROM {table_name}")).scalar_one()
    sewer = connection.execute(
        text(f"SELECT sewer_proxy_class, COUNT(*) AS count FROM {table_name} GROUP BY 1 ORDER BY 2 DESC")
    ).mappings().all()
    readiness = connection.execute(
        text(f"SELECT utility_readiness_proxy_class, COUNT(*) AS count FROM {table_name} GROUP BY 1 ORDER BY 2 DESC")
    ).mappings().all()
    return {
        "total_parcels": int(total),
        "sewer_proxy_class_counts": [dict(row) for row in sewer],
        "utility_readiness_proxy_class_counts": [dict(row) for row in readiness],
    }


def _require_table(connection: Any, table_name: str) -> None:
    exists = connection.execute(text("SELECT to_regclass(:name) IS NOT NULL"), {"name": f"public.{table_name}"}).scalar_one()
    if not exists:
        raise SystemExit(f"Required table public.{table_name} is missing.")


if __name__ == "__main__":
    raise SystemExit(main())
