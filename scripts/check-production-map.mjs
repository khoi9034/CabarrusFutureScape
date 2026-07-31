import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright-core";
import { setTimeout as delay } from "node:timers/promises";

const baseUrl = (
  process.env.CFS_PRODUCTION_MAP_URL ??
  "https://cabarrus-future-scape.vercel.app"
).replace(/\/$/, "");
assert(
  !["127.0.0.1", "localhost", "::1"].includes(new URL(baseUrl).hostname),
  "Production map canary must target a deployed site.",
);
const executablePath = [
  process.env.CFS_BROWSER_EXECUTABLE,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
].find((candidate) => candidate && existsSync(candidate));
assert(executablePath, "Chrome or Edge was not found.");
const screenshotDir =
  process.env.CFS_PRODUCTION_MAP_SCREENSHOT_DIR ??
  path.join(tmpdir(), "cfs-production-map-canary");
await mkdir(screenshotDir, { recursive: true });
const productionAssets = await verifyProductionAssets();

const scenarios = [
  ...Array.from({ length: 5 }, (_, index) => ({
    label: `desktop-${index + 1}`,
    viewport: { height: 1000, width: 1440 },
  })),
  ...Array.from({ length: 3 }, (_, index) => ({
    label: `mobile-${index + 1}`,
    viewport: { height: 844, width: 390 },
  })),
  {
    blockExternalArcGis: true,
    label: "desktop-external-arcgis-blocked",
    viewport: { height: 1000, width: 1440 },
  },
  {
    label: "desktop-slow-network",
    slowNetwork: true,
    viewport: { height: 1000, width: 1440 },
  },
];

const browser = await chromium.launch({ executablePath, headless: true });
const results = [];

