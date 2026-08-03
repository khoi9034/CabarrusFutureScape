"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IS_DEMO_MODE } from "@/lib/api/client";
import {
  planningSnapshotCreateInput,
  planningSnapshotFromRecord,
  planningSnapshotUpdateInput,
} from "@/lib/product/planningSnapshotMapper";
import {
  getPlanningSnapshotRepository,
} from "@/lib/product/runtimeRepository";
import { toProductApiError } from "@/lib/product/apiClient";
import { useProductPrincipal } from "@/hooks/useProductPrincipal";
import type { PlanningSnapshotRecord } from "@/lib/product/types";
import type { PlanningSnapshot, PlanningSnapshotSectionKey } from "@/types";

export type PlanningSnapshotPersistenceStatus =
  | "archived"
  | "conflict"
  | "error"
  | "loading"
  | "permission_denied"
  | "ready"
  | "saved"
  | "saving"
  | "unavailable"
  | "unsaved";

export interface PlanningSnapshotPersistenceState {
  message: string;
  requestId: string | null;
  sessionOnly: boolean;
  status: PlanningSnapshotPersistenceStatus;
}

const LEGACY_KEYS = [
  "cfs.planningSnapshot.phase22a.latest",
  "cfs.planningSnapshots.phase22e.library",
];

