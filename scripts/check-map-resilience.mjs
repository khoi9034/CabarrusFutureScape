import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright-core";

const baseUrl = (
  process.env.CFS_MAP_BASE_URL ??
  process.env.CFS_DEMO_BASE_URL ??
  "http://127.0.0.1:3000"
).replace(/\/$/, "");
const origin = new URL(baseUrl).origin;
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
  pageErrors: [],
  requestFailures: [],
};

async function run(
  name,
  configure = async () => {},
  verify = async () => {},
  expectedRenderer = "interactive",
) {
  const context = await browser.newContext();
  const counts = new Map();
  context.on("request", (request) => {
    const url = new URL(request.url());
    const count = (counts.get(request.url()) ?? 0) + 1;
    counts.set(request.url(), count);
    if (count === 26) diagnostics.loops.push(`${name}: ${request.url()}`);
    if (url.pathname.startsWith("/arcgis-assets/")) {
      diagnostics.arcgisAssetRequests.add(url.href);
    }
    if (url.origin !== origin && /(?:arcgis|esri)/i.test(url.hostname)) {
      diagnostics.externalArcgisRequests.push(`${name}: ${url.href}`);
    }
  });
  context.on("requestfailed", (request) => {
    const url = new URL(request.url());
    if (
      (name === "ArcGIS asset failure" &&
        url.pathname.startsWith("/arcgis-assets/")) ||
      (name === "required context failure" &&
        url.pathname.endsWith("/demo_transportation_context.geojson"))
    ) {
      diagnostics.expectedRendererErrors.push(`${name}: ${url.href}`);
      return;
    }
    if (url.origin === origin) {
      diagnostics.requestFailures.push(
        `${name}: ${request.failure()?.errorText ?? "failed"} ${url.href}`,
      );
    }
  });
  const page = await context.newPage();
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) counts.clear();
  });
  page.on("pageerror", (error) => {
    if (expectedRenderer === "static" && error.message === "s" && !error.stack) {
      diagnostics.expectedRendererErrors.push(`${name}: pageerror ${error.message}`);
      return;
    }
    diagnostics.pageErrors.push(`${name}: ${error.stack || error.message || error.name}`);
  });
  page.on("console", (message) => {
    if (!['error', 'warning'].includes(message.type())) return;
    const text = message.text();
    if (/GL Driver Message.*GPU stall due to ReadPixels/.test(text)) return;
    if (
      name === "ArcGIS asset failure" &&
      (message.location().url.includes("/arcgis-assets/") ||
        /wasm streaming compile failed|falling back to ArrayBuffer|failed to asynchronously prepare wasm|Aborted\(both async and sync fetching/i.test(
          text,
        ))
    ) {
      diagnostics.expectedRendererErrors.push(`${name}: console ${text}`);
      return;
    }
    if (
      name === "required context failure" &&
      message.location().url.endsWith("/demo_transportation_context.geojson")
    ) {
      diagnostics.expectedRendererErrors.push(`${name}: console ${text}`);
      return;
    }
    if (expectedRenderer === "static" && /webgl|rendering-error/i.test(text)) {
      diagnostics.expectedRendererErrors.push(`${name}: console ${text}`);
      return;
    }
    diagnostics.console.push(`${name}: ${message.type()}: ${text}`);
  });

  await configure(context, page);
  try {
    await page.goto(`${baseUrl}/?app=planning`, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    if (expectedRenderer === "interactive") {
      await assertInteractiveMap(page);
    } else {
      await assertEmergencyFallback(page);
    }
    await verify(context, page);
    results.push(name);
    console.log(`PASS map resilience: ${name}`);
  } finally {
    await context.close();
  }
}

try {
  await run("normal clean context");
  await run("second clean context");
  await run("third clean context");
  let delayedAssetRequests = 0;
  await run(
    "slow ArcGIS assets",
    async (context) => {
      await context.route("**/arcgis-assets/**", async (route) => {
        delayedAssetRequests += 1;
        await delay(1_500);
        await route.continue();
      });
    },
    async () => {
      assert(delayedAssetRequests > 0, "No ArcGIS asset request was delayed.");
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
  );
  await run("external ArcGIS blocked", async (context) => {
    await context.route("**/*", (route) => {
      const url = new URL(route.request().url());
      return url.origin !== origin && /(?:arcgis|esri)/i.test(url.hostname)
        ? route.abort("blockedbyclient")
        : route.continue();
    });
  });
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
    async (_context, page) => {
      const map = page.getByTestId("cfs-arcgis-map");
      const previousAttempt = Number(
        (await map.getAttribute("data-map-initialization-attempt")) ?? 0,
      );
      await page.evaluate(() => window.__cfsRestoreWebGl?.());
      await Promise.all([
        page.waitForNavigation({ timeout: 30_000, waitUntil: "domcontentloaded" }),
        page.getByRole("button", { name: "Retry interactive map" }).click(),
      ]);
      await assertInteractiveMap(page);
      assert(
        Number(await map.getAttribute("data-map-initialization-attempt")) > previousAttempt ||
          Number(await map.getAttribute("data-map-initialization-attempt")) === 1,
        "Retry did not create a fresh MapView initialization attempt.",
      );
    },
    "static",
  );
  await run(
    "route return and repeated refresh",
    async () => {},
    async (_context, page) => {
      await page.goto(`${baseUrl}/?app=economics`, { waitUntil: "domcontentloaded" });
      await page.goto(`${baseUrl}/?app=planning`, { waitUntil: "domcontentloaded" });
      await assertInteractiveMap(page);
      for (let index = 0; index < 10; index += 1) {
        await page.reload({ waitUntil: "domcontentloaded" });
        await assertInteractiveMap(page);
      }
      for (let index = 0; index < 10; index += 1) {
        await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
        await page.goto(`${baseUrl}/?app=planning`, { waitUntil: "domcontentloaded" });
        await assertInteractiveMap(page);
      }
      await page.goto(`${baseUrl}/?app=economics`, { waitUntil: "domcontentloaded" });
      await page.goBack({ waitUntil: "domcontentloaded" });
      await assertInteractiveMap(page);
      await page.goForward({ waitUntil: "domcontentloaded" });
      await page.goBack({ waitUntil: "domcontentloaded" });
      await assertInteractiveMap(page);
    },
  );
  await run(
    "parcel focus and overlays",
    async () => {},
    async (_context, page) => {
      await page.getByTestId("command-center-explore-intelligence").click();
      const expand = page.getByRole("button", {
        name: "Expand map layers panel",
        exact: true,
      });
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
      await assertRuntimeLayers(page, [
        "county-boundary",
        "cfs-local-hydrography",
        "cfs-local-municipalities",
        "transportation-context",
        "cfs-local-place-labels",
        "parcel-intelligence",
      ]);
      await page.getByRole("button", { name: "Zoom in" }).click();
      await page.getByRole("button", { name: "Zoom out" }).click();
      await page.getByRole("button", { name: "Reset to Cabarrus County" }).click();
    },
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

  assert.deepEqual(diagnostics.loops, [], "A map request loop was detected.");
  assert.deepEqual(diagnostics.pageErrors, [], `Uncaught map errors: ${diagnostics.pageErrors.join(" | ")}`);
  assert.deepEqual(diagnostics.console, [], `Map console errors: ${diagnostics.console.join(" | ")}`);
  assert.deepEqual(
    diagnostics.requestFailures,
    [],
    `Same-origin map request failures: ${diagnostics.requestFailures.join(" | ")}`,
  );
  assert.deepEqual(
    diagnostics.externalArcgisRequests,
    [],
    `External ArcGIS requests: ${diagnostics.externalArcgisRequests.join(" | ")}`,
  );
  console.log(
    JSON.stringify(
      {
        arcgis_sdk_version: manifest.sdkVersion,
        expected_forced_renderer_errors: diagnostics.expectedRendererErrors.length,
        failed: 0,
        scenarios: results.length,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
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
  assert.equal(await map.getAttribute("data-basemap-mode"), "same-origin");
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
  await assertRuntimeLayers(page, [
    "county-boundary",
    "cfs-local-hydrography",
    "cfs-local-municipalities",
    "transportation-context",
    "cfs-local-place-labels",
  ]);
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
