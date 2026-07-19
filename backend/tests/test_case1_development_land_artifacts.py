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
        CASE_DIR / "underwriting_scenarios.json",
        CASE_DIR / "due_diligence_plan.json",
        CASE_DIR / "sources.json",
        CASE_DIR / "limitations.json",
        CASE_DIR / "ask_cfs_case_study_results.json",
        DOC_DIR / "cfs-investment-large-development-land.md",
        DOC_DIR / "cfs-investment-executive-recommendation.md",
        DOC_DIR / "cfs-investment-acquisition-presentation.md",
        DOC_DIR / "cfs-investment-interview-walkthrough.md",
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
