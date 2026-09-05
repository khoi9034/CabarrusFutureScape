import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright-core";

const root = process.cwd();
let server;
const localMode = process.argv.includes("--local");

function browserExecutable() {
  const candidates = [
    process.env.CFS_BROWSER_EXECUTABLE,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  ].filter(Boolean);
  const executable = candidates.find(existsSync);
  assert(executable, "Chrome or Edge was not found.");
  return executable;
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

async function startDemo() {
  assert(existsSync(join(root, ".next", "BUILD_ID")), "Run the Demo build first.");
  const port = await freePort();
  const url = `http://127.0.0.1:${port}`;
  server = spawn(
    process.execPath,
    [join(root, "node_modules", "next", "dist", "bin", "next"), "start", "-H", "127.0.0.1", "-p", String(port)],
    { cwd: root, stdio: "ignore", windowsHide: true },
  );
  for (let attempt = 0; attempt < 90; attempt += 1) {
    try {
      if ((await fetch(url)).status < 500) return url;
    } catch {
      // Server is still starting.
    }
    await delay(1_000);
  }
  throw new Error("Timed out waiting for Demo server.");
}

async function startLocal() {
  const port = await freePort();
  const url = `http://127.0.0.1:${port}`;
  server = spawn(
    process.execPath,
    [join(root, "node_modules", "next", "dist", "bin", "next"), "dev", "-H", "127.0.0.1", "-p", String(port)],
    {
      cwd: root,
      env: {
        ...process.env,
        NEXT_PUBLIC_CFS_ARTIFACT_PROVIDER: "local_file",
        NEXT_PUBLIC_CFS_AUTH_MODE: "local_dev",
        NEXT_PUBLIC_CFS_DATA_PROVIDER: "local_api",
        NEXT_PUBLIC_CFS_DEPLOYMENT_MODE: "live",
        NEXT_PUBLIC_CFS_RUNTIME_MODE: "local",
        NEXT_PUBLIC_CFS_API_BASE_URL: "http://127.0.0.1:8000",
        NEXT_PUBLIC_USE_BACKEND_API: "true",
      },
      stdio: "ignore",
      windowsHide: true,
    },
  );
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      if ((await fetch(url)).status < 500) return url;
    } catch {
      // Dev server is still compiling.
    }
    await delay(1_000);
  }
  throw new Error("Timed out waiting for Local test server.");
}

function parcelSearchResponse(parcelId) {
  return {
    limit: 20,
    offset: 0,
    query: parcelId,
    total_count: 1,
    results: [
      {
        official_parcel_id: parcelId,
        pin14: null,
        subdivision: "Imagery test area",
        neighborhood: "Builder test",
        owner_display: null,
        mailing_city: null,
        mailing_state: null,
        zoning_jurisdiction_name: "Cabarrus County",
        dominant_zoning_code_raw: "AO",
        dominant_zoning_general_normalized: "Agricultural",
        zoning_assignment_confidence: "high",
        parcel_quality_status: "verified",
        valuation_band: null,
        safe_for_dashboard: true,
        governance_warning_categories: [],
      },
    ],
  };
}

