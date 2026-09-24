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
  await page.getByRole("button", { name: "Open Planning Files" }).click();
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
  await page.getByRole("heading", { name: "No Planning Files have been saved yet." }).waitFor();
  assert.equal(await page.getByRole("textbox", { name: "Search Planning Files" }).count(), 0);

  await page.getByRole("button", { name: "Go to Analyst" }).click();
  await saveSnapshot(page, "Analyst Planning · Countywide", "Analyst note");

  await clickTopLevel(page, "Management");
  await page.getByRole("button", { name: "Past 3 years" }).click();
  await page.getByRole("button", { name: "Analyze" }).click();
  await saveSnapshot(page, "Management Overview · 2023–2025", "Management note");

  await clickTopLevel(page, "Analyst");
  await openLibrary(page);
  assert.equal(await page.getByTestId("planning-snapshot-card").count(), 2);
  await page.getByRole("tab", { name: "Snapshots", exact: true }).click();
  assert.equal(await page.getByTestId("planning-snapshot-card").count(), 2);
  await page.getByRole("tab", { name: "Packages", exact: true }).click();
  await page.getByRole("heading", { name: "No Packages created yet." }).waitFor();
  await page.getByRole("tab", { name: "All", exact: true }).click();
  await page.getByRole("textbox", { name: "Search Planning Files" }).fill("Management Overview");
  await page.getByRole("button", { name: "Open", exact: true }).click();

  await page.getByRole("textbox", { name: "Title" }).fill("Management Planning File · 2023–2025");
  await page.getByRole("textbox", { name: "Notes" }).fill("Updated Management note");
  await page.getByRole("button", { name: "Save Changes" }).click();
  await page.waitForFunction(() => JSON.parse(sessionStorage.getItem("cfs-product-demo:planning-snapshots:v1") ?? "[]").some((item) => item.title === "Management Planning File · 2023–2025" && item.notes === "Updated Management note"));
  await page.getByRole("button", { name: "Return to Planning Files" }).click();
  await page.getByRole("textbox", { name: "Search Planning Files" }).fill("");
  await page.getByTestId("planning-snapshot-card").filter({ hasText: "Management Planning File · 2023–2025" }).getByRole("button", { name: "Open", exact: true }).click();
  assert.equal(await page.getByRole("textbox", { name: "Title" }).inputValue(), "Management Planning File · 2023–2025");
  assert.equal(await page.getByRole("textbox", { name: "Notes" }).inputValue(), "Updated Management note");
  await page.getByRole("button", { name: "Return to Planning Files" }).click();

  await page.evaluate(() => {
    const now = new Date().toISOString();
    sessionStorage.setItem("cfs-product-demo:reports:v1", JSON.stringify([{
      archived_at: null,
      created_at: now,
      created_by: null,
      id: "7f3e75f8-d39a-47d8-9a82-87645c272e27",
      organization_id: null,
      payload: {
        client_draft_id: "7f3e75f8-d39a-47d8-9a82-87645c272e27",
        explain_numbers: false,
        package_type: "planning_review",
        report_notes: "Prepared for a focused planning review.",
        report_title: "Current planning context",
        schema_version: "planning_snapshot_draft_v1",
        selected_sections: { key_findings: true, transportation: false },
        source_snapshot_id: "",
      },
      project_id: null,
      report_type: "planning_snapshot_draft",
      status: "Draft",
      title: "Concord Parkway South Review",
      updated_at: now,
    }]));
  });
  await page.reload();
  await openLibrary(page);
  await page.getByRole("tab", { name: "Packages", exact: true }).click();
  assert.equal(await page.getByTestId("planning-package-card").count(), 1);
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await page.getByTestId("planning-package-detail").waitFor();
  await page.getByText("Key Findings", { exact: true }).waitFor();
  assert.equal(await page.getByText("Transportation", { exact: true }).count(), 0);
  await page.getByRole("textbox", { name: "Title" }).fill("Concord Parkway Planning Package");
  await page.getByRole("textbox", { name: "Notes" }).fill("Updated package note");
  await page.getByRole("button", { name: "Save Changes" }).click();
  await page.waitForFunction(() => JSON.parse(sessionStorage.getItem("cfs-product-demo:reports:v1") ?? "[]").some((item) => item.title === "Concord Parkway Planning Package" && item.payload?.report_notes === "Updated package note"));
  await page.getByRole("button", { name: "Return to Planning Files" }).click();
  await page.getByRole("tab", { name: "Snapshots", exact: true }).click();
  const analystCard = page.getByTestId("planning-snapshot-card").filter({ hasText: "Analyst Planning · Countywide" });
  await analystCard.getByText("More", { exact: true }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await analystCard.getByRole("button", { name: "Delete", exact: true }).click();
  await page.waitForFunction(() => JSON.parse(sessionStorage.getItem("cfs-product-demo:planning-snapshots:v1") ?? "[]").filter((item) => !item.archived_at).length === 1);
  await page.getByTestId("planning-snapshot-card").filter({ hasText: "Management Planning File · 2023–2025" }).getByRole("button", { name: "Open", exact: true }).click();
  await page.getByText("Analysis period: Jan 2023–Dec 2025").waitFor();

  await page.emulateMedia({ media: "print" });
  assert.equal(await page.getByRole("button", { name: "Print Snapshot" }).isVisible(), false);
  assert.equal(await page.getByTestId("snapshot-detail").isVisible(), true);
  assert.equal(await page.getByRole("button", { name: "Open Ask Insights" }).isVisible(), false);
  await page.emulateMedia({ media: "screen" });

  await page.getByRole("button", { name: "Continue Analysis" }).click();
  await page.waitForURL(/app=management.*from=2023-01-01.*to=2025-12-31.*range=past-3-years/);
  console.log("PASS unified Planning Files, persistence, filtering, print, and restore");
} finally {
  await browser.close();
  server?.kill();
}
