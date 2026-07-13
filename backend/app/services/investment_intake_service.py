"""Private candidate intake workflow for the Investment Panel."""

from __future__ import annotations

import csv
from datetime import UTC, date, datetime
from decimal import Decimal, InvalidOperation
from io import StringIO
from typing import Any
from uuid import uuid4

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.schemas.investment import InvestmentCsvImportRequest, InvestmentIntakePatch, InvestmentIntakePayload
from app.services.investment_comparable_service import COMPARABLE_MIN_COUNT, _comparable_count_band
from app.services.investment_screening_service import SAFE_CAVEAT, candidate_detail, compare_candidates

INTAKE_TABLE = "investment_candidate_intake"
CSV_REQUIRED_HEADERS = {
    "candidate_name",
    "source_type",
}
CSV_ALLOWED_HEADERS = {
    "asking_price",
    "asking_price_date",
    "candidate_name",
    "listing_status",
    "notes",
    "parcel_id",
    "property_type",
    "source_name",
    "source_type",
    "source_url",
    "strategy",
}
UNSAFE_HEADERS = {"owner", "owner_name", "mailing", "mailing_address", "grantor", "grantee", "email", "phone"}


def list_intake_candidates(db: Session, investment_rows: list[dict[str, Any]]) -> dict[str, Any]:
    _ensure_table(db)
    rows = [_serialize(row) for row in db.execute(text(f"SELECT * FROM {INTAKE_TABLE} ORDER BY updated_at DESC LIMIT 250")).mappings()]
    return {
        "caveats": [SAFE_CAVEAT, "User-entered listing or lead information is not independently verified by CFS."],
        "candidates": [_summary(row, investment_rows, parcel_acres=_parcel_acres(db, row.get("parcel_id"))) for row in rows],
        "count": len(rows),
    }


def create_intake_candidate(db: Session, payload: InvestmentIntakePayload, investment_rows: list[dict[str, Any]]) -> dict[str, Any]:
    _ensure_table(db)
    values = _payload_values(payload.model_dump())
    values["id"] = str(uuid4())
    now = datetime.now(UTC)
    values["created_at"] = now
    values["updated_at"] = now
    db.execute(
        text(
            f"""
            INSERT INTO {INTAKE_TABLE} (
                id, parcel_id, candidate_name, source_type, source_name, source_url, asking_price,
                asking_price_date, listing_status, listing_date, expiration_or_review_date, property_type,
                strategy, user_notes, broker_notes, review_status, date_added, last_verified,
                deed_review_status, deed_type, market_sale_status, multi_parcel_review,
                verification_source, verification_date, verification_notes, created_at, updated_at
            ) VALUES (
                :id, :parcel_id, :candidate_name, :source_type, :source_name, :source_url, :asking_price,
                :asking_price_date, :listing_status, :listing_date, :expiration_or_review_date, :property_type,
                :strategy, :user_notes, :broker_notes, :review_status, :date_added, :last_verified,
                :deed_review_status, :deed_type, :market_sale_status, :multi_parcel_review,
                :verification_source, :verification_date, :verification_notes, :created_at, :updated_at
            )
            """
        ),
        values,
    )
    return analyze_intake_candidate(db, values["id"], investment_rows)


def get_intake_candidate(db: Session, candidate_id: str) -> dict[str, Any] | None:
    _ensure_table(db)
    row = db.execute(text(f"SELECT * FROM {INTAKE_TABLE} WHERE id = :id"), {"id": candidate_id}).mappings().first()
    return _serialize(row) if row else None


def update_intake_candidate(
    db: Session,
    candidate_id: str,
    payload: InvestmentIntakePatch,
    investment_rows: list[dict[str, Any]],
) -> dict[str, Any] | None:
    _ensure_table(db)
    values = _payload_values(payload.model_dump(exclude_unset=True))
    if not values:
        return analyze_intake_candidate(db, candidate_id, investment_rows)
    values["id"] = candidate_id
    values["updated_at"] = datetime.now(UTC)
    assignments = ", ".join(f"{key} = :{key}" for key in values if key != "id")
    result = db.execute(text(f"UPDATE {INTAKE_TABLE} SET {assignments} WHERE id = :id"), values)
    if result.rowcount == 0:
        return None
    return analyze_intake_candidate(db, candidate_id, investment_rows)


def delete_intake_candidate(db: Session, candidate_id: str) -> bool:
    _ensure_table(db)
    result = db.execute(text(f"DELETE FROM {INTAKE_TABLE} WHERE id = :id"), {"id": candidate_id})
    return bool(result.rowcount)


