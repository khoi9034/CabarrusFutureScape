import os

import pytest
from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


pytestmark = pytest.mark.skipif(
    not (os.getenv("POSTGRES_PASSWORD") or os.getenv("CFS_POSTGRES_PASSWORD")),
    reason="Database password environment variable is not configured.",
)


def test_global_development_zoning_summary() -> None:
    response = client.get("/development/zoning-summary")

    assert response.status_code == 200
    body = response.json()
    assert body["total_count"] == 3_090
    assert body["limit"] == 50
    assert body["offset"] == 0
    assert body["filters_applied"] == {}
    assert body["summary"][0]["zoning_jurisdiction_name"] == "Concord"
    assert body["summary"][0]["dominant_zoning_code_raw"] == "PUD"
    assert body["summary"][0]["permit_type"] == "NEW CONSTRUCTION"
    assert body["summary"][0]["permit_count"] == 1_630
    assert body["summary"][0]["active_parcel_count"] == 1_601


def test_development_zoning_summary_jurisdiction_filter() -> None:
    response = client.get(
        "/development/zoning-summary",
        params={"zoning_jurisdiction": "Concord"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["filters_applied"] == {"zoning_jurisdiction": "Concord"}
    assert body["total_count"] == 1_101
    assert body["summary"][0]["zoning_jurisdiction_name"] == "Concord"


def test_development_zoning_summary_category_filter() -> None:
    response = client.get(
        "/development/zoning-summary",
        params={"zoning_category": "residential"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["filters_applied"] == {"zoning_category": "residential"}
    assert body["total_count"] == 1_237
    assert all(
        row["dominant_zoning_general_normalized"] == "residential"
        for row in body["summary"]
    )


def test_development_zoning_summary_permit_type_filter() -> None:
    response = client.get(
        "/development/zoning-summary",
        params={"permit_type": "NEW CONSTRUCTION"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["filters_applied"] == {"permit_type": "NEW CONSTRUCTION"}
    assert body["total_count"] == 400
    assert all(row["permit_type"] == "NEW CONSTRUCTION" for row in body["summary"])


def test_development_zoning_summary_year_filter_includes_activity_year() -> None:
    response = client.get("/development/zoning-summary", params={"year": 2025})

    assert response.status_code == 200
    body = response.json()
    assert body["filters_applied"] == {"year": 2025}
    assert body["summary"][0]["activity_year"] == 2025
    assert body["summary"][0]["activity_month"] is None


def test_development_zoning_summary_month_filter_includes_activity_month() -> None:
    response = client.get("/development/zoning-summary", params={"month": 12})

    assert response.status_code == 200
    body = response.json()
    assert body["filters_applied"] == {"month": 12}
    assert body["summary"][0]["activity_year"] is None
    assert body["summary"][0]["activity_month"] == 12


def test_development_zoning_summary_no_result_behavior() -> None:
    response = client.get(
        "/development/zoning-summary",
        params={"permit_type": "NO-SUCH-PERMIT"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["total_count"] == 0
    assert body["summary"] == []


def test_development_zoning_summary_limit_clamp() -> None:
    response = client.get("/development/zoning-summary", params={"limit": 500})

    assert response.status_code == 200
    body = response.json()
    assert body["limit"] == 100
    assert len(body["summary"]) == 100


def test_development_zoning_summary_endpoint_is_in_openapi() -> None:
    response = client.get("/openapi.json")

    assert response.status_code == 200
    assert "/development/zoning-summary" in response.json()["paths"]
