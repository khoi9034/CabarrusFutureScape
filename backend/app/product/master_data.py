from __future__ import annotations

import csv
import io
from dataclasses import dataclass
from datetime import UTC, date, datetime
from decimal import Decimal, InvalidOperation
from typing import Any, Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StrictFloat,
    StrictInt,
    StrictStr,
    field_validator,
)
from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session

from app.models import (
    ParcelEnriched,
    ParcelZoningOverlayV2,
    PermitIntelligenceSegment,
    RealPropertyPermitClean,
    RealPropertyPermitParcelRelationship,
)
from app.product.service import ProductNotFound, ProductValidationError

DatasetId = Literal["parcels", "permits"]
FilterOperator = Literal["eq", "contains", "gte", "lte"]
SortDirection = Literal["asc", "desc"]
ExportFormat = Literal["csv", "xlsx"]
FilterValue = StrictStr | StrictInt | StrictFloat

EXPORT_ROW_CAP = 150_000
MAX_FILTERS = 20
MAX_SELECTED_FIELDS = 15


class _StrictRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, str_strip_whitespace=True)


class MasterDataFilter(_StrictRequest):
    field: str = Field(pattern=r"^[a-z][a-z0-9_]{0,63}$")
    operator: FilterOperator
    value: FilterValue


class MasterDataQueryRequest(_StrictRequest):
    fields: list[str] = Field(default_factory=list, max_length=MAX_SELECTED_FIELDS)
    filters: list[MasterDataFilter] = Field(default_factory=list, max_length=MAX_FILTERS)
    sort_field: str | None = Field(
        default=None,
        pattern=r"^[a-z][a-z0-9_]{0,63}$",
    )
    sort_direction: SortDirection = "asc"

    @field_validator("fields")
    @classmethod
    def reject_duplicate_fields(cls, values: list[str]) -> list[str]:
        if len(values) != len(set(values)):
            raise ValueError("fields must not contain duplicates")
        return values


class MasterDataPreviewRequest(MasterDataQueryRequest):
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=50, ge=1, le=100)


class MasterDataExportRequest(MasterDataQueryRequest):
    format: ExportFormat


class MasterDataNotFoundError(ProductNotFound):
    pass


class MasterDataValidationError(ProductValidationError):
    pass


@dataclass(frozen=True)
class MasterDataFieldSpec:
    id: str
    label: str
    description: str
    data_type: Literal["text", "category", "number", "date"]
    expression: Any
    filter_operators: tuple[FilterOperator, ...]
    default: bool = False
    values_mode: Literal["none", "options", "search"] = "none"

    def contract(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "label": self.label,
            "description": self.description,
            "data_type": self.data_type,
            "filter_operators": list(self.filter_operators),
            "selectable": True,
            "default": self.default,
            "values_mode": self.values_mode,
        }


@dataclass(frozen=True)
class MasterDataDatasetSpec:
    id: DatasetId
    name: str
    description: str
    source: str
    technical_source: str
    owner: str
    spatial: bool
    geometry_type: str | None
    from_clause: Any
    count_from: Any
    stable_id: str
    last_updated_expression: Any
    fields: tuple[MasterDataFieldSpec, ...]
    restricted_field_count: int
    data_quality: dict[str, Any]
    base_predicates: tuple[Any, ...] = ()

    @property
    def field_map(self) -> dict[str, MasterDataFieldSpec]:
        return {field.id: field for field in self.fields}

    @property
    def default_fields(self) -> list[str]:
        return [field.id for field in self.fields if field.default]


@dataclass(frozen=True)
class MasterDataPage:
    dataset_id: DatasetId
    field_ids: list[str]
    rows: list[dict[str, Any]]
    page: int
    page_size: int
    total: int


@dataclass(frozen=True)
class MasterDataExportResult:
    dataset_id: DatasetId
    field_ids: list[str]
    filter_summary: list[dict[str, str]]
    format: ExportFormat
    filename: str
    content_type: str
    content: bytes
    record_count: int


def _field(
    field_id: str,
    label: str,
    description: str,
    data_type: Literal["text", "category", "number", "date"],
    expression: Any,
    *,
    default: bool = False,
    filter_operators: tuple[FilterOperator, ...] | None = None,
    values_mode: Literal["none", "options", "search"] = "none",
) -> MasterDataFieldSpec:
    if data_type == "text":
        operators: tuple[FilterOperator, ...] = ("eq", "contains")
    elif data_type == "category":
        operators = ("eq",)
    else:
        operators = ("eq", "gte", "lte")
    return MasterDataFieldSpec(
        id=field_id,
        label=label,
        description=description,
        data_type=data_type,
        expression=expression,
        filter_operators=operators if filter_operators is None else filter_operators,
        default=default,
        values_mode=values_mode,
    )


