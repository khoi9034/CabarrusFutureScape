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
const SECOND_PARCEL = "CFS-PARCEL-0149720360";
const TEMP_PREFIX = `CFS-PRESENTATION-TEST-${Date.now()}`;
const METHODS = new Set(["get", "post", "put", "patch", "delete"]);
const results = [];
const cleanup = [];
const cleanupChecks = [];

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
      "Investment Intelligence": "Investments",
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

function withCoreQuery(openapiPath, operation, requestPath) {
  const url = new URL(requestPath, base);
  if (openapiPath === "/parcels/search") url.searchParams.set("q", PARCEL);
  if (openapiPath === `/parcels/{official_parcel_id}`) {
    url.searchParams.set("include_geometry", "true");
  }
  if ((operation.parameters ?? []).some((parameter) => parameter.name === "limit")) {
    url.searchParams.set("limit", "2");
  }
  return `${url.pathname}${url.search}`;
}

function coreValidator(openapiPath) {
  if (openapiPath === "/health/ready") {
    return (data) => data?.status === "ready" && data?.database === "connected";
  }
  if (openapiPath === "/health/database") {
    return (data) => data?.database === "connected";
  }
  if (openapiPath === "/parcels/search") {
    return (data) =>
      data?.total_count >= 1 && data?.results?.[0]?.official_parcel_id === PARCEL;
  }
  if (openapiPath === `/parcels/{official_parcel_id}`) {
    return (data) =>
      JSON.stringify(data).includes(PARCEL) &&
      JSON.stringify(data).toLowerCase().includes("geometry");
  }
  return isMeaningful;
}

function entityId(data, containers = []) {
  for (const container of containers) {
    if (data?.[container]?.id) return data[container].id;
  }
  return data?.id ?? null;
}

function addCleanup(operationPath, requestPath, label) {
  cleanup.push({ operationPath, requestPath, label });
}

async function createIntake(suffix) {
  const created = await probe({
    label: `investment intake create ${suffix}`,
    method: "POST",
    operationPath: "/investment/intake",
    body: {
      candidate_name: `${TEMP_PREFIX}-${suffix}`,
      parcel_id: suffix === "A" ? PARCEL : SECOND_PARCEL,
      source_type: "Manual Research",
      strategy: "development_land",
      user_notes: "Disposable local presentation preflight record",
    },
    fixture: "disposable prefixed intake candidate",
  });
  const id = entityId(created.data, ["candidate"]);
  if (id) {
    addCleanup(
      "/investment/intake/{candidate_id}",
      `/investment/intake/${encodeURIComponent(id)}`,
      `investment intake cleanup ${suffix}`,
    );
  }
  return id;
}

async function createScenario(suffix) {
  const created = await probe({
    label: `underwriting scenario create ${suffix}`,
    method: "POST",
    operationPath: "/investment/underwriting/scenarios",
    body: {
      assumptions: {},
      parcel_id: suffix === "A" ? PARCEL : SECOND_PARCEL,
      scenario_name: `${TEMP_PREFIX}-SCENARIO-${suffix}`,
      scenario_type: "development_land",
      strategy: "development_land",
      private_notes: "Disposable presentation preflight scenario",
    },
    fixture: "disposable prefixed underwriting scenario",
  });
  const id = entityId(created.data, ["scenario"]);
  if (id) {
    addCleanup(
      "/investment/underwriting/scenarios/{scenario_id}",
      `/investment/underwriting/scenarios/${encodeURIComponent(id)}`,
      `underwriting scenario cleanup ${suffix}`,
    );
  }
  return id;
}

