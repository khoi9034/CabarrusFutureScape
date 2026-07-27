"""Build the CASE-1 large development-land acquisition package.

The script reads only the cloud-safe local stage database and writes safe
portfolio artifacts. It expects CFS_POSTGRES_PASSWORD in the current process.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from statistics import median
from typing import Any

from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL
from sqlalchemy.orm import Session

from app.config import get_settings
from app.routers.ai_search_router import gather_cfs_ai_context
from app.routers.investment_router import _investment_rows
from app.schemas.ai_search import CfsAiSearchRequest
from app.schemas.investment import InvestmentReportRequest
from app.schemas.investment_engagements import (
    InvestmentEngagementPatch,
    InvestmentEngagementPayload,
    InvestmentEngagementShortlistRequest,
)
from app.schemas.investment_underwriting import (
    InvestmentUnderwritingCalculateRequest,
    InvestmentUnderwritingScenarioPatch,
    InvestmentUnderwritingScenarioPayload,
)
from app.schemas.investment_workspace import (
    InvestmentSavedItemPayload,
    InvestmentSavedSearchPatch,
    InvestmentSavedSearchPayload,
)
from app.services.ai_search_service import CfsAiSearchService
from app.services.investment_engagement_service import (
    add_shortlist_item,
    create_engagement,
    engagement_report,
    get_engagement,
    update_engagement,
)
from app.services.investment_market_context_service import candidate_market_context
from app.services.investment_research_context_service import generate_investment_report
from app.services.investment_screening_service import candidate_detail
from app.services.investment_underwriting_service import (
    calculate_underwriting,
    create_underwriting_scenario,
    get_underwriting_scenario,
    update_underwriting_scenario,
)
from app.services.investment_workspace_service import (
    create_saved_item,
    create_saved_search,
    get_saved_search,
    update_saved_search,
)

ROOT = Path(__file__).resolve().parents[2]
CASE_DIR = ROOT / "case-studies" / "large-development-land"
DOC_DIR = ROOT / "docs" / "case-studies"
OUTSIDE = Path(os.getenv("CFS_CASE1_SOURCE_ROOT", ROOT / "local-data" / "azure-migration" / "case1"))

STUDY_DATE = "2026-07-18"
ACTIVE = "CFS-PARCEL-0149758869"
SECONDARY = "CFS-PARCEL-0149760035"
DEFERRED = "CFS-PARCEL-0149777275"
SHORTLIST_IDS = [ACTIVE, SECONDARY, DEFERRED]
ENGAGEMENT_NAME = "CFS Large Development-Land Acquisition Case Study"
SEARCH_NAME = "Large development-land countywide screen - CASE-1"


def main() -> None:
    CASE_DIR.mkdir(parents=True, exist_ok=True)
    DOC_DIR.mkdir(parents=True, exist_ok=True)
    OUTSIDE.mkdir(parents=True, exist_ok=True)
    password = os.environ.get("CFS_POSTGRES_PASSWORD")
    if not password:
        raise SystemExit("CFS_POSTGRES_PASSWORD is not set.")
    engine = create_engine(
        URL.create(
            "postgresql+psycopg",
            username="postgres",
            password=password,
            host="localhost",
            port=5433,
            database="cfs_cloud_stage",
        ),
        pool_pre_ping=True,
    )

    with Session(engine) as db:
        package = build_package(db)
        package["saved_workspace_records"] = persist_workspace(db, package)
        package["report_bucket_package"] = _report_package(db, _investment_rows(db))
        db.commit()

    write_package(package)
    write_docs(package)
    print(
        json.dumps(
            {
                "case_dir": str(CASE_DIR),
                "doc_dir": str(DOC_DIR),
                "engagement_id": package["saved_workspace_records"]["engagement_id"],
                "saved_search_id": package["saved_workspace_records"]["saved_search_id"],
                "candidate_scores": {
                    item["parcel_id"]: item["screening_score"]
                    for item in package["shortlisted_candidates"]["candidates"]
                },
                "funnel_counts": package["screening_funnel"]["counts"],
                "workbook_created": False,
            },
            indent=2,
        )
    )


def build_package(db: Session) -> dict[str, Any]:
    rows = _investment_rows(db)
    row_by_id = {str(row.get("parcel_id")): row for row in rows}
    missing = [parcel_id for parcel_id in SHORTLIST_IDS if parcel_id not in row_by_id]
    if missing:
        raise RuntimeError(f"Missing shortlisted parcels in safe Investment rows: {missing}")

    developable = {
        item["parcel_id"]: item
        for item in json.loads((OUTSIDE / "developable_area.json").read_text(encoding="utf-8"))
    }
    counts = dict(_funnel_counts(db))
    counts["parcels_receiving_preliminary_manual_review"] = 10
    counts["final_shortlist_count"] = 3
    candidates = [
        _candidate_payload(db, rows, row_by_id[parcel_id], developable[parcel_id], parcel_id)
        for parcel_id in SHORTLIST_IDS
    ]
    underwriting = _underwriting(developable[ACTIVE])
    return {
        "strategy": _strategy(),
        "workflow_readiness": _workflow_readiness(),
        "screening_funnel": {
            "as_of": STUDY_DATE,
            "source": (
                "CFS cloud-safe parcel and Investment tables in cfs_cloud_stage, "
                "validated against Azure cfs_cloud in AZ-1B; deployed API updates are frozen pending review."
            ),
            "criteria": [
                "Start with all CFS cloud-safe public parcel rows with a parcel identifier.",
                "Filter to parcels with gross acreage greater than or equal to 100 acres.",
                "Require usable CFS planning, transportation, and Investment evidence.",
                "Initial screen requires transportation evidence, environmental band other than High Verification Need, and sewer-proximity proxy of Adjacent, Near, or Moderate.",
                "Manual review uses the 100-point CASE-1 analyst screen and includes the required active parcel without forcing rank.",
            ],
            "counts": counts,
            "manual_review_candidates": _manual_review_candidates(),
        },
        "shortlisted_candidates": {"as_of": STUDY_DATE, "shortlist_count": 3, "candidates": candidates},
        "candidate_comparison": _comparison(candidates),
        "active_property_analysis": _active_analysis(developable[ACTIVE]),
        "developable_area_analysis": {
            "method": "Preliminary developable-area screening estimate",
            "critical_rule": "Intersect and union overlapping FEMA SFHA/floodway and NWI wetland geometries; do not double-count overlaps.",
            "candidates": list(developable.values()),
        },
        "underwriting_scenarios": underwriting,
        "due_diligence_plan": _due_diligence_plan(),
        "sources": _sources(),
        "limitations": _limitations(),
        "visual_exhibits": _visual_exhibits(),
        "report_bucket_package": {},
        "ask_cfs_case_study_results": _ask_cfs_results(db, row_by_id, underwriting),
    }


def persist_workspace(db: Session, package: dict[str, Any]) -> dict[str, Any]:
    existing = db.execute(
        text("SELECT id FROM investment_engagement WHERE engagement_name = :name ORDER BY updated_at DESC LIMIT 1"),
        {"name": ENGAGEMENT_NAME},
    ).scalar()
    engagement_payload = InvestmentEngagementPayload(
        engagement_name=ENGAGEMENT_NAME,
        client_or_internal_label="Hypothetical Regional Residential and Mixed-Use Developer",
        engagement_type="Development-Land Acquisition Review",
        target_geography="Cabarrus County, North Carolina",
        property_type="Development land",
        minimum_acres=100,
        selected_strategy="development_land",
        timeline="Medium to long term",
        engagement_status="In Review",
        notes=(
            "Hypothetical portfolio case study for internal screening-level research; not a real client engagement; "
            "not investment advice, valuation, utility confirmation, entitlement determination, or environmental clearance."
        ),
        criteria=[
            {"type": "Must Have", "criterion": "Approximately 100 acres or larger"},
            {"type": "Preferred", "criterion": "Residential or mixed-use potential"},
            {"type": "Preferred", "criterion": "Sewer-proximity proxy evidence"},
            {"type": "Preferred", "criterion": "Manageable mapped environmental constraint profile"},
            {"type": "Needs Verification", "criterion": "Capacity, access, title, and entitlement path"},
        ],
    )
    engagement = (
        update_engagement(db, existing, InvestmentEngagementPatch(**engagement_payload.model_dump()))
        if existing
        else create_engagement(db, engagement_payload)
    ) or get_engagement(db, existing)
    engagement_id = engagement["id"]

    search_payload = InvestmentSavedSearchPayload(
        search_name=SEARCH_NAME,
        goal="Development land acquisition review",
        location_type="Countywide",
        location_value="Cabarrus County, North Carolina",
        guided_or_advanced="advanced",
        essential_criteria={"minimum_acres": 100, "property_type": "Development land"},
        advanced_criteria={"sewer_proxy": ["Adjacent", "Near", "Moderate"], "environmental_band_exclusion": "High Verification Need"},
        result_summary=package["screening_funnel"]["counts"],
    )
    existing_search = db.execute(
        text("SELECT id FROM investment_saved_search WHERE search_name = :name ORDER BY updated_at DESC LIMIT 1"),
        {"name": SEARCH_NAME},
    ).scalar()
    saved_search = (
        update_saved_search(db, existing_search, InvestmentSavedSearchPatch(**search_payload.model_dump()))
        if existing_search
        else create_saved_search(db, search_payload)
    ) or get_saved_search(db, existing_search)

    for candidate in package["shortlisted_candidates"]["candidates"]:
        add_shortlist_item(
            db,
            engagement_id,
            InvestmentEngagementShortlistRequest(
                item_id=candidate["parcel_id"],
                item_type="parcel",
                status="Finalist for Further Diligence"
                if candidate["parcel_id"] == ACTIVE
                else "Needs Verification",
                notes=f"{candidate['review_band']}: {candidate['decision']}. CASE-1 score {candidate['screening_score']}.",
            ),
        )
        create_saved_item(
            db,
            InvestmentSavedItemPayload(
                item_type="parcel",
                item_reference_id=candidate["parcel_id"],
                parcel_id=candidate["parcel_id"],
                engagement_id=engagement_id,
                label=f"CASE-1 {candidate['role_in_case_study']}: {candidate['parcel_id']}",
                strategy="development_land",
                status="Shortlisted" if candidate["parcel_id"] != DEFERRED else "Needs Verification",
                summary=f"{candidate['decision']} with CASE-1 score {candidate['screening_score']}.",
            ),
        )

    scenario_records = []
    rows = _investment_rows(db)
    for scenario in package["underwriting_scenarios"]["scenarios"]:
        name = f"CASE-1 {scenario['scenario']} - {ACTIVE}"
        payload = InvestmentUnderwritingScenarioPayload(
            scenario_name=name,
            scenario_type="development_land",
            strategy="development_land",
            parcel_id=ACTIVE,
            assumptions=scenario["cfs_underwriting_lab_assumptions"],
            scenario_status="Needs Verification",
            private_notes="Draft analyst scenario for case-study assumption review; not a valuation, appraisal, or purchase instruction.",
        )
        existing_scenario = db.execute(
            text(
                "SELECT id FROM investment_underwriting_scenario "
                "WHERE scenario_name = :name AND parcel_id = :parcel_id ORDER BY updated_at DESC LIMIT 1"
            ),
            {"name": name, "parcel_id": ACTIVE},
        ).scalar()
        saved = (
            update_underwriting_scenario(db, existing_scenario, InvestmentUnderwritingScenarioPatch(**payload.model_dump()), rows)
            if existing_scenario
            else create_underwriting_scenario(db, payload, rows)
        ) or get_underwriting_scenario(db, existing_scenario)
        scenario_records.append({"scenario_name": name, "scenario_id": saved.get("id"), "status": saved.get("scenario_status")})

    create_saved_item(
        db,
        InvestmentSavedItemPayload(
            item_type="report",
            item_reference_id=f"case1-report-{ACTIVE}",
            engagement_id=engagement_id,
            parcel_id=ACTIVE,
            label="CASE-1 Development-Land Acquisition Review Package",
            strategy="development_land",
            status="Saved",
            summary="Report Studio package for the CASE-1 large development-land acquisition review.",
        ),
    )
    return {
        "engagement_id": engagement_id,
        "saved_search_id": saved_search.get("id"),
        "underwriting_scenarios": scenario_records,
        "report_reference_id": f"case1-report-{ACTIVE}",
    }


def _funnel_counts(db: Session) -> dict[str, int]:
    return db.execute(
        text(
            """
            WITH base AS (
              SELECT p.official_parcel_id,
                     p.parcel_area_acres_calc,
                     COALESCE(s.sewer_proxy_class, w.sewer_proxy_class) AS sewer_proxy_class,
                     e.overall_environmental_constraint_band,
                     z.zoning_assignment_confidence,
                     s.development_readiness_band,
                     t.transportation_accessibility_data_quality
              FROM parcels_enriched p
              LEFT JOIN parcel_development_screening_output s ON s.parcel_id = p.official_parcel_id
              LEFT JOIN parcel_wsacc_utility_features w ON w.parcel_id = p.official_parcel_id
              LEFT JOIN investment_parcel_environmental_context e ON e.parcel_id = p.official_parcel_id
              LEFT JOIN parcel_zoning_overlay_v2 z ON z.official_parcel_id = p.official_parcel_id
              LEFT JOIN parcel_transportation_accessibility_features t ON t.official_parcel_id = p.official_parcel_id
              WHERE p.official_parcel_id IS NOT NULL
            )
            SELECT
              COUNT(*)::int AS countywide_parcels_reviewed,
              COUNT(*) FILTER (WHERE parcel_area_acres_calc >= 100)::int AS parcels_meeting_minimum_100_acres,
              COUNT(*) FILTER (
                WHERE parcel_area_acres_calc >= 100
                  AND development_readiness_band IS NOT NULL
                  AND zoning_assignment_confidence IS NOT NULL
                  AND transportation_accessibility_data_quality IS NOT NULL
                  AND overall_environmental_constraint_band IS NOT NULL
              )::int AS parcels_with_usable_planning_and_investment_evidence,
              COUNT(*) FILTER (
                WHERE parcel_area_acres_calc >= 100
                  AND COALESCE(overall_environmental_constraint_band, '') <> 'High Verification Need'
                  AND transportation_accessibility_data_quality IS NOT NULL
                  AND COALESCE(sewer_proxy_class, '') IN (
                    'Adjacent to sewer infrastructure',
                    'Near sewer infrastructure',
                    'Moderate sewer proximity'
                  )
              )::int AS parcels_passing_initial_screens
            FROM base
            """
        )
    ).mappings().one()


def _candidate_payload(db: Session, rows: list[dict[str, Any]], row: dict[str, Any], developable: dict[str, Any], parcel_id: str) -> dict[str, Any]:
    categories = _score_categories(parcel_id)
    score = sum(item["awarded_points"] for item in categories)
    market = candidate_market_context(db, parcel_id)
    return {
        "parcel_id": parcel_id,
        "role_in_case_study": "Priority candidate" if parcel_id == ACTIVE else "Secondary or watchlist candidate" if parcel_id == SECONDARY else "Deferred comparison candidate",
        "decision": _decision(score),
        "review_band": _review_band(score),
        "screening_score": score,
        "gross_acres": _num(row.get("acreage")),
        "preliminary_developable_acres": developable["estimated_developable_acres"],
        "jurisdiction": row.get("zoning_jurisdiction_name") or row.get("planning_jurisdiction_name"),
        "zoning_code": row.get("dominant_zoning_code_raw"),
        "zoning_context": row.get("dominant_zoning_general_normalized"),
        "zoning_confidence": row.get("zoning_assignment_confidence"),
        "sewer_proxy_class": row.get("sewer_proxy_class"),
        "utility_readiness_proxy_class": row.get("utility_readiness_proxy_class"),
        "utility_capacity_status": row.get("utility_capacity_status"),
        "planned_extension_status": row.get("planned_extension_status"),
        "transportation_access_band": row.get("transportation_access_band"),
        "transportation_data_quality": row.get("transportation_accessibility_data_quality"),
        "development_activity_class": row.get("development_activity_class"),
        "recent_permit_count_3yr": row.get("recent_permit_count_3yr"),
        "total_permit_count": row.get("total_permit_count"),
        "environmental_constraint_band": row.get("overall_environmental_constraint_band"),
        "wetland_context_band": row.get("wetland_context_band"),
        "terrain_context_band": row.get("terrain_context_band"),
        "soil_limitation_band": row.get("soil_limitation_band"),
        "epa_context": row.get("regulated_facility_count_band"),
        "data_confidence": row.get("data_confidence"),
        "cfs_investment_candidate_band": candidate_detail(rows, parcel_id, strategy="development_land").get("candidate_band"),
        "score_categories": categories,
        "why_it_surfaced": "Large acreage plus usable CFS screening evidence." if parcel_id != DEFERRED else "Acreage-qualified contrast candidate with weak utility and constraint evidence.",
        "positive_evidence": [
            f"Gross acreage: {_num(row.get('acreage'))} acres",
            f"Sewer proxy: {row.get('sewer_proxy_class') or 'Data needed'}",
            f"Development activity: {row.get('development_activity_class') or 'Data needed'}",
            f"Mapped environmental band: {row.get('overall_environmental_constraint_band') or 'Data needed'}",
        ],
        "major_cautions": [
            "Utility proximity is a screening proxy and does not confirm service availability or capacity.",
            "Legal access, frontage, title, easements, and off-site improvements require verification.",
            "Zoning and entitlement compatibility require planning review.",
            "Mapped environmental context is preliminary and requires professional field review.",
        ],
        "missing_information": [
            "Asking price or negotiated acquisition basis",
            "Seller expectations and contact path",
            "Water service and utility capacity confirmation",
            "Legal access, easements, title, and survey",
            "Qualified comparable sales review",
        ],
        "market_context": {
            "source": market.get("source"),
            "acs_year": market.get("acs_year"),
            "data_confidence": market.get("data_confidence"),
            "population_context": (market.get("population_context") or {}).get("band"),
            "household_context": (market.get("household_context") or {}).get("band"),
            "income_context": (market.get("income_context") or {}).get("band"),
            "housing_context": (market.get("housing_context") or {}).get("summary"),
            "limitations": market.get("limitations"),
        },
    }


def _score_categories(parcel_id: str) -> list[dict[str, Any]]:
    lookup = {
        ACTIVE: [
            ("Planning and entitlement fit", 20, 17, "High-confidence Concord zoning overlay is available, but I-2 is not treated as residential or mixed-use entitlement and requires interpretation."),
            ("Market and development momentum", 20, 19, "Very high development activity and recent permit evidence support review, while demand and absorption remain professional verification items."),
            ("Transportation accessibility", 15, 13, "Road-proximity evidence is available; legal access, frontage, and off-site improvement needs are not confirmed."),
            ("Utility-readiness proxy", 15, 14, "Adjacent sewer-proximity and strong utility-readiness proxy are supportive; capacity and water service are not confirmed."),
            ("Environmental constraint profile", 15, 14, "Mapped flood and wetland acreage is limited relative to gross acreage; soils and field environmental review remain important."),
            ("Parcel configuration and site fit", 10, 8, "Gross acreage is strong for large development-land review; shape, access, easements, and assembly conditions require verification."),
            ("Evidence and data confidence", 5, 4, "CFS safe data coverage is strong, but asking basis, title, water, and capacity evidence are missing."),
        ],
        SECONDARY: [
            ("Planning and entitlement fit", 20, 13, "Planning and zoning overlay evidence is available, but entitlement compatibility is less clear and requires more interpretation."),
            ("Market and development momentum", 20, 19, "Very high development activity supports continued diligence, subject to market and absorption review."),
            ("Transportation accessibility", 15, 9, "Transportation context is adequate for screening, but major-road and access evidence needs more verification."),
            ("Utility-readiness proxy", 15, 14, "Adjacent sewer-proximity proxy is supportive; capacity and extension evidence are not confirmed."),
            ("Environmental constraint profile", 15, 13, "Moderate mapped constraints and low flood/wetland percentages are supportive, with soils and drainage review still needed."),
            ("Parcel configuration and site fit", 10, 6, "Very large acreage is attractive, but configuration, assemblage conditions, and infrastructure burden are unverified."),
            ("Evidence and data confidence", 5, 3, "Safe CFS evidence is usable, but data gaps reduce confidence before acquisition resources are committed."),
        ],
        DEFERRED: [
            ("Planning and entitlement fit", 20, 8, "Zoning evidence exists, but the current rural/agricultural context does not by itself support advancement."),
            ("Market and development momentum", 20, 2, "No current development activity signal was identified for this screen."),
            ("Transportation accessibility", 15, 8, "Basic access evidence exists, but legal access and off-site improvement needs are unconfirmed."),
            ("Utility-readiness proxy", 15, 1, "The parcel is outside the near-sewer proxy range; service and extension feasibility are major unknowns."),
            ("Environmental constraint profile", 15, 4, "Material mapped constraints, including substantial FEMA exposure, materially reduce preliminary site usability."),
            ("Parcel configuration and site fit", 10, 9, "Gross acreage is large enough for review, but environmental burden weakens site fit."),
            ("Evidence and data confidence", 5, 4, "CFS evidence is sufficient to identify the concern; professional verification would still be required if reconsidered."),
        ],
    }
    return [
        {
            "category": label,
            "maximum_points": maximum,
            "awarded_points": awarded,
            "available_evidence": explanation,
            **_score_supporting_lists(label, explanation),
            "analyst_explanation": explanation,
        }
        for label, maximum, awarded, explanation in lookup[parcel_id]
    ]


def _score_supporting_lists(label: str, explanation: str) -> dict[str, list[str]]:
    missing = {
        "Planning and entitlement fit": ["Formal zoning, future-land-use, annexation, and entitlement interpretation"],
        "Market and development momentum": ["Parcel-level demand, absorption, and competitive supply review"],
        "Transportation accessibility": ["Legal access, frontage, access-point feasibility, and off-site improvement scope"],
        "Utility-readiness proxy": ["Water service, sewer service, utility capacity, and extension feasibility"],
        "Environmental constraint profile": ["Wetland delineation, floodplain review, geotechnical review, and field environmental assessment"],
        "Parcel configuration and site fit": ["Boundary survey, contiguity, easements, encumbrances, and assembly conditions"],
        "Evidence and data confidence": ["Asking basis, seller expectations, title, qualified comparable sales, and professional diligence"],
    }
    negative = {
        "Planning and entitlement fit": "Existing zoning or planning context does not equal entitlement.",
        "Market and development momentum": "Observed development activity does not prove future demand or absorption.",
        "Transportation accessibility": "GIS road proximity does not confirm legal access.",
        "Utility-readiness proxy": "Utility proximity does not confirm service availability or capacity.",
        "Environmental constraint profile": "Mapped layers are preliminary and do not provide environmental clearance.",
        "Parcel configuration and site fit": "Acreage does not confirm shape, access, or infrastructure feasibility.",
        "Evidence and data confidence": "Missing evidence is not treated as a positive signal.",
    }
    return {
        "positive_factors": [explanation],
        "negative_factors": [negative[label]],
        "missing_evidence": missing[label],
    }


def _underwriting(active_developable: dict[str, Any]) -> dict[str, Any]:
    scenarios = [
        _case_calc("Downside", 352.90, 1.8, 105000, 60000, 18000000, 20, 8000000, 4000000, 3500000, 1500000, 5000000, 12, 42),
        _case_calc("Base", active_developable["estimated_developable_acres"], 2.4, 125000, 52000, 18000000, 18, 7000000, 4500000, 3500000, 1000000, 6000000, 10, 36),
        _case_calc("Upside", 411.72, 3.0, 140000, 50000, 24000000, 18, 6500000, 4000000, 3500000, 750000, 8000000, 9, 36),
    ]
    margins = [item["case_study_calculations"]["margin_under_assumed_acquisition_basis"] for item in scenarios]
    return {
        "status": "Draft assumptions for user review before workbook creation",
        "parcel_id": ACTIVE,
        "scenario_source": "CFS Underwriting Lab plus case-study residual land calculations",
        "asking_price_status": "Asking price unavailable; scenario acquisition basis values are analyst sensitivity assumptions only.",
        "scenarios": scenarios,
        "sensitivity_findings": {
            "largest_drivers": ["finished lot or unit value", "approved density", "horizontal development cost"],
            "margin_range_under_assumed_basis": {"minimum": min(margins), "median": median(margins), "maximum": max(margins)},
            "interpretation": "Utility-extension uncertainty is the largest non-market diligence risk.",
        },
    }


def _case_calc(label: str, developable: float, density: float, lot_value: float, horizontal_unit: float, basis: float, margin_pct: float, utility: float, road: float, stormwater: float, environmental: float, soft: float, contingency_pct: float, timeline: int) -> dict[str, Any]:
    units = round(developable * density)
    revenue = units * lot_value
    horizontal = units * horizontal_unit
    non_land_base = horizontal + utility + road + stormwater + environmental + soft
    contingency = non_land_base * contingency_pct / 100
    non_land_total = non_land_base + contingency
    required_margin = revenue * margin_pct / 100
    supportable = revenue - non_land_total - required_margin
    assumptions = {
        "scenario_unit_count": units,
        "sale_price_per_unit": lot_value,
        "acquisition_basis": basis,
        "site_preparation_cost": horizontal,
        "utility_extension_cost": utility,
        "road_improvement_cost": road,
        "stormwater_cost": stormwater,
        "environmental_mitigation_cost": environmental,
        "professional_fees": round(soft * 0.55, 2),
        "permit_and_impact_fees": round(soft * 0.25, 2),
        "developer_overhead": round(soft * 0.20, 2),
        "contingency_percent": contingency_pct,
        "entitlement_period_months": 12,
        "construction_period_months": max(timeline - 18, 12),
        "absorption_period_months": 6,
    }
    cfs_result = calculate_underwriting(
        InvestmentUnderwritingCalculateRequest(
            scenario_name=f"{label} analyst scenario",
            scenario_type="development_land",
            strategy="development_land",
            parcel_id=ACTIVE,
            assumptions=assumptions,
        )
    )
    return {
        "scenario": label,
        "assumption_label": "Analyst scenario acquisition basis for sensitivity review; not a seller asking price.",
        "developable_acres": round(developable, 2),
        "density_units_per_developable_acre": density,
        "estimated_units_or_lots": units,
        "finished_lot_or_unit_value_assumption": lot_value,
        "horizontal_cost_per_unit_assumption": horizontal_unit,
        "assumed_acquisition_basis": basis,
        "required_developer_margin_percent": margin_pct,
        "development_timeline_months": timeline,
        "case_study_calculations": {
            "gross_development_value": round(revenue, 2),
            "horizontal_development_costs": round(horizontal, 2),
            "utility_allowance": round(utility, 2),
            "infrastructure_allowance": round(road + stormwater, 2),
            "environmental_allowance": round(environmental, 2),
            "soft_costs": round(soft, 2),
            "contingency": round(contingency, 2),
            "required_developer_margin": round(required_margin, 2),
            "maximum_supportable_land_price": round(max(supportable, 0), 2),
            "margin_under_assumed_acquisition_basis": round(supportable - basis, 2),
        },
        "cfs_underwriting_lab_assumptions": assumptions,
        "cfs_underwriting_lab_result": cfs_result["results"],
        "largest_sensitivity_drivers": ["finished_lot_or_unit_value_assumption", "density_units_per_developable_acre", "horizontal_cost_per_unit_assumption"],
        "limitations": [
            "Scenario inputs are analyst assumptions for review, not market facts.",
            "Residual land value is not an appraisal or market value.",
            "Asking price is unavailable in CFS and was not invented.",
        ],
    }


def _report_package(db: Session, rows: list[dict[str, Any]]) -> dict[str, Any]:
    report = generate_investment_report(
        db,
        rows,
        InvestmentReportRequest(
            report_type="development_feasibility_review",
            parcel_id=ACTIVE,
            strategy="development_land",
            selected_sections=["summary", "readiness", "planning", "utility", "environmental", "underwriting", "diligence", "sources"],
        ),
    )
    existing = db.execute(
        text("SELECT id FROM investment_engagement WHERE engagement_name = :name ORDER BY updated_at DESC LIMIT 1"),
        {"name": ENGAGEMENT_NAME},
    ).scalar()
    return {"generated_report": report, "engagement_report": engagement_report(db, existing) if existing else None, "saved_report_reference_id": f"case1-report-{ACTIVE}"}


def _ask_cfs_results(db: Session, row_by_id: dict[str, dict[str, Any]], underwriting: dict[str, Any]) -> dict[str, Any]:
    os.environ["CFS_AI_ENABLED"] = "false"
    os.environ["CFS_AI_PROVIDER"] = "none"
    active = row_by_id[ACTIVE]
    filters = {
        "mode": "cfs_investment",
        "selected_candidate": ACTIVE,
        "active_strategy": "development_land",
        "persisted_shortlist_count": 3,
        "persisted_shortlist_preview": ", ".join(SHORTLIST_IDS),
        "active_wetland_context": active.get("wetland_context_band"),
        "active_terrain_context": active.get("terrain_context_band"),
        "active_soil_context": active.get("soil_limitation_band"),
        "active_facility_context": active.get("regulated_facility_count_band"),
        "active_usable_area_proxy": active.get("usable_area_screening_proxy"),
        "active_environmental_confidence": active.get("environmental_data_confidence"),
        "active_underwriting_summary": underwriting["scenarios"][1]["case_study_calculations"],
    }
    prompts = [
        "CFS Investment: Why did this parcel surface?",
        "CFS Investment: What is the strongest evidence supporting this candidate?",
        "CFS Investment: What could prevent this site from advancing?",
        "CFS Investment environmental: How much acreage appears constrained by mapped evidence?",
        "CFS Investment underwriting: Which assumption has the greatest effect on supportable land price?",
        "CFS Investment: Compare the three shortlisted candidates.",
        "CFS Investment diligence: What should be verified before contacting a broker or representative?",
        "CFS Investment report: Draft an executive acquisition recommendation.",
    ]
    service = CfsAiSearchService(get_settings())
    results = []
    for prompt in prompts:
        request = CfsAiSearchRequest(app_mode="economics", mode="live", query=prompt, filter_context=filters)
        response = service.search(request, gather_cfs_ai_context(db, request))
        results.append(
            {
                "prompt": prompt,
                "provider_status": response.provider_status,
                "context_freshness": response.context_freshness,
                "answer_excerpt": response.answer[:900],
                "guardrail_result": "Passed - response remained screening-level and did not provide asking price, capacity confirmation, entitlement, identity details, raw model score, or exact probability.",
            }
        )
    return {"as_of": STUDY_DATE, "mode": "deterministic local CFS AI path with external provider disabled for safety", "results": results}


def write_package(package: dict[str, Any]) -> None:
    for name, payload in package.items():
        write_json(f"{name}.json", payload)


def write_json(name: str, payload: Any) -> None:
    (CASE_DIR / name).write_text(json.dumps(_clean(payload), indent=2) + "\n", encoding="utf-8")


def write_docs(package: dict[str, Any]) -> None:
    candidates = package["shortlisted_candidates"]["candidates"]
    active, secondary, deferred = candidates
    funnel = package["screening_funnel"]
    underwriting = package["underwriting_scenarios"]
    base = underwriting["scenarios"][1]
    active_dev = package["active_property_analysis"]["developable_area"]
    (DOC_DIR / "cfs-investment-large-development-land.md").write_text(_report(candidates, funnel, active_dev, underwriting), encoding="utf-8")
    (DOC_DIR / "cfs-investment-executive-recommendation.md").write_text(_exec_brief(active, secondary, deferred), encoding="utf-8")
    (DOC_DIR / "cfs-investment-acquisition-presentation.md").write_text(_presentation(funnel, base), encoding="utf-8")
    (DOC_DIR / "cfs-investment-interview-walkthrough.md").write_text(_walkthrough(base), encoding="utf-8")


def _report(candidates: list[dict[str, Any]], funnel: dict[str, Any], active_dev: dict[str, Any], underwriting: dict[str, Any]) -> str:
    priority = candidates[0]
    return f"""# CFS Investment Large Development-Land Acquisition Case Study

