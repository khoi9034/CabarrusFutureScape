from __future__ import annotations

import json
import os
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
API_BASE = os.getenv("CFS_LOCAL_API_BASE_URL", "http://127.0.0.1:8000").rstrip("/")
REQUIRED_DOCS = (
    "docs/architecture/runtime-modes.md",
    "docs/architecture/data-provider-boundaries.md",
    "docs/architecture/enterprise-migration-readiness.md",
    "docs/ai/ask-cfs-architecture.md",
    "docs/ai/ask-cfs-safety-and-evaluation.md",
    "docs/economics/powerbi-starter-pack.md",
    "docs/gis/map-runtime-and-fallback.md",
)
REQUIRED_PATHS = (
    "/health",
    "/health/database",
    "/health/ready",
    "/parcels/search",
    "/indicators/intelligence",
    "/economics/intelligence",
    "/economics/powerbi-export",
    "/economics/powerbi-export/starter-pack.zip",
    "/ai/search",
)


def main() -> int:
    failures: list[str] = []
    for path in REQUIRED_DOCS:
        document = ROOT / path
        if not document.is_file() or document.stat().st_size < 300:
            failures.append(f"Missing or empty architecture document: {path}")

    client = read("src/lib/api/client.ts")
    config = read("backend/app/config.py")
    auth = read("backend/app/auth.py")
    telemetry = read("backend/app/telemetry.py")
    migration = read("docs/architecture/enterprise-migration-readiness.md")
    if 'CfsRuntimeMode = "demo" | "enterprise" | "local"' not in client:
        failures.append("Frontend runtime contract lacks enterprise mode.")
    if 'RuntimeMode = Literal["local", "enterprise"]' not in config:
        failures.append("Backend runtime contract lacks enterprise mode.")
    if "CFS_API_AUTH_MODE" not in config or "entra" not in auth.lower():
        failures.append("Entra/OIDC authorization boundary is missing.")
    if "cfs_telemetry_enabled" not in config or "enabled" not in telemetry.lower():
        failures.append("Configurable telemetry boundary is missing.")
    for role in (
        "Viewer",
        "Planner",
        "Analyst",
        "Report Author",
        "Data Steward",
        "Administrator",
    ):
        if role not in migration:
            failures.append(f"Authorization role is undocumented: {role}")

    openapi = get_json(f"{API_BASE}/openapi.json")
    paths = openapi.get("paths") or {}
    for path in REQUIRED_PATHS:
        if path not in paths:
            failures.append(f"OpenAPI path missing: {path}")
    if not openapi.get("components", {}).get("schemas"):
        failures.append("OpenAPI schemas are empty.")
    health = get_json(f"{API_BASE}/health")
    readiness = get_json(f"{API_BASE}/health/ready")
    if health.get("status") != "ok":
        failures.append("API health is not ok.")
    if readiness.get("status") != "ready":
        failures.append("API readiness is not ready.")

    print(
        json.dumps(
            {
                "documents": len(REQUIRED_DOCS),
                "failed": len(failures),
                "openapi_paths": len(paths),
                "required_contracts": len(REQUIRED_PATHS),
                "roles": 6,
            },
            indent=2,
        ),
    )
    for failure in failures:
        print(f"FAIL: {failure}")
    return 1 if failures else 0


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def get_json(url: str) -> dict:
    with urllib.request.urlopen(url, timeout=45) as response:
        return json.loads(response.read().decode("utf-8"))


if __name__ == "__main__":
    raise SystemExit(main())
