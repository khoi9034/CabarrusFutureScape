import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isCfsApiUrl } from "../src/lib/auth/requestBoundary.mjs";

const read = (path) => readFileSync(path, "utf8");
const runtime = read("src/lib/runtimeConfig.ts");
const client = read("src/lib/api/client.ts");
const auth = read("src/lib/auth/entra.ts");
const page = read("src/app/data-administration/page.tsx");
const panel = read("src/components/admin/DataAdministrationPanel.tsx");
const adminApi = read("src/lib/api/admin.ts");
const sourceApi = read("src/lib/api/dataSources.ts");
const methodology = read("src/components/dashboard/MethodologyWorkspace.tsx");
const productClient = read("src/lib/product/apiClient.ts");
const productRepositories = read("src/lib/product/runtimeRepository.ts");
const productPrincipal = read("src/hooks/useProductPrincipal.tsx");
const planningPersistence = read("src/hooks/usePlanningSnapshotLibrary.ts");
const planningReportDrafts = read("src/hooks/usePlanningReportDrafts.ts");
const economics = read("src/components/economics/EconomicsShell.tsx");
const askCfs = read("src/components/dashboard/AskCfsPanel.tsx");

for (const value of [
  "demo",
  "local",
  "enterprise",
  "static",
  "local_api",
  "enterprise_api",
  "off",
  "local_dev",
  "oidc",
  "none",
  "openai",
  "public_static",
  "local_file",
  "object_storage",
  "inline",
  "external_worker",
]) {
  assert(runtime.includes(`\"${value}\"`), `Runtime config is missing ${value}.`);
}

for (const alias of [
  "entra",
  "deterministic",
  "local_postgis",
  "sanitized_demo_extract",
  "enterprise_service",
]) {
  assert(runtime.includes(`${alias}:`), `Legacy alias ${alias} is missing.`);
}

assert.match(runtime, /Enterprise mode requires oidc authentication/);
assert.match(runtime, /Demo mode requires static data/);
assert.match(client, /headers\.set\("X-Request-ID", requestId\)/);
assert.match(client, /export async function apiPatch/);
assert.match(client, /export async function apiDelete/);
assert.match(auth, /CFS_AUTH_MODE === "oidc"/);
assert.equal(isCfsApiUrl(new URL("https://api.example.test/api/v1/me"), "https://api.example.test"), true);
assert.equal(isCfsApiUrl(new URL("https://api.example.test/gateway/v1/me"), "https://api.example.test/gateway"), true);
assert.equal(isCfsApiUrl(new URL("https://api.example.test/gateway-evil"), "https://api.example.test/gateway"), false);
assert.equal(isCfsApiUrl(new URL("https://api.example.test.attacker.test/api/v1/me"), "https://api.example.test"), false);

assert(!page.startsWith('"use client"'), "Administration route must remain a Server Component.");
assert.match(page, /<EntraAuthGate>/);
assert.match(page, /<DataAdministrationPanel \/>/);
assert.match(adminApi, /"\/api\/v1\/admin\/summary"/);
assert.match(adminApi, /CFS_DATA_PROVIDER === "static"/);
assert.match(adminApi, /record\(envelope\.data \?\? envelope\)/);
assert.match(adminApi, /envelope\.request_id \?\? root\.request_id/);
assert.match(adminApi, /item\.freshness_status \?\? item\.status/);
assert.match(adminApi, /item\.refresh_cadence \?\? item\.expected_refresh/);
assert.match(adminApi, /item\.validation_status \?\? item\.quality_status/);
assert.match(adminApi, /item\.last_ingestion_at \?\? item\.updated_at/);
assert.doesNotMatch(adminApi, /api(?:Post|Patch|Delete)/);
assert.match(sourceApi, /"\/api\/v1\/data-sources"/);
assert.match(sourceApi, /Array\.isArray\(envelope\.data\)/);
assert.match(methodology, /if \(USE_DEMO_DATA\)/);
assert.match(methodology, /<LiveSourceRegistry/);
assert.match(methodology, /Persistent Source Registry/);
assert.match(panel, /Read only/);
assert.match(panel, /Freshness \/ cadence/);
assert.match(panel, /This page has\s*no mutation controls/);
assert.doesNotMatch(panel, />\s*(?:Delete|Apply|Migrate|Rollback|Run ingestion)\s*</i);

