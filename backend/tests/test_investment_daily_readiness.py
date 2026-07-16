from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
ECONOMICS_SHELL = ROOT / "src" / "components" / "economics" / "EconomicsShell.tsx"
INVESTMENT_SHELL = ROOT / "src" / "components" / "investment" / "InvestmentShell.tsx"
STARTUP_SCRIPT = ROOT / "scripts" / "start-cfs-local.ps1"
OPS_DOC = ROOT / "docs" / "cfs-investment-operations.md"


def test_investment_defaults_to_analyst_view_with_guided_optional() -> None:
    shell = ECONOMICS_SHELL.read_text(encoding="utf-8")
    investment_shell = INVESTMENT_SHELL.read_text(encoding="utf-8")

    assert 'readInvestmentDisplayPreference().viewMode ?? "advanced"' in shell
    assert ">Guided<" in investment_shell
    assert ">Analyst<" in investment_shell


def test_universal_search_and_active_property_contracts() -> None:
    shell = ECONOMICS_SHELL.read_text(encoding="utf-8")
    investment_shell = INVESTMENT_SHELL.read_text(encoding="utf-8")

    assert "InvestmentUniversalSearch" in shell
    assert "searchParcels({ q: query.trim(), limit: 5, safe_for_dashboard: true }" in shell
    assert "isInvestmentParcelLookupQuery" in shell
    assert "Private identity fields are not searchable or displayed here." in shell
    assert "analyzeParcel" in shell
    assert "writeInvestmentParcelPreference" in shell
    assert "activeProperty" in investment_shell
    assert "Active Property" in investment_shell
    assert "onActiveUnderwrite" in investment_shell


def test_daily_readiness_panels_are_present() -> None:
    shell = ECONOMICS_SHELL.read_text(encoding="utf-8")

    assert "InvestmentResearchCompletenessPanel" in shell
    assert "Research Completeness" in shell
    assert "InvestmentDataStatusPanel" in shell
    assert "Data Status" in shell
    assert "Underwriting" in shell
    assert "Due diligence" in shell


def test_local_gate_and_startup_hardening_contract() -> None:
    shell = ECONOMICS_SHELL.read_text(encoding="utf-8")
    startup = STARTUP_SCRIPT.read_text(encoding="utf-8")

    assert "INVESTMENT_LOCAL_ACCESS_KEY" in shell
    assert "sessionStorage.setItem" in shell
    assert "Production authentication is not yet enabled" in shell
    assert "Test-CfsLocalProcess" in startup
    assert "does not look like a CFS local dev process" in startup
    assert "Port $Port process appears to be" in startup


def test_operations_guide_exists_and_uses_safe_language() -> None:
    text = OPS_DOC.read_text(encoding="utf-8")

    assert "npm run dev:cfs" in text
    assert "http://localhost:3000" in text
    assert "http://127.0.0.1:8000" in text
    assert "Universal Search" in text
    assert "return assurance" in text
    assert "screening-level review" in text
