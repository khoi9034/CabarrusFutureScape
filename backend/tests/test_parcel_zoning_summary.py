import os

import pytest
from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


pytestmark = pytest.mark.skipif(
    not (os.getenv("POSTGRES_PASSWORD") or os.getenv("CFS_POSTGRES_PASSWORD")),
    reason="Database password environment variable is not configured.",
)


def test_global_zoning_summary() -> None:
    response = client.get("/parcels/zoning-summary")

    assert response.status_code == 200
    body = response.json()
    assert body["total_parcels"] == 110_017
    assert body["zoned_parcels"] == 109_984
    assert body["no_match_parcels"] == 33
    assert body["multi_jurisdiction_count"] == 4_441
    assert any(
        item["zoning_jurisdiction_name"] == "Concord"
        for item in body["jurisdiction_summary"]
    )
    assert any(
        item["zoning_category"] == "residential"
        for item in body["zoning_category_summary"]
    )
    assert any(item["confidence"] == "high" for item in body["confidence_summary"])
    assert body["filters_applied"] == {}


def test_zoning_summary_filter_by_jurisdiction() -> None:
    response = client.get(
        "/parcels/zoning-summary",
        params={"zoning_jurisdiction": "Concord"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["total_parcels"] == 43_497
    assert body["filters_applied"]["zoning_jurisdiction"] == "Concord"
    assert body["jurisdiction_summary"] == [
        {
            "zoning_jurisdiction_name": "Concord",
            "parcel_count": 43_497,
            "percentage": 100.0,
            "high_confidence_count": 43_066,
            "review_count": 22_743,
            "safe_for_dashboard_count": 20_754,
        },
    ]
    assert all(
        item["zoning_jurisdiction_name"] == "Concord"
        for item in body["zoning_code_summary"]
    )


def test_zoning_summary_filter_by_category() -> None:
    response = client.get(
        "/parcels/zoning-summary",
        params={"zoning_category": "residential"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["total_parcels"] == 70_640
    assert body["filters_applied"]["zoning_category"] == "residential"
    assert body["zoning_category_summary"] == [
        {
            "zoning_category": "residential",
            "parcel_count": 70_640,
            "percentage": 100.0,
        },
    ]


def test_zoning_summary_filter_by_zoning_code() -> None:
    response = client.get(
        "/parcels/zoning-summary",
        params={"zoning_code": "RV"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["total_parcels"] == 6_237
    assert body["filters_applied"]["zoning_code"] == "RV"
    assert body["zoning_code_summary"] == [
        {
            "zoning_jurisdiction_name": "Concord",
            "zoning_code": "RV",
            "zoning_category": "residential",
            "parcel_count": 6_237,
            "percentage": 100.0,
            "review_count": 1_016,
        },
    ]


def test_zoning_summary_no_result_filter_returns_zero_counts() -> None:
    response = client.get(
        "/parcels/zoning-summary",
        params={"zoning_code": "NO-SUCH-CODE"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["total_parcels"] == 0
    assert body["zoned_parcels"] == 0
    assert body["no_match_parcels"] == 0
    assert body["jurisdiction_summary"] == []
    assert body["zoning_code_summary"] == []
    assert body["governance_warning_summary"] == []


def test_zoning_summary_endpoint_is_in_openapi() -> None:
    response = client.get("/openapi.json")

    assert response.status_code == 200
    assert "/parcels/zoning-summary" in response.json()["paths"]
