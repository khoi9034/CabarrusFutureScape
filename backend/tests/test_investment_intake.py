from __future__ import annotations

from datetime import date
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.dependencies.database import get_db
from app.main import app
from app.routers import investment_router
from app.schemas.investment import InvestmentCsvImportRequest, InvestmentIntakePayload
from app.services.investment_intake_service import (
    _acquisition_basis,
    compare_intake_candidates,
    import_intake_csv,
)
from app.services import investment_intake_service

client = TestClient(app)
ROOT = Path(__file__).resolve().parents[2]


def test_intake_payload_rejects_owner_and_invalid_price() -> None:
    with pytest.raises(ValueError):
        InvestmentIntakePayload(candidate_name="Owner lead", source_type="Manual Research")
    with pytest.raises(ValueError):
        InvestmentIntakePayload(candidate_name="Safe lead", source_type="Manual Research", asking_price=-1)


def test_acquisition_basis_missing_and_invalid_price_are_not_negative_signal() -> None:
    missing = _acquisition_basis({"asking_price": None}, None)
    invalid = _acquisition_basis({"asking_price": 0}, None)

    assert missing["asking_basis_band"] == "Insufficient Acquisition Basis"
    assert invalid["asking_basis_band"] == "Verification Required"
    assert "undervalued" not in str(missing).lower()
    assert "overpriced" not in str(invalid).lower()


def test_acquisition_basis_uses_user_entered_price_and_existing_context() -> None:
    result = _acquisition_basis(
        {"asking_price": 250000, "asking_price_date": date.today()},
        {
            "acreage": 5,
            "basis_context_band": "Near Comparable Context",
            "basis_caution_reasons": ["Assessed value is context only and is not an appraisal"],
            "comparable_count_band": "Strong",
        },
    )

    assert result["asking_price_per_acre"] == 50000
    assert result["asking_basis_band"] == "Near Comparable Context"
    assert result["evidence_type"] == "User-entered information"


def test_intake_comparison_is_qualitative_and_safe(monkeypatch) -> None:
    def fake_analysis(db, candidate_id, rows):  # noqa: ANN001
        return {
            "acquisition_basis": {
                "asking_basis_band": "Near Comparable Context",
                "basis_caution_reasons": ["Manual basis verification required"],
                "evidence_type": "User-entered information",
            },
            "candidate": {
                "candidate_name": f"Lead {candidate_id}",
                "id": candidate_id,
                "parcel_id": f"P-{candidate_id}",
                "strategy": "development_land",
            },
            "screening_context": {
                "dimension_bands": {
                    "readiness_signal": "Strong review signal",
                    "strategy_fit": "Development Land",
                    "constraint_burden": "Verify",
                },
                "safe_display_fields": {"utility_readiness_proxy_class": "Moderate sewer-proximity signal"},
            },
            "environmental_context": {
                "overall_environmental_constraint_band": "Insufficient Information",
            },
        }

    monkeypatch.setattr(investment_intake_service, "analyze_intake_candidate", fake_analysis)
    result = compare_intake_candidates(FakeDb(), ["A", "B"], [])
    text = str(result).lower()

    assert len(result["intake_candidates"]) == 2
    assert "user-entered" in text
    assert "utility" in text
    assert "winner" not in text
    assert "buy this parcel" not in text
    assert "raw_score" not in text


def test_csv_import_rejects_unsafe_headers() -> None:
    result = import_intake_csv(
        FakeDb(),
        InvestmentCsvImportRequest(csv_text="candidate_name,source_type,owner\nLead,Manual Research,Nope\n"),
        [],
    )

    assert result["created"] == []
    assert "Unsupported or unsafe headers" in result["errors"][0]


class FakeDb:
    def execute(self, statement, params=None):  # noqa: ANN001
        sql = str(statement)
        if sql.strip().lower().startswith("select"):
            return []
        return SimpleNamespace(rowcount=1)


def test_intake_routes_are_wired(monkeypatch) -> None:
    app.dependency_overrides[get_db] = lambda: FakeDb()
    monkeypatch.setattr(investment_router, "_investment_rows", lambda db: [])
    monkeypatch.setattr(
        investment_router,
        "list_intake_candidates",
        lambda db, rows: {"candidates": [], "caveats": [], "count": 0},
    )
    monkeypatch.setattr(
        investment_router,
        "create_intake_candidate",
        lambda db, request, rows: {"candidate": {"id": "C1", "candidate_name": request.candidate_name}},
    )
    monkeypatch.setattr(investment_router, "delete_intake_candidate", lambda db, candidate_id: True)
    monkeypatch.setattr(
        investment_router,
        "compare_intake_candidates",
        lambda db, candidate_ids, rows: {"intake_candidates": candidate_ids},
    )
    monkeypatch.setattr(
        investment_router,
        "update_intake_candidate",
        lambda db, candidate_id, request, rows: {"candidate": {"id": candidate_id, "review_status": request.review_status}},
    )
    try:
        assert client.get("/investment/intake").status_code == 200
        created = client.post(
            "/investment/intake",
            json={"candidate_name": "North Concord Industrial Candidate", "source_type": "Manual Research"},
        )
        assert created.status_code == 200
        assert created.json()["candidate"]["id"] == "C1"
        assert client.post("/investment/intake/compare", json={"candidate_ids": ["C1"]}).status_code == 422
        compared = client.post("/investment/intake/compare", json={"candidate_ids": ["C1"]})
        assert compared.status_code == 422
        compared = client.post("/investment/intake/compare", json={"candidate_ids": ["C1", "C2", "C3", "C4"]})
        assert compared.status_code == 200
        assert compared.json()["intake_candidates"] == ["C1", "C2", "C3", "C4"]
        assert client.post("/investment/intake/compare", json={"candidate_ids": ["C1", "C2", "C3", "C4", "C5"]}).status_code == 422
        assert client.patch("/investment/intake/C1", json={"review_status": "Archived"}).json()["candidate"]["review_status"] == "Archived"
        assert client.delete("/investment/intake/C1").json()["deleted"] is True
    finally:
        app.dependency_overrides.clear()


def test_intake_workspace_frontend_contracts() -> None:
    source = (ROOT / "src/components/economics/EconomicsShell.tsx").read_text()

    for text in [
        "Compare Selected",
        "Strategy",
        "Review status",
        "Listing status",
        "Date added",
        "Last verified",
        "No private intake candidates yet.",
        "Candidate Intake is unavailable",
        "Comparison shows tradeoffs only",
        "Market Area Context",
        "Environmental & Physical Context",
        "Environmental filters",
        "Environmental Context",
        "Mapped Wetland Context",
        "sampling uncertainty",
    ]:
        assert text in source

    intake_section = source[source.index("function InvestmentIntakeWorkspace") : source.index("function InvestmentCandidateTable")]
    assert "recommend a purchase" in intake_section
    assert "buy this" not in intake_section.lower()
    assert "guaranteed return" not in intake_section.lower()
