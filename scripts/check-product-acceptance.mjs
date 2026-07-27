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

const investmentShell = read("src/components/investment/InvestmentShell.tsx");
assertIncludes("Investments shell", investmentShell, "CFS Investments");
assertIncludes("Investments shell", investmentShell, "portfolio demonstration using sanitized or cached public demo data");

const caseStudy = read("src/components/investment/InvestmentCaseStudies.tsx");
assertIncludes("CASE Decide", caseStudy, "Targeted diligence only.");
assertIncludes("CASE Decide", caseStudy, "Do not advance to acquisition pricing yet.");
assertIncludes("CASE Decide", caseStudy, "No current scenario supports a positive land basis");

for (const path of walk("src").filter((file) => /\.(ts|tsx)$/.test(file))) {
  assertNotIncludes(path, read(path), "CFS Consulting");
}

const diagnostic = JSON.parse(
  read("case-studies/large-development-land/final_diagnostic_exhibits.json"),
);
const residuals = Object.fromEntries(
  diagnostic.scenario_comparison.map((row) => [
    row.scenario,
    Math.round((row.residual_after_selling_carry / 1_000_000) * 100) / 100,
  ]),
);

for (const [scenario, expected] of [
  ["Downside", -110.2],
  ["Base", -64.34],
  ["Upside", -14.25],
]) {
  if (residuals[scenario] !== expected) {
    throw new Error(`${scenario} residual changed: expected ${expected}, got ${residuals[scenario]}`);
  }
}

console.log("PASS product acceptance contracts");
