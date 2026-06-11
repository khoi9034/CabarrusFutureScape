import os

import pytest
from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


pytestmark = pytest.mark.skipif(
    not (os.getenv("POSTGRES_PASSWORD") or os.getenv("CFS_POSTGRES_PASSWORD")),
    reason="Database password environment variable is not configured.",
)


def test_global_development_hotspots() -> None:
    response = client.get("/development/hotspots")

    assert response.status_code == 200
    body = response.json()
    assert body["total_count"] == 43_474
    assert body["sort_by"] == "development_activity_score"
    assert body["limit"] == 20
    assert body["offset"] == 0
    assert body["filters_applied"] == {}
    assert body["results"][0]["official_parcel_id"] == "CFS-PARCEL-0149726579"
    assert body["results"][0]["total_permit_count"] == 286
    assert body["results"][0]["development_activity_class"] == "very_high_activity"
    map_focus = body["results"][0]["map_focus"]
    assert map_focus["geometry_available"] is True
    assert map_focus["full_geometry_returned"] is False
    assert map_focus["spatial_reference"] == {"wkid": 4326}
    assert isinstance(map_focus["centroid"]["longitude"], float)
    assert isinstance(map_focus["centroid"]["latitude"], float)


def test_development_hotspots_activity_class_filter() -> None:
    response = client.get(
        "/development/hotspots",
        params={"activity_class": "very_high_activity"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["filters_applied"] == {"activity_class": "very_high_activity"}
    assert body["total_count"] == 551
    assert all(
        result["development_activity_class"] == "very_high_activity"
        for result in body["results"]
    )


def test_development_hotspots_zoning_jurisdiction_filter() -> None:
    response = client.get(
        "/development/hotspots",
        params={"zoning_jurisdiction": "Concord"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["filters_applied"] == {"zoning_jurisdiction": "Concord"}
    assert body["total_count"] == 19_929
    assert body["results"][0]["zoning_jurisdiction_name"] == "Concord"


def test_development_hotspots_official_parcel_filter() -> None:
    response = client.get(
        "/development/hotspots",
        params={"official_parcel_id": "CFS-PARCEL-0149726579"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["filters_applied"] == {
        "official_parcel_id": "CFS-PARCEL-0149726579",
    }
    assert body["total_count"] == 1
    result = body["results"][0]
    assert result["official_parcel_id"] == "CFS-PARCEL-0149726579"
    assert result["total_permit_count"] == 286
    assert result["first_permit_date"] == "2000-08-02"
    assert result["latest_permit_date"] == "2025-10-22"
    assert result["active_year_count"] == 19


def test_development_hotspots_recent_window_validation() -> None:
    response = client.get("/development/hotspots", params={"recent_window": 2})

    assert response.status_code == 422
    assert response.json() == {"detail": "recent_window must be 1 or 3"}


def test_development_hotspots_recent_window_filter() -> None:
    response = client.get("/development/hotspots", params={"recent_window": 1})

    assert response.status_code == 200
    body = response.json()
    assert body["filters_applied"] == {"recent_window": 1}
    assert body["total_count"] == 3_091
    assert body["results"][0]["recent_permit_count_1yr"] > 0


def test_development_hotspots_month_filter() -> None:
    response = client.get(
        "/development/hotspots",
        params={"year": 2025, "month": 10},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["filters_applied"] == {"month": 10, "year": 2025}
    assert body["total_count"] > 0
    assert body["results"]


def test_development_hotspots_date_range_filter() -> None:
    response = client.get(
        "/development/hotspots",
        params={"date_start": "2025-01-01", "date_end": "2025-12-31"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["filters_applied"] == {
        "date_end": "2025-12-31",
        "date_start": "2025-01-01",
    }
    assert body["total_count"] > 0


def test_development_hotspots_invalid_date_range() -> None:
    response = client.get(
        "/development/hotspots",
        params={"date_start": "2025-12-31", "date_end": "2025-01-01"},
    )

    assert response.status_code == 422
    assert response.json() == {
        "detail": "date_start must be on or before date_end",
    }


def test_development_hotspots_rolling_window_filter() -> None:
    response = client.get("/development/hotspots", params={"rolling_window": 12})

    assert response.status_code == 200
    body = response.json()
    assert body["filters_applied"] == {"rolling_window": 12}
    assert body["total_count"] > 0


def test_development_hotspots_rolling_window_validation() -> None:
    response = client.get("/development/hotspots", params={"rolling_window": 13})

    assert response.status_code == 422
    assert response.json() == {"detail": "rolling_window must be 12 or 36"}


def test_development_hotspots_sort_by_validation() -> None:
    response = client.get("/development/hotspots", params={"sort_by": "bad"})

    assert response.status_code == 422
    assert "sort_by must be one of:" in response.json()["detail"]


def test_development_hotspots_sort_by_total_permit_amount() -> None:
    response = client.get(
        "/development/hotspots",
        params={"sort_by": "total_permit_amount"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["sort_by"] == "total_permit_amount"
    assert body["results"][0]["official_parcel_id"] == "CFS-PARCEL-0149806835"
    assert body["results"][0]["total_permit_amount"] == 1_325_041_388.0


def test_development_hotspots_limit_clamp() -> None:
    response = client.get("/development/hotspots", params={"limit": 500})

    assert response.status_code == 200
    body = response.json()
    assert body["limit"] == 100
    assert len(body["results"]) == 100


def test_development_hotspots_no_result_behavior() -> None:
    response = client.get(
        "/development/hotspots",
        params={"activity_class": "NO-SUCH-ACTIVITY"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["total_count"] == 0
    assert body["results"] == []


def test_development_hotspots_endpoint_is_in_openapi() -> None:
    response = client.get("/openapi.json")

    assert response.status_code == 200
    assert "/development/hotspots" in response.json()["paths"]
