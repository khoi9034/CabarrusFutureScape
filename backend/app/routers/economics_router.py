"""CFS Economics screening intelligence routes."""

from __future__ import annotations

from collections import Counter
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import get_settings
from app.dependencies.database import get_read_only_db
from app.services.enterprise_export_service import build_enterprise_export_payload

router = APIRouter(prefix="/economics", tags=["CFS Economics"])

ECONOMICS_CACHE_TTL = timedelta(minutes=5)
_ECONOMICS_CACHE: dict[str, Any] = {"expires_at": None, "payload": None}


@router.get("/intelligence")
def get_economics_intelligence(
    db: Session = Depends(get_read_only_db),
) -> dict[str, Any]:
    """Return parcel economics screening signals for dashboard use."""

    return _cached_economics_intelligence(db)


@router.get("/enterprise-export")
def get_economics_enterprise_export(
    db: Session = Depends(get_read_only_db),
) -> dict[str, Any]:
    """Return connector-ready economics facts, dimensions, and decision pack."""

    return build_enterprise_export_payload(_cached_economics_intelligence(db), mode="live")


def _cached_economics_intelligence(db: Session) -> dict[str, Any]:
    cached_payload = _ECONOMICS_CACHE.get("payload")
    expires_at = _ECONOMICS_CACHE.get("expires_at")
    if isinstance(expires_at, datetime) and expires_at > datetime.now(UTC) and cached_payload:
        return cached_payload

    payload = build_economics_intelligence(db)
    # ponytail: process-local cache is enough for local presentation; use shared cache if multi-worker freshness matters.
    _ECONOMICS_CACHE["payload"] = payload
    _ECONOMICS_CACHE["expires_at"] = datetime.now(UTC) + ECONOMICS_CACHE_TTL
    return payload


