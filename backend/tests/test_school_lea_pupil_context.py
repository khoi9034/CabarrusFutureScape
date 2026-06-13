import importlib.util
import os
import subprocess
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import URL, create_engine, text

from app.main import app

ROOT = Path(__file__).resolve().parents[2]
IMPORTER_PATH = ROOT / "cfs-data-pipelines" / "ingest" / "ingest_lea_pupil_context.py"
SOURCE_FILE = ROOT / "data" / "schools" / "raw" / "lea_pupil_info_2025.csv"


def load_module(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


lea_importer = load_module(IMPORTER_PATH, "lea_pupil_context_importer_for_tests")
client = TestClient(app)


def db_credentials_available() -> bool:
    return bool(os.getenv("POSTGRES_PASSWORD") or os.getenv("CFS_POSTGRES_PASSWORD"))


def create_test_engine():
    password = os.getenv("CFS_POSTGRES_PASSWORD") or os.getenv("POSTGRES_PASSWORD")
    url = URL.create(
        drivername="postgresql+psycopg",
        username=os.getenv("POSTGRES_USER", "postgres"),
        password=password,
        host=os.getenv("POSTGRES_HOST", "localhost"),
        port=int(os.getenv("POSTGRES_PORT", "5433")),
        database=os.getenv("POSTGRES_DB", "cfs_dev"),
    )
    return create_engine(url, pool_pre_ping=True)


def test_lea_pupil_csv_wide_to_long_transform() -> None:
    raw_rows = lea_importer.read_lea_pupil_csv(SOURCE_FILE)
    transformed = lea_importer.transform_lea_pupil_rows(
        raw_rows,
        source_file=SOURCE_FILE,
    )

    assert len(raw_rows) == 4
    assert len(transformed) == 60
    assert {row["measure_type"] for row in transformed} == {
        "Enrollment",
        "ADM",
        "ADA",
        "MLD",
    }
    assert transformed[0]["grade_level"] == "kindergarten"
    assert transformed[0]["source_confidence"] == "uploaded_lea_pupil_file"
    assert "school-level capacity" in transformed[0]["notes"]


def test_lea_pupil_numeric_cleanup_and_total_enrollment() -> None:
    assert lea_importer.parse_int("36,287") == 36287
    raw_rows = lea_importer.read_lea_pupil_csv(SOURCE_FILE)
    transformed = lea_importer.transform_lea_pupil_rows(
        raw_rows,
        source_file=SOURCE_FILE,
    )

    enrollment_total = next(
        row
        for row in transformed
        if row["measure_type"] == "Enrollment" and row["grade_level"] == "total"
    )
    grade_13 = next(
        row
        for row in transformed
        if row["measure_type"] == "Enrollment" and row["grade_level"] == "grade_13"
    )

    assert enrollment_total["pupil_count"] == 36287
    assert grade_13["pupil_count"] == 4


def test_lea_pupil_dry_run_does_not_write_rows() -> None:
    result = subprocess.run(
        [
            sys.executable,
            str(IMPORTER_PATH),
            "--dry-run",
        ],
        cwd=ROOT,
        text=True,
        capture_output=True,
        timeout=30,
    )

    assert result.returncode == 0
    assert '"dry_run": true' in result.stdout
    assert '"inserted_rows": 0' in result.stdout
    assert '"public_school_capacity_untouched": true' in result.stdout
    assert '"school_capacity_scores_calculated": false' in result.stdout


@pytest.fixture(scope="module")
def loaded_lea_pupil_context():
    if not db_credentials_available():
        pytest.skip("PostGIS credentials not configured")

    result = subprocess.run(
        [
            sys.executable,
            str(IMPORTER_PATH),
            "--truncate-and-load",
        ],
        cwd=ROOT,
        text=True,
        capture_output=True,
        timeout=60,
    )
    assert result.returncode == 0, result.stderr
    assert '"inserted_rows": 60' in result.stdout
    return True


def test_lea_pupil_truncate_load_writes_expected_rows(
    loaded_lea_pupil_context,
) -> None:
    engine = create_test_engine()
    with engine.connect() as connection:
        count = connection.execute(
            text("SELECT COUNT(*)::int FROM public.school_lea_pupil_context")
        ).scalar_one()
        enrollment_total = connection.execute(
            text(
                """
                SELECT pupil_count
                FROM public.school_lea_pupil_context
                WHERE measure_type = 'Enrollment'
                  AND grade_level = 'total'
                """
            )
        ).scalar_one()
        capacity_rows = connection.execute(
            text("SELECT COUNT(*)::int FROM public.school_capacity")
        ).scalar_one()

    assert count == 60
    assert enrollment_total == 36287
    assert capacity_rows == 0


def test_lea_pupil_context_endpoint_returns_district_rows(
    loaded_lea_pupil_context,
) -> None:
    response = client.get(
        "/constraints/schools/lea-pupil-context",
        params={"measure_type": "Enrollment", "limit": 20},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["total_count"] == 15
    assert payload["district_level_only"] is True
    assert payload["school_capacity_table_updated"] is False
    assert payload["school_capacity_scores_enabled"] is False
    assert any(row["grade_level"] == "total" for row in payload["rows"])
    assert all(row["source_confidence"] == "uploaded_lea_pupil_file" for row in payload["rows"])


def test_lea_pupil_context_summary_endpoint(
    loaded_lea_pupil_context,
) -> None:
    response = client.get("/constraints/schools/lea-pupil-context/summary")

    assert response.status_code == 200
    payload = response.json()
    assert payload["school_year"] == 2025
    assert payload["total_rows"] == 60
    assert payload["district_level_only"] is True
    assert payload["school_capacity_scores_enabled"] is False
    totals = {
        row["measure_type"]: row["pupil_count"]
        for row in payload["totals_by_measure"]
    }
    assert totals["Enrollment"] == 36287
    assert totals["ADM"] == 34999
    assert any(row["grade_level"] == "kindergarten" for row in payload["enrollment_by_grade"])
