import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright-core";

const root = process.cwd();
const externalBaseUrl = process.env.CFS_DEMO_BASE_URL?.replace(/\/$/, "");
const caseArtifacts = [];
const results = [];
const controls = new Map();
const diagnostics = {
  blockedRequests: [],
  consoleMessages: [],
  external404s: [],
  pageErrors: [],
  requestFailures: [],
  requestLoops: [],
  sameOrigin404s: [],
};
let server;

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
  context.route("**/*", async (route) => {
    const url = route.request().url();
    if (isForbiddenBackend(url, origin)) {
      diagnostics.blockedRequests.push(url);
      await route.abort("blockedbyclient");
      return;
    }
    await route.continue();
  });
  context.on("request", (request) => {
    if (new URL(request.url()).pathname === "/favicon.ico") return;
    const count = (requestCounts.get(request.url()) ?? 0) + 1;
    requestCounts.set(request.url(), count);
    if (count === 26) diagnostics.requestLoops.push(request.url());
  });
  context.on("requestfailed", (request) => {
    if (isForbiddenBackend(request.url(), origin)) return;
    if (/\.(?:pptx|xlsx)$/i.test(new URL(request.url()).pathname) && request.failure()?.errorText === "net::ERR_ABORTED") return;
    if (new URL(request.url()).origin === origin) {
      diagnostics.requestFailures.push(`${request.failure()?.errorText ?? "failed"} ${request.url()}`);
    }
  });
  context.on("response", (response) => {
    if (response.status() === 404) {
      if (new URL(response.url()).origin === origin) diagnostics.sameOrigin404s.push(response.url());
      else diagnostics.external404s.push(response.url());
    }
  });
  context.on("page", (page) => {
    page.on("pageerror", (error) => diagnostics.pageErrors.push(`${page.url()} :: ${error.message}`));
    page.on("console", (message) => {
      if (["error", "warning"].includes(message.type())) {
        const text = message.text();
        if (/GL Driver Message.*GPU stall due to ReadPixels/.test(text)) return;
        if (/\[@arcgis\/core\/views\/MapView\] Font .* is not available/.test(text)) return;
        const location = message.location().url;
        diagnostics.consoleMessages.push(`${page.url()} :: ${message.type()}: ${text}${location ? ` [${location}]` : ""}`);
      }
    });
  });
}

