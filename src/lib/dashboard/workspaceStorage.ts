import { getDefaultWorkspacePreset } from "@/lib/dashboard/workspacePresets";
import type {
  DashboardViewMode,
  WorkspaceLayoutPreset,
} from "@/types/workspace";

const workspaceStorageKey = "cfs.workspace.presets";

export interface SavedWorkspaceRecord {
  id: string;
  name: string;
  preset: WorkspaceLayoutPreset;
  updatedAt: string;
  viewMode: DashboardViewMode;
}

// Phase 1 keeps saved workspaces local and optional. These helpers define the
// client-side persistence shape so future backend persistence can replace this
// module without changing dashboard components.
export function getDefaultWorkspaceRecord(): SavedWorkspaceRecord {
  const preset = getDefaultWorkspacePreset();

  return {
    id: "default",
    name: preset.label,
    preset,
    updatedAt: new Date(0).toISOString(),
    viewMode: preset.id,
  };
}

export function listRecentWorkspaces() {
  if (!canUseLocalStorage()) {
    return [getDefaultWorkspaceRecord()];
  }

  const records = readSavedWorkspaceRecords();

  return records.length ? records : [getDefaultWorkspaceRecord()];
}

export function saveWorkspace(record: SavedWorkspaceRecord) {
  if (!canUseLocalStorage()) {
    return;
  }

  const records = readSavedWorkspaceRecords().filter(
    (item) => item.id !== record.id,
  );

  window.localStorage.setItem(
    workspaceStorageKey,
    JSON.stringify([record, ...records].slice(0, 8)),
  );
}

export function restoreWorkspace(workspaceId: string) {
  return listRecentWorkspaces().find((workspace) => workspace.id === workspaceId);
}

function readSavedWorkspaceRecords(): SavedWorkspaceRecord[] {
  try {
    const rawValue = window.localStorage.getItem(workspaceStorageKey);

    if (!rawValue) {
      return [];
    }

    const parsedValue = JSON.parse(rawValue);

    return Array.isArray(parsedValue)
      ? parsedValue.filter(isSavedWorkspaceRecord)
      : [];
  } catch {
    return [];
  }
}

function isSavedWorkspaceRecord(value: unknown): value is SavedWorkspaceRecord {
  return Boolean(
    value &&
      typeof value === "object" &&
      "id" in value &&
      "name" in value &&
      "preset" in value &&
      "viewMode" in value,
  );
}

function canUseLocalStorage() {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}
