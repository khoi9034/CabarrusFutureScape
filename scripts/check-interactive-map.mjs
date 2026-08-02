import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright-core";

const BASE_URL = (
  process.env.CFS_INTERACTIVE_MAP_BASE_URL ??
  process.env.CFS_MAP_BASE_URL ??
  "http://127.0.0.1:3000"
).replace(/\/$/, "");
const ORIGIN = new URL(BASE_URL).origin;
const ACCEPTANCE = process.env.CFS_INTERACTIVE_MAP_ACCEPTANCE !== "false";
const PROTECTION_HEADERS = process.env.CFS_VERCEL_PROTECTION_BYPASS
  ? { "x-vercel-protection-bypass": process.env.CFS_VERCEL_PROTECTION_BYPASS }
  : undefined;
const REQUIRED_CONTEXT_LAYERS = [
  "county-boundary",
  "cfs-local-hydrography",
  "cfs-local-municipalities",
  "transportation-context",
  "cfs-local-place-labels",
];
const REQUIRED_CASES = [
  "MapView initializes in demo mode",
  "ArcGIS renderer is primary",
  "Same-origin ArcGIS basemap loads",
  "No API key required",
  "No external basemap required",
  "SDK assets come from same origin",
  "No ArcGIS asset 404",
  "Drag pan changes extent",
  "Wheel zoom changes scale",
  "Zoom In works",
  "Zoom Out works",
  "Reset/Home works",
  "Parcel hitTest works",
  "Parcel focus works",
  "Development toggle works",
  "Flood toggle works",
  "School toggle works",
  "Model Lab works",
  "Legend matches visible layers",
  "Map focus works",
  "Snapshot captures interactive renderer",
  "Route away and return",
  "Back and Forward",
  "Ten consecutive refreshes",
  "Mobile touch/pointer behavior",
  "slow network",
  "blocked external Esri services while local SDK assets remain available",
  "WebGL failure triggers emergency fallback",
  "retry successfully restores ArcGIS when possible",
  "no infinite initialization loop",
];
const proof = new Set();
const sessionCounts = {
  desktop: 0,
  externalBlocked: 0,
  mobile: 0,
  slow: 0,
  webgl: 0,
};
const aggregate = {
  asset404s: [],
  loops: [],
  pageErrors: [],
  requestFailures: [],
  consoleErrors: [],
};

const executablePath = [
  process.env.CFS_BROWSER_EXECUTABLE,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].find((path) => path && existsSync(path));
assert(executablePath, "Chrome or Edge was not found. Set CFS_BROWSER_EXECUTABLE.");

const manifest = await assertArcGisAssets();
const browser = await chromium.launch({ executablePath, headless: true });

