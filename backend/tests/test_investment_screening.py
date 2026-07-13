from fastapi.testclient import TestClient

from app.main import app
from app.routers import investment_router
from app.services.investment_screening_service import (
    candidate_detail,
    compare_candidates,
    screen_candidates,
)


client = TestClient(app)


def sample_rows() -> list[dict]:
    return [
        {
            "parcel_id": "P1",
            "display_label": "Growth edge parcel",
            "geography_label": "North corridor",
            "development_readiness_band": "Strong infrastructure-supported review candidate",
            "land_opportunity_class": "Opportunity signal, capacity data needed",
            "growth_pressure_band": "High growth pressure",
            "sewer_proxy_class": "Adjacent to sewer infrastructure",
            "utility_readiness_proxy_class": "Strong sewer-proximity signal",
            "zoning_support_band": "Supportive",
            "value_per_acre_band": "$250K-$500K",
            "comparison_group": "Residential / 5-25 acres",
            "data_confidence": "high",
            "basis_context_band": "Supportive",
            "basis_data_confidence": "Medium",
            "basis_positive_reasons": ["Recent qualified sale evidence is available"],
            "basis_caution_reasons": ["Assessed value is context only and is not an appraisal"],
            "basis_verification_required": True,
            "comparable_context_summary": "Available basis context appears supportive relative to the selected comparable group.",
            "comparable_count_band": "Moderate",
            "sale_quality_band": "Qualified",
            "sale_recency_band": "Recent qualified-sale window",
        },
        {
            "parcel_id": "P2",
            "display_label": "Existing commercial use",
            "geography_label": "Town center",
            "economic_segment": "Commercial",
            "opportunity_class": "High-Value Stable Parcel",
            "improvement_to_land_ratio_band": "High",
            "value_per_acre_band": "$1M+",
            "comparison_group": "Commercial",
            "data_confidence": "medium",
        },
        {
            "parcel_id": "P3",
            "display_label": "Flood review parcel",
            "growth_pressure_band": "Moderate growth pressure",
            "flood_constraint_band": "High flood constraint",
            "utility_capacity_status": "Capacity data not provided",
            "data_confidence": "low",
            "owner": "Do Not Return",
            "mailing_address": "Do Not Return",
            "raw_score": 99,
        },
    ]


def test_strategy_screening_changes_candidate_ordering() -> None:
    development = screen_candidates(sample_rows(), strategy="development_land")
    existing_use = screen_candidates(sample_rows(), strategy="existing_use")

    assert development["candidates"][0]["parcel_id"] == "P1"
    assert existing_use["candidates"][0]["parcel_id"] == "P2"
    assert development["candidates"][0]["candidate_band"] in {
        "Priority Review",
        "Strong Review Candidate",
    }


def test_missing_basis_is_not_fabricated_or_negative() -> None:
    result = candidate_detail(sample_rows(), "P3", strategy="land_banking")

    market = result["factor_groups"]["market_basis_context"]
    assert market["nearby_comparable_context"] == "Insufficient basis information"
    assert market["relative_basis_band"] == "Insufficient basis information"
    assert "Comparable evidence is limited or stale" in result["caution_reason_codes"]


def test_basis_context_is_factual_across_strategies() -> None:
    development = candidate_detail(sample_rows(), "P1", strategy="development_land")
    land_bank = candidate_detail(sample_rows(), "P1", strategy="land_banking")

    assert development["basis_context_band"] == "Supportive"
    assert land_bank["basis_context_band"] == "Supportive"
    assert development["strategy"] != land_bank["strategy"]
    assert "Recent qualified sale evidence is available" in development["basis_positive_reasons"]


def test_compare_candidates_deduplicates_same_parcel_id() -> None:
    rows = sample_rows() + [sample_rows()[0] | {"display_label": "Duplicate row"}]
    result = compare_candidates(rows, ["P1", "P2"], strategy="development_land")

    assert [candidate["parcel_id"] for candidate in result["candidates"]].count("P1") == 1
    assert len(result["candidates"]) == 2


def test_utility_fields_remain_proxy_based_and_flood_creates_caution() -> None:
    result = candidate_detail(sample_rows(), "P3", strategy="development_land")
    text = str(result).lower()

    assert "Flood constraints affect part of the parcel" in result["caution_reason_codes"]
    assert "proxy" in text
    assert "confirmed capacity" not in text
    assert "confirmed service" not in text


def test_candidate_response_excludes_sensitive_and_internal_fields() -> None:
    result = candidate_detail(sample_rows(), "P3", strategy="development_land")
    text = str(result).lower()

    assert "owner" not in text
    assert "mailing" not in text
    assert "raw_score" not in text
    assert "_score" not in result
    assert "exact_probability" not in text
    assert "investment advice" in text
    assert "buy this parcel" not in text
    assert "guaranteed return" not in text


def test_investment_routes_use_screening_service(monkeypatch) -> None:
    monkeypatch.setattr(investment_router, "_investment_rows", lambda db: sample_rows())

    strategies = client.get("/investment/strategies")
    assert strategies.status_code == 200
    assert {row["id"] for row in strategies.json()["strategies"]} == {
        "development_land",
        "land_banking",
        "entitlement_repositioning",
        "existing_use",
    }

    screen = client.post("/investment/screen", json={"strategy": "development_land", "limit": 2})
    assert screen.status_code == 200
    body = screen.json()
    assert body["strategy"] == "development_land"
    assert len(body["candidates"]) == 2
    assert body["candidates"][0]["basis_context_band"] == "Supportive"
    assert body["data_quality"]["parcels_with_potentially_qualified_sales"] >= 1
    assert "raw_score" not in str(body).lower()