async function attachLocalApi(page, metadataCalls, imageRequests) {
  let retryEnabled = false;
  await page.route("http://127.0.0.1:8000/**", async (route) => {
    const url = new URL(route.request().url());
    const headers = {
      "access-control-allow-headers": "*",
      "access-control-allow-methods": "GET, OPTIONS",
      "access-control-allow-origin": "*",
      "content-type": "application/json",
    };
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers });
      return;
    }
    if (url.pathname === "/health/ready") {
      await route.fulfill({
        headers,
        body: JSON.stringify({ status: "ready", database: "connected" }),
      });
      return;
    }
    if (url.pathname === "/parcels/search") {
      const parcelId = url.searchParams.get("q")?.trim() || "CFS-PARCEL-1";
      await route.fulfill({ body: JSON.stringify(parcelSearchResponse(parcelId)), headers });
      return;
    }
    const metadata = url.pathname.match(/^\/imagery\/eagleview\/parcel\/([^/]+)$/);
    if (metadata) {
      const parcelId = decodeURIComponent(metadata[1]);
      const callCount = (metadataCalls.get(parcelId) ?? 0) + 1;
      metadataCalls.set(parcelId, callCount);
      await delay(parcelId.endsWith("-A") ? 4_000 : parcelId.endsWith("-B") ? 2_500 : parcelId.endsWith("-C") ? 50 : 350);
      if (parcelId.endsWith("-2") && !retryEnabled) {
        await route.fulfill({ status: 503, headers, body: JSON.stringify({ detail: "Imagery service is temporarily unavailable." }) });
      } else if (parcelId.endsWith("-3")) {
        await route.fulfill({ status: 503, headers, body: JSON.stringify({ detail: "EagleView imagery is not configured." }) });
      } else {
        const images = parcelId.endsWith("-4")
          ? []
          : parcelId.endsWith("-A")
            ? [{ direction: "north", capture_date: "2024-01-01" }]
            : parcelId.endsWith("-B")
              ? [{ direction: "east", capture_date: "2025-02-02" }]
              : parcelId.endsWith("-C")
                ? [{ direction: "west", capture_date: "2026-09-03" }]
                : [
                    { direction: "north", capture_date: "2026-08-14" },
                    { direction: "east", capture_date: "2026-08-13" },
                  ];
        await route.fulfill({
          headers,
          body: JSON.stringify({
            parcel_id: parcelId,
            location: { latitude: 35.41, longitude: -80.58 },
            provider: "EagleView/Pictometry",
            images,
          }),
        });
      }
      return;
    }
    if (/\/imagery\/eagleview\/parcel\/[^/]+\/image\/(north|south|east|west)$/.test(url.pathname)) {
      imageRequests.push(url.toString());
      await route.fulfill({
        headers: { "access-control-allow-origin": "*", "content-type": "image/svg+xml" },
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="6"><rect width="8" height="6" fill="#26384a"/></svg>',
      });
      return;
    }
    await route.fulfill({ status: 503, headers, body: JSON.stringify({ detail: "Focused test" }) });
  });
  return { enableRetry: () => { retryEnabled = true; } };
}

async function selectParcel(page, parcelId) {
  const search = page.getByRole("combobox", { name: "Search parcels" });
  await search.waitFor();
  await page.waitForFunction(
    () => document.querySelector('input[aria-label="Search parcels"]:not(:disabled)') !== null,
  );
  await page.waitForTimeout(500);
  await search.fill(parcelId);
  const option = page
    .locator("#top-parcel-search-results")
    .getByRole("option")
    .filter({ hasText: parcelId })
    .first();
  await option.click();
}

