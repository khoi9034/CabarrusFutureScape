import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import fs from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright-core";
import {
  captureProductBaseline,
  verifyProductIsolation,
} from "./product-acceptance-isolation.mjs";
import {
  classifyArcGISConsoleFailure,
  classifyArcGISHttpFailure,
  classifyArcGISRequestFailure,
  classifyPageError,
  isApprovedOptionalPublicMapResource,
  isApprovedPublicArcgisRequest,
  isExternalArcgisRequest,
  isMapDiagnosticRequest,
  mapDiagnosticRequestKey,
  optionalPublicMapResources,
  redactMapDiagnosticText,
  redactMapDiagnosticUrl,
  REQUIRED_CFS_BASEMAP_ID,
  REQUIRED_CFS_CONTEXT_LAYER_IDS,
  REQUIRED_CFS_FALLBACK_LABEL_LAYER_ID,
  resolveMapDiagnostic,
  runClassificationSafetyMatrix,
} from "./map-acceptance-classification.mjs";

const ROOT = process.cwd();
const REPOSITORY_PYTHON = path.join(
  ROOT,
  ".venv",
  process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
);
const PYTHON = process.env.CFS_PYTHON?.trim() || (existsSync(REPOSITORY_PYTHON) ? REPOSITORY_PYTHON : "python");
const LOCAL_URL = (process.env.CFS_LOCAL_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const API_URL = (process.env.CFS_API_BASE_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");
const LOCAL_ORIGIN = new URL(LOCAL_URL).origin;
const API_ORIGIN = new URL(API_URL).origin;
const PREFIX = `CFS-FRONTEND-PERSISTENCE-${Date.now()}`;
const REPORT_PATH = path.join(ROOT, "logs", "frontend-persistence-last-run.json");
const RESTART_MANIFEST_PATH = path.join(ROOT, "logs", "frontend-persistence-restart-manifest.json");
const PHASE = process.env.CFS_FRONTEND_PERSISTENCE_PHASE ?? "full";
const RESTART_LABEL = process.env.CFS_FRONTEND_PERSISTENCE_RESTART_LABEL ?? null;
const FORCE_RESTART_CLEANUP = process.env.CFS_FRONTEND_PERSISTENCE_FORCE_CLEANUP === "true";
const FORCE_OPTIONAL_BASEMAP_FAILURE =
  process.env.CFS_FRONTEND_PERSISTENCE_TEST_OPTIONAL_BASEMAP_FAILURE === "true";
const FORCE_REQUIRED_HEALTH_FAILURE_PATH =
  process.env.CFS_FRONTEND_PERSISTENCE_TEST_REQUIRED_HEALTH_FAILURE_PATH?.trim() || null;
const REQUIRED_HEALTH_PATHS = new Set(["/ai/status", "/health/database", "/health/ready"]);
const PLANNER_PERMISSIONS = [
  "ask_cfs:use", "data:read", "master_data:export", "master_data:view", "planning:write", "projects:write", "reports:read", "reports:write", "sources:read",
];
const ADMINISTRATOR_PERMISSIONS = [
  "administration:write", "artifacts:download", "ask_cfs:use", "audit:read",
  "data:read", "economics:write", "ingestion:apply", "ingestion:dry_run",
  "master_data:export", "master_data:view", "planning:write", "projects:write", "reports:read",
  "reports:write", "sources:read", "sources:write",
];
assert(
  !FORCE_REQUIRED_HEALTH_FAILURE_PATH || REQUIRED_HEALTH_PATHS.has(FORCE_REQUIRED_HEALTH_FAILURE_PATH),
  `Unsupported required health failure path ${FORCE_REQUIRED_HEALTH_FAILURE_PATH}.`,
);
const OPTIONAL_PUBLIC_MAP_RESOURCES = optionalPublicMapResources();
const OPTIONAL_BASEMAP_FAILURE_TEST_URLS = [
  OPTIONAL_PUBLIC_MAP_RESOURCES[0].sampleUrl,
];
assert(["authorization", "cleanup", "full", "health-drain", "map-fallback", "seed", "verify"].includes(PHASE), `Unsupported frontend persistence phase ${PHASE}.`);
if (process.argv.includes("--check-optional-basemap-classifier")) {
  const results = runClassificationSafetyMatrix();
  assert.equal(results.length, 64);
  console.log("PASS shared ArcGIS acceptance classifier and required-fallback negative proof");
  process.exit(0);
}
const protectedPaths = [
  "outputs/lea_pupil_context_ingestion_summary.json",
  "outputs/school_capacity_ingestion_last_run.json",
  "outputs/school_presentation_utilization_seed_last_run.json",
  "logs/production-map-e89e3e8.png",
];
const protectedBefore = new Map(
  protectedPaths.filter(existsSync).map((file) => [file, sha256(file)]),
);
const report = {
  api_target: API_URL,
  authorization: {
    backend_enforcement: "Covered by Product V1 authorization tests; this browser check verifies role-gated controls and denial UX.",
    cases: [],
    health_checks: [],
  },
  branch_head: git("rev-parse", "HEAD"),
  checked_at: new Date().toISOString(),
  cleanup: [],
  database: {},
  demo: { base_url: null, product_api_requests: [], session_keys: [] },
  diagnostics: {
    accepted_stale_required_api_requests: [],
    api_failures: [],
    console: [],
    expected_console: [],
    health_request_lifecycle: [],
    optional_public_basemap_console: [],
    optional_public_basemap_failures: [],
    map_diagnostics: [],
    page_errors: [],
    request_failures: [],
    unexpected_external_arcgis_requests: [],
  },
  disposable_records: [],
  finished_at: null,
  final_invariants: [],
  local: { base_url: LOCAL_URL, product_requests: [], request_ids: [] },
  phase: PHASE,
  restart_label: RESTART_LABEL,
  restart_runs: [],
  ownership: {
    baseline: null,
    verification: null,
  },
  status: "RUNNING",
  workflows: [],
};
const cleanup = [];
let browser;
let demoServer;
let primaryError;
const pendingMapDiagnostics = [];
const pageAcceptanceLifecycles = new WeakMap();
const acceptedTeardownPages = new WeakSet();
const pageAuthorizationRoles = new WeakMap();
const pageNavigationEpochs = new WeakMap();
const lastMapHealthByPage = new WeakMap();
const pageSuccessfulRequestKeys = new WeakMap();
const pageSuccessfulHealthPathsByEpoch = new WeakMap();
const acceptedHealthPollRouteRequests = new WeakSet();
const pageDirectEvidence = new WeakMap();
const diagnosticDirectEvidence = new WeakMap();
const requiredRequestFailureEvidence = [];
const contextPendingRequiredApiRequests = new WeakMap();
const healthRequestLifecycles = new WeakMap();
let requestSequence = 0;

const emptyDirectEvidence = () => ({
  apiFailures: 0,
  consoleErrors: 0,
  pageErrors: 0,
  privateArcgisRequests: 0,
  requiredRequestFailures: 0,
});

function directEvidenceForPage(
  page,
  generation = pageAcceptanceLifecycles.get(page)?.startedGeneration ?? 0,
) {
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

async function waitForRequiredApiDrain(context, label) {
  const deadline = Date.now() + 60_000;
  let quietSince = null;
  while (Date.now() < deadline) {
    const pending = contextPendingRequiredApiRequests.get(context);
    if (!pending?.size) {
      quietSince ??= Date.now();
      if (Date.now() - quietSince >= 500) return;
    } else {
      quietSince = null;
    }
    await delay(100);
  }
  const pendingEntries = [...(contextPendingRequiredApiRequests.get(context)?.values() ?? [])];
  const pending = pendingEntries
    .slice(0, 8)
    .map(({ method, url }) => `${method} ${redactMapDiagnosticUrl(url)}`);
  throw new Error(`${label} left required API requests pending: ${pending.join(", ")}`);
}

function reconcileSupersededRequiredApiRequests(page) {
  const pending = contextPendingRequiredApiRequests.get(page.context());
  if (!pending?.size) return;

  const currentEpoch = pageNavigationEpochs.get(page) ?? 0;
  const provenGeneration = acceptanceLifecycle(page).provenGeneration;
  for (const [request, entry] of pending) {
    const supersededByGeneration =
      entry.acceptanceGeneration !== null && entry.acceptanceGeneration < provenGeneration;
    const supersededByNavigation =
      entry.navigationEpoch !== null && entry.navigationEpoch < currentEpoch;
    if (
      entry.page !== page ||
      (!supersededByGeneration && !supersededByNavigation)
    ) {
      continue;
    }
    const pathname = new URL(entry.url).pathname;
    if (entry.method !== "GET" || !REQUIRED_HEALTH_PATHS.has(pathname)) continue;
    const successfulPaths = pageSuccessfulHealthPathsByEpoch
      .get(page)
      ?.get(entry.navigationEpoch);
    if (![...REQUIRED_HEALTH_PATHS].every((path) => successfulPaths?.has(path))) continue;
    assert(
      entry.responseStatus === null ||
        (entry.responseStatus >= 200 && entry.responseStatus < 300),
      `Accepted navigation observed a failed required health response: HTTP ${entry.responseStatus} ${redactMapDiagnosticUrl(entry.url)}`,
    );
    report.diagnostics.accepted_stale_required_api_requests.push({
      acceptance_generation: entry.acceptanceGeneration,
      current_navigation_epoch: currentEpoch,
      method: entry.method,
      observed_navigation_epoch: entry.navigationEpoch,
      page_url: redactMapDiagnosticUrl(page.url()),
      proven_generation: provenGeneration,
      request_id: entry.requestId,
      request_sequence: entry.sequence,
      started_at: entry.startedAt,
      url: redactMapDiagnosticUrl(entry.url),
    });
    const healthLifecycle = healthRequestLifecycles.get(request);
    if (healthLifecycle) {
      healthLifecycle.accepted_superseded_at = new Date().toISOString();
      healthLifecycle.terminal_state = "accepted_navigation_superseded";
    }
    pending.delete(request);
  }
}

function recordDiagnosticDirectEvidence(diagnostic, page, generation, key) {
  recordDirectEvidence(page, generation, key);
  if (page) diagnosticDirectEvidence.set(diagnostic, { generation, key, page });
}

function reconcileDiagnosticDirectEvidence(diagnostic) {
  const recorded = diagnosticDirectEvidence.get(diagnostic);
  if (!recorded) return;
  const evidence = pageDirectEvidence
    .get(recorded.page)
    ?.get(recorded.generation ?? 0);
  if (evidence) evidence[recorded.key] = Math.max(0, evidence[recorded.key] - 1);
  diagnosticDirectEvidence.delete(diagnostic);
}

function assertBrowserDiagnosticsHealthy() {
  assert.deepEqual(
    report.diagnostics.map_diagnostics.filter((diagnostic) => diagnostic.fatal === true),
    [],
    "Fatal structured map diagnostics were observed.",
  );
  assert.deepEqual(report.diagnostics.api_failures, [], "Browser observed unexpected API failures.");
  assert.deepEqual(report.diagnostics.page_errors, [], "Browser page errors were observed.");
  assert.deepEqual(report.diagnostics.request_failures, [], "Browser request failures were observed.");
  assert.deepEqual(
    report.diagnostics.unexpected_external_arcgis_requests,
    [],
    "Browser requested an unexpected external map resource.",
  );
}

try {
  if (PHASE === "cleanup") await waitForProductApi();
  else await waitForLocalStack();
  if (["authorization", "full", "health-drain", "map-fallback", "verify"].includes(PHASE)) {
    report.ownership.baseline = await captureProductBaseline(API_URL, PREFIX);
  }
  report.local.principal = await readApi("/api/v1/me");
  if (PHASE === "cleanup") {
    await cleanupRestartRecords();
  } else {
    browser = await chromium.launch({
      executablePath: browserExecutable(),
      headless: true,
      args: ["--enable-unsafe-swiftshader", "--no-sandbox", "--use-angle=swiftshader"],
    });
    const localContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    attachDiagnostics(localContext, "local");
    if (FORCE_OPTIONAL_BASEMAP_FAILURE) {
      await localContext.route("**/*", (route) =>
        isApprovedOptionalPublicMapResource(
          route.request().url(),
          OPTIONAL_PUBLIC_MAP_RESOURCES,
        )
          ? route.abort("failed")
          : route.continue(),
      );
    }
    try {
      if (PHASE === "seed") {
        await seedRestartRecords(localContext);
      } else if (PHASE === "verify") {
        await verifyRestartRecords(localContext);
      } else if (PHASE === "authorization") {
        const askConversationId = await localAskCfs(localContext);
        await localPermissionDenial(localContext, askConversationId);
      } else if (!["health-drain", "map-fallback"].includes(PHASE)) {
        await localPlanning(localContext);
        await localEconomicsAndBucket(localContext);
        const askConversationId = await localAskCfs(localContext);
        await localMalformedProductRecords(localContext);
        await localPermissionDenial(localContext, askConversationId);
        await localBrowserStorageCheck(localContext);
      }
      await assertOptionalPublicBasemapFallback(localContext);
    } finally {
      await closeAcceptedContext(localContext);
    }

    if (PHASE === "health-drain") {
      await localHealthDrainVerification();
    } else if (PHASE === "full") {
      await localAuthorizationMatrix();
      await assertLocalNetworkCoverage();
      report.database = verifyDatabaseRecords();
      await demoChecks();
      runOwnedRestartProof();
    }
  }
  await resolveAllMapDiagnostics();
  reconcileExpectedConsoleErrors();
  assertBrowserDiagnosticsHealthy();
  const optionalBasemapFailureObserved =
    report.diagnostics.optional_public_basemap_failures.length > 0 ||
    report.diagnostics.optional_public_basemap_console.length > 0;
  assert(
    !optionalBasemapFailureObserved ||
      report.optional_public_basemap_verification?.status === "PASS" ||
      [
        ...report.diagnostics.optional_public_basemap_failures,
        ...report.diagnostics.optional_public_basemap_console,
      ].every(
        (diagnostic) =>
          diagnostic.fatal === false && diagnostic.fallback_healthy === true,
      ),
    "Optional public basemap failure was not backed by a successful interactive fallback proof.",
  );
  assert(
    !FORCE_OPTIONAL_BASEMAP_FAILURE || report.diagnostics.optional_public_basemap_failures.length > 0,
    "The focused optional public basemap failure probe did not exercise the classifier.",
  );
  assert(
    PHASE !== "map-fallback" || optionalBasemapFailureObserved,
    "The map-fallback phase did not observe an optional public basemap failure.",
  );
  assert.deepEqual(
    pendingMapDiagnostics.filter((entry) => !entry.resolved).map((entry) => entry.record),
    [],
    "Map diagnostics remained unresolved.",
  );
  assert.deepEqual(report.diagnostics.console, [], "Browser console errors or warnings were observed.");
  report.status = "PASS";
} catch (error) {
  primaryError = error;
  report.status = "FAIL";
  report.failure = error instanceof Error ? error.stack ?? error.message : String(error);
} finally {
  try {
    if (PHASE !== "seed" || primaryError) await fallbackCleanup();
  } catch (error) {
    report.cleanup.push({ fallback: true, status: "FAIL", error: String(error) });
    primaryError ??= error;
    report.status = "FAIL";
  }
  try {
    if (report.ownership.baseline) {
      const verification = await verifyProductIsolation(
        API_URL,
        PREFIX,
        report.ownership.baseline,
        acceptanceOwnedIds(),
      );
      report.ownership.verification = verification.resources;
      report.final_invariants.push(...verification.final_invariants);
      const failedInvariant = verification.final_invariants.find((invariant) => !invariant.passed);
      if (failedInvariant) {
        const error = new assert.AssertionError({
          actual: failedInvariant.actual,
          expected: failedInvariant.expected,
          message: `Final invariant failed: ${failedInvariant.name}`,
          operator: "deepStrictEqual",
        });
        primaryError ??= error;
        report.status = "FAIL";
        report.final_invariant = failedInvariant;
      } else {
        report.final_invariant = {
          actual: "PASS",
          expected: "PASS",
          name: "baseline_isolation",
          passed: true,
        };
      }
    }
  } catch (error) {
    primaryError ??= error;
    report.status = "FAIL";
    report.ownership.verification_failure =
      error instanceof Error ? error.stack ?? error.message : String(error);
  }
  if (demoServer && !demoServer.killed) demoServer.kill();
  if (browser) await browser.close();
  try {
    assertProtectedArtifacts();
  } catch (error) {
    primaryError ??= error;
    report.status = "FAIL";
    report.protected_artifact_failure = String(error);
  }
  report.finished_at = new Date().toISOString();
  await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await fs.writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

if (primaryError) throw primaryError;
console.log(
  `PASS frontend persistence (${report.workflows.length} UI workflows, ${report.disposable_records.length} disposable records, ${report.cleanup.length} cleanup results)`,
);

async function seedRestartRecords(context) {
  assert(
    !existsSync(RESTART_MANIFEST_PATH) || ["cleaned", "cleanup_after_failure"].includes(readRestartManifest().status),
    "An unclean restart manifest already exists.",
  );
  const page = await context.newPage();
  try {
    await runCase("Restart seed", "create persistent records through the real UI", async () => {
      await goto(page, LOCAL_URL, "?app=planning");
      const activeRenderer = await waitForInteractiveMap(page);
      const snapshotCreated = await productWrite(page, "POST", /^\/api\/v1\/planning\/snapshots$/, () =>
        page.getByTestId("planning-snapshot-save").click(),
      );
      const snapshotId = productId(snapshotCreated, "Restart Planning snapshot");
      remember("planning", "/api/v1/planning/snapshots", snapshotId);
      const snapshotRenderer = snapshotCreated.data.map_state.map_renderer;
      assert.equal(snapshotRenderer, activeRenderer);
      await planningStatus(page, ["saved", "ready"]);
      await openPlanningSnapshot(page, snapshotId);
      const snapshotTitle = `${PREFIX} Restart Planning`;
      await page.getByTestId("planning-snapshot-title").fill(snapshotTitle);
      const restartSectionKey = "map_view";
      const restartSection = page.getByTestId(`planning-snapshot-section-${restartSectionKey}`);
      const restartSectionIncluded = !(await restartSection.isChecked());
      await restartSection.click();
      const snapshotSaved = await productWrite(page, "PATCH", new RegExp(`^/api/v1/planning/snapshots/${snapshotId}$`), () =>
        page.getByTestId("planning-snapshot-save-changes").click(),
      );
      assert.equal(snapshotSaved.data.included_sections.includes(restartSectionKey), restartSectionIncluded);
      assert.equal(snapshotSaved.data.map_state.map_renderer, snapshotRenderer);
      await planningStatus(page, ["saved", "ready"]);

      await page.getByTestId("planning-report-draft-library").waitFor({ timeout: 45_000 });
      const reportCreated = await productWrite(page, "POST", /^\/api\/v1\/reports$/, () =>
        page.getByTestId("planning-report-draft-new").click(),
      );
      const reportId = productId(reportCreated, "Restart Planning report draft");
      remember("planning_report", "/api/v1/reports", reportId);
      await planningReportStatus(page, ["saved"], reportId);
      const reportTitle = `${PREFIX} Restart Report`;
      await page.getByTestId("planning-report-draft-title").fill(reportTitle);
      const reportSaved = await productWrite(page, "PATCH", new RegExp(`^/api/v1/reports/${reportId}$`), () =>
        page.getByTestId("planning-report-draft-save").click(),
      );
      assert.equal(reportSaved.data.payload.report_title, reportTitle);

      await gotoEconomicScenario(page, LOCAL_URL);
      const scenarioName = `${PREFIX} Restart Economics`;
      const restartIntensityControl = page.getByLabel("Intensity band");
      const restartIntensityBand = (await restartIntensityControl.inputValue()) === "High" ? "Low" : "High";
      await restartIntensityControl.selectOption(restartIntensityBand);
      await page.getByTestId("economic-scenario-name").fill(scenarioName);
      const scenarioCreated = await productWrite(page, "POST", /^\/api\/v1\/economics\/scenarios$/, () =>
        page.getByTestId("economic-scenario-save-new").click(),
      );
      const scenarioId = productId(scenarioCreated, "Restart Economics scenario");
      assert.equal(scenarioCreated.data.assumptions.intensityBand, restartIntensityBand);
      assert.equal(scenarioCreated.data.outputs.calculation_schema_version, "cfs-economics-scenario-v1");
      remember("economics", "/api/v1/economics/scenarios", scenarioId);
      await economicsStatus(page, /Saved|created/i);
      const bucketCreated = await productWrite(page, "POST", /^\/api\/v1\/reports\/bucket$/, () =>
        page.getByRole("button", { name: "Add memo to Report Bucket", exact: true }).click(),
      );
      const bucketId = productId(bucketCreated, "Restart Report Bucket item");
      remember("economics_report_bucket", "/api/v1/reports/bucket", bucketId);

      const stopAskIsolation = await isolateAskCfsConversationList(page);
      await goto(page, LOCAL_URL, "?app=planning");
      await openPlanningAskCfs(page);
      const question = `${PREFIX}: what persisted planning context should staff review?`;
      const query = page.getByTestId("ask-cfs-query").first();
      await query.fill(question);
      const askTrafficStart = report.local.product_requests.length;
      const conversationCreated = await productWrite(
        page,
        "POST",
        /^\/api\/v1\/ask-cfs\/conversations$/,
        () => page.getByTestId("ask-cfs-submit").first().click(),
        90_000,
      );
      const conversationId = productId(conversationCreated, "Restart Ask CFS conversation");
      remember("ask_cfs", "/api/v1/ask-cfs/conversations", conversationId);
      await stopAskIsolation();
      await page.getByText("Grounded CFS analysis", { exact: true }).first().waitFor({ timeout: 90_000 });
      await waitForProductTraffic(
        askTrafficStart,
        (entry) => entry.method === "POST" && entry.path === `/api/v1/ask-cfs/conversations/${conversationId}/messages`,
        2,
      );
      await poll(async () => /saved to cfs/i.test(
        await page.locator(
          `[data-testid="ask-cfs-persistence-status"][data-conversation-id="${conversationId}"]`,
        ).first().innerText(),
      ));

      const manifest = {
        branch_head: report.branch_head,
        processes: { seed: readStartupEvidence() },
        records: {
          ask_cfs: { api_path: "/api/v1/ask-cfs/conversations", id: conversationId, question },
          economics: {
            api_path: "/api/v1/economics/scenarios",
            id: scenarioId,
            intensity_band: restartIntensityBand,
            name: scenarioName,
            outputs: scenarioCreated.data.outputs,
          },
          planning: {
            api_path: "/api/v1/planning/snapshots",
            id: snapshotId,
            included_sections: snapshotSaved.data.included_sections,
            map_state: snapshotSaved.data.map_state,
            section_included: restartSectionIncluded,
            section_key: restartSectionKey,
            title: snapshotTitle,
          },
          planning_report: { api_path: "/api/v1/reports", id: reportId, source_snapshot_id: snapshotId, title: reportTitle },
          report_bucket: {
            api_path: "/api/v1/reports/bucket",
            id: bucketId,
            object_id: bucketCreated.data.object_id,
            title: bucketCreated.data.title,
          },
        },
        seeded_at: new Date().toISOString(),
        status: "seeded",
        verifications: [],
        version: 1,
      };
      await writeRestartManifest(manifest);
      report.restart_manifest = manifest;
    });
  } finally {
    await closeAcceptedPage(page);
  }
}

async function verifyRestartRecords(context) {
  assert(["backend-only", "frontend-only"].includes(RESTART_LABEL), "Restart verification requires a frontend-only or backend-only label.");
  const manifest = readRestartManifest();
  assert(["seeded", "verified"].includes(manifest.status), "Restart manifest is not awaiting verification.");
  assert.equal(manifest.branch_head, report.branch_head, "Restart verification changed Git HEAD.");
  const processEvidence = readStartupEvidence();
  const processKey = RESTART_LABEL === "frontend-only" ? "frontend_process_id" : "backend_process_id";
  assert(processEvidence[processKey], `${RESTART_LABEL} restart did not report a replacement process.`);
  assert.notEqual(
    processEvidence[processKey],
    manifest.processes.seed[processKey],
    `${RESTART_LABEL} restart retained the seed process ID.`,
  );

  const page = await context.newPage();
  try {
    await runCase("Restart verify", `${RESTART_LABEL} rehydrates the same UI-created IDs`, async () => {
      const records = manifest.records;
      await goto(page, LOCAL_URL, "?app=planning");
      await openPlanningSnapshot(page, records.planning.id);
      assert.equal(await page.getByTestId("planning-snapshot-title").inputValue(), records.planning.title);
      assert.equal(
        await page.getByTestId(`planning-snapshot-section-${records.planning.section_key}`).isChecked(),
        records.planning.section_included,
      );
      const reportCard = planningReportCard(page, records.planning_report.id);
      await reportCard.waitFor({ timeout: 45_000 });
      await reportCard.getByTestId("planning-report-draft-load").click();
      assert.equal(await page.getByTestId("planning-report-draft-title").inputValue(), records.planning_report.title);

      await gotoEconomicScenario(page, LOCAL_URL);
      await loadEconomicScenario(page, records.economics.id, records.economics.name);
      assert.equal(await page.getByLabel("Intensity band").inputValue(), records.economics.intensity_band);
      const restartOutputText = await page.getByTestId("scenario-output").innerText();
      for (const value of [
        records.economics.outputs.taxBaseLift,
        records.economics.outputs.revenuePerAcre,
        records.economics.outputs.serviceBurden,
        records.economics.outputs.dataConfidence,
      ]) {
        assert(restartOutputText.includes(value), `Restarted Economics UI omitted ${value}.`);
      }
      await gotoEconomicBucket(page, LOCAL_URL, false);
      await reportBucketRow(page, records.report_bucket.id, records.report_bucket.object_id).waitFor({ timeout: 45_000 });

      await goto(page, LOCAL_URL, "?app=planning");
      await openPlanningAskCfs(page);
      await page.locator(
        `[data-testid="ask-cfs-persistence-status"][data-conversation-id="${records.ask_cfs.id}"]`,
      ).first().waitFor({ timeout: 45_000 });
      await page.getByText(new RegExp(escapeRegExp(records.ask_cfs.question))).first().waitFor({ timeout: 45_000 });

      for (const record of Object.values(records)) {
        const persisted = await readApi(`${record.api_path}/${record.id}`);
        assert.equal(persisted.id, record.id);
        assert.equal(persisted.archived_at, null, `${record.id} was cleaned before restart verification.`);
      }
      const persistedPlanning = await readApi(`${records.planning.api_path}/${records.planning.id}`);
      assert.deepEqual(persistedPlanning.included_sections, records.planning.included_sections);
      assert.deepEqual(persistedPlanning.map_state, records.planning.map_state);
      const persistedEconomics = await readApi(`${records.economics.api_path}/${records.economics.id}`);
      assert.equal(persistedEconomics.assumptions.intensityBand, records.economics.intensity_band);
      assert.deepEqual(persistedEconomics.outputs, records.economics.outputs);
      const messages = await readApi(`/api/v1/ask-cfs/conversations/${records.ask_cfs.id}/messages?page_size=100`);
      assert(messages.some((message) => message.role === "user" && message.safe_question === records.ask_cfs.question));
      report.database = verifyDatabaseRecords(restartDatabaseRecords(manifest));
    });
  } finally {
    await closeAcceptedPage(page);
  }

  manifest.processes[RESTART_LABEL] = processEvidence;
  manifest.status = "verified";
  manifest.verifications.push({ at: new Date().toISOString(), label: RESTART_LABEL });
  await writeRestartManifest(manifest);
  report.restart_manifest = manifest;
}

function restartDatabaseRecords(manifest) {
  const records = manifest.records;
  return [
    {
      expected_archived: 0,
      expected_child_rows: null,
      expected_fields: {
        included_sections: records.planning.included_sections,
        "map_state.map_renderer": records.planning.map_state.map_renderer,
        "map_state.snapshot_type": records.planning.map_state.snapshot_type,
      },
      id: records.planning.id,
      kind: "planning",
      minimum_child_rows: 1,
    },
    {
      expected_archived: 0,
      expected_child_rows: null,
      expected_fields: {
        report_type: "planning_snapshot_draft",
        "payload.report_title": records.planning_report.title,
        "payload.source_snapshot_id": records.planning.id,
      },
      id: records.planning_report.id,
      kind: "planning_report",
      minimum_child_rows: null,
    },
    {
      expected_archived: 0,
      expected_child_rows: null,
      expected_fields: {
        "assumptions.intensityBand": records.economics.intensity_band,
        "outputs.calculation_schema_version": "cfs-economics-scenario-v1",
        "outputs.taxBaseLift": records.economics.outputs.taxBaseLift,
      },
      id: records.economics.id,
      kind: "economics",
      minimum_child_rows: 1,
    },
    {
      expected_archived: 0,
      expected_child_rows: null,
      expected_fields: { object_id: records.report_bucket.object_id },
      id: records.report_bucket.id,
      kind: "economics_report_bucket",
      minimum_child_rows: null,
    },
    {
      expected_archived: 0,
      expected_child_rows: null,
      expected_fields: { title: records.ask_cfs.question },
      id: records.ask_cfs.id,
      kind: "ask_cfs",
      minimum_child_rows: 2,
    },
  ];
}

async function cleanupRestartRecords() {
  const manifest = readRestartManifest();
  const labels = new Set(manifest.verifications.map((verification) => verification.label));
  const fullyVerified = labels.has("frontend-only") && labels.has("backend-only");
  assert(
    fullyVerified || FORCE_RESTART_CLEANUP,
    "Restart records cannot be cleaned before both restart verifications pass.",
  );
  for (const record of Object.values(manifest.records)) {
    const response = await fetch(`${API_URL}${record.api_path}/${encodeURIComponent(record.id)}/archive`, {
      headers: { Accept: "application/json", "X-Request-ID": `${PREFIX}-restart-cleanup` },
      method: "POST",
      signal: AbortSignal.timeout(30_000),
    });
    const payload = await response.json();
    assert(response.ok, `Restart cleanup failed for ${record.id}: ${response.status}`);
    assert(payload.request_id, `Restart cleanup omitted a request ID for ${record.id}.`);
    assert(payload.data.archived_at, `Restart cleanup did not archive ${record.id}.`);
    const persisted = await readApi(`${record.api_path}/${record.id}`);
    assert(persisted.archived_at, `Restart cleanup did not persist archive state for ${record.id}.`);
    report.cleanup.push({ id: record.id, method: "restart_api_archive", status: "PASS" });
  }
  manifest.cleaned_at = new Date().toISOString();
  manifest.cleanup_after_failure = !fullyVerified;
  manifest.status = fullyVerified ? "cleaned" : "cleanup_after_failure";
  await writeRestartManifest(manifest);
  report.restart_manifest = manifest;
  report.workflows.push({ duration_ms: 0, name: "archive restart records after both verifications", product: "Restart cleanup", status: "PASS" });
}

function runOwnedRestartProof() {
  try {
    runNpmScript("present:cfs");
    runFrontendPersistencePhase("seed", "standalone-seed");
    runNpmScript("present:cfs", {}, ["--", "-FrontendOnly"]);
    runFrontendPersistencePhase("verify", "frontend-only");
    runNpmScript("present:cfs", {}, ["--", "-BackendOnly"]);
    runFrontendPersistencePhase("verify", "backend-only");
    runFrontendPersistencePhase("cleanup", "standalone-cleanup");
  } catch (error) {
    if (restartManifestNeedsCleanup()) {
      try {
        runNpmScript("present:cfs");
        runFrontendPersistencePhase("cleanup", "failure-cleanup", {
          CFS_FRONTEND_PERSISTENCE_FORCE_CLEANUP: "true",
        });
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          "Owned restart proof failed and its disposable records could not be cleaned.",
        );
      }
    }
    throw error;
  }
}

function runFrontendPersistencePhase(phase, label, extraEnvironment = {}) {
  runNpmScript("check:frontend-persistence", {
    ...extraEnvironment,
    CFS_FRONTEND_PERSISTENCE_PHASE: phase,
    CFS_FRONTEND_PERSISTENCE_RESTART_LABEL: phase === "verify" ? label : "",
  });
  const proof = JSON.parse(readFileSync(REPORT_PATH, "utf8").replace(/^\uFEFF/, ""));
  assert.equal(proof.status, "PASS", `${label} frontend persistence phase failed.`);
  assert.equal(proof.phase, phase, `${label} ran the wrong frontend persistence phase.`);
  report.restart_runs.push({
    branch_head: proof.branch_head,
    checked_at: proof.checked_at,
    finished_at: proof.finished_at,
    label,
    phase,
    workflows: proof.workflows?.length ?? 0,
  });
}

function runNpmScript(script, environment = {}, scriptArguments = []) {
  const npmCli = process.env.npm_execpath;
  assert(npmCli, "npm_execpath is unavailable; run this checker through npm.");
  const result = spawnSync(process.execPath, [npmCli, "run", script, ...scriptArguments], {
    cwd: ROOT,
    env: { ...process.env, ...environment },
    stdio: "inherit",
  });
  assert.equal(result.status, 0, `npm run ${script} failed with exit code ${result.status ?? 1}.`);
}

function restartManifestNeedsCleanup() {
  if (!existsSync(RESTART_MANIFEST_PATH)) return false;
  const manifest = readRestartManifest();
  return !["cleaned", "cleanup_after_failure"].includes(manifest.status);
}

function readRestartManifest() {
  assert(existsSync(RESTART_MANIFEST_PATH), "Restart persistence manifest does not exist.");
  return JSON.parse(readFileSync(RESTART_MANIFEST_PATH, "utf8").replace(/^\uFEFF/, ""));
}

async function writeRestartManifest(manifest) {
  await fs.writeFile(RESTART_MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

function readStartupEvidence() {
  const startupPath = path.join(ROOT, "logs", "local-presentation-startup.json");
  assert(existsSync(startupPath), "Local presentation startup evidence is missing.");
  return JSON.parse(readFileSync(startupPath, "utf8").replace(/^\uFEFF/, ""));
}

async function localPlanning(context) {
  const page = await context.newPage();
  try {
    await runCase("Planning", "late initial list cannot replace a completed UI create", async () => {
      let releaseStaleList;
      let signalStaleListFulfilled;
      let signalStaleListReady;
      const staleListFulfilled = new Promise((resolve) => { signalStaleListFulfilled = resolve; });
      const staleListReady = new Promise((resolve) => { signalStaleListReady = resolve; });
      const staleListHeld = new Promise((resolve) => { releaseStaleList = resolve; });
      await routeMethodOnce(page, `${API_URL}/api/v1/planning/snapshots*`, "GET", async (route) => {
        const response = await route.fetch();
        signalStaleListReady();
        await staleListHeld;
        await route.fulfill({ response });
        signalStaleListFulfilled();
      });
      try {
        await goto(page, LOCAL_URL, "?app=planning");
        await staleListReady;
        await waitForInteractiveMap(page);
        const save = page.getByTestId("planning-snapshot-save");
        await poll(async () => !(await save.isDisabled()), 60_000);
        const created = await productWrite(page, "POST", /^\/api\/v1\/planning\/snapshots$/, () =>
          save.click(),
        );
        const id = productId(created, "Planning snapshot created while initial list was pending");
        remember("planning", "/api/v1/planning/snapshots", id);
        releaseStaleList();
        await staleListFulfilled;
        await page.waitForTimeout(250);
        await planningStatus(page, ["saved"]);
        await openPlanningSnapshot(page, id);
        const archived = await productWrite(
          page,
          "POST",
          new RegExp(`^/api/v1/planning/snapshots/${id}/archive$`),
          () => acceptNextDialog(page, () => planningCard(page, id).getByTestId("planning-snapshot-archive").click()),
        );
        assert(archived.data.archived_at, "Late-list Planning record was not archived.");
        markClean(id, "ui_archive");
      } finally {
        releaseStaleList();
      }
    });

    await runCase("Planning", "snapshot and report-draft create, conflict, update, reload, archive", async () => {
      await goto(page, LOCAL_URL, "?app=planning");
      const activeRenderer = await waitForInteractiveMap(page);
      const create = page.getByTestId("planning-snapshot-save");
      await create.waitFor({ timeout: 45_000 });
      const created = await productWrite(page, "POST", /^\/api\/v1\/planning\/snapshots$/, () => create.click());
      const id = productId(created, "Planning snapshot create");
      remember("planning", "/api/v1/planning/snapshots", id);
      const createdRenderer = created.data.map_state.map_renderer;
      assert.equal(createdRenderer, activeRenderer);
      await planningStatus(page, ["saved", "ready"]);
      await openPlanningSnapshot(page, id);

      const renamed = `${PREFIX} Planning`;
      await page.getByTestId("planning-snapshot-title").fill(renamed);
      const notes = page.getByTestId("planning-snapshot-notes");
      if (await notes.count()) await notes.fill("Disposable browser-driven persistence proof");
      const sectionKey = "map_view";
      const section = page.getByTestId(`planning-snapshot-section-${sectionKey}`);
      const sectionIncluded = !(await section.isChecked());
      await section.click();

      const patchPattern = new RegExp(`^/api/v1/planning/snapshots/${id}$`);
      await routeMethodOnce(page, `${API_URL}/api/v1/planning/snapshots/${id}*`, "PATCH", async (route) => {
        await route.fulfill({
          body: JSON.stringify({
            error: { code: "conflict", message: "The record changed after it was loaded." },
            request_id: `${PREFIX}-conflict`,
            timestamp: new Date().toISOString(),
          }),
          contentType: "application/json",
          status: 409,
        });
      });
      await page.getByTestId("planning-snapshot-save-changes").click();
      await planningStatus(page, ["conflict"]);
      assert(await page.getByTestId("planning-snapshot-create-version").isDisabled());
      assert.equal(await page.getByTestId("planning-snapshot-title").inputValue(), renamed);
      assert.equal(await page.getByTestId(`planning-snapshot-section-${sectionKey}`).isChecked(), sectionIncluded);

      const reviewedName = `${renamed} Reviewed`;
      const reviewedNotes = "Disposable edits made after the injected conflict";
      const reviewedSectionIncluded = !sectionIncluded;
      await page.getByTestId("planning-snapshot-title").fill(reviewedName);
      await page.getByTestId("planning-snapshot-notes").fill(reviewedNotes);
      await section.click();

      const [reviewLatest] = await Promise.all([
        page.waitForResponse(isProductResponse("GET", patchPattern)),
        page.getByTestId("planning-snapshot-retry").click(),
      ]);
      assert.equal(reviewLatest.status(), 200);
      await planningStatus(page, ["unsaved"]);
      assert.equal(await page.getByTestId("planning-snapshot-title").inputValue(), reviewedName);
      assert.equal(await page.getByTestId("planning-snapshot-notes").inputValue(), reviewedNotes);
      assert.equal(await page.getByTestId(`planning-snapshot-section-${sectionKey}`).isChecked(), reviewedSectionIncluded);

      const updated = await productWrite(page, "PATCH", patchPattern, () =>
        page.getByTestId("planning-snapshot-save-changes").click(),
      );
      assert.equal(updated.data.id, id);
      assert.equal(updated.data.title, reviewedName);
      assert.equal(updated.data.included_sections.includes(sectionKey), reviewedSectionIncluded);
      assert.match(updated.data.payload.schema_version ?? "", /^phase\d+[a-z]*_v\d+$/i);
      assert.equal(updated.data.map_state.map_renderer, createdRenderer);
      assert(Array.isArray(updated.data.map_state.active_layer_labels));
      assert(updated.request_id, "Planning update omitted request_id.");
      expectPersistedFields(id, {
        included_sections: updated.data.included_sections,
        "map_state.map_renderer": updated.data.map_state.map_renderer,
        "map_state.snapshot_type": updated.data.map_state.snapshot_type,
        "payload.schema_version": updated.data.payload.schema_version,
      });
      await planningStatus(page, ["saved", "ready"]);

      const versioned = await productWrite(
        page,
        "POST",
        new RegExp(`^/api/v1/planning/snapshots/${id}/versions$`),
        () => page.getByTestId("planning-snapshot-create-version").click(),
      );
      assert(versioned.data.current_version >= 2, "Planning version did not increment.");
      expectChildRows(id, 2);

      let releaseReload;
      let signalReloadReady;
      let signalReloadFulfilled;
      const reloadHeld = new Promise((resolve) => { releaseReload = resolve; });
      const reloadReady = new Promise((resolve) => { signalReloadReady = resolve; });
      const reloadFulfilled = new Promise((resolve) => { signalReloadFulfilled = resolve; });
      await routeMethodOnce(page, `${API_URL}/api/v1/planning/snapshots*`, "GET", async (route) => {
        const response = await route.fetch();
        signalReloadReady();
        await reloadHeld;
        await route.fulfill({ response });
        signalReloadFulfilled();
      });
      try {
        await page.getByTestId("planning-snapshot-reload").click();
        await reloadReady;
        assert(await page.getByTestId("planning-snapshot-create-version").isDisabled());
        assert(await planningCard(page, id).getByTestId("planning-snapshot-archive").isDisabled());
      } finally {
        releaseReload();
      }
      await reloadFulfilled;
      await planningStatus(page, ["ready"]);

      const listResponse = page.waitForResponse(isProductResponse("GET", /^\/api\/v1\/planning\/snapshots$/));
      await reloadPage(page);
      assert.equal((await listResponse).status(), 200);
      await openPlanningSnapshot(page, id);
      assert.equal(await page.getByTestId("planning-snapshot-title").inputValue(), reviewedName);
      assert.equal(await page.getByTestId(`planning-snapshot-section-${sectionKey}`).isChecked(), reviewedSectionIncluded);

      await page.getByTestId("planning-report-draft-library").waitFor({ timeout: 45_000 });
      const draftCreated = await productWrite(page, "POST", /^\/api\/v1\/reports$/, () =>
        page.getByTestId("planning-report-draft-new").click(),
      );
      const draftId = productId(draftCreated, "Planning report draft create");
      remember("planning_report", "/api/v1/reports", draftId);
      assert.equal(draftCreated.data.report_type, "planning_snapshot_draft");
      assert.equal(draftCreated.data.payload.source_snapshot_id, id);
      await planningReportStatus(page, ["saved"], draftId);

      const reportTitle = `${PREFIX} Planning Report`;
      const reportNotes = "Disposable server-backed Planning report draft proof";
      await page.getByTestId("planning-report-draft-title").fill(reportTitle);
      await page.getByTestId("planning-report-draft-notes").fill(reportNotes);
      const draftUpdated = await productWrite(
        page,
        "PATCH",
        new RegExp(`^/api/v1/reports/${draftId}$`),
        () => page.getByTestId("planning-report-draft-save").click(),
      );
      assert.equal(draftUpdated.data.id, draftId);
      assert.equal(draftUpdated.data.report_type, "planning_snapshot_draft");
      assert.equal(draftUpdated.data.payload.report_title, reportTitle);
      assert.equal(draftUpdated.data.payload.report_notes, reportNotes);
      await planningReportStatus(page, ["saved"], draftId);

      const draftName = `${PREFIX} Renamed Report Draft`;
      const draftCard = planningReportCard(page, draftId);
      await draftCard.getByTestId("planning-report-draft-rename").click();
      await draftCard.getByTestId("planning-report-draft-rename-input").fill(draftName);
      const draftRenamed = await productWrite(
        page,
        "PATCH",
        new RegExp(`^/api/v1/reports/${draftId}$`),
        () => draftCard.getByTestId("planning-report-draft-rename-save").click(),
      );
      assert.equal(draftRenamed.data.title, draftName);
      expectPersistedFields(draftId, {
        report_type: "planning_snapshot_draft",
        title: draftName,
        "payload.report_title": reportTitle,
        "payload.source_snapshot_id": id,
      });
      await planningReportStatus(page, ["saved"], draftId);

      const reportListResponse = page.waitForResponse(
        isProductResponse("GET", /^\/api\/v1\/reports$/),
        { timeout: 60_000 },
      );
      await reloadPage(page);
      await openPlanningSnapshot(page, id);
      assert.equal((await reportListResponse).status(), 200);
      const reloadedDraftCard = planningReportCard(page, draftId);
      await reloadedDraftCard.waitFor({ timeout: 45_000 });
      assert((await reloadedDraftCard.innerText()).includes(draftName));
      await reloadedDraftCard.getByTestId("planning-report-draft-load").click();
      assert.equal(await page.getByTestId("planning-report-draft-title").inputValue(), reportTitle);
      assert.equal(await page.getByTestId("planning-report-draft-notes").inputValue(), reportNotes);

      await reloadedDraftCard.getByTestId("planning-report-draft-archive").click();
      const draftArchived = await productWrite(
        page,
        "POST",
        new RegExp(`^/api/v1/reports/${draftId}/archive$`),
        () => reloadedDraftCard.getByTestId("planning-report-draft-archive-confirm").click(),
      );
      assert(draftArchived.data.archived_at, "Planning report draft archive omitted archived_at.");
      markClean(draftId, "ui_archive");
      await planningReportStatus(page, ["archived"]);
      await reloadedDraftCard.waitFor({ state: "hidden", timeout: 30_000 });

      const persistedDraft = await readApi(`/api/v1/reports/${draftId}`);
      assert.equal(persistedDraft.id, draftId);
      assert.equal(persistedDraft.title, draftName);
      assert.equal(persistedDraft.payload.report_title, reportTitle);
      assert(persistedDraft.archived_at);
      const draftAudit = await readApi(`/api/v1/audit?limit=100&object_id=${encodeURIComponent(draftId)}`);
      for (const action of ["create", "update", "archive"]) {
        assert(draftAudit.some((event) => event.action === action), `Planning report draft audit omitted ${action}.`);
      }
      assert(!(await readApi("/api/v1/reports?status=Draft&page_size=100")).some((record) => record.id === draftId));

      const archived = await productWrite(
        page,
        "POST",
        new RegExp(`^/api/v1/planning/snapshots/${id}/archive$`),
        () => acceptNextDialog(page, () => planningCard(page, id).getByTestId("planning-snapshot-archive").click()),
      );
      assert(archived.data.archived_at, "Planning archive omitted archived_at.");
      markClean(id, "ui_archive");
      await planningCard(page, id).waitFor({ state: "hidden", timeout: 30_000 });

      const persisted = await readApi(`/api/v1/planning/snapshots/${id}`);
      assert.equal(persisted.id, id);
      assert.equal(persisted.title, reviewedName);
      assert.equal(persisted.included_sections.includes(sectionKey), reviewedSectionIncluded);
      assert.equal(persisted.payload.schema_version, updated.data.payload.schema_version);
      assert.deepEqual(persisted.map_state, updated.data.map_state);
      assert(persisted.archived_at);
      const audit = await readApi(`/api/v1/audit?limit=100&object_id=${encodeURIComponent(id)}`);
      for (const action of ["create", "update", "version", "archive"]) {
        assert(audit.some((event) => event.action === action), `Planning audit omitted ${action}.`);
      }
      assert(!(await readApi("/api/v1/planning/snapshots?page_size=100")).some((record) => record.id === id));
    });
  } finally {
    await closeAcceptedPage(page);
  }
}

async function localEconomicsAndBucket(context) {
  const page = await context.newPage();
  const scenarioIds = [];
  try {
    await runCase("Economics", "UI create, reopen, rename, version, compare, archive", async () => {
      await gotoEconomicScenario(page, LOCAL_URL);
      const firstName = `${PREFIX} Economics A`;
      await page.getByTestId("economic-scenario-name").fill(firstName);
      let releaseFirstSave;
      let signalFirstSaveStarted;
      const firstSaveHeld = new Promise((resolve) => { releaseFirstSave = resolve; });
      const firstSaveStarted = new Promise((resolve) => { signalFirstSaveStarted = resolve; });
      await routeMethodOnce(page, `${API_URL}/api/v1/economics/scenarios`, "POST", async (route) => {
        signalFirstSaveStarted();
        await firstSaveHeld;
        await route.continue();
      });
      let first;
      try {
        first = await productWrite(page, "POST", /^\/api\/v1\/economics\/scenarios$/, async () => {
          await page.getByTestId("economic-scenario-save-new").click();
          await firstSaveStarted;
          await poll(async () => await page.getByTestId("economic-scenario-name").isDisabled());
          assert(await page.getByTestId("economic-scenario-notes").isDisabled());
          assert(await page.getByLabel("Intensity band").isDisabled());
          assert(await page.getByRole("button", { name: "Reset scenario", exact: true }).isDisabled());
          releaseFirstSave();
        });
      } finally {
        releaseFirstSave();
      }
      const firstId = productId(first, "Economics scenario create");
      scenarioIds.push(firstId);
      remember("economics", "/api/v1/economics/scenarios", firstId);
      await economicsStatus(page, /Saved|created/i);

      await page.getByTestId("economic-scenario-name").fill(`${PREFIX} Economics B`);
      const second = await productWrite(page, "POST", /^\/api\/v1\/economics\/scenarios$/, () =>
        page.getByTestId("economic-scenario-save-new").click(),
      );
      const secondId = productId(second, "Second Economics scenario create");
      scenarioIds.push(secondId);
      remember("economics", "/api/v1/economics/scenarios", secondId);

      await page.getByTestId("economic-scenario-compare-library").selectOption(firstId);
      const compare = page.getByTestId("economic-scenario-compare");
      await poll(async () => !(await compare.isDisabled()));
      await compare.click();
      const comparison = page.getByTestId("economic-scenario-comparison");
      await comparison.waitFor({ timeout: 30_000 });
      assert.equal(await comparison.getAttribute("data-left-scenario-id"), secondId);
      assert.equal(await comparison.getAttribute("data-right-scenario-id"), firstId);
      assert((await comparison.innerText()).includes(firstName));

      const [listResponse] = await Promise.all([
        page.waitForResponse(isProductResponse("GET", /^\/api\/v1\/economics\/scenarios$/), { timeout: 60_000 }),
        (async () => {
          await reloadPage(page);
          await gotoEconomicScenario(page, LOCAL_URL, false);
        })(),
      ]);
      assert.equal(listResponse.status(), 200);
      await loadEconomicScenario(page, firstId, firstName);

      const intensityControl = page.getByLabel("Intensity band");
      const intensityBand = (await intensityControl.inputValue()) === "High" ? "Low" : "High";
      await intensityControl.selectOption(intensityBand);
      await poll(async () => (await intensityControl.inputValue()) === intensityBand);
      const renamed = `${PREFIX} Economics Renamed`;
      await page.getByTestId("economic-scenario-name").fill(renamed);
      const notes = page.getByTestId("economic-scenario-notes");
      if (await notes.count()) await notes.fill("Disposable analyst note");
      await page.getByTestId("economic-scenario-library").selectOption(secondId);
      assert(await page.getByTestId("economic-scenario-load").isDisabled());
      assert.equal(await page.getByLabel("Intensity band").inputValue(), intensityBand);
      assert.equal(await page.getByTestId("economic-scenario-name").inputValue(), renamed);
      await page.getByTestId("economic-scenario-library").selectOption(firstId);
      const updated = await productWrite(
        page,
        "PATCH",
        new RegExp(`^/api/v1/economics/scenarios/${firstId}$`),
        () => page.getByTestId("economic-scenario-save").click(),
      );
      assert.equal(updated.data.name, renamed);
      assert.equal(updated.data.notes, "Disposable analyst note");
      assert.equal(updated.data.assumptions.intensityBand, intensityBand);
      assert.equal(updated.data.outputs.calculation_schema_version, "cfs-economics-scenario-v1");
      assert.equal(updated.data.payload.calculation_schema_version, "cfs-economics-scenario-v1");
      for (const key of [
        "constraintOpportunity",
        "dataConfidence",
        "fiscalAttractiveness",
        "infrastructureBurden",
        "recommendedNextDiligence",
        "revenuePerAcre",
        "serviceBurden",
        "taxBaseLift",
      ]) {
        assert.equal(typeof updated.data.outputs[key], "string", `Economics output ${key} is missing.`);
      }
      expectPersistedFields(firstId, {
        "assumptions.intensityBand": intensityBand,
        "outputs.calculation_schema_version": updated.data.outputs.calculation_schema_version,
        "outputs.taxBaseLift": updated.data.outputs.taxBaseLift,
        "outputs.dataConfidence": updated.data.outputs.dataConfidence,
        "payload.calculation_schema_version": updated.data.payload.calculation_schema_version,
      });
      const versioned = await productWrite(
        page,
        "POST",
        new RegExp(`^/api/v1/economics/scenarios/${firstId}/versions$`),
        () => page.getByTestId("economic-scenario-create-version").click(),
      );
      assert(versioned.data.current_version >= 2, "Economics version did not increment.");
      await poll(async () => /Version\s+[2-9]\d*/i.test(await page.getByTestId("economic-scenario-version").innerText()));
      expectChildRows(firstId, 2);

      const bucket = await productWrite(page, "POST", /^\/api\/v1\/reports\/bucket$/, () =>
        page.getByRole("button", { name: "Add memo to Report Bucket", exact: true }).click(),
      );
      const bucketId = productId(bucket, "Economics Report Bucket add");
      remember("economics_report_bucket", "/api/v1/reports/bucket", bucketId);
      assert.equal(bucket.data.object_id, "scenario-decision-memo");
      expectPersistedFields(bucketId, { object_id: bucket.data.object_id, object_type: bucket.data.object_type });
      await reloadPage(page);
      await gotoEconomicBucket(page, LOCAL_URL, false);
      await page.getByTestId("report-bucket-item").filter({ hasText: bucket.data.title }).waitFor({ timeout: 45_000 });
      const bucketRow = reportBucketRow(page, bucketId, bucket.data.object_id);
      const printToggle = bucketRow.getByRole("checkbox");
      const includeInPrint = !(await printToggle.isChecked());
      const bucketUpdated = await productWrite(
        page,
        "PATCH",
        new RegExp(`^/api/v1/reports/bucket/${bucketId}$`),
        () => printToggle.click(),
      );
      assert.equal(bucketUpdated.data.include_in_print, includeInPrint);
      expectPersistedFields(bucketId, { include_in_print: includeInPrint });
      const removed = await productWrite(
        page,
        "POST",
        new RegExp(`^/api/v1/reports/bucket/${bucketId}/archive$`),
        () => bucketRow.getByRole("button", { name: "Remove", exact: true }).click(),
      );
      assert(removed.data.archived_at);
      markClean(bucketId, "ui_archive");
      const bucketAudit = await readApi(`/api/v1/audit?limit=100&object_id=${bucketId}`);
      for (const action of ["create", "update", "archive"]) {
        assert(bucketAudit.some((event) => event.action === action), `Report Bucket audit omitted ${action}.`);
      }

      await gotoEconomicScenario(page, LOCAL_URL, false);
      for (const [id, name] of [[firstId, renamed], [secondId, `${PREFIX} Economics B`]]) {
        await loadEconomicScenario(page, id, name);
        if (id === firstId) {
          assert.equal(await page.getByLabel("Intensity band").inputValue(), intensityBand);
          const outputText = await page.getByTestId("scenario-output").innerText();
          for (const value of [
            updated.data.outputs.taxBaseLift,
            updated.data.outputs.revenuePerAcre,
            updated.data.outputs.serviceBurden,
            updated.data.outputs.dataConfidence,
          ]) {
            assert(outputText.includes(value), `Reloaded Economics output omitted ${value}.`);
          }
        }
        const archived = await productWrite(
          page,
          "POST",
          new RegExp(`^/api/v1/economics/scenarios/${id}/archive$`),
          () => page.getByTestId("economic-scenario-archive").click(),
        );
        assert(archived.data.archived_at);
        markClean(id, "ui_archive");
      }

      const persisted = await readApi(`/api/v1/economics/scenarios/${firstId}`);
      assert.equal(persisted.name, renamed);
      assert(persisted.current_version >= 2);
      assert.equal(persisted.assumptions.intensityBand, intensityBand);
      assert.deepEqual(persisted.outputs, updated.data.outputs);
      const audit = await readApi(`/api/v1/audit?limit=100&object_id=${firstId}`);
      for (const action of ["create", "update", "version", "archive"]) {
        assert(audit.some((event) => event.action === action), `Economics audit omitted ${action}.`);
      }
      const activeScenarios = await readApi("/api/v1/economics/scenarios?page_size=100");
      assert(scenarioIds.every((id) => !activeScenarios.some((record) => record.id === id)));
    });
  } finally {
    await closeAcceptedPage(page);
  }
}

async function localAskCfs(context) {
  const page = await context.newPage();
  let ownedConversationId = null;
  try {
    await runCase("Ask CFS", "UI conversation, follow-up, refresh recovery, reset", async () => {
      const trafficStart = report.local.product_requests.length;
      const stopAskIsolation = await isolateAskCfsConversationList(page);
      await goto(page, LOCAL_URL, "?app=planning");
      await openPlanningAskCfs(page);
      const query = page.getByTestId("ask-cfs-query").first();
      const secretMarker = `${PREFIX}-ASK-SECRET`;
      await query.fill(
        `What verified planning context is available for ${PREFIX}? password=${secretMarker} correct horse battery staple;`,
      );
      const created = await productWrite(
        page,
        "POST",
        /^\/api\/v1\/ask-cfs\/conversations$/,
        () => page.getByTestId("ask-cfs-submit").first().click(),
        90_000,
      );
      const id = productId(created, "Ask CFS UI conversation");
      ownedConversationId = id;
      remember("ask_cfs", "/api/v1/ask-cfs/conversations", id);
      await stopAskIsolation();
      assert.equal(created.data.title.includes("<redacted>"), true);
      assert.equal(JSON.stringify(created.data).includes(secretMarker), false);
      expectPersistedFields(id, { title: created.data.title });
      await page.getByText("Grounded CFS analysis", { exact: true }).first().waitFor({ timeout: 90_000 });
      await page.getByTestId("ask-cfs-persistence-status").first().waitFor({ timeout: 30_000 });

      await query.fill("What should be reviewed next?");
      await page.getByTestId("ask-cfs-submit").first().click();
      await waitForProductTraffic(trafficStart, (entry) =>
        entry.method === "POST" && entry.path === `/api/v1/ask-cfs/conversations/${id}/messages`,
        4,
      );
      const messages = await readApi(`/api/v1/ask-cfs/conversations/${id}/messages?page_size=100`);
      assert(messages.length >= 4, "Ask CFS follow-up messages were not persisted.");
      assert.equal(JSON.stringify(messages).includes(secretMarker), false);
      assert.equal(JSON.stringify(messages).includes("<redacted>"), true);
      assert.doesNotMatch(
        JSON.stringify(messages),
        /hidden_prompt|api[_-]?key|authorization|cookie|credential|password|secret|token/i,
      );

      await reloadPage(page);
      await openPlanningAskCfs(page);
      await page.getByText(/What should be reviewed next\?|verified planning context/i).first().waitFor({ timeout: 45_000 });
      const reset = await productWrite(
        page,
        "POST",
        new RegExp(`^/api/v1/ask-cfs/conversations/${id}/reset$`),
        () => page.getByTestId("ask-cfs-reset").first().click(),
      );
      assert(reset.data.reset_at, "Ask CFS reset omitted reset_at.");
      assert.deepEqual(await readApi(`/api/v1/ask-cfs/conversations/${id}/messages?page_size=100`), []);
      const audit = await readApi(`/api/v1/audit?limit=100&object_id=${id}`);
      assert(audit.some((event) => event.action === "ask_cfs_reset"));
    });
  } finally {
    await closeAcceptedPage(page);
  }
  assert.match(ownedConversationId ?? "", /^[0-9a-f-]{36}$/i, "Ask CFS ownership proof omitted its UUID.");
  return ownedConversationId;
}

async function localMalformedProductRecords(context) {
  const page = await context.newPage();
  try {
    await runCase("Planning", "malformed persisted snapshot uses the safe fallback", async () => {
      const id = "00000000-0000-4000-8000-000000000001";
      const timestamp = new Date().toISOString();
      const stopOverride = await overrideProductList(page, "/api/v1/planning/snapshots", [
        {
          archived_at: null,
          created_at: timestamp,
          created_by: null,
          current_version: 1,
          id,
          included_sections: ["data_needed_caveats"],
          map_state: { map_renderer: "interactive" },
          notes: null,
          organization_id: null,
          payload: {
            snapshot: {
              activeLayers: [],
              caveats: [],
              createdAt: timestamp,
              explainableMetrics: [null],
              includedSections: {
                data_needed_caveats: true,
                development_permits: false,
                fema_flood: false,
                map_view: false,
                model_governance: false,
                new_construction: false,
                parcel_facts: false,
                recommended_actions: false,
                schools: false,
                transportation: false,
                utility_proxy: false,
                zoning_planning: false,
              },
              keyFacts: [],
              knownReviewFlags: [],
              mapContext: { description: "Malformed test record", extentCaptured: false },
              overviewKpis: [],
              selectedParcelId: null,
              selectedParcelSummary: null,
              snapshotId: id,
              snapshotVersion: "phase28k_v1",
            },
          },
          project_id: null,
          review_status: "Draft",
          title: `${PREFIX} Malformed Planning`,
          updated_at: timestamp,
        },
      ]);
      try {
        await goto(page, LOCAL_URL, "?app=planning");
        await page.getByRole("button", { name: /^Planning Snapshot:/ }).click();
        await openPlanningSnapshot(page, id);
        await page.getByText(
          "This server record predates the full browser Planning Snapshot payload. Review the source record before reuse.",
          { exact: false },
        ).waitFor({ timeout: 30_000 });
      } finally {
        await stopOverride();
      }
    });

    await runCase("Report Bucket", "unsupported persisted values surface schema drift", async () => {
      const timestamp = new Date().toISOString();
      const record = {
        archived_at: null,
        created_at: timestamp,
        created_by: null,
        id: "00000000-0000-4000-8000-000000000002",
        include_in_print: true,
        object_id: "malformed-report-item",
        object_type: "unsupported_type",
        organization_id: null,
        payload: { source_page: "Print" },
        position: 0,
        project_id: null,
        report_id: null,
        title: `${PREFIX} Malformed Report Bucket`,
        updated_at: timestamp,
      };
      const cases = [
        [record, "Report Bucket data contains an unsupported item type."],
        [
          { ...record, id: "00000000-0000-4000-8000-000000000003", object_type: "generated_report", payload: { source_page: "Unsupported" } },
          "Report Bucket data contains an unsupported source page.",
        ],
      ];
      for (const [malformedRecord, expectedMessage] of cases) {
        const stopOverride = await overrideProductList(page, "/api/v1/reports/bucket", [malformedRecord]);
        try {
          await gotoEconomicBucket(page, LOCAL_URL);
          const status = page.getByTestId("report-bucket-status").first();
          await poll(async () => (await status.innerText()).includes(expectedMessage));
          assert.equal(await page.locator(`[data-testid="report-bucket-item"][data-record-id="${malformedRecord.id}"]`).count(), 0);
        } finally {
          await stopOverride();
        }
      }
    });

    await runCase("Economics", "unsupported persisted scenario schema fails closed", async () => {
      const id = "00000000-0000-4000-8000-000000000004";
      const timestamp = new Date().toISOString();
      const stopOverride = await overrideProductList(page, "/api/v1/economics/scenarios", [
        {
          archived_at: null,
          assumptions: {
            developmentType: "Current Conditions",
            floodConstraint: "Medium",
            intensityBand: "Low",
            scenarioId: "current_conditions",
            schoolServiceBurden: "Medium",
            transportationAccess: "Medium",
            utilityReadiness: "Medium",
            valuePerAcreBand: "Medium",
          },
          comparison_set_id: null,
          created_at: timestamp,
          created_by: null,
          current_version: 1,
          id,
          name: `${PREFIX} Unsupported Economics`,
          notes: null,
          organization_id: null,
          outputs: { calculation_schema_version: "legacy-schema" },
          payload: {
            calculation_schema_version: "legacy-schema",
            scenario_template_id: "current_conditions",
          },
          project_id: null,
          status: "Draft",
          updated_at: timestamp,
        },
      ]);
      try {
        await gotoEconomicScenario(page, LOCAL_URL);
        await poll(async () => /unsupported calculation schema/i.test(
          await page.getByTestId("economic-scenario-status").innerText(),
        ));
        assert.equal(
          await page.getByTestId("economic-scenario-library").locator(`option[value="${id}"]`).count(),
          0,
        );
      } finally {
        await stopOverride();
      }
    });
  } finally {
    await closeAcceptedPage(page);
  }
}

async function localPermissionDenial(context, ownedAskConversationId) {
  assert.match(ownedAskConversationId ?? "", /^[0-9a-f-]{36}$/i, "Denied Ask CFS proof requires an owned UUID.");
  const page = await context.newPage();
  try {
    await runCase("Authorization", "UI does not report a denied write as saved", async () => {
      await routeMethodOnce(page, `${API_URL}/api/v1/planning/snapshots`, "POST", async (route) => {
        await route.fulfill({
          body: JSON.stringify({
            error: { code: "forbidden", message: "planning:write permission is required." },
            request_id: `${PREFIX}-forbidden`,
            timestamp: new Date().toISOString(),
          }),
          contentType: "application/json",
          status: 403,
        });
      });
      await goto(page, LOCAL_URL, "?app=planning");
      await page.getByTestId("planning-snapshot-save").click();
      const statuses = page.getByTestId("planning-persistence-status");
      await statuses.first().waitFor({ timeout: 30_000 });
      await poll(async () => (await statuses.allInnerTexts()).some((text) => /permission|denied|not authorized/i.test(text)));
      assert(!(await statuses.evaluateAll((nodes) => nodes.some((node) => node.getAttribute("data-state") === "saved"))));
      report.authorization.cases.push({
        action: "Planning create",
        expected: "403 is surfaced and never reported as saved",
        role: "Administrator with simulated server denial",
        status: "PASS",
      });
    });

    await runCase("Authorization", "Economics and Report Bucket denied writes remain unsaved", async () => {
      await routeMethodOnce(page, `${API_URL}/api/v1/economics/scenarios`, "POST", async (route) => {
        await forbidden(route, "economics:write permission is required.");
      });
      await gotoEconomicScenario(page, LOCAL_URL);
      await page.getByTestId("economic-scenario-name").fill(`${PREFIX} Denied Economics`);
      const scenarioDenied = page.waitForResponse(isProductResponse("POST", /^\/api\/v1\/economics\/scenarios$/));
      await page.getByTestId("economic-scenario-save-new").click();
      assert.equal((await scenarioDenied).status(), 403);
      const scenarioStatus = page.getByTestId("economic-scenario-status");
      await poll(async () => /permission|forbidden|cannot|not authorized/i.test(await scenarioStatus.innerText()));
      assert.doesNotMatch(await scenarioStatus.innerText(), /^Saved/i);

      await routeMethodOnce(page, `${API_URL}/api/v1/reports/bucket`, "POST", async (route) => {
        await forbidden(route, "reports:write permission is required.");
      });
      const bucketDenied = page.waitForResponse(isProductResponse("POST", /^\/api\/v1\/reports\/bucket$/));
      await page.getByRole("button", { name: "Add memo to Report Bucket", exact: true }).click();
      assert.equal((await bucketDenied).status(), 403);
      const bucketStatus = page.getByTestId("report-bucket-status");
      await poll(async () => /permission|forbidden|cannot|not authorized/i.test(await bucketStatus.innerText()));
      assert.doesNotMatch(await bucketStatus.innerText(), /saved|added/i);
      report.authorization.cases.push({
        action: "Economics scenario and Report Bucket create",
        expected: "403 is surfaced and never reported as saved",
        role: "Administrator with simulated server denial",
        status: "PASS",
      });
    });

    await runCase("Authorization", "Ask CFS denied message persistence remains unsaved", async () => {
      const stopAskIsolation = await isolateAskCfsConversationList(page, [ownedAskConversationId]);
      const deniedAskWrite = new RegExp(
        `^${escapeRegExp(API_URL)}/api/v1/ask-cfs/conversations(?:/[0-9a-f-]+/messages)?$`,
        "i",
      );
      await routeMethodOnce(page, deniedAskWrite, "POST", async (route) => {
        await forbidden(route, "ask_cfs:use permission is required.");
      });
      try {
        await goto(page, LOCAL_URL, "?app=planning");
        await openPlanningAskCfs(page);
        const query = page.getByTestId("ask-cfs-query").first();
        const askStatus = page.getByTestId("ask-cfs-persistence-status").first();
        const question = `${PREFIX}: confirm denied persistence is not reported as saved.`;
        await query.fill(question);
        const submit = page.getByTestId("ask-cfs-submit").first();
        await poll(async () => (await query.inputValue()) === question && !(await submit.isDisabled()), 45_000);
        const conversationId = await askStatus.getAttribute("data-conversation-id");
        assert.equal(conversationId, ownedAskConversationId, "Denied Ask CFS proof selected a non-owned conversation.");
        const conversationIdsBefore = (await readApi("/api/v1/ask-cfs/conversations?page_size=100"))
          .map((record) => record.id)
          .sort();
        const messagesBefore = await readApi(`/api/v1/ask-cfs/conversations/${conversationId}/messages?page_size=100`);
        const [messageDenied] = await Promise.all([
          page.waitForResponse((response) =>
            response.request().method() === "POST" &&
            new URL(response.url()).pathname === `/api/v1/ask-cfs/conversations/${conversationId}/messages`,
          { timeout: 90_000 }),
          submit.click(),
        ]);
        assert.equal(messageDenied.status(), 403);
        await poll(async () => /permission|forbidden|could not be saved|not authorized/i.test(await askStatus.innerText()), 60_000);
        assert.doesNotMatch(await askStatus.innerText(), /saved to cfs/i);
        assert.deepEqual(
          (await readApi("/api/v1/ask-cfs/conversations?page_size=100")).map((record) => record.id).sort(),
          conversationIdsBefore,
          "Denied Ask CFS write changed the active conversation set.",
        );
        assert.deepEqual(
          await readApi(`/api/v1/ask-cfs/conversations/${conversationId}/messages?page_size=100`),
          messagesBefore,
          "Denied Ask CFS write persisted a message.",
        );
        report.authorization.cases.push({
          action: "Ask CFS message persistence",
          endpoint: new URL(messageDenied.url()).pathname,
          expected: "ready submit emits a 403 and does not persist a conversation or message",
          owned_conversation_id: conversationId,
          role: "Administrator with simulated server denial",
          status: "PASS",
        });
      } finally {
        await stopAskIsolation();
      }
    });
  } finally {
    await closeAcceptedPage(page);
  }
}

async function localHealthDrainVerification() {
  if (FORCE_REQUIRED_HEALTH_FAILURE_PATH) {
    await runRoleCase("Administrator", ADMINISTRATOR_PERMISSIONS, async (page) => {
      const target = new RegExp(
        `^${escapeRegExp(API_URL + FORCE_REQUIRED_HEALTH_FAILURE_PATH)}(?:\\?.*)?$`,
        "i",
      );
      await page.route(target, async (route) => {
        if (route.request().method() !== "GET") return route.continue();
        await route.fulfill({
          body: JSON.stringify({ detail: `Forced required health failure for ${FORCE_REQUIRED_HEALTH_FAILURE_PATH}.` }),
          contentType: "application/json",
          headers: { "X-Request-ID": `${PREFIX}-required-health-failure` },
          status: 503,
        });
      });
      await goto(page, LOCAL_URL, "?app=planning");
      const state = await assertLocalRuntimeHealth(page, FORCE_REQUIRED_HEALTH_FAILURE_PATH);
      await poll(() => report.diagnostics.map_diagnostics.some(
        (diagnostic) =>
          diagnostic.classification === "required_cfs_api_failure" &&
          diagnostic.fatal === true &&
          diagnostic.url &&
          new URL(diagnostic.url).pathname === FORCE_REQUIRED_HEALTH_FAILURE_PATH,
      ));
      try {
        assertBrowserDiagnosticsHealthy();
      } catch (error) {
        throw new Error(
          `REQUIRED_HEALTH_FAILURE_DETECTED ${FORCE_REQUIRED_HEALTH_FAILURE_PATH} ${JSON.stringify(state)}`,
          { cause: error },
        );
      }
      throw new Error(`Required health gate accepted ${FORCE_REQUIRED_HEALTH_FAILURE_PATH}.`);
    });
    return;
  }

  await runRoleCase("Planner", PLANNER_PERMISSIONS, async (page, setPrincipal) => {
    await goto(page, LOCAL_URL, "?app=planning");
    await assertLocalRuntimeHealth(page);
    report.authorization.cases.push({
      action: "Required health generation completes before role transition",
      expected: "API Ready, database Connected, and grounded Ask CFS",
      role: "Planner",
      status: "PASS",
    });
    setPrincipal("Administrator", ADMINISTRATOR_PERMISSIONS);
    await page.route(
      new RegExp(`^${escapeRegExp(API_URL)}/(?:ai/status|health/(?:database|ready))(?:\\?.*)?$`, "i"),
      async (route) => {
        if (route.request().method() !== "GET") return route.continue();
        try {
          const response = await route.fetch();
          await delay(750);
          await route.fulfill({ response });
        } catch (error) {
          const lifecycle = acceptanceLifecycle(page);
          if (
            acceptedHealthPollRouteRequests.has(route.request()) ||
            lifecycle.startedGeneration > lifecycle.provenGeneration ||
            acceptedTeardownPages.has(page)
          ) {
            return;
          }
          throw error;
        }
      },
    );
    await reloadPage(page);
    await assertLocalRuntimeHealth(page);
    await assertCurrentPrincipalRole(page, "Administrator");
    report.authorization.cases.push({
      action: "Planner to Administrator principal transition",
      expected: "same page and context reload with a healthy current poll generation",
      role: "Administrator",
      status: "PASS",
    });
    for (let iteration = 1; iteration <= 5; iteration += 1) {
      await gotoDataAdministration(page);
      await goto(page, LOCAL_URL, "?app=planning");
      await assertLocalRuntimeHealth(page);
      report.authorization.cases.push({
        action: "Planning to data administration to Planning health lifecycle",
        expected: "current health generation completes with no stale pending request leak",
        iteration,
        role: "Administrator",
        status: "PASS",
      });
    }

    await gotoHomeDuringHealthPoll(page);
    await goto(page, LOCAL_URL, "?app=planning");
    await assertLocalRuntimeHealth(page);
    await waitForNextHealthyPoll(page);
    await gotoHomeDuringHealthPoll(page);
    await goto(page, LOCAL_URL, "?app=planning");
    await assertLocalRuntimeHealth(page);
    report.authorization.cases.push({
      action: "Home to Planning to Home during active TopNav polling",
      expected: "accepted navigation retires only stale idempotent work and polling resumes healthy",
      role: "Administrator",
      status: "PASS",
    });
  }, "Planner to Administrator health lifecycle");
}

async function localAuthorizationMatrix() {
  await runRoleCase(
    "Viewer",
    ["ask_cfs:use", "data:read", "reports:read", "sources:read"],
    async (page) => {
      await goto(page, LOCAL_URL, "?app=planning");
      await assertVisiblePlanningSavesDisabled(page);

      await gotoEconomicScenario(page, LOCAL_URL);
      const economicsSave = page.getByTestId("economic-scenario-save-new");
      await poll(() => economicsSave.isDisabled());
      await poll(() => page.getByRole("button", { name: "Add memo to Report Bucket", exact: true }).isDisabled());
      report.authorization.cases.push({
        action: "Planning, Economics, and Report Bucket writes disabled",
        expected: "read-only controls",
        role: "Viewer",
        status: "PASS",
      });
    },
  );

  await runRoleCase(
    "Planner",
    PLANNER_PERMISSIONS,
    async (page) => {
      await goto(page, LOCAL_URL, "?app=planning");
      await waitForInteractiveMap(page);
      const create = page.getByTestId("planning-snapshot-save").first();
      await poll(async () => !(await create.isDisabled()));
      const created = await productWrite(page, "POST", /^\/api\/v1\/planning\/snapshots$/, () => create.click());
      const id = productId(created, "Planner Planning snapshot create");
      remember("planning", "/api/v1/planning/snapshots", id);
      await planningStatus(page, ["saved", "ready"]);
      await openPlanningSnapshot(page, id);
      const archived = await productWrite(
        page,
        "POST",
        new RegExp(`^/api/v1/planning/snapshots/${id}/archive$`),
        () => acceptNextDialog(page, () => planningCard(page, id).getByTestId("planning-snapshot-archive").click()),
      );
      assert(archived.data.archived_at);
      markClean(id, "ui_archive");
      report.authorization.cases.push({
        action: "Planning create and archive through UI",
        expected: "Planning write enabled",
        role: "Planner",
        status: "PASS",
      });
    },
  );

  await runRoleCase(
    "Analyst",
    ["ask_cfs:use", "data:read", "economics:write", "master_data:export", "master_data:view", "projects:write", "reports:read", "reports:write", "sources:read"],
    async (page) => {
      await goto(page, LOCAL_URL, "?app=planning");
      await assertVisiblePlanningSavesDisabled(page);

      await gotoEconomicScenario(page, LOCAL_URL);
      const save = page.getByTestId("economic-scenario-save-new");
      await poll(async () => !(await save.isDisabled()));
      const name = `${PREFIX} Analyst Economics`;
      await page.getByTestId("economic-scenario-name").fill(name);
      const created = await productWrite(page, "POST", /^\/api\/v1\/economics\/scenarios$/, () => save.click());
      const id = productId(created, "Analyst Economics scenario create");
      remember("economics", "/api/v1/economics/scenarios", id);
      await economicsStatus(page, /Saved|created/i);
      const archived = await productWrite(
        page,
        "POST",
        new RegExp(`^/api/v1/economics/scenarios/${id}/archive$`),
        () => page.getByTestId("economic-scenario-archive").click(),
      );
      assert(archived.data.archived_at);
      markClean(id, "ui_archive");
      report.authorization.cases.push({
        action: "Economics create and archive enabled; Planning create disabled",
        expected: "domain-specific write controls",
        role: "Analyst",
        status: "PASS",
      });
    },
  );

  await runRoleCase(
    "Report Author",
    ["ask_cfs:use", "data:read", "reports:read", "reports:write", "sources:read"],
    async (page) => {
      await goto(page, LOCAL_URL, "?app=planning");
      await assertVisiblePlanningSavesDisabled(page);

      await gotoEconomicScenario(page, LOCAL_URL);
      await poll(() => page.getByTestId("economic-scenario-save-new").isDisabled());
      const add = page.getByRole("button", { name: "Add memo to Report Bucket", exact: true });
      await poll(async () => !(await add.isDisabled()));
      const created = await productWrite(page, "POST", /^\/api\/v1\/reports\/bucket$/, () => add.click());
      const id = productId(created, "Report Author bucket item create");
      remember("economics_report_bucket", "/api/v1/reports/bucket", id);
      await gotoEconomicBucket(page, LOCAL_URL, false);
      const row = reportBucketRow(page, id, created.data.object_id);
      await row.waitFor({ timeout: 45_000 });
      const archived = await productWrite(
        page,
        "POST",
        new RegExp(`^/api/v1/reports/bucket/${id}/archive$`),
        () => row.getByRole("button", { name: "Remove", exact: true }).click(),
      );
      assert(archived.data.archived_at);
      markClean(id, "ui_archive");
      report.authorization.cases.push({
        action: "Report Bucket add and archive enabled; Planning and Economics saves disabled",
        expected: "report-author-specific write controls",
        role: "Report Author",
        status: "PASS",
      });
    },
  );

  await runRoleCase(
    "Data Steward",
    ["ask_cfs:use", "data:read", "ingestion:apply", "ingestion:dry_run", "reports:read", "sources:read", "sources:write"],
    async (page) => {
      await goto(page, LOCAL_URL, "?app=planning");
      await assertVisiblePlanningSavesDisabled(page);
      await gotoDataAdministration(page);
      assert.match(await page.getByTestId("data-administration-page").innerText(), /source|ingestion|quality/i);
      await goto(page, LOCAL_URL, "?app=planning");
      report.authorization.cases.push({
        action: "Data administration status visible; product workspace writes disabled",
        expected: "source and ingestion operations role",
        role: "Data Steward",
        status: "PASS",
      });
    },
  );

  await runRoleCase(
    "Administrator",
    ADMINISTRATOR_PERMISSIONS,
    async (page) => {
      await goto(page, LOCAL_URL, "?app=planning");
      await poll(async () => !(await page.getByTestId("planning-snapshot-save").first().isDisabled()));
      await gotoDataAdministration(page);
      await goto(page, LOCAL_URL, "?app=planning");
      report.authorization.cases.push({
        action: "Product workspace writes and data-administration status visible",
        expected: "authorized administrative functions",
        role: "Administrator",
        status: "PASS",
      });
    },
  );
}

async function assertVisiblePlanningSavesDisabled(page) {
  const controls = page.locator('[data-testid^="planning-snapshot-save"]:visible');
  await controls.first().waitFor({ timeout: 45_000 });
  await poll(async () => {
    const count = await controls.count();
    if (!count) return false;
    return (await Promise.all(
      Array.from({ length: count }, (_, index) => controls.nth(index).isDisabled()),
    )).every(Boolean);
  });
}

async function runRoleCase(role, permissions, run, caseName = `${role} UI permission matrix`) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  attachDiagnostics(context, `authorization-${role.toLowerCase()}`);
  let currentPermissions = permissions;
  let currentRole = role;
  await context.route(new RegExp(`^${escapeRegExp(API_URL)}/api/v1/me(?:\\?.*)?$`), async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const requestId = `${PREFIX}-${currentRole.toLowerCase()}`;
    await route.fulfill({
      body: JSON.stringify({
        data: {
          authenticated: true,
          organization_id: report.local.principal.organization_id,
          permissions: currentPermissions,
          roles: [currentRole],
          subject: `${currentRole.toLowerCase()}-browser-check`,
          user_id: report.local.principal.user_id,
        },
        provenance: { api_version: "v1", data_provider: "local_api", runtime_mode: "local" },
        request_id: requestId,
        timestamp: new Date().toISOString(),
      }),
      contentType: "application/json",
      headers: { "X-Request-ID": requestId },
      status: 200,
    });
  });
  const page = await context.newPage();
  pageAuthorizationRoles.set(page, currentRole);
  try {
    await runCase("Authorization", caseName, () =>
      run(page, (nextRole, nextPermissions) => {
        currentPermissions = nextPermissions;
        currentRole = nextRole;
        pageAuthorizationRoles.set(page, nextRole);
      }));
    await assertCurrentPrincipalRole(page, currentRole);
  } finally {
    await closeAcceptedContext(context);
  }
}

async function assertCurrentPrincipalRole(page, role) {
  const controls = page.getByRole("button", { name: /Open (?:dashboard|economics) controls/i });
  await controls.click();
  const principalStatus = page.getByTestId("product-principal-status");
  try {
    await principalStatus.waitFor({ timeout: 30_000 });
    assert.match(await principalStatus.innerText(), new RegExp(role, "i"));
  } finally {
    if (await principalStatus.isVisible().catch(() => false)) await controls.click();
  }
}

async function assertLocalRuntimeHealth(page, expectedFailurePath = null) {
  const controls = page.getByRole("button", { name: /Open (?:dashboard|economics) controls/i });
  await controls.click();
  const runtime = page.getByTestId("local-runtime-status");
  try {
    await runtime.waitFor({ timeout: 30_000 });
    await page.waitForFunction(
      (failurePath) => {
        const api = document.querySelector('[data-testid="local-runtime-api"]')?.textContent?.trim();
        const database = document.querySelector('[data-testid="local-runtime-database"]')?.textContent?.trim();
        const ask = document.querySelector('[data-testid="local-runtime-ask"]')?.textContent?.trim();
        if (failurePath === "/health/ready") {
          return api === "Unavailable" && database === "Connected" && ask === "Grounded local answers";
        }
        if (failurePath === "/health/database") {
          return api === "Ready" && database === "Local database unavailable" && ask === "Grounded local answers";
        }
        if (failurePath === "/ai/status") {
          return api === "Ready" && database === "Connected" && ask === "Grounded answers unavailable";
        }
        return (
          api === "Ready" &&
          database === "Connected" &&
          ["Grounded local answers", "OpenAI with grounded fallback"].includes(ask ?? "")
        );
      },
      expectedFailurePath,
      { timeout: 30_000 },
    );
    const state = await page.evaluate(() => {
      const events = (window.__cfsTechnicalEvents ?? []).filter((entry) => entry.event === "api_readiness");
      return {
        api: document.querySelector('[data-testid="local-runtime-api"]')?.textContent?.trim() ?? null,
        ask: document.querySelector('[data-testid="local-runtime-ask"]')?.textContent?.trim() ?? null,
        database: document.querySelector('[data-testid="local-runtime-database"]')?.textContent?.trim() ?? null,
        technical_event: events.at(-1) ?? null,
      };
    });
    report.authorization.health_checks.push({
      acceptance_generation: acceptanceLifecycle(page).provenGeneration,
      expected_failure_path: expectedFailurePath,
      navigation_epoch: pageNavigationEpochs.get(page) ?? 0,
      observed_at: new Date().toISOString(),
      page_url: redactMapDiagnosticUrl(page.url()),
      ...state,
    });
    return state;
  } finally {
    if (await runtime.isVisible().catch(() => false)) await controls.click();
  }
}

async function waitForNextHealthyPoll(page) {
  const previousCount = await page.evaluate(
    () => (window.__cfsTechnicalEvents ?? []).filter((entry) => entry.event === "api_readiness").length,
  );
  const sequenceBefore = requestSequence;
  const navigationEpoch = pageNavigationEpochs.get(page) ?? 0;
  await page.waitForFunction(
    (count) => {
      const events = (window.__cfsTechnicalEvents ?? []).filter((entry) => entry.event === "api_readiness");
      const latest = events.at(-1);
      return (
        events.length > count &&
        latest?.detail?.api_ready === true &&
        latest.detail.database_ready === true &&
        ["Grounded local answers", "OpenAI with grounded fallback"].includes(
          latest.detail.ask_mode ?? "",
        )
      );
    },
    previousCount,
    { timeout: 30_000 },
  );
  await poll(() => {
    const lifecycles = report.diagnostics.health_request_lifecycle.filter(
      (entry) =>
        entry.authorization_role === "Administrator" &&
        entry.navigation_epoch === navigationEpoch &&
        entry.request_sequence > sequenceBefore,
    );
    const pending = [...(contextPendingRequiredApiRequests.get(page.context())?.values() ?? [])]
      .filter(
        (entry) =>
          entry.page === page &&
          entry.method === "GET" &&
          entry.navigationEpoch === navigationEpoch &&
          REQUIRED_HEALTH_PATHS.has(new URL(entry.url).pathname),
      );
    return (
      pending.length === 0 &&
      [...REQUIRED_HEALTH_PATHS].every((path) =>
        lifecycles.some(
          (entry) =>
            entry.endpoint === path &&
            entry.status === 200 &&
            entry.body_completed_at &&
            entry.request_finished_at &&
            !entry.request_failed_at,
        ),
      )
    );
  }, 15_000);
}

async function gotoHomeDuringHealthPoll(page) {
  const navigationEpoch = pageNavigationEpochs.get(page) ?? 0;
  const activeHealthGets = () =>
    [...(contextPendingRequiredApiRequests.get(page.context()) ?? [])]
      .filter(
        ([, entry]) =>
          entry.page === page &&
          entry.method === "GET" &&
          entry.navigationEpoch === navigationEpoch &&
          REQUIRED_HEALTH_PATHS.has(new URL(entry.url).pathname),
      );
  await poll(
    () => new Set(activeHealthGets().map(([, entry]) => new URL(entry.url).pathname)).size === REQUIRED_HEALTH_PATHS.size,
    25_000,
  );
  const activeRequests = activeHealthGets();
  const activeEndpoints = [...new Set(
    activeRequests.map(([, entry]) => new URL(entry.url).pathname),
  )].sort();
  for (const [request] of activeRequests) acceptedHealthPollRouteRequests.add(request);
  const reconciledBefore = report.diagnostics.accepted_stale_required_api_requests.length;
  // ponytail: bypass the normal drain only to force the accepted client-side navigation edge under test.
  const generation = beginAcceptanceTransition(page);
  await page.getByRole("button", { name: "Return to CFS Home", exact: true }).click();
  await page.getByTestId("cfs-master-home").waitFor({ timeout: 60_000 });
  await poll(
    async () =>
      !new URL(page.url()).searchParams.has("app") &&
      (await page.getByRole("button", { name: "Return to CFS Home", exact: true }).count()) === 0,
    30_000,
  );
  const text = await page.locator("body").innerText();
  assert(!/Application error|Internal Server Error|Unhandled Runtime Error/i.test(text));
  proveAcceptanceTransition(page, generation);
  const terminalRequests = activeRequests.map(([request, entry]) => {
    const lifecycle = healthRequestLifecycles.get(request);
    assert(
      lifecycle?.body_completed_at || lifecycle?.request_failed_at || lifecycle?.accepted_superseded_at,
      `Accepted Home navigation left health request ${entry.sequence} without a terminal lifecycle state.`,
    );
    return {
      endpoint: new URL(entry.url).pathname,
      request_sequence: entry.sequence,
      terminal_state:
        lifecycle.terminal_state ??
        (lifecycle.request_failed_at ? "request_failed" : "body_completed"),
    };
  });
  report.authorization.health_checks.push({
    acceptance_generation: generation,
    active_poll_endpoints_at_navigation: activeEndpoints,
    navigation_epoch: pageNavigationEpochs.get(page) ?? 0,
    observed_at: new Date().toISOString(),
    page_url: redactMapDiagnosticUrl(page.url()),
    reconciled_stale_requests:
      report.diagnostics.accepted_stale_required_api_requests.length - reconciledBefore,
    terminal_requests: terminalRequests,
    transition: "Planning to Home during active TopNav polling",
  });
}

async function localBrowserStorageCheck(context) {
  const page = await context.newPage();
  try {
    await goto(page, LOCAL_URL, "?app=planning");
    const storage = await page.evaluate(() => ({
      local: Object.keys(localStorage).sort(),
      session: Object.keys(sessionStorage).sort(),
    }));
    assert(
      ![...storage.local, ...storage.session].some((key) => key.startsWith("cfs-product-demo:")),
      "LOCAL wrote Product records to the DEMO session store.",
    );
    assert(
      !storage.local.some((key) => key === "cfs.planningSnapshots.phase22e.library"),
      "LOCAL wrote the legacy browser Planning Snapshot library.",
    );
    assert(
      !storage.local.some((key) => key === "cfs.planningSnapshot.reportDrafts.v1"),
      "LOCAL wrote the legacy browser Planning report-draft library.",
    );
    report.local.browser_storage = storage;
  } finally {
    await closeAcceptedPage(page);
  }
}

async function assertLocalNetworkCoverage() {
  const required = [
    ["GET", /^\/api\/v1\/planning\/snapshots$/],
    ["POST", /^\/api\/v1\/planning\/snapshots$/],
    ["PATCH", /^\/api\/v1\/planning\/snapshots\/[0-9a-f-]+$/i],
    ["POST", /^\/api\/v1\/planning\/snapshots\/[0-9a-f-]+\/versions$/i],
    ["POST", /^\/api\/v1\/planning\/snapshots\/[0-9a-f-]+\/archive$/i],
    ["GET", /^\/api\/v1\/reports$/],
    ["POST", /^\/api\/v1\/reports$/],
    ["PATCH", /^\/api\/v1\/reports\/[0-9a-f-]+$/i],
    ["POST", /^\/api\/v1\/reports\/[0-9a-f-]+\/archive$/i],
    ["GET", /^\/api\/v1\/economics\/scenarios$/],
    ["POST", /^\/api\/v1\/economics\/scenarios$/],
    ["PATCH", /^\/api\/v1\/economics\/scenarios\/[0-9a-f-]+$/i],
    ["POST", /^\/api\/v1\/economics\/scenarios\/[0-9a-f-]+\/versions$/i],
    ["POST", /^\/api\/v1\/economics\/scenarios\/[0-9a-f-]+\/archive$/i],
    ["GET", /^\/api\/v1\/reports\/bucket$/],
    ["POST", /^\/api\/v1\/reports\/bucket$/],
    ["PATCH", /^\/api\/v1\/reports\/bucket\/[0-9a-f-]+$/i],
    ["POST", /^\/api\/v1\/reports\/bucket\/[0-9a-f-]+\/archive$/i],
    ["GET", /^\/api\/v1\/ask-cfs\/conversations$/],
    ["POST", /^\/api\/v1\/ask-cfs\/conversations$/],
    ["GET", /^\/api\/v1\/ask-cfs\/conversations\/[0-9a-f-]+\/messages$/i],
    ["POST", /^\/api\/v1\/ask-cfs\/conversations\/[0-9a-f-]+\/messages$/i],
    ["POST", /^\/api\/v1\/ask-cfs\/conversations\/[0-9a-f-]+\/reset$/i],
  ];
  const successfulRequests = () =>
    report.local.product_requests.filter((entry) => entry.status >= 200 && entry.status < 300);
  await poll(async () => {
    const successful = successfulRequests();
    return required.every(([method, pathname]) =>
      successful.some((entry) => entry.method === method && pathname.test(entry.path)));
  }, 5_000);
  const successful = successfulRequests();
  for (const [method, pathname] of required) {
    assert(
      successful.some((entry) => entry.method === method && pathname.test(entry.path)),
      `Browser network proof omitted ${method} ${pathname}.`,
    );
  }
  const writes = successful.filter((entry) => entry.method !== "GET");
  assert(writes.every((entry) => entry.request_id), "A successful Product V1 browser write omitted its request ID.");
  report.local.network_coverage = {
    required_operations: required.length,
    successful_product_requests: successful.length,
    successful_writes: writes.length,
  };
}

async function demoChecks() {
  const baseUrl = process.env.CFS_DEMO_BASE_URL?.replace(/\/$/, "") ?? await startDemoServer();
  report.demo.base_url = baseUrl;
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    const isProductApi = url.pathname.startsWith("/api/v1/") || url.origin === API_ORIGIN;
    if (isProductApi) {
      report.demo.product_api_requests.push(`${route.request().method()} ${route.request().url()}`);
      await route.abort("blockedbyclient");
      return;
    }
    await route.continue();
  });
  attachDiagnostics(context, "demo", { ignoreBlockedApi: true });
  const page = await context.newPage();
  let demoDraftId;
  let demoPlanningId;
  let demoScenarioId;
  try {
    await runCase("DEMO", "Planning, report drafts, Economics, Report Bucket, and Ask CFS remain session-only", async () => {
      await goto(page, baseUrl, "?app=planning", true);
      await page.getByTestId("planning-snapshot-save").click();
      await planningStatus(page, ["saved", "ready"]);
      const card = page.getByTestId("planning-snapshot-card").first();
      if (!(await card.isVisible())) {
        await page.getByRole("button", { name: /^Planning Snapshot:/ }).click();
      }
      await card.waitFor({ timeout: 45_000 });
      demoPlanningId = await card.getAttribute("data-snapshot-id");
      assert(demoPlanningId, "Demo Planning snapshot omitted its session id.");
      await openPlanningSnapshot(page, demoPlanningId);
      await page.getByTestId("planning-snapshot-title").fill(`${PREFIX} Demo Planning`);
      await page.getByTestId("planning-snapshot-save-changes").click();
      await planningStatus(page, ["saved", "ready"]);

      await page.getByTestId("planning-report-draft-library").waitFor({ timeout: 45_000 });
      await page.getByTestId("planning-report-draft-new").click();
      await planningReportStatus(page, ["saved"]);
      const demoDraftCard = page.getByTestId("planning-report-draft-card").first();
      await demoDraftCard.waitFor({ timeout: 30_000 });
      demoDraftId = await demoDraftCard.getAttribute("data-draft-id");
      assert(demoDraftId, "Demo Planning report draft omitted its session id.");
      const demoReportTitle = `${PREFIX} Demo Planning Report`;
      const demoReportNotes = "Session-only report draft proof";
      await page.getByTestId("planning-report-draft-title").fill(demoReportTitle);
      await page.getByTestId("planning-report-draft-notes").fill(demoReportNotes);
      await page.getByTestId("planning-report-draft-save").click();
      await planningReportStatus(page, ["saved"], demoDraftId);
      const demoDraftName = `${PREFIX} Demo Report Draft`;
      await demoDraftCard.getByTestId("planning-report-draft-rename").click();
      await demoDraftCard.getByTestId("planning-report-draft-rename-input").fill(demoDraftName);
      await demoDraftCard.getByTestId("planning-report-draft-rename-save").click();
      await planningReportStatus(page, ["saved"], demoDraftId);

      await reloadPage(page);
      await openPlanningSnapshot(page, demoPlanningId);
      assert.equal(await page.getByTestId("planning-snapshot-title").inputValue(), `${PREFIX} Demo Planning`);
      const reloadedDemoDraft = planningReportCard(page, demoDraftId);
      await reloadedDemoDraft.waitFor({ timeout: 45_000 });
      assert((await reloadedDemoDraft.innerText()).includes(demoDraftName));
      await reloadedDemoDraft.getByTestId("planning-report-draft-load").click();
      assert.equal(await page.getByTestId("planning-report-draft-title").inputValue(), demoReportTitle);
      assert.equal(await page.getByTestId("planning-report-draft-notes").inputValue(), demoReportNotes);

      await gotoEconomicScenario(page, baseUrl);
      const demoScenarioName = `${PREFIX} Demo Economics`;
      await page.getByTestId("economic-scenario-name").fill(demoScenarioName);
      await page.getByTestId("economic-scenario-save-new").click();
      await economicsStatus(page, /session|Saved|created/i);
      demoScenarioId = await page.getByTestId("economic-scenario-version").getAttribute("data-scenario-id");
      assert(demoScenarioId, "Demo Economics scenario omitted its session id.");
      await reloadPage(page);
      await gotoEconomicScenario(page, baseUrl, false);
      await loadEconomicScenario(page, demoScenarioId, demoScenarioName);
      await page.getByRole("button", { name: "Add memo to Report Bucket", exact: true }).click();
      await gotoEconomicBucket(page, baseUrl, false);
      await page.getByTestId("report-bucket-item").first().waitFor({ timeout: 30_000 });

      await goto(page, baseUrl, "?app=planning", true);
      await openPlanningAskCfs(page);
      const query = page.getByTestId("ask-cfs-query").first();
      await query.fill("What should a demo reviewer inspect first?");
      await page.getByTestId("ask-cfs-submit").first().click();
      await page.getByText("Cached demo analysis", { exact: true }).first().waitFor({ timeout: 90_000 });
      await page.getByTestId("ask-cfs-reset").first().click();

      report.demo.session_keys = await page.evaluate(() => Object.keys(sessionStorage).sort());
      assert(report.demo.session_keys.includes("cfs-product-demo:planning-snapshots:v1"));
      assert(report.demo.session_keys.includes("cfs-product-demo:reports:v1"));
      assert(report.demo.session_keys.includes("cfs-product-demo:economic-scenarios:v1"));
      assert(report.demo.session_keys.includes("cfs-product-demo:report-bucket:v1"));
      assert(report.demo.session_keys.includes("cfs-product-demo:ask-conversations:v1"));
      assert(
        !(await page.evaluate(() => Object.keys(localStorage).some((key) => key.startsWith("cfs-product-demo:")))),
        "Demo Product records leaked into localStorage.",
      );
    });
  } finally {
    await closeAcceptedPage(page);
    await closeAcceptedContext(context);
  }

  const cleanContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await cleanContext.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith("/api/v1/") || url.origin === API_ORIGIN) return route.abort("blockedbyclient");
    return route.continue();
  });
  attachDiagnostics(cleanContext, "demo-clean", { ignoreBlockedApi: true });
  const cleanPage = await cleanContext.newPage();
  try {
    await goto(cleanPage, baseUrl, "?app=planning", true);
    assert.equal(await cleanPage.getByText(`${PREFIX} Demo Planning`, { exact: true }).count(), 0);
    assert.equal(
      await cleanPage.evaluate(() => sessionStorage.getItem("cfs-product-demo:reports:v1")),
      null,
      `Demo report draft ${demoDraftId} leaked into a clean browser session.`,
    );
    assert.equal(await cleanPage.locator('[data-testid="ask-cfs-persistence-status"][data-conversation-id]').count(), 0);
    await gotoEconomicScenario(cleanPage, baseUrl);
    assert.equal(await cleanPage.getByTestId("economic-scenario-library").locator(`option[value="${demoScenarioId}"]`).count(), 0);
    await gotoEconomicBucket(cleanPage, baseUrl, false);
    assert.equal(await cleanPage.getByTestId("report-bucket-item").count(), 0);
  } finally {
    await closeAcceptedContext(cleanContext);
  }
  assert.deepEqual(report.demo.product_api_requests, [], "DEMO attempted Product V1 API requests.");
}

