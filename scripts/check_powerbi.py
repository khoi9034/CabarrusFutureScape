from __future__ import annotations

import csv
import io
import json
import os
import re
import urllib.request
import zipfile
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
API_BASE = os.getenv("CFS_LOCAL_API_BASE_URL", "http://127.0.0.1:8000").rstrip("/")
DEMO_BASE = os.getenv("CFS_DEMO_BASE_URL", "http://127.0.0.1:3000").rstrip("/")
DEMO_PAYLOAD = ROOT / "public/demo-data/economics_powerbi_export.json"
DEMO_ZIP = ROOT / "public/demo-data/powerbi/cfs-powerbi-starter-pack.zip"
REQUIRED_TABLES = (
    "domain_readiness_dim",
    "economics_kpi_fact",
    "geography_dim",
    "parcel_economic_signal_fact",
    "scenario_dim",
    "scenario_output_fact",
    "time_dim",
)
REQUIRED_FILES = {
    "README.md",
    "data_dictionary.csv",
    "dax-measures.dax",
    "import-qa-checklist.md",
    "model.json",
    "power-query-m.txt",
    "provenance.json",
    "relationships.json",
    "report-guide.md",
    *(f"csv/{table}.csv" for table in REQUIRED_TABLES),
}
FORBIDDEN_FIELDS = re.compile(
    r"(owner|mailing|email|phone|password|secret|token|credential|exact_probability)",
    re.IGNORECASE,
)


def main() -> int:
    failures: list[str] = []
    local_payload = get_json(f"{API_BASE}/economics/powerbi-export")
    demo_payload = json.loads(DEMO_PAYLOAD.read_text(encoding="utf-8"))
    local_zip = get_bytes(f"{API_BASE}/economics/powerbi-export/starter-pack.zip")
    demo_zip = DEMO_ZIP.read_bytes()

    validate_payload("local", local_payload, "local", "local_api", failures)
    validate_payload(
        "demo",
        demo_payload,
        "demo",
        "sanitized_demo_extract",
        failures,
    )
    validate_zip("local", local_zip, local_payload, failures)
    validate_zip("demo", demo_zip, demo_payload, failures)
    guidance = post_json(
        f"{API_BASE}/ai/search",
        {
            "app_mode": "economics",
            "mode": "live",
            "query": "Which tables should I import into Power BI?",
        },
    )
    for table in REQUIRED_TABLES:
        if table not in guidance.get("answer", ""):
            failures.append(f"Ask CFS Power BI guidance omitted {table}")
    ui_source = (
        ROOT / "src/components/economics/EconomicsShell.tsx"
    ).read_text(encoding="utf-8")
    if "cfs-powerbi-starter-pack.zip" not in ui_source:
        failures.append("Power BI Starter Pack download is not visible in the UI")
    vercel_ignore = (ROOT / ".vercelignore").read_text(encoding="utf-8")
    if "!public/demo-data/powerbi/cfs-powerbi-starter-pack.zip" not in vercel_ignore:
        failures.append("Vercel excludes the public Power BI Starter Pack")

    for table in REQUIRED_TABLES:
        require_200(f"{API_BASE}/economics/powerbi-export/csv/{table}", failures)
        require_200(f"{DEMO_BASE}/demo-data/powerbi/{table}.csv", failures)
    require_200(f"{API_BASE}/economics/powerbi-export/starter-pack.zip", failures)
    require_200(
        f"{DEMO_BASE}/demo-data/powerbi/cfs-powerbi-starter-pack.zip",
        failures,
    )

    result = {
        "demo_rows": row_counts(demo_payload),
        "failed": len(failures),
        "local_rows": row_counts(local_payload),
        "packages": 2,
        "tables": len(REQUIRED_TABLES),
        "visible_downloads": len(REQUIRED_TABLES) * 2 + 2,
    }
    print(json.dumps(result, indent=2))
    for failure in failures:
        print(f"FAIL: {failure}")
    return 1 if failures else 0


