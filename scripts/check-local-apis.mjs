import fs from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import process from "node:process";

const BASE_URL = process.env.CFS_API_BASE_URL ?? "http://127.0.0.1:8000";
const base = new URL(BASE_URL);
if (!["127.0.0.1", "localhost"].includes(base.hostname)) {
  throw new Error("check-local-apis only permits a loopback FastAPI target.");
}

const ROOT = process.cwd();
const LOGS = path.join(ROOT, "logs");
const REPORT_PATH = path.join(LOGS, "local-api-inventory.json");
const PARCEL = "CFS-PARCEL-0149726579";
const METHODS = new Set(["get", "post", "put", "patch", "delete"]);
const results = [];

function responseSchema(operation) {
  const successful = Object.entries(operation.responses ?? {}).find(([status]) =>
    /^2\d\d$/.test(status),
  )?.[1];
  const schema = successful?.content?.["application/json"]?.schema;
  return schema?.$ref ?? schema?.type ?? (successful ? "documented response" : null);
}

function requiredParameters(operation) {
  const parameters = (operation.parameters ?? [])
    .filter((parameter) => parameter.required)
    .map((parameter) => `${parameter.in}:${parameter.name}`);
  if (operation.requestBody?.required) parameters.push("body");
  return parameters;
}

function groupName(operation) {
  const tag = operation.tags?.[0] ?? "Other";
  return (
    {
      "CFS AI Search": "Ask CFS",
      "CFS Economics": "Economics",
      "Constraint Intelligence": "Constraints",
      "Development Activity": "Development and Temporal",
      "Indicator Center": "Indicators",
      "Parcel Intelligence": "Parcels",
      "School Constraints": "School constraints",
      "WSACC Utility Readiness": "WSACC",
    }[tag] ?? tag
  );
}

function expectedStatus(operation) {
  return (
    Object.keys(operation.responses ?? {}).find((status) => /^2\d\d$/.test(status)) ??
    "200"
  );
}

function isMeaningful(data) {
  if (typeof data === "string") return data.trim().length > 0;
  if (Array.isArray(data)) return true;
  return data !== null && typeof data === "object" && Object.keys(data).length > 0;
}

async function probe({
  label,
  method = "GET",
  operationPath,
  requestPath = operationPath,
  body,
  expected = [200],
  fixture = label,
  validate = isMeaningful,
  recordInventory = true,
  timeoutMs = 45_000,
}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = performance.now();
  let status = 0;
  let data = null;
  let contentLength = 0;
  let error = null;

  try {
    const response = await fetch(new URL(requestPath, base), {
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      method,
      signal: controller.signal,
    });
    status = response.status;
    const text = await response.text();
    contentLength = text.length;
    const contentType = response.headers.get("content-type") ?? "";
    data = contentType.includes("json") && text ? JSON.parse(text) : text;
    if (!expected.includes(status)) {
      error = `unexpected HTTP ${status}`;
    } else if (!validate(data)) {
      error = "response content validation failed";
    }
  } catch (requestError) {
    error =
      requestError?.name === "AbortError"
        ? `timed out after ${timeoutMs} ms`
        : `request failed (${requestError?.name ?? "Error"})`;
  } finally {
    clearTimeout(timer);
  }

  const result = {
    label,
    method,
    operation_path: operationPath,
    request_path: requestPath,
    fixture,
    expected_status: expected.join(" or "),
    measured_status: status || "ERR",
    response_ms: Math.round((performance.now() - started) * 10) / 10,
    response_length: contentLength,
    status: error ? "FAIL" : "PASS",
    error,
    record_inventory: recordInventory,
  };
  results.push(result);
  return { ...result, data };
}

function pathWithCoreFixture(openapiPath) {
  return openapiPath
    .replace("{official_parcel_id}", PARCEL)
    .replace("{parcel_id}", PARCEL)
    .replace("{table_name}", "economics_kpi_fact");
}

function legacyOperationPath(openapiPath) {
  return openapiPath.replace(/^\/api\/v1(?=\/)/, "");
}

function withCoreQuery(openapiPath, operation, requestPath) {
  const url = new URL(requestPath, base);
  const legacyPath = legacyOperationPath(openapiPath);
  if (legacyPath === "/parcels/search") url.searchParams.set("q", PARCEL);
  if (legacyPath === `/parcels/{official_parcel_id}`) {
    url.searchParams.set("include_geometry", "true");
  }
  if ((operation.parameters ?? []).some((parameter) => parameter.name === "limit")) {
    url.searchParams.set("limit", "2");
  }
  return `${url.pathname}${url.search}`;
}