try {
  for (const scenario of scenarios) {
    const context = await browser.newContext({ viewport: scenario.viewport });
    const diagnostics = {
      arcgisRequests: [],
      console: [],
      failedRequests: [],
      pageErrors: [],
      requestCounts: new Map(),
    };
    context.on("request", (request) => {
      const url = request.url();
      diagnostics.requestCounts.set(
        url,
        (diagnostics.requestCounts.get(url) ?? 0) + 1,
      );
      const parsed = new URL(url);
      if (
        parsed.pathname.startsWith("/arcgis-assets/") ||
        /(?:arcgis|esri)/i.test(parsed.hostname)
      ) {
        diagnostics.arcgisRequests.push(url);
      }
    });
    context.on("requestfailed", (request) => {
      const url = new URL(request.url());
      const expectedBlocked =
        scenario.blockExternalArcGis &&
        url.origin !== new URL(baseUrl).origin &&
        /(?:arcgis|esri)/i.test(url.hostname);
      if (!expectedBlocked) {
        diagnostics.failedRequests.push(
          `${request.failure()?.errorText ?? "failed"} ${request.url()}`,
        );
      }
    });
    if (scenario.blockExternalArcGis) {
      await context.route("**/*", (route) => {
        const url = new URL(route.request().url());
        return url.origin !== new URL(baseUrl).origin &&
          /(?:arcgis|esri)/i.test(url.hostname)
          ? route.abort("blockedbyclient")
          : route.continue();
      });
    } else if (scenario.slowNetwork) {
      await context.route("**/demo-data/**", async (route) => {
        await delay(300);
        await route.continue();
      });
    }

    const page = await context.newPage();
    page.on("pageerror", (error) => diagnostics.pageErrors.push(error.message));
    page.on("console", (message) => {
      const reactWarning =
        message.type() === "warning" &&
        /React|hydration|unique .* key/i.test(message.text());
      if (message.type() === "error" || reactWarning) {
        diagnostics.console.push(`${message.type()}: ${message.text()}`);
      }
    });

    try {
      const startedAt = Date.now();
      await page.goto(`${baseUrl}/?app=planning`, {
        timeout: 45_000,
        waitUntil: "domcontentloaded",
      });
      const map = page.getByTestId("cfs-arcgis-map");
      await page.waitForFunction(
        () => {
          const element = document.querySelector(
            '[data-testid="cfs-arcgis-map"]',
          );
          return (
            element?.getAttribute("data-map-renderer") === "static" &&
            element.getAttribute("data-static-context-ready") === "true" &&
            element.getAttribute("data-map-renderer-state") === "static_ready" &&
            element.getAttribute("data-arcgis-runtime-state") === "disabled" &&
            element.getAttribute("data-arcgis-view-state") === "disabled"
          );
        },
        null,
        { timeout: 15_000 },
      );
      const geographyVisibleMs = Date.now() - startedAt;
      const staticMap = page.getByTestId("cfs-local-context-map");
      const state = await page.evaluate(() => {
        const interactive = document.querySelector(
          '[data-testid="cfs-arcgis-map"]',
        );
        const svg = document.querySelector(
          '[data-testid="cfs-local-context-map"]',
        );
        const box = svg?.getBoundingClientRect();
        return {
          arcgisOpacity: Number(
            interactive ? getComputedStyle(interactive).opacity : 0,
          ),
          height: box?.height ?? 0,
          staticOpacity: Number(svg ? getComputedStyle(svg).opacity : 0),
          width: box?.width ?? 0,
        };
      });
      assert(state.width > 250 && state.height > 250, "Map has zero dimensions.");
      assert(state.staticOpacity >= 0.99, "Static map is transparent.");
      assert(state.arcgisOpacity <= 0.01, "Unproven ArcGIS surface is visible.");
      assert.equal(await map.getAttribute("data-interactive-ready"), "false");
      assert.equal(await map.getAttribute("data-map-fatal"), "false");
      assert.equal(await map.getAttribute("data-arcgis-runtime-state"), "disabled");
      assert.equal(await map.getAttribute("data-arcgis-view-state"), "disabled");
      const countyPath = await staticMap
        .locator('[data-layer-id="county-boundary"]')
        .getAttribute("d");
      assert(countyPath?.trim(), "County path is empty.");
      assert(!/NaN|Infinity/.test(countyPath), "County path is invalid.");
      const roads = await staticMap
        .locator('[data-layer-id="major-roads"] path')
        .count();
      const labels = await staticMap
        .locator('[data-layer-id="place-labels"] text')
        .count();
      assert(roads > 0, "Road context is empty.");
      assert(labels >= 6, "Place-label context is incomplete.");
      assert.equal(
        await page
          .getByText("Interactive MapView unavailable", { exact: true })
          .count(),
        0,
      );
      assert.equal(
        await page
          .getByText("Interactive enhancement unavailable", { exact: true })
          .count(),
        0,
      );
      assert.equal(
        await page
          .getByText("Cabarrus County map unavailable", { exact: true })
          .count(),
        0,
      );

      const zoomIn = page.getByRole("button", { name: "Zoom in", exact: true });
      const zoomOut = page.getByRole("button", { name: "Zoom out", exact: true });
      const resetCounty = page.getByRole("button", {
        name: "Reset to Cabarrus County",
        exact: true,
      });
      for (const control of [zoomIn, zoomOut, resetCounty]) {
        await control.waitFor();
        assert.equal(await control.isEnabled(), true, "Map control is disabled.");
      }
      const countyViewBox = await staticMap.getAttribute("viewBox");
      await zoomIn.click();
      await expectMapZoom(page, "1");
      assert.notEqual(await staticMap.getAttribute("viewBox"), countyViewBox);
      await zoomOut.click();
      await expectMapZoom(page, "0");
      assert.equal(await staticMap.getAttribute("viewBox"), countyViewBox);
      await zoomIn.click();
      await expectMapZoom(page, "1");
      await resetCounty.click();
      await expectMapZoom(page, "0");
      assert.equal(await staticMap.getAttribute("viewBox"), countyViewBox);

      const search = page.getByRole("combobox", { name: "Search parcels" });
      await search.fill("CFS-PARCEL-0149780354");
      const result = page
        .locator("#top-parcel-search-results")
        .getByRole("option")
        .filter({ hasText: "CFS-PARCEL-0149780354" });
      await result.waitFor({ timeout: 20_000 });
      assert.equal(await result.count(), 1, "Parcel search result is ambiguous.");
      await result.click();
      await staticMap
        .locator('[data-layer-id="selected-parcel"]')
        .waitFor({ timeout: 20_000 });

      const screenshot = path.join(screenshotDir, `${scenario.label}.png`);
      const paintedMap = await staticMap.screenshot({ path: screenshot });
      await assertPaintedImage(paintedMap, scenario.label);

      const showLayers = page.getByRole("button", {
        name: "Show Layers",
        exact: true,
      });
      if ((await showLayers.count()) === 1) {
        await showLayers.click();
      }
      const expandLayers = page.getByRole("button", {
        name: "Expand map layers panel",
      });
      if ((await expandLayers.count()) === 1) {
        await expandLayers.click();
      }
      const developmentCard = page.locator("article").filter({
        has: page.getByText("Development Hotspots", { exact: true }),
      });
      assert.equal(await developmentCard.count(), 1);
      const beforeOverlay = await captureStaticSvg(staticMap);
      await developmentCard
        .getByRole("combobox", {
          name: "Development hotspot permit segment filter",
        })
        .selectOption("residential_growth");
      const showDevelopment = developmentCard.getByRole("button", {
        exact: true,
        name: "Show Development Hotspots",
      });
      assert.equal(await showDevelopment.count(), 1);
      await showDevelopment.click();
      await staticMap
        .locator('[data-layer-id="development-hotspots"] circle')
        .first()
        .waitFor({ timeout: 20_000 });
      await assertImageDifference(
        beforeOverlay,
        await captureStaticSvg(staticMap),
        `${scenario.label} development overlay`,
      );
      assert.deepEqual(diagnostics.arcgisRequests, [], "Demo requested ArcGIS.");
      assert.deepEqual(diagnostics.console, [], "Browser console errors occurred.");
      assert.deepEqual(diagnostics.failedRequests, [], "Requests failed.");
      assert.deepEqual(diagnostics.pageErrors, [], "Unhandled page errors occurred.");
      const loops = [...diagnostics.requestCounts.entries()].filter(
        ([, count]) => count > 25,
      );
      assert.deepEqual(loops, [], "A request loop was detected.");

      results.push({
        geographyVisibleMs,
        labels,
        roads,
        scenario: scenario.label,
        screenshot,
      });
      console.log(
        `PASS production map: ${scenario.label} (${geographyVisibleMs}ms)`,
      );
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}

console.log(
  JSON.stringify(
    {
      desktop: results.filter((result) => result.scenario.startsWith("desktop"))
        .length,
      failed: 0,
      mobile: results.filter((result) => result.scenario.startsWith("mobile"))
        .length,
      production_url: baseUrl,
      production_assets: productionAssets,
      results,
      sessions: results.length,
    },
    null,
    2,
  ),
);

async function assertPaintedImage(image, label) {
  const { default: sharp } = await import("sharp");
  const stats = await sharp(image).stats();
  const deviation = Math.max(
    ...stats.channels.slice(0, 3).map((channel) => channel.stdev),
  );
  assert(deviation >= 4, `${label} map is visually uniform (${deviation}).`);
}

async function captureStaticSvg(staticMap) {
  const markup = await staticMap.evaluate((source) => {
    const clone = source.cloneNode(true);
    clone.removeAttribute("class");
    clone.setAttribute("height", "650");
    clone.setAttribute("width", "1000");
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    return new XMLSerializer().serializeToString(clone);
  });
  return Buffer.from(markup);
}

async function expectMapZoom(page, expected) {
  await page.waitForFunction(
    (zoom) =>
      document
        .querySelector('[data-testid="cfs-arcgis-map"]')
        ?.getAttribute("data-map-zoom") === zoom,
    expected,
  );
}

async function verifyProductionAssets() {
  const assets = [
    ["/demo-data/map_layers/demo_county_boundary.geojson", "features", 1],
    ["/demo-data/map_layers/demo_municipal_boundaries.geojson", "features", 6],
    ["/demo-data/map_layers/demo_hydrography.geojson", "features", 1],
    ["/demo-data/map_layers/demo_transportation_context.geojson", "features", 1],
    ["/demo-data/map_layers/demo_place_labels.geojson", "features", 6],
    ["/demo-data/map_layers/demo_parcels.geojson", "features", 1],
    ["/demo-data/map_layers/demo_development_hotspots.geojson", "features", 1],
    ["/demo-data/map_layers/demo_floodplain_review.geojson", "features", 1],
    ["/demo-data/map_layers/demo_school_capacity.geojson", "features", 1],
    ["/demo-data/map_layers/demo_school_pressure_areas.geojson", "features", 1],
    ["/demo-data/model_lab_demo_clusters.json", "markers", 1],
  ];

  return Promise.all(
    assets.map(async ([assetPath, collection, minimum]) => {
      const response = await fetch(`${baseUrl}${assetPath}`, {
        signal: AbortSignal.timeout(15_000),
      });
      assert.equal(response.status, 200, `${assetPath} returned ${response.status}.`);
      assert.match(
        response.headers.get("content-type") ?? "",
        /json/i,
        `${assetPath} is not served as JSON.`,
      );
      assert(
        response.headers.get("cache-control"),
        `${assetPath} has no cache-control header.`,
      );
      const payload = await response.json();
      const count = Array.isArray(payload[collection])
        ? payload[collection].length
        : 0;
      assert(count >= minimum, `${assetPath} contains no usable ${collection}.`);
      validateProductionCoordinates(payload, collection, assetPath);
      return { count, path: assetPath };
    }),
  );
}

function validateProductionCoordinates(payload, collection, assetPath) {
  const coordinatePairs = [];
  if (collection === "features") {
    for (const feature of payload.features ?? []) {
      collectCoordinatePairs(feature.geometry?.coordinates, coordinatePairs);
    }
  } else {
    for (const marker of payload.markers ?? []) {
      coordinatePairs.push([
        marker.centroid?.longitude ?? marker.longitude,
        marker.centroid?.latitude ?? marker.latitude,
      ]);
    }
  }
  assert(coordinatePairs.length > 0, `${assetPath} has no coordinates.`);
  for (const [longitude, latitude] of coordinatePairs) {
    assert(
      Number.isFinite(longitude) && Number.isFinite(latitude),
      `${assetPath} contains non-finite coordinates.`,
    );
    assert(
      longitude >= -81.5 && longitude <= -79.5 &&
        latitude >= 34.5 && latitude <= 36.5,
      `${assetPath} has implausible Cabarrus coordinates: ${longitude}, ${latitude}.`,
    );
  }
}

function collectCoordinatePairs(value, pairs) {
  if (!Array.isArray(value)) return;
  if (
    value.length >= 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number"
  ) {
    pairs.push([value[0], value[1]]);
    return;
  }
  value.forEach((nested) => collectCoordinatePairs(nested, pairs));
}

async function assertImageDifference(before, after, label) {
  const { default: sharp } = await import("sharp");
  const left = await sharp(before).ensureAlpha().raw().toBuffer({
    resolveWithObject: true,
  });
  const right = await sharp(after).ensureAlpha().raw().toBuffer({
    resolveWithObject: true,
  });
  assert.equal(left.info.width, right.info.width, `${label} width changed.`);
  assert.equal(left.info.height, right.info.height, `${label} height changed.`);
  let difference = 0;
  for (let index = 0; index < left.data.length; index += 4) {
    difference +=
      Math.abs(left.data[index] - right.data[index]) +
      Math.abs(left.data[index + 1] - right.data[index + 1]) +
      Math.abs(left.data[index + 2] - right.data[index + 2]);
  }
  const mean = difference / (left.info.width * left.info.height * 3);
  assert(mean >= 0.05, `${label} produced no visible pixel change (${mean}).`);
}
