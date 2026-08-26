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
  economics: "Economics",
  "master-data": "Master Data",
  planning: "Planning",
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
  const panelRef = useRef<HTMLElement | null>(null);
  const appMode = panelProps.appMode ?? "planning";

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => {
      panelRef.current
        ?.querySelector<HTMLInputElement | HTMLTextAreaElement>(
          '[data-testid="ask-cfs-query"]',
        )
        ?.focus();
    });
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, open]);

  useEffect(() => {
    if (!open) return;
    const mobile = window.matchMedia("(max-width: 1279px)");
    const previousOverflow = document.body.style.overflow;
    const syncOverflow = () => {
      document.body.style.overflow = mobile.matches ? "hidden" : previousOverflow;
    };
    syncOverflow();
    mobile.addEventListener("change", syncOverflow);
    return () => {
      mobile.removeEventListener("change", syncOverflow);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  return (
    <>
      <button
        aria-hidden="true"
        aria-label="Close Ask CFS"
        className={`fixed inset-0 z-[80] bg-[#02050a]/60 transition-opacity duration-150 xl:hidden ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        data-testid="shared-ask-cfs-backdrop"
        onClick={onClose}
        tabIndex={-1}
        type="button"
      />
      <aside
        aria-hidden={!open}
        aria-labelledby="shared-ask-cfs-title"
        className={`fixed inset-y-0 right-0 z-[90] flex w-full flex-col overflow-hidden border-l border-[#35c98d]/24 bg-[#06101c]/98 text-slate-100 shadow-[-20px_0_55px_rgba(0,0,0,0.42)] transition-[transform,visibility] duration-200 ease-out sm:w-[25rem] xl:top-[var(--cfs-top-nav-height)] xl:h-[calc(100dvh-var(--cfs-top-nav-height))] min-[1400px]:shadow-none ${
          open
            ? "visible translate-x-0"
            : "invisible pointer-events-none translate-x-full"
        }`}
        data-testid="shared-ask-cfs-drawer"
        id="shared-ask-cfs-panel"
        ref={panelRef}
      >
        <header className="flex shrink-0 items-center gap-3 border-b border-white/10 bg-white/[0.035] px-4 py-3 sm:px-5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#35c98d]/30 bg-[#35c98d]/12 text-[#7ae6b8]">
            <Sparkles className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-semibold text-white" id="shared-ask-cfs-title">
              Ask CFS · {workspaceLabels[appMode]}
            </h2>
            <p className="truncate text-xs text-slate-400">
              Shared intelligence layer
            </p>
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
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-5 pt-3 sm:px-5">
          <AskCfsPanel
            {...panelProps}
            appMode={appMode}
            inputId="shared-ask-cfs-query"
          />
        </div>
      </aside>
    </>
  );
}
