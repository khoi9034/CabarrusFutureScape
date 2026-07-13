from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.connectors import census_acs
from app.connectors.census_acs import CensusAcsConnector, configured_acs_year, validate_acs_year
from app.dependencies.database import get_db
from app.main import app
from app.routers import investment_router
from app.services import investment_intake_service
from app.services.investment_market_context_service import (
    SAFE_LIMITATION,
    _upsert_acs_rows,
    build_market_context,
)

client = TestClient(app)


class FakeResponse:
    def __init__(self, body: object, *, content_type: str = "application/json") -> None:
        self.body = json.dumps(body).encode() if not isinstance(body, bytes) else body
        self.headers = {"content-type": content_type}

    def __enter__(self):  # noqa: ANN001
        return self

    def __exit__(self, *_args):  # noqa: ANN002
        return False

    def read(self) -> bytes:
        return self.body


def test_census_connector_parses_cabarrus_tracts(monkeypatch) -> None:
    response = [
        ["NAME", "B01003_001E", "B11001_001E", "B19013_001E", "state", "county", "tract"],
        ["Census Tract 1; Cabarrus County; North Carolina", "1000", "420", "85000", "37", "025", "010101"],
    ]
    monkeypatch.setattr(census_acs.urllib.request, "urlopen", lambda *_args, **_kwargs: FakeResponse(response))

    result = CensusAcsConnector(api_key="configured-but-not-logged").fetch_cabarrus_tracts(year=2023)

    assert result.rows[0]["geoid"] == "37025010101"
    assert result.rows[0]["total_population"] == 1000
    assert result.rows[0]["median_household_income"] == 85000
    assert "configured-but-not-logged" not in str(result)


def test_census_acs_year_is_configurable(monkeypatch) -> None:
    monkeypatch.delenv("CENSUS_ACS_YEAR", raising=False)
    assert configured_acs_year() == 2024
    monkeypatch.setenv("CENSUS_ACS_YEAR", "2023")
    assert configured_acs_year() == 2023
    with pytest.raises(ValueError):
        validate_acs_year("bad")


def test_census_connector_fetches_cabarrus_tract_geometry(monkeypatch) -> None:
    response = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "properties": {"GEOID": "37025042604", "STATE": "37", "COUNTY": "025", "TRACT": "042604", "BASENAME": "426.04"},
                "geometry": {"type": "Polygon", "coordinates": [[[0, 0], [1, 0], [1, 1], [0, 0]]]},
            },
            {
                "type": "Feature",
                "properties": {"GEOID": "99999000000", "STATE": "99", "COUNTY": "999", "TRACT": "000000"},
                "geometry": {"type": "Polygon", "coordinates": [[[0, 0], [1, 0], [1, 1], [0, 0]]]},
            },
        ],
    }
    monkeypatch.setattr(census_acs.urllib.request, "urlopen", lambda *_args, **_kwargs: FakeResponse(response))

    rows = CensusAcsConnector(api_key=None).fetch_cabarrus_tract_geometries(year=2024)

    assert len(rows) == 1
    assert rows[0]["geoid"] == "37025042604"
    assert rows[0]["acs_year"] == 2024


def test_census_connector_handles_missing_variable_and_null(monkeypatch) -> None:
    response = [
        ["NAME", "B01003_001E", "state", "county", "tract"],
        ["Census Tract 1", "-666666666", "37", "025", "010101"],
    ]
    monkeypatch.setattr(census_acs.urllib.request, "urlopen", lambda *_args, **_kwargs: FakeResponse(response))

    result = CensusAcsConnector(api_key="x").fetch_cabarrus_tracts()

    assert "B19013_001E" in result.missing_variables
    assert result.rows[0]["total_population"] is None


def test_census_connector_empty_and_non_json_responses_fail_safely(monkeypatch) -> None:
    monkeypatch.setattr(census_acs.urllib.request, "urlopen", lambda *_args, **_kwargs: FakeResponse([]))
    with pytest.raises(ValueError):
        CensusAcsConnector(api_key="x").fetch_cabarrus_tracts()

    monkeypatch.setattr(census_acs.urllib.request, "urlopen", lambda *_args, **_kwargs: FakeResponse(b"<html>Missing Key</html>", content_type="text/html"))
    with pytest.raises(RuntimeError) as exc:
        CensusAcsConnector(api_key=None).fetch_cabarrus_tracts()
    assert "CENSUS_API_KEY" in str(exc.value)


