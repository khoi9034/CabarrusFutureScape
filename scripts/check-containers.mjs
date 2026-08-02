import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const files = {
  backend: readFileSync("backend/Dockerfile", "utf8"),
  backendIgnore: readFileSync("backend/.dockerignore", "utf8"),
  compose: readFileSync("docker-compose.enterprise-local.yml", "utf8"),
  frontend: readFileSync("Dockerfile", "utf8"),
  rootIgnore: readFileSync(".dockerignore", "utf8"),
};

for (const [name, text] of Object.entries(files)) {
  assert(!/OPENAI_API_KEY\s*[:=]\s*\S+/i.test(text), `${name} embeds an OpenAI key`);
  assert(!/(password|secret|token)\s*[:=]\s*['\"]?[^$\s{][^\s]*/i.test(text), `${name} appears to embed a secret`);
}

for (const dockerfile of [files.frontend, files.backend]) {
  assert.match(dockerfile, /\bUSER\s+\S+/);
  assert.match(dockerfile, /\bHEALTHCHECK\b/);
  assert.doesNotMatch(dockerfile, /\bUSER\s+root\b/);
}

assert.match(files.frontend, /\bEXPOSE\s+3000\b/);
assert.match(files.backend, /\bEXPOSE\s+8000\b/);

for (const ignored of [files.rootIgnore, files.backendIgnore]) {
  for (const required of [".env", "backend.env", "local-data", "*.dump", "*.log"])
    assert(ignored.includes(required), `Docker ignore is missing ${required}`);
}

assert.match(files.frontend, /\.next\/standalone/);
assert.match(files.backend, /COPY\s+migrations\s+\.\/migrations/);
assert.match(files.compose, /CFS_ENTERPRISE_DATABASE_URL/);
for (const setting of [
  "CFS_RUNTIME_MODE",
  "CFS_DATA_PROVIDER",
  "CFS_AUTH_MODE",
  "CFS_ARTIFACT_PROVIDER",
  "CFS_JOB_PROVIDER",
])
  assert(files.compose.includes(setting), `Compose is missing ${setting}`);
assert.match(files.compose, /127\.0\.0\.1:\$\{CFS_API_PORT:-8000\}:8000/);
assert.match(files.compose, /127\.0\.0\.1:\$\{CFS_WEB_PORT:-3000\}:3000/);
assert.match(files.backend, /CFS_ARTIFACT_ROOT=\/app\/product-artifacts/);
assert.match(files.backend, /\/health\/ready/);
assert.match(files.compose, /cfs_product_artifacts:\/app\/product-artifacts/);
assert.match(files.compose, /\/health\/ready/);
assert.match(files.compose, /^volumes:\s*\r?\n\s+cfs_product_artifacts:/m);
assert.doesNotMatch(files.compose, /postgis\/postgis|container_name|privileged:/i);
assert.doesNotMatch(files.compose, /data\/|local-data|cfs_dev/i);

const compose = spawnSync(
  "docker",
  ["compose", "-f", "docker-compose.enterprise-local.yml", "config", "--quiet"],
  {
    encoding: "utf8",
    env: {
      ...process.env,
      CFS_ENTERPRISE_DATABASE_URL:
        "postgresql+psycopg://cfs_test:cfs_test@host.docker.internal:5432/cfs_product_v1_test",
    },
  },
);
assert.equal(compose.status, 0, compose.stderr || compose.stdout);

console.log("PASS container contracts and Compose configuration");
