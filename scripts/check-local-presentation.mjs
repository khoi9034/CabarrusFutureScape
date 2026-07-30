import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const checks = [
  ["Database readiness", "python", ["scripts/check_cfs_local_data.py"]],
  ["Backend and frontend readiness", process.execPath, ["scripts/check-presentation.mjs"]],
  ["OpenAPI and deterministic Ask CFS", process.execPath, ["scripts/check-local-apis.mjs"]],
  ["Live and offline browser workflows", process.execPath, ["scripts/check-local-interactions.mjs"]],
];
const results = [];

for (const [name, command, args] of checks) {
  const started = Date.now();
  const result = spawnSync(command, args, {
    cwd: root,
    env: process.env,
    stdio: "inherit",
    windowsHide: true,
  });
  results.push({
    name,
    elapsed_ms: Date.now() - started,
    status: result.status === 0 ? "PASS" : "FAIL",
  });
  if (result.status !== 0) break;
}

const failed = results.find((result) => result.status === "FAIL");
const summary = {
  checked_at: new Date().toISOString(),
  status: failed ? "FAIL" : "PASS",
  checks: results,
  total_ms: results.reduce((total, result) => total + result.elapsed_ms, 0),
};
fs.mkdirSync(path.join(root, "logs"), { recursive: true });
fs.writeFileSync(
  path.join(root, "logs", "local-presentation-readiness.json"),
  JSON.stringify(summary, null, 2),
);

console.log(
  `[local-presentation] ${summary.status} in ${(summary.total_ms / 1000).toFixed(1)} seconds.`,
);
for (const result of results) {
  console.log(
    `[local-presentation] ${result.status} ${result.name} (${(
      result.elapsed_ms / 1000
    ).toFixed(1)}s)`,
  );
}
process.exitCode = failed ? 1 : 0;