def analyze_intake_candidate(db: Session, candidate_id: str, investment_rows: list[dict[str, Any]]) -> dict[str, Any] | None:
    row = get_intake_candidate(db, candidate_id)
    if not row:
        return None
    match = _matching_investment_row(row, investment_rows)
    screening = candidate_detail(investment_rows, row["parcel_id"], strategy=row["strategy"]) if match else None
    acquisition = _acquisition_basis(row, match, parcel_acres=_parcel_acres(db, row.get("parcel_id")))
    return {
        "acquisition_basis": acquisition,
        "candidate": row,
        "caveats": [
            SAFE_CAVEAT,
            "Asking price and listing details are user-entered unless a future approved connector verifies them.",
            "Source reference only. CFS does not automatically reproduce or verify third-party listing content.",
        ],
        "data_attribution": {
            "asking_basis": "User-entered information",
            "comparable_land_context": "CFS-derived screening context",
            "historical_sale_context": "CFS assessor/deed context requiring verification",
            "readiness_context": "CFS-derived proxy and public-source context",
        },
        "parcel_match_status": "Matched CFS parcel context" if match else "Parcel ID not matched to current CFS investment context",
        "screening_context": screening,
        "source_note": "Source reference only. CFS does not automatically reproduce or verify third-party listing content.",
    }


def import_intake_csv(
    db: Session,
    request: InvestmentCsvImportRequest,
    investment_rows: list[dict[str, Any]],
) -> dict[str, Any]:
    _ensure_table(db)
    rows = list(csv.DictReader(StringIO(request.csv_text)))
    headers = set(rows[0].keys()) if rows else set()
    if not rows:
        return {"created": [], "errors": ["CSV did not contain candidate rows."], "duplicates": [], "unmatched_parcel_ids": []}
    if len(rows) > 50:
        return {"created": [], "errors": ["CSV import is limited to 50 rows."], "duplicates": [], "unmatched_parcel_ids": []}
    bad_headers = sorted((headers - CSV_ALLOWED_HEADERS) | (headers & UNSAFE_HEADERS))
    missing = sorted(CSV_REQUIRED_HEADERS - headers)
    if bad_headers or missing:
        return {
            "created": [],
            "duplicates": [],
            "errors": [f"Unsupported or unsafe headers: {', '.join(bad_headers)}" if bad_headers else "", f"Missing required headers: {', '.join(missing)}" if missing else ""],
            "unmatched_parcel_ids": [],
        }

    seen: set[tuple[str, str]] = set()
    created: list[dict[str, Any]] = []
    duplicates: list[str] = []
    errors: list[str] = []
    unmatched: list[str] = []
    known = {str(row.get("parcel_id") or "") for row in investment_rows}
    for index, row in enumerate(rows, start=2):
        key = (row.get("parcel_id") or "", row.get("candidate_name") or "")
        if key in seen:
            duplicates.append(f"row {index}: {key[1] or key[0]}")
            continue
        seen.add(key)
        if row.get("parcel_id") and row["parcel_id"] not in known:
            unmatched.append(row["parcel_id"])
        try:
            payload = InvestmentIntakePayload(
                asking_price=_decimal_or_none(row.get("asking_price")),
                asking_price_date=_date_or_none(row.get("asking_price_date")),
                candidate_name=row.get("candidate_name") or "",
                listing_status=row.get("listing_status") or None,
                parcel_id=row.get("parcel_id") or None,
                property_type=row.get("property_type") or None,
                source_name=row.get("source_name") or None,
                source_type=(row.get("source_type") or "Manual Research"),
                source_url=row.get("source_url") or None,
                strategy=(row.get("strategy") or "development_land"),
                user_notes=row.get("notes") or None,
            )
        except Exception as exc:
            errors.append(f"row {index}: {exc}")
            continue
        created.append(create_intake_candidate(db, payload, investment_rows)["candidate"])
    return {"created": created, "created_count": len(created), "duplicates": duplicates, "errors": [e for e in errors if e], "unmatched_parcel_ids": sorted(set(unmatched))}


def compare_intake_candidates(
    db: Session,
    candidate_ids: list[str],
    investment_rows: list[dict[str, Any]],
) -> dict[str, Any]:
    analyses = [analysis for cid in candidate_ids if (analysis := analyze_intake_candidate(db, cid, investment_rows))]
    parcel_ids = [analysis["candidate"]["parcel_id"] for analysis in analyses if analysis["candidate"].get("parcel_id")]
    return {
        "caveats": [SAFE_CAVEAT, "Comparison shows tradeoffs only; it does not identify a winning parcel or purchase recommendation."],
        "comparison_summary": _comparison_summary(analyses),
        "intake_candidates": analyses,
        "screening_comparison": compare_candidates(investment_rows, parcel_ids, strategy=analyses[0]["candidate"]["strategy"] if analyses else "development_land"),
    }


