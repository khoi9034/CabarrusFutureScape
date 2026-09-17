import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  createManagementPeriod,
  isManagementPeriodWithinCoverage,
  managementDetailUrl,
  managementKpis,
  readManagementPeriodFromSearch,
} from "../src/lib/managementAnalysis.ts";
import { createManagementHandoffUrl, readManagementHandoff } from "../src/lib/managementHandoff.ts";

const coverage = { startDate: "1986-12-01", endDate: "2025-12-31" };
const recent = createManagementPeriod("past-3-years", coverage);
assert.deepEqual([recent.startDate, recent.endDate], ["2023-01-01", "2025-12-31"]);
assert.deepEqual([createManagementPeriod("past-3-months", coverage).startDate, createManagementPeriod("past-12-months", coverage).startDate], ["2025-10-01", "2025-01-01"]);
assert.equal(createManagementPeriod("past-5-years", coverage).startDate, "2021-01-01");
assert.deepEqual([createManagementPeriod("all", coverage).startDate, createManagementPeriod("all", coverage).endDate], [coverage.startDate, coverage.endDate]);
assert.deepEqual([createManagementPeriod("custom", coverage, { startYear: 1999, endYear: 2001 }).startDate, createManagementPeriod("custom", coverage, { startYear: 1999, endYear: 2001 }).endDate], ["1999-01-01", "2001-12-31"]);
assert.equal(isManagementPeriodWithinCoverage(recent, coverage), true);
assert.equal(isManagementPeriodWithinCoverage({ ...recent, endDate: "2026-12-31" }, coverage), false);
assert.equal(isManagementPeriodWithinCoverage({ ...recent, startDate: "2025-01-01", endDate: "2024-12-31" }, coverage), false);
assert.equal(readManagementPeriodFromSearch("?from=2023-01-01&to=2025-12-31&range=past-3-years")?.label, "Jan 2023–Dec 2025");
assert.equal(readManagementPeriodFromSearch("?period=2023-2025"), null);
assert.equal(managementKpis.permitActivity.section, "planning-insights");
assert.equal(managementKpis.economicReview.section, "economic-insights");
assert.equal(managementKpis.elevatedSignals.periodSensitive, false);
assert.equal(
  managementDetailUrl("planning-insights", "permit-activity", recent),
  "/?from=2023-01-01&to=2025-12-31&range=past-3-years&app=management&section=planning-insights&focus=permit-activity",
);
const handoff = {
  analysisPeriod: recent,
  filter: { population: "active_development_parcels" },
  fitExtent: "results",
  selectionType: "parcel-population",
  selectionValue: "active_development_parcels",
  sourceInsightType: "planning-constraints",
  sourceManagementPage: "planning-insights",
  targetWorkspace: "planning",
};
const handoffUrl = createManagementHandoffUrl(handoff);
assert.match(handoffUrl, /from=management/);
assert.match(handoffUrl, /periodFrom=2023-01-01/);
assert.match(handoffUrl, /selection=parcel-population/);
assert.match(handoffUrl, /filter=%7B%22population%22%3A%22active_development_parcels%22%7D/);
assert.deepEqual(readManagementHandoff({ cfsManagementHandoff: handoff }, handoffUrl.slice(1))?.analysisPeriod, recent);

