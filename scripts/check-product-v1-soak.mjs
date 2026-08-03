import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const minimumSeconds = 45 * 60;
const requestedSeconds = Number(
  process.env.CFS_PRODUCT_V1_SOAK_SECONDS ?? minimumSeconds,
);
if (!Number.isFinite(requestedSeconds) || requestedSeconds <= 0) {
  throw new Error("CFS_PRODUCT_V1_SOAK_SECONDS must be a positive number.");
}
if (
  requestedSeconds < minimumSeconds &&
  process.env.CFS_ALLOW_SHORT_SOAK !== "true"
) {
  throw new Error(
    `Product V1 soak must run at least ${minimumSeconds} seconds; set CFS_ALLOW_SHORT_SOAK=true only for checker development.`,
  );
}

const protectedPaths = [
  "outputs/lea_pupil_context_ingestion_summary.json",
  "outputs/school_capacity_ingestion_last_run.json",
  "outputs/school_presentation_utilization_seed_last_run.json",
  "logs/production-map-e89e3e8.png",
  ...trackedCasePaths(),
];
const before = new Map(
  protectedPaths.filter(existsSync).map((path) => [path, sha256(path)]),
);
const restartManifestPath = "logs/frontend-persistence-restart-manifest.json";
let startedAt;
let deadline;
let restarted = false;
let round = 0;
const live = {
  askConversationId: null,
  economicsScenarioId: null,
  investmentEngagementId: null,
  investmentIntakeId: null,
  investmentSavedSearchId: null,
  investmentUnderwritingId: null,
  planningSnapshotId: null,
  projectId: null,
  propertyReviewId: null,
  reportBucketItemId: null,
  reportId: null,
  prefix: `CFS-PRODUCT-V1-SOAK-${Date.now()}`,
};
let primaryFailure = null;
let canonicalRelationCounts = null;
const frontendPersistenceRuns = [];

try {
  runNpm("db:migrate", false, {
    CFS_ARTIFACT_PROVIDER: "local_file",
    CFS_AUTH_MODE: "local_dev",
    CFS_DATABASE_AUTH_MODE: "password",
    CFS_DATA_PROVIDER: "local_api",
    CFS_JOB_PROVIDER: "inline",
    CFS_RUNTIME_MODE: "local",
    DATABASE_URL: "",
    POSTGRES_DB: "cfs_dev",
    POSTGRES_HOST: "localhost",
    POSTGRES_PORT: "5433",
  });
  runNpm("present:cfs");
  runAcceptanceRound();
  canonicalRelationCounts = readCanonicalRelationCounts();
  await seedLiveProductRecords();
  startedAt = Date.now();
  deadline = startedAt + requestedSeconds * 1000;

  while (Date.now() < deadline) {
    round += 1;
    runNpm("check:local-apis");

    if (round % 5 === 0) {
      runNpm("check:product-v1");
    }

    if (!restarted && Date.now() >= startedAt + requestedSeconds * 500) {
      runFrontendPersistencePhase("seed", "restart-seed");
      runNpm("present:cfs", false, {}, ["--", "-FrontendOnly"]);
      runFrontendPersistencePhase("verify", "frontend-only");
      runNpm("present:cfs", false, {}, ["--", "-BackendOnly"]);
      runFrontendPersistencePhase("verify", "backend-only");
      runFrontendPersistencePhase("cleanup", "restart-cleanup");
      runNpm("check:local-apis");
      await verifyLiveProductRecords();
      await verifyLiveAudit();
      await api(`/api/v1/ask-cfs/conversations/${live.askConversationId}/reset`, {
        method: "POST",
        retry: true,
      });
      restarted = true;
      console.log("PASS owned frontend/backend restart and Product V1 persistence");
    }

    if (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 30_000));
    }
  }

  await verifyLiveProductRecords();
  await verifyLiveAudit();
  runAcceptanceRound();
  assert.deepEqual(readCanonicalRelationCounts(), canonicalRelationCounts);
  if (!restarted) throw new Error("Soak ended before the restart checkpoint.");
  assert.ok(frontendPersistenceRuns.length >= 6, "Browser persistence did not cover acceptance and phased restart proof.");
  for (const label of ["restart-seed", "frontend-only", "backend-only", "restart-cleanup"]) {
    assert.ok(frontendPersistenceRuns.some((run) => run.label === label), `Browser persistence omitted ${label}.`);
  }
  assertProtectedArtifacts();
  const elapsedSeconds = Math.floor((Date.now() - startedAt) / 1000);
  if (elapsedSeconds < requestedSeconds) {
    throw new Error(`Soak ran ${elapsedSeconds}s, expected ${requestedSeconds}s.`);
  }
  console.log(
    `PASS Product V1 soak (${elapsedSeconds}s, ${round} health rounds, restart verified, ${frontendPersistenceRuns.length} browser persistence runs)`,
  );
} catch (error) {
  primaryFailure = error;
  throw error;
} finally {
  let cleanupFailure = null;
  try {
    if (primaryFailure && restartManifestNeedsCleanup()) {
      runNpm("check:frontend-persistence", false, {
        CFS_FRONTEND_PERSISTENCE_FORCE_CLEANUP: "true",
        CFS_FRONTEND_PERSISTENCE_PHASE: "cleanup",
        CFS_FRONTEND_PERSISTENCE_RESTART_LABEL: "failure-cleanup",
      });
    }
  } catch (error) {
    cleanupFailure = error;
  }
  try {
    await archiveLiveProductRecords();
  } catch (error) {
    cleanupFailure ??= error;
  }
  runNpm("stop:cfs", true);
  assertProtectedArtifacts();
  if (cleanupFailure) {
    if (!primaryFailure) throw cleanupFailure;
    console.error(`Product V1 cleanup also failed: ${cleanupFailure.message}`);
  }
}

