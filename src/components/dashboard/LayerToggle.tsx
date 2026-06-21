"use client";

import { useState, type ReactNode } from "react";
import {
  ArrowUpRight,
  BookOpen,
  BrainCircuit,
  ChevronDown,
  Info,
  ListRestart,
  Settings2,
  SwatchBook,
} from "lucide-react";
import { USE_BACKEND_API } from "@/lib/api/client";
import {
  isLayerVisibilityControllable,
  isLayerPlaceholder,
  operationalLayerRegistry,
} from "@/lib/gis/layerRegistry";
import { cn } from "@/lib/utils";
import { useDashboardState } from "@/hooks/useDashboardState";
import type {
  DevelopmentHotspotActivityClassFilter,
  DevelopmentHotspotControls,
  DevelopmentHotspotGrowthSignalFilter,
  DevelopmentHotspotLimit,
  DevelopmentHotspotPermitSegmentFilter,
  DevelopmentHotspotRecentWindowFilter,
  DevelopmentHotspotSortBy,
  DevelopmentHotspotStatusStageFilter,
  DevelopmentHotspotValueClassFilter,
} from "@/types/map/developmentHotspots";
import type {
  FloodZoneControls,
  FloodZoneLimitMode,
  FloodZoneSeverityFilter,
} from "@/types/map/floodZones";
import type {
  SchoolUtilizationClassFilter,
  SchoolUtilizationLevel,
  SchoolUtilizationZoneControls,
} from "@/types/map/schoolUtilizationZones";
import type { OperationalLayer } from "@/types";

const DEVELOPMENT_HOTSPOT_LAYER_ID = "permit-activity";
const FLOOD_CONSTRAINT_LAYER_ID = "flood-risk";
const FEMA_FLOOD_ZONE_LAYER_ID = "fema-flood-zones";
const SCHOOL_UTILIZATION_LAYER_ID = "school-utilization-seed";

interface LayerDisplayGroup {
  id: string;
  includeModelResearchStatus?: boolean;
  predicate: (layer: OperationalLayer) => boolean;
  title: string;
}

const layerDisplayGroups: LayerDisplayGroup[] = [
  {
    id: "base-parcel",
    predicate: (layer) =>
      layer.category === "Base" || layer.id === "parcel-intelligence",
    title: "Base / Parcel",
  },
  {
    id: "development-activity",
    predicate: (layer) => layer.id === "permit-activity",
    title: "Development Activity",
  },
  {
    id: "flood-constraints",
    predicate: (layer) => layer.category === "Risk",
    title: "Floodplain Review",
  },
  {
    id: "schools",
    predicate: (layer) => layer.category === "Schools",
    title: "Schools",
  },
  {
    id: "internal-research-governance",
    includeModelResearchStatus: true,
    predicate: (layer) => layer.category === "Intelligence",
    title: "Internal Research / Governance",
  },
];

const defaultOpenLayerGroups: Record<string, boolean> = {
  "base-parcel": true,
  "development-activity": true,
};

interface ComingSoonOverlay {
  accent?: string;
  id: string;
  note?: string;
  title: string;
}

const comingSoonLayerTopics: ComingSoonOverlay[] = [
  {
    accent: "#55d38f",
    id: "utility-capacity",
    title: "Utility Capacity",
  },
  {
    accent: "#55d38f",
    id: "planned-utility-extensions",
    title: "Planned Utility Extensions",
  },
  {
    accent: "#68d8ff",
    id: "planned-road-projects",
    title: "Planned Road Projects",
  },
  {
    accent: "#f0cd79",
    id: "planning-context-future-land-use",
    title: "Planning Context / Future Land Use",
  },
  {
    accent: "#f0cd79",
    id: "official-rezoning-records",
    title: "Official Rezoning Records",
  },
  {
    accent: "#b597ff",
    id: "development-pipeline-subdivision-approvals",
    title: "Countywide Development Pipeline / Subdivision Approvals",
  },
];

interface LayerInfoContent {
  caveat: string;
  interpretation: string;
  reportUse: string;
  source: string;
  summary: string;
}

const layerInfoById: Record<string, LayerInfoContent> = {
  "county-boundary": {
    caveat: "Reference boundary only; formal jurisdictional review should use official source records.",
    interpretation: "Use this as the operating extent for the CFS prototype map.",
    reportUse: "Provides report map context when visible.",
    source: "CFS operating extent / Cabarrus County boundary reference.",
    summary: "Shows the county operating extent used to frame the live map.",
  },
  "development-hotspots": {
    caveat: "Observed permit/development activity only. Not a prediction.",
    interpretation: "Use permit segment filters to show concentration markers for a selected permit type.",
    reportUse: "Feeds development activity explanations when included in a Planning Snapshot.",
    source: "FastAPI development hotspot endpoint from permit/development activity tables.",
    summary: "Shows parcels with concentrated observed permit activity by selected segment.",
  },
  "fema-flood-zones": {
    caveat: "FEMA NFHL remains authoritative for regulatory flood context.",
    interpretation:
      "Use FEMA floodplain polygons to understand source-zone context; parcel review flags are separate.",
    reportUse: "Supports flood context and FEMA caveats in Executive Summary reports.",
    source: "FEMA NFHL source polygons served through the CFS backend.",
    summary: "Shows FEMA flood hazard source polygons with transparent fills.",
  },
  "flood-risk": {
    caveat: "Marker severity is a review cue, not a final regulatory determination.",
    interpretation: "Click markers to inspect high-review flood constraint parcels.",
    reportUse: "Feeds flood review status and constraints caveats when included in a snapshot.",
    source: "FEMA NFHL parcel overlay records exposed through the CFS backend.",
    summary: "Shows high-review parcel markers where FEMA flood context requires attention.",
  },
  "infrastructure-readiness": {
    caveat: "Proxy/context only. Does not confirm utility capacity or service readiness.",
    interpretation: "Track this in Methodology until official capacity and planned infrastructure data are available.",
    reportUse: "Referenced as a data need and utility proxy caveat, not a map-ready conclusion.",
    source: "Prototype context placeholder; official utility capacity data is still needed.",
    summary: "Infrastructure readiness is tracked in Methodology and will become stronger after official utility capacity and planned infrastructure data are available.",
  },
  "parcel-intelligence": {
    caveat: "Parcel quality flags still require source review when records are unusual.",
    interpretation: "Use this layer for parcel orientation and selected parcel focus.",
    reportUse: "Feeds parcel facts and selected parcel context in Planning Snapshot reports.",
    source: "Parcel reference and assessor/tax enrichment used by CFS parcel intelligence.",
    summary: "Shows parcel reference footprints and selected-state planning context.",
  },
  "permit-activity": {
    caveat: "Observed permit/development activity only. Not a prediction.",
    interpretation: "Use permit segment filters to show concentration markers for a selected permit type.",
    reportUse: "Feeds development activity explanations when included in a Planning Snapshot.",
    source: "FastAPI development hotspot endpoint from permit/development activity tables.",
    summary: "Shows parcels with concentrated observed permit activity by selected segment.",
  },
  "school-utilization-seed": {
    caveat: "Presentation-derived values require verification against official enrollment/capacity data.",
    interpretation: "Use as preliminary context for attendance zones; this is not official capacity scoring.",
    reportUse: "Feeds school caveats and attendance-zone context when included in a snapshot.",
    source: "School attendance-zone polygons joined to presentation-derived utilization seed values.",
    summary: "Shows preliminary school capacity context by attendance-zone polygon.",
  },
};