async function gotoEconomicScenario(page, baseUrl, navigate = true) {
  if (navigate) await goto(page, baseUrl, "?app=economics", baseUrl !== LOCAL_URL);
  else {
    await waitForLoadedPage(page);
    await page.getByRole("button", { name: "Return to CFS Home" }).waitFor({ timeout: 60_000 });
  }
  const toolsButton = page.getByRole("button", { name: /Power BI & Tools:/ });
  await toolsButton.waitFor({ timeout: 60_000 });
  await toolsButton.click({ timeout: 90_000 });
  const dataTables = page.getByRole("tab", { name: "Data Tables" });
  await dataTables.waitFor({ timeout: 45_000 });
  await dataTables.click();
  const tools = page.locator('details[data-econ-tour="advanced-tools"]');
  await tools.waitFor({ timeout: 45_000 });
  if ((await tools.getAttribute("open")) === null) {
    await tools.locator(":scope > summary").click();
  }
  const scenarioButton = tools.getByRole("button", { name: /Scenario Model/i });
  await scenarioButton.waitFor({ timeout: 45_000 });
  await scenarioButton.click();
  await page.getByTestId("economic-scenario-library").waitFor({ timeout: 45_000 });
  await page.getByTestId("economic-scenario-name").waitFor();
}

async function gotoEconomicBucket(page, baseUrl, navigate = true) {
  if (navigate) await goto(page, baseUrl, "?app=economics", baseUrl !== LOCAL_URL);
  else {
    await waitForLoadedPage(page);
    await page.getByRole("button", { name: "Return to CFS Home" }).waitFor({ timeout: 60_000 });
  }
  const toolsButton = page.getByRole("button", { name: /Power BI & Tools:/ });
  await toolsButton.waitFor({ timeout: 60_000 });
  await toolsButton.click({ timeout: 90_000 });
  const bucket = page.getByRole("tab", { name: "Report Bucket", exact: true });
  await bucket.waitFor({ timeout: 45_000 });
  await bucket.click();
}

