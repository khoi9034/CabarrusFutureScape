from app.services.investment_sale_quality_service import acreage_band, sale_quality_context


def test_qualified_sale_classification() -> None:
    result = sale_quality_context(
        {"saleprice": 500_000, "saleyear": 2025, "parcel_area_acres_calc": 5, "buildingvalue_numeric": 0},
        current_year=2026,
    )

    assert result["sale_quality_band"] == "Qualified"
    assert result["qualified_sale_flag"] is True
    assert result["sale_recency_band"] == "Recent qualified-sale window"
    assert result["vacant_or_improved_context"] == "Vacant / low-improvement context"


def test_sale_quality_cautions_missing_nominal_stale_and_multi_parcel() -> None:
    assert sale_quality_context({"saleyear": 2025, "parcel_area_acres_calc": 1}, current_year=2026)["sale_quality_band"] == "Missing Critical Information"
    assert sale_quality_context({"saleprice": 10, "saleyear": 2025, "parcel_area_acres_calc": 1}, current_year=2026)["sale_quality_band"] == "Non-Market Transfer"
    assert sale_quality_context({"saleprice": 100_000, "saleyear": 2012, "parcel_area_acres_calc": 1}, current_year=2026)["sale_quality_band"] == "Stale"
    assert sale_quality_context(
        {"saleprice": 100_000, "saleyear": 2025, "parcel_area_acres_calc": 1, "transaction_parcel_count": 3},
        current_year=2026,
    )["sale_quality_band"] == "Multi-Parcel Review Required"


def test_acreage_bands_are_configured() -> None:
    assert acreage_band(0.5) == "Under 1 acre"
    assert acreage_band(7) == "5-10 acres"
    assert acreage_band(125) == "Over 100 acres"
