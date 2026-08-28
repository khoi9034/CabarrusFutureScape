import type { PlanningSnapshot } from "@/types";

export function planningSnapshotDefaultTitle(
  snapshot: {
    hasDevelopmentActivity?: boolean;
    overviewCommandMode?: PlanningSnapshot["overviewCommandMode"];
    selectedParcelId?: string | null;
  },
  date = new Date(),
) {
  const day = new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);

  if (snapshot.selectedParcelId) {
    return `Parcel ${snapshot.selectedParcelId} — Planning Review`;
  }
  if (snapshot.hasDevelopmentActivity) {
    return `Development Hotspot — ${day}`;
  }
  if (snapshot.overviewCommandMode === "indicatorCenter") {
    return `Planning Indicators — ${day}`;
  }
  if (snapshot.overviewCommandMode === "modelLab") {
    return `Model Research View — ${day}`;
  }
  return `Countywide Planning View — ${day}`;
}

export function planningSnapshotSummary(
  snapshot: Pick<
    PlanningSnapshot,
    | "activeLayers"
    | "developmentActivityContext"
    | "indicatorCenterContext"
    | "modelLabContext"
    | "selectedParcelId"
  >,
) {
  const context = snapshot.selectedParcelId
    ? "Parcel review"
    : snapshot.developmentActivityContext
      ? "Development hotspot review"
      : snapshot.indicatorCenterContext
        ? "Planning indicator review"
        : snapshot.modelLabContext
          ? "Model research view"
          : "Countywide view";
  const layers = snapshot.activeLayers.slice(0, 4);

  if (!layers.length) return `${context} with the current Planning intelligence.`;

  const visible = new Intl.ListFormat("en-US", {
    style: "long",
    type: "conjunction",
  }).format(layers);
  const remainder = snapshot.activeLayers.length - layers.length;
  return `${context} with ${visible}${remainder > 0 ? ` and ${remainder} more` : ""}.`;
}