for (const resource of [
  "/api/v1/me",
  "/api/v1/planning/snapshots",
  "/api/v1/economics/scenarios",
  "/api/v1/reports",
  "/api/v1/reports/bucket",
  "/api/v1/ask-cfs/conversations",
]) {
  assert(productClient.includes(resource), `Central Product V1 client is missing ${resource}.`);
}
assert.match(productClient, /"\/api\/v1\/reports"/);
assert.match(productClient, /expected_updated_at=/);
assert.match(productClient, /for \(let attempt = 0; attempt < 2; attempt \+= 1\)/);
assert.match(productClient, /async function writeProductEnvelope/);
assert.doesNotMatch(
  productClient.match(/async function writeProductEnvelope[\s\S]*$/)?.[0] ?? "",
  /for \(let attempt/,
  "Product writes must not be retried automatically.",
);
assert.match(productClient, /class ProductApiError extends Error/);
assert.match(productClient, /error\.status === 409\) return "conflict"/);
assert.match(productClient, /error\.status === 403\) return "forbidden"/);
assert.match(productClient, /signal: options\.signal/);
assert.match(productClient, /timeoutMs: 60_000/);
assert.match(productClient, /options\.timeoutMs \?\? 12_000/);
assert.match(client, /error instanceof DOMException && error\.name === "AbortError"/);

assert.match(productRepositories, /return runtimeMode === "demo" \? demoRepositories : apiRepositories/);
assert.match(productRepositories, /return window\.sessionStorage/);
assert.doesNotMatch(productRepositories, /localStorage/);
for (const repository of [
  "getPlanningSnapshotRepository",
  "getEconomicScenarioRepository",
  "getReportRepository",
  "getReportBucketRepository",
  "getAskCfsConversationRepository",
]) {
  assert(productRepositories.includes(repository), `Runtime repository selector is missing ${repository}.`);
}

assert.match(productPrincipal, /getProductPrincipal\(\{ signal: controller\.signal \}\)/);
assert.match(productPrincipal, /principal\?\.permissions\.includes\(permission\)/);
for (const operation of [".list(", ".create(", ".update(", ".version(", ".archive("]) {
  assert(planningPersistence.includes(operation), `Planning persistence is missing ${operation}.`);
}
assert.match(planningPersistence, /expectedUpdatedAt: planningSnapshot\.updatedAt/);
assert.match(planningPersistence, /error\.kind === "conflict"/);
assert.match(planningPersistence, /\? "permission_denied"/);
assert.match(planningPersistence, /\? "unavailable"/);

assert.match(planningReportDrafts, /getReportRepository\(\)/);
assert.match(planningReportDrafts, /const REPORT_TYPE = "planning_snapshot_draft"/);
for (const operation of ["list", "create", "get", "update", "archive"]) {
  assert.match(
    planningReportDrafts,
    new RegExp(`repository\\.${operation}\\(`),
    `Planning report-draft persistence is missing ${operation}.`,
  );
}
assert.match(planningReportDrafts, /expectedUpdatedAt: draft\.updatedAt/);
assert.match(planningReportDrafts, /repository\.provider === "api"/);
assert.match(planningReportDrafts, /window\.localStorage\.getItem\(LEGACY_STORAGE_KEY\)/);
assert.doesNotMatch(planningReportDrafts, /localStorage\.(?:setItem|removeItem)/);

assert.match(economics, /getEconomicScenarioRepository\(\)/);
assert.match(economics, /getReportBucketRepository\(\)/);
for (const operation of ["list", "create", "update", "version", "archive"]) {
  assert.match(economics, new RegExp(`economicScenarioRepository\\s*\\.${operation}`), `Economics persistence is missing ${operation}.`);
}
for (const operation of ["list", "create", "update", "archive"]) {
  assert.match(economics, new RegExp(`reportBucketRepository\\s*\\.${operation}`), `Report Bucket persistence is missing ${operation}.`);
}
assert.match(economics, /expectedUpdatedAt:/);
assert.match(askCfs, /getAskCfsConversationRepository\(\)/);
for (const operation of [".list(", ".listMessages(", ".create(", ".addMessage(", ".reset("]) {
  assert(askCfs.includes(operation), `Ask CFS persistence is missing ${operation}.`);
}

for (const source of [planningPersistence, planningReportDrafts, economics, askCfs]) {
  assert.doesNotMatch(source, /fetch\s*\([^)]*\/api\/v1/);
}

console.log("Enterprise frontend architecture checks passed; browser persistence remains the acceptance proof.");
