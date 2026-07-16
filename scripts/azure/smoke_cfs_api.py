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


class Smoke:
    def __init__(self, base_url: str, token: str | None, samples: int, timeout_seconds: float) -> None:
        self.base_url = base_url.rstrip("/")
        self.headers = {"X-CFS-Staging-Token": token} if token else {}
        self.samples = samples
        self.timeout_seconds = timeout_seconds
        self.results: list[dict[str, Any]] = []
        self.cleanup: list[tuple[str, str]] = []

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
        self.request("investment screening", "POST", "/investment/screen", json_body={"limit": 3, "strategy": "development_land"})
        self.request("research context", "GET", f"/investment/research-context/{PARCEL_ID}")
        self.request("acs context", "GET", f"/investment/candidates/{PARCEL_ID}/market-context")
        self.request("environmental context", "GET", f"/investment/candidates/{PARCEL_ID}/environmental-context")
        try:
            self._writable_workflows()
        finally:
            self._cleanup()
        return {"ok": True, "base_url": self.base_url, "results": self.results}

    def _writable_workflows(self) -> None:
        candidate = self.request(
            "candidate intake create",
            "POST",
            "/investment/intake",
            json_body={"candidate_name": "AZ2 QA Candidate", "source_type": "Manual Research", "strategy": "development_land", "parcel_id": PARCEL_ID},
        )
        candidate_id = candidate.get("id") or candidate.get("candidate", {}).get("id")
        if not candidate_id:
            raise RuntimeError("candidate intake create did not return an id")
        self.cleanup.append(("candidate", candidate_id))
        self.request("candidate intake read", "GET", f"/investment/intake/{candidate_id}")
        self.request("candidate intake update", "PATCH", f"/investment/intake/{candidate_id}", json_body={"review_status": "Screening"})

        saved_item = self.request("saved item create", "POST", "/investment/saved-items", json_body={"item_type": "parcel", "item_reference_id": PARCEL_ID, "parcel_id": PARCEL_ID, "label": "AZ2 QA Parcel"})
        self.cleanup.append(("saved_item", saved_item["id"]))
        recent = self.request("recent work create", "POST", "/investment/recent-work", json_body={"activity_type": "az2-qa-opened", "reference_type": "parcel", "reference_id": PARCEL_ID, "label": "AZ2 QA Recent", "page": "research"})
        recent_id = next((item["id"] for item in recent.get("items", []) if item.get("label") == "AZ2 QA Recent"), "")
        if recent_id:
            self.cleanup.append(("recent_work", recent_id))
        saved_search = self.request("saved search create", "POST", "/investment/saved-searches", json_body={"search_name": "AZ2 QA Search", "goal": "Custom"})
        self.cleanup.append(("saved_search", saved_search["id"]))
        engagement = self.request("engagement create", "POST", "/investment/engagements", json_body={"engagement_name": "AZ2 QA Engagement", "selected_strategy": "development_land"})
        self.cleanup.append(("engagement", engagement["id"]))
        scenario = self.request("underwriting create", "POST", "/investment/underwriting/scenarios", json_body={"scenario_name": "AZ2 QA Scenario", "parcel_id": PARCEL_ID, "assumptions": {}})
        self.cleanup.append(("scenario", scenario["id"]))
        self.request("underwriting calculate", "POST", f"/investment/underwriting/scenarios/{scenario['id']}/calculate")
        self.request("report generation", "POST", "/investment/reports/generate", json_body={"report_type": "development_site_review", "parcel_id": PARCEL_ID})
        report_item = self.request("report bucket", "POST", "/investment/saved-items", json_body={"item_type": "report", "item_reference_id": "az2-qa-report", "label": "AZ2 QA Report"})
        self.cleanup.append(("saved_item", report_item["id"]))
        self.request("print preparation", "POST", "/investment/reports/generate", json_body={"report_type": "due_diligence_brief", "parcel_id": PARCEL_ID})

    def _cleanup(self) -> None:
        routes = {
            "scenario": "/investment/underwriting/scenarios/{id}",
            "engagement": "/investment/engagements/{id}",
            "saved_search": "/investment/saved-searches/{id}",
            "saved_item": "/investment/saved-items/{id}",
            "recent_work": "/investment/recent-work/{id}",
            "candidate": "/investment/intake/{id}",
        }
        for kind, item_id in reversed(self.cleanup):
            try:
                self.request(f"cleanup {kind}", "DELETE", routes[kind].format(id=item_id))
            except Exception:
                pass


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--token", default=os.getenv("CFS_STAGING_ACCESS_TOKEN"))
    parser.add_argument("--samples", type=int, default=1)
    parser.add_argument("--timeout-seconds", type=float, default=90)
    parser.add_argument("--output", type=Path, default=Path(r"C:\CFS_Azure_Migration\az2_container_apps\cfs-api-smoke.json"))
    args = parser.parse_args()
    report = Smoke(args.base_url, args.token, args.samples, args.timeout_seconds).run()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({"ok": True, "checks": len(report["results"])}))


if __name__ == "__main__":
    main()
