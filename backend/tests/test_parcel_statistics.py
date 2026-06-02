import os

import pytest
from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


pytestmark = pytest.mark.skipif(
    not (os.getenv("POSTGRES_PASSWORD") or os.getenv("CFS_POSTGRES_PASSWORD")),
    reason="Database password environment variable is not configured.",
)


def test_global_statistics() -> None:
    response = client.get("/parcels/statistics")

    assert response.status_code == 200
    body = response.json()
    assert body["total_parcels"] == 110_017
    assert body["zoned_parcels"] == 109_984
    assert body["no_match_parcels"] == 33
    assert body["safe_for_dashboard_parcels"] + body["review_parcels"] == 110_017
    assert body["high_confidence_parcels"] >= body["low_confidence_parcels"]
    assert any(
        bucket["value"] == "Concord" for bucket in body["by_zoning_jurisdiction"]
    )
    assert body["filters_applied"] == {}


def test_statistics_filtered_by_zoning_jurisdiction() -> None:
    response = client.get(
        "/parcels/statistics",
        params={"zoning_jurisdiction": "Concord"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["total_parcels"] >= 1
    assert body["filters_applied"]["zoning_jurisdiction"] == "Concord"
    assert body["by_zoning_jurisdiction"] == [
        {"value": "Concord", "count": body["total_parcels"]},
    ]


def test_statistics_filtered_by_safe_for_dashboard() -> None:
    response = client.get(
        "/parcels/statistics",
        params={"safe_for_dashboard": "true"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["total_parcels"] >= 1
    assert body["filters_applied"]["safe_for_dashboard"] is True
    assert body["safe_for_dashboard_parcels"] == body["total_parcels"]
    assert body["review_parcels"] == 0


def test_statistics_no_result_filter_returns_zero_counts() -> None:
    response = client.get(
        "/parcels/statistics",
        params={"zoning_jurisdiction": "NO-SUCH-JURISDICTION"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["total_parcels"] == 0
    assert body["zoned_parcels"] == 0
    assert body["no_match_parcels"] == 0
    assert body["by_zoning_jurisdiction"] == []
    assert body["by_governance_warning"] == []


def test_statistics_endpoint_is_in_openapi() -> None:
    response = client.get("/openapi.json")

    assert response.status_code == 200
    assert "/parcels/statistics" in response.json()["paths"]
