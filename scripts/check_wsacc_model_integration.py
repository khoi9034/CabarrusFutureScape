"""Print safe WSACC model-integration diagnostics."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "backend"))

EXPLICIT_DATABASE_URL = (
    os.getenv("CFS_WSACC_CHECK_DATABASE_URL")
    or os.getenv("CFS_LOCAL_DATABASE_URL")
)
if EXPLICIT_DATABASE_URL:
    os.environ["DATABASE_URL"] = EXPLICIT_DATABASE_URL
else:
    # Mirror scripts/start-cfs-local.ps1: local diagnostics should not inherit a
    # deployment DATABASE_URL from the shell.
    os.environ["DATABASE_URL"] = ""
    os.environ.setdefault("POSTGRES_HOST", "localhost")
    os.environ.setdefault("POSTGRES_PORT", "5433")
    os.environ.setdefault("POSTGRES_DB", "cfs_dev")

from app.database import get_engine  # noqa: E402

WSACC_MODEL_COLUMNS = [
    "sewer_pipe_within_250ft_flag",
    "sewer_pipe_within_500ft_flag",
    "sewer_pipe_within_1000ft_flag",
    "distance_to_nearest_sewer_pipe_ft",
    "manhole_within_250ft_flag",
    "manhole_within_500ft_flag",
    "manhole_within_1000ft_flag",
    "distance_to_nearest_manhole_ft",
    "inside_wsacc_subbasin_flag",
    "sewer_proxy_class_encoded",
    "utility_readiness_proxy_class_encoded",
    "sewer_proxy_confidence_encoded",
    "permit_pressure_x_sewer_proxy",
    "vacant_or_underbuilt_x_sewer_proxy",
    "zoning_support_x_sewer_proxy",
    "corridor_access_x_sewer_proxy",
    "flood_constraint_x_sewer_proxy",
    "school_pressure_x_sewer_proxy",
]

LAND_OPPORTUNITY_COLUMNS = [
    "sewer_proxy_class",
    "utility_readiness_proxy_class",
    "development_readiness_band",
    "growth_pressure_band",
    "zoning_support_band",
    "flood_constraint_band",
    "school_service_pressure_band",
    "economic_opportunity_band",
    "due_diligence_flags",
    "suggested_next_checks",
]


def main() -> int:
    try:
        with get_engine().connect() as connection:
            payload = {
                "connection": connection_summary(),
                "parcel_wsacc_utility_features": table_summary(
                    connection,
                    "parcel_wsacc_utility_features",
                ),
                "parcel_development_model_features": model_table_summary(
                    connection,
                ),
                "parcel_development_screening_output": screening_table_summary(
                    connection,
                ),
            }
    except SQLAlchemyError as exc:
        raise SystemExit(
            "Database operation failed. Check local PostGIS settings "
            f"(host={os.getenv('POSTGRES_HOST', 'localhost')}, "
            f"port={os.getenv('POSTGRES_PORT', '5433')}, "
            f"db={os.getenv('POSTGRES_DB', 'cfs_dev')}). "
            f"Error type: {exc.__class__.__name__}.",
        ) from exc

    print(json.dumps(payload, indent=2, default=str))
    return 0


def connection_summary() -> dict[str, Any]:
    return {
        "database_url_source": (
            "explicit_local_override"
            if EXPLICIT_DATABASE_URL
            else "local_dev_settings"
        ),
        "host": os.getenv("POSTGRES_HOST", "localhost"),
        "port": os.getenv("POSTGRES_PORT", "5433"),
        "database": os.getenv("POSTGRES_DB", "cfs_dev"),
        "user_configured": bool(os.getenv("POSTGRES_USER")),
    }


def table_exists(connection: Any, table_name: str) -> bool:
    return bool(
        connection.execute(
            text("SELECT to_regclass(:name) IS NOT NULL"),
            {"name": f"public.{table_name}"},
        ).scalar_one(),
    )


def table_count(connection: Any, table_name: str) -> int | None:
    if not table_exists(connection, table_name):
        return None
    return int(
        connection.execute(text(f"SELECT COUNT(*) FROM public.{table_name}")).scalar_one(),
    )


def bucket(connection: Any, table_name: str, column_name: str) -> list[dict[str, Any]]:
    if not table_exists(connection, table_name):
        return []
    rows = connection.execute(
        text(
            f"""
            SELECT COALESCE({column_name}::text, 'Unknown') AS label, COUNT(*) AS count
            FROM public.{table_name}
            GROUP BY 1
            ORDER BY 2 DESC
            """
        ),
    ).mappings().all()
    return [dict(row) for row in rows]


def table_summary(connection: Any, table_name: str) -> dict[str, Any]:
    if not table_exists(connection, table_name):
        return {"available": False, "row_count": 0}
    row = connection.execute(
        text(
            f"""
            SELECT
              COUNT(*) AS row_count,
              COUNT(distance_to_nearest_sewer_pipe_ft) AS non_null_pipe_distance_count,
              COUNT(*) FILTER (WHERE inside_wsacc_subbasin_flag) AS inside_subbasin_count
            FROM public.{table_name}
            """
        ),
    ).mappings().one()
    return {
        "available": True,
        **dict(row),
        "sewer_proxy_class_counts": bucket(connection, table_name, "sewer_proxy_class"),
        "utility_readiness_proxy_class_counts": bucket(
            connection,
            table_name,
            "utility_readiness_proxy_class",
        ),
    }


def model_table_summary(connection: Any) -> dict[str, Any]:
    table_name = "parcel_development_model_features"
    if not table_exists(connection, table_name):
        return {
            "available": False,
            "row_count": 0,
            "wsacc_columns_present": [],
            "wsacc_columns_missing": WSACC_MODEL_COLUMNS,
        }

    rows = connection.execute(
        text(
            """
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'parcel_development_model_features'
              AND column_name = ANY(:columns)
            ORDER BY column_name
            """
        ),
        {"columns": WSACC_MODEL_COLUMNS},
    ).mappings().all()
    present = [row["column_name"] for row in rows]
    return {
        "available": True,
        "row_count": table_count(connection, table_name),
        "wsacc_columns_present": present,
        "wsacc_columns_missing": [
            column for column in WSACC_MODEL_COLUMNS if column not in present
        ],
    }


def screening_table_summary(connection: Any) -> dict[str, Any]:
    table_name = "parcel_development_screening_output"
    if not table_exists(connection, table_name):
        return {"available": False, "row_count": 0, "wsacc_fields_present": []}
    rows = connection.execute(
        text(
            """
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'parcel_development_screening_output'
              AND column_name = ANY(:columns)
            ORDER BY column_name
            """
        ),
        {"columns": LAND_OPPORTUNITY_COLUMNS},
    ).mappings().all()
    present = [row["column_name"] for row in rows]
    return {
        "available": True,
        "row_count": table_count(connection, table_name),
        "land_opportunity_fields_present": present,
        "land_opportunity_fields_missing": [
            column for column in LAND_OPPORTUNITY_COLUMNS if column not in present
        ],
        "wsacc_fields_present": [
            column for column in present
            if column in {"sewer_proxy_class", "utility_readiness_proxy_class"}
        ],
    }


if __name__ == "__main__":
    raise SystemExit(main())
