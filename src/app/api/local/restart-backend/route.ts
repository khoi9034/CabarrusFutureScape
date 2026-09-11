import { spawnSync } from "node:child_process";
import { closeSync, existsSync, openSync } from "node:fs";
import { join } from "node:path";
import { CFS_RUNTIME_CONFIG } from "@/lib/runtimeConfig";

export const runtime = "nodejs";

const loopbackHosts = new Set(["127.0.0.1", "::1", "[::1]", "localhost"]);
let restartRequestedAt = 0;

export async function POST(request: Request) {
  if (
    CFS_RUNTIME_CONFIG.runtimeMode !== "local" ||
    !isSameOriginLoopback(request)
  ) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  if (Date.now() - restartRequestedAt < 5_000) {
    return Response.json({ status: "starting" }, { status: 202 });
  }

  const projectRoot = process.env.CFS_PROJECT_ROOT || process.cwd();
  const script = join(projectRoot, "scripts", "start-cfs-presentation.ps1");
  if (!existsSync(script)) {
    return Response.json({ error: "Local recovery is unavailable" }, { status: 503 });
  }

  const log = openSync(join(projectRoot, "logs", "backend-recovery.log"), "a");
  try {
    const result = spawnSync(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, "-BackendOnly"],
      {
        cwd: projectRoot,
        stdio: ["ignore", log, log],
        timeout: 90_000,
        windowsHide: true,
      },
    );
    if (result.error || result.status !== 0) {
      throw result.error ?? new Error(`Recovery handoff exited with ${result.status}.`);
    }
    restartRequestedAt = Date.now();
    return Response.json({ status: "starting" }, { status: 202 });
  } catch (error) {
    console.error("Unable to start the supported CFS backend recovery command.", error);
    return Response.json({ error: "Local recovery is unavailable" }, { status: 503 });
  } finally {
    closeSync(log);
  }
}

function isSameOriginLoopback(request: Request) {
  try {
    const requestUrl = new URL(request.url);
    const origin = request.headers.get("origin");
    const originUrl = origin ? new URL(origin) : null;
    return Boolean(
      originUrl &&
      loopbackHosts.has(requestUrl.hostname) &&
      loopbackHosts.has(originUrl.hostname) &&
      originUrl.protocol === requestUrl.protocol &&
      originUrl.port === requestUrl.port,
    );
  } catch {
    return false;
  }
}
