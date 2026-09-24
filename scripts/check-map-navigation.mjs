import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright-core";

const baseUrl = (process.env.CFS_MAP_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const executablePath = [
  process.env.CFS_BROWSER_EXECUTABLE,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
].find((path) => path && existsSync(path));

assert(executablePath, "Chrome or Edge was not found.");

const browser = await chromium.launch({ executablePath, headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(`${baseUrl}/?app=planning`, {
    timeout: 60_000,
    waitUntil: "domcontentloaded",
  });
  const home = page.getByTestId("cfs-master-home");
  if (await home.isVisible()) {
    await page.getByTestId("cfs-home-card-builder").click();
    await page.waitForLoadState("domcontentloaded");
  }
  const analyst = page.locator('[data-testid="cfs-experience-builder"]:visible');
  if ((await analyst.getAttribute("aria-pressed")) !== "true") await analyst.click();
  const planning = page.locator('button[aria-label^="Planning:"]:visible');
  if ((await planning.getAttribute("aria-pressed")) !== "true") await planning.click();
  const explore = page.locator('[data-testid="command-center-explore-intelligence"]:visible');
  if (await explore.count()) await explore.click();
  const map = page.locator('[data-testid="cfs-arcgis-map"]:visible');
  await map.waitFor({ timeout: 60_000 });
  await page.waitForFunction(
    () => window.__cfsGetMapDebugState?.().readyState === "ready",
    null,
    { timeout: 75_000 },
  );

  const point = await map.boundingBox();
  assert(point, "Analyst map bounds are unavailable.");
  const interactionPoint = {
    x: point.x + point.width * 0.58,
    y: point.y + point.height * 0.46,
  };
  await page.mouse.move(interactionPoint.x, interactionPoint.y);

  const beforeRapid = await debugState(page);
  await page.mouse.wheel(0, -700);
  await waitForZoomChange(page, beforeRapid.zoom);
  await delay(120);
  const afterRapid = await debugState(page);
  assertZoomDelta("Rapid wheel", beforeRapid.zoom, afterRapid.zoom);

  for (let index = 0; index < 6; index += 1) await page.mouse.wheel(0, -12);
  await waitForZoomChange(page, afterRapid.zoom);
  await delay(120);
  const afterTrackpad = await debugState(page);
  assertZoomDelta("Trackpad-like wheel", afterRapid.zoom, afterTrackpad.zoom);

  const beforePan = afterTrackpad.extent;
  await page.mouse.down();
  await page.mouse.move(interactionPoint.x + 90, interactionPoint.y + 35, {
    steps: 8,
  });
  await page.mouse.up();
  await page.waitForFunction(
    (extent) => JSON.stringify(window.__cfsGetMapDebugState?.().extent) !== JSON.stringify(extent),
    beforePan,
  );

  await page.evaluate(() => {
    window.dispatchEvent(
      new CustomEvent("cfs:parcel-map-focus-request", {
        detail: {
          focus: {
            centroid: { latitude: 35.41, longitude: -80.59 },
            extent: null,
            focusSource: "search",
            focusStatus: "ready",
            highlightGeometry: null,
            officialParcelId: "MAP-NAVIGATION-REGRESSION",
            pin14: null,
          },
        },
      }),
    );
  });
  await page.waitForFunction(() => {
    const layer = window.__cfsGetMapDebugState?.().layers.find(
      (candidate) => candidate.id === "cfs-parcel-focus-layer",
    );
    return layer?.visible === true && Number(layer.graphicsCount) > 0;
  });
  await delay(1_200);
  const focused = await debugState(page);
  assert(focused.zoom > afterTrackpad.zoom, "Parcel focus did not move to detail zoom.");

  await page.mouse.move(interactionPoint.x, interactionPoint.y);
  await page.mouse.wheel(0, 60);
  await waitForZoomChange(page, focused.zoom);
  await delay(600);
  const manualAfterFocus = await debugState(page);
  assert(
    manualAfterFocus.zoom < focused.zoom,
    "Automatic parcel camera fought manual navigation after focus.",
  );

  console.log("PASS Analyst manual wheel, trackpad-like input, pan, and parcel focus navigation");
} finally {
  await browser.close();
}

async function debugState(page) {
  const state = await page.evaluate(() => window.__cfsGetMapDebugState?.());
  assert(state && Number.isFinite(state.zoom), "Map debug state is unavailable.");
  return state;
}

function assertZoomDelta(label, before, after) {
  const delta = Math.abs(after - before);
  assert(delta >= 0.05 && delta <= 0.55, `${label} changed zoom by ${delta.toFixed(2)} levels.`);
}

async function waitForZoomChange(page, before) {
  await page.waitForFunction(
    (zoom) => Math.abs((window.__cfsGetMapDebugState?.().zoom ?? zoom) - zoom) >= 0.01,
    before,
    { timeout: 10_000 },
  );
}
