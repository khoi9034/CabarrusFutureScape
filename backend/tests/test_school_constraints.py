import os

import pytest
from fastapi.testclient import TestClient

from app.main import app

pytestmark = pytest.mark.skipif(
    not (os.getenv("POSTGRES_PASSWORD") or os.getenv("CFS_POSTGRES_PASSWORD")),
    reason="PostGIS credentials not configured",
)

client = TestClient(app)


def test_school_statistics_endpoint_returns_assignment_metrics() -> None:
    response = client.get("/constraints/schools/statistics")

    assert response.status_code == 200
    payload = response.json()
    assert payload["total_parcels"] == 110017
    assert payload["elementary_assigned_parcels"] == 91161
    assert payload["middle_assigned_parcels"] == 86221
    assert payload["high_assigned_parcels"] == 91161
    assert payload["missing_elementary_assignment_parcels"] == 18856
    assert payload["missing_middle_assignment_parcels"] == 23796
    assert payload["missing_high_assignment_parcels"] == 18856
    assert payload["capacity_data_available_parcels"] == 0
    assert payload["school_constraint_score_non_null_parcels"] == 0
    assert payload["safe_for_api_exposure"] is True
    assert payload["assignment_confidence_distribution"]


def test_school_detail_endpoint_returns_parcel_assignment() -> None:
    response = client.get("/constraints/schools/CFS-PARCEL-0149726579")

    assert response.status_code == 200
    payload = response.json()
    assert payload["official_parcel_id"] == "CFS-PARCEL-0149726579"
    assert payload["elementary"]["school_name"] == "Carl A Furr ES"
    assert payload["middle"]["school_name"] == "Roberta Road MS"
    assert payload["high"]["school_name"] == "Jay M Robinson HS"
    assert payload["school_capacity_data_available"] is False
    assert payload["school_constraint_score"] is None
    assert payload["school_constraint_class"] == "not_scored"
    assert payload["recommended_action"] == "capacity_data_needed"


def test_school_detail_endpoint_returns_missing_assignment_parcel() -> None:
    response = client.get("/constraints/schools/CFS-PARCEL-0149720360")

    assert response.status_code == 200
    payload = response.json()
    assert payload["official_parcel_id"] == "CFS-PARCEL-0149720360"
    assert payload["elementary"]["has_assignment"] is False
    assert payload["middle"]["has_assignment"] is False
    assert payload["high"]["has_assignment"] is False
    assert payload["school_assignment_confidence"] == "low"
    assert payload["school_assignment_review_required"] is True
    assert payload["school_capacity_data_available"] is False
    assert payload["school_constraint_score"] is None
    assert payload["school_constraint_class"] == "not_scored"


def test_school_detail_endpoint_returns_404_for_missing_parcel() -> None:
    response = client.get("/constraints/schools/CFS-PARCEL-DOES-NOT-EXIST")

    assert response.status_code == 404
    assert response.json() == {"detail": "School constraint record not found"}


def test_school_filter_endpoint_supports_review_filter() -> None:
    response = client.get(
        "/constraints/schools/filter",
        params={"school_assignment_review_required": True, "limit": 5},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["limit"] == 5
    assert payload["total_count"] == 75143
    assert len(payload["results"]) == 5
    assert all(
        result["school_assignment_review_required"] is True
        for result in payload["results"]
    )


def test_school_filter_limit_clamps_to_100() -> None:
    response = client.get("/constraints/schools/filter", params={"limit": 500})

    assert response.status_code == 200
    payload = response.json()
    assert payload["limit"] == 100
    assert len(payload["results"]) == 100


def test_school_district_summary_endpoint_returns_level_summary() -> None:
    response = client.get(
        "/constraints/schools/district-summary",
        params={"school_level": "elementary"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["filters_applied"]["school_level"] == "elementary"
    assert payload["total_rows"] == 19
    assert payload["districts"]
    assert all(row["school_level"] == "elementary" for row in payload["districts"])


def test_school_district_summary_rejects_invalid_level() -> None:
    response = client.get(
        "/constraints/schools/district-summary",
        params={"school_level": "preschool"},
    )

    assert response.status_code == 422
    assert "school_level" in response.json()["detail"]


def test_school_qa_summary_endpoint_returns_review_items() -> None:
    response = client.get("/constraints/schools/qa-summary")

    assert response.status_code == 200
    payload = response.json()
    assert payload["school_reference_count"] == 53
    assert payload["included_public_ccs_count"] == 34
    assert payload["parcel_assignment_count"] == 110017
    assert payload["capacity_available"] is False
    assert payload["safe_for_api_exposure"] is True
    names = {issue["school_name"] for issue in payload["unmatched_zone_names"]}
    assert {"Hickory Ridge ES", "West Cabarrus HS", "Roberta Road MS"}.issubset(names)


def test_school_routes_are_in_openapi_schema() -> None:
    response = client.get("/openapi.json")

    assert response.status_code == 200
    paths = response.json()["paths"]
    assert "/constraints/schools/statistics" in paths
    assert "/constraints/schools/{official_parcel_id}" in paths
    assert "/constraints/schools/filter" in paths
    assert "/constraints/schools/district-summary" in paths
    assert "/constraints/schools/qa-summary" in paths


def test_school_static_routes_are_not_captured_by_detail_route() -> None:
    statistics_response = client.get("/constraints/schools/statistics")
    filter_response = client.get("/constraints/schools/filter")

    assert statistics_response.status_code == 200
    assert "total_parcels" in statistics_response.json()
    assert statistics_response.json().get("detail") != "School constraint record not found"

    assert filter_response.status_code == 200
    assert "results" in filter_response.json()
    assert filter_response.json().get("detail") != "School constraint record not found"
