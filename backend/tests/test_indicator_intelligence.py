from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_indicator_intelligence_returns_stable_schema() -> None:
    response = client.get("/indicators/intelligence")

    assert response.status_code == 200
    body = response.json()
    assert body["mode"] == "live"
    assert {"summary", "kpis", "signals", "watchlist", "domain_readiness", "caveats"} <= set(body)
    assert body["summary"]["total_signals"] == len(body["signals"])
    assert body["kpis"]
    assert body["watchlist"]


def test_indicator_intelligence_has_each_domain_or_data_needed_state() -> None:
    response = client.get("/indicators/intelligence")
    body = response.json()
    domains = {signal["domain"] for signal in body["signals"]}

    assert {
        "data_readiness",
        "development_activity",
        "floodplain_review",
        "model_research",
        "school_pressure",
        "transportation_context",
        "utility_readiness",
        "zoning_land_use",
    } <= domains
    assert all(
        signal["status_band"]
        in {"normal", "monitor", "review", "elevated_review", "data_needed", "unavailable"}
        for signal in body["signals"]
    )


def test_indicator_intelligence_watchlist_is_priority_sorted() -> None:
    response = client.get("/indicators/intelligence")
    watchlist = response.json()["watchlist"]

    severities = [row["severity"] for row in watchlist]
    assert severities == sorted(severities, reverse=True)


def test_indicator_intelligence_uses_safe_language() -> None:
    response = client.get("/indicators/intelligence")
    text = str(response.json()).lower()

    for unsafe in (
        "will develop",
        "official prediction",
        "official score",
        "prediction_probability",
        "raw_score",
        "exact_probability",
        "overcrowding prediction",
    ):
        assert unsafe not in text