_PARCEL_FROM = ParcelEnriched.__table__.outerjoin(
    ParcelZoningOverlayV2.__table__,
    ParcelZoningOverlayV2.official_parcel_id == ParcelEnriched.official_parcel_id,
)

_PERMIT_PARCEL = (
    select(
        RealPropertyPermitParcelRelationship.permit_id.label("permit_id"),
        func.min(RealPropertyPermitParcelRelationship.official_parcel_id).label(
            "official_parcel_id",
        ),
    )
    .where(RealPropertyPermitParcelRelationship.official_parcel_id.is_not(None))
    .group_by(RealPropertyPermitParcelRelationship.permit_id)
    .subquery("master_data_permit_parcel")
)
_PERMIT_FROM = (
    RealPropertyPermitClean.__table__
    .outerjoin(
        PermitIntelligenceSegment.__table__,
        PermitIntelligenceSegment.permit_id == RealPropertyPermitClean.permit_id,
    )
    .outerjoin(
        _PERMIT_PARCEL,
        _PERMIT_PARCEL.c.permit_id == RealPropertyPermitClean.permit_id,
    )
)
_PERMIT_LAST_UPDATED = func.coalesce(
    RealPropertyPermitClean.source_last_modified_at,
    RealPropertyPermitClean.transformed_at,
)


