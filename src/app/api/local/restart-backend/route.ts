import { spawn } from "node:child_process";
import { closeSync, existsSync, openSync } from "node:fs";
import { join } from "node:path";
import { CFS_RUNTIME_CONFIG } from "@/lib/runtimeConfig";

export const runtime = "nodejs";

const loopbackHosts = new Set(["127.0.0.1", "::1", "[::1]", "localhost"]);
let restartProcess: ReturnType<typeof spawn> | null = null;

export async function POST(request: Request) {
  if (
    CFS_RUNTIME_CONFIG.runtimeMode !== "local" ||
    !isSameOriginLoopback(request)
  ) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  if (restartProcess?.exitCode === null) {
    return Response.json({ status: "starting" }, { status: 202 });
  }

  const script = join(process.cwd(), "scripts", "start-cfs-presentation.ps1");
  if (!existsSync(script)) {
    return Response.json({ error: "Local recovery is unavailable" }, { status: 503 });
  }

  try {
    const log = openSync(join(process.cwd(), "logs", "backend-recovery.log"), "a");
    restartProcess = spawn(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, "-BackendOnly"],
      { cwd: process.cwd(), stdio: ["ignore", log, log], windowsHide: true },
    );
    closeSync(log);
    restartProcess.once("exit", () => { restartProcess = null; });
    return Response.json({ status: "starting" }, { status: 202 });
  } catch (error) {
    console.error("Unable to start the supported CFS backend recovery command.", error);
    return Response.json({ error: "Local recovery is unavailable" }, { status: 503 });
  }
}

function isSameOriginLoopback(request: Request) {
  try {
    const requestUrl = new URL(request.url);
    const origin = request.headers.get("origin");
    return Boolean(
      origin &&
      loopbackHosts.has(requestUrl.hostname) &&
      new URL(origin).origin === requestUrl.origin,
    );
  } catch {
    return false;
  }
}