def _acquisition_basis(
    candidate: dict[str, Any],
    match: dict[str, Any] | None,
    *,
    parcel_acres: float | None = None,
) -> dict[str, Any]:
    asking_price = _decimal_or_none(candidate.get("asking_price"))
    acres = parcel_acres or _acres_from_match(match)
    if asking_price is None:
        band = "Insufficient Acquisition Basis"
        ppa = None
        reasons: list[str] = []
        cautions = ["Acquisition basis unavailable because no asking price was entered."]
    elif asking_price <= 0:
        band = "Verification Required"
        ppa = None
        reasons = []
        cautions = ["Asking price must be greater than zero before basis context is interpreted."]
    elif not acres:
        band = "Insufficient Acquisition Basis"
        ppa = None
        reasons = []
        cautions = ["Parcel acreage is unavailable; asking price per acre cannot be calculated."]
    else:
        ppa = float(asking_price) / acres
        band = _asking_band(ppa, match)
        reasons = ["Current asking price per acre can be compared with available CFS comparable context."] if band not in {"Insufficient Acquisition Basis", "Verification Required"} else []
        cautions = _asking_cautions(band, match)
    return {
        "asking_basis_band": band,
        "asking_basis_summary": _asking_summary(band),
        "asking_price": float(asking_price) if asking_price is not None else None,
        "asking_price_date_age_days": _date_age_days(candidate.get("asking_price_date")),
        "asking_price_per_acre": round(ppa, 2) if ppa is not None else None,
        "asking_price_per_usable_acre": None,
        "basis_caution_reasons": cautions,
        "basis_positive_reasons": reasons,
        "evidence_type": "User-entered information",
        "parcel_acres": round(acres, 2) if acres else None,
        "usable_acreage_note": "Usable-acre calculations are not shown because CFS does not have a defensible usable-acreage proxy for this intake record.",
    }


def _asking_band(asking_ppa: float, match: dict[str, Any] | None) -> str:
    sale_band = str((match or {}).get("basis_context_band") or "")
    depth = str((match or {}).get("comparable_count_band") or "")
    if depth not in {"Moderate", "Strong"}:
        return "Insufficient Acquisition Basis"
    # ponytail: use existing qualitative sale band as the comparator until IP-2E exposes a public median comparable band.
    if sale_band in {"Supportive", "Moderately Supportive"}:
        return "Near Comparable Context"
    if sale_band == "Near Comparable Context":
        return "Near Comparable Context"
    if sale_band in {"Elevated", "Highly Elevated"}:
        return "Elevated"
    return "Verification Required"


def _asking_cautions(band: str, match: dict[str, Any] | None) -> list[str]:
    cautions = ["Asking price is user-entered and has not been independently verified by CFS."]
    if band in {"Insufficient Acquisition Basis", "Verification Required"}:
        cautions.append("Comparable depth or sale verification is insufficient for asking-basis interpretation.")
    if match and match.get("basis_caution_reasons"):
        cautions.extend(list(match["basis_caution_reasons"])[:3])
    return _unique(cautions)


def _asking_summary(band: str) -> str:
    if band == "Insufficient Acquisition Basis":
        return "Available asking-basis evidence is insufficient for comparison."
    if band == "Verification Required":
        return "Available asking-basis context requires manual verification before interpretation."
    return f"The available asking-basis context appears {band.lower()} relative to the current comparable group."


def _comparison_summary(analyses: list[dict[str, Any]]) -> list[str]:
    summaries: list[str] = []
    for analysis in analyses[:4]:
        candidate = analysis.get("candidate") or {}
        acquisition = analysis.get("acquisition_basis") or {}
        screening = analysis.get("screening_context") or {}
        dimensions = screening.get("dimension_bands") or {}
        label = candidate.get("candidate_name") or candidate.get("parcel_id") or "Candidate"
        summaries.append(
            f"{label}: asking-basis context is {acquisition.get('asking_basis_band') or 'unavailable'}; "
            f"development-readiness signal is {dimensions.get('readiness_signal') or 'Verify'}; "
            f"utility/constraint context requires due diligence."
        )
    return summaries


