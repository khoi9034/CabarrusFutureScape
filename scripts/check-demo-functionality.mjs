import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";

const root = process.cwd();

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

function json(path) {
  return JSON.parse(read(path));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertIncludes(path, text, expected) {
  assert(text.includes(expected), `${path} missing ${expected}`);
}

function validateAsset(asset) {
  assert(asset.path, `required demo asset is missing path metadata`);
  assert(asset.schema, `${asset.path} is missing schema metadata`);
  assert(Number(asset.record_count) > 0, `${asset.path} is missing record_count metadata`);
  assert(asset.source_classification, `${asset.path} is missing source metadata`);
  assert(asset.sanitized === true, `${asset.path} is not marked sanitized`);
  const full = join(root, asset.path);
  assert(existsSync(full), `missing required demo asset: ${asset.path}`);
  assert(statSync(full).size > 0, `empty required demo asset: ${asset.path}`);
  if ([".json", ".geojson"].includes(extname(asset.path))) json(asset.path);
  if (extname(asset.path) === ".csv") {
    assert(read(asset.path).trim().split(/\r?\n/).length > 1, `empty csv data asset: ${asset.path}`);
  }
}

const manifest = json("public/demo-data/demo_manifest.json");
assert(manifest.mode === "portfolio_demo", "demo manifest mode drifted");
assert(Array.isArray(manifest.required_assets), "demo manifest missing required_assets");
manifest.required_assets.filter((asset) => asset.required).forEach(validateAsset);

const funnel = json("case-studies/large-development-land/screening_funnel.json").counts;
const expectedFunnel = {
  countywide_parcels_reviewed: 110017,
  parcels_meeting_minimum_100_acres: 241,
  parcels_with_usable_planning_and_investment_evidence: 241,
  parcels_passing_initial_screens: 62,
  parcels_receiving_preliminary_manual_review: 10,
  final_shortlist_count: 3,
};
for (const [key, expected] of Object.entries(expectedFunnel)) {
  assert(funnel[key] === expected, `CASE-1 funnel ${key} drifted: ${funnel[key]} !== ${expected}`);
}

const shortlist = json("case-studies/large-development-land/shortlisted_candidates.json").candidates;
const candidates = Object.fromEntries(shortlist.map((candidate) => [candidate.parcel_id, candidate]));
for (const [parcelId, score, acres, developable] of [
  ["CFS-PARCEL-0149758869", 89, 489.43, 392.11],
  ["CFS-PARCEL-0149760035", 77, 670.27, 554.36],
  ["CFS-PARCEL-0149777275", 36, 233.26, 112.85],
]) {
  const candidate = candidates[parcelId];
  assert(candidate, `missing CASE-1 candidate ${parcelId}`);
  assert(candidate.screening_score === score, `${parcelId} score drifted`);
  assert(candidate.gross_acres === acres, `${parcelId} gross acres drifted`);
  assert(candidate.preliminary_developable_acres === developable, `${parcelId} developable acres drifted`);
}

const diagnostics = json("case-studies/large-development-land/final_diagnostic_exhibits.json");
const residuals = Object.fromEntries(diagnostics.scenario_comparison.map((row) => [
  row.scenario,
  Math.round((row.residual_after_selling_carry / 1_000_000) * 100) / 100,
]));
for (const [scenario, expected] of [["Downside", -110.2], ["Base", -64.34], ["Upside", -14.25]]) {
  assert(residuals[scenario] === expected, `${scenario} residual drifted: ${residuals[scenario]} !== ${expected}`);
}

const service = read("src/lib/investmentIntelligenceService.ts");
assertIncludes("src/lib/investmentIntelligenceService.ts", service, "getDemoInvestmentScreen(strategy)");
assertIncludes("src/lib/investmentIntelligenceService.ts", service, "createDemoInvestmentSavedSearch(payload)");
assertIncludes("src/lib/investmentIntelligenceService.ts", service, "createDemoInvestmentIntakeCandidate(payload)");
assert(!service.includes("Investment screening uses local FastAPI in live mode."), "demo screening still throws live-mode error");

const shell = read("src/components/economics/EconomicsShell.tsx");
assertIncludes("src/components/economics/EconomicsShell.tsx", shell, "Run Screening");
assertIncludes("src/components/economics/EconomicsShell.tsx", shell, "Large Development Land");
assertIncludes("src/components/economics/EconomicsShell.tsx", shell, "Open Property Review");
assertIncludes("src/components/economics/EconomicsShell.tsx", shell, "No search results yet. Run Screening");
assert(!shell.includes('defaultValue="industrial_site"'), "Find Sites still defaults to industrial_site");
assert(!shell.includes("Find Sites: Industrial Site"), "Find Sites saved search still uses Industrial Site");

console.log("PASS demo functionality contracts");
