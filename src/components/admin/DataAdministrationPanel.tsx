"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Database,
  FileClock,
  Loader2,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useState } from "react";
import { getDataAdministrationSummary } from "@/lib/api/admin";
import {
  ApiClientError,
  getApiErrorDisplayMessage,
} from "@/lib/api/client";
import type {
  DataAdministrationAuditEvent,
  DataAdministrationIngestionRun,
  DataAdministrationJob,
  DataAdministrationSummary,
} from "@/types/api/admin";

type LoadState =
  | { status: "loading" }
  | { message: string; requestId: string | null; status: "error" }
  | { data: DataAdministrationSummary; status: "ready" };

export function DataAdministrationPanel() {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();

    void getDataAdministrationSummary(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) {
          setState({ data, status: "ready" });
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        const denied =
          error instanceof ApiClientError &&
          (error.status === 401 || error.status === 403);
        setState({
          message: denied
            ? "Your account is signed in but is not authorized to view data-administration status."
            : getApiErrorDisplayMessage(
                error,
                "Data-administration status is unavailable.",
              ),
          requestId:
            error instanceof ApiClientError ? error.requestId : null,
          status: "error",
        });
      });

    return () => controller.abort();
  }, [attempt]);

  if (state.status === "loading") {
    return (
      <section
        aria-live="polite"
        className="mt-6 flex min-h-48 items-center justify-center rounded-xl border border-white/10 bg-white/[0.025]"
        role="status"
      >
        <div className="text-center text-sm text-slate-300">
          <Loader2
            aria-hidden="true"
            className="mx-auto mb-3 h-5 w-5 animate-spin text-[#8fe7ff]"
          />
          Loading governed data status…
        </div>
      </section>
    );
  }

  if (state.status === "error") {
    return (
      <section
        className="mt-6 rounded-xl border border-amber-300/20 bg-amber-300/[0.055] p-5"
        role="alert"
      >
        <div className="flex items-start gap-3">
          <AlertTriangle
            aria-hidden="true"
            className="mt-0.5 h-5 w-5 shrink-0 text-amber-100"
          />
          <div>
            <h2 className="font-semibold text-white">Status unavailable</h2>
            <p className="mt-1 text-sm leading-6 text-amber-100/80">
              {state.message}
            </p>
            {state.requestId ? (
              <p className="mt-2 text-xs text-slate-500">
                Request {state.requestId}
              </p>
            ) : null}
            <button
              className="mt-4 inline-flex items-center gap-2 rounded-lg border border-amber-200/25 bg-amber-200/10 px-3 py-2 text-sm font-semibold text-amber-50 transition hover:bg-amber-200/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-200/70"
              onClick={() => {
                setState({ status: "loading" });
                setAttempt((value) => value + 1);
              }}
              type="button"
            >
              <RefreshCw aria-hidden="true" className="h-4 w-4" />
              Retry status check
            </button>
          </div>
        </div>
      </section>
    );
  }

  return <AdministrationSummaryView data={state.data} />;
}