async function loadEconomicScenario(page, id, name) {
  const library = page.getByTestId("economic-scenario-library");
  await library.selectOption(id, { timeout: 90_000 });
  const control = page.getByTestId("economic-scenario-load");
  await poll(async () => (await control.getAttribute("data-scenario-id")) === id);
  await control.click();
  await poll(async () => (await page.getByTestId("economic-scenario-name").inputValue()) === name);
}

async function openPlanningSnapshot(page, id) {
  const card = planningCard(page, id);
  if (!(await card.isVisible().catch(() => false))) {
    await page.getByRole("button", { name: /^Planning Snapshot:/ }).click();
  }
  await card.waitFor({ timeout: 45_000 });
  const open = card.getByTestId("planning-snapshot-open");
  if (await open.count()) await open.click();
  else await card.click();
  await page.getByTestId("planning-snapshot-title").waitFor({ timeout: 30_000 });
}

async function waitForInteractiveMap(page) {
  const map = page.getByTestId("cfs-arcgis-map");
  await map.waitFor({ timeout: 60_000 });
  await poll(
    async () =>
      (await map.getAttribute("data-map-renderer-state")) === "interactive_ready" &&
      (await map.getAttribute("data-map-renderer")) === "interactive",
    60_000,
  );
  return "interactive";
}

