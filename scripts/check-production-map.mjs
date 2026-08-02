import assert from "node:assert/strict";

const baseUrl = (
  process.env.CFS_PRODUCTION_MAP_URL ??
  "https://cabarrus-future-scape.vercel.app"
).replace(/\/$/, "");
assert(
  !["127.0.0.1", "localhost", "::1"].includes(new URL(baseUrl).hostname),
  "Production map canary must target a deployed site.",
);

process.env.CFS_INTERACTIVE_MAP_BASE_URL = baseUrl;
await import("./check-interactive-map.mjs");
