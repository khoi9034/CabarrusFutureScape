"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CFS_RUNTIME_MODE,
  USE_BACKEND_API,
  USE_DEMO_DATA,
} from "@/lib/api/client";
import { getApiReady } from "@/lib/api/health";

export type BackendConnectionStatus = "healthy" | "starting" | "unavailable";

export interface BackendAvailabilityController {
  canRestart: boolean;
  notice: string | null;
  refreshKey: number;
  restart: () => Promise<void>;
  restarting: boolean;
  status: BackendConnectionStatus;
  tryAgain: () => Promise<void>;
}

const checksBackend = USE_BACKEND_API && !USE_DEMO_DATA;
const restartTimeoutMs = 90_000;

export function useBackendAvailability(): BackendAvailabilityController {
  const [status, setStatus] = useState<BackendConnectionStatus>(
    checksBackend ? "starting" : "healthy",
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [restarting, setRestarting] = useState(false);
  const statusRef = useRef(status);
  const recoveryInProgress = useRef(false);

  const updateStatus = useCallback((next: BackendConnectionStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  const probe = useCallback(async () => {
    try {
      const ready = await getApiReady({ timeoutMs: 4_000 });
      return ready.status === "ready";
    } catch {
      return false;
    }
  }, []);

  const reconnect = useCallback(() => {
    const changed = statusRef.current !== "healthy";
    updateStatus("healthy");
    if (changed) setRefreshKey((value) => value + 1);
  }, [updateStatus]);

  const tryAgain = useCallback(async () => {
    if (!checksBackend || recoveryInProgress.current) return;
    recoveryInProgress.current = true;
    setNotice(null);
    updateStatus("starting");
    if (await probe()) {
      reconnect();
      setNotice("Live data reconnected.");
    } else {
      updateStatus("unavailable");
    }
    recoveryInProgress.current = false;
  }, [probe, reconnect, updateStatus]);

  const restart = useCallback(async () => {
    if (CFS_RUNTIME_MODE !== "local" || recoveryInProgress.current) return;
    recoveryInProgress.current = true;
    setRestarting(true);
    setNotice(null);
    updateStatus("starting");

    try {
      const response = await fetch("/api/local/restart-backend", {
        method: "POST",
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) throw new Error("Local recovery request was rejected.");

      const deadline = Date.now() + restartTimeoutMs;
      while (Date.now() < deadline) {
        await new Promise((resolve) => window.setTimeout(resolve, 1_000));
        if (await probe()) {
          reconnect();
          setNotice("Live data reconnected.");
          return;
        }
      }
      throw new Error("Local recovery timed out.");
    } catch (error) {
      console.warn("CFS local backend recovery failed.", error);
      updateStatus("unavailable");
      setNotice("Unable to restart the CFS service.");
    } finally {
      recoveryInProgress.current = false;
      setRestarting(false);
    }
  }, [probe, reconnect, updateStatus]);

  useEffect(() => {
    if (!checksBackend) return;

    let active = true;
    const refresh = async () => {
      if (!active || recoveryInProgress.current) return;
      if (await probe()) reconnect();
      else updateStatus("unavailable");
    };
    void refresh();
    const timer = window.setInterval(refresh, 10_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [probe, reconnect, updateStatus]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 5_000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  return {
    canRestart: CFS_RUNTIME_MODE === "local" && checksBackend,
    notice,
    refreshKey,
    restart,
    restarting,
    status,
    tryAgain,
  };
}
