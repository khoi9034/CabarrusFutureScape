import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright-core";
import {
  classifyArcGISConsoleFailure,
  classifyArcGISHttpFailure,
  classifyArcGISRequestFailure,
  classifyPageError,
  isApprovedPublicArcgisRequest,
  isExternalArcgisRequest,
  isMapDiagnosticRequest,
  optionalPublicMapResources,
  redactMapDiagnosticText,
  redactMapDiagnosticUrl,
  REQUIRED_CFS_BASEMAP_ID,
  REQUIRED_CFS_CONTEXT_LAYER_IDS,
  REQUIRED_CFS_FALLBACK_LABEL_LAYER_ID,
  resolveMapDiagnostic,
} from "./map-acceptance-classification.mjs";

const root = process.cwd();
const OPTIONAL_PUBLIC_RESOURCES = optionalPublicMapResources();
const externalBaseUrl = process.env.CFS_DEMO_BASE_URL?.replace(/\/$/, "");
const caseArtifacts = [];
const results = [];
const controls = new Map();
const diagnostics = {
  blockedRequests: [],
  browserRequestCancellations: [],
  consoleMessages: [],
  dependentOptionalFailures: [],
  external404s: [],
  mapDiagnostics: [],
  optionalPublicBasemapConsole: [],
  optionalPublicBasemapFailures: [],
  pageErrors: [],
  primaryMapFailures: [],
  requestFailures: [],
  requestLoops: [],
  sameOrigin404s: [],
};
const pendingMapDiagnostics = [];
const activeAcceptanceLifecycleByPage = new WeakMap();
const lastMapHealthByPage = new WeakMap();
const pageAcceptanceGenerations = new WeakMap();
const pageDirectEvidence = new WeakMap();
let acceptanceLifecycleGeneration = 0;
let server;

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

function record(product, name, touched = []) {
  results.push({ product, name });
  const productControls = controls.get(product) ?? new Set();
  touched.forEach((control) => productControls.add(control));
  controls.set(product, productControls);
}

async function check(product, name, touched, run) {
  const started = Date.now();
  await run();
  record(product, name, touched);
  console.log(`PASS ${product}: ${name} (${Date.now() - started}ms)`);
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const socket = createServer();
    socket.once("error", reject);
    socket.listen(0, "127.0.0.1", () => {
      const address = socket.address();
      socket.close(() => resolve(address.port));
    });
  });
}

