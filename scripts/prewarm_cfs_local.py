"""Prewarm and verify the frozen Local presentation cache."""

from __future__ import annotations

import argparse
import hashlib
import json
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from pathlib import Path
from time import perf_counter
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / "logs" / "local-presentation-cache.json"


def request(base_url: str, path: str, method: str = "GET") -> tuple[bytes, float]:
    started = perf_counter()
    with urlopen(Request(f"{base_url}{path}", method=method), timeout=180) as response:
        body = response.read()
        if response.status >= 400:
            raise RuntimeError(f"{path} returned HTTP {response.status}")
    return body, round((perf_counter() - started) * 1000, 1)


def month_start(end: date, months: int) -> str:
    index = end.year * 12 + end.month - 1 - months + 1
    return f"{index // 12:04d}-{index % 12 + 1:02d}-01"


def comparable(name: str, body: bytes) -> bytes:
    if name != "master-data":
        return body
    payload = json.loads(body)
    return json.dumps(payload["data"], sort_keys=True, separators=(",", ":")).encode()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument("--rebuild", action="store_true")
    args = parser.parse_args()
    base_url = args.base_url.rstrip("/")
    if args.rebuild:
        request(base_url, "/health/presentation-cache/reset", "POST")

    coverage_body, coverage_ms = request(base_url, "/development/activity-summary")
    coverage = json.loads(coverage_body)
    date_range = coverage["date_range"]
    end = date.fromisoformat(date_range["activity_date_max"])
    periods = {
        "past-3-months": (month_start(end, 3), end.isoformat()),
        "past-12-months": (month_start(end, 12), end.isoformat()),
        "past-3-years": (f"{end.year - 2:04d}-01-01", end.isoformat()),
        "past-5-years": (f"{end.year - 4:04d}-01-01", end.isoformat()),
        "all": (date_range["activity_date_min"], end.isoformat()),
    }
    paths = {
        "economics": "/economics/intelligence",
        "flood": "/constraints/flood/summary",
        "master-data": "/api/v1/master-data/datasets",
        "parcel-statistics": "/parcels/statistics",
        "parcel-zoning": "/parcels/zoning-summary",
        "development-statistics": "/development/statistics",
        "development-zoning": "/development/zoning-summary",
        "permit-segments": "/development/permit-segments/statistics",
        "new-construction-statistics": "/development/new-construction/statistics",
        "new-construction-trends": "/development/new-construction/trends",
        "transportation-accessibility": "/development/prediction/transportation-accessibility/summary",
        "transportation-plan-traffic": "/development/prediction/transportation-plan-traffic/summary",
        "prediction-features": "/development/prediction/features/summary",
        "prediction-ranking": "/development/prediction/ranking/summary",
        "signals-preview": "/development/model-research/preview?limit=120&signal=higher",
        "schools-qa": "/constraints/schools/qa-summary",
        "schools-statistics": "/constraints/schools/statistics",
        "schools-utilization": "/constraints/schools/utilization-seed?limit=500",
        "wsacc": "/wsacc/statistics",
    }
    for name, (start, finish) in periods.items():
        query = f"date_start={start}&date_end={finish}"
        paths[f"activity-{name}"] = f"/development/activity-summary?{query}"
        paths[f"hotspots-{name}"] = (
            f"/development/hotspots?limit=10&sort_by=total_permit_count&{query}"
        )

    def fetch(item: tuple[str, str]) -> tuple[str, str, bytes, float]:
        name, path = item
        body, elapsed = request(base_url, path)
        return name, path, body, elapsed

    with ThreadPoolExecutor(max_workers=4) as executor:
        cold = list(executor.map(fetch, paths.items()))
    with ThreadPoolExecutor(max_workers=6) as executor:
        warm = list(executor.map(fetch, paths.items()))
    warm_by_name = {name: (body, elapsed) for name, _, body, elapsed in warm}
    results = []
    for name, path, body, cold_ms in cold:
        cached_body, cached_ms = warm_by_name[name]
        direct = comparable(name, body)
        cached = comparable(name, cached_body)
        if direct != cached:
            raise RuntimeError(f"Cached response mismatch for {path}")
        results.append({
            "name": name,
            "path": path,
            "postgis_build_ms": cold_ms,
            "cached_ms": cached_ms,
            "sha256": hashlib.sha256(direct).hexdigest(),
            "exact_match": True,
        })

    status_body, status_ms = request(base_url, "/health/presentation-cache")
    status = json.loads(status_body)
    if not status.get("ready"):
        raise RuntimeError(f"Presentation cache is not ready: {status}")
    report = {
        "status": "PASS",
        "cache": status,
        "coverage_build_ms": coverage_ms,
        "periods": periods,
        "results": results,
        "readiness_ms": status_ms,
    }
    REPORT.parent.mkdir(exist_ok=True)
    REPORT.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"[cfs-cache] PASS - {status['entry_count']} entries ready; warm responses verified byte-for-byte.")
    print(f"[cfs-cache] Report: {REPORT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
