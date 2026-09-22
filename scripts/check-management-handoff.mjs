import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createManagementKpiHandoff,
  createManagementHandoffUrl,
  hasUnresolvedManagementTarget,
  managementKpiHandoffs,
  readManagementHandoff,
} from "../src/lib/managementHandoff.ts";

const context = {
  planningMode: "countywide",
  selectedHotspotContext: { officialParcelId: "CFS-PARCEL-0000000001" },
  selectedHotspotId: "CFS-PARCEL-0000000001",
  selectedParcelId: "CFS-PARCEL-0000000001",
  sourceInsightType: "planning-hotspot",
  sourceManagementPage: "planning-insights",
  targetWorkspace: "planning",
};
const url = createManagementHandoffUrl(context);
const search = new URL(url, "http://localhost").search;

assert.match(url, /app=planning/);
assert.match(url, /parcel=CFS-PARCEL-0000000001/);
assert.equal(
  readManagementHandoff({ cfsManagementHandoff: context }, search),
  context,
);
assert.equal(readManagementHandoff({}, search), null);
assert.equal(hasUnresolvedManagementTarget(search), true);
assert.equal(
  readManagementHandoff(
    { cfsManagementHandoff: context },
    search.replace("CFS-PARCEL-0000000001", "CFS-PARCEL-0000000002"),
  ),
  null,
);

const managementMapRouter = readFileSync(
  new URL("../backend/app/routers/management_map_router.py", import.meta.url),
  "utf8",
);
const mapRuntime = readFileSync(
  new URL("../src/components/gis/SceneViewContainer.tsx", import.meta.url),
  "utf8",
);
const economicsRuntime = readFileSync(
  new URL("../src/components/economics/EconomicsShell.tsx", import.meta.url),
  "utf8",
);
const intelligenceRuntime = readFileSync(
  new URL("../src/components/dashboard/IntelligencePanel.tsx", import.meta.url),
  "utf8",
);
const aiRuntime = readFileSync(
  new URL("../backend/app/services/ai_search_service.py", import.meta.url),
  "utf8",
);

for (const selection of [
  "active-development-parcels",
  "permit-activity",
  "hotspot",
  "flood-review",
  "flood-high-severe",
  "development-signals",
  "development-signals-high",
  "development-signals-very-high",
]) {
  assert.match(managementMapRouter, new RegExp(`"${selection}"`));
}
assert.match(mapRuntime, /cfs-management-result-layer/);
assert.match(mapRuntime, /getManagementHandoffCameraTarget/);
assert.match(economicsRuntime, /managementFilter\?\.economicStatus === "high_opportunity"/);
assert.match(economicsRuntime, /summary\.high_opportunity_count/);
assert.match(intelligenceRuntime, /What this means:/);
assert.match(intelligenceRuntime, /managementHandoff \? null/);
assert.match(aiRuntime, /def _management_handoff_answer/);

for (const id of Object.keys(managementKpiHandoffs)) {
  const handoff = createManagementKpiHandoff(
    id,
    { endDate: "2025-12-31", initialized: true, label: "Jan 2025–Dec 2025", preset: "custom", startDate: "2025-01-01" },
    "overview",
  );
  assert.equal(handoff.targetWorkspace, managementKpiHandoffs[id].targetWorkspace);
  assert.ok(handoff.resultLabel);
  assert.ok(handoff.meaning);
  assert.ok(handoff.inspectNext);
}
assert.equal(managementKpiHandoffs.permitActivity.primaryResult, "records");
assert.equal(managementKpiHandoffs.activeDevelopmentParcels.primaryResult, "features");
assert.equal(managementKpiHandoffs.highSignals.selectionValue, "high");

for (const { selection, expected } of [
  { selection: "permit-activity&start_date=2025-01-01&end_date=2025-12-31", expected: [3_074, 3_642] },
  { selection: "active-development-parcels&start_date=2025-01-01&end_date=2025-12-31", expected: [3_074, 3_642] },
  { selection: "flood-review", expected: [7_989, 7_989] },
  { selection: "flood-high-severe", expected: [6_362, 6_362] },
  { selection: "development-signals", expected: [5_501, 5_501] },
  { selection: "development-signals-very-high", expected: [1_101, 1_101] },
  { selection: "development-signals-high", expected: [4_400, 4_400] },
]) {
  const response = await fetch(`http://127.0.0.1:8000/development/management-map?selection=${selection}`);
  assert.equal(response.ok, true, `selection ${selection} must load`);
  const result = await response.json();
  assert.deepEqual([result.feature_count, result.record_count], expected, selection);
}

const askResponse = await fetch("http://127.0.0.1:8000/ai/search", {
  body: JSON.stringify({
    app_mode: "planning",
    filter_context: {
      management_handoff_feature_count: 1_101,
      management_handoff_meaning: "Parcels in the Very High Development Signals band.",
      management_handoff_primary_result: "features",
      management_handoff_result_label: "Very High development-signal parcels",
      management_handoff_title: "Very High Development Signals",
    },
    mode: "live",
    query: "What am I looking at?",
  }),
  headers: { "content-type": "application/json" },
  method: "POST",
});
assert.equal(askResponse.ok, true, "handoff Ask Insights request must load");
assert.match((await askResponse.json()).answer, /1,101 Very High development-signal parcels/);

console.log("PASS Management-to-Analyst handoff contract");
