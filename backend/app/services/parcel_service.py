import json
from json import JSONDecodeError

from app.core.contracts import (
    PARCEL_FILTER_SPECIFICATION,
    PARCEL_INTELLIGENCE_CONTRACT,
    PARCEL_SEARCH_SPECIFICATION,
)
from app.repositories import ParcelRepository
from app.repositories.parcel_repository import (
    ParcelFilterFilters,
    ParcelGovernanceWarningsFilters,
    ParcelSearchFilters,
    ParcelStatisticsFilters,
    ParcelZoningSummaryFilters,
)
from app.schemas import (
    ParcelDetailResponse,
    ParcelFilterResponse,
    ParcelGovernanceWarningResponse,
    ParcelSearchResponse,
    ParcelStatisticsResponse,
    ParcelZoningSummaryResponse,
)
from app.schemas.parcel import (
    ParcelContext,
    ParcelFilterResult,
    ParcelGovernance,
    ParcelGovernanceWarningResult,
    ParcelGovernanceWarningSummary,
    ParcelLocation,
    ParcelMapFocus,
    ParcelMapFocusCentroid,
    ParcelMapFocusExtent,
    ParcelMetadata,
    ParcelPlanning,
    ParcelSearchResult,
    ParcelStatisticsBucket,
    ParcelValuation,
    ParcelZoning,
    ParcelZoningCategorySummary,
    ParcelZoningCodeSummary,
    ParcelZoningConfidenceSummary,
    ParcelZoningGovernanceWarningSummary,
    ParcelZoningJurisdictionSummary,
)

MAX_SEARCH_LIMIT = 100


