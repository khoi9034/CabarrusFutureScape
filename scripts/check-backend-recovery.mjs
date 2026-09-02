import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [route, hook, panel, shell, management] = await Promise.all([
  readFile("src/app/api/local/restart-backend/route.ts", "utf8"),
  readFile("src/hooks/useBackendAvailability.ts", "utf8"),
  readFile("src/components/layout/BackendRecoveryPanel.tsx", "utf8"),
  readFile("src/components/layout/AppShell.tsx", "utf8"),
  readFile("src/components/management/ManagementWorkspace.tsx", "utf8"),
]);

assert.match(route, /runtimeMode !== "local"/);
assert.match(route, /isSameOriginLoopback\(request\)/);
assert.match(route, /start-cfs-presentation\.ps1/);
assert.match(route, /"-BackendOnly"/);
assert.doesNotMatch(route, /request\.(json|text|formData)\(/);
assert.doesNotMatch(route, /\bexec(?:File)?\(/);

assert.match(hook, /getApiReady/);
assert.match(hook, /\/api\/local\/restart-backend/);
assert.match(hook, /restartTimeoutMs = 90_000/);
assert.match(hook, /CFS_RUNTIME_MODE === "local"/);
assert.match(panel, /Live data connection unavailable/i);
assert.match(panel, /Restart backend/);
assert.match(panel, /Try again/);

assert.equal(shell.match(/useBackendAvailability\(\)/g)?.length, 1);
assert.match(shell, /BackendRecoveryPanel compact controller=\{backendAvailability\}/);
assert.match(shell, /cfsAppMode !== "management" \|\| backendAvailability\.status === "healthy"/);
assert.match(management, /backend\.status !== "healthy"/);
assert.doesNotMatch(management, /\{economics\.error/);

console.log("PASS shared local-only backend recovery contract");