def build_economics_intelligence(db: Session) -> dict[str, Any]:
    as_of = datetime.now(UTC).isoformat()
    caveats = [
        "CFS Economics is screening-level planning context, not a formal appraisal or tax bill.",
        "Estimated county tax uses a configurable rate and should be verified before fiscal analysis.",
        "Opportunity classes are transparent review bands, not approval recommendations.",
    ]

    if not _table_exists(db, "parcels_enriched"):
        return _unavailable_payload(as_of, "parcels_enriched is unavailable.")

    columns = {name for name in _table_columns(db, "parcels_enriched")}
    required_any = {"assessedvalue_numeric", "marketvalue_numeric", "parcel_area_acres_calc"}
    if not columns.intersection(required_any):
        return _unavailable_payload(
            as_of,
            "Parcel value and acreage fields are unavailable in parcels_enriched.",
        )

    dev_columns = set(_table_columns(db, "development_activity_parcel_summary")) if _table_exists(db, "development_activity_parcel_summary") else set()
    flood_columns = set(_table_columns(db, "parcel_flood_constraint_overlay")) if _table_exists(db, "parcel_flood_constraint_overlay") else set()
    school_columns = set(_table_columns(db, "parcel_school_summary")) if _table_exists(db, "parcel_school_summary") else set()
    zoning_columns = set(_table_columns(db, "parcel_zoning_overlay_v2")) if _table_exists(db, "parcel_zoning_overlay_v2") else set()
    dev_join = bool(dev_columns & {"development_activity_class", "dominant_permit_segment", "permit_segment"})
    flood_join = bool(flood_columns & {"flood_review_required", "flood_review_status", "flood_summary", "constraint_status"})
    school_join = bool(school_columns & {"school_summary_status", "capacity_status", "utilization_status"})
    zoning_join = bool(zoning_columns & {"zoning_jurisdiction_name", "zoning_district", "jurisdiction"})
    settings = get_settings()

    expressions = _parcel_economics_expressions(
        columns,
        dev_columns=dev_columns,
        flood_columns=flood_columns,
        school_columns=school_columns,
        zoning_columns=zoning_columns,
    )
    joins = "\n".join(
        join
        for join in [
            _optional_join(zoning_join, "parcel_zoning_overlay_v2", "z"),
            _optional_join(dev_join, "development_activity_parcel_summary", "d"),
            _optional_join(flood_join, "parcel_flood_constraint_overlay", "f"),
            _optional_join(school_join, "parcel_school_summary", "s"),
        ]
        if join
    )
    base_sql = f"""
      WITH base AS (
        SELECT
          p.official_parcel_id,
          {expressions['acreage']} AS acreage,
          {expressions['assessed']} AS assessed_value,
          {expressions['land']} AS land_value,
          {expressions['improvement']} AS improvement_value,
          COALESCE(
            NULLIF({expressions['zoning_geography']}, ''),
            NULLIF(p.subdiv_name, ''),
            NULLIF(p.nbh_name, ''),
            NULLIF(p.parcel_size_category, ''),
            'Parcel context'
          ) AS geography_label,
          {expressions['permit_context']} AS permit_activity_context,
          {expressions['flood_context']} AS floodplain_context,
          {expressions['school_context']} AS school_pressure_context
        FROM public.parcels_enriched p
        {joins}
        WHERE p.official_parcel_id IS NOT NULL
      ),
      calculated AS (
        SELECT
          *,
          CASE
            WHEN acreage > 0 AND assessed_value IS NOT NULL THEN assessed_value / acreage
            ELSE NULL
          END AS value_per_acre,
          CASE
            WHEN acreage > 0 AND land_value IS NOT NULL THEN land_value / acreage
            ELSE NULL
          END AS land_value_per_acre,
          CASE
            WHEN acreage > 0 AND improvement_value IS NOT NULL THEN improvement_value / acreage
            ELSE NULL
          END AS improvement_value_per_acre,
          CASE
            WHEN land_value > 0 AND improvement_value IS NOT NULL THEN improvement_value / land_value
            ELSE NULL
          END AS improvement_to_land_ratio
        FROM base
      )
    """
    summary_row = db.execute(
        text(
            base_sql
            + """
            SELECT
              COUNT(*) AS total_parcels_analyzed,
              SUM(assessed_value) AS total_assessed_value,
              SUM(land_value) AS total_land_value,
              SUM(improvement_value) AS total_improvement_value,
              percentile_cont(0.5) WITHIN GROUP (ORDER BY value_per_acre)
                FILTER (WHERE value_per_acre IS NOT NULL) AS median_value_per_acre,
              COUNT(*) FILTER (WHERE improvement_to_land_ratio < 0.65 AND land_value >= 100000 AND acreage >= 0.5) AS underbuilt_candidate_count,
              COUNT(*) FILTER (WHERE value_per_acre < 150000 AND acreage >= 1.0 AND assessed_value IS NOT NULL) AS high_opportunity_count,
              COUNT(*) FILTER (WHERE assessed_value IS NULL OR acreage IS NULL OR acreage <= 0) AS data_needed_count
            FROM calculated
            """
        ),
    ).mappings().one()
    signal_rows = db.execute(
        text(
            base_sql
            + """
            SELECT
              official_parcel_id,
              acreage,
              assessed_value,
              land_value,
              improvement_value,
              geography_label,
              permit_activity_context,
              floodplain_context,
              school_pressure_context,
              value_per_acre,
              land_value_per_acre,
              improvement_value_per_acre,
              improvement_to_land_ratio
            FROM calculated
            WHERE assessed_value IS NOT NULL OR value_per_acre IS NOT NULL
            ORDER BY
              CASE
                WHEN improvement_to_land_ratio < 0.65 AND land_value >= 100000 AND acreage >= 0.5 THEN 0
                WHEN value_per_acre < 150000 AND acreage >= 1.0 THEN 1
                ELSE 2
              END,
              assessed_value DESC NULLS LAST
            LIMIT 80
            """
        ),
    ).mappings().all()
    jurisdiction_rows = db.execute(
        text(
            base_sql
            + """
            SELECT
              geography_label,
              COUNT(*) AS parcel_count,
              SUM(assessed_value) AS total_assessed_value,
              percentile_cont(0.5) WITHIN GROUP (ORDER BY value_per_acre)
                FILTER (WHERE value_per_acre IS NOT NULL) AS median_value_per_acre,
              COUNT(*) FILTER (WHERE improvement_to_land_ratio < 0.65 AND land_value >= 100000 AND acreage >= 0.5) AS underbuilt_candidate_count
            FROM calculated
            WHERE geography_label IS NOT NULL
            GROUP BY geography_label
            ORDER BY SUM(assessed_value) DESC NULLS LAST
            LIMIT 12
            """
        ),
    ).mappings().all()

    signals = [
        _economics_signal(dict(row), settings.county_tax_rate_per_100)
        for row in signal_rows
    ]
    watchlist = [
        signal
        for signal in signals
        if signal["economic_status_band"]
        in {"underbuilt_watch", "redevelopment_opportunity", "tax_base_opportunity", "infrastructure_constrained", "data_needed"}
    ][:25]
    summary = {
        "as_of": as_of,
        "data_needed_count": _int(summary_row.get("data_needed_count")),
        "high_opportunity_count": _int(summary_row.get("high_opportunity_count")),
        "median_value_per_acre": _float(summary_row.get("median_value_per_acre")),
        "source_mode": "live",
        "total_assessed_value": _float(summary_row.get("total_assessed_value")),
        "total_improvement_value": _float(summary_row.get("total_improvement_value")),
        "total_land_value": _float(summary_row.get("total_land_value")),
        "total_parcels_analyzed": _int(summary_row.get("total_parcels_analyzed")),
        "underbuilt_candidate_count": _int(summary_row.get("underbuilt_candidate_count")),
    }
    underbuilt_watchlist = [
        signal
        for signal in signals
        if signal["economic_status_band"] == "underbuilt_watch"
    ][:25]
    return {
        "as_of": as_of,
        "caveats": caveats,
        "data_readiness": _economics_data_readiness(columns, dev_join, flood_join, school_join),
        "kpis": _economics_kpis(summary),
        "jurisdiction_value_summary": [
            _jurisdiction_summary(dict(row)) for row in jurisdiction_rows
        ],
        "mode": "live",
        "opportunity_class_breakdown": _opportunity_class_breakdown(signals),
        "parcel_economic_signals": signals,
        "scenario_templates": _scenario_templates(),
        "signals": signals,
        "summary": summary,
        "underbuilt_watchlist": underbuilt_watchlist,
        "watchlist": watchlist,
    }