def _summary(candidate: dict[str, Any], investment_rows: list[dict[str, Any]], *, parcel_acres: float | None = None) -> dict[str, Any]:
    match = _matching_investment_row(candidate, investment_rows)
    acquisition = _acquisition_basis(candidate, match, parcel_acres=parcel_acres)
    screening = candidate_detail(investment_rows, candidate["parcel_id"], strategy=candidate["strategy"]) if match else None
    return {
        **candidate,
        "acquisition_basis_band": acquisition["asking_basis_band"],
        "comparable_context": (screening or {}).get("basis_context_band") or "Insufficient Basis Information",
        "constraint_burden": ((screening or {}).get("dimension_bands") or {}).get("constraint_burden") or "Verify",
        "data_confidence": (screening or {}).get("data_confidence_band") or "Data Needed",
        "parcel_match_status": "Matched CFS parcel context" if match else "Parcel ID not matched to current CFS investment context",
        "readiness_signal": ((screening or {}).get("dimension_bands") or {}).get("readiness_signal") or "Verify",
        "strategy_fit": ((screening or {}).get("dimension_bands") or {}).get("strategy_fit") or "Verify",
    }


def _matching_investment_row(candidate: dict[str, Any], rows: list[dict[str, Any]]) -> dict[str, Any] | None:
    parcel_id = str(candidate.get("parcel_id") or "")
    return next((row for row in rows if str(row.get("parcel_id") or row.get("signal_id") or row.get("row_id")) == parcel_id), None)


def _ensure_table(db: Session) -> None:
    db.execute(
        text(
            f"""
            CREATE TABLE IF NOT EXISTS {INTAKE_TABLE} (
                id text PRIMARY KEY,
                parcel_id text,
                candidate_name text NOT NULL,
                source_type text NOT NULL,
                source_name text,
                source_url text,
                asking_price numeric,
                asking_price_date date,
                listing_status text,
                listing_date date,
                expiration_or_review_date date,
                property_type text,
                strategy text NOT NULL,
                user_notes text,
                broker_notes text,
                review_status text NOT NULL DEFAULT 'New',
                date_added date,
                last_verified date,
                deed_review_status text NOT NULL DEFAULT 'Not Reviewed',
                deed_type text,
                market_sale_status text NOT NULL DEFAULT 'Not Reviewed',
                multi_parcel_review boolean NOT NULL DEFAULT false,
                verification_source text,
                verification_date date,
                verification_notes text,
                created_at timestamptz NOT NULL DEFAULT now(),
                updated_at timestamptz NOT NULL DEFAULT now()
            )
            """
        )
    )
    db.execute(text(f"CREATE INDEX IF NOT EXISTS idx_{INTAKE_TABLE}_parcel_id ON {INTAKE_TABLE}(parcel_id)"))


def _payload_values(values: dict[str, Any]) -> dict[str, Any]:
    out = dict(values)
    if out.get("source_url") is not None:
        out["source_url"] = str(out["source_url"])
    out.setdefault("date_added", date.today())
    return out


def _serialize(row: Any) -> dict[str, Any]:
    data = dict(row)
    for key, value in list(data.items()):
        if isinstance(value, Decimal):
            data[key] = float(value)
        elif isinstance(value, (datetime, date)):
            data[key] = value.isoformat()
    return data


def _acres_from_match(match: dict[str, Any] | None) -> float | None:
    for key in ("parcel_acres", "acreage", "acres"):
        try:
            value = float((match or {}).get(key) or 0)
        except (TypeError, ValueError):
            value = 0
        if value > 0:
            return value
    return None


def _parcel_acres(db: Session, parcel_id: Any) -> float | None:
    if not parcel_id:
        return None
    try:
        value = db.execute(
            text("SELECT parcel_area_acres_calc FROM parcels_enriched WHERE official_parcel_id = :parcel_id"),
            {"parcel_id": str(parcel_id)},
        ).scalar()
        return float(value) if value and float(value) > 0 else None
    except Exception:
        return None


def _date_age_days(value: Any) -> int | None:
    parsed = _date_or_none(value)
    return (date.today() - parsed).days if parsed else None


def _date_or_none(value: Any) -> date | None:
    if isinstance(value, date):
        return value
    if not value:
        return None
    return date.fromisoformat(str(value))


def _decimal_or_none(value: Any) -> Decimal | None:
    if value in (None, ""):
        return None
    try:
        return Decimal(str(value).replace("$", "").replace(",", "").strip())
    except (InvalidOperation, ValueError):
        raise ValueError("asking_price must be numeric")


def _unique(values: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for value in values:
        if value and value not in seen:
            seen.add(value)
            out.append(value)
    return out
