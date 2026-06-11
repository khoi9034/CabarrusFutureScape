import os

import pytest
from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


pytestmark = pytest.mark.skipif(
    not (os.getenv("POSTGRES_PASSWORD") or os.getenv("CFS_POSTGRES_PASSWORD")),
    reason="Database password environment variable is not configured.",
)


def test_get_valid_parcel_detail() -> None:
    response = client.get("/parcels/CFS-PARCEL-0149726579")

    assert response.status_code == 200
    body = response.json()
    assert body["official_parcel_id"] == "CFS-PARCEL-0149726579"
    assert "pin14" in body
    assert "objectid_1" in body
    assert "location" in body
    assert "valuation" in body
    assert "parcel_context" in body
    assert "zoning" in body
    assert "governance" in body
    assert "planning" in body
    assert "metadata" in body
    assert "map_focus" in body
    assert isinstance(body["governance"]["governance_warning_categories"], list)
    assert body["map_focus"]["geometry_available"] is True
    assert body["map_focus"]["full_geometry_returned"] is False
    assert body["map_focus"]["spatial_reference"] == {"wkid": 4326}
    assert "highlight_geometry" not in body

    centroid = body["map_focus"]["centroid"]
    extent = body["map_focus"]["extent"]
    assert isinstance(centroid["longitude"], int | float)
    assert isinstance(centroid["latitude"], int | float)
    assert isinstance(extent["xmin"], int | float)
    assert isinstance(extent["ymin"], int | float)
    assert isinstance(extent["xmax"], int | float)
    assert isinstance(extent["ymax"], int | float)
    assert extent["xmin"] <= centroid["longitude"] <= extent["xmax"]
    assert extent["ymin"] <= centroid["latitude"] <= extent["ymax"]


def test_get_valid_parcel_detail_with_highlight_geometry() -> None:
    response = client.get(
        "/parcels/CFS-PARCEL-0149726579?include_geometry=true",
    )

    assert response.status_code == 200
    body = response.json()
    assert body["official_parcel_id"] == "CFS-PARCEL-0149726579"
    assert body["map_focus"]["geometry_available"] is True
    assert body["map_focus"]["full_geometry_returned"] is True

    highlight_geometry = body["highlight_geometry"]
    assert highlight_geometry["type"] in {"Polygon", "MultiPolygon"}
    assert isinstance(highlight_geometry["coordinates"], list)
    assert highlight_geometry["spatial_reference"] == {"wkid": 4326}


def test_get_missing_parcel_detail_returns_404() -> None:
    response = client.get("/parcels/CFS-PARCEL-NOT-REAL")

    assert response.status_code == 404
    assert response.json() == {"detail": "Parcel not found"}