try {
  await runCoreDesktop();

  const desktopTarget = ACCEPTANCE ? 10 : 2;
  for (let index = 1; index < desktopTarget; index += 1) {
    const viewport =
      index % 2 === 1
        ? { width: 1024, height: 768 }
        : { width: 1440, height: 1000 };
    await runSession(`clean desktop ${index + 1}`, { viewport }, async (page) => {
      await openExploreCountywide(page);
      await assertInteractiveMap(page);
    });
    sessionCounts.desktop += 1;
  }

  const mobileTarget = ACCEPTANCE ? 5 : 1;
  for (let index = 0; index < mobileTarget; index += 1) {
    await runSession(
      `mobile ${index + 1}`,
      {
        hasTouch: true,
        isMobile: true,
        viewport: { width: 390, height: 844 },
      },
      async (page, context) => {
        await openExploreCountywide(page);
        await assertInteractiveMap(page, { painted: index === 0 });
        if (index === 0) {
          const closeIntelligence = page.getByRole("button", {
            name: "Close intelligence panel",
            exact: true,
          });
          if (
            (await closeIntelligence.count()) &&
            (await closeIntelligence.isVisible())
          ) {
            await closeIntelligence.click();
          }
          const collapseLayers = page.getByRole("button", {
            name: "Collapse map controls",
            exact: true,
          });
          if ((await collapseLayers.count()) && (await collapseLayers.isVisible())) {
            await collapseLayers.click();
          }
          await assertTouchNavigation(page, context);
          pass("Mobile touch/pointer behavior");
        }
      },
    );
    sessionCounts.mobile += 1;
  }

  const slowTarget = ACCEPTANCE ? 3 : 1;
  for (let index = 0; index < slowTarget; index += 1) {
    await runSession(
      `slow network ${index + 1}`,
      { slow: true, viewport: { width: 1440, height: 1000 } },
      async (page, _context, diagnostics) => {
        await openExploreCountywide(page);
        await assertInteractiveMap(page);
        assert(diagnostics.delayedRequests > 0, "Slow session delayed no application requests.");
        if (index === 0) pass("slow network");
      },
    );
    sessionCounts.slow += 1;
  }

  const blockedTarget = ACCEPTANCE ? 3 : 1;
  for (let index = 0; index < blockedTarget; index += 1) {
    await runSession(
      `external blocked ${index + 1}`,
      { blockExternal: true, viewport: { width: 1440, height: 1000 } },
      async (page, _context, diagnostics) => {
        await openExploreCountywide(page);
        const { map } = await assertInteractiveMap(page);
        const externalAvailable = await page.evaluate(() =>
          fetch("https://basemaps.arcgis.com/arcgis/rest/services")
            .then(() => true)
            .catch(() => false),
        );
        assert.equal(externalAvailable, false, "External ArcGIS request was not blocked.");
        assert(
          diagnostics.blockedExternal.some((url) => /(?:arcgis|esri)/i.test(url)),
          "No external ArcGIS request reached the block rule.",
        );
        assert.equal(await map.getAttribute("data-basemap-mode"), "same-origin");
        const localManifest = await page.evaluate(() =>
          fetch("/arcgis-assets/manifest.json").then((response) => response.ok),
        );
        assert.equal(localManifest, true, "Same-origin ArcGIS manifest was unavailable.");
        if (index === 0) {
          pass("No external basemap required");
          pass("blocked external Esri services while local SDK assets remain available");
        }
      },
    );
    sessionCounts.externalBlocked += 1;
  }

  await runWebGlFallback();

  assert.deepEqual(aggregate.asset404s, [], `ArcGIS asset 404s: ${aggregate.asset404s.join(" | ")}`);
  assert.deepEqual(aggregate.loops, [], `Request loops: ${aggregate.loops.join(" | ")}`);
  assert.deepEqual(
    aggregate.requestFailures,
    [],
    `Required same-origin request failures: ${aggregate.requestFailures.join(" | ")}`,
  );
  assert.deepEqual(aggregate.pageErrors, [], `Page errors: ${aggregate.pageErrors.join(" | ")}`);
  assert.deepEqual(
    aggregate.consoleErrors,
    [],
    `Console errors: ${aggregate.consoleErrors.join(" | ")}`,
  );
  pass("No ArcGIS asset 404");
  pass("no infinite initialization loop");

  assert.deepEqual(
    [...proof].sort(),
    [...REQUIRED_CASES].sort(),
    "The interactive-map gate did not prove every required case.",
  );
  assert(sessionCounts.desktop >= (ACCEPTANCE ? 10 : 2));
  assert(sessionCounts.mobile >= (ACCEPTANCE ? 5 : 1));
  assert(sessionCounts.slow >= (ACCEPTANCE ? 3 : 1));
  assert(sessionCounts.externalBlocked >= (ACCEPTANCE ? 3 : 1));
  assert.equal(sessionCounts.webgl, 1);

  console.log(
    JSON.stringify(
      {
        acceptance: ACCEPTANCE,
        arcgis: {
          assetCount: manifest.assetCount,
          assetsPath: manifest.assetsPath,
          sdkVersion: manifest.sdkVersion,
        },
        cases: REQUIRED_CASES.map((name, index) => ({ id: index + 1, name, passed: true })),
        failed: 0,
        sessions: sessionCounts,
        target: BASE_URL,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}

async function runCoreDesktop() {
  await runSession(
    "core desktop",
    { viewport: { width: 1440, height: 1000 } },
    async (page, _context, diagnostics) => {
      assert.match(await page.locator("body").innerText(), /Portfolio Demo/i);
      pass("MapView initializes in demo mode");
      await openExploreCountywide(page);
      const initial = await assertInteractiveMap(page, { painted: true });
      assert(
        diagnostics.assetRequests.size > 0,
        "ArcGIS made no same-origin SDK asset request.",
      );
      pass("ArcGIS renderer is primary");
      pass("Same-origin ArcGIS basemap loads");
      pass("No API key required");
      pass("SDK assets come from same origin");

      await assertPan(page, initial.map);
      pass("Drag pan changes extent");
      await assertWheelZoom(page, initial.map);
      pass("Wheel zoom changes scale");
      await page.getByRole("button", { name: "Reset to Cabarrus County", exact: true }).click();
      await waitForReset(page, initial.state);
      await assertZoomControls(page);
      pass("Zoom In works");
      pass("Zoom Out works");
      await assertDoubleClickAndKeyboard(page, initial.map);
      await page.getByRole("button", { name: "Reset to Cabarrus County", exact: true }).click();
      await waitForReset(page, initial.state);
      pass("Reset/Home works");

      await assertParcelHit(page, initial.map);
      pass("Parcel hitTest works");
      await assertParcelFocus(page, "CFS-PARCEL-0149780354");
      pass("Parcel focus works");
      await assertMapFocusMode(page);
      pass("Map focus works");

      await assertOverlay(page, {
        group: "Development Activity",
        layerId: "cfs-development-hotspots-layer",
        title: "Development Hotspots",
      });
      pass("Development toggle works");
      await assertOverlay(page, {
        group: "Floodplain Review",
        layerId: "cfs-flood-constraints-layer",
        title: "Floodplain Review",
      });
      pass("Flood toggle works");
      await assertOverlay(page, {
        group: "Schools",
        layerId: "cfs-school-utilization-zones-layer",
        title: "School Capacity Watch",
      });
      pass("School toggle works");
      pass("Legend matches visible layers");

      await assertModelLab(page);
      pass("Model Lab works");
      await assertSnapshot(page);
      pass("Snapshot captures interactive renderer");
      await assertRoutes(page);
      pass("Route away and return");
      pass("Back and Forward");

      for (let index = 0; index < 10; index += 1) {
        await page.reload({ waitUntil: "domcontentloaded", timeout: 60_000 });
        await assertInteractiveMap(page);
      }
      pass("Ten consecutive refreshes");
      await assertStableAttempt(page);
    },
  );
  sessionCounts.desktop += 1;
}

async function runWebGlFallback() {
  await runSession(
    "forced WebGL failure",
    {
      allowRendererErrors: true,
      forceWebGl: true,
      viewport: { width: 1440, height: 1000 },
    },
    async (page) => {
      await openExploreCountywide(page);
      const map = page.getByTestId("cfs-arcgis-map");
      const fallback = page.getByTestId("cfs-local-context-map");
      await page.waitForFunction(
        () => {
          const element = document.querySelector('[data-testid="cfs-arcgis-map"]');
          return (
            element?.getAttribute("data-map-renderer") === "static" &&
            element.getAttribute("data-map-renderer-state") === "static_degraded"
          );
        },
        null,
        { timeout: 75_000 },
      );
      assert.equal(await fallback.getAttribute("aria-hidden"), "false");
      assert.equal(
        await page.getByText("Interactive map could not start", { exact: true }).count(),
        1,
      );
      await page.getByText("Basic map view remains available.", { exact: true }).waitFor();
      await assertPainted(await fallback.screenshot(), "WebGL emergency fallback");
      pass("WebGL failure triggers emergency fallback");

      const preservedParcelId = "CFS-PARCEL-0149780354";
      await selectParcelFromSearch(page, preservedParcelId);
      await page.waitForFunction(
        (parcelId) =>
          new URL(window.location.href).searchParams.get("parcel") === parcelId,
        preservedParcelId,
      );
      const preservedSearch = new URL(page.url()).search;
      assert.notEqual(
        new URL(page.url()).searchParams.get("layers"),
        null,
        "Retry state did not preserve active layers in the URL.",
      );
      const before = Number(await map.getAttribute("data-map-initialization-attempt"));
      await page.evaluate(() => window.__cfsRestoreWebGL?.());
      await Promise.all([
        page.waitForNavigation({ timeout: 30_000, waitUntil: "domcontentloaded" }),
        page.getByRole("button", { name: /Retry interactive map/i }).click(),
      ]);
      await assertInteractiveMap(page, { painted: true });
      const after = Number(await map.getAttribute("data-map-initialization-attempt"));
      assert(
        after > before || after === 1,
        "Retry did not start a fresh MapView attempt.",
      );
      assert.equal(
        new URL(page.url()).search,
        preservedSearch,
        "Retry did not preserve dashboard and layer state.",
      );
      await page
        .getByText(
          new RegExp(`Selected parcel: ${escapeRegExp(preservedParcelId)}`, "i"),
        )
        .first()
        .waitFor();
      await assertStableAttempt(page);
      pass("retry successfully restores ArcGIS when possible");
    },
  );
  sessionCounts.webgl += 1;
}

async function runSession(label, options, verify) {
  const context = await browser.newContext({
    hasTouch: options.hasTouch ?? false,
    isMobile: options.isMobile ?? false,
    viewport: options.viewport,
  });
  const diagnostics = createDiagnostics(label, options);
  attachDiagnostics(context, diagnostics);

  if (options.slow || options.blockExternal || PROTECTION_HEADERS) {
    await context.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (options.blockExternal && url.origin !== ORIGIN) {
        diagnostics.blockedExternal.push(url.href);
        await route.abort("blockedbyclient");
        return;
      }
      if (
        options.slow &&
        url.origin === ORIGIN &&
        (/^\/(?:arcgis-assets|demo-data\/map_layers)\//.test(url.pathname) ||
          url.pathname.startsWith("/_next/static/"))
      ) {
        diagnostics.delayedRequests += 1;
        await delay(url.pathname.startsWith("/_next/static/") ? 75 : 250);
      }
      const headers =
        PROTECTION_HEADERS && url.origin === ORIGIN
          ? { ...route.request().headers(), ...PROTECTION_HEADERS }
          : undefined;
      await route.continue(headers ? { headers } : undefined);
    });
  }

  const page = await context.newPage();
  attachPageDiagnostics(page, diagnostics);
  if (options.forceWebGl) await installWebGlFailure(page);

  try {
    await page.goto(`${BASE_URL}/?app=planning`, {
      timeout: 60_000,
      waitUntil: "domcontentloaded",
    });
    await assertHealthy(page);
    await verify(page, context, diagnostics);
    await assertSessionDiagnostics(diagnostics);
    console.log(`PASS interactive map: ${label}`);
  } finally {
    mergeDiagnostics(diagnostics);
    await context.close();
  }
}

function createDiagnostics(label, options) {
  return {
    allowRendererErrors: options.allowRendererErrors ?? false,
    asset404s: [],
    assetRequests: new Set(),
    blockedExternal: [],
    consoleErrors: [],
    delayedRequests: 0,
    label,
    loops: [],
    pageErrors: [],
    requestCounts: new Map(),
    requestFailures: [],
  };
}

function attachDiagnostics(context, diagnostics) {
  context.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin === ORIGIN && url.pathname.startsWith("/arcgis-assets/")) {
      diagnostics.assetRequests.add(url.pathname);
    }
    const count = (diagnostics.requestCounts.get(request.url()) ?? 0) + 1;
    diagnostics.requestCounts.set(request.url(), count);
    if (count === 21) diagnostics.loops.push(`${diagnostics.label}: ${request.url()}`);
  });
  context.on("requestfailed", (request) => {
    const url = new URL(request.url());
    const error = request.failure()?.errorText ?? "failed";
    if (
      url.origin === ORIGIN &&
      !["net::ERR_ABORTED", "net::ERR_BLOCKED_BY_CLIENT"].includes(error)
    ) {
      diagnostics.requestFailures.push(`${diagnostics.label}: ${error} ${url.href}`);
    }
  });
  context.on("response", (response) => {
    const url = new URL(response.url());
    if (
      response.status() === 404 &&
      url.origin === ORIGIN &&
      url.pathname.startsWith("/arcgis-assets/")
    ) {
      diagnostics.asset404s.push(`${diagnostics.label}: ${url.href}`);
    }
  });
}

