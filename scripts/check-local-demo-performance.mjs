import assert from "node:assert/strict";
import { existsSync, writeFileSync } from "node:fs";
import { chromium } from "playwright-core";

const baseUrl = process.env.CFS_BASE_URL ?? "http://127.0.0.1:3000";
const executablePath = [
  process.env.CFS_BROWSER_EXECUTABLE,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean).find(existsSync);
assert(executablePath, "Chrome or Edge is required.");

const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage();
const timings = {};
const blockedHosts = new Set();

await page.route("**/*", async (route) => {
  const url = new URL(route.request().url());
  if (!["127.0.0.1", "localhost"].includes(url.hostname)) {
    blockedHosts.add(url.hostname);
    await route.abort("blockedbyclient");
    return;
  }
  await route.continue();
});

async function measure(name, action, ready) {
  const started = performance.now();
  await action();
  await ready();
  timings[name] = Math.round((performance.now() - started) * 10) / 10;
}

try {
  await measure("home", () => page.goto(baseUrl), () => page.getByRole("link", { name: /Management/ }).waitFor());
  await measure(
    "management_setup",
    () => page.getByRole("link", { name: /Management/ }).click(),
    () => page.getByRole("heading", { name: "Management", exact: true }).waitFor(),
  );
  const periodSetup = page.getByRole("heading", { name: "Choose an analysis period" });
  const changePeriod = page.getByRole("button", { name: "Change" });
  await Promise.race([periodSetup.waitFor(), changePeriod.waitFor()]);
  if (await changePeriod.isVisible()) await changePeriod.click();
  await periodSetup.waitFor();
  await page.getByRole("button", { name: "Past 12 months" }).click();
  await measure(
    "management_past_12_months",
    () => page.getByRole("button", { name: "Analyze" }).click(),
    () => page.getByText("3,642", { exact: true }).first().waitFor(),
  );
  await measure(
    "management_planning",
    () => page.getByTestId("management-nav-planning-insights").click(),
    () => page.getByRole("heading", { name: "Planning Insights" }).waitFor(),
  );
  await measure(
    "management_signals",
    () => page.getByTestId("management-nav-development-signals").click(),
    () => page.getByText("5,501", { exact: true }).first().waitFor(),
  );
  await measure(
    "analyst_planning",
    () => page.getByRole("button", { name: "Analyst", exact: true }).click(),
    () => page.getByText("64,426", { exact: true }).first().waitFor(),
  );

  const search = page.getByRole("combobox", { name: "Search parcels" });
  await measure(
    "parcel_search",
    () => search.fill("CFS-PARCEL-0149726579"),
    () => page.getByRole("option").waitFor(),
  );
  await measure(
    "parcel_intelligence",
    () => page.getByRole("option").click(),
    () => page.getByText("MALL AT CONCORD MILLS LP", { exact: true }).first().waitFor(),
  );

  await page.getByRole("button", { name: "Open Ask Insights" }).click();
  const question = page.getByRole("textbox", { name: "Ask Insights question" });
  await question.fill("How many permits are in this view?");
  const askStarted = performance.now();
  const askResponse = page.waitForResponse((response) => response.url().includes("/ai/search") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  assert((await askResponse).ok(), "Ask Insights request failed.");
  const askAnswer = page.getByText("Ask Insights response", { exact: true }).last().locator("xpath=ancestor::article");
  await askAnswer.waitFor();
  const askText = await askAnswer.innerText();
  assert(/permit/i.test(askText) && askText.length > 80, "Ask Insights did not render a grounded permit answer.");
  timings.ask_insights = Math.round((performance.now() - askStarted) * 10) / 10;
  await page.getByRole("button", { name: "Close Ask Insights" }).click();

  await measure(
    "economics",
    () => page.getByRole("button", { name: /^Economics:/ }).click(),
    () => page.getByRole("heading", { name: "Economic Dashboard", exact: true }).waitFor(),
  );
  await measure(
    "master_data",
    () => page.getByRole("button", { name: /^Master Data:/ }).click(),
    () => page.getByRole("heading", { name: "Choose a governed dataset" }).waitFor(),
  );
  await page.getByRole("button", { name: /^Planning:/ }).click();
  await measure(
    "snapshot_dialog",
    () => page.getByRole("button", { name: "Save Planning Snapshot", exact: true }).click(),
    () => page.getByRole("dialog", { name: "Save what you are looking at now" }).waitFor(),
  );
  await page.getByRole("button", { name: "Cancel" }).click();

  const body = await page.locator("body").innerText();
  assert(!body.includes("Live data connection unavailable"));
  assert(!body.includes("Live data service is unreachable"));
  const report = {
    status: "PASS",
    generated_at: new Date().toISOString(),
    external_requests_blocked: [...blockedHosts].sort(),
    timings_ms: timings,
  };
  writeFileSync("logs/local-presentation-performance.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
