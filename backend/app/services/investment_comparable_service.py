"""Basis and comparable context enrichment for Investment Panel candidates."""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import bindparam, text
from sqlalchemy.orm import Session

from app.services.investment_sale_quality_service import acreage_band, sale_quality_context

LOGGER = logging.getLogger(__name__)

COMPARABLE_MIN_COUNT = 3


def enrich_basis_context(rows: list[dict[str, Any]], db: Session | None) -> list[dict[str, Any]]:
    if not rows:
        return rows
    if db is None:
        return [{**row, **_missing_basis("Local sale context is unavailable for this request.")} for row in rows]
    try:
        if not _table_exists(db, "parcels_enriched"):
            return [{**row, **_missing_basis("Parcel sale context table is not available locally.")} for row in rows]
        sale_rows = _sale_rows_by_parcel(db, _parcel_ids(rows))
        comparable_stats = _comparable_stats(db)
    except Exception as exc:  # pragma: no cover - defensive endpoint fallback
        LOGGER.warning("Investment basis enrichment failed: %s", exc)
        return [{**row, **_missing_basis("Sale and comparable context could not be refreshed.")} for row in rows]
    return [{**row, **_basis_context(row, sale_rows.get(_row_id(row)), comparable_stats)} for row in rows]


def _basis_context(
    row: dict[str, Any],
    sale_row: dict[str, Any] | None,
    comparable_stats: dict[tuple[str, str], dict[str, Any]],
) -> dict[str, Any]:
    if not sale_row:
        return _missing_basis("No sale information was available in the current parcel context.")

    quality = sale_quality_context(sale_row)
    size = _text(sale_row.get("parcel_size_category"), "Data Needed")
    density = _text(sale_row.get("neighborhood_density_class"), "__ALL__")
    stats = comparable_stats.get((size, density)) or comparable_stats.get((size, "__ALL__"))
    sale_ppa = quality.get("sale_price_per_acre_internal")
    comparable_count = int(stats["count"]) if stats else 0
    median_ppa = float(stats["median_ppa"]) if stats and stats.get("median_ppa") is not None else None
    basis_band = _relative_basis_band(quality, sale_ppa, median_ppa, comparable_count)
    comparable_band = _comparable_count_band(comparable_count)
    confidence = _confidence_band(quality["sale_quality_band"], comparable_count)
    positive = _positive_reasons(quality["sale_quality_band"], basis_band, comparable_count)
    cautions = _caution_reasons(quality, comparable_count)
    verification_required = _verification_required(quality, basis_band, comparable_count)

    return {
        "acreage_band": row.get("acreage_band") or quality["acreage_band"],
        "basis_context_band": basis_band,
        "basis_data_confidence": confidence,
        "basis_missing_sale_date_flag": "Missing sale date" in quality["basis_verification_flags"],
        "basis_missing_sale_price_flag": "Missing sale price" in quality["basis_verification_flags"],
        "basis_positive_reasons": positive,
        "basis_stale_sale_flag": quality["sale_quality_band"] == "Stale",
        "basis_caution_reasons": cautions,
        "basis_verification_required": verification_required,
        "comparable_context_summary": _summary(basis_band, comparable_count, quality["sale_quality_band"]),
        "comparable_count_band": comparable_band,
        "comparable_confidence_band": confidence,
        "multi_parcel_sale_flag": quality["multi_parcel_sale_flag"],
        "qualified_sale_flag": quality["qualified_sale_flag"],
        "sale_quality_band": quality["sale_quality_band"],
        "sale_recency_band": quality["sale_recency_band"],
        "vacant_or_improved_context": quality["vacant_or_improved_context"],
    }


def _sale_rows_by_parcel(db: Session, parcel_ids: list[str]) -> dict[str, dict[str, Any]]:
    if not parcel_ids:
        return {}
    query = text(
        """
        WITH sale_key_counts AS (
            SELECT deedbook, deedpage, saleyear, saleprice, COUNT(*) AS transaction_parcel_count
            FROM parcels_enriched
            WHERE deedbook IS NOT NULL
              AND deedpage IS NOT NULL
              AND saleyear IS NOT NULL
              AND saleprice IS NOT NULL
            GROUP BY deedbook, deedpage, saleyear, saleprice
        )
        SELECT p.official_parcel_id,
               p.saleyear,
               p.salemonth,
               p.saleprice,
               p.parcel_area_acres_calc,
               p.landvalue_numeric,
               p.buildingvalue_numeric,
               p.assessedvalue_numeric,
               p.parcel_size_category,
               p.neighborhood_density_class,
               COALESCE(k.transaction_parcel_count, 1) AS transaction_parcel_count
        FROM parcels_enriched p
        LEFT JOIN sale_key_counts k
          ON k.deedbook = p.deedbook
         AND k.deedpage = p.deedpage
         AND k.saleyear = p.saleyear
         AND k.saleprice = p.saleprice
        WHERE p.official_parcel_id IN :parcel_ids
        """
    ).bindparams(bindparam("parcel_ids", expanding=True))
    rows = db.execute(query, {"parcel_ids": parcel_ids}).mappings().all()
    return {str(row["official_parcel_id"]): dict(row) for row in rows}