async function goto(page, baseUrl, query) {
  await page.goto(`${baseUrl}/${query}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.body.textContent?.includes("Portfolio Demo"), null, { timeout: 30_000 });
  await delay(750);
  await assertHealthyText(page);
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

async function waitForMapReady(page, { interactive = false } = {}) {
  const map = page.getByTestId("cfs-arcgis-map");
  await map.waitFor({ timeout: 30_000 });
  await page.waitForFunction(
    ({ requireInteractive }) => {
      const element = document.querySelector('[data-testid="cfs-arcgis-map"]');
      const status = element?.getAttribute("data-map-status");
      const rendererState = element?.getAttribute("data-map-renderer-state");
      return (
        element?.getAttribute("data-context-ready") === "true" &&
        (requireInteractive
          ? status === "online"
          : [
              "loading_interactive",
              "interactive_ready",
              "degraded_static",
            ].includes(rendererState ?? ""))
      );
    },
    { requireInteractive: interactive },
    { timeout: 35_000 },
  );
  const box = await map.boundingBox();
  assert(box && box.width > 300 && box.height > 250, `Map container is not usable: ${JSON.stringify(box)}`);
  assert(Number(await map.getAttribute("data-context-county-features")) > 0, "County context is empty.");
  assert(Number(await map.getAttribute("data-context-road-features")) > 0, "Road context is empty.");
  assert(Number(await map.getAttribute("data-context-hydro-features")) > 0, "Water context is empty.");
  assert(Number(await map.getAttribute("data-context-municipal-features")) > 0, "Municipal context is empty.");
  assert(Number(await map.getAttribute("data-context-label-features")) > 0, "Place label context is empty.");
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
  return (await page.getByTestId("cfs-arcgis-map").getAttribute("data-map-status")) === "online";
}

async function assertContextMapLayers(page) {
  if (await mapUsesArcGIS(page)) {
    for (const layerId of [
      "county-boundary",
      "cfs-local-municipalities",
      "cfs-local-hydrography",
      "transportation-context",
      "cfs-local-place-labels",
    ]) {
      await assertRuntimeLayer(page, layerId);
    }
    return;
  }

  const fallback = page.getByTestId("cfs-local-context-map");
  for (const layerId of [
    "county-boundary",
    "municipal-boundaries",
    "hydrography",
    "major-roads",
    "place-labels",
  ]) {
    await fallback.locator(`[data-layer-id="${layerId}"]`).waitFor();
  }
}

async function assertRenderedMapLayer(
  page,
  runtimeLayerId,
  fallbackLayerId,
  { visible = true } = {},
) {
  if (await mapUsesArcGIS(page)) {
    await assertRuntimeLayer(page, runtimeLayerId, {
      visible,
      withGraphics: visible,
    });
    return;
  }
  await page
    .getByTestId("cfs-local-context-map")
    .locator(`[data-layer-id="${fallbackLayerId}"]`)
    .waitFor({ state: visible ? "attached" : "detached", timeout: 20_000 });
}

async function captureMapSurface(page) {
  return (await mapUsesArcGIS(page))
    ? page.getByTestId("cfs-arcgis-map").screenshot()
    : page.getByTestId("cfs-local-context-map").screenshot();
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
  return { manifestAssets: manifest.required_assets.length, publicAssets };
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
    await overlayToggle.click();
    for (const mode of ["Points", "Heatmap", "Clusters"]) {
      await page.getByRole("button", { name: `Show Model Lab research as ${mode}` }).click();
    }
    await controlsPanel.getByRole("button", { name: "Open Methodology Model Lab" }).click();
    await page.getByRole("button", { name: /Workspace:/ }).click();
    if (await expandModelLab.count()) await expandModelLab.click();
    await controlsPanel.waitFor();
  });

  await check("Planning", "snapshot create, rename, section persistence, print, and delete", ["save", "library", "rename", "sections", "refresh", "print", "delete"], async () => {
    await page.getByRole("button", { name: "Save Planning Snapshot" }).click();
    await page.getByText("1 saved", { exact: true }).first().waitFor();
    const snapshotMode = page.locator('button[aria-label^="Planning Snapshot:"]');
    await snapshotMode.click();
    await page
      .locator('button[aria-label^="Planning Snapshot:"][aria-pressed="true"]')
      .waitFor();
    await page.getByText("Planning Snapshot Library", { exact: true }).waitFor();
    page.once("dialog", (dialog) => dialog.accept("Browser acceptance snapshot"));
    await page.getByRole("button", { name: "Rename", exact: true }).first().click();
    await page.getByText("Browser acceptance snapshot", { exact: true }).waitFor();
    const section = page.getByRole("checkbox", { name: /^(?:Map|Dashboard) Snapshot$/ });
    if (await section.count()) {
      const before = await section.isChecked();
      await section.setChecked(!before);
      await page.reload({ waitUntil: "domcontentloaded" });
      await delay(750);
      await snapshotMode.click();
      await page
        .locator('button[aria-label^="Planning Snapshot:"][aria-pressed="true"]')
        .waitFor();
      await page.getByText("Planning Snapshot Library", { exact: true }).waitFor();
      assert.equal(await page.getByRole("checkbox", { name: /^(?:Map|Dashboard) Snapshot$/ }).isChecked(), !before);
    }
    await page.evaluate(() => {
      window.print = () => sessionStorage.setItem("cfs-print-invoked", "true");
    });
    await page.getByRole("button", { name: /Print/i }).first().click();
    await delay(250);
    assert.equal(await page.evaluate(() => sessionStorage.getItem("cfs-print-invoked")), "true");
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Delete", exact: true }).first().click();
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

async function investmentsChecks(page, baseUrl) {
  await goto(page, baseUrl, "?app=consulting&investmentPage=overview");
  await check("Investments", "Home and Projects load populated CASE-1 state", ["Home", "Projects", "continue project"], async () => {
    await page.getByText("CFS Large Development-Land Acquisition Case Study", { exact: false }).first().waitFor({ timeout: 30_000 });
    await page.getByRole("button", { name: "Projects", exact: true }).click();
    await page.getByText("Active projects and case studies", { exact: false }).waitFor();
  });

  await check("Investments", "Find Sites filters and saved-search persistence", ["screen", "minimum acres", "environmental filter", "save search", "refresh"], async () => {
    await page.getByRole("button", { name: "Find Sites", exact: true }).click();
    await page.getByRole("button", { name: "Run Screening", exact: true }).click();
    await page.getByText(/3 candidates/i).first().waitFor();
    const filters = page.locator('main[data-investment-page="area-radar"] input[type="number"], main[data-investment-page="area-radar"] select');
    assert((await filters.count()) >= 2, "Find Sites filter controls are missing.");
    await page.getByRole("button", { name: "Save Search", exact: true }).click();
    const saved = page.getByLabel("Saved searches");
    await saved.getByText("Find Sites: Large Development Land", { exact: true }).waitFor();
    await page.reload({ waitUntil: "domcontentloaded" });
    await saved.getByText("Find Sites: Large Development Land", { exact: true }).waitFor();
  });

  await check("Investments", "external opportunity saves without false analysis", ["add external", "save", "refresh"], async () => {
    await page.getByRole("button", { name: /Add External Opportunity/i }).click();
    const form = page.locator('main[data-investment-page="intake"]');
    const unique = `EXT-BROWSER-${Date.now()}`;
    await form.getByRole("textbox", { name: "Candidate label" }).fill("Browser acceptance opportunity");
    await form.getByRole("textbox", { name: "Parcel ID" }).fill(unique);
    await form.getByRole("button", { name: "Add Candidate", exact: true }).click();
    await form.getByText(unique, { exact: false }).first().waitFor();
    assert.equal(new URL(page.url()).searchParams.get("investmentPage"), "intake");
    await page.reload({ waitUntil: "domcontentloaded" });
    await form.getByText(unique, { exact: false }).first().waitFor();
  });

  await check("Investments", "all three candidates expose seven distinct research tabs", ["3 candidates", "7 research tabs"], async () => {
    await page.getByRole("button", { name: "Find Sites", exact: true }).click();
    await page.getByRole("button", { name: "Run Screening", exact: true }).click();
    const candidates = ["CFS-PARCEL-0149758869", "CFS-PARCEL-0149760035", "CFS-PARCEL-0149777275"];
    const tabs = ["Summary", "Property", "Market", "Constraints", "Financial", "Due Diligence", "Sources"];
    for (const candidate of candidates) {
      let card = page.getByText(candidate, { exact: false }).first().locator("xpath=ancestor::*[self::article or self::div][.//button[contains(.,'Open Property Review')]][1]");
      if (!(await card.count())) {
        await page.getByRole("button", { name: "Run Screening", exact: true }).click();
        card = page.getByText(candidate, { exact: false }).first().locator("xpath=ancestor::*[self::article or self::div][.//button[contains(.,'Open Property Review')]][1]");
      }
      await card.getByRole("button", { name: "Open Property Review" }).click();
      const research = page.getByRole("tablist", { name: "Property Research tabs" }).locator("xpath=ancestor::section[1]");
      const tabContents = new Set();
      for (const tab of tabs) {
        const button = page.getByRole("tab", { name: tab });
        await button.click();
        assert.equal(await button.getAttribute("aria-selected"), "true");
        tabContents.add(await research.innerText());
      }
      assert.equal(tabContents.size, tabs.length, `${candidate} did not render distinct tab content`);
      await page.getByRole("button", { name: "Find Sites", exact: true }).click();
    }
  });

  await check("Investments", "Reports bucket persists and can be emptied", ["generate report", "add bucket", "refresh", "remove"], async () => {
    await page.getByRole("button", { name: "Reports", exact: true }).click();
    const generate = page.getByRole("button", { name: /Generate/i }).first();
    await generate.click();
    const add = page.getByRole("button", { name: "Add report to Report Bucket", exact: true });
    await add.click();
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Reports", exact: true }).click();
    await page.getByText(/Report Bucket/i).first().waitFor();
    const remove = page.getByRole("button", { name: /Remove/i }).first();
    if (await remove.count()) await remove.click();
  });

  await check("Investments", "Data & Methods exposes static dataset status and source links", ["dataset rows", "source links", "static refresh status"], async () => {
    await page.getByRole("button", { name: "Data & Methods", exact: true }).click();
    const status = page.getByLabel("Demo dataset status");
    assert.equal(await status.getByRole("link", { name: "Open demo asset" }).count(), 5);
    assert.equal(await status.getByRole("button", { name: "Static in portfolio demo" }).count(), 5);
    const href = await status.getByRole("link", { name: "Open demo asset" }).first().getAttribute("href");
    assert(href?.startsWith("/demo-data/"));
  });

  await check("Investments", "CASE-1 workflow reaches all nine artifacts", ["underwrite", "decide", "deliver", "9 artifacts"], async () => {
    await page.getByRole("button", { name: "Projects", exact: true }).click();
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
        await opened.close();
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
    await context.close();
    record(product, "mobile viewport workflow", ["mobile layout"]);
    console.log(`PASS ${product}: mobile viewport workflow`);
  }
}

async function offlineMapChecks(browser, baseUrl) {
  const origin = new URL(baseUrl).origin;
  for (const scenario of [
    { blockArcgisAssets: false, label: "external network isolation" },
    { blockArcgisAssets: true, label: "ArcGIS failure SVG fallback" },
  ]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const blocked = [];
    const sameOriginPaths = new Set();
    await context.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (
        url.origin !== origin ||
        (scenario.blockArcgisAssets && url.pathname.startsWith("/arcgis-assets/"))
      ) {
        blocked.push(url.href);
        await route.abort("blockedbyclient");
        return;
      }
      sameOriginPaths.add(url.pathname);
      await route.continue();
    });
    const page = await context.newPage();
    try {
      await goto(page, baseUrl, "?app=planning");
      await page.getByTestId("command-center-explore-intelligence").click();
      await waitForMapReady(page);
      for (const asset of [
        "/demo-data/map_layers/demo_county_boundary.geojson",
        "/demo-data/map_layers/demo_municipal_boundaries.geojson",
        "/demo-data/map_layers/demo_hydrography.geojson",
        "/demo-data/map_layers/demo_transportation_context.geojson",
        "/demo-data/map_layers/demo_place_labels.geojson",
      ]) {
        assert(sameOriginPaths.has(asset), `${scenario.label} did not load ${asset}`);
      }

      if (!scenario.blockArcgisAssets) {
        await assertContextMapLayers(page);
        await assertPaintedImage(
          await captureMapSurface(page),
          "Offline same-origin context map",
        );
      } else {
        const fallback = page.getByTestId("cfs-local-context-map");
        await fallback.waitFor();
        await page
          .getByText("Static Map Mode", { exact: true })
          .first()
          .waitFor();
        await page
          .getByText(
            "Interactive controls are unavailable. County geography and current overlays remain usable.",
            { exact: true },
          )
          .waitFor();
        assert.equal(
          await page.getByRole("button", { name: "Zoom in", exact: true }).isEnabled(),
          true,
          "Fallback zoom control should remain available.",
        );
        await assertPaintedImage(
          await fallback.screenshot(),
          "Same-origin SVG fallback map",
        );

        const expandLayers = page.getByRole("button", {
          name: "Expand map layers panel",
        });
        if (await expandLayers.count()) await expandLayers.click();
        const card = page
          .locator("article")
          .filter({
            has: page.getByText("Development Hotspots", { exact: true }),
          })
          .first();
        await card
          .getByRole("combobox", {
            name: "Development hotspot permit segment filter",
          })
          .selectOption("residential_growth");
        const beforeOverlay = await fallback.screenshot();
        await card
          .getByRole("button", {
            name: "Show Development Hotspots",
            exact: true,
          })
          .click();
        await fallback
          .locator('[data-layer-id="development-hotspots"]')
          .waitFor();
        await assertImageDifference(
          beforeOverlay,
          await fallback.screenshot(),
          "SVG fallback development overlay",
        );

        const search = page.getByRole("combobox", { name: "Search parcels" });
        await search.fill("CFS-PARCEL-0149780354");
        await page
          .locator("#top-parcel-search-results")
          .getByRole("option")
          .first()
          .click();
        await fallback.locator('[data-layer-id="selected-parcel"]').waitFor();
      }

      assert(
        blocked.every((url) => new URL(url).origin !== origin || scenario.blockArcgisAssets),
        `${scenario.label} blocked an unexpected same-origin request`,
      );
      record("Planning", scenario.label, [
        "offline map",
        "same-origin context",
        scenario.blockArcgisAssets ? "SVG fallback" : "external isolation",
      ]);
      console.log(`PASS Planning: ${scenario.label}`);
    } finally {
      await context.close();
    }
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
    await planning.close();
    const economics = await context.newPage();
    await economicsChecks(economics, baseUrl);
    await economics.close();
    const investments = await context.newPage();
    await investmentsChecks(investments, baseUrl);
    await investments.close();
    await mobileChecks(browser, baseUrl);
    await offlineMapChecks(browser, baseUrl);
    await context.close();

    assert.deepEqual(diagnostics.pageErrors, [], `Page errors:\n${diagnostics.pageErrors.join("\n")}`);
    assert.deepEqual(diagnostics.sameOrigin404s, [], `Same-origin 404s:\n${diagnostics.sameOrigin404s.join("\n")}`);
    assert.deepEqual(diagnostics.external404s, [], `External 404s:\n${diagnostics.external404s.join("\n")}`);
    assert.deepEqual(diagnostics.requestFailures, [], `Request failures:\n${diagnostics.requestFailures.join("\n")}`);
    assert.deepEqual(diagnostics.requestLoops, [], `Probable request loops:\n${diagnostics.requestLoops.join("\n")}`);
    assert.deepEqual(diagnostics.blockedRequests, [], `Forbidden backend requests:\n${diagnostics.blockedRequests.join("\n")}`);
    assert.deepEqual(diagnostics.consoleMessages, [], `Console warnings/errors:\n${diagnostics.consoleMessages.join("\n")}`);

    const summary = {
      baseUrl,
      assets,
      caseArtifacts,
      cases: Object.fromEntries(
        ["Planning", "Economics", "Investments"].map((product) => [
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
