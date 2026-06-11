import os

import pytest
from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


pytestmark = pytest.mark.skipif(
    not (os.getenv("POSTGRES_PASSWORD") or os.getenv("CFS_POSTGRES_PASSWORD")),
    reason="Database password environment variable is not configured.",
)


def test_permit_segment_statistics() -> None:
    response = client.get("/development/permit-segments/statistics")

    assert response.status_code == 200
    body = response.json()
    assert body["total_permits"] == 64_426
    assert body["by_permit_segment"]
    assert body["by_permit_growth_signal"]
    assert body["by_permit_status_stage"]
    assert body["by_permit_value_class"]
    assert body["by_development_domain"]


def test_selected_parcel_permit_segment_summary() -> None:
    response = client.get(
        "/development/permit-segments/CFS-PARCEL-0149726579",
    )

    assert response.status_code == 200
    body = response.json()
    assert body["official_parcel_id"] == "CFS-PARCEL-0149726579"
    assert body["pin14"] == "45896367300000"
    assert body["total_permits"] == 286
    assert body["dominant_permit_segment"]
    assert body["dominant_growth_signal"]
    assert "active_construction_permits" in body
    assert "redevelopment_signal_permits" in body
    assert "permit_signal_score_avg" in body


def test_selected_parcel_permit_segment_summary_missing() -> None:
    response = client.get(
        "/development/permit-segments/CFS-PARCEL-NO-SUCH",
    )

    assert response.status_code == 404
    assert response.json() == {"detail": "Permit segment summary not found"}


def test_permit_segment_options() -> None:
    response = client.get("/development/permit-segments/options")

    assert response.status_code == 200
    body = response.json()
    assert body["permit_segments"]
    assert body["growth_signals"]
    assert body["status_stages"]
    assert body["value_classes"]
    assert body["development_domains"]


def test_parcel_permit_events_include_segment_fields() -> None:
    response = client.get(
        "/development/parcel/CFS-PARCEL-0149726579/permits",
        params={"limit": 1},
    )

    assert response.status_code == 200
    permit = response.json()["permits"][0]
    assert "permit_segment" in permit
    assert "permit_growth_signal" in permit
    assert "development_domain" in permit
    assert "permit_status_stage" in permit
    assert "permit_value_class" in permit
    assert "permit_signal_score" in permit


def test_development_hotspots_permit_segment_filter() -> None:
    response = client.get(
        "/development/hotspots",
        params={"permit_segment": "residential_growth", "limit": 5},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["filters_applied"]["permit_segment"] == "residential_growth"
    assert body["total_count"] > 0
    assert all(
        result["residential_growth_permits"] > 0 for result in body["results"]
    )


def test_permit_segments_endpoints_are_in_openapi() -> None:
    response = client.get("/openapi.json")

    assert response.status_code == 200
    paths = response.json()["paths"]
    assert "/development/permit-segments/statistics" in paths
    assert "/development/permit-segments/options" in paths
    assert "/development/permit-segments/{official_parcel_id}" in paths
