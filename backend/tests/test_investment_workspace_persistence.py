from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.dependencies.database import get_db
from app.main import app
from app.routers import investment_router
from app.schemas.investment_workspace import InvestmentSavedItemPayload
from app.services import ai_search_service


REPO_ROOT = Path(__file__).resolve().parents[2]
client = TestClient(app)


def read(path: str) -> str:
    return (REPO_ROOT / path).read_text(encoding="utf-8")


def test_saved_workspace_service_contracts_are_persistent_and_bounded() -> None:
    service = read("backend/app/services/investment_workspace_service.py")

    assert 'SAVED_ITEM_TABLE = "investment_saved_item"' in service
    assert 'RECENT_WORK_TABLE = "investment_recent_work"' in service
    assert 'SAVED_SEARCH_TABLE = "investment_saved_search"' in service
    assert "RECENT_WORK_LIMIT = 50" in service
    assert "status <> 'Archived'" in service
    assert "item_type = :item_type" in service
    assert "item_reference_id = :item_reference_id" in service
    assert "DELETE FROM {RECENT_WORK_TABLE}" in service
    assert "OFFSET {RECENT_WORK_LIMIT}" in service
    assert "SAFE_CAVEAT" in service


def test_saved_workspace_schema_rejects_private_identity_text() -> None:
    with pytest.raises(ValueError):
        InvestmentSavedItemPayload(
            item_reference_id="P1",
            item_type="parcel",
            label="ow" + "ner research",
        )


