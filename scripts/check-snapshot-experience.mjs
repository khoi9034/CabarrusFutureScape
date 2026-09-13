import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright-core";

const root = process.cwd();
let server;

const browserExecutable = () => [
  process.env.CFS_BROWSER_EXECUTABLE,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean).find(existsSync);

async function freePort() {
  const socket = createServer();
  await new Promise((resolve, reject) => {
    socket.once("error", reject);
    socket.listen(0, "127.0.0.1", resolve);
  });
  const { port } = socket.address();
  await new Promise((resolve) => socket.close(resolve));
  return port;
}

async function baseUrl() {
  if (process.env.CFS_DEMO_BASE_URL) return process.env.CFS_DEMO_BASE_URL.replace(/\/$/, "");
  const port = await freePort();
  const url = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, [join(root, "node_modules", "next", "dist", "bin", "next"), "start", "-H", "127.0.0.1", "-p", String(port)], {
    cwd: root,
    env: {
      ...process.env,
      NEXT_PUBLIC_CFS_DEPLOYMENT_MODE: "demo",
      NEXT_PUBLIC_CFS_RUNTIME_MODE: "demo",
      NEXT_PUBLIC_USE_BACKEND_API: "false",
    },
    stdio: "ignore",
    windowsHide: true,
  });
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      if ((await fetch(url)).ok) return url;
    } catch {}
    await delay(500);
  }
  throw new Error("Snapshot check server did not start.");
}

const clickTopLevel = async (page, label) => {
  await page.locator("button").filter({ hasText: new RegExp(`^${label}$`) }).first().click();
};

const openLibrary = async (page) => {
  const show = page.getByRole("button", { name: "Show Intelligence" });
  if (await show.count()) await show.click();
  await page.getByRole("button", { name: "Open Snapshots" }).click();
};

const saveSnapshot = async (page, title, note) => {
  const testedSave = page.locator('[data-testid^="planning-snapshot-save"]:visible').first();
  const save = await testedSave.count()
    ? testedSave
    : page.getByRole("button", { name: "Save snapshot", exact: true });
  await save.click();
  const dialog = page.getByTestId("planning-snapshot-save-dialog");
  await dialog.getByTestId("planning-snapshot-new-name").fill(title);
  await dialog.getByTestId("planning-snapshot-new-note").fill(note);
  await dialog.getByTestId("planning-snapshot-confirm-save").click();
};

const url = await baseUrl();
const executablePath = browserExecutable();
assert(executablePath, "Chrome or Edge is required for the focused Snapshot check.");
const browser = await chromium.launch({ executablePath, headless: true });

try {
  const page = await browser.newPage();
  await page.goto(`${url}/?app=planning`);
  await openLibrary(page);
  await page.getByRole("heading", { name: "No saved snapshots yet." }).waitFor();
  assert.equal(await page.getByRole("textbox", { name: "Search snapshots" }).count(), 0);

  await page.getByRole("button", { name: "Go to Analyst" }).click();
  await saveSnapshot(page, "Analyst Planning · Countywide", "Analyst note");

  await clickTopLevel(page, "Management");
  await page.getByRole("button", { name: "Past 3 years" }).click();
  await page.getByRole("button", { name: "Analyze" }).click();
  await saveSnapshot(page, "Management Overview · 2023–2025", "Management note");

  await clickTopLevel(page, "Analyst");
  await openLibrary(page);
  assert.equal(await page.getByTestId("planning-snapshot-card").count(), 2);
  await page.getByRole("button", { name: "management", exact: true }).click();
  assert.equal(await page.getByTestId("planning-snapshot-card").count(), 1);
  await page.getByRole("button", { name: "analyst", exact: true }).click();
  assert.equal(await page.getByTestId("planning-snapshot-card").count(), 1);
  await page.getByRole("button", { name: "All", exact: true }).click();
  await page.getByRole("textbox", { name: "Search snapshots" }).fill("Management Overview");
  await page.getByRole("button", { name: "Open", exact: true }).click();

  await page.getByRole("textbox").fill("Updated Management note");
  await page.getByRole("button", { name: "Save Notes" }).click();
  await page.getByRole("button", { name: "Return to Snapshot Library" }).click();
  await page.getByRole("button", { name: "Open", exact: true }).click();
  assert.equal(await page.getByRole("textbox").inputValue(), "Updated Management note");
  await page.getByText("Analysis period: Jan 2023–Dec 2025").waitFor();

  await page.emulateMedia({ media: "print" });
  assert.equal(await page.getByRole("button", { name: "Print Snapshot" }).isVisible(), false);
  assert.equal(await page.getByTestId("snapshot-detail").isVisible(), true);
  assert.equal(await page.getByRole("button", { name: "Open Ask Insights" }).isVisible(), false);
  await page.emulateMedia({ media: "screen" });

  await page.getByRole("button", { name: "Continue Analysis" }).click();
  await page.waitForURL(/app=management.*from=2023-01-01.*to=2025-12-31.*range=past-3-years/);
  console.log("PASS unified Snapshot Library, persistence, filtering, print, and restore");
} finally {
  await browser.close();
  server?.kill();
}
