import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright-core";
import {
  archiveOwnedProductRecords,
  captureProductBaseline,
  verifyProductIsolation,
} from "./product-acceptance-isolation.mjs";
import {
  classifyArcGISConsoleFailure,
  classifyArcGISHttpFailure,
  classifyArcGISRequestFailure,
  classifyPageError,
  isApprovedPublicArcgisRequest,
  isExternalArcgisRequest,
  isMapDiagnosticRequest,
  mapDiagnosticRequestKey,
  redactMapDiagnosticText,
  redactMapDiagnosticUrl,
  REQUIRED_CFS_BASEMAP_ID,
  REQUIRED_CFS_CONTEXT_LAYER_IDS,
  REQUIRED_CFS_FALLBACK_LABEL_LAYER_ID,
  resolveMapDiagnostic,
  runClassificationSafetyMatrix,
} from "./map-acceptance-classification.mjs";

const ROOT = process.cwd();
const BASE_URL = (process.env.CFS_LOCAL_BASE_URL ?? "http://127.0.0.1:3000").replace(
  /\/$/,
  "",
);
const API_URL = (process.env.CFS_API_BASE_URL ?? "http://127.0.0.1:8000").replace(
  /\/$/,
  "",
);
const BASE_ORIGIN = new URL(BASE_URL).origin;
const API_ORIGIN = new URL(API_URL).origin;
const PARCEL = "CFS-PARCEL-0149726579";
const TEMP_PREFIX = `CFS-PRESENTATION-BROWSER-${Date.now()}`;
const ACCEPTANCE_PREFIX = `CFS-PRODUCT-V1-ACCEPTANCE-${Date.now()}`;
const REPORT_PATH = path.join(ROOT, "logs", "local-interactions.json");
const ownedIds = {
  planning: [],
  economics: [],
  report_bucket: [],
  ask_cfs: [],
};
const LIVE_MAP_CONTEXT_PATHS = new Set([
  "/demo-data/map_layers/demo_county_boundary.geojson",
  "/demo-data/map_layers/demo_hydrography.geojson",
  "/demo-data/map_layers/demo_municipal_boundaries.geojson",
  "/demo-data/map_layers/demo_place_labels.geojson",
  "/demo-data/map_layers/demo_transportation_context.geojson",
]);
const report = {
  checked_at: new Date().toISOString(),
  target: BASE_URL,
  api_target: API_URL,
  cases: [],
  api_paths: {},
  demo_data_requests: [],
  map_context_requests: [],
  external_requests: [],
  unexpected_external_arcgis_requests: [],
  diagnostics: {
    api_failures: [],
    console_messages: [],
    optional_public_basemap_console: [],
    optional_public_basemap_failures: [],
    map_diagnostics: [],
    page_errors: [],
    request_failures: [],
    request_loops: [],
  },
  degraded: {
    cases: [],
    demo_data_requests: [],
  },
  offline: {
    blocked_external_requests: [],
    cases: [],
  },
  current_case: null,
  failed_case: null,
  final_invariants: [],
  last_api_request_response: null,
  last_completed_case: null,
  navigation_attempts: [],
  ownership: {
    baseline: null,
    cleanup: [],
    owned_ids: ownedIds,
    verification: null,
  },
  disposable_cleanup: null,
};
const pendingMapDiagnostics = [];
const pageNavigationEpochs = new WeakMap();
const pageAcceptanceGenerations = new WeakMap();
const pageActiveAcceptanceGenerations = new WeakMap();
const pageProvenAcceptanceGenerations = new WeakMap();
const acceptanceTeardownPages = new WeakSet();
const lastMapHealthByPage = new WeakMap();
const pageSuccessfulRequestKeys = new WeakMap();
const pageAcceptedDownloadKeys = new WeakMap();
const pageDirectEvidence = new WeakMap();
const contextPendingRequiredApiRequests = new WeakMap();
let requestSequence = 0;
const requiredMapFailureProbe = process.argv.includes("--probe-required-map-failure");

const emptyDirectEvidence = () => ({
  apiFailures: 0,
  consoleErrors: 0,
  pageErrors: 0,
  privateArcgisRequests: 0,
  requiredRequestFailures: 0,
});

function directEvidenceForPage(page, generation = pageAcceptanceGenerations.get(page) ?? 0) {
  return {
    ...emptyDirectEvidence(),
    ...pageDirectEvidence.get(page)?.get(generation),
  };
}

function recordDirectEvidence(page, generation, key) {
  if (!page) return;
  const byGeneration = pageDirectEvidence.get(page) ?? new Map();
  const evidence = byGeneration.get(generation ?? 0) ?? emptyDirectEvidence();
  evidence[key] += 1;
  byGeneration.set(generation ?? 0, evidence);
  pageDirectEvidence.set(page, byGeneration);
}

function isRequiredApiWork(url) {
  return url.origin === API_ORIGIN;
}

async function waitForRequiredApiDrain(page, label) {
  const deadline = Date.now() + 60_000;
  let quietSince = null;
  while (Date.now() < deadline) {
    const pending = contextPendingRequiredApiRequests.get(page.context());
    if (!pending?.size) {
      quietSince ??= Date.now();
      if (Date.now() - quietSince >= 500) return;
    } else {
      quietSince = null;
    }
    await delay(100);
  }
  const pending = [...(contextPendingRequiredApiRequests.get(page.context())?.values() ?? [])]
    .slice(0, 8)
    .map(({ method, url }) => `${method} ${redactMapDiagnosticUrl(url)}`);
  throw new Error(`${label} left required API requests pending: ${pending.join(", ")}`);
}

function browserExecutable() {
  const candidates = [
    process.env.CFS_BROWSER_EXECUTABLE,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ].filter(Boolean);
  const executable = candidates.find(existsSync);
  assert(executable, "Chrome or Edge was not found. Set CFS_BROWSER_EXECUTABLE.");
  return executable;
}

async function waitForStack() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const [frontend, backend] = await Promise.all([
        fetch(BASE_URL),
        fetch(`${API_URL}/health/ready`),
      ]);
      if (frontend.ok && backend.ok) return;
    } catch {
      // Presentation services are still starting.
    }
    await delay(1_000);
  }
  throw new Error("Local presentation stack did not become ready.");
}

function isLoopback(url) {
  if (!/^https?:/i.test(url)) return true;
  return ["127.0.0.1", "localhost"].includes(new URL(url).hostname);
}

function beginAcceptanceTransition(page) {
  const generation = (pageAcceptanceGenerations.get(page) ?? 0) + 1;
  pageAcceptanceGenerations.set(page, generation);
  pageActiveAcceptanceGenerations.set(page, generation);
  return generation;
}

function completeAcceptanceTransition(page, generation) {
  assert.equal(
    pageAcceptanceGenerations.get(page),
    generation,
    "Acceptance navigation generation changed before its destination was verified.",
  );
  pageProvenAcceptanceGenerations.set(
    page,
    Math.max(pageProvenAcceptanceGenerations.get(page) ?? 0, generation),
  );
  if (pageActiveAcceptanceGenerations.get(page) === generation) {
    pageActiveAcceptanceGenerations.delete(page);
  }
}

function completeAcceptanceDownload(page, value) {
  const requestKey = mapDiagnosticRequestKey(new URL(value, page.url()), undefined, "GET");
  assert(requestKey, "Accepted download did not have a classifiable request key.");
  const accepted = pageAcceptedDownloadKeys.get(page) ?? new Map();
  accepted.set(requestKey, requestSequence);
  pageAcceptedDownloadKeys.set(page, accepted);
}

