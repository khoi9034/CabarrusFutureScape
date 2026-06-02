import { DatabaseZap } from "lucide-react";
import {
  formatDevelopmentCount,
  formatDevelopmentLabel,
} from "@/data/intelligence/developmentActivityMetrics";
import type { TemporalAnalysisState } from "@/hooks/useTemporalAnalysisState";
import type { TemporalQueryViewModel } from "@/lib/adapters/temporalQueryAdapter";

interface TemporalQueryPreviewProps {
  temporalQuery: TemporalQueryViewModel;
  temporalState: TemporalAnalysisState;
}

const queryModeLabels = {
  "combined-preview": "Combined Preview",
  "dimension-aggregate": "Dimension Aggregate",
  "temporal-aggregate": "Temporal Aggregate",
} as const;

export function TemporalQueryPreview({
  temporalQuery,
  temporalState,
}: TemporalQueryPreviewProps) {
  const queryResult = temporalQuery.queryResult;

  return (
    <section
      aria-label="Future temporal query preview"
      className="rounded-md border border-[#68d8ff]/20 bg-[#68d8ff]/[0.045] p-3"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-medium uppercase text-slate-500">
            Query Simulation
          </p>
          <h4 className="mt-1 text-sm font-semibold text-white">
            Future PostGIS/API Preview
          </h4>
        </div>
        <DatabaseZap className="h-4 w-4 text-[#68d8ff]" />
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <div className="rounded-md border border-white/10 bg-black/25 p-2">
          <p className="text-[10px] uppercase text-slate-500">Permits</p>
          <p className="mt-1 text-sm font-semibold text-white">
            {formatDevelopmentCount(queryResult.matchingPermitCount)}
          </p>
        </div>
        <div className="rounded-md border border-white/10 bg-black/25 p-2">
          <p className="text-[10px] uppercase text-slate-500">Parcels</p>
          <p className="mt-1 text-sm font-semibold text-white">
            {formatDevelopmentCount(queryResult.matchingParcelCount)}
          </p>
        </div>
        <div className="rounded-md border border-white/10 bg-black/25 p-2">
          <p className="text-[10px] uppercase text-slate-500">Zoning Rows</p>
          <p className="mt-1 text-sm font-semibold text-white">
            {formatDevelopmentCount(queryResult.matchingZoningActivityCount)}
          </p>
        </div>
      </div>

      <div className="mt-3 rounded-md border border-white/10 bg-black/30 p-3">
        <div className="mb-2 flex items-center justify-between gap-3">
          <span className="text-[10px] font-semibold uppercase text-[#68d8ff]">
            {queryModeLabels[queryResult.queryMode]}
          </span>
          {temporalState.selectedActivityClass ? (
            <span className="truncate text-[10px] uppercase text-slate-500">
              {formatDevelopmentLabel(temporalState.selectedActivityClass)}
            </span>
          ) : null}
        </div>
        <pre className="max-h-44 overflow-auto whitespace-pre-wrap break-words font-mono text-[10px] leading-5 text-slate-300">
          {temporalQuery.queryPreview}
        </pre>
      </div>

      <p className="mt-3 text-[11px] leading-5 text-slate-400">
        {queryResult.summaryNote}{" "}
        {temporalQuery.source === "api"
          ? `The API returned ${formatDevelopmentCount(
              temporalQuery.resultCount,
            )} paged records for this temporal context.`
          : "Generated static temporal artifacts remain available for this context."}{" "}
        It does not alter the SceneView.
      </p>
    </section>
  );
}
