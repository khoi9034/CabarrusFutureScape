import assert from "node:assert/strict";
import { existsSync } from "node:fs";
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
  mapDiagnosticRequestKey,
  optionalPublicMapResources,
  redactMapDiagnosticUrl,
  REQUIRED_CFS_BASEMAP_ID,
  REQUIRED_CFS_CONTEXT_LAYER_IDS,
  REQUIRED_CFS_FALLBACK_LABEL_LAYER_ID,
  resolveMapDiagnostic,
  runClassificationSafetyMatrix,
} from "./map-acceptance-classification.mjs";

const baseUrl = (
  process.env.CFS_MAP_BASE_URL ??
  process.env.CFS_DEMO_BASE_URL ??
  "http://127.0.0.1:3000"
).replace(/\/$/, "");
const origin = new URL(baseUrl).origin;
const apiOrigin = new URL(
  process.env.CFS_API_BASE_URL ?? "http://127.0.0.1:8000",
).origin;
const optionalPublicResources = optionalPublicMapResources();
const classifierOnly = process.argv.includes("--check-map-classifier");
const requiredFailureProbe = process.argv.includes("--probe-required-map-failure");
if (classifierOnly) {
  const matrix = runClassificationSafetyMatrix();
  assert.equal(matrix.length, 64);
  console.log("PASS map resilience shared classifier matrix");
  process.exit(0);
}
const executablePath = [
  process.env.CFS_BROWSER_EXECUTABLE,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
].find((path) => path && existsSync(path));
assert(executablePath, "Chrome or Edge was not found.");

const browser = await chromium.launch({
  args: [
    "--enable-unsafe-swiftshader",
    "--enable-webgl",
    "--no-sandbox",
    "--use-angle=swiftshader",
  ],
  executablePath,
  headless: true,
});
const results = [];
const diagnostics = {
  arcgisAssetRequests: new Set(),
  console: [],
  expectedRendererErrors: [],
  externalArcgisRequests: [],
  loops: [],
  mapDiagnostics: [],
  optionalPublicBasemapFailures: [],
  pageErrors: [],
  requestFailures: [],
  requiredFailureNegativeProofs: [],
  unexpectedExternalArcgisRequests: [],
};