function attachDiagnostics(context, { ignoreApiFailures = false, offline = false } = {}) {
  const requestCounts = new Map();
  const requestMapLifecycle = new WeakMap();
  if (offline) {
    context.route(/^https?:\/\/(?!(?:127\.0\.0\.1|localhost)(?::\d+)?(?:\/|$))/i, async (route) => {
      const url = route.request().url();
      report.offline.blocked_external_requests.push(redactMapDiagnosticUrl(url));
      await route.abort("failed");
    });
  }

  context.on("request", (request) => {
    const url = request.url();
    const page = requestPage(request);
    const acceptanceGeneration = page
      ? (pageAcceptanceGenerations.get(page) ?? 0)
      : null;
    const approvedPublicArcgis = isApprovedPublicArcgisRequest(
      url,
      undefined,
      request.headers(),
    );
    const sequence = ++requestSequence;
    requestMapLifecycle.set(request, {
      acceptanceGeneration,
      navigationEpoch: page ? (pageNavigationEpochs.get(page) ?? 0) : null,
      observedAttempt: page
        ? page
            .evaluate(
              () =>
                document
                  .querySelector('[data-testid="cfs-arcgis-map"]')
                  ?.getAttribute("data-map-initialization-attempt") ?? null,
            )
            .catch(() => null)
        : Promise.resolve(null),
      page,
      pageUrl: page ? redactMapDiagnosticUrl(page.url()) : null,
      requestKey: mapDiagnosticRequestKey(url, undefined, request.method()),
      sequence,
    });
    if (isRequiredApiWork(new URL(url))) {
      const pending = contextPendingRequiredApiRequests.get(context) ?? new Map();
      pending.set(request, { method: request.method(), url });
      contextPendingRequiredApiRequests.set(context, pending);
    }
    if (/\/demo-data\//.test(url)) {
      const pathname = new URL(url).pathname;
      if (LIVE_MAP_CONTEXT_PATHS.has(pathname)) {
        report.map_context_requests.push(url);
      } else {
        report.demo_data_requests.push(url);
      }
    }
    if (/^https?:/i.test(url) && !isLoopback(url)) {
      report.external_requests.push(redactMapDiagnosticUrl(url));
    }
    if (
      isExternalArcgisRequest(url, { apiOrigin: API_ORIGIN, appOrigin: BASE_ORIGIN }) &&
      !approvedPublicArcgis
    ) {
      report.unexpected_external_arcgis_requests.push(redactMapDiagnosticUrl(url));
      recordDirectEvidence(page, acceptanceGeneration, "privateArcgisRequests");
    }
    if (new URL(url).origin === API_ORIGIN) {
      const key = `${request.method()} ${new URL(url).pathname}`;
      report.api_paths[key] = (report.api_paths[key] ?? 0) + 1;
      report.last_api_request_response = {
        method: request.method(),
        path: new URL(url).pathname,
        status: null,
      };
    }

    const pathname = /^https?:/i.test(url) ? new URL(url).pathname : url;
    if (
      ["/health/ready", "/health/database", "/ai/status"].includes(pathname) ||
      pathname === "/favicon.ico"
    ) {
      return;
    }
    const count = (requestCounts.get(url) ?? 0) + 1;
    requestCounts.set(url, count);
    if (count === 20) report.diagnostics.request_loops.push(redactMapDiagnosticUrl(url));
  });

  context.on("requestfailed", (request) => {
    const observation = requestMapLifecycle.get(request);
    const page = observation?.page ?? requestPage(request);
    contextPendingRequiredApiRequests.get(context)?.delete(request);
    const failure = {
      error: request.failure()?.errorText ?? "failed",
      headers: request.headers(),
      method: request.method(),
      url: request.url(),
    };
    if (ignoreApiFailures && new URL(failure.url).origin === API_ORIGIN) return;
    if (
      !isMapDiagnosticRequest(failure.url, {
        apiOrigin: API_ORIGIN,
        appOrigin: BASE_ORIGIN,
      })
    ) {
      if (
        ["GET", "HEAD"].includes(failure.method) &&
        failure.error === "net::ERR_ABORTED" &&
        /\.(?:pptx|xlsx)$/i.test(new URL(failure.url).pathname)
      ) {
        return;
      }
      report.diagnostics.request_failures.push(
        `${redactMapDiagnosticText(failure.error)} ${redactMapDiagnosticUrl(failure.url)}`,
      );
      return;
    }
    const diagnostic = classifyArcGISRequestFailure(failure, {
      apiOrigin: API_ORIGIN,
      appOrigin: BASE_ORIGIN,
    });
    if (
      ["optional_public_basemap_candidate", "required_request_cancellation_candidate"].includes(
        diagnostic.classification,
      )
    ) {
      if (page) {
        observeMapDiagnostic(diagnostic, {
          observation,
          page,
          source: "requestfailed",
        });
      }
      else {
        report.diagnostics.map_diagnostics.push({
          ...resolveMapDiagnostic(diagnostic, { health: {}, lifecycle: "unknown" }),
          source: "requestfailed",
        });
        report.diagnostics.request_failures.push(
          `Optional resource failure had no authoritative page for fallback health: ${redactMapDiagnosticUrl(failure.url)}`,
        );
      }
      return;
    }
    if (diagnostic.fatal === false) {
      report.diagnostics.map_diagnostics.push({ ...diagnostic, source: "requestfailed" });
      return;
    }
    report.diagnostics.map_diagnostics.push({ ...diagnostic, source: "requestfailed" });
    recordDirectEvidence(
      page,
      observation?.acceptanceGeneration,
      "requiredRequestFailures",
    );
    report.diagnostics.request_failures.push(
      `${diagnostic.reason} ${diagnostic.error ?? redactMapDiagnosticText(failure.error)} ${redactMapDiagnosticUrl(failure.url)}`,
    );
  });

  context.on("requestfinished", (request) => {
    contextPendingRequiredApiRequests.get(context)?.delete(request);
  });

  context.on("response", (response) => {
    const url = new URL(response.url());
    const observation = requestMapLifecycle.get(response.request());
    if (response.status() >= 200 && response.status() < 300 && observation?.page && observation.requestKey) {
      const successes = pageSuccessfulRequestKeys.get(observation.page) ?? new Map();
      successes.set(
        observation.requestKey,
        Math.max(successes.get(observation.requestKey) ?? 0, observation.sequence),
      );
      pageSuccessfulRequestKeys.set(observation.page, successes);
    }
    if (url.origin === API_ORIGIN) {
      report.last_api_request_response = {
        method: response.request().method(),
        path: url.pathname,
        status: response.status(),
      };
      if (response.status() >= 400 && !ignoreApiFailures) {
        report.diagnostics.api_failures.push(
          `${response.status()} ${response.request().method()} ${redactMapDiagnosticUrl(response.url())}`,
        );
        recordDirectEvidence(
          observation?.page ?? requestPage(response.request()),
          observation?.acceptanceGeneration,
          "apiFailures",
        );
      }
    }
    if (
      response.status() >= 400 &&
      !ignoreApiFailures &&
      isMapDiagnosticRequest(url, { apiOrigin: API_ORIGIN, appOrigin: BASE_ORIGIN })
    ) {
      const diagnostic = classifyArcGISHttpFailure(
        {
          headers: response.request().headers(),
          method: response.request().method(),
          status: response.status(),
          url: url.href,
        },
        { apiOrigin: API_ORIGIN, appOrigin: BASE_ORIGIN },
      );
      if (diagnostic.classification === "optional_public_basemap_candidate" && observation?.page) {
        observeMapDiagnostic(diagnostic, {
          observation,
          page: observation.page,
          source: "response",
        });
      } else {
        report.diagnostics.map_diagnostics.push({ ...diagnostic, source: "response" });
        if (diagnostic.fatal) {
          recordDirectEvidence(
            observation?.page ?? requestPage(response.request()),
            observation?.acceptanceGeneration,
            "requiredRequestFailures",
          );
          report.diagnostics.request_failures.push(
            `${diagnostic.reason} HTTP ${response.status()} ${redactMapDiagnosticUrl(url)}`,
          );
        }
      }
    }
  });

  context.on("page", (page) => {
    pageNavigationEpochs.set(page, 0);
    pageAcceptanceGenerations.set(page, 0);
    pageProvenAcceptanceGenerations.set(page, 0);
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) {
        pageNavigationEpochs.set(page, (pageNavigationEpochs.get(page) ?? 0) + 1);
      }
    });
    page.on("pageerror", (error) => {
      const diagnostic = classifyPageError(error);
      report.diagnostics.map_diagnostics.push({
        ...diagnostic,
        page_url: redactMapDiagnosticUrl(page.url()),
      });
      report.diagnostics.page_errors.push(
        `${redactMapDiagnosticUrl(page.url())} :: ${diagnostic.message}`,
      );
      recordDirectEvidence(page, pageAcceptanceGenerations.get(page), "pageErrors");
    });
    page.on("console", (message) => {
      if (!["error", "warning"].includes(message.type())) return;
      const text = message.text();
      if (/GL Driver Message.*GPU stall due to ReadPixels/.test(text)) return;
      if (/\[@arcgis\/core\/views\/MapView\] Font .* is not available/.test(text)) return;
      if (
        ignoreApiFailures &&
        message.location().url.startsWith(`${API_ORIGIN}/`)
      ) {
        return;
      }
      const diagnostic = classifyArcGISConsoleFailure({
        locationUrl: message.location().url,
        text,
      }, {
        apiOrigin: API_ORIGIN,
        appOrigin: BASE_ORIGIN,
      });
      if (diagnostic.classification === "optional_public_basemap_candidate") {
        observeMapDiagnostic(diagnostic, { page, source: "console" });
        return;
      }
      if (diagnostic.fatal === false) {
        report.diagnostics.map_diagnostics.push({
          ...diagnostic,
          page_url: redactMapDiagnosticUrl(page.url()),
          source: "console",
        });
        return;
      }
      report.diagnostics.map_diagnostics.push({
        ...diagnostic,
        page_url: redactMapDiagnosticUrl(page.url()),
        source: "console",
      });
      report.diagnostics.console_messages.push(
        `${redactMapDiagnosticUrl(page.url())} :: ${message.type()}: ${diagnostic.message ?? "[diagnostic redacted]"} (${diagnostic.reason})`,
      );
      recordDirectEvidence(page, pageAcceptanceGenerations.get(page), "consoleErrors");
    });
  });
}

function observeMapDiagnostic(diagnostic, { observation = null, page, source }) {
  const failureAcceptanceGeneration = pageActiveAcceptanceGenerations.get(page) ?? null;
  const acceptanceGeneration = observation
    ? observation.acceptanceGeneration
    : (pageProvenAcceptanceGenerations.get(page) ?? 0);
  const record = {
    ...diagnostic,
    acceptance_generation: acceptanceGeneration,
    failure_acceptance_generation: failureAcceptanceGeneration,
    navigation_epoch:
      observation?.navigationEpoch ?? (page ? (pageNavigationEpochs.get(page) ?? 0) : null),
    page_url:
      observation?.pageUrl ?? (page ? redactMapDiagnosticUrl(page.url()) : null),
    source,
  };
  report.diagnostics.map_diagnostics.push(record);
  pendingMapDiagnostics.push({
    acceptanceGeneration,
    failureAcceptanceGeneration,
    acceptanceTeardownObserved: acceptanceTeardownPages.has(page),
    page,
    record,
    requestKey: observation?.requestKey ?? record.request_key ?? null,
    requestSequence: observation?.sequence ?? null,
    observedAttempt:
      observation?.observedAttempt ??
      (page
        ? page
            .getByTestId("cfs-arcgis-map")
            .getAttribute("data-map-initialization-attempt")
            .catch(() => null)
        : Promise.resolve(null)),
    resolved: false,
  });
}

