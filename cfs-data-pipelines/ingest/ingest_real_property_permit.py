"""Ingest the primary Real Property Permit CSV into local PostGIS.

This Phase 3 path downloads the authoritative-candidate SharePoint CSV and
writes it to public.real_property_permit. It intentionally leaves the 2015
public OpenData pilot tables untouched and does not build permit-to-parcel
relationships, APIs, frontend integrations, forecasting, or AI.
"""

from __future__ import annotations

import argparse
import io
import json
import logging
import os
import re
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib.parse import unquote

import pandas as pd
import requests
from requests import Session
from requests.adapters import HTTPAdapter
from sqlalchemy import URL, Text, create_engine, inspect, text
from sqlalchemy.engine import Engine
from urllib3.util.retry import Retry

DEFAULT_DB_HOST = "localhost"
DEFAULT_DB_PORT = 5433
DEFAULT_DB_NAME = "cfs_dev"
DEFAULT_DB_USER = "postgres"

PIPELINE_ROOT = Path(__file__).resolve().parents[1]
CONFIG_PATH = PIPELINE_ROOT / "config" / "real_property_permit_sources.json"
LOG_DIR = PIPELINE_ROOT / "logs"
OUTPUT_DIR = PIPELINE_ROOT / "outputs"
SUMMARY_OUTPUT = OUTPUT_DIR / "real_property_permit_ingest_summary.json"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Ingest the Real Property Permit CSV into local PostGIS.",
    )
    parser.add_argument("--config", default=str(CONFIG_PATH))
    parser.add_argument("--source-id", default=None)
    parser.add_argument(
        "--if-exists",
        choices=["append", "fail", "replace"],
        default="replace",
    )
    parser.add_argument("--timeout", type=int, default=120)
    parser.add_argument(
        "--log-level",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
        default="INFO",
    )
    parser.add_argument(
        "--skip-db",
        action="store_true",
        help="Download and parse without writing to PostGIS.",
    )
    return parser.parse_args()


def configure_logging(log_level: str) -> Path:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    log_path = LOG_DIR / f"ingest_real_property_permit_{timestamp}.log"
    logging.basicConfig(
        level=getattr(logging, log_level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)s %(message)s",
        handlers=[
            logging.StreamHandler(sys.stdout),
            logging.FileHandler(log_path, encoding="utf-8"),
        ],
    )
    return log_path


def load_source_config(config_path: Path, source_id: str | None) -> dict[str, Any]:
    config = json.loads(config_path.read_text(encoding="utf-8"))
    sources = config.get("sources", [])
    if source_id:
        matching = [source for source in sources if source.get("id") == source_id]
    else:
        matching = [source for source in sources if source.get("enabled")]

    if not matching:
        raise RuntimeError("No enabled Real Property Permit source is configured.")

    source = matching[0]
    if not source.get("enabled"):
        raise RuntimeError(f"Configured Real Property Permit source is disabled: {source.get('id')}")
    if not str(source.get("url", "")).startswith("https://"):
        raise RuntimeError(f"Real Property Permit source URL is missing or unsafe: {source.get('url')}")

    return source


def create_requests_session() -> Session:
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
        {"User-Agent": "CabarrusFutureScape-RealPropertyPermitIngestion/0.1"}
    )
    return session


def download_source(
    session: Session,
    source: dict[str, Any],
    timeout: int,
) -> dict[str, Any]:
    source_url = source["url"]
    logging.info("Downloading Real Property Permit source: %s", source_url)
    response = session.get(source_url, timeout=timeout, allow_redirects=True)
    response.raise_for_status()

    headers = {key.lower(): value for key, value in response.headers.items()}
    filename = extract_filename(headers.get("content-disposition")) or source.get(
        "expected_filename",
        "vdx_RP_Permit.csv",
    )
    logging.info(
        "Downloaded %s bytes from %s as %s",
        len(response.content),
        response.url,
        filename,
    )

    return {
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


def normalize_column_name(column_name: str) -> str:
    normalized = re.sub(r"[^0-9a-zA-Z]+", "_", str(column_name)).strip("_").lower()
    return normalized or "field"


def normalize_columns(dataframe: pd.DataFrame) -> pd.DataFrame:
    normalized_names: list[str] = []
    used_names: set[str] = set()

    for column_name in dataframe.columns:
        normalized = normalize_column_name(column_name)
        base_name = normalized
        suffix = 2
        while normalized in used_names:
            normalized = f"{base_name}_{suffix}"
            suffix += 1
        used_names.add(normalized)
        normalized_names.append(normalized)

    dataframe = dataframe.copy()
    dataframe.columns = normalized_names
    return dataframe


def read_real_property_csv(content: bytes) -> pd.DataFrame:
    text_value = content.decode("utf-8-sig", errors="replace")
    # SharePoint exports many fields as Excel-style formula values such as
    # ="1,210 SF". Normalize field-start wrappers so embedded commas inside
    # quoted values remain valid CSV data instead of false delimiters.
    text_value = re.sub(r'(?m)(^|,)="', r'\1"', text_value)
    dataframe = pd.read_csv(io.StringIO(text_value), dtype=str, low_memory=False)
    dataframe = normalize_columns(dataframe)

    for column_name in dataframe.columns:
        dataframe[column_name] = (
            dataframe[column_name]
            .astype("string")
            .str.replace(r'^="(.*)"$', r"\1", regex=True)
            .str.strip()
            .replace({"": pd.NA, "nan": pd.NA, "NaN": pd.NA})
        )

    return dataframe.astype("object").where(pd.notna(dataframe), None)


def create_engine_from_env() -> Engine:
    password = os.getenv("CFS_POSTGRES_PASSWORD")
    if not password:
        raise RuntimeError(
            "CFS_POSTGRES_PASSWORD is not set. Export it before permit ingestion."
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


def verify_database(engine: Engine) -> None:
    logging.info(
        "Verifying database connection: host=%s port=%s database=%s user=%s",
        DEFAULT_DB_HOST,
        DEFAULT_DB_PORT,
        DEFAULT_DB_NAME,
        DEFAULT_DB_USER,
    )
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))
        connection.execute(text("SELECT postgis_full_version()")).scalar_one()


