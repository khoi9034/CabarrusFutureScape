"""Print safe WSACC model-integration diagnostics."""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "backend"))

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


def main() -> int:
    try:
        with get_engine().connect() as connection:
            payload = {
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
            f"Database operation failed. Check local PostGIS settings. ({exc.__class__.__name__})",
        ) from exc

    print(json.dumps(payload, indent=2, default=str))
    return 0


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
              AND column_name IN ('sewer_proxy_class', 'utility_readiness_proxy_class')
            ORDER BY column_name
            """
        ),
    ).mappings().all()
    return {
        "available": True,
        "row_count": table_count(connection, table_name),
        "wsacc_fields_present": [row["column_name"] for row in rows],
    }


if __name__ == "__main__":
    raise SystemExit(main())
