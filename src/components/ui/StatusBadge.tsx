import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  icon: LucideIcon;
  label: string;
  tone: "gold" | "green" | "blue" | "red";
}

const toneStyles = {
  gold: "border-[#d8b86a]/30 bg-[#d8b86a]/10 text-[#f0cd79]",
  green: "border-emerald-400/25 bg-emerald-400/10 text-emerald-200",
  blue: "border-sky-300/25 bg-sky-300/10 text-sky-200",
  red: "border-rose-300/25 bg-rose-400/10 text-rose-200",
};

export function StatusBadge({ icon: Icon, label, tone }: StatusBadgeProps) {
  return (
    <div
      className={cn(
        "flex h-10 max-w-full items-center gap-2 rounded-lg border px-3 text-xs font-medium",
        toneStyles[tone],
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{label}</span>
    </div>
  );
}