def append_source_metadata(
    dataframe: pd.DataFrame,
    source: dict[str, Any],
    download_metadata: dict[str, Any],
) -> pd.DataFrame:
    enriched = dataframe.copy()
    enriched["cfs_source_id"] = source["id"]
    enriched["cfs_source_name"] = source["name"]
    enriched["cfs_source_url"] = source["url"]
    enriched["cfs_source_final_url"] = download_metadata.get("final_url")
    enriched["cfs_source_filename"] = download_metadata.get("filename")
    enriched["cfs_source_last_modified"] = download_metadata.get("last_modified")
    enriched["cfs_source_etag"] = download_metadata.get("etag")
    enriched["cfs_ingested_at"] = datetime.now().isoformat(timespec="seconds")
    return enriched


def write_to_postgis(
    dataframe: pd.DataFrame,
    engine: Engine,
    schema: str,
    table: str,
    if_exists: str,
) -> None:
    logging.info(
        "Writing %s Real Property Permit rows to %s.%s with if_exists=%s.",
        len(dataframe),
        schema,
        table,
        if_exists,
    )
    dataframe.to_sql(
        name=table,
        con=engine,
        schema=schema,
        if_exists=if_exists,
        index=False,
        chunksize=1000,
        method="multi",
        dtype={column_name: Text() for column_name in dataframe.columns},
    )
    with engine.begin() as connection:
        connection.execute(text(f'ANALYZE "{schema}"."{table}"'))


def summarize_dataframe(dataframe: pd.DataFrame) -> dict[str, Any]:
    return {
        "row_count": int(len(dataframe)),
        "column_count": int(len(dataframe.columns)),
        "columns": list(dataframe.columns),
        "null_counts": {
            column_name: int(dataframe[column_name].isna().sum())
            for column_name in dataframe.columns
        },
        "permit_id_unique_count": int(dataframe["permitid"].nunique(dropna=True))
        if "permitid" in dataframe.columns
        else None,
        "parcel_number_distinct_count": int(dataframe["parcelnumber"].nunique(dropna=True))
        if "parcelnumber" in dataframe.columns
        else None,
    }


def get_index_summary(engine: Engine, schema: str, table: str) -> list[dict[str, str]]:
    inspector = inspect(engine)
    return [
        {
            "name": index["name"],
            "column_names": ", ".join(index.get("column_names") or []),
            "unique": str(index.get("unique", False)),
        }
        for index in inspector.get_indexes(table, schema=schema)
    ]


def write_summary_file(summary: dict[str, Any]) -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    SUMMARY_OUTPUT.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    logging.info("Wrote Real Property Permit ingestion summary: %s", SUMMARY_OUTPUT)


def main() -> int:
    args = parse_args()
    started_at = time.perf_counter()
    log_path = configure_logging(args.log_level)
    logging.info("Starting primary Real Property Permit ingestion.")

    try:
        source = load_source_config(Path(args.config), args.source_id)
        session = create_requests_session()
        download_metadata = download_source(session, source, args.timeout)
        dataframe = read_real_property_csv(download_metadata["content"])
        dataframe = append_source_metadata(dataframe, source, download_metadata)
        dataframe_summary = summarize_dataframe(dataframe)

        database_written = False
        raw_indexes: list[dict[str, str]] = []
        schema = source.get("target_schema", "public")
        table = source.get("target_table", "real_property_permit")
        if args.skip_db:
            logging.warning("Skipping PostGIS write because --skip-db was supplied.")
        else:
            engine = create_engine_from_env()
            verify_database(engine)
            write_to_postgis(dataframe, engine, schema, table, args.if_exists)
            raw_indexes = get_index_summary(engine, schema, table)
            engine.dispose()
            database_written = True

        summary = {
            "generated_at": datetime.now().isoformat(timespec="seconds"),
            "source": {
                "id": source["id"],
                "name": source["name"],
                "source_status": source.get("source_status"),
                "requested_url": download_metadata.get("requested_url"),
                "final_url": download_metadata.get("final_url"),
                "filename": download_metadata.get("filename"),
                "last_modified": download_metadata.get("last_modified"),
                "etag": download_metadata.get("etag"),
                "content_length": download_metadata.get("content_length"),
                "content_type": download_metadata.get("content_type"),
            },
            "dataframe": dataframe_summary,
            "database": {
                "host": DEFAULT_DB_HOST,
                "port": DEFAULT_DB_PORT,
                "database": DEFAULT_DB_NAME,
                "schema": schema,
                "table": table,
                "written": database_written,
                "if_exists": args.if_exists,
                "indexes": raw_indexes,
            },
            "duration_seconds": round(time.perf_counter() - started_at, 2),
            "log_path": str(log_path),
        }
        write_summary_file(summary)
        logging.info("Real Property Permit row count: %s", dataframe_summary["row_count"])
        logging.info("Primary Real Property Permit ingestion complete.")
        return 0
    except Exception:
        logging.exception("Primary Real Property Permit ingestion failed.")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
