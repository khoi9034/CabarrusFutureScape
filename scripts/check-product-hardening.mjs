import { spawnSync } from "node:child_process";

const checks = [
  "check:data-provenance",
  "check:ask-cfs",
  "check:enterprise-readiness",
  "check:powerbi",
  "check:arcgis-assets",
  "check:map-resilience",
  "check:interactive-map",
];

for (const check of checks) {
  console.log(`\n=== ${check} ===`);
  const command =
    process.platform === "win32" ? (process.env.ComSpec ?? "cmd.exe") : "npm";
  const args =
    process.platform === "win32"
      ? ["/d", "/s", "/c", `npm.cmd run ${check}`]
      : ["run", check];
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log(`\nProduct hardening checks passed (${checks.length}/${checks.length}).`);