async function resolveMapDiagnosticsForPage(page, knownHealth = null) {
  const pending = pendingMapDiagnostics
    .filter((entry) => !entry.resolved && entry.page === page);
  if (!pending.length) return;
  const cachedHealth = lastMapHealthByPage.get(page);
  const currentHealth =
    knownHealth ??
    (!page?.isClosed() && (await page.getByTestId("cfs-arcgis-map").count())
      ? await readRequiredMapHealth(page)
      : null);
  const currentEpoch = pageNavigationEpochs.get(page) ?? 0;
  const provenAcceptanceGeneration = pageProvenAcceptanceGenerations.get(page) ?? 0;
  const baseHealth = currentHealth ?? cachedHealth;
  const directEvidence = directEvidenceForPage(page);
  const baseEvidence = baseHealth ? { ...baseHealth, ...directEvidence } : directEvidence;

  const resolveEntry = async (entry, health) => {
    const observedAttempt = await entry.observedAttempt;
    const crossedAcceptedNavigation =
      entry.record.navigation_epoch !== currentEpoch &&
      entry.acceptanceGeneration !== null &&
      entry.acceptanceGeneration < provenAcceptanceGeneration;
    const transitionGeneration = crossedAcceptedNavigation
      ? provenAcceptanceGeneration
      : entry.failureAcceptanceGeneration;
    const acceptedTransition =
      entry.acceptanceGeneration !== null &&
      transitionGeneration !== null &&
      transitionGeneration > 0 &&
      entry.acceptanceGeneration < transitionGeneration &&
      transitionGeneration <= provenAcceptanceGeneration;
    const stale =
      acceptedTransition ||
      entry.record.navigation_epoch !== currentEpoch ||
      (observedAttempt &&
        (currentHealth?.initializationAttempt ?? cachedHealth?.initializationAttempt) &&
        observedAttempt !==
          (currentHealth?.initializationAttempt ?? cachedHealth?.initializationAttempt)) ||
      (entry.record.classification === "optional_public_basemap_candidate" &&
        !currentHealth &&
        cachedHealth?.navigationEpoch !== currentEpoch &&
        provenAcceptanceGeneration > 0);
    const authoritativeHealth = currentHealth ?? (page.isClosed() || stale ? cachedHealth : null);
    const currentEvidence = authoritativeHealth
      ? {
          ...authoritativeHealth,
          ...health,
        }
      : health;
    const successfulSequence = entry.requestKey
      ? pageSuccessfulRequestKeys.get(page)?.get(entry.requestKey) ?? 0
      : 0;
    const acceptedDownload =
      entry.requestSequence !== null &&
      entry.requestKey !== null &&
      (pageAcceptedDownloadKeys.get(page)?.get(entry.requestKey) ?? -1) >=
        entry.requestSequence;
    const acceptedTeardown = entry.acceptanceTeardownObserved;
    const replacementSucceeded =
      entry.requestSequence !== null && successfulSequence > entry.requestSequence;
    if (
      entry.record.classification === "required_request_cancellation_candidate" &&
      !page.isClosed() &&
      !acceptedTransition &&
      !acceptedDownload &&
      !acceptedTeardown &&
      !replacementSucceeded &&
      !(stale && entry.record.stale_lifecycle_eligible === true)
    ) {
      return null;
    }
    Object.assign(entry.record, {
      acceptance_download_succeeded: acceptedDownload,
      acceptance_teardown_succeeded: acceptedTeardown,
      acceptance_transition_succeeded: acceptedTransition,
      proven_acceptance_generation: provenAcceptanceGeneration,
      replacement_succeeded: replacementSucceeded,
    });
    const result = resolveMapDiagnostic(entry.record, {
      health: currentEvidence,
      lifecycle: page.isClosed() && entry.acceptanceTeardownObserved
        ? "acceptance_teardown"
        : page.isClosed()
          ? stale
            ? "destroyed"
            : "unknown"
        : stale
          ? "stale"
          : "current",
    });
    Object.assign(entry.record, result, {
      current_attempt: currentEvidence.initializationAttempt ?? null,
      observed_attempt: observedAttempt,
    });
    entry.resolved = true;
    return result;
  };

  const required = pending.filter(
    (entry) => entry.record.classification === "required_request_cancellation_candidate",
  );
  const optional = pending.filter(
    (entry) => entry.record.classification !== "required_request_cancellation_candidate",
  );
  const fatalRequired = [];
  for (const entry of required) {
    const result = await resolveEntry(entry, baseEvidence);
    if (result?.fatal) {
      fatalRequired.push({ entry, result });
    }
  }
  const optionalEvidence = baseHealth ? baseEvidence : {};
  if (!required.some((entry) => !entry.resolved)) {
    for (const entry of optional) await resolveEntry(entry, optionalEvidence);
  }

  for (const { entry, result } of fatalRequired) {
    report.diagnostics.request_failures.push(`${entry.record.page_url} :: ${result.reason}`);
  }
  for (const entry of pending) {
    if (!entry.record.fatal && entry.record.classification === "optional_public_basemap_failure") {
      (entry.record.source === "console"
        ? report.diagnostics.optional_public_basemap_console
        : report.diagnostics.optional_public_basemap_failures
      ).push(entry.record);
    }
  }
}

async function resolveAllMapDiagnostics() {
  for (const page of new Set(
    pendingMapDiagnostics.filter((entry) => !entry.resolved).map((entry) => entry.page),
  )) {
    if (page) await resolveMapDiagnosticsForPage(page);
  }
}

async function readRequiredMapHealth(page) {
  const state = await page.evaluate(({ requiredBasemapId, requiredIds, requiredLabelId }) => {
    const map = document.querySelector('[data-testid="cfs-arcgis-map"]');
    const debug = window.__cfsGetMapDebugState?.();
    return {
      activeMapInteractive:
        map?.getAttribute("data-map-renderer") === "interactive" &&
        map.getAttribute("data-map-renderer-state") === "interactive_ready" &&
        map.getAttribute("data-map-view-ready-state") === "ready" &&
        debug?.ready === true &&
        debug?.readyState === "ready",
      currentMapAuthoritative:
        document.querySelectorAll('[data-testid="cfs-arcgis-map"]').length === 1 &&
        document.querySelectorAll(".esri-view-root").length === 1,
      initializationAttempt: map?.getAttribute("data-map-initialization-attempt") ?? null,
      requiredLayersReady: requiredIds.every((id) => {
        const layer = debug?.layers?.find((candidate) => candidate.id === id);
        return layer?.visible === true && Number(layer.graphicsCount) > 0;
      }) &&
        (map?.getAttribute("data-reference-basemap-state") !== "failed" ||
          (() => {
            const labels = debug?.layers?.find(
              (candidate) => candidate.id === requiredLabelId,
            );
            return labels?.visible === true && Number(labels.graphicsCount) > 0;
          })()),
      sameOriginBasemapReady: debug?.basemapId === requiredBasemapId,
      sameOriginContextReady:
        map?.getAttribute("data-context-ready") === "true" &&
        map.getAttribute("data-static-context-ready") === "true",
      parcelInteractionReady:
        document.querySelector('input[aria-label="Search parcels"]:not(:disabled)') !== null,
    };
  }, {
    requiredBasemapId: REQUIRED_CFS_BASEMAP_ID,
    requiredIds: REQUIRED_CFS_CONTEXT_LAYER_IDS,
    requiredLabelId: REQUIRED_CFS_FALLBACK_LABEL_LAYER_ID,
  });
  const health = {
    ...state,
    ...directEvidenceForPage(page),
    parcelInteractionRequired: true,
    navigationEpoch: pageNavigationEpochs.get(page) ?? 0,
    pageUrl: redactMapDiagnosticUrl(page.url()),
  };
  if (health.activeMapInteractive && health.currentMapAuthoritative) {
    lastMapHealthByPage.set(page, health);
  }
  return health;
}

function requestPage(request) {
  try {
    return request.frame().page();
  } catch {
    return null;
  }
}

async function runCase(product, name, run, offline = false) {
  const started = Date.now();
  report.current_case = { name, product };
  try {
    await run();
  } catch (error) {
    report.failed_case = {
      error: error instanceof Error ? error.stack ?? error.message : String(error),
      name,
      product,
    };
    throw error;
  }
  const result = { product, name, response_ms: Date.now() - started };
  (offline ? report.offline.cases : report.cases).push(result);
  report.last_completed_case = { name, product };
  report.current_case = null;
  console.log(`PASS ${offline ? "Offline " : ""}${product}: ${name} (${result.response_ms}ms)`);
}

