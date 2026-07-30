from __future__ import annotations

import json
import os
import sys
import time
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
LOGS = ROOT / "logs"

# A local-presentation check must never inherit a hosted DATABASE_URL.
os.environ["DATABASE_URL"] = ""
os.environ.setdefault("POSTGRES_HOST", "localhost")
os.environ.setdefault("POSTGRES_PORT", "5433")
os.environ.setdefault("POSTGRES_DB", "cfs_dev")
sys.path.insert(0, str(BACKEND))

from sqlalchemy import text  # noqa: E402

from app.database import get_engine  # noqa: E402

CANONICAL_PARCEL = "CFS-PARCEL-0149726579"
PRESENTATION_LIMIT_MS = 5_000

DOMAIN_RELATIONS = {
    "Planning": ("parcels_enriched", "parcel_zoning_overlay"),
    "Development": (
        "real_property_permit_parcel_relationship",
        "permit_activity",
    ),
    "Flood": (
        "fema_nfhl_flood_zones_clean",
        "parcel_flood_constraint_overlay",
    ),
    "Schools": (
        "school_reference",
        "school_zones",
        "school_presentation_utilization_seed",
    ),
    "Economics": (
        "parcel_tax_value_enrichment_features",
        "parcel_development_screening_output",
    ),
    "WSACC": (
        "wsacc_data_inventory",
        "wsacc_basins",
        "wsacc_manholes",
        "wsacc_sewer_lines",
        "parcel_wsacc_utility_features",
    ),
}

LIMITED_RELATIONS = {
    "school_capacity": "No official capacity rows; presentation uses preliminary utilization context.",
    "investment_case_study": "CASE-1 is repository-backed; the local database table is optional.",
}

GEOMETRY_RELATIONS = {
    "parcels_enriched": {4326},
    "fema_nfhl_flood_zones_clean": {4326},
    "parcel_flood_constraint_overlay": {4326},
    "school_reference": {4326},
    "school_zones": {4326},
    "wsacc_basins": {3857},
    "wsacc_manholes": {3857},
    "wsacc_sewer_lines": {3857},
}


def timed(connection, sql: str, params: dict | None = None):
    started = time.perf_counter()
    value = connection.execute(text(sql), params or {})
    return value, round((time.perf_counter() - started) * 1_000, 1)