function coreValidator(openapiPath) {
  const legacyPath = legacyOperationPath(openapiPath);
  if (legacyPath === "/health/ready") {
    return (data) => data?.status === "ready" && data?.database === "connected";
  }
  if (legacyPath === "/health/database") {
    return (data) => data?.database === "connected";
  }
  if (legacyPath === "/parcels/search") {
    return (data) =>
      data?.total_count >= 1 && data?.results?.[0]?.official_parcel_id === PARCEL;
  }
  if (legacyPath === `/parcels/{official_parcel_id}`) {
    return (data) =>
      JSON.stringify(data).includes(PARCEL) &&
      JSON.stringify(data).toLowerCase().includes("geometry");
  }
  return isMeaningful;
}

const askQuestions = {
  planning: [
    "What should I inspect first for this parcel?",
    "What does the flood review indicate?",
    "What does the school-capacity context mean?",
    "What data is still missing?",
    "What does the development activity show?",
  ],
  economics: [
    "What does revenue per acre mean?",
    "Why is this parcel classified as underbuilt?",
    "What are the main fiscal opportunity signals?",
    "Which values are observed and which are derived?",
    "What should not be interpreted as an official forecast?",
  ],
  "master-data": [
    "What does this governed dataset context contain?",
  ],
};

function validateAskResponse(data) {
  const text = `${data?.answer ?? ""} ${(data?.caveats ?? []).join(" ")}`.toLowerCase();
  const prohibitedClaims = [
    "official approval has been granted",
    "utility capacity is confirmed",
    "official appraisal value is",
    "positive land basis is confirmed",
  ];
  return (
    data?.data_mode === "live" &&
    typeof data?.answer === "string" &&
    data.answer.trim().length > 20 &&
    Array.isArray(data?.evidence) &&
    data.evidence.length > 0 &&
    data.evidence.every((item) => item?.source && item?.title) &&
    Array.isArray(data?.caveats) &&
    data.caveats.length > 0 &&
    !text.includes("traceback") &&
    !prohibitedClaims.some((claim) => text.includes(claim))
  );
}

async function runAskChecks() {
  await probe({
    label: "Ask CFS provider status",
    operationPath: "/ai/status",
    fixture: "active local provider configuration",
    validate: (data) =>
      data?.deterministic_fallback_available === true &&
      typeof data?.ai_enabled === "boolean" &&
      ["none", "openai"].includes(data?.configured_provider),
  });

  for (const [appMode, questions] of Object.entries(askQuestions)) {
    for (const question of questions) {
      await probe({
        label: `Ask CFS ${appMode}: ${question}`,
        method: "POST",
        operationPath: "/ai/search",
        body: {
          app_mode: appMode,
          filter_context: appMode === "master-data"
            ? {
                master_data_dataset_id: "permits",
                master_data_dataset_name: "Permits",
                master_data_filters: "permit_date gte",
                mode: "master_data",
              }
            : { selected_parcel_id: PARCEL },
          mode: "live",
          query: question,
        },
        fixture: appMode === "master-data"
          ? "Master Data question with approved aggregate context"
          : `${appMode} question with canonical parcel context`,
        validate: validateAskResponse,
        timeoutMs: 60_000,
      });
    }
  }

  await probe({
    label: "Ask CFS versioned compatibility",
    method: "POST",
    operationPath: "/api/v1/ai/search",
    body: {
      app_mode: "planning",
      filter_context: { selected_parcel_id: PARCEL },
      mode: "live",
      query: askQuestions.planning[0],
    },
    fixture: "representative versioned planning question",
    validate: validateAskResponse,
    timeoutMs: 60_000,
  });
}

