"""Create the empty Phase 8A school capacity placeholder table."""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import time
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path
from typing import Any

from sqlalchemy import URL, create_engine, text
from sqlalchemy.engine import Engine

DEFAULT_DB_HOST = "localhost"
DEFAULT_DB_PORT = 5433
DEFAULT_DB_NAME = "cfs_dev"
DEFAULT_DB_USER = "postgres"

CAPACITY_TABLE = "public.school_capacity"

PIPELINE_ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT = PIPELINE_ROOT.parent
LOG_DIR = PIPELINE_ROOT / "logs"
PIPELINE_OUTPUT_DIR = PIPELINE_ROOT / "outputs"
ROOT_OUTPUT_DIR = PROJECT_ROOT / "outputs"
SQL_FILE = PIPELINE_ROOT / "sql" / "create_school_capacity_placeholder.sql"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Create public.school_capacity as an empty Phase 8A placeholder.",
    )
    parser.add_argument(
        "--skip-transform",
        action="store_true",
        help="Validate the existing public.school_capacity table without recreating it.",
    )
    parser.add_argument(
        "--log-level",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
        default="INFO",
    )
    return parser.parse_args()


def configure_logging(log_level: str) -> Path:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    log_path = LOG_DIR / f"create_school_capacity_placeholder_{timestamp}.log"
    logging.basicConfig(
        level=getattr(logging, log_level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)s %(message)s",
        handlers=[
            logging.StreamHandler(sys.stdout),
            logging.FileHandler(log_path, encoding="utf-8"),
        ],
    )
    return log_path


def create_engine_from_env() -> Engine:
    password = os.getenv("CFS_POSTGRES_PASSWORD")
    if not password:
        raise RuntimeError(
            "CFS_POSTGRES_PASSWORD is not set. Export it before creating school capacity."
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


def execute_sql_file(engine: Engine) -> None:
    raw_connection = engine.raw_connection()
    try:
        with raw_connection.cursor() as cursor:
            cursor.execute(SQL_FILE.read_text(encoding="utf-8"))
        raw_connection.commit()
    except Exception:
        raw_connection.rollback()
        raise
    finally:
        raw_connection.close()


def fetch_rows(engine: Engine, sql: str) -> list[dict[str, Any]]:
    with engine.connect() as connection:
        return [dict(row) for row in connection.execute(text(sql)).mappings()]


def scalar(engine: Engine, sql: str) -> Any:
    with engine.connect() as connection:
        return connection.execute(text(sql)).scalar_one()


def to_jsonable(value: Any) -> Any:
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return value


def write_json_all(filename: str, payload: dict[str, Any]) -> None:
    for output_dir in (PIPELINE_OUTPUT_DIR, ROOT_OUTPUT_DIR):
        output_dir.mkdir(parents=True, exist_ok=True)
        with (output_dir / filename).open("w", encoding="utf-8") as file:
            json.dump(payload, file, indent=2, default=to_jsonable)


def main() -> int:
    args = parse_args()
    started_at = time.perf_counter()
    log_path = configure_logging(args.log_level)
    engine = create_engine_from_env()

    if not args.skip_transform:
        logging.info("Executing school capacity placeholder SQL: %s", SQL_FILE)
        execute_sql_file(engine)

    validation = {
        "generated_at": datetime.now().isoformat(),
        "table": CAPACITY_TABLE,
        "row_count": int(scalar(engine, f"SELECT COUNT(*) FROM {CAPACITY_TABLE}")),
        "capacity_data_available_count": int(
            scalar(
                engine,
                f"SELECT COUNT(*) FROM {CAPACITY_TABLE} WHERE capacity_data_available",
            )
        ),
        "indexes": fetch_rows(
            engine,
            """
            SELECT indexname, indexdef
            FROM pg_indexes
            WHERE schemaname = 'public'
              AND tablename = 'school_capacity'
            ORDER BY indexname
            """,
        ),
        "policy": {
            "placeholder_only": True,
            "no_capacity_score_until_real_data_exists": True,
            "no_fabricated_capacity_or_enrollment": True,
        },
        "elapsed_seconds": round(time.perf_counter() - started_at, 2),
        "log_path": str(log_path),
    }
    write_json_all("school_capacity_placeholder_validation.json", validation)
    logging.info("School capacity placeholder row count: %s", validation["row_count"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
