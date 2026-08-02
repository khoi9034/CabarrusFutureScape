import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

const root = resolve(import.meta.dirname, "..");
const packagePath = join(root, "node_modules", "@arcgis", "core", "package.json");
const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
const sdkVersion = packageJson.version;
const sourceRoot = join(root, "node_modules", "@arcgis", "core", "assets");
const publicRoot = join(root, "public", "arcgis-assets");
const destinationRoot = join(publicRoot, sdkVersion);
const manifestPath = join(publicRoot, "manifest.json");
const assetsPath = `/arcgis-assets/${sdkVersion}`;
const checkOnly = process.argv.includes("--check");

assert(typeof sdkVersion === "string" && sdkVersion, "ArcGIS SDK version is missing.");
assert(existsSync(sourceRoot), `ArcGIS SDK assets are missing: ${sourceRoot}`);

if (!checkOnly) {
  mkdirSync(destinationRoot, { recursive: true });
  cpSync(sourceRoot, destinationRoot, { recursive: true, force: true });
}

const sourceAssets = inventory(sourceRoot);
const expectedManifest = {
  assetCount: sourceAssets.length,
  assets: sourceAssets,
  assetsPath,
  generatedAt: new Date().toISOString(),
  sdkVersion,
  totalBytes: sourceAssets.reduce((sum, asset) => sum + asset.size, 0),
};

if (!checkOnly) {
  mkdirSync(dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, `${JSON.stringify(expectedManifest, null, 2)}\n`);
}

assert(existsSync(manifestPath), `ArcGIS asset manifest is missing: ${manifestPath}`);
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const recordedAssets = new Map(manifest.assets.map((asset) => [asset.path, asset]));
assert.equal(manifest.sdkVersion, sdkVersion, "ArcGIS asset SDK version is stale.");
assert.equal(manifest.assetsPath, assetsPath, "ArcGIS assetsPath is stale.");
assert.equal(manifest.assetCount, sourceAssets.length, "ArcGIS asset count is stale.");
assert.equal(manifest.totalBytes, expectedManifest.totalBytes, "ArcGIS asset bytes are stale.");
assert.equal(manifest.assets.length, sourceAssets.length, "ArcGIS manifest inventory is stale.");
assert.deepEqual(
  inventory(destinationRoot),
  sourceAssets,
  "Copied ArcGIS asset tree differs from the installed SDK.",
);

for (const sourceAsset of sourceAssets) {
  const recorded = recordedAssets.get(sourceAsset.path);
  assert(recorded, `ArcGIS asset is absent from the manifest: ${sourceAsset.path}`);
  assert.deepEqual(recorded, sourceAsset, `ArcGIS source asset changed: ${sourceAsset.path}`);
}

console.log(
  `PASS ArcGIS ${sdkVersion} assets (${sourceAssets.length} files, ${expectedManifest.totalBytes} bytes, ${assetsPath})`,
);

function inventory(directory) {
  return walk(directory)
    .map((path) => ({
      checksum: checksum(path),
      path: relative(directory, path).split(sep).join("/"),
      size: statSync(path).size,
    }))
    .sort((left, right) => left.path.localeCompare(right.path));
}

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

function checksum(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}