async function run(
  name,
  configure = async () => {},
  verify = async () => {},
  expectedRenderer = "interactive",
  expectedRequiredClassification = null,
) {
  const context = await browser.newContext();
  const counts = new Map();
  const requestEpochs = new WeakMap();
  const requestObservations = new WeakMap();
  const successfulRequestKeys = new Map();
  let requestSequence = 0;
  const healthyScenario = expectedRequiredClassification === null;
  const scenario = {
    acceptanceGeneration: 0,
    acceptanceLifecycle: [],
    apiFailures: [],
    currentHealth: null,
    dependentFailures: [],
    destroyed: false,
    expectedRequiredClassification,
    expectedRequiredFailures: [],
    expectedOptionalFatal: [],
    fatalConsole: [],
    fatalRequests: [],
    forcedRendererFailureActive:
      expectedRenderer === "static" && expectedRequiredClassification === null,
    navigationEpoch: 0,
    name,
    optionalCandidates: [],
    pageErrors: [],
    pendingRequiredRequests: new Map(),
    successfulRequestKeys,
    terminalSuccessfulRequestKeys: new Map(),
    provenAcceptanceGeneration: 0,
    teardownCompleted: false,
    teardownGeneration: null,
    teardownStarted: false,
    trackRequiredRequests: healthyScenario,
  };
  context.on("request", (request) => {
    requestEpochs.set(request, scenario.navigationEpoch);
    const url = new URL(request.url());
    const sequence = ++requestSequence;
    requestObservations.set(request, {
      acceptanceGeneration: scenario.acceptanceGeneration,
      acceptanceLifecycleLabel: scenario.acceptanceLifecycle.at(-1)?.label ?? null,
      requestKey: mapDiagnosticRequestKey(
        url,
        optionalPublicResources,
        request.method(),
      ),
      sequence,
    });
    if (scenario.trackRequiredRequests && isRequiredRouteRequest(url)) {
      scenario.pendingRequiredRequests.set(request, {
        acceptanceGeneration: scenario.acceptanceGeneration,
        method: request.method(),
        lastLifecycleEvent: "request",
        navigationEpoch: scenario.navigationEpoch,
        requestId: request.headers()["x-request-id"] ?? null,
        responseStatus: null,
        sequence,
        startedAt: new Date().toISOString(),
        startedMs: Date.now(),
        url: url.href,
      });
    }
    const count = (counts.get(request.url()) ?? 0) + 1;
    counts.set(request.url(), count);
    if (count === 26) diagnostics.loops.push(`${name}: ${redactMapDiagnosticUrl(request.url())}`);
    if (url.pathname.startsWith("/arcgis-assets/")) {
      diagnostics.arcgisAssetRequests.add(redactMapDiagnosticUrl(url));
    }
    if (url.origin !== origin && /(?:arcgis|esri)/i.test(url.hostname)) {
      diagnostics.externalArcgisRequests.push(`${name}: ${redactMapDiagnosticUrl(url)}`);
    }
    if (
      isExternalArcgisRequest(url, { apiOrigin, appOrigin: origin }) &&
      !isApprovedPublicArcgisRequest(
        url,
        optionalPublicResources,
        request.headers(),
      )
    ) {
      diagnostics.unexpectedExternalArcgisRequests.push(
        `${name}: ${redactMapDiagnosticUrl(url)}`,
      );
    }
  });
  context.on("requestfailed", (request) => {
    const url = new URL(request.url());
    scenario.pendingRequiredRequests.delete(request);
    const diagnostic = classifyArcGISRequestFailure(
      {
        error: request.failure()?.errorText ?? "failed",
        headers: request.headers(),
        method: request.method(),
        url: url.href,
      },
      { apiOrigin, appOrigin: origin, resources: optionalPublicResources },
    );
    if (
      (expectedRequiredClassification === "required_arcgis_sdk_failure" &&
        url.pathname.startsWith("/arcgis-assets/")) ||
      (expectedRequiredClassification === "required_same_origin_context_failure" &&
        url.pathname.endsWith("/demo_transportation_context.geojson"))
    ) {
      assert.equal(diagnostic.fatal, true, "A forced required request was not classified fatal.");
      scenario.expectedRequiredFailures.push(diagnostic);
      diagnostics.mapDiagnostics.push({ ...diagnostic, scenario: name });
      diagnostics.expectedRendererErrors.push(
        `${name}: ${diagnostic.reason} ${redactMapDiagnosticUrl(url)}`,
      );
      return;
    }
    if (
      ["optional_public_basemap_candidate", "required_request_cancellation_candidate"].includes(
        diagnostic.classification,
      )
    ) {
      const observation = requestObservations.get(request);
      const record = {
        ...diagnostic,
        acceptance_generation:
          observation?.acceptanceGeneration ?? scenario.acceptanceGeneration,
        acceptance_lifecycle: observation?.acceptanceLifecycleLabel ?? null,
        navigation_epoch: requestEpochs.get(request) ?? scenario.navigationEpoch,
        request_key: observation?.requestKey ?? diagnostic.request_key ?? null,
        request_sequence: observation?.sequence ?? null,
        scenario: name,
      };
      diagnostics.mapDiagnostics.push(record);
      scenario.optionalCandidates.push(record);
      return;
    }
    if (diagnostic.fatal === false) {
      diagnostics.mapDiagnostics.push({ ...diagnostic, scenario: name });
      return;
    }
    if (
      url.origin === origin ||
      url.origin === apiOrigin ||
      isExternalArcgisRequest(url, { apiOrigin, appOrigin: origin })
    ) {
      const message = `${name}: ${diagnostic.reason} ${redactMapDiagnosticUrl(url)}`;
      scenario.fatalRequests.push(message);
      diagnostics.mapDiagnostics.push({ ...diagnostic, scenario: name });
      diagnostics.requestFailures.push(message);
    }
  });
  context.on("response", (response) => {
    const url = new URL(response.url());
    const observation = requestObservations.get(response.request());
    const pendingRequired = scenario.pendingRequiredRequests.get(response.request());
    if (pendingRequired) {
      pendingRequired.responseStatus = response.status();
      pendingRequired.lastLifecycleEvent = "response";
    }
    if (response.status() >= 200 && response.status() < 300 && observation?.requestKey) {
      successfulRequestKeys.set(
        observation.requestKey,
        Math.max(successfulRequestKeys.get(observation.requestKey) ?? 0, observation.sequence),
      );
    }
    if (
      response.status() >= 400 &&
      (url.origin === apiOrigin ||
        (url.origin === origin && /^\/(?:api\/v1|parcels)(?:\/|$)/i.test(url.pathname)))
    ) {
      scenario.apiFailures.push(
        `${response.status()} ${response.request().method()} ${redactMapDiagnosticUrl(url)}`,
      );
    }
    if (
      response.status() >= 400 &&
      isMapDiagnosticRequest(url, {
        apiOrigin,
        appOrigin: origin,
        resources: optionalPublicResources,
      })
    ) {
      const diagnostic = classifyArcGISHttpFailure(
        {
          headers: response.request().headers(),
          method: response.request().method(),
          status: response.status(),
          url: url.href,
        },
        { apiOrigin, appOrigin: origin, resources: optionalPublicResources },
      );
      if (diagnostic.classification === "optional_public_basemap_candidate") {
        const record = {
          ...diagnostic,
          acceptance_generation:
            observation?.acceptanceGeneration ?? scenario.acceptanceGeneration,
          acceptance_lifecycle: observation?.acceptanceLifecycleLabel ?? null,
          navigation_epoch:
            requestEpochs.get(response.request()) ?? scenario.navigationEpoch,
          request_key: observation?.requestKey ?? diagnostic.request_key ?? null,
          request_sequence: observation?.sequence ?? null,
          scenario: name,
        };
        diagnostics.mapDiagnostics.push(record);
        scenario.optionalCandidates.push(record);
      } else if (diagnostic.fatal) {
        const message = `${name}: ${diagnostic.reason} HTTP ${response.status()} ${redactMapDiagnosticUrl(url)}`;
        scenario.fatalRequests.push(message);
        diagnostics.mapDiagnostics.push({ ...diagnostic, scenario: name });
        diagnostics.requestFailures.push(message);
      }
    }
  });
  context.on("requestfinished", (request) => {
    completeRequiredRouteRequest(scenario, request);
  });
  const page = await context.newPage();
  page.setDefaultTimeout(60_000);
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) {
      counts.clear();
      scenario.navigationEpoch += 1;
    }
  });
  page.on("pageerror", (error) => {
    const diagnostic = classifyPageError(error);
    if (
      scenario.forcedRendererFailureActive &&
      error.message === "s" &&
      !error.stack
    ) {
      diagnostics.mapDiagnostics.push({
        ...diagnostic,
        classification: "expected_forced_webgl_page_exception",
        fatal: false,
        scenario: name,
      });
      diagnostics.expectedRendererErrors.push(`${name}: pageerror ${error.message}`);
      return;
    }
    const message = `${name}: ${diagnostic.message}`;
    scenario.pageErrors.push(message);
    diagnostics.mapDiagnostics.push({ ...diagnostic, scenario: name });
    diagnostics.pageErrors.push(message);
  });
  page.on("console", (message) => {
    if (!['error', 'warning'].includes(message.type())) return;
    const text = message.text();
    if (/GL Driver Message.*GPU stall due to ReadPixels/.test(text)) return;
    if (/\[@arcgis\/core\/views\/MapView\] Font .* is not available/.test(text)) return;
    if (
      scenario.forcedRendererFailureActive &&
      /^\[@arcgis\/core\/views\/MapView\] #validate\(\) WebGL2 is required but not supported\.$/.test(
        text,
      )
    ) {
      diagnostics.mapDiagnostics.push({
        classification: "expected_forced_webgl_console_warning",
        event_type: "console",
        fallback_healthy: null,
        fatal: false,
        message: text,
        reason: "The forced WebGL-negative scenario produced its expected pre-retry MapView validation warning.",
        scenario: name,
      });
      diagnostics.expectedRendererErrors.push(`${name}: console ${text}`);
      return;
    }
    const diagnostic = classifyArcGISConsoleFailure(
      { locationUrl: message.location().url, text },
      { apiOrigin, appOrigin: origin, resources: optionalPublicResources },
    );
    if (diagnostic.classification === "optional_public_basemap_candidate") {
      const record = {
        ...diagnostic,
        acceptance_generation: scenario.acceptanceGeneration,
        acceptance_lifecycle: scenario.acceptanceLifecycle.at(-1)?.label ?? null,
        navigation_epoch: scenario.navigationEpoch,
        page_url: redactMapDiagnosticUrl(page.url()),
        scenario: name,
      };
      diagnostics.mapDiagnostics.push(record);
      scenario.optionalCandidates.push(record);
      return;
    }
    if (diagnostic.fatal === false) {
      diagnostics.mapDiagnostics.push({ ...diagnostic, scenario: name });
      return;
    }
    if (
      expectedRequiredClassification === "required_arcgis_sdk_failure" &&
      (message.location().url.includes("/arcgis-assets/") ||
        /wasm streaming compile failed|falling back to ArrayBuffer|failed to asynchronously prepare wasm|Aborted\(both async and sync fetching/i.test(
          text,
        ))
    ) {
      const required = {
        ...diagnostic,
        classification: "required_arcgis_sdk_failure",
        fatal: true,
        reason: "Forced required same-origin ArcGIS SDK failure surfaced in the console.",
      };
      scenario.expectedRequiredFailures.push(required);
      diagnostics.mapDiagnostics.push({ ...required, scenario: name });
      diagnostics.expectedRendererErrors.push(`${name}: console ${text}`);
      return;
    }
    if (
      expectedRequiredClassification === "required_same_origin_context_failure" &&
      message.location().url.endsWith("/demo_transportation_context.geojson")
    ) {
      const required = {
        ...diagnostic,
        classification: "required_same_origin_context_failure",
        fatal: true,
        reason: "Forced required same-origin context failure surfaced in the console.",
      };
      scenario.expectedRequiredFailures.push(required);
      diagnostics.mapDiagnostics.push({ ...required, scenario: name });
      diagnostics.expectedRendererErrors.push(`${name}: console ${text}`);
      return;
    }
    const fatalMessage = `${name}: ${message.type()}: ${diagnostic.message ?? "[diagnostic redacted]"} (${diagnostic.reason})`;
    scenario.fatalConsole.push(fatalMessage);
    diagnostics.mapDiagnostics.push({ ...diagnostic, scenario: name });
    diagnostics.console.push(fatalMessage);
  });

  await configure(context, page);
  let primaryError = null;
  try {
    await runAcceptanceLifecycle(
      scenario,
      "initial Planning navigation",
      () =>
        page.goto(`${baseUrl}/?app=planning`, {
          waitUntil: "domcontentloaded",
          timeout: 45_000,
        }),
      () =>
        expectedRenderer === "interactive"
          ? assertInteractiveMap(page)
          : assertEmergencyFallback(page),
    );
    await verify(context, page, scenario);
    if (scenario.trackRequiredRequests) {
      await waitForRequiredRouteRequests(scenario, `${name} verification`);
    }
    scenario.currentHealth = await readRequiredMapHealth(page, scenario);
    resolveScenarioCandidates(scenario);
    if (expectedRequiredClassification) {
      assert(
        scenario.expectedRequiredFailures.some(
          (diagnostic) =>
            diagnostic.classification === expectedRequiredClassification && diagnostic.fatal === true,
        ),
        `${name} did not prove ${expectedRequiredClassification} remains fatal.`,
      );
      assert(
        scenario.expectedRequiredFailures.every((diagnostic) => diagnostic.fatal === true),
        `${name} masked a required failure as optional.`,
      );
      assert.equal(
        diagnostics.optionalPublicBasemapFailures.filter(
          (diagnostic) => diagnostic.scenario === name,
        ).length,
        0,
        `${name} accepted an optional enhancement failure despite an active required failure.`,
      );
      diagnostics.requiredFailureNegativeProofs.push({
        classification: expectedRequiredClassification,
        fatal: true,
        optional_masking_blocked: true,
        optional_candidates_observed: scenario.expectedOptionalFatal.length,
        scenario: name,
      });
    }
    assert.deepEqual(scenario.pageErrors, [], `${name} page errors were observed.`);
    assert.deepEqual(scenario.dependentFailures, [], `${name} dependent map failures were observed.`);
    assert.deepEqual(scenario.fatalConsole, [], `${name} fatal console errors were observed.`);
    assert.deepEqual(scenario.fatalRequests, [], `${name} fatal requests were observed.`);
    assert.deepEqual(scenario.apiFailures, [], `${name} API response failures were observed.`);
    results.push(name);
    console.log(`PASS map resilience: ${name}`);
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    if (!primaryError && scenario.trackRequiredRequests) {
      await waitForRequiredRouteRequests(scenario, `${name} teardown`);
      if (scenario.optionalCandidates.length && scenario.currentHealth) {
        resolveScenarioCandidates(scenario);
      }
    }
    scenario.teardownGeneration = ++scenario.acceptanceGeneration;
    scenario.teardownStarted = true;
    scenario.destroyed = true;
    try {
      await context.close();
      scenario.teardownCompleted = true;
    } catch (closeError) {
      if (!primaryError) throw closeError;
    }
    await delay(0);
    if (scenario.optionalCandidates.length && scenario.currentHealth) {
      resolveScenarioCandidates(scenario, "acceptance_teardown");
    }
    if (!primaryError) {
      assert.equal(
        scenario.optionalCandidates.length,
        0,
        `${name} left optional diagnostics unresolved during lifecycle teardown.`,
      );
      assert.deepEqual(scenario.dependentFailures, [], `${name} late dependent map failures were observed.`);
      assert.deepEqual(scenario.fatalConsole, [], `${name} late fatal console errors were observed.`);
      assert.deepEqual(scenario.fatalRequests, [], `${name} late fatal requests were observed.`);
      assert.equal(
        scenario.pendingRequiredRequests.size,
        0,
        `${name} retained required route requests after teardown: ${formatPendingRequiredRequests(scenario)}`,
      );
    }
  }
}