function AdministrationSummaryView({
  data,
}: {
  data: DataAdministrationSummary;
}) {
  const runtimeItems = [
    ["Runtime", data.runtime.runtimeMode],
    ["Data", data.runtime.dataProvider],
    ["Authentication", data.runtime.authMode],
    ["AI", data.runtime.aiProvider],
    ["Artifacts", data.runtime.artifactProvider],
    ["Jobs", data.runtime.jobProvider],
  ];

  return (
    <div className="mt-6 grid gap-5" data-testid="data-administration-summary">
      <section className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-white">Runtime posture</h2>
            <p className="mt-1 text-xs leading-5 text-slate-400">
              {data.summarySource === "sanitized_demo_registry"
                ? "Sanitized static registry; no live operational records are queried."
                : "Authenticated API summary with sensitive values omitted."}
            </p>
          </div>
          <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-100">
            Read only
          </span>
        </div>
        <dl className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {runtimeItems.map(([label, value]) => (
            <div
              className="rounded-lg border border-white/10 bg-black/20 p-3"
              key={label}
            >
              <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                {label}
              </dt>
              <dd className="mt-1 break-words text-sm font-semibold text-slate-100">
                {humanize(value)}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" aria-label="Operational status counts">
        <StatusCard
          icon={Database}
          label="Sources"
          value={String(data.sources.length)}
        />
        <StatusCard
          icon={FileClock}
          label="Ingestion runs"
          value={String(data.ingestionRuns.length)}
        />
        <StatusCard
          icon={CheckCircle2}
          label="Quality results"
          value={String(data.qualityResults.length)}
        />
        <StatusCard
          icon={Clock3}
          label="Jobs"
          value={String(data.jobs.length)}
        />
        <StatusCard
          icon={ShieldCheck}
          label="Migration"
          value={data.migration.status}
        />
      </section>

      <section className="min-w-0 rounded-xl border border-white/10 bg-white/[0.025] p-4">
        <SectionHeading
          detail="Freshness, row count, and quality are status metadata—not editable records."
          title="Registered sources"
        />
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[48rem] border-collapse text-left text-sm">
            <thead className="border-b border-white/10 text-[10px] uppercase tracking-[0.14em] text-slate-500">
              <tr>
                <th className="px-3 py-2 font-semibold" scope="col">Source</th>
                <th className="px-3 py-2 font-semibold" scope="col">Freshness / cadence</th>
                <th className="px-3 py-2 font-semibold" scope="col">Rows</th>
                <th className="px-3 py-2 font-semibold" scope="col">Quality</th>
                <th className="px-3 py-2 font-semibold" scope="col">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.07]">
              {data.sources.length ? (
                data.sources.map((source, index) => (
                  <tr key={`${source.id}-${index}`}>
                    <td className="px-3 py-3">
                      <strong className="block font-semibold text-white">{source.name}</strong>
                      <span className="mt-0.5 block text-xs text-slate-500">{source.id}</span>
                    </td>
                    <td className="px-3 py-3 text-slate-300">{humanize(source.freshness)}</td>
                    <td className="px-3 py-3 tabular-nums text-slate-300">{formatCount(source.rowCount)}</td>
                    <td className="px-3 py-3"><StatusPill value={source.qualityStatus} /></td>
                    <td className="px-3 py-3 text-slate-400">{formatDate(source.updatedAt)}</td>
                  </tr>
                ))
              ) : (
                <tr><td className="px-3 py-6 text-center text-slate-500" colSpan={5}>No source status was returned.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
          <SectionHeading
            detail="Most recent rule outcomes returned by the status service."
            title="Data quality"
          />
          <div className="mt-4 space-y-2">
            {data.qualityResults.slice(0, 12).map((result, index) => (
              <article
                className="rounded-lg border border-white/10 bg-black/20 p-3"
                key={`${result.id}-${index}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-white">{result.rule}</h3>
                    <p className="mt-1 text-xs text-slate-500">{result.sourceId} · {formatDate(result.checkedAt)}</p>
                  </div>
                  <StatusPill value={result.status} />
                </div>
                {result.failedCount !== null ? (
                  <p className="mt-2 text-xs text-slate-400">Failed rows: {formatCount(result.failedCount)}</p>
                ) : null}
              </article>
            ))}
            {!data.qualityResults.length ? <EmptyState text="No quality result metadata was returned." /> : null}
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
          <SectionHeading
            detail={`Revision ${data.migration.currentRevision ?? "not reported"}; pending ${formatCount(data.migration.pendingCount)}.`}
            title="Operational history"
          />
          <div className="mt-4 grid gap-4">
            <HistoryList title="Ingestion runs" values={data.ingestionRuns} />
            <HistoryList title="Background jobs" values={data.jobs} />
            <HistoryList title="Audit events" values={data.audit} />
          </div>
        </div>
      </section>

      <footer className="text-xs leading-5 text-slate-500">
        Generated {formatDate(data.generatedAt)}
        {data.requestId ? ` · Request ${data.requestId}` : ""}. This page has
        no mutation controls.
      </footer>
    </div>
  );
}

function StatusCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Database;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.025] p-3">
      <Icon aria-hidden="true" className="h-4 w-4 text-[#8fe7ff]" />
      <p className="mt-3 break-words text-sm font-semibold text-white">{humanize(value)}</p>
      <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
    </div>
  );
}

function SectionHeading({ detail, title }: { detail: string; title: string }) {
  return (
    <div>
      <h2 className="font-semibold text-white">{title}</h2>
      <p className="mt-1 text-xs leading-5 text-slate-400">{detail}</p>
    </div>
  );
}

type HistoryValue =
  | DataAdministrationAuditEvent
  | DataAdministrationIngestionRun
  | DataAdministrationJob;

function HistoryList({ title, values }: { title: string; values: HistoryValue[] }) {
  return (
    <section aria-label={title}>
      <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{title}</h3>
      <div className="mt-2 space-y-2">
        {values.slice(0, 5).map((value, index) => {
          const description = historyDescription(value);
          return (
            <div className="flex items-start justify-between gap-3 rounded-lg border border-white/10 bg-black/20 p-3" key={`${value.id}-${index}`}>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-100">{description.title}</p>
                <p className="mt-1 truncate text-xs text-slate-500">{description.detail}</p>
              </div>
              <span className="shrink-0 text-xs text-slate-500">{formatDate(description.at)}</span>
            </div>
          );
        })}
        {!values.length ? <EmptyState text={`No ${title.toLowerCase()} were returned.`} /> : null}
      </div>
    </section>
  );
}

function historyDescription(value: HistoryValue) {
  if ("action" in value) {
    return { at: value.occurredAt, detail: value.objectType, title: value.action };
  }
  if ("jobType" in value) {
    return { at: value.finishedAt ?? value.queuedAt, detail: value.status, title: value.jobType };
  }
  return { at: value.finishedAt ?? value.startedAt, detail: value.status, title: value.sourceId };
}

function StatusPill({ value }: { value: string }) {
  const normalized = value.toLowerCase();
  const tone = /pass|ready|trusted|success|complete|current/.test(normalized)
    ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-100"
    : /fail|error|blocked|stale|invalid/.test(normalized)
      ? "border-rose-300/20 bg-rose-300/10 text-rose-100"
      : "border-amber-300/20 bg-amber-300/10 text-amber-100";
  return <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${tone}`}>{humanize(value)}</span>;
}

function EmptyState({ text }: { text: string }) {
  return <p className="rounded-lg border border-dashed border-white/10 px-3 py-4 text-center text-xs text-slate-500">{text}</p>;
}

function formatCount(value: number | null) {
  return value === null ? "Not reported" : value.toLocaleString("en-US");
}

function formatDate(value: string | null) {
  if (!value) return "Not reported";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

function humanize(value: string) {
  return value.replaceAll("_", " ");
}