async function goto(page, query = "") {
  await waitForMapLifecycle(page);
  await waitForRequiredApiDrain(page, "Route transition");
  const generation = beginAcceptanceTransition(page);
  await page.goto(`${BASE_URL}/${query}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Return to CFS Home" }).waitFor({
    timeout: 45_000,
  });
  await delay(750);
  await assertHealthyPage(page);
  if (new URL(page.url()).searchParams.get("app") === "planning") {
    await waitForMapLifecycle(page, generation);
  } else {
    completeAcceptanceTransition(page, generation);
    await resolveMapDiagnosticsForPage(page);
  }
}

async function reloadAccepted(page) {
  await waitForMapLifecycle(page);
  await waitForRequiredApiDrain(page, "Page reload");
  const generation = beginAcceptanceTransition(page);
  await page.reload({ waitUntil: "domcontentloaded" });
  await assertHealthyPage(page);
  if (new URL(page.url()).searchParams.get("app") === "planning") {
    await waitForMapLifecycle(page, generation);
  } else {
    completeAcceptanceTransition(page, generation);
    await resolveMapDiagnosticsForPage(page);
  }
}

async function waitForMapLifecycle(page, acceptedGeneration = null) {
  if (!(await page.getByTestId("cfs-arcgis-map").count())) {
    if (acceptedGeneration !== null) completeAcceptanceTransition(page, acceptedGeneration);
    await resolveMapDiagnosticsForPage(page);
    return;
  }
  await page.waitForFunction(
    () => {
      const map = document.querySelector('[data-testid="cfs-arcgis-map"]');
      if (!map) return true;
      const viewState = map.getAttribute("data-arcgis-view-state");
      if (viewState === "failed") return true;
      return (
        viewState === "ready" &&
        map.getAttribute("data-map-renderer") === "interactive" &&
        map.getAttribute("data-map-view-ready-state") === "ready" &&
        ["disabled", "failed", "ready"].includes(
          map.getAttribute("data-reference-basemap-state"),
        )
      );
    },
    undefined,
    { timeout: 60_000 },
  );
  const health = await readRequiredMapHealth(page);
  if (acceptedGeneration !== null) completeAcceptanceTransition(page, acceptedGeneration);
  await resolveMapDiagnosticsForPage(page, health);
}

async function closeAcceptedContext(context) {
  const pages = context.pages().filter((page) => !page.isClosed());
  for (const page of pages) {
    await waitForMapLifecycle(page);
    await waitForRequiredApiDrain(page, "Context teardown");
    acceptanceTeardownPages.add(page);
  }
  await context.close();
}

async function navigateToHome(page) {
  await waitForMapLifecycle(page);
  await waitForRequiredApiDrain(page, "Home transition");
  const generation = beginAcceptanceTransition(page);
  const home = page.getByRole("button", { name: "Return to CFS Home" });
  const transition = {
    attempts: [],
    from_url: page.url(),
    started_at: new Date().toISOString(),
  };
  report.navigation_attempts.push(transition);
  await home.waitFor({ timeout: 45_000 });
  await page.waitForLoadState("load");

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const result = { attempt, clicked_at: new Date().toISOString(), from_url: page.url() };
    transition.attempts.push(result);
    await home.click();
    try {
      await page.waitForFunction(
          () =>
            location.pathname === "/" &&
            !new URLSearchParams(location.search).has("app") &&
            document.querySelector('[data-testid="cfs-master-home"]') &&
          !document.querySelector('[aria-label="Return to CFS Home"]'),
        null,
        { timeout: 10_000 },
      );
      result.status = "PASS";
      result.to_url = page.url();
      transition.completed_at = new Date().toISOString();
      transition.status = "PASS";
      completeAcceptanceTransition(page, generation);
      await resolveMapDiagnosticsForPage(page);
      return;
    } catch (error) {
      result.error = error instanceof Error ? error.message : String(error);
      result.status = "NO_TRANSITION";
      result.to_url = page.url();
    }
  }

  transition.completed_at = new Date().toISOString();
  transition.status = "FAIL";
  throw new Error(`Home navigation did not change route and module state: ${JSON.stringify(transition)}`);
}

async function navigateInvestmentPage(page, name, pageId) {
  const button = page
    .getByLabel("CFS Investments navigation")
    .getByRole("button", { name, exact: true });
  await page.waitForFunction(
    (label) => {
      const element = document.querySelector(`[aria-label="CFS Investments navigation"] button[aria-label="${label}"]`);
      return element && Object.keys(element).some((key) => key.startsWith("__reactProps$"));
    },
    name,
    { timeout: 30_000 },
  );
  await button.click();
  await page.waitForFunction(
    (expectedPage) => new URLSearchParams(location.search).get("investmentPage") === expectedPage,
    pageId,
    { timeout: 30_000 },
  );
  const destination = page.locator(`main[data-investment-page="${pageId}"]`);
  await destination.waitFor({ state: "visible", timeout: 30_000 });
  return destination;
}

async function assertHealthyPage(page) {
  const text = await page.locator("body").innerText();
  assert(!text.includes("Portfolio Demo"), "Live page displayed Portfolio Demo.");
  assert(!/\b(?:NaN|undefined)\b/i.test(text), "Visible page contains NaN or undefined.");
  assert(
    !/Application error|Internal Server Error|Unhandled Runtime Error/i.test(text),
    "Visible application error.",
  );
}

async function assertLiveStatus(page) {
  const controls = page.getByRole("button", { name: /Open .* controls/i });
  await controls.waitFor();
  const label = await controls.getAttribute("aria-label");
  await page.waitForFunction(
    (ariaLabel) => {
      const element = document.querySelector(`button[aria-label="${ariaLabel}"]`);
      return element && Object.keys(element).some((key) => key.startsWith("__reactProps$"));
    },
    label,
  );
  if ((await controls.getAttribute("aria-expanded")) !== "true") await controls.click();
  await page.waitForFunction(
    (ariaLabel) =>
      document.querySelector(`button[aria-label="${ariaLabel}"]`)?.getAttribute("aria-expanded") === "true",
    label,
  );
  const panel = page.getByTestId("local-runtime-status");
  await panel.waitFor();
  await panel.getByText("Frontend Ready", { exact: true }).waitFor();
  await page.getByTestId("local-runtime-api").getByText("Ready", { exact: true }).waitFor({
    timeout: 20_000,
  });
  await page
    .getByTestId("local-runtime-database")
    .getByText("Connected", { exact: true })
    .waitFor();
  await page
    .getByTestId("local-runtime-ask")
    .getByText("Grounded local answers", { exact: true })
    .waitFor();
  await panel.getByText("Local neutral background", { exact: true }).waitFor();
  await controls.click();
}

async function askQuestions(page, questions, { expectPersistence = true } = {}) {
  let conversationId = null;
  for (const [index, question] of questions.entries()) {
    const textbox = page.getByRole("textbox", { name: "Ask CFS question" }).first();
    await textbox.waitFor({ timeout: 45_000 });
    if (index === 0) await waitForRequiredApiDrain(page, "Ask CFS startup");
    const panel = textbox.locator("xpath=ancestor::section[1]");
    conversationId ??= await panel.getAttribute("data-conversation-id");
    if (conversationId) {
      assert(
        ownedIds.ask_cfs.includes(conversationId),
        `Ask CFS selected non-owned conversation ${conversationId}.`,
      );
    }
    const submittedQuestion =
      index === 0 && !conversationId ? `${ACCEPTANCE_PREFIX}: ${question}` : question;
    await textbox.fill(submittedQuestion);
    const createdPromise = !expectPersistence || conversationId
      ? Promise.resolve(null)
      : page.waitForResponse(
          (response) =>
            new URL(response.url()).pathname === "/api/v1/ask-cfs/conversations" &&
            response.request().method() === "POST",
          { timeout: 90_000 },
        );
    const messagePromise = expectPersistence
      ? page.waitForResponse(
          (response) =>
            /^\/api\/v1\/ask-cfs\/conversations\/[0-9a-f-]+\/messages$/i.test(
              new URL(response.url()).pathname,
            ) && response.request().method() === "POST",
          { timeout: 90_000 },
        )
      : Promise.resolve(null);
    const [request, created, message] = await Promise.all([
      page.waitForRequest(
        (candidate) =>
          new URL(candidate.url()).pathname.replace(/\/$/, "") === "/ai/search" &&
          candidate.method() === "POST",
        { timeout: 30_000 },
      ),
      createdPromise,
      messagePromise,
      panel.getByRole("button", { name: "Ask", exact: true }).click(),
    ]);
    if (created) {
      assert.equal(created.status(), 201, "Ask CFS conversation create failed.");
      const payload = await created.json();
      conversationId = payload.data?.id;
      assert.match(conversationId ?? "", /^[0-9a-f-]{36}$/i, "Ask CFS create omitted its UUID.");
      assert.match(payload.data?.title ?? "", /CFS-PRODUCT-V1-ACCEPTANCE-\d+/, "Ask CFS record omitted its ownership marker.");
      rememberOwned("ask_cfs", conversationId);
    }
    if (expectPersistence) {
      assert(conversationId, "Ask CFS did not expose an owned conversation UUID.");
      assert.equal(message.status(), 201, "Ask CFS message persistence failed.");
      assert.equal(
        new URL(message.url()).pathname,
        `/api/v1/ask-cfs/conversations/${conversationId}/messages`,
        "Ask CFS message targeted a different conversation.",
      );
      await panel
        .locator(
          `[data-testid="ask-cfs-persistence-status"][data-conversation-id="${conversationId}"]`,
        )
        .waitFor({ timeout: 45_000 });
    }
    const response = await request.response();
    assert(response, "Ask CFS request completed without an HTTP response.");
    assert.equal(response.status(), 200, `Ask CFS returned ${response.status()}.`);
    const body = await response.json();
    assert(body.answer?.trim().length > 20, "Ask CFS answer was empty.");
    assert(body.evidence?.length > 0, "Ask CFS answer had no evidence.");
    assert(body.caveats?.length > 0, "Ask CFS answer had no caveats.");
    await panel.getByText("Grounded CFS analysis", { exact: true }).waitFor();
    await panel.getByText(/^Evidence used \([1-9]\d*\)$/).waitFor();
    await panel.getByText("Limitations", { exact: true }).waitFor();
  }
  return conversationId;
}

async function isolateAskCfsConversationLists(context) {
  const pattern = new RegExp(
    `^${API_ORIGIN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/api/v1/ask-cfs/conversations(?:\\?.*)?$`,
    "i",
  );
  await context.route(pattern, async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const response = await route.fetch();
    const payload = await response.json();
    assert(response.ok(), `Ask CFS isolation list returned ${response.status()}.`);
    const data = (payload.data ?? []).filter((record) => ownedIds.ask_cfs.includes(record.id));
    await route.fulfill({
      body: JSON.stringify({
        ...payload,
        data,
        pagination: { ...(payload.pagination ?? {}), total: data.length },
      }),
      response,
    });
  });
}

function rememberOwned(kind, id) {
  if (!ownedIds[kind].includes(id)) ownedIds[kind].push(id);
}

async function selectParcel(
  page,
  { expectedProvider, parcelId = PARCEL, waitForSelected = true },
) {
  assert.equal(
    expectedProvider,
    "local_api",
    `Local parcel selection expected local_api, received ${expectedProvider ?? "no provider"}.`,
  );
  await waitForRequiredApiDrain(page, "Parcel lookup startup");
  const generation = beginAcceptanceTransition(page);
  const search = page.getByRole("combobox", { name: "Search parcels" }).first();
  const responsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname.replace(/\/$/, "") === "/parcels/search" &&
      response.request().method() === "GET",
    { timeout: 60_000 },
  );
  await search.click();
  await search.fill("");
  await delay(100);
  await search.fill(parcelId);
  const response = await responsePromise;
  assert.equal(response.status(), 200, `Parcel search returned ${response.status()}.`);
  const option = page
    .locator("#top-parcel-search-results")
    .getByRole("option")
    .filter({ hasText: parcelId })
    .first();
  await option.waitFor({ timeout: 30_000 });
  await option.click();
  if (waitForSelected) {
    await page.getByText(new RegExp(`Selected parcel: ${parcelId}`, "i")).first().waitFor({
      timeout: 30_000,
    });
  }
  completeAcceptanceTransition(page, generation);
}

async function toggleLayer(page, title, group) {
  let toggle = page.getByRole("button", { name: `Show ${title}`, exact: true });
  if (!(await toggle.count()) || !(await toggle.first().isVisible())) {
    const summary = page.locator("summary").filter({ hasText: group }).first();
    if (await summary.count()) await summary.click();
    toggle = page.getByRole("button", { name: `Show ${title}`, exact: true });
  }
  await toggle.waitFor({ timeout: 20_000 });
  await toggle.click();
  await page.getByRole("button", { name: `Hide ${title}`, exact: true }).waitFor();
  await page.getByRole("button", { name: `Hide ${title}`, exact: true }).click();
}

async function planningWorkflow(page) {
  await goto(page, "?app=planning");
  await runCase("Planning", "live status and local map", async () => {
    await assertLiveStatus(page);
    await page.getByTestId("command-center-explore-intelligence").click();
    const map = page.getByLabel("Cabarrus County ArcGIS MapView");
    await map.waitFor({ timeout: 45_000 });
    await page.locator(".esri-view-root").waitFor({ timeout: 45_000 });
    const screenshot = await map.screenshot();
    assert(screenshot.length > 10_000, "Local map screenshot was unexpectedly blank.");
  });

  await runCase("Planning", "canonical parcel and local layers", async () => {
    await selectParcel(page, { expectedProvider: "local_api" });
    await waitForMapLifecycle(page);
    report.map_verification = await page.getByTestId("cfs-arcgis-map").evaluate((map) => ({
      contextReady: map.getAttribute("data-context-ready"),
      referenceBasemapState: map.getAttribute("data-reference-basemap-state"),
      renderer: map.getAttribute("data-map-renderer"),
      rendererState: map.getAttribute("data-map-renderer-state"),
      viewReadyState: map.getAttribute("data-map-view-ready-state"),
    }));
    assert.deepEqual(
      {
        contextReady: report.map_verification.contextReady,
        renderer: report.map_verification.renderer,
        rendererState: report.map_verification.rendererState,
        viewReadyState: report.map_verification.viewReadyState,
      },
      {
        contextReady: "true",
        renderer: "interactive",
        rendererState: "interactive_ready",
        viewReadyState: "ready",
      },
      "Parcel focus did not preserve the interactive same-origin map.",
    );
    const expand = page.getByRole("button", { name: "Expand map layers panel" });
    if (await expand.count()) await expand.click();
    await toggleLayer(page, "Development Hotspots", "Development Activity");
    await toggleLayer(page, "Floodplain Review", "Floodplain Review");
    await toggleLayer(page, "School Utilization + Permit Pressure", "Schools");
  });

  await runCase("Planning", "Indicator Center and three grounded questions", async () => {
    await page.getByTestId("command-center-indicator-center").click();
    await page.getByTestId("indicator-center-dashboard").waitFor({ timeout: 30_000 });
    const conversationId = await askQuestions(page, [
      "What should I inspect first for this parcel?",
      "What does the flood review indicate?",
      "What does the school-capacity context mean?",
    ]);
    const askPanel = page
      .getByRole("textbox", { name: "Ask CFS question" })
      .first()
      .locator("xpath=ancestor::section[1]");
    const resetResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname ===
          `/api/v1/ask-cfs/conversations/${conversationId}/reset` &&
        response.request().method() === "POST",
      { timeout: 45_000 },
    );
    await askPanel.getByRole("button", { name: "Reset conversation" }).click();
    const reset = await resetResponse;
    assert.equal(reset.status(), 200, "Owned Ask CFS reset failed.");
    assert.equal((await reset.json()).data?.id, conversationId, "Ask CFS reset targeted a different conversation.");
    await askPanel
      .getByText("Grounded CFS analysis", { exact: true })
      .waitFor({ state: "hidden" });
  });

  await runCase("Planning", "Model Lab and Planning Snapshot", async () => {
    let snapshotId = null;
    let snapshotArchived = false;
    let primaryFailure = null;
    try {
      await page.getByRole("button", { name: /Workspace:/ }).click();
      await page.getByTestId("command-center-model-lab").click();
      const expand = page.getByRole("button", { name: "Expand Model Lab panel" }).first();
      if (await expand.count()) await expand.click();
      await page.getByTestId("model-lab-controls").waitFor({ timeout: 30_000 });
      await page.getByRole("button", { name: /Workspace:/ }).click();
      const createResponse = page.waitForResponse(
        (response) =>
          new URL(response.url()).origin === API_ORIGIN &&
          new URL(response.url()).pathname === "/api/v1/planning/snapshots" &&
          response.request().method() === "POST",
        { timeout: 60_000 },
      );
      await page.getByRole("button", { name: "Save Planning Snapshot" }).click();
      const created = await createResponse;
      const createdPayload = await created.json();
      assert.equal(created.status(), 201, "Planning Snapshot create failed.");
      assert.match(createdPayload.data?.id ?? "", /^[0-9a-f-]{36}$/i, "Planning Snapshot create omitted its UUID.");
      snapshotId = createdPayload.data.id;
      rememberOwned("planning", snapshotId);

      await page.getByRole("button", { name: /Planning Snapshot:/ }).click();
      const library = page.getByTestId("planning-snapshot-library");
      await library.getByText("Planning Snapshot Library", { exact: true }).waitFor();
      const card = library.locator(
        `[data-testid="planning-snapshot-card"][data-snapshot-id="${snapshotId}"]`,
      );
      await card.waitFor({ timeout: 45_000 });
      const archiveResponse = page.waitForResponse(
        (response) =>
          new URL(response.url()).origin === API_ORIGIN &&
          new URL(response.url()).pathname === `/api/v1/planning/snapshots/${snapshotId}/archive` &&
          response.request().method() === "POST",
        { timeout: 60_000 },
      );
      page.once("dialog", (dialog) => dialog.accept());
      await card.getByTestId("planning-snapshot-archive").click();
      const archived = await archiveResponse;
      const archivedPayload = await archived.json();
      assert.equal(archived.status(), 200, `Planning Snapshot ${snapshotId} archive failed.`);
      assert.equal(archivedPayload.data?.id, snapshotId, "Planning Snapshot archive returned the wrong record.");
      assert(archivedPayload.data?.archived_at, "Planning Snapshot archive omitted archived_at.");
      snapshotArchived = true;
      await library
        .getByTestId("planning-persistence-status")
        .filter({ hasText: "Planning Snapshot archived." })
        .waitFor();
    } catch (error) {
      primaryFailure = error;
    }

    let cleanupFailure = null;
    if (snapshotId) {
      try {
        if (!snapshotArchived) await archivePlanningSnapshot(snapshotId);
        await verifyPlanningSnapshotArchived(snapshotId, snapshotArchived ? "ui_archive" : "api_archive");
      } catch (error) {
        cleanupFailure = error;
      }
    }
    if (primaryFailure && cleanupFailure) {
      throw new AggregateError([primaryFailure, cleanupFailure], "Planning Snapshot interaction and cleanup both failed.");
    }
    if (primaryFailure) throw primaryFailure;
    if (cleanupFailure) throw cleanupFailure;
  });

  await reloadAccepted(page);
  await navigateToHome(page);
}

async function economicsWorkflow(page) {
  const intelligenceResponsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/economics/intelligence" &&
      response.request().method() === "GET",
    { timeout: 60_000 },
  );
  await goto(page, `?app=economics&parcel=${PARCEL}`);
  await runCase("Economics", "database KPIs and parcel context", async () => {
    const intelligenceResponse = await intelligenceResponsePromise;
    assert.equal(intelligenceResponse.status(), 200, "Economics intelligence request failed.");
    const intelligence = await intelligenceResponse.json();
    const signal = (intelligence.parcel_economic_signals ?? intelligence.signals ?? []).find(
      (candidate) => candidate.parcel_id && typeof candidate.assessed_value === "number",
    );
    assert(signal, "Economics intelligence returned no parcel with assessed-value context.");
    const assessedValue = `$${signal.assessed_value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

    await page.getByRole("button", { name: /Economic Dashboard:/ }).click();
    await page.getByRole("heading", { name: "Economic Dashboard", exact: true }).first().waitFor({
      timeout: 45_000,
    });
    await page.getByText("Executive Economic Signals", { exact: true }).waitFor();
    await selectParcel(page, {
      expectedProvider: "local_api",
      parcelId: signal.parcel_id,
      waitForSelected: false,
    });
    const context = page.getByTestId("parcel-economic-context");
    await context
      .getByRole("heading", { name: `Parcel Economic Context: ${signal.parcel_id}` })
      .waitFor({ timeout: 30_000 });
    const metric = context.getByText("Assessed value context", { exact: true }).locator("..");
    await metric.getByText(assessedValue, { exact: true }).waitFor();
  });

  await runCase("Economics", "scenario, report surface, and export", async () => {
    await page.getByRole("button", { name: /Power BI & Tools:/ }).click();
    await page.getByRole("tab", { name: "Data Tables" }).click();
    const tools = page.locator('details[data-econ-tour="advanced-tools"]');
    await tools.locator(":scope > summary").click();
    await tools.getByRole("button", { name: /Scenario Model/i }).click();
    const output = page.getByTestId("scenario-output");
    await output.waitFor();
    const before = await output.innerText();
    const scenario = page.getByRole("combobox", { name: "Development type" });
    const options = await scenario.locator("option").evaluateAll((nodes) =>
      nodes.map((node) => node.value),
    );
    const current = await scenario.inputValue();
    await scenario.selectOption(options.find((value) => value !== current) ?? options[0]);
    assert.notEqual(await output.innerText(), before, "Scenario output did not update.");

    await tools.getByRole("button", { name: /^Power BI Export/ }).click();
    const link = page.getByRole("link", { name: /Download CSV/i }).first();
    const downloadUrl = await link.getAttribute("href");
    assert(downloadUrl, "Economics export omitted its download URL.");
    const downloadPromise = page.waitForEvent("download");
    await link.click();
    const download = await downloadPromise;
    const downloadPath = await download.path();
    assert(downloadPath && statSync(downloadPath).size > 20, "Economics export was empty.");
    completeAcceptanceDownload(page, downloadUrl);
  });

  await runCase("Economics", "three grounded questions", async () => {
    await askQuestions(page, [
      "What does revenue per acre mean?",
      "Why is this parcel classified as underbuilt?",
      "Which values are observed and which are derived?",
    ]);
  });

  await reloadAccepted(page);
  await navigateToHome(page);
}

async function cleanupIntake(candidateId) {
  const response = await fetch(`${API_URL}/investment/intake/${encodeURIComponent(candidateId)}`, {
    method: "DELETE",
  });
  assert.equal(response.status, 200, "Disposable browser intake cleanup failed.");
  const verify = await fetch(`${API_URL}/investment/intake/${encodeURIComponent(candidateId)}`);
  assert.equal(verify.status, 404, "Disposable browser intake still exists.");
  report.disposable_cleanup = {
    ...report.disposable_cleanup,
    candidate_id: candidateId,
    deleted: true,
    verified: true,
  };
}

async function archivePlanningSnapshot(snapshotId) {
  const response = await fetch(
    `${API_URL}/api/v1/planning/snapshots/${encodeURIComponent(snapshotId)}/archive`,
    {
      headers: { Accept: "application/json", "X-Request-ID": `${TEMP_PREFIX}-planning-cleanup` },
      method: "POST",
      signal: AbortSignal.timeout(30_000),
    },
  );
  const payload = await response.json();
  assert(response.ok, `Planning Snapshot cleanup failed for ${snapshotId}: HTTP ${response.status}`);
  assert.equal(payload.data?.id, snapshotId, "Planning Snapshot cleanup archived the wrong record.");
  assert(payload.data?.archived_at, "Planning Snapshot cleanup omitted archived_at.");
}

async function verifyPlanningSnapshotArchived(snapshotId, method) {
  const [recordResponse, auditResponse] = await Promise.all([
    fetch(`${API_URL}/api/v1/planning/snapshots/${encodeURIComponent(snapshotId)}`, {
      headers: { Accept: "application/json", "X-Request-ID": `${TEMP_PREFIX}-planning-verify` },
      signal: AbortSignal.timeout(30_000),
    }),
    fetch(`${API_URL}/api/v1/audit?limit=100&object_id=${encodeURIComponent(snapshotId)}`, {
      headers: { Accept: "application/json", "X-Request-ID": `${TEMP_PREFIX}-planning-audit` },
      signal: AbortSignal.timeout(30_000),
    }),
  ]);
  const [record, audit] = await Promise.all([recordResponse.json(), auditResponse.json()]);
  assert(recordResponse.ok, `Planning Snapshot cleanup verification failed for ${snapshotId}.`);
  assert(auditResponse.ok, `Planning Snapshot archive audit lookup failed for ${snapshotId}.`);
  assert(record.data?.archived_at, `Planning Snapshot ${snapshotId} remains active.`);
  assert(
    audit.data?.some((event) => event.action === "archive"),
    `Planning Snapshot ${snapshotId} has no archive audit event.`,
  );
  report.disposable_cleanup = {
    ...report.disposable_cleanup,
    planning_snapshot_audit_verified: true,
    planning_snapshot_id: snapshotId,
    planning_snapshot_method: method,
    planning_snapshot_verified: true,
  };
}

async function cleanupRecentWork() {
  const response = await fetch(`${API_URL}/investment/recent-work`);
  assert.equal(response.status, 200, "Recent-work cleanup scan failed.");
  const items = (await response.json()).items ?? [];
  const disposable = items.filter((item) => JSON.stringify(item).includes(TEMP_PREFIX));
  for (const item of disposable) {
    const deleted = await fetch(
      `${API_URL}/investment/recent-work/${encodeURIComponent(item.id)}`,
      { method: "DELETE" },
    );
    assert.equal(deleted.status, 200, "Disposable recent-work cleanup failed.");
  }
  const verify = await fetch(`${API_URL}/investment/recent-work`);
  assert.equal(verify.status, 200, "Recent-work cleanup verification failed.");
  assert(
    !JSON.stringify(await verify.json()).includes(TEMP_PREFIX),
    "Disposable recent-work item still exists.",
  );
  report.disposable_cleanup = {
    ...report.disposable_cleanup,
    recent_work_deleted: disposable.length,
    recent_work_verified: true,
  };
}

async function investmentsWorkflow(page) {
  await goto(page, "?app=consulting&investmentPage=overview");
  await runCase("Investments", "Projects and CASE-1 continue", async () => {
    await page
      .getByText("CFS Large Development-Land Acquisition Case Study", { exact: false })
      .first()
      .waitFor({ timeout: 45_000 });
    await navigateInvestmentPage(page, "Projects", "engagements");
    const library = page.getByLabel("Case Studies library");
    if (await library.count()) {
      await library.getByRole("button", { name: "Continue", exact: true }).first().click();
      await page.getByLabel("Case study workspace").waitFor();
    }
  });

  await runCase("Investments", "Find Sites and Property Review", async () => {
    const findSites = await navigateInvestmentPage(page, "Find Sites", "area-radar");
    const responsePromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/investment/radar/search" &&
        response.request().method() === "POST",
      { timeout: 60_000 },
    );
    await findSites.getByRole("button", { name: "Run Screening", exact: true }).click();
    assert.equal((await responsePromise).status(), 200);
    const review = page.getByRole("button", { name: "Open Property Review" }).first();
    await review.waitFor({ timeout: 30_000 });
    await review.click();
    await page.getByRole("tablist", { name: "Property Research tabs" }).waitFor();
  });

  await runCase("Investments", "safe disposable backend mutation", async () => {
    const findSites = await navigateInvestmentPage(page, "Find Sites", "area-radar");
    await findSites.getByRole("button", { name: /Add External Opportunity/i }).click();
    const form = page.locator('main[data-investment-page="intake"]');
    await form.getByRole("textbox", { name: "Candidate label" }).fill(TEMP_PREFIX);
    await form.getByRole("textbox", { name: "Parcel ID" }).fill(PARCEL);
    const responsePromise = page.waitForResponse(
      (response) =>
        response.url() === `${API_URL}/investment/intake` &&
        response.request().method() === "POST",
      { timeout: 60_000 },
    );
    await form.getByRole("button", { name: "Add Candidate", exact: true }).click();
    const response = await responsePromise;
    assert.equal(response.status(), 200);
    const body = await response.json();
    const candidateId = body?.candidate?.id;
    assert(candidateId, "Disposable candidate response omitted its id.");
    try {
      const detail = await fetch(
        `${API_URL}/investment/intake/${encodeURIComponent(candidateId)}`,
      );
      assert.equal(detail.status, 200);
      assert.equal((await detail.json()).candidate_name, TEMP_PREFIX);
    } finally {
      await cleanupIntake(candidateId);
    }
    await goto(page, "?app=consulting&investmentPage=report-studio");
  });

  await runCase("Investments", "Reports and three grounded questions", async () => {
    const findSites = await navigateInvestmentPage(page, "Find Sites", "area-radar");
    await findSites.getByRole("button", { name: "Run Screening", exact: true }).click();
    const review = page.getByRole("button", { name: "Open Property Review" }).first();
    await review.waitFor({ timeout: 60_000 });
    await review.click();
    await page.getByRole("tablist", { name: "Property Research tabs" }).waitFor();
    await navigateInvestmentPage(page, "Reports", "report-studio");
    const reportResponse = page.waitForResponse(
      (response) =>
        response.url() === `${API_URL}/investment/reports/generate` &&
        response.request().method() === "POST",
      { timeout: 60_000 },
    );
    const generate = page.getByRole("button", { name: /Generate/i }).first();
    await generate.click();
    assert.equal((await reportResponse).status(), 200);
    await page.getByRole("button", { name: /Ask CFS/i }).first().click();
    await page.getByRole("dialog", { name: "Ask CFS Investments" }).waitFor();
    await askQuestions(page, [
      "Why is the priority parcel the strongest screening candidate?",
      "What are the major diligence risks?",
      "Which assumptions drive the underwriting result?",
    ]);
    await page
      .getByRole("dialog", { name: "Ask CFS Investments" })
      .getByRole("button", { name: "Close", exact: true })
      .click();
  });

  await runCase("Investments", "Underwrite, Decide, Deliver, and all artifacts", async () => {
    await navigateInvestmentPage(page, "Projects", "engagements");
    const library = page.getByLabel("Case Studies library");
    if (await library.count()) {
      await library.getByRole("button", { name: "Continue", exact: true }).first().click();
    }
    const workspace = page.getByLabel("Case study workspace");
    await workspace.waitFor();
    const workflow = workspace.getByLabel("Case-study workflow");
    await workflow.getByRole("button", { name: /^Underwrite/ }).click();
    await workspace.getByRole("button", { name: "Review Assumptions", exact: true }).click();
    await workspace.getByLabel("Underwriting assumption review").waitFor();
    await workspace.getByRole("button", { name: "Return to Underwrite" }).click();
    await workflow.getByRole("button", { name: /^Decide/ }).click();
    await workflow.getByRole("button", { name: /^Deliver/ }).click();
    const deliverables = workspace
      .getByRole("heading", { name: "Deliverable checklist" })
      .locator("xpath=ancestor::section[1]");
    const rows = deliverables.locator("tbody tr");
    assert.equal(await rows.count(), 9, "CASE-1 did not expose nine deliverables.");
    for (let index = 0; index < 9; index += 1) {
      const name = await rows.nth(index).locator("td:first-child").innerText();
      await rows.nth(index).getByRole("button").click();
      const panel = workspace.getByLabel(name);
      const link = panel.getByRole("link", { name: "Open artifact" });
      if (await link.count()) {
        const href = await link.getAttribute("href");
        const isDownload = /\.(?:pptx|xlsx)$/i.test(href ?? "");
        const openedPromise = isDownload
          ? page.waitForEvent("download")
          : page.waitForEvent("popup");
        await link.click();
        const opened = await openedPromise;
        if (isDownload) {
          const artifactPath = await opened.path();
          assert(artifactPath && statSync(artifactPath).size > 100);
        } else {
          await opened.waitForLoadState("domcontentloaded");
          await opened.close();
        }
      }
      await panel.getByRole("button", { name: "Return to Deliver" }).click();
    }
  });

  await navigateToHome(page);
}