function attachPageDiagnostics(page, diagnostics) {
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) diagnostics.requestCounts.clear();
  });
  page.on("pageerror", (error) => {
    const text = error.stack || error.message;
    if (
      diagnostics.allowRendererErrors &&
      ((error.message === "s" && !error.stack) || isExpectedRendererDiagnostic(text))
    ) {
      return;
    }
    diagnostics.pageErrors.push(`${diagnostics.label}: ${text}`);
  });
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (diagnostics.allowRendererErrors && isExpectedRendererDiagnostic(text)) return;
    if (/GL Driver Message.*GPU stall due to ReadPixels/.test(text)) return;
    if (/ERR_BLOCKED_BY_CLIENT/.test(text) && diagnostics.blockedExternal.length) return;
    diagnostics.consoleErrors.push(`${diagnostics.label}: ${text}`);
  });
}

async function assertSessionDiagnostics(diagnostics) {
  assert.deepEqual(diagnostics.asset404s, [], diagnostics.asset404s.join(" | "));
  assert.deepEqual(diagnostics.loops, [], diagnostics.loops.join(" | "));
  assert.deepEqual(diagnostics.requestFailures, [], diagnostics.requestFailures.join(" | "));
  assert.deepEqual(diagnostics.pageErrors, [], diagnostics.pageErrors.join(" | "));
  assert.deepEqual(diagnostics.consoleErrors, [], diagnostics.consoleErrors.join(" | "));
}

