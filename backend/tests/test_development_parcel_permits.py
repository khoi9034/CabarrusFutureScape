import os

import pytest
from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


pytestmark = pytest.mark.skipif(
    not (os.getenv("POSTGRES_PASSWORD") or os.getenv("CFS_POSTGRES_PASSWORD")),
    reason="Database password environment variable is not configured.",
)


def test_development_parcel_permits_latest_first() -> None:
    response = client.get(
        "/development/parcel/CFS-PARCEL-0149726579/permits",
    )

    assert response.status_code == 200
    body = response.json()
    assert body["official_parcel_id"] == "CFS-PARCEL-0149726579"
    assert body["total_count"] == 286
    assert body["limit"] == 10
    assert body["offset"] == 0
    assert body["sort"] == "latest_first"
    assert len(body["permits"]) == 10
    latest = body["permits"][0]
    assert latest["activity_date"] == "2025-10-22"
    assert latest["activity_year"] == 2025
    assert latest["permit_id"]
    assert latest["relationship_confidence"] == "high"


def test_development_parcel_permits_oldest_first() -> None:
    response = client.get(
        "/development/parcel/CFS-PARCEL-0149726579/permits",
        params={"sort": "oldest_first", "limit": 1},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["sort"] == "oldest_first"
    assert body["permits"][0]["activity_date"] == "2000-08-02"


def test_development_parcel_permits_no_result_behavior() -> None:
    response = client.get("/development/parcel/CFS-PARCEL-NO-SUCH/permits")

    assert response.status_code == 200
    body = response.json()
    assert body["official_parcel_id"] == "CFS-PARCEL-NO-SUCH"
    assert body["total_count"] == 0
    assert body["permits"] == []


def test_development_parcel_permits_limit_clamp() -> None:
    response = client.get(
        "/development/parcel/CFS-PARCEL-0149726579/permits",
        params={"limit": 500},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["limit"] == 50
    assert len(body["permits"]) == 50


def test_development_parcel_permits_invalid_sort() -> None:
    response = client.get(
        "/development/parcel/CFS-PARCEL-0149726579/permits",
        params={"sort": "newest"},
    )

    assert response.status_code == 422
    assert response.json() == {"detail": "sort must be latest_first or oldest_first"}


def test_development_parcel_permits_endpoint_is_in_openapi() -> None:
    response = client.get("/openapi.json")

    assert response.status_code == 200
    assert "/development/parcel/{official_parcel_id}/permits" in response.json()[
        "paths"
    ]