async function runAcceptanceLifecycle(scenario, label, navigate, prove) {
  const generation = ++scenario.acceptanceGeneration;
  const lifecycle = { generation, label, proven: false };
  scenario.acceptanceLifecycle.push(lifecycle);
  const navigationResult = await navigate();
  const proofResult = await prove(navigationResult);
  if (scenario.trackRequiredRequests) {
    await waitForRequiredRouteRequests(scenario, label);
  }
  lifecycle.proven = true;
  scenario.provenAcceptanceGeneration = Math.max(
    scenario.provenAcceptanceGeneration,
    generation,
  );
  return proofResult;
}

function isRequiredRouteRequest(url) {
  return (
    url.origin === apiOrigin ||
    (url.origin === origin &&
      isMapDiagnosticRequest(url, {
        apiOrigin,
        appOrigin: origin,
        resources: optionalPublicResources,
      }))
  );
}

function completeRequiredRouteRequest(scenario, request) {
  const entry = scenario.pendingRequiredRequests.get(request);
  if (!entry) return;
  scenario.pendingRequiredRequests.delete(request);
  if (entry.responseStatus >= 200 && entry.responseStatus < 300) {
    const key = `${entry.method}:${new URL(entry.url).origin}${new URL(entry.url).pathname}`;
    scenario.terminalSuccessfulRequestKeys.set(
      key,
      Math.max(scenario.terminalSuccessfulRequestKeys.get(key) ?? 0, entry.sequence),
    );
  }
}

