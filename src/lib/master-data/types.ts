export type MasterDataFilterOperator = "contains" | "eq" | "gte" | "lte";
export type MasterDataFieldType = "category" | "date" | "number" | "text";
export type MasterDataValuesMode = "none" | "options" | "search";
export type MasterDataExportFormat = "csv" | "xlsx";
export type MasterDataValue = number | string;

export interface MasterDataFieldDefinition {
  data_type: MasterDataFieldType;
  default: boolean;
  description: string;
  filter_operators: MasterDataFilterOperator[];
  id: string;
  label: string;
  selectable: boolean;
  values_mode: MasterDataValuesMode;
}

export interface MasterDataDatasetDefinition {
  data_quality: Record<string, unknown> | string;
  default_fields: string[];
  description: string;
  fields: MasterDataFieldDefinition[];
  geometry_type: string | null;
  id: string;
  last_updated: string | null;
  name: string;
  owner: string;
  record_count: number;
  restricted_field_count: number;
  source: string;
  spatial: boolean;
  supported_export_formats: MasterDataExportFormat[];
  technical_source: string;
}

export interface MasterDataFilter {
  field: string;
  operator: MasterDataFilterOperator;
  value: string;
}

export interface MasterDataPreviewRequest {
  fields: string[];
  filters: MasterDataFilter[];
  page: number;
  page_size: number;
  sort_direction: "asc" | "desc";
  sort_field?: string | null;
}

export interface MasterDataPreview {
  page: number;
  page_size: number;
  rows: Record<string, unknown>[];
  total: number;
}

export type MasterDataExportRequest = Omit<
  MasterDataPreviewRequest,
  "page" | "page_size"
> & { format: MasterDataExportFormat };

export interface MasterDataRequestOptions {
  signal?: AbortSignal;
}

export interface MasterDataRepository {
  readonly provider: "api" | "demo";
  exportDataset(
    datasetId: string,
    request: MasterDataExportRequest,
    options?: MasterDataRequestOptions,
  ): Promise<Blob>;
  getDataset(
    datasetId: string,
    options?: MasterDataRequestOptions,
  ): Promise<MasterDataDatasetDefinition>;
  listDatasets(
    options?: MasterDataRequestOptions,
  ): Promise<MasterDataDatasetDefinition[]>;
  listValues(
    datasetId: string,
    fieldId: string,
    query?: string,
    options?: MasterDataRequestOptions,
  ): Promise<MasterDataValue[]>;
  preview(
    datasetId: string,
    request: MasterDataPreviewRequest,
    options?: MasterDataRequestOptions,
  ): Promise<MasterDataPreview>;
}
