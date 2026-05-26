"use client";

import { BarChart3, GitCompare, TrendingDown, TrendingUp } from "lucide-react";
import { useMemo } from "react";
import { scenarioPresets } from "@/data/mock/dashboardMockData";
import { useDashboardState } from "@/hooks/useDashboardState";
import { getScenarioComparisonOptions } from "@/lib/dashboard/scenarioComparisonAdapter";
import { cn } from "@/lib/utils";
import type { ScenarioId } from "@/types";
import type {
  ComparisonSeverity,
  ComparisonTrend,
  ScenarioComparison,
  ScenarioComparisonMetric,
} from "@/types/scenarioComparison";

const severityClass: Record<ComparisonSeverity, string> = {
  critical: "border-red-300/25 bg-red-300/[0.08] text-red-100",
  neutral: "border-white/10 bg-white/[0.035] text-slate-200",
  positive: "border-emerald-300/25 bg-emerald-300/[0.08] text-emerald-100",
  watch: "border-amber-300/25 bg-amber-300/[0.08] text-amber-100",
};

export function ScenarioComparisonPanel() {
  const {
    activeComparison,
    comparisonMetrics,
    comparisonPair,
    setBriefingMode,
    setComparisonPair,
  } = useDashboardState();
  const comparisonOptions = useMemo(() => getScenarioComparisonOptions(), []);
  const compatibleRightScenarios = useMemo(
    () =>
      scenarioPresets.filter((scenario) =>
        getCompatibleScenarioIds(
          comparisonOptions,
          comparisonPair.leftScenarioId,
        ).has(scenario.id),
      ),
    [comparisonOptions, comparisonPair.leftScenarioId],
  );

  function applyComparisonPair(
    leftScenarioId: ScenarioId,
    rightScenarioId: ScenarioId,
  ) {
    const comparison = getComparisonOption(
      comparisonOptions,
      leftScenarioId,
      rightScenarioId,
    );

    setComparisonPair({ leftScenarioId, rightScenarioId });

    if (comparison) {
      setBriefingMode(comparison.recommendedBriefingMode);
    }
  }

  function handleLeftScenarioChange(nextScenarioId: ScenarioId) {
    const compatibleIds = getCompatibleScenarioIds(
      comparisonOptions,
      nextScenarioId,
    );
    const nextRightScenarioId = compatibleIds.has(
      comparisonPair.rightScenarioId,
    )
      ? comparisonPair.rightScenarioId
      : Array.from(compatibleIds)[0] ?? comparisonPair.rightScenarioId;

    applyComparisonPair(nextScenarioId, nextRightScenarioId);
  }

  return (
    <section className="rounded-lg border border-white/10 bg-black/20 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase text-slate-500">
            Scenario Comparison
          </p>
          <h3 className="mt-1 text-base font-semibold text-white">
            {activeComparison.title}
          </h3>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-md border border-[#d8b86a]/25 bg-[#d8b86a]/10 text-[#f0cd79]">
          <GitCompare className="h-4 w-4" />
        </div>
      </div>

      <p className="mt-2 text-xs leading-5 text-slate-400">
        {activeComparison.summary}
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <ScenarioSelect
          label="From"
          onChange={handleLeftScenarioChange}
          value={comparisonPair.leftScenarioId}
        />
        <ScenarioSelect
          label="To"
          onChange={(nextScenarioId) =>
            applyComparisonPair(comparisonPair.leftScenarioId, nextScenarioId)
          }
          options={compatibleRightScenarios}
          value={comparisonPair.rightScenarioId}
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        {comparisonMetrics.map((metric) => (
          <ComparisonMetricCard key={metric.id} metric={metric} />
        ))}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <ComparisonSignal
          label="Fiscal"
          value={activeComparison.fiscalOpportunityShift}
        />
        <ComparisonSignal
          label="Readiness"
          value={activeComparison.infrastructureReadinessShift}
        />
        <ComparisonSignal
          label="Pressure"
          value={activeComparison.parcelPressureShift}
        />
      </div>

      <div className="mt-3 rounded-md border border-red-300/15 bg-red-300/[0.05] p-3">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase text-red-100/80">
          <BarChart3 className="h-3.5 w-3.5" />
          Risk Indicators
        </div>
        <div className="mt-2 space-y-1">
          {activeComparison.riskIndicators.map((indicator) => (
            <p className="text-[11px] leading-4 text-red-100/70" key={indicator}>
              {indicator}
            </p>
          ))}
        </div>
      </div>
    </section>
  );
}

interface ScenarioSelectProps {
  label: string;
  onChange: (scenarioId: ScenarioId) => void;
  options?: typeof scenarioPresets;
  value: ScenarioId;
}

function ScenarioSelect({
  label,
  onChange,
  options = scenarioPresets,
  value,
}: ScenarioSelectProps) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-medium uppercase text-slate-500">
        {label}
      </span>
      <select
        aria-label={label}
        className="h-9 w-full rounded-md border border-white/10 bg-white/[0.045] px-2 text-xs text-white outline-none transition focus:border-[#d8b86a]/50"
        onChange={(event) => onChange(event.target.value as ScenarioId)}
        value={value}
      >
        {options.map((scenario) => (
          <option
            className="bg-[#08111d] text-white"
            key={scenario.id}
            value={scenario.id}
          >
            {scenario.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ComparisonMetricCard({
  metric,
}: {
  metric: ScenarioComparisonMetric;
}) {
  return (
    <div
      className={cn(
        "rounded-md border p-3",
        severityClass[metric.severity],
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[10px] font-medium uppercase opacity-70">
            {metric.label}
          </p>
          <p className="mt-1 text-sm font-semibold">
            {metric.leftValue} to {metric.rightValue}
          </p>
        </div>
        <TrendIcon trend={metric.trend} />
      </div>
      <p className="mt-1 text-xs font-semibold" style={{ color: metric.accent }}>
        {metric.delta}
      </p>
      <p className="mt-1 text-[11px] leading-4 opacity-70">
        {metric.description}
      </p>
    </div>
  );
}

function ComparisonSignal({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.035] p-2">
      <p className="truncate text-[10px] uppercase text-slate-500">{label}</p>
      <p className="mt-1 truncate text-xs font-semibold text-white">{value}</p>
    </div>
  );
}

function TrendIcon({ trend }: { trend: ComparisonTrend }) {
  if (trend === "up") {
    return <TrendingUp className="h-3.5 w-3.5 shrink-0" />;
  }

  if (trend === "down") {
    return <TrendingDown className="h-3.5 w-3.5 shrink-0" />;
  }

  return <BarChart3 className="h-3.5 w-3.5 shrink-0" />;
}

function getCompatibleScenarioIds(
  comparisons: ScenarioComparison[],
  scenarioId: ScenarioId,
) {
  const compatibleIds = new Set<ScenarioId>();

  comparisons.forEach((comparison) => {
    if (comparison.leftScenarioId === scenarioId) {
      compatibleIds.add(comparison.rightScenarioId);
    }

    if (comparison.rightScenarioId === scenarioId) {
      compatibleIds.add(comparison.leftScenarioId);
    }
  });

  return compatibleIds;
}

function getComparisonOption(
  comparisons: ScenarioComparison[],
  leftScenarioId: ScenarioId,
  rightScenarioId: ScenarioId,
) {
  return comparisons.find(
    (comparison) =>
      (comparison.leftScenarioId === leftScenarioId &&
        comparison.rightScenarioId === rightScenarioId) ||
      (comparison.leftScenarioId === rightScenarioId &&
        comparison.rightScenarioId === leftScenarioId),
  );
}
