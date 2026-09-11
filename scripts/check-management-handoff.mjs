import assert from "node:assert/strict";
import {
  createManagementHandoffUrl,
  hasUnresolvedManagementTarget,
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

console.log("PASS Management-to-Builder handoff contract");