function mergeDiagnostics(diagnostics) {
  aggregate.asset404s.push(...diagnostics.asset404s);
  aggregate.loops.push(...diagnostics.loops);
  aggregate.requestFailures.push(...diagnostics.requestFailures);
  aggregate.pageErrors.push(...diagnostics.pageErrors);
  aggregate.consoleErrors.push(...diagnostics.consoleErrors);
}

function isExpectedRendererDiagnostic(text) {
  return /webgl|rendering-error|rendering context/i.test(text);
}

async function assertInteractiveMap(page, { painted = false } = {}) {
  const map = page.getByTestId("cfs-arcgis-map");
  await map.waitFor({ timeout: 45_000 });
  await page.waitForFunction(
    () => {
      const element = document.querySelector('[data-testid="cfs-arcgis-map"]');
      const state = window.__cfsGetMapDebugState?.();
      return Boolean(
        element?.getAttribute("data-map-renderer") === "interactive" &&
          element.getAttribute("data-map-renderer-state") === "interactive_ready" &&
          element.getAttribute("data-map-view-ready-state") === "ready" &&
          element.getAttribute("data-interactive-ready") === "true" &&
          state?.ready === true &&
          state.readyState === "ready" &&
          state.layerViewCount >= 5,
      );
    },
    null,
    { timeout: 75_000 },
  );
  await delay(300);
  const state = await getDebugState(page);
  const box = await map.boundingBox();
  assert(box && box.width > 240 && box.height > 240, `Map dimensions are invalid: ${JSON.stringify(box)}`);
  assert.equal(state.basemapId, "cfs-same-origin-basemap");
  assert.equal(state.ready, true);
  assert.equal(state.readyState, "ready");
  assert.equal(state.spatialReferenceWkid, 3857);
  assert(state.container.width > 240 && state.container.height > 240);
  assert(validExtent(state.extent), `Map extent is invalid: ${JSON.stringify(state.extent)}`);
  assert(Number.isFinite(state.scale) && state.scale > 0, `Map scale is invalid: ${state.scale}`);
  assert(Number.isFinite(state.zoom) && state.zoom >= 0, `Map zoom is invalid: ${state.zoom}`);
  assert(state.layerCount >= REQUIRED_CONTEXT_LAYERS.length);
  assert(state.layerViewCount >= REQUIRED_CONTEXT_LAYERS.length);
  assert.equal(state.assetsPath, manifest.assetsPath);
  assert.equal(state.sdkVersion, manifest.sdkVersion);
  for (const layerId of REQUIRED_CONTEXT_LAYERS) {
    const layer = state.layers.find((candidate) => candidate.id === layerId);
    assert(layer?.visible, `Required context layer is not visible: ${layerId}`);
    assert(Number(layer.graphicsCount) > 0, `Required context layer is empty: ${layerId}`);
  }
  for (const attribute of [
    "data-context-county-features",
    "data-context-hydro-features",
    "data-context-label-features",
    "data-context-municipal-features",
    "data-context-road-features",
  ]) {
    assert(Number(await map.getAttribute(attribute)) > 0, `${attribute} is empty.`);
  }
  assert.equal(await map.getAttribute("data-arcgis-assets-path"), manifest.assetsPath);
  assert.equal(await map.getAttribute("data-arcgis-sdk-version"), manifest.sdkVersion);
  assert.equal(await map.getAttribute("aria-hidden"), "false");
  assert.equal(await page.getByText("Static Map Mode", { exact: true }).count(), 0);
  assert.equal(await page.getByText(/Sign in to ArcGIS/i).count(), 0);
  assert.equal(await page.getByText("Interactive map could not start", { exact: true }).count(), 0);
  await page.locator(".esri-view-root").first().waitFor({ timeout: 30_000 });
  assert((await map.locator("canvas").count()) > 0, "ArcGIS created no canvas.");
  await assertRendererStack(page, map, box);
  if (painted) await assertPainted(await map.screenshot(), "Interactive ArcGIS MapView");
  return { box, map, state };
}