async function main() {
  await fs.mkdir(LOGS, { recursive: true });
  const openapiProbe = await probe({
    label: "OpenAPI document",
    operationPath: "/openapi.json",
    fixture: "active FastAPI schema",
    validate: (data) => data?.openapi && data?.paths && data?.components,
    recordInventory: false,
  });
  if (openapiProbe.status !== "PASS") {
    throw new Error("The active local OpenAPI document is unavailable.");
  }
  const openapi = openapiProbe.data;

  const inventory = [];
  for (const [openapiPath, pathItem] of Object.entries(openapi.paths)) {
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!METHODS.has(method)) continue;
      inventory.push({
        method: method.toUpperCase(),
        path: openapiPath,
        group: groupName(operation),
        purpose: operation.summary ?? operation.operationId ?? "Documented API operation",
        required_parameters: requiredParameters(operation),
        response_schema: responseSchema(operation),
        database_dependency: !["Root", "Health"].includes(groupName(operation)),
        presentation_relevance: groupName(operation) === "Product V1"
          ? "pending classification"
          : "presentation",
        test_fixture: null,
        expected_status: expectedStatus(operation),
        measured_status: null,
        measured_response_ms: null,
        status: "NOT_RUN",
      });
    }
  }

  for (const item of inventory.filter(
    (item) => item.group !== "Product V1" && item.method === "GET",
  )) {
    const operation = openapi.paths[item.path].get;
    const requestPath = withCoreQuery(
      item.path,
      operation,
      pathWithCoreFixture(item.path),
    );
    await probe({
      label: `${item.group} ${item.path}`,
      operationPath: item.path,
      requestPath,
      fixture:
        item.path.includes("{official_parcel_id}") || item.path.includes("{parcel_id}")
          ? "canonical representative parcel"
          : item.path.includes("{table_name}")
            ? "economics_kpi_fact CSV"
            : "OpenAPI defaults with limit 2 where supported",
      validate: coreValidator(item.path),
    });
  }

  await probe({
    label: "parcel no-match behavior",
    operationPath: "/parcels/search",
    requestPath: "/parcels/search?q=CFS-NO-MATCH-PRESENTATION&limit=1",
    fixture: "known no-match query",
    validate: (data) => data?.total_count === 0 && data?.results?.length === 0,
  });
  await probe({
    label: "parcel malformed query behavior",
    operationPath: "/parcels/search",
    requestPath: "/parcels/search?q=CFS-PARCEL&limit=0",
    expected: [422],
    fixture: "out-of-range pagination limit",
    validate: (data) => Array.isArray(data?.detail),
  });
  await probe({
    label: "parcel pagination behavior",
    operationPath: "/parcels/search",
    requestPath: "/parcels/search?q=CFS-PARCEL&limit=2&offset=1",
    fixture: "limit 2, offset 1",
    validate: (data) => data?.limit === 2 && data?.offset === 1 && data?.results?.length <= 2,
  });

  await runAskChecks();

  for (const item of inventory) {
    const matching = results.filter(
      (result) =>
        result.record_inventory &&
        result.method === item.method &&
        result.operation_path === item.path,
    );
    if (matching.length) {
      item.presentation_relevance = "presentation";
      item.test_fixture = [...new Set(matching.map((result) => result.fixture))].join("; ");
      item.expected_status = [...new Set(matching.map((result) => result.expected_status))].join(
        "; ",
      );
      item.measured_status = [...new Set(matching.map((result) => result.measured_status))].join(
        "; ",
      );
      item.measured_response_ms =
        Math.round(Math.max(...matching.map((result) => result.response_ms)) * 10) / 10;
      item.status = matching.every((result) => result.status === "PASS") ? "PASS" : "FAIL";
    } else if (item.presentation_relevance === "presentation") {
      item.status = "FAIL";
      item.test_fixture = "missing presentation fixture";
    } else {
      item.presentation_relevance = "intentionally excluded: admin, refresh, or canonical mutation";
      item.status = "INTENTIONALLY_EXCLUDED";
    }
  }

  const relevant = inventory.filter((item) => item.presentation_relevance === "presentation");
  const failures = relevant.filter((item) => item.status === "FAIL");
  const slow = results.filter(
    (result) => result.status === "PASS" && result.response_ms > 5_000,
  );
  const groupSummary = Object.values(
    inventory.reduce((groups, item) => {
      groups[item.group] ??= {
        group: item.group,
        discovered: 0,
        relevant: 0,
        passed: 0,
        failed: 0,
        excluded: 0,
      };
      const group = groups[item.group];
      group.discovered += 1;
      if (item.presentation_relevance === "presentation") group.relevant += 1;
      if (item.status === "PASS") group.passed += 1;
      if (item.status === "FAIL") group.failed += 1;
      if (item.status === "INTENTIONALLY_EXCLUDED") group.excluded += 1;
      return groups;
    }, {}),
  );

  const report = {
    checked_at: new Date().toISOString(),
    target: BASE_URL,
    status: failures.length ? "FAIL" : "PASS",
    summary: {
      total_endpoints_discovered: inventory.length,
      presentation_relevant: relevant.length,
      passed: relevant.filter((item) => item.status === "PASS").length,
      failed: failures.length,
      intentionally_excluded: inventory.filter(
        (item) => item.status === "INTENTIONALLY_EXCLUDED",
      ).length,
      slow_requests_over_5_seconds: slow.length,
    },
    groups: groupSummary,
    endpoints: inventory,
    probes: results,
  };
  await fs.writeFile(REPORT_PATH, JSON.stringify(report, null, 2));

  console.log(`[local-apis] ${report.status}`);
  console.log(
    `[local-apis] ${inventory.length} discovered; ${relevant.length} relevant; ` +
      `${report.summary.passed} passed; ${failures.length} failed; ` +
      `${report.summary.intentionally_excluded} intentionally excluded.`,
  );
  console.log(
    `[local-apis] ${slow.length} request(s) exceeded 5 seconds.`,
  );
  console.log(`[local-apis] Report: ${REPORT_PATH}`);
  for (const failure of failures) {
    console.error(`[local-apis] FAIL ${failure.method} ${failure.path}`);
  }
  process.exitCode = report.status === "PASS" ? 0 : 1;
}

await main();
