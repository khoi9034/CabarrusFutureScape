import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

function assertIncludes(name, text, expected) {
  if (!text.includes(expected)) {
    throw new Error(`${name} is missing: ${expected}`);
  }
}

function assertNotIncludes(name, text, unexpected) {
  if (text.includes(unexpected)) {
    throw new Error(`${name} still contains: ${unexpected}`);
  }
}

function walk(dir) {
  return readdirSync(join(root, dir)).flatMap((entry) => {
    const path = join(dir, entry);
    const fullPath = join(root, path);
    return statSync(fullPath).isDirectory() ? walk(path) : [path];
  });
}

const home = read("src/components/layout/CfsMasterHome.tsx");
assertIncludes("Master Home", home, "Portfolio demonstration using sanitized, cached public demo data");
assert.deepEqual(
  [...home.matchAll(/href: "\/\?app=([^\"]+)"/g)].map((match) => match[1]),
  ["planning", "economics", "master-data"],
  "Master Home must expose exactly three primary workspace cards.",
);
assertIncludes("Master Home", home, 'data-testid="cfs-home-shared-ask-cfs"');
assertIncludes("Master Home", home, "lg:grid-cols-3");
assertNotIncludes("Master Home", home, "cfs-home-card-ask-cfs");
assertNotIncludes("Master Home", home, "xl:grid-cols-4");

const topNav = read("src/components/layout/TopNav.tsx");
const appModeOptions = topNav.match(/const appModeOptions = \[([\s\S]*?)\] as const;/)?.[1] ?? "";
assert.deepEqual(
  [...appModeOptions.matchAll(/id: "([^\"]+)"/g)].map((match) => match[1]),
  ["planning", "economics", "master-data"],
  "Primary navigation must expose exactly three workspace choices.",
);
assertIncludes("Top Nav", topNav, 'data-testid="shared-ask-cfs-toggle"');

const appShell = read("src/components/layout/AppShell.tsx");
assertIncludes("App Shell", appShell, "<SharedAskCfsDrawer");
assertIncludes("App Shell", appShell, "appMode={cfsAppMode}");

const page = read("src/app/page.tsx");
assert.match(
  page,
  /appMode === "ask-cfs"[\s\S]*?redirect\("\/"\);/,
  "The retired standalone Ask CFS URL must redirect safely to Home.",
);
for (const path of [
  "src/types/index.ts",
  "src/hooks/useDashboardState.tsx",
  "src/components/dashboard/DashboardUrlSync.tsx",
]) {
  assertNotIncludes(path, read(path), '"ask-cfs"');
}

for (const path of walk("src").filter((file) => /\.(ts|tsx)$/.test(file))) {
  assertNotIncludes(path, read(path), "CFS Consulting");
}

console.log("PASS product acceptance contracts");