const activityClassOptions: Array<{
  label: string;
  value: DevelopmentHotspotActivityClassFilter;
}> = [
  { label: "All", value: "all" },
  { label: "Very high", value: "very_high_activity" },
  { label: "High", value: "high_activity" },
  { label: "Moderate", value: "moderate_activity" },
];

const recentWindowOptions: Array<{
  label: string;
  value: DevelopmentHotspotRecentWindowFilter;
}> = [
  { label: "All", value: "all" },
  { label: "1 year", value: "1" },
  { label: "3 years", value: "3" },
];

const permitSegmentOptions: Array<{
  label: string;
  value: DevelopmentHotspotPermitSegmentFilter;
}> = [
  { label: "Select segment...", value: "all" },
  { label: "Residential Growth", value: "residential_growth" },
  { label: "Commercial Activity", value: "commercial_activity" },
  { label: "Redevelopment Signal", value: "redevelopment_signal" },
  { label: "Minor Maintenance", value: "minor_maintenance" },
  { label: "Demolition", value: "demolition" },
  { label: "Industrial Activity", value: "industrial_activity" },
  { label: "Institutional Activity", value: "institutional_activity" },
];

const growthSignalOptions: Array<{
  label: string;
  value: DevelopmentHotspotGrowthSignalFilter;
}> = [
  { label: "All", value: "all" },
  { label: "Major Growth", value: "major_growth" },
  { label: "Moderate Activity", value: "moderate_activity" },
  { label: "Redevelopment", value: "redevelopment_signal" },
  { label: "Minor Activity", value: "minor_activity" },
];

const statusStageOptions: Array<{
  label: string;
  value: DevelopmentHotspotStatusStageFilter;
}> = [
  { label: "All", value: "all" },
  { label: "Active Construction", value: "active_construction" },
  { label: "Issued / Starting", value: "issued_or_starting" },
  { label: "Completed", value: "completed" },
];

const valueClassOptions: Array<{
  label: string;
  value: DevelopmentHotspotValueClassFilter;
}> = [
  { label: "All", value: "all" },
  { label: "High Value", value: "high_value" },
  { label: "Major Value", value: "major_value" },
];

const zoningJurisdictionOptions = [
  { label: "All", value: "" },
  { label: "Concord", value: "Concord" },
  { label: "Kannapolis", value: "Kannapolis" },
  { label: "Harrisburg", value: "Harrisburg" },
  { label: "Midland", value: "Midland" },
  { label: "Mt. Pleasant", value: "Mt. Pleasant" },
  { label: "Locust", value: "Locust" },
  {
    label: "Cabarrus County",
    value: "Cabarrus County / Unincorporated",
  },
];

const sortOptions: Array<{
  label: string;
  value: DevelopmentHotspotSortBy;
}> = [
  { label: "Activity score", value: "development_activity_score" },
  { label: "Permit count", value: "total_permit_count" },
  { label: "Recent 1 yr", value: "recent_permit_count_1yr" },
  { label: "Recent 3 yr", value: "recent_permit_count_3yr" },
];

const limitOptions: DevelopmentHotspotLimit[] = [25, 50, 100];

const hotspotConcentrationLegendItems = [
  { label: "1-2", size: "h-2.5 w-2.5" },
  { label: "3-10", size: "h-3.5 w-3.5" },
  { label: "11-25", size: "h-5 w-5" },
  { label: "26+", size: "h-6 w-6" },
];

const floodLegendItems = [
  {
    color: "#ff5b5b",
    label: "Severe / floodway",
    shape: "triangle",
    size: "h-4 w-4",
  },
  {
    color: "#ffb454",
    label: "High / Special Flood Hazard Area",
    shape: "kite",
    size: "h-3.5 w-3.5",
  },
  {
    color: "#f7d94c",
    label: "Moderate",
    shape: "circle",
    size: "h-3 w-3",
  },
];

const floodZoneSeverityOptions: Array<{
  label: string;
  value: FloodZoneSeverityFilter;
}> = [
  { label: "All", value: "all" },
  { label: "Severe", value: "severe" },
  { label: "High", value: "high" },
  { label: "Moderate", value: "moderate" },
];

const floodZoneLimitOptions: Array<{
  label: string;
  value: FloodZoneLimitMode;
}> = [
  { label: "100", value: "100" },
  { label: "500", value: "500" },
  { label: "Visible extent", value: "visible_extent" },
];

const floodZoneLegendItems = [
  {
    color: "#ff5b5b",
    label: "Floodway",
  },
  {
    color: "#ffb454",
    label: "Special Flood Hazard Area",
  },
  {
    color: "#f7d94c",
    label: "Moderate",
  },
  {
    color: "#9eb6c7",
    label: "Minimal",
  },
];

const schoolLevelOptions: Array<{
  label: string;
  value: SchoolUtilizationLevel;
}> = [
  { label: "All levels", value: "all" },
  { label: "Elementary", value: "elementary" },
  { label: "Middle", value: "middle" },
  { label: "High", value: "high" },
];

const schoolUtilizationClassOptions: Array<{
  label: string;
  value: SchoolUtilizationClassFilter;
}> = [
  { label: "All classes", value: "all" },
  { label: "Under capacity", value: "under_capacity" },
  { label: "Approaching capacity", value: "approaching_capacity" },
  { label: "Above capacity", value: "over_capacity" },
  {
    label: "Very high utilization",
    value: "severely_over_capacity",
  },
];

const schoolUtilizationLegendItems = [
  {
    color: "#38bdf8",
    label: "Under capacity",
    range: "<80%",
  },
  {
    color: "#facc15",
    label: "Approaching capacity",
    range: "80-99%",
  },
  {
    color: "#f97316",
    label: "Over capacity",
    range: "100-110%",
  },
  {
    color: "#ec4899",
    label: "Severely over capacity",
    range: ">110%",
  },
];

