"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { IS_DEMO_MODE } from "@/lib/api/client";
import { useProductPrincipal } from "@/hooks/useProductPrincipal";
import { toProductApiError } from "@/lib/product/apiClient";
import { toJsonObject } from "@/lib/product/json";
import { getReportRepository } from "@/lib/product/runtimeRepository";
import type { ReportRecord } from "@/lib/product/types";
import type { PlanningSnapshotSectionKey } from "@/types";

export type PlanningReportSectionKey =
  | "countywide_indicators"
  | "key_findings"
  | "legend_map_notes"
  | PlanningSnapshotSectionKey;

export interface PlanningSnapshotReportDraft {
  clientDraftId?: string;
  createdAt: string;
  draftId: string;
  draftName: string;
  explainNumbers: boolean;
  reportNotes?: string;
  reportTitle: string;
  selectedSections: Record<PlanningReportSectionKey, boolean>;
  sourceSnapshotId: string;
  updatedAt: string;
}

export type PlanningReportDraftStatus =
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

export interface PlanningReportDraftPersistence {
  message: string;
  requestId: string | null;
  sessionOnly: boolean;
  status: PlanningReportDraftStatus;
}

const REPORT_TYPE = "planning_snapshot_draft";
const LEGACY_STORAGE_KEY = "cfs.planningSnapshot.reportDrafts.v1";
const SECTION_KEYS: PlanningReportSectionKey[] = [
  "countywide_indicators",
  "data_needed_caveats",
  "development_permits",
  "fema_flood",
  "key_findings",
  "legend_map_notes",
  "map_view",
  "model_governance",
  "new_construction",
  "parcel_facts",
  "recommended_actions",
  "schools",
  "transportation",
  "utility_proxy",
  "zoning_planning",
];

type PendingMutation =
  | { draft: PlanningSnapshotReportDraft; kind: "create" | "rename" | "update" }
  | { draftId: string; kind: "archive" };