async function seedLiveProductRecords() {
  const project = await api("/api/v1/projects", {
    body: {
      description: "Disposable 45-minute Product V1 persistence proof",
      name: live.prefix,
      project_type: "Enterprise V1 soak",
    },
    method: "POST",
  });
  live.projectId = project.id;

  const snapshot = await api("/api/v1/planning/snapshots", {
    body: {
      included_sections: ["map", "planning_context"],
      map_state: { extent: "soak-proof", renderer: "interactive" },
      notes: "Persist across backend restart",
      project_id: live.projectId,
      title: `${live.prefix} Planning`,
    },
    method: "POST",
  });
  live.planningSnapshotId = snapshot.id;
  await api(`/api/v1/planning/snapshots/${snapshot.id}/versions`, {
    body: { note: "Soak baseline" },
    method: "POST",
  });

  const scenario = await api("/api/v1/economics/scenarios", {
    body: {
      assumptions: { horizon_years: 5 },
      name: `${live.prefix} Economics`,
      notes: "Persist across backend restart",
      outputs: { status: "screening_only" },
      project_id: live.projectId,
    },
    method: "POST",
  });
  live.economicsScenarioId = scenario.id;
  await api(`/api/v1/economics/scenarios/${scenario.id}/versions`, {
    body: { note: "Soak baseline" },
    method: "POST",
  });

  const conversation = await api("/api/v1/ask-cfs/conversations", {
    body: {
      product_context: { test_scope: "Product V1 soak" },
      project_id: live.projectId,
      title: `${live.prefix} Ask CFS`,
    },
    method: "POST",
  });
  live.askConversationId = conversation.id;
  await api(`/api/v1/ask-cfs/conversations/${conversation.id}/messages`, {
    body: {
      provider_mode: "none",
      role: "user",
      safe_question: "Confirm this disposable persistence check.",
    },
    method: "POST",
  });
  await api(`/api/v1/ask-cfs/conversations/${conversation.id}/messages`, {
    body: {
      prompt_version: "soak-v1",
      provider_mode: "none",
      role: "assistant",
      safe_answer_summary: "Disposable persistence check recorded.",
    },
    method: "POST",
  });

  const savedSearch = await legacyApi("/investment/saved-searches", {
    body: {
      advanced_criteria: {},
      essential_criteria: {},
      goal: "Custom",
      guided_or_advanced: "guided",
      result_summary: {},
      search_name: `${live.prefix} Search`,
    },
    method: "POST",
  });
  live.investmentSavedSearchId = savedSearch.id;

  const converted = await legacyApi(
    `/investment/saved-searches/${encodeURIComponent(savedSearch.id)}/engagement`,
    { method: "POST" },
  );
  live.investmentEngagementId = converted.engagement.id;
  await legacyApi(
    `/investment/engagements/${encodeURIComponent(converted.engagement.id)}/criteria`,
    {
      body: {
        criteria: [
          {
            criterion: "Verify all sources before further diligence",
            type: "Needs Verification",
          },
        ],
      },
      method: "POST",
    },
  );

  const intake = await legacyApi("/investment/intake", {
    body: {
      candidate_name: `${live.prefix} Opportunity`,
      review_status: "Screening",
      source_type: "Manual Research",
      strategy: "development_land",
      user_notes: "Disposable Product V1 soak opportunity",
    },
    method: "POST",
  });
  live.investmentIntakeId = intake.candidate.id;
  await legacyApi(
    `/investment/engagements/${encodeURIComponent(converted.engagement.id)}/shortlist`,
    {
      body: {
        item_id: intake.candidate.id,
        item_type: "intake_candidate",
        notes: "Disposable Product V1 soak shortlist",
        status: "Shortlist",
      },
      method: "POST",
    },
  );

  const underwriting = await legacyApi("/investment/underwriting/scenarios", {
    body: {
      assumptions: {},
      candidate_id: intake.candidate.id,
      private_notes: "Disposable Product V1 soak underwriting draft",
      scenario_name: `${live.prefix} Underwriting`,
      scenario_status: "Draft",
      scenario_type: "development_land",
      strategy: "development_land",
    },
    method: "POST",
  });
  live.investmentUnderwritingId = underwriting.id;

  const propertyReview = await api("/api/v1/investments/property-reviews", {
    body: {
      findings: {
        engagement_id: live.investmentEngagementId,
        saved_search_id: live.investmentSavedSearchId,
        shortlist_status: "Shortlist",
        underwriting_scenario_id: live.investmentUnderwritingId,
      },
      notes: `${live.prefix} disposable property review`,
      opportunity_id: live.investmentIntakeId,
      project_id: live.projectId,
      review_status: "In Review",
    },
    method: "POST",
  });
  live.propertyReviewId = propertyReview.id;

  const report = await api("/api/v1/reports", {
    body: {
      payload: {
        engagement_id: live.investmentEngagementId,
        opportunity_id: live.investmentIntakeId,
        property_review_id: live.propertyReviewId,
        saved_search_id: live.investmentSavedSearchId,
        underwriting_scenario_id: live.investmentUnderwritingId,
      },
      project_id: live.projectId,
      report_type: "Investment lifecycle soak",
      status: "Draft",
      title: `${live.prefix} Report`,
    },
    method: "POST",
  });
  live.reportId = report.id;

  const reportBucketItem = await api("/api/v1/reports/bucket", {
    body: {
      include_in_print: true,
      object_id: live.propertyReviewId,
      object_type: "property_review",
      payload: { source: "Product V1 soak" },
      position: 1,
      project_id: live.projectId,
      report_id: live.reportId,
      title: `${live.prefix} Report bucket`,
    },
    method: "POST",
  });
  live.reportBucketItemId = reportBucketItem.id;

  await verifyLiveProductRecords();
  console.log(
    "PASS seeded live Planning, Economics, Ask CFS, Investment, and report persistence records",
  );
}