def main() -> int:
    report = {
        "checked_at": datetime.now(UTC).isoformat(),
        "target": {
            "host": os.environ["POSTGRES_HOST"],
            "port": int(os.environ["POSTGRES_PORT"]),
            "database": os.environ["POSTGRES_DB"],
        },
        "checks": {},
        "domains": {},
        "relations": {},
        "geometry": {},
        "timings_ms": {},
        "warnings": [],
    }
    failures: list[str] = []

    try:
        with get_engine().connect() as connection, connection.begin():
            connection.execute(text("SET TRANSACTION READ ONLY"))
            connection.execute(text("SET LOCAL statement_timeout = 10000"))

            database_result, database_ms = timed(connection, "SELECT current_database()")
            database = database_result.scalar_one()
            report["timings_ms"]["database_identity"] = database_ms
            report["checks"]["database"] = {
                "expected": "cfs_dev",
                "measured": database,
                "status": "PASS" if database == "cfs_dev" else "FAIL",
            }
            if database != "cfs_dev":
                failures.append("Connected database is not cfs_dev")

            postgres_result, postgres_ms = timed(connection, "SELECT version()")
            report["postgresql_version"] = postgres_result.scalar_one()
            report["timings_ms"]["postgresql_version"] = postgres_ms

            postgis_result, postgis_ms = timed(
                connection,
                """
                SELECT extversion
                FROM pg_extension
                WHERE extname = 'postgis'
                """,
            )
            postgis = postgis_result.mappings().one_or_none()
            report["timings_ms"]["postgis_version"] = postgis_ms
            report["postgis"] = dict(postgis) if postgis else None
            report["checks"]["postgis"] = {
                "status": "PASS" if postgis else "FAIL",
            }
            if not postgis:
                failures.append("PostGIS extension is missing")

            schemas_result, schemas_ms = timed(
                connection,
                """
                SELECT schema_name
                FROM information_schema.schemata
                WHERE schema_name IN ('public', 'tiger', 'topology')
                ORDER BY schema_name
                """,
            )
            schemas = list(schemas_result.scalars())
            report["schemas"] = schemas
            report["timings_ms"]["schemas"] = schemas_ms
            report["checks"]["schemas"] = {
                "required": ["public"],
                "status": "PASS" if "public" in schemas else "FAIL",
            }
            if "public" not in schemas:
                failures.append("Required public schema is missing")

            all_relations = sorted(
                {
                    relation
                    for relations in DOMAIN_RELATIONS.values()
                    for relation in relations
                }
                | set(LIMITED_RELATIONS)
            )
            for relation in all_relations:
                exists_result, exists_ms = timed(
                    connection,
                    "SELECT to_regclass(:relation) IS NOT NULL",
                    {"relation": f"public.{relation}"},
                )
                exists = exists_result.scalar_one()
                relation_report = {
                    "exists": exists,
                    "rows": None,
                    "status": "Missing",
                    "response_ms": exists_ms,
                }
                if exists:
                    count_result, count_ms = timed(
                        connection,
                        f'SELECT count(*) FROM public."{relation}"',
                    )
                    row_count = count_result.scalar_one()
                    relation_report.update(
                        {
                            "rows": row_count,
                            "status": "Available" if row_count > 0 else "Available with limitation",
                            "response_ms": round(exists_ms + count_ms, 1),
                        }
                    )
                report["relations"][relation] = relation_report

            for domain, relations in DOMAIN_RELATIONS.items():
                missing = [
                    relation
                    for relation in relations
                    if not report["relations"][relation]["exists"]
                    or report["relations"][relation]["rows"] == 0
                ]
                status = "Available" if not missing else "Missing"
                report["domains"][domain] = {
                    "status": status,
                    "relations": list(relations),
                    "limitations": [],
                }
                if missing:
                    failures.append(f"{domain} data missing: {', '.join(missing)}")

            school_capacity = report["relations"]["school_capacity"]
            report["domains"]["Schools"]["status"] = "Available with limitation"
            report["domains"]["Schools"]["limitations"].append(
                LIMITED_RELATIONS["school_capacity"]
            )
            if school_capacity["exists"] and school_capacity["rows"]:
                report["domains"]["Schools"]["status"] = "Available"
                report["domains"]["Schools"]["limitations"].clear()

            case_manifest = ROOT / "case-studies" / "large-development-land" / "case-study.json"
            investment_table = report["relations"]["investment_case_study"]
            investment_available = case_manifest.is_file()
            report["domains"]["Investments"] = {
                "status": "Available with limitation" if investment_available else "Missing",
                "relations": ["investment_case_study"],
                "repository_case_manifest": investment_available,
                "limitations": (
                    [LIMITED_RELATIONS["investment_case_study"]]
                    if investment_available and not investment_table["rows"]
                    else []
                ),
            }
            if not investment_available:
                failures.append("CASE-1 repository manifest is missing")

            report["domains"]["WSACC"]["status"] = "Available with limitation"
            report["domains"]["WSACC"]["limitations"].append(
                "Screening reports proximity and inventory only; it does not establish utility capacity."
            )

            geometry_result, geometry_ms = timed(
                connection,
                """
                SELECT f_table_name, f_geometry_column, type, srid
                FROM geometry_columns
                WHERE f_table_schema = 'public'
                  AND f_table_name = ANY(:relations)
                ORDER BY f_table_name
                """,
                {"relations": list(GEOMETRY_RELATIONS)},
            )
            geometry_rows = {
                row.f_table_name: {
                    "column": row.f_geometry_column,
                    "type": row.type,
                    "srid": row.srid,
                }
                for row in geometry_result
            }
            report["timings_ms"]["geometry_catalog"] = geometry_ms

            for relation, plausible_srids in GEOMETRY_RELATIONS.items():
                metadata = geometry_rows.get(relation)
                geometry_report = {
                    **(metadata or {}),
                    "plausible_srids": sorted(plausible_srids),
                    "sampled": 0,
                    "invalid": None,
                    "status": "FAIL",
                }
                if metadata and metadata["srid"] in plausible_srids:
                    sample_result, sample_ms = timed(
                        connection,
                        f"""
                        SELECT count(*) AS sampled,
                               count(*) FILTER (WHERE NOT ST_IsValid(geometry)) AS invalid
                        FROM (
                            SELECT geometry
                            FROM public."{relation}"
                            WHERE geometry IS NOT NULL
                            LIMIT 100
                        ) AS sample
                        """,
                    )
                    sample = sample_result.mappings().one()
                    geometry_report.update(
                        {
                            "sampled": sample["sampled"],
                            "invalid": sample["invalid"],
                            "response_ms": sample_ms,
                            "status": (
                                "PASS"
                                if sample["sampled"] > 0 and sample["invalid"] == 0
                                else "FAIL"
                            ),
                        }
                    )
                report["geometry"][relation] = geometry_report
                if geometry_report["status"] != "PASS":
                    failures.append(f"Geometry readiness failed for {relation}")

            parcel_result, parcel_ms = timed(
                connection,
                """
                SELECT official_parcel_id, ST_IsValid(geometry) AS geometry_valid
                FROM public.parcels_enriched
                WHERE official_parcel_id = :parcel
                """,
                {"parcel": CANONICAL_PARCEL},
            )
            parcel = parcel_result.mappings().one_or_none()
            report["timings_ms"]["representative_parcel"] = parcel_ms
            report["checks"]["representative_parcel"] = {
                "parcel_id": CANONICAL_PARCEL,
                "found": bool(parcel),
                "geometry_valid": bool(parcel and parcel["geometry_valid"]),
                "status": (
                    "PASS"
                    if parcel and parcel["geometry_valid"]
                    else "FAIL"
                ),
            }
            if not parcel or not parcel["geometry_valid"]:
                failures.append("Representative parcel is missing or invalid")

    except Exception as error:
        # Database exceptions can contain credentials; record only the safe type.
        failures.append(f"Local database check failed ({type(error).__name__})")

    measured_times = list(report["timings_ms"].values()) + [
        item["response_ms"]
        for item in report["relations"].values()
        if item.get("response_ms") is not None
    ]
    slowest_ms = max(measured_times, default=0)
    report["performance"] = {
        "limit_ms": PRESENTATION_LIMIT_MS,
        "slowest_query_ms": slowest_ms,
        "status": "PASS" if slowest_ms <= PRESENTATION_LIMIT_MS else "FAIL",
    }
    if slowest_ms > PRESENTATION_LIMIT_MS:
        failures.append("A readiness query exceeded 5 seconds")

    report["failures"] = failures
    report["status"] = "PASS" if not failures else "FAIL"
    LOGS.mkdir(exist_ok=True)
    output = LOGS / "local-data-readiness.json"
    output.write_text(json.dumps(report, indent=2), encoding="utf-8")

    print(f"[local-data] {report['status']}")
    print(
        "[local-data] "
        + ", ".join(
            f"{name}: {details['status']}"
            for name, details in report["domains"].items()
        )
    )
    print(f"[local-data] Slowest readiness query: {slowest_ms:.1f} ms")
    print(f"[local-data] Report: {output}")
    for failure in failures:
        print(f"[local-data] FAIL: {failure}")
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())