def test_saved_workspace_routes_are_wired(monkeypatch) -> None:
    app.dependency_overrides[get_db] = lambda: SimpleNamespace()
    saved_item = {
        "id": "S1",
        "item_type": "parcel",
        "item_reference_id": "P1",
        "label": "Parcel P1",
        "status": "Shortlisted",
        "summary": "Screening-level review candidate",
        "created_at": "2026-07-14T00:00:00Z",
        "updated_at": "2026-07-14T00:00:00Z",
    }
    recent = {
        "id": "R1",
        "activity_type": "opened_workspace",
        "reference_type": "page",
        "reference_id": "overview",
        "label": "Home",
        "page": "overview",
        "summary": "Continue",
        "context": {},
        "last_opened_at": "2026-07-14T00:00:00Z",
    }
    search = {
        "id": "Q1",
        "search_name": "Industrial land",
        "goal": "Industrial Site",
        "location_type": "All Cabarrus County",
        "essential_criteria": {},
        "advanced_criteria": {},
        "guided_or_advanced": "guided",
        "result_summary": {},
        "created_at": "2026-07-14T00:00:00Z",
        "updated_at": "2026-07-14T00:00:00Z",
    }
    engagement = {
        "id": "E1",
        "engagement_name": "Project: Industrial land",
        "selected_strategy": "development_land",
        "engagement_status": "Draft",
        "brief": {},
        "criteria": [],
        "shortlist": [],
        "portfolio_summary": {},
    }

    monkeypatch.setattr(investment_router, "list_saved_items", lambda *args, **kwargs: {"count": 1, "items": [saved_item]})
    monkeypatch.setattr(investment_router, "create_saved_item", lambda *args, **kwargs: saved_item)
    monkeypatch.setattr(investment_router, "update_saved_item", lambda *args, **kwargs: {**saved_item, "status": "Needs Verification"})
    monkeypatch.setattr(investment_router, "delete_saved_item", lambda *args, **kwargs: True)
    monkeypatch.setattr(investment_router, "reorder_saved_items", lambda *args, **kwargs: {"count": 1, "items": [saved_item]})
    monkeypatch.setattr(investment_router, "list_recent_work", lambda *args, **kwargs: {"count": 1, "items": [recent], "max_items": 50})
    monkeypatch.setattr(investment_router, "record_recent_work", lambda *args, **kwargs: {"count": 1, "items": [recent], "max_items": 50})
    monkeypatch.setattr(investment_router, "delete_recent_work", lambda *args, **kwargs: True)
    monkeypatch.setattr(investment_router, "list_saved_searches", lambda *args, **kwargs: {"count": 1, "searches": [search]})
    monkeypatch.setattr(investment_router, "create_saved_search", lambda *args, **kwargs: search)
    monkeypatch.setattr(investment_router, "update_saved_search", lambda *args, **kwargs: {**search, "search_name": "Renamed"})
    monkeypatch.setattr(investment_router, "delete_saved_search", lambda *args, **kwargs: True)
    monkeypatch.setattr(investment_router, "duplicate_saved_search", lambda *args, **kwargs: {**search, "id": "Q2"})
    monkeypatch.setattr(investment_router, "rerun_saved_search", lambda *args, **kwargs: {"saved_search": search, "results": {"count": 1}})
    monkeypatch.setattr(investment_router, "get_saved_search", lambda *args, **kwargs: search)
    monkeypatch.setattr(investment_router, "saved_search_to_engagement", lambda *args, **kwargs: {"engagement": engagement, "saved_search": search})
    monkeypatch.setattr(investment_router, "_investment_rows", lambda _db: [{"parcel_id": "P1"}])

    try:
        assert client.get("/investment/saved-items").json()["count"] == 1
        assert client.post("/investment/saved-items", json={"item_type": "parcel", "item_reference_id": "P1", "label": "Parcel P1"}).json()["id"] == "S1"
        assert client.patch("/investment/saved-items/S1", json={"status": "Needs Verification"}).json()["status"] == "Needs Verification"
        assert client.post("/investment/saved-items/reorder", json={"item_ids": ["S1"]}).json()["count"] == 1
        assert client.delete("/investment/saved-items/S1").json()["deleted"] is True
        assert client.get("/investment/recent-work").json()["max_items"] == 50
        assert client.post("/investment/recent-work", json={"activity_type": "opened_workspace", "reference_type": "page", "reference_id": "overview", "label": "Home", "page": "overview"}).json()["count"] == 1
        assert client.delete("/investment/recent-work/R1").json()["deleted"] is True
        assert client.get("/investment/saved-searches").json()["count"] == 1
        assert client.post("/investment/saved-searches", json={"search_name": "Industrial land", "goal": "Industrial Site"}).json()["id"] == "Q1"
        assert client.patch("/investment/saved-searches/Q1", json={"search_name": "Renamed"}).json()["search_name"] == "Renamed"
        assert client.post("/investment/saved-searches/Q1/duplicate").json()["id"] == "Q2"
        assert client.post("/investment/saved-searches/Q1/rerun").json()["results"]["count"] == 1
        assert client.post("/investment/saved-searches/Q1/engagement").json()["engagement"]["id"] == "E1"
        assert client.delete("/investment/saved-searches/Q1").json()["deleted"] is True
    finally:
        app.dependency_overrides.clear()


def test_ask_cfs_understands_saved_workspace_commands() -> None:
    assert ai_search_service._investment_intent("Show my shortlist.") == "Saved Workspace"
    assert ai_search_service._investment_intent("Open my recent industrial search.") == "Saved Workspace"
    assert ai_search_service._investment_intent("Continue my last underwriting scenario.") == "Underwriting"


def test_frontend_uses_persistent_workspace_apis_instead_of_session_records() -> None:
    shell = read("src/components/economics/EconomicsShell.tsx")
    service = read("src/lib/investmentIntelligenceService.ts")

    assert "getInvestmentSavedItems" in shell
    assert "getInvestmentRecentWork" in shell
    assert "getInvestmentSavedSearches" in shell
    assert "createInvestmentSavedItem" in shell
    assert "createInvestmentSavedSearch" in shell
    assert "Find Sites" in shell
    assert "Save Search" in shell
    assert "cfs-investment-display-preferences" in shell
    assert "cfs-investment-guided-state" not in shell
    assert "/investment/saved-items" in service
    assert "/investment/recent-work" in service
    assert "/investment/saved-searches" in service
    assert ("guaranteed " + "return") not in shell.lower()
