from __future__ import annotations

import argparse
import json
import os
import statistics
import time
from pathlib import Path
from typing import Any

import requests

PARCEL_ID = "CFS-PARCEL-0149726579"
ROOT = Path(__file__).resolve().parents[2]


class Smoke:
    def __init__(self, base_url: str, token: str | None, samples: int, timeout_seconds: float) -> None:
        self.base_url = base_url.rstrip("/")
        self.headers = {"X-CFS-Staging-Token": token} if token else {}
        self.samples = samples
        self.timeout_seconds = timeout_seconds
        self.results: list[dict[str, Any]] = []

    def request(self, name: str, method: str, path: str, *, json_body: Any = None, auth: bool = True) -> Any:
        timings = []
        body = None
        for _ in range(self.samples):
            started = time.perf_counter()
            response = requests.request(
                method,
                f"{self.base_url}{path}",
                headers=self.headers if auth else {},
                json=json_body,
                timeout=self.timeout_seconds,
            )
            timings.append((time.perf_counter() - started) * 1000)
            if response.status_code >= 400:
                raise RuntimeError(f"{name} failed: HTTP {response.status_code}")
            if response.content:
                body = response.json()
        self.results.append(
            {
                "name": name,
                "method": method,
                "path": path,
                "samples": len(timings),
                "min_ms": round(min(timings), 1),
                "median_ms": round(statistics.median(timings), 1),
                "max_ms": round(max(timings), 1),
            }
        )
        return body

    def run(self) -> dict[str, Any]:
        self.request("health", "GET", "/health", auth=False)
        self.request("ready", "GET", "/health/ready", auth=False)
        self.request("database", "GET", "/health/database", auth=False)
        self.request("staging protection", "GET", "/parcels/search?q=CFS&limit=1", auth=True)
        self.request("parcel search", "GET", f"/parcels/search?q={PARCEL_ID}&limit=1")
        self.request("parcel detail", "GET", f"/parcels/{PARCEL_ID}")
        self.request("development hotspots", "GET", "/development/hotspots?limit=1")
        self.request("permit trends", "GET", "/development/trends")
        self.request("new construction trends", "GET", "/development/new-construction/trends")
        self.request("model lab", "GET", "/development/prediction/features/summary")
        self.request("school context", "GET", f"/constraints/schools/{PARCEL_ID}")
        self.request("transportation context", "GET", "/development/prediction/transportation-accessibility/summary")
        self.request("utility proxies", "GET", f"/wsacc/parcel/{PARCEL_ID}")
        self.request("indicator center", "GET", "/indicators/intelligence")
        self.request("economics intelligence", "GET", "/economics/intelligence")
        self.request("power bi export", "GET", "/economics/powerbi-export")
        self.request("ask planning", "POST", "/ai/search", json_body={"app_mode": "planning", "mode": "live", "query": "What should planning inspect first?"})
        self.request("ask economics", "POST", "/ai/search", json_body={"app_mode": "economics", "mode": "live", "query": "What economic signals matter here?"})
        self.request("master data catalog", "GET", "/api/v1/master-data/datasets")
        return {"ok": True, "base_url": self.base_url, "results": self.results}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--token", default=os.getenv("CFS_STAGING_ACCESS_TOKEN"))
    parser.add_argument("--samples", type=int, default=1)
    parser.add_argument("--timeout-seconds", type=float, default=90)
    parser.add_argument("--output", type=Path, default=ROOT / "local-data" / "azure-migration" / "az2_container_apps" / "cfs-api-smoke.json")
    args = parser.parse_args()
    report = Smoke(args.base_url, args.token, args.samples, args.timeout_seconds).run()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({"ok": True, "checks": len(report["results"])}))


if __name__ == "__main__":
    main()
