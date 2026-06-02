import os

import pytest
from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


pytestmark = pytest.mark.skipif(
    not (os.getenv("POSTGRES_PASSWORD") or os.getenv("CFS_POSTGRES_PASSWORD")),
    reason="Database password environment variable is not configured.",
)


def test_development_temporal_query_defaults_to_recent_context() -> None:
    response = client.get("/development/temporal-query")

    assert response.status_code == 200
    body = response.json()
    assert body["temporal_context"] == {
        "mode": "default_recent_12_months",
        "year": None,
        "month": None,
        "date_start": "2024-12-31",
        "date_end": "2025-12-31",
        "rolling_window": 12,
        "defaulted_to_recent_window": True,
    }
    assert body["limit"] == 50
    assert body["total_count"] == 3_841
    assert body["summary"]["total_permits"] == 3_664
    assert body["summary"]["active_parcel_count"] == 3_091
    assert body["results"][0]["permit_id"] == "5319989"


def test_development_temporal_query_year_filter() -> None:
    response = client.get("/development/temporal-query", params={"year": 2025})

    assert response.status_code == 200
    body = response.json()
    assert body["filters_applied"] == {"year": 2025}
    assert body["temporal_context"]["mode"] == "year"
    assert body["total_count"] == 3_819
    assert body["summary"]["total_permits"] == 3_642
    assert body["summary"]["date_start"] == "2025-01-02"
    assert body["summary"]["date_end"] == "2025-12-31"


def test_development_temporal_query_month_filter() -> None:
    response = client.get("/development/temporal-query", params={"month": 12})

    assert response.status_code == 200
    body = response.json()
    assert body["filters_applied"] == {"month": 12}
    assert body["temporal_context"]["mode"] == "month"
    assert body["total_count"] == 4_478
    assert body["summary"]["total_permits"] == 4_205


def test_development_temporal_query_date_range_filter() -> None:
    response = client.get(
        "/development/temporal-query",
        params={"date_start": "2025-01-01", "date_end": "2025-12-31"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["filters_applied"] == {
        "date_end": "2025-12-31",
        "date_start": "2025-01-01",
    }
    assert body["temporal_context"]["mode"] == "date_range"
    assert body["summary"]["total_permits"] == 3_642


def test_development_temporal_query_rolling_window_12() -> None:
    response = client.get("/development/temporal-query", params={"rolling_window": 12})

    assert response.status_code == 200
    body = response.json()
    assert body["filters_applied"] == {"rolling_window": 12}
    assert body["temporal_context"]["mode"] == "rolling_window"
    assert body["temporal_context"]["date_start"] == "2024-12-31"
    assert body["temporal_context"]["date_end"] == "2025-12-31"
    assert body["summary"]["total_permits"] == 3_664


def test_development_temporal_query_rolling_window_36() -> None:
    response = client.get("/development/temporal-query", params={"rolling_window": 36})

    assert response.status_code == 200
    body = response.json()
    assert body["filters_applied"] == {"rolling_window": 36}
    assert body["temporal_context"]["date_start"] == "2022-12-31"
    assert body["temporal_context"]["date_end"] == "2025-12-31"
    assert body["summary"]["total_permits"] == 11_854
    assert body["summary"]["active_parcel_count"] == 9_388


def test_development_temporal_query_invalid_rolling_window() -> None:
    response = client.get("/development/temporal-query", params={"rolling_window": 13})

    assert response.status_code == 422
    assert response.json() == {"detail": "rolling_window must be 12 or 36"}


def test_development_temporal_query_invalid_date_range() -> None:
    response = client.get(
        "/development/temporal-query",
        params={"date_start": "2025-12-31", "date_end": "2025-01-01"},
    )

    assert response.status_code == 422
    assert response.json() == {"detail": "date_start must be on or before date_end"}


def test_development_temporal_query_no_result_behavior() -> None:
    response = client.get(
        "/development/temporal-query",
        params={"permit_type": "NO-SUCH-PERMIT"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["total_count"] == 0
    assert body["summary"]["total_permits"] == 0
    assert body["summary"]["active_parcel_count"] == 0
    assert body["results"] == []


def test_development_temporal_query_limit_clamp() -> None:
    response = client.get("/development/temporal-query", params={"limit": 500})

    assert response.status_code == 200
    body = response.json()
    assert body["limit"] == 100
    assert len(body["results"]) == 100


def test_development_temporal_query_bbox_placeholder() -> None:
    response = client.get(
        "/development/temporal-query",
        params={"bbox": "-81,35,-80,36"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["filters_applied"]["bbox"] == "-81,35,-80,36"
    assert body["bbox_support"]["requested"] is True
    assert body["bbox_support"]["active"] is False
    assert "spatial filtering is not active" in body["bbox_support"]["note"]


def test_development_temporal_query_invalid_bbox() -> None:
    response = client.get("/development/temporal-query", params={"bbox": "bad"})

    assert response.status_code == 422
    assert response.json() == {"detail": "bbox must use minx,miny,maxx,maxy format"}


def test_development_temporal_query_endpoint_is_in_openapi() -> None:
    response = client.get("/openapi.json")

    assert response.status_code == 200
    assert "/development/temporal-query" in response.json()["paths"]