async function waitForRequiredRouteRequests(scenario, label) {
  const deadline = Date.now() + 60_000;
  let quietSince = null;
  while (Date.now() < deadline) {
    if (scenario.pendingRequiredRequests.size === 0) {
      quietSince ??= Date.now();
      if (Date.now() - quietSince >= 500) {
        return;
      }
    } else {
      quietSince = null;
    }
    await delay(100);
  }
  throw new Error(`${label} left required route requests pending: ${formatPendingRequiredRequests(scenario)}`);
}

function formatPendingRequiredRequests(scenario) {
  return [...scenario.pendingRequiredRequests.values()]
    .slice(0, 8)
    .map(
      (entry) =>
        `${entry.method} ${redactMapDiagnosticUrl(entry.url)} request_id=${entry.requestId ?? "none"} generation=${entry.acceptanceGeneration} epoch=${entry.navigationEpoch} status=${entry.responseStatus ?? "none"} last=${entry.lastLifecycleEvent} started=${entry.startedAt}`,
    )
    .join(", ");
}

function resolveScenarioCandidates(scenario, lifecycleOverride = null) {
  const candidates = scenario.optionalCandidates.splice(0);
  const requiredCancellations = candidates.filter(
    (candidate) =>
      candidate.classification === "required_request_cancellation_candidate",
  );
  const optionalCandidates = candidates.filter(
    (candidate) =>
      candidate.classification === "optional_public_basemap_candidate",
  );
  const baseHealth = Object.freeze({ ...readScenarioPrimaryHealth(scenario) });
  for (const candidate of candidates) {
    Object.assign(candidate, {
      acceptance_teardown_succeeded: Boolean(
        lifecycleOverride === "acceptance_teardown" &&
          scenario.teardownCompleted &&
          scenario.provenAcceptanceGeneration === scenario.teardownGeneration - 1 &&
          Number(candidate.acceptance_generation) <= scenario.teardownGeneration,
      ),
      acceptance_transition_succeeded: hasProvenAcceptanceTransition(
        scenario,
        candidate,
      ),
      replacement_succeeded:
        candidate.request_key && candidate.request_sequence !== null
          ? (scenario.successfulRequestKeys.get(candidate.request_key) ?? 0) >
            candidate.request_sequence
          : false,
    });
  }

  const requiredOutcomes = requiredCancellations.map((candidate) => {
    const lifecycle = scenarioCandidateLifecycle(
      scenario,
      candidate,
      lifecycleOverride,
    );
    const result = resolveMapDiagnostic(candidate, {
      health: baseHealth,
      lifecycle,
    });
    Object.assign(candidate, result);
    return {
      candidate,
      independentlyFatal:
        result.fatal === true &&
        !hasCancellationLifecycleProof(candidate, lifecycle),
      result,
    };
  });
  const newPrimaryRequiredFailures = requiredOutcomes.filter(
    (outcome) => outcome.independentlyFatal,
  ).length;
  const optionalHealth = Object.freeze({
    ...baseHealth,
    requiredRequestFailures:
      Number(baseHealth.requiredRequestFailures) + newPrimaryRequiredFailures,
  });
  const optionalOutcomes = optionalCandidates.map((candidate) => {
    const result = resolveMapDiagnostic(candidate, {
      health: optionalHealth,
      lifecycle: scenarioCandidateLifecycle(
        scenario,
        candidate,
        lifecycleOverride,
      ),
    });
    Object.assign(candidate, result);
    return { candidate, result };
  });

  const expectedRequiredFailure =
    scenario.expectedRequiredClassification &&
    scenario.expectedRequiredFailures.some(
      (diagnostic) =>
        diagnostic.classification === scenario.expectedRequiredClassification &&
        diagnostic.fatal === true,
    );

  for (const outcome of requiredOutcomes) {
    if (!outcome.result.fatal) continue;
    if (expectedRequiredFailure || !outcome.independentlyFatal) {
      recordDependentScenarioFailure(
        outcome.candidate,
        scenario,
        expectedRequiredFailure,
      );
    } else {
      recordPrimaryScenarioFailure(outcome.candidate, scenario);
    }
  }
  for (const outcome of optionalOutcomes) {
    if (outcome.result.fatal) {
      recordDependentScenarioFailure(
        outcome.candidate,
        scenario,
        expectedRequiredFailure,
      );
    } else {
      diagnostics.optionalPublicBasemapFailures.push(outcome.candidate);
    }
  }
}

