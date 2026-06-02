import os

import pytest
from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


pytestmark = pytest.mark.skipif(
    not (os.getenv("POSTGRES_PASSWORD") or os.getenv("CFS_POSTGRES_PASSWORD")),
    reason="Database password environment variable is not configured.",
)


def test_global_governance_warnings_default_to_review_scope() -> None:
    response = client.get("/parcels/governance-warnings")

    assert response.status_code == 200
    body = response.json()
    assert body["filters_applied"]["default_scope"] == "governance_review"
    assert body["total_count"] == 35_236
    assert body["limit"] == 20
    assert len(body["results"]) == 20
    assert all(result["safe_for_dashboard"] is False for result in body["results"])
    assert body["warning_summary"][0] == {
        "warning_category": "jurisdiction_code_semantics_review",
        "parcel_count": 23_793,
        "percentage": 67.5247,
    }


def test_governance_warnings_filter_by_warning_category() -> None:
    response = client.get(
        "/parcels/governance-warnings",
        params={"warning_category": "review_low_confidence"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["filters_applied"]["warning_category"] == "review_low_confidence"
    assert body["total_count"] == 831
    assert body["warning_summary"][0] == {
        "warning_category": "review_low_confidence",
        "parcel_count": 831,
        "percentage": 100.0,
    }
    assert all(
        "review_low_confidence" in result["governance_warning_categories"]
        for result in body["results"]
    )


def test_governance_warnings_filter_by_zoning_jurisdiction() -> None:
    response = client.get(
        "/parcels/governance-warnings",
        params={"zoning_jurisdiction": "Concord"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["total_count"] == 22_743
    assert body["filters_applied"]["zoning_jurisdiction"] == "Concord"
    assert body["filters_applied"]["default_scope"] == "governance_review"
    assert all(
        result["zoning_jurisdiction_name"] == "Concord"
        for result in body["results"]
    )
    assert all(result["safe_for_dashboard"] is False for result in body["results"])


def test_governance_warnings_filter_by_safe_for_dashboard() -> None:
    response = client.get(
        "/parcels/governance-warnings",
        params={"safe_for_dashboard": "true"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["filters_applied"] == {"safe_for_dashboard": True}
    assert body["total_count"] == 74_781
    assert body["warning_summary"] == [
        {
            "warning_category": "safe_for_dashboard",
            "parcel_count": 74_781,
            "percentage": 100.0,
        },
    ]
    assert all(result["safe_for_dashboard"] is True for result in body["results"])


def test_governance_warnings_no_result_behavior() -> None:
    response = client.get(
        "/parcels/governance-warnings",
        params={"warning_category": "NO_SUCH_WARNING"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["total_count"] == 0
    assert body["warning_summary"] == []
    assert body["results"] == []


def test_governance_warnings_limit_is_clamped_to_max() -> None:
    response = client.get("/parcels/governance-warnings", params={"limit": 999})

    assert response.status_code == 200
    body = response.json()
    assert body["limit"] == 100
    assert len(body["results"]) == 100


def test_governance_warnings_endpoint_is_in_openapi() -> None:
    response = client.get("/openapi.json")

    assert response.status_code == 200
    assert "/parcels/governance-warnings" in response.json()["paths"]
