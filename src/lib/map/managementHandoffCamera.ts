import type { ManagementMapSelection } from "@/lib/api/managementMap";

export interface ManagementCameraExtent {
  xmax: number;
  xmin: number;
  ymax: number;
  ymin: number;
}

export function getManagementHandoffCameraTarget(
  extents: ManagementCameraExtent[],
  options: { featureCount: number; selection: ManagementMapSelection },
) {
  const valid = extents.filter(
    ({ xmax, xmin, ymax, ymin }) =>
      [xmax, xmin, ymax, ymin].every(Number.isFinite),
  );
  if (!valid.length) return null;

  const full = getExtent(valid);
  if (options.selection === "hotspot" || options.featureCount <= 48) {
    return { extent: full, padding: options.featureCount === 1 ? 2.2 : 1.35 };
  }

  // ponytail: central 60% is a cheap, stable concentration proxy; use clustering only if this stops being useful.
  const centersX = valid.map((extent) => (extent.xmin + extent.xmax) / 2).sort((a, b) => a - b);
  const centersY = valid.map((extent) => (extent.ymin + extent.ymax) / 2).sort((a, b) => a - b);
  const lower = Math.floor((valid.length - 1) * 0.2);
  const upper = Math.ceil((valid.length - 1) * 0.8);
  const focal = valid.filter((extent) => {
    const x = (extent.xmin + extent.xmax) / 2;
    const y = (extent.ymin + extent.ymax) / 2;
    return x >= centersX[lower] && x <= centersX[upper] && y >= centersY[lower] && y <= centersY[upper];
  });

  return { extent: getExtent(focal.length ? focal : valid), padding: 1.35 };
}

function getExtent(extents: ManagementCameraExtent[]): ManagementCameraExtent {
  return {
    xmax: Math.max(...extents.map((extent) => extent.xmax)),
    xmin: Math.min(...extents.map((extent) => extent.xmin)),
    ymax: Math.max(...extents.map((extent) => extent.ymax)),
    ymin: Math.min(...extents.map((extent) => extent.ymin)),
  };
}
