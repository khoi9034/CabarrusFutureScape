import { createHash } from "node:crypto";

export const PRODUCT_ACCEPTANCE_RESOURCES = {
  planning: "/api/v1/planning/snapshots",
  economics: "/api/v1/economics/scenarios",
  report_bucket: "/api/v1/reports/bucket",
  ask_cfs: "/api/v1/ask-cfs/conversations",
};

export async function captureProductBaseline(apiUrl, requestPrefix) {
  const resources = {};
  for (const [kind, apiPath] of Object.entries(PRODUCT_ACCEPTANCE_RESOURCES)) {
    const records = await readPages(apiUrl, apiPath, requestPrefix);
    resources[kind] = {
      active_ids: records.map((record) => record.id).sort(),
      records: Object.fromEntries(
        await Promise.all(
          records.map(async (record) => [
            record.id,
            await fingerprint(apiUrl, kind, apiPath, record, requestPrefix),
          ]),
        ),
      ),
    };
  }
  return { captured_at: new Date().toISOString(), resources };
}

export async function verifyProductIsolation(
  apiUrl,
  requestPrefix,
  baseline,
  ownedIds = {},
) {
  const resources = {};
  const final_invariants = [];
  for (const [kind, apiPath] of Object.entries(PRODUCT_ACCEPTANCE_RESOURCES)) {
    const current = await readPages(apiUrl, apiPath, requestPrefix);
    const currentIds = current.map((record) => record.id).sort();
    const baselineIds = baseline.resources[kind].active_ids;
    const owned = [...(ownedIds[kind] ?? [])].sort();
    const ownedActive = currentIds.filter((id) => owned.includes(id));
    const unexpectedActive = currentIds.filter(
      (id) => !baselineIds.includes(id) && !owned.includes(id),
    );
    const baselineMutations = [];
    for (const id of baselineIds) {
      const record = await readOne(apiUrl, `${apiPath}/${encodeURIComponent(id)}`, requestPrefix);
      const before = baseline.resources[kind].records[id];
      const after = await fingerprint(apiUrl, kind, apiPath, record, requestPrefix);
      const addedAuditIds = after.audit_ids.filter((auditId) => !before.audit_ids.includes(auditId));
      if (
        before.record_sha256 !== after.record_sha256 ||
        before.messages_sha256 !== after.messages_sha256 ||
        addedAuditIds.length
      ) {
        baselineMutations.push({
          id,
          added_audit_ids: addedAuditIds,
          messages_changed: before.messages_sha256 !== after.messages_sha256,
          record_changed: before.record_sha256 !== after.record_sha256,
        });
      }
    }
    resources[kind] = {
      baseline_active_ids: baselineIds,
      baseline_mutations: baselineMutations,
      checker_owned_active: ownedActive.length,
      current_active_ids: currentIds,
      owned_ids: owned,
      unexpected_active_ids: unexpectedActive,
    };
    final_invariants.push(
      invariant(
        `${kind}.baseline_active_ids_unchanged`,
        baselineIds,
        currentIds.filter((id) => baselineIds.includes(id)),
      ),
      invariant(`${kind}.baseline_records_unmodified`, [], baselineMutations),
      invariant(`${kind}.checker_owned_active`, 0, ownedActive.length),
      invariant(`${kind}.unexpected_active_ids`, [], unexpectedActive),
    );
  }
  return {
    checked_at: new Date().toISOString(),
    final_invariants,
    resources,
  };
}

export async function archiveOwnedProductRecords(
  apiUrl,
  requestPrefix,
  ownedIds,
) {
  const results = [];
  for (const [kind, apiPath] of Object.entries(PRODUCT_ACCEPTANCE_RESOURCES).reverse()) {
    for (const id of [...(ownedIds[kind] ?? [])].reverse()) {
      const response = await fetch(
        new URL(`${apiPath}/${encodeURIComponent(id)}/archive`, apiUrl),
        {
          headers: {
            Accept: "application/json",
            "X-Request-ID": `${requestPrefix}-${kind}-cleanup`,
          },
          method: "POST",
          signal: AbortSignal.timeout(30_000),
        },
      );
      if (![200, 404].includes(response.status)) {
        throw new Error(`Owned ${kind} cleanup failed for ${id}: HTTP ${response.status}.`);
      }
      results.push({ id, kind, status: response.status === 404 ? "NOT_FOUND" : "ARCHIVED" });
    }
  }
  return results;
}

async function fingerprint(apiUrl, kind, apiPath, record, requestPrefix) {
  const audit = await readOne(
    apiUrl,
    `/api/v1/audit?limit=250&object_id=${encodeURIComponent(record.id)}`,
    requestPrefix,
  );
  const messages =
    kind === "ask_cfs"
      ? await readPages(
          apiUrl,
          `${apiPath}/${encodeURIComponent(record.id)}/messages`,
          requestPrefix,
        )
      : null;
  return {
    audit_ids: audit.map((event) => event.id).sort(),
    messages_sha256: messages ? sha256(messages) : null,
    record_sha256: sha256(record),
  };
}

async function readPages(apiUrl, apiPath, requestPrefix) {
  const rows = [];
  for (let page = 1; ; page += 1) {
    const separator = apiPath.includes("?") ? "&" : "?";
    const response = await request(
      apiUrl,
      `${apiPath}${separator}page=${page}&page_size=100`,
      requestPrefix,
    );
    rows.push(...response.data);
    const total = response.pagination?.total ?? rows.length;
    if (!response.data.length || rows.length >= total) return rows;
  }
}

async function readOne(apiUrl, apiPath, requestPrefix) {
  return (await request(apiUrl, apiPath, requestPrefix)).data;
}

async function request(apiUrl, apiPath, requestPrefix) {
  const response = await fetch(new URL(apiPath, apiUrl), {
    headers: { Accept: "application/json", "X-Request-ID": `${requestPrefix}-baseline-read` },
    signal: AbortSignal.timeout(30_000),
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`GET ${apiPath} returned ${response.status}: ${JSON.stringify(payload).slice(0, 300)}`);
  }
  return payload;
}

function invariant(name, expected, actual) {
  return {
    actual,
    expected,
    name,
    passed: JSON.stringify(actual) === JSON.stringify(expected),
  };
}

function sha256(value) {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