def calculate_value_per_acre(assessed_value: float | None, acreage: float | None) -> float | None:
    if assessed_value is None or not acreage or acreage <= 0:
        return None
    return assessed_value / acreage


def calculate_improvement_to_land_ratio(
    improvement_value: float | None,
    land_value: float | None,
) -> float | None:
    if improvement_value is None or not land_value or land_value <= 0:
        return None
    return improvement_value / land_value


def estimate_county_tax(assessed_value: float | None, rate_per_100: float) -> float | None:
    if assessed_value is None:
        return None
    return assessed_value * rate_per_100 / 100


def _economics_signal(row: dict[str, Any], rate_per_100: float) -> dict[str, Any]:
    assessed = _float(row.get("assessed_value"))
    acreage = _float(row.get("acreage"))
    land = _float(row.get("land_value"))
    improvement = _float(row.get("improvement_value"))
    value_per_acre = _float(row.get("value_per_acre")) or calculate_value_per_acre(assessed, acreage)
    ratio = _float(row.get("improvement_to_land_ratio")) or calculate_improvement_to_land_ratio(improvement, land)
    status, opportunity = _status_band(value_per_acre, ratio, land, acreage, row)
    evidence = [
        f"Value per acre: {_money(value_per_acre) if value_per_acre is not None else 'data needed'}.",
        f"Improvement-to-land ratio: {ratio:.2f}" if ratio is not None else "Improvement-to-land ratio needs land and improvement values.",
        row.get("permit_activity_context") or "Permit activity context is not linked for this parcel.",
    ]
    return {
        "acreage": acreage,
        "assessed_value": assessed,
        "caveats": [
            "Screening-level economic context only.",
            "Estimated county tax is not a formal tax bill.",
            "Contact fields are excluded.",
        ],
        "economic_data_confidence": _economic_data_confidence(row, assessed, acreage, land, improvement),
        "economic_status_band": status,
        "estimated_county_tax": estimate_county_tax(assessed, rate_per_100),
        "estimated_county_tax_screening": estimate_county_tax(assessed, rate_per_100),
        "evidence": evidence,
        "floodplain_context": row.get("floodplain_context"),
        "geography_label": row.get("geography_label"),
        "improvement_to_land_ratio": ratio,
        "improvement_value": improvement,
        "improvement_value_per_acre": _float(row.get("improvement_value_per_acre")),
        "land_value": land,
        "land_value_per_acre": _float(row.get("land_value_per_acre")),
        "opportunity_class": opportunity,
        "parcel_id": str(row.get("official_parcel_id")),
        "permit_activity_context": row.get("permit_activity_context"),
        "recommended_followup": _recommended_followup(status),
        "related_layers": [
            "Revenue per Acre Dashboard",
            "Underbuilt Redevelopment Watchlist",
            "Constraint-Adjusted Development Potential",
        ],
        "school_pressure_context": row.get("school_pressure_context"),
        "transportation_context": None,
        "utility_readiness_context": "Official utility capacity remains a data need.",
        "value_per_acre": value_per_acre,
    }


