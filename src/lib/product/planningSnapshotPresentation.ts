import type { PlanningSnapshot } from "@/types";

export function planningSnapshotDefaultTitle(
  snapshot: {
    hasDevelopmentActivity?: boolean;
    managementAnalysisPeriod?: PlanningSnapshot["managementAnalysisPeriod"];
    overviewCommandMode?: PlanningSnapshot["overviewCommandMode"];
    selectedParcelId?: string | null;
    snapshotSource?: PlanningSnapshot["snapshotSource"];
    snapshotSubtype?: PlanningSnapshot["snapshotSubtype"];
  },
  date = new Date(),
) {
  const day = new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);

  if (snapshot.snapshotSource === "management") {
    return `${snapshot.snapshotSubtype ?? "Overview"}${snapshot.managementAnalysisPeriod ? ` · ${snapshot.managementAnalysisPeriod.label}` : ""}`;
  }

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

export function getSnapshotSource(snapshot: PlanningSnapshot) {
  return snapshot.snapshotSource ?? "analyst";
}

export function getSnapshotSubtype(snapshot: PlanningSnapshot): NonNullable<PlanningSnapshot["snapshotSubtype"]> {
  if (snapshot.snapshotSubtype) return snapshot.snapshotSubtype;
  return "Planning";
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
