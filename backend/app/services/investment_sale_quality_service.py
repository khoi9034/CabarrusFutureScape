"""Sale-quality bands for Investment Panel basis screening."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

ACREAGE_BANDS: tuple[tuple[float, str], ...] = (
    (1, "Under 1 acre"),
    (5, "1-5 acres"),
    (10, "5-10 acres"),
    (25, "10-25 acres"),
    (50, "25-50 acres"),
    (100, "50-100 acres"),
)


def acreage_band(acres: float | int | None) -> str:
    if acres is None or acres <= 0:
        return "Data Needed"
    for ceiling, label in ACREAGE_BANDS:
        if acres < ceiling:
            return label
    return "Over 100 acres"


def sale_recency_band(sale_age_years: int | None) -> str:
    if sale_age_years is None:
        return "No sale information available"
    if sale_age_years <= 2:
        return "Recent qualified-sale window"
    if sale_age_years <= 5:
        return "Moderate recency sale window"
    if sale_age_years <= 10:
        return "Older sale evidence"
    return "Stale"


def sale_quality_context(row: dict[str, Any], *, current_year: int | None = None) -> dict[str, Any]:
    current_year = current_year or datetime.now(UTC).year
    sale_price = _number(_first_present(row, "sale_price", "saleprice"))
    sale_year = _int(_first_present(row, "sale_year", "saleyear"))
    acres = _number(_first_present(row, "parcel_acres", "parcel_area_acres_calc", "acreage"))
    transaction_count = _int(row.get("transaction_parcel_count")) or 1
    sale_age = current_year - sale_year if sale_year else None
    sale_ppa = sale_price / acres if sale_price and acres and acres > 0 else None
    flags: list[str] = []

    if sale_price is None:
        flags.append("Missing sale price")
    if sale_year is None:
        flags.append("Missing sale date")
    if acres is None or acres <= 0:
        flags.append("Missing acreage")
    if sale_price is not None and sale_price <= 1000:
        flags.append("Nominal-value transfer review")
    if transaction_count > 1:
        flags.append("Sale covers multiple parcels and requires allocation review")
    if sale_age is not None and sale_age > 10:
        flags.append("Latest sale appears stale")
    if sale_ppa is not None and (sale_ppa < 100 or sale_ppa > 50_000_000):
        flags.append("Abnormal price-per-acre value requires review")

    if sale_price is None and sale_year is None:
        quality = "Not Available"
    elif any(flag in flags for flag in ("Missing sale price", "Missing sale date", "Missing acreage")):
        quality = "Missing Critical Information"
    elif "Nominal-value transfer review" in flags or "Abnormal price-per-acre value requires review" in flags:
        quality = "Non-Market Transfer"
    elif transaction_count > 1:
        quality = "Multi-Parcel Review Required"
    elif sale_age is not None and sale_age > 10:
        quality = "Stale"
    elif sale_age is not None and sale_age <= 5:
        quality = "Qualified"
    else:
        quality = "Potentially Qualified"

    return {
        "acreage_band": acreage_band(acres),
        "basis_verification_flags": flags or ["Verify deed and transaction context before relying on sale evidence"],
        "multi_parcel_sale_flag": transaction_count > 1,
        "qualified_sale_flag": quality == "Qualified",
        "sale_age_years": sale_age,
        "sale_price_per_acre_internal": sale_ppa,
        "sale_quality_band": quality,
        "sale_recency_band": sale_recency_band(sale_age),
        "vacant_or_improved_context": _vacant_or_improved(row),
    }


def _vacant_or_improved(row: dict[str, Any]) -> str:
    improvement = _number(_first_present(row, "improvement_value", "buildingvalue_numeric"))
    if improvement is None:
        return "Data Needed"
    return "Vacant / low-improvement context" if improvement <= 1000 else "Improved-property context"


def _first_present(row: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        value = row.get(key)
        if value not in (None, ""):
            return value
    return None


def _number(value: Any) -> float | None:
    try:
        if value in (None, ""):
            return None
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if number == number else None


def _int(value: Any) -> int | None:
    number = _number(value)
    return int(number) if number is not None else None