class ParcelService:
    """Read-only parcel intelligence service boundary."""

    contract_documents = (
        PARCEL_INTELLIGENCE_CONTRACT,
        PARCEL_SEARCH_SPECIFICATION,
        PARCEL_FILTER_SPECIFICATION,
    )

    def __init__(self, repository: ParcelRepository | None = None) -> None:
        self.repository = repository

    def search_parcels(
        self,
        *,
        query: str,
        limit: int,
        offset: int,
        filters: ParcelSearchFilters,
    ) -> ParcelSearchResponse:
        """Implement `GET /parcels/search` from the parcel search contract.

        Limit values above the contract max are clamped to `100` so client
        mistakes remain safe without turning a valid search into an error.
        """

        if self.repository is None:
            raise RuntimeError("ParcelRepository is required for parcel search.")

        normalized_query = " ".join(query.strip().split())
        bounded_limit = min(max(limit, 1), MAX_SEARCH_LIMIT)
        bounded_offset = max(offset, 0)

        page = self.repository.search_parcels(
            normalized_query,
            filters=filters,
            limit=bounded_limit,
            offset=bounded_offset,
        )

        return ParcelSearchResponse(
            query=normalized_query,
            limit=bounded_limit,
            offset=bounded_offset,
            total_count=page.total_count,
            results=[
                ParcelSearchResult(
                    official_parcel_id=result.official_parcel_id,
                    pin14=result.pin14,
                    subdivision=result.subdivision,
                    neighborhood=result.neighborhood,
                    owner_display=result.owner_display,
                    mailing_city=result.mailing_city,
                    mailing_state=result.mailing_state,
                    zoning_jurisdiction_name=result.zoning_jurisdiction_name,
                    dominant_zoning_code_raw=result.dominant_zoning_code_raw,
                    dominant_zoning_general_normalized=result.dominant_zoning_general_normalized,
                    zoning_assignment_confidence=result.zoning_assignment_confidence,
                    parcel_quality_status=result.parcel_quality_status,
                    valuation_band=result.valuation_band,
                    safe_for_dashboard=result.safe_for_dashboard,
                    governance_warning_categories=result.governance_warning_categories
                    or [],
                )
                for result in page.results
            ],
        )

    def get_parcel_detail(
        self,
        official_parcel_id: str,
        *,
        include_geometry: bool = False,
    ) -> ParcelDetailResponse | None:
        if self.repository is None:
            raise RuntimeError("ParcelRepository is required for parcel detail lookup.")

        record = self.repository.get_by_official_parcel_id(
            official_parcel_id,
            include_geometry=include_geometry,
        )
        if record is None:
            return None

        transformed_at = (
            record.transformed_at.isoformat() if record.transformed_at else None
        )
        centroid_longitude = optional_float(record.centroid_longitude)
        centroid_latitude = optional_float(record.centroid_latitude)
        extent_xmin = optional_float(record.extent_xmin)
        extent_ymin = optional_float(record.extent_ymin)
        extent_xmax = optional_float(record.extent_xmax)
        extent_ymax = optional_float(record.extent_ymax)
        centroid = (
            ParcelMapFocusCentroid(
                longitude=centroid_longitude,
                latitude=centroid_latitude,
            )
            if centroid_longitude is not None and centroid_latitude is not None
            else None
        )
        extent = (
            ParcelMapFocusExtent(
                xmin=extent_xmin,
                ymin=extent_ymin,
                xmax=extent_xmax,
                ymax=extent_ymax,
            )
            if (
                extent_xmin is not None
                and extent_ymin is not None
                and extent_xmax is not None
                and extent_ymax is not None
            )
            else None
        )
        highlight_geometry = parse_highlight_geometry(
            record.highlight_geometry_geojson,
        )

        return ParcelDetailResponse(
            official_parcel_id=record.official_parcel_id,
            pin14=record.pin14,
            objectid_1=record.objectid_1,
            location=ParcelLocation(
                subdivision=record.subdivision,
                neighborhood=record.neighborhood,
            ),
            valuation=ParcelValuation(
                marketvalue_numeric=float(record.marketvalue_numeric)
                if record.marketvalue_numeric is not None
                else None,
                assessedvalue_numeric=float(record.assessedvalue_numeric)
                if record.assessedvalue_numeric is not None
                else None,
                valuation_band=record.valuation_band,
            ),
            parcel_context=ParcelContext(
                parcel_size_category=record.parcel_size_category,
                parcel_quality_status=record.parcel_quality_status,
            ),
            zoning=ParcelZoning(
                zoning_jurisdiction_name=record.zoning_jurisdiction_name,
                dominant_zoning_code_raw=record.dominant_zoning_code_raw,
                dominant_zoning_general_normalized=record.dominant_zoning_general_normalized,
                zoning_assignment_confidence=record.zoning_assignment_confidence,
            ),
            governance=ParcelGovernance(
                governance_warning_categories=record.governance_warning_categories
                or [],
                safe_for_dashboard=record.safe_for_dashboard,
            ),
            planning=ParcelPlanning(
                planning_jurisdiction=record.planning_jurisdiction,
            ),
            metadata=ParcelMetadata(transformed_at=transformed_at),
            map_focus=ParcelMapFocus(
                centroid=centroid,
                extent=extent,
                geometry_available=bool(record.geometry_available)
                and centroid is not None
                and extent is not None,
                full_geometry_returned=highlight_geometry is not None,
            ),
            highlight_geometry=highlight_geometry,
        )

    def filter_parcels(
        self,
        *,
        limit: int,
        offset: int,
        filters: ParcelFilterFilters,
    ) -> ParcelFilterResponse:
        """Implement `GET /parcels/filter` from the parcel filter contract."""

        if self.repository is None:
            raise RuntimeError("ParcelRepository is required for parcel filtering.")

        normalized_filters = ParcelFilterFilters(
            governance_warning=normalize_filter_value(filters.governance_warning),
            neighborhood=normalize_filter_value(filters.neighborhood),
            parcel_quality_status=normalize_filter_value(
                filters.parcel_quality_status,
            ),
            parcel_size_category=normalize_filter_value(filters.parcel_size_category),
            safe_for_dashboard=filters.safe_for_dashboard,
            subdivision=normalize_filter_value(filters.subdivision),
            valuation_band=normalize_filter_value(filters.valuation_band),
            zoning_category=normalize_filter_value(filters.zoning_category),
            zoning_code=normalize_filter_value(filters.zoning_code),
            zoning_confidence=normalize_filter_value(filters.zoning_confidence),
            zoning_jurisdiction=normalize_filter_value(filters.zoning_jurisdiction),
        )
        bounded_limit = min(max(limit, 1), MAX_SEARCH_LIMIT)
        bounded_offset = max(offset, 0)

        page = self.repository.filter_parcels(
            filters=normalized_filters,
            limit=bounded_limit,
            offset=bounded_offset,
        )

        filters_applied: dict[str, str | bool] = {
            key: value
            for key, value in normalized_filters.__dict__.items()
            if value is not None
        }

        return ParcelFilterResponse(
            filters_applied=filters_applied,
            limit=bounded_limit,
            offset=bounded_offset,
            total_count=page.total_count,
            results=[
                ParcelFilterResult(
                    official_parcel_id=result.official_parcel_id,
                    pin14=result.pin14,
                    subdivision=result.subdivision,
                    neighborhood=result.neighborhood,
                    zoning_jurisdiction_name=result.zoning_jurisdiction_name,
                    dominant_zoning_code_raw=result.dominant_zoning_code_raw,
                    dominant_zoning_general_normalized=result.dominant_zoning_general_normalized,
                    zoning_assignment_confidence=result.zoning_assignment_confidence,
                    parcel_quality_status=result.parcel_quality_status,
                    valuation_band=result.valuation_band,
                    parcel_size_category=result.parcel_size_category,
                    safe_for_dashboard=result.safe_for_dashboard,
                    governance_warning_categories=result.governance_warning_categories
                    or [],
                )
                for result in page.results
            ],
        )

    def get_statistics(
        self,
        *,
        filters: ParcelStatisticsFilters,
    ) -> ParcelStatisticsResponse:
        """Implement `GET /parcels/statistics` from the parcel API contract."""

        if self.repository is None:
            raise RuntimeError("ParcelRepository is required for parcel statistics.")

        normalized_filters = ParcelStatisticsFilters(
            parcel_quality_status=normalize_filter_value(
                filters.parcel_quality_status,
            ),
            safe_for_dashboard=filters.safe_for_dashboard,
            valuation_band=normalize_filter_value(filters.valuation_band),
            zoning_category=normalize_filter_value(filters.zoning_category),
            zoning_confidence=normalize_filter_value(filters.zoning_confidence),
            zoning_jurisdiction=normalize_filter_value(filters.zoning_jurisdiction),
        )

        statistics = self.repository.get_statistics(filters=normalized_filters)
        filters_applied: dict[str, str | bool] = {
            key: value
            for key, value in normalized_filters.__dict__.items()
            if value is not None
        }

        def buckets(values):
            return [
                ParcelStatisticsBucket(value=bucket.value, count=bucket.count)
                for bucket in values
            ]

        return ParcelStatisticsResponse(
            total_parcels=statistics.total_parcels,
            zoned_parcels=statistics.zoned_parcels,
            no_match_parcels=statistics.no_match_parcels,
            safe_for_dashboard_parcels=statistics.safe_for_dashboard_parcels,
            review_parcels=statistics.review_parcels,
            high_confidence_parcels=statistics.high_confidence_parcels,
            low_confidence_parcels=statistics.low_confidence_parcels,
            multi_jurisdiction_parcels=statistics.multi_jurisdiction_parcels,
            by_zoning_jurisdiction=buckets(statistics.by_zoning_jurisdiction),
            by_zoning_category=buckets(statistics.by_zoning_category),
            by_parcel_quality_status=buckets(
                statistics.by_parcel_quality_status,
            ),
            by_valuation_band=buckets(statistics.by_valuation_band),
            by_governance_warning=buckets(statistics.by_governance_warning),
            filters_applied=filters_applied,
        )

    def get_zoning_summary(
        self,
        *,
        filters: ParcelZoningSummaryFilters,
    ) -> ParcelZoningSummaryResponse:
        """Implement `GET /parcels/zoning-summary` from the parcel API contract."""

        if self.repository is None:
            raise RuntimeError("ParcelRepository is required for zoning summaries.")

        normalized_filters = ParcelZoningSummaryFilters(
            parcel_quality_status=normalize_filter_value(
                filters.parcel_quality_status,
            ),
            safe_for_dashboard=filters.safe_for_dashboard,
            zoning_category=normalize_filter_value(filters.zoning_category),
            zoning_code=normalize_filter_value(filters.zoning_code),
            zoning_confidence=normalize_filter_value(filters.zoning_confidence),
            zoning_jurisdiction=normalize_filter_value(filters.zoning_jurisdiction),
        )

        summary = self.repository.get_zoning_summary(filters=normalized_filters)
        filters_applied: dict[str, str | bool] = {
            key: value
            for key, value in normalized_filters.__dict__.items()
            if value is not None
        }

        return ParcelZoningSummaryResponse(
            total_parcels=summary.total_parcels,
            zoned_parcels=summary.zoned_parcels,
            no_match_parcels=summary.no_match_parcels,
            jurisdiction_summary=[
                ParcelZoningJurisdictionSummary(
                    zoning_jurisdiction_name=item.zoning_jurisdiction_name,
                    parcel_count=item.parcel_count,
                    percentage=percentage(item.parcel_count, summary.total_parcels),
                    high_confidence_count=item.high_confidence_count,
                    review_count=item.review_count,
                    safe_for_dashboard_count=item.safe_for_dashboard_count,
                )
                for item in summary.jurisdiction_summary
            ],
            zoning_code_summary=[
                ParcelZoningCodeSummary(
                    zoning_jurisdiction_name=item.zoning_jurisdiction_name,
                    zoning_code=item.zoning_code,
                    zoning_category=item.zoning_category,
                    parcel_count=item.parcel_count,
                    percentage=percentage(item.parcel_count, summary.total_parcels),
                    review_count=item.review_count,
                )
                for item in summary.zoning_code_summary
            ],
            zoning_category_summary=[
                ParcelZoningCategorySummary(
                    zoning_category=item.zoning_category,
                    parcel_count=item.parcel_count,
                    percentage=percentage(item.parcel_count, summary.total_parcels),
                )
                for item in summary.zoning_category_summary
            ],
            confidence_summary=[
                ParcelZoningConfidenceSummary(
                    confidence=item.confidence,
                    parcel_count=item.parcel_count,
                    percentage=percentage(item.parcel_count, summary.total_parcels),
                )
                for item in summary.confidence_summary
            ],
            multi_jurisdiction_count=summary.multi_jurisdiction_count,
            governance_warning_summary=[
                ParcelZoningGovernanceWarningSummary(
                    governance_warning=item.governance_warning,
                    parcel_count=item.parcel_count,
                    percentage=percentage(item.parcel_count, summary.total_parcels),
                )
                for item in summary.governance_warning_summary
            ],
            filters_applied=filters_applied,
        )

    def get_governance_warnings(
        self,
        *,
        limit: int,
        offset: int,
        filters: ParcelGovernanceWarningsFilters,
    ) -> ParcelGovernanceWarningResponse:
        """Implement `GET /parcels/governance-warnings` from the API contract."""

        if self.repository is None:
            raise RuntimeError(
                "ParcelRepository is required for governance warnings.",
            )

        normalized_filters = ParcelGovernanceWarningsFilters(
            parcel_quality_status=normalize_filter_value(
                filters.parcel_quality_status,
            ),
            safe_for_dashboard=filters.safe_for_dashboard,
            warning_category=normalize_filter_value(filters.warning_category),
            zoning_category=normalize_filter_value(filters.zoning_category),
            zoning_confidence=normalize_filter_value(filters.zoning_confidence),
            zoning_jurisdiction=normalize_filter_value(filters.zoning_jurisdiction),
        )
        bounded_limit = min(max(limit, 1), MAX_SEARCH_LIMIT)
        bounded_offset = max(offset, 0)

        page = self.repository.get_governance_warnings(
            filters=normalized_filters,
            limit=bounded_limit,
            offset=bounded_offset,
        )

        filters_applied: dict[str, str | bool] = {
            key: value
            for key, value in normalized_filters.__dict__.items()
            if value is not None
        }
        if page.filters_default_to_review:
            filters_applied["default_scope"] = "governance_review"

        return ParcelGovernanceWarningResponse(
            filters_applied=filters_applied,
            limit=bounded_limit,
            offset=bounded_offset,
            total_count=page.total_count,
            warning_summary=[
                ParcelGovernanceWarningSummary(
                    warning_category=item.warning_category,
                    parcel_count=item.parcel_count,
                    percentage=percentage(item.parcel_count, page.total_count),
                )
                for item in page.warning_summary
            ],
            results=[
                ParcelGovernanceWarningResult(
                    official_parcel_id=result.official_parcel_id,
                    pin14=result.pin14,
                    subdivision=result.subdivision,
                    neighborhood=result.neighborhood,
                    zoning_jurisdiction_name=result.zoning_jurisdiction_name,
                    dominant_zoning_code_raw=result.dominant_zoning_code_raw,
                    dominant_zoning_general_normalized=result.dominant_zoning_general_normalized,
                    zoning_assignment_confidence=result.zoning_assignment_confidence,
                    parcel_quality_status=result.parcel_quality_status,
                    valuation_band=result.valuation_band,
                    safe_for_dashboard=result.safe_for_dashboard,
                    governance_warning_categories=result.governance_warning_categories
                    or [],
                )
                for result in page.results
            ],
        )


def normalize_filter_value(value: str | None) -> str | None:
    if value is None:
        return None

    normalized = " ".join(value.strip().split())
    return normalized or None


def optional_float(value: object) -> float | None:
    if value is None:
        return None

    return float(value)


def parse_highlight_geometry(geojson_text: str | None) -> dict | None:
    if not geojson_text:
        return None

    try:
        geometry = json.loads(geojson_text)
    except JSONDecodeError:
        return None

    if not isinstance(geometry, dict):
        return None

    geometry["spatial_reference"] = {"wkid": 4326}
    return geometry


def percentage(count: int, total: int) -> float:
    if total == 0:
        return 0.0
    return round((count / total) * 100, 4)