export function usePlanningSnapshotLibrary() {
  const repository = useMemo(() => getPlanningSnapshotRepository(), []);
  const { can, status: principalStatus } = useProductPrincipal();
  const canWrite = IS_DEMO_MODE || can("planning:write");
  const [planningSnapshot, setPlanningSnapshot] =
    useState<PlanningSnapshot | null>(null);
  const [savedPlanningSnapshots, setSavedPlanningSnapshots] = useState<
    PlanningSnapshot[]
  >([]);
  const [activePlanningSnapshotId, setActivePlanningSnapshotId] = useState<
    string | null
  >(null);
  const [legacyNotice, setLegacyNotice] = useState<string | null>(null);
  const [reloadAttempt, setReloadAttempt] = useState(0);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [persistence, setPersistence] =
    useState<PlanningSnapshotPersistenceState>({
      message: IS_DEMO_MODE
        ? "Loading session-only Planning Snapshots."
        : "Loading Planning Snapshots from the Product V1 API.",
      requestId: null,
      sessionOnly: IS_DEMO_MODE,
      status: "loading",
    });
  const mutationInFlight = useRef(false);
  const localRevision = useRef(0);
  const pendingSave = useRef<PlanningSnapshot | null>(null);

  const setFailure = useCallback((caught: unknown, fallback: string) => {
    const error = toProductApiError(caught);
    if (error.kind === "cancelled") return;
    setPersistence({
      message: error.displayMessage || fallback,
      requestId: error.requestId,
      sessionOnly: IS_DEMO_MODE,
      status:
        error.kind === "conflict"
          ? "conflict"
          : error.kind === "forbidden" || error.kind === "unauthenticated"
            ? "permission_denied"
            : error.kind === "unavailable"
              ? "unavailable"
              : "error",
    });
  }, []);

  const listSnapshotRecords = useCallback(
    async (signal?: AbortSignal) => {
      const records: PlanningSnapshotRecord[] = [];
      let page = 1;
      let requestId: string | null = null;
      while (true) {
        const result = await repository.list({ page, pageSize: 100, signal });
        records.push(...result.data);
        requestId = result.requestId;
        if (!result.pagination || records.length >= result.pagination.total) break;
        page += 1;
      }
      return { records, requestId };
    },
    [repository],
  );

  useEffect(() => {
    if (repository.provider === "api" && principalStatus === "loading") return;
    const controller = new AbortController();
    const revisionAtStart = localRevision.current;
    void listSnapshotRecords(controller.signal)
      .then((result) => {
        if (
          controller.signal.aborted ||
          revisionAtStart !== localRevision.current
        ) return;
        const snapshots = result.records.map((record) =>
          planningSnapshotFromRecord(record),
        );
        setSavedPlanningSnapshots(snapshots);
        setPlanningSnapshot((current) => {
          const active = snapshots.find(
            (snapshot) => snapshot.snapshotId === current?.snapshotId,
          );
          return active ?? snapshots[0] ?? null;
        });
        setActivePlanningSnapshotId((current) =>
          snapshots.some((snapshot) => snapshot.snapshotId === current)
            ? current
            : (snapshots[0]?.snapshotId ?? null),
        );
        setHasUnsavedChanges(false);
        setPersistence({
          message: IS_DEMO_MODE
            ? "Planning Snapshots are stored for this browser session only."
            : "Planning Snapshot library is current.",
          requestId: result.requestId,
          sessionOnly: IS_DEMO_MODE,
          status: "ready",
        });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setFailure(error, "Planning Snapshot library could not be loaded.");
        }
      });
    return () => controller.abort();
  }, [listSnapshotRecords, principalStatus, reloadAttempt, repository, setFailure]);

  useEffect(() => {
    if (IS_DEMO_MODE || typeof window === "undefined") return;
    const timer = window.setTimeout(() => {
      const hasLegacySnapshots = LEGACY_KEYS.some((key) =>
        window.localStorage.getItem(key),
      );
      setLegacyNotice(
        hasLegacySnapshots
          ? "Older browser-only Planning Snapshots remain on this device. They were not uploaded or deleted."
          : null,
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const savePlanningSnapshot = useCallback(
    async (snapshot: PlanningSnapshot) => {
      if (!canWrite) {
        setPersistence({
          message: "Your role can view Planning Snapshots but cannot create them.",
          requestId: null,
          sessionOnly: IS_DEMO_MODE,
          status: "permission_denied",
        });
        return null;
      }
      if (mutationInFlight.current) return null;
      mutationInFlight.current = true;
      localRevision.current += 1;
      pendingSave.current = snapshot;
      setHasUnsavedChanges(true);
      setPersistence({
        message: "Saving Planning Snapshot…",
        requestId: null,
        sessionOnly: IS_DEMO_MODE,
        status: "saving",
      });
      try {
        const result = await repository.create(planningSnapshotCreateInput(snapshot));
        const saved = planningSnapshotFromRecord(result.data, snapshot);
        pendingSave.current = null;
        setHasUnsavedChanges(false);
        setSavedPlanningSnapshots((current) => [
          saved,
          ...current.filter((item) => item.snapshotId !== saved.snapshotId),
        ]);
        setPlanningSnapshot(saved);
        setActivePlanningSnapshotId(saved.snapshotId);
        setPersistence({
          message: IS_DEMO_MODE
            ? "Planning Snapshot saved for this browser session."
            : "Planning Snapshot saved to the Product V1 API.",
          requestId: result.requestId,
          sessionOnly: IS_DEMO_MODE,
          status: "saved",
        });
        return saved;
      } catch (error) {
        setFailure(error, "Planning Snapshot could not be saved.");
        return null;
      } finally {
        mutationInFlight.current = false;
      }
    },
    [canWrite, repository, setFailure],
  );

  const savePlanningSnapshotChanges = useCallback(async () => {
    if (!planningSnapshot || !canWrite || mutationInFlight.current) {
      if (!canWrite) {
        setPersistence({
          message: "Your role cannot update Planning Snapshots.",
          requestId: null,
          sessionOnly: IS_DEMO_MODE,
          status: "permission_denied",
        });
      }
      return null;
    }
    mutationInFlight.current = true;
    localRevision.current += 1;
    pendingSave.current = planningSnapshot;
    setHasUnsavedChanges(true);
    setPersistence({
      message: "Saving Planning Snapshot changes…",
      requestId: null,
      sessionOnly: IS_DEMO_MODE,
      status: "saving",
    });
    try {
      const result = await repository.update(
        planningSnapshot.snapshotId,
        planningSnapshotUpdateInput(planningSnapshot),
        { expectedUpdatedAt: planningSnapshot.updatedAt },
      );
      const saved = planningSnapshotFromRecord(result.data, planningSnapshot);
      pendingSave.current = null;
      setHasUnsavedChanges(false);
      setPlanningSnapshot(saved);
      setSavedPlanningSnapshots((current) =>
        current.map((item) =>
          item.snapshotId === saved.snapshotId ? saved : item,
        ),
      );
      setPersistence({
        message: "Planning Snapshot changes saved.",
        requestId: result.requestId,
        sessionOnly: IS_DEMO_MODE,
        status: "saved",
      });
      return saved;
    } catch (error) {
      setFailure(error, "Planning Snapshot changes could not be saved.");
      return null;
    } finally {
      mutationInFlight.current = false;
    }
  }, [canWrite, planningSnapshot, repository, setFailure]);

  const setActivePlanningSnapshot = useCallback(
    (snapshotId: string) => {
      if (hasUnsavedChanges && snapshotId === activePlanningSnapshotId) {
        setPersistence((current) => ({
          ...current,
          message:
            "This Planning Snapshot is already open. Its unsaved changes remain in the form.",
          status: "unsaved",
        }));
        return;
      }
      if (hasUnsavedChanges && snapshotId !== activePlanningSnapshotId) {
        setPersistence((current) => ({
          ...current,
          message: "Save or retry the current unsaved changes before opening another snapshot.",
        }));
        return;
      }
      const selected = savedPlanningSnapshots.find(
        (snapshot) => snapshot.snapshotId === snapshotId,
      );
      if (!selected) return;
      setPlanningSnapshot(selected);
      setActivePlanningSnapshotId(snapshotId);
      setHasUnsavedChanges(false);
      setPersistence((current) => ({
        ...current,
        message: "Planning Snapshot opened from the library.",
        status: "ready",
      }));
    },
    [activePlanningSnapshotId, hasUnsavedChanges, savedPlanningSnapshots],
  );

  const updateActive = useCallback(
    (updater: (snapshot: PlanningSnapshot) => PlanningSnapshot) => {
      setPlanningSnapshot((current) => {
        if (!current) return current;
        const updated = updater(current);
        localRevision.current += 1;
        if (pendingSave.current?.snapshotId === updated.snapshotId) {
          pendingSave.current = updated;
        }
        setSavedPlanningSnapshots((snapshots) =>
          snapshots.map((snapshot) =>
            snapshot.snapshotId === updated.snapshotId ? updated : snapshot,
          ),
        );
        return updated;
      });
      setPersistence((current) => ({
        ...current,
        message:
          current.status === "conflict"
            ? "Conflict detected. Your newer edits remain in the form; review the latest server metadata before saving."
            : "Planning Snapshot has unsaved changes.",
        status: current.status === "conflict" ? "conflict" : "unsaved",
      }));
      setHasUnsavedChanges(true);
    },
    [],
  );

  const renamePlanningSnapshot = useCallback(
    (snapshotId: string, title: string) => {
      const safeTitle = title.trim().slice(0, 240);
      if (!safeTitle || snapshotId !== activePlanningSnapshotId) return;
      updateActive((snapshot) => ({ ...snapshot, snapshotTitle: safeTitle }));
    },
    [activePlanningSnapshotId, updateActive],
  );

  const setPlanningSnapshotNotes = useCallback(
    (notes: string) => updateActive((snapshot) => ({ ...snapshot, notes })),
    [updateActive],
  );

  const setPlanningSnapshotSectionIncluded = useCallback(
    (sectionKey: PlanningSnapshotSectionKey, included: boolean) =>
      updateActive((snapshot) => ({
        ...snapshot,
        includedSections: {
          ...snapshot.includedSections,
          [sectionKey]: included,
        },
      })),
    [updateActive],
  );

  const createPlanningSnapshotVersion = useCallback(async () => {
    if (
      !planningSnapshot ||
      hasUnsavedChanges ||
      !canWrite ||
      mutationInFlight.current
    ) return null;
    mutationInFlight.current = true;
    localRevision.current += 1;
    setPersistence({
      message: "Creating Planning Snapshot version…",
      requestId: null,
      sessionOnly: IS_DEMO_MODE,
      status: "saving",
    });
    try {
      const result = await repository.version(
        planningSnapshot.snapshotId,
        planningSnapshot.notes ?? null,
      );
      const versioned = planningSnapshotFromRecord(result.data, planningSnapshot);
      setPlanningSnapshot(versioned);
      setSavedPlanningSnapshots((current) =>
        current.map((item) =>
          item.snapshotId === versioned.snapshotId ? versioned : item,
        ),
      );
      setPersistence({
        message: `Planning Snapshot version ${versioned.currentVersion ?? 1} created.`,
        requestId: result.requestId,
        sessionOnly: IS_DEMO_MODE,
        status: "saved",
      });
      return versioned;
    } catch (error) {
      setFailure(error, "Planning Snapshot version could not be created.");
      return null;
    } finally {
      mutationInFlight.current = false;
    }
  }, [canWrite, hasUnsavedChanges, planningSnapshot, repository, setFailure]);

  const deletePlanningSnapshot = useCallback(
    async (snapshotId: string) => {
      if (!canWrite || mutationInFlight.current) return false;
      mutationInFlight.current = true;
      localRevision.current += 1;
      setPersistence({
        message: "Archiving Planning Snapshot…",
        requestId: null,
        sessionOnly: IS_DEMO_MODE,
        status: "saving",
      });
      try {
        const result = await repository.archive(snapshotId);
        const remaining = savedPlanningSnapshots.filter(
          (snapshot) => snapshot.snapshotId !== snapshotId,
        );
        const next = remaining[0] ?? null;
        setSavedPlanningSnapshots(remaining);
        setPlanningSnapshot((current) =>
          current?.snapshotId === snapshotId ? next : current,
        );
        setActivePlanningSnapshotId((current) =>
          current === snapshotId ? (next?.snapshotId ?? null) : current,
        );
        if (snapshotId === activePlanningSnapshotId) setHasUnsavedChanges(false);
        setPersistence({
          message: "Planning Snapshot archived.",
          requestId: result.requestId,
          sessionOnly: IS_DEMO_MODE,
          status: "archived",
        });
        return true;
      } catch (error) {
        setFailure(error, "Planning Snapshot could not be archived.");
        return false;
      } finally {
        mutationInFlight.current = false;
      }
    },
    [activePlanningSnapshotId, canWrite, repository, savedPlanningSnapshots, setFailure],
  );

  const clearPlanningSnapshot = useCallback(async () => {
    if (activePlanningSnapshotId) {
      await deletePlanningSnapshot(activePlanningSnapshotId);
    } else {
      setPlanningSnapshot(null);
    }
  }, [activePlanningSnapshotId, deletePlanningSnapshot]);

  const reloadPlanningSnapshots = useCallback(
    () => {
      if (hasUnsavedChanges) {
        setPersistence((current) => ({
          ...current,
          message: "Unsaved changes remain in the form. Save or retry them before reloading the library.",
        }));
        return;
      }
      setPersistence((current) => ({
        ...current,
        message: "Loading Planning Snapshots.",
        status: "loading",
      }));
      setReloadAttempt((current) => current + 1);
    },
    [hasUnsavedChanges],
  );

  const retryPlanningSnapshotSave = useCallback(async () => {
    const pending = pendingSave.current;
    if (pending?.updatedAt) {
      if (!canWrite || mutationInFlight.current) return null;
      mutationInFlight.current = true;
      setPersistence({
        message: "Loading the latest Planning Snapshot metadata...",
        requestId: null,
        sessionOnly: IS_DEMO_MODE,
        status: "saving",
      });
      try {
        const latest = await repository.get(pending.snapshotId);
        const retained = {
          ...pending,
          currentVersion: latest.data.current_version,
          updatedAt: latest.data.updated_at,
        };
        pendingSave.current = retained;
        setPlanningSnapshot(retained);
        setSavedPlanningSnapshots((current) =>
          current.map((snapshot) =>
            snapshot.snapshotId === retained.snapshotId ? retained : snapshot,
          ),
        );
        setHasUnsavedChanges(true);
        setPersistence({
          message: "Latest server metadata loaded. Your unsaved title, notes, and sections remain in the form; review them, then choose Save Changes.",
          requestId: latest.requestId,
          sessionOnly: IS_DEMO_MODE,
          status: "unsaved",
        });
        return null;
      } catch (error) {
        setFailure(error, "Latest Planning Snapshot metadata could not be loaded.");
        return null;
      } finally {
        mutationInFlight.current = false;
      }
    }
    if (pending) {
      if (!canWrite || mutationInFlight.current) return null;
      mutationInFlight.current = true;
      setPersistence({
        message: "Checking whether the Planning Snapshot was already saved...",
        requestId: null,
        sessionOnly: IS_DEMO_MODE,
        status: "saving",
      });
      let createAfterCheck = false;
      try {
        const listed = await listSnapshotRecords();
        const recoveredRecord = listed.records.find(
          (record) => record.payload.client_snapshot_id === pending.snapshotId,
        );
        if (recoveredRecord) {
          const recovered = planningSnapshotFromRecord(recoveredRecord, pending);
          pendingSave.current = null;
          setPlanningSnapshot(recovered);
          setSavedPlanningSnapshots((current) => [
            recovered,
            ...current.filter((snapshot) => snapshot.snapshotId !== recovered.snapshotId),
          ]);
          setActivePlanningSnapshotId(recovered.snapshotId);
          setHasUnsavedChanges(false);
          setPersistence({
            message: "Planning Snapshot save confirmed.",
            requestId: listed.requestId,
            sessionOnly: IS_DEMO_MODE,
            status: "saved",
          });
          return recovered;
        }
        createAfterCheck = true;
      } catch (error) {
        setFailure(error, "The Planning Snapshot save could not be verified before retrying.");
        return null;
      } finally {
        mutationInFlight.current = false;
      }
      if (createAfterCheck) return savePlanningSnapshot(pending);
    }
    reloadPlanningSnapshots();
    return null;
  }, [canWrite, listSnapshotRecords, reloadPlanningSnapshots, repository, savePlanningSnapshot, setFailure]);

  return {
    activePlanningSnapshotId,
    clearPlanningSnapshot,
    clearPlanningSnapshots: reloadPlanningSnapshots,
    createPlanningSnapshotVersion,
    deletePlanningSnapshot,
    planningSnapshot,
    planningSnapshotCanWrite: canWrite,
    planningSnapshotHasUnsavedChanges: hasUnsavedChanges,
    planningSnapshotLegacyNotice: legacyNotice,
    planningSnapshotPersistence: persistence,
    reloadActivePlanningSnapshot: reloadPlanningSnapshots,
    reloadPlanningSnapshots,
    renamePlanningSnapshot,
    retryPlanningSnapshotSave,
    savePlanningSnapshot,
    savePlanningSnapshotChanges,
    savedPlanningSnapshots,
    setActivePlanningSnapshot,
    setPlanningSnapshotNotes,
    setPlanningSnapshotSectionIncluded,
  };
}
