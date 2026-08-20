import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { BlobReader, TextWriter, ZipReader } from "@zip.js/zip.js";

const ROOT = process.cwd();
const DATASET_IDS = ["parcels", "permits", "addresses", "zoning", "flood", "schools"];
const SPATIAL = {
  addresses: "Point",
  flood: "MultiPolygon",
  parcels: "MultiPolygon",
  schools: "MultiPolygon",
  zoning: "MultiPolygon",
};
const FIELD_TYPES = {
  parcels: {
    official_parcel_id: "text", pin14: "text", subdivision: "text", neighborhood: "text",
    acreage: "number", market_value: "number", assessed_value: "number", land_value: "number",
    building_value: "number", value_per_acre: "number", zoning_jurisdiction: "category",
    zoning_code: "category", zoning_category: "category", last_updated: "date",
  },
  permits: {
    permit_id: "text", permit_number: "text", official_parcel_id: "text",
    parcel_number: "text", permit_date: "date", permit_type: "category", work_type: "category",
    permit_status: "category", permit_amount: "number", permit_segment: "category",
    growth_signal: "category", development_domain: "category", value_class: "category",
    status_stage: "category", last_updated: "date",
  },
  addresses: {
    address_id: "number", official_parcel_id: "text", pin14: "text", site_address: "text",
    review_type: "category", review_status: "category", file_date: "date", last_updated: "date",
  },
  zoning: {
    zoning_id: "text", jurisdiction: "category", zoning_code: "category", zoning_category: "category",
    zoning_type: "category", base_district: "category", conditional: "category", last_updated: "date",
  },
  flood: {
    flood_zone_id: "number", flood_area_id: "text", flood_zone_code: "category",
    flood_constraint_type: "category", flood_severity: "category", source_layer: "category",
    last_updated: "date",
  },
  schools: {
    zone_id: "text", school_name: "text", school_level: "category", school_type: "category",
    school_system: "category", school_address: "text", match_confidence: "category",
    source_layer: "category", last_updated: "date",
  },
};
const EXPECTED_COUNTS = { parcels: 6, permits: 30, addresses: 6, zoning: 6, flood: 6, schools: 6 };
const NULLABLE_FIELDS = new Set(["permits.official_parcel_id"]);
const RESTRICTED_KEY = /^(?:owner|owner_name|mailing_address|applicant|contractor|notes|appraiser|source_url|source_etag|raw_attributes|shape_area|shape_length)$/i;

export async function validateXlsxBytes(bytes, { expectedText, formulaLikeValue } = {}) {
  const zip = new ZipReader(new BlobReader(new Blob([bytes])));
  try {
    const entries = await zip.getEntries();
    const byName = new Map(entries.map((entry) => [entry.filename, entry]));
    for (const name of [
      "[Content_Types].xml",
      "_rels/.rels",
      "xl/workbook.xml",
      "xl/_rels/workbook.xml.rels",
      "xl/worksheets/sheet1.xml",
    ]) {
      assert(byName.has(name), `XLSX is missing ${name}`);
    }
    const workbook = await byName.get("xl/workbook.xml").getData(new TextWriter());
    const sheet = await byName.get("xl/worksheets/sheet1.xml").getData(new TextWriter());
    assert.match(workbook, /<workbook\b/);
    assert.match(sheet, /<worksheet\b/);
    assert(!/<f(?:\s|>)/i.test(sheet), "XLSX contains an executable formula cell");
    if (expectedText) assert(sheet.includes(expectedText), `XLSX is missing ${expectedText}`);
    if (formulaLikeValue) {
      assert(sheet.includes(formulaLikeValue), "XLSX omitted the formula-hardening fixture value");
      assert(sheet.includes('t="inlineStr"'), "Formula-like XLSX value is not an inline string");
    }
    return { entryCount: entries.length, sheet };
  } finally {
    await zip.close();
  }
}

