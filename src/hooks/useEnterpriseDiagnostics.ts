"use client";

import { useEffect, useState } from "react";
import {
  CFS_API_BASE_URL,
  getApiErrorDisplayMessage,
  USE_BACKEND_API,
} from "@/lib/api/client";
import {
  getDevelopmentPredictionFeaturesSummary,
  getDevelopmentStatistics,
} from "@/lib/api/development";
import {
  getFloodSummary,
  getSchoolConstraintStatistics,
} from "@/lib/api/constraints";
import {
  getApiDatabaseHealth,
  getApiHealth,
  getApiRootStatus,
} from "@/lib/api/health";

export type EnterpriseDiagnosticStatus =
  | "checking"
  | "degraded"
  | "ok"
  | "unavailable";

export interface EnterpriseDiagnosticCheck {
  detail: string;
  id: string;
  label: string;
  status: EnterpriseDiagnosticStatus;
}

interface EnterpriseDiagnosticsState {
  checks: EnterpriseDiagnosticCheck[];
  isLoading: boolean;
  lastCheckedAt: string | null;
}

const initialChecks: EnterpriseDiagnosticCheck[] = [
  {
    detail: USE_BACKEND_API ? CFS_API_BASE_URL : "Static mode",
    id: "api_mode",
    label: "API mode",
    status: USE_BACKEND_API ? "ok" : "degraded",
  },
  {
    detail: "Waiting for local backend response",
    id: "service_root",
    label: "FastAPI root",
    status: "checking",
  },
  {
    detail: "Waiting for health check",
    id: "health",
    label: "Service health",
    status: "checking",
  },
  {
    detail: "Waiting for database check",
    id: "database",
    label: "PostGIS health",
    status: "checking",
  },
  {
    detail: "Waiting for development aggregate",
    id: "development",
    label: "Development intelligence",
    status: "checking",
  },
  {
    detail: "Waiting for flood aggregate",
    id: "flood",
    label: "Flood constraints",
    status: "checking",
  },
  {
    detail: "Waiting for school aggregate",
    id: "schools",
    label: "School constraints",
    status: "checking",
  },
  {
    detail: "Waiting for model aggregate",
    id: "model_summary",
    label: "Model aggregate",
    status: "checking",
  },
];

export function useEnterpriseDiagnostics() {
  const [state, setState] = useState<EnterpriseDiagnosticsState>({
    checks: USE_BACKEND_API ? initialChecks : getStaticModeChecks(),
    isLoading: USE_BACKEND_API,
    lastCheckedAt: null,
  });

  useEffect(() => {
    if (!USE_BACKEND_API) {
      return;
    }

    const controller = new AbortController();
    const options = { signal: controller.signal, timeoutMs: 12000 };

    const checks = [
      {
        id: "service_root",
        label: "FastAPI root",
        run: async () => {
          const payload = await getApiRootStatus(options);
          return {
            detail: `${payload.service ?? "CFS API"} ${payload.version ?? ""}`.trim(),
            status: payload.status === "ok" ? "ok" : "degraded",
          };
        },
      },
      {
        id: "health",
        label: "Service health",
        run: async () => {
          const payload = await getApiHealth(options);
          return {
            detail: payload.status === "ok" ? "Service reports ok" : "Unexpected health response",
            status: payload.status === "ok" ? "ok" : "degraded",
          };
        },
      },
      {
        id: "database",
        label: "PostGIS health",
        run: async () => {
          const payload = await getApiDatabaseHealth(options);
          return {
            detail:
              payload.database === "connected"
                ? "Database connected"
                : "Unexpected database health response",
            status: payload.database === "connected" ? "ok" : "degraded",
          };
        },
      },
      {
        id: "development",
        label: "Development intelligence",
        run: async () => {
          await getDevelopmentStatistics({}, options);
          return {
            detail: "Aggregate endpoint available",
            status: "ok",
          };
        },
      },
      {
        id: "flood",
        label: "Flood constraints",
        run: async () => {
          await getFloodSummary({}, options);
          return {
            detail: "Aggregate endpoint available",
            status: "ok",
          };
        },
      },
      {
        id: "schools",
        label: "School constraints",
        run: async () => {
          await getSchoolConstraintStatistics({}, options);
          return {
            detail: "Aggregate endpoint available",
            status: "ok",
          };
        },
      },
      {
        id: "model_summary",
        label: "Model aggregate",
        run: async () => {
          const payload = await getDevelopmentPredictionFeaturesSummary(options);
          const safeFlags =
            payload.model_active === false &&
            payload.prediction_probability_available === false &&
            payload.production_ready === false;

          return {
            detail: safeFlags
              ? "Aggregate only; prediction flags remain disabled"
              : "Review prediction guardrail flags",
            status: safeFlags ? "ok" : "degraded",
          };
        },
      },
    ] as const;

    Promise.allSettled(checks.map((check) => check.run())).then((results) => {
      if (controller.signal.aborted) {
        return;
      }

      const resolvedChecks: EnterpriseDiagnosticCheck[] = [
        initialChecks[0],
        ...checks.map((check, index) => {
          const result = results[index];

          if (result.status === "fulfilled") {
            return {
              detail: result.value.detail,
              id: check.id,
              label: check.label,
              status: result.value.status as EnterpriseDiagnosticStatus,
            };
          }

          return {
            detail: getApiErrorDisplayMessage(
              result.reason,
              `${check.label} is unavailable.`,
            ),
            id: check.id,
            label: check.label,
            status: "unavailable" as const,
          };
        }),
      ];

      setState({
        checks: resolvedChecks,
        isLoading: false,
        lastCheckedAt: new Date().toISOString(),
      });
    });

    return () => controller.abort();
  }, []);

  return state;
}

function getStaticModeChecks() {
  return initialChecks.map((check) =>
    check.id === "api_mode"
      ? check
      : {
          ...check,
          detail:
            "Backend API mode is disabled; live CFS services are not being queried.",
          status: "degraded" as const,
        },
  );
}
