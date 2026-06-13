import importlib.util
import os
import subprocess
import sys
from pathlib import Path

import pytest
from sqlalchemy import create_engine, text

from app.config import get_settings
from app.database import build_database_url

ROOT = Path(__file__).resolve().parents[2]
VALIDATOR_PATH = ROOT / "cfs-data-pipelines" / "transform" / "validate_school_capacity_data.py"
SNAPSHOT_PATH = ROOT / "cfs-data-pipelines" / "transform" / "create_current_school_capacity_snapshot.py"
IMPORTER_PATH = ROOT / "cfs-data-pipelines" / "ingest" / "ingest_school_capacity_data.py"


def load_module(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


validator = load_module(VALIDATOR_PATH, "school_capacity_validator_for_tests")
snapshot = load_module(SNAPSHOT_PATH, "school_capacity_snapshot_for_tests")


def test_school_name_normalization_handles_suffixes() -> None:
    assert validator.normalize_school_name("Royal Oaks ES") == "royal_oaks_elementary"
    assert (
        validator.normalize_school_name("Northwest Cabarrus Middle School")
        == "northwest_cabarrus_middle"
    )
    assert validator.normalize_school_name("West Cabarrus HS") == "west_cabarrus_high"


def test_required_column_validation_reports_missing_column() -> None:
    _, issues = validator.validate_records(
        [{"school_name": "Example ES"}],
        "capacity",
        source_file="example.csv",
    )

    issue_types = {issue["issue_type"] for issue in issues}
    assert "missing_required_column" in issue_types


def test_utilization_calculation_and_capacity_status() -> None:
    assert validator.calculate_utilization("90", "100") == validator.Decimal("90.0000")
    assert validator.classify_capacity_status("50", "100") == "under_capacity"
    assert validator.classify_capacity_status("90", "100") == "near_capacity"
    assert validator.classify_capacity_status("105", "100") == "over_capacity"
    assert validator.classify_capacity_status("120", "100") == "severely_over_capacity"
    assert validator.classify_capacity_status("", "100") == "not_available"


def test_validation_flags_over_capacity_without_rejecting_row() -> None:
    rows = [
        {
            "school_name": "Example ES",
            "school_name_normalized": "",
            "school_level": "elementary",
            "school_system": "CCS",
            "school_year": "2025",
            "functional_capacity": "100",
            "current_enrollment": "110",
            "available_seats": "-10",
            "utilization_pct": "110",
            "capacity_status": "",
            "source_name": "test",
            "source_url": "",
            "notes": "",
        }
    ]

    standardized, issues = validator.validate_records(rows, "capacity")

    assert standardized[0]["school_name_normalized"] == "example_elementary"
    assert "over_capacity" in {issue["issue_type"] for issue in issues}
    assert any(issue["severity"] == "review" for issue in issues)


def test_missing_values_remain_blank_and_are_not_faked() -> None:
    rows = [
        {
            "school_name": "Example ES",
            "school_name_normalized": "",
            "school_level": "elementary",
            "school_system": "CCS",
            "school_year": "2025",
            "functional_capacity": "",
            "current_enrollment": "",
            "available_seats": "",
            "utilization_pct": "",
            "capacity_status": "",
            "source_name": "test",
            "source_url": "",
            "notes": "",
        }
    ]

    standardized, issues = validator.validate_records(rows, "capacity")

    assert standardized[0]["functional_capacity"] == ""
    assert standardized[0]["current_enrollment"] == ""
    assert "missing_capacity_value" in {issue["issue_type"] for issue in issues}
    assert "missing_enrollment_value" in {issue["issue_type"] for issue in issues}


def test_dry_run_importer_validates_without_database_write(tmp_path: Path) -> None:
    source_file = tmp_path / "capacity.csv"
    source_file.write_text(
        "\n".join(
            [
                "school_name,school_name_normalized,school_level,school_system,school_year,functional_capacity,current_enrollment,available_seats,utilization_pct,capacity_status,source_name,source_url,notes",
                "Example ES,,elementary,CCS,2025,100,90,10,90,near_capacity,test,,",
            ]
        ),
        encoding="utf-8",
    )

    result = subprocess.run(
        [
            sys.executable,
            str(IMPORTER_PATH),
            "--file",
            str(source_file),
            "--dataset",
            "capacity",
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


@pytest.mark.skipif(
    not (os.getenv("POSTGRES_PASSWORD") or os.getenv("CFS_POSTGRES_PASSWORD")),
    reason="PostGIS credentials not configured",
)
def test_current_snapshot_handles_empty_history_safely() -> None:
    engine = create_engine(build_database_url(get_settings()), pool_pre_ping=True)
    snapshot.execute_sql_file(engine)
    history_count = engine.connect().execute(
        text("SELECT COUNT(*) FROM public.school_capacity_history")
    ).scalar_one()
    if history_count != 0:
        pytest.skip("school_capacity_history contains future data; empty-history path not applicable")

    result = snapshot.build_snapshot(engine)

    assert result["history_row_count"] == 0
    assert result["snapshot_rebuilt"] is False
    assert result["snapshot_row_count"] == 0
