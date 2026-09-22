import assert from "node:assert/strict";
import { getManagementHandoffCameraTarget } from "../src/lib/map/managementHandoffCamera.ts";

const extent = (x, y) => ({ xmax: x + 0.01, xmin: x, ymax: y + 0.01, ymin: y });
const distributed = [extent(0, 0), extent(100, 100), ...Array.from({ length: 100 }, (_, index) => extent(40 + index / 20, 40 + index / 20))];

assert.deepEqual(
  getManagementHandoffCameraTarget([extent(10, 10)], { featureCount: 1, selection: "hotspot" }),
  { extent: extent(10, 10), padding: 2.2 },
);
const focal = getManagementHandoffCameraTarget(distributed, { featureCount: distributed.length, selection: "flood-review" });
assert.ok(focal);
assert.ok(focal.extent.xmax - focal.extent.xmin < 20);
assert.ok(focal.extent.ymax - focal.extent.ymin < 20);

console.log("PASS Management handoff camera framing");
