"use client";

import { useMemo } from "react";
import { barX, defineChart, lineY } from "@tanstack/charts";
import { Chart } from "@tanstack/charts/react";
import { scaleBand } from "@tanstack/charts/scales/band";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { scalePoint } from "@tanstack/charts/scales/point";
import { tooltip } from "@tanstack/charts/tooltip";

export interface CfsChartRow {
  label: string;
  value: number;
}

const chartTheme = {
  background: "transparent",
  foreground: "#dbe7eb",
  grid: "#243847",
  muted: "#8fa4ae",
  palette: ["#82c9d8", "#dfcf91", "#77c99b", "#b4a7d6"],
} as const;

export function CfsTrendChart({
  ariaLabel,
  rows,
}: {
  ariaLabel: string;
  rows: readonly CfsChartRow[];
}) {
  const definition = useMemo(
    () =>
      defineChart({
        clip: true,
        marks: [
          lineY(rows, {
            points: true,
            stroke: "#9bd1de",
            strokeWidth: 2.5,
            x: "label",
            y: "value",
          }),
        ],
        scales: {
          x: { scale: () => scalePoint<string>().padding(0.24) },
          y: {
            axis: { ticks: { format: formatCompact } },
            grid: true,
            nice: true,
            scale: scaleLinear,
          },
        },
        theme: chartTheme,
        tooltip,
      }),
    [rows],
  );

  return rows.length ? (
    <Chart
      ariaLabel={ariaLabel}
      className="cfs-management-chart"
      definition={definition}
      height={250}
      initialWidth={720}
    />
  ) : (
    <ChartUnavailable />
  );
}

export function CfsRankedBarChart({
  ariaLabel,
  rows,
}: {
  ariaLabel: string;
  rows: readonly CfsChartRow[];
}) {
  const visibleRows = useMemo(
    () => [...rows].sort((left, right) => right.value - left.value).slice(0, 8),
    [rows],
  );
  const definition = useMemo(
    () =>
      defineChart({
        clip: true,
        marks: [
          barX(visibleRows, {
            fill: "#82c9d8",
            inset: 3,
            radius: 4,
            x: "value",
            y: "label",
          }),
        ],
        scales: {
          x: {
            axis: { ticks: { format: formatCompact } },
            grid: true,
            nice: true,
            scale: scaleLinear,
          },
          y: { scale: () => scaleBand<string>().padding(0.18) },
        },
        theme: chartTheme,
        tooltip,
      }),
    [visibleRows],
  );

  return visibleRows.length ? (
    <Chart
      ariaLabel={ariaLabel}
      className="cfs-management-chart"
      definition={definition}
      height={Math.max(210, visibleRows.length * 42)}
      initialWidth={720}
    />
  ) : (
    <ChartUnavailable />
  );
}

function ChartUnavailable() {
  return (
    <p className="rounded-lg border border-white/10 bg-white/[0.035] p-4 text-sm text-slate-400">
      Current source data is unavailable, so no empty chart is shown.
    </p>
  );
}

function formatCompact(value: unknown) {
  return typeof value === "number"
    ? Intl.NumberFormat("en-US", { maximumFractionDigits: 1, notation: "compact" }).format(value)
    : String(value);
}