def _status_band(
    value_per_acre: float | None,
    ratio: float | None,
    land_value: float | None,
    acreage: float | None,
    row: dict[str, Any],
) -> tuple[str, str]:
    context = " ".join(
        str(row.get(key) or "")
        for key in ("geography_label", "permit_activity_context", "floodplain_context", "school_pressure_context")
    ).lower()
    has_growth = any(term in context for term in ("permit", "growth", "recent", "residential", "new construction"))
    has_constraint = any(term in context for term in ("flood", "review", "capacity", "school", "constraint"))
    employment_context = any(term in context for term in ("industrial", "employment", "airport", "business", "commercial", "corridor"))
    residential_context = any(term in context for term in ("residential", "subdivision", "single", "multi", "housing"))

    if value_per_acre is None or acreage is None:
        return "data_needed", "Needs More Data Before Recommendation"
    if value_per_acre < 150000 and has_constraint and not has_growth:
        return "low_fiscal_high_burden", "Low Fiscal Upside / High Public Burden"
    if has_constraint and (value_per_acre >= 300000 or (land_value or 0) >= 100000):
        return "infrastructure_constrained", "High Value but Infrastructure-Constrained"
    if ratio is not None and ratio < 0.65 and (land_value or 0) >= 100000 and acreage >= 0.5:
        return "underbuilt_watch", "Underbuilt Redevelopment Candidate"
    if employment_context and acreage >= 2 and value_per_acre < 250000:
        return "industrial_employment_candidate", "Industrial / Employment Candidate"
    if residential_context and has_growth:
        return "residential_growth_pressure", "Residential Growth Pressure Area"
    if value_per_acre < 150000 and acreage >= 1.0 and has_growth:
        return "tax_base_opportunity", "Tax-Base Opportunity"
    if value_per_acre >= 500000:
        return "stable_high_value", "High-Value Stable Parcel"
    return "redevelopment_opportunity", "Tax-Base Opportunity"


def _recommended_followup(status: str) -> str:
    return {
        "data_needed": "Verify acreage, assessed value, land value, and improvement value fields.",
        "infrastructure_constrained": "Compare value context with floodplain, utility, transportation, and school pressure layers.",
        "stable_high_value": "Monitor as part of the parcel economic baseline.",
        "tax_base_opportunity": "Review zoning, constraints, permit activity, and service burden before scenario screening.",
        "underbuilt_watch": "Review parcel context, zoning, constraints, and recent permits before any redevelopment scenario.",
        "industrial_employment_candidate": "Review road access, utility readiness, constraints, and employment-site assumptions.",
        "low_fiscal_high_burden": "Verify public service burden before treating this as a fiscal opportunity.",
        "residential_growth_pressure": "Compare residential permit context with school, utility, and transportation burden.",
    }.get(status, "Review source records before drawing conclusions.")


def _economic_data_confidence(
    row: dict[str, Any],
    assessed: float | None,
    acreage: float | None,
    land: float | None,
    improvement: float | None,
) -> str:
    if assessed is not None and acreage and land is not None and improvement is not None:
        return "strong"
    if assessed is not None and acreage:
        return "medium"
    if row.get("permit_activity_context") or row.get("floodplain_context") or row.get("school_pressure_context"):
        return "proxy"
    return "data_needed"


def _opportunity_class_breakdown(signals: list[dict[str, Any]]) -> list[dict[str, Any]]:
    counts = Counter(str(signal.get("opportunity_class") or "Needs More Data Before Recommendation") for signal in signals)
    return [
        {"count": count, "opportunity_class": opportunity_class}
        for opportunity_class, count in counts.most_common()
    ]


def _jurisdiction_summary(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "geography_label": row.get("geography_label"),
        "median_value_per_acre": _float(row.get("median_value_per_acre")),
        "parcel_count": _int(row.get("parcel_count")),
        "total_assessed_value": _float(row.get("total_assessed_value")),
        "underbuilt_candidate_count": _int(row.get("underbuilt_candidate_count")),
    }


