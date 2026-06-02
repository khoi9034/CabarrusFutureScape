import { RotateCcw } from "lucide-react";
import type { TemporalAnalysisState } from "@/hooks/useTemporalAnalysisState";

interface TemporalFilterControlsProps {
  temporalState: TemporalAnalysisState;
}

const controlClassName =
  "w-full rounded-md border border-white/10 bg-black/30 px-2.5 py-2 text-xs text-slate-100 outline-none transition focus:border-[#68d8ff]/50 focus:ring-2 focus:ring-[#68d8ff]/15";

function normalizeSelectValue(value: string) {
  return value === "all" ? null : value;
}

function normalizeRollingWindow(value: string) {
  if (value === "12" || value === "36") {
    return Number.parseInt(value, 10) as 12 | 36;
  }

  return null;
}

export function TemporalFilterControls({
  temporalState,
}: TemporalFilterControlsProps) {
  const monthOptions = temporalState.selectedYear
    ? temporalState.availableMonths.filter(
        (month) => month.year === temporalState.selectedYear,
      )
    : temporalState.availableMonths;
  const selectedMonthValue =
    temporalState.selectedYear && temporalState.selectedMonth
      ? `${temporalState.selectedYear}-${temporalState.selectedMonth}`
      : "all";

  return (
    <section
      aria-label="Temporal development activity filters"
      className="rounded-md border border-white/10 bg-white/[0.035] p-3"
    >
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-semibold text-white">Temporal Filters</h4>
        <button
          aria-label="Reset temporal filters"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/10 bg-black/20 text-slate-300 transition hover:border-[#f0cd79]/40 hover:text-[#f0cd79] focus:outline-none focus:ring-2 focus:ring-[#f0cd79]/30"
          onClick={temporalState.resetTemporalFilters}
          title="Reset temporal filters"
          type="button"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="space-y-1">
          <span className="text-[10px] font-medium uppercase text-slate-500">
            Year
          </span>
          <select
            aria-label="Select development activity year"
            className={controlClassName}
            onChange={(event) =>
              temporalState.setYear(
                event.target.value === "all"
                  ? null
                  : Number.parseInt(event.target.value, 10),
              )
            }
            value={temporalState.selectedYear ?? "all"}
          >
            <option value="all">All years</option>
            {temporalState.availableYears
              .slice()
              .reverse()
              .map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
          </select>
        </label>

        <label className="space-y-1">
          <span className="text-[10px] font-medium uppercase text-slate-500">
            Month
          </span>
          <select
            aria-label="Select development activity month"
            className={controlClassName}
            onChange={(event) => {
              if (event.target.value === "all") {
                temporalState.setMonth(null);
                return;
              }

              const [year, month] = event.target.value.split("-").map(Number);
              temporalState.setYear(year);
              temporalState.setMonth(month);
            }}
            value={selectedMonthValue}
          >
            <option value="all">All months</option>
            {monthOptions
              .slice()
              .reverse()
              .map((month) => (
                <option
                  key={`${month.year}-${month.month}`}
                  value={`${month.year}-${month.month}`}
                >
                  {month.label}
                </option>
              ))}
          </select>
        </label>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="space-y-1">
          <span className="text-[10px] font-medium uppercase text-slate-500">
            Rolling Window
          </span>
          <select
            aria-label="Select temporal rolling window"
            className={controlClassName}
            onChange={(event) =>
              temporalState.setRollingWindow(
                normalizeRollingWindow(event.target.value),
              )
            }
            value={temporalState.selectedRollingWindow ?? "all"}
          >
            <option value="all">No rolling window</option>
            <option value="12">Rolling 12 months</option>
            <option value="36">Rolling 36 months</option>
          </select>
        </label>

        <label className="space-y-1">
          <span className="text-[10px] font-medium uppercase text-slate-500">
            Zoning Category
          </span>
          <select
            aria-label="Select zoning category"
            className={controlClassName}
            onChange={(event) =>
              temporalState.setZoningCategory(
                normalizeSelectValue(event.target.value),
              )
            }
            value={temporalState.selectedZoningCategory ?? "all"}
          >
            <option value="all">All categories</option>
            {temporalState.zoningCategories.map((zoningCategory) => (
              <option key={zoningCategory} value={zoningCategory}>
                {zoningCategory}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="space-y-1">
          <span className="text-[10px] font-medium uppercase text-slate-500">
            Start
          </span>
          <input
            aria-label="Select development activity start date"
            className={controlClassName}
            max={temporalState.maxDate ?? undefined}
            min={temporalState.minDate ?? undefined}
            onChange={(event) =>
              temporalState.setDateRange({
                ...temporalState.selectedDateRange,
                start: event.target.value || null,
              })
            }
            type="date"
            value={temporalState.selectedDateRange.start ?? ""}
          />
        </label>

        <label className="space-y-1">
          <span className="text-[10px] font-medium uppercase text-slate-500">
            End
          </span>
          <input
            aria-label="Select development activity end date"
            className={controlClassName}
            max={temporalState.maxDate ?? undefined}
            min={temporalState.minDate ?? undefined}
            onChange={(event) =>
              temporalState.setDateRange({
                ...temporalState.selectedDateRange,
                end: event.target.value || null,
              })
            }
            type="date"
            value={temporalState.selectedDateRange.end ?? ""}
          />
        </label>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="space-y-1">
          <span className="text-[10px] font-medium uppercase text-slate-500">
            Permit Type
          </span>
          <select
            aria-label="Select permit type"
            className={controlClassName}
            onChange={(event) =>
              temporalState.setPermitType(normalizeSelectValue(event.target.value))
            }
            value={temporalState.selectedPermitType ?? "all"}
          >
            <option value="all">All types</option>
            {temporalState.permitTypes.map((permitType) => (
              <option key={permitType} value={permitType}>
                {permitType}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <span className="text-[10px] font-medium uppercase text-slate-500">
            Work Type
          </span>
          <select
            aria-label="Select work type"
            className={controlClassName}
            onChange={(event) =>
              temporalState.setWorkType(normalizeSelectValue(event.target.value))
            }
            value={temporalState.selectedWorkType ?? "all"}
          >
            <option value="all">All work</option>
            {temporalState.workTypes.map((workType) => (
              <option key={workType} value={workType}>
                {workType}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="space-y-1">
          <span className="text-[10px] font-medium uppercase text-slate-500">
            Jurisdiction
          </span>
          <select
            aria-label="Select zoning jurisdiction"
            className={controlClassName}
            onChange={(event) =>
              temporalState.setZoningJurisdiction(
                normalizeSelectValue(event.target.value),
              )
            }
            value={temporalState.selectedZoningJurisdiction ?? "all"}
          >
            <option value="all">All jurisdictions</option>
            {temporalState.zoningJurisdictions.map((jurisdiction) => (
              <option key={jurisdiction} value={jurisdiction}>
                {jurisdiction}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <span className="text-[10px] font-medium uppercase text-slate-500">
            Activity Class
          </span>
          <select
            aria-label="Select activity class"
            className={controlClassName}
            onChange={(event) =>
              temporalState.setActivityClass(
                normalizeSelectValue(event.target.value),
              )
            }
            value={temporalState.selectedActivityClass ?? "all"}
          >
            <option value="all">All classes</option>
            {temporalState.activityClasses.map((activityClass) => (
              <option
                key={activityClass.className}
                value={activityClass.className}
              >
                {activityClass.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </section>
  );
}
