import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  createManagementPeriod,
  isManagementPeriodWithinCoverage,
  managementDetailUrl,
  managementKpis,
  readManagementPeriodFromSearch,
} from "../src/lib/managementAnalysis.ts";

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

const [coverageResponse, summaryResponse, hotspotsResponse, workspace, snapshots, demoAsk, repository] = await Promise.all([
  fetch("http://127.0.0.1:8000/development/activity-summary"),
  fetch("http://127.0.0.1:8000/development/activity-summary?date_start=2023-01-01&date_end=2025-12-31"),
  fetch("http://127.0.0.1:8000/development/hotspots?date_start=2023-01-01&date_end=2025-12-31&limit=10"),
  readFile("src/components/management/ManagementWorkspace.tsx", "utf8"),
  readFile("src/components/dashboard/IntelligencePanel.tsx", "utf8"),
  readFile("src/lib/aiSearchService.ts", "utf8"),
  readFile("backend/app/repositories/development_repository.py", "utf8"),
]);
assert.equal(coverageResponse.ok && summaryResponse.ok && hotspotsResponse.ok, true, "period-aware development APIs must be healthy");
const [available, summary, hotspots] = await Promise.all([coverageResponse.json(), summaryResponse.json(), hotspotsResponse.json()]);
assert.deepEqual(available.date_range, { activity_date_min: coverage.startDate, activity_date_max: coverage.endDate });
assert.deepEqual(available.by_year.map((row) => row.year), [1986, 1989, 1991, 1998, 1999, ...Array.from({ length: 26 }, (_, index) => 2000 + index)]);
assert.equal(summary.total_permits, 11_854);
assert.equal(summary.active_parcel_count, 9_388);
assert.equal(hotspots.filters_applied.date_start, "2023-01-01");
assert.match(workspace, /management_analysis_period: period\.label/);
assert.match(workspace, /development\.byMonth\.length \? development\.byMonth : development\.byYear/);
assert.match(workspace, /page_permit_records: development\.totalPermits/);
assert.match(snapshots, /managementAnalysisPeriod/);
assert.match(demoAsk, /The current Management view contains \$\{count\} permit records for \$\{period\}/);
assert.match(repository, /RealPropertyPermitParcelRelationship\.activity_date/);

console.log("PASS Management range gate, dynamic coverage, exact-date APIs, shared KPI/trend context, Ask context, and Snapshot period state");