DATASET_REGISTRY: dict[DatasetId, MasterDataDatasetSpec] = {
    "parcels": MasterDataDatasetSpec(
        id="parcels",
        name="Parcels",
        description="Curated county parcel records with selected valuation and zoning context.",
        source="Cabarrus County Tax Parcels",
        technical_source="public.parcels_enriched",
        owner="Cabarrus County",
        spatial=True,
        geometry_type="MultiPolygon",
        from_clause=_PARCEL_FROM,
        count_from=ParcelEnriched.__table__,
        stable_id="official_parcel_id",
        last_updated_expression=ParcelEnriched.enriched_at,
        restricted_field_count=45,
        data_quality={
            "status": "review",
            "summary": "Curated parcel records retain non-unique business PINs and source quality caveats.",
            "known_issues": [
                "PIN14 can be missing or shared by multiple parcel records.",
                "Owner, mailing, geometry, raw source, and internal QA fields are restricted.",
            ],
        },
        fields=(
            _field("official_parcel_id", "CFS Parcel ID", "Stable CFS parcel identifier.", "text", ParcelEnriched.official_parcel_id, default=True, values_mode="search"),
            _field("pin14", "PIN14", "County parcel business identifier; not guaranteed unique.", "text", ParcelEnriched.pin14, default=True, values_mode="search"),
            _field("subdivision", "Subdivision", "Parcel subdivision name.", "text", ParcelEnriched.subdiv_name, default=True, values_mode="search"),
            _field("neighborhood", "Neighborhood", "Parcel neighborhood name.", "text", ParcelEnriched.nbh_name, values_mode="search"),
            _field("acreage", "Acreage", "Calculated parcel area in acres.", "number", ParcelEnriched.parcel_area_acres_calc, default=True),
            _field("market_value", "Market value", "Curated market value.", "number", ParcelEnriched.marketvalue_numeric, default=True),
            _field("assessed_value", "Assessed value", "Curated assessed value.", "number", ParcelEnriched.assessedvalue_numeric),
            _field("land_value", "Land value", "Curated land value.", "number", ParcelEnriched.landvalue_numeric),
            _field("building_value", "Building value", "Curated building value.", "number", ParcelEnriched.buildingvalue_numeric),
            _field("value_per_acre", "Value per acre", "Calculated land value per acre.", "number", ParcelEnriched.value_per_acre),
            _field("zoning_jurisdiction", "Zoning jurisdiction", "Assigned zoning jurisdiction.", "category", ParcelZoningOverlayV2.zoning_jurisdiction_name, default=True, values_mode="options"),
            _field("zoning_code", "Zoning code", "Dominant raw zoning code.", "category", ParcelZoningOverlayV2.dominant_zoning_code_raw, default=True, values_mode="options"),
            _field("zoning_category", "Zoning category", "Normalized dominant zoning category.", "category", ParcelZoningOverlayV2.dominant_zoning_general_normalized, values_mode="options"),
            _field("last_updated", "Last updated", "CFS parcel enrichment timestamp.", "date", ParcelEnriched.enriched_at, default=True, filter_operators=()),
        ),
    ),
    "permits": MasterDataDatasetSpec(
        id="permits",
        name="Permits",
        description="One record per county real-property permit with selected parcel and descriptive segment context.",
        source="Cabarrus County Real Property Permit CSV",
        technical_source="public.real_property_permit_clean",
        owner="Cabarrus County",
        spatial=False,
        geometry_type=None,
        from_clause=_PERMIT_FROM,
        count_from=RealPropertyPermitClean.__table__,
        stable_id="permit_id",
        last_updated_expression=_PERMIT_LAST_UPDATED,
        restricted_field_count=30,
        data_quality={
            "status": "review",
            "summary": "Authoritative-candidate permit records include optional dates, numbers, and governed parcel matches.",
            "known_issues": [
                "Permit number and permit date can be missing.",
                "A permit can have no parcel match or multiple candidate parcel matches.",
                "Notes, appraiser, building number, raw source, and internal classification fields are restricted.",
            ],
        },
        base_predicates=(RealPropertyPermitClean.permit_id.is_not(None),),
        fields=(
            _field("permit_id", "Permit ID", "Stable source permit identifier.", "text", RealPropertyPermitClean.permit_id, default=True, values_mode="search"),
            _field("permit_number", "Permit number", "Public-facing permit number when supplied.", "text", RealPropertyPermitClean.permit_number, default=True, values_mode="search"),
            _field("official_parcel_id", "CFS Parcel ID", "Deterministic representative CFS parcel match.", "text", _PERMIT_PARCEL.c.official_parcel_id, default=True, values_mode="search"),
            _field("parcel_number", "Parcel number", "Parcel number supplied by the permit source.", "text", RealPropertyPermitClean.parcel_number, values_mode="search"),
            _field("permit_date", "Permit date", "Parsed permit activity date.", "date", RealPropertyPermitClean.permit_date, default=True),
            _field("permit_type", "Permit type", "Normalized permit type.", "category", RealPropertyPermitClean.permit_type_normalized, default=True, values_mode="options"),
            _field("work_type", "Work type", "Normalized work type.", "category", RealPropertyPermitClean.work_type_normalized, values_mode="options"),
            _field("permit_status", "Permit status", "Normalized permit status.", "category", RealPropertyPermitClean.permit_status_normalized, default=True, values_mode="options"),
            _field("permit_amount", "Permit amount", "Parsed permit amount.", "number", RealPropertyPermitClean.permit_amount, default=True),
            _field("permit_segment", "Permit segment", "Descriptive CFS permit segment.", "category", PermitIntelligenceSegment.permit_segment, values_mode="options"),
            _field("growth_signal", "Growth signal", "Descriptive CFS growth signal.", "category", PermitIntelligenceSegment.permit_growth_signal, values_mode="options"),
            _field("development_domain", "Development domain", "Descriptive development domain.", "category", PermitIntelligenceSegment.development_domain, values_mode="options"),
            _field("value_class", "Value class", "Descriptive permit value class.", "category", PermitIntelligenceSegment.permit_value_class, values_mode="options"),
            _field("status_stage", "Status stage", "Normalized permit status stage.", "category", PermitIntelligenceSegment.permit_status_stage, values_mode="options"),
            _field("last_updated", "Last updated", "Source last-modified timestamp, falling back to CFS transform time.", "date", _PERMIT_LAST_UPDATED, default=True, filter_operators=()),
        ),
    ),
}


def list_master_data_datasets(db: Session) -> list[dict[str, Any]]:
    return [_dataset_contract(db, spec) for spec in DATASET_REGISTRY.values()]


def get_master_data_dataset(db: Session, dataset_id: str) -> dict[str, Any]:
    return _dataset_contract(db, _dataset(dataset_id))


def get_master_data_values(
    db: Session,
    *,
    dataset_id: str,
    field_id: str,
    query: str | None,
    limit: int,
) -> dict[str, Any]:
    spec = _dataset(dataset_id)
    field = _selectable_field(spec, field_id)
    if field.values_mode == "none":
        raise MasterDataValidationError(f"Field '{field_id}' does not support value lookup.")
    normalized_query = " ".join((query or "").split())
    if field.values_mode == "search" and not normalized_query:
        raise MasterDataValidationError(f"Field '{field_id}' requires q for value lookup.")

    expression = field.expression
    predicates = [*spec.base_predicates, expression.is_not(None), func.trim(expression) != ""]
    if normalized_query:
        predicates.append(
            expression.ilike(
                f"%{_escape_like(normalized_query)}%",
                escape="\\",
            ),
        )
    count_expression = func.count().label("count")
    statement = (
        select(expression.label("value"), count_expression)
        .select_from(spec.from_clause)
        .where(and_(*predicates))
        .group_by(expression)
        .order_by(count_expression.desc(), expression.asc())
        .limit(min(max(limit, 1), 100))
    )
    return {
        "values": [row["value"] for row in db.execute(statement).mappings()],
    }


