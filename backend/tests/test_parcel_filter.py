import os

import pytest
from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


pytestmark = pytest.mark.skipif(
    not (os.getenv("POSTGRES_PASSWORD") or os.getenv("CFS_POSTGRES_PASSWORD")),
    reason="Database password environment variable is not configured.",
)


def test_filter_by_zoning_jurisdiction() -> None:
    response = client.get(
        "/parcels/filter",
        params={"zoning_jurisdiction": "Concord", "limit": 5},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["total_count"] >= 1
    assert body["filters_applied"]["zoning_jurisdiction"] == "Concord"
    assert all(
        result["zoning_jurisdiction_name"] == "Concord"
        for result in body["results"]
    )


def test_filter_by_zoning_category() -> None:
    response = client.get(
        "/parcels/filter",
        params={"zoning_category": "residential", "limit": 5},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["total_count"] >= 1
    assert all(
        result["dominant_zoning_general_normalized"] == "residential"
        for result in body["results"]
    )


def test_filter_by_parcel_quality_status() -> None:
    response = client.get(
        "/parcels/filter",
        params={"parcel_quality_status": "trusted", "limit": 5},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["total_count"] >= 1
    assert all(
        result["parcel_quality_status"] == "trusted"
        for result in body["results"]
    )


def test_filter_by_zoning_confidence() -> None:
    response = client.get(
        "/parcels/filter",
        params={"zoning_confidence": "high", "limit": 5},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["total_count"] >= 1
    assert all(
        result["zoning_assignment_confidence"] == "high"
        for result in body["results"]
    )


def test_filter_by_valuation_band() -> None:
    response = client.get(
        "/parcels/filter",
        params={"valuation_band": "medium", "limit": 5},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["total_count"] >= 1
    assert all(result["valuation_band"] == "medium" for result in body["results"])


def test_filter_by_safe_for_dashboard() -> None:
    response = client.get(
        "/parcels/filter",
        params={"safe_for_dashboard": "true", "limit": 5},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["total_count"] >= 1
    assert body["filters_applied"]["safe_for_dashboard"] is True
    assert all(result["safe_for_dashboard"] is True for result in body["results"])


def test_filter_by_neighborhood_partial_match() -> None:
    response = client.get(
        "/parcels/filter",
        params={"neighborhood": "CONCORD MILLS", "limit": 5},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["total_count"] >= 1
    assert all("CONCORD MILLS" in result["neighborhood"] for result in body["results"])


def test_filter_by_governance_warning() -> None:
    response = client.get(
        "/parcels/filter",
        params={"governance_warning": "review_low_confidence", "limit": 5},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["total_count"] >= 1
    assert all(
        "review_low_confidence" in result["governance_warning_categories"]
        for result in body["results"]
    )


def test_filter_without_filters_returns_first_page() -> None:
    response = client.get("/parcels/filter", params={"limit": 3})

    assert response.status_code == 200
    body = response.json()
    assert body["filters_applied"] == {}
    assert body["total_count"] >= 110_000
    assert len(body["results"]) == 3
    assert body["results"] == sorted(
        body["results"],
        key=lambda result: result["official_parcel_id"],
    )


def test_filter_no_results_returns_empty_list() -> None:
    response = client.get(
        "/parcels/filter",
        params={"zoning_jurisdiction": "NO-SUCH-JURISDICTION"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["total_count"] == 0
    assert body["results"] == []


def test_filter_limit_is_clamped_to_max() -> None:
    response = client.get("/parcels/filter", params={"limit": 999})

    assert response.status_code == 200
    body = response.json()
    assert body["limit"] == 100
    assert len(body["results"]) == 100
