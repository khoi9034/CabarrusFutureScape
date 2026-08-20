import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const protectedPaths = [
  "outputs/lea_pupil_context_ingestion_summary.json",
  "outputs/school_capacity_ingestion_last_run.json",
  "outputs/school_presentation_utilization_seed_last_run.json",
  "logs/production-map-e89e3e8.png",
];
const before = new Map(
  protectedPaths
    .filter(existsSync)
    .map((path) => [path, sha256(path)]),
);

try {
  assertFrontendPersistenceContract();
  for (const [command, args] of [
    ["node", ["scripts/check-runtime-config.mjs"]],
    ["node", ["scripts/check-enterprise-frontend.mjs"]],
    ["node", ["--check", "scripts/check-frontend-persistence.mjs"]],
    ["python", ["-m", "pytest", "backend/tests/product_v1", "-q"]],
    ["node", ["scripts/check-containers.mjs"]],
  ]) {
    const result = spawnSync(command, args, {
      env: process.env,
      stdio: "inherit",
    });
    if (result.status !== 0) {
      throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status ?? 1}.`);
    }
  }
} finally {
  for (const [path, expected] of before) {
    if (sha256(path) !== expected) {
      throw new Error(`Product V1 checks modified protected artifact ${path}`);
    }
  }
}

console.log("PASS Enterprise Product V1 checks");

function assertFrontendPersistenceContract() {
  const packageJson = readFileSync("package.json", "utf8");
  const checker = readFileSync("scripts/check-frontend-persistence.mjs", "utf8");
  const soak = readFileSync("scripts/check-product-v1-soak.mjs", "utf8");
  const localPresentation = readFileSync("scripts/check-local-presentation.mjs", "utf8");
  assert.match(packageJson, /"check:frontend-persistence":\s*"node scripts\/check-frontend-persistence\.mjs"/);
  for (const resource of [
    "/api/v1/planning/snapshots",
    "/api/v1/economics/scenarios",
    "/api/v1/reports",
    "/api/v1/reports/bucket",
    "/api/v1/ask-cfs/conversations",
  ]) {
    assert(checker.includes(resource), `Frontend persistence checker omitted ${resource}.`);
  }
  for (const phase of ["cleanup", "full", "seed", "verify"]) {
    assert(checker.includes(`"${phase}"`), `Frontend persistence checker omitted ${phase}.`);
  }
  assert.match(checker, /runOwnedRestartProof\(\)/);
  assert.match(checker, /late initial list cannot replace a completed UI create/);
  assert.match(checker, /produced \$\{matchingWrites\.length\} successful writes/);
  assert.match(soak, /\["--", "-FrontendOnly"\]/);
  assert.match(soak, /\["--", "-BackendOnly"\]/);
  assert.match(soak, /runFrontendPersistencePhase\("verify", "frontend-only"\)/);
  assert.match(soak, /runFrontendPersistencePhase\("verify", "backend-only"\)/);
  assert(localPresentation.includes("scripts/check-frontend-persistence.mjs"));
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}