async function runInvestmentChecks() {
  const staticReads = [
    "/investment/strategies",
    `/investment/candidates/${PARCEL}`,
    "/investment/data-quality",
    "/investment/environmental/status",
    "/investment/market-context/acs/status",
    `/investment/candidates/${PARCEL}/market-context`,
    `/investment/candidates/${PARCEL}/environmental-context`,
    `/investment/research-context/${PARCEL}`,
    "/investment/intake",
    "/investment/saved-items",
    "/investment/recent-work",
    "/investment/saved-searches",
    "/investment/case-studies",
    "/investment/case-studies/large-development-land",
    "/investment/opportunities/sources",
    "/investment/opportunities",
    "/investment/engagements",
    "/investment/underwriting/templates",
    "/investment/underwriting/scenarios",
  ];
  const templatePath = (requestPath) =>
    requestPath
      .replace(PARCEL, "{parcel_id}")
      .replace("large-development-land", "{slug}");

  for (const requestPath of staticReads) {
    await probe({
      label: `investment read ${requestPath}`,
      operationPath: templatePath(requestPath),
      requestPath,
      fixture: requestPath.includes(PARCEL)
        ? "canonical representative parcel"
        : requestPath.includes("large-development-land")
          ? "CASE-1 repository slug"
          : "default read fixture",
    });
  }

  await probe({
    label: "investment screening",
    method: "POST",
    operationPath: "/investment/screen",
    body: { strategy: "development_land", limit: 120, filters: {} },
    fixture: "frontend development-land screen, limit 120",
  });
  await probe({
    label: "investment parcel comparison",
    method: "POST",
    operationPath: "/investment/compare",
    body: { parcel_ids: [PARCEL, SECOND_PARCEL], strategy: "development_land" },
    fixture: "two representative local parcels",
  });
  await probe({
    label: "investment report generation",
    method: "POST",
    operationPath: "/investment/reports/generate",
    body: {
      report_type: "land_investment_review",
      parcel_id: PARCEL,
      strategy: "development_land",
      selected_sections: [],
      selected_comparables: [],
    },
    fixture: "representative parcel property-review report",
  });

  const intakeA = await createIntake("A");
  const intakeB = await createIntake("B");
  if (intakeA) {
    const encoded = encodeURIComponent(intakeA);
    for (const suffix of [
      "",
      "/analysis",
      "/market-context",
      "/environmental-context",
      "/research-context",
    ]) {
      const templateSuffix = suffix;
      await probe({
        label: `investment intake read ${suffix || "detail"}`,
        operationPath: `/investment/intake/{candidate_id}${templateSuffix}`,
        requestPath: `/investment/intake/${encoded}${suffix}`,
        fixture: "disposable prefixed intake candidate",
      });
    }
    await probe({
      label: "investment intake patch",
      method: "PATCH",
      operationPath: "/investment/intake/{candidate_id}",
      requestPath: `/investment/intake/${encoded}`,
      body: {
        review_status: "Screening",
        user_notes: "Disposable presentation preflight record, updated",
      },
      fixture: "disposable prefixed intake candidate",
    });
  }
  if (intakeA && intakeB) {
    await probe({
      label: "investment intake comparison",
      method: "POST",
      operationPath: "/investment/intake/compare",
      body: { candidate_ids: [intakeA, intakeB] },
      fixture: "two disposable prefixed candidates",
    });
  }

  const savedItem = await probe({
    label: "saved item create",
    method: "POST",
    operationPath: "/investment/saved-items",
    body: {
      item_reference_id: `${TEMP_PREFIX}-SAVED-ITEM`,
      item_type: "parcel",
      label: `${TEMP_PREFIX}-SAVED-ITEM`,
      parcel_id: PARCEL,
      status: "Saved",
      strategy: "development_land",
    },
    fixture: "disposable prefixed saved item",
  });
  const savedItemId = entityId(savedItem.data, ["item"]);
  if (savedItemId) {
    const encoded = encodeURIComponent(savedItemId);
    addCleanup(
      "/investment/saved-items/{item_id}",
      `/investment/saved-items/${encoded}`,
      "saved item cleanup",
    );
    await probe({
      label: "saved item patch",
      method: "PATCH",
      operationPath: "/investment/saved-items/{item_id}",
      requestPath: `/investment/saved-items/${encoded}`,
      body: { status: "Reviewing", private_notes: "Disposable preflight" },
      fixture: "disposable prefixed saved item",
    });
    await probe({
      label: "saved item reorder",
      method: "POST",
      operationPath: "/investment/saved-items/reorder",
      body: { item_ids: [savedItemId] },
      fixture: "single disposable saved item",
    });
  }

  const recent = await probe({
    label: "recent work create",
    method: "POST",
    operationPath: "/investment/recent-work",
    body: {
      activity_type: "presentation_preflight",
      label: `${TEMP_PREFIX}-RECENT`,
      page: "projects",
      reference_id: `${TEMP_PREFIX}-RECENT`,
      reference_type: "parcel",
      parcel_id: PARCEL,
    },
    fixture: "disposable prefixed recent-work item",
  });
  const recentId = recent.data?.items?.find(
    (item) => item?.label === `${TEMP_PREFIX}-RECENT`,
  )?.id;
  if (recentId) {
    addCleanup(
      "/investment/recent-work/{item_id}",
      `/investment/recent-work/${encodeURIComponent(recentId)}`,
      "recent work cleanup",
    );
  }

  const savedSearch = await probe({
    label: "saved search create",
    method: "POST",
    operationPath: "/investment/saved-searches",
    body: {
      search_name: `${TEMP_PREFIX}-SEARCH`,
      goal: "Presentation preflight",
      guided_or_advanced: "guided",
      essential_criteria: {},
      advanced_criteria: {},
      result_summary: {},
    },
    fixture: "disposable prefixed saved search",
  });
  const searchId = entityId(savedSearch.data, ["search"]);
  if (searchId) {
    const encoded = encodeURIComponent(searchId);
    addCleanup(
      "/investment/saved-searches/{search_id}",
      `/investment/saved-searches/${encoded}`,
      "saved search cleanup",
    );
    await probe({
      label: "saved search patch",
      method: "PATCH",
      operationPath: "/investment/saved-searches/{search_id}",
      requestPath: `/investment/saved-searches/${encoded}`,
      body: { goal: "Presentation preflight updated" },
      fixture: "disposable prefixed saved search",
    });
    await probe({
      label: "saved search rerun",
      method: "POST",
      operationPath: "/investment/saved-searches/{search_id}/rerun",
      requestPath: `/investment/saved-searches/${encoded}/rerun`,
      fixture: "disposable prefixed saved search",
    });
    const duplicate = await probe({
      label: "saved search duplicate",
      method: "POST",
      operationPath: "/investment/saved-searches/{search_id}/duplicate",
      requestPath: `/investment/saved-searches/${encoded}/duplicate`,
      fixture: "disposable prefixed saved search",
    });
    const duplicateId = entityId(duplicate.data, ["search"]);
    if (duplicateId) {
      addCleanup(
        "/investment/saved-searches/{search_id}",
        `/investment/saved-searches/${encodeURIComponent(duplicateId)}`,
        "duplicated saved search cleanup",
      );
    }
    const converted = await probe({
      label: "saved search to engagement",
      method: "POST",
      operationPath: "/investment/saved-searches/{search_id}/engagement",
      requestPath: `/investment/saved-searches/${encoded}/engagement`,
      fixture: "disposable prefixed saved search",
    });
    const convertedId = entityId(converted.data, ["engagement"]);
    if (convertedId) {
      addCleanup(
        "/investment/engagements/{engagement_id}",
        `/investment/engagements/${encodeURIComponent(convertedId)}`,
        "converted engagement cleanup",
      );
    }
  }

  const engagement = await probe({
    label: "engagement create",
    method: "POST",
    operationPath: "/investment/engagements",
    body: {
      engagement_name: `${TEMP_PREFIX}-ENGAGEMENT`,
      engagement_status: "Draft",
      selected_strategy: "development_land",
      notes: "Disposable presentation preflight engagement",
    },
    fixture: "disposable prefixed engagement",
  });
  const engagementId = entityId(engagement.data, ["engagement"]);
  if (engagementId) {
    const encoded = encodeURIComponent(engagementId);
    addCleanup(
      "/investment/engagements/{engagement_id}",
      `/investment/engagements/${encoded}`,
      "engagement cleanup",
    );
    await probe({
      label: "engagement detail",
      operationPath: "/investment/engagements/{engagement_id}",
      requestPath: `/investment/engagements/${encoded}`,
      fixture: "disposable prefixed engagement",
    });
    await probe({
      label: "engagement patch",
      method: "PATCH",
      operationPath: "/investment/engagements/{engagement_id}",
      requestPath: `/investment/engagements/${encoded}`,
      body: { engagement_status: "In Review" },
      fixture: "disposable prefixed engagement",
    });
    await probe({
      label: "engagement criteria",
      method: "POST",
      operationPath: "/investment/engagements/{engagement_id}/criteria",
      requestPath: `/investment/engagements/${encoded}/criteria`,
      body: { criteria: [] },
      fixture: "disposable prefixed engagement",
    });
    await probe({
      label: "engagement shortlist",
      method: "POST",
      operationPath: "/investment/engagements/{engagement_id}/shortlist",
      requestPath: `/investment/engagements/${encoded}/shortlist`,
      body: { item_id: PARCEL, item_type: "parcel", status: "Longlist" },
      fixture: "representative parcel on disposable engagement",
    });
    await probe({
      label: "engagement report",
      method: "POST",
      operationPath: "/investment/engagements/{engagement_id}/report",
      requestPath: `/investment/engagements/${encoded}/report`,
      fixture: "disposable prefixed engagement",
    });
  }

  await probe({
    label: "underwriting prefill",
    method: "POST",
    operationPath: "/investment/underwriting/prefill",
    body: {
      parcel_id: PARCEL,
      scenario_type: "development_land",
      strategy: "development_land",
      existing_assumptions: {},
    },
    fixture: "representative parcel, development-land strategy",
  });
  await probe({
    label: "underwriting calculation",
    method: "POST",
    operationPath: "/investment/underwriting/calculate",
    body: {
      parcel_id: PARCEL,
      scenario_name: `${TEMP_PREFIX}-CALCULATION`,
      scenario_type: "development_land",
      strategy: "development_land",
      assumptions: {},
    },
    fixture: "representative parcel with default assumptions",
  });
  const scenarioA = await createScenario("A");
  const scenarioB = await createScenario("B");
  if (scenarioA) {
    const encoded = encodeURIComponent(scenarioA);
    await probe({
      label: "underwriting scenario detail",
      operationPath: "/investment/underwriting/scenarios/{scenario_id}",
      requestPath: `/investment/underwriting/scenarios/${encoded}`,
      fixture: "disposable prefixed scenario",
    });
    await probe({
      label: "underwriting scenario patch",
      method: "PATCH",
      operationPath: "/investment/underwriting/scenarios/{scenario_id}",
      requestPath: `/investment/underwriting/scenarios/${encoded}`,
      body: { scenario_status: "In Review" },
      fixture: "disposable prefixed scenario",
    });
    await probe({
      label: "underwriting saved-scenario calculation",
      method: "POST",
      operationPath: "/investment/underwriting/scenarios/{scenario_id}/calculate",
      requestPath: `/investment/underwriting/scenarios/${encoded}/calculate`,
      fixture: "disposable prefixed scenario",
    });
  }
  if (scenarioA && scenarioB) {
    await probe({
      label: "underwriting scenario comparison",
      method: "POST",
      operationPath: "/investment/underwriting/compare",
      body: { scenario_ids: [scenarioA, scenarioB] },
      fixture: "two disposable prefixed scenarios",
    });
  }

  const radar = await probe({
    label: "investment radar search",
    method: "POST",
    operationPath: "/investment/radar/search",
    requestPath: "/investment/radar/search?strategy=industrial_site",
    fixture: "industrial-site local radar search",
  });
  const areaId =
    radar.data?.areas?.[0]?.area_id ??
    radar.data?.areas?.[0]?.id ??
    radar.data?.results?.[0]?.area_id;
  if (areaId) {
    for (const suffix of ["", "/parcels", "/opportunities"]) {
      await probe({
        label: `radar area ${suffix || "detail"}`,
        operationPath: `/investment/radar/areas/{area_id}${suffix}`,
        requestPath: `/investment/radar/areas/${encodeURIComponent(areaId)}${suffix}`,
        fixture: "first local radar result",
      });
    }
  }
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
  consulting: [
    "Why is the priority parcel the strongest screening candidate?",
    "What are the major diligence risks?",
    "Why does the recommendation stop before acquisition pricing?",
    "Which assumptions drive the underwriting result?",
    "What should the investment reviewer do next?",
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
          filter_context: { selected_parcel_id: PARCEL },
          mode: "live",
          query: question,
        },
        fixture: `${appMode} question with canonical parcel context`,
        validate: validateAskResponse,
        timeoutMs: 60_000,
      });
    }
  }
}