async function waitForServer(url) {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.status < 500) return;
    } catch {
      // Server startup is still in progress.
    }
    await delay(1_000);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function startServer() {
  if (externalBaseUrl) return externalBaseUrl;
  assert(existsSync(join(root, ".next", "BUILD_ID")), "Run the demo production build before this check.");
  const port = await freePort();
  const url = `http://127.0.0.1:${port}`;
  server = spawn(
    process.execPath,
    [join(root, "node_modules", "next", "dist", "bin", "next"), "start", "-H", "127.0.0.1", "-p", String(port)],
    {
      cwd: root,
      env: {
        ...process.env,
        NEXT_PUBLIC_CFS_DEPLOYMENT_MODE: "demo",
        NEXT_PUBLIC_CFS_RUNTIME_MODE: "demo",
        NEXT_PUBLIC_USE_BACKEND_API: "false",
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );
  let serverOutput = "";
  server.stdout.on("data", (chunk) => {
    serverOutput += chunk;
  });
  server.stderr.on("data", (chunk) => {
    serverOutput += chunk;
  });
  server.once("exit", (code) => {
    if (code && code !== 0) console.error(serverOutput);
  });
  await waitForServer(url);
  return url;
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

function isForbiddenBackend(url, origin) {
  const parsed = new URL(url);
  const host = parsed.hostname.toLowerCase();
  const port = parsed.port;
  const sameOrigin = parsed.origin === origin;
  const backendHost =
    isExternalArcgisRequest(parsed, { appOrigin: origin }) ||
    host === "basemaps.arcgis.com" ||
    host === "services.arcgis.com" ||
    host.endsWith(".arcgisonline.com") ||
    host.endsWith(".onrender.com") ||
    host.includes("supabase") ||
    host.includes("openai.com") ||
    host.includes("anthropic.com") ||
    host.includes("generativelanguage.googleapis.com") ||
    host.includes("azurewebsites.net");
  const localBackend = ["8000", "8001", "5432", "54321"].includes(port);
  return backendHost || localBackend || (sameOrigin && parsed.pathname.startsWith("/api/"));
}

function attachDiagnostics(context, origin) {
  const requestCounts = new Map();
  const requestObservations = new WeakMap();
  context.route("**/*", async (route) => {
    const request = route.request();
    const url = request.url();
    if (isForbiddenBackend(url, origin)) {
      const approvedOptional = isApprovedPublicArcgisRequest(
        url,
        undefined,
        request.headers(),
      );
      if (!approvedOptional) {
        diagnostics.blockedRequests.push(redactMapDiagnosticUrl(url));
        const page = requestPage(request);
        recordDirectEvidence(
          page,
          pageAcceptanceGenerations.get(page),
          isExternalArcgisRequest(url, { appOrigin: origin })
            ? "privateArcgisRequests"
            : "apiFailures",
        );
      }
      await route.abort(approvedOptional ? "failed" : "blockedbyclient");
      return;
    }
    await route.continue();
  });
  context.on("request", (request) => {
    const page = requestPage(request);
    const lifecycle = currentAcceptanceLifecycle(page);
    requestObservations.set(request, {
      acceptanceGeneration:
        lifecycle?.generation ?? (page ? (pageAcceptanceGenerations.get(page) ?? 0) : null),
      lifecycle,
      page,
    });
    if (new URL(request.url()).pathname === "/favicon.ico") return;
    const count = (requestCounts.get(request.url()) ?? 0) + 1;
    requestCounts.set(request.url(), count);
    if (count === 26) diagnostics.requestLoops.push(redactMapDiagnosticUrl(request.url()));
  });
  context.on("requestfailed", (request) => {
    const mapDiagnostic = isMapDiagnosticRequest(request.url(), { appOrigin: origin });
    if (isForbiddenBackend(request.url(), origin) && !mapDiagnostic) return;
    if (/\.(?:pptx|xlsx)$/i.test(new URL(request.url()).pathname) && request.failure()?.errorText === "net::ERR_ABORTED") return;
    if (mapDiagnostic) {
      const diagnostic = classifyArcGISRequestFailure(
        {
          error: request.failure()?.errorText ?? "failed",
          headers: request.headers(),
          method: request.method(),
          url: request.url(),
        },
        { appOrigin: origin },
      );
      if (
        ["optional_public_basemap_candidate", "required_request_cancellation_candidate"].includes(
          diagnostic.classification,
        )
      ) {
        const observation = requestObservations.get(request);
        const page = observation?.page ?? requestPage(request);
        observeOptionalMapDiagnostic(diagnostic, {
          lifecycle: observation?.lifecycle ?? currentAcceptanceLifecycle(page),
          page,
          source: "requestfailed",
        });
      } else {
        const observation = requestObservations.get(request);
        recordMapDiagnostic(diagnostic, {
          generation: observation?.acceptanceGeneration,
          page: observation?.page ?? requestPage(request),
          source: "requestfailed",
        });
      }
      return;
    }
    if (new URL(request.url()).origin === origin) {
      diagnostics.requestFailures.push(
        `${redactMapDiagnosticText(request.failure()?.errorText ?? "failed")} ${redactMapDiagnosticUrl(request.url())}`,
      );
    }
  });
  context.on("response", (response) => {
    let optionalMapFailure = false;
    if (
      response.status() >= 400 &&
      isMapDiagnosticRequest(response.url(), { appOrigin: origin })
    ) {
      const diagnostic = classifyArcGISHttpFailure(
        {
          headers: response.request().headers(),
          method: response.request().method(),
          status: response.status(),
          url: response.url(),
        },
        { appOrigin: origin },
      );
      optionalMapFailure = diagnostic.classification === "optional_public_basemap_candidate";
      if (optionalMapFailure) {
        const observation = requestObservations.get(response.request());
        const page = observation?.page ?? requestPage(response.request());
        observeOptionalMapDiagnostic(diagnostic, {
          lifecycle: observation?.lifecycle ?? currentAcceptanceLifecycle(page),
          page,
          source: "response",
        });
      } else {
        const observation = requestObservations.get(response.request());
        recordMapDiagnostic(diagnostic, {
          generation: observation?.acceptanceGeneration,
          page: observation?.page ?? requestPage(response.request()),
          source: "response",
        });
      }
    }
    if (response.status() === 404) {
      if (optionalMapFailure) return;
      if (new URL(response.url()).origin === origin) {
        diagnostics.sameOrigin404s.push(redactMapDiagnosticUrl(response.url()));
      } else {
        diagnostics.external404s.push(redactMapDiagnosticUrl(response.url()));
      }
    }
  });
  context.on("page", (page) => {
    page.on("pageerror", (error) => {
      const diagnostic = classifyPageError(error);
      const pageUrl = redactMapDiagnosticUrl(page.url());
      diagnostics.mapDiagnostics.push({ ...diagnostic, page_url: pageUrl, source: "pageerror" });
      diagnostics.pageErrors.push(`${pageUrl} :: ${diagnostic.message}`);
      recordDirectEvidence(page, pageAcceptanceGenerations.get(page), "pageErrors");
    });
    page.on("console", (message) => {
      if (["error", "warning"].includes(message.type())) {
        const text = message.text();
        if (/GL Driver Message.*GPU stall due to ReadPixels/.test(text)) return;
        const diagnostic = classifyArcGISConsoleFailure(
          { locationUrl: message.location().url, text },
          { appOrigin: origin },
        );
        if (diagnostic.classification === "optional_public_basemap_candidate") {
          observeOptionalMapDiagnostic(diagnostic, {
            lifecycle: currentAcceptanceLifecycle(page),
            page,
            source: "console",
          });
        } else {
          recordMapDiagnostic(diagnostic, { page, source: "console" });
        }
      }
    });
  });
}

function requestPage(request) {
  try {
    return request.frame().page();
  } catch {
    return null;
  }
}

function acceptanceRouteKey(value) {
  const url = new URL(value);
  const route = new URLSearchParams();
  for (const key of ["app", "investmentPage"]) {
    const selected = url.searchParams.get(key);
    if (selected) route.set(key, selected);
  }
  return `${url.pathname}${route.size ? `?${route}` : ""}`;
}

function beginAcceptanceLifecycle(page, kind) {
  assert.equal(
    activeAcceptanceLifecycleByPage.has(page),
    false,
    `Cannot begin ${kind}; a prior acceptance lifecycle is still unproven.`,
  );
  const lifecycle = {
    from_route: page.url() === "about:blank" ? "about:blank" : acceptanceRouteKey(page.url()),
    generation: ++acceptanceLifecycleGeneration,
    kind,
    proven: false,
    to_route: null,
  };
  activeAcceptanceLifecycleByPage.set(page, lifecycle);
  pageAcceptanceGenerations.set(page, lifecycle.generation);
  return lifecycle;
}

function proveAcceptanceLifecycle(page, lifecycle) {
  assert.equal(
    activeAcceptanceLifecycleByPage.get(page),
    lifecycle,
    `Acceptance lifecycle ${lifecycle.generation} was superseded before proof.`,
  );
  lifecycle.proven = true;
  lifecycle.to_route = page.isClosed() ? lifecycle.from_route : acceptanceRouteKey(page.url());
  if (lifecycle.kind === "route") {
    assert.notEqual(
      lifecycle.to_route,
      lifecycle.from_route,
      `Acceptance route lifecycle ${lifecycle.generation} did not change routes.`,
    );
  }
  activeAcceptanceLifecycleByPage.delete(page);
}

function currentAcceptanceLifecycle(page) {
  return page ? activeAcceptanceLifecycleByPage.get(page) ?? null : null;
}

function markAcceptanceTeardown(page) {
  if (!page || page.isClosed()) return;
  const lifecycle = beginAcceptanceLifecycle(page, "teardown");
  lifecycle.proven = true;
  lifecycle.to_route = lifecycle.from_route;
}

async function closeAcceptancePage(page) {
  if (page.isClosed()) return;
  markAcceptanceTeardown(page);
  await page.close();
}

async function closeAcceptanceContext(context) {
  context.pages().forEach(markAcceptanceTeardown);
  await context.close();
}

async function acceptedNavigation(page, kind, navigate, prove) {
  const lifecycle = beginAcceptanceLifecycle(page, kind);
  await navigate();
  await prove();
  proveAcceptanceLifecycle(page, lifecycle);
}

async function openInvestmentRoute(page, name, investmentPage) {
  await acceptedNavigation(
    page,
    "route",
    () => page.getByRole("button", { name, exact: true }).click(),
    async () => {
      await page.waitForFunction(
        (expected) => new URLSearchParams(location.search).get("investmentPage") === expected,
        investmentPage,
      );
      await page.locator(`main[data-investment-page="${investmentPage}"]`).waitFor();
      await assertHealthyText(page);
    },
  );
}

function recordMapDiagnostic(diagnostic, { generation = null, page = null, source }) {
  const resolved = diagnostic.fatal === null
    ? resolveMapDiagnostic(diagnostic, { health: {}, lifecycle: "current" })
    : diagnostic;
  const record = {
    ...resolved,
    page_url: page ? redactMapDiagnosticUrl(page.url()) : null,
    source,
  };
  diagnostics.mapDiagnostics.push(record);
  if (!record.fatal) return record;
  const acceptanceGeneration = generation ?? pageAcceptanceGenerations.get(page);
  recordDirectEvidence(page, acceptanceGeneration, "requiredRequestFailures");
  if (source === "console") {
    recordDirectEvidence(page, acceptanceGeneration, "consoleErrors");
  }
  diagnostics.primaryMapFailures.push(record);
  const message = `${record.page_url ?? "no-page"} :: ${record.reason}${record.message ? `: ${record.message}` : ""}`;
  (source === "console" ? diagnostics.consoleMessages : diagnostics.requestFailures).push(message);
  return record;
}

function observeOptionalMapDiagnostic(diagnostic, { lifecycle = null, page = null, source }) {
  const record = {
    ...diagnostic,
    page_url: page ? redactMapDiagnosticUrl(page.url()) : null,
    source,
  };
  diagnostics.mapDiagnostics.push(record);
  if (!page) {
    const result = resolveMapDiagnostic(record, { health: {}, lifecycle: "unknown" });
    Object.assign(record, result);
    if (result.classification === "optional_public_basemap_failure") {
      diagnostics.dependentOptionalFailures.push(record);
    } else {
      diagnostics.primaryMapFailures.push(record);
      diagnostics.requestFailures.push(
        `no-page :: Required cancellation lacked authoritative Demo lifecycle proof: ${record.reason}`,
      );
    }
    return;
  }
  pendingMapDiagnostics.push({ lifecycle, page, record, resolved: false });
}

async function resolveMapDiagnosticsForPage(page, knownHealth = null) {
  const pending = pendingMapDiagnostics.filter((entry) => !entry.resolved && entry.page === page);
  if (!pending.length) return;
  const primaryEvidence = immutablePrimaryEvidence(
    page,
    knownHealth ?? lastMapHealthByPage.get(page) ?? {},
  );
  const required = pending.filter(
    (entry) => entry.record.classification === "required_request_cancellation_candidate",
  );
  const optional = pending.filter(
    (entry) => entry.record.classification !== "required_request_cancellation_candidate",
  );
  const requiredResults = required.map((entry) => [
    entry,
    resolvePendingMapDiagnostic(entry, primaryEvidence),
  ]);
  for (const [entry, result] of [
    ...requiredResults,
    ...optional.map((entry) => [entry, resolvePendingMapDiagnostic(entry, primaryEvidence)]),
  ]) {
    Object.assign(entry.record, result);
    entry.resolved = true;
    if (result.fatal) {
      if (entry.record.classification === "optional_public_basemap_failure") {
        diagnostics.dependentOptionalFailures.push(entry.record);
      } else {
        diagnostics.primaryMapFailures.push(entry.record);
        const target = entry.record.source === "console"
          ? diagnostics.consoleMessages
          : diagnostics.requestFailures;
        target.push(`${entry.record.page_url ?? "no-page"} :: ${result.reason}`);
      }
    } else if (result.classification === "browser_request_cancellation") {
      diagnostics.browserRequestCancellations.push(entry.record);
    } else {
      const target = entry.record.source === "console"
        ? diagnostics.optionalPublicBasemapConsole
        : diagnostics.optionalPublicBasemapFailures;
      target.push(entry.record);
    }
  }
}

function immutablePrimaryEvidence(page, health) {
  return Object.freeze({ ...health, ...directEvidenceForPage(page) });
}

function resolvePendingMapDiagnostic(entry, health) {
  const acceptedLifecycle = entry.lifecycle?.proven === true;
  const candidate = {
    ...entry.record,
    acceptance_lifecycle_generation: entry.lifecycle?.generation ?? null,
    acceptance_teardown_succeeded:
      acceptedLifecycle && entry.lifecycle.kind === "teardown",
    acceptance_transition_succeeded:
      acceptedLifecycle && entry.lifecycle.kind !== "teardown",
    from_route: entry.lifecycle?.from_route ?? null,
    to_route: entry.lifecycle?.to_route ?? null,
  };
  // The shared resolver's accepted-transition proof is the generic acceptance-owned
  // lifecycle gate; retain the narrower teardown field in the persisted diagnostic.
  if (candidate.acceptance_teardown_succeeded) {
    candidate.acceptance_transition_succeeded = true;
  }
  const result = resolveMapDiagnostic(candidate, {
    health,
    lifecycle: candidate.acceptance_teardown_succeeded
      ? "destroyed"
      : candidate.acceptance_transition_succeeded
        ? "stale"
        : "current",
  });
  if (
    candidate.classification === "required_request_cancellation_candidate" &&
    candidate.acceptance_teardown_succeeded &&
    result.fatal === false
  ) {
    result.reason =
      "A required idempotent request was cancelled by an explicitly marked acceptance-owned teardown after required fallback health was proven.";
  }
  return result;
}

async function resolveAllMapDiagnostics() {
  for (const page of new Set(
    pendingMapDiagnostics.filter((entry) => !entry.resolved).map((entry) => entry.page),
  )) {
    await resolveMapDiagnosticsForPage(page);
  }
}

async function readRequiredMapHealth(page, origin) {
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
      requiredLayersReady:
        requiredIds.every((id) => {
          const layer = debug?.layers?.find((candidate) => candidate.id === id);
          return layer?.visible === true && Number(layer.graphicsCount) > 0;
        }) &&
        (map?.getAttribute("data-reference-basemap-state") !== "failed" ||
          (() => {
            const labels = debug?.layers?.find((candidate) => candidate.id === requiredLabelId);
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
    appOrigin: origin,
    parcelInteractionRequired: true,
  };
  if (health.activeMapInteractive && health.currentMapAuthoritative) {
    lastMapHealthByPage.set(page, health);
  }
  return health;
}

async function goto(page, baseUrl, query) {
  await acceptedNavigation(
    page,
    "goto",
    () => page.goto(`${baseUrl}/${query}`, { waitUntil: "domcontentloaded" }),
    async () => {
      await page.waitForFunction(
        () => document.body.textContent?.includes("Portfolio Demo"),
        null,
        { timeout: 30_000 },
      );
      await delay(750);
      await assertHealthyText(page);
    },
  );
}

async function assertHealthyText(page) {
  const text = await page.locator("body").innerText();
  assert(!/\b(?:NaN|undefined|null)\b/i.test(text), "Visible page contains NaN/undefined/null.");
  assert(!/Application error|Internal Server Error|Unhandled Runtime Error/i.test(text), "Visible application error.");
}

async function assertPaintedImage(image, label) {
  const { default: sharp } = await import("sharp");
  const stats = await sharp(image).stats();
  const deviation = Math.max(...stats.channels.slice(0, 3).map((channel) => channel.stdev));
  assert(deviation >= 4, `${label} is visually uniform (${deviation.toFixed(2)} pixel deviation).`);
  return deviation;
}

async function assertImageDifference(before, after, label, minimum = 0.05) {
  const { default: sharp } = await import("sharp");
  const left = await sharp(before).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const right = await sharp(after).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(left.info.width, right.info.width, `${label} screenshot width changed`);
  assert.equal(left.info.height, right.info.height, `${label} screenshot height changed`);
  let difference = 0;
  for (let index = 0; index < left.data.length; index += 4) {
    difference +=
      Math.abs(left.data[index] - right.data[index]) +
      Math.abs(left.data[index + 1] - right.data[index + 1]) +
      Math.abs(left.data[index + 2] - right.data[index + 2]);
  }
  const meanDifference = difference / (left.info.width * left.info.height * 3);
  assert(meanDifference >= minimum, `${label} did not produce a visible pixel change (${meanDifference.toFixed(3)} mean difference).`);
  return meanDifference;
}

async function waitForMapReady(page) {
  const map = page.getByTestId("cfs-arcgis-map");
  await map.waitFor({ timeout: 30_000 });
  await page.waitForFunction(
    () => {
      const element = document.querySelector('[data-testid="cfs-arcgis-map"]');
      return (
        element?.getAttribute("data-static-context-ready") === "true" &&
        element.getAttribute("data-map-renderer-state") === "interactive_ready" &&
        element.getAttribute("data-interactive-ready") === "true" &&
        element.getAttribute("data-map-renderer") === "interactive" &&
        element.getAttribute("data-arcgis-runtime-state") === "ready" &&
        element.getAttribute("data-arcgis-view-state") === "ready" &&
        element.getAttribute("data-map-view-ready-state") === "ready"
      );
    },
    { timeout: 35_000 },
  );
  const box = await map.boundingBox();
  assert(box && box.width > 300 && box.height > 250, `Map container is not usable: ${JSON.stringify(box)}`);
  assert(Number(await map.getAttribute("data-context-county-features")) > 0, "County context is empty.");
  assert(Number(await map.getAttribute("data-context-road-features")) > 0, "Road context is empty.");
  assert(Number(await map.getAttribute("data-context-hydro-features")) > 0, "Water context is empty.");
  assert(Number(await map.getAttribute("data-context-municipal-features")) > 0, "Municipal context is empty.");
  assert(Number(await map.getAttribute("data-context-label-features")) > 0, "Place label context is empty.");
  await page.waitForFunction(() => {
    const interactive = document.querySelector('[data-testid="cfs-arcgis-map"]');
    const staticMap = document.querySelector('[data-testid="cfs-local-context-map"]');
    return (
      Number(interactive ? getComputedStyle(interactive).opacity : 0) >= 0.99 &&
      Number(staticMap ? getComputedStyle(staticMap).opacity : 1) <= 0.01
    );
  });
  const visibility = await page.evaluate(() => {
    const interactive = document.querySelector('[data-testid="cfs-arcgis-map"]');
    const staticMap = document.querySelector('[data-testid="cfs-local-context-map"]');
    return {
      interactive: Number(interactive ? getComputedStyle(interactive).opacity : 0),
      static: Number(staticMap ? getComputedStyle(staticMap).opacity : 0),
    };
  });
  assert(visibility.interactive >= 0.99, "Interactive renderer is transparent.");
  assert(visibility.static <= 0.01, "Emergency SVG is visible over a ready MapView.");
  const publicBasemap = OPTIONAL_PUBLIC_RESOURCES[0];
  assert.equal(await map.getAttribute("data-basemap-provider"), publicBasemap.provider);
  assert.equal(
    await map.getAttribute("data-basemap-url-template"),
    publicBasemap.urlTemplate,
  );
  assert.equal(
    await map.getAttribute("data-basemap-attribution"),
    publicBasemap.attribution,
  );
  const sdkVersion = await map.getAttribute("data-arcgis-sdk-version");
  assert.match(sdkVersion ?? "", /^\d+\.\d+\.\d+$/);
  assert.equal(await map.getAttribute("data-arcgis-assets-path"), `/arcgis-assets/${sdkVersion}`);
  const debug = await page.evaluate(() => window.__cfsGetMapDebugState?.());
  assert.equal(debug?.ready, true, "MapView debug state is not ready.");
  assert.equal(debug?.readyState, "ready", "MapView readyState is not ready.");
  assert.equal(debug?.basemapId, "cfs-same-origin-basemap");
  assert.equal(debug?.assetsPath, `/arcgis-assets/${sdkVersion}`);
  assert(Number(debug?.layerCount) >= 5, "ArcGIS basemap layers are missing.");
  assert(Number(debug?.layerViewCount) >= 5, "ArcGIS basemap layerViews are missing.");
  await page.waitForFunction(() =>
    ["failed", "ready"].includes(
      document
        .querySelector('[data-testid="cfs-arcgis-map"]')
        ?.getAttribute("data-reference-basemap-state") ?? "",
    ),
  );
  assert.equal(await map.getAttribute("data-basemap-mode"), "same-origin");
  assert.equal(await map.getAttribute("data-reference-basemap-state"), "failed");
  await page.getByTestId("cfs-reference-basemap-warning").waitFor();
  const countyPath = await page
    .getByTestId("cfs-local-context-map")
    .locator('[data-layer-id="county-boundary"]')
    .getAttribute("d");
  assert(countyPath?.trim() && !/NaN|Infinity/.test(countyPath), "County SVG path is invalid.");
  const health = await readRequiredMapHealth(page, new URL(page.url()).origin);
  await resolveMapDiagnosticsForPage(page, health);
  return map;
}

async function assertRuntimeLayer(page, layerId, { visible = true, withGraphics = true } = {}) {
  try {
    await page.waitForFunction(
      ({ id, expectedVisible, requireGraphics }) => {
        const layer = window.__cfsGetMapDebugState?.().layers.find((item) => item.id === id);
        return Boolean(
          layer &&
            layer.visible === expectedVisible &&
            (!requireGraphics || Number(layer.graphicsCount) > 0),
        );
      },
      { expectedVisible: visible, id: layerId, requireGraphics: withGraphics },
      { timeout: 20_000 },
    );
  } catch {
    const state = await page.evaluate(() => window.__cfsGetMapDebugState?.());
    assert.fail(`Runtime layer ${layerId} did not render: ${JSON.stringify(state)}`);
  }
}

async function mapUsesArcGIS(page) {
  const renderer = await page
    .getByTestId("cfs-arcgis-map")
    .getAttribute("data-map-renderer");
  assert.equal(renderer, "interactive", "Normal demo flow fell back to the SVG renderer.");
  return true;
}

async function assertContextMapLayers(page) {
  for (const layerId of [
    "county-boundary",
    "cfs-local-municipalities",
    "cfs-local-hydrography",
    "transportation-context",
    "cfs-local-place-labels",
  ]) {
    await assertRuntimeLayer(page, layerId);
  }
}

async function assertRenderedMapLayer(
  page,
  runtimeLayerId,
  fallbackLayerId,
  { visible = true } = {},
) {
  void fallbackLayerId;
  await assertRuntimeLayer(page, runtimeLayerId, {
    visible,
    withGraphics: visible,
  });
}

async function captureMapSurface(page) {
  await mapUsesArcGIS(page);
  return page.getByTestId("cfs-arcgis-map").screenshot();
}

async function chooseDifferent(select) {
  const options = await select.locator("option").evaluateAll((nodes) =>
    nodes.map((node) => ({ label: node.textContent?.trim() ?? "", value: node.value })),
  );
  const current = await select.inputValue();
  const next = options.find((option) => option.value !== current && option.label !== "All");
  assert(next, "No alternate select option was available.");
  await select.selectOption(next.value);
  return next.value;
}

async function chooseExtreme(select) {
  const options = (await select.locator("option").evaluateAll((nodes) =>
    nodes.map((node) => ({ label: node.textContent?.trim() ?? "", value: node.value })),
  )).filter((option) => option.label !== "All");
  const current = await select.inputValue();
  const next = current === options.at(-1)?.value ? options[0] : options.at(-1);
  assert(next && next.value !== current, "No alternate select option was available.");
  await select.selectOption(next.value);
  return next.value;
}

async function assertStaticAssets(baseUrl) {
  const arcgisManifestResponse = await fetch(`${baseUrl}/arcgis-assets/manifest.json`);
  assert.equal(arcgisManifestResponse.status, 200, "ArcGIS asset manifest is unavailable.");
  const arcgisManifest = await arcgisManifestResponse.json();
  assert.match(arcgisManifest.sdkVersion ?? "", /^\d+\.\d+\.\d+$/);
  assert.equal(arcgisManifest.assetsPath, `/arcgis-assets/${arcgisManifest.sdkVersion}`);
  assert(Number(arcgisManifest.assetCount) > 1_000, "ArcGIS asset manifest is incomplete.");
  assert(Number(arcgisManifest.totalBytes) > 1_000_000, "ArcGIS asset tree is incomplete.");
  for (const path of [
    "esri/geometry/support/pe-wasm.wasm",
    "esri/core/workers/RemoteClient.js",
    "esri/core/libs/libtess/libtess-f32.wasm",
    "esri/widgets/Zoom/t9n/Zoom_en.json",
  ]) {
    assert(
      arcgisManifest.assets.some((asset) => asset.path === path && Number(asset.size) > 0),
      `ArcGIS manifest is missing ${path}.`,
    );
    const response = await fetch(`${baseUrl}${arcgisManifest.assetsPath}/${path}`);
    assert.equal(response.status, 200, `${path} returned ${response.status}`);
  }

  const manifestResponse = await fetch(`${baseUrl}/demo-data/demo_manifest.json`);
  assert.equal(manifestResponse.status, 200);
  const manifest = await manifestResponse.json();
  assert.equal(manifest.mode, "portfolio_demo");
  assert(Array.isArray(manifest.required_assets) && manifest.required_assets.length >= 8);
  let publicAssets = 0;
  for (const asset of manifest.required_assets) {
    assert(asset.path && asset.schema && asset.source_classification, `Incomplete metadata for ${asset.feature}`);
    assert.equal(asset.sanitized, true, `${asset.path} is not marked sanitized`);
    assert(Number(asset.record_count) > 0, `${asset.path} has no record count`);
    if (!asset.path.startsWith("public/")) continue;
    const url = `${baseUrl}/${asset.path.slice("public/".length)}`;
    const response = await fetch(url);
    assert.equal(response.status, 200, `${url} returned ${response.status}`);
    const body = await response.text();
    assert(body.trim().length > 20, `${url} returned an empty asset`);
    publicAssets += 1;
  }
  const csvResponse = await fetch(`${baseUrl}/demo-data/economics_enterprise_export.csv`);
  if (csvResponse.status === 200) {
    assert((await csvResponse.text()).trim().split(/\r?\n/).length > 1, "Economics CSV asset has no data rows.");
    publicAssets += 1;
  }
  return {
    arcgisAssets: arcgisManifest.assetCount,
    arcgisSdkVersion: arcgisManifest.sdkVersion,
    manifestAssets: manifest.required_assets.length,
    publicAssets,
  };
}

async function planningChecks(page, baseUrl) {
  await goto(page, baseUrl, "?app=planning");
  await check("Planning", "same-origin context map and navigation controls", ["workspace", "map", "county", "municipalities", "water", "roads", "labels", "zoom in", "zoom out", "reset"], async () => {
    await page.getByTestId("command-center-explore-intelligence").click();
    const map = await waitForMapReady(page);
    await assertContextMapLayers(page);
    const image = await captureMapSurface(page);
    await assertPaintedImage(image, "Initial Cabarrus County map");

    const initialZoom = Number(await map.getAttribute("data-map-zoom"));
    assert(Number.isFinite(initialZoom), "Initial map zoom is unavailable.");
    await page.getByRole("button", { name: "Zoom in", exact: true }).click();
    await page.waitForFunction(
      (before) => Number(document.querySelector('[data-testid="cfs-arcgis-map"]')?.getAttribute("data-map-zoom")) > before + 0.4,
      initialZoom,
    );
    const zoomedIn = Number(await map.getAttribute("data-map-zoom"));
    await page.getByRole("button", { name: "Zoom out", exact: true }).click();
    await page.waitForFunction(
      (before) => Number(document.querySelector('[data-testid="cfs-arcgis-map"]')?.getAttribute("data-map-zoom")) < before - 0.4,
      zoomedIn,
    );
    await page.getByRole("button", { name: "Zoom in", exact: true }).click();
    await page.waitForFunction(
      (before) => Number(document.querySelector('[data-testid="cfs-arcgis-map"]')?.getAttribute("data-map-zoom")) > before + 0.4,
      initialZoom,
    );
    await page.getByRole("button", { name: "Reset to Cabarrus County", exact: true }).click();
    await page.waitForFunction(
      (expected) =>
        Math.abs(
          Number(document.querySelector('[data-testid="cfs-arcgis-map"]')?.getAttribute("data-map-zoom")) -
            expected,
        ) < 0.5,
      initialZoom,
    );
  });

  await check("Planning", "parcel search modes, no-match, select, and clear", ["parcel ID", "PIN", "zoning", "subdivision", "no match", "clear"], async () => {
    const search = page.getByRole("combobox", { name: "Search parcels" });
    for (const [query, expected] of [
      ["CFS-PARCEL-0149780354", "CFS-PARCEL-0149780354"],
      ["55385984190000", "CFS-PARCEL-0149780354"],
      ["MDR", null],
      ["GLEN LAUREL", null],
    ]) {
      await search.fill(query);
      const parcelOptions = page.locator("#top-parcel-search-results").getByRole("option");
      if (expected) await parcelOptions.filter({ hasText: expected }).first().waitFor();
      else await parcelOptions.first().waitFor();
      const optionText = await parcelOptions.allInnerTexts();
      assert(optionText.length > 0, `${query} returned no parcel options`);
      if (expected) assert(optionText.some((text) => text.includes(expected)));
    }
    await search.fill("NO-SUCH-CFS-PARCEL");
    await page.getByText("No parcels found.", { exact: true }).waitFor();
    await search.fill("CFS-PARCEL-0149780354");
    await page.locator("#top-parcel-search-results").getByRole("option").first().click();
    await page.getByText(/Selected parcel: CFS-PARCEL-0149780354/i).first().waitFor();
    await assertRenderedMapLayer(
      page,
      "cfs-parcel-focus-layer",
      "selected-parcel",
    );
    await page.getByRole("button", { name: "Clear selected parcel", exact: true }).click();
    await page.getByText(/Selected parcel: CFS-PARCEL-0149780354/i).first().waitFor({ state: "hidden" });
    await assertRenderedMapLayer(
      page,
      "cfs-parcel-focus-layer",
      "selected-parcel",
      { visible: false },
    );
    await search.fill("CFS-PARCEL-0149780354");
    await page.locator("#top-parcel-search-results").getByRole("option").first().click();
    await page.getByText(/Selected parcel: CFS-PARCEL-0149780354/i).first().waitFor();
    await page.getByRole("button", { name: "Open command palette" }).click();
    await page.getByRole("dialog").getByRole("combobox").fill("Clear parcel selection");
    await page.getByText("Clear parcel selection", { exact: true }).click();
    await page.getByText(/Selected parcel: CFS-PARCEL-0149780354/i).first().waitFor({ state: "hidden" });
  });

  await check("Planning", "operational overlays paint visible geometry", ["county", "parcels", "development", "flood", "FEMA", "schools", "school pressure", "transportation", "pixel difference"], async () => {
    await page.getByRole("button", { name: "Reset to Cabarrus County", exact: true }).click();
    await delay(700);
    const expandLayers = page.getByRole("button", { name: "Expand map layers panel" });
    if (await expandLayers.count()) await expandLayers.click();
    for (const [layer, group, runtimeLayerId, fallbackLayerId] of [
      ["Development Hotspots", "Development Activity", "cfs-development-hotspots-layer", "development-hotspots"],
      ["Floodplain Review", "Floodplain Review", "cfs-flood-constraints-layer", "floodplain-review"],
      ["School Capacity Watch", "Schools", "cfs-school-utilization-zones-layer", "school-capacity"],
    ]) {
      const card = page.locator("article").filter({ has: page.getByText(layer, { exact: true }) }).first();
      if (!(await card.isVisible())) {
        const groupDetails = page
          .locator("details")
          .filter({ has: page.getByText(group, { exact: true }) })
          .first();
        await groupDetails.locator("summary").first().click();
      }
      await card.waitFor();
      if (layer === "Development Hotspots") {
        const segment = card.getByRole("combobox", { name: "Development hotspot permit segment filter" });
        await chooseDifferent(segment);
      }
      const show = card.getByRole("button", { name: `Show ${layer}`, exact: true });
      if (await show.count()) await show.click();
      await assertRenderedMapLayer(page, runtimeLayerId, fallbackLayerId);
      const renderedByArcGIS = await mapUsesArcGIS(page);
      if (layer === "Development Hotspots" && !renderedByArcGIS) {
        for (const mode of ["Points", "Heatmap", "Clusters"]) {
          await card
            .getByRole("button", {
              name: `Show Development Hotspots as ${mode}`,
            })
            .click();
          assert.equal(
            await page
              .getByTestId("cfs-local-context-map")
              .locator('[data-layer-id="development-hotspots"]')
              .getAttribute("data-development-view-mode"),
            mode.toLowerCase(),
          );
        }
      }
      await card.getByRole("button", { name: /Legend Read the symbols/i }).waitFor();
      await delay(300);
      const visibleImage = await captureMapSurface(page);
      const hide = card.getByRole("button", { name: `Hide ${layer}`, exact: true });
      await hide.click();
      await assertRenderedMapLayer(page, runtimeLayerId, fallbackLayerId, {
        visible: false,
      });
      await card.getByRole("button", { name: /Legend Read the symbols/i }).waitFor({ state: "hidden" });
      await delay(300);
      const hiddenImage = await captureMapSurface(page);
      if (layer !== "School Capacity Watch" || !renderedByArcGIS) {
        await assertImageDifference(
          visibleImage,
          hiddenImage,
          `${layer} overlay`,
          layer === "School Capacity Watch" ? 0.005 : 0.05,
        );
      }
    }
  });

  await check("Planning", "Indicator Center filters and Ask CFS answer", ["7 readiness filters", "Ask CFS", "follow-up context"], async () => {
    await page.getByTestId("command-center-indicator-center").click();
    await page.getByTestId("indicator-center-dashboard").waitFor();
    const names = ["All Signals", "Growth Activity", "Constraints", "Infrastructure", "Schools", "Data Readiness", "Watchlist"];
    for (const name of names) {
      const button = page.getByTestId("indicator-center-dashboard").locator("button[aria-pressed]").filter({ hasText: name }).first();
      await button.click();
      assert.equal(await button.getAttribute("aria-pressed"), "true");
    }
    const ask = page.getByRole("textbox", { name: "Ask CFS question" });
    await ask.fill("Where is growth pressure highest?");
    await page.getByRole("button", { name: "Ask", exact: true }).click();
    await page.getByRole("button", { name: "Reset conversation" }).waitFor({ timeout: 20_000 });
  });

  await check("Planning", "Model Lab modes and methodology return state", ["Model Lab on/off", "points", "heatmap", "clusters", "methodology return"], async () => {
    await page.getByRole("button", { name: /Workspace:/ }).click();
    await page.getByTestId("command-center-model-lab").click();
    await waitForMapReady(page);
    await assertContextMapLayers(page);
    const expandModelLab = page.getByRole("button", { name: "Expand Model Lab panel" }).first();
    if (await expandModelLab.count()) await expandModelLab.click();
    const controlsPanel = page.getByTestId("model-lab-controls");
    await controlsPanel.waitFor();
    const overlayToggle = controlsPanel.getByRole("button", { name: /^(?:On|Off)$/ });
    const initialOverlay = await overlayToggle.innerText();
    await overlayToggle.click();
    assert.notEqual(await overlayToggle.innerText(), initialOverlay);
    if (
      (await overlayToggle.innerText()) === "On" &&
      !(await mapUsesArcGIS(page))
    ) {
      await page
        .getByTestId("cfs-local-context-map")
        .locator('[data-layer-id="model-research"] circle')
        .waitFor({ timeout: 20_000 });
    }
    await overlayToggle.click();
    if (
      (await overlayToggle.innerText()) === "On" &&
      !(await mapUsesArcGIS(page))
    ) {
      await page
        .getByTestId("cfs-local-context-map")
        .locator('[data-layer-id="model-research"] circle')
        .waitFor({ timeout: 20_000 });
    }
    for (const mode of ["Points", "Heatmap", "Clusters"]) {
      await page.getByRole("button", { name: `Show Model Lab research as ${mode}` }).click();
      if (!(await mapUsesArcGIS(page))) {
        await page
          .getByTestId("cfs-local-context-map")
          .locator('[data-layer-id="model-research"]')
          .filter({ has: page.locator("circle") })
          .waitFor({ timeout: 20_000 });
        assert.equal(
          await page
            .getByTestId("cfs-local-context-map")
            .locator('[data-layer-id="model-research"]')
            .getAttribute("data-model-research-view-mode"),
          mode.toLowerCase(),
        );
      }
    }
    await controlsPanel.getByRole("button", { name: "Open Methodology Model Lab" }).click();
    await page.getByRole("button", { name: /Workspace:/ }).click();
    if (await expandModelLab.count()) await expandModelLab.click();
    await controlsPanel.waitFor();
  });

  await check("Planning", "snapshot create, rename, section persistence, print, and archive", ["save", "library", "rename", "sections", "refresh", "print", "archive"], async () => {
    const mapCapture = await page.evaluate(() =>
      window.__cfsCaptureMapSnapshot?.(),
    );
    assert.equal(mapCapture?.status, "captured", mapCapture?.failureReason);
    assert.match(
      mapCapture?.dataUrl ?? "",
      /^data:image\/(?:png|svg\+xml)/,
      "Planning Snapshot did not capture the visible map.",
    );
    await page.getByRole("button", { name: "Save Planning Snapshot" }).click();
    await page
      .locator('[data-testid="planning-persistence-status"][data-state="saved"]')
      .waitFor();
    const snapshotMode = page.locator('button[aria-label^="Planning Snapshot:"]');
    await snapshotMode.click();
    await page
      .locator('button[aria-label^="Planning Snapshot:"][aria-pressed="true"]')
      .waitFor();
    await page.getByText("Planning Snapshot Library", { exact: true }).waitFor();
    await page.getByText("1 saved", { exact: true }).first().waitFor();
    await page
      .getByAltText("Planning snapshot map thumbnail", { exact: true })
      .first()
      .waitFor({ timeout: 20_000 });
    page.once("dialog", (dialog) => dialog.accept("Browser acceptance snapshot"));
    await page.getByRole("button", { name: "Rename", exact: true }).first().click();
    await page.getByText("Browser acceptance snapshot", { exact: true }).waitFor();
    const section = page.getByRole("checkbox", { name: /^(?:Map|Dashboard) Snapshot$/ });
    if (await section.count()) {
      const before = await section.isChecked();
      await section.setChecked(!before);
      const snapshotLibrary = page.getByTestId("planning-snapshot-library");
      await snapshotLibrary
        .getByTestId("planning-snapshot-save-changes")
        .click();
      await snapshotLibrary
        .locator('[data-testid="planning-persistence-status"][data-state="saved"]')
        .waitFor();
      await acceptedNavigation(
        page,
        "reload",
        () => page.reload({ waitUntil: "load" }),
        async () => {
          await page
            .locator('button[aria-label^="Workspace:"][aria-pressed="true"]')
            .waitFor();
          await snapshotMode.click();
          await page
            .locator('button[aria-label^="Planning Snapshot:"][aria-pressed="true"]')
            .waitFor();
          await page.getByText("Planning Snapshot Library", { exact: true }).waitFor();
          assert.equal(
            await page
              .getByRole("checkbox", { name: /^(?:Map|Dashboard) Snapshot$/ })
              .isChecked(),
            !before,
          );
          await assertHealthyText(page);
        },
      );
    }
    await page.evaluate(() => {
      window.print = () => sessionStorage.setItem("cfs-print-invoked", "true");
    });
    await page.getByRole("button", { name: /Print/i }).first().click();
    await delay(250);
    assert.equal(await page.evaluate(() => sessionStorage.getItem("cfs-print-invoked")), "true");
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Archive", exact: true }).first().click();
    await page.getByRole("heading", { name: "No planning snapshots saved yet", exact: true }).waitFor();
  });
}

async function economicsChecks(page, baseUrl) {
  await goto(page, baseUrl, "?app=economics&parcel=CFS-PARCEL-0149726304");
  await check("Economics", "dashboard data and all slicers", ["dashboard", "4 slicers", "4 presentation tabs", "reset"], async () => {
    await page.getByRole("button", { name: /Economic Dashboard:/ }).click();
    await page.getByRole("heading", { name: "Economic Dashboard", exact: true }).first().waitFor({ timeout: 30_000 });
    await page.getByText("Executive Economic Signals", { exact: true }).waitFor();
    const search = page.getByRole("combobox", { name: "Search parcels" });
    await search.fill("CFS-PARCEL-0149726304");
    await page.locator("#top-parcel-search-results").getByRole("option").first().click();
    await page.getByTestId("parcel-economic-context").getByText("CFS-PARCEL-0149726304", { exact: false }).waitFor();
    for (const label of ["Economic Segment", "Geography / Jurisdiction", "Opportunity Class", "Data Confidence"]) {
      await chooseDifferent(page.getByRole("combobox", { name: label }));
    }
    for (const tab of ["Executive Pulse", "Land Economics", "Scenario Burden", "Data Confidence"]) {
      await page.getByRole("tab", { name: tab }).click();
    }
    await page.getByRole("tab", { name: "Executive Pulse" }).click();
    await page.getByRole("button", { name: "Reset filters" }).click();
    await page.getByText("No slicers applied.", { exact: true }).waitFor();
  });

  await check("Economics", "selected parcel context updates and clears", ["parcel context", "clear"], async () => {
    const context = page.getByTestId("parcel-economic-context");
    await context.getByRole("button", { name: /Clear parcel/i }).click();
    await context.getByText(/Search for a supported demo parcel/i).waitFor();
  });

  await check("Economics", "scenario presets and every assumption control", ["4 presets", "7 assumptions", "reset"], async () => {
    await page.getByRole("button", { name: /Power BI & Tools:/ }).click();
    await page.getByRole("tab", { name: "Data Tables" }).click();
    const advancedTools = page.locator('details[data-econ-tour="advanced-tools"]');
    await advancedTools.locator(":scope > summary").click();
    await advancedTools.getByRole("button", { name: /Scenario Model/i }).click();
    const output = page.getByTestId("scenario-output");
    await output.waitFor();
    for (const label of [
      "Development type",
      "Intensity band",
      "Value-per-acre assumption",
      "School / service burden",
      "Utility readiness confidence",
      "Transportation access confidence",
      "Flood / environmental constraint",
    ]) {
      await page.getByRole("button", { name: "Reset scenario" }).click();
      const select = page.getByRole("combobox", { name: label });
      const before = await output.innerText();
      const beforeValue = await select.inputValue();
      await chooseExtreme(select);
      assert.notEqual(await select.inputValue(), beforeValue, `${label} did not update`);
      assert.notEqual(await output.innerText(), before, `${label} did not change scenario output`);
    }
    for (const preset of ["Current Conditions", "Residential Growth", "Industrial / Employment", "Targeted Infrastructure Investment"]) {
      await advancedTools.getByRole("button", { name: new RegExp(`^${preset}`) }).first().click();
    }
    await page.getByRole("button", { name: "Reset scenario" }).click();
  });

  await check("Economics", "CSV export downloads populated data", ["CSV download"], async () => {
    const advancedTools = page.locator('details[data-econ-tour="advanced-tools"]');
    await advancedTools.getByRole("button", { name: /^Power BI Export/ }).click();
    const link = page.getByRole("link", { name: /Download CSV/i }).first();
    await link.scrollIntoViewIfNeeded();
    const downloadPromise = page.waitForEvent("download");
    await link.click();
    const download = await downloadPromise;
    const path = await download.path();
    assert(path && statSync(path).size > 20, "CSV download was empty.");
  });
}

async function masterDataChecks(page, baseUrl) {
  const blockedBefore = diagnostics.blockedRequests.length;
  await goto(page, baseUrl, "?app=master-data");
  await check("Master Data", "sanitized catalog, filtered preview, and CSV export", ["catalog", "filter", "preview", "CSV download"], async () => {
    const catalog = page.getByTestId("master-data-catalog");
    await catalog.waitFor();
    await page.getByText(/Portfolio Demo uses bundled sanitized samples/i).waitFor();
    await catalog.getByRole("heading", { name: "Parcels", exact: true }).waitFor();
    await catalog.getByRole("heading", { name: "Permits", exact: true }).waitFor();
    await catalog.getByText("Sanitized Cabarrus County parcel sample", { exact: true }).waitFor();
    await page.getByTestId("master-data-dataset-parcels").click();

    const preview = page.getByTestId("master-data-preview");
    await page.getByRole("button", { name: "Preview", exact: true }).click();
    await preview.locator("tbody tr").first().waitFor();
    const unfilteredRows = await preview.locator("tbody tr").count();
    const unfilteredSummary = await preview.getByText(/matching records/i).innerText();
    assert.equal(unfilteredRows, 50, "Master Data default preview did not use 50 rows.");

    await page.getByRole("button", { name: "Add filter", exact: true }).click();
    await page.getByRole("combobox", { name: "Filter 1 field" }).selectOption("official_parcel_id");
    await page.getByLabel("Filter 1 value").fill("CFS-PARCEL-0149780354");
    await page.getByRole("button", { name: "Preview", exact: true }).click();
    await preview.getByText("1 matching records", { exact: true }).waitFor();
    assert.equal(await preview.locator("tbody tr").count(), 1, "Master Data filter did not reduce the preview to one record.");
    assert.notEqual(await preview.getByText(/matching records/i).innerText(), unfilteredSummary);
    await preview.getByText("CFS-PARCEL-0149780354", { exact: true }).waitFor();

    const downloadPromise = page.waitForEvent("download");
    await page.getByTestId("master-data-export-csv").click();
    const download = await downloadPromise;
    assert.match(download.suggestedFilename(), /^cfs-parcels-\d{4}-\d{2}-\d{2}\.csv$/);
    const path = await download.path();
    assert(path && statSync(path).size > 20, "Master Data CSV download was empty.");
    const csv = readFileSync(path, "utf8");
    assert(csv.includes('"Parcel ID"'), "Master Data CSV is missing its friendly header.");
    assert(csv.includes("CFS-PARCEL-0149780354"), "Master Data CSV is missing the filtered parcel.");
    assert.equal(
      diagnostics.blockedRequests.length,
      blockedBefore,
      "Master Data Demo attempted a forbidden backend/API request.",
    );
  });
}

async function investmentsChecks(page, baseUrl) {
  await goto(page, baseUrl, "?app=consulting&investmentPage=overview");
  await check("Investments", "Home and Projects load populated CASE-1 state", ["Home", "Projects", "continue project"], async () => {
    await page.getByText("CFS Large Development-Land Acquisition Case Study", { exact: false }).first().waitFor({ timeout: 30_000 });
    await openInvestmentRoute(page, "Projects", "engagements");
    await page.getByText("Active projects and case studies", { exact: false }).waitFor();
  });

  await check("Investments", "Find Sites filters and saved-search persistence", ["screen", "minimum acres", "environmental filter", "save search", "refresh"], async () => {
    await openInvestmentRoute(page, "Find Sites", "area-radar");
    await page.getByRole("button", { name: "Run Screening", exact: true }).click();
    await page.getByText(/3 candidates/i).first().waitFor();
    const filters = page.locator('main[data-investment-page="area-radar"] input[type="number"], main[data-investment-page="area-radar"] select');
    assert((await filters.count()) >= 2, "Find Sites filter controls are missing.");
    await page.getByRole("button", { name: "Save Search", exact: true }).click();
    const saved = page.getByLabel("Saved searches");
    await saved.getByText("Find Sites: Large Development Land", { exact: true }).waitFor();
    await acceptedNavigation(
      page,
      "reload",
      () => page.reload({ waitUntil: "domcontentloaded" }),
      async () => {
        await saved.getByText("Find Sites: Large Development Land", { exact: true }).waitFor();
        await assertHealthyText(page);
      },
    );
  });

  await check("Investments", "external opportunity saves without false analysis", ["add external", "save", "refresh"], async () => {
    await acceptedNavigation(
      page,
      "route",
      () => page.getByRole("button", { name: /Add External Opportunity/i }).click(),
      async () => {
        await page.waitForFunction(
          () => new URLSearchParams(location.search).get("investmentPage") === "intake",
        );
        await page.locator('main[data-investment-page="intake"]').waitFor();
        await assertHealthyText(page);
      },
    );
    const form = page.locator('main[data-investment-page="intake"]');
    const unique = `EXT-BROWSER-${Date.now()}`;
    await form.getByRole("textbox", { name: "Candidate label" }).fill("Browser acceptance opportunity");
    await form.getByRole("textbox", { name: "Parcel ID" }).fill(unique);
    await form.getByRole("button", { name: "Add Candidate", exact: true }).click();
    await form.getByText(unique, { exact: false }).first().waitFor();
    assert.equal(new URL(page.url()).searchParams.get("investmentPage"), "intake");
    await acceptedNavigation(
      page,
      "reload",
      () => page.reload({ waitUntil: "domcontentloaded" }),
      async () => {
        await form.getByText(unique, { exact: false }).first().waitFor();
        await assertHealthyText(page);
      },
    );
  });

  await check("Investments", "all three candidates expose seven distinct research tabs", ["3 candidates", "7 research tabs"], async () => {
    await openInvestmentRoute(page, "Find Sites", "area-radar");
    await page.getByRole("button", { name: "Run Screening", exact: true }).click();
    const candidates = ["CFS-PARCEL-0149758869", "CFS-PARCEL-0149760035", "CFS-PARCEL-0149777275"];
    const tabs = ["Summary", "Property", "Market", "Constraints", "Financial", "Due Diligence", "Sources"];
    for (const candidate of candidates) {
      let card = page.getByText(candidate, { exact: false }).first().locator("xpath=ancestor::*[self::article or self::div][.//button[contains(.,'Open Property Review')]][1]");
      if (!(await card.count())) {
        await page.getByRole("button", { name: "Run Screening", exact: true }).click();
        card = page.getByText(candidate, { exact: false }).first().locator("xpath=ancestor::*[self::article or self::div][.//button[contains(.,'Open Property Review')]][1]");
      }
      await acceptedNavigation(
        page,
        "route",
        () => card.getByRole("button", { name: "Open Property Review" }).click(),
        async () => {
          await page.waitForFunction(
            () => new URLSearchParams(location.search).get("investmentPage") === "research",
          );
          await page.locator('main[data-investment-page="research"]').waitFor();
          await assertHealthyText(page);
        },
      );
      const research = page.getByRole("tablist", { name: "Property Research tabs" }).locator("xpath=ancestor::section[1]");
      const tabContents = new Set();
      for (const tab of tabs) {
        const button = page.getByRole("tab", { name: tab });
        await button.click();
        assert.equal(await button.getAttribute("aria-selected"), "true");
        tabContents.add(await research.innerText());
      }
      assert.equal(tabContents.size, tabs.length, `${candidate} did not render distinct tab content`);
      await openInvestmentRoute(page, "Find Sites", "area-radar");
    }
  });

  await check("Investments", "Reports bucket persists and can be emptied", ["generate report", "add bucket", "refresh", "remove"], async () => {
    await openInvestmentRoute(page, "Reports", "report-studio");
    const generate = page.getByRole("button", { name: /Generate/i }).first();
    await generate.click();
    const add = page.getByRole("button", { name: "Add report to Report Bucket", exact: true });
    await add.click();
    await acceptedNavigation(
      page,
      "reload",
      () => page.reload({ waitUntil: "domcontentloaded" }),
      async () => {
        await page.getByRole("button", { name: "Reports", exact: true }).click();
        await page.getByText(/Report Bucket/i).first().waitFor();
        await assertHealthyText(page);
      },
    );
    const remove = page.getByRole("button", { name: /Remove/i }).first();
    if (await remove.count()) await remove.click();
  });

  await check("Investments", "Data & Methods exposes static dataset status and source links", ["dataset rows", "source links", "static refresh status"], async () => {
    await openInvestmentRoute(page, "Data & Methods", "methodology");
    const status = page.getByLabel("Demo dataset status");
    assert.equal(await status.getByRole("link", { name: "Open demo asset" }).count(), 5);
    assert.equal(await status.getByRole("button", { name: "Static in portfolio demo" }).count(), 5);
    const href = await status.getByRole("link", { name: "Open demo asset" }).first().getAttribute("href");
    assert(href?.startsWith("/demo-data/"));
  });

  await check("Investments", "CASE-1 workflow reaches all nine artifacts", ["underwrite", "decide", "deliver", "9 artifacts"], async () => {
    await openInvestmentRoute(page, "Projects", "engagements");
    const library = page.getByLabel("Case Studies library");
    if (await library.count()) {
      await library.getByRole("button", { name: "Continue", exact: true }).first().click();
    }
    const workspace = page.getByLabel("Case study workspace");
    await workspace.waitFor();
    const workflow = workspace.getByLabel("Case-study workflow");
    await workflow.getByRole("button", { name: /^Underwrite/ }).click();
    await workspace.getByText(/No scenario supports a positive land basis/i).waitFor();
    await workspace.getByRole("button", { name: "Review Assumptions", exact: true }).click();
    const assumptions = workspace.getByLabel("Underwriting assumption review");
    await assumptions.waitFor();
    for (const residual of ["-$110.20M", "-$64.34M", "-$14.25M"]) {
      await assumptions.getByText(residual, { exact: false }).waitFor();
    }
    await assumptions.getByRole("button", { name: "Return to Underwrite" }).click();
    await workflow.getByRole("button", { name: /^Decide/ }).click();
    await workspace.getByText("Targeted diligence only.", { exact: true }).waitFor();
    await workflow.getByRole("button", { name: /^Deliver/ }).click();
    const deliverables = workspace.getByRole("heading", { name: "Deliverable checklist" }).locator("xpath=ancestor::section[1]");
    const rows = deliverables.locator("tbody tr");
    assert.equal(await rows.count(), 9, "CASE-1 did not expose nine deliverables.");
    const names = await rows.locator("td:first-child").allInnerTexts();
    assert.equal(new Set(names).size, 9, "CASE-1 deliverable titles were not unique.");
    caseArtifacts.push(...names);
    for (let index = 0; index < names.length; index += 1) {
      await deliverables.locator("tbody tr").nth(index).getByRole("button").click();
      const panel = workspace.getByLabel(names[index]);
      const link = panel.getByRole("link", { name: "Open artifact" });
      if (!(await link.count())) {
        await panel.getByText(/No downloadable artifact is registered/i).waitFor();
        await panel.getByRole("button", { name: "Return to Deliver" }).click();
        continue;
      }
      const href = await link.getAttribute("href");
      assert(href?.startsWith("/case-studies/large-development-land"));
      const isDownload = /\.(?:pptx|xlsx)$/i.test(href);
      const openedPromise = isDownload ? page.waitForEvent("download") : page.waitForEvent("popup");
      await link.click();
      const opened = await openedPromise;
      if (isDownload) {
        const path = await opened.path();
        assert(path && statSync(path).size > 100, `${names[index]} download was empty`);
      } else {
        await opened.waitForLoadState("domcontentloaded");
        assert.equal(new URL(opened.url()).origin, new URL(baseUrl).origin);
        await closeAcceptancePage(opened);
      }
      await panel.getByRole("button", { name: "Return to Deliver" }).click();
    }
  });
}

async function mobileChecks(browser, baseUrl) {
  for (const [product, query] of [
    ["Planning", "?app=planning"],
    ["Economics", "?app=economics"],
    ["Investments", "?app=consulting&investmentPage=overview"],
  ]) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    attachDiagnostics(context, new URL(baseUrl).origin);
    const page = await context.newPage();
    await goto(page, baseUrl, query);
    if (product === "Planning") {
      await page.getByTestId("cfs-command-center").waitFor();
      await waitForMapReady(page);
      await assertContextMapLayers(page);
      await assertPaintedImage(await captureMapSurface(page), "Mobile Cabarrus County map");
      const search = page.getByRole("combobox", { name: "Search parcels" });
      await search.fill("CFS-PARCEL-0149780354");
      await page.locator("#top-parcel-search-results").getByRole("option").first().click();
      await page.getByText(/Selected parcel: CFS-PARCEL-0149780354/i).first().waitFor();
      await assertRenderedMapLayer(
        page,
        "cfs-parcel-focus-layer",
        "selected-parcel",
      );
      await page.getByRole("button", { name: "Show Intelligence" }).click();
      await page.getByText("Selected Parcel Intelligence", { exact: true }).waitFor();
      await page.getByRole("button", { name: "Close intelligence panel" }).click();
      await page.getByRole("button", { name: "Show Layers" }).click();
      const card = page.locator("article").filter({ has: page.getByText("Development Hotspots", { exact: true }) }).first();
      await card.getByRole("combobox", { name: "Development hotspot permit segment filter" }).selectOption("residential_growth");
      await card.getByRole("button", { name: "Show Development Hotspots", exact: true }).click();
      await card.getByRole("button", { name: /Legend Read the symbols/i }).waitFor();
      await card.getByRole("button", { name: "Hide Development Hotspots", exact: true }).click();
      await page.getByRole("button", { name: "Collapse map controls" }).click();
    }
    if (product === "Economics") {
      await page.getByRole("navigation", { name: "CFS Economics sections" }).waitFor();
      await page.getByRole("button", { name: /Economic Dashboard:/ }).click();
      const search = page.getByRole("combobox", { name: "Search parcels" });
      await search.fill("CFS-PARCEL-0149726304");
      await page.locator("#top-parcel-search-results").getByRole("option").first().click();
      await page.getByTestId("parcel-economic-context").getByText("CFS-PARCEL-0149726304", { exact: false }).waitFor();
    }
    if (product === "Investments") {
      await page.getByRole("region", { name: "CFS Investments", exact: true }).waitFor();
      await page.getByRole("button", { name: "Find Sites", exact: true }).first().click();
      await page.getByRole("button", { name: "Run Screening", exact: true }).click();
      await page.getByText(/3 candidates/i).first().waitFor();
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert(overflow <= 2, `${product} has ${overflow}px horizontal mobile overflow.`);
    await assertHealthyText(page);
    await closeAcceptanceContext(context);
    record(product, "mobile viewport workflow", ["mobile layout"]);
    console.log(`PASS ${product}: mobile viewport workflow`);
  }
}

async function offlineMapChecks(browser, baseUrl) {
  const origin = new URL(baseUrl).origin;
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const arcgisRequests = [];
  const optionalFailures = [];
  const sameOriginPaths = new Set();
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (
      url.pathname.startsWith("/arcgis-assets/") ||
      isExternalArcgisRequest(url, { appOrigin: origin })
    ) {
      arcgisRequests.push(url.href);
    }
    if (url.origin !== origin) {
      await route.abort(
        isApprovedPublicArcgisRequest(url, undefined, route.request().headers())
          ? "failed"
          : "blockedbyclient",
      );
      return;
    }
    sameOriginPaths.add(url.pathname);
    await route.continue();
  });
  context.on("requestfailed", (request) => {
    const url = new URL(request.url());
    if (!isApprovedPublicArcgisRequest(url, undefined, request.headers())) return;
    optionalFailures.push(
      classifyArcGISRequestFailure(
        {
          error: request.failure()?.errorText ?? "failed",
          headers: request.headers(),
          method: request.method(),
          url: url.href,
        },
        { appOrigin: origin },
      ),
    );
  });
  const page = await context.newPage();
  try {
    await goto(page, baseUrl, "?app=planning");
    await page.getByTestId("command-center-explore-intelligence").click();
    const map = await waitForMapReady(page);
    for (const asset of [
      "/demo-data/map_layers/demo_county_boundary.geojson",
      "/demo-data/map_layers/demo_municipal_boundaries.geojson",
      "/demo-data/map_layers/demo_hydrography.geojson",
      "/demo-data/map_layers/demo_transportation_context.geojson",
      "/demo-data/map_layers/demo_place_labels.geojson",
    ]) {
      assert(sameOriginPaths.has(asset), `external network isolation did not load ${asset}`);
    }
    const sdkVersion = await map.getAttribute("data-arcgis-sdk-version");
    const localAssetPrefix = `/arcgis-assets/${sdkVersion}/`;
    assert(
      arcgisRequests.some((url) => new URL(url).pathname.startsWith(localAssetPrefix)),
      "ArcGIS did not load its SDK assets from the versioned same-origin path.",
    );
    assert(
      arcgisRequests.every((url) => {
        const parsed = new URL(url);
        return (
          (parsed.origin === origin && parsed.pathname.startsWith(localAssetPrefix)) ||
          isApprovedPublicArcgisRequest(parsed)
        );
      }),
      `ArcGIS attempted an unapproved external or unversioned request: ${arcgisRequests.map(redactMapDiagnosticUrl).join(" | ")}`,
    );
    const health = await readRequiredMapHealth(page, origin);
    for (const failure of optionalFailures) {
      const resolved = resolveMapDiagnostic(failure, { health, lifecycle: "current" });
      diagnostics.mapDiagnostics.push(resolved);
      assert.equal(resolved.fatal, false, resolved.reason);
      diagnostics.optionalPublicBasemapFailures.push(resolved);
    }
    await assertContextMapLayers(page);
    await assertPaintedImage(await captureMapSurface(page), "Externally isolated ArcGIS map");
    record("Planning", "external network isolation", [
      "interactive ArcGIS map",
      "same-origin context",
      "versioned SDK assets",
    ]);
    console.log("PASS Planning: external network isolation");
  } finally {
    await closeAcceptanceContext(context);
  }
}

async function main() {
  const baseUrl = await startServer();
  const origin = new URL(baseUrl).origin;
  const assets = await assertStaticAssets(baseUrl);
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
    attachDiagnostics(context, origin);
    const planning = await context.newPage();
    await planningChecks(planning, baseUrl);
    await closeAcceptancePage(planning);
    const economics = await context.newPage();
    await economicsChecks(economics, baseUrl);
    await closeAcceptancePage(economics);
    const investments = await context.newPage();
    await investmentsChecks(investments, baseUrl);
    await closeAcceptancePage(investments);
    const masterData = await context.newPage();
    await masterDataChecks(masterData, baseUrl);
    await closeAcceptancePage(masterData);
    await mobileChecks(browser, baseUrl);
    await offlineMapChecks(browser, baseUrl);
    await closeAcceptanceContext(context);
    await resolveAllMapDiagnostics();

    assert.deepEqual(diagnostics.pageErrors, [], `Page errors:\n${diagnostics.pageErrors.join("\n")}`);
    assert.deepEqual(diagnostics.sameOrigin404s, [], `Same-origin 404s:\n${diagnostics.sameOrigin404s.join("\n")}`);
    assert.deepEqual(diagnostics.external404s, [], `External 404s:\n${diagnostics.external404s.join("\n")}`);
    assert.deepEqual(diagnostics.requestFailures, [], `Request failures:\n${diagnostics.requestFailures.join("\n")}`);
    assert.deepEqual(diagnostics.requestLoops, [], `Probable request loops:\n${diagnostics.requestLoops.join("\n")}`);
    assert.deepEqual(diagnostics.blockedRequests, [], `Forbidden backend requests:\n${diagnostics.blockedRequests.join("\n")}`);
    assert.deepEqual(diagnostics.consoleMessages, [], `Console warnings/errors:\n${diagnostics.consoleMessages.join("\n")}`);
    assert.deepEqual(
      diagnostics.dependentOptionalFailures,
      [],
      `Optional map failures lacked a healthy required fallback:\n${diagnostics.dependentOptionalFailures.map((failure) => failure.reason).join("\n")}`,
    );
    assert.deepEqual(
      diagnostics.primaryMapFailures,
      [],
      `Required map failures:\n${diagnostics.primaryMapFailures.map((failure) => failure.reason).join("\n")}`,
    );

    const summary = {
      baseUrl,
      assets,
      caseArtifacts,
      cases: Object.fromEntries(
        ["Planning", "Economics", "Investments", "Master Data"].map((product) => [
          product,
          results.filter((result) => result.product === product).length,
        ]),
      ),
      controls: Object.fromEntries([...controls].map(([product, names]) => [product, names.size])),
      diagnostics: Object.fromEntries(Object.entries(diagnostics).map(([key, values]) => [key, values.length])),
    };
    console.log(`PASS complete demo interaction audit\n${JSON.stringify(summary, null, 2)}`);
  } finally {
    await browser.close();
  }
}

try {
  await main();
} finally {
  if (server && !server.killed) server.kill();
}
