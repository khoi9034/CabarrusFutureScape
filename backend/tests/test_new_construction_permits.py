import importlib.util
import os
import sys
from datetime import date
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)

REPO_ROOT = Path(__file__).resolve().parents[2]
INGEST_SCRIPT = (
    REPO_ROOT
    / "cfs-data-pipelines"
    / "ingest"
    / "ingest_new_construction_permits.py"
)
spec = importlib.util.spec_from_file_location(
    "ingest_new_construction_permits",
    INGEST_SCRIPT,
)
assert spec and spec.loader
new_construction = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = new_construction
spec.loader.exec_module(new_construction)

db_required = pytest.mark.skipif(
    not (os.getenv("POSTGRES_PASSWORD") or os.getenv("CFS_POSTGRES_PASSWORD")),
    reason="Database password environment variable is not configured.",
)


def test_new_construction_permit_type_classification() -> None:
    assert (
        new_construction.classify_permit_type("Building Residential New")
        == "residential_new_construction"
    )
    assert (
        new_construction.classify_permit_type("Building Commercial New")
        == "commercial_new_construction"
    )
    assert new_construction.classify_permit_type("Solar") == "review_required"


def test_new_construction_date_and_status_logic() -> None:
    permit_date = new_construction.parse_date_value("2024-01-15 00:00:00")
    co_date = new_construction.parse_date_value("2024-03-01 00:00:00")

    assert permit_date == date(2024, 1, 15)
    assert co_date == date(2024, 3, 1)
    assert new_construction.parse_date_value("") is None
    assert (
        new_construction.classify_construction_status(True, None, permit_date)
        == "completed"
    )
    assert (
        new_construction.classify_construction_status(False, None, permit_date)
        == "permitted_not_completed"
    )
    assert (
        new_construction.classify_construction_status(False, co_date, permit_date)
        == "review_required"
    )
    assert new_construction.calculate_days_to_co(permit_date, co_date) == 46


def test_new_construction_parcel_normalization_and_placeholder_detection() -> None:
    assert new_construction.normalize_parcel_number(" 560-047-8977-0000 ") == "56004789770000"
    assert not new_construction.is_placeholder_parcel_number("56004789770000")
    assert new_construction.is_placeholder_parcel_number("")
    assert new_construction.is_placeholder_parcel_number("00000000000000")
    assert new_construction.is_placeholder_parcel_number("123456")


def test_new_construction_label_window_has_no_feature_leakage() -> None:
    window = new_construction.label_window_for_snapshot(2020)

    assert window.future_start == date(2021, 1, 1)
    assert window.next_1yr_end == date(2021, 12, 31)
    assert window.next_3yr_end == date(2023, 12, 31)


@db_required
def test_new_construction_statistics_endpoint() -> None:
    response = client.get("/development/new-construction/statistics")

    assert response.status_code == 200
    body = response.json()
    assert body["total_permits"] == 20614
    assert body["date_range"]["permit_date_min"] == "2015-01-05"
    assert body["date_range"]["permit_date_max"] == "2026-06-11"
    assert body["prediction_model_active"] is False
    assert body["prediction_probability_available"] is False
    assert body["matched_permit_count"] == 17021


@db_required
def test_new_construction_trends_endpoint() -> None:
    response = client.get("/development/new-construction/trends")

    assert response.status_code == 200
    body = response.json()
    assert body["annual_trends"]
    assert body["monthly_trends"]
    assert body["prediction_model_active"] is False


@db_required
def test_new_construction_parcel_summary_endpoint() -> None:
    response = client.get(
        "/development/new-construction/parcel/CFS-PARCEL-0149782119",
    )

    assert response.status_code == 200
    body = response.json()
    assert body["official_parcel_id"] == "CFS-PARCEL-0149782119"
    assert body["total_new_construction_permits"] == 87
    assert body["development_stage"] == "repeated_activity"
    assert body["prediction_model_active"] is False


@db_required
def test_new_construction_parcel_summary_no_match_behavior() -> None:
    response = client.get(
        "/development/new-construction/parcel/CFS-PARCEL-NO-SUCH",
    )

    assert response.status_code == 200
    body = response.json()
    assert body["official_parcel_id"] == "CFS-PARCEL-NO-SUCH"
    assert body["total_new_construction_permits"] == 0
    assert body["development_stage"] == "no_matched_new_construction_activity"


@db_required
def test_new_construction_labels_summary_endpoint() -> None:
    response = client.get("/development/new-construction/labels/summary")

    assert response.status_code == 200
    body = response.json()
    assert body["label_table_row_count"] == 1430221
    assert body["labels_are_targets_only"] is True
    assert body["prediction_model_active"] is False
    assert body["prediction_probability_available"] is False
    assert body["positive_rate_by_snapshot_year"]


def test_new_construction_endpoints_are_in_openapi() -> None:
    response = client.get("/openapi.json")

    assert response.status_code == 200
    paths = response.json()["paths"]
    assert "/development/new-construction/statistics" in paths
    assert "/development/new-construction/trends" in paths
    assert "/development/new-construction/parcel/{official_parcel_id}" in paths
    assert "/development/new-construction/labels/summary" in paths
