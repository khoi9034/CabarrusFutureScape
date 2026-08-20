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

for (const route of ["app=planning", "app=economics", "app=master-data", "app=ask-cfs"]) {
  assertIncludes("Master Home", home, route);
}

for (const path of walk("src").filter((file) => /\.(ts|tsx)$/.test(file))) {
  assertNotIncludes(path, read(path), "CFS Consulting");
}

console.log("PASS product acceptance contracts");