def preview_master_data(
    db: Session,
    dataset_id: str,
    request: MasterDataPreviewRequest,
) -> MasterDataPage:
    spec = _dataset(dataset_id)
    fields = _selected_fields(spec, request.fields)
    predicates = _query_predicates(spec, request.filters)
    total_count = _count(db, spec, predicates)
    statement = (
        _select_statement(
            spec,
            fields,
            predicates,
            request.sort_field,
            request.sort_direction,
        )
        .limit(request.page_size)
        .offset((request.page - 1) * request.page_size)
    )
    return MasterDataPage(
        dataset_id=spec.id,
        field_ids=[field.id for field in fields],
        rows=[dict(row) for row in db.execute(statement).mappings()],
        page=request.page,
        page_size=request.page_size,
        total=total_count,
    )


def export_master_data(
    db: Session,
    dataset_id: str,
    request: MasterDataExportRequest,
) -> MasterDataExportResult:
    spec = _dataset(dataset_id)
    fields = _selected_fields(spec, request.fields)
    predicates = _query_predicates(spec, request.filters)
    total_count = _count(db, spec, predicates)
    if total_count > EXPORT_ROW_CAP:
        raise MasterDataValidationError(
            f"Export matches {total_count} records; refine filters to {EXPORT_ROW_CAP} or fewer.",
        )
    rows = db.execute(
        _select_statement(
            spec,
            fields,
            predicates,
            request.sort_field,
            request.sort_direction,
        ),
    ).mappings()
    if request.format == "csv":
        content = _csv_content(fields, rows)
        content_type = "text/csv; charset=utf-8"
    else:
        content = _xlsx_content(spec.name, fields, rows)
        content_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    return MasterDataExportResult(
        dataset_id=spec.id,
        field_ids=[field.id for field in fields],
        filter_summary=[
            {"field": item.field, "operator": item.operator}
            for item in request.filters
        ],
        format=request.format,
        filename=f"cfs_{spec.id}_{datetime.now(UTC).date().isoformat()}.{request.format}",
        content_type=content_type,
        content=content,
        record_count=total_count,
    )


def _dataset_contract(db: Session, spec: MasterDataDatasetSpec) -> dict[str, Any]:
    statement = select(
        func.count().label("record_count"),
        func.max(spec.last_updated_expression).label("last_updated"),
    ).select_from(spec.count_from)
    if spec.base_predicates:
        statement = statement.where(and_(*spec.base_predicates))
    metrics = db.execute(statement).mappings().one()
    return {
        "id": spec.id,
        "name": spec.name,
        "description": spec.description,
        "source": spec.source,
        "technical_source": spec.technical_source,
        "owner": spec.owner,
        "spatial": spec.spatial,
        "geometry_type": spec.geometry_type,
        "record_count": metrics["record_count"] or 0,
        "last_updated": _isoformat(metrics["last_updated"]),
        "fields": [field.contract() for field in spec.fields],
        "default_fields": spec.default_fields,
        "restricted_field_count": spec.restricted_field_count,
        "supported_export_formats": ["csv", "xlsx"],
        "data_quality": spec.data_quality,
    }


def _dataset(dataset_id: str) -> MasterDataDatasetSpec:
    try:
        return DATASET_REGISTRY[dataset_id]  # type: ignore[index]
    except KeyError as exc:
        raise MasterDataNotFoundError(f"Unknown master-data dataset '{dataset_id}'.") from exc


def _selectable_field(spec: MasterDataDatasetSpec, field_id: str) -> MasterDataFieldSpec:
    field = spec.field_map.get(field_id)
    if field is None:
        raise MasterDataValidationError(
            f"Field '{field_id}' is not selectable for dataset '{spec.id}'.",
        )
    return field


def _selected_fields(
    spec: MasterDataDatasetSpec,
    requested_fields: list[str],
) -> list[MasterDataFieldSpec]:
    field_ids = requested_fields or spec.default_fields
    return [_selectable_field(spec, field_id) for field_id in field_ids]