async function verifyLiveProductRecords() {
  if (!live.projectId) return;
  const [
    project,
    snapshot,
    scenario,
    conversation,
    savedSearches,
    engagement,
    intake,
    underwriting,
    propertyReview,
    report,
    reportBucketItem,
  ] = await Promise.all([
    api(`/api/v1/projects/${live.projectId}`),
    api(`/api/v1/planning/snapshots/${live.planningSnapshotId}`),
    api(`/api/v1/economics/scenarios/${live.economicsScenarioId}`),
    api(`/api/v1/ask-cfs/conversations/${live.askConversationId}`),
    legacyApi("/investment/saved-searches"),
    legacyApi(
      `/investment/engagements/${encodeURIComponent(live.investmentEngagementId)}`,
    ),
    legacyApi(`/investment/intake/${encodeURIComponent(live.investmentIntakeId)}`),
    legacyApi(
      `/investment/underwriting/scenarios/${encodeURIComponent(live.investmentUnderwritingId)}`,
    ),
    api(`/api/v1/investments/property-reviews/${live.propertyReviewId}`),
    api(`/api/v1/reports/${live.reportId}`),
    api(`/api/v1/reports/bucket/${live.reportBucketItemId}`),
  ]);
  assert.equal(project.name, live.prefix);
  assert.equal(snapshot.project_id, live.projectId);
  assert.equal(snapshot.current_version, 2);
  assert.equal(snapshot.map_state?.renderer, "interactive");
  assert.equal(scenario.project_id, live.projectId);
  assert.equal(scenario.current_version, 2);
  assert.equal(conversation.project_id, live.projectId);
  assert.equal(
    savedSearches.searches.find(
      (search) => search.id === live.investmentSavedSearchId,
    )?.search_name,
    `${live.prefix} Search`,
  );
  assert.ok(engagement.engagement_name.includes(live.prefix));
  assert.ok(
    engagement.shortlist.some(
      (item) =>
        item.item_id === live.investmentIntakeId &&
        item.item_type === "intake_candidate" &&
        item.status === "Shortlist",
    ),
  );
  assert.equal(intake.candidate_name, `${live.prefix} Opportunity`);
  assert.equal(underwriting.candidate_id, live.investmentIntakeId);
  assert.equal(underwriting.scenario_status, "Draft");
  assert.equal(propertyReview.project_id, live.projectId);
  assert.equal(propertyReview.opportunity_id, live.investmentIntakeId);
  assert.equal(
    propertyReview.findings?.underwriting_scenario_id,
    live.investmentUnderwritingId,
  );
  assert.equal(report.project_id, live.projectId);
  assert.equal(report.payload?.property_review_id, live.propertyReviewId);
  assert.equal(reportBucketItem.project_id, live.projectId);
  assert.equal(reportBucketItem.report_id, live.reportId);
  assert.equal(reportBucketItem.object_id, live.propertyReviewId);
}

