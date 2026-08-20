import demoSampleParcels from "../../../public/demo-data/sample_parcels.json";
import { apiGet, apiPost, buildApiUrl } from "@/lib/api/client";
import { CFS_RUNTIME_CONFIG, type CfsRuntimeMode } from "@/lib/runtimeConfig";
import type {
  MasterDataDatasetDefinition,
  MasterDataExportRequest,
  MasterDataFieldDefinition,
  MasterDataFilter,
  MasterDataPreview,
  MasterDataPreviewRequest,
  MasterDataRepository,
  MasterDataRequestOptions,
  MasterDataValue,
} from "@/lib/master-data/types";

type DataEnvelope<T> = { data: T };

const parcelFields: MasterDataFieldDefinition[] = [
  field("official_parcel_id", "Parcel ID", "Sanitized CFS parcel identifier.", "text", ["eq", "contains"], "search", true),
  field("pin14", "PIN", "Public parcel identification number.", "text", ["eq", "contains"], "search", true),
  field("subdivision", "Subdivision", "Recorded subdivision name when available.", "category", ["eq", "contains"], "search", true),
  field("neighborhood", "Neighborhood", "Sanitized neighborhood label.", "category", ["eq", "contains"], "search", true),
  field("parcel_size_category", "Parcel size", "Generalized parcel size category.", "category", ["eq"], "options", true),
  field("valuation_band", "Valuation band", "Generalized valuation band; raw values are omitted in Demo.", "category", ["eq"], "options", true),
  field("zoning_code", "Zoning code", "Assigned zoning code when available.", "category", ["eq", "contains"], "options", true),
  field("zoning_category", "Zoning category", "Normalized zoning category.", "category", ["eq"], "options", true),
  field("zoning_jurisdiction", "Zoning jurisdiction", "Jurisdiction responsible for the zoning assignment.", "category", ["eq", "contains"], "options", false),
  field("parcel_quality_status", "Quality status", "Sanitized parcel-quality classification.", "category", ["eq"], "options", false),
  field("development_activity_summary", "Development activity", "Generalized nearby development activity signal.", "category", ["eq"], "options", false),
  field("flood_summary", "Flood summary", "Generalized flood review context.", "text", ["eq", "contains"], "search", false),
];

const permitFields: MasterDataFieldDefinition[] = [
  field("permit_id", "Permit ID", "Sanitized stable permit identifier.", "text", ["eq", "contains"], "search", true),
  field("permit_number", "Permit number", "Sanitized public-facing permit number.", "text", ["eq", "contains"], "search", true),
  field("official_parcel_id", "CFS parcel ID", "Matched sanitized CFS parcel identifier.", "text", ["eq", "contains"], "search", true),
  field("permit_date", "Permit date", "Permit activity date.", "date", ["eq", "gte", "lte"], "none", true),
  field("permit_type", "Permit type", "Normalized permit type.", "category", ["eq"], "options", true),
  field("work_type", "Work type", "Normalized work classification.", "category", ["eq"], "options", true),
  field("permit_status", "Status", "Normalized permit status.", "category", ["eq"], "options", true),
  field("permit_amount", "Permit amount", "Sanitized estimated permit amount.", "number", ["eq", "gte", "lte"], "none", false),
  field("permit_segment", "Permit segment", "Generalized permit segment.", "category", ["eq"], "options", false),
  field("growth_signal", "Growth signal", "Generalized growth signal.", "category", ["eq"], "options", false),
  field("development_domain", "Development domain", "Generalized development domain.", "category", ["eq"], "options", false),
  field("status_stage", "Status stage", "Normalized workflow stage.", "category", ["eq"], "options", false),
];

const demoParcelRows: Record<string, unknown>[] = demoSampleParcels.records.map((record) => ({
  development_activity_summary: record.development_activity_summary,
  flood_summary: record.flood_summary,
  neighborhood: record.neighborhood,
  official_parcel_id: record.official_parcel_id,
  parcel_quality_status: record.parcel_quality_status,
  parcel_size_category: record.parcel_size_category,
  pin14: record.pin14,
  subdivision: record.subdivision,
  valuation_band: record.valuation_band,
  zoning_category: record.zoning_category,
  zoning_code: record.zoning_code,
  zoning_jurisdiction: record.zoning_jurisdiction,
}));