def _parcel_economics_expressions(
    columns: set[str],
    *,
    dev_columns: set[str],
    flood_columns: set[str],
    school_columns: set[str],
    zoning_columns: set[str],
) -> dict[str, str]:
    assessed_candidates = [
        "assessedvalue_numeric",
        "marketvalue_numeric",
        "total_value_numeric",
    ]
    assessed = _coalesce_numeric("p", columns, assessed_candidates)
    land = _numeric_column("p", columns, "landvalue_numeric")
    improvement = _coalesce_numeric(
        "p",
        columns,
        ["buildingvalue_numeric", "improvementvalue_numeric"],
    )
    if improvement == "NULL::numeric" and land != "NULL::numeric" and assessed != "NULL::numeric":
        improvement = f"GREATEST(({assessed}) - ({land}), 0)"
    return {
        "acreage": _coalesce_numeric("p", columns, ["parcel_area_acres_calc", "acreage"]),
        "assessed": assessed,
        "land": land,
        "improvement": improvement,
        "zoning_geography": _coalesce_text("z", zoning_columns, ["zoning_jurisdiction_name", "zoning_district", "jurisdiction"]),
        "permit_context": _coalesce_text("d", dev_columns, ["development_activity_class", "dominant_permit_segment", "permit_segment"]),
        "flood_context": _flood_context_expression(flood_columns),
        "school_context": _coalesce_text("s", school_columns, ["school_summary_status", "capacity_status", "utilization_status"]),
    }


def _coalesce_numeric(alias: str, columns: set[str], names: list[str]) -> str:
    exprs = [_numeric_column(alias, columns, name) for name in names if name in columns]
    return f"COALESCE({', '.join(exprs)})" if exprs else "NULL::numeric"


def _numeric_column(alias: str, columns: set[str], name: str) -> str:
    return f"NULLIF({alias}.{name}::text, '')::numeric" if name in columns else "NULL::numeric"


def _coalesce_text(alias: str, columns: set[str], names: list[str]) -> str:
    exprs = [f"NULLIF({alias}.{name}::text, '')" for name in names if name in columns]
    return f"COALESCE({', '.join(exprs)})" if exprs else "NULL::text"


def _flood_context_expression(columns: set[str]) -> str:
    if "flood_review_required" in columns:
        return "CASE WHEN f.flood_review_required THEN 'Floodplain review context' ELSE NULL END"
    return _coalesce_text("f", columns, ["flood_review_status", "flood_summary", "constraint_status"])


def _optional_join(enabled: bool, table_name: str, alias: str) -> str:
    if not enabled:
        return ""
    return (
        f"LEFT JOIN public.{table_name} {alias} "
        f"ON {alias}.official_parcel_id = p.official_parcel_id"
    )


def _table_exists(db: Session, table_name: str) -> bool:
    return bool(
        db.execute(
            text("SELECT to_regclass(:table_name) IS NOT NULL"),
            {"table_name": f"public.{table_name}"},
        ).scalar(),
    )


def _table_columns(db: Session, table_name: str) -> list[str]:
    rows = db.execute(
        text(
            """
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = :table_name
            """
        ),
        {"table_name": table_name},
    ).scalars()
    return [str(row) for row in rows]


def _economics_kpis(summary: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        _kpi("parcels_analyzed", "Parcels analyzed", summary["total_parcels_analyzed"], "parcels", "stable_high_value", "Parcel count with economics screening context."),
        _kpi("assessed_value_coverage", "Assessed value coverage", summary["total_assessed_value"], "dollars", "stable_high_value", "Screening-level assessed value total."),
        _kpi("median_value_per_acre", "Median value per acre", summary["median_value_per_acre"], "dollars_per_acre", "redevelopment_opportunity", "Parcel land efficiency context."),
        _kpi("underbuilt_candidates", "Underbuilt candidates", summary["underbuilt_candidate_count"], "parcels", "underbuilt_watch", "High land value plus low improvement-to-land ratio."),
        _kpi("tax_base_opportunity", "Tax-base opportunity signals", summary["high_opportunity_count"], "signals", "tax_base_opportunity", "Low current value per acre with enough acreage for review."),
        _kpi("data_needed", "Economic data needed", summary["data_needed_count"], "parcels", "data_needed", "Records missing key value or acreage fields."),
    ]


def _kpi(id: str, label: str, value: Any, unit: str | None, status: str, caveat: str) -> dict[str, Any]:
    return {
        "caveat": caveat,
        "id": id,
        "label": label,
        "status_band": status,
        "unit": unit,
        "value": value,
    }


