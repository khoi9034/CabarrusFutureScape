"use client";

import { AlertTriangle, FileSearch, Loader2, Send, Sparkles } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  askCfsSuggestedPrompts,
  searchCfsAi,
} from "@/lib/aiSearchService";
import { getApiErrorDisplayMessage, USE_DEMO_DATA } from "@/lib/api/client";
import type {
  CfsAiConversationTurn,
  CfsAiSearchRequest,
  CfsAiSearchResponse,
} from "@/types/api";

export interface AskCfsExternalRequest {
  request: CfsAiSearchRequest;
  requestId: number;
}

export function AskCfsPanel({
  externalRequest,
  onResponse,
}: {
  externalRequest?: AskCfsExternalRequest | null;
  onResponse?: (response: CfsAiSearchResponse) => void;
}) {
  const [answer, setAnswer] = useState<CfsAiSearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingStage, setLoadingStage] = useState(0);
  const [turns, setTurns] = useState<CfsAiConversationTurn[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [query, setQuery] = useState("");
  const lastExternalRequestId = useRef<number | null>(null);
  const lastTurn = turns.at(-1);

  const submit = useCallback(async (
    nextQuery = query,
    requestOverrides: Partial<CfsAiSearchRequest> = {},
  ) => {
    const trimmedQuery = nextQuery.trim();
    if (!trimmedQuery || isLoading) return;

    setError(null);
    setIsLoading(true);
    setLoadingStage(0);
    try {
      const response = await searchCfsAi({
        ...requestOverrides,
        conversation_context: turns,
        mode: USE_DEMO_DATA ? "demo" : "live",
        query: trimmedQuery,
      });
      setAnswer(response);
      setTurns((current) => [...current, toConversationTurn(trimmedQuery, response)].slice(-5));
      onResponse?.(response);
    } catch (requestError) {
      setAnswer(null);
      setError(
        getApiErrorDisplayMessage(
          requestError,
          "Ask CFS is unavailable for the current session.",
        ),
      );
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, onResponse, query, turns]);

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
              <p className="text-xs text-slate-400">
                Search across indicators, layers, methodology, and cached planning signals.
              </p>
            </div>
          </div>
        </div>
        <span className="w-fit rounded-full border border-[#f6d98e]/25 bg-[#f6d98e]/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#f6d98e]">
          {USE_DEMO_DATA ? "Portfolio Demo AI Preview" : "Backend grounded search"}
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
          placeholder="Ask about permit trends, school pressure, floodplain review, Model Lab, or data readiness..."
          value={query}
        />
        <button
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#68d8ff]/30 bg-[#68d8ff]/12 px-4 py-3 text-sm font-semibold text-[#c6f4ff] transition hover:border-[#68d8ff]/55 hover:bg-[#68d8ff]/18 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={isLoading || !query.trim()}
          type="submit"
        >
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Ask
        </button>
      </form>

      {isLoading ? (
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
              setTurns([]);
            }}
            type="button"
          >
            Clear Ask CFS context
          </button>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {askCfsSuggestedPrompts.map((prompt) => (
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

      {error ? (
        <div className="mt-4 flex gap-2 rounded-lg border border-[#f87171]/25 bg-[#f87171]/10 p-3 text-xs text-[#fecaca]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      {answer ? <AskCfsAnswer response={answer} /> : null}
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
  if (stage >= 2) return "Still working; fallback will return if provider is slow.";
  if (stage >= 1) return "Using cached local intelligence context.";
  return "Using cached intelligence context when available; fast fallback is enabled.";
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
          Grounded answer
        </div>
        {openAiFallbackActive ? (
          <p className="mb-3 w-fit rounded border border-[#f6d98e]/20 bg-[#f6d98e]/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#f6d98e]">
            Provider: OpenAI configured / Status: fallback active / Reason: rate limit/quota
          </p>
        ) : null}
        <div className="whitespace-pre-line text-sm leading-6 text-slate-100">
          {response.answer}
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-2">
          {response.evidence.map((item) => (
            <article
              className="rounded-lg border border-white/10 bg-white/[0.035] p-3"
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
      </div>

      <aside className="space-y-3">
        <CompactList title="Related layers" values={response.related_layers} />
        <CompactList
          title="Recommended layers to inspect"
          values={response.dashboard_actions?.recommended_layers ?? []}
        />
        <CompactList title="Suggested next actions" values={response.suggested_actions} />
        <CompactList title="Caveats" tone="amber" values={response.caveats} />
      </aside>
    </div>
  );
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
