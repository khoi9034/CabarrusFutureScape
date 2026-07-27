from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import SQLAlchemyError

from app.dependencies.database import get_db
from app.main import app
from app.routers import investment_router
from app.services import investment_case_study_service as service


REPO_ROOT = Path(__file__).resolve().parents[2]
client = TestClient(app)


class DryRunDb:
    def execute(self, *_args, **_kwargs):
        raise SQLAlchemyError("table unavailable in dry-run test")


def read(path: str) -> str:
    return (REPO_ROOT / path).read_text(encoding="utf-8")


def test_case_study_manifest_loads_referenced_safe_package() -> None:
    package = service.load_case_study_package("large-development-land")

    assert package["slug"] == "large-development-land"
    assert package["title"] == "CFS Large Development-Land Acquisition Case Study"
    assert package["status"] == "Deep Analysis"
    assert package["current_stage"] == "Deliverable Review / Targeted Diligence Recommendation"
    assert package["active_parcel_id"] == "CFS-PARCEL-0149758869"
    assert package["priority_candidate_id"] == "CFS-PARCEL-0149758869"
    assert package["recommendation_status"] == "Needs Review"
    assert package["underwriting_status"] == "Assumptions Required"
    assert package["excel_workbook_status"].startswith("Needs Review")
    assert len(package["artifacts"]["shortlisted_candidates"]["candidates"]) == 3
    assert package["artifacts"]["screening_funnel"]["counts"]["countywide_parcels_reviewed"] == 110017
    assert "owner_name" not in str(package).lower()
    assert "mailing_address" not in str(package).lower()
    assert "raw_score" not in str(package).lower()
    assert "exact_probability" not in str(package).lower()
    assert "database_url" not in str(package).lower()


def test_case_study_schema_and_manifest_are_repo_backed() -> None:
    schema = read("config/investment_case_study_schema.json")
    manifest = read("case-studies/large-development-land/case-study.json")

    assert "investment_case_study_schema" in schema
    assert '"package_files"' in schema
    assert '"safety_rules"' in schema
    assert "case-study.json" in str(REPO_ROOT / "case-studies" / "large-development-land" / "case-study.json")
    assert "active_property_analysis.json" in manifest
    assert "cfs-investment-large-development-land.md" in manifest


def test_case_study_validation_rejects_sensitive_fields() -> None:
    package = service.load_case_study_package("large-development-land")
    for key in ["owner_name", "mailing_address", "grantor", "raw_model_score", "exact_probability", "database_url"]:
        bad = {**package, key: "restricted"}
        with pytest.raises(ValueError):
            service.validate_case_study_package(bad)


def test_case_study_dry_run_sync_reports_changes_without_writing() -> None:
    result = service.sync_case_study(DryRunDb(), "large-development-land", dry_run=True)

    assert result["dry_run"] is True
    assert "validate package" in result["changes"]
    assert "upsert engagement criteria" in result["changes"]
    assert result["case_study"]["candidate_count"] == 3


def test_case_study_sync_preserves_user_state_conflict(monkeypatch) -> None:
    monkeypatch.setattr(
        service,
        "_get_case_row_if_table_exists",
        lambda _db, _slug: {"package_json": {"version": "older"}, "user_state_json": {"analyst_note": "Keep this note."}},
    )

    result = service.sync_case_study(DryRunDb(), "large-development-land", dry_run=True)

    assert result["conflicts"] == ["user_state_preserved"]


def test_case_study_package_fallback_returns_normalized_contract() -> None:
    case_study = service._case_from_package(service.load_case_study_package("large-development-land"))

    assert case_study["case_study"]["slug"] == "large-development-land"
    assert case_study["funnel"]["countywide_reviewed"] == 110017
    assert case_study["funnel"]["final_shortlist_count"] == 3
    assert [candidate["screening_score"] for candidate in case_study["candidates"]] == [89, 77, 36]
    assert case_study["candidates"][0]["developable_area_estimate"] == pytest.approx(392.11)
    assert case_study["candidates"][0]["main_advantage"]
    assert case_study["candidates"][0]["missing_evidence"]


