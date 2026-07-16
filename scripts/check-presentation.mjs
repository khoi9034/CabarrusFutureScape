const frontend = "http://localhost:3000";
const backend = "http://127.0.0.1:8000";

async function check(name, fn, required = true) {
  try {
    const detail = await fn();
    console.log(`${required ? "PASS" : "WARN"} ${name}${detail ? `: ${detail}` : ""}`);
    return true;
  } catch (error) {
    console.log(`${required ? "FAIL" : "WARN"} ${name}: ${error.message}`);
    return !required;
  }
}

async function getJson(url) {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function postJson(url, body) {
  const response = await fetch(url, {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    method: "POST",
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

const checks = [
  check("frontend", async () => {
    const response = await fetch(frontend);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return frontend;
  }),
  check("backend docs", async () => {
    const response = await fetch(`${backend}/docs`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return `${backend}/docs`;
  }),
  check("backend health", async () => {
    const body = await getJson(`${backend}/health`);
    return body.status ?? "ok";
  }),
  check("database health", async () => {
    const body = await getJson(`${backend}/health/database`);
    return body.database ?? body.status ?? "ok";
  }),
  check("economics intelligence", async () => {
    const body = await getJson(`${backend}/economics/intelligence`);
    return body.context_freshness ?? body.mode ?? "ok";
  }),
  check("Power BI export", async () => {
    const body = await getJson(`${backend}/economics/powerbi-export`);
    return body.as_of ? `updated ${body.as_of}` : "ok";
  }),
  check("Ask CFS status", async () => {
    const body = await getJson(`${backend}/ai/status`);
    return `provider=${body.configured_provider}; key=${body.api_key_configured ? "configured" : "not configured"}; fallback=${body.deterministic_fallback_available}`;
  }),
  check("Ask CFS search", async () => {
    const body = await postJson(`${backend}/ai/search`, {
      app_mode: "planning",
      mode: "live",
      query: "What should I inspect first?",
    });
    if (!body.answer || !Array.isArray(body.evidence)) throw new Error("invalid response");
    return body.provider_status ?? body.provider ?? "ok";
  }),
];

const ok = (await Promise.all(checks)).every(Boolean);
process.exit(ok ? 0 : 1);