const permitTypes = ["Commercial", "Residential", "Renovation", "Utility"];
const workTypes = ["Addition", "Alteration", "New construction", "Repair"];
const permitStatuses = ["Active", "Complete", "Issued", "Under review"];
const permitSegments = ["Employment", "Housing", "Infrastructure", "Mixed use"];
const demoPermitRows: Record<string, unknown>[] = Array.from({ length: 72 }, (_, index) => {
  const number = index + 1;
  const parcel = demoSampleParcels.records[index % demoSampleParcels.records.length];
  const permitType = permitTypes[index % permitTypes.length];
  const status = permitStatuses[index % permitStatuses.length];
  return {
    official_parcel_id: parcel.official_parcel_id,
    development_domain: permitType === "Residential" ? "Housing" : "Economic development",
    growth_signal: index % 3 === 0 ? "Elevated" : index % 3 === 1 ? "Moderate" : "Baseline",
    permit_amount: 75_000 + index * 12_500,
    permit_date: `202${4 + Math.floor(index / 48)}-${String((index % 12) + 1).padStart(2, "0")}-${String((index % 27) + 1).padStart(2, "0")}`,
    permit_id: `CFS-PERMIT-DEMO-${String(number).padStart(4, "0")}`,
    permit_number: `DEMO-${String(number).padStart(5, "0")}`,
    permit_segment: permitSegments[index % permitSegments.length],
    permit_status: status,
    permit_type: permitType,
    status_stage: status === "Complete" ? "Closed" : "Open",
    work_type: workTypes[index % workTypes.length],
  };
});

const demoDatasets: MasterDataDatasetDefinition[] = [
  {
    data_quality: "Sanitized sample records for product demonstration; not an authoritative extract.",
    default_fields: parcelFields.filter((item) => item.default).map((item) => item.id),
    description: "Explore a bounded, sanitized sample of parcel and zoning attributes.",
    fields: parcelFields,
    geometry_type: "Polygon",
    id: "parcels",
    last_updated: demoSampleParcels.generated_at,
    name: "Parcels",
    owner: "Cabarrus FutureScape Demo",
    record_count: demoParcelRows.length,
    restricted_field_count: 12,
    source: "Sanitized Cabarrus County parcel sample",
    spatial: true,
    supported_export_formats: ["csv"],
    technical_source: "Bundled sanitized demo extract",
  },
  {
    data_quality: "Deterministic sanitized sample records for product demonstration; not authoritative permit data.",
    default_fields: permitFields.filter((item) => item.default).map((item) => item.id),
    description: "Explore sanitized permit records and normalized development classifications.",
    fields: permitFields,
    geometry_type: null,
    id: "permits",
    last_updated: demoSampleParcels.generated_at,
    name: "Permits",
    owner: "Cabarrus FutureScape Demo",
    record_count: demoPermitRows.length,
    restricted_field_count: 15,
    source: "Sanitized Cabarrus County permit sample",
    spatial: false,
    supported_export_formats: ["csv"],
    technical_source: "Bundled sanitized demo extract",
  },
];

const demoRows: Record<string, Record<string, unknown>[]> = {
  parcels: demoParcelRows,
  permits: demoPermitRows,
};

class DemoMasterDataRepository implements MasterDataRepository {
  readonly provider = "demo" as const;

  async listDatasets(options: MasterDataRequestOptions = {}) {
    throwIfAborted(options.signal);
    return demoDatasets;
  }

  async getDataset(datasetId: string, options: MasterDataRequestOptions = {}) {
    throwIfAborted(options.signal);
    return findDemoDataset(datasetId);
  }

  async listValues(
    datasetId: string,
    fieldId: string,
    query = "",
    options: MasterDataRequestOptions = {},
  ) {
    throwIfAborted(options.signal);
    const dataset = findDemoDataset(datasetId);
    const definition = findField(dataset, fieldId);
    if (definition.values_mode === "none") return [];
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return Array.from(
      new Set(
        demoRows[datasetId]
          .map((row) => row[fieldId])
          .filter((value): value is MasterDataValue =>
            typeof value === "string" || typeof value === "number",
          ),
      ),
    )
      .filter((value) =>
        normalizedQuery
          ? String(value).toLocaleLowerCase().includes(normalizedQuery)
          : true,
      )
      .sort(compareValues)
      .slice(0, 25);
  }

  async preview(
    datasetId: string,
    request: MasterDataPreviewRequest,
    options: MasterDataRequestOptions = {},
  ) {
    throwIfAborted(options.signal);
    const dataset = findDemoDataset(datasetId);
    return previewDemoRows(dataset, request);
  }