export function validateGeoJson(collection, { allowNullGeometry = false, expectedFeatures } = {}) {
  assert.equal(collection?.type, "FeatureCollection", "GeoJSON is not a FeatureCollection");
  assert(Array.isArray(collection.features), "GeoJSON features are missing");
  if (expectedFeatures !== undefined) assert.equal(collection.features.length, expectedFeatures);
  for (const [index, feature] of collection.features.entries()) {
    assert.equal(feature?.type, "Feature", `GeoJSON feature ${index} is invalid`);
    if (feature.geometry === null) {
      assert(allowNullGeometry, `GeoJSON feature ${index} unexpectedly has null geometry`);
      continue;
    }
    assert(feature.geometry?.type, `GeoJSON feature ${index} has no geometry type`);
    const coordinates = collectCoordinates(feature.geometry.coordinates);
    assert(coordinates.length > 0, `GeoJSON feature ${index} has no coordinates`);
    for (const [longitude, latitude] of coordinates) {
      assert(longitude >= -80.82 && longitude <= -80.26, `Feature ${index} leaves Cabarrus longitude bounds`);
      assert(latitude >= 35.15 && latitude <= 35.54, `Feature ${index} leaves Cabarrus latitude bounds`);
    }
  }
}

function collectCoordinates(value, output = []) {
  if (Array.isArray(value) && value.length >= 2 && Number.isFinite(value[0]) && Number.isFinite(value[1])) {
    output.push([value[0], value[1]]);
  } else if (Array.isArray(value)) {
    value.forEach((item) => collectCoordinates(item, output));
  }
  return output;
}

function validateValue(value, expectedType, label) {
  if (value === null && NULLABLE_FIELDS.has(label)) return;
  if (expectedType === "date") {
    assert.equal(typeof value, "string", `${label} must be an ISO date string`);
    assert(/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value) && !Number.isNaN(Date.parse(value)), `${label} is not an ISO date`);
    return;
  }
  assert.equal(typeof value, expectedType === "number" ? "number" : "string", `${label} type drifted`);
}

