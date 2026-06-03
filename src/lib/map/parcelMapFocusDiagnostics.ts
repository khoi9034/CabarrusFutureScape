const MAP_FOCUS_DEBUG_ENABLED =
  process.env.NEXT_PUBLIC_CFS_MAP_FOCUS_DEBUG !== "false";

declare global {
  interface Window {
    __cfsParcelMapFocusDiagnostics?: Array<{
      detail: Record<string, unknown>;
      stage: string;
      timestamp: string;
    }>;
  }
}

export function logParcelMapFocusDiagnostic(
  stage: string,
  detail: Record<string, unknown> = {},
) {
  if (!MAP_FOCUS_DEBUG_ENABLED || typeof console === "undefined") {
    return;
  }

  if (typeof window !== "undefined") {
    const diagnostics = window.__cfsParcelMapFocusDiagnostics ?? [];
    window.__cfsParcelMapFocusDiagnostics = [
      ...diagnostics,
      {
        detail,
        stage,
        timestamp: new Date().toISOString(),
      },
    ].slice(-120);
  }

  console.debug("[CFS parcel map focus]", stage, detail);
}
