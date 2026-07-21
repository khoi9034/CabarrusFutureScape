import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CASE_DIR = ROOT / "case-studies" / "large-development-land"
DOC_DIR = ROOT / "docs" / "case-studies"
BUILDER = ROOT / "scripts" / "case_studies" / "build_large_development_land_case.py"

ACTIVE = "CFS-PARCEL-0149758869"
SECONDARY = "CFS-PARCEL-0149760035"
DEFERRED = "CFS-PARCEL-0149777275"


def _json(name: str) -> dict:
    return json.loads((CASE_DIR / name).read_text(encoding="utf-8"))


def test_case1_artifact_package_exists() -> None:
    for path in (
        CASE_DIR / "strategy.json",
        CASE_DIR / "screening_funnel.json",
        CASE_DIR / "shortlisted_candidates.json",
        CASE_DIR / "candidate_comparison.json",
        CASE_DIR / "active_property_analysis.json",
        CASE_DIR / "developable_area_analysis.json",
        CASE_DIR / "underwriting_input_register.json",
        CASE_DIR / "underwriting_scenarios.json",
        CASE_DIR / "due_diligence_plan.json",
        CASE_DIR / "sources.json",
        CASE_DIR / "limitations.json",
        CASE_DIR / "ask_cfs_case_study_results.json",
        DOC_DIR / "cfs-investment-large-development-land.md",
        DOC_DIR / "cfs-investment-executive-recommendation.md",
        DOC_DIR / "cfs-investment-acquisition-presentation.md",
        DOC_DIR / "cfs-investment-interview-walkthrough.md",
        DOC_DIR / "cfs-development-land-assumption-review.md",
        DOC_DIR / "cfs-case-1-evidence-review.md",
        DOC_DIR / "cfs-case-1-market-assumption-benchmarks.md",
        DOC_DIR / "cfs-case-1-underwriting-consistency-review.md",
    ):
        assert path.exists(), path


def test_case1_shortlist_and_score_math() -> None:
    payload = _json("shortlisted_candidates.json")
    candidates = payload["candidates"]

    assert [item["parcel_id"] for item in candidates] == [ACTIVE, SECONDARY, DEFERRED]
    assert len({item["parcel_id"] for item in candidates}) == 3
    assert [item["decision"] for item in candidates] == [
        "Advance for additional acquisition review",
        "Recommended for additional diligence",
        "Defer",
    ]

    for candidate in candidates:
        categories = candidate["score_categories"]
        assert sum(item["maximum_points"] for item in categories) == 100
        assert sum(item["awarded_points"] for item in categories) == candidate["screening_score"]
        assert all(item["positive_factors"] for item in categories)
        assert all(item["negative_factors"] for item in categories)
        assert all(item["missing_evidence"] for item in categories)


def test_case1_funnel_and_developable_area_are_reproducible() -> None:
    counts = _json("screening_funnel.json")["counts"]
    assert counts == {
        "countywide_parcels_reviewed": 110017,
        "parcels_meeting_minimum_100_acres": 241,
        "parcels_with_usable_planning_and_investment_evidence": 241,
        "parcels_passing_initial_screens": 62,
        "parcels_receiving_preliminary_manual_review": 10,
        "final_shortlist_count": 3,
    }

    active = next(item for item in _json("developable_area_analysis.json")["candidates"] if item["parcel_id"] == ACTIVE)
    assert active["gross_acres"] == 489.43
    assert active["unioned_flood_wetland_constraint_acres"] == 28.13
    assert active["overlapping_constrained_acres_flood_wetland"] == 2.78
    assert active["estimated_developable_acres"] == 392.11


def test_case1_underwriting_is_review_gated_before_workbook() -> None:
    payload = _json("underwriting_scenarios.json")

    assert "user review before workbook creation" in payload["status"]
    assert "Asking price unavailable" in payload["asking_price_status"]
    assert [item["scenario"] for item in payload["scenarios"]] == ["Downside", "Base", "Upside"]
    assert all("Analyst scenario acquisition basis" in item["assumption_label"] for item in payload["scenarios"])


def test_case1_artifacts_do_not_contain_restricted_values_or_unsupported_claims() -> None:
    haystack = "\n".join(
        path.read_text(encoding="utf-8", errors="ignore")
        for folder in (CASE_DIR, DOC_DIR)
        for path in folder.rglob("*")
        if path.is_file()
    ).lower()

    for forbidden in (
        "acctname",
        "mailaddr",
        "legaldesc",
        "raw_score",
        "prediction_probability",
        "exact_probability",
        "nearest_sewer_pipe_id",
        "wsacc_notes",
        "database_url",
        "postgresql://",
        "vercel_automation",
        "openai_api_key",
        "census_api_key",
        "buy this parcel",
        "recommended purchase",
        "guaranteed return",
        "guaranteed value",
        "official appraisal",
        "official prediction",
        "confirmed utility capacity",
        "will develop",
    ):
        assert forbidden not in haystack


def test_case1_builder_uses_process_local_credentials_only() -> None:
    source = BUILDER.read_text(encoding="utf-8").lower()

    assert "cfs_postgres_password" in source
    assert "url.create" in source
    assert "postgresql://" not in source
    assert "openai_api_key" not in source
    assert "vercel_automation_bypass_secret" not in source


