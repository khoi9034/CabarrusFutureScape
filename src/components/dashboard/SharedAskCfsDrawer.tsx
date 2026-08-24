"use client";

import { Sparkles, X } from "lucide-react";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import {
  AskCfsPanel,
  type AskCfsPanelProps,
} from "@/components/dashboard/AskCfsPanel";
import type { CfsAppMode } from "@/types";

const workspaceLabels: Record<CfsAppMode, string> = {
  economics: "CFS Economics",
  "master-data": "CFS Master Data",
  planning: "CFS Planning",
};

const SharedAskCfsContext = createContext<{
  onConfigChange: (config: AskCfsPanelProps | null) => void;
  onOpen: () => void;
} | null>(null);

export function SharedAskCfsRegistryProvider({
  children,
  onConfigChange,
  onOpen,
}: {
  children: ReactNode;
  onConfigChange: (config: AskCfsPanelProps | null) => void;
  onOpen: () => void;
}) {
  const value = useMemo(
    () => ({ onConfigChange, onOpen }),
    [onConfigChange, onOpen],
  );
  return (
    <SharedAskCfsContext.Provider value={value}>
      {children}
    </SharedAskCfsContext.Provider>
  );
}

export function SharedAskCfsSource(props: AskCfsPanelProps) {
  const context = useContext(SharedAskCfsContext);
  const propsRef = useRef(props);
  propsRef.current = props;

  useEffect(() => {
    if (!context) return;
    context.onConfigChange(propsRef.current);
    return () => context.onConfigChange(null);
  }, [
    context,
    props.appMode,
    props.externalRequest,
    props.filterContext,
    props.helperTextOverride,
    props.inputPlaceholderOverride,
    props.onResponse,
    props.suggestedPromptsOverride,
    props.visiblePromptCount,
  ]);

  const externalRequestId = props.externalRequest?.requestId;
  useEffect(() => {
    if (externalRequestId !== undefined) context?.onOpen();
  }, [context, externalRequestId]);

  return (
    <button
      className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#35c98d]/30 bg-[#35c98d]/10 px-4 py-3 text-sm font-semibold text-[#baf5dc] transition hover:border-[#35c98d]/55 hover:bg-[#35c98d]/16 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#35c98d]/70"
      data-testid="shared-ask-cfs-inline-open"
      onClick={context?.onOpen}
      type="button"
    >
      <Sparkles className="h-4 w-4" />
      Open Ask CFS
    </button>
  );
}

export function SharedAskCfsDrawer({
  onClose,
  open,
  ...panelProps
}: AskCfsPanelProps & {
  onClose: () => void;
  open: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const appMode = panelProps.appMode ?? "planning";

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      aria-labelledby="shared-ask-cfs-title"
      className="fixed inset-y-0 right-0 m-0 ml-auto h-dvh max-h-dvh w-full max-w-xl overflow-hidden border-0 border-l border-[#35c98d]/28 bg-[#06101c]/98 p-0 text-slate-100 shadow-[-28px_0_100px_rgba(0,0,0,0.58)] backdrop:bg-[#02050a]/72 backdrop:backdrop-blur-sm"
      data-testid="shared-ask-cfs-drawer"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onClose={onClose}
      ref={dialogRef}
    >
      <div className="flex h-full min-h-0 flex-col">
        <header className="flex shrink-0 items-center gap-3 border-b border-white/10 bg-white/[0.035] px-4 py-3 sm:px-5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#35c98d]/30 bg-[#35c98d]/12 text-[#7ae6b8]">
            <Sparkles className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#7ae6b8]">
              Shared intelligence layer
            </p>
            <h2 className="truncate text-lg font-semibold text-white" id="shared-ask-cfs-title">
              Ask CFS · {workspaceLabels[appMode]}
            </h2>
          </div>
          <button
            aria-label="Close Ask CFS"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-slate-300 transition hover:border-white/20 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#35c98d]/70"
            data-testid="shared-ask-cfs-close"
            onClick={onClose}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-5">
          <p className="mb-3 text-xs leading-5 text-slate-400">
            Ask questions without leaving {workspaceLabels[appMode]}. Responses use approved CFS context and retain the current workspace.
          </p>
          <AskCfsPanel
            {...panelProps}
            appMode={appMode}
            inputId="shared-ask-cfs-query"
          />
        </div>
      </div>
    </dialog>
  );
}
