import os

import pytest
from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


pytestmark = pytest.mark.skipif(
    not (os.getenv("POSTGRES_PASSWORD") or os.getenv("CFS_POSTGRES_PASSWORD")),
    reason="Database password environment variable is not configured.",
)


def test_global_development_statistics() -> None:
    response = client.get("/development/statistics")

    assert response.status_code == 200
    body = response.json()
    assert body["total_permits"] == 64_426
    assert body["parcels_with_activity"] == 43_474
    assert body["parcels_without_activity"] == 66_543
    assert body["recent_activity_parcels_1yr"] == 3_091
    assert body["recent_activity_parcels_3yr"] == 9_388
    assert body["activity_date_min"] == "1986-12-01"
    assert body["activity_date_max"] == "2025-12-31"
    assert body["activity_classes"] == {
        "no_activity": 66_543,
        "low_activity": 13_068,
        "moderate_activity": 27_425,
        "high_activity": 2_430,
        "very_high_activity": 551,
    }
    assert body["by_permit_type"][0] == {
        "value": "NEW CONSTRUCTION",
        "count": 28_278,
    }
    assert any(
        bucket["value"] == "Concord" for bucket in body["by_zoning_jurisdiction"]
    )
    assert body["filters_applied"] == {}


def test_development_statistics_year_filter() -> None:
    response = client.get("/development/statistics", params={"year": 2025})

    assert response.status_code == 200
    body = response.json()
    assert body["filters_applied"] == {"year": 2025}
    assert body["total_permits"] == 3_642
    assert body["parcels_with_activity"] == 3_074
    assert body["activity_date_min"] == "2025-01-02"
    assert body["activity_date_max"] == "2025-12-31"
    assert body["by_permit_type"][0] == {
        "value": "NEW CONSTRUCTION",
        "count": 1_247,
    }


def test_development_statistics_permit_type_filter() -> None:
    response = client.get(
        "/development/statistics",
        params={"permit_type": "NEW CONSTRUCTION"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["filters_applied"] == {"permit_type": "NEW CONSTRUCTION"}
    assert body["total_permits"] == 28_278
    assert body["parcels_with_activity"] == 27_708
    assert body["by_permit_type"] == [
        {
            "value": "NEW CONSTRUCTION",
            "count": 28_278,
        },
    ]


def test_development_statistics_zoning_jurisdiction_filter() -> None:
    response = client.get(
        "/development/statistics",
        params={"zoning_jurisdiction": "Concord"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["filters_applied"] == {"zoning_jurisdiction": "Concord"}
    assert body["total_permits"] == 30_620
    assert body["parcels_with_activity"] == 19_929
    assert body["parcels_without_activity"] == 23_568
    assert body["by_zoning_jurisdiction"] == [
        {
            "value": "Concord",
            "count": 30_620,
        },
    ]


def test_development_statistics_no_result_filter_returns_zero_counts() -> None:
    response = client.get(
        "/development/statistics",
        params={"permit_type": "NO-SUCH-PERMIT"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["total_permits"] == 0
    assert body["parcels_with_activity"] == 0
    assert body["parcels_without_activity"] == 0
    assert body["activity_classes"] == {
        "no_activity": 0,
        "low_activity": 0,
        "moderate_activity": 0,
        "high_activity": 0,
        "very_high_activity": 0,
    }
    assert body["by_permit_type"] == []
    assert body["by_zoning_jurisdiction"] == []


def test_development_statistics_endpoint_is_in_openapi() -> None:
    response = client.get("/openapi.json")

    assert response.status_code == 200
    assert "/development/statistics" in response.json()["paths"]