export function LayerToggle() {
  const [openLayerGroups, setOpenLayerGroups] = useState<Record<string, boolean>>(
    defaultOpenLayerGroups,
  );
  const [openConfigLayerId, setOpenConfigLayerId] = useState<string | null>(null);
  const [openInfoLayerId, setOpenInfoLayerId] = useState<string | null>(null);
  const [openLegendLayerId, setOpenLegendLayerId] = useState<string | null>(null);
  const {
    developmentHotspotControls,
    developmentHotspotLayer,
    developmentHotspotsEnabled,
    floodConstraintLayer,
    floodConstraintsEnabled,
    floodZoneControls,
    floodZoneLayer,
    floodZonesEnabled,
    isLayerActive,
    schoolUtilizationZoneControls,
    schoolUtilizationZoneLayer,
    schoolUtilizationZonesEnabled,
    setDevelopmentHotspotControls,
    setDevelopmentHotspotsEnabled,
    setFloodConstraintsEnabled,
    setFloodZoneControls,
    setFloodZonesEnabled,
    setLayerVisibility,
    setProductMode,
    setSchoolUtilizationZoneControls,
    setSchoolUtilizationZonesEnabled,
  } = useDashboardState();

  const hotspotTemporalContext =
    developmentHotspotLayer.temporalContextLabel;
  const selectedHotspotSegment =
    developmentHotspotControls.permitSegment === "all"
      ? null
      : developmentHotspotControls.permitSegment;
  const selectedHotspotSegmentLabel = selectedHotspotSegment
    ? getPermitSegmentLabel(selectedHotspotSegment)
    : null;
  const selectedHotspotSegmentColor =
    getPermitSegmentLegendColor(selectedHotspotSegment);
  const noHotspotSegmentSelected =
    developmentHotspotsEnabled && !selectedHotspotSegment;
  const hotspotStatus =
    !developmentHotspotsEnabled
      ? "Hotspots off"
      : noHotspotSegmentSelected
        ? "Choose a permit segment to view hotspot concentration"
      : developmentHotspotLayer.isLoading
        ? "Loading hotspots"
        : developmentHotspotLayer.status === "ready"
          ? `Showing ${developmentHotspotLayer.markers.length} ${selectedHotspotSegmentLabel ?? "permit"} hotspots`
          : developmentHotspotLayer.status === "empty"
            ? hotspotTemporalContext
              ? "No hotspots match temporal filters"
              : "No hotspots match filters"
            : "Hotspots unavailable";
  const floodStatus =
    !floodConstraintsEnabled
      ? "Floodplain review off"
      : floodConstraintLayer.isLoading
        ? "Loading floodplain review"
        : floodConstraintLayer.status === "ready"
          ? `Showing ${floodConstraintLayer.markers.length} flood review parcels`
          : floodConstraintLayer.status === "empty"
            ? "No high-review parcels"
            : "Floodplain review unavailable";
  const floodSeverityCounts = floodConstraintLayer.severityCounts;
  const showFloodSeverityCounts =
    floodConstraintsEnabled && floodConstraintLayer.status === "ready";
  const floodZoneStatus =
    !floodZonesEnabled
      ? "Floodplain source areas off"
      : floodZoneLayer.isLoading
        ? "Loading floodplain areas"
      : floodZoneLayer.status === "ready"
        ? floodZoneControls.limitMode === "visible_extent"
            ? `Showing ${floodZoneLayer.polygons.length} visible floodplain polygons`
            : `Showing ${floodZoneLayer.polygons.length} floodplain polygons`
        : floodZoneLayer.status === "empty"
            ? "No floodplain areas match filters"
            : "Floodplain source areas unavailable";
  const showFloodZoneSeverityCounts =
    floodZonesEnabled && floodZoneLayer.status === "ready";
  const schoolUtilizationStatus =
    !schoolUtilizationZonesEnabled
      ? "School capacity watch off"
      : schoolUtilizationZoneLayer.isLoading
        ? "Loading school zones"
      : schoolUtilizationZoneLayer.status === "ready"
          ? schoolUtilizationZoneControls.level === "all"
            ? `Showing ${schoolUtilizationZoneLayer.polygons.length} preliminary capacity zones`
            : `Showing ${schoolUtilizationZoneLayer.polygons.length} ${formatSchoolLevelLabel(
                schoolUtilizationZoneControls.level,
              )} zones`
          : schoolUtilizationZoneLayer.status === "empty"
            ? "No utilization zones match filters"
            : "School zones unavailable";
  const showSchoolUtilizationCounts =
    schoolUtilizationZonesEnabled &&
    schoolUtilizationZoneLayer.status === "ready";

  function updateHotspotControls<K extends keyof DevelopmentHotspotControls>(
    key: K,
    value: DevelopmentHotspotControls[K],
  ) {
    setDevelopmentHotspotControls({
      ...developmentHotspotControls,
      [key]: value,
    });
  }

  function updateFloodZoneControls<K extends keyof FloodZoneControls>(
    key: K,
    value: FloodZoneControls[K],
  ) {
    setFloodZoneControls({
      ...floodZoneControls,
      [key]: value,
    });
  }

  function updateSchoolUtilizationControls<
    K extends keyof SchoolUtilizationZoneControls,
  >(key: K, value: SchoolUtilizationZoneControls[K]) {
    setSchoolUtilizationZoneControls({
      ...schoolUtilizationZoneControls,
      [key]: value,
    });
  }

  function setGroupOpen(groupId: string, open: boolean) {
    setOpenLayerGroups((current) => ({
      ...current,
      [groupId]: open,
    }));
  }

  function isSpecialLayer(layerId: string) {
    return (
      layerId === DEVELOPMENT_HOTSPOT_LAYER_ID ||
      layerId === FLOOD_CONSTRAINT_LAYER_ID ||
      layerId === FEMA_FLOOD_ZONE_LAYER_ID ||
      layerId === SCHOOL_UTILIZATION_LAYER_ID
    );
  }

  function isLayerOn(layer: OperationalLayer) {
    if (layer.id === DEVELOPMENT_HOTSPOT_LAYER_ID) {
      return developmentHotspotsEnabled;
    }

    if (layer.id === FLOOD_CONSTRAINT_LAYER_ID) {
      return floodConstraintsEnabled;
    }

    if (layer.id === FEMA_FLOOD_ZONE_LAYER_ID) {
      return floodZonesEnabled;
    }

    if (layer.id === SCHOOL_UTILIZATION_LAYER_ID) {
      return schoolUtilizationZonesEnabled;
    }

    return isLayerActive(layer.id);
  }

  function setLayerOn(layer: OperationalLayer, enabled: boolean) {
    if (layer.id === DEVELOPMENT_HOTSPOT_LAYER_ID) {
      setDevelopmentHotspotsEnabled(enabled);
      return;
    }

    if (layer.id === FLOOD_CONSTRAINT_LAYER_ID) {
      setFloodConstraintsEnabled(enabled);
      return;
    }

    if (layer.id === FEMA_FLOOD_ZONE_LAYER_ID) {
      setFloodZonesEnabled(enabled);
      return;
    }

    if (layer.id === SCHOOL_UTILIZATION_LAYER_ID) {
      if (enabled && !schoolUtilizationZonesEnabled) {
        setSchoolUtilizationZoneControls({
          ...schoolUtilizationZoneControls,
          limit: 500,
        });
      }

      setSchoolUtilizationZonesEnabled(enabled);
      return;
    }

    setLayerVisibility(layer.id, enabled);
  }

  function isLayerDisabledForControls(layer: OperationalLayer) {
    if (isSpecialLayer(layer.id)) {
      return isLayerPlaceholder(layer);
    }

    return (
      !layer.visibility ||
      isLayerPlaceholder(layer) ||
      layer.id === "infrastructure-readiness"
    );
  }

  function resetLayers() {
    setDevelopmentHotspotsEnabled(false);
    setFloodConstraintsEnabled(false);
    setFloodZonesEnabled(false);
    setSchoolUtilizationZonesEnabled(false);

    operationalLayerRegistry.forEach((layer) => {
      if (
        isLayerVisibilityControllable(layer) &&
        !isSpecialLayer(layer.id) &&
        layer.id !== "infrastructure-readiness"
      ) {
        setLayerVisibility(layer.id, layer.defaultVisible && layer.visibility);
      }
    });
  }

  function getActiveLayerCount() {
    return operationalLayerRegistry.filter(
      (layer) =>
        isLayerVisibilityControllable(layer) &&
        !isLayerDisabledForControls(layer) &&
        isLayerOn(layer),
    ).length;
  }

  function getGroupActiveCount(group: LayerDisplayGroup) {
    return operationalLayerRegistry.filter(
      (layer) =>
        group.predicate(layer) &&
        isLayerVisibilityControllable(layer) &&
        !isLayerDisabledForControls(layer) &&
        isLayerOn(layer),
    ).length;
  }

  function getLayerStatusText(layer: OperationalLayer) {
    if (layer.id === DEVELOPMENT_HOTSPOT_LAYER_ID) {
      return hotspotStatus;
    }

    if (layer.id === FLOOD_CONSTRAINT_LAYER_ID) {
      return floodStatus;
    }

    if (layer.id === FEMA_FLOOD_ZONE_LAYER_ID) {
      return floodZoneStatus;
    }

    if (layer.id === SCHOOL_UTILIZATION_LAYER_ID) {
      return schoolUtilizationStatus;
    }

    return isLayerOn(layer) ? "Layer active" : "Layer hidden";
  }

  function renderConfigurePanel(layer: OperationalLayer) {
    const active = isLayerOn(layer);

    if (!active) {
      return (
        <LayerInlinePanel>
          <p className="text-xs leading-5 text-slate-500">
            Turn layer on to configure display.
          </p>
        </LayerInlinePanel>
      );
    }

    if (layer.id === FEMA_FLOOD_ZONE_LAYER_ID) {
      return (
        <LayerInlinePanel>
          <div className="grid grid-cols-2 gap-2">
            <FloodZoneSelect
              label="Severity"
              onChange={(value) =>
                updateFloodZoneControls(
                  "severity",
                  value as FloodZoneSeverityFilter,
                )
              }
              options={floodZoneSeverityOptions}
              value={floodZoneControls.severity}
            />
            <FloodZoneSelect
              label="Limit"
              onChange={(value) =>
                updateFloodZoneControls("limitMode", value as FloodZoneLimitMode)
              }
              options={floodZoneLimitOptions}
              value={floodZoneControls.limitMode}
            />
            {showFloodZoneSeverityCounts ? (
              <div className="col-span-2 flex flex-wrap gap-1.5">
                <FloodCountBadge
                  color="#ff5b5b"
                  label="Severe"
                  value={floodZoneLayer.severityCounts.severe}
                />
                <FloodCountBadge
                  color="#ffb454"
                  label="High"
                  value={floodZoneLayer.severityCounts.high}
                />
                <FloodCountBadge
                  color="#f7d94c"
                  label="Moderate"
                  value={floodZoneLayer.severityCounts.moderate}
                />
                <FloodCountBadge
                  color="#9eb6c7"
                  label="Minimal"
                  value={floodZoneLayer.severityCounts.low}
                />
              </div>
            ) : null}
          </div>
        </LayerInlinePanel>
      );
    }

    if (layer.id === SCHOOL_UTILIZATION_LAYER_ID) {
      return (
        <LayerInlinePanel>
          <div className="grid grid-cols-2 gap-2">
            <SchoolUtilizationSelect
              label="School level"
              onChange={(value) =>
                updateSchoolUtilizationControls(
                  "level",
                  value as SchoolUtilizationLevel,
                )
              }
              options={schoolLevelOptions}
              value={schoolUtilizationZoneControls.level}
            />
            <SchoolUtilizationSelect
              label="Utilization class"
              onChange={(value) =>
                updateSchoolUtilizationControls(
                  "utilizationClass",
                  value as SchoolUtilizationClassFilter,
                )
              }
              options={schoolUtilizationClassOptions}
              value={schoolUtilizationZoneControls.utilizationClass}
            />
            {showSchoolUtilizationCounts ? (
              <div className="col-span-2 rounded-md border border-[#5cd38f]/15 bg-[#5cd38f]/[0.045] px-2 py-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#b9ffd1]">
                  {schoolUtilizationZoneLayer.polygons.length} of{" "}
                  {schoolUtilizationZoneLayer.totalCount} zones loaded
                </p>
              </div>
            ) : null}
          </div>
        </LayerInlinePanel>
      );
    }

    return null;
  }

  function renderDevelopmentHotspotControls() {
    return (
      <LayerInlinePanel>
        <div className="grid grid-cols-2 gap-2">
          {hotspotTemporalContext ? (
            <p className="col-span-2 rounded-md border border-[#68d8ff]/15 bg-[#68d8ff]/[0.045] px-2 py-1.5 text-[11px] leading-5 text-[#bfefff]">
              Synced to Temporal Analysis: {hotspotTemporalContext}.
            </p>
          ) : null}
          <p className="col-span-2 text-[11px] leading-5 text-slate-400">
            Choose a permit segment to view hotspot concentration.
          </p>
          <HotspotSelect
            className="col-span-2"
            label="Permit Segment"
            onChange={(value) =>
              updateHotspotControls(
                "permitSegment",
                value as DevelopmentHotspotPermitSegmentFilter,
              )
            }
            options={permitSegmentOptions}
            value={developmentHotspotControls.permitSegment}
          />
          {!selectedHotspotSegment ? (
            <div className="col-span-2 rounded-md border border-[#68d8ff]/15 bg-[#68d8ff]/[0.045] px-2 py-2 text-[11px] leading-5 text-[#bfefff]">
              Select a permit segment to display hotspot concentration. Generic
              all-permit markers stay hidden to keep the map readable.
            </div>
          ) : (
            <div className="col-span-2 rounded-md border border-[#d8b86a]/15 bg-[#d8b86a]/[0.05] px-2 py-2 text-[11px] leading-5 text-[#f2d895]">
              Showing concentration for {selectedHotspotSegmentLabel}.
            </div>
          )}
          <HotspotAdvancedFilters
            controls={developmentHotspotControls}
            onChange={updateHotspotControls}
          />
        </div>
      </LayerInlinePanel>
    );
  }

  function renderLegendPanel(layer: OperationalLayer) {
    if (layer.id === FLOOD_CONSTRAINT_LAYER_ID) {
      return (
        <LayerInlinePanel>
          <div className="grid gap-1.5">
            {showFloodSeverityCounts ? (
              <div className="mb-1 flex flex-wrap gap-1.5">
                <FloodCountBadge
                  color="#ff5b5b"
                  label="Severe"
                  value={floodSeverityCounts.severe}
                />
                <FloodCountBadge
                  color="#ffb454"
                  label="High"
                  value={floodSeverityCounts.high}
                />
                <FloodCountBadge
                  color="#f7d94c"
                  label="Moderate"
                  value={floodSeverityCounts.moderate}
                />
              </div>
            ) : null}
            {floodLegendItems.map((item) => (
              <LayerLegendItem
                color={item.color}
                key={item.label}
                label={item.label}
                shape={item.shape}
                size={item.size}
              />
            ))}
          </div>
        </LayerInlinePanel>
      );
    }

    if (layer.id === FEMA_FLOOD_ZONE_LAYER_ID) {
      return (
        <LayerInlinePanel>
          <div className="grid gap-1.5">
            {floodZoneLegendItems.map((item) => (
              <LayerLegendItem
                color={item.color}
                key={item.label}
                label={item.label}
                shape="square"
                size="h-3 w-3"
              />
            ))}
          </div>
        </LayerInlinePanel>
      );
    }

    if (layer.id === SCHOOL_UTILIZATION_LAYER_ID) {
      return (
        <LayerInlinePanel>
          <div className="grid gap-1.5">
            {showSchoolUtilizationCounts ? (
              <div className="mb-1 flex flex-wrap gap-1.5">
                <FloodCountBadge
                  color="#38bdf8"
                  label="Under"
                  value={schoolUtilizationZoneLayer.classCounts.under_capacity}
                />
                <FloodCountBadge
                  color="#facc15"
                  label="Approaching"
                  value={
                    schoolUtilizationZoneLayer.classCounts.approaching_capacity +
                    schoolUtilizationZoneLayer.classCounts.near_capacity
                  }
                />
                <FloodCountBadge
                  color="#f97316"
                  label="Over"
                  value={schoolUtilizationZoneLayer.classCounts.over_capacity}
                />
                <FloodCountBadge
                  color="#ec4899"
                  label="Severe"
                  value={
                    schoolUtilizationZoneLayer.classCounts
                      .severely_over_capacity
                  }
                />
              </div>
            ) : null}
            {schoolUtilizationLegendItems.map((item) => (
              <LayerLegendItem
                color={item.color}
                key={item.label}
                label={`${item.label} (${item.range})`}
                shape="square"
                size="h-3 w-3"
              />
            ))}
          </div>
          <p className="mt-2 rounded border border-amber-300/15 bg-amber-300/[0.045] px-2 py-1.5 text-[11px] leading-5 text-amber-100/75">
            Utilization values are presentation-derived and require official
            verification.
          </p>
        </LayerInlinePanel>
      );
    }

    if (layer.id === DEVELOPMENT_HOTSPOT_LAYER_ID && selectedHotspotSegment) {
      return (
        <LayerInlinePanel>
          <div className="grid grid-cols-2 gap-1.5">
            {hotspotConcentrationLegendItems.map((item) => (
              <LayerLegendItem
                color={selectedHotspotSegmentColor}
                key={item.label}
                label={item.label}
                shape={getPermitSegmentLegendShape(selectedHotspotSegment)}
                size={item.size}
              />
            ))}
          </div>
        </LayerInlinePanel>
      );
    }

    return null;
  }

  return (
    <section className="min-w-0 overflow-hidden rounded-lg border border-white/10 bg-black/20 p-3">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase text-slate-500">
            Map Layers
          </p>
          <h2 className="mt-1 truncate text-base font-semibold text-white">
            Compact overlay controls
          </h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Turn on overlays for the live map. Detailed source notes and
            caveats are available under More Info.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] text-slate-300 transition hover:border-white/20 hover:bg-white/[0.07] hover:text-white"
            onClick={resetLayers}
            title="Reset layers"
            type="button"
          >
            <ListRestart className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/10 pt-3">
        <LayerStatusBadge active tone="gold">
          {`${getActiveLayerCount()} active`}
        </LayerStatusBadge>
        <LayerStatusBadge>Advanced controls</LayerStatusBadge>
      </div>

      <div className="mt-3 space-y-2">
        <div className="flex items-center justify-between gap-2 px-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#bfefff]">
            Available Map Layers
          </p>
          <LayerStatusBadge active tone="green">
            Available now
          </LayerStatusBadge>
        </div>
        {layerDisplayGroups.map((group) => {
          const showModelResearchStatus = group.includeModelResearchStatus;
          const layers = operationalLayerRegistry.filter(
            (layer) =>
              group.predicate(layer) &&
              isLayerVisibilityControllable(layer),
          );
          const activeCount = getGroupActiveCount(group);
          const isOpen = Boolean(openLayerGroups[group.id]);

          if (!layers.length && !showModelResearchStatus) {
            return null;
          }

          return (
            <details
              className="group min-w-0 overflow-hidden rounded-md border border-white/10 bg-white/[0.025]"
              key={group.id}
              onToggle={(event) =>
                setGroupOpen(group.id, event.currentTarget.open)
              }
              open={isOpen}
            >
              <summary className="flex min-w-0 cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-100">
                    {group.title}
                  </p>
                </div>
                <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                  <LayerStatusBadge active={activeCount > 0} tone="gold">
                    {`${activeCount} active`}
                  </LayerStatusBadge>
                  <ChevronDown className="h-3.5 w-3.5 text-slate-500 transition group-open:rotate-180" />
                </div>
              </summary>

              {isOpen ? (
                <div className="min-w-0 space-y-2 overflow-hidden border-t border-white/10 p-2">
                  {showModelResearchStatus ? (
                    <ModelResearchStatusCard
                      onOpenMethodology={() => setProductMode("methodology")}
                    />
                  ) : null}
                  {layers.map((layer) => {
                    const isDevelopmentHotspotLayer =
                      layer.id === DEVELOPMENT_HOTSPOT_LAYER_ID;
                    const isFloodConstraintLayer =
                      layer.id === FLOOD_CONSTRAINT_LAYER_ID;
                    const isFemaFloodZoneLayer =
                      layer.id === FEMA_FLOOD_ZONE_LAYER_ID;
                    const isSchoolUtilizationLayer =
                      layer.id === SCHOOL_UTILIZATION_LAYER_ID;
                    const hasConfigure =
                      isFemaFloodZoneLayer || isSchoolUtilizationLayer;
                    const hasLegend =
                      (isDevelopmentHotspotLayer &&
                        Boolean(selectedHotspotSegment)) ||
                      isFloodConstraintLayer ||
                      isFemaFloodZoneLayer ||
                      isSchoolUtilizationLayer;
                    const active = isLayerOn(layer);
                    const unavailable =
                      !USE_BACKEND_API &&
                      (isDevelopmentHotspotLayer ||
                        isFloodConstraintLayer ||
                        isFemaFloodZoneLayer ||
                        isSchoolUtilizationLayer);
                    const disabled =
                      unavailable || isLayerDisabledForControls(layer);
                    const infoOpen = openInfoLayerId === layer.id;
                    const configureOpen = openConfigLayerId === layer.id;
                    const legendOpen = openLegendLayerId === layer.id;
                    const layerDisplayTitle = getLayerDisplayTitle(layer);

                    return (
                      <article
                        className={cn(
                          "min-w-0 overflow-hidden rounded-md border p-2 transition",
                          active
                            ? "border-white/15 bg-white/[0.06]"
                            : "border-white/[0.08] bg-black/10 hover:border-white/[0.12] hover:bg-white/[0.035]",
                          disabled && "opacity-60",
                        )}
                        key={layer.id}
                      >
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full shadow-[0_0_16px_currentColor]"
                            style={{
                              background: layer.accent,
                              color: layer.accent,
                            }}
                          />
                          <div className="min-w-[9.5rem] flex-1">
                            <p className="truncate text-sm font-semibold leading-5 text-slate-100">
                              {layerDisplayTitle}
                            </p>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                              <LayerStatusBadge
                                active={active}
                                tone={active ? "gold" : "neutral"}
                              >
                                {active ? "Active" : "Hidden"}
                              </LayerStatusBadge>
                              <LayerStatusBadge>
                                {getLayerSourceStatusLabel(layer)}
                              </LayerStatusBadge>
                              {isDevelopmentHotspotLayer &&
                              !selectedHotspotSegment ? (
                                <LayerStatusBadge active tone="orange">
                                  Choose segment
                                </LayerStatusBadge>
                              ) : null}
                              {layer.id === SCHOOL_UTILIZATION_LAYER_ID ? (
                                <LayerStatusBadge>
                                  Preliminary Data
                                </LayerStatusBadge>
                              ) : null}
                            </div>
                          </div>
                          <div className="ml-auto flex shrink-0 items-center gap-1.5">
                            <button
                              aria-label={`More information for ${layerDisplayTitle}`}
                              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border border-white/10 bg-white/[0.035] text-slate-400 transition hover:border-[#68d8ff]/35 hover:bg-[#68d8ff]/10 hover:text-[#b7f0ff]"
                              onClick={() =>
                                setOpenInfoLayerId(infoOpen ? null : layer.id)
                              }
                              title="More Info"
                              type="button"
                            >
                              <Info className="h-3.5 w-3.5" />
                            </button>
                            {hasConfigure ? (
                            <button
                              aria-label={`Configure ${layerDisplayTitle}`}
                              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border border-white/10 bg-white/[0.035] text-slate-400 transition hover:border-[#d8b86a]/35 hover:bg-[#d8b86a]/10 hover:text-[#f6d98e]"
                              onClick={() =>
                                setOpenConfigLayerId(
                                  configureOpen ? null : layer.id,
                                )
                              }
                              title="Configure"
                              type="button"
                            >
                              <Settings2 className="h-3.5 w-3.5" />
                            </button>
                            ) : null}
                            {hasLegend ? (
                            <button
                              aria-label={`Legend for ${layerDisplayTitle}`}
                              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border border-white/10 bg-white/[0.035] text-slate-400 transition hover:border-white/20 hover:bg-white/[0.07] hover:text-white"
                              onClick={() =>
                                setOpenLegendLayerId(
                                  legendOpen ? null : layer.id,
                                )
                              }
                              title="Legend"
                              type="button"
                            >
                              <SwatchBook className="h-3.5 w-3.5" />
                            </button>
                            ) : null}
                            <button
                              aria-label={`${active ? "Hide" : "Show"} ${layerDisplayTitle}`}
                              aria-pressed={active}
                              className={cn(
                                "relative h-5 w-9 shrink-0 rounded-full border transition disabled:cursor-not-allowed",
                                active
                                  ? "border-[#d8b86a]/40 bg-[#d8b86a]/25"
                                  : "border-white/10 bg-white/5",
                              )}
                              disabled={disabled}
                              onClick={() => setLayerOn(layer, !active)}
                              title={active ? "Hide layer" : "Show layer"}
                              type="button"
                            >
                              <span
                                className={cn(
                                  "absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full transition",
                                  active
                                    ? "left-[18px] bg-[#f0cd79]"
                                    : "left-1 bg-slate-500",
                                )}
                              />
                            </button>
                          </div>
                        </div>

                        <p className="mt-1 truncate text-[11px] leading-5 text-slate-500">
                          {getLayerStatusText(layer)}
                        </p>
                        {isDevelopmentHotspotLayer
                          ? renderDevelopmentHotspotControls()
                          : null}

                        {infoOpen ? (
                          <LayerMoreInfoPanel
                            layer={layer}
                            onOpenMethodology={() =>
                              setProductMode("methodology")
                            }
                          />
                        ) : null}
                        {configureOpen ? renderConfigurePanel(layer) : null}
                        {legendOpen ? renderLegendPanel(layer) : null}

                        {active &&
                        (developmentHotspotLayer.errorMessage ||
                          floodConstraintLayer.errorMessage ||
                          floodZoneLayer.errorMessage ||
                          schoolUtilizationZoneLayer.errorMessage) ? (
                          <LayerErrorMessage
                            layerId={layer.id}
                            developmentError={
                              developmentHotspotLayer.errorMessage
                            }
                            floodConstraintError={
                              floodConstraintLayer.errorMessage
                            }
                            floodZoneError={floodZoneLayer.errorMessage}
                            schoolError={
                              schoolUtilizationZoneLayer.errorMessage
                            }
                          />
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              ) : null}
            </details>
          );
        })}

        <div className="mt-4 border-t border-white/10 pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                Coming Soon / Official Data Needed
              </p>
              <p className="mt-1 text-[11px] leading-5 text-slate-600">
                Official data needed before these overlays can be enabled.
              </p>
            </div>
            <LayerStatusBadge>Official data needed</LayerStatusBadge>
          </div>
          <div className="mt-2 grid gap-2 opacity-85">
            {comingSoonLayerTopics.map((row) => (
              <ComingSoonLayerRow
                accent={row.accent ?? "#64748b"}
                key={row.id}
                note={row.note}
                title={row.title}
                open={false}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="mt-3 rounded-md border border-white/10 bg-white/[0.025] px-3 py-2 text-[11px] leading-5 text-slate-500">
        Methodology contains source notes and caveats.
      </div>
    </section>
  );

}

function ModelResearchStatusCard({
  onOpenMethodology,
}: {
  onOpenMethodology: () => void;
}) {
  return (
    <article className="rounded-lg border border-[#68d8ff]/15 bg-[#071827]/70 p-3">
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[#68d8ff]/20 bg-[#68d8ff]/10 text-[#8fe7ff]">
          <BrainCircuit className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold leading-5 text-slate-100">
              Model Research Status
            </h3>
            <span className="rounded border border-amber-300/20 bg-amber-300/10 px-2 py-0.5 text-[10px] font-semibold uppercase leading-4 text-amber-100">
              Internal Only
            </span>
          </div>
          <p className="mt-1 text-xs leading-5 text-slate-400">
            Development ranking research is available in Methodology.
            Parcel-level predictions are not public or production-ready.
          </p>
        </div>
      </div>
      <button
        className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-md border border-[#68d8ff]/20 bg-[#68d8ff]/10 px-3 py-2 text-xs font-semibold text-[#bfefff] transition hover:border-[#68d8ff]/35 hover:bg-[#68d8ff]/15 focus:outline-none focus:ring-2 focus:ring-[#68d8ff]/25"
        onClick={onOpenMethodology}
        type="button"
      >
        Open Methodology
        <ArrowUpRight className="h-3.5 w-3.5" />
      </button>
    </article>
  );
}

function LayerInlinePanel({ children }: { children: ReactNode }) {
  return (
    <div className="mt-2 min-w-0 overflow-hidden rounded-md border border-white/10 bg-black/18 p-2">
      {children}
    </div>
  );
}

function ComingSoonLayerRow({
  accent,
  note = "Available when official data is added.",
  onMoreInfo,
  onOpenMethodology,
  open,
  sourceLayer,
  title,
}: {
  accent: string;
  note?: string;
  onMoreInfo?: () => void;
  onOpenMethodology?: () => void;
  open: boolean;
  sourceLayer?: OperationalLayer;
  title: string;
}) {
  return (
    <article
      className="min-w-0 overflow-hidden rounded-md border border-white/10 bg-black/12 p-2 opacity-70"
      data-layer-disabled="true"
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full shadow-[0_0_16px_currentColor]"
          style={{ background: accent, color: accent }}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold leading-5 text-slate-100">
            {title}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <LayerStatusBadge>Coming Soon</LayerStatusBadge>
            <LayerStatusBadge>Data still needed</LayerStatusBadge>
          </div>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {sourceLayer && onMoreInfo ? (
            <button
              aria-label={`More information for ${title}`}
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border border-white/10 bg-white/[0.035] text-slate-400 transition hover:border-[#68d8ff]/35 hover:bg-[#68d8ff]/10 hover:text-[#b7f0ff]"
              onClick={onMoreInfo}
              title="More Info"
              type="button"
            >
              <Info className="h-3.5 w-3.5" />
            </button>
          ) : null}
          {onOpenMethodology ? (
            <button
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border border-[#68d8ff]/18 bg-[#68d8ff]/10 text-[#b7f0ff] transition hover:bg-[#68d8ff]/15"
              onClick={onOpenMethodology}
              title="Open Methodology"
              type="button"
            >
              <BookOpen className="h-3.5 w-3.5" />
            </button>
          ) : null}
          <button
            aria-label={`${title} unavailable`}
            className="relative h-5 w-9 shrink-0 cursor-not-allowed rounded-full border border-white/10 bg-white/5 opacity-60"
            disabled
            title="Coming Soon"
            type="button"
          >
            <span className="absolute left-1 top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full bg-slate-500" />
          </button>
        </div>
      </div>
      <p className="mt-2 text-[11px] leading-5 text-slate-500">
        {note}
      </p>
      {open && sourceLayer && onOpenMethodology ? (
        <LayerMoreInfoPanel
          layer={sourceLayer}
          onOpenMethodology={onOpenMethodology}
        />
      ) : null}
    </article>
  );
}

function LayerMoreInfoPanel({
  layer,
  onOpenMethodology,
}: {
  layer: OperationalLayer;
  onOpenMethodology: () => void;
}) {
  const details =
    layerInfoById[layer.id] ??
    ({
      caveat:
        layer.sourceStatus === "live"
          ? "Review source metadata before using this layer in formal decisions."
          : "Context/reference layer only.",
      interpretation: layer.description,
      reportUse:
        "Appears in Planning Snapshot reports when this context is active or relevant.",
      source: layer.futureSource ?? getLayerSourceStatusLabel(layer),
      summary: layer.description,
    } satisfies LayerInfoContent);

  return (
    <LayerInlinePanel>
      <div className="grid gap-2 text-xs leading-5 text-slate-400">
        <LayerInfoFact label="What this layer shows" value={details.summary} />
        <LayerInfoFact label="Source" value={details.source} />
        <LayerInfoFact
          label="How to interpret it"
          value={details.interpretation}
        />
        <LayerInfoFact label="Caveat" value={details.caveat} />
        <LayerInfoFact
          label="Where it appears in reports"
          value={details.reportUse}
        />
      </div>
      <button
        className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-[#68d8ff]/18 bg-[#68d8ff]/10 px-2.5 py-1.5 text-[11px] font-semibold text-[#b7f0ff] transition hover:bg-[#68d8ff]/15"
        onClick={onOpenMethodology}
        type="button"
      >
        Open Methodology
        <ArrowUpRight className="h-3 w-3" />
      </button>
    </LayerInlinePanel>
  );
}

function LayerInfoFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-white/10 bg-white/[0.025] px-2 py-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
        {label}
      </p>
      <p className="mt-0.5 break-words text-[11px] leading-5 text-slate-300">
        {value}
      </p>
    </div>
  );
}

function LayerLegendItem({
  color,
  label,
  shape,
  size,
}: {
  color: string;
  label: string;
  shape: string;
  size: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded border border-white/10 bg-white/[0.025] px-2 py-1.5">
      <LayerLegendMarker color={color} shape={shape} size={size} />
      <span className="truncate text-[11px] leading-4 text-slate-300">
        {label}
      </span>
    </div>
  );
}

function LayerErrorMessage({
  developmentError,
  floodConstraintError,
  floodZoneError,
  layerId,
  schoolError,
}: {
  developmentError?: string | null;
  floodConstraintError?: string | null;
  floodZoneError?: string | null;
  layerId: string;
  schoolError?: string | null;
}) {
  const message =
    layerId === DEVELOPMENT_HOTSPOT_LAYER_ID
      ? developmentError
      : layerId === FLOOD_CONSTRAINT_LAYER_ID
        ? floodConstraintError
        : layerId === FEMA_FLOOD_ZONE_LAYER_ID
          ? floodZoneError
          : layerId === SCHOOL_UTILIZATION_LAYER_ID
            ? schoolError
            : null;

  if (!message) {
    return null;
  }

  return (
    <p className="mt-2 rounded border border-amber-300/15 bg-amber-300/[0.045] px-2 py-1.5 text-[11px] leading-5 text-amber-100/75">
      {message}
    </p>
  );
}

function getLayerSourceStatusLabel(layer: OperationalLayer) {
  if (layer.sourceStatus === "live") {
    return "API";
  }

  if (layer.sourceStatus === "disabled") {
    return "Disabled";
  }

  if (layer.sourceStatus === "placeholder") {
    return "Placeholder";
  }

  if (layer.id === "county-boundary" || layer.id === "parcel-intelligence") {
    return "Reference";
  }

  return "Placeholder";
}

function getLayerDisplayTitle(layer: OperationalLayer) {
  switch (layer.id) {
    case FLOOD_CONSTRAINT_LAYER_ID:
      return "Floodplain Review";
    case FEMA_FLOOD_ZONE_LAYER_ID:
      return "Floodplain Source Areas";
    case SCHOOL_UTILIZATION_LAYER_ID:
      return "School Capacity Watch";
    default:
      return layer.title;
  }
}

function LayerStatusBadge({
  active = false,
  children,
  tone = "neutral",
}: {
  active?: boolean;
  children: string;
  tone?: "gold" | "green" | "neutral" | "orange" | "red";
}) {
  const activeTone = {
    gold: "border-[#d8b86a]/30 bg-[#d8b86a]/10 text-[#f0cd79]",
    green: "border-[#5cd38f]/30 bg-[#5cd38f]/10 text-[#b9ffd1]",
    neutral: "border-white/10 bg-white/[0.025] text-slate-500",
    orange: "border-[#ffb454]/30 bg-[#ffb454]/10 text-[#ffd49d]",
    red: "border-[#ff8d7a]/30 bg-[#ff8d7a]/10 text-[#ffc2b6]",
  };

  return (
    <span
      className={cn(
        "max-w-full whitespace-nowrap rounded border px-2 py-1 text-[10px] font-medium leading-4",
        active ? activeTone[tone] : activeTone.neutral,
      )}
    >
      {children}
    </span>
  );
}

function HotspotAdvancedFilters({
  controls,
  onChange,
}: {
  controls: DevelopmentHotspotControls;
  onChange: <K extends keyof DevelopmentHotspotControls>(
    key: K,
    value: DevelopmentHotspotControls[K],
  ) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <details
      className="col-span-2 rounded-md border border-white/10 bg-black/15 p-2"
      onToggle={(event) => setIsOpen(event.currentTarget.open)}
      open={isOpen}
    >
      <summary className="cursor-pointer list-none text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
        Advanced Filters
      </summary>
      {isOpen ? (
        <div className="mt-2 grid grid-cols-2 gap-2 border-t border-white/10 pt-2">
          <HotspotSelect
            label="Activity"
            onChange={(value) =>
              onChange("activityClass", value as DevelopmentHotspotActivityClassFilter)
            }
            options={activityClassOptions}
            value={controls.activityClass}
          />
          <HotspotSelect
            label="Window"
            onChange={(value) =>
              onChange("recentWindow", value as DevelopmentHotspotRecentWindowFilter)
            }
            options={recentWindowOptions}
            value={controls.recentWindow}
          />
          <HotspotSelect
            label="Growth Signal"
            onChange={(value) =>
              onChange("growthSignal", value as DevelopmentHotspotGrowthSignalFilter)
            }
            options={growthSignalOptions}
            value={controls.growthSignal}
          />
          <HotspotSelect
            label="Status Stage"
            onChange={(value) =>
              onChange("statusStage", value as DevelopmentHotspotStatusStageFilter)
            }
            options={statusStageOptions}
            value={controls.statusStage}
          />
          <HotspotSelect
            label="Value Class"
            onChange={(value) =>
              onChange("valueClass", value as DevelopmentHotspotValueClassFilter)
            }
            options={valueClassOptions}
            value={controls.valueClass}
          />
          <HotspotSelect
            label="Jurisdiction"
            onChange={(value) => onChange("zoningJurisdiction", value)}
            options={zoningJurisdictionOptions}
            value={controls.zoningJurisdiction}
          />
          <HotspotSelect
            label="Sort"
            onChange={(value) =>
              onChange("sortBy", value as DevelopmentHotspotSortBy)
            }
            options={sortOptions}
            value={controls.sortBy}
          />
          <HotspotSelect
            label="Limit"
            onChange={(value) =>
              onChange("limit", Number(value) as DevelopmentHotspotLimit)
            }
            options={limitOptions.map((value) => ({
              label: String(value),
              value: String(value),
            }))}
            value={String(controls.limit)}
          />
        </div>
      ) : null}
    </details>
  );
}

function HotspotSelect({
  className,
  label,
  onChange,
  options,
  value,
}: {
  className?: string;
  label: string;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  value: string;
}) {
  return (
    <label className={cn("min-w-0", className)}>
      <span className="mb-1 block text-[10px] font-medium uppercase text-slate-500">
        {label}
      </span>
      <select
        aria-label={`Development hotspot ${label.toLowerCase()} filter`}
        className="h-8 w-full rounded-md border border-white/10 bg-[#08111d] px-2 text-xs text-slate-100 outline-none transition hover:border-white/20 focus:border-[#d8b86a]/55 focus:ring-2 focus:ring-[#d8b86a]/15"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function FloodZoneSelect({
  className,
  label,
  onChange,
  options,
  value,
}: {
  className?: string;
  label: string;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  value: string;
}) {
  return (
    <label className={cn("min-w-0", className)}>
      <span className="mb-1 block text-[10px] font-medium uppercase text-slate-500">
        {label}
      </span>
      <select
        aria-label={`FEMA flood zone ${label.toLowerCase()} filter`}
        className="h-8 w-full rounded-md border border-white/10 bg-[#08111d] px-2 text-xs text-slate-100 outline-none transition hover:border-white/20 focus:border-[#ffb454]/55 focus:ring-2 focus:ring-[#ffb454]/15"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function SchoolUtilizationSelect({
  className,
  label,
  onChange,
  options,
  value,
}: {
  className?: string;
  label: string;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  value: string;
}) {
  return (
    <label className={cn("min-w-0", className)}>
      <span className="mb-1 block text-[10px] font-medium uppercase text-slate-500">
        {label}
      </span>
      <select
        aria-label={`School utilization ${label.toLowerCase()} control`}
        className="h-8 w-full rounded-md border border-white/10 bg-[#08111d] px-2 text-xs text-slate-100 outline-none transition hover:border-white/20 focus:border-[#5cd38f]/55 focus:ring-2 focus:ring-[#5cd38f]/15"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function formatSchoolLevelLabel(value: SchoolUtilizationLevel) {
  switch (value) {
    case "all":
      return "all-level";
    case "elementary":
      return "elementary";
    case "middle":
      return "middle";
    case "high":
      return "high";
  }
}

function getPermitSegmentLabel(
  value: DevelopmentHotspotPermitSegmentFilter | null,
) {
  return (
    permitSegmentOptions.find((option) => option.value === value)?.label ??
    "Permit Segment"
  );
}

function getPermitSegmentLegendColor(
  value: DevelopmentHotspotPermitSegmentFilter | null,
) {
  switch (value) {
    case "residential_growth":
      return "#68d8ff";
    case "commercial_activity":
      return "#ffb454";
    case "redevelopment_signal":
      return "#bc8bff";
    case "minor_maintenance":
      return "#94a3b8";
    case "demolition":
      return "#b91c1c";
    case "industrial_activity":
      return "#d6a146";
    case "institutional_activity":
      return "#5cd38f";
    default:
      return "#64748b";
  }
}

function getPermitSegmentLegendShape(
  value: DevelopmentHotspotPermitSegmentFilter | null,
) {
  switch (value) {
    case "commercial_activity":
    case "industrial_activity":
      return "square";
    case "redevelopment_signal":
      return "kite";
    case "demolition":
      return "x";
    case "institutional_activity":
      return "triangle";
    default:
      return "circle";
  }
}

function LayerLegendMarker({
  color,
  shape,
  size,
}: {
  color: string;
  shape: string;
  size: string;
}) {
  if (shape === "triangle") {
    return (
      <span
        aria-hidden="true"
        className="h-0 w-0 shrink-0 border-x-[6px] border-b-[11px] border-x-transparent drop-shadow-[0_0_9px_currentColor]"
        style={{
          borderBottomColor: color,
          color,
        }}
      />
    );
  }

  if (shape === "kite") {
    return (
      <span
        aria-hidden="true"
        className={cn(
          "shrink-0 rotate-45 border border-white/70 shadow-[0_0_14px_currentColor]",
          size,
        )}
        style={{
          background: color,
          color,
        }}
      />
    );
  }

  if (shape === "square") {
    return (
      <span
        aria-hidden="true"
        className={cn(
          "shrink-0 border border-white/70 shadow-[0_0_14px_currentColor]",
          size,
        )}
        style={{
          background: color,
          color,
        }}
      />
    );
  }

  if (shape === "x") {
    return (
      <span
        aria-hidden="true"
        className="relative h-4 w-4 shrink-0 text-current"
        style={{ color }}
      >
        <span className="absolute left-1/2 top-0 h-full w-1 -translate-x-1/2 rotate-45 rounded-full bg-current shadow-[0_0_12px_currentColor]" />
        <span className="absolute left-1/2 top-0 h-full w-1 -translate-x-1/2 -rotate-45 rounded-full bg-current shadow-[0_0_12px_currentColor]" />
      </span>
    );
  }

  return (
    <span
      aria-hidden="true"
      className={cn(
        "shrink-0 rounded-full border border-white/70 shadow-[0_0_14px_currentColor]",
        size,
      )}
      style={{
        background: color,
        color,
      }}
    />
  );
}

function FloodCountBadge({
  color,
  label,
  value,
}: {
  color: string;
  label: string;
  value: number;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded border border-white/10 bg-white/[0.025] px-1.5 py-1 text-[10px] font-medium uppercase text-slate-300">
      <span
        className="h-2 w-2 rounded-full shadow-[0_0_12px_currentColor]"
        style={{
          background: color,
          color,
        }}
      />
      {value} {label}
    </span>
  );
}
