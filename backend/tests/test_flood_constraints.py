import os

import pytest
from fastapi.testclient import TestClient

from app.main import app

pytestmark = pytest.mark.skipif(
    not (os.getenv("POSTGRES_PASSWORD") or os.getenv("CFS_POSTGRES_PASSWORD")),
    reason="PostGIS credentials not configured",
)

client = TestClient(app)


def test_flood_statistics_endpoint_returns_global_metrics() -> None:
    response = client.get("/constraints/flood/statistics")

    assert response.status_code == 200
    payload = response.json()
    assert payload["total_parcels"] == 110017
    assert payload["floodway_parcels"] == 3229
    assert payload["sfha_parcels"] == 7254
    assert payload["review_required_parcels"] == 7989
    assert payload["high_severe_buildability_parcels"] == 6362
    assert payload["filters_applied"] == {}
    assert payload["severity_distribution"]
    assert payload["buildability_impact_distribution"]
    assert payload["dominant_zone_distribution"]


def test_flood_detail_endpoint_returns_parcel_flood_record() -> None:
    response = client.get("/constraints/flood/CFS-PARCEL-0149776628")

    assert response.status_code == 200
    payload = response.json()
    assert payload["official_parcel_id"] == "CFS-PARCEL-0149776628"
    assert payload["floodway_present"] is True
    assert payload["sfha_present"] is True
    assert payload["flood_review_required"] is True
    assert payload["buildability_impact"] == "severe"
    assert payload["flood_constraint_score"] == 100.0
    assert payload["overlay_confidence"] is not None


def test_flood_detail_endpoint_returns_404_for_missing_parcel() -> None:
    response = client.get("/constraints/flood/CFS-PARCEL-DOES-NOT-EXIST")

    assert response.status_code == 404
    assert response.json() == {"detail": "Flood constraint record not found"}


def test_flood_filter_endpoint_supports_floodway_filter() -> None:
    response = client.get("/constraints/flood/filter", params={"floodway_present": True, "limit": 5})

    assert response.status_code == 200
    payload = response.json()
    assert payload["limit"] == 5
    assert payload["total_count"] == 3229
    assert len(payload["results"]) == 5
    assert all(result["floodway_present"] is True for result in payload["results"])


def test_flood_high_review_endpoint_orders_review_parcels() -> None:
    response = client.get("/constraints/flood/high-review", params={"limit": 5})

    assert response.status_code == 200
    payload = response.json()
    assert payload["limit"] == 5
    assert payload["total_count"] == 7989
    assert payload["filters_applied"]["flood_review_required"] is True
    assert len(payload["results"]) == 5
    assert all(result["flood_review_required"] is True for result in payload["results"])
    scores = [result["flood_constraint_score"] for result in payload["results"]]
    assert scores == sorted(scores, reverse=True)


def test_flood_summary_endpoint_returns_dashboard_rollup() -> None:
    response = client.get("/constraints/flood/summary")

    assert response.status_code == 200
    payload = response.json()
    assert payload["total_parcels"] == 110017
    assert payload["review_required_parcels"] == 7989
    assert payload["average_percent_constrained"] is not None
    assert payload["max_percent_constrained"] == 100.0
    assert payload["caveats"]


def test_flood_zones_endpoint_returns_fema_polygon_geometry() -> None:
    response = client.get("/constraints/flood/zones", params={"limit": 5})

    assert response.status_code == 200
    payload = response.json()
    assert payload["limit"] == 5
    assert payload["total_count"] == 7712
    assert len(payload["zones"]) == 5
    first_zone = payload["zones"][0]
    assert first_zone["flood_zone_internal_id"]
    assert first_zone["flood_zone_code"]
    assert first_zone["source_layer"] == "FEMA NFHL Layer 28 Flood Hazard Zones"
    assert first_zone["geometry"]["type"] in {"MultiPolygon", "Polygon"}
    assert first_zone["geometry"]["coordinates"]
    assert first_zone["geometry"]["spatial_reference"]["wkid"] == 4326


def test_flood_zones_endpoint_supports_severity_filter() -> None:
    response = client.get(
        "/constraints/flood/zones",
        params={"flood_severity_class": "severe", "limit": 10},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["filters_applied"]["flood_severity_class"] == "severe"
    assert payload["total_count"] == 283
    assert len(payload["zones"]) == 10
    assert all(zone["flood_severity_class"] == "severe" for zone in payload["zones"])


def test_flood_zones_endpoint_supports_extent_filter() -> None:
    response = client.get(
        "/constraints/flood/zones",
        params={
            "extent": "-81,35,-80,36",
            "limit": 10,
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["filters_applied"]["extent"] == "-81.0,35.0,-80.0,36.0"
    assert payload["total_count"] > 0
    assert len(payload["zones"]) == 10


def test_flood_zones_endpoint_rejects_invalid_extent() -> None:
    response = client.get(
        "/constraints/flood/zones",
        params={"extent": "-80,35,-81,36"},
    )

    assert response.status_code == 422
    assert "extent" in response.json()["detail"]


def test_flood_zones_limit_clamps_to_1000() -> None:
    response = client.get("/constraints/flood/zones", params={"limit": 5000})

    assert response.status_code == 200
    payload = response.json()
    assert payload["limit"] == 1000
    assert len(payload["zones"]) == 1000


def test_flood_filter_limit_clamps_to_100() -> None:
    response = client.get("/constraints/flood/filter", params={"limit": 500})

    assert response.status_code == 200
    payload = response.json()
    assert payload["limit"] == 100
    assert len(payload["results"]) == 100


def test_flood_routes_are_in_openapi_schema() -> None:
    response = client.get("/openapi.json")

    assert response.status_code == 200
    paths = response.json()["paths"]
    assert "/constraints/flood/statistics" in paths
    assert "/constraints/flood/{official_parcel_id}" in paths
    assert "/constraints/flood/filter" in paths
    assert "/constraints/flood/high-review" in paths
    assert "/constraints/flood/summary" in paths
    assert "/constraints/flood/zones" in paths