def test_case_study_routes_are_wired(monkeypatch) -> None:
    app.dependency_overrides[get_db] = lambda: SimpleNamespace()
    case_study = {
        "activity": [],
        "candidate_count": 3,
        "case_study_type": "Development-Land Acquisition Review",
        "current_stage": "Candidate Review / Underwriting Assumptions Pending",
        "description": "Safe case study",
        "engagement_id": "E1",
        "geography": "Cabarrus County",
        "id": "C1",
        "manifest_path": "case-studies/large-development-land/case-study.json",
        "package": {"next_action": "Review assumptions"},
        "priority_candidate_id": "CFS-PARCEL-0149758869",
        "slug": "large-development-land",
        "source_package_version": "case-1.0",
        "status": "Deep Analysis",
        "strategy": "Development land",
        "title": "CFS Large Development-Land Acquisition Case Study",
        "updated_at": "2026-07-18T04:00:00Z",
        "user_state": {},
    }
    monkeypatch.setattr(investment_router, "list_case_studies", lambda _db: {"count": 1, "case_studies": [case_study]})
    monkeypatch.setattr(investment_router, "get_case_study", lambda _db, _slug: case_study)
    monkeypatch.setattr(investment_router, "update_case_study", lambda _db, _slug, request: {**case_study, "user_state": {"analyst_note": request.analyst_note}})
    monkeypatch.setattr(investment_router, "duplicate_case_study", lambda _db, _slug: {**case_study, "slug": "large-development-land-copy"})
    monkeypatch.setattr(investment_router, "archive_case_study", lambda _db, _slug: {**case_study, "status": "Archived"})
    monkeypatch.setattr(investment_router, "export_codex_brief", lambda _db, _slug: {"markdown": "# Safe brief", "brief": {}, "caveats": []})
    monkeypatch.setattr(investment_router, "sync_case_study", lambda _db, _slug, dry_run=False: {"dry_run": dry_run, "case_study": case_study, "changes": []})
    try:
        assert client.get("/investment/case-studies").json()["count"] == 1
        assert client.get("/investment/case-studies/large-development-land").json()["candidate_count"] == 3
        assert client.patch("/investment/case-studies/large-development-land", json={"analyst_note": "Keep manual note"}).json()["user_state"]["analyst_note"] == "Keep manual note"
        assert client.post("/investment/case-studies/large-development-land/duplicate").json()["slug"].endswith("-copy")
        assert client.post("/investment/case-studies/large-development-land/archive").json()["status"] == "Archived"
        assert client.post("/investment/case-studies/large-development-land/codex-brief").json()["markdown"] == "# Safe brief"
        assert client.post("/investment/case-studies/sync?case_study=large-development-land&dry_run=true").json()["dry_run"] is True
    finally:
        app.dependency_overrides.clear()


def test_case_study_frontend_and_ask_cfs_contracts_are_wired() -> None:
    shell = read("src/components/economics/EconomicsShell.tsx")
    component = read("src/components/investment/InvestmentCaseStudies.tsx")
    service_source = read("src/lib/investmentIntelligenceService.ts")

    assert "Continue Project" in shell
    assert "Start New Work" in shell
    assert "active_case_study_stage" in shell
    assert "Draft a Codex update brief." in shell
    assert "InvestmentCaseStudies" in shell
    assert "void getInvestmentCaseStudies()" in shell
    assert "getInvestmentSavedSearches(),\n      getInvestmentCaseStudies()," not in shell
    assert "Back to Case Studies" in component
    assert "writeCaseStudyUrl" in component and "caseStep" in component
    assert "Open Find Sites" in component
    assert "Add External Opportunity" in component
    assert "Score breakdown" in component
    assert "This is an analyst screening score" in component
    assert "100-point score explanation" not in component
    assert "Open Find with Criteria" not in component
    assert "Export Codex Brief" in component
    assert "owner" + "_name" not in component.lower()
    assert "/investment/case-studies" in service_source
    assert "/codex-brief" in service_source