function recordPrimaryScenarioFailure(candidate, scenario) {
  const fatalMessage = `${scenario.name}: ${candidate.reason}`;
  diagnostics.requestFailures.push(fatalMessage);
  scenario.fatalRequests.push(fatalMessage);
}

function recordDependentScenarioFailure(candidate, scenario, expected) {
  Object.assign(candidate, {
    expected_required_failure_context: expected
      ? scenario.expectedRequiredClassification
      : null,
    optional_masking_blocked: Boolean(expected),
  });
  if (expected) {
    scenario.expectedOptionalFatal.push(candidate);
    return;
  }
  const fatalMessage = `${scenario.name}: ${candidate.reason}`;
  diagnostics.console.push(fatalMessage);
  scenario.dependentFailures.push(fatalMessage);
}

function readScenarioPrimaryHealth(scenario) {
  return {
    ...(scenario.currentHealth ?? {}),
    apiFailures: scenario.apiFailures.length,
    consoleErrors: scenario.fatalConsole.length,
    pageErrors: scenario.pageErrors.length,
    privateArcgisRequests: diagnostics.unexpectedExternalArcgisRequests.filter((entry) =>
      entry.startsWith(`${scenario.name}:`),
    ).length,
    requiredRequestFailures:
      scenario.fatalRequests.length + scenario.expectedRequiredFailures.length,
  };
}

function hasProvenAcceptanceTransition(scenario, candidate) {
  const generation = Number(candidate.acceptance_generation);
  return (
    Number.isInteger(generation) &&
    generation < scenario.provenAcceptanceGeneration
  );
}

function scenarioCandidateLifecycle(scenario, candidate, override) {
  if (override) return override;
  return candidate.acceptance_transition_succeeded ||
    scenario.destroyed ||
    candidate.navigation_epoch !== scenario.navigationEpoch
    ? "stale"
    : "current";
}

function hasCancellationLifecycleProof(candidate, lifecycle) {
  return Boolean(
    candidate.replacement_succeeded ||
      (lifecycle === "stale" && candidate.acceptance_transition_succeeded) ||
      (lifecycle === "acceptance_teardown" &&
        candidate.acceptance_teardown_succeeded) ||
      (["destroyed", "stale"].includes(lifecycle) &&
        candidate.stale_lifecycle_eligible === true),
  );
}