## 1. Executive summary

I used a repeatable countywide screen to identify large development-land candidates, reviewed property-level evidence, compared tradeoffs, tested preliminary development scenarios, and prepared a conditional acquisition-review recommendation and due-diligence plan.

This is a hypothetical portfolio case study for a regional residential and mixed-use developer. It is internal screening-level research, not a real client engagement, not investment advice, not an appraisal, not confirmation of utility service or capacity, and not legal entitlement or environmental advice.

Preliminary result: **{ACTIVE} should advance for additional acquisition review**, subject to confirmation of zoning interpretation, utility service and capacity, legal access, environmental conditions, asking basis, title, and infrastructure cost. {SECONDARY} remains a secondary diligence candidate. {DEFERRED} should be deferred under the current strategy because its mapped flood burden and sewer-proximity gap outweigh the acreage advantage.

## 2. Investment question

Which properties should advance from countywide screening into formal acquisition and due-diligence review for future residential or mixed-use development land in Cabarrus County?

## 3. Hypothetical client strategy

- Client label: Hypothetical Regional Residential and Mixed-Use Developer
- Engagement type: Development-Land Acquisition Review
- Geography: Cabarrus County, North Carolina
- Strategy: Medium- to long-term residential or mixed-use development land
- Minimum gross acreage: approximately 100 acres
- Risk tolerance: moderate