async function assertRendererStack(page, map, box) {
  const stack = await page.evaluate(({ x, y }) => {
    const interactive = document.querySelector('[data-testid="cfs-arcgis-map"]');
    const fallback = document.querySelector('[data-testid="cfs-local-context-map"]');
    const center = document.elementsFromPoint(x, y);
    const blocking = center.filter((element) => {
      if (!interactive || element === document.documentElement || element === document.body) return false;
      if (interactive.contains(element) || element.contains(interactive)) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return (
        style.pointerEvents !== "none" &&
        Number(style.opacity) > 0.01 &&
        rect.width > interactive.clientWidth * 0.7 &&
        rect.height > interactive.clientHeight * 0.7
      );
    });
    return {
      blocking: blocking.map((element) => `${element.tagName}.${element.className}`),
      fallbackOpacity: fallback ? Number(getComputedStyle(fallback).opacity) : 1,
      fallbackPointerEvents: fallback ? getComputedStyle(fallback).pointerEvents : "auto",
      interactiveOpacity: interactive ? Number(getComputedStyle(interactive).opacity) : 0,
      interactivePointerEvents: interactive ? getComputedStyle(interactive).pointerEvents : "none",
    };
  }, { x: box.x + box.width * 0.56, y: box.y + box.height * 0.48 });
  assert(stack.interactiveOpacity >= 0.99, "Interactive renderer is transparent.");
  assert.equal(stack.interactivePointerEvents, "auto");
  assert(stack.fallbackOpacity <= 0.01, "SVG fallback covers the interactive map.");
  assert.equal(stack.fallbackPointerEvents, "none");
  assert.deepEqual(stack.blocking, [], `Blocking map overlays: ${stack.blocking.join(", ")}`);
  assert.equal(await map.getAttribute("data-map-renderer"), "interactive");
}

async function assertPan(page, map) {
  const before = await getDebugState(page);
  const point = await mapPoint(map);
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x + 95, point.y + 38, { steps: 8 });
  await page.mouse.up();
  await waitForExtentChange(page, before.extent);
}

async function assertWheelZoom(page, map) {
  const before = await getDebugState(page);
  const point = await mapPoint(map);
  await page.mouse.move(point.x, point.y);
  await page.mouse.wheel(0, -700);
  await waitForScaleChange(page, before.scale);
}

async function assertZoomControls(page) {
  let before = await getDebugState(page);
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await waitForScaleDirection(page, before.scale, "smaller");
  before = await getDebugState(page);
  await page.getByRole("button", { name: "Zoom out", exact: true }).click();
  await waitForScaleDirection(page, before.scale, "larger");
  await delay(350);
}

async function assertDoubleClickAndKeyboard(page, map) {
  let before = await getDebugState(page);
  const point = await mapPoint(map);
  await page.mouse.dblclick(point.x, point.y, { delay: 80 });
  await waitForScaleDirection(page, before.scale, "smaller");
  before = await getDebugState(page);
  const surface = page.locator(".esri-view-surface").first();
  await surface.focus();
  await page.keyboard.press("ArrowRight");
  await waitForExtentChange(page, before.extent);
}

async function assertParcelHit(page, map) {
  const expand = page.getByRole("button", {
    name: "Expand map layers panel",
    exact: true,
  });
  if ((await expand.count()) && (await expand.isVisible())) await expand.click();
  const card = page
    .locator("article")
    .filter({ has: page.getByText("Parcel Intelligence", { exact: true }) })
    .first();
  if (!(await card.isVisible())) {
    const details = page
      .locator("details")
      .filter({ has: page.getByText("Planning", { exact: true }) })
      .first();
    if (await details.count()) await details.locator("summary").first().click();
  }
  await card.waitFor({ timeout: 20_000 });
  const show = card.getByRole("button", {
    name: "Show Parcel Intelligence",
    exact: true,
  });
  if ((await show.count()) && (await show.isVisible())) await show.click();
  await waitForLayer(page, "parcel-intelligence", true, true);
  await page.waitForFunction(() => {
    const state = window.__cfsGetMapDebugState?.();
    return Boolean(state?.sampleParcel && Number.isFinite(state.sampleParcel.x) && Number.isFinite(state.sampleParcel.y));
  }, null, { timeout: 30_000 });
  const state = await getDebugState(page);
  const box = await map.boundingBox();
  const sample = state.sampleParcel;
  assert(box && sample, "No rendered parcel was available for hitTest.");
  assert(sample.x > 0 && sample.x < box.width && sample.y > 0 && sample.y < box.height);
  const attempt = await map.getAttribute("data-map-initialization-attempt");
  await page.mouse.click(box.x + sample.x, box.y + sample.y);
  await page.getByText(new RegExp(`Selected parcel: ${escapeRegExp(sample.parcelId)}`, "i")).first().waitFor({
    timeout: 30_000,
  });
  const viewport = page.locator('section[aria-label="Cabarrus County 2D map viewport"]');
  await viewport.getByText("Loading parcel intelligence", { exact: true }).waitFor({
    state: "hidden",
    timeout: 20_000,
  });
  await viewport.getByText("Static", { exact: true }).waitFor();
  assert.equal(
    await map.getAttribute("data-map-initialization-attempt"),
    attempt,
    "Parcel selection recreated MapView.",
  );
  return sample.parcelId;
}