async function verifyLiveAudit() {
  for (const id of [
    live.projectId,
    live.planningSnapshotId,
    live.economicsScenarioId,
    live.askConversationId,
    live.propertyReviewId,
    live.reportId,
    live.reportBucketItemId,
  ]) {
    const events = await api(`/api/v1/audit?limit=100&object_id=${encodeURIComponent(id)}`);
    assert.ok(events.some((event) => event.object_id === id), `Audit history is missing ${id}`);
  }
}

async function archiveLiveProductRecords() {
  if (!live.projectId) return;
  for (const [path, id] of [
    ["/api/v1/reports/bucket", live.reportBucketItemId],
    ["/api/v1/reports", live.reportId],
    ["/api/v1/investments/property-reviews", live.propertyReviewId],
    ["/api/v1/planning/snapshots", live.planningSnapshotId],
    ["/api/v1/economics/scenarios", live.economicsScenarioId],
    ["/api/v1/ask-cfs/conversations", live.askConversationId],
    ["/api/v1/projects", live.projectId],
  ]) {
    if (id) {
      await api(`${path}/${id}/archive`, {
        allowNotFound: true,
        method: "POST",
        retry: true,
      });
    }
  }

  for (const [path, id] of [
    ["/investment/underwriting/scenarios", live.investmentUnderwritingId],
    ["/investment/engagements", live.investmentEngagementId],
    ["/investment/intake", live.investmentIntakeId],
    ["/investment/saved-searches", live.investmentSavedSearchId],
  ]) {
    if (!id) continue;
    const result = await legacyApi(`${path}/${encodeURIComponent(id)}`, {
      allowNotFound: true,
      method: "DELETE",
      retry: true,
    });
    if (result) assert.equal(result.deleted, true);
  }

  for (const path of [
    "/api/v1/reports/bucket",
    "/api/v1/reports",
    "/api/v1/investments/property-reviews",
    "/api/v1/planning/snapshots",
    "/api/v1/economics/scenarios",
    "/api/v1/ask-cfs/conversations",
    "/api/v1/projects",
  ]) {
    const rows = await api(`${path}?page_size=100`);
    assert.ok(!rows.some((row) => JSON.stringify(row).includes(live.prefix)));
  }
  const [savedSearches, engagements, intake, underwriting] = await Promise.all([
    legacyApi("/investment/saved-searches"),
    legacyApi("/investment/engagements"),
    legacyApi("/investment/intake"),
    legacyApi("/investment/underwriting/scenarios"),
  ]);
  assert.ok(
    !savedSearches.searches.some(
      (record) => record.id === live.investmentSavedSearchId,
    ),
  );
  assert.ok(
    !engagements.engagements.some(
      (record) => record.id === live.investmentEngagementId,
    ),
  );
  assert.ok(
    !intake.candidates.some((record) => record.id === live.investmentIntakeId),
  );
  assert.ok(
    !underwriting.scenarios.some(
      (record) => record.id === live.investmentUnderwritingId,
    ),
  );
  console.log("PASS archived/deleted disposable live Product V1 records");
}

async function legacyApi(path, options = {}) {
  return api(path, { ...options, raw: true });
}

