"use client";

import { RefreshCw, RotateCcw } from "lucide-react";
import type { BackendAvailabilityController } from "@/hooks/useBackendAvailability";
import { CFS_RUNTIME_MODE } from "@/lib/api/client";
import { cn } from "@/lib/utils";

export function BackendRecoveryPanel({
  compact = false,
  controller,
}: {
  compact?: boolean;
  controller: BackendAvailabilityController;
}) {
  const { canRestart, notice, restart, restarting, status, tryAgain } = controller;
  if (status === "healthy" && !notice) return null;

  const starting = status === "starting";
  const reconnected = status === "healthy" && Boolean(notice);
  const title = notice ?? (starting
    ? restarting ? "Restarting CFS service..." : "Checking live data connection..."
    : "Live data connection unavailable");
  const message = reconnected
    ? "Current intelligence has been refreshed."
    : CFS_RUNTIME_MODE === "enterprise"
      ? "Live data service unavailable. Please try again shortly."
      : starting
        ? "CFS is checking the local intelligence service."
        : "CFS Management cannot currently reach the local intelligence service.";

  return (
    <section
      aria-live="polite"
      className={cn(
        "rounded-xl border px-5 py-4",
        reconnected
          ? "border-[#55d38f]/30 bg-[#55d38f]/10"
          : "border-amber-300/25 bg-amber-300/[0.07]",
        !compact && "mx-auto w-full max-w-3xl py-8 text-center",
      )}
      data-testid="backend-recovery"
      role="status"
    >
      <p className="text-sm font-semibold uppercase tracking-[0.12em] text-white">
        {title}
      </p>
      <p className={cn("mt-2 text-sm text-slate-300", !compact && "mx-auto max-w-xl")}>{message}</p>
      {status === "unavailable" ? (
        <div className={cn("mt-4 flex flex-wrap gap-2", !compact && "justify-center")}>
          {canRestart ? (
            <button className="inline-flex items-center gap-2 rounded-lg bg-[#82c9d8] px-3.5 py-2 text-sm font-semibold text-slate-950" onClick={() => void restart()} type="button">
              <RotateCcw className="h-4 w-4" /> Restart backend
            </button>
          ) : null}
          <button className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-3.5 py-2 text-sm font-semibold text-white" onClick={() => void tryAgain()} type="button">
            <RefreshCw className="h-4 w-4" /> Try again
          </button>
        </div>
      ) : null}
      {!notice && status !== "healthy" ? <p className="mt-3 text-xs text-slate-400">Live planning intelligence will return when the CFS service reconnects.</p> : null}
    </section>
  );
}
