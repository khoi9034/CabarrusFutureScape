"use client";

import { useCallback, useMemo, useState } from "react";
import {
  defaultDashboardViewMode,
  getWorkspacePresetById,
} from "@/lib/dashboard/workspacePresets";
import type { DashboardViewMode } from "@/types/workspace";

export function useWorkspaceState() {
  const [viewMode, setViewMode] = useState<DashboardViewMode>(
    defaultDashboardViewMode,
  );

  const activeWorkspacePreset = useMemo(
    () => getWorkspacePresetById(viewMode),
    [viewMode],
  );

  const setDashboardViewMode = useCallback((nextViewMode: DashboardViewMode) => {
    setViewMode(nextViewMode);
  }, []);

  return {
    activeWorkspacePreset,
    setDashboardViewMode,
    viewMode,
  };
}
