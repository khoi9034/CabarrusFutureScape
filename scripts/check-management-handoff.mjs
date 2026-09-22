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

for (const id of Object.keys(managementKpiHandoffs)) {
  const handoff = createManagementKpiHandoff(
    id,
    { endDate: "2025-12-31", initialized: true, label: "Jan 2025–Dec 2025", preset: "custom", startDate: "2025-01-01" },
    "overview",
  );
  assert.equal(handoff.targetWorkspace, managementKpiHandoffs[id].targetWorkspace);
  assert.ok(handoff.resultLabel);
}
assert.equal(managementKpiHandoffs.permitActivity.primaryResult, "records");
assert.equal(managementKpiHandoffs.activeDevelopmentParcels.primaryResult, "features");
assert.equal(managementKpiHandoffs.highSignals.selectionValue, "high");

console.log("PASS Management-to-Analyst handoff contract");
