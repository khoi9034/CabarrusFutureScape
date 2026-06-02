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
    assert isinstance(body["governance"]["governance_warning_categories"], list)


def test_get_missing_parcel_detail_returns_404() -> None:
    response = client.get("/parcels/CFS-PARCEL-NOT-REAL")

    assert response.status_code == 404
    assert response.json() == {"detail": "Parcel not found"}