def _comparable_stats(db: Session) -> dict[tuple[str, str], dict[str, Any]]:
    current_year = datetime.now(UTC).year
    query = text(
        """
        WITH qualified AS (
            SELECT COALESCE(parcel_size_category, 'Data Needed') AS size_group,
                   COALESCE(neighborhood_density_class, '__ALL__') AS density_group,
                   saleprice / NULLIF(parcel_area_acres_calc, 0) AS price_per_acre
            FROM parcels_enriched
            WHERE saleprice > 1000
              AND saleyear >= :min_year
              AND parcel_area_acres_calc > 0
              AND saleprice / NULLIF(parcel_area_acres_calc, 0) BETWEEN 100 AND 50000000
        )
        SELECT size_group,
               density_group,
               COUNT(*) AS count,
               percentile_cont(0.5) WITHIN GROUP (ORDER BY price_per_acre) AS median_ppa
        FROM qualified
        GROUP BY size_group, density_group
        UNION ALL
        SELECT size_group,
               '__ALL__' AS density_group,
               COUNT(*) AS count,
               percentile_cont(0.5) WITHIN GROUP (ORDER BY price_per_acre) AS median_ppa
        FROM qualified
        GROUP BY size_group
        """
    )
    return {
        (str(row["size_group"]), str(row["density_group"])): dict(row)
        for row in db.execute(query, {"min_year": current_year - 5}).mappings().all()
    }


def _relative_basis_band(
    quality: dict[str, Any],
    sale_ppa: Any,
    median_ppa: float | None,
    comparable_count: int,
) -> str:
    sale_quality = str(quality["sale_quality_band"])
    if sale_quality in {"Not Available", "Missing Critical Information"}:
        return "Insufficient Basis Information"
    if sale_quality in {"Non-Market Transfer", "Multi-Parcel Review Required", "Stale"}:
        return "Verification Required"
    if sale_ppa is None or median_ppa is None or comparable_count < COMPARABLE_MIN_COUNT:
        return "Insufficient Basis Information"
    ratio = float(sale_ppa) / median_ppa if median_ppa > 0 else None
    if ratio is None:
        return "Insufficient Basis Information"
    if ratio < 0.75:
        return "Supportive"
    if ratio < 0.95:
        return "Moderately Supportive"
    if ratio <= 1.15:
        return "Near Comparable Context"
    if ratio <= 1.5:
        return "Elevated"
    return "Highly Elevated"


def _missing_basis(summary: str) -> dict[str, Any]:
    return {
        "basis_context_band": "Insufficient Basis Information",
        "basis_data_confidence": "Low",
        "basis_missing_sale_date_flag": True,
        "basis_missing_sale_price_flag": True,
        "basis_positive_reasons": [],
        "basis_stale_sale_flag": False,
        "basis_caution_reasons": ["Basis information requires manual verification"],
        "basis_verification_required": True,
        "comparable_context_summary": summary,
        "comparable_count_band": "No comparable evidence",
        "comparable_confidence_band": "Low",
        "multi_parcel_sale_flag": False,
        "qualified_sale_flag": False,
        "sale_quality_band": "Not Available",
        "sale_recency_band": "No sale information available",
    }


def _positive_reasons(sale_quality: str, basis_band: str, comparable_count: int) -> list[str]:
    reasons: list[str] = []
    if sale_quality == "Qualified":
        reasons.append("Recent qualified sale evidence is available")
    if basis_band in {"Supportive", "Moderately Supportive"}:
        reasons.append("Available price-per-acre context appears supportive")
    if basis_band == "Near Comparable Context":
        reasons.append("Parcel basis appears within the local comparable range")
    if comparable_count >= 10:
        reasons.append("Comparable group includes multiple recent land transactions")
    return reasons


def _caution_reasons(quality: dict[str, Any], comparable_count: int) -> list[str]:
    reasons = [reason for reason in quality["basis_verification_flags"] if "Verify deed" not in reason]
    if comparable_count < COMPARABLE_MIN_COUNT:
        reasons.append("Comparable group is limited")
    if quality["sale_quality_band"] != "Qualified":
        reasons.append("Basis information requires manual verification")
    reasons.append("Assessed value is context only and is not an appraisal")
    return _unique(reasons)


def _summary(basis_band: str, comparable_count: int, sale_quality: str) -> str:
    if basis_band == "Insufficient Basis Information":
        return "Available basis evidence is insufficient for a reliable comparable context."
    if basis_band == "Verification Required":
        return "Sale evidence requires manual verification before it is used as comparable context."
    return (
        f"Available basis context appears {basis_band.lower()} relative to a "
        f"{_comparable_count_band(comparable_count).lower()} comparable group with {sale_quality.lower()} sale evidence."
    )


def _confidence_band(sale_quality: str, comparable_count: int) -> str:
    if sale_quality == "Qualified" and comparable_count >= 10:
        return "High"
    if sale_quality in {"Qualified", "Potentially Qualified"} and comparable_count >= COMPARABLE_MIN_COUNT:
        return "Medium"
    return "Low"


def _verification_required(quality: dict[str, Any], basis_band: str, comparable_count: int) -> bool:
    return (
        basis_band in {"Insufficient Basis Information", "Verification Required"}
        or quality["sale_quality_band"] != "Qualified"
        or comparable_count < COMPARABLE_MIN_COUNT
        or quality["multi_parcel_sale_flag"]
    )


def _comparable_count_band(count: int) -> str:
    if count <= 0:
        return "No comparable evidence"
    if count < COMPARABLE_MIN_COUNT:
        return "Limited"
    if count < 10:
        return "Moderate"
    return "Strong"


def _table_exists(db: Session, table_name: str) -> bool:
    return bool(db.execute(text("SELECT to_regclass(:name) IS NOT NULL"), {"name": f"public.{table_name}"}).scalar_one())


def _parcel_ids(rows: list[dict[str, Any]]) -> list[str]:
    return sorted({_row_id(row) for row in rows if _row_id(row)})


def _row_id(row: dict[str, Any]) -> str:
    return str(row.get("parcel_id") or row.get("signal_id") or row.get("row_id") or "")


def _text(value: Any, fallback: str) -> str:
    return str(value).strip() if value not in (None, "") else fallback


def _unique(values: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for value in values:
        if value and value not in seen:
            seen.add(value)
            out.append(value)
    return out
