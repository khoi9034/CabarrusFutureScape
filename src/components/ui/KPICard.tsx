import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface KPICardProps {
  label: string;
  value: string;
  delta: string;
  status: "positive" | "watch" | "critical" | "neutral";
  accent: string;
  icon: LucideIcon;
  trend: number[];
}

const statusStyles = {
  positive: "text-emerald-300",
  watch: "text-amber-200",
  critical: "text-rose-300",
  neutral: "text-sky-200",
};

export function KPICard({
  label,
  value,
  delta,
  status,
  accent,
  icon: Icon,
  trend,
}: KPICardProps) {
  const maxTrend = Math.max(...trend, 1);

  return (
    <article
      className="min-w-[184px] rounded-lg border border-white/10 bg-white/[0.045] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
      title={`${label}: ${value}, ${delta}`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-md border border-white/10 bg-black/20">
          <Icon className="h-4 w-4" style={{ color: accent }} />
        </div>
        <span className={cn("text-xs font-medium", statusStyles[status])}>
          {delta}
        </span>
      </div>
      <div className="mt-3">
        <p className="text-[11px] font-medium uppercase text-slate-400">
          {label}
        </p>
        <p className="mt-1 text-2xl font-semibold text-white">{value}</p>
      </div>
      <div className="mt-3 flex h-8 items-end gap-1">
        {trend.map((point, index) => (
          <span
            className="flex-1 rounded-t-sm bg-white/10"
            key={`${label}-${index}`}
            style={{
              height: `${Math.max(18, (point / maxTrend) * 100)}%`,
              background:
                index === trend.length - 1
                  ? accent
                  : `linear-gradient(180deg, ${accent}66, rgba(255,255,255,0.08))`,
            }}
          />
        ))}
      </div>
    </article>
  );
}
