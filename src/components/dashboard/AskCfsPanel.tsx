"use client";

import { AlertTriangle, FileSearch, Loader2, Send, Sparkles } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  askCfsEconomicsSuggestedPrompts,
  askCfsMasterDataSuggestedPrompts,
  askCfsSuggestedPrompts,
  searchCfsAi,
} from "@/lib/aiSearchService";
import { ApiClientError, getApiErrorDisplayMessage, USE_DEMO_DATA } from "@/lib/api/client";
import { useProductPrincipal } from "@/hooks/useProductPrincipal";
import { toProductApiError } from "@/lib/product/apiClient";
import { toJsonObject } from "@/lib/product/json";
import { getAskCfsConversationRepository } from "@/lib/product/runtimeRepository";
import type { AskCfsMessageRecord, JsonObject, JsonValue } from "@/lib/product/types";
import type {
  CfsAiConversationTurn,
  CfsAiSearchRequest,
  CfsAiSearchResponse,
} from "@/types/api";

type AskCfsAppMode = "economics" | "master-data" | "planning";

export interface AskCfsExternalRequest {
  request: CfsAiSearchRequest;
  requestId: number;
}

export interface AskCfsPanelProps {
  appMode?: AskCfsAppMode;
  externalRequest?: AskCfsExternalRequest | null;
  filterContext?: CfsAiSearchRequest["filter_context"];
  helperTextOverride?: string;
  inputId?: string;
  inputPlaceholderOverride?: string;
  onResponse?: (response: CfsAiSearchResponse) => void;
  suggestedPromptsOverride?: readonly string[];
  visiblePromptCount?: number;
}

const EMPTY_CONVERSATION: CfsAiConversationTurn[] = [];
const askCfsConversationRepository = getAskCfsConversationRepository();

interface PendingAskPersistence {
  appMode: AskCfsAppMode;
  domains: string[];
  filterContext: JsonObject;
  focusedDomain: string | null;
  projectId: string | null;
  promptVersion: string | null;
  providerMode: string;
  question: string;
  relatedLayers: string[];
  requestScope: string;
  safetyStatus: string;
  summary: string | null;
  turnId: string;
}