async function openPlanningAskCfs(page) {
  const query = page.getByTestId("ask-cfs-query").first();
  if (!(await query.isVisible().catch(() => false))) {
    const intelligenceBrief = page.locator("#cfs-intelligence-brief");
    if (await intelligenceBrief.getByRole("heading", { name: "Countywide indicators", exact: true }).isVisible()) {
      await intelligenceBrief.getByText("Land Opportunity Screener", { exact: true }).waitFor({ timeout: 45_000 });
    }
    await waitForRequiredApiDrain(page.context(), "Planning workspace switch");
    const indicatorCenter = page.getByTestId("command-center-indicator-center");
    await indicatorCenter.waitFor({ timeout: 45_000 });
    await indicatorCenter.click();
    await query.waitFor({ timeout: 45_000 });
    await waitForRequiredApiDrain(page.context(), "Ask CFS startup");
    return;
  }
  await waitForRequiredApiDrain(page.context(), "Ask CFS startup");
}

async function isolateAskCfsConversationList(page, allowedIds = []) {
  const pattern = new RegExp(`^${escapeRegExp(API_URL)}/api/v1/ask-cfs/conversations(?:\\?.*)?$`, "i");
  const handler = async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const response = await route.fetch();
    const payload = await response.json();
    assert(response.ok(), `Ask CFS isolation list returned ${response.status()}.`);
    assert(Array.isArray(payload.data), "Ask CFS isolation list omitted data.");
    await route.fulfill({
      body: JSON.stringify({
        ...payload,
        data: payload.data.filter((record) => allowedIds.includes(record.id)),
        pagination: {
          ...(payload.pagination ?? {}),
          total: payload.data.filter((record) => allowedIds.includes(record.id)).length,
        },
      }),
      response,
    });
  };
  await page.route(pattern, handler);
  return () => page.unroute(pattern, handler);
}