async function cleanDisposableRecords() {
  for (const item of cleanup.reverse()) {
    const deleted = await probe({
      label: item.label,
      method: "DELETE",
      operationPath: item.operationPath,
      requestPath: item.requestPath,
      fixture: "disposable prefixed record",
      validate: (data) => data?.deleted === true,
    });
    cleanupChecks.push(deleted);
  }

  for (const endpoint of [
    "/investment/intake",
    "/investment/saved-items",
    "/investment/recent-work",
    "/investment/saved-searches",
    "/investment/engagements",
    "/investment/underwriting/scenarios",
  ]) {
    const verification = await probe({
      label: `cleanup prefix scan ${endpoint}`,
      operationPath: endpoint,
      requestPath: endpoint,
      fixture: "post-cleanup collection scan",
      validate: (data) => !JSON.stringify(data).includes(TEMP_PREFIX),
      recordInventory: false,
    });
    cleanupChecks.push(verification);
  }
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
        presentation_relevance:
          groupName(operation) === "Investments" ? "pending classification" : "presentation",
        test_fixture: null,
        expected_status: expectedStatus(operation),
        measured_status: null,
        measured_response_ms: null,
        status: "NOT_RUN",
      });
    }
  }

  for (const item of inventory.filter(
    (item) => item.group !== "Investments" && item.method === "GET",
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

  try {
    await runInvestmentChecks();
    await runAskChecks();
  } finally {
    await cleanDisposableRecords();
  }

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
  const cleanupFailures = cleanupChecks.filter((item) => item.status === "FAIL");
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
    status: failures.length || cleanupFailures.length ? "FAIL" : "PASS",
    summary: {
      total_endpoints_discovered: inventory.length,
      presentation_relevant: relevant.length,
      passed: relevant.filter((item) => item.status === "PASS").length,
      failed: failures.length,
      intentionally_excluded: inventory.filter(
        (item) => item.status === "INTENTIONALLY_EXCLUDED",
      ).length,
      slow_requests_over_5_seconds: slow.length,
      cleanup_failures: cleanupFailures.length,
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
    `[local-apis] ${slow.length} request(s) exceeded 5 seconds; cleanup failures: ${cleanupFailures.length}.`,
  );
  console.log(`[local-apis] Report: ${REPORT_PATH}`);
  for (const failure of failures) {
    console.error(`[local-apis] FAIL ${failure.method} ${failure.path}`);
  }
  for (const failure of cleanupFailures) {
    console.error(`[local-apis] FAIL ${failure.label}`);
  }
  process.exitCode = report.status === "PASS" ? 0 : 1;
}

await main();