async function navigationChecks(page) {
  await runCase("Navigation", "deep links, refresh, Back, Forward, and clean Home", async () => {
    await page.evaluate(() => localStorage.clear());
    await goto(page, "?app=planning");
    await waitForMapLifecycle(page);
    await waitForRequiredApiDrain(page, "Planning to Economics transition");
    const economicsGeneration = beginAcceptanceTransition(page);
    await page.locator('button[aria-haspopup="menu"]').click();
    await page
      .getByRole("menuitemradio")
      .filter({ hasText: "Economics" })
      .click();
    await page.waitForFunction(() => new URLSearchParams(location.search).get("app") === "economics");
    await assertHealthyPage(page);
    completeAcceptanceTransition(page, economicsGeneration);
    await resolveMapDiagnosticsForPage(page);
    await waitForRequiredApiDrain(page, "Back navigation");
    const backGeneration = beginAcceptanceTransition(page);
    await page.goBack();
    await page.waitForFunction(() => new URLSearchParams(location.search).get("app") === "planning");
    assert.equal(new URL(page.url()).searchParams.get("app"), "planning");
    await waitForMapLifecycle(page, backGeneration);
    await waitForRequiredApiDrain(page, "Forward navigation");
    const forwardGeneration = beginAcceptanceTransition(page);
    await page.goForward();
    await page.waitForFunction(() => new URLSearchParams(location.search).get("app") === "economics");
    assert.equal(new URL(page.url()).searchParams.get("app"), "economics");
    await assertHealthyPage(page);
    completeAcceptanceTransition(page, forwardGeneration);
    await resolveMapDiagnosticsForPage(page);
    await page.evaluate(() => localStorage.clear());
    await waitForRequiredApiDrain(page, "Clean Home navigation");
    const homeGeneration = beginAcceptanceTransition(page);
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
    assert.equal(new URL(page.url()).search, "");
    await page.getByText("Cabarrus FutureScape", { exact: true }).first().waitFor();
    await assertHealthyPage(page);
    completeAcceptanceTransition(page, homeGeneration);
    await resolveMapDiagnosticsForPage(page);
  });
}

