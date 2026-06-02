import os

import pytest
from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


pytestmark = pytest.mark.skipif(
    not (os.getenv("POSTGRES_PASSWORD") or os.getenv("CFS_POSTGRES_PASSWORD")),
    reason="Database password environment variable is not configured.",
)


def test_global_development_trends() -> None:
    response = client.get("/development/trends")

    assert response.status_code == 200
    body = response.json()
    assert body["total_permits"] == 64_426
    assert body["date_range"] == {
        "start_year": 1986,
        "end_year": 2025,
        "activity_date_min": "1986-12-01",
        "activity_date_max": "2025-12-31",
    }
    assert body["trend_direction"] == "down"
    assert body["peak_year"] == 2021
    assert body["peak_month"] == "2021-03"
    assert body["annual_trends"][-1]["year"] == 2025
    assert body["annual_trends"][-1]["permit_count"] == 3_642
    assert body["monthly_trends"][-1]["year"] == 2025
    assert body["monthly_trends"][-1]["month"] == 12


def test_development_trends_year_range_filter() -> None:
    response = client.get(
        "/development/trends",
        params={"start_year": 2020, "end_year": 2025},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["filters_applied"] == {"end_year": 2025, "start_year": 2020}
    assert body["total_permits"] == 24_181
    assert len(body["annual_trends"]) == 6
    assert body["annual_trends"][0]["year"] == 2020
    assert body["annual_trends"][-1]["year"] == 2025


def test_development_trends_zoning_jurisdiction_filter() -> None:
    response = client.get(
        "/development/trends",
        params={"zoning_jurisdiction": "Concord"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["filters_applied"] == {"zoning_jurisdiction": "Concord"}
    assert body["total_permits"] == 30_620
    assert body["annual_trends"][-1]["permit_count"] == 1_709


def test_development_trends_permit_type_filter() -> None:
    response = client.get(
        "/development/trends",
        params={"permit_type": "NEW CONSTRUCTION"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["filters_applied"] == {"permit_type": "NEW CONSTRUCTION"}
    assert body["total_permits"] == 28_278
    assert body["annual_trends"][-1]["permit_count"] == 1_247


def test_development_trends_group_by_year() -> None:
    response = client.get("/development/trends", params={"group_by": "year"})

    assert response.status_code == 200
    body = response.json()
    assert body["group_by"] == "year"
    assert body["grouped_trends"][0]["year"] == 1986
    assert body["grouped_trends"][-1]["year"] == 2025


def test_development_trends_group_by_month() -> None:
    response = client.get("/development/trends", params={"group_by": "month"})

    assert response.status_code == 200
    body = response.json()
    assert body["group_by"] == "month"
    assert body["grouped_trends"][0]["month"] == 1
    assert body["grouped_trends"][0]["permit_count"] == 4_321


def test_development_trends_group_by_zoning_jurisdiction() -> None:
    response = client.get(
        "/development/trends",
        params={"group_by": "zoning_jurisdiction"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["group_by"] == "zoning_jurisdiction"
    assert body["grouped_trends"][0]["zoning_jurisdiction_name"] == "Concord"
    assert body["grouped_trends"][0]["permit_count"] == 30_620


def test_development_trends_rolling_window() -> None:
    response = client.get("/development/trends", params={"rolling_window": 36})

    assert response.status_code == 200
    body = response.json()
    assert body["rolling_window"] == 36
    assert body["rolling_summary"] == {
        "window_months": 36,
        "start_date": "2022-12-31",
        "end_date": "2025-12-31",
        "permit_count": 11_854,
        "parcel_count": 9_388,
        "total_permit_amount": 4285223589.77,
    }


def test_development_trends_invalid_rolling_window_returns_422() -> None:
    response = client.get("/development/trends", params={"rolling_window": 13})

    assert response.status_code == 422
    assert response.json() == {"detail": "rolling_window must be 12 or 36"}


def test_development_trends_invalid_group_by_returns_422() -> None:
    response = client.get("/development/trends", params={"group_by": "bad"})

    assert response.status_code == 422
    assert "group_by must be one of:" in response.json()["detail"]


def test_development_trends_no_result_behavior() -> None:
    response = client.get(
        "/development/trends",
        params={"permit_type": "NO-SUCH-PERMIT"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["total_permits"] == 0
    assert body["annual_trends"] == []
    assert body["monthly_trends"] == []
    assert body["grouped_trends"] == []
    assert body["rolling_summary"] is None


def test_development_trends_endpoint_is_in_openapi() -> None:
    response = client.get("/openapi.json")

    assert response.status_code == 200
    assert "/development/trends" in response.json()["paths"]