export function usePlanningReportDrafts() {
  const repository = useMemo(() => getReportRepository(), []);
  const { can, status: principalStatus } = useProductPrincipal();
  const canWrite = IS_DEMO_MODE || can("reports:write");
  const [drafts, setDrafts] = useState<PlanningSnapshotReportDraft[]>([]);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [legacyNotice, setLegacyNotice] = useState<string | null>(null);
  const [reloadAttempt, setReloadAttempt] = useState(0);
  const [persistence, setPersistence] =
    useState<PlanningReportDraftPersistence>({
      message: IS_DEMO_MODE
        ? "Loading session-only report drafts."
        : "Loading report drafts from Product V1.",
      requestId: null,
      sessionOnly: IS_DEMO_MODE,
      status: "loading",
    });
  const mutationInFlight = useRef(false);
  const pendingMutation = useRef<PendingMutation | null>(null);

  const fail = useCallback((caught: unknown, fallback: string) => {
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

  const load = useCallback(
    async (signal?: AbortSignal) => {
      const records: ReportRecord[] = [];
      let page = 1;
      let requestId: string | null = null;
      while (true) {
        const result = await repository.list({
          page,
          pageSize: 100,
          signal,
          status: "Draft",
        });
        requestId = result.requestId;
        records.push(...result.data);
        if (!result.pagination || records.length >= result.pagination.total) break;
        page += 1;
      }
      const reportDrafts = records
        .filter((record) => record.report_type === REPORT_TYPE)
        .map(reportDraftFromRecord)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
      setDrafts(reportDrafts);
      setActiveDraftId((current) =>
        reportDrafts.some((draft) => draft.draftId === current)
          ? current
          : null,
      );
      setPersistence({
        message: IS_DEMO_MODE
          ? "Report drafts are stored for this browser session only."
          : "Report draft library is current.",
        requestId,
        sessionOnly: IS_DEMO_MODE,
        status: "ready",
      });
      return reportDrafts;
    },
    [repository],
  );

  useEffect(() => {
    if (repository.provider === "api" && principalStatus === "loading") return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void load(controller.signal).catch((error: unknown) => {
        if (!controller.signal.aborted) {
          fail(error, "Report draft library could not be loaded.");
        }
      });
    }, 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [fail, load, principalStatus, reloadAttempt, repository.provider]);

  useEffect(() => {
    if (IS_DEMO_MODE || typeof window === "undefined") return;
    const timer = window.setTimeout(() => {
      setLegacyNotice(
        window.localStorage.getItem(LEGACY_STORAGE_KEY)
          ? "Older browser-only report drafts remain on this device. They were not uploaded or deleted."
          : null,
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const ensureWrite = useCallback(() => {
    if (canWrite) return true;
    setPersistence({
      message: "Your role can view report drafts but cannot change them.",
      requestId: null,
      sessionOnly: IS_DEMO_MODE,
      status: "permission_denied",
    });
    return false;
  }, [canWrite]);

  const createDraft = useCallback(
    async (draft: PlanningSnapshotReportDraft) => {
      if (!ensureWrite() || mutationInFlight.current) return null;
      mutationInFlight.current = true;
      pendingMutation.current = { draft, kind: "create" };
      setPersistence(saving("Creating report draft…"));
      try {
        const result = await repository.create(reportCreateInput(draft));
        const saved = reportDraftFromRecord(result.data);
        pendingMutation.current = null;
        setDrafts((current) => [
          saved,
          ...current.filter((item) => item.draftId !== saved.draftId),
        ]);
        setActiveDraftId(saved.draftId);
        setPersistence(savedState("Report draft created.", result.requestId));
        return saved;
      } catch (error) {
        fail(error, "Report draft could not be created.");
        return null;
      } finally {
        mutationInFlight.current = false;
      }
    },
    [ensureWrite, fail, repository],
  );

  const saveDraft = useCallback(
    async (draft: PlanningSnapshotReportDraft) => {
      if (!ensureWrite() || mutationInFlight.current) return null;
      mutationInFlight.current = true;
      pendingMutation.current = { draft, kind: "update" };
      setPersistence(saving("Saving report draft…"));
      try {
        const result = await repository.update(
          draft.draftId,
          reportUpdateInput(draft),
          { expectedUpdatedAt: draft.updatedAt },
        );
        const saved = reportDraftFromRecord(result.data);
        pendingMutation.current = null;
        replaceDraft(setDrafts, saved);
        setActiveDraftId(saved.draftId);
        setPersistence(savedState("Report draft saved.", result.requestId));
        return saved;
      } catch (error) {
        fail(error, "Report draft could not be saved.");
        return null;
      } finally {
        mutationInFlight.current = false;
      }
    },
    [ensureWrite, fail, repository],
  );

  const renameDraft = useCallback(
    async (draftId: string, name: string) => {
      const draft = drafts.find((candidate) => candidate.draftId === draftId);
      const safeName = name.trim().slice(0, 240);
      if (!draft || !safeName || !ensureWrite() || mutationInFlight.current) {
        return null;
      }
      const renamed = { ...draft, draftName: safeName };
      mutationInFlight.current = true;
      pendingMutation.current = { draft: renamed, kind: "rename" };
      setPersistence(saving("Renaming report draft…"));
      try {
        const result = await repository.update(
          draftId,
          { title: safeName },
          { expectedUpdatedAt: draft.updatedAt },
        );
        const saved = reportDraftFromRecord(result.data);
        pendingMutation.current = null;
        replaceDraft(setDrafts, saved);
        setPersistence(savedState("Report draft renamed.", result.requestId));
        return saved;
      } catch (error) {
        fail(error, "Report draft could not be renamed.");
        return null;
      } finally {
        mutationInFlight.current = false;
      }
    },
    [drafts, ensureWrite, fail, repository],
  );

  const archiveDraft = useCallback(
    async (draftId: string) => {
      if (!ensureWrite() || mutationInFlight.current) return false;
      mutationInFlight.current = true;
      pendingMutation.current = { draftId, kind: "archive" };
      setPersistence(saving("Archiving report draft…"));
      try {
        const result = await repository.archive(draftId);
        pendingMutation.current = null;
        setDrafts((current) =>
          current.filter((draft) => draft.draftId !== draftId),
        );
        setActiveDraftId((current) => (current === draftId ? null : current));
        setPersistence({
          message: "Report draft archived.",
          requestId: result.requestId,
          sessionOnly: IS_DEMO_MODE,
          status: "archived",
        });
        return true;
      } catch (error) {
        fail(error, "Report draft could not be archived.");
        return false;
      } finally {
        mutationInFlight.current = false;
      }
    },
    [ensureWrite, fail, repository],
  );

  const reload = useCallback(() => {
    setPersistence(saving("Reloading report drafts…", "loading"));
    setReloadAttempt((current) => current + 1);
  }, []);

  const retry = useCallback(async () => {
    const pending = pendingMutation.current;
    if (!pending) {
      reload();
      return null;
    }
    if (pending.kind === "create") {
      try {
        const current = await load();
        const recovered = current.find(
          (draft) =>
            draft.clientDraftId === pending.draft.clientDraftId,
        );
        if (recovered) {
          pendingMutation.current = null;
          setActiveDraftId(recovered.draftId);
          setPersistence(savedState("Report draft save confirmed.", null));
          return recovered;
        }
      } catch (error) {
        fail(
          error,
          "The report draft save could not be verified before retrying.",
        );
        return null;
      }
      return createDraft(pending.draft);
    }
    if (pending.kind === "archive") return archiveDraft(pending.draftId);
    if (!ensureWrite() || mutationInFlight.current) return null;
    mutationInFlight.current = true;
    setPersistence(saving("Loading the latest report draft metadata..."));
    try {
      const latest = await repository.get(pending.draft.draftId);
      const retained = {
        ...pending.draft,
        updatedAt: latest.data.updated_at,
      };
      pendingMutation.current = { ...pending, draft: retained };
      replaceDraft(setDrafts, retained);
      setActiveDraftId(retained.draftId);
      setPersistence({
        message:
          "Latest server metadata loaded. Your unsaved report edits remain in the form; review them, then choose Save Draft or Save Name.",
        requestId: latest.requestId,
        sessionOnly: IS_DEMO_MODE,
        status: "unsaved",
      });
      return null;
    } catch (error) {
      fail(error, "Latest report draft metadata could not be loaded.");
      return null;
    } finally {
      mutationInFlight.current = false;
    }
  }, [archiveDraft, createDraft, ensureWrite, fail, load, reload, repository]);

  const markUnsaved = useCallback(() => {
    setPersistence((current) => ({
      ...current,
      message: "Report draft has unsaved changes.",
      status: "unsaved",
    }));
  }, []);

  const selectDraft = useCallback((draftId: string) => {
    setActiveDraftId(draftId);
    setPersistence((current) => ({
      ...current,
      message: "Report draft loaded.",
      status: "ready",
    }));
  }, []);

  return {
    activeDraftId,
    archiveDraft,
    canWrite,
    createDraft,
    drafts,
    legacyNotice,
    markUnsaved,
    persistence,
    reload,
    renameDraft,
    retry,
    saveDraft,
    selectDraft,
  };
}

function reportDraftFromRecord(record: ReportRecord): PlanningSnapshotReportDraft {
  const selectedSections = record.payload.selected_sections;
  if (!isObject(selectedSections)) {
    throw new Error("Planning report draft sections are missing.");
  }
  const sections = Object.fromEntries(
    SECTION_KEYS.map((key) => [key, selectedSections[key] === true]),
  ) as Record<PlanningReportSectionKey, boolean>;
  return {
    clientDraftId: text(record.payload.client_draft_id) ?? record.id,
    createdAt: record.created_at,
    draftId: record.id,
    draftName: record.title,
    explainNumbers: record.payload.explain_numbers === true,
    reportNotes: text(record.payload.report_notes) ?? "",
    reportTitle: text(record.payload.report_title) ?? record.title,
    selectedSections: sections,
    sourceSnapshotId: text(record.payload.source_snapshot_id) ?? "",
    updatedAt: record.updated_at,
  };
}

function reportCreateInput(draft: PlanningSnapshotReportDraft) {
  return {
    payload: reportPayload(draft),
    report_type: REPORT_TYPE,
    status: "Draft",
    title: draft.draftName.slice(0, 240),
  };
}

function reportUpdateInput(draft: PlanningSnapshotReportDraft) {
  return {
    payload: reportPayload(draft),
    status: "Draft",
    title: draft.draftName.slice(0, 240),
  };
}

function reportPayload(draft: PlanningSnapshotReportDraft) {
  return toJsonObject({
    client_draft_id: draft.clientDraftId ?? draft.draftId,
    explain_numbers: draft.explainNumbers,
    report_notes: draft.reportNotes ?? "",
    report_title: draft.reportTitle,
    schema_version: "planning_snapshot_draft_v1",
    selected_sections: draft.selectedSections,
    source_snapshot_id: draft.sourceSnapshotId,
  });
}

function replaceDraft(
  setDrafts: Dispatch<SetStateAction<PlanningSnapshotReportDraft[]>>,
  saved: PlanningSnapshotReportDraft,
) {
  setDrafts((current) =>
    current.map((draft) => (draft.draftId === saved.draftId ? saved : draft)),
  );
}

function saving(
  message: string,
  status: PlanningReportDraftStatus = "saving",
): PlanningReportDraftPersistence {
  return { message, requestId: null, sessionOnly: IS_DEMO_MODE, status };
}

function savedState(
  message: string,
  requestId: string | null,
): PlanningReportDraftPersistence {
  return { message, requestId, sessionOnly: IS_DEMO_MODE, status: "saved" };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