async function assertParcelFocus(page, parcelId) {
  const clear = page.getByRole("button", { name: "Clear selected parcel", exact: true });
  if (await clear.count()) await clear.click();
  await selectParcelFromSearch(page, parcelId);
  await waitForLayer(page, "cfs-parcel-focus-layer", true, true);
}

async function selectParcelFromSearch(page, parcelId) {
  const search = page.getByRole("combobox", { name: "Search parcels" }).first();
  await search.fill(parcelId);
  const option = page.locator("#top-parcel-search-results").getByRole("option").filter({ hasText: parcelId }).first();
  await option.waitFor({ timeout: 30_000 });
  await option.click();
  await page.getByText(new RegExp(`Selected parcel: ${escapeRegExp(parcelId)}`, "i")).first().waitFor();
}

async function assertMapFocusMode(page) {
  const expand = page.getByRole("button", { name: "Expand map", exact: true });
  await expand.click();
  await page.getByRole("button", { name: "Exit map focus", exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Exit map focus", exact: true }).getAttribute("aria-pressed"), "true");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Expand map", exact: true }).waitFor();
}

async function assertOverlay(page, { group, layerId, title }) {
  const expand = page.getByRole("button", { name: "Expand map layers panel", exact: true });
  if ((await expand.count()) && (await expand.isVisible())) await expand.click();
  const card = page.locator("article").filter({ has: page.getByText(title, { exact: true }) }).first();
  if (!(await card.isVisible())) {
    const details = page.locator("details").filter({ has: page.getByText(group, { exact: true }) }).first();
    if (await details.count()) await details.locator("summary").first().click();
  }
  await card.waitFor({ timeout: 20_000 });
  if (title === "Development Hotspots") {
    await card
      .getByRole("combobox", {
        name: "Development hotspot permit segment filter",
      })
      .selectOption("residential_growth");
  }
  const hide = card.getByRole("button", { name: `Hide ${title}`, exact: true });
  if ((await hide.count()) && (await hide.isVisible())) await hide.click();
  await card.getByRole("button", { name: `Show ${title}`, exact: true }).click();
  await waitForLayer(page, layerId, true, true);
  const legend = card.getByRole("button", { name: /Legend Read the symbols/i });
  await legend.waitFor({ timeout: 20_000 });
  await card.getByRole("button", { name: `Hide ${title}`, exact: true }).click();
  await waitForLayer(page, layerId, false, false);
  await legend.waitFor({ state: "hidden", timeout: 20_000 });
}

async function assertModelLab(page) {
  await page.getByRole("button", { name: /Workspace:/ }).click();
  await page.getByTestId("command-center-model-lab").click();
  const expand = page.getByRole("button", { name: "Expand Model Lab panel", exact: true }).first();
  if ((await expand.count()) && (await expand.isVisible())) await expand.click();
  const panel = page.getByTestId("model-lab-controls");
  await panel.waitFor({ timeout: 30_000 });
  const toggle = panel.getByRole("button", { name: /^(?:On|Off)$/ }).first();
  if ((await toggle.getAttribute("aria-pressed")) !== "true") await toggle.click();
  await page.getByRole("button", { name: "Show Model Lab research as Points", exact: true }).click();
  await waitForLayer(page, "cfs-model-research-preview-layer", true, true);
}

async function assertSnapshot(page) {
  const capture = await page.evaluate(() => window.__cfsCaptureMapSnapshot?.());
  assert.equal(capture?.status, "captured", capture?.failureReason);
  assert.match(capture?.dataUrl ?? "", /^data:image\/png;base64,/);
  assert((capture?.dataUrl?.length ?? 0) > 1_000, "Interactive snapshot is empty.");
  assert.match(capture?.cameraSummary ?? "", /Center .* zoom/i);
  assert.match(capture?.extentSummary ?? "", /W .* S .* E .* N /i);
}

async function assertRoutes(page) {
  const before = await getDebugState(page);
  await selectAppMode(page, /CFS Planning/, /Economic Intelligence/);
  await page.getByRole("navigation", { name: "CFS Economics sections" }).waitFor({ timeout: 30_000 });
  await page.getByTestId("cfs-arcgis-map").waitFor({ state: "detached" });
  await selectAppMode(page, /CFS Economics/, /Planning Intelligence/);
  const returned = await assertInteractiveMap(page);
  assert(
    mapStatesNear(before, returned.state, 0.08),
    `Map navigation state was not preserved on route return: ${JSON.stringify({ before, returned: returned.state })}`,
  );

  await page.goBack();
  await page.getByRole("navigation", { name: "CFS Economics sections" }).waitFor({ timeout: 30_000 });
  await page.goForward();
  await assertInteractiveMap(page);
}

async function selectAppMode(page, currentName, targetName) {
  await page.getByRole("button", { name: currentName }).first().click();
  await page.getByRole("menuitemradio", { name: targetName }).click();
}

