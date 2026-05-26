"use client";

import { useMemo } from "react";
import {
  Building2,
  CircleDollarSign,
  Network,
  ShieldAlert,
  TrendingUp,
} from "lucide-react";
import { TimeSliderPanel } from "@/components/dashboard/TimeSliderPanel";
import { KPICard } from "@/components/ui/KPICard";
import { kpiMetrics } from "@/data/mock/dashboardMockData";
import { useDashboardState } from "@/hooks/useDashboardState";
import type { MetricCard } from "@/types";

const iconMap = {
  growth: TrendingUp,
  parcels: Building2,
  infrastructure: Network,
  revenue: CircleDollarSign,
  risk: ShieldAlert,
};

export function MetricsBar() {
  const { activeRole, simulationYear, setSimulationYear } = useDashboardState();
  const roleFocusedMetrics = useMemo(() => {
    const preferredMetricIds = new Set(activeRole.preferredKpiCardIds);
    const preferredMetrics = activeRole.preferredKpiCardIds
      .map((metricId) => kpiMetrics.find((metric) => metric.id === metricId))
      .filter((metric): metric is MetricCard => Boolean(metric));
    const remainingMetrics = kpiMetrics.filter(
      (metric) => !preferredMetricIds.has(metric.id),
    );

    return [...preferredMetrics, ...remainingMetrics];
  }, [activeRole.preferredKpiCardIds]);

  return (
    <footer className="glass-panel z-20 mx-3 mb-3 rounded-lg p-3 lg:mx-4 lg:mb-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-stretch">
        <div className="no-scrollbar flex flex-1 gap-3 overflow-x-auto">
          {roleFocusedMetrics.map((metric) => (
            <KPICard
              accent={metric.accent}
              delta={metric.delta}
              icon={iconMap[metric.icon]}
              key={metric.id}
              label={metric.label}
              status={metric.status}
              trend={metric.trend}
              value={metric.value}
            />
          ))}
        </div>

        <TimeSliderPanel
          onSimulationYearChange={setSimulationYear}
          simulationYear={simulationYear}
        />
      </div>
    </footer>
  );
}
