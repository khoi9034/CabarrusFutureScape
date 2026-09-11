import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [route, hook, panel, shell, management, presentation, ask] = await Promise.all([
  readFile("src/app/api/local/restart-backend/route.ts", "utf8"),
  readFile("src/hooks/useBackendAvailability.ts", "utf8"),
  readFile("src/components/layout/BackendRecoveryPanel.tsx", "utf8"),
  readFile("src/components/layout/AppShell.tsx", "utf8"),
  readFile("src/components/management/ManagementWorkspace.tsx", "utf8"),
  readFile("scripts/start-cfs-presentation.ps1", "utf8"),
  readFile("src/components/dashboard/AskCfsPanel.tsx", "utf8"),
]);

assert.match(route, /runtimeMode !== "local"/);
assert.match(route, /isSameOriginLoopback\(request\)/);
assert.match(route, /loopbackHosts\.has\(originUrl\.hostname\)/);
assert.match(route, /originUrl\.port === requestUrl\.port/);
assert.match(route, /spawnSync/);
assert.match(route, /start-cfs-presentation\.ps1/);
assert.match(route, /"-BackendOnly"/);
assert.match(route, /timeout: 90_000/);
assert.match(route, /process\.env\.CFS_PROJECT_ROOT \|\| process\.cwd\(\)/);
assert.doesNotMatch(route, /detached: true|restartProcess|\.unref\(\)/);
assert.doesNotMatch(route, /request\.(json|text|formData)\(/);
assert.doesNotMatch(route, /\bexec(?:File)?\(/);

assert.match(hook, /getApiReady/);
assert.match(hook, /\/api\/local\/restart-backend/);
assert.match(hook, /restartTimeoutMs = 90_000/);
assert.match(hook, /consecutiveReadyChecks >= 2/);
assert.match(hook, /CFS_RUNTIME_MODE === "local"/);
assert.match(panel, /Live data connection unavailable/i);
assert.match(panel, /Restart local data service/);
assert.match(panel, /Try again/);

assert.equal(shell.match(/useBackendAvailability\(\)/g)?.length, 1);
assert.match(shell, /backend: backendAvailability/);
assert.match(shell, /backendAvailability\.status !== "healthy"/);
assert.match(shell, /key=\{`cfs-workspace-data-\$\{backendAvailability\.refreshKey\}`\}/);
assert.match(shell, /BackendRecoveryPanel compact controller=\{backendAvailability\}/);
assert.match(shell, /cfsAppMode !== "management" \|\| backendAvailability\.status === "healthy"/);
assert.match(management, /backend\.status !== "healthy"/);
assert.doesNotMatch(management, /\{economics\.error/);
assert.match(hook, /status: BackendConnectionStatus/);
assert.match(panel, /Cabarrus Insights cannot currently reach the local data service/);
assert.doesNotMatch(presentation, /check-local-apis|ApiCheck|Complete local API preflight/);
assert.match(presentation, /if \(!\$BackendOnly\) \{\s*\$frontendReady = Wait-Http/);
assert.match(presentation, /Win32_Process/);
assert.match(presentation, /\.next\\standalone\\server\.js/);
assert.match(presentation, /\.next\\standalone\\\.next\\static/);
assert.match(presentation, /CFS_PROJECT_ROOT/);
assert.match(ask, /liveDataBlocked/);
assert.match(ask, /Historical conversation .* not current evidence/);
assert.match(ask, /Live County data is currently unavailable, so I can't verify/);
assert.match(ask, /BackendRecoveryPanel compact controller=\{backend\}/);

console.log("PASS shared local-only backend recovery contract");
