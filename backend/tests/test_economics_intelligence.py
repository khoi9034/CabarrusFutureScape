from app.routers.economics_router import (
    _economics_signal,
    _unavailable_payload,
    calculate_improvement_to_land_ratio,
    calculate_value_per_acre,
    estimate_county_tax,
)


def test_economics_screening_calculations_are_transparent() -> None:
    assert calculate_value_per_acre(500_000, 2) == 250_000
    assert calculate_value_per_acre(500_000, 0) is None
    assert calculate_improvement_to_land_ratio(200_000, 400_000) == 0.5
    assert calculate_improvement_to_land_ratio(200_000, 0) is None
    assert estimate_county_tax(500_000, 0.57) == 2850


def test_economics_missing_fields_return_data_needed_schema() -> None:
    payload = _unavailable_payload("2026-01-01T00:00:00+00:00", "Parcel value fields unavailable.")

    assert payload["mode"] == "live"
    assert payload["summary"]["total_parcels_analyzed"] == 0
    assert payload["summary"]["data_needed_count"] == 1
    assert payload["kpis"]
    assert payload["watchlist"] == []
    assert "formal appraisal" in " ".join(payload["caveats"])


def test_economics_signal_uses_bands_and_excludes_contact_fields() -> None:
    signal = _economics_signal(
        {
            "acreage": 2,
            "assessed_value": 500_000,
            "geography_label": "Demo corridor",
            "improvement_to_land_ratio": 0.4,
            "improvement_value": 100_000,
            "land_value": 250_000,
            "official_parcel_id": "demo-1",
            "permit_activity_context": "Recent observed permit activity",
            "value_per_acre": 250_000,
        },
        0.57,
    )

    assert signal["estimated_county_tax"] == 2850
    assert signal["economic_status_band"] == "underbuilt_watch"
    assert signal["opportunity_class"] == "Underbuilt Redevelopment Candidate"
    assert "owner" not in str(signal).lower()
    assert "mailing" not in str(signal).lower()