async function offlineChecks(browser) {
  const context = await browser.newContext({
    acceptDownloads: true,
    viewport: { width: 1280, height: 900 },
  });
  attachDiagnostics(context, { offline: true });
  await isolateAskCfsConversationLists(context);
  const page = await context.newPage();

  await runCase("Home", "renders with loopback traffic only", async () => {
    const generation = beginAcceptanceTransition(page);
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
    await page.getByText("Cabarrus FutureScape", { exact: true }).first().waitFor();
    await assertHealthyPage(page);
    completeAcceptanceTransition(page, generation);
    await resolveMapDiagnosticsForPage(page);
  }, true);
  await runCase("Planning", "parcel, local layers, and deterministic Ask CFS", async () => {
    await goto(page, "?app=planning");
    await assertLiveStatus(page);
    await page.getByTestId("command-center-explore-intelligence").click();
    await page.getByLabel("Cabarrus County ArcGIS MapView").waitFor({ timeout: 45_000 });
    await selectParcel(page, { expectedProvider: "local_api" });
    const expand = page.getByRole("button", { name: "Expand map layers panel" });
    if (await expand.count()) await expand.click();
    await toggleLayer(page, "Development Hotspots", "Development Activity");
    await page.getByTestId("command-center-indicator-center").click();
    await askQuestions(page, ["What data is still missing?"], { expectPersistence: false });
  }, true);
  await runCase("Economics", "dashboard renders offline", async () => {
    await goto(page, "?app=economics");
    await page.getByRole("button", { name: /Economic Dashboard:/ }).click();
    await page.getByText("Executive Economic Signals", { exact: true }).waitFor({
      timeout: 45_000,
    });
  }, true);
  await runCase("Investments", "CASE-1 renders offline", async () => {
    await goto(page, "?app=consulting&investmentPage=engagements");
    await page
      .getByText("CFS Large Development-Land Acquisition Case Study", { exact: false })
      .first()
      .waitFor({ timeout: 45_000 });
  }, true);

  await page.waitForLoadState("networkidle", { timeout: 30_000 });
  await closeAcceptedContext(context);
}

