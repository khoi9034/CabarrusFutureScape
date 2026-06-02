import os

import pytest
from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


pytestmark = pytest.mark.skipif(
    not (os.getenv("POSTGRES_PASSWORD") or os.getenv("CFS_POSTGRES_PASSWORD")),
    reason="Database password environment variable is not configured.",
)


def assert_lookup_shape(body: dict, lookup_type: str) -> None:
    assert body["lookup_type"] == lookup_type
    assert body["total_options"] == len(body["options"])
    assert body["total_options"] > 0
    first = body["options"][0]
    assert set(first) == {"count", "label", "value"}
    assert isinstance(first["count"], int)
    assert isinstance(first["label"], str)
    assert isinstance(first["value"], str)


def test_development_permit_types_lookup() -> None:
    response = client.get("/development/permit-types")

    assert response.status_code == 200
    body = response.json()
    assert_lookup_shape(body, "permit_types")
    assert body["total_options"] == 15
    assert body["options"][0] == {
        "value": "NEW CONSTRUCTION",
        "label": "New Construction",
        "count": 28_278,
    }


def test_development_work_types_lookup() -> None:
    response = client.get("/development/work-types")

    assert response.status_code == 200
    body = response.json()
    assert_lookup_shape(body, "work_types")
    assert body["total_options"] == 50
    assert body["options"][0] == {
        "value": "Residential New",
        "label": "Residential New",
        "count": 5_424,
    }


def test_development_jurisdictions_lookup() -> None:
    response = client.get("/development/jurisdictions")

    assert response.status_code == 200
    body = response.json()
    assert_lookup_shape(body, "jurisdictions")
    assert body["total_options"] == 7
    assert body["options"][0] == {
        "value": "Concord",
        "label": "Concord",
        "count": 30_620,
    }


def test_development_activity_classes_lookup() -> None:
    response = client.get("/development/activity-classes")

    assert response.status_code == 200
    body = response.json()
    assert_lookup_shape(body, "activity_classes")
    assert body["total_options"] == 5
    assert body["options"][0] == {
        "value": "no_activity",
        "label": "No Activity",
        "count": 66_543,
    }


def test_development_lookup_endpoints_are_in_openapi() -> None:
    response = client.get("/openapi.json")

    assert response.status_code == 200
    paths = response.json()["paths"]
    assert "/development/permit-types" in paths
    assert "/development/work-types" in paths
    assert "/development/jurisdictions" in paths
    assert "/development/activity-classes" in paths