export async function validateStaticContract() {
  const fixture = JSON.parse(await readFile(path.join(ROOT, "public/demo-data/master_data_v1b.json"), "utf8"));
  assert(!Number.isNaN(Date.parse(fixture.generated_at)), "Master Data fixture generated_at is invalid");
  assert.deepEqual(Object.keys(fixture.rows), DATASET_IDS, "Master Data fixture catalog order/IDs drifted");
  for (const datasetId of DATASET_IDS) {
    const rows = fixture.rows[datasetId];
    assert.equal(rows.length, EXPECTED_COUNTS[datasetId], `${datasetId} fixture count drifted`);
    for (const [rowIndex, row] of rows.entries()) {
      const expectedFields = FIELD_TYPES[datasetId];
      assert.deepEqual(Object.keys(row), [...Object.keys(expectedFields), "geometry"], `${datasetId} row ${rowIndex} fields drifted`);
      for (const [fieldId, expectedType] of Object.entries(expectedFields)) {
        validateValue(row[fieldId], expectedType, `${datasetId}.${fieldId}`);
      }
      assert.equal(Object.keys(row).some((key) => RESTRICTED_KEY.test(key)), false, `${datasetId} exposes a restricted key`);
      if (datasetId === "permits") {
        assert.equal(row.geometry, null, "Base permit fixtures must be nonspatial");
      } else {
        assert.equal(row.geometry?.type, SPATIAL[datasetId], `${datasetId} geometry type drifted`);
        validateGeoJson({ type: "FeatureCollection", features: [{ type: "Feature", geometry: row.geometry, properties: {} }] });
      }
    }
  }

  const parcels = new Map(fixture.rows.parcels.map((row) => [row.official_parcel_id, row]));
  const permits = new Map(fixture.rows.permits.map((row) => [row.permit_id, row]));
  const relationships = fixture.relationships?.permits_to_parcels;
  assert.equal(relationships?.length, 25, "Demo must contain 25 explicit permit-to-parcel relationships");
  const relationshipsByPermit = new Map();
  for (const relationship of relationships) {
    assert.deepEqual(Object.keys(relationship), ["permit_id", "official_parcel_id"]);
    assert(permits.has(relationship.permit_id), `Relationship references unknown permit ${relationship.permit_id}`);
    assert(parcels.has(relationship.official_parcel_id), `Relationship references unknown parcel ${relationship.official_parcel_id}`);
    const matches = relationshipsByPermit.get(relationship.permit_id) ?? [];
    matches.push(relationship);
    relationshipsByPermit.set(relationship.permit_id, matches);
  }
  assert(
    [...relationshipsByPermit.values()].some((matches) => matches.length > 1),
    "Demo relationship fixture does not exercise many-to-many expansion",
  );
  const joined = fixture.rows.permits.flatMap((permit) => {
    const matches = relationshipsByPermit.get(permit.permit_id) ?? [];
    return matches.length
      ? matches.map((relationship) => ({ permit, parcel: parcels.get(relationship.official_parcel_id) }))
      : [{ permit, parcel: null }];
  });
  const matched = new Set(joined.filter(({ parcel }) => parcel).map(({ permit }) => permit.permit_id)).size;
  const sourceRecords = fixture.rows.permits.length;
  assert.deepEqual(
    { source_records: sourceRecords, matched_records: matched, unmatched_records: sourceRecords - matched, match_percentage: matched * 100 / sourceRecords, output_records: joined.length },
    { source_records: 30, matched_records: 24, unmatched_records: 6, match_percentage: 80, output_records: 31 },
  );
  assert.equal(joined.slice(0, 25).length, 25, "Permit preview page 1 drifted");
  assert.equal(joined.slice(25, 50).length, 6, "Permit preview page 2 drifted");
  assert(fixture.rows.permits.some((row) => row.permit_number.startsWith("=")), "Formula-hardening fixture is missing");

  const manifest = JSON.parse(await readFile(path.join(ROOT, "public/demo-data/demo_manifest.json"), "utf8"));
  const asset = manifest.required_assets.find((item) => item.path === "public/demo-data/master_data_v1b.json");
  assert(asset?.required && asset?.sanitized && asset.record_count === 60, "Demo manifest is missing the required Master Data V1B asset");
  const runtime = await readFile(path.join(ROOT, "src/lib/master-data/runtimeRepository.ts"), "utf8");
  for (const token of ["master_data_v1b.json", "permits_to_parcels", "@zip.js/zip.js", 'format === "xlsx"', 'format === "csv"', "application/geo+json", "useWebWorkers: false"]) {
    assert(runtime.includes(token), `Demo runtime is missing ${token}`);
  }
  const runtimeFieldBlocks = {
    addresses: runtime.slice(runtime.indexOf("const addressFields"), runtime.indexOf("const zoningFields")),
    flood: runtime.slice(runtime.indexOf("const floodFields"), runtime.indexOf("const schoolFields")),
    parcels: runtime.slice(runtime.indexOf("const parcelFields"), runtime.indexOf("const permitFields")),
    permits: runtime.slice(runtime.indexOf("const permitFields"), runtime.indexOf("const addressFields")),
    schools: runtime.slice(runtime.indexOf("const schoolFields"), runtime.indexOf("const permitParcelOutputFields")),
    zoning: runtime.slice(runtime.indexOf("const zoningFields"), runtime.indexOf("const floodFields")),
  };
  for (const [datasetId, fields] of Object.entries(FIELD_TYPES)) {
    for (const [fieldId, dataType] of Object.entries(fields)) {
      const expectedOperators = fieldId === "last_updated"
        ? []
        : dataType === "text"
          ? ["eq", "contains"]
          : dataType === "category"
            ? ["eq"]
            : ["eq", "gte", "lte"];
      const fieldLine = runtimeFieldBlocks[datasetId].split(/\r?\n/).find((line) => line.includes(`field("${fieldId}"`));
      assert(fieldLine, `Demo runtime is missing ${datasetId}.${fieldId}`);
      const operatorText = fieldLine.match(/, \[([^\]]*)\],/)?.[1] ?? "";
      const actualOperators = [...operatorText.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
      assert.deepEqual(actualOperators, expectedOperators, `${datasetId}.${fieldId} operators drifted from backend`);
    }
  }
  const workspace = `${await readFile(path.join(ROOT, "src/components/master-data/MasterDataWorkspace.tsx"), "utf8")}\n${await readFile(path.join(ROOT, "src/components/master-data/MasterDataMapPreview.tsx"), "utf8")}`;
  for (const testId of ["master-data-catalog", "master-data-join-stats", "master-data-map-preview", "master-data-lineage", "master-data-export-${format}"]) {
    assert(workspace.includes(testId), `Master Data workspace is missing ${testId}`);
  }
}

async function fetchChecked(url, init) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(60_000) });
  assert(response.ok, `${init?.method ?? "GET"} ${new URL(url).pathname} returned HTTP ${response.status}`);
  return response;
}

