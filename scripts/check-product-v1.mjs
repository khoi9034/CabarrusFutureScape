import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const protectedPaths = [
  "outputs/lea_pupil_context_ingestion_summary.json",
  "outputs/school_capacity_ingestion_last_run.json",
  "outputs/school_presentation_utilization_seed_last_run.json",
  "logs/production-map-e89e3e8.png",
  ...trackedCasePaths(),
];
const before = new Map(
  protectedPaths
    .filter(existsSync)
    .map((path) => [path, sha256(path)]),
);

try {
  for (const [command, args] of [
    ["node", ["scripts/check-runtime-config.mjs"]],
    ["node", ["scripts/check-enterprise-frontend.mjs"]],
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

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function trackedCasePaths() {
  const result = spawnSync(
    "git",
    ["ls-files", "--", "case-studies/large-development-land", "docs/case-studies", "src/app/case-studies/large-development-land"],
    { encoding: "utf8" },
  );
  if (result.status !== 0) throw new Error("Unable to inventory protected CASE artifacts.");
  return result.stdout.split(/\r?\n/).filter(Boolean);
}