async function assertTouchNavigation(page, context) {
  const map = page.getByTestId("cfs-arcgis-map");
  await map.scrollIntoViewIfNeeded();
  const box = await map.boundingBox();
  assert(box, "Mobile map has no bounding box.");
  const viewport = page.viewportSize();
  assert(viewport, "Mobile viewport is unavailable.");
  const visibleTop = Math.max(0, box.y);
  const visibleBottom = Math.min(viewport.height, box.y + box.height);
  assert(visibleBottom - visibleTop > 180, "Mobile map has too little visible touch area.");
  const session = await context.newCDPSession(page);
  await session.send("Emulation.setTouchEmulationEnabled", {
    enabled: true,
    maxTouchPoints: 5,
  });
  let before = await getDebugState(page);
  const start = await page.evaluate(() => {
    const map = document.querySelector('[data-testid="cfs-arcgis-map"]');
    if (!map) return null;
    const rect = map.getBoundingClientRect();
    const left = Math.max(100, rect.left + 100);
    const right = Math.min(window.innerWidth - 100, rect.right - 100);
    const top = Math.max(60, rect.top + 60);
    const bottom = Math.min(window.innerHeight - 60, rect.bottom - 60);
    for (let y = top; y <= bottom; y += 24) {
      for (let x = left; x <= right; x += 24) {
        const target = document.elementFromPoint(x, y);
        if (target && map.contains(target) && target.closest(".esri-view-root")) {
          return { x: Math.round(x), y: Math.round(y) };
        }
      }
    }
    return null;
  });
  assert(start, "Mobile touch target does not reach the ArcGIS surface.");
  await session.send("Input.dispatchTouchEvent", {
    touchPoints: [{ ...start, force: 1, id: 1, radiusX: 5, radiusY: 5 }],
    type: "touchStart",
  });
  await delay(80);
  for (let step = 1; step <= 8; step += 1) {
    await session.send("Input.dispatchTouchEvent", {
      touchPoints: [
        {
          force: 1,
          id: 1,
          radiusX: 5,
          radiusY: 5,
          x: start.x + step * 9,
          y: start.y + step * 3,
        },
      ],
      type: "touchMove",
    });
    await delay(50);
  }
  await session.send("Input.dispatchTouchEvent", { touchPoints: [], type: "touchEnd" });
  await waitForExtentChange(page, before.extent);

  before = await getDebugState(page);
  const center = start;
  await session.send("Input.dispatchTouchEvent", {
    touchPoints: [
      { force: 1, id: 1, radiusX: 5, radiusY: 5, x: center.x - 18, y: center.y },
      { force: 1, id: 2, radiusX: 5, radiusY: 5, x: center.x + 18, y: center.y },
    ],
    type: "touchStart",
  });
  for (let step = 1; step <= 6; step += 1) {
    await session.send("Input.dispatchTouchEvent", {
      touchPoints: [
        {
          force: 1,
          id: 1,
          radiusX: 5,
          radiusY: 5,
          x: center.x - 18 - step * 7,
          y: center.y,
        },
        {
          force: 1,
          id: 2,
          radiusX: 5,
          radiusY: 5,
          x: center.x + 18 + step * 7,
          y: center.y,
        },
      ],
      type: "touchMove",
    });
    await delay(30);
  }
  await session.send("Input.dispatchTouchEvent", { touchPoints: [], type: "touchEnd" });
  await waitForScaleChange(page, before.scale);
  await session.detach();
}

async function installWebGlFailure(page) {
  await page.addInitScript(() => {
    let blocked = sessionStorage.getItem("cfs-test-webgl-restored") !== "true";
    const canvasGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      if (blocked && String(type).toLowerCase().startsWith("webgl")) return null;
      return canvasGetContext.call(this, type, ...args);
    };
    window.__cfsRestoreWebGL = () => {
      blocked = false;
      sessionStorage.setItem("cfs-test-webgl-restored", "true");
    };
  });
}

async function openExploreCountywide(page) {
  const button = page.getByTestId("command-center-explore-intelligence");
  if (await button.count()) await button.click();
}

async function assertHealthy(page) {
  const text = await page.locator("body").innerText();
  assert(!/Application error|Internal Server Error|Unhandled Runtime Error/i.test(text));
  assert(!/\b(?:NaN|undefined)\b/i.test(text));
}

async function assertStableAttempt(page) {
  const map = page.getByTestId("cfs-arcgis-map");
  const before = await map.getAttribute("data-map-initialization-attempt");
  await delay(2_000);
  assert.equal(await map.getAttribute("data-map-initialization-attempt"), before);
}

async function getDebugState(page) {
  const state = await page.evaluate(() => window.__cfsGetMapDebugState?.());
  assert(state, "MapView debug state is unavailable.");
  return state;
}

async function waitForLayer(page, id, visible, requireGraphics) {
  await page.waitForFunction(
    ({ id, requireGraphics, visible }) => {
      const layer = window.__cfsGetMapDebugState?.().layers.find((candidate) => candidate.id === id);
      return Boolean(
        layer &&
          layer.visible === visible &&
          (!requireGraphics || Number(layer.graphicsCount) > 0),
      );
    },
    { id, requireGraphics, visible },
    { timeout: 30_000 },
  );
}

async function waitForExtentChange(page, before) {
  await page.waitForFunction(
    (before) => {
      const next = window.__cfsGetMapDebugState?.().extent;
      if (!before || !next) return false;
      const beforeX = (before.xmin + before.xmax) / 2;
      const beforeY = (before.ymin + before.ymax) / 2;
      const nextX = (next.xmin + next.xmax) / 2;
      const nextY = (next.ymin + next.ymax) / 2;
      return Math.abs(nextX - beforeX) > 0.00001 || Math.abs(nextY - beforeY) > 0.00001;
    },
    before,
    { timeout: 20_000 },
  );
}