def _query_predicates(
    spec: MasterDataDatasetSpec,
    filters: list[MasterDataFilter],
) -> list[Any]:
    predicates = list(spec.base_predicates)
    for item in filters:
        field = _selectable_field(spec, item.field)
        if item.operator not in field.filter_operators:
            raise MasterDataValidationError(
                f"Operator '{item.operator}' is not allowed for field '{field.id}'.",
            )
        value = _filter_value(field, item.operator, item.value)
        expression = field.expression
        if item.operator == "contains":
            predicates.append(
                expression.ilike(f"%{_escape_like(value)}%", escape="\\"),
            )
        elif item.operator == "eq" and field.data_type in {"text", "category"}:
            predicates.append(func.lower(expression) == value.lower())
        elif item.operator == "eq":
            predicates.append(expression == value)
        elif item.operator == "gte":
            predicates.append(expression >= value)
        else:
            predicates.append(expression <= value)
    return predicates


def _filter_value(
    field: MasterDataFieldSpec,
    operator: FilterOperator,
    raw_value: FilterValue,
) -> Any:
    if field.data_type in {"text", "category"}:
        if not isinstance(raw_value, str):
            raise MasterDataValidationError(f"Field '{field.id}' requires a text value.")
        value = " ".join(raw_value.split())
        max_length = 200 if operator == "contains" else 500
        if not value or len(value) > max_length:
            raise MasterDataValidationError(
                f"Field '{field.id}' requires 1 to {max_length} text characters.",
            )
        return value
    if field.data_type == "number":
        try:
            value = Decimal(str(raw_value))
        except (InvalidOperation, ValueError) as exc:
            raise MasterDataValidationError(f"Field '{field.id}' requires a number.") from exc
        if not value.is_finite():
            raise MasterDataValidationError(f"Field '{field.id}' requires a finite number.")
        return value
    if not isinstance(raw_value, str):
        raise MasterDataValidationError(f"Field '{field.id}' requires an ISO date value.")
    try:
        return date.fromisoformat(raw_value)
    except ValueError as exc:
        raise MasterDataValidationError(
            f"Field '{field.id}' requires a valid ISO date value.",
        ) from exc


def _count(db: Session, spec: MasterDataDatasetSpec, predicates: list[Any]) -> int:
    statement = select(func.count()).select_from(spec.from_clause)
    if predicates:
        statement = statement.where(and_(*predicates))
    return db.execute(statement).scalar_one() or 0


def _select_statement(
    spec: MasterDataDatasetSpec,
    fields: list[MasterDataFieldSpec],
    predicates: list[Any],
    sort_field: str | None,
    sort_direction: SortDirection,
):
    statement = select(
        *(field.expression.label(field.id) for field in fields),
    ).select_from(spec.from_clause)
    if predicates:
        statement = statement.where(and_(*predicates))

    order_by = []
    if sort_field:
        field = _selectable_field(spec, sort_field)
        ordering = (
            field.expression.asc()
            if sort_direction == "asc"
            else field.expression.desc()
        )
        order_by.append(ordering.nulls_last())
    if sort_field != spec.stable_id:
        order_by.append(_selectable_field(spec, spec.stable_id).expression.asc())
    return statement.order_by(*order_by)


def _csv_content(fields: list[MasterDataFieldSpec], rows: Any) -> bytes:
    output = io.StringIO(newline="")
    writer = csv.writer(output, lineterminator="\n")
    writer.writerow([field.label for field in fields])
    for row in rows:
        writer.writerow(
            [_export_value(row[field.id], field, for_xlsx=False) for field in fields],
        )
    return b"\xef\xbb\xbf" + output.getvalue().encode("utf-8")


def _xlsx_content(name: str, fields: list[MasterDataFieldSpec], rows: Any) -> bytes:
    from openpyxl import Workbook

    workbook = Workbook(write_only=True)
    worksheet = workbook.create_sheet(title=name[:31])
    worksheet.append([field.label for field in fields])
    for row in rows:
        worksheet.append(
            [_export_value(row[field.id], field, for_xlsx=True) for field in fields],
        )
    output = io.BytesIO()
    workbook.save(output)
    workbook.close()
    return output.getvalue()


def _export_value(value: Any, field: MasterDataFieldSpec, *, for_xlsx: bool) -> Any:
    if value is None:
        return None if for_xlsx else ""
    if field.data_type in {"text", "category"}:
        return _formula_safe_text(str(value))
    if isinstance(value, (date, datetime)):
        if not for_xlsx:
            return value.isoformat()
        if isinstance(value, datetime) and value.tzinfo is not None:
            return value.astimezone(UTC).replace(tzinfo=None)
        return value
    if isinstance(value, Decimal):
        return float(value) if for_xlsx else format(value, "f")
    return value


def _formula_safe_text(value: str) -> str:
    candidate = value.lstrip(" ")
    if candidate.startswith(("=", "+", "-", "@", "\t", "\r")):
        return f"'{value}"
    return value


def _escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _isoformat(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    return str(value)
