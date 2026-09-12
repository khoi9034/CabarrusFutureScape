import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  getManagementPeriod,
  managementDetailUrl,
  managementKpis,
} from "../src/lib/managementAnalysis.ts";

const recent = getManagementPeriod("2023-2025");
assert.deepEqual([recent.startYear, recent.endYear], [2023, 2025]);
assert.equal(getManagementPeriod("unsupported").id, "all");
assert.equal(managementKpis.permitActivity.section, "planning-insights");
assert.equal(managementKpis.economicReview.section, "economic-insights");
assert.equal(managementKpis.elevatedSignals.periodSensitive, false);
assert.equal(
  managementDetailUrl("planning-insights", "permit-activity", "2023-2025"),
  "/?app=management&section=planning-insights&focus=permit-activity&period=2023-2025",
);

const [summaryResponse, trendsResponse, hotspotsResponse, workspace, snapshots, demoAsk] = await Promise.all([
  fetch("http://127.0.0.1:8000/development/activity-summary?date_start=2023-01-01&date_end=2025-12-31"),
  fetch("http://127.0.0.1:8000/development/trends?start_year=2023&end_year=2025"),
  fetch("http://127.0.0.1:8000/development/hotspots?start_year=2023&end_year=2025&limit=10"),
  readFile("src/components/management/ManagementWorkspace.tsx", "utf8"),
  readFile("src/components/dashboard/IntelligencePanel.tsx", "utf8"),
  readFile("src/lib/aiSearchService.ts", "utf8"),
]);
assert.equal(summaryResponse.ok && trendsResponse.ok && hotspotsResponse.ok, true, "period-aware development APIs must be healthy");
const [summary, trends, hotspots] = await Promise.all([summaryResponse.json(), trendsResponse.json(), hotspotsResponse.json()]);
assert.equal(summary.total_permits, trends.total_permits, "Overview and Planning must use the same filtered permit total");
assert.equal(summary.total_permits, 11_854);
assert.equal(summary.active_parcel_count, 9_388);
assert.equal(hotspots.filters_applied.start_year, 2023);
assert.match(workspace, /management_analysis_period: period\.label/);
assert.match(workspace, /page_permit_records: development\.totalPermits/);
assert.match(snapshots, /managementAnalysisPeriod/);
assert.match(demoAsk, /The current Management view contains \$\{count\} permit records for \$\{period\}/);

console.log("PASS Management shared context, period APIs, KPI consistency, Ask context, and Snapshot period state");