def test_build_market_context_is_qualitative_and_safe() -> None:
    rows = [
        {"geoid": "1", "acs_year": 2023, "geography_type": "tract", "total_population": 100, "total_households": 40, "median_household_income": 50000, "occupied_housing_units": 35, "total_housing_units": 45, "owner_occupied_units": 25, "renter_occupied_units": 15},
        {"geoid": "2", "acs_year": 2023, "geography_type": "tract", "total_population": 300, "total_households": 120, "median_household_income": 70000, "occupied_housing_units": 105, "total_housing_units": 130, "owner_occupied_units": 80, "renter_occupied_units": 40},
        {"geoid": "3", "acs_year": 2023, "geography_type": "tract", "total_population": 600, "total_households": 220, "median_household_income": 90000, "occupied_housing_units": 210, "total_housing_units": 230, "owner_occupied_units": 160, "renter_occupied_units": 60},
    ]

    context = build_market_context(rows[-1], rows)
    text = str(context).lower()

    assert context["population_context"]["band"] == "Elevated Local Context"
    assert context["growth_context"]["band"] == "Insufficient Information"
    assert context["data_confidence"] == "Medium"
    assert "sampling uncertainty" in context["uncertainty_note"]
    assert SAFE_LIMITATION in context["limitations"]
    for unsafe in ["guaranteed", "official appraisal", "raw_score", "owner_name", "mailing_address"]:
        assert unsafe not in text


def test_upsert_preserves_last_good_contract() -> None:
    fake_db = SimpleNamespace(execute=lambda *args, **kwargs: None)
    _upsert_acs_rows(
        fake_db,
        [
            {
                "acs_year": 2023,
                "county_fips": "025",
                "geography_type": "tract",
                "geoid": "37025010101",
                "retrieved_at": "2026-01-01T00:00:00Z",
                "source_dataset": "2023/acs/acs5",
                "source_name": "U.S. Census Bureau ACS API",
                "state_fips": "37",
            }
        ],
    )


def test_market_context_routes_are_wired(monkeypatch) -> None:
    app.dependency_overrides[get_db] = lambda: SimpleNamespace()
    monkeypatch.setattr(investment_router, "acs_status", lambda db: {"status": "loaded", "row_count": 1})
    monkeypatch.setattr(investment_router, "refresh_acs_market_context", lambda db: {"rows_loaded": 1})
    monkeypatch.setattr(investment_router, "candidate_market_context", lambda db, parcel_id: {"geoid": "37025010101", "data_confidence": "Medium"})
    monkeypatch.setattr(investment_router, "get_intake_candidate", lambda db, candidate_id: {"id": candidate_id, "parcel_id": "P1"})
    try:
        assert client.get("/investment/market-context/acs/status").json()["row_count"] == 1
        assert client.post("/investment/market-context/acs/refresh").json()["rows_loaded"] == 1
        assert client.get("/investment/candidates/P1/market-context").json()["geoid"] == "37025010101"
        assert client.get("/investment/intake/C1/market-context").json()["data_confidence"] == "Medium"
    finally:
        app.dependency_overrides.clear()


def test_intake_analysis_includes_market_context(monkeypatch) -> None:
    monkeypatch.setattr(investment_intake_service, "get_intake_candidate", lambda db, cid: {"id": cid, "candidate_name": "Lead", "parcel_id": "P1", "strategy": "development_land"})
    monkeypatch.setattr(investment_intake_service, "_parcel_acres", lambda db, parcel_id: 5)
    monkeypatch.setattr(investment_intake_service, "candidate_market_context", lambda db, parcel_id: {"household_context": {"band": "Typical Local Context"}, "data_confidence": "Medium"})

    result = investment_intake_service.analyze_intake_candidate(SimpleNamespace(), "C1", [])

    assert result is not None
    assert result["market_area_context"]["data_confidence"] == "Medium"


def test_service_uses_batch_postgis_overlay_not_per_parcel_geocoder() -> None:
    source = (Path(__file__).resolve().parents[1] / "app/services/investment_market_context_service.py").read_text()
    assert "ST_Intersects" in source
    assert "postgis_tract_overlay" in source
    assert "tract_geoid_for_point" not in source
