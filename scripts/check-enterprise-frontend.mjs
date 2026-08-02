import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const runtime = read("src/lib/runtimeConfig.ts");
const client = read("src/lib/api/client.ts");
const auth = read("src/lib/auth/entra.ts");
const page = read("src/app/data-administration/page.tsx");
const panel = read("src/components/admin/DataAdministrationPanel.tsx");
const adminApi = read("src/lib/api/admin.ts");
const sourceApi = read("src/lib/api/dataSources.ts");
const methodology = read("src/components/dashboard/MethodologyWorkspace.tsx");

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

console.log("Enterprise frontend runtime and read-only administration checks passed.");
