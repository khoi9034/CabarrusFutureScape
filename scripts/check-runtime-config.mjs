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

console.log("Runtime configuration matrix and legacy aliases passed.");