async function overrideProductList(page, apiPath, data) {
  const pattern = new RegExp(`^${escapeRegExp(API_URL + apiPath)}(?:\\?.*)?$`, "i");
  const handler = async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const response = await route.fetch({ maxRetries: 1 });
    const payload = await response.json();
    assert(response.ok(), `${apiPath} override returned ${response.status()}.`);
    assert(Array.isArray(payload.data), `${apiPath} override omitted data.`);
    await route.fulfill({
      body: JSON.stringify({
        ...payload,
        data,
        pagination: { ...(payload.pagination ?? {}), total: data.length },
      }),
      response,
    });
  };
  await page.route(pattern, handler);
  return () => page.unroute(pattern, handler);
}

function planningCard(page, id) {
  return page.locator(`[data-testid="planning-snapshot-card"][data-snapshot-id="${id}"]`);
}

function planningReportCard(page, id) {
  return page.locator(`[data-testid="planning-report-draft-card"][data-draft-id="${id}"]`);
}

function reportBucketRow(page, recordId, objectId) {
  const byRecord = page.locator(`[data-testid="report-bucket-item"][data-record-id="${recordId}"]`);
  return byRecord.or(page.locator(`[data-testid="report-bucket-item"][data-object-id="${objectId}"]`)).first();
}

async function planningStatus(page, states) {
  const statuses = page.getByTestId("planning-persistence-status");
  await statuses.first().waitFor({ timeout: 45_000 });
  await poll(async () => (await statuses.evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute("data-state")),
  )).some((state) => state !== null && states.includes(state)));
  for (const requestId of await statuses.evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute("data-request-id")).filter(Boolean),
  )) {
    if (!report.local.request_ids.includes(requestId)) report.local.request_ids.push(requestId);
  }
}