export function AskCfsPanel({
  appMode = "planning",
  externalRequest,
  filterContext,
  helperTextOverride,
  inputId = "ask-cfs-query",
  inputPlaceholderOverride,
  onResponse,
  suggestedPromptsOverride,
  visiblePromptCount,
}: AskCfsPanelProps) {
  const {
    can,
    error: principalError,
    reload: reloadPrincipal,
    requestId: principalRequestId,
    status: principalStatus,
  } = useProductPrincipal();
  const [answer, setAnswer] = useState<CfsAiSearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingStage, setLoadingStage] = useState(0);
  const [contentScope, setContentScope] = useState("");
  const [loadingScope, setLoadingScope] = useState("");
  const [turns, setTurns] = useState<CfsAiConversationTurn[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [persistenceAttempt, setPersistenceAttempt] = useState(0);
  const [persistenceBusy, setPersistenceBusy] = useState(false);
  const [persistenceError, setPersistenceError] = useState<string | null>(null);
  const [persistenceRequestId, setPersistenceRequestId] = useState<string | null>(null);
  const [persistenceStatus, setPersistenceStatus] = useState<string | null>(null);
  const conversationIdRef = useRef<string | null>(null);
  const pendingPersistenceRef = useRef<PendingAskPersistence | null>(null);
  const lastExternalRequestId = useRef<number | null>(null);
  const latestRequestId = useRef(0);
  const activeScopeRef = useRef("");
  const canUseAskCfs =
    askCfsConversationRepository.provider === "demo" || can("ask_cfs:use");
  const productAccessReady =
    askCfsConversationRepository.provider === "demo" || principalStatus === "ready";
  const suggestedPrompts = suggestedPromptsOverride ??
    (appMode === "economics"
      ? askCfsEconomicsSuggestedPrompts
      : appMode === "master-data"
        ? askCfsMasterDataSuggestedPrompts
      : askCfsSuggestedPrompts);
  const helperText = helperTextOverride ??
    (appMode === "economics"
      ? "Search across parcel economics, tax-base opportunity, constraints, and scenario context."
      : appMode === "master-data"
        ? "Explain governed dataset metadata, approved fields, filters, joins, and result summaries."
        : "Search across indicators, layers, methodology, and cached planning signals.");
  const inputPlaceholder = inputPlaceholderOverride ??
    (appMode === "economics"
      ? "Ask about underbuilt parcels, value per acre, tax-base opportunity, or scenarios..."
      : appMode === "master-data"
        ? "Ask about this dataset, approved fields, filters, joins, lineage, or exports..."
        : "Ask about permit trends, school pressure, floodplain review, Model Lab, or data readiness...");
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
    filterContext?.master_data_dataset_id,
    filterContext?.master_data_selected_fields,
    filterContext?.master_data_filters,
    filterContext?.master_data_join,
    filterContext?.master_data_result_count,
    filterContext?.master_data_match_percentage,
  ].join("|");
  const inCurrentScope = contentScope === contextScopeKey;
  const scopedAnswer = inCurrentScope ? answer : null;
  const scopedError = inCurrentScope ? error : null;
  const scopedTurns =
    inCurrentScope ? turns : EMPTY_CONVERSATION;
  const scopedIsLoading =
    loadingScope === contextScopeKey && isLoading;
  const lastTurn = scopedTurns.at(-1);

  useEffect(() => {
    if (activeScopeRef.current !== contextScopeKey) {
      activeScopeRef.current = contextScopeKey;
      latestRequestId.current += 1;
      conversationIdRef.current = null;
      pendingPersistenceRef.current = null;
      queueMicrotask(() => {
        if (activeScopeRef.current !== contextScopeKey) return;
        setConversationId(null);
        setTurns([]);
        setAnswer(null);
        setContentScope(contextScopeKey);
        setPersistenceRequestId(null);
      });
    }
  }, [contextScopeKey]);

  useEffect(() => {
    if (!productAccessReady) {
      const timeout = window.setTimeout(() => {
        setPersistenceBusy(false);
        setPersistenceError(
          principalStatus === "error"
            ? principalError ?? "Ask CFS access could not be verified."
            : null,
        );
        setPersistenceRequestId(principalRequestId);
        setPersistenceStatus(
          principalStatus === "loading" ? "Loading Ask CFS access..." : null,
        );
      }, 0);
      return () => window.clearTimeout(timeout);
    }
    if (!canUseAskCfs) {
      const timeout = window.setTimeout(() => {
        setPersistenceBusy(false);
        setPersistenceError("Your role cannot use Ask CFS.");
        setPersistenceRequestId(principalRequestId);
        setPersistenceStatus(null);
      }, 0);
      return () => window.clearTimeout(timeout);
    }
    const controller = new AbortController();
    queueMicrotask(() => {
      if (controller.signal.aborted) return;
      setPersistenceBusy(true);
      setPersistenceError(null);
      setPersistenceStatus("Loading conversation history...");
    });
    void askCfsConversationRepository
      .list({ pageSize: 100, signal: controller.signal })
      .then(async (result) => {
        if (controller.signal.aborted) return;
        setPersistenceRequestId(result.requestId);
        const conversations = [...result.data];
        const totalConversations = result.pagination?.total ?? conversations.length;
        const conversationPageSize = result.pagination?.pageSize ?? 100;
        for (
          let page = 2;
          conversations.length < totalConversations;
          page += 1
        ) {
          const next = await askCfsConversationRepository.list({
            page,
            pageSize: conversationPageSize,
            signal: controller.signal,
          });
          conversations.push(...next.data);
          setPersistenceRequestId(next.requestId);
          if (!next.data.length) break;
        }
        const conversation = conversations.find(
          (candidate) =>
            candidate.product_context.context_scope === contextScopeKey,
        );
        if (!conversation) {
          if (activeScopeRef.current !== contextScopeKey || conversationIdRef.current) return;
          setConversationId(null);
          setTurns([]);
          setAnswer(null);
          setContentScope(contextScopeKey);
          setPersistenceStatus(
            askCfsConversationRepository.provider === "demo"
              ? "Conversation history remains in this demo session."
              : "No saved conversation exists for this context yet.",
          );
          return;
        }
        let messageResult = await askCfsConversationRepository.listMessages(
          conversation.id,
          { page: 1, pageSize: 100, signal: controller.signal },
        );
        const total = messageResult.pagination?.total ?? messageResult.data.length;
        const pageSize = messageResult.pagination?.pageSize ?? 100;
        const lastPage = Math.max(1, Math.ceil(total / pageSize));
        if (lastPage > 1) {
          messageResult = await askCfsConversationRepository.listMessages(
            conversation.id,
            { page: lastPage, pageSize, signal: controller.signal },
          );
        }
        if (controller.signal.aborted || activeScopeRef.current !== contextScopeKey) return;
        if (
          conversationIdRef.current &&
          conversationIdRef.current !== conversation.id
        ) {
          return;
        }
        conversationIdRef.current = conversation.id;
        setConversationId(conversation.id);
        setTurns(conversationTurnsFromMessages(messageResult.data));
        setAnswer(null);
        setContentScope(contextScopeKey);
        setPersistenceRequestId(messageResult.requestId);
        setPersistenceStatus(
          askCfsConversationRepository.provider === "demo"
            ? "Conversation restored from this demo session."
            : "Conversation restored from CFS.",
        );
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        const failure = askCfsPersistenceFailure(caught);
        setPersistenceError(failure.message);
        setPersistenceRequestId(failure.requestId);
        setPersistenceStatus(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setPersistenceBusy(false);
      });
    return () => controller.abort();
  }, [
    canUseAskCfs,
    contextScopeKey,
    persistenceAttempt,
    principalError,
    principalRequestId,
    principalStatus,
    productAccessReady,
  ]);

  const persistSafeTurn = useCallback(async (pending: PendingAskPersistence) => {
    let activeConversationId = conversationIdRef.current;
    if (!activeConversationId) {
      const created = await askCfsConversationRepository.create({
        product_context: toJsonObject({
          app_mode: pending.appMode,
          filter_context: pending.filterContext,
          context_scope: pending.requestScope,
        }),
        project_id: pending.projectId,
        title: pending.question.slice(0, 240),
      });
      activeConversationId = created.data.id;
      if (activeScopeRef.current === pending.requestScope) {
        conversationIdRef.current = activeConversationId;
        setConversationId(activeConversationId);
        setPersistenceRequestId(created.requestId);
      }
    }

    let existing = await askCfsConversationRepository.listMessages(
      activeConversationId,
      { page: 1, pageSize: 100 },
    );
    const total = existing.pagination?.total ?? existing.data.length;
    const pageSize = existing.pagination?.pageSize ?? 100;
    const lastPage = Math.max(1, Math.ceil(total / pageSize));
    if (lastPage > 1) {
      existing = await askCfsConversationRepository.listMessages(
        activeConversationId,
        { page: lastPage, pageSize },
      );
    }
    if (activeScopeRef.current === pending.requestScope) {
      setPersistenceRequestId(existing.requestId);
    }
    const hasUser = existing.data.some(
      (message) =>
        message.role === "user" &&
        message.entity_context.client_turn_id === pending.turnId,
    );
    const hasAssistant = existing.data.some(
      (message) =>
        message.role === "assistant" &&
        message.entity_context.client_turn_id === pending.turnId,
    );

    if (!hasUser) {
      const userMessage = await askCfsConversationRepository.addMessage(
        activeConversationId,
        {
          entity_context: toJsonObject({
            app_mode: pending.appMode,
            client_turn_id: pending.turnId,
            filter_context: pending.filterContext,
            context_scope: pending.requestScope,
          }),
          provider_mode: "none",
          role: "user",
          safe_question: pending.question,
          safety_status: "accepted",
        },
      );
      if (activeScopeRef.current === pending.requestScope) {
        setPersistenceRequestId(userMessage.requestId);
      }
    }
    if (!hasAssistant) {
      const assistantMessage = await askCfsConversationRepository.addMessage(
        activeConversationId,
        {
          entity_context: toJsonObject({
            client_turn_id: pending.turnId,
            domains: pending.domains,
            focused_domain: pending.focusedDomain,
            related_layers: pending.relatedLayers,
          }),
          prompt_version: pending.promptVersion,
          provider_mode: pending.providerMode,
          role: "assistant",
          safe_answer_summary: pending.summary,
          safety_status: pending.safetyStatus,
        },
      );
      if (activeScopeRef.current === pending.requestScope) {
        setPersistenceRequestId(assistantMessage.requestId);
      }
    }
    return activeConversationId;
  }, []);

  const submit = useCallback(async (
    nextQuery = query,
    requestOverrides: Partial<CfsAiSearchRequest> = {},
  ) => {
    const trimmedQuery = nextQuery.trim();
    if (!trimmedQuery || scopedIsLoading || persistenceBusy || !canUseAskCfs) return;

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
      const turn = toConversationTurn(trimmedQuery, response);
      setAnswer(response);
      setTurns(
        [...scopedTurns, turn].slice(-5),
      );
      onResponse?.(response);
      setPersistenceBusy(true);
      setPersistenceError(null);
      setPersistenceStatus("Saving conversation...");
      const pending: PendingAskPersistence = {
        appMode,
        domains: response.domains.slice(0, 12),
        filterContext: safeAskCfsFilterContext(activeFilterContext),
        focusedDomain: turn.focused_domain ?? null,
        projectId: productProjectId(activeFilterContext.project_id),
        promptVersion: response.prompt_version ?? null,
        providerMode: response.provider,
        question: trimmedQuery,
        relatedLayers: response.related_layers.slice(0, 12),
        requestScope,
        safetyStatus: response.answer_mode === "safety" ? "safety" : "accepted",
        summary: turn.answer_summary ?? null,
        turnId: globalThis.crypto.randomUUID(),
      };
      pendingPersistenceRef.current = pending;
      try {
        await persistSafeTurn(pending);
        if (requestId === latestRequestId.current) {
          pendingPersistenceRef.current = null;
          setPersistenceStatus(
            askCfsConversationRepository.provider === "demo"
              ? "Conversation saved in this demo session."
              : "Conversation saved to CFS.",
          );
        }
      } catch (caught) {
        if (requestId === latestRequestId.current) {
          const failure = askCfsPersistenceFailure(caught);
          setPersistenceError(
            `Answer available; conversation history was not saved. ${failure.message}`,
          );
          setPersistenceRequestId(failure.requestId);
          setPersistenceStatus(null);
        }
      } finally {
        if (requestId === latestRequestId.current) setPersistenceBusy(false);
      }
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
    canUseAskCfs,
    contextScopeKey,
    filterContext,
    onResponse,
    persistSafeTurn,
    persistenceBusy,
    query,
    scopedIsLoading,
    scopedTurns,
  ]);

  useEffect(() => {
    if (
      !externalRequest ||
      !productAccessReady ||
      !canUseAskCfs ||
      persistenceBusy ||
      lastExternalRequestId.current === externalRequest.requestId
    ) {
      return;
    }

    lastExternalRequestId.current = externalRequest.requestId;
    setQuery(externalRequest.request.query);
    void submit(externalRequest.request.query, externalRequest.request);
  }, [
    canUseAskCfs,
    externalRequest,
    persistenceBusy,
    productAccessReady,
    submit,
  ]);

  useEffect(() => {
    if (!isLoading) return;
    const cachedTimer = window.setTimeout(() => setLoadingStage(1), 2000);
    const fallbackTimer = window.setTimeout(() => setLoadingStage(2), 5000);
    return () => {
      window.clearTimeout(cachedTimer);
      window.clearTimeout(fallbackTimer);
    };
  }, [isLoading]);

  const retryPersistence = async () => {
    const pending = pendingPersistenceRef.current;
    if (!pending) {
      if (principalStatus === "error") reloadPrincipal();
      setPersistenceAttempt((current) => current + 1);
      return;
    }
    setPersistenceBusy(true);
    setPersistenceError(null);
    setPersistenceStatus("Retrying conversation save...");
    try {
      await persistSafeTurn(pending);
      if (pendingPersistenceRef.current?.turnId === pending.turnId) {
        pendingPersistenceRef.current = null;
      }
      setPersistenceStatus(
        askCfsConversationRepository.provider === "demo"
          ? "Conversation saved in this demo session."
          : "Conversation saved to CFS.",
      );
    } catch (caught) {
      const failure = askCfsPersistenceFailure(caught);
      setPersistenceError(
        `Answer available; conversation history was not saved. ${failure.message}`,
      );
      setPersistenceRequestId(failure.requestId);
      setPersistenceStatus(null);
    } finally {
      setPersistenceBusy(false);
    }
  };

  const resetConversation = async () => {
    if (persistenceBusy || !canUseAskCfs) return;
    setPersistenceBusy(true);
    setPersistenceError(null);
    setPersistenceStatus("Resetting conversation...");
    try {
      if (conversationIdRef.current) {
        const result = await askCfsConversationRepository.reset(
          conversationIdRef.current,
        );
        setPersistenceRequestId(result.requestId);
      }
      latestRequestId.current += 1;
      pendingPersistenceRef.current = null;
      setTurns([]);
      setAnswer(null);
      setError(null);
      setIsLoading(false);
      setLoadingScope("");
      setQuery("");
      setContentScope(contextScopeKey);
      setPersistenceStatus(
        askCfsConversationRepository.provider === "demo"
          ? "Conversation reset for this demo session."
          : "Conversation reset in CFS.",
      );
    } catch (caught) {
      const failure = askCfsPersistenceFailure(caught);
      setPersistenceError(failure.message);
      setPersistenceRequestId(failure.requestId);
      setPersistenceStatus(null);
    } finally {
      setPersistenceBusy(false);
    }
  };

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit();
  }

  return (
    <section
      className="cfs-command-surface rounded-xl border-[#68d8ff]/20 p-4"
      data-conversation-id={conversationId ?? undefined}
      data-provider={askCfsConversationRepository.provider}
    >
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
        <label className="sr-only" htmlFor={inputId}>
          Ask CFS question
        </label>
        <input
          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-[#68d8ff]/55 focus:ring-2 focus:ring-[#68d8ff]/15"
          id={inputId}
          data-testid="ask-cfs-query"
          onChange={(event) => setQuery(event.target.value)}
          placeholder={inputPlaceholder}
          value={query}
        />
        <button
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#68d8ff]/30 bg-[#68d8ff]/12 px-4 py-3 text-sm font-semibold text-[#c6f4ff] transition hover:border-[#68d8ff]/55 hover:bg-[#68d8ff]/18 disabled:cursor-not-allowed disabled:opacity-50"
          data-testid="ask-cfs-submit"
          disabled={
            scopedIsLoading ||
            persistenceBusy ||
            !query.trim() ||
            !productAccessReady ||
            !canUseAskCfs
          }
          type="submit"
        >
          {scopedIsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Ask
        </button>
      </form>

      {persistenceError || persistenceStatus ? (
        <div
          aria-live="polite"
          className={`mt-3 rounded-lg border px-3 py-2 text-xs ${
            persistenceError
              ? "border-[#f87171]/25 bg-[#f87171]/10 text-[#fecaca]"
              : "border-[#68d8ff]/15 bg-[#68d8ff]/10 text-slate-300"
          }`}
          data-conversation-id={conversationId ?? undefined}
          data-request-id={persistenceRequestId ?? principalRequestId ?? undefined}
          data-testid="ask-cfs-persistence-status"
          role="status"
        >
          <span>{persistenceError ?? persistenceStatus}</span>
          {persistenceError ? (
            <button
              className="ml-2 font-semibold underline underline-offset-4"
              disabled={persistenceBusy}
              onClick={() => void retryPersistence()}
              type="button"
            >
              {persistenceError.startsWith("Answer available")
                ? "Retry save"
                : "Retry history"}
            </button>
          ) : null}
        </div>
      ) : null}

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
            data-conversation-id={conversationId ?? undefined}
            data-testid="ask-cfs-reset"
            disabled={persistenceBusy || !canUseAskCfs}
            onClick={() => void resetConversation()}
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

function conversationTurnsFromMessages(
  messages: AskCfsMessageRecord[],
): CfsAiConversationTurn[] {
  const turns: CfsAiConversationTurn[] = [];
  let pendingQuestion: string | null = null;
  for (const message of messages) {
    if (message.role === "user") {
      if (message.safe_question) pendingQuestion = message.safe_question;
      continue;
    }
    const focusedDomain = message.entity_context.focused_domain;
    turns.push({
      answer_summary: message.safe_answer_summary,
      focused_domain: typeof focusedDomain === "string" ? focusedDomain : null,
      query: pendingQuestion ?? "Previous Ask CFS question",
      related_layers: jsonStringArray(message.entity_context.related_layers),
    });
    pendingQuestion = null;
  }
  return turns.slice(-5);
}

const safeAskCfsFilterKeys = [
  "active_parcel_id",
  "active_project",
  "active_scenario",
  "mode",
  "project_id",
  "scenario_id",
  "selected_candidate",
  "selected_parcel_id",
  "selected_signal_id",
  "master_data_dataset_id",
  "master_data_dataset_name",
  "master_data_selected_fields",
  "master_data_filters",
  "master_data_join",
  "master_data_result_count",
  "master_data_match_percentage",
  "master_data_lineage",
] as const;

function safeAskCfsFilterContext(
  context: CfsAiSearchRequest["filter_context"],
): JsonObject {
  const safe: JsonObject = {};
  for (const key of safeAskCfsFilterKeys) {
    const value = context?.[key];
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      safe[key] = value;
    }
  }
  return safe;
}

function productProjectId(value: unknown) {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}

function jsonStringArray(value: JsonValue | undefined) {
  return Array.isArray(value) &&
    value.every((item): item is string => typeof item === "string")
    ? value
    : [];
}

function askCfsPersistenceFailure(caught: unknown) {
  const error = toProductApiError(caught);
  return { message: error.displayMessage, requestId: error.requestId };
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