async function api(
  path,
  {
    allowNotFound = false,
    body,
    method = "GET",
    raw = false,
    retry = false,
  } = {},
) {
  let response;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      response = await fetch(new URL(path, "http://127.0.0.1:8000"), {
        body: body === undefined ? undefined : JSON.stringify(body),
        headers: {
          Accept: "application/json",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          "X-Request-ID": `cfs-soak-${Date.now()}`,
        },
        method,
        signal: AbortSignal.timeout(30_000),
      });
      break;
    } catch (error) {
      if ((method !== "GET" && !retry) || attempt === 3) {
        throw new Error(`${method} ${path} failed after ${attempt} attempt(s).`, {
          cause: error,
        });
      }
      await new Promise((resolve) => setTimeout(resolve, attempt * 250));
    }
  }
  const payload = await response.json();
  if (allowNotFound && response.status === 404) return null;
  if (!response.ok) {
    throw new Error(
      `${method} ${path} returned ${response.status}: ${JSON.stringify(payload).slice(0, 500)}`,
    );
  }
  assert.ok(response.headers.get("x-request-id"), `${method} ${path} omitted X-Request-ID`);
  return raw ? payload : payload.data;
}

function runAcceptanceRound() {
  for (const script of [
    "check:product-v1",
    "check:local-data",
    "check:local-apis",
    "check:local-interactions",
    "check:local-presentation",
    "check:ask-cfs",
    "check:powerbi",
  ]) {
    runNpm(script);
    if (script === "check:local-presentation") {
      recordFrontendPersistenceProof("full", `acceptance-round-${frontendPersistenceRuns.length + 1}`);
    }
  }
}

function runFrontendPersistencePhase(phase, label) {
  runNpm("check:frontend-persistence", false, {
    CFS_FRONTEND_PERSISTENCE_PHASE: phase,
    CFS_FRONTEND_PERSISTENCE_RESTART_LABEL: phase === "verify" ? label : "",
  });
  recordFrontendPersistenceProof(phase, label);
}

function recordFrontendPersistenceProof(phase, label) {
  const proof = JSON.parse(readFileSync("logs/frontend-persistence-last-run.json", "utf8").replace(/^\uFEFF/, ""));
  assert.equal(proof.status, "PASS", `${label} browser persistence report did not pass.`);
  assert.equal(proof.phase, phase, `${label} browser persistence ran the wrong phase.`);
  frontendPersistenceRuns.push({
    branch_head: proof.branch_head,
    checked_at: proof.checked_at,
    finished_at: proof.finished_at,
    label,
    phase,
    workflows: proof.workflows?.length ?? 0,
  });
  console.log(`PASS ${label}: ${frontendPersistenceRuns.at(-1).workflows} browser persistence workflows`);
}

function runNpm(script, bestEffort = false, environment = {}, scriptArguments = []) {
  const npmCli = process.env.npm_execpath;
  if (!npmCli) throw new Error("npm_execpath is unavailable.");
  const result = spawnSync(process.execPath, [npmCli, "run", script, ...scriptArguments], {
    env: { ...process.env, ...environment },
    stdio: "inherit",
  });
  if (!bestEffort && result.status !== 0) {
    throw new Error(`npm run ${script} failed with exit code ${result.status ?? 1}.`);
  }
}

function restartManifestNeedsCleanup() {
  if (!existsSync(restartManifestPath)) return false;
  const manifest = JSON.parse(readFileSync(restartManifestPath, "utf8").replace(/^\uFEFF/, ""));
  return !["cleaned", "cleanup_after_failure"].includes(manifest.status);
}

function assertProtectedArtifacts() {
  for (const [path, expected] of before) {
    if (sha256(path) !== expected) {
      throw new Error(`Soak modified protected or canonical artifact ${path}`);
    }
  }
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function trackedCasePaths() {
  const result = spawnSync(
    "git",
    ["ls-files", "--", "case-studies/large-development-land", "docs/case-studies", "src/app/case-studies/large-development-land"],
    { encoding: "utf8" },
  );
  if (result.status !== 0) throw new Error("Unable to inventory protected CASE artifacts.");
  return result.stdout.split(/\r?\n/).filter(Boolean);
}

function readCanonicalRelationCounts() {
  const report = JSON.parse(readFileSync("logs/local-data-readiness.json", "utf8"));
  return Object.fromEntries(
    Object.entries(report.relations ?? {}).map(([name, value]) => [name, value.rows]),
  );
}
