from app.services.investment_comparable_service import _basis_context


STATS = {
    ("residential_standard", "low"): {"count": 12, "median_ppa": 100_000},
    ("commercial_large", "__ALL__"): {"count": 2, "median_ppa": 80_000},
}


def sale_row(price: float, acres: float = 1, year: int = 2025, size: str = "residential_standard") -> dict:
    return {
        "saleprice": price,
        "saleyear": year,
        "parcel_area_acres_calc": acres,
        "parcel_size_category": size,
        "neighborhood_density_class": "low",
        "buildingvalue_numeric": 0,
        "transaction_parcel_count": 1,
    }


def test_basis_context_supportive_near_and_elevated() -> None:
    assert _basis_context({}, sale_row(70_000), STATS)["basis_context_band"] == "Supportive"
    assert _basis_context({}, sale_row(100_000), STATS)["basis_context_band"] == "Near Comparable Context"
    assert _basis_context({}, sale_row(130_000), STATS)["basis_context_band"] == "Elevated"
    assert _basis_context({}, sale_row(180_000), STATS)["basis_context_band"] == "Highly Elevated"


def test_basis_context_handles_missing_stale_and_limited_comparables() -> None:
    assert _basis_context({}, None, STATS)["basis_context_band"] == "Insufficient Basis Information"
    assert _basis_context({}, sale_row(100_000, year=2010), STATS)["basis_context_band"] == "Verification Required"
    limited = _basis_context({}, sale_row(70_000, size="commercial_large"), STATS)
    assert limited["basis_context_band"] == "Insufficient Basis Information"
    assert "Comparable group is limited" in limited["basis_caution_reasons"]


def test_basis_context_keeps_assessed_value_as_context_only() -> None:
    result = _basis_context({}, sale_row(100_000), STATS)
    assert "Assessed value is context only and is not an appraisal" in result["basis_caution_reasons"]
    assert "undervalued" not in str(result).lower()
    assert "overpriced" not in str(result).lower()
