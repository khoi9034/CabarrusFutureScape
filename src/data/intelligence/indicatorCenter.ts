import indicatorCenterConfig from "../../../config/indicator_center_v1.json";
import type {
  IndicatorCenterContext,
  IndicatorCenterDisplayMode,
  IndicatorCenterGroupId,
  IndicatorCenterPriorityLabel,
} from "@/types";

export interface IndicatorCenterDisplayOption {
  description: string;
  id: IndicatorCenterDisplayMode;
  label: string;
}

export interface IndicatorCenterHeadlineMetric {
  caveat: string;
  label: string;
  value: string;
}

export interface IndicatorCenterReviewTheme {
  caveat: string;
  indicatorId: string;
  label: string;
  recommendedFollowUp: string;
  status: IndicatorCenterPriorityLabel;
}

type IndicatorCenterConfigDefinition = {
  caveat: string;
  category: string;
  chart_supported: boolean;
  data_source_basis: string[];
  group: IndicatorCenterGroupId;
  id: string;
  label: string;
  map_supported: boolean;
  metric_key?: string;
  meaning: string;
  official_data_needed: boolean;
  priority: IndicatorCenterPriorityLabel;
  recommended_action?: string;
  recommended_follow_up: string;
  snapshot_include_default: boolean;
  status: IndicatorCenterPriorityLabel;
  title?: string;
};

const indicatorConfigDefinitions =
  indicatorCenterConfig.indicators as IndicatorCenterConfigDefinition[];

export const indicatorCenterDefinitions: IndicatorCenterContext[] =
  indicatorConfigDefinitions.map((indicator) => ({
    caveat: indicator.caveat,
    category: indicator.category,
    chartSupported: indicator.chart_supported,
    dataUsed: indicator.data_source_basis,
    groupId: indicator.group,
    indicatorId: indicator.id,
    mapSupported: indicator.map_supported,
    metricKey: indicator.metric_key,
    name: indicator.label,
    officialDataNeeded: indicator.official_data_needed,
    priority: indicator.priority,
    priorityLabel: indicator.status,
    recommendedFollowUp:
      indicator.recommended_action ?? indicator.recommended_follow_up,
    snapshotIncluded: indicator.snapshot_include_default,
    source: indicator.data_source_basis.join(" / "),
    status: indicator.status,
    title: indicator.title,
    whatItMeans: indicator.meaning,
  }));

export const defaultIndicatorCenterGroupIds: IndicatorCenterGroupId[] =
  indicatorCenterDefinitions.map((indicator) => indicator.groupId);

export const indicatorCenterDisplayOptions: IndicatorCenterDisplayOption[] = [
  {
    description: "Show enabled review indicators.",
    id: "all",
    label: "All indicators",
  },
  {
    description: "Show observed activity and regulatory review indicators.",
    id: "highPriority",
    label: "High attention only",
  },
  {
    description: "Show indicators where authoritative data is still needed.",
    id: "dataNeeded",
    label: "Data-needed only",
  },
  {
    description: "Show the active selected group.",
    id: "selectedGroup",
    label: "Selected group only",
  },
];

export const indicatorCenterMissingDataItems = [
  "WSACC true utility capacity",
  "official school enrollment/capacity",
  "official rezoning case records",
  "countywide development pipeline",
  "countywide future land use",
  "planned local road projects",
  "planned utility extensions",
];

export function getIndicatorCenterDefinition(
  indicatorId: string | null | undefined,
) {
  return indicatorCenterDefinitions.find(
    (indicator) => indicator.indicatorId === indicatorId,
  );
}

export function getIndicatorCenterDisplayModeLabel(
  displayMode: IndicatorCenterDisplayMode,
) {
  return (
    indicatorCenterDisplayOptions.find((option) => option.id === displayMode)
      ?.label ?? "All indicators"
  );
}

export function filterIndicatorCenterDefinitions({
  definitions,
  displayMode,
  selectedGroupIds,
  selectedIndicator,
}: {
  definitions: IndicatorCenterContext[];
  displayMode: IndicatorCenterDisplayMode;
  selectedGroupIds: IndicatorCenterGroupId[];
  selectedIndicator: IndicatorCenterContext | null;
}) {
  const selectedGroupSet = new Set(selectedGroupIds);
  const enabledDefinitions = definitions.filter((indicator) =>
    selectedGroupSet.has(indicator.groupId),
  );

  switch (displayMode) {
    case "dataNeeded":
      return enabledDefinitions.filter(
        (indicator) =>
          indicator.priorityLabel === "Data Needed" ||
          indicator.priorityLabel === "Proxy Only" ||
          indicator.priorityLabel === "Preliminary Data",
      );
    case "highPriority":
      return enabledDefinitions.filter((indicator) =>
        ["High Attention", "Review Needed"].includes(indicator.priorityLabel),
      );
    case "selectedGroup": {
      const selectedGroupId =
        selectedIndicator?.groupId ?? selectedGroupIds[0] ?? null;

      return selectedGroupId
        ? enabledDefinitions.filter(
            (indicator) => indicator.groupId === selectedGroupId,
          )
        : enabledDefinitions;
    }
    case "all":
    default:
      return enabledDefinitions;
  }
}

export function buildIndicatorCenterHeadlineMetrics({
  selectedGroupCount,
  snapshotReady,
}: {
  selectedGroupCount: number;
  snapshotReady: boolean;
}): IndicatorCenterHeadlineMetric[] {
  const highAttentionCount = indicatorCenterDefinitions.filter((indicator) =>
    ["High Attention", "Review Needed"].includes(indicator.priorityLabel),
  ).length;
  const dataNeededCount = indicatorCenterDefinitions.filter((indicator) =>
    ["Data Needed", "Proxy Only", "Preliminary Data"].includes(
      indicator.priorityLabel,
    ),
  ).length;

  return [
    {
      caveat: "Fixed dashboard groups are included in the current posture.",
      label: "Active indicator groups",
      value: `${selectedGroupCount} of ${indicatorCenterDefinitions.length}`,
    },
    {
      caveat: "Attention categories are labels, not official scores.",
      label: "High attention categories",
      value: String(highAttentionCount),
    },
    {
      caveat: "Missing-source status is shown instead of invented values.",
      label: "Data-needed categories",
      value: String(dataNeededCount),
    },
    {
      caveat: "Snapshot captures context and caveats for report review.",
      label: "Snapshot-ready status",
      value: snapshotReady ? "Ready to capture" : "Choose groups",
    },
  ];
}

export function buildIndicatorCenterReviewThemes(
  indicators: IndicatorCenterContext[],
): IndicatorCenterReviewTheme[] {
  return indicators.map((indicator) => ({
    caveat: indicator.caveat,
    indicatorId: indicator.indicatorId,
    label: `${indicator.name}: ${indicator.whatItMeans}`,
    recommendedFollowUp: indicator.recommendedFollowUp,
    status: indicator.priorityLabel,
  }));
}