async function waitForScaleChange(page, before) {
  await page.waitForFunction(
    (before) => {
      const next = window.__cfsGetMapDebugState?.().scale;
      return Number.isFinite(next) && Math.abs(next - before) / before > 0.01;
    },
    before,
    { timeout: 20_000 },
  );
}

async function waitForScaleDirection(page, before, direction) {
  await page.waitForFunction(
    ({ before, direction }) => {
      const next = window.__cfsGetMapDebugState?.().scale;
      return Number.isFinite(next) && (direction === "smaller" ? next < before * 0.98 : next > before * 1.02);
    },
    { before, direction },
    { timeout: 20_000 },
  );
}

async function waitForReset(page, initial) {
  await page.waitForFunction(
    (initial) => {
      const state = window.__cfsGetMapDebugState?.();
      if (!state?.extent || !initial.extent || !Number.isFinite(state.zoom) || !Number.isFinite(initial.zoom)) return false;
      const width = initial.extent.xmax - initial.extent.xmin;
      const height = initial.extent.ymax - initial.extent.ymin;
      const initialX = (initial.extent.xmin + initial.extent.xmax) / 2;
      const initialY = (initial.extent.ymin + initial.extent.ymax) / 2;
      const nextX = (state.extent.xmin + state.extent.xmax) / 2;
      const nextY = (state.extent.ymin + state.extent.ymax) / 2;
      return (
        Math.abs(state.zoom - initial.zoom) < 0.4 &&
        Math.abs(nextX - initialX) < width * 0.05 &&
        Math.abs(nextY - initialY) < height * 0.05
      );
    },
    initial,
    { timeout: 20_000 },
  );
}

async function mapPoint(map) {
  const box = await map.boundingBox();
  assert(box, "Map has no bounding box.");
  return { x: box.x + box.width * 0.58, y: box.y + box.height * 0.46 };
}

async function assertPainted(image, label) {
  const { default: sharp } = await import("sharp");
  const stats = await sharp(image).stats();
  const deviation = Math.max(...stats.channels.slice(0, 3).map((channel) => channel.stdev));
  assert(deviation >= 4, `${label} is visually uniform (${deviation.toFixed(2)}).`);
}

async function assertArcGisAssets() {
  const response = await fetch(`${BASE_URL}/arcgis-assets/manifest.json`, {
    headers: PROTECTION_HEADERS,
  });
  assert.equal(response.status, 200, "ArcGIS asset manifest did not return 200.");
  const value = await response.json();
  assert.match(value.sdkVersion ?? "", /^\d+\.\d+\.\d+$/);
  assert.equal(value.assetsPath, `/arcgis-assets/${value.sdkVersion}`);
  assert(Array.isArray(value.assets) && value.assets.length === value.assetCount);
  assert(value.assetCount > 100, "ArcGIS asset manifest is unexpectedly small.");
  assert(value.totalBytes > 0);
  const representatives = [
    ["workers", (asset) => /\/workers\//.test(asset.path)],
    ["WASM", (asset) => asset.path.endsWith(".wasm")],
    ["images", (asset) => /\/images\//.test(asset.path)],
    ["localization", (asset) => /\/t9n\//.test(asset.path)],
    ["symbols", (asset) => /\/symbols\//.test(asset.path)],
  ];
  for (const [category, predicate] of representatives) {
    const asset = value.assets.find(predicate);
    assert(asset, `ArcGIS manifest has no ${category} asset.`);
    assert.match(asset.checksum ?? "", /^[a-f0-9]{64}$/);
    const assetResponse = await fetch(`${BASE_URL}${value.assetsPath}/${asset.path}`, {
      headers: PROTECTION_HEADERS,
    });
    assert.equal(assetResponse.status, 200, `${category} ArcGIS asset returned ${assetResponse.status}.`);
    assert((await assetResponse.arrayBuffer()).byteLength > 0, `${category} ArcGIS asset is empty.`);
  }
  return value;
}

function validExtent(extent) {
  return Boolean(
    extent &&
      [extent.xmin, extent.ymin, extent.xmax, extent.ymax].every(Number.isFinite) &&
      extent.xmin < extent.xmax &&
      extent.ymin < extent.ymax,
  );
}

function mapStatesNear(left, right, tolerance) {
  if (
    !validExtent(left.extent) ||
    !validExtent(right.extent) ||
    !Number.isFinite(left.scale) ||
    !Number.isFinite(right.scale)
  ) {
    return false;
  }
  const width = left.extent.xmax - left.extent.xmin;
  const height = left.extent.ymax - left.extent.ymin;
  return (
    Math.abs(
      (left.extent.xmin + left.extent.xmax - right.extent.xmin - right.extent.xmax) / 2,
    ) < width * tolerance &&
    Math.abs(
      (left.extent.ymin + left.extent.ymax - right.extent.ymin - right.extent.ymax) / 2,
    ) < height * tolerance &&
    Math.abs(right.scale - left.scale) < left.scale * tolerance
  );
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function pass(name) {
  assert(REQUIRED_CASES.includes(name), `Unknown interactive-map case: ${name}`);
  proof.add(name);
  console.log(`PASS interactive-map case ${REQUIRED_CASES.indexOf(name) + 1}: ${name}`);
}