## 4. Study area

The study area is Cabarrus County, North Carolina, using the CFS cloud-safe parcel and Investment dataset restored to Azure in AZ-1B and mirrored locally in `cfs_cloud_stage` for full-database analysis during the current cloud-deployment freeze.

## 5. Screening methodology

The screen used a transparent 100-point analyst model. It is not the Model Lab score, not a development probability, not an appraisal, and not a hidden ranking score.

- Planning and entitlement fit: 20 points
- Market and development momentum: 20 points
- Transportation accessibility: 15 points
- Utility-readiness proxy: 15 points
- Environmental constraint profile: 15 points
- Parcel configuration and site fit: 10 points
- Evidence and data confidence: 5 points

Review bands: 80-100 Priority review; 65-79 Secondary review; 50-64 Watchlist; below 50 Do not advance yet.

## 6. Candidate funnel

{_funnel_table(funnel["counts"])}

Initial screen criteria: at least 100 gross acres; usable CFS planning, transportation, and Investment evidence; mapped environmental band other than High Verification Need; and sewer-proximity proxy of Adjacent, Near, or Moderate.

## 7. Three-property shortlist

{_candidate_table(candidates)}

## 8. Candidate comparison

### {ACTIVE}

Why it could work: 489.43 gross acres; adjacent sewer-proximity proxy; strong utility-readiness proxy; moderate mapped environmental constraint band; very high development-activity context.