async function planningReportStatus(page, states, recordId = null) {
  const status = page.getByTestId("planning-report-draft-status");
  await status.waitFor({ timeout: 45_000 });
  await poll(async () => {
    const stateMatches = states.includes(await status.getAttribute("data-state"));
    const recordMatches = recordId === null || (await status.getAttribute("data-record-id")) === recordId;
    return stateMatches && recordMatches;
  });
  const requestId = await status.getAttribute("data-request-id");
  if (requestId && !report.local.request_ids.includes(requestId)) report.local.request_ids.push(requestId);
}

async function economicsStatus(page, pattern) {
  const status = page.getByTestId("economic-scenario-status");
  await status.waitFor({ timeout: 45_000 });
  await poll(async () => pattern.test(await status.innerText()));
  const requestId = await status.getAttribute("data-request-id");
  if (requestId) report.local.request_ids.push(requestId);
}

async function productWrite(page, method, pathname, action, timeout = 60_000) {
  const trafficStart = report.local.product_requests.length;
  const [response] = await Promise.all([
    page.waitForResponse(isProductResponse(method, pathname), { timeout }),
    action(),
  ]);
  const payload = await response.json();
  assert(
    response.status() >= 200 && response.status() < 300,
    `${method} ${new URL(response.url()).pathname} returned ${response.status()}: ${JSON.stringify(payload).slice(0, 300)}`,
  );
  assert(payload.request_id, `${method} ${new URL(response.url()).pathname} omitted request_id.`);
  await poll(async () => report.local.product_requests.slice(trafficStart).some((entry) =>
    entry.request_id === payload.request_id,
  ));
  await delay(300);
  const matchingWrites = report.local.product_requests.slice(trafficStart).filter((entry) =>
    entry.method === method &&
    entry.status >= 200 &&
    entry.status < 300 &&
    pathname.test(entry.path),
  );
  registerUnexpectedCreates(matchingWrites);
  assert.equal(
    matchingWrites.length,
    1,
    `${method} ${new URL(response.url()).pathname} produced ${matchingWrites.length} successful writes.`,
  );
  return payload;
}

async function forbidden(route, message) {
  await route.fulfill({
    body: JSON.stringify({
      error: { code: "forbidden", message },
      request_id: `${PREFIX}-forbidden`,
      timestamp: new Date().toISOString(),
    }),
    contentType: "application/json",
    status: 403,
  });
}

async function routeMethodOnce(page, url, method, handler) {
  let handled = false;
  await page.route(url, async (route) => {
    if (handled || route.request().method() !== method) return route.continue();
    handled = true;
    await handler(route);
  });
}

function registerUnexpectedCreates(entries) {
  if (entries.length < 2) return;
  const createKinds = new Map([
    ["/api/v1/ask-cfs/conversations", "ask_cfs"],
    ["/api/v1/economics/scenarios", "economics"],
    ["/api/v1/planning/snapshots", "planning"],
    ["/api/v1/reports", "planning_report"],
    ["/api/v1/reports/bucket", "economics_report_bucket"],
  ]);
  for (const entry of entries) {
    const kind = createKinds.get(entry.path);
    const id = entry.data?.id;
    if (!kind || !id || cleanup.some((item) => item.id === id)) continue;
    remember(kind, entry.path, id);
  }
}

function isProductResponse(method, pathname) {
  return (response) => {
    const url = new URL(response.url());
    return url.origin === API_ORIGIN && response.request().method() === method && pathname.test(url.pathname);
  };
}