  async exportDataset(
    datasetId: string,
    request: MasterDataExportRequest,
    options: MasterDataRequestOptions = {},
  ) {
    throwIfAborted(options.signal);
    if (request.format !== "csv") {
      throw new Error("Demo exports CSV only. Governed XLSX exports require the Local or Enterprise backend.");
    }
    const dataset = findDemoDataset(datasetId);
    const result = previewDemoRows(dataset, {
      ...request,
      page: 1,
      page_size: Number.MAX_SAFE_INTEGER,
    });
    return new Blob([`\ufeff${toCsv(dataset, request.fields, result.rows)}`], {
      type: "text/csv;charset=utf-8",
    });
  }
}

class ApiMasterDataRepository implements MasterDataRepository {
  readonly provider = "api" as const;

  async listDatasets(options: MasterDataRequestOptions = {}) {
    const response = await apiGet<DataEnvelope<MasterDataDatasetDefinition[]>>(
      "/api/v1/master-data/datasets",
      undefined,
      options,
    );
    return response.data;
  }

  async getDataset(datasetId: string, options: MasterDataRequestOptions = {}) {
    const response = await apiGet<DataEnvelope<MasterDataDatasetDefinition>>(
      datasetPath(datasetId),
      undefined,
      options,
    );
    return response.data;
  }

  async listValues(
    datasetId: string,
    fieldId: string,
    query = "",
    options: MasterDataRequestOptions = {},
  ) {
    const response = await apiGet<DataEnvelope<{ values: MasterDataValue[] }>>(
      `${datasetPath(datasetId)}/values/${encodeURIComponent(fieldId)}`,
      { limit: 25, q: query },
      options,
    );
    return response.data.values;
  }

  async preview(
    datasetId: string,
    request: MasterDataPreviewRequest,
    options: MasterDataRequestOptions = {},
  ) {
    const response = await apiPost<DataEnvelope<MasterDataPreview>>(
      `${datasetPath(datasetId)}/preview`,
      request,
      options,
    );
    return response.data;
  }