async function degradedDataChecks(browser) {
  for (const mode of ["api", "database"]) {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
    });
    attachDiagnostics(context, { ignoreApiFailures: true });
    await context.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== API_ORIGIN) {
        await route.continue();
        return;
      }
      if (mode === "api") {
        await route.abort("connectionrefused");
        return;
      }
      if (url.pathname === "/health/ready" || url.pathname === "/ai/status") {
        await route.continue();
        return;
      }
      await route.fulfill({
        body:
          url.pathname === "/health/database"
            ? JSON.stringify({ database: "unavailable", status: "degraded" })
            : JSON.stringify({ detail: "Local database unavailable" }),
        contentType: "application/json",
        status: url.pathname === "/health/database" ? 200 : 503,
      });
    });
    context.on("request", (request) => {
      const url = new URL(request.url());
      if (
        url.pathname.includes("/demo-data/") &&
        !LIVE_MAP_CONTEXT_PATHS.has(url.pathname)
      ) {
        report.degraded.demo_data_requests.push(url.href);
      }
    });

    const page = await context.newPage();
    const planningGeneration = beginAcceptanceTransition(page);
    await page.goto(`${BASE_URL}/?app=planning`, {
      waitUntil: "domcontentloaded",
    });
    await assertHealthyPage(page);
    await waitForMapLifecycle(page, planningGeneration);
    await page.getByRole("button", { name: /Open .* controls/i }).click();
    if (mode === "api") {
      await page
        .getByTestId("local-runtime-api")
        .getByText("Unavailable", { exact: true })
        .waitFor({ timeout: 20_000 });
    } else {
      await page
        .getByTestId("local-runtime-database")
        .getByText("Local database unavailable", { exact: true })
        .waitFor({ timeout: 20_000 });
    }
    await page.getByTestId("command-center-indicator-center").click();
    await page
      .getByText(/Indicator intelligence endpoint unavailable in live mode/)
      .first()
      .waitFor({ timeout: 30_000 });
    await waitForMapLifecycle(page);
    const economicsGeneration = beginAcceptanceTransition(page);
    await page.goto(`${BASE_URL}/?app=economics`, {
      waitUntil: "domcontentloaded",
    });
    await assertHealthyPage(page);
    await delay(2_000);
    completeAcceptanceTransition(page, economicsGeneration);
    await resolveMapDiagnosticsForPage(page);
    report.degraded.cases.push(`${mode} unavailable`);
    console.log(`PASS Degraded: ${mode} unavailable remains truthful`);
    await closeAcceptedContext(context);
  }
}