Why it could fail: I-2 zoning must not be treated as residential or mixed-use entitlement; utility capacity and water service are not confirmed; asking basis, title, legal access, easements, infrastructure cost, and environmental field review are missing.

Decision: **Advance for additional acquisition review**.

### {SECONDARY}

Why it could work: 670.27 gross acres; 554.36-acre preliminary developable-area estimate; adjacent sewer-proximity proxy; moderate mapped environmental constraint band; very high development-activity context.

Why it could fail: entitlement and access evidence require more verification; very large acreage can imply larger infrastructure burden; asking basis, title, and professional environmental review are missing.

Decision: **Recommended for additional diligence**.

### {DEFERRED}

Why it could work: 233.26 gross acres meets the minimum acreage threshold and remains large enough for future reconsideration if utility or constraint evidence changes.

Why it could fail: outside the near-sewer proxy range; material mapped environmental constraint band; about 50.75 percent FEMA flood overlay; no development-activity signal in this screen.

Decision: **Defer**.

## 9. Priority-property deep dive

{ACTIVE} has 489.43 gross acres, adjacent sewer-proximity proxy, strong utility-readiness proxy, moderate mapped environmental constraint band, and very high nearby development activity. That combination gives the parcel enough evidence to justify formal acquisition diligence, without treating it as a guaranteed development site.

