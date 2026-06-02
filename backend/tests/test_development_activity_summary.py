import os

import pytest
from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


pytestmark = pytest.mark.skipif(
    not (os.getenv("POSTGRES_PASSWORD") or os.getenv("CFS_POSTGRES_PASSWORD")),
    reason="Database password environment variable is not configured.",
)


def test_global_development_activity_summary() -> None:
    response = client.get("/development/activity-summary")

    assert response.status_code == 200
    body = response.json()
    assert body["filters_applied"] == {}
    assert body["total_permits"] == 64_426
    assert body["active_parcel_count"] == 43_474
    assert body["date_range"] == {
        "activity_date_min": "1986-12-01",
        "activity_date_max": "2025-12-31",
    }
    assert body["recent_activity"] == {
        "recent_1yr_parcels": 3_091,
        "recent_3yr_parcels": 9_388,
    }
    assert body["by_permit_type"][0]["value"] == "NEW CONSTRUCTION"
    assert body["by_permit_type"][0]["permit_count"] == 28_278
    assert body["by_year"][-1]["year"] == 2025
    assert body["by_year"][-1]["permit_count"] == 3_642


def test_development_activity_summary_year_filter() -> None:
    response = client.get("/development/activity-summary", params={"year": 2025})

    assert response.status_code == 200
    body = response.json()
    assert body["filters_applied"] == {"year": 2025}
    assert body["total_permits"] == 3_642
    assert body["active_parcel_count"] == 3_074
    assert body["date_range"] == {
        "activity_date_min": "2025-01-02",
        "activity_date_max": "2025-12-31",
    }
    assert body["by_month"][-1] == {
        "year": 2025,
        "month": 12,
        "permit_count": 216,
        "active_parcel_count": 211,
        "total_permit_amount": 26_573_797.84,
    }


def test_development_activity_summary_date_range_filter() -> None:
    response = client.get(
        "/development/activity-summary",
        params={"date_start": "2025-01-01", "date_end": "2025-12-31"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["filters_applied"] == {
        "date_end": "2025-12-31",
        "date_start": "2025-01-01",
    }
    assert body["total_permits"] == 3_642
    assert body["active_parcel_count"] == 3_074


def test_development_activity_summary_permit_type_filter() -> None:
    response = client.get(
        "/development/activity-summary",
        params={"permit_type": "NEW CONSTRUCTION"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["filters_applied"] == {"permit_type": "NEW CONSTRUCTION"}
    assert body["total_permits"] == 28_278
    assert body["active_parcel_count"] == 27_708
    assert body["by_permit_type"] == [
        {
            "value": "NEW CONSTRUCTION",
            "permit_count": 28_278,
            "active_parcel_count": 27_708,
            "total_permit_amount": 3_168_429_134.03,
        },
    ]


def test_development_activity_summary_zoning_jurisdiction_filter() -> None:
    response = client.get(
        "/development/activity-summary",
        params={"zoning_jurisdiction": "Concord"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["filters_applied"] == {"zoning_jurisdiction": "Concord"}
    assert body["total_permits"] == 30_620
    assert body["active_parcel_count"] == 19_929
    assert body["by_zoning_jurisdiction"] == [
        {
            "value": "Concord",
            "permit_count": 30_620,
            "active_parcel_count": 19_929,
            "total_permit_amount": 5_968_845_712.0,
        },
    ]


def test_development_activity_summary_invalid_date_range() -> None:
    response = client.get(
        "/development/activity-summary",
        params={"date_start": "2025-12-31", "date_end": "2025-01-01"},
    )

    assert response.status_code == 422
    assert response.json() == {"detail": "date_start must be on or before date_end"}


def test_development_activity_summary_no_result_behavior() -> None:
    response = client.get(
        "/development/activity-summary",
        params={"permit_type": "NO-SUCH-PERMIT"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["total_permits"] == 0
    assert body["active_parcel_count"] == 0
    assert body["date_range"] == {
        "activity_date_min": None,
        "activity_date_max": None,
    }
    assert body["by_permit_type"] == []
    assert body["by_year"] == []
    assert body["recent_activity"] == {
        "recent_1yr_parcels": 0,
        "recent_3yr_parcels": 0,
    }


def test_development_activity_summary_endpoint_is_in_openapi() -> None:
    response = client.get("/openapi.json")

    assert response.status_code == 200
    assert "/development/activity-summary" in response.json()["paths"]
