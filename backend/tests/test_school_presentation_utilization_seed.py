import importlib.util
import os
import subprocess
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app

ROOT = Path(__file__).resolve().parents[2]
IMPORTER_PATH = (
    ROOT
    / "cfs-data-pipelines"
    / "ingest"
    / "ingest_school_presentation_utilization_seed.py"
)
SEED_FILE = (
    ROOT
    / "data"
    / "schools"
    / "raw"
    / "presentation_utilization_seed_sy2024_2025.csv"
)


def load_module(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


seed_importer = load_module(IMPORTER_PATH, "school_utilization_seed_importer_for_tests")
client = TestClient(app)


def test_seed_csv_parses_expected_rows() -> None:
    rows = seed_importer.read_seed_csv(SEED_FILE)

    assert len(rows) == 37
    assert sum(1 for row in rows if row["school_level"] == "elementary") == 20
    assert sum(1 for row in rows if row["school_level"] == "middle") == 9
    assert sum(1 for row in rows if row["school_level"] == "high") == 8


def test_utilization_class_calculation() -> None:
    assert seed_importer.classify_utilization("79.9") == "under_capacity"
    assert seed_importer.classify_utilization("80") == "approaching_capacity"
    assert seed_importer.classify_utilization("99") == "approaching_capacity"
    assert seed_importer.classify_utilization("99.9") == "approaching_capacity"
    assert seed_importer.classify_utilization("100") == "over_capacity"
    assert seed_importer.classify_utilization("110") == "over_capacity"
    assert seed_importer.classify_utilization("111") == "severely_over_capacity"
    assert seed_importer.classify_utilization("110.1") == "severely_over_capacity"
    assert seed_importer.classify_utilization("119") == "severely_over_capacity"
    assert seed_importer.classify_utilization("120") == "severely_over_capacity"
    assert seed_importer.classify_utilization("125") == "severely_over_capacity"
    assert seed_importer.classify_utilization("133") == "severely_over_capacity"
    assert seed_importer.classify_utilization("152") == "severely_over_capacity"


def test_seed_validation_generates_no_fake_capacity_values() -> None:
    rows = seed_importer.read_seed_csv(SEED_FILE)
    standardized, issues = seed_importer.validate_seed_rows(
        rows,
        source_file=SEED_FILE,
    )

    assert len(standardized) == 37
    assert not any(issue["severity"] == "error" for issue in issues)
    assert all("current_enrollment" not in row for row in standardized)
    assert all("functional_capacity" not in row for row in standardized)
    assert all("available_seats" not in row for row in standardized)
    assert all(row["needs_verification"] is True for row in standardized)
    assert all(row["source_confidence"] == "presentation_derived" for row in standardized)


def test_seed_validation_applies_safe_reference_aliases() -> None:
    rows = seed_importer.read_seed_csv(SEED_FILE)
    target_names = {
        "Pitts School Road Elementary School",
        "Mount Pleasant Elementary School",
        "Mount Pleasant Middle School",
        "Mount Pleasant High School",
        "Royal Oaks School of the Arts",
        "Harris Road Middle School",
    }
    alias_rows = [row for row in rows if row["school_name"] in target_names]
    reference_lookup = {
        ("pitts_road_elementary", "elementary"): "REF-PITTS",
        ("mt_pleasant_elementary", "elementary"): "REF-MPES",
        ("mt_pleasant_middle", "middle"): "REF-MPMS",
        ("mt_pleasant_high", "high"): "REF-MPHS",
        ("royal_oaks_elementary", "elementary"): "REF-ROES",
        ("harris_rd_middle", "middle"): "REF-HRMS",
    }

    standardized, issues = seed_importer.validate_seed_rows(
        alias_rows,
        source_file=SEED_FILE,
        reference_lookup=reference_lookup,
    )

    assert not any(issue["severity"] == "error" for issue in issues)
    assert {row["school_name"] for row in standardized} == target_names
    assert all(row["match_confidence"] == "safe_alias_normalized" for row in standardized)
    assert all(row["matched_school_reference_id"] for row in standardized)


def test_seed_validation_keeps_unmatched_rows_under_review_without_valid_reference() -> None:
    rows = seed_importer.read_seed_csv(SEED_FILE)
    review_names = {
        "W.R. Odell Primary School",
        "Hickory Ridge Elementary School",
        "West Cabarrus High School",
        "J.N. Fries Middle School",
        "Roberta Road Middle School",
    }
    review_rows = [row for row in rows if row["school_name"] in review_names]
    reference_lookup = {
        ("w_r_odell_elementary", "elementary"): "REF-WROES",
        ("hickory_ridge_middle", "middle"): "REF-HRMS",
        ("hickory_ridge_high", "high"): "REF-HRHS",
    }

    standardized, issues = seed_importer.validate_seed_rows(
        review_rows,
        source_file=SEED_FILE,
        reference_lookup=reference_lookup,
    )

    assert {row["school_name"] for row in standardized} == review_names
    assert all(row["matched_school_reference_id"] is None for row in standardized)
    assert all(
        row["match_confidence"] == "unmatched_reference_review" for row in standardized
    )
    assert sum(
        1 for issue in issues if issue["issue_type"] == "unmatched_school_reference"
    ) == len(review_names)


def test_seed_dry_run_does_not_write_rows() -> None:
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


@pytest.mark.skipif(
    not (os.getenv("POSTGRES_PASSWORD") or os.getenv("CFS_POSTGRES_PASSWORD")),
    reason="PostGIS credentials not configured",
)
def test_school_utilization_seed_endpoint_returns_seed_rows() -> None:
    response = client.get("/constraints/schools/utilization-seed", params={"limit": 5})

    assert response.status_code == 200
    payload = response.json()
    assert payload["total_count"] == 37
    assert payload["limit"] == 5
    assert len(payload["rows"]) == 5
    assert all(row["source_confidence"] == "presentation_derived" for row in payload["rows"])
    assert all(row["needs_verification"] is True for row in payload["rows"])


@pytest.mark.skipif(
    not (os.getenv("POSTGRES_PASSWORD") or os.getenv("CFS_POSTGRES_PASSWORD")),
    reason="PostGIS credentials not configured",
)
def test_school_utilization_seed_endpoint_supports_filters() -> None:
    response = client.get(
        "/constraints/schools/utilization-seed",
        params={
            "school_level": "high",
            "utilization_class": "severely_over_capacity",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    names = {row["school_name"] for row in payload["rows"]}
    assert payload["total_count"] == 2
    assert names == {"Cox Mill High School", "Hickory Ridge High School"}


@pytest.mark.skipif(
    not (os.getenv("POSTGRES_PASSWORD") or os.getenv("CFS_POSTGRES_PASSWORD")),
    reason="PostGIS credentials not configured",
)
def test_school_utilization_seed_endpoint_supports_approaching_filter() -> None:
    response = client.get(
        "/constraints/schools/utilization-seed",
        params={"utilization_class": "approaching_capacity", "limit": 20},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["filters_applied"]["utilization_class"] == "approaching_capacity"
    assert payload["total_count"] == 15
    assert all(
        row["utilization_class"] == "approaching_capacity"
        for row in payload["rows"]
    )


@pytest.mark.skipif(
    not (os.getenv("POSTGRES_PASSWORD") or os.getenv("CFS_POSTGRES_PASSWORD")),
    reason="PostGIS credentials not configured",
)
def test_school_utilization_zones_endpoint_returns_lightweight_geometry() -> None:
    response = client.get(
        "/constraints/schools/utilization-zones",
        params={"level": "elementary", "limit": 3},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["filters_applied"]["level"] == "elementary"
    assert payload["limit"] == 3
    assert payload["total_count"] >= 1
    assert len(payload["zones"]) <= 3
    assert payload["zones"]
    assert all(zone["school_level"] == "elementary" for zone in payload["zones"])
    assert all(zone["source_confidence"] == "presentation_derived" for zone in payload["zones"])
    assert all(zone["needs_verification"] is True for zone in payload["zones"])
    assert all(zone["geometry"]["type"] in {"Polygon", "MultiPolygon"} for zone in payload["zones"])


@pytest.mark.skipif(
    not (os.getenv("POSTGRES_PASSWORD") or os.getenv("CFS_POSTGRES_PASSWORD")),
    reason="PostGIS credentials not configured",
)
def test_school_utilization_zones_endpoint_supports_class_filter() -> None:
    response = client.get(
        "/constraints/schools/utilization-zones",
        params={
            "level": "high",
            "utilization_class": "severely_over_capacity",
            "limit": 10,
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["filters_applied"]["level"] == "high"
    assert payload["filters_applied"]["utilization_class"] == "severely_over_capacity"
    assert all(
        zone["utilization_class"] == "severely_over_capacity"
        for zone in payload["zones"]
    )


@pytest.mark.skipif(
    not (os.getenv("POSTGRES_PASSWORD") or os.getenv("CFS_POSTGRES_PASSWORD")),
    reason="PostGIS credentials not configured",
)
def test_parcel_school_utilization_seed_endpoint_returns_presentation_context() -> None:
    response = client.get(
        "/constraints/schools/utilization-seed/CFS-PARCEL-0149726579"
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["official_parcel_id"] == "CFS-PARCEL-0149726579"
    assert payload["source_confidence"] == "presentation_derived"
    assert payload["needs_verification"] is True
    assert payload["school_constraint_score"] is None
    assert payload["school_constraint_class"] == "not_scored"
    assert payload["final_capacity_scoring_enabled"] is False
    assert payload["elementary"]["utilization_seed"]["utilization_pct"] == 95.0
    assert payload["middle"]["utilization_seed"]["utilization_pct"] == 72.0
    assert payload["high"]["utilization_seed"]["utilization_pct"] == 81.0


@pytest.mark.skipif(
    not (os.getenv("POSTGRES_PASSWORD") or os.getenv("CFS_POSTGRES_PASSWORD")),
    reason="PostGIS credentials not configured",
)
def test_school_utilization_seed_routes_are_in_openapi_schema() -> None:
    response = client.get("/openapi.json")

    assert response.status_code == 200
    paths = response.json()["paths"]
    assert "/constraints/schools/utilization-seed" in paths
    assert "/constraints/schools/utilization-seed/{official_parcel_id}" in paths
    assert "/constraints/schools/utilization-zones" in paths