async function checkLocal(page) {
  const metadataCalls = new Map();
  const imageRequests = [];
  const localApi = await attachLocalApi(page, metadataCalls, imageRequests);
  await page.goto(`${await startLocal()}/?app=planning`, { waitUntil: "domcontentloaded" });
  await selectParcel(page, "CFS-PARCEL-1");
  const panelButton = page.getByRole("button", { name: /Parcel imagery/i });
  await panelButton.click();
  await page.getByText("Loading parcel imagery...", { exact: true }).waitFor();
  await page.getByRole("button", { name: "east", exact: true }).waitFor();
  await page.getByRole("button", { name: "east", exact: true }).click();
  await page.getByAltText("east EagleView parcel imagery").waitFor();

  await selectParcel(page, "CFS-PARCEL-2");
  await page.getByText("Imagery service is temporarily unavailable.", { exact: true }).first().waitFor();
  assert.equal(await page.getByAltText("east EagleView parcel imagery").count(), 0, "Stale parcel imagery remained visible.");
  const callsBeforeRetry = metadataCalls.get("CFS-PARCEL-2");
  await page.waitForTimeout(750);
  assert.equal(metadataCalls.get("CFS-PARCEL-2"), callsBeforeRetry, "Imagery retried without user action.");
  localApi.enableRetry();
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await page.getByRole("button", { name: "east", exact: true }).waitFor();
  assert.equal(metadataCalls.get("CFS-PARCEL-2"), callsBeforeRetry + 1, "Retry did not issue exactly one new metadata request.");

  await selectParcel(page, "CFS-PARCEL-3");
  await page.getByText("EagleView imagery is not configured.", { exact: true }).waitFor();
  await page.getByTestId("cfs-arcgis-map").waitFor();
  await page.getByLabel("Workspace intelligence panel", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Open Ask CFS", exact: true }).waitFor();
  await page.getByLabel("CFS Builder workspaces", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Clear selected parcel", exact: true }).waitFor();

  await selectParcel(page, "CFS-PARCEL-4");
  await page.getByText("No EagleView imagery was found for this parcel.", { exact: true }).waitFor();

  await selectParcel(page, "CFS-PARCEL-A");
  await selectParcel(page, "CFS-PARCEL-B");
  await selectParcel(page, "CFS-PARCEL-C");
  await page.getByText("Direction: west", { exact: true }).waitFor();
  await page.waitForTimeout(4_500);
  await page.getByText("Direction: west", { exact: true }).waitFor();
  await page.getByText("Captured: Sep 3, 2026", { exact: true }).waitFor();
  assert.equal(await page.getByText("Direction: north", { exact: true }).count(), 0, "Late Parcel A metadata replaced Parcel C.");
  assert.equal(await page.getByText("Direction: east", { exact: true }).count(), 0, "Late Parcel B metadata replaced Parcel C.");
  for (const parcelId of ["CFS-PARCEL-A", "CFS-PARCEL-B", "CFS-PARCEL-C"]) {
    assert((metadataCalls.get(parcelId) ?? 0) >= 1 && metadataCalls.get(parcelId) <= 2, `${parcelId} issued excessive metadata requests.`);
  }
  assert(imageRequests.every((url) => url.includes("width=800") && url.includes("height=600")), "Initial imagery fetched a larger inspection image.");
  assert.equal(imageRequests.filter((url) => url.includes("CFS-PARCEL-A") || url.includes("CFS-PARCEL-B")).length, 0, "Superseded parcels fetched image bytes.");
  console.log("PASS EagleView imagery: Local selection, lazy image, direction, empty, retry, unavailable, unconfigured, and A/B/C stale-response safety");
}

async function main() {
  if (localMode) {
    const browser = await chromium.launch({ executablePath: browserExecutable(), headless: true, args: ["--no-sandbox"] });
    try {
      await checkLocal(await browser.newPage({ viewport: { width: 1440, height: 1000 } }));
    } finally {
      await browser.close();
      server?.kill();
    }
    return;
  }
  const baseUrl = await startDemo();
  const providerRequests = [];
  const localBackendRequests = [];
  const browser = await chromium.launch({
    executablePath: browserExecutable(),
    headless: true,
    args: ["--enable-unsafe-swiftshader", "--no-sandbox", "--use-angle=swiftshader"],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.on("request", (request) => {
      if (request.url().includes("/imagery/eagleview")) providerRequests.push(request.url());
      if (/^https?:\/\/(localhost|127\.0\.0\.1):8000(?:\/|$)/.test(request.url())) localBackendRequests.push(request.url());
    });
    await page.goto(`${baseUrl}/?app=planning`, { waitUntil: "domcontentloaded" });
    const search = page.getByRole("combobox", { name: "Search parcels" });
    await search.fill("CFS-PARCEL-0149780354");
    await page.locator("#top-parcel-search-results").getByRole("option").first().click();
    const panelButton = page.getByRole("button", { name: /Parcel imagery/i });
    await panelButton.waitFor();
    await panelButton.click();
    await page.getByText("EagleView imagery available in Enterprise/Local mode", { exact: true }).waitFor();
    for (const direction of ["north", "south", "east", "west"]) {
      await page.getByRole("button", { name: direction, exact: true }).waitFor();
    }
    await page.getByRole("button", { name: "east", exact: true }).click();
    await page.getByText("Direction: east", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Clear selected parcel", exact: true }).click();
    await panelButton.waitFor({ state: "hidden" });
    assert.deepEqual(providerRequests, [], "Public Demo called the EagleView backend.");
    assert.deepEqual(localBackendRequests, [], "Public Demo called the Local CFS backend.");
    console.log("PASS EagleView imagery: Demo selection, direction switch, clear, and backend independence");
  } finally {
    await browser.close();
    server?.kill();
  }
}

await main();