const [coverageResponse, summaryResponse, hotspotsResponse, workspace, snapshots, demoAsk, repository, activityHook, hotspotHook] = await Promise.all([
  fetch("http://127.0.0.1:8000/development/activity-summary"),
  fetch("http://127.0.0.1:8000/development/activity-summary?date_start=2023-01-01&date_end=2025-12-31"),
  fetch("http://127.0.0.1:8000/development/hotspots?date_start=2023-01-01&date_end=2025-12-31&limit=10"),
  readFile("src/components/management/ManagementWorkspace.tsx", "utf8"),
  readFile("src/components/dashboard/IntelligencePanel.tsx", "utf8"),
  readFile("src/lib/aiSearchService.ts", "utf8"),
  readFile("backend/app/repositories/development_repository.py", "utf8"),
  readFile("src/hooks/useDevelopmentActivitySummary.ts", "utf8"),
  readFile("src/hooks/useDevelopmentHotspots.ts", "utf8"),
]);
assert.equal(coverageResponse.ok && summaryResponse.ok && hotspotsResponse.ok, true, "period-aware development APIs must be healthy");
const [available, summary, hotspots] = await Promise.all([coverageResponse.json(), summaryResponse.json(), hotspotsResponse.json()]);
assert.deepEqual(available.date_range, { activity_date_min: coverage.startDate, activity_date_max: coverage.endDate });
assert.deepEqual(available.by_year.map((row) => row.year), [1986, 1989, 1991, 1998, 1999, ...Array.from({ length: 26 }, (_, index) => 2000 + index)]);
assert.equal(summary.total_permits, 11_854);
assert.equal(summary.active_parcel_count, 9_388);
assert.deepEqual(summary.analysis_period, { end_date: "2025-12-31", start_date: "2023-01-01" });
assert.equal(hotspots.filters_applied.date_start, "2023-01-01");
assert.deepEqual(hotspots.analysis_period, { end_date: "2025-12-31", start_date: "2023-01-01" });
assert.equal(hotspots.total_count, summary.active_parcel_count);
assert.ok(hotspots.results.every((row) => row.first_permit_date >= "2023-01-01" && row.latest_permit_date <= "2025-12-31"));
assert.match(workspace, /management_analysis_period: period\.label/);
assert.match(workspace, /monthSpan <= 24 \? development\.byMonth : development\.byYear/);
assert.match(workspace, /title="Reference context"/);
assert.match(workspace, /actionLabel: "Inspect permits"/);
assert.doesNotMatch(workspace, /title="Planning Watchlist"/);
assert.match(workspace, /aria-label="Data sources"/);
assert.match(workspace, /Fixed model bands · not permit-period filtered/);
assert.match(workspace, /page_permit_records: development\.totalPermits/);
assert.match(snapshots, /managementAnalysisPeriod/);
assert.match(demoAsk, /The current Management view contains \$\{count\} permit records for \$\{period\}/);
assert.match(repository, /period_hotspot_activity/);
assert.match(repository, /RealPropertyPermitParcelRelationship\.activity_date/);
assert.match(activityHook, /summaryCache\.get\(queryKey\)/);
assert.match(hotspotHook, /hotspotCache\.get\(queryKey\)/);
assert.match(hotspotHook, /sort_by: "total_permit_count"/);

const rangeContracts = [
  { active: 3_074, buckets: 12, end: "2025-12-31", permits: 3_642, start: "2025-01-01", trend: "monthly" },
  { active: 9_388, buckets: 3, end: "2025-12-31", permits: 11_854, start: "2023-01-01", trend: "yearly" },
  { active: 43_468, buckets: 31, end: "2025-12-31", permits: 64_400, start: "1986-12-01", trend: "yearly" },
  { active: 10_151, buckets: 3, end: "2022-12-31", permits: 12_327, start: "2020-01-01", trend: "yearly" },
];
for (const expected of rangeContracts) {
  const query = `date_start=${expected.start}&date_end=${expected.end}`;
  const [summaryResult, hotspotResult] = await Promise.all([
    fetch(`http://127.0.0.1:8000/development/activity-summary?${query}`).then((response) => response.json()),
    fetch(`http://127.0.0.1:8000/development/hotspots?${query}&limit=10&sort_by=total_permit_count`).then((response) => response.json()),
  ]);
  assert.deepEqual(summaryResult.analysis_period, { end_date: expected.end, start_date: expected.start });
  assert.deepEqual(hotspotResult.analysis_period, { end_date: expected.end, start_date: expected.start });
  assert.equal(summaryResult.total_permits, expected.permits);
  assert.equal(summaryResult.active_parcel_count, expected.active);
  assert.equal(hotspotResult.total_count, expected.active);
  assert.ok(hotspotResult.results.every((row) => row.first_permit_date >= expected.start && row.latest_permit_date <= expected.end));
  assert.equal(expected.trend === "monthly" ? summaryResult.by_month.length : summaryResult.by_year.length, expected.buckets);
}

console.log("PASS Management period contract, exact-date hotspot metrics, response metadata, cache isolation, reference separation, Ask context, and Snapshot period state");
