from __future__ import annotations

import json
import os
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
API_BASE = os.getenv("CFS_LOCAL_API_BASE_URL", "http://127.0.0.1:8000").rstrip("/")


def main() -> int:
    failures: list[str] = []
    checks = 0
    client = read("src/lib/api/client.ts")
    top_nav = read("src/components/layout/TopNav.tsx")
    parcel_search = read("src/components/dashboard/ParcelSearchPanel.tsx")
    command_palette = read("src/components/dashboard/CommandPalette.tsx")
    intelligence = read("src/components/dashboard/IntelligencePanel.tsx")
    temporal = read("src/hooks/useTemporalQuery.ts")
    map_client = read("src/lib/demo-data/mapLayerClient.ts")
    frontend_sources = "\n".join(
        path.read_text(encoding="utf-8")
        for path in (ROOT / "src").rglob("*.ts*")
    )

    checks += require(
        'export const USE_DEMO_DATA = IS_DEMO_MODE;' in client,
        "Demo data is not restricted to explicit demo mode.",
        failures,
    )
    checks += require(
        "IS_AUTO_MODE && !USE_BACKEND_API" not in client,
        "Auto mode still silently enables demo data.",
        failures,
    )
    checks += require(
        "USE_DEMO_DATA || !USE_BACKEND_API" not in frontend_sources,
        "A live path still treats a missing backend as demo mode.",
        failures,
    )
    checks += require(
        "searchParcelIndex" not in top_nav
        and "loadParcelSearchIndex" not in parcel_search
        and "searchParcelIndex" not in command_palette,
        "Parcel discovery still has a generated-index live fallback.",
        failures,
    )
    checks += require(
        "WSACC intelligence requires the configured CFS API outside demo mode."
        in intelligence,
        "WSACC live path can still use demo business data.",
        failures,
    )
    checks += require(
        "getUnavailableTemporalQueryView" in temporal,
        "Temporal live failures do not use the unavailable contract.",
        failures,
    )
    checks += require(
        "static_geographic_context" in map_client
        and "isStaticGeographicContext" in map_client,
        "The permitted static-map exception is not instrumented.",
        failures,
    )
    checks += require(
        "__cfsDataProvenance" in client and "recordDataProvenance" in client,
        "Runtime adapter instrumentation is missing.",
        failures,
    )
    checks += require(
        "__cfsTechnicalEvents" in client
        and all(
            event in frontend_sources
            for event in (
                "api_readiness",
                "ask_cfs_request",
                "data_adapter_used",
                "failed_domain_load",
                "map_fallback",
                "map_renderer_selected",
                "map_retry",
                "powerbi_export",
                "provider_fallback",
                "report_generation",
            )
        ),
        "Privacy-safe technical event instrumentation is incomplete.",
        failures,
    )

    powerbi = get_json(f"{API_BASE}/economics/powerbi-export")
    checks += require(
        (powerbi.get("provenance") or {}).get("data_origin") == "local_api",
        "Local Power BI export provenance is not local_api.",
        failures,
    )
    checks += require(
        (powerbi.get("provenance") or {}).get("runtime_mode") == "local",
        "Local Power BI export runtime is not local.",
        failures,
    )
    ai = post_json(
        f"{API_BASE}/ai/search",
        {
            "app_mode": "planning",
            "mode": "live",
            "query": "What data is still missing?",
        },
    )
    checks += require(
        ai.get("data_mode") == "live"
        and ai.get("data_source") != "portfolio_demo_extract",
        "Local Ask CFS cited demonstration context as live data.",
        failures,
    )
    checks += require(
        (ai.get("provenance") or {}).get("runtime_mode") == "local",
        "Local Ask CFS provenance is missing.",
        failures,
    )

    demo_powerbi = json.loads(
        (ROOT / "public/demo-data/economics_powerbi_export.json").read_text(
            encoding="utf-8",
        ),
    )
    checks += require(
        (demo_powerbi.get("provenance") or {}).get("data_origin")
        == "sanitized_demo_extract"
        and (demo_powerbi.get("provenance") or {}).get("runtime_mode") == "demo",
        "Demo Power BI export does not identify demonstration provenance.",
        failures,
    )

    print(
        json.dumps(
            {
                "checks": checks,
                "failed": len(failures),
                "local_ai_source": ai.get("data_source"),
                "local_powerbi_origin": (powerbi.get("provenance") or {}).get(
                    "data_origin",
                ),
            },
            indent=2,
        ),
    )
    for failure in failures:
        print(f"FAIL: {failure}")
    return 1 if failures else 0


def require(condition: bool, message: str, failures: list[str]) -> int:
    if not condition:
        failures.append(message)
    return 1


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def get_json(url: str) -> dict:
    with urllib.request.urlopen(url, timeout=45) as response:
        return json.loads(response.read().decode("utf-8"))


def post_json(url: str, payload: dict) -> dict:
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=45) as response:
        return json.loads(response.read().decode("utf-8"))


if __name__ == "__main__":
    raise SystemExit(main())
