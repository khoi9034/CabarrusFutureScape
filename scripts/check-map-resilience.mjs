import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { chromium } from "playwright-core";
import { setTimeout as delay } from "node:timers/promises";

const baseUrl = (
  process.env.CFS_MAP_BASE_URL ??
  process.env.CFS_DEMO_BASE_URL ??
  "http://127.0.0.1:3000"
).replace(/\/$/, "");
const executablePath = [
  process.env.CFS_BROWSER_EXECUTABLE,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
].find((path) => path && existsSync(path));
assert(executablePath, "Chrome or Edge was not found.");

const browser = await chromium.launch({
  executablePath,
  headless: true,
});
const results = [];
const diagnostics = {
  console: [],
  expectedAssetErrors: [],
  expectedRendererErrors: [],
  loops: [],
  pageErrors: [],
  requestFailures: [],
};
const forcedWebGlScenarios = new Set([
  "WebGL unavailable",
  "retry and stale-attempt cancellation",
]);

async function run(name, configure = async () => {}, verify = async () => {}) {
  const context = await browser.newContext();
  const counts = new Map();
  context.on("request", (request) => {
    const count = (counts.get(request.url()) ?? 0) + 1;
    counts.set(request.url(), count);
    if (count === 26) diagnostics.loops.push(request.url());
  });
  context.on("requestfailed", (request) => {
    const url = new URL(request.url());
    if (
      url.origin === new URL(baseUrl).origin &&
      !url.pathname.startsWith("/arcgis-assets/")
    ) {
      diagnostics.requestFailures.push(
        `${name}: ${request.failure()?.errorText} ${url}`,
      );
    }
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => {
    if (
      forcedWebGlScenarios.has(name) &&
      error.message === "s" &&
      !error.stack
    ) {
      diagnostics.expectedRendererErrors.push(name);
      return;
    }
    diagnostics.pageErrors.push(
      `${name}: ${error.stack || error.message || error.name}`,
    );
  });
  page.on("console", (message) => {
    if (message.type() !== "error" || /Font .* is not available/.test(message.text())) {
      return;
    }
    if (
      name === "ArcGIS asset failure" &&
      message.text() === "Failed to load resource: net::ERR_FAILED"
    ) {
      diagnostics.expectedAssetErrors.push(name);
      return;
    }
    diagnostics.console.push(`${name}: ${message.text()}`);
  });
  await configure(context, page);
  await page.goto(`${baseUrl}/?app=planning`, {
    waitUntil: "domcontentloaded",
    timeout: 45_000,
  });
  await assertUsableMap(page);
  await verify(context, page);
  results.push(name);
  await context.close();
  console.log(`PASS map resilience: ${name}`);
}

try {
  await run("normal clean context");
  await run("second clean context");
  await run("third clean context");
  await run(
    "slow ArcGIS assets",
    async (context) => {
      await context.route("**/arcgis-assets/**", async (route) => {
        await delay(1_500);
        await route.continue();
      });
    },
  );
  await run(
    "ArcGIS asset failure",
    async (context) => {
      await context.route("**/arcgis-assets/**", (route) =>
        route.abort("failed"),
      );
    },
  );
  await run(
    "WebGL unavailable",
    async (_context, page) => {
      await page.addInitScript(() => {
        const getContext = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (type, ...args) {
          if (String(type).startsWith("webgl")) return null;
          return getContext.call(this, type, ...args);
        };
      });
    },
  );
  await run(
    "external ArcGIS blocked",
    async (context) => {
      await context.route("**/*", (route) => {
        const url = new URL(route.request().url());
        const externalArcGis =
          url.origin !== new URL(baseUrl).origin &&
          /(?:arcgis|esri)/i.test(url.hostname);
        return externalArcGis
          ? route.abort("blockedbyclient")
          : route.continue();
      });
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
    },
  );
  await run(
    "retry and stale-attempt cancellation",
    async (_context, page) => {
      await page.addInitScript(() => {
        const getContext = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (type, ...args) {
          if (String(type).startsWith("webgl")) return null;
          return getContext.call(this, type, ...args);
        };
      });
    },
    async (_context, page) => {
      const retry = page.getByRole("button", {
        name: "Retry interactive map",
      });
      await retry.waitFor({ timeout: 20_000 });
      await retry.click();
      await assertUsableMap(page);
      await page.goto(`${baseUrl}/?app=economics`, {
        waitUntil: "domcontentloaded",
      });
      await delay(500);
    },
  );
  await run(
    "route return and repeated refresh",
    async () => {},
    async (_context, page) => {
      await page.goto(`${baseUrl}/?app=economics`, {
        waitUntil: "domcontentloaded",
      });
      await page.goto(`${baseUrl}/?app=planning`, {
        waitUntil: "domcontentloaded",
      });
      await assertUsableMap(page);
      for (let index = 0; index < 2; index += 1) {
        await page.reload({ waitUntil: "domcontentloaded" });
        await assertUsableMap(page);
      }
    },
  );
  await run(
    "parcel focus and overlays",
    async () => {},
    async (_context, page) => {
      const map = page.getByTestId("cfs-local-context-map");
      for (const layer of [
        "county-boundary",
        "hydrography",
        "municipal-boundaries",
        "major-roads",
        "place-labels",
      ]) {
        assert(
          (await map.locator(`[data-layer-id="${layer}"]`).count()) > 0,
          `${layer} is missing from static context.`,
        );
      }
      await page.getByRole("button", { name: "Zoom in" }).click();
      await page.getByRole("button", { name: "Zoom out" }).click();
      await page
        .getByRole("button", { name: "Reset to Cabarrus County" })
        .click();
    },
  );

  for (const asset of [
    "/arcgis-assets/esri/geometry/support/pe-wasm.wasm",
    "/arcgis-assets/esri/core/workers/RemoteClient.js",
    "/arcgis-assets/esri/core/libs/libtess/libtess-f32.wasm",
    "/arcgis-assets/esri/widgets/Zoom/t9n/Zoom_en.json",
  ]) {
    const response = await fetch(`${baseUrl}${asset}`);
    assert.equal(response.status, 200, `${asset} did not return 200.`);
    assert(Number(response.headers.get("content-length") ?? 1) > 0);
  }
  results.push("required ArcGIS assets");

  assert.deepEqual(diagnostics.loops, [], "A map request loop was detected.");
  assert.deepEqual(
    diagnostics.pageErrors,
    [],
    `Uncaught map errors: ${diagnostics.pageErrors.join(" | ")}`,
  );
  assert.deepEqual(
    diagnostics.console,
    [],
    `Map console errors: ${diagnostics.console.join(" | ")}`,
  );
  assert.deepEqual(
    diagnostics.requestFailures,
    [],
    `Same-origin map request failures: ${diagnostics.requestFailures.join(" | ")}`,
  );
  console.log(
    JSON.stringify(
      {
        assets: 4,
        expected_forced_asset_errors: diagnostics.expectedAssetErrors.length,
        expected_forced_webgl_errors:
          diagnostics.expectedRendererErrors.length,
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

async function assertUsableMap(page) {
  const map = page.getByTestId("cfs-arcgis-map");
  const fallback = page.getByTestId("cfs-local-context-map");
  await map.waitFor({ state: "attached", timeout: 30_000 });
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-testid="cfs-arcgis-map"]')
        ?.getAttribute("data-context-ready") === "true",
    null,
    { timeout: 30_000 },
  );
  await fallback.waitFor({ state: "visible" });
  const box = await fallback.boundingBox();
  assert(box && box.width > 250 && box.height > 250, "Map has zero dimensions.");
  const geometryCount = await fallback
    .locator("path, polygon, polyline, circle, text")
    .count();
  assert(geometryCount > 10, "Static map context is blank.");
  const rendererState = await map.getAttribute("data-map-renderer-state");
  assert(
    [
      "loading_interactive",
      "interactive_ready",
      "degraded_static",
    ].includes(rendererState),
    `Unexpected map renderer state: ${rendererState}`,
  );
  assert.equal(
    await page.getByText("Interactive MapView unavailable", { exact: true }).count(),
    0,
    "A blocking interactive-map error replaced usable context.",
  );
  for (const control of [
    "Zoom in",
    "Zoom out",
    "Reset to Cabarrus County",
  ]) {
    await page.getByRole("button", { name: control }).waitFor();
  }
}