async function validateLocalContract(baseUrl) {
  const base = new URL(baseUrl);
  assert(["127.0.0.1", "localhost"].includes(base.hostname), "Local Master Data check only permits loopback");
  const api = (pathname) => new URL(pathname, base);
  const catalog = (await (await fetchChecked(api("/api/v1/master-data/datasets"))).json()).data;
  assert.deepEqual(catalog.map((item) => item.id), DATASET_IDS, "Local catalog IDs/order drifted");
  for (const dataset of catalog) {
    assert.equal(dataset.status, "ready");
    assert.equal(dataset.governance?.access_mode, "read_only");
    assert.equal(dataset.crs, SPATIAL[dataset.id] ? "EPSG:4326" : null);
    assert.deepEqual(Object.fromEntries(dataset.fields.map((field) => [field.id, field.data_type])), FIELD_TYPES[dataset.id]);
    const fields = dataset.default_fields.slice(0, 2);
    const preview = (await (await fetchChecked(api(`/api/v1/master-data/datasets/${dataset.id}/preview`), {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ fields, filters: [], page: 1, page_size: 2, sort_direction: "asc" }),
    })).json()).data;
    assert.deepEqual(preview.field_ids, fields);
    assert(preview.rows.length <= 2 && preview.total >= preview.rows.length);
    assert.equal(preview.spatial, Boolean(SPATIAL[dataset.id]));
  }

  const joinPayload = {
    fields: ["permit_id", "permit_number", "official_parcel_id", "parcel_pin14"], filters: [],
    join: { relationship_id: "permits_to_parcels", attach_geometry: true },
    page: 1, page_size: 25, sort_direction: "asc",
  };
  const joined = (await (await fetchChecked(api("/api/v1/master-data/datasets/permits/preview"), {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(joinPayload),
  })).json()).data;
  const stats = joined.join_statistics;
  assert.equal(stats.source_records, stats.matched_records + stats.unmatched_records);
  assert(stats.output_records >= stats.source_records);
  assert.equal(joined.spatial, true);
  validateGeoJson(joined.feature_collection, { allowNullGeometry: true, expectedFeatures: joined.rows.length });

  const exportRequest = async (datasetId, payload) => fetchChecked(api(`/api/v1/master-data/datasets/${datasetId}/export`), {
    method: "POST", headers: { "content-type": "application/json", "x-request-id": `master-data-v1b-${payload.format}` },
    body: JSON.stringify(payload),
  });
  const representativePermitId = joined.rows[0]?.permit_id;
  assert.equal(typeof representativePermitId, "string", "Local join preview did not return a representative permit");
  const narrowFilters = [{ field: "permit_id", operator: "eq", value: representativePermitId }];
  const baseExport = { fields: ["permit_id", "permit_number"], filters: narrowFilters, sort_direction: "asc" };
  const csv = await exportRequest("permits", { ...baseExport, format: "csv" });
  assert.match(csv.headers.get("content-disposition") ?? "", /cfs_permits_\d{4}-\d{2}-\d{2}\.csv/);
  assert((await csv.text()).includes("Permit ID"));
  const xlsx = await exportRequest("permits", { ...baseExport, format: "xlsx" });
  assert.match(xlsx.headers.get("content-disposition") ?? "", /cfs_permits_\d{4}-\d{2}-\d{2}\.xlsx/);
  await validateXlsxBytes(new Uint8Array(await xlsx.arrayBuffer()), { expectedText: "Permit ID" });
  const geojson = await exportRequest("permits", {
    fields: joinPayload.fields,
    filters: narrowFilters,
    format: "geojson",
    join: joinPayload.join,
    sort_direction: joinPayload.sort_direction,
  });
  assert.match(geojson.headers.get("content-disposition") ?? "", /cfs_permits_\d{4}-\d{2}-\d{2}\.geojson/);
  validateGeoJson(await geojson.json(), { allowNullGeometry: true });
}

async function main() {
  await validateStaticContract();
  if (process.argv.includes("--local")) {
    await validateLocalContract(process.env.CFS_API_BASE_URL ?? "http://127.0.0.1:8000");
  }
  console.log(`PASS Master Data V1B ${process.argv.includes("--local") ? "Demo + Local" : "Demo static"} contracts`);
}

if (pathToFileURL(process.argv[1]).href === import.meta.url) await main();