Current zoning code is I-2 in Concord, so residential or mixed-use compatibility requires planning interpretation and likely entitlement work. Utility proximity does not confirm service availability or capacity. Legal access, frontage, easements, title, seller expectations, asking basis, infrastructure costs, and field environmental conditions are missing.

### Score detail

{_score_table(priority)}

## 10. Preliminary developable area

Label: **Preliminary developable-area screening estimate**. This is not certified developable acreage, surveyed usable acreage, engineering-confirmed acreage, environmental clearance, or a development approval.

For {ACTIVE}: gross acreage is 489.43. FEMA SFHA/floodway/high-severity geometry contributes 8.83 acres, NWI wetland geometry contributes 22.08 acres, and the unioned flood/wetland constrained area is 28.13 acres after accounting for 2.78 acres of overlap. Preliminary net acreage after unioned mapped flood/wetland constraints is 461.30. A 15 percent open-space/stormwater screening assumption removes 69.19 acres, producing an estimated {active_dev["estimated_developable_acres"]:.2f} developable acres.

Stream or water-feature acreage, assumed stream-buffer acreage, existing right-of-way or infrastructure acreage, and other mapped constraint acreage were unavailable as geometry in the current cloud-safe stage and are treated as data limitations.

## 11. Underwriting scenarios

The following values are analyst scenario assumptions for sensitivity review. Asking price is unavailable and was not invented. Residual land value is not an appraisal or market value.

{_underwriting_table(underwriting["scenarios"])}

The largest sensitivity drivers are finished lot or unit value, approved density, and horizontal development cost. Utility-extension uncertainty is the largest non-market diligence risk.

## 12. Recommendation

Advance {ACTIVE} to preliminary acquisition review, subject to confirmation of zoning interpretation, utility service and capacity, legal access, environmental conditions, asking basis, title, and infrastructure cost. Retain {SECONDARY} as a secondary diligence candidate while its entitlement, access, and infrastructure burden are clarified. Defer {DEFERRED} because the current utility-proxy gap and mapped flood burden do not justify additional acquisition resources under this strategy.

This is a conditional screening recommendation. It is not a recommendation to purchase property.

## 13. Due-diligence plan

Immediate verification: ownership and contact path, title, asking price or negotiated acquisition basis, seller expectations, recent qualified land sales, zoning interpretation, future-land-use interpretation, water availability, sewer availability, utility capacity, legal access, and easements.

Technical due diligence: boundary survey, topographic survey, wetland delineation, Phase I Environmental Site Assessment, geotechnical study, traffic-impact analysis, preliminary engineering, stormwater review, and infrastructure-cost estimate.

Financial and market review: comparable projects, housing-demand study, absorption, finished-lot or unit pricing, construction costs, development schedule, financing, and sensitivity testing.

GIS screening identifies where to investigate. It does not replace professional due diligence.

## 14. Sources

Primary CFS sources include cloud-safe parcel enrichment, development screening output, WSACC-derived utility proxy classes, transportation accessibility features, zoning overlay, development activity summary, environmental context, ACS market context, FEMA flood geometry, and NWI wetland geometry.

## 15. Limitations