try {
  if (requiredFailureProbe) {
    await run(
      "required context failure",
      async (context) => {
        await context.route("**/demo_transportation_context.geojson", (route) =>
          route.abort("failed"),
        );
      },
      async (_context, page) => {
        await page.getByRole("button", { name: "Retry interactive map" }).waitFor();
      },
      "static",
      "required_same_origin_context_failure",
    );
    throw new Error("REQUIRED_MAP_FAILURE_DETECTED");
  }
  await run("normal clean context");
  await run(
    "external ArcGIS blocked",
    async (context) => {
      await context.route("**/*", (route) => {
        const url = new URL(route.request().url());
        return url.origin !== origin && /(?:arcgis|esri)/i.test(url.hostname)
          ? route.abort("failed")
          : route.continue();
      });
    },
    async (_context, _page, scenario) => {
      assert(
        scenario.optionalCandidates.some(
          (candidate) => candidate.classification === "optional_public_basemap_candidate",
        ),
        "External ArcGIS blocking produced no optional public map diagnostic.",
      );
    },
  );
  await run(
    "mobile viewport",
    async (_context, page) => {
      await page.setViewportSize({ width: 390, height: 844 });
    },
    async (_context, page) => {
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 1,
      );
      assert.equal(overflow, false, "Map page has mobile horizontal overflow.");
      const showIntelligence = page.getByRole("button", { name: "Show Intelligence" });
      if (await showIntelligence.isVisible()) await showIntelligence.click();
      await page.getByText("Land Opportunity Screener", { exact: true }).waitFor();
      await assertParcelLookupAndFocus(page, { exerciseComponentFocusMode: false });
    },
  );
  await run(
    "WebGL failure and retry",
    async (_context, page) => {
      await page.addInitScript(() => {
        const originalGetContext = HTMLCanvasElement.prototype.getContext;
        let webGlBlocked =
          sessionStorage.getItem("cfs-test-webgl-restored") !== "true";
        window.__cfsRestoreWebGl = () => {
          webGlBlocked = false;
          sessionStorage.setItem("cfs-test-webgl-restored", "true");
        };
        HTMLCanvasElement.prototype.getContext = function (type, ...args) {
          if (webGlBlocked && String(type).toLowerCase().includes("webgl")) return null;
          return originalGetContext.call(this, type, ...args);
        };
      });
    },
    async (_context, page, scenario) => {
      const map = page.getByTestId("cfs-arcgis-map");
      const previousAttempt = Number(
        (await map.getAttribute("data-map-initialization-attempt")) ?? 0,
      );
      await delay(0);
      scenario.forcedRendererFailureActive = false;
      await page.evaluate(() => window.__cfsRestoreWebGl?.());
      await runAcceptanceLifecycle(
        scenario,
        "forced WebGL retry",
        () =>
          Promise.all([
            page.waitForNavigation({ timeout: 30_000, waitUntil: "domcontentloaded" }),
            page.getByRole("button", { name: "Retry interactive map" }).click(),
          ]),
        () => assertInteractiveMap(page),
      );
      assert(
        Number(await map.getAttribute("data-map-initialization-attempt")) > previousAttempt ||
          Number(await map.getAttribute("data-map-initialization-attempt")) === 1,
        "Retry did not create a fresh MapView initialization attempt.",
      );
    },
    "static",
  );
  await run(
    "route return",
    async () => {},
    verifyRouteReturn,
  );
  await run(
    "reload recovery",
    async () => {},
    async (_context, page, scenario) => {
      const summaryKey = `GET:${apiOrigin}/wsacc/summary-by-geography`;
      const previousSuccess = scenario.terminalSuccessfulRequestKeys.get(summaryKey) ?? 0;
      await runAcceptanceLifecycle(
        scenario,
        "Planning reload",
        () => page.reload({ waitUntil: "domcontentloaded" }),
        () => assertInteractiveMap(page),
      );
      assert(
        (scenario.terminalSuccessfulRequestKeys.get(summaryKey) ?? 0) > previousSuccess,
        "Reloaded Planning did not finish a new WSACC geography summary request.",
      );
    },
  );
  await run(
    "parcel focus",
    async () => {},
    async (_context, page) => {
      await assertParcelLookupAndFocus(page);
    },
  );

  let forcedAssetFailures = 0;
  await run(
    "ArcGIS asset failure",
    async (context) => {
      await context.route("**/arcgis-assets/**", (route) => {
        forcedAssetFailures += 1;
        return route.abort("failed");
      });
    },
    async () => {
      assert(forcedAssetFailures > 0, "No same-origin ArcGIS asset request was forced to fail.");
    },
    "interactive",
    "required_arcgis_sdk_failure",
  );
  await run(
    "required context failure",
    async (context) => {
      await context.route("**/demo_transportation_context.geojson", (route) =>
        route.abort("failed"),
      );
    },
    async (_context, page) => {
      await page.getByRole("button", { name: "Retry interactive map" }).waitFor();
    },
    "static",
    "required_same_origin_context_failure",
  );

  const manifestResponse = await fetch(`${baseUrl}/arcgis-assets/manifest.json`);
  assert.equal(manifestResponse.status, 200, "ArcGIS asset manifest did not return 200.");
  const manifest = await manifestResponse.json();
  assert.match(manifest.sdkVersion ?? "", /^\d+\.\d+\.\d+$/);
  assert.equal(manifest.assetsPath, `/arcgis-assets/${manifest.sdkVersion}`);
  assert(Number(manifest.assetCount) > 1_000, "ArcGIS asset manifest is incomplete.");
  for (const asset of [
    "esri/geometry/support/pe-wasm.wasm",
    "esri/core/workers/RemoteClient.js",
    "esri/core/libs/libtess/libtess-f32.wasm",
    "esri/widgets/Zoom/t9n/Zoom_en.json",
  ]) {
    const entry = manifest.assets.find((item) => item.path === asset);
    assert(entry && Number(entry.size) > 0, `${asset} is absent from the manifest.`);
    const response = await fetch(`${baseUrl}${manifest.assetsPath}/${asset}`);
    assert.equal(response.status, 200, `${asset} did not return 200.`);
  }
  assert(diagnostics.arcgisAssetRequests.size > 0, "MapView made no same-origin SDK asset requests.");
  for (const url of diagnostics.arcgisAssetRequests) {
    assert(
      new URL(url).pathname.startsWith(`${manifest.assetsPath}/`),
      `MapView requested an unversioned ArcGIS asset: ${url}`,
    );
  }
  results.push("versioned same-origin ArcGIS assets");

  assert.equal(results.length, 10, "Map Resilience did not run all 10 scenarios.");
  assert.deepEqual(diagnostics.loops, [], "A map request loop was detected.");
  assert.deepEqual(diagnostics.pageErrors, [], `Uncaught map errors: ${diagnostics.pageErrors.join(" | ")}`);
  assert.deepEqual(diagnostics.console, [], `Map console errors: ${diagnostics.console.join(" | ")}`);
  assert.deepEqual(
    diagnostics.requestFailures,
    [],
    `Same-origin map request failures: ${diagnostics.requestFailures.join(" | ")}`,
  );
  assert.deepEqual(
    diagnostics.unexpectedExternalArcgisRequests,
    [],
    `Unexpected Portal or authenticated ArcGIS requests: ${diagnostics.unexpectedExternalArcgisRequests.join(" | ")}`,
  );
  assert.deepEqual(
    diagnostics.requiredFailureNegativeProofs.map((proof) => proof.classification).sort(),
    ["required_arcgis_sdk_failure", "required_same_origin_context_failure"],
    "Required same-origin failure negative proofs were incomplete.",
  );
  assert(
    diagnostics.optionalPublicBasemapFailures.every(
      (failure) => failure.fatal === false && failure.fallback_healthy === true,
    ),
    "An optional public ArcGIS failure was accepted without a healthy required fallback.",
  );
  console.log(
    JSON.stringify(
      {
        arcgis_sdk_version: manifest.sdkVersion,
        expected_forced_renderer_errors: diagnostics.expectedRendererErrors.length,
        failed: 0,
        optional_public_basemap_failures: diagnostics.optionalPublicBasemapFailures.length,
        required_failure_negative_proofs: diagnostics.requiredFailureNegativeProofs,
        scenarios: results.length,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}

async function verifyRouteReturn(_context, page, scenario) {
  const summaryKey = `GET:${apiOrigin}/wsacc/summary-by-geography`;
  const previousSuccess = scenario.terminalSuccessfulRequestKeys.get(summaryKey) ?? 0;
  await runAcceptanceLifecycle(
    scenario,
    "Planning to Economics",
    () => page.goto(`${baseUrl}/?app=economics`, { waitUntil: "domcontentloaded" }),
    () => assertNoActiveMap(page, "Economics route"),
  );
  await runAcceptanceLifecycle(
    scenario,
    "Economics to Planning",
    () => page.goto(`${baseUrl}/?app=planning`, { waitUntil: "domcontentloaded" }),
    () => assertInteractiveMap(page),
  );
  assert(
    (scenario.terminalSuccessfulRequestKeys.get(summaryKey) ?? 0) > previousSuccess,
    "Returned Planning route did not finish a new WSACC geography summary request.",
  );
}

async function assertParcelLookupAndFocus(
  page,
  { exerciseComponentFocusMode = true } = {},
) {
  const map = page.getByTestId("cfs-arcgis-map");
  const search = page.getByRole("combobox", { name: "Search parcels" });
  const runtimeToggle = page.getByRole("button", { name: "Open dashboard controls" });
  await runtimeToggle.click();
  const parcelId = (await page.getByTestId("local-runtime-status").count())
    ? "CFS-PARCEL-0149726579"
    : "CFS-PARCEL-0149780354";
  await runtimeToggle.click();
  await search.fill(parcelId);
  await page.getByRole("option", { name: new RegExp(parcelId) }).click();
  await page.getByText(parcelId, { exact: true }).first().waitFor();
  await page.waitForFunction(
    () => Number(document.querySelector('[data-testid="cfs-arcgis-map"]')?.getAttribute("data-map-zoom")) > 9,
  );
  const focusedExtent = await map.getAttribute("data-map-extent");
  assert(focusedExtent, "Parcel Lookup did not publish a focused map extent.");
  if (!exerciseComponentFocusMode) return;
  const mapBounds = await map.boundingBox();
  assert(mapBounds, "Interactive map bounds are unavailable.");
  await page.mouse.move(mapBounds.x + mapBounds.width * 0.7, mapBounds.y + mapBounds.height * 0.35);
  await page.mouse.down();
  await page.mouse.move(mapBounds.x + mapBounds.width * 0.45, mapBounds.y + mapBounds.height * 0.6, {
    steps: 8,
  });
  await page.mouse.up();
  await page.waitForFunction(
    (extent) => document.querySelector('[data-testid="cfs-arcgis-map"]')?.getAttribute("data-map-extent") !== extent,
    focusedExtent,
  );
  await page.getByRole("button", { name: "Focus Map", exact: true }).click();
  await page.waitForFunction(
    (extent) => {
      const current = document.querySelector('[data-testid="cfs-arcgis-map"]')?.getAttribute("data-map-extent");
      if (!current) return false;
      const [xmin, ymin, xmax, ymax] = current.split(",").map(Number);
      const center = (value) => {
        const [left, bottom, right, top] = value.split(",").map(Number);
        return [(left + right) / 2, (bottom + top) / 2];
      };
      const [expectedX, expectedY] = center(extent);
      return expectedX >= xmin && expectedX <= xmax && expectedY >= ymin && expectedY <= ymax;
    },
    focusedExtent,
  );
  await page.getByRole("button", { name: "Exit map focus", exact: true }).click();
}

async function assertNoActiveMap(page, label) {
  await page.waitForFunction(
    () =>
      !document.querySelector('[data-testid="cfs-arcgis-map"]') &&
      document.querySelectorAll(".esri-view-root").length === 0 &&
      typeof window.__cfsGetMapDebugState !== "function",
    null,
    { timeout: 30_000 },
  );
  assert.equal(
    await page.locator(".esri-view-root").count(),
    0,
    `${label} retained a stale MapView.`,
  );
}

async function readRequiredMapHealth(page, scenario) {
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
      requiredLayersReady: requiredIds.every((id) => {
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
  return {
    ...state,
    apiFailures: scenario.apiFailures.length,
    consoleErrors: scenario.fatalConsole.length,
    pageErrors: scenario.pageErrors.length,
    parcelInteractionRequired: true,
    privateArcgisRequests: diagnostics.unexpectedExternalArcgisRequests.filter((entry) =>
      entry.startsWith(`${scenario.name}:`),
    ).length,
    requiredRequestFailures:
      scenario.fatalRequests.length + scenario.expectedRequiredFailures.length,
  };
}

async function assertInteractiveMap(page) {
  const map = page.getByTestId("cfs-arcgis-map");
  const staticMap = page.getByTestId("cfs-local-context-map");
  await map.waitFor({ state: "attached", timeout: 30_000 });
  await page.waitForFunction(
    () => {
      const element = document.querySelector('[data-testid="cfs-arcgis-map"]');
      return (
        element?.getAttribute("data-static-context-ready") === "true" &&
        element.getAttribute("data-map-renderer-state") === "interactive_ready" &&
        element.getAttribute("data-map-renderer") === "interactive" &&
        element.getAttribute("data-interactive-ready") === "true" &&
        element.getAttribute("data-arcgis-runtime-state") === "ready" &&
        element.getAttribute("data-arcgis-view-state") === "ready" &&
        element.getAttribute("data-map-view-ready-state") === "ready"
      );
    },
    null,
    { timeout: 60_000 },
  );
  await page.waitForFunction(() => {
    const interactive = document.querySelector('[data-testid="cfs-arcgis-map"]');
    const fallback = document.querySelector('[data-testid="cfs-local-context-map"]');
    return (
      Number(interactive ? getComputedStyle(interactive).opacity : 0) >= 0.99 &&
      Number(fallback ? getComputedStyle(fallback).opacity : 1) <= 0.01
    );
  });
  const box = await map.boundingBox();
  assert(box && box.width > 250 && box.height > 250, "MapView has zero dimensions.");
  const sdkVersion = await map.getAttribute("data-arcgis-sdk-version");
  assert.match(sdkVersion ?? "", /^\d+\.\d+\.\d+$/);
  assert.equal(await map.getAttribute("data-arcgis-assets-path"), `/arcgis-assets/${sdkVersion}`);
  assert.match(
    (await map.getAttribute("data-basemap-mode")) ?? "",
    /^same-origin(?:\+public)?$/,
  );
  const state = await page.evaluate(() => {
    const interactive = document.querySelector('[data-testid="cfs-arcgis-map"]');
    const fallback = document.querySelector('[data-testid="cfs-local-context-map"]');
    return {
      debug: window.__cfsGetMapDebugState?.(),
      interactiveOpacity: Number(interactive ? getComputedStyle(interactive).opacity : 0),
      interactivePointerEvents: interactive ? getComputedStyle(interactive).pointerEvents : "none",
      staticOpacity: Number(fallback ? getComputedStyle(fallback).opacity : 0),
      staticPointerEvents: fallback ? getComputedStyle(fallback).pointerEvents : "auto",
    };
  });
  assert(state.interactiveOpacity >= 0.99, "Interactive MapView is transparent.");
  assert.equal(state.interactivePointerEvents, "auto", "MapView cannot receive pointer input.");
  assert(state.staticOpacity <= 0.01, "Emergency SVG is visible over MapView.");
  assert.equal(state.staticPointerEvents, "none", "Emergency SVG blocks MapView input.");
  assert.equal(state.debug?.ready, true, "MapView debug state is not ready.");
  assert.equal(state.debug?.readyState, "ready", "MapView readyState is not ready.");
  assert.equal(state.debug?.spatialReferenceWkid, 3857, "MapView is not Web Mercator.");
  assert.equal(state.debug?.basemapId, "cfs-same-origin-basemap");
  assert.equal(state.debug?.assetsPath, `/arcgis-assets/${sdkVersion}`);
  assert(Number(state.debug?.layerCount) >= 5, "MapView is missing required layers.");
  assert(Number(state.debug?.layerViewCount) >= 5, "MapView is missing required layerViews.");
  assert(Number(state.debug?.scale) > 0, "MapView scale is invalid.");
  assert(Number.isFinite(state.debug?.extent?.xmin), "MapView extent is invalid.");
  assert.equal(
    await page.locator(".esri-view-root").count(),
    1,
    "More than one active MapView root was mounted.",
  );
  const layerIds = (state.debug?.layers ?? []).map((layer) => layer.id);
  assert.equal(
    new Set(layerIds).size,
    layerIds.length,
    "The active MapView contains duplicate layer identities.",
  );
  await assertRuntimeLayers(page, [
    "county-boundary",
    "cfs-local-hydrography",
    "cfs-local-municipalities",
    "transportation-context",
  ]);
  await page.waitForFunction(
    () => {
      const element = document.querySelector('[data-testid="cfs-arcgis-map"]');
      const state = element?.getAttribute("data-reference-basemap-state");
      const layers = window.__cfsGetMapDebugState?.().layers ?? [];
      if (state === "ready") {
        return layers.some(
          (layer) => layer.id === "cfs-public-reference-labels" && layer.visible,
        );
      }
      if (state === "failed") {
        return layers.some(
          (layer) =>
            layer.id === "cfs-local-place-labels" &&
            layer.visible &&
            Number(layer.graphicsCount) > 0,
        );
      }
      return false;
    },
    null,
    { timeout: 30_000 },
  );
  await assertPaintedImage(await map.screenshot(), "interactive Cabarrus County map");
  assert.equal(
    await page.getByText("Interactive map could not start", { exact: true }).count(),
    0,
    "Emergency fallback message is visible during normal operation.",
  );
  for (const control of ["Zoom in", "Zoom out", "Reset to Cabarrus County"]) {
    await page.getByRole("button", { name: control }).waitFor();
  }
  await staticMap.waitFor({ state: "attached" });
}

async function assertEmergencyFallback(page) {
  const map = page.getByTestId("cfs-arcgis-map");
  const staticMap = page.getByTestId("cfs-local-context-map");
  await page.waitForFunction(
    () => {
      const element = document.querySelector('[data-testid="cfs-arcgis-map"]');
      return (
        element?.getAttribute("data-static-context-ready") === "true" &&
        element.getAttribute("data-map-renderer-state") === "static_degraded" &&
        element.getAttribute("data-map-renderer") === "static"
      );
    },
    null,
    { timeout: 60_000 },
  );
  await staticMap.waitFor({ state: "attached" });
  const visibility = await page.evaluate(() => {
    const interactive = document.querySelector('[data-testid="cfs-arcgis-map"]');
    const fallback = document.querySelector('[data-testid="cfs-local-context-map"]');
    return {
      interactiveOpacity: Number(interactive ? getComputedStyle(interactive).opacity : 0),
      interactivePointerEvents: interactive ? getComputedStyle(interactive).pointerEvents : "auto",
      staticOpacity: Number(fallback ? getComputedStyle(fallback).opacity : 0),
    };
  });
  assert(visibility.interactiveOpacity <= 0.01, "Failed MapView remains visible.");
  assert.equal(visibility.interactivePointerEvents, "none", "Failed MapView blocks fallback input.");
  assert(visibility.staticOpacity >= 0.99, "Emergency SVG fallback is transparent.");
  await page.getByText("Interactive map could not start", { exact: true }).waitFor();
  await page.getByText("Basic map view remains available.", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Retry interactive map" }).waitFor();
  assert.equal(await page.getByText("Static Map Mode", { exact: true }).count(), 0);
  await assertPaintedImage(await staticMap.screenshot(), "emergency SVG fallback map");
  assert.equal(await map.getAttribute("data-interactive-ready"), "false");
}

async function assertRuntimeLayers(page, layerIds) {
  await page.waitForFunction(
    (expectedIds) => {
      const layers = window.__cfsGetMapDebugState?.().layers ?? [];
      return expectedIds.every((id) => {
        const layer = layers.find((item) => item.id === id);
        return layer?.visible === true && Number(layer.graphicsCount) > 0;
      });
    },
    layerIds,
    { timeout: 30_000 },
  );
}

async function assertPaintedImage(image, label) {
  const { default: sharp } = await import("sharp");
  const stats = await sharp(image).stats();
  const deviation = Math.max(...stats.channels.slice(0, 3).map((channel) => channel.stdev));
  assert(deviation >= 4, `${label} is visually uniform (${deviation.toFixed(2)}).`);
}
