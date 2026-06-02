"""Profile the Real Property Permit SharePoint source before Phase 3 modeling.

This source-evaluation pass downloads the candidate authoritative permit CSV,
profiles it, and compares it with the existing historical
public.permit_activity_clean pilot table. It intentionally does not overwrite
permit tables, build permit-to-parcel relationships, modify the frontend, build
APIs, or connect production services.
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import logging
import os
import re
import sys
import time
from datetime import date, datetime, timezone
from decimal import Decimal
from pathlib import Path
from typing import Any
from urllib.parse import unquote

import pandas as pd
import requests
from requests.adapters import HTTPAdapter
from sqlalchemy import URL, create_engine, text
from sqlalchemy.engine import Engine
from urllib3.util.retry import Retry

DEFAULT_SOURCE_URL = (
    "https://cabarruscountync.sharepoint.com/:x:/g/CabarrusCounty/"
    "ERNqFGtfcaxKrHNrgdKaTaoBBgVAADJsQVXPezRfkYQ6Xw?e=HJ0xjl&download=1"
)
DEFAULT_DB_HOST = "localhost"
DEFAULT_DB_PORT = 5433
DEFAULT_DB_NAME = "cfs_dev"
DEFAULT_DB_USER = "postgres"
CURRENT_PILOT_TABLE = "public.permit_activity_clean"

PIPELINE_ROOT = Path(__file__).resolve().parents[1]
LOG_DIR = PIPELINE_ROOT / "logs"
OUTPUT_DIR = PIPELINE_ROOT / "outputs"
PROFILE_OUTPUT = OUTPUT_DIR / "real_property_permit_source_profile.json"
COMPARISON_OUTPUT = OUTPUT_DIR / "permit_source_comparison.csv"

DATE_NAME_TOKENS = ("date", "filed", "issued")
EXPLICIT_DATE_FIELDS = {"codate", "co_date"}
PERMIT_ID_TOKENS = ("permitid", "permit_id", "permitnumber", "permit_number")
PIN_TOKENS = ("parcel", "pin")
ADDRESS_TOKENS = ("address", "addr", "location", "site", "street", "buildingnumber")
TYPE_STATUS_TOKENS = ("type", "category", "status", "code", "worktype")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Profile the Real Property Permit SharePoint CSV source.",
    )
    parser.add_argument("--source-url", default=DEFAULT_SOURCE_URL)
    parser.add_argument(
        "--log-level",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
        default="INFO",
    )
    return parser.parse_args()


def configure_logging(log_level: str) -> Path:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    log_path = LOG_DIR / f"inspect_real_property_permit_source_{timestamp}.log"
    logging.basicConfig(
        level=getattr(logging, log_level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)s %(message)s",
        handlers=[
            logging.StreamHandler(sys.stdout),
            logging.FileHandler(log_path, encoding="utf-8"),
        ],
    )
    return log_path


def create_requests_session() -> requests.Session:
    retry = Retry(
        total=5,
        backoff_factor=1.25,
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=("GET",),
    )
    adapter = HTTPAdapter(max_retries=retry)
    session = requests.Session()
    session.mount("https://", adapter)
    session.headers.update(
        {"User-Agent": "CabarrusFutureScape-RealPropertyPermitProfiler/0.1"}
    )
    return session


def download_source(session: requests.Session, source_url: str) -> dict[str, Any]:
    logging.info("Downloading Real Property Permit source: %s", source_url)
    response = session.get(source_url, timeout=120, allow_redirects=True)
    response.raise_for_status()

    headers = {key.lower(): value for key, value in response.headers.items()}
    filename = extract_filename(headers.get("content-disposition")) or "vdx_RP_Permit.csv"
    logging.info(
        "Downloaded %s bytes from %s as %s",
        len(response.content),
        response.url,
        filename,
    )

    return {
        "accessible": True,
        "content": response.content,
        "content_length": len(response.content),
        "content_type": headers.get("content-type"),
        "content_disposition": headers.get("content-disposition"),
        "etag": headers.get("etag"),
        "filename": filename,
        "final_url": response.url,
        "last_modified": headers.get("last-modified"),
        "requested_url": source_url,
        "status_code": response.status_code,
    }


def extract_filename(content_disposition: str | None) -> str | None:
    if not content_disposition:
        return None

    utf8_match = re.search(r"filename\*=utf-8''([^;]+)", content_disposition)
    if utf8_match:
        return unquote(utf8_match.group(1))

    quoted_match = re.search(r'filename="([^"]+)"', content_disposition)
    if quoted_match:
        return quoted_match.group(1)

    return None


def read_real_property_csv(content: bytes) -> pd.DataFrame:
    text_value = content.decode("utf-8-sig", errors="replace")
    # SharePoint exports several values as Excel formula-style cells such as
    # ="1,210 SF". CSV parsers do not treat the quote as a field quote when it
    # is preceded by "=", so normalize field-start ="" wrappers before parsing.
    text_value = re.sub(r'(?m)(^|,)="', r'\1"', text_value)
    dataframe = pd.read_csv(io.StringIO(text_value), dtype=str, low_memory=False)

    for column_name in dataframe.columns:
        dataframe[column_name] = (
            dataframe[column_name]
            .astype("string")
            .str.replace(r'^="(.*)"$', r"\1", regex=True)
            .str.strip()
            .replace({"": pd.NA, "nan": pd.NA, "NaN": pd.NA})
        )

    return dataframe


def create_engine_from_env() -> Engine:
    password = os.getenv("CFS_POSTGRES_PASSWORD")
    if not password:
        raise RuntimeError(
            "CFS_POSTGRES_PASSWORD is not set. Export it before comparing against PostGIS."
        )

    url = URL.create(
        drivername="postgresql+psycopg",
        username=DEFAULT_DB_USER,
        password=password,
        host=DEFAULT_DB_HOST,
        port=DEFAULT_DB_PORT,
        database=DEFAULT_DB_NAME,
    )
    return create_engine(url, pool_pre_ping=True)


def table_exists(engine: Engine, table_name: str) -> bool:
    with engine.connect() as connection:
        return bool(
            connection.execute(
                text("SELECT to_regclass(:table_name) IS NOT NULL"),
                {"table_name": table_name},
            ).scalar_one()
        )


def fetch_scalar(engine: Engine, sql: str) -> Any:
    with engine.connect() as connection:
        return connection.execute(text(sql)).scalar_one()


def fetch_rows(engine: Engine, sql: str) -> list[dict[str, Any]]:
    with engine.connect() as connection:
        rows = connection.execute(text(sql)).mappings()
        return [dict(row) for row in rows]


def profile_dataframe(dataframe: pd.DataFrame) -> dict[str, Any]:
    row_count = int(len(dataframe))
    column_profiles = []

    candidate_fields = classify_dataframe_columns(dataframe.columns)
    role_by_column: dict[str, list[str]] = {}
    for role, columns in candidate_fields.items():
        for column_name in columns:
            role_by_column.setdefault(column_name, []).append(role)

    for column_name in dataframe.columns:
        series = dataframe[column_name]
        null_count = int(series.isna().sum())
        non_null = series.dropna()
        column_profiles.append(
            {
                "column_name": column_name,
                "pandas_dtype": str(series.dtype),
                "null_count": null_count,
                "non_null_count": int(row_count - null_count),
                "null_percentage": round((null_count * 100 / row_count) if row_count else 0, 4),
                "distinct_non_null_count": int(non_null.nunique(dropna=True)),
                "role_tags": "|".join(role_by_column.get(column_name, [])),
                "sample_values": non_null.drop_duplicates().head(5).tolist(),
            }
        )

    date_profiles = profile_date_fields(dataframe, candidate_fields["date_fields"])
    permit_id_profiles = profile_identifier_fields(
        dataframe,
        candidate_fields["permit_id_fields"],
    )
    pin_profiles = profile_identifier_fields(dataframe, candidate_fields["pin_parcel_fields"])

    return {
        "row_count": row_count,
        "column_count": int(len(dataframe.columns)),
        "column_names": list(dataframe.columns),
        "data_types": {column: str(dataframe[column].dtype) for column in dataframe.columns},
        "column_profiles": column_profiles,
        "date_fields": date_profiles,
        "permit_id_fields": permit_id_profiles,
        "pin_parcel_fields": pin_profiles,
        "address_location_fields": candidate_fields["address_location_fields"],
        "permit_type_status_fields": candidate_fields["permit_type_status_fields"],
    }


def classify_dataframe_columns(columns: pd.Index) -> dict[str, list[str]]:
    names = list(columns)

    def normalized(value: str) -> str:
        return re.sub(r"[^a-z0-9]+", "", value.lower())

    date_fields = [
        name
        for name in names
        if matches_date_name(name, normalized(name))
    ]

    def matches(tokens: tuple[str, ...]) -> list[str]:
        matched = []
        for name in names:
            compact = normalized(name)
            lowered = name.lower()
            if any(token in compact or token in lowered for token in tokens):
                matched.append(name)
        return matched

    return {
        "date_fields": date_fields,
        "permit_id_fields": matches(PERMIT_ID_TOKENS),
        "pin_parcel_fields": matches(PIN_TOKENS),
        "address_location_fields": matches(ADDRESS_TOKENS),
        "permit_type_status_fields": matches(TYPE_STATUS_TOKENS),
    }


def matches_date_name(column_name: str, compact_name: str) -> bool:
    lowered = column_name.lower()
    return (
        compact_name in EXPLICIT_DATE_FIELDS
        or any(token in compact_name or token in lowered for token in DATE_NAME_TOKENS)
    )


def profile_date_fields(
    dataframe: pd.DataFrame,
    date_fields: list[str],
) -> list[dict[str, Any]]:
    profiles = []
    now = pd.Timestamp(datetime.now(timezone.utc)).tz_localize(None)

    for column_name in date_fields:
        parsed = pd.to_datetime(
            dataframe[column_name],
            format="%m/%d/%Y %I:%M:%S %p",
            errors="coerce",
        )
        if parsed.notna().sum() == 0:
            parsed = pd.to_datetime(dataframe[column_name], errors="coerce")
        parsed_non_null = parsed.dropna()
        profiles.append(
            {
                "column_name": column_name,
                "parsed_count": int(parsed_non_null.count()),
                "parse_percentage": round(
                    (parsed_non_null.count() * 100 / len(dataframe)) if len(dataframe) else 0,
                    4,
                ),
                "min_date": parsed_non_null.min().date().isoformat()
                if not parsed_non_null.empty
                else None,
                "max_date": parsed_non_null.max().date().isoformat()
                if not parsed_non_null.empty
                else None,
                "future_date_count_after_profile_date": int((parsed > now).sum()),
            }
        )

    return profiles


def profile_identifier_fields(
    dataframe: pd.DataFrame,
    field_names: list[str],
) -> list[dict[str, Any]]:
    profiles = []
    row_count = len(dataframe)

    for column_name in field_names:
        non_null = dataframe[column_name].dropna()
        distinct_count = int(non_null.nunique(dropna=True))
        duplicate_groups = int((non_null.value_counts() > 1).sum())
        profiles.append(
            {
                "column_name": column_name,
                "non_null_count": int(non_null.count()),
                "non_null_percentage": round((non_null.count() * 100 / row_count) if row_count else 0, 4),
                "distinct_non_null_count": distinct_count,
                "duplicate_value_group_count": duplicate_groups,
                "appears_unique": distinct_count == int(non_null.count()),
            }
        )

    return profiles


def profile_current_pilot_table(engine: Engine) -> dict[str, Any]:
    if not table_exists(engine, CURRENT_PILOT_TABLE):
        return {
            "available": False,
            "table": CURRENT_PILOT_TABLE,
        }

    count = int(fetch_scalar(engine, f"SELECT COUNT(*) FROM {CURRENT_PILOT_TABLE}"))
    return {
        "available": True,
        "table": CURRENT_PILOT_TABLE,
        "row_count": count,
        "geometry_available": True,
        "geometry_type_counts": fetch_rows(
            engine,
            f"""
            SELECT ST_GeometryType(geometry) AS geometry_type, COUNT(*) AS feature_count
            FROM {CURRENT_PILOT_TABLE}
            GROUP BY ST_GeometryType(geometry)
            ORDER BY feature_count DESC
            """,
        ),
        "srid_distribution": fetch_rows(
            engine,
            f"""
            SELECT ST_SRID(geometry) AS srid, COUNT(*) AS feature_count
            FROM {CURRENT_PILOT_TABLE}
            GROUP BY ST_SRID(geometry)
            ORDER BY feature_count DESC
            """,
        ),
        "date_range": fetch_rows(
            engine,
            f"""
            SELECT
              MIN(activity_date) AS min_activity_date,
              MAX(activity_date) AS max_activity_date,
              COUNT(*) FILTER (WHERE activity_date IS NOT NULL) AS parsed_activity_date_count
            FROM {CURRENT_PILOT_TABLE}
            """,
        )[0],
        "key_field_counts": fetch_rows(
            engine,
            f"""
            SELECT
              COUNT(*) FILTER (WHERE permit_id IS NOT NULL) AS permit_id_non_null_count,
              COUNT(*) FILTER (WHERE pin14 IS NOT NULL) AS pin14_non_null_count,
              COUNT(*) FILTER (WHERE address IS NOT NULL) AS address_non_null_count,
              COUNT(*) FILTER (WHERE permit_status_normalized IS NOT NULL) AS status_non_null_count,
              COUNT(*) FILTER (WHERE permit_type_normalized IS NOT NULL) AS type_non_null_count,
              COUNT(*) FILTER (WHERE permit_category_normalized IS NOT NULL) AS category_non_null_count
            FROM {CURRENT_PILOT_TABLE}
            """,
        )[0],
        "duplicate_summary": fetch_rows(
            engine,
            f"""
            SELECT
              (
                SELECT COUNT(*)
                FROM (
                  SELECT permit_id
                  FROM {CURRENT_PILOT_TABLE}
                  WHERE permit_id IS NOT NULL
                  GROUP BY permit_id
                  HAVING COUNT(*) > 1
                ) duplicate_permits
              ) AS duplicate_permit_id_groups,
              (
                SELECT COUNT(*)
                FROM (
                  SELECT pin14
                  FROM {CURRENT_PILOT_TABLE}
                  WHERE pin14 IS NOT NULL
                  GROUP BY pin14
                  HAVING COUNT(*) > 1
                ) duplicate_pins
              ) AS duplicate_pin14_groups
            """,
        )[0],
    }


def build_comparison_rows(
    real_profile: dict[str, Any],
    pilot_profile: dict[str, Any],
    source_metadata: dict[str, Any],
) -> list[dict[str, str]]:
    real_dates = {
        item["column_name"]: item for item in real_profile["date_fields"]
    }
    permit_date = real_dates.get("PermitDate", {})
    co_date = real_dates.get("CODate", {})
    pilot_date_range = pilot_profile.get("date_range", {}) if pilot_profile.get("available") else {}
    pilot_key_counts = pilot_profile.get("key_field_counts", {}) if pilot_profile.get("available") else {}
    pilot_duplicate_summary = pilot_profile.get("duplicate_summary", {}) if pilot_profile.get("available") else {}

    return [
        comparison_row(
            "accessibility",
            f"Accessible CSV; final URL {source_metadata['final_url']}",
            "Already ingested local PostGIS table",
            "SharePoint source is accessible for profiling.",
        ),
        comparison_row(
            "source currency",
            f"HTTP Last-Modified {source_metadata.get('last_modified') or 'unknown'}; PermitDate max {permit_date.get('max_date')}",
            "Historical 2015 OpenData layer",
            "Real Property source is substantially newer and broader.",
        ),
        comparison_row(
            "row count",
            str(real_profile["row_count"]),
            str(pilot_profile.get("row_count", "unavailable")),
            "Real Property source contains a much larger permit history.",
        ),
        comparison_row(
            "primary date range",
            f"{permit_date.get('min_date')} to {permit_date.get('max_date')} ({permit_date.get('parsed_count')} parsed)",
            f"{pilot_date_range.get('min_activity_date')} to {pilot_date_range.get('max_activity_date')} ({pilot_date_range.get('parsed_activity_date_count')} parsed)",
            "Real Property source supports multi-year temporal analysis.",
        ),
        comparison_row(
            "certificate/completion date range",
            f"{co_date.get('min_date')} to {co_date.get('max_date')} ({co_date.get('parsed_count')} parsed)",
            "Not standardized in the 2015 pilot table",
            "CODate includes a suspicious far-future max and needs QA rules.",
        ),
        comparison_row(
            "geometry",
            "No geometry columns in CSV",
            "; ".join(
                f"{row['geometry_type']}={row['feature_count']}"
                for row in pilot_profile.get("geometry_type_counts", [])
            )
            or "Unavailable",
            "Real Property source should join to parcel geometry by ParcelNumber/PIN.",
        ),
        comparison_row(
            "permit identifiers",
            summarize_identifier_profiles(real_profile["permit_id_fields"]),
            f"permit_id non-null {pilot_key_counts.get('permit_id_non_null_count')}; duplicate permit groups {pilot_duplicate_summary.get('duplicate_permit_id_groups')}",
            "PermitID appears to be the best stable permit key in the Real Property source.",
        ),
        comparison_row(
            "parcel join fields",
            summarize_identifier_profiles(real_profile["pin_parcel_fields"]),
            f"pin14 non-null {pilot_key_counts.get('pin14_non_null_count')}; duplicate PIN groups {pilot_duplicate_summary.get('duplicate_pin14_groups')}",
            "ParcelNumber is the expected PIN join field for parcel relationship modeling.",
        ),
        comparison_row(
            "address/location fields",
            ", ".join(real_profile["address_location_fields"]) or "None found",
            f"address non-null {pilot_key_counts.get('address_non_null_count')}",
            "The 2015 pilot has address text; Real Property CSV mainly relies on parcel/PIN context.",
        ),
        comparison_row(
            "permit type/status fields",
            ", ".join(real_profile["permit_type_status_fields"]),
            "permit_status_normalized, permit_type_normalized, permit_category_normalized",
            "Real Property has usable code/type/status fields but domains need mapping.",
        ),
        comparison_row(
            "primary source recommendation",
            "Recommended as primary Phase 3 permit source",
            "Keep as historical spatial pilot/reference",
            "Use Real Property source for current permit intelligence; derive geometry from parcel joins.",
        ),
    ]


def comparison_row(
    dimension: str,
    real_property_source: str,
    current_2015_pilot: str,
    recommendation_notes: str,
) -> dict[str, str]:
    return {
        "comparison_dimension": dimension,
        "real_property_permit_source": real_property_source,
        "public_2015_permit_activity_clean": current_2015_pilot,
        "recommendation_notes": recommendation_notes,
    }


def summarize_identifier_profiles(profiles: list[dict[str, Any]]) -> str:
    return "; ".join(
        f"{profile['column_name']}: non-null {profile['non_null_count']}, distinct {profile['distinct_non_null_count']}, duplicate groups {profile['duplicate_value_group_count']}, unique={profile['appears_unique']}"
        for profile in profiles
    )


def write_comparison_csv(rows: list[dict[str, str]]) -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    with COMPARISON_OUTPUT.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)


def json_default(value: Any) -> Any:
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    raise TypeError(f"Object of type {type(value).__name__} is not JSON serializable")


def main() -> int:
    args = parse_args()
    started_at = time.perf_counter()
    log_path = configure_logging(args.log_level)

    try:
        session = create_requests_session()
        source = download_source(session, args.source_url)
        dataframe = read_real_property_csv(source["content"])
        real_profile = profile_dataframe(dataframe)

        engine = create_engine_from_env()
        pilot_profile = profile_current_pilot_table(engine)
        engine.dispose()

        comparison_rows = build_comparison_rows(real_profile, pilot_profile, source)
        profile_output = {
            "generated_at": datetime.now().isoformat(timespec="seconds"),
            "artifact_type": "real_property_permit_source_profile",
            "source": {
                key: value
                for key, value in source.items()
                if key != "content"
            },
            "profile": real_profile,
            "current_2015_pilot_comparison": pilot_profile,
            "recommendation": {
                "primary_phase_3_source": "real_property_permit_source",
                "keep_2015_pilot_role": "historical_spatial_reference_only",
                "rationale": [
                    "Real Property Permit source has a much larger multi-year record set.",
                    "PermitID appears unique and ParcelNumber is a strong parcel/PIN join candidate.",
                    "The 2015 pilot source has geometry but only covers historical 2015 activity.",
                    "Real Property source lacks geometry, so parcel geometry should be attached through a governed parcel/PIN relationship model.",
                  ],
                "next_step": "Create a new raw/clean ingestion path for the Real Property Permit source, then model permit-to-parcel relationships by ParcelNumber/PIN with QA checks.",
            },
            "duration_seconds": round(time.perf_counter() - started_at, 2),
            "log_path": str(log_path),
        }

        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        PROFILE_OUTPUT.write_text(
            json.dumps(profile_output, indent=2, default=json_default),
            encoding="utf-8",
        )
        write_comparison_csv(comparison_rows)

        logging.info("Real Property Permit rows: %s", real_profile["row_count"])
        logging.info("Wrote profile: %s", PROFILE_OUTPUT)
        logging.info("Wrote comparison: %s", COMPARISON_OUTPUT)
        return 0
    except Exception:
        logging.exception("Real Property Permit source profile failed.")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