  async exportDataset(
    datasetId: string,
    request: MasterDataExportRequest,
    options: MasterDataRequestOptions = {},
  ) {
    const controller = new AbortController();
    const abortFromParent = () => controller.abort();
    let timedOut = false;
    if (options.signal?.aborted) controller.abort();
    else options.signal?.addEventListener("abort", abortFromParent, { once: true });
    const timeoutId = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 60_000);
    try {
      const response = await window.fetch(`${buildApiUrl(datasetPath(datasetId))}/export`, {
        body: JSON.stringify(request),
        cache: "no-store",
        headers: {
          Accept: "application/octet-stream",
          "Content-Type": "application/json",
          "X-Request-ID": requestId(),
        },
        method: "POST",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(await responseError(response));
      return response.blob();
    } catch (error) {
      if (timedOut) throw new Error("Master Data export timed out after 60 seconds.");
      throw error;
    } finally {
      window.clearTimeout(timeoutId);
      options.signal?.removeEventListener("abort", abortFromParent);
    }
  }
}

const demoRepository = new DemoMasterDataRepository();
const apiRepository = new ApiMasterDataRepository();

export function getMasterDataRepository(
  runtimeMode: CfsRuntimeMode = CFS_RUNTIME_CONFIG.runtimeMode,
) {
  return runtimeMode === "demo" ? demoRepository : apiRepository;
}

function field(
  id: string,
  label: string,
  description: string,
  data_type: MasterDataFieldDefinition["data_type"],
  filter_operators: MasterDataFieldDefinition["filter_operators"],
  values_mode: MasterDataFieldDefinition["values_mode"],
  defaultField: boolean,
): MasterDataFieldDefinition {
  return {
    data_type,
    default: defaultField,
    description,
    filter_operators,
    id,
    label,
    selectable: true,
    values_mode,
  };
}

function datasetPath(datasetId: string) {
  return `/api/v1/master-data/datasets/${encodeURIComponent(datasetId)}`;
}

function findDemoDataset(datasetId: string) {
  const dataset = demoDatasets.find((item) => item.id === datasetId);
  if (!dataset) throw new Error(`Unknown Master Data dataset: ${datasetId}`);
  return dataset;
}

function findField(dataset: MasterDataDatasetDefinition, fieldId: string) {
  const definition = dataset.fields.find((item) => item.id === fieldId && item.selectable);
  if (!definition) throw new Error(`Field ${fieldId} is not available for ${dataset.name}.`);
  return definition;
}

function previewDemoRows(
  dataset: MasterDataDatasetDefinition,
  request: MasterDataPreviewRequest,
): MasterDataPreview {
  if (!request.fields.length) throw new Error("Select at least one field.");
  request.fields.forEach((fieldId) => findField(dataset, fieldId));
  request.filters.forEach((filter) => {
    const definition = findField(dataset, filter.field);
    if (!definition.filter_operators.includes(filter.operator)) {
      throw new Error(`${filter.operator} is not allowed for ${definition.label}.`);
    }
  });
  if (request.sort_field) findField(dataset, request.sort_field);

  const filtered = demoRows[dataset.id]
    .filter((row) => request.filters.every((filter) => matchesFilter(dataset, row, filter)))
    .sort((left, right) => {
      if (!request.sort_field) return 0;
      const direction = request.sort_direction === "desc" ? -1 : 1;
      return compareValues(left[request.sort_field], right[request.sort_field]) * direction;
    });
  const page = Math.max(1, Math.trunc(request.page));
  const pageSize = Math.max(1, Math.trunc(request.page_size));
  const start = (page - 1) * pageSize;
  return {
    page,
    page_size: pageSize,
    rows: filtered.slice(start, start + pageSize).map((row) =>
      Object.fromEntries(request.fields.map((fieldId) => [fieldId, row[fieldId] ?? null])),
    ),
    total: filtered.length,
  };
}

function matchesFilter(
  dataset: MasterDataDatasetDefinition,
  row: Record<string, unknown>,
  filter: MasterDataFilter,
) {
  const definition = findField(dataset, filter.field);
  const actual = row[filter.field];
  if (actual === null || actual === undefined) return false;
  const expected = filter.value.trim();
  if (filter.operator === "contains") {
    return String(actual).toLocaleLowerCase().includes(expected.toLocaleLowerCase());
  }
  const [left, right] = definition.data_type === "number"
    ? [Number(actual), Number(expected)]
    : definition.data_type === "date"
      ? [Date.parse(String(actual)), Date.parse(expected)]
      : [String(actual).toLocaleLowerCase(), expected.toLocaleLowerCase()];
  if (filter.operator === "eq") return left === right;
  if (typeof left !== "number" || typeof right !== "number" || Number.isNaN(left) || Number.isNaN(right)) {
    return false;
  }
  return filter.operator === "gte" ? left >= right : left <= right;
}

function compareValues(left: unknown, right: unknown) {
  if (left === right) return 0;
  if (left === null || left === undefined) return 1;
  if (right === null || right === undefined) return -1;
  if (typeof left === "number" && typeof right === "number") return left - right;
  return String(left).localeCompare(String(right), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function toCsv(
  dataset: MasterDataDatasetDefinition,
  fields: string[],
  rows: Record<string, unknown>[],
) {
  const headers = fields.map((fieldId) => findField(dataset, fieldId).label);
  return [headers, ...rows.map((row) => fields.map((fieldId) => row[fieldId]))]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n");
}

function csvCell(value: unknown) {
  const text = value === null || value === undefined
    ? ""
    : typeof value === "object"
      ? JSON.stringify(value)
      : String(value);
  const safeText = typeof value === "string" && /^[ \t\r\n]*[=+\-@\t\r]/.test(text)
    ? `'${text}`
    : text;
  return `"${safeText.replaceAll('"', '""')}"`;
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Request cancelled", "AbortError");
}

async function responseError(response: Response) {
  try {
    const payload: unknown = await response.json();
    if (payload && typeof payload === "object") {
      const record = payload as Record<string, unknown>;
      if (record.error && typeof record.error === "object") {
        const message = (record.error as Record<string, unknown>).message;
        if (typeof message === "string") return message;
      }
      for (const key of ["message", "detail"]) {
        if (typeof record[key] === "string") return record[key] as string;
      }
    }
  } catch {
    // The status still provides a safe fallback for non-JSON failures.
  }
  return `Master Data export failed with HTTP ${response.status}.`;
}

function requestId() {
  return typeof globalThis.crypto?.randomUUID === "function"
    ? globalThis.crypto.randomUUID()
    : `cfs-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
