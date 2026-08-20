import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync("src/lib/runtimeConfig.ts", "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const runtimeModule = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);
const resolve = runtimeModule.resolveRuntimeConfig;
const basemapSource = readFileSync("src/lib/gis/basemapProvider.ts", "utf8");
const basemapCompiled = ts.transpileModule(basemapSource, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const basemapModule = await import(
  `data:text/javascript;base64,${Buffer.from(basemapCompiled).toString("base64")}`
);
const resolveBasemap = basemapModule.resolveBasemapProviderConfig;

assert.deepEqual(resolve({}), {
  aiProvider: "none",
  artifactProvider: "local_file",
  authMode: "off",
  dataProvider: "local_api",
  jobProvider: "inline",
  runtimeMode: "local",
  useBackendApi: true,
});

assert.deepEqual(
  resolve({ deploymentMode: "demo", useBackendApi: "false" }),
  {
    aiProvider: "none",
    artifactProvider: "public_static",
    authMode: "off",
    dataProvider: "static",
    jobProvider: "inline",
    runtimeMode: "demo",
    useBackendApi: false,
  },
);

assert.deepEqual(
  resolve({
    aiProvider: "deterministic",
    authMode: "entra",
    dataProvider: "enterprise_service",
    runtimeMode: "enterprise",
  }),
  {
    aiProvider: "none",
    artifactProvider: "object_storage",
    authMode: "oidc",
    dataProvider: "enterprise_api",
    jobProvider: "external_worker",
    runtimeMode: "enterprise",
    useBackendApi: true,
  },
);

assert.deepEqual(
  resolve({
    dataProvider: "sanitized_demo_extract",
    runtimeMode: "local",
    useBackendApi: "false",
  }),
  {
    aiProvider: "none",
    artifactProvider: "public_static",
    authMode: "off",
    dataProvider: "static",
    jobProvider: "inline",
    runtimeMode: "local",
    useBackendApi: false,
  },
);

assert.throws(
  () => resolve({ runtimeMode: "invalid" }),
  /Invalid NEXT_PUBLIC_CFS_RUNTIME_MODE/,
);
assert.throws(
  () => resolve({ dataProvider: "local_api", runtimeMode: "demo" }),
  /Demo mode requires static data/,
);
assert.throws(
  () => resolve({ authMode: "off", runtimeMode: "enterprise" }),
  /Enterprise mode requires oidc authentication/,
);
assert.throws(
  () =>
    resolve({
      dataProvider: "static",
      runtimeMode: "local",
      useBackendApi: "true",
    }),
  /conflicts with NEXT_PUBLIC_CFS_DATA_PROVIDER/,
);
assert.throws(
  () => resolve({ jobProvider: "external_worker", runtimeMode: "local" }),
  /Local mode requires inline jobs/,
);

assert.deepEqual(resolveBasemap({}), {
  attribution: "© OpenStreetMap contributors",
  kind: "openstreetmap",
  urlTemplate: "https://{subDomain}.tile.openstreetmap.org/{level}/{col}/{row}.png",
});
assert.deepEqual(
  resolveBasemap({
    attribution: " © Organization tile contributors ",
    urlTemplate: "https://tiles.example.gov/osm/{z}/{x}/{y}.png",
  }),
  {
    attribution: "© Organization tile contributors",
    kind: "web-tile",
    urlTemplate: "https://tiles.example.gov/osm/{z}/{x}/{y}.png",
  },
);
assert.deepEqual(
  resolveBasemap({
    urlTemplate: "https://tiles.example.gov/osm/{level}/{col}/{row}.png",
  }),
  {
    attribution: "© OpenStreetMap contributors",
    kind: "web-tile",
    urlTemplate: "https://tiles.example.gov/osm/{level}/{col}/{row}.png",
  },
);
for (const urlTemplate of [
  "http://tiles.example.gov/{z}/{x}/{y}.png",
  "https://user:secret@tiles.example.gov/{z}/{x}/{y}.png",
  "https://tiles.example.gov/{z}/{x}/{y}.png?token=secret",
  "https://tiles.example.gov/{z}/{x}/{y}.png#fragment",
  "https://{subDomain}.tiles.example.gov/{z}/{x}/{y}.png",
  "https://{z}.tiles.example.gov/{z}/{x}/{y}.png",
  "https://tiles.example.gov/{z}/{x}.png",
  "https://tiles.example.gov/{z}/{x}/{y}/{level}/{col}/{row}.png",
  "https://tiles.example.gov/{z}/{x}/{y}/{level}.png",
  "https://tiles.example.gov/{level}/{col}/{row}/{z}.png",
  "https://tiles.example.gov/{z}/{x}/{y}/{unknown}.png",
  "https://tiles.example.gov/{z}/{x}/{y}.png{",
  "https://tiles.example.gov/{z}/{x}/{y}.png}",
]) {
  assert.throws(
    () => resolveBasemap({ urlTemplate }),
    /NEXT_PUBLIC_CFS_BASEMAP_URL_TEMPLATE/,
    `Unsafe basemap template was accepted: ${urlTemplate}`,
  );
}

console.log("Runtime and basemap-provider configuration matrices passed.");
