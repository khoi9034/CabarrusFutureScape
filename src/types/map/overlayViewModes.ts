export type MapOverlayViewMode = "points" | "clusters" | "heatmap";

export const mapOverlayViewModes: MapOverlayViewMode[] = [
  "points",
  "clusters",
  "heatmap",
];

export const mapOverlayViewModeLabels: Record<MapOverlayViewMode, string> = {
  clusters: "Clusters",
  heatmap: "Heatmap",
  points: "Points",
};

export function formatMapOverlayViewMode(mode: MapOverlayViewMode) {
  return mapOverlayViewModeLabels[mode];
}
