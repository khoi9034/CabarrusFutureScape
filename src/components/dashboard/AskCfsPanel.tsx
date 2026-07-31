"use client";

import { AlertTriangle, FileSearch, Loader2, Send, Sparkles } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  askCfsEconomicsSuggestedPrompts,
  askCfsSuggestedPrompts,
  searchCfsAi,
} from "@/lib/aiSearchService";
import { ApiClientError, getApiErrorDisplayMessage, USE_DEMO_DATA } from "@/lib/api/client";
import type { CfsAppMode } from "@/types";
import type {
  CfsAiConversationTurn,
  CfsAiSearchRequest,
  CfsAiSearchResponse,
} from "@/types/api";

export interface AskCfsExternalRequest {
  request: CfsAiSearchRequest;
  requestId: number;
}

const EMPTY_CONVERSATION: CfsAiConversationTurn[] = [];

export function AskCfsPanel({
  appMode = "planning",
  externalRequest,
  filterContext,
  onResponse,
  suggestedPromptsOverride,
  visiblePromptCount,
}: {
  appMode?: CfsAppMode;
  externalRequest?: AskCfsExternalRequest | null;
  filterContext?: CfsAiSearchRequest["filter_context"];
  onResponse?: (response: CfsAiSearchResponse) => void;
  suggestedPromptsOverride?: readonly string[];
  visiblePromptCount?: number;
}) {
  const [answer, setAnswer] = useState<CfsAiSearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingStage, setLoadingStage] = useState(0);
  const [contentScope, setContentScope] = useState("");
  const [loadingScope, setLoadingScope] = useState("");
  const [turns, setTurns] = useState<CfsAiConversationTurn[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [query, setQuery] = useState("");
  const lastExternalRequestId = useRef<number | null>(null);
  const latestRequestId = useRef(0);
  const activeScopeRef = useRef("");
  const suggestedPrompts = suggestedPromptsOverride ??
    (appMode === "economics"
      ? askCfsEconomicsSuggestedPrompts
      : askCfsSuggestedPrompts);
  const helperText =
    appMode === "consulting"
      ? "Search across case studies, active candidates, comparisons, underwriting, evidence gaps, and deliverables."
      : appMode === "economics"
        ? "Search across parcel economics, tax-base opportunity, constraints, and scenario context."
        : "Search across indicators, layers, methodology, and cached planning signals.";
  const inputPlaceholder =
    appMode === "consulting"
      ? "Ask about the active case study, candidate tradeoffs, underwriting assumptions, or next diligence..."
      : appMode === "economics"
        ? "Ask about underbuilt parcels, value per acre, tax-base opportunity, or scenarios..."
        : "Ask about permit trends, school pressure, floodplain review, Model Lab, or data readiness...";
  const visiblePrompts = visiblePromptCount
    ? suggestedPrompts.slice(0, visiblePromptCount)
    : suggestedPrompts;
  const hiddenPrompts = visiblePromptCount
    ? suggestedPrompts.slice(visiblePromptCount)
    : [];
  const contextScopeKey = [
    appMode,
    filterContext?.selected_parcel_id,
    filterContext?.active_parcel_id,
    filterContext?.scenario_id,
    filterContext?.active_scenario,
    filterContext?.project_id,
    filterContext?.active_project,
    filterContext?.selected_signal_id,
  ].join("|");
  const inCurrentScope = contentScope === contextScopeKey;
  const scopedAnswer = inCurrentScope ? answer : null;
  const scopedError = inCurrentScope ? error : null;
  const scopedTurns =
    inCurrentScope ? turns : EMPTY_CONVERSATION;
  const scopedIsLoading =
    loadingScope === contextScopeKey && isLoading;
  const lastTurn = scopedTurns.at(-1);

  const submit = useCallback(async (
    nextQuery = query,
    requestOverrides: Partial<CfsAiSearchRequest> = {},
  ) => {
    const trimmedQuery = nextQuery.trim();
    if (!trimmedQuery || scopedIsLoading) return;

    const requestId = latestRequestId.current + 1;
    const requestScope = contextScopeKey;
    latestRequestId.current = requestId;
    setContentScope(requestScope);
    setLoadingScope(requestScope);
    setError(null);
    setIsLoading(true);
    setLoadingStage(0);
    try {
      const activeFilterContext = {
        ...(filterContext ?? {}),
        ...(requestOverrides.filter_context ?? {}),
      };
      const response = await searchCfsAi({
        ...requestOverrides,
        app_mode: appMode,
        conversation_context: scopedTurns,
        filter_context: Object.keys(activeFilterContext).length
          ? activeFilterContext
          : undefined,
        mode: USE_DEMO_DATA ? "demo" : "live",
        query: trimmedQuery,
      });
      if (requestId !== latestRequestId.current) return;
      setAnswer(response);
      setTurns(
        [...scopedTurns, toConversationTurn(trimmedQuery, response)].slice(-5),
      );
      onResponse?.(response);
    } catch (requestError) {
      if (requestId !== latestRequestId.current) return;
      setAnswer(null);
      setError(askCfsErrorMessage(requestError));
    } finally {
      if (requestId === latestRequestId.current) {
        setIsLoading(false);
      }
    }
  }, [
    appMode,
    contextScopeKey,
    filterContext,
    onResponse,
    query,
    scopedIsLoading,
    scopedTurns,
  ]);

  useEffect(() => {
    if (
      !externalRequest ||
      lastExternalRequestId.current === externalRequest.requestId
    ) {
      return;
    }

    lastExternalRequestId.current = externalRequest.requestId;
    setQuery(externalRequest.request.query);
    void submit(externalRequest.request.query, externalRequest.request);
  }, [externalRequest, submit]);

  useEffect(() => {
    if (!isLoading) return;
    const cachedTimer = window.setTimeout(() => setLoadingStage(1), 2000);
    const fallbackTimer = window.setTimeout(() => setLoadingStage(2), 5000);
    return () => {
      window.clearTimeout(cachedTimer);
      window.clearTimeout(fallbackTimer);
    };
  }, [isLoading]);

  useEffect(() => {
    if (activeScopeRef.current !== contextScopeKey) {
      activeScopeRef.current = contextScopeKey;
      latestRequestId.current += 1;
    }
  }, [contextScopeKey]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit();
  }

  return (
    <section className="cfs-command-surface rounded-xl border-[#68d8ff]/20 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#68d8ff]/25 bg-[#68d8ff]/10 text-[#9be9ff]">
              <Sparkles className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-white">Ask CFS</h2>
              <p className="text-xs text-slate-400">{helperText}</p>
            </div>
          </div>
        </div>
        <span className="w-fit rounded-full border border-[#f6d98e]/25 bg-[#f6d98e]/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#f6d98e]">
          {USE_DEMO_DATA ? "Portfolio Demo AI Preview" : "Grounded local answers"}
        </span>
      </div>

      <form className="mt-4 flex flex-col gap-2 md:flex-row" onSubmit={onSubmit}>
        <label className="sr-only" htmlFor="ask-cfs-query">
          Ask CFS question
        </label>
        <input
          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-[#68d8ff]/55 focus:ring-2 focus:ring-[#68d8ff]/15"
          id="ask-cfs-query"
          onChange={(event) => setQuery(event.target.value)}
          placeholder={inputPlaceholder}
          value={query}
        />
        <button
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#68d8ff]/30 bg-[#68d8ff]/12 px-4 py-3 text-sm font-semibold text-[#c6f4ff] transition hover:border-[#68d8ff]/55 hover:bg-[#68d8ff]/18 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={scopedIsLoading || !query.trim()}
          type="submit"
        >
          {scopedIsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Ask
        </button>
      </form>

      {scopedIsLoading ? (
        <div className="mt-3 rounded-lg border border-[#68d8ff]/15 bg-[#68d8ff]/10 px-3 py-2 text-xs leading-5 text-slate-300">
          <span className="font-semibold text-[#9be9ff]">
            Preparing grounded CFS briefing...
          </span>{" "}
          {loadingStageMessage(loadingStage)}
        </div>
      ) : null}

      {lastTurn ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-[#68d8ff]/15 bg-[#68d8ff]/10 px-3 py-2 text-xs text-slate-300">
          <span className="font-semibold text-[#9be9ff]">Follow-up mode</span>
          <span>
            Using previous Ask CFS context:{" "}
            {labelForTurn(lastTurn)}
          </span>
          <button
            className="ml-auto rounded border border-white/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-300 transition hover:border-[#68d8ff]/35 hover:text-white"
            onClick={() => {
              latestRequestId.current += 1;
              setTurns([]);
              setAnswer(null);
              setError(null);
              setIsLoading(false);
              setLoadingScope("");
              setQuery("");
              setContentScope(contextScopeKey);
            }}
            type="button"
          >
            Reset conversation
          </button>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {visiblePrompts.map((prompt) => (
          <button
            className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-[#68d8ff]/35 hover:text-[#b7f0ff]"
            key={prompt}
            onClick={() => {
              setQuery(prompt);
              void submit(prompt);
            }}
            type="button"
          >
            {prompt}
          </button>
        ))}
      </div>
      {hiddenPrompts.length ? (
        <details className="mt-2 rounded-lg border border-white/10 bg-white/[0.025] p-3">
          <summary className="cursor-pointer text-xs font-semibold text-slate-300">
            More prompts
          </summary>
          <div className="mt-3 flex flex-wrap gap-2">
            {hiddenPrompts.map((prompt) => (
              <button
                className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-[#68d8ff]/35 hover:text-[#b7f0ff]"
                key={prompt}
                onClick={() => {
                  setQuery(prompt);
                  void submit(prompt);
                }}
                type="button"
              >
                {prompt}
              </button>
            ))}
          </div>
        </details>
      ) : null}

      {scopedError ? (
        <div className="mt-4 flex flex-col gap-3 rounded-lg border border-[#f87171]/25 bg-[#f87171]/10 p-3 text-xs text-[#fecaca] sm:flex-row sm:items-center">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1">{scopedError}</span>
          <button
            className="w-fit rounded border border-[#fecaca]/30 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#fee2e2] transition hover:border-[#fee2e2]/60"
            onClick={() => void submit()}
            type="button"
          >
            Retry
          </button>
        </div>
      ) : null}

      {scopedAnswer ? <AskCfsAnswer response={scopedAnswer} /> : null}
    </section>
  );
}

function toConversationTurn(
  query: string,
  response: CfsAiSearchResponse,
): CfsAiConversationTurn {
  return {
    answer_summary: response.answer.split("\n").find(Boolean)?.slice(0, 280) ?? "",
    dashboard_actions: response.dashboard_actions,
    focused_domain:
      response.dashboard_actions.focus_domain ?? response.domains[0] ?? null,
    query,
    related_layers: response.related_layers.slice(0, 6),
  };
}

function loadingStageMessage(stage: number) {
  if (USE_DEMO_DATA) return "Using cached demo intelligence context.";
  if (stage >= 2) return "Enhancing explanation if the provider responds in time.";
  if (stage >= 1) return "Preparing grounded local analysis.";
  return "Loading CFS context.";
}

function askCfsErrorMessage(error: unknown) {
  if (error instanceof ApiClientError) {
    if (error.kind === "network") {
      return "CFS data service is unavailable. Restart the local CFS services and retry.";
    }
    if (error.kind === "timeout") {
      return "CFS data service did not respond before the presentation timeout. Retry or run the presentation check.";
    }
    if (error.kind === "cancelled") return "Ask CFS request cancelled.";
    if (error.status === 503) {
      return "CFS database is unavailable. Check local services, then retry.";
    }
    if (error.status === 429) {
      return "OpenAI enhancement is temporarily unavailable. CFS can still return grounded local analysis.";
    }
  }
  return getApiErrorDisplayMessage(
    error,
    "Ask CFS is unavailable for the current session.",
  );
}

function labelForTurn(turn: CfsAiConversationTurn) {
  return turn.focused_domain
    ? `${turn.focused_domain.replaceAll("_", " ")} / "${turn.query}"`
    : `"${turn.query}"`;
}

function AskCfsAnswer({ response }: { response: CfsAiSearchResponse }) {
  const openAiFallbackActive =
    response.data_mode === "live" &&
    response.provider === "none" &&
    response.caveats.some((caveat) =>
      caveat.toLowerCase().includes("rate limit or quota"),
    );

  return (
    <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]">
      <div className="rounded-xl border border-white/10 bg-black/24 p-4">
        <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#9be9ff]">
          <FileSearch className="h-3.5 w-3.5" />
          {askCfsProviderLabel(response)}
        </div>
        <p className="mb-3 rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
          {askCfsSourceLine(response)}
        </p>
        {openAiFallbackActive ? (
          <p className="mb-3 w-fit rounded border border-[#f6d98e]/20 bg-[#f6d98e]/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#f6d98e]">
            Provider: OpenAI configured / Status: fallback active / Reason: rate limit/quota
          </p>
        ) : null}
        <div className="whitespace-pre-line text-sm leading-6 text-slate-100">
          {response.answer}
        </div>
        <InlineList title="Key findings" values={response.key_findings ?? []} />
        <section className="mt-4 border-t border-white/10 pt-4">
          <h3 className="text-xs font-semibold text-slate-300">
            Evidence used ({response.evidence.length})
          </h3>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {response.evidence.map((item) => (
              <article
                className="border-l-2 border-[#68d8ff]/25 pl-3"
                key={`${item.source}-${item.title}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xs font-semibold text-white">{item.title}</h3>
                  <span className="rounded border border-[#68d8ff]/20 bg-[#68d8ff]/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-[#b7f0ff]">
                    {item.confidence.replace("_", " ")}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-300">{item.detail}</p>
                <p className="mt-2 truncate text-[10px] text-slate-500" title={item.source}>
                  {item.source}
                </p>
              </article>
            ))}
          </div>
        </section>
        {response.interpretation ? (
          <section className="mt-4 border-t border-white/10 pt-4">
            <h3 className="text-xs font-semibold text-[#9be9ff]">
              Interpretation
            </h3>
            <p className="mt-2 text-xs leading-5 text-slate-300">
              {response.interpretation}
            </p>
          </section>
        ) : null}
        <InlineList
          title="Limitations"
          tone="amber"
          values={response.limitations ?? response.caveats}
        />
        <InlineList
          title="What to do next"
          values={
            response.recommended_next_actions ?? response.suggested_actions
          }
        />
      </div>

      <aside className="space-y-3">
        <CompactList title="Related layers" values={response.related_layers} />
        <CompactList
          title="Recommended layers to inspect"
          values={response.dashboard_actions?.recommended_layers ?? []}
        />
        <CompactList
          title="Follow-up questions"
          values={response.suggested_follow_up_questions ?? []}
        />
        <p className="px-1 text-[10px] leading-4 text-slate-500">
          Request {response.request_id ?? "not recorded"} / Prompt{" "}
          {response.prompt_version ?? "not recorded"}
        </p>
      </aside>
    </div>
  );
}

function InlineList({
  title,
  tone = "cyan",
  values,
}: {
  title: string;
  tone?: "amber" | "cyan";
  values: string[];
}) {
  return (
    <section className="mt-4 border-t border-white/10 pt-4">
      <h3
        className={
          tone === "amber"
            ? "text-xs font-semibold text-[#f6d98e]"
            : "text-xs font-semibold text-[#9be9ff]"
        }
      >
        {title}
      </h3>
      <ul className="mt-2 space-y-1.5 text-xs leading-5 text-slate-300">
        {(values.length ? values : ["Not available from current context."]).map(
          (value) => (
            <li className="flex gap-2" key={value}>
              <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-current opacity-70" />
              <span>{value}</span>
            </li>
          ),
        )}
      </ul>
    </section>
  );
}

function askCfsProviderLabel(response: CfsAiSearchResponse) {
  if (response.data_mode === "demo") return "Cached demo analysis";
  if (response.provider_status === "openai_enhanced" || response.provider === "openai") {
    return "OpenAI enhanced";
  }
  return "Grounded CFS analysis";
}

function askCfsSourceLine(response: CfsAiSearchResponse) {
  const source =
    response.data_source === "portfolio_demo_extract" || response.data_mode === "demo"
      ? "Portfolio Demo · cached demo extract"
      : response.data_source === "local_live_backend"
        ? "Local live backend"
        : response.data_source ?? "CFS context";
  const freshness = response.context_freshness
    ? ` · ${response.context_freshness.replaceAll("_", " ")}`
    : "";
  const updated = response.as_of ? ` · Updated: ${formatAskCfsDate(response.as_of)}` : "";
  const filters = response.filtered_context_summary
    ? ` · Filters: ${response.filtered_context_summary}`
    : "";
  return `Source: ${source}${updated}${freshness}${filters}`;
}

function formatAskCfsDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function CompactList({
  title,
  tone = "cyan",
  values,
}: {
  title: string;
  tone?: "amber" | "cyan";
  values: string[];
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/24 p-3">
      <h3
        className={
          tone === "amber"
            ? "text-[10px] font-semibold uppercase tracking-[0.16em] text-[#f6d98e]"
            : "text-[10px] font-semibold uppercase tracking-[0.16em] text-[#9be9ff]"
        }
      >
        {title}
      </h3>
      <ul className="mt-2 space-y-1.5 text-xs leading-5 text-slate-300">
        {(values.length ? values : ["Not available from current context."]).map(
          (value) => (
            <li className="flex gap-2" key={value}>
              <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-current opacity-70" />
              <span>{value}</span>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}
