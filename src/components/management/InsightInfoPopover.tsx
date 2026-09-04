"use client";

import { Info, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

export type InsightInfo = {
  coverage?: string;
  currentThrough?: string;
  limitations?: string;
  meaning?: string;
  methodologyLink?: { href: string; label?: string };
  sources?: string | string[];
  status?: "Current" | "Limited" | "Stale" | "Unavailable" | "Decision Support";
  title: string;
};

const closeEvent = "cfs:close-insight-popovers";

export function InsightInfoPopover({ info }: { info: InsightInfo }) {
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [popoverPosition, setPopoverPosition] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    const closeOthers = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== id) setOpen(false);
    };
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    const placePopover = () => {
      if (window.matchMedia("(max-width: 639px)").matches) {
        setPopoverPosition(null);
        return;
      }
      const trigger = triggerRef.current?.getBoundingClientRect();
      const panel = panelRef.current;
      if (!trigger || !panel) return;
      const gap = 8;
      const topClearance = 88;
      const left = Math.min(window.innerWidth - panel.offsetWidth - 16, Math.max(16, trigger.right - panel.offsetWidth));
      const below = trigger.bottom + gap;
      const top = below + panel.offsetHeight <= window.innerHeight - 16 ? below : Math.max(topClearance, trigger.top - panel.offsetHeight - gap);
      setPopoverPosition({ left, top });
    };
    document.addEventListener(closeEvent, closeOthers);
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    panelRef.current?.focus();
    placePopover();
    window.addEventListener("resize", placePopover);
    window.addEventListener("scroll", placePopover, true);
    return () => {
      document.removeEventListener(closeEvent, closeOthers);
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", placePopover);
      window.removeEventListener("scroll", placePopover, true);
    };
  }, [id, open]);

  const sources = (Array.isArray(info.sources) ? info.sources : [info.sources]).filter(Boolean) as string[];
  const rows = [
    ["What this means", info.meaning],
    [sources.length > 1 ? "Data sources" : "Data source", sources.length === 1 ? sources[0] : sources],
    ["Current through", info.currentThrough],
    ["Coverage", info.coverage],
    ["Status", info.status],
    ["Important note", info.limitations],
  ].filter(([, value]) => Array.isArray(value) ? value.length : Boolean(value));

  return (
    <div className="relative" ref={rootRef}>
      <button
        aria-controls={`${id}-popover`}
        aria-expanded={open}
        aria-label={`About ${info.title}`}
        className="grid h-7 w-7 place-items-center rounded-full border border-white/15 bg-white/[0.035] text-slate-400 transition hover:border-[#82c9d8]/45 hover:text-[#bce3eb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#82c9d8] focus-visible:ring-offset-2 focus-visible:ring-offset-[#07111f]"
        onClick={() => {
          const next = !open;
          document.dispatchEvent(new CustomEvent(closeEvent, { detail: next ? id : "" }));
          setOpen(next);
        }}
        ref={triggerRef}
        type="button"
      >
        <Info aria-hidden="true" className="h-3.5 w-3.5" />
      </button>
      {open ? (
        <div
          aria-labelledby={`${id}-title`}
          className="fixed inset-x-4 bottom-4 z-[80] max-h-[calc(100vh-2rem)] overflow-y-auto rounded-2xl border border-[#82c9d8]/25 bg-[#07111f] p-5 text-left shadow-2xl shadow-black/50 focus:outline-none sm:inset-x-auto sm:bottom-auto sm:right-4 sm:top-24 sm:w-[22rem] sm:max-h-[calc(100vh-7rem)]"
          id={`${id}-popover`}
          ref={panelRef}
          role="dialog"
          style={popoverPosition ?? undefined}
          tabIndex={-1}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-[#9bd1de]">About this insight</p>
              <h3 className="mt-1 text-base font-semibold text-white" id={`${id}-title`}>{info.title}</h3>
            </div>
            <button aria-label={`Close information about ${info.title}`} className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-slate-400 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#82c9d8]" onClick={() => { setOpen(false); triggerRef.current?.focus(); }} type="button"><X aria-hidden="true" className="h-4 w-4" /></button>
          </div>
          <dl className="mt-4 space-y-3">
            {rows.map(([label, value]) => (
              <div key={label as string}>
                <dt className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-slate-500">{label as string}</dt>
                <dd className="mt-1 text-sm leading-5 text-slate-200">{Array.isArray(value) ? <ul className="space-y-1">{value.map((source) => <li key={source}>• {source}</li>)}</ul> : value}</dd>
              </div>
            ))}
          </dl>
          {info.methodologyLink ? <a className="mt-4 inline-flex text-sm font-semibold text-[#9bd1de] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#82c9d8]" href={info.methodologyLink.href}>{info.methodologyLink.label ?? "View methodology"}</a> : null}
        </div>
      ) : null}
    </div>
  );
}