def validate_payload(
    label: str,
    payload: dict[str, Any],
    runtime_mode: str,
    data_origin: str,
    failures: list[str],
) -> None:
    tables = payload.get("tables") or {}
    if set(tables) != set(REQUIRED_TABLES):
        failures.append(f"{label}: table set mismatch")
    for table in REQUIRED_TABLES:
        if not tables.get(table):
            failures.append(f"{label}: {table} is empty")
        for row in tables.get(table) or []:
            forbidden = [field for field in row if FORBIDDEN_FIELDS.search(field)]
            if forbidden:
                failures.append(f"{label}: forbidden fields in {table}: {forbidden}")
    provenance = payload.get("provenance") or {}
    if provenance.get("runtime_mode") != runtime_mode:
        failures.append(f"{label}: runtime provenance mismatch")
    if provenance.get("data_origin") != data_origin:
        failures.append(f"{label}: data origin mismatch")
    if provenance.get("row_counts") != row_counts(payload):
        failures.append(f"{label}: documented row counts do not match")
    for relationship in payload.get("relationship_guidance") or []:
        from_rows = tables.get(relationship["from_table"]) or []
        to_rows = tables.get(relationship["to_table"]) or []
        if any(relationship["from_column"] not in row for row in from_rows):
            failures.append(f"{label}: relationship fact field missing")
        keys = [row.get(relationship["to_column"]) for row in to_rows]
        if len(keys) != len(set(keys)):
            failures.append(f"{label}: relationship dimension key is not unique")
        if relationship.get("cardinality") != "many_to_one":
            failures.append(f"{label}: relationship cardinality is invalid")
        if relationship.get("cross_filter_direction") != "single":
            failures.append(f"{label}: relationship cross-filter must be single")


def validate_zip(
    label: str,
    data: bytes,
    payload: dict[str, Any],
    failures: list[str],
) -> None:
    if len(data) < 1000:
        failures.append(f"{label}: starter ZIP is empty")
        return
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        names = set(archive.namelist())
        missing = REQUIRED_FILES - names
        if missing:
            failures.append(f"{label}: starter ZIP missing {sorted(missing)}")
        headers: dict[str, set[str]] = {}
        for table in REQUIRED_TABLES:
            rows = list(
                csv.DictReader(
                    io.StringIO(
                        archive.read(f"csv/{table}.csv").decode("utf-8"),
                    ),
                ),
            )
            headers[table] = set(rows[0]) if rows else set()
            if len(rows) != len((payload.get("tables") or {}).get(table) or []):
                failures.append(f"{label}: CSV row count mismatch for {table}")
        dax = archive.read("dax-measures.dax").decode("utf-8")
        for table, column in re.findall(r"'([^']+)'\[([^\]]+)\]", dax):
            if table not in headers or column not in headers[table]:
                failures.append(f"{label}: DAX reference missing {table}.{column}")
        m_text = archive.read("power-query-m.txt").decode("utf-8")
        for table in REQUIRED_TABLES:
            if f"csv\\\\{table}.csv" not in m_text:
                failures.append(f"{label}: M template missing {table}.csv")


def row_counts(payload: dict[str, Any]) -> dict[str, int]:
    return {
        name: len(rows or [])
        for name, rows in (payload.get("tables") or {}).items()
    }


def get_json(url: str) -> dict[str, Any]:
    return json.loads(get_bytes(url).decode("utf-8"))


def get_bytes(url: str) -> bytes:
    with urllib.request.urlopen(url, timeout=45) as response:
        if response.status != 200:
            raise RuntimeError(f"{url} returned {response.status}")
        return response.read()


def post_json(url: str, payload: dict[str, Any]) -> dict[str, Any]:
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=45) as response:
        return json.loads(response.read().decode("utf-8"))


def require_200(url: str, failures: list[str]) -> None:
    try:
        with urllib.request.urlopen(url, timeout=45) as response:
            if response.status != 200 or not response.read(32):
                failures.append(f"{url}: empty or non-200 response")
    except Exception as error:
        failures.append(f"{url}: {error}")


if __name__ == "__main__":
    raise SystemExit(main())