def test_case3a_underwriting_register_is_review_only() -> None:
    payload = _json("underwriting_input_register.json")

    assert payload["phase"] == "CASE-3A"
    assert payload["safety_findings"]["financial_outputs_generated"] is False
    assert payload["safety_findings"]["final_workbook_generated"] is False
    assert payload["safety_findings"]["final_recommendation_generated"] is False

    assert payload["funnel_verification"]["counts"] == {
        "countywide_reviewed": 110017,
        "minimum_acreage_pass": 241,
        "evidence_ready": 241,
        "initial_screen_pass": 62,
        "manual_review_set": 10,
        "final_shortlist": 3,
    }

    candidates = payload["candidate_evidence_matrix"]
    assert [item["parcel_id"] for item in candidates] == [ACTIVE, SECONDARY, DEFERRED]
    assert [item["screening_score"]["value"] for item in candidates] == [89, 77, 36]

    active = next(item for item in payload["developable_area_validation"] if item["parcel_id"] == ACTIVE)
    assert active["saved_case_study_estimate_acres"] == active["recalculated_estimate_acres"] == 392.11
    assert round(active["gross_acres"] - active["unioned_constrained_acres"], 2) == active["preliminary_net_acres"]
    assert active["difference_acres"] == 0.0

    approval_statuses = {item["status"] for item in payload["approval_checklist"]}
    assert approval_statuses <= {
        "Evidence Available",
        "Proposed Assumption",
        "User Review Required",
        "Approved",
        "Professional Estimate Required",
        "Unavailable",
    }


def test_case3a_review_files_do_not_invent_financial_assumptions() -> None:
    files = [
        CASE_DIR / "underwriting_input_register.json",
        DOC_DIR / "cfs-development-land-assumption-review.md",
        DOC_DIR / "cfs-case-1-evidence-review.md",
    ]
    haystack = "\n".join(path.read_text(encoding="utf-8", errors="ignore") for path in files).lower()

    for forbidden in (
        "maximum_supportable_land_price",
        "gross_development_value",
        "recommended purchase",
        "buy this parcel",
        "official appraisal",
        "confirmed utility capacity",
        "environmental clearance",
        "database_url",
        "postgresql://",
        "openai_api_key",
        "vercel_automation_bypass_secret",
    ):
        assert forbidden not in haystack


def test_case3a1_market_assumptions_are_unapproved_benchmarks() -> None:
    payload = _json("underwriting_input_register.json")["case_3a_1_market_benchmarking"]

    assert payload["phase"] == "CASE-3A.1"
    assert payload["approval_status"] == "Proposed - User Review Required"
    assert payload["development_program"]["recommended_primary_product"] == "Large Residential Finished-Lot Development"
    assert len(payload["benchmark_records"]) >= 8

    inputs = {item["input"]: item for item in payload["scenario_assumption_inputs"]}
    assert inputs["Finished-lot value"]["proposed_base"] == 70000
    assert inputs["Scenario acquisition basis"]["proposed_base"] is None
    assert all(item["user_approval_status"] == "Proposed - User Review Required" for item in inputs.values())
    assert "Vertical home construction" in payload["development_program"]["excluded_from_primary_case"]


def test_case3a1_market_memo_stops_before_final_outputs() -> None:
    memo = (DOC_DIR / "cfs-case-1-market-assumption-benchmarks.md").read_text(encoding="utf-8").lower()

    assert "not an appraisal" in memo
    assert "no assumption is approved" in memo
    assert "do not invent a current asking price" in memo
    for forbidden in (
        "final excel workbook",
        "approved assumption",
        "current asking price is",
        "we recommend acquisition",
    ):
        assert forbidden not in memo


def test_case3a2_scenario_arithmetic_and_break_even_diagnostics() -> None:
    review = _json("underwriting_input_register.json")["case_3a_2_underwriting_consistency_review"]
    scenarios = {item["scenario"]: item for item in review["current_scenario_math"]}
    base = scenarios["Base"]

    assert base["estimated_lots"] == 1097.91
    assert base["gross_lot_sale_revenue"] == 76853560
    assert base["horizontal_development_cost"] == 76853560
    assert round(base["gross_lot_sale_revenue"] - base["horizontal_development_cost"] - base["fixed_off_site_costs"] - base["soft_costs"] - base["contingency"] - base["developer_margin"], 2) == base["preliminary_residual_before_land"]
    assert base["preliminary_residual_before_land"] < 0
    assert base["residual_after_selling_and_carry"] < base["preliminary_residual_before_land"]

    thresholds = {item["scenario"]: item for item in review["break_even_thresholds"]}
    assert thresholds["Base"]["break_even_finished_lot_value_after_selling_and_carry"] == 143469.1
    assert thresholds["Upside"]["maximum_horizontal_cost_per_lot_after_selling_and_carry"] == 51863.65
    assert thresholds["Downside"]["break_even_density_after_selling_and_carry"] is None


def test_case3a2_cost_scope_and_revision_guardrails() -> None:
    review = _json("underwriting_input_register.json")["case_3a_2_underwriting_consistency_review"]
    scope = review["horizontal_cost_scope"]

    assert "Internal roads" in scope["included_cost_components"]
    assert "Water transmission extension" in scope["excluded_cost_components"]
    assert "overlap" in scope["potential_double_counting"].lower()
    assert review["formula_conventions"]["developer_margin"] == "Calculated as a percentage of gross lot-sale revenue."
    assert review["user_approval_status"] == "Proposed - User Review Required"

    revisions = {item["input"]: item for item in review["reconciled_assumption_table"]}
    assert revisions["Other off-site or pump-station allowance"]["reconciled_base"] is None
    assert revisions["Finished-lot value"]["reconciled_base"] == 70000
    assert all("acquisition recommendation" not in item["effect_on_viability"].lower() for item in revisions.values())