def _economics_data_readiness(
    columns: set[str],
    dev_join: bool,
    flood_join: bool,
    school_join: bool,
) -> list[dict[str, Any]]:
    return [
        _readiness("Parcel Value", {"assessedvalue_numeric", "marketvalue_numeric"} & columns, "Assessed/market value baseline", "Add current appraisal extract if missing."),
        _readiness("Acreage", {"parcel_area_acres_calc", "acreage"} & columns, "Value-per-acre denominator", "Add reliable parcel acreage."),
        _readiness("Land / Improvement Split", {"landvalue_numeric", "buildingvalue_numeric", "improvementvalue_numeric"} & columns, "Improvement-to-land ratio", "Add land and improvement values."),
        _readiness("Permit Context", dev_join, "Growth pressure overlay", "Join recent permit activity to parcels."),
        _readiness("Constraint Context", flood_join and school_join, "Constraint-adjusted opportunity", "Join flood, school, utility, and transportation context."),
    ]


def _readiness(domain: str, available: Any, current_use: str, next_need: str) -> dict[str, Any]:
    status = "available" if bool(available) else "data_needed"
    return {
        "caveat": "Missing fields reduce economics confidence." if status != "available" else "Available for screening-level use.",
        "current_use": current_use,
        "data_status": status,
        "domain": domain,
        "gap_or_next_need": next_need,
    }


def _scenario_templates() -> list[dict[str, Any]]:
    return [
        _scenario("current_conditions", "Current Conditions", "Shows current value, acreage, constraints, and data confidence before scenario assumptions."),
        _scenario("growth_continues", "Growth Continues As-Is", "Tests whether current observed permit pressure reinforces existing fiscal/service tradeoffs."),
        _scenario("infrastructure_constrained_growth", "Infrastructure-Constrained Growth", "Tests where tax-base opportunity may be limited by utility, school, floodplain, or transportation burden."),
        _scenario("targeted_investment", "Targeted Investment Scenario", "Tests whether infrastructure investment could unlock future value in underbuilt or corridor parcels."),
        _scenario("higher_density_redevelopment", "Higher-Density Redevelopment Scenario", "Tests modeled tax-base lift against public cost risk under redevelopment assumptions."),
        _scenario("industrial_employment", "Employment / Industrial Scenario", "Tests employment land opportunity against road access, flood exposure, and service readiness."),
        _scenario("mixed_use_corridor", "Mixed-Use Corridor Scenario", "Tests corridor investment readiness and market + planning alignment."),
    ]


def _scenario(id: str, title: str, what_it_tests: str) -> dict[str, Any]:
    return {
        "caveats": [
            "Scenario values depend on assumptions.",
            "This is not an approval recommendation or official fiscal impact study.",
        ],
        "data_confidence": "screening",
        "id": id,
        "required_assumptions": [
            "future use intensity",
            "unit or square-foot assumptions",
            "service burden and infrastructure constraints",
        ],
        "title": title,
        "what_it_tests": what_it_tests,
    }


def _unavailable_payload(as_of: str, reason: str) -> dict[str, Any]:
    summary = {
        "as_of": as_of,
        "data_needed_count": 1,
        "high_opportunity_count": 0,
        "median_value_per_acre": None,
        "source_mode": "live",
        "total_assessed_value": None,
        "total_improvement_value": None,
        "total_land_value": None,
        "total_parcels_analyzed": 0,
        "underbuilt_candidate_count": 0,
    }
    return {
        "as_of": as_of,
        "caveats": [
            reason,
            "CFS Economics is screening-level context, not a formal appraisal or tax bill.",
        ],
        "data_readiness": [_readiness("Parcel Economics", False, "Economics mode unavailable state", reason)],
        "kpis": _economics_kpis(summary),
        "jurisdiction_value_summary": [],
        "mode": "live",
        "opportunity_class_breakdown": [],
        "parcel_economic_signals": [],
        "scenario_templates": _scenario_templates(),
        "signals": [],
        "summary": summary,
        "underbuilt_watchlist": [],
        "watchlist": [],
    }


def _float(value: Any) -> float | None:
    return float(value) if value is not None else None


def _int(value: Any) -> int:
    return int(value or 0)


def _money(value: float | None) -> str:
    return f"${value:,.0f}" if value is not None else "data needed"
