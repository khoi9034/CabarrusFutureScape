import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright-core";

const ROOT = process.cwd();
const BASE_URL = (process.env.CFS_LOCAL_BASE_URL ?? "http://127.0.0.1:3000").replace(
  /\/$/,
  "",
);
const API_URL = (process.env.CFS_API_BASE_URL ?? "http://127.0.0.1:8000").replace(
  /\/$/,
  "",
);
const API_ORIGIN = new URL(API_URL).origin;
const PARCEL = "CFS-PARCEL-0149726579";
const SECOND_PARCEL = "CFS-PARCEL-0149727441";
const TEMP_PREFIX = `CFS-PRESENTATION-BROWSER-${Date.now()}`;
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
  diagnostics: {
    api_failures: [],
    console_messages: [],
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
  disposable_cleanup: null,
};

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

function attachDiagnostics(context, { offline = false } = {}) {
  const requestCounts = new Map();
  if (offline) {
    context.route(/^https?:\/\/(?!(?:127\.0\.0\.1|localhost)(?::\d+)?(?:\/|$))/i, async (route) => {
      const url = route.request().url();
      report.offline.blocked_external_requests.push(url);
      await route.abort("blockedbyclient");
    });
  }

  context.on("request", (request) => {
    const url = request.url();
    if (/\/demo-data\//.test(url)) {
      const pathname = new URL(url).pathname;
      if (LIVE_MAP_CONTEXT_PATHS.has(pathname)) {
        report.map_context_requests.push(url);
      } else {
        report.demo_data_requests.push(url);
      }
    }
    if (/^https?:/i.test(url) && !isLoopback(url)) report.external_requests.push(url);
    if (new URL(url).origin === API_ORIGIN) {
      const key = `${request.method()} ${new URL(url).pathname}`;
      report.api_paths[key] = (report.api_paths[key] ?? 0) + 1;
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
    if (count === 20) report.diagnostics.request_loops.push(url);
  });

  context.on("requestfailed", (request) => {
    if (offline && !isLoopback(request.url())) return;
    if (
      request.method() === "GET" &&
      ["net::ERR_ABORTED", "net::ERR_FAILED"].includes(request.failure()?.errorText)
    ) {
      return;
    }
    report.diagnostics.request_failures.push(
      `${request.failure()?.errorText ?? "failed"} ${request.url()}`,
    );
  });

  context.on("response", (response) => {
    if (new URL(response.url()).origin === API_ORIGIN && response.status() >= 400) {
      report.diagnostics.api_failures.push(
        `${response.status()} ${response.request().method()} ${response.url()}`,
      );
    }
  });

  context.on("page", (page) => {
    page.on("pageerror", (error) => {
      report.diagnostics.page_errors.push(`${page.url()} :: ${error.message}`);
    });
    page.on("console", (message) => {
      if (!["error", "warning"].includes(message.type())) return;
      const text = message.text();
      if (/GL Driver Message.*GPU stall due to ReadPixels/.test(text)) return;
      if (/\[@arcgis\/core\/views\/MapView\] Font .* is not available/.test(text)) return;
      if (offline && /Failed to load resource.*ERR_BLOCKED_BY_CLIENT/.test(text)) return;
      report.diagnostics.console_messages.push(
        `${page.url()} :: ${message.type()}: ${text}`,
      );
    });
  });
}

async function runCase(product, name, run, offline = false) {
  const started = Date.now();
  await run();
  const result = { product, name, response_ms: Date.now() - started };
  (offline ? report.offline.cases : report.cases).push(result);
  console.log(`PASS ${offline ? "Offline " : ""}${product}: ${name} (${result.response_ms}ms)`);
}

async function goto(page, query = "") {
  await page.goto(`${BASE_URL}/${query}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Return to CFS Home" }).waitFor({
    timeout: 45_000,
  });
  await delay(750);
  await assertHealthyPage(page);
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
  await page.getByRole("button", { name: /Open .* controls/i }).click();
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
  await page.getByRole("button", { name: /Open .* controls/i }).click();
}

async function askQuestions(page, questions) {
  for (const question of questions) {
    const textbox = page.getByRole("textbox", { name: "Ask CFS question" }).first();
    await textbox.waitFor({ timeout: 45_000 });
    await textbox.fill(question);
    const panel = textbox.locator("xpath=ancestor::section[1]");
    const [request] = await Promise.all([
      page.waitForRequest(
        (candidate) =>
          new URL(candidate.url()).pathname.replace(/\/$/, "") === "/ai/search" &&
          candidate.method() === "POST",
        { timeout: 30_000 },
      ),
      panel.getByRole("button", { name: "Ask", exact: true }).click(),
    ]);
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
}

async function selectParcel(page, parcelId = PARCEL, waitForSelected = true) {
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
    await selectParcel(page);
    const expand = page.getByRole("button", { name: "Expand map layers panel" });
    if (await expand.count()) await expand.click();
    await toggleLayer(page, "Development Hotspots", "Development Activity");
    await toggleLayer(page, "Floodplain Review", "Floodplain Review");
    await toggleLayer(page, "School Utilization + Permit Pressure", "Schools");
  });

  await runCase("Planning", "Indicator Center and three grounded questions", async () => {
    await page.getByTestId("command-center-indicator-center").click();
    await page.getByTestId("indicator-center-dashboard").waitFor({ timeout: 30_000 });
    await askQuestions(page, [
      "What should I inspect first for this parcel?",
      "What does the flood review indicate?",
      "What does the school-capacity context mean?",
    ]);
    const askPanel = page
      .getByRole("textbox", { name: "Ask CFS question" })
      .first()
      .locator("xpath=ancestor::section[1]");
    await askPanel
      .getByRole("button", { name: "Reset conversation" })
      .click();
    await askPanel
      .getByText("Grounded CFS analysis", { exact: true })
      .waitFor({ state: "hidden" });
  });

  await runCase("Planning", "Model Lab and Planning Snapshot", async () => {
    await page.getByRole("button", { name: /Workspace:/ }).click();
    await page.getByTestId("command-center-model-lab").click();
    const expand = page.getByRole("button", { name: "Expand Model Lab panel" }).first();
    if (await expand.count()) await expand.click();
    await page.getByTestId("model-lab-controls").waitFor({ timeout: 30_000 });
    await page.getByRole("button", { name: /Workspace:/ }).click();
    await page.getByRole("button", { name: "Save Planning Snapshot" }).click();
    await page.getByRole("button", { name: /Planning Snapshot:/ }).click();
    const library = page.getByTestId("planning-snapshot-library");
    await library.getByText("Planning Snapshot Library", { exact: true }).waitFor();
    page.once("dialog", (dialog) => dialog.accept());
    await library.getByRole("button", { name: "Archive", exact: true }).first().click();
    await library
      .getByTestId("planning-persistence-status")
      .filter({ hasText: "Planning Snapshot archived." })
      .waitFor();
  });

  await page.reload({ waitUntil: "domcontentloaded" });
  await assertHealthyPage(page);
  await page.getByRole("button", { name: "Return to CFS Home" }).click();
  await page.getByText("Cabarrus FutureScape", { exact: true }).first().waitFor();
}

async function economicsWorkflow(page) {
  await goto(page, `?app=economics&parcel=${PARCEL}`);
  await runCase("Economics", "database KPIs and parcel context", async () => {
    await page.getByRole("button", { name: /Economic Dashboard:/ }).click();
    await page.getByRole("heading", { name: "Economic Dashboard", exact: true }).first().waitFor({
      timeout: 45_000,
    });
    await page.getByText("Executive Economic Signals", { exact: true }).waitFor();
    await selectParcel(page, SECOND_PARCEL, false);
    const context = page.getByTestId("parcel-economic-context");
    await context
      .getByRole("heading", { name: `Parcel Economic Context: ${SECOND_PARCEL}` })
      .waitFor({ timeout: 30_000 });
    await context.getByText("Assessed value context", { exact: true }).waitFor();
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
    const downloadPromise = page.waitForEvent("download");
    await link.click();
    const download = await downloadPromise;
    const downloadPath = await download.path();
    assert(downloadPath && statSync(downloadPath).size > 20, "Economics export was empty.");
  });

  await runCase("Economics", "three grounded questions", async () => {
    await askQuestions(page, [
      "What does revenue per acre mean?",
      "Why is this parcel classified as underbuilt?",
      "Which values are observed and which are derived?",
    ]);
  });

  await page.reload({ waitUntil: "domcontentloaded" });
  await assertHealthyPage(page);
  await page.getByRole("button", { name: "Return to CFS Home" }).click();
}

async function cleanupIntake(candidateId) {
  const response = await fetch(`${API_URL}/investment/intake/${encodeURIComponent(candidateId)}`, {
    method: "DELETE",
  });
  assert.equal(response.status, 200, "Disposable browser intake cleanup failed.");
  const verify = await fetch(`${API_URL}/investment/intake/${encodeURIComponent(candidateId)}`);
  assert.equal(verify.status, 404, "Disposable browser intake still exists.");
  report.disposable_cleanup = { candidate_id: candidateId, deleted: true, verified: true };
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
    await page.getByRole("button", { name: "Projects", exact: true }).click();
    const library = page.getByLabel("Case Studies library");
    if (await library.count()) {
      await library.getByRole("button", { name: "Continue", exact: true }).first().click();
      await page.getByLabel("Case study workspace").waitFor();
    }
  });

  await runCase("Investments", "Find Sites and Property Review", async () => {
    await page.getByRole("button", { name: "Find Sites", exact: true }).click();
    const responsePromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/investment/radar/search" &&
        response.request().method() === "POST",
      { timeout: 60_000 },
    );
    await page.getByRole("button", { name: "Run Screening", exact: true }).click();
    assert.equal((await responsePromise).status(), 200);
    const review = page.getByRole("button", { name: "Open Property Review" }).first();
    await review.waitFor({ timeout: 30_000 });
    await review.click();
    await page.getByRole("tablist", { name: "Property Research tabs" }).waitFor();
  });

  await runCase("Investments", "safe disposable backend mutation", async () => {
    await page.getByRole("button", { name: "Find Sites", exact: true }).click();
    await page.getByRole("button", { name: /Add External Opportunity/i }).click();
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
    await page.getByRole("button", { name: "Find Sites", exact: true }).click();
    await page.getByRole("button", { name: "Run Screening", exact: true }).click();
    const review = page.getByRole("button", { name: "Open Property Review" }).first();
    await review.waitFor({ timeout: 60_000 });
    await review.click();
    await page.getByRole("tablist", { name: "Property Research tabs" }).waitFor();
    await page.getByRole("button", { name: "Reports", exact: true }).click();
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
    await page.getByRole("button", { name: "Projects", exact: true }).click();
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

  await page.getByRole("button", { name: "Return to CFS Home" }).click();
}

async function navigationChecks(page) {
  await runCase("Navigation", "deep links, refresh, Back, Forward, and clean Home", async () => {
    await page.evaluate(() => localStorage.clear());
    await goto(page, "?app=planning");
    await page.locator('button[aria-haspopup="menu"]').click();
    await page
      .getByRole("menuitemradio")
      .filter({ hasText: "Economics" })
      .click();
    await page.waitForFunction(() => new URLSearchParams(location.search).get("app") === "economics");
    await page.goBack();
    await page.waitForFunction(() => new URLSearchParams(location.search).get("app") === "planning");
    assert.equal(new URL(page.url()).searchParams.get("app"), "planning");
    await page.goForward();
    await page.waitForFunction(() => new URLSearchParams(location.search).get("app") === "economics");
    assert.equal(new URL(page.url()).searchParams.get("app"), "economics");
    await page.evaluate(() => localStorage.clear());
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
    assert.equal(new URL(page.url()).search, "");
    await page.getByText("Cabarrus FutureScape", { exact: true }).first().waitFor();
  });
}

async function offlineChecks(browser) {
  const context = await browser.newContext({
    acceptDownloads: true,
    viewport: { width: 1280, height: 900 },
  });
  attachDiagnostics(context, { offline: true });
  const page = await context.newPage();

  await runCase("Home", "renders with loopback traffic only", async () => {
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
    await page.getByText("Cabarrus FutureScape", { exact: true }).first().waitFor();
    await assertHealthyPage(page);
  }, true);
  await runCase("Planning", "parcel, local layers, and deterministic Ask CFS", async () => {
    await goto(page, "?app=planning");
    await page.getByTestId("command-center-explore-intelligence").click();
    await page.getByLabel("Cabarrus County ArcGIS MapView").waitFor({ timeout: 45_000 });
    await selectParcel(page);
    const expand = page.getByRole("button", { name: "Expand map layers panel" });
    if (await expand.count()) await expand.click();
    await toggleLayer(page, "Development Hotspots", "Development Activity");
    await page.getByTestId("command-center-indicator-center").click();
    await askQuestions(page, ["What data is still missing?"]);
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
  await context.close();
}

async function degradedDataChecks(browser) {
  for (const mode of ["api", "database"]) {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
    });
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
    await page.goto(`${BASE_URL}/?app=planning`, {
      waitUntil: "domcontentloaded",
    });
    await assertHealthyPage(page);
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
    await page.goto(`${BASE_URL}/?app=economics`, {
      waitUntil: "domcontentloaded",
    });
    await assertHealthyPage(page);
    await delay(2_000);
    report.degraded.cases.push(`${mode} unavailable`);
    console.log(`PASS Degraded: ${mode} unavailable remains truthful`);
    await context.close();
  }
}

async function main() {
  const architecture = spawnSync(process.execPath, ["scripts/check-enterprise-frontend.mjs"], {
    cwd: ROOT,
    env: process.env,
    stdio: "inherit",
  });
  assert.equal(architecture.status, 0, "Product V1 frontend persistence architecture check failed.");
  report.product_persistence_architecture = "PASS";
  await waitForStack();
  const browser = await chromium.launch({
    executablePath: browserExecutable(),
    headless: true,
    args: ["--disable-gpu", "--no-sandbox"],
  });
  try {
    const context = await browser.newContext({
      acceptDownloads: true,
      viewport: { width: 1440, height: 1000 },
    });
    attachDiagnostics(context);
    const page = await context.newPage();
    await planningWorkflow(page);
    await economicsWorkflow(page);
    await investmentsWorkflow(page);
    await navigationChecks(page);
    await page.waitForLoadState("networkidle", { timeout: 30_000 });
    await context.close();
    await offlineChecks(browser);
    await degradedDataChecks(browser);
  } finally {
    try {
      await cleanupRecentWork();
    } finally {
      await browser.close();
    }
  }

  assert(Object.keys(report.api_paths).length >= 20, "Too few local API routes drove the UI.");
  assert((report.api_paths["POST /ai/search"] ?? 0) >= 10, "Ask CFS UI requests were incomplete.");
  assert(
    new Set(report.map_context_requests.map((url) => new URL(url).pathname))
      .size === LIVE_MAP_CONTEXT_PATHS.size,
    "Live UI did not load every same-origin map context asset.",
  );
  assert.equal(report.demo_data_requests.length, 0, "Live UI requested demo-data fixtures.");
  assert.equal(
    report.degraded.demo_data_requests.length,
    0,
    "Degraded live UI requested demo business fixtures.",
  );
  assert.deepEqual(report.diagnostics.api_failures, [], "Browser observed failed API calls.");
  assert.deepEqual(report.diagnostics.page_errors, [], "Browser page errors were observed.");
  assert.deepEqual(report.diagnostics.request_loops, [], "Probable request loop detected.");
  assert.deepEqual(report.diagnostics.request_failures, [], "Unexpected request failure observed.");
  assert.deepEqual(report.diagnostics.console_messages, [], "Console warnings or errors were observed.");
  assert(report.disposable_cleanup?.verified, "Disposable investment mutation was not cleaned.");
  assert(report.disposable_cleanup?.recent_work_verified, "Disposable recent work was not cleaned.");

  report.status = "PASS";
  await fs.mkdir(path.join(ROOT, "logs"), { recursive: true });
  await fs.writeFile(
    path.join(ROOT, "logs", "local-interactions.json"),
    JSON.stringify(report, null, 2),
  );
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
      },
      null,
      2,
    )}`,
  );
}

await main();