function attachDiagnostics(context, mode, { ignoreBlockedApi = false } = {}) {
  const requestMapLifecycle = new WeakMap();
  context.on("request", (request) => {
    const url = new URL(request.url());
    const page = requestPage(request);
    const approvedPublicArcgis = isApprovedPublicArcgisRequest(
      url,
      OPTIONAL_PUBLIC_MAP_RESOURCES,
      request.headers(),
    );
    const acceptanceGeneration = page
      ? acceptanceLifecycle(page).startedGeneration
      : null;
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
      requestKey: mapDiagnosticRequestKey(
        url,
        OPTIONAL_PUBLIC_MAP_RESOURCES,
        request.method(),
      ),
      sequence,
    });
    if (isRequiredApiWork(url)) {
      const pending = contextPendingRequiredApiRequests.get(context) ?? new Map();
      pending.set(request, {
        acceptanceGeneration,
        method: request.method(),
        navigationEpoch: page ? (pageNavigationEpochs.get(page) ?? 0) : null,
        page,
        requestId: request.headers()["x-request-id"] ?? null,
        responseStatus: null,
        sequence,
        startedAt: new Date().toISOString(),
        url: url.href,
      });
      contextPendingRequiredApiRequests.set(context, pending);
      if (request.method() === "GET" && REQUIRED_HEALTH_PATHS.has(url.pathname)) {
        const lifecycle = {
          acceptance_generation: acceptanceGeneration,
          authorization_role: page ? (pageAuthorizationRoles.get(page) ?? null) : null,
          endpoint: url.pathname,
          fetch_started_at: new Date().toISOString(),
          mode,
          navigation_epoch: page ? (pageNavigationEpochs.get(page) ?? 0) : null,
          page_url: page ? redactMapDiagnosticUrl(page.url()) : null,
          request_id: request.headers()["x-request-id"] ?? null,
          request_sequence: sequence,
        };
        healthRequestLifecycles.set(request, lifecycle);
        report.diagnostics.health_request_lifecycle.push(lifecycle);
      }
    }
    if (
      isExternalArcgisRequest(url, { apiOrigin: API_ORIGIN, appOrigin: LOCAL_ORIGIN }) &&
      !approvedPublicArcgis
    ) {
      report.diagnostics.unexpected_external_arcgis_requests.push(
        `${mode}: ${redactMapDiagnosticUrl(url)}`,
      );
      recordDirectEvidence(
        page,
        acceptanceGeneration,
        "privateArcgisRequests",
      );
    }
  });
  context.on("requestfailed", (request) => {
    const url = new URL(request.url());
    const error = request.failure()?.errorText ?? "failed";
    const healthLifecycle = healthRequestLifecycles.get(request);
    if (healthLifecycle) {
      healthLifecycle.failure = redactMapDiagnosticText(error);
      healthLifecycle.request_failed_at = new Date().toISOString();
    }
    const observation = requestMapLifecycle.get(request);
    const page = observation?.page ?? requestPage(request);
    contextPendingRequiredApiRequests.get(context)?.delete(request);
    if (ignoreBlockedApi && (url.origin === API_ORIGIN || url.pathname.startsWith("/api/v1/"))) return;
    if (
      !isMapDiagnosticRequest(url, {
        apiOrigin: API_ORIGIN,
        appOrigin: LOCAL_ORIGIN,
        resources: OPTIONAL_PUBLIC_MAP_RESOURCES,
      })
    ) {
      if (
        ["GET", "HEAD"].includes(request.method()) &&
        error === "net::ERR_ABORTED" &&
        /\.(?:pptx|xlsx)$/i.test(url.pathname)
      ) {
        return;
      }
      report.diagnostics.request_failures.push(
        `${mode}: ${redactMapDiagnosticText(error)} ${redactMapDiagnosticUrl(url)}`,
      );
      return;
    }
    const diagnostic = classifyArcGISRequestFailure(
      { error, headers: request.headers(), method: request.method(), url: url.href },
      {
        apiOrigin: API_ORIGIN,
        appOrigin: LOCAL_ORIGIN,
        resources: OPTIONAL_PUBLIC_MAP_RESOURCES,
      },
    );
    if (
      ["optional_public_basemap_candidate", "required_request_cancellation_candidate"].includes(
        diagnostic.classification,
      )
    ) {
      if (page) {
        observeMapDiagnostic(diagnostic, {
          mode,
          observation,
          page,
          source: "requestfailed",
        });
      }
      else {
        const result = {
          ...resolveMapDiagnostic(diagnostic, { health: {}, lifecycle: "unknown" }),
          mode,
          source: "requestfailed",
        };
        report.diagnostics.map_diagnostics.push(result);
        if (result.fatal) requiredRequestFailureEvidence.push(result);
        report.diagnostics.request_failures.push(
          `${mode}: map diagnostic had no authoritative page for fallback health: ${redactMapDiagnosticUrl(url)}`,
        );
      }
      return;
    }
    if (diagnostic.fatal === false) {
      report.diagnostics.map_diagnostics.push({ ...diagnostic, mode, source: "requestfailed" });
      return;
    }
    report.diagnostics.map_diagnostics.push({ ...diagnostic, mode, source: "requestfailed" });
    requiredRequestFailureEvidence.push(diagnostic);
    recordDirectEvidence(
      page,
      observation?.acceptanceGeneration,
      "requiredRequestFailures",
    );
    report.diagnostics.request_failures.push(
      `${mode}: ${diagnostic.reason} ${diagnostic.error ?? redactMapDiagnosticText(error)} ${redactMapDiagnosticUrl(request.url())}`,
    );
  });
  context.on("requestfinished", (request) => {
    const healthLifecycle = healthRequestLifecycles.get(request);
    if (healthLifecycle) healthLifecycle.request_finished_at = new Date().toISOString();
    contextPendingRequiredApiRequests.get(context)?.delete(request);
  });
  context.on("response", async (response) => {
    const url = new URL(response.url());
    const observation = requestMapLifecycle.get(response.request());
    const healthLifecycle = healthRequestLifecycles.get(response.request());
    const pendingEntry = contextPendingRequiredApiRequests.get(context)?.get(response.request());
    if (pendingEntry) pendingEntry.responseStatus = response.status();
    if (healthLifecycle) {
      healthLifecycle.backend_process_ms = Number(response.headers()["x-cfs-process-time-ms"] ?? NaN);
      healthLifecycle.response_headers_at = new Date().toISOString();
      healthLifecycle.response_request_id = response.headers()["x-request-id"] ?? null;
      healthLifecycle.status = response.status();
    }
    if (url.origin === API_ORIGIN) {
      if (
        healthLifecycle &&
        response.status() >= 400 &&
        !ignoreBlockedApi
      ) {
        const diagnostic = classifyArcGISHttpFailure(
          {
            headers: response.request().headers(),
            method: response.request().method(),
            status: response.status(),
            url: url.href,
          },
          {
            apiOrigin: API_ORIGIN,
            appOrigin: LOCAL_ORIGIN,
            resources: OPTIONAL_PUBLIC_MAP_RESOURCES,
          },
        );
        report.diagnostics.map_diagnostics.push({ ...diagnostic, mode, source: "response" });
        if (diagnostic.fatal) {
          requiredRequestFailureEvidence.push(diagnostic);
          recordDirectEvidence(
            observation?.page ?? requestPage(response.request()),
            observation?.acceptanceGeneration,
            "requiredRequestFailures",
          );
          report.diagnostics.request_failures.push(
            `${mode}: ${diagnostic.reason} HTTP ${response.status()} ${redactMapDiagnosticUrl(url)}`,
          );
        }
        healthLifecycle.fatal_classified_at = new Date().toISOString();
      }
      const completionError = await response.finished().catch((error) => error);
      if (healthLifecycle) {
        healthLifecycle.body_completed_at = completionError ? null : new Date().toISOString();
        healthLifecycle.body_error = completionError ? redactMapDiagnosticText(String(completionError)) : null;
      }
      if (
        !completionError &&
        response.status() >= 200 &&
        response.status() < 300 &&
        healthLifecycle &&
        observation?.page &&
        observation.navigationEpoch !== null
      ) {
        const byEpoch = pageSuccessfulHealthPathsByEpoch.get(observation.page) ?? new Map();
        const paths = byEpoch.get(observation.navigationEpoch) ?? new Set();
        paths.add(url.pathname);
        byEpoch.set(observation.navigationEpoch, paths);
        pageSuccessfulHealthPathsByEpoch.set(observation.page, byEpoch);
      }
      if (!completionError) contextPendingRequiredApiRequests.get(context)?.delete(response.request());
    }
    if (response.status() >= 200 && response.status() < 300 && observation?.page && observation.requestKey) {
      const successes = pageSuccessfulRequestKeys.get(observation.page) ?? new Map();
      successes.set(
        observation.requestKey,
        Math.max(successes.get(observation.requestKey) ?? 0, observation.sequence),
      );
      pageSuccessfulRequestKeys.set(observation.page, successes);
    }
    let expectedProductFailure = false;
    if (
      (mode === "local" || mode.startsWith("authorization-")) &&
      url.origin === API_ORIGIN &&
      url.pathname.startsWith("/api/v1/")
    ) {
      const entry = {
        method: response.request().method(),
        path: url.pathname,
        request_id: response.headers()["x-request-id"] ?? null,
        status: response.status(),
      };
      try {
        const payload = await response.json();
        entry.data = payload.data;
        entry.request_id = payload.request_id ?? entry.request_id;
      } catch {
        // Diagnostics retain HTTP metadata when a response body is unavailable.
      }
      report.local.product_requests.push(entry);
      expectedProductFailure = isExpectedProductFailure(entry);
      if (response.status() >= 400 && !expectedProductFailure) {
        report.diagnostics.api_failures.push(`${entry.status} ${entry.method} ${entry.path}`);
        recordDirectEvidence(
          observation?.page ?? requestPage(response.request()),
          observation?.acceptanceGeneration,
          "apiFailures",
        );
      }
    }
    if (
      response.status() >= 400 &&
      !healthLifecycle?.fatal_classified_at &&
      !expectedProductFailure &&
      !ignoreBlockedApi &&
      isMapDiagnosticRequest(url, {
        apiOrigin: API_ORIGIN,
        appOrigin: LOCAL_ORIGIN,
        resources: OPTIONAL_PUBLIC_MAP_RESOURCES,
      })
    ) {
      const diagnostic = classifyArcGISHttpFailure(
        {
          headers: response.request().headers(),
          method: response.request().method(),
          status: response.status(),
          url: url.href,
        },
        {
          apiOrigin: API_ORIGIN,
          appOrigin: LOCAL_ORIGIN,
          resources: OPTIONAL_PUBLIC_MAP_RESOURCES,
        },
      );
      if (diagnostic.classification === "optional_public_basemap_candidate" && observation?.page) {
        observeMapDiagnostic(diagnostic, {
          mode,
          observation,
          page: observation.page,
          source: "response",
        });
      } else {
        report.diagnostics.map_diagnostics.push({ ...diagnostic, mode, source: "response" });
        if (diagnostic.fatal) {
          requiredRequestFailureEvidence.push(diagnostic);
          recordDirectEvidence(
            observation?.page ?? requestPage(response.request()),
            observation?.acceptanceGeneration,
            "requiredRequestFailures",
          );
          report.diagnostics.request_failures.push(
            `${mode}: ${diagnostic.reason} HTTP ${response.status()} ${redactMapDiagnosticUrl(url)}`,
          );
        }
      }
    }
  });
  context.on("page", (page) => {
    acceptanceLifecycle(page);
    pageNavigationEpochs.set(page, 0);
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) {
        pageNavigationEpochs.set(page, (pageNavigationEpochs.get(page) ?? 0) + 1);
      }
    });
    page.on("pageerror", (error) => {
      const diagnostic = classifyPageError(error);
      report.diagnostics.map_diagnostics.push({
        ...diagnostic,
        mode,
        page_url: redactMapDiagnosticUrl(page.url()),
      });
      report.diagnostics.page_errors.push(`${mode}: ${diagnostic.message}`);
      recordDirectEvidence(
        page,
        acceptanceLifecycle(page).startedGeneration,
        "pageErrors",
      );
    });
    page.on("console", (message) => {
      if (!['error', 'warning'].includes(message.type())) return;
      const text = message.text();
      if (/GL Driver Message.*GPU stall|Font .* is not available/.test(text)) return;
      if (
        ignoreBlockedApi &&
        /ERR_BLOCKED_BY_CLIENT/.test(text) &&
        (message.location().url.startsWith(`${API_ORIGIN}/`) ||
          message.location().url.includes("/api/v1/"))
      ) {
        return;
      }
      const diagnostic = classifyArcGISConsoleFailure({
        locationUrl: message.location().url,
        text,
      }, {
        apiOrigin: API_ORIGIN,
        appOrigin: LOCAL_ORIGIN,
        resources: OPTIONAL_PUBLIC_MAP_RESOURCES,
      });
      if (diagnostic.classification === "optional_public_basemap_candidate") {
        observeMapDiagnostic(diagnostic, { mode, page, source: "console" });
        return;
      }
      if (diagnostic.fatal === false) {
        report.diagnostics.map_diagnostics.push({
          ...diagnostic,
          mode,
          page_url: redactMapDiagnosticUrl(page.url()),
          source: "console",
        });
        return;
      }
      const consoleEntry =
        `${mode}: ${message.type()}: ${diagnostic.message ?? "[diagnostic redacted]"} (${diagnostic.reason})`;
      const record = {
        ...diagnostic,
        console_entry: consoleEntry,
        mode,
        page_url: redactMapDiagnosticUrl(page.url()),
        source: "console",
      };
      report.diagnostics.map_diagnostics.push(record);
      report.diagnostics.console.push(consoleEntry);
      recordDiagnosticDirectEvidence(
        record,
        page,
        acceptanceLifecycle(page).startedGeneration,
        "consoleErrors",
      );
    });
  });
}

