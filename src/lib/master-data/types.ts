export type MasterDataFilterOperator = "contains" | "eq" | "gte" | "lte";
export type MasterDataFieldType = "category" | "date" | "number" | "text";
export type MasterDataValuesMode = "none" | "options" | "search";
export type MasterDataExportFormat = "csv" | "geojson" | "xlsx";
export type MasterDataValue = number | string;

export interface MasterDataGeoJsonGeometry {
  coordinates: unknown;
  type: "LineString" | "MultiLineString" | "MultiPoint" | "MultiPolygon" | "Point" | "Polygon";
}

export interface MasterDataFeatureCollection {
  features: Array<{
    geometry: MasterDataGeoJsonGeometry | null;
    properties: Record<string, unknown>;
    type: "Feature";
  }>;
  type: "FeatureCollection";
}

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
  crs: string | null;
  data_quality: Record<string, unknown> | string;
  default_fields: string[];
  description: string;
  fields: MasterDataFieldDefinition[];
  geometry_type: string | null;
  governance: MasterDataGovernance;
  id: string;
  last_updated: string | null;
  name: string;
  owner: string;
  record_count: number;
  restricted_field_count: number;
  source: string;
  spatial: boolean;
  status: "ready";
  supported_export_formats: MasterDataExportFormat[];
  technical_source: string;
  relationships: MasterDataRelationshipDefinition[];
}

export interface MasterDataGovernance {
  access_mode: "read_only";
  authority_status: "authoritative_candidate" | "authoritative_source" | "curated_authoritative_source" | "current_context_substitute";
  derived_outputs_only: true;
  sensitivity: "public_planner_safe";
}

export interface MasterDataRelationshipDefinition {
  cardinality: string;
  description: string;
  id: string;
  name: string;
  output_fields: MasterDataFieldDefinition[];
  supports_geometry: boolean;
  target_dataset_id: string;
}

export interface MasterDataFilter {
  field: string;
  operator: MasterDataFilterOperator;
  value: string;
}

export interface MasterDataPreviewRequest {
  fields: string[];
  filters: MasterDataFilter[];
  join?: MasterDataJoinRequest | null;
  page: number;
  page_size: number;
  sort_direction: "asc" | "desc";
  sort_field?: string | null;
}

export interface MasterDataJoinRequest {
  attach_geometry: boolean;
  relationship_id: "permits_to_parcels";
}

export interface MasterDataJoinStatistics {
  match_percentage: number;
  matched_records: number;
  output_records: number;
  relationship_id: string;
  source_records: number;
  unmatched_records: number;
}

export interface MasterDataLineage {
  export_format: MasterDataExportFormat | null;
  filters: Array<{ field: string; operator: MasterDataFilterOperator }>;
  geometry_source: string | null;
  input_record_count: number;
  join_relationship: string | null;
  matched_count: number | null;
  output_record_count: number;
  query_timestamp: string;
  selected_fields: string[];
  source_datasets: string[];
  unmatched_count: number | null;
}

export interface MasterDataPreview {
  crs: string | null;
  feature_collection: MasterDataFeatureCollection | null;
  field_ids: string[];
  geometry_type: string | null;
  join_statistics: MasterDataJoinStatistics | null;
  lineage: MasterDataLineage;
  page: number;
  page_size: number;
  rows: Record<string, unknown>[];
  spatial: boolean;
  spatial_preview_limited: boolean;
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