async function runWorkflows() {
  const architecture = spawnSync(process.execPath, ["scripts/check-enterprise-frontend.mjs"], {
    cwd: ROOT,
    env: process.env,
    stdio: "inherit",
  });
  assert.equal(architecture.status, 0, "Product V1 frontend persistence architecture check failed.");
  report.product_persistence_architecture = "PASS";
  await waitForStack();
  report.ownership.baseline = await captureProductBaseline(API_URL, ACCEPTANCE_PREFIX);
  const browser = await chromium.launch({
    executablePath: browserExecutable(),
    headless: true,
    args: [
      "--enable-unsafe-swiftshader",
      "--enable-webgl",
      "--no-sandbox",
      "--use-angle=swiftshader",
    ],
  });
  try {
    const context = await browser.newContext({
      acceptDownloads: true,
      viewport: { width: 1440, height: 1000 },
    });
    attachDiagnostics(context);
    await isolateAskCfsConversationLists(context);
    const page = await context.newPage();
    await planningWorkflow(page);
    await economicsWorkflow(page);
    await investmentsWorkflow(page);
    await navigationChecks(page);
    await page.waitForLoadState("networkidle", { timeout: 30_000 });
    await closeAcceptedContext(context);
    await offlineChecks(browser);
    await degradedDataChecks(browser);
    await resolveAllMapDiagnostics();
  } finally {
    try {
      await cleanupRecentWork();
    } finally {
      await browser.close();
    }
  }
}

async function runRequiredMapFailureProbe() {
  await waitForStack();
  const browser = await chromium.launch({
    executablePath: browserExecutable(),
    headless: true,
    args: [
      "--enable-unsafe-swiftshader",
      "--enable-webgl",
      "--no-sandbox",
      "--use-angle=swiftshader",
    ],
  });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    attachDiagnostics(context);
    let signalRouteHit;
    const routeHit = new Promise((resolve) => { signalRouteHit = resolve; });
    await context.route("**/demo_transportation_context.geojson", (route) => {
      signalRouteHit();
      return route.abort("failed");
    });
    const page = await context.newPage();
    await page.goto(`${BASE_URL}/?app=planning`, { waitUntil: "domcontentloaded" });
    await Promise.race([
      routeHit,
      delay(60_000).then(() => assert.fail("Local browser probe did not request the required transportation context.")),
    ]);
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (report.diagnostics.map_diagnostics.some(
        (diagnostic) =>
          diagnostic.classification === "required_same_origin_context_failure" &&
          diagnostic.fatal === true,
      )) break;
      await delay(100);
    }
    const requiredFailures = report.diagnostics.map_diagnostics.filter(
      (diagnostic) =>
        diagnostic.classification === "required_same_origin_context_failure" &&
        diagnostic.fatal === true,
    );
    assert(requiredFailures.length > 0, "Local browser probe did not classify the required context failure fatal.");
    assert.equal(
      report.diagnostics.map_diagnostics.some(
        (diagnostic) =>
          diagnostic.classification === "optional_public_basemap_failure" &&
          diagnostic.fatal === false,
      ),
      false,
      "An optional classification masked the active required context failure.",
    );
    await context.close();
    console.log("PASS Local Interactions browser integration detected the active required map failure.");
  } finally {
    await browser.close();
  }
}

function collectFinalInvariants() {
  recordFinalInvariant("local_api_route_count", ">=20", Object.keys(report.api_paths).length, Object.keys(report.api_paths).length >= 20);
  recordFinalInvariant("ask_cfs_ui_request_count", ">=10", report.api_paths["POST /ai/search"] ?? 0, (report.api_paths["POST /ai/search"] ?? 0) >= 10);
  recordFinalInvariant(
    "same_origin_map_context_assets",
    LIVE_MAP_CONTEXT_PATHS.size,
    new Set(report.map_context_requests.map((url) => new URL(url).pathname)).size,
  );
  recordFinalInvariant("live_demo_business_requests", [], report.demo_data_requests);
  recordFinalInvariant("degraded_demo_business_requests", [], report.degraded.demo_data_requests);
  recordFinalInvariant("browser_api_failures", [], report.diagnostics.api_failures);
  recordFinalInvariant("browser_page_errors", [], report.diagnostics.page_errors);
  recordFinalInvariant("browser_request_loops", [], report.diagnostics.request_loops);
  recordFinalInvariant("browser_request_failures", [], report.diagnostics.request_failures);
  recordFinalInvariant("browser_console_messages", [], report.diagnostics.console_messages);
  recordFinalInvariant(
    "map_diagnostics_resolved",
    [],
    pendingMapDiagnostics.filter((entry) => !entry.resolved).map((entry) => entry.record),
  );
  recordFinalInvariant(
    "fatal_map_diagnostics",
    [],
    report.diagnostics.map_diagnostics.filter((diagnostic) => diagnostic.fatal === true),
  );
  recordFinalInvariant(
    "private_arcgis_requests",
    [],
    report.external_requests.filter((url) =>
      /\/sharing\/rest\/(?:content\/items|oauth2)|\/oauth2\/|\/signin(?:\/|$)/i.test(url),
    ),
  );
  recordFinalInvariant(
    "unexpected_external_arcgis_requests",
    [],
    report.unexpected_external_arcgis_requests,
  );
  recordFinalInvariant(
    "optional_public_basemap_contract",
    true,
    report.diagnostics.map_diagnostics.every(
      (diagnostic) => diagnostic.fatal === false || diagnostic.fatal === true,
    ) &&
      report.diagnostics.optional_public_basemap_console.every(
        (diagnostic) => diagnostic.fatal === false && diagnostic.fallback_healthy === true,
      ) &&
      report.diagnostics.optional_public_basemap_failures.every(
        (diagnostic) => diagnostic.fatal === false && diagnostic.fallback_healthy === true,
      ),
  );
  recordFinalInvariant("planning_snapshot_archived", true, Boolean(report.disposable_cleanup?.planning_snapshot_verified));
  recordFinalInvariant("planning_snapshot_archive_audit", true, Boolean(report.disposable_cleanup?.planning_snapshot_audit_verified));
  recordFinalInvariant("investment_mutation_cleaned", true, Boolean(report.disposable_cleanup?.verified));
  recordFinalInvariant("recent_work_cleaned", true, Boolean(report.disposable_cleanup?.recent_work_verified));
}

function recordFinalInvariant(name, expected, actual, passed = JSON.stringify(actual) === JSON.stringify(expected)) {
  report.final_invariants.push({ actual, expected, name, passed });
}

async function persistReport() {
  await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await fs.writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

let primaryError = null;
let cleanupError = null;
if (process.argv.includes("--check-optional-basemap-classifier")) {
  const results = runClassificationSafetyMatrix();
  assert.equal(results.length, 64);
  console.log("PASS shared ArcGIS acceptance classifier and required-fallback negative proof");
  process.exit(0);
}
if (requiredMapFailureProbe) {
  await runRequiredMapFailureProbe();
  throw new Error("REQUIRED_MAP_FAILURE_DETECTED");
}
try {
  await runWorkflows();
} catch (error) {
  primaryError = error;
  const failure = error instanceof Error ? error.stack ?? error.message : String(error);
  report.failed_case ??= {
    error: failure,
    name: report.current_case?.name ?? "workflow orchestration",
    product: report.current_case?.product ?? "Acceptance",
  };
  report.final_invariants.unshift({
    actual: failure,
    expected: "PASS",
    name: "workflow_execution",
    passed: false,
  });
} finally {
  try {
    report.ownership.cleanup = await archiveOwnedProductRecords(
      API_URL,
      ACCEPTANCE_PREFIX,
      ownedIds,
    );
  } catch (error) {
    cleanupError = error;
  }
  try {
    if (report.ownership.baseline) {
      const verification = await verifyProductIsolation(
        API_URL,
        ACCEPTANCE_PREFIX,
        report.ownership.baseline,
        ownedIds,
      );
      report.ownership.verification = verification.resources;
      report.final_invariants.push(...verification.final_invariants);
    }
  } catch (error) {
    cleanupError ??= error;
  }
  collectFinalInvariants();
  const failedInvariant = report.final_invariants.find((invariant) => !invariant.passed);
  report.final_invariant = failedInvariant ?? {
    actual: "PASS",
    expected: "PASS",
    name: "all_final_invariants",
    passed: true,
  };
  report.status = primaryError || cleanupError || failedInvariant ? "FAIL" : "PASS";
  if (primaryError) {
    report.failure = primaryError instanceof Error ? primaryError.stack ?? primaryError.message : String(primaryError);
  }
  if (cleanupError) {
    report.cleanup_failure = cleanupError instanceof Error ? cleanupError.stack ?? cleanupError.message : String(cleanupError);
  }
  await persistReport();
}

if (primaryError) throw primaryError;
if (cleanupError) throw cleanupError;
const failedInvariant = report.final_invariants.find((invariant) => !invariant.passed);
if (failedInvariant) {
  throw new assert.AssertionError({
    actual: failedInvariant.actual,
    expected: failedInvariant.expected,
    message: `Final invariant failed: ${failedInvariant.name}`,
    operator: "deepStrictEqual",
  });
}
console.log(
  `PASS complete local interaction audit\n${JSON.stringify(
    {
      cases: report.cases.length,
      offline_cases: report.offline.cases.length,
      api_paths: Object.keys(report.api_paths).length,
      demo_data_requests: report.demo_data_requests.length,
      degraded_cases: report.degraded.cases.length,
      map_context_requests: report.map_context_requests.length,
      external_requests: report.external_requests.length,
      final_invariant: report.final_invariant,
    },
    null,
    2,
  )}`,
);