function observeMapDiagnostic(diagnostic, { mode, observation = null, page, source }) {
  const record = {
    ...diagnostic,
    mode,
    navigation_epoch:
      observation?.navigationEpoch ?? (page ? (pageNavigationEpochs.get(page) ?? 0) : null),
    page_url:
      observation?.pageUrl ?? (page ? redactMapDiagnosticUrl(page.url()) : null),
    source,
  };
  report.diagnostics.map_diagnostics.push(record);
  pendingMapDiagnostics.push({
    acceptanceGeneration:
      observation?.acceptanceGeneration ?? acceptanceLifecycle(page).startedGeneration,
    acceptanceTeardownStarted: acceptedTeardownPages.has(page),
    failureGeneration: acceptanceLifecycle(page).startedGeneration,
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

async function resolveMapDiagnosticsForPage(page) {
  reconcileExpectedConsoleErrors();
  const pending = pendingMapDiagnostics
    .filter((entry) => !entry.resolved && entry.page === page);
  if (!pending.length) return;
  const cachedHealth = lastMapHealthByPage.get(page);
  const currentHealth =
    !page.isClosed() && (await page.getByTestId("cfs-arcgis-map").count())
      ? await readRequiredMapHealth(page)
      : null;
  const currentEpoch = pageNavigationEpochs.get(page) ?? 0;
  const lifecycle = acceptanceLifecycle(page);
  const baseHealth = currentHealth ?? cachedHealth;
  const directEvidence = Object.freeze(directEvidenceForPage(page));
  const baseEvidence = baseHealth ? { ...baseHealth, ...directEvidence } : directEvidence;
  const required = pending.filter(
    (entry) => entry.record.classification === "required_request_cancellation_candidate",
  );
  const requiredSet = new Set(required);
  const optional = pending.filter((entry) => !requiredSet.has(entry));

  async function resolveEntry(entry, evidence) {
    const observedAttempt = await entry.observedAttempt;
    const navigationStale = entry.record.navigation_epoch !== currentEpoch;
    const crossedAcceptedNavigation =
      navigationStale &&
      entry.acceptanceGeneration < lifecycle.provenGeneration;
    const transitionGeneration = crossedAcceptedNavigation
      ? lifecycle.provenGeneration
      : entry.failureGeneration;
    const acceptanceTransitionSucceeded =
      entry.acceptanceGeneration < transitionGeneration &&
      transitionGeneration <= lifecycle.provenGeneration;
    const stale =
      acceptanceTransitionSucceeded ||
      navigationStale ||
      (observedAttempt &&
        (currentHealth?.initializationAttempt ?? cachedHealth?.initializationAttempt) &&
        observedAttempt !==
          (currentHealth?.initializationAttempt ?? cachedHealth?.initializationAttempt));
    const health = currentHealth ?? (page.isClosed() || stale ? cachedHealth : null);
    const currentEvidence = health ? { ...health, ...evidence } : evidence;
    const successfulSequence = entry.requestKey
      ? pageSuccessfulRequestKeys.get(page)?.get(entry.requestKey) ?? 0
      : 0;
    const acceptanceTeardownSucceeded =
      page.isClosed() && entry.acceptanceTeardownStarted;
    const replacementSucceeded =
      entry.requestSequence !== null && successfulSequence > entry.requestSequence;
    if (
      entry.record.classification === "required_request_cancellation_candidate" &&
      !page.isClosed() &&
      !acceptanceTransitionSucceeded &&
      !replacementSucceeded &&
      !(stale && entry.record.stale_lifecycle_eligible === true)
    ) {
      return null;
    }
    Object.assign(entry.record, {
      acceptance_failure_generation: entry.failureGeneration,
      acceptance_observed_generation: entry.acceptanceGeneration,
      acceptance_proven_generation: lifecycle.provenGeneration,
      acceptance_teardown_succeeded: acceptanceTeardownSucceeded,
      acceptance_transition_succeeded:
        acceptanceTransitionSucceeded || acceptanceTeardownSucceeded,
      replacement_succeeded: replacementSucceeded,
    });
    const result = resolveMapDiagnostic(entry.record, {
      health: currentEvidence,
      lifecycle: page.isClosed()
        ? stale
          ? "destroyed"
          : "acceptance_teardown"
        : stale
          ? "stale"
          : "current",
    });
    Object.assign(entry.record, result, {
      current_attempt: currentEvidence.initializationAttempt ?? null,
      observed_attempt: observedAttempt,
    });
    return result;
  }

  const results = new Map();
  for (const entry of required) {
    results.set(entry, await resolveEntry(entry, baseEvidence));
  }
  const independentlyFatalRequired = required.filter((entry) => {
    const result = results.get(entry);
    return Boolean(
      result?.fatal &&
      entry.record.acceptance_teardown_succeeded !== true &&
      entry.record.acceptance_transition_succeeded !== true &&
      entry.record.replacement_succeeded !== true
    );
  });
  const optionalEvidence = Object.freeze({
    ...baseEvidence,
    requiredRequestFailures:
      Number(baseEvidence.requiredRequestFailures ?? 0) +
      independentlyFatalRequired.length,
  });
  if (![...results.values()].some((result) => result === null)) {
    for (const entry of optional) {
      results.set(entry, await resolveEntry(entry, optionalEvidence));
    }
  }

  for (const entry of pending) {
    const result = results.get(entry);
    if (!result) continue;
    entry.resolved = true;
    if (requiredSet.has(entry) && result.fatal) {
      if (independentlyFatalRequired.includes(entry)) {
        requiredRequestFailureEvidence.push(result);
        recordDirectEvidence(
          page,
          entry.acceptanceGeneration,
          "requiredRequestFailures",
        );
      }
      report.diagnostics.request_failures.push(
        `${entry.record.mode}: ${entry.record.page_url} :: ${result.reason}`,
      );
    }
    if (!requiredSet.has(entry)) {
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

function acceptanceLifecycle(page) {
  let lifecycle = pageAcceptanceLifecycles.get(page);
  if (!lifecycle) {
    lifecycle = { provenGeneration: 0, startedGeneration: 0 };
    pageAcceptanceLifecycles.set(page, lifecycle);
  }
  return lifecycle;
}

function beginAcceptanceTransition(page) {
  const lifecycle = acceptanceLifecycle(page);
  lifecycle.startedGeneration += 1;
  return lifecycle.startedGeneration;
}

function proveAcceptanceTransition(page, generation) {
  const lifecycle = acceptanceLifecycle(page);
  assert.equal(
    lifecycle.startedGeneration,
    generation,
    "Acceptance navigation generations overlapped before destination proof.",
  );
  lifecycle.provenGeneration = generation;
  reconcileSupersededRequiredApiRequests(page);
}

async function cacheMapHealthBeforeTeardown(page) {
  if (
    !page.isClosed() &&
    (await page.getByTestId("cfs-arcgis-map").count())
  ) {
    await readRequiredMapHealth(page);
  }
}

async function closeAcceptedPage(page) {
  if (page.isClosed()) return;
  await cacheMapHealthBeforeTeardown(page);
  await waitForRequiredApiDrain(page.context(), "Page teardown");
  acceptedTeardownPages.add(page);
  await page.close();
}

async function closeAcceptedContext(context) {
  const pages = context.pages().filter((page) => !page.isClosed());
  for (const page of pages) await cacheMapHealthBeforeTeardown(page);
  await waitForRequiredApiDrain(context, "Context teardown");
  for (const page of pages) acceptedTeardownPages.add(page);
  try {
    await context.close();
    assert.equal(
      contextPendingRequiredApiRequests.get(context)?.size ?? 0,
      0,
      "Context close left required API requests without a terminal event.",
    );
  } finally {
    contextPendingRequiredApiRequests.delete(context);
  }
}

async function assertOptionalPublicBasemapFallback(context) {
  const observed =
    FORCE_OPTIONAL_BASEMAP_FAILURE ||
    report.diagnostics.optional_public_basemap_failures.length > 0 ||
    report.diagnostics.optional_public_basemap_console.length > 0 ||
    pendingMapDiagnostics.some((entry) => !entry.resolved);
  if (!observed) return;

  const page = await context.newPage();
  try {
    await goto(page, LOCAL_URL, "?app=planning");
    const map = page.getByTestId("cfs-arcgis-map");
    await map.waitFor({ timeout: 60_000 });
    await page.waitForFunction(() => {
      const element = document.querySelector('[data-testid="cfs-arcgis-map"]');
      return (
        element?.getAttribute("data-static-context-ready") === "true" &&
        element.getAttribute("data-context-ready") === "true" &&
        element.getAttribute("data-map-renderer") === "interactive" &&
        element.getAttribute("data-map-renderer-state") === "interactive_ready" &&
        element.getAttribute("data-map-view-ready-state") === "ready"
      );
    });
    if (FORCE_OPTIONAL_BASEMAP_FAILURE) {
      await page.evaluate(async (urls) => {
        await Promise.all(urls.map((url) => fetch(url).catch(() => undefined)));
      }, OPTIONAL_BASEMAP_FAILURE_TEST_URLS);
      await resolveMapDiagnosticsForPage(page);
      await poll(async () =>
        OPTIONAL_BASEMAP_FAILURE_TEST_URLS.every((url) =>
          report.diagnostics.optional_public_basemap_failures.some(
            (failure) => failure.url === redactMapDiagnosticUrl(url),
          ),
        ),
      );
    }
    const contextState = await page.evaluate(() => {
      const element = document.querySelector('[data-testid="cfs-arcgis-map"]');
      return {
        attribution: element?.getAttribute("data-basemap-attribution"),
        basemapMode: element?.getAttribute("data-basemap-mode"),
        countyFeatures: Number(element?.getAttribute("data-context-county-features")),
        debug: window.__cfsGetMapDebugState?.(),
        labelFeatures: Number(element?.getAttribute("data-context-label-features")),
        provider: element?.getAttribute("data-basemap-provider"),
        referenceBasemapState: element?.getAttribute("data-reference-basemap-state"),
        roadFeatures: Number(element?.getAttribute("data-context-road-features")),
        urlTemplate: element?.getAttribute("data-basemap-url-template"),
      };
    });
    const publicBasemap = OPTIONAL_PUBLIC_MAP_RESOURCES[0];
    assert.equal(contextState.provider, publicBasemap.provider);
    assert.equal(contextState.urlTemplate, publicBasemap.urlTemplate);
    assert.equal(contextState.attribution, publicBasemap.attribution);
    assert.equal(contextState.debug?.ready, true, "MapView is not ready after the optional basemap failure.");
    assert.equal(contextState.debug?.readyState, "ready", "MapView readyState is not ready.");
    assert.equal(contextState.debug?.basemapId, "cfs-same-origin-basemap");
    assert(contextState.countyFeatures > 0, "Same-origin county context is empty.");
    assert(contextState.roadFeatures > 0, "Same-origin street context is empty.");
    assert(contextState.labelFeatures > 0, "Same-origin place labels are empty.");
    for (const layerId of [
      "county-boundary",
      "cfs-local-hydrography",
      "cfs-local-municipalities",
      "transportation-context",
    ]) {
      const layer = contextState.debug?.layers?.find((candidate) => candidate.id === layerId);
      assert(layer?.visible && Number(layer.graphicsCount) > 0, `Required same-origin layer ${layerId} is unavailable.`);
    }
    if (contextState.referenceBasemapState === "failed") {
      assert.equal(contextState.basemapMode, "same-origin");
      const labels = contextState.debug?.layers?.find((candidate) => candidate.id === "cfs-local-place-labels");
      assert(labels?.visible && Number(labels.graphicsCount) > 0, "Fallback local labels are unavailable.");
      await page.getByTestId("cfs-reference-basemap-warning").waitFor();
    }

    const controls = page.getByRole("button", { name: /Open .* controls/i });
    await controls.click();
    const runtime = page.getByTestId("local-runtime-status");
    await runtime.getByText("Frontend Ready", { exact: true }).waitFor();
    await page.getByTestId("local-runtime-api").getByText("Ready", { exact: true }).waitFor();
    await page.getByTestId("local-runtime-database").getByText("Connected", { exact: true }).waitFor();
    await controls.click();

    const parcelId = "CFS-PARCEL-0149726579";
    const beforeExtent = await map.getAttribute("data-map-extent");
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
    const payload = await response.json();
    assert(
      payload.results?.some((record) => record.official_parcel_id === parcelId),
      `Parcel search response omitted ${parcelId}.`,
    );
    const option = page
      .locator("#top-parcel-search-results")
      .getByRole("option")
      .filter({ hasText: parcelId })
      .first();
    await option.waitFor({ timeout: 30_000 });
    const parcelSelectionGeneration = beginAcceptanceTransition(page);
    await option.click();
    await page.getByText(parcelId, { exact: true }).first().waitFor();
    await page.waitForFunction(
      (extent) => {
        const element = document.querySelector('[data-testid="cfs-arcgis-map"]');
        return (
          element?.getAttribute("data-map-extent") !== extent &&
          Number(element?.getAttribute("data-map-zoom")) > 9
        );
      },
      beforeExtent,
    );
    await waitForRequiredApiDrain(page.context(), "Parcel selection");
    proveAcceptanceTransition(page, parcelSelectionGeneration);
    await page.getByTestId("command-center-explore-intelligence").click();
    const expand = page.getByRole("button", { name: "Expand map layers panel", exact: true });
    if ((await expand.count()) && (await expand.isVisible())) await expand.click();
    const parcelCard = page
      .locator("article")
      .filter({ has: page.getByText("Parcel Intelligence", { exact: true }) })
      .first();
    if (!(await parcelCard.isVisible())) {
      await page
        .locator("details")
        .filter({ has: page.getByText("Planning", { exact: true }) })
        .first()
        .locator("summary")
        .click();
    }
    const showParcels = parcelCard.getByRole("button", {
      name: "Show Parcel Intelligence",
      exact: true,
    });
    if (await showParcels.count()) await showParcels.click();
    await page.waitForFunction(() =>
      (window.__cfsGetMapDebugState?.().layers ?? []).some(
        (layer) => layer.id === "parcel-intelligence" && layer.visible && Number(layer.graphicsCount) > 0,
      ),
    );

    const beforeZoom = Number(await map.getAttribute("data-map-zoom"));
    const zoomIn = page.getByRole("button", { name: "Zoom in" });
    await zoomIn.waitFor();
    assert(!(await zoomIn.isDisabled()), "Map zoom control is disabled.");
    await zoomIn.click();
    await page.waitForFunction(
      (zoom) => Number(document.querySelector('[data-testid="cfs-arcgis-map"]')?.getAttribute("data-map-zoom")) > zoom,
      beforeZoom,
    );
    const reset = page.getByRole("button", { name: "Reset to Cabarrus County" });
    assert(!(await reset.isDisabled()), "Map reset control is disabled.");
    await reset.click();
    assert.equal(
      await page.getByText(/Sign in to ArcGIS|ArcGIS organizational account/i).count(),
      0,
      "ArcGIS sign-in UI appeared.",
    );
    assert.deepEqual(
      report.diagnostics.unexpected_external_arcgis_requests,
      [],
      "Fallback proof observed a private Portal, OAuth, or unexpected external ArcGIS request.",
    );
    report.optional_public_basemap_verification = {
      classification: "optional_public_basemap_failure",
      context_layers: [
        "county-boundary",
        "cfs-local-hydrography",
        "cfs-local-municipalities",
        "transportation-context",
      ],
      map_renderer: "interactive",
      parcel_focus: parcelId,
      fallback_healthy: true,
      status: "PASS",
    };
  } finally {
    await closeAcceptedPage(page);
  }
}

function isExpectedProductFailure(entry) {
  return (
    (entry.status === 403 && entry.request_id === `${PREFIX}-forbidden`) ||
    (entry.status === 409 && entry.request_id === `${PREFIX}-conflict`)
  );
}

function reconcileExpectedConsoleErrors() {
  const allowances = new Map();
  for (const entry of report.local.product_requests) {
    if (!isExpectedProductFailure(entry)) continue;
    allowances.set(entry.status, (allowances.get(entry.status) ?? 0) + 1);
  }
  for (const message of report.diagnostics.expected_console) {
    const status = Number(/server responded with a status of (403|409)/i.exec(message)?.[1]);
    if (!status) continue;
    allowances.set(status, Math.max(0, (allowances.get(status) ?? 0) - 1));
  }
  report.diagnostics.console = report.diagnostics.console.filter((message) => {
    const status = Number(/server responded with a status of (403|409)/i.exec(message)?.[1]);
    const remaining = allowances.get(status) ?? 0;
    if (!remaining) return true;
    allowances.set(status, remaining - 1);
    report.diagnostics.expected_console.push(message);
    const diagnostic = report.diagnostics.map_diagnostics.find(
      (candidate) => candidate.fatal === true && candidate.console_entry === message,
    );
    if (diagnostic) {
      reconcileDiagnosticDirectEvidence(diagnostic);
      Object.assign(diagnostic, {
        classification: "expected_product_console_failure",
        fatal: false,
        reason: `Expected Product V1 HTTP ${status} console evidence was reconciled to its accepted response.`,
      });
    }
    return false;
  });
}

async function waitForProductTraffic(start, predicate, minimum = 1) {
  await poll(
    async () => report.local.product_requests.slice(start).filter(predicate).length >= minimum,
    60_000,
  );
}

async function goto(page, baseUrl, query, demo = false) {
  await waitForRequiredApiDrain(page.context(), "Navigation");
  const generation = beginAcceptanceTransition(page);
  await page.goto(`${baseUrl}/${query}`, { waitUntil: "domcontentloaded" });
  await waitForLoadedPage(page);
  await page.getByRole("button", { name: "Return to CFS Home" }).waitFor({ timeout: 60_000 });
  if (demo) await page.waitForFunction(() => document.body.textContent?.includes("Portfolio Demo"));
  const text = await page.locator("body").innerText();
  assert(!/Application error|Internal Server Error|Unhandled Runtime Error/i.test(text));
  proveAcceptanceTransition(page, generation);
  if (new URL(`${baseUrl}/${query}`).searchParams.get("app") === "planning") {
    await settlePlanningMapDiagnostics(page);
  }
}

async function gotoDataAdministration(page) {
  await waitForRequiredApiDrain(page.context(), "Data-administration navigation");
  const generation = beginAcceptanceTransition(page);
  await page.goto(`${LOCAL_URL}/data-administration`, { waitUntil: "domcontentloaded" });
  const summary = page.getByTestId("data-administration-summary");
  await page.waitForFunction(
    () =>
      Boolean(document.querySelector('[data-testid="data-administration-summary"]')) ||
      [...document.querySelectorAll("h2")].some(
        (heading) => heading.textContent?.trim() === "Status unavailable",
      ),
    null,
    { timeout: 90_000 },
  );
  if (!(await summary.isVisible())) {
    const errorPanel = page
      .getByRole("heading", { name: "Status unavailable", exact: true })
      .locator("xpath=ancestor::section[1]");
    throw new Error(`Data-administration status failed: ${await errorPanel.innerText()}`);
  }
  proveAcceptanceTransition(page, generation);
}

async function settlePlanningMapDiagnostics(page) {
  await page.waitForFunction(
    () => {
      const map = document.querySelector('[data-testid="cfs-arcgis-map"]');
      return (
        map?.getAttribute("data-map-renderer") === "interactive" &&
        map.getAttribute("data-map-renderer-state") === "interactive_ready" &&
        map.getAttribute("data-map-view-ready-state") === "ready"
      );
    },
    null,
    { timeout: 90_000 },
  );
  await delay(50);
  await waitForRequiredApiDrain(page.context(), "Planning startup");
  await readRequiredMapHealth(page);
  await resolveMapDiagnosticsForPage(page);
}

async function waitForLoadedPage(page) {
  await page.waitForLoadState("load", { timeout: 60_000 });
  await page.evaluate(() => new Promise(requestAnimationFrame));
}

async function reloadPage(page) {
  await waitForRequiredApiDrain(page.context(), "Reload");
  const generation = beginAcceptanceTransition(page);
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForLoadedPage(page);
  await page.getByRole("button", { name: "Return to CFS Home" }).waitFor({ timeout: 60_000 });
  const text = await page.locator("body").innerText();
  assert(!/Application error|Internal Server Error|Unhandled Runtime Error/i.test(text));
  proveAcceptanceTransition(page, generation);
  if (new URL(page.url()).searchParams.get("app") === "planning") {
    await settlePlanningMapDiagnostics(page);
  }
}

async function readApi(resourcePath) {
  const response = await fetch(new URL(resourcePath, API_URL), {
    headers: { Accept: "application/json", "X-Request-ID": `${PREFIX}-read` },
    signal: AbortSignal.timeout(30_000),
  });
  const payload = await response.json();
  assert(response.ok, `GET ${resourcePath} returned ${response.status}: ${JSON.stringify(payload).slice(0, 300)}`);
  assert(payload.request_id, `GET ${resourcePath} omitted request_id.`);
  return payload.data;
}

function productId(payload, label) {
  assert.match(payload.data?.id ?? "", /^[0-9a-f-]{36}$/i, `${label} omitted a UUID id.`);
  return payload.data.id;
}

function remember(kind, apiPath, id) {
  report.disposable_records.push({
    api_path: apiPath,
    expected_archived: kind === "ask_cfs" ? 0 : 1,
    expected_child_rows: kind === "ask_cfs" ? 0 : null,
    expected_fields: {},
    id,
    kind,
    minimum_child_rows: ["planning", "economics"].includes(kind) ? 1 : null,
  });
  cleanup.push({ apiPath, id, kind, cleaned: false });
}

function acceptanceOwnedIds() {
  const owned = {
    planning: [],
    economics: [],
    report_bucket: [],
    ask_cfs: [],
  };
  for (const record of report.disposable_records) {
    const kind =
      record.kind === "planning"
        ? "planning"
        : record.kind === "economics"
          ? "economics"
          : record.kind.endsWith("report_bucket")
            ? "report_bucket"
            : record.kind === "ask_cfs"
              ? "ask_cfs"
              : null;
    if (kind && !owned[kind].includes(record.id)) owned[kind].push(record.id);
  }
  return owned;
}

function expectPersistedFields(id, expectedFields) {
  const record = report.disposable_records.find((candidate) => candidate.id === id);
  assert(record, `Cannot attach database expectations to unknown record ${id}.`);
  Object.assign(record.expected_fields, expectedFields);
}

function expectChildRows(id, count) {
  const record = report.disposable_records.find((candidate) => candidate.id === id);
  if (record) record.minimum_child_rows = count;
}

function markClean(id, method) {
  const item = cleanup.find((candidate) => candidate.id === id);
  if (item) item.cleaned = true;
  report.cleanup.push({ id, method, status: "PASS" });
}

async function fallbackCleanup() {
  for (const item of [...cleanup].reverse()) {
    if (item.cleaned) continue;
    const response = await fetch(`${API_URL}${item.apiPath}/${encodeURIComponent(item.id)}/archive`, {
      headers: { Accept: "application/json", "X-Request-ID": `${PREFIX}-cleanup` },
      method: "POST",
      signal: AbortSignal.timeout(30_000),
    });
    if (![200, 404].includes(response.status)) {
      throw new Error(`Fallback cleanup failed for ${item.kind} ${item.id}: HTTP ${response.status}`);
    }
    item.cleaned = true;
    report.cleanup.push({ fallback: true, id: item.id, method: "api_archive", status: "PASS" });
  }
}

function verifyDatabaseRecords(records = report.disposable_records) {
  const code = String.raw`
import json, sys
from sqlalchemy import text
from app.database import get_engine

records = json.loads(sys.argv[1])
tables = {
    "planning": ("planning_snapshots", "planning_snapshot_versions", "snapshot_id", "created_by"),
    "planning_report": ("reports", None, None, "created_by"),
    "economics": ("economic_scenarios", "economic_scenario_versions", "scenario_id", "created_by"),
    "economics_report_bucket": ("report_bucket_items", None, None, "created_by"),
    "ask_cfs": ("ask_cfs_conversations", "ask_cfs_messages", "conversation_id", "user_id"),
}

def nested(value, field):
    for segment in field.split("."):
        if not isinstance(value, dict) or segment not in value:
            return None
        value = value[segment]
    return value

result = []
with get_engine().connect() as connection:
    transaction = connection.begin()
    connection.execute(text("SET TRANSACTION READ ONLY"))
    for record in records:
        kind = record["kind"]
        identifier = record["id"]
        table, child, parent, owner = tables[kind]
        row = connection.execute(
            text(f"""
                SELECT count(*) AS rows,
                       count(*) FILTER (WHERE archived_at IS NOT NULL) AS archived,
                       min(organization_id) AS organization_id,
                       min({owner}) AS owner_id,
                       min(created_at) AS created_at,
                       max(updated_at) AS updated_at,
                       (jsonb_agg(to_jsonb(resource) ORDER BY resource.created_at)->0) AS record_data
                  FROM {table} AS resource
                 WHERE resource.id = :id
            """),
            {"id": identifier},
        ).mappings().one()
        evidence = {
            "rows": int(row["rows"]),
            "archived": int(row["archived"]),
            "organization_id": row["organization_id"],
            "owner_id": row["owner_id"],
            "created_at": row["created_at"].isoformat() if row["created_at"] else None,
            "updated_at": row["updated_at"].isoformat() if row["updated_at"] else None,
        }
        row_json = row["record_data"] or {}
        evidence["expected_fields"] = {}
        for field, expected in record.get("expected_fields", {}).items():
            actual = nested(row_json, field)
            if actual != expected:
                raise AssertionError(f"{kind} {identifier} field {field}: expected {expected!r}, got {actual!r}")
            evidence["expected_fields"][field] = actual
        if child:
            evidence["child_rows"] = int(connection.execute(
                text(f"SELECT count(*) FROM {child} WHERE {parent} = :id"), {"id": identifier}
            ).scalar_one())
        evidence["audit_rows"] = int(connection.execute(
            text("SELECT count(*) FROM audit_events WHERE object_id = :id"), {"id": identifier}
        ).scalar_one())
        result.append({"id": identifier, "kind": kind, **evidence})
    transaction.rollback()
print(json.dumps(result))
`;
  const result = spawnSync(PYTHON, ["-c", code, JSON.stringify(records)], {
    cwd: path.join(ROOT, "backend"),
    encoding: "utf8",
    env: {
      ...process.env,
      CFS_AUTH_MODE: "local_dev",
      CFS_DATABASE_AUTH_MODE: "password",
      CFS_DATA_PROVIDER: "local_api",
      CFS_RUNTIME_MODE: "local",
      DATABASE_URL: "",
      POSTGRES_DB: process.env.POSTGRES_DB ?? "cfs_dev",
      POSTGRES_HOST: process.env.POSTGRES_HOST ?? "localhost",
      POSTGRES_PORT: process.env.POSTGRES_PORT ?? "5433",
    },
  });
  assert.equal(result.status, 0, `Read-only database verification failed: ${result.stderr}`);
  const evidence = JSON.parse(result.stdout);
  for (const item of evidence) {
    const source = records.find((record) => record.id === item.id);
    assert(source, `Unexpected database evidence for ${item.id}.`);
    assert.equal(item.rows, 1, `${item.kind} database record is missing or duplicated.`);
    assert(item.audit_rows > 0, `${item.kind} audit record is missing.`);
    assert.equal(item.organization_id, report.local.principal.organization_id, `${item.kind} organization scope drifted.`);
    assert.equal(item.owner_id, report.local.principal.user_id, `${item.kind} principal ownership drifted.`);
    assert(Number.isFinite(Date.parse(item.created_at)), `${item.kind} created_at is invalid.`);
    assert(Number.isFinite(Date.parse(item.updated_at)), `${item.kind} updated_at is invalid.`);
    assert(Date.parse(item.updated_at) >= Date.parse(item.created_at), `${item.kind} timestamps are out of order.`);
    assert.deepEqual(item.expected_fields, source.expected_fields, `${item.kind} persisted payload evidence drifted.`);
    if (source.minimum_child_rows !== null) {
      assert(item.child_rows >= source.minimum_child_rows, `${item.kind} version rows are missing.`);
    }
    if (source.expected_archived !== null) {
      assert.equal(item.archived, source.expected_archived, `${item.kind} archive state drifted.`);
    }
    if (source.expected_child_rows !== null) {
      assert.equal(item.child_rows, source.expected_child_rows, `${item.kind} child-row state drifted.`);
    }
  }
  return evidence;
}

async function waitForLocalStack() {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    try {
      const [frontend, backend] = await Promise.all([
        fetch(LOCAL_URL, { signal: AbortSignal.timeout(5_000) }),
        fetch(`${API_URL}/health/ready`, { signal: AbortSignal.timeout(5_000) }),
      ]);
      if (frontend.ok && backend.ok) return;
    } catch {
      // The owned presentation stack is still starting.
    }
    await delay(1_000);
  }
  throw new Error("Local presentation stack did not become ready. Run npm run present:cfs first.");
}

async function waitForProductApi() {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    try {
      const backend = await fetch(`${API_URL}/health/ready`, { signal: AbortSignal.timeout(5_000) });
      if (backend.ok) return;
    } catch {
      // The owned backend is still starting.
    }
    await delay(1_000);
  }
  throw new Error("Product API did not become ready for restart cleanup.");
}

async function startDemoServer() {
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  demoServer = spawn(
    process.execPath,
    [path.join(ROOT, "node_modules", "next", "dist", "bin", "next"), "dev", "-H", "127.0.0.1", "-p", String(port)],
    {
      cwd: ROOT,
      env: {
        ...process.env,
        NEXT_PUBLIC_CFS_AI_PROVIDER: "none",
        NEXT_PUBLIC_CFS_ARTIFACT_PROVIDER: "public_static",
        NEXT_PUBLIC_CFS_AUTH_MODE: "off",
        NEXT_PUBLIC_CFS_DATA_PROVIDER: "static",
        NEXT_PUBLIC_CFS_DEPLOYMENT_MODE: "demo",
        NEXT_PUBLIC_CFS_JOB_PROVIDER: "inline",
        NEXT_PUBLIC_CFS_RUNTIME_MODE: "demo",
        NEXT_PUBLIC_USE_BACKEND_API: "false",
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );
  let output = "";
  demoServer.stdout.on("data", (chunk) => { output += chunk; });
  demoServer.stderr.on("data", (chunk) => { output += chunk; });
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (demoServer.exitCode !== null) throw new Error(`Demo server exited early:\n${output.slice(-2000)}`);
    try {
      const response = await fetch(baseUrl, { signal: AbortSignal.timeout(5_000) });
      if (response.status < 500) return baseUrl;
    } catch {
      // The demo development server is still compiling.
    }
    await delay(1_000);
  }
  throw new Error(`Demo server did not become ready:\n${output.slice(-2000)}`);
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

async function poll(predicate, timeout = 30_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await delay(100);
  }
  throw new Error("Timed out waiting for frontend persistence state.");
}

async function acceptNextDialog(page, action) {
  const dialogPromise = page.waitForEvent("dialog", { timeout: 30_000 });
  const actionPromise = action();
  const dialog = await dialogPromise;
  assert.equal(dialog.type(), "confirm", `Expected a confirm dialog, received ${dialog.type()}.`);
  await dialog.accept();
  await actionPromise;
}

async function runCase(product, name, run) {
  const started = Date.now();
  await run();
  const result = { duration_ms: Date.now() - started, name, product, status: "PASS" };
  report.workflows.push(result);
  console.log(`PASS ${product}: ${name} (${result.duration_ms}ms)`);
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

function assertProtectedArtifacts() {
  for (const [file, expected] of protectedBefore) {
    assert.equal(sha256(file), expected, `Frontend persistence check modified protected artifact ${file}`);
  }
}

function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function git(...args) {
  const result = spawnSync("git", args, { encoding: "utf8" });
  assert.equal(result.status, 0, `git ${args.join(" ")} failed.`);
  return result.stdout.trim();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