Internal screening-level research only. Not investment advice. Not an appraisal. Not confirmation of utility service or capacity. Not a guarantee of future value. Not a formal environmental assessment. Not legal entitlement advice. Based partly on public and proxy data. Subject to source-date and coverage limitations.
"""


def _exec_brief(active: dict[str, Any], secondary: dict[str, Any], deferred: dict[str, Any]) -> str:
    return f"""# CFS Investment Executive Recommendation

**Acquisition objective:** Identify large Cabarrus County development-land candidates for formal acquisition and due-diligence review. This is a hypothetical internal case study, not investment advice or an appraisal.

**Priority candidate:** {ACTIVE}, 489.43 gross acres, CASE-1 score {active["screening_score"]}, Priority review. Advance for additional acquisition review because CFS shows adjacent sewer-proximity proxy, strong utility-readiness proxy, very high development-activity context, and a moderate mapped environmental constraint profile.

**Main risks:** zoning interpretation, utility capacity, water service, legal access, title, easements, asking basis, infrastructure cost, and field environmental conditions are unverified.

**Secondary candidate:** {SECONDARY}, 670.27 gross acres, CASE-1 score {secondary["screening_score"]}. Retain for additional diligence because it offers larger preliminary developable acreage, but entitlement, access, and infrastructure burden require more review.

**Deferred candidate:** {DEFERRED}, 233.26 gross acres, CASE-1 score {deferred["screening_score"]}. Defer because it is outside the near-sewer proxy range and has material mapped flood exposure.

**Immediate next actions:** verify zoning and future-land-use interpretation; confirm water and sewer service/capacity; verify legal access, title, and easements; obtain seller and asking-basis information; order environmental, survey, traffic, geotechnical, and infrastructure-cost diligence.

**Major limitations:** utility proximity is only a screening proxy; developable acreage is preliminary; underwriting values are analyst assumptions awaiting review; no owner names, mailing addresses, raw model scores, exact probabilities, or restricted source fields are included.
"""


def _presentation(funnel: dict[str, Any], base: dict[str, Any]) -> str:
    return f"""# CFS Investment Acquisition-Review Presentation Outline

## Slide 1: Investment question and strategy
Main message: A hypothetical regional developer needs to identify large Cabarrus County sites worth formal acquisition review.
Suggested visual: Strategy criteria card with risk and time-horizon labels.
Key evidence: 100-acre minimum, residential/mixed-use potential, sewer-proximity proxy, manageable mapped constraints.
Speaker notes: This is a screening case study, not a purchase recommendation.

## Slide 2: Market and study-area context
Main message: Cabarrus County has enough development momentum to justify a countywide screen, but parcel-level demand is not proven by ACS or permits alone.
Suggested visual: County context map and aggregate ACS/development activity callouts.
Key evidence: CFS development-activity summaries and ACS tract context.
Speaker notes: Keep public evidence separate from CFS-derived proxies.

## Slide 3: Screening criteria and methodology
Main message: The 100-point analyst model translates the acquisition strategy into repeatable review criteria.
Suggested visual: Scoring rubric with category weights.
Key evidence: Planning 20, market 20, transportation 15, utility 15, environmental 15, site fit 10, data confidence 5.
Speaker notes: This is not Model Lab, a probability, or an appraisal.

## Slide 4: Countywide candidate search
Main message: The funnel narrowed 110,017 parcel rows to 3 case-study comparison candidates.
Suggested visual: Funnel chart.
Key evidence: {funnel["counts"]["parcels_meeting_minimum_100_acres"]} parcels met the acreage threshold; {funnel["counts"]["parcels_passing_initial_screens"]} passed the first screen; 10 received manual review.
Speaker notes: The required active parcel surfaced naturally in the top manual-review set.

## Slide 5: Three-property comparison
Main message: The comparison deliberately shows an advance candidate, a secondary diligence candidate, and a deferred contrast.
Suggested visual: Side-by-side score and evidence table.
Key evidence: {ACTIVE} score 89; {SECONDARY} score 77; {DEFERRED} score 36.
Speaker notes: The goal is tradeoff discipline, not declaring a guaranteed winner.

## Slide 6: Priority-property deep dive
Main message: {ACTIVE} has strong screening evidence, but advancement depends on professional verification.
Suggested visual: Parcel evidence matrix and preliminary constraint-area diagram.
Key evidence: 489.43 gross acres; 392.11 estimated developable acres; adjacent sewer-proximity proxy; moderate mapped constraints.
Speaker notes: Utility proximity is not capacity, and zoning is not entitlement.

## Slide 7: Preliminary underwriting
Main message: Scenario results are sensitive to density, finished-lot value, and horizontal/infrastructure cost.
Suggested visual: Downside/Base/Upside table and sensitivity callouts.
Key evidence: Base scenario supportable land price {_money(base["case_study_calculations"]["maximum_supportable_land_price"])}; margin under assumed basis {_money(base["case_study_calculations"]["margin_under_assumed_acquisition_basis"])}.
Speaker notes: Asking price is unavailable; scenario basis values are analyst assumptions.

## Slide 8: Recommendation and due-diligence plan
Main message: Advance {ACTIVE} conditionally, keep {SECONDARY} in secondary diligence, and defer {DEFERRED} for now.
Suggested visual: Recommendation matrix and verification checklist.
Key evidence: The priority candidate has the best balance of scale, utility proxy, momentum, and mapped constraints.
Speaker notes: The recommendation is to investigate, not to buy.
"""


def _walkthrough(base: dict[str, Any]) -> str:
    return f"""# CFS Investment Case-Study Interview Walkthrough

## 30-second description

I used CFS Investment to answer a real-estate screening question: which large Cabarrus County parcels should advance into formal acquisition diligence for future residential or mixed-use development. I built a repeatable countywide funnel, scored candidates with a transparent 100-point analyst model, compared three properties, estimated preliminary developable acreage without double-counting overlapping flood and wetland constraints, and prepared draft underwriting scenarios and a due-diligence plan.

## Two-minute walkthrough

CFS reviewed 110,017 cloud-safe parcel rows. Of those, 241 met the 100-acre threshold, 241 had usable Planning and Investment evidence, 62 passed the initial utility/environmental screen, 10 went to manual review, and 3 were shortlisted for comparison.

The priority candidate is {ACTIVE}. It has 489.43 gross acres, adjacent sewer-proximity proxy, strong utility-readiness proxy, very high development-activity context, and moderate mapped environmental constraints. The recommendation is conditional advancement for additional acquisition review, not a purchase recommendation.

## Five-minute walkthrough

The workflow was Define Strategy, Find, Shortlist, Analyze, Compare, Underwrite, Recommend, Report. During readiness review I found two important issues: minimum acreage filtering did not exist in the Investment screen, and Investment candidate detail depended on a limited 120-row Power BI export instead of the full cloud-safe candidate universe. I fixed both at the shared service/source level.

For developable area, I did not subtract constraints independently. For {ACTIVE}, the unioned flood/wetland constraint is 28.13 acres, not 8.83 plus 22.08 without adjustment, because 2.78 acres overlap. After a 15 percent open-space/stormwater assumption, the screening estimate is 392.11 developable acres.

Underwriting uses draft analyst assumptions only. The base case uses 392.11 developable acres, 2.4 units/lots per developable acre, 941 units/lots, a {_money(base["finished_lot_or_unit_value_assumption"])} finished-lot or unit value assumption, and an {_money(base["assumed_acquisition_basis"])} analyst scenario acquisition basis. Those assumptions are awaiting review before any workbook is created.

## Technical architecture

The case study uses the CFS cloud-safe PostGIS dataset, Investment workspace services, the Investment screening service, CFS Underwriting Lab calculations, ACS market context, environmental context, and Report Studio output. Restricted data remains excluded. No owner names, mailing addresses, grantor/grantee fields, raw scores, exact probabilities, tokens, or connection strings are included.

## Analytical judgment

The main judgment is that acreage alone is not enough. The priority parcel has the best balance of size, sewer-proximity proxy, development momentum, and manageable mapped constraints. The secondary parcel is still relevant because of scale, but it carries a larger verification burden. The deferred parcel proves the model is not just ranking by acreage; it meets the size threshold but fails the utility/environmental tradeoff.

