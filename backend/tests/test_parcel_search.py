import os

import pytest
from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


pytestmark = pytest.mark.skipif(
    not (os.getenv("POSTGRES_PASSWORD") or os.getenv("CFS_POSTGRES_PASSWORD")),
    reason="Database password environment variable is not configured.",
)


def test_search_by_pin() -> None:
    response = client.get("/parcels/search", params={"q": "45896367300000"})

    assert response.status_code == 200
    body = response.json()
    assert body["query"] == "45896367300000"
    assert body["total_count"] >= 1
    assert body["results"][0]["official_parcel_id"] == "CFS-PARCEL-0149726579"
    assert body["results"][0]["pin14"] == "45896367300000"


def test_search_by_official_parcel_id() -> None:
    response = client.get(
        "/parcels/search",
        params={"q": "CFS-PARCEL-0149726579"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["total_count"] >= 1
    assert body["results"][0]["official_parcel_id"] == "CFS-PARCEL-0149726579"


def test_search_by_neighborhood() -> None:
    response = client.get(
        "/parcels/search",
        params={"q": "CONCORD MILLS", "limit": 5},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["total_count"] >= 1
    assert len(body["results"]) <= 5
    assert any(result["neighborhood"] == "CONCORD MILLS" for result in body["results"])


def test_search_with_zoning_jurisdiction_filter() -> None:
    response = client.get(
        "/parcels/search",
        params={
            "q": "CONCORD MILLS",
            "zoning_jurisdiction": "Concord",
            "limit": 10,
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["total_count"] >= 1
    assert all(
        result["zoning_jurisdiction_name"] == "Concord"
        for result in body["results"]
    )


def test_search_no_results_returns_empty_list() -> None:
    response = client.get(
        "/parcels/search",
        params={"q": "NO-SUCH-CFS-PARCEL-SEARCH-VALUE"},
    )

    assert response.status_code == 200
    assert response.json()["total_count"] == 0
    assert response.json()["results"] == []


def test_search_limit_is_clamped_to_max() -> None:
    response = client.get(
        "/parcels/search",
        params={"q": "Concord", "limit": 999},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["limit"] == 100
    assert len(body["results"]) <= 100


def test_blank_search_returns_422() -> None:
    response = client.get("/parcels/search", params={"q": "   "})

    assert response.status_code == 422
    assert response.json() == {"detail": "q must not be blank"}