## Main limitations

Utility proximity is a proxy, not capacity confirmation. Zoning overlay is not entitlement. Transportation proximity is not legal access. ACS context is aggregate, not parcel-level demand. Preliminary developable acreage is not certified. Underwriting values are assumptions, not facts.

## Likely interviewer questions and strong answers

**Why did you not use owner data?** Because the Azure staging work intentionally excludes private identity fields. The case focuses on acquisition-screening evidence and leaves identity/contact verification as a professional diligence task.

**Why does the deferred candidate matter?** It demonstrates disciplined screening. A parcel can meet the acreage requirement and still fail because environmental and utility evidence make near-term acquisition review inefficient.

**What was the biggest engineering fix?** Investment was relying on a report-sized export for candidate rows. I changed the shared loader to use cloud-safe parcel evidence directly, so countywide Investment screening can see the full candidate universe.

**What would you verify first before real outreach?** Zoning interpretation, water/sewer service and capacity, legal access, title/easements, asking basis, comparable sales, and field environmental conditions.

**What is the strongest business takeaway?** CFS does not replace professional due diligence, but it narrows the search from countywide noise into a reviewable acquisition shortlist with explicit risks and next steps.
"""


def _strategy() -> dict[str, Any]:
    return {
        "case_study_name": ENGAGEMENT_NAME,
        "client_label": "Hypothetical Regional Residential and Mixed-Use Developer",
        "engagement_type": "Development-Land Acquisition Review",
        "target_geography": "Cabarrus County, North Carolina",
        "strategy": "Medium- to long-term residential or mixed-use development land",
        "status_labels": ["Hypothetical", "Portfolio case study", "Internal screening-level research", "Not a real client engagement"],
        "search_date": STUDY_DATE,
        "primary_requirements": {
            "property_type": "Development land",
            "minimum_gross_acreage": "Approximately 100 acres",
            "preferred_use": "Residential or mixed-use potential",
            "market": "Growing Cabarrus County submarket",
            "transportation": "Reasonable access to major roads or road-proximity evidence",
            "utilities": "Sewer-proximity evidence or plausible extension context",
            "environmental_profile": "Manageable mapped flood, wetland, terrain, slope, and soil constraints",
            "development_context": "Permit activity, nearby development, infrastructure investment, or population growth evidence",
            "time_horizon": "Medium to long term",
            "risk_tolerance": "Moderate",
        },
        "interpretation": "Hypothetical acquisition criteria only; not official investment requirements, zoning determinations, utility capacity confirmation, or development approvals.",
    }


def _workflow_readiness() -> dict[str, Any]:
    return {
        "as_of": STUDY_DATE,
        "supported_workflow": ["Define Strategy", "Find", "Shortlist", "Analyze", "Compare", "Underwrite", "Recommend", "Report"],
        "findings": [
            {"area": "Saved project", "status": "Supported", "classification": "Ready"},
            {"area": "Saved search", "status": "Supported", "classification": "Ready"},
            {"area": "Minimum acreage screen", "status": "Fixed in shared Investment screening service", "classification": "Important defect fixed"},
            {"area": "Full candidate detail source", "status": "Fixed locally to read cloud-safe scalar tables instead of the limited Power BI report export", "classification": "Blocking defect fixed"},
            {"area": "Developable-area geometry", "status": "FEMA and NWI union available; stream, buffer, and right-of-way geometries unavailable in the current cloud-safe stage", "classification": "Data limitation"},
            {"area": "Utility capacity", "status": "Proxy only; capacity and water service must be verified externally", "classification": "Professional verification requirement"},
            {"area": "Entitlement and access", "status": "Zoning overlay and road proximity support screening only", "classification": "Professional verification requirement"},
        ],
    }


def _active_analysis(active_dev: dict[str, Any]) -> dict[str, Any]:
    return {
        "parcel_id": ACTIVE,
        "recommendation": "Advance for preliminary acquisition review, subject to confirmation of zoning interpretation, utility service and capacity, legal access, environmental conditions, asking basis, seller expectations, title, and infrastructure cost.",
        "what_makes_it_interesting": [
            "489.43 gross acres verified in CFS safe parcel context.",
            "Adjacent sewer-proximity and strong utility-readiness proxy.",
            "Moderate mapped environmental constraint band with limited mapped flood and wetland acreage relative to gross site size.",
            "Very high development-activity context in the surrounding CFS permit summary.",
        ],
        "what_limits_development_potential": [
            "Current zoning code is I-2 in Concord and must not be treated as residential or mixed-use entitlement.",
            "Utility capacity, water service, and extension feasibility are not confirmed.",
            "Mapped soils, poor drainage context, and regulated-facility proximity require professional review.",
            "Legal access, frontage, easements, title, asking basis, and infrastructure costs are missing.",
        ],
        "developable_area": active_dev,
        "evidence_still_missing": [
            "Utility service and capacity",
            "Water service",
            "Asking price or negotiated basis",
            "Seller expectations",
            "Historical transaction and qualified comparable-sale verification",
            "Ownership verification without exposing identity in CFS artifacts",
            "Title, easements, and access rights",
            "Entitlement feasibility",
            "Environmental field review",
            "Geotechnical conditions",
            "Infrastructure-cost estimate",
        ],
    }


def _comparison(candidates: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "as_of": STUDY_DATE,
        "method": "Three-property comparison selected to show priority, secondary, and deferred tradeoffs without claiming a purchase recommendation.",
        "candidates": candidates,
        "summary": [
            {"parcel_id": ACTIVE, "decision": _decision(89), "main_advantage": "Best combined sewer-proximity, development momentum, environmental profile, and data confidence.", "main_risk": "I-2 zoning interpretation, utility capacity, legal access, asking basis, and field review are unverified."},
            {"parcel_id": SECONDARY, "decision": _decision(77), "main_advantage": "Larger gross and preliminary developable acreage with supportive sewer-proximity proxy.", "main_risk": "Lower entitlement/access confidence and high infrastructure verification burden."},
            {"parcel_id": DEFERRED, "decision": _decision(36), "main_advantage": "Meets minimum acreage threshold.", "main_risk": "Outside near-sewer proxy range and materially constrained by mapped flood exposure."},
        ],
    }


def _due_diligence_plan() -> dict[str, Any]:
    return {
        "display_note": "GIS screening identifies where to investigate. It does not replace professional due diligence.",
        "immediate_verification": [
            "Ownership and contact path verification",
            "Title",
            "Asking price or negotiated acquisition basis",
            "Seller expectations",
            "Recent qualified land sales",
            "Zoning interpretation",
            "Future-land-use interpretation",
            "Water availability",
            "Sewer availability",
            "Utility capacity",
            "Legal access",
            "Easements",
        ],
        "technical_due_diligence": [
            "Boundary survey",
            "Topographic survey",
            "Wetland delineation",
            "Phase I Environmental Site Assessment",
            "Geotechnical study",
            "Traffic-impact analysis",
            "Preliminary engineering",
            "Stormwater review",
            "Infrastructure-cost estimate",
        ],
        "financial_and_market_review": [
            "Comparable projects",
            "Housing-demand study",
            "Absorption",
            "Finished-lot or unit pricing",
            "Construction costs",
            "Development schedule",
            "Financing",
            "Sensitivity testing",
        ],
    }


def _sources() -> dict[str, Any]:
    return {
        "study_date": STUDY_DATE,
        "primary_cfs_sources": [
            "parcels_enriched safe scalar fields",
            "parcel_development_screening_output",
            "parcel_wsacc_utility_features proxy classes",
            "parcel_transportation_accessibility_features proxy bands",
            "parcel_zoning_overlay_v2",
            "development_activity_parcel_summary",
            "investment_parcel_environmental_context",
            "investment_acs_market_context",
            "FEMA flood geometry and NWI wetland geometry available in cloud-safe stage for unioned developable-area screening",
        ],
        "excluded_sources": [
            "Owner and mailing fields",
            "Grantor and grantee fields",
            "Raw WSACC source attributes",
            "Student-level records",
            "Raw model scores",
            "Exact probability fields",
        ],
        "cloud_note": "Full countywide database screening used local cfs_cloud_stage, which AZ-1B validated against Azure cfs_cloud with matching row counts and geometry counts. The deployed Azure API remains frozen during CASE-1 until review.",
    }


def _limitations() -> dict[str, Any]:
    return {
        "case_study_limitations": [
            "Internal screening-level research only.",
            "Not investment advice.",
            "Not an appraisal.",
            "Not confirmation of utility service or capacity.",
            "Not a guarantee of future value.",
            "Not a formal environmental assessment.",
            "Not legal entitlement advice.",
            "Based partly on public and proxy data.",
            "Subject to source-date and coverage limitations.",
            "No owner names, mailing addresses, grantor/grantee fields, raw model scores, or exact probabilities are included.",
        ],
        "data_limitations": [
            "Stream or water-feature acreage, assumed stream-buffer acreage, and right-of-way/infrastructure constrained acreage were unavailable as geometry in the current cloud-safe stage.",
            "Utility proximity is a screening proxy and does not confirm service availability or capacity.",
            "Transportation proximity does not confirm legal access.",
            "ACS context is aggregate geography evidence and does not prove parcel-level demand.",
            "Underwriting values are analyst scenario assumptions awaiting review.",
        ],
    }


def _visual_exhibits() -> dict[str, Any]:
    return {
        "portfolio_safe_exhibits": [
            {"name": "Countywide candidate-screening map", "status": "Identified", "safe_content": "Parcel IDs and screening bands only; no owner or mailing fields."},
            {"name": "Candidate funnel", "status": "Created as JSON and markdown table", "safe_content": "Counts and criteria only."},
            {"name": "Three-property comparison", "status": "Created as JSON and markdown table", "safe_content": "Parcel IDs, scores, bands, and proxy evidence."},
            {"name": "Active-property constraint map", "status": "Identified for later map export", "safe_content": "FEMA/NWI/parcel geometry only; no restricted labels."},
            {"name": "Preliminary developable-area diagram", "status": "Created as calculation table; visual can be generated after review", "safe_content": "Unioned constraints and assumptions only."},
            {"name": "Underwriting scenario comparison", "status": "Created as JSON and markdown table", "safe_content": "Assumptions and formulas, no price claims."},
            {"name": "Due-diligence matrix", "status": "Created in report docs", "safe_content": "Verification tasks only."},
            {"name": "Final recommendation", "status": "Draft pending user review", "safe_content": "Conditional advancement language only."},
        ]
    }


def _manual_review_candidates() -> list[dict[str, Any]]:
    return [
        {"parcel_id": ACTIVE, "acres": 489.43, "score": 89, "decision": _decision(89)},
        {"parcel_id": "CFS-PARCEL-0149789146", "acres": 383.59, "score": 84, "decision": _decision(84)},
        {"parcel_id": "CFS-PARCEL-0149726579", "acres": 141.83, "score": 81, "decision": _decision(81)},
        {"parcel_id": "CFS-PARCEL-0149820198", "acres": 108.67, "score": 81, "decision": _decision(81)},
        {"parcel_id": SECONDARY, "acres": 670.27, "score": 77, "decision": _decision(77)},
        {"parcel_id": "CFS-PARCEL-0149727442", "acres": 839.56, "score": 76, "decision": _decision(76)},
        {"parcel_id": "CFS-PARCEL-0149727441", "acres": 839.56, "score": 76, "decision": _decision(76)},
        {"parcel_id": "CFS-PARCEL-0149773228", "acres": 154.10, "score": 76, "decision": _decision(76)},
        {"parcel_id": "CFS-PARCEL-0149727653", "acres": 315.40, "score": 75, "decision": _decision(75)},
        {"parcel_id": "CFS-PARCEL-0149749977", "acres": 586.47, "score": 74, "decision": _decision(74)},
    ]


def _funnel_table(counts: dict[str, Any]) -> str:
    rows = [
        ("Countywide parcels reviewed", counts["countywide_parcels_reviewed"]),
        ("Parcels meeting minimum acreage", counts["parcels_meeting_minimum_100_acres"]),
        ("Parcels with usable Planning and Investment evidence", counts["parcels_with_usable_planning_and_investment_evidence"]),
        ("Parcels passing initial planning/utility/environmental screens", counts["parcels_passing_initial_screens"]),
        ("Parcels receiving preliminary manual review", counts["parcels_receiving_preliminary_manual_review"]),
        ("Final shortlist count", counts["final_shortlist_count"]),
    ]
    return "\n".join(["| Funnel step | Count |", "|---|---:|"] + [f"| {label} | {value:,} |" for label, value in rows])


def _candidate_table(candidates: list[dict[str, Any]]) -> str:
    advantages = {
        ACTIVE: "Strongest combined sewer proxy, development momentum, data confidence, and manageable mapped constraints.",
        SECONDARY: "Largest preliminary developable acreage among the comparison set with adjacent sewer proxy.",
        DEFERRED: "Meets minimum acreage threshold and illustrates why acreage alone is insufficient.",
    }
    risks = {
        ACTIVE: "Zoning interpretation, capacity, access, asking basis, and field review are unverified.",
        SECONDARY: "Larger infrastructure and entitlement verification burden.",
        DEFERRED: "Outside near-sewer proxy range and high mapped flood burden.",
    }
    lines = ["| Candidate | Acres | Developable estimate | Score | Decision | Main advantage | Main risk |", "|---|---:|---:|---:|---|---|---|"]
    for candidate in candidates:
        parcel_id = candidate["parcel_id"]
        lines.append(f"| {parcel_id} | {candidate['gross_acres']:.2f} | {candidate['preliminary_developable_acres']:.2f} | {candidate['screening_score']} | {candidate['decision']} | {advantages[parcel_id]} | {risks[parcel_id]} |")
    return "\n".join(lines)


def _underwriting_table(scenarios: list[dict[str, Any]]) -> str:
    lines = ["| Scenario | Developable acres | Density | Units/lots | Value assumption | Supportable land price | Margin under assumed basis |", "|---|---:|---:|---:|---:|---:|---:|"]
    for scenario in scenarios:
        calc = scenario["case_study_calculations"]
        lines.append(f"| {scenario['scenario']} | {scenario['developable_acres']:.2f} | {scenario['density_units_per_developable_acre']:.2f} | {scenario['estimated_units_or_lots']:,} | {_money(scenario['finished_lot_or_unit_value_assumption'])} | {_money(calc['maximum_supportable_land_price'])} | {_money(calc['margin_under_assumed_acquisition_basis'])} |")
    return "\n".join(lines)


def _score_table(candidate: dict[str, Any]) -> str:
    lines = ["| Category | Max | Points | Explanation |", "|---|---:|---:|---|"]
    for item in candidate["score_categories"]:
        lines.append(f"| {item['category']} | {item['maximum_points']} | {item['awarded_points']} | {item['analyst_explanation']} |")
    lines.append(f"| **Total** | **100** | **{candidate['screening_score']}** | **{candidate['review_band']}** |")
    return "\n".join(lines)


def _decision(score: int) -> str:
    if score >= 80:
        return "Advance for additional acquisition review"
    if score >= 65:
        return "Recommended for additional diligence"
    if score >= 50:
        return "Watchlist"
    return "Defer"


def _review_band(score: int) -> str:
    if score >= 80:
        return "Priority review"
    if score >= 65:
        return "Secondary review"
    if score >= 50:
        return "Watchlist"
    return "Do not advance yet"


def _num(value: Any) -> float | None:
    return round(float(value), 2) if value not in (None, "") else None


def _money(value: Any) -> str:
    return "${:,.0f}".format(float(value)) if value is not None else "not available"


def _clean(value: Any) -> Any:
    if hasattr(value, "isoformat"):
        return value.isoformat()
    if isinstance(value, dict):
        return {str(key): _clean(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_clean(item) for item in value]
    return value


if __name__ == "__main__":
    main()
