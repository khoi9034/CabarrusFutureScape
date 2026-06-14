import json
from datetime import date
from pathlib import Path

from app.core.contracts import DEVELOPMENT_ACTIVITY_CONTRACT
from app.repositories import DevelopmentRepository
from app.repositories.development_repository import (
    DevelopmentActivitySummaryFilters,
    DevelopmentHotspotsFilters,
    DevelopmentStatisticsFilters,
    DevelopmentTemporalQueryFilters,
    DevelopmentTrendsFilters,
    DevelopmentZoningSummaryFilters,
)
from app.schemas import (
    DevelopmentActivitySummaryResponse,
    DevelopmentHotspotsResponse,
    DevelopmentParcelPermitEventsResponse,
    DevelopmentPredictionRankingSummaryResponse,
    DevelopmentPredictionTransportationAccessibilitySummaryResponse,
    DevelopmentPredictionTransportationPlanTrafficSummaryResponse,
    DevelopmentStatisticsResponse,
    DevelopmentTemporalQueryResponse,
    DevelopmentTrendsResponse,
    DevelopmentZoningSummaryResponse,
    DevelopmentPredictionFeaturesSummaryResponse,
    NewConstructionLabelsSummaryResponse,
    NewConstructionStatisticsResponse,
    NewConstructionTrendsResponse,
    ParcelNewConstructionSummaryResponse,
    ParcelPermitSegmentSummaryResponse,
    PermitSegmentOptionsResponse,
    PermitSegmentStatisticsResponse,
)
from app.schemas.development import (
    DevelopmentActivityClassSummary,
    DevelopmentActivityRecentSummary,
    DevelopmentActivitySummaryBucket,
    DevelopmentActivitySummaryDateRange,
    DevelopmentActivitySummaryMonthBucket,
    DevelopmentActivitySummaryYearBucket,
    DevelopmentLookupItem,
    DevelopmentLookupResponse,
    DevelopmentHotspotMapCentroid,
    DevelopmentHotspotMapFocus,
    DevelopmentHotspotSpatialReference,
    NewConstructionBucket,
    NewConstructionDateRange,
    NewConstructionLabelPositiveRate,
    NewConstructionTrendPoint,
    DevelopmentParcelPermitEvent,
    DevelopmentTemporalBBoxSupport,
    DevelopmentTemporalContext,
    DevelopmentTemporalQueryResult,
    DevelopmentTemporalQuerySummary,
    DevelopmentHotspotResult,
    DevelopmentRollingSummary,
    DevelopmentPredictionFeatureLabelRate,
    DevelopmentPredictionFeatureMissingness,
    DevelopmentPredictionRankingClassBucket,
    TransportationAccessibilityDistanceSummary,
    TransportationAccessibilityMissingness,
    TransportationAccessibilityQualityBucket,
    TransportationPlanTrafficDistributionMetric,
    TransportationPlanTrafficQualityBucket,
    DevelopmentStatisticsBucket,
    DevelopmentTrendDateRange,
    DevelopmentTrendPoint,
    DevelopmentZoningSummaryRow,
)

ALLOWED_DEVELOPMENT_GROUP_BY = {
    "year",
    "month",
    "permit_type",
    "work_type",
    "zoning_jurisdiction",
    "zoning_category",
}
ALLOWED_ROLLING_WINDOWS = {12, 36}
ALLOWED_HOTSPOT_RECENT_WINDOWS = {1, 3}
ALLOWED_HOTSPOT_SORT_BY = {
    "development_activity_score",
    "recent_permit_count_1yr",
    "recent_permit_count_3yr",
    "total_permit_amount",
    "total_permit_count",
}
MAX_DEVELOPMENT_PAGE_LIMIT = 100
MAX_SELECTED_PARCEL_PERMIT_LIMIT = 50
ALLOWED_SELECTED_PARCEL_PERMIT_SORT = {"latest_first", "oldest_first"}
DEVELOPMENT_PREDICTION_FEATURE_GROUPS = [
    "parcel_static_features",
    "zoning_features",
    "flood_constraint_features",
    "school_assignment_features",
    "permit_history_features",
    "new_construction_history_features",
    "development_pressure_features",
    "transportation_accessibility_features",
    "transportation_plan_traffic_features",
    "planning_pipeline_utility_features",
    "jurisdiction_features",
    "future_placeholder_features",
]
DEVELOPMENT_PREDICTION_LEAKAGE_CAVEATS = [
    "No production prediction model is active.",
    "No prediction probabilities are exposed.",
    "Prior permit and new-construction windows are filtered to snapshot-year end.",
    "Current zoning, flood, school, valuation, and dashboard activity fields are current-context features unless historical snapshots are added.",
    "Official school capacity scoring is not active.",
    "Transportation/accessibility features are current-context until historical roads or dated project records exist.",
    "Planning/pipeline/utility features are current-context; Phase 16C ablation does not recommend the full Phase 16B feature set.",
]
DEVELOPMENT_MODEL_METRICS_PATH = (
    Path(__file__).resolve().parents[3]
    / "outputs"
    / "modeling"
    / "development_prediction"
    / "phase10c_model_metrics.json"
)
DEVELOPMENT_ZONING_MODEL_METRICS_PATH = (
    Path(__file__).resolve().parents[3]
    / "outputs"
    / "modeling"
    / "development_prediction"
    / "phase10e_model_comparison_metrics.json"
)
DEVELOPMENT_MODEL_QA_SUMMARY_PATH = (
    Path(__file__).resolve().parents[3]
    / "outputs"
    / "phase10f_development_prediction_model_qa_summary.json"
)
DEVELOPMENT_MODEL_STANDARDIZED_METRICS_PATH = (
    Path(__file__).resolve().parents[3]
    / "outputs"
    / "modeling"
    / "development_prediction"
    / "phase10f_standardized_model_comparison_metrics.json"
)
DEVELOPMENT_MODEL_CALIBRATION_REVIEW_PATH = (
    Path(__file__).resolve().parents[3]
    / "outputs"
    / "modeling"
    / "development_prediction"
    / "phase10f_calibration_review.json"
)
DEVELOPMENT_FEATURE_ABLATION_SUMMARY_PATH = (
    Path(__file__).resolve().parents[3]
    / "outputs"
    / "phase16c_feature_ablation_governance_summary.json"
)
DEVELOPMENT_CURRENT_BEST_MODEL_REGISTRY_PATH = (
    Path(__file__).resolve().parents[3]
    / "outputs"
    / "modeling"
    / "development_prediction"
    / "current_best_internal_model_registry.json"
)


class DevelopmentService:
    """Read-only development activity service boundary."""

    contract_documents = (DEVELOPMENT_ACTIVITY_CONTRACT,)

    def __init__(self, repository: DevelopmentRepository | None = None) -> None:
        self.repository = repository

    def get_statistics(
        self,
        *,
        filters: DevelopmentStatisticsFilters,
    ) -> DevelopmentStatisticsResponse:
        """Implement `GET /development/statistics` from the API contract."""

        if self.repository is None:
            raise RuntimeError(
                "DevelopmentRepository is required for development statistics.",
            )

        normalized_filters = DevelopmentStatisticsFilters(
            activity_class=normalize_filter_value(filters.activity_class),
            month=filters.month,
            permit_type=normalize_filter_value(filters.permit_type),
            work_type=normalize_filter_value(filters.work_type),
            year=filters.year,
            zoning_category=normalize_filter_value(filters.zoning_category),
            zoning_jurisdiction=normalize_filter_value(filters.zoning_jurisdiction),
        )
        statistics = self.repository.get_statistics(filters=normalized_filters)

        filters_applied: dict[str, int | str] = {
            key: value
            for key, value in normalized_filters.__dict__.items()
            if value is not None
        }

        def buckets(values):
            return [
                DevelopmentStatisticsBucket(value=bucket.value, count=bucket.count)
                for bucket in values
            ]

        return DevelopmentStatisticsResponse(
            total_permits=statistics.total_permits,
            parcels_with_activity=statistics.parcels_with_activity,
            parcels_without_activity=statistics.parcels_without_activity,
            recent_activity_parcels_1yr=statistics.recent_activity_parcels_1yr,
            recent_activity_parcels_3yr=statistics.recent_activity_parcels_3yr,
            activity_date_min=statistics.activity_date_min,
            activity_date_max=statistics.activity_date_max,
            activity_classes=DevelopmentActivityClassSummary(
                no_activity=statistics.activity_classes.no_activity,
                low_activity=statistics.activity_classes.low_activity,
                moderate_activity=statistics.activity_classes.moderate_activity,
                high_activity=statistics.activity_classes.high_activity,
                very_high_activity=statistics.activity_classes.very_high_activity,
            ),
            by_permit_type=buckets(statistics.by_permit_type),
            by_work_type=buckets(statistics.by_work_type),
            by_status=buckets(statistics.by_status),
            by_zoning_jurisdiction=buckets(statistics.by_zoning_jurisdiction),
            by_zoning_category=buckets(statistics.by_zoning_category),
            filters_applied=filters_applied,
        )

    def get_trends(
        self,
        *,
        filters: DevelopmentTrendsFilters,
    ) -> DevelopmentTrendsResponse:
        """Implement `GET /development/trends` from the API contract."""

        if self.repository is None:
            raise RuntimeError("DevelopmentRepository is required for trends.")

        normalized_group_by = normalize_filter_value(filters.group_by)
        if (
            normalized_group_by is not None
            and normalized_group_by not in ALLOWED_DEVELOPMENT_GROUP_BY
        ):
            raise ValueError(
                "group_by must be one of: "
                + ", ".join(sorted(ALLOWED_DEVELOPMENT_GROUP_BY)),
            )
        if (
            filters.rolling_window is not None
            and filters.rolling_window not in ALLOWED_ROLLING_WINDOWS
        ):
            raise ValueError("rolling_window must be 12 or 36")

        normalized_filters = DevelopmentTrendsFilters(
            end_year=filters.end_year,
            group_by=normalized_group_by,
            month=filters.month,
            permit_status=normalize_filter_value(filters.permit_status),
            permit_type=normalize_filter_value(filters.permit_type),
            rolling_window=filters.rolling_window,
            start_year=filters.start_year,
            work_type=normalize_filter_value(filters.work_type),
            year=filters.year,
            zoning_category=normalize_filter_value(filters.zoning_category),
            zoning_jurisdiction=normalize_filter_value(filters.zoning_jurisdiction),
        )
        trends = self.repository.get_trends(filters=normalized_filters)
        filters_applied: dict[str, int | str] = {
            key: value
            for key, value in normalized_filters.__dict__.items()
            if value is not None and key not in {"group_by", "rolling_window"}
        }

        annual_trends = [trend_point(point) for point in trends.annual_trends]
        monthly_trends = [trend_point(point) for point in trends.monthly_trends]
        grouped_trends = [trend_point(point) for point in trends.grouped_trends]

        date_range = DevelopmentTrendDateRange(
            start_year=annual_trends[0].year if annual_trends else None,
            end_year=annual_trends[-1].year if annual_trends else None,
            activity_date_min=trends.activity_date_min,
            activity_date_max=trends.activity_date_max,
        )

        return DevelopmentTrendsResponse(
            filters_applied=filters_applied,
            group_by=normalized_filters.group_by,
            rolling_window=normalized_filters.rolling_window,
            date_range=date_range,
            annual_trends=annual_trends,
            monthly_trends=monthly_trends,
            grouped_trends=grouped_trends,
            rolling_summary=rolling_summary(trends.rolling_summary),
            trend_direction=trend_direction(trends.annual_trends),
            peak_year=peak_year(trends.annual_trends),
            peak_month=peak_month(trends.monthly_trends),
            total_permits=trends.total_permits,
        )

    def get_hotspots(
        self,
        *,
        filters: DevelopmentHotspotsFilters,
        limit: int,
        offset: int,
        sort_by: str | None,
    ) -> DevelopmentHotspotsResponse:
        """Implement `GET /development/hotspots` from the API contract."""

        if self.repository is None:
            raise RuntimeError("DevelopmentRepository is required for hotspots.")

        if (
            filters.recent_window is not None
            and filters.recent_window not in ALLOWED_HOTSPOT_RECENT_WINDOWS
        ):
            raise ValueError("recent_window must be 1 or 3")

        if (
            filters.rolling_window is not None
            and filters.rolling_window not in ALLOWED_ROLLING_WINDOWS
        ):
            raise ValueError("rolling_window must be 12 or 36")

        if (
            filters.date_start is not None
            and filters.date_end is not None
            and filters.date_start > filters.date_end
        ):
            raise ValueError("date_start must be on or before date_end")

        normalized_sort_by = normalize_filter_value(sort_by) or "development_activity_score"
        if normalized_sort_by not in ALLOWED_HOTSPOT_SORT_BY:
            raise ValueError(
                "sort_by must be one of: "
                + ", ".join(sorted(ALLOWED_HOTSPOT_SORT_BY)),
            )

        clamped_limit = min(max(limit, 1), MAX_DEVELOPMENT_PAGE_LIMIT)
        normalized_filters = DevelopmentHotspotsFilters(
            activity_class=normalize_filter_value(filters.activity_class),
            date_end=filters.date_end,
            date_start=filters.date_start,
            development_domain=normalize_filter_value(filters.development_domain),
            growth_signal=normalize_filter_value(filters.growth_signal),
            month=filters.month,
            official_parcel_id=normalize_filter_value(filters.official_parcel_id),
            permit_segment=normalize_filter_value(filters.permit_segment),
            permit_status_stage=normalize_filter_value(filters.permit_status_stage),
            permit_type=normalize_filter_value(filters.permit_type),
            permit_value_class=normalize_filter_value(filters.permit_value_class),
            recent_window=filters.recent_window,
            rolling_window=filters.rolling_window,
            work_type=normalize_filter_value(filters.work_type),
            year=filters.year,
            zoning_category=normalize_filter_value(filters.zoning_category),
            zoning_jurisdiction=normalize_filter_value(filters.zoning_jurisdiction),
        )

        page = self.repository.get_hotspots(
            filters=normalized_filters,
            limit=clamped_limit,
            offset=offset,
            sort_by=normalized_sort_by,
        )
        filters_applied: dict[str, int | str] = {}
        for key, value in normalized_filters.__dict__.items():
            if value is None:
                continue
            filters_applied[key] = value.isoformat() if isinstance(value, date) else value

        return DevelopmentHotspotsResponse(
            filters_applied=filters_applied,
            sort_by=normalized_sort_by,
            limit=clamped_limit,
            offset=offset,
            total_count=page.total_count,
            results=[hotspot_result(result) for result in page.results],
        )

    def get_zoning_summary(
        self,
        *,
        filters: DevelopmentZoningSummaryFilters,
        limit: int,
        offset: int,
    ) -> DevelopmentZoningSummaryResponse:
        """Implement `GET /development/zoning-summary` from the API contract."""

        if self.repository is None:
            raise RuntimeError(
                "DevelopmentRepository is required for zoning summaries.",
            )

        clamped_limit = min(max(limit, 1), MAX_DEVELOPMENT_PAGE_LIMIT)
        normalized_filters = DevelopmentZoningSummaryFilters(
            month=filters.month,
            permit_status=normalize_filter_value(filters.permit_status),
            permit_type=normalize_filter_value(filters.permit_type),
            work_type=normalize_filter_value(filters.work_type),
            year=filters.year,
            zoning_category=normalize_filter_value(filters.zoning_category),
            zoning_code=normalize_filter_value(filters.zoning_code),
            zoning_jurisdiction=normalize_filter_value(filters.zoning_jurisdiction),
        )
        page = self.repository.get_zoning_summary(
            filters=normalized_filters,
            limit=clamped_limit,
            offset=offset,
        )
        filters_applied: dict[str, int | str] = {
            key: value
            for key, value in normalized_filters.__dict__.items()
            if value is not None
        }

        return DevelopmentZoningSummaryResponse(
            filters_applied=filters_applied,
            limit=clamped_limit,
            offset=offset,
            total_count=page.total_count,
            summary=[zoning_summary_row(row) for row in page.results],
        )

    def get_activity_summary(
        self,
        *,
        filters: DevelopmentActivitySummaryFilters,
    ) -> DevelopmentActivitySummaryResponse:
        """Implement `GET /development/activity-summary` from the API contract."""

        if self.repository is None:
            raise RuntimeError(
                "DevelopmentRepository is required for activity summaries.",
            )
        if (
            filters.date_start is not None
            and filters.date_end is not None
            and filters.date_start > filters.date_end
        ):
            raise ValueError("date_start must be on or before date_end")

        normalized_filters = DevelopmentActivitySummaryFilters(
            activity_class=normalize_filter_value(filters.activity_class),
            date_end=filters.date_end,
            date_start=filters.date_start,
            month=filters.month,
            permit_status=normalize_filter_value(filters.permit_status),
            permit_type=normalize_filter_value(filters.permit_type),
            work_type=normalize_filter_value(filters.work_type),
            year=filters.year,
            zoning_category=normalize_filter_value(filters.zoning_category),
            zoning_jurisdiction=normalize_filter_value(filters.zoning_jurisdiction),
        )
        summary = self.repository.get_activity_summary(filters=normalized_filters)
        filters_applied: dict[str, int | str] = {
            key: serialize_filter_value(value)
            for key, value in normalized_filters.__dict__.items()
            if value is not None
        }

        return DevelopmentActivitySummaryResponse(
            filters_applied=filters_applied,
            total_permits=summary.total_permits,
            active_parcel_count=summary.active_parcel_count,
            total_permit_amount=float(summary.total_permit_amount)
            if summary.total_permit_amount is not None
            else None,
            avg_permit_amount=float(summary.avg_permit_amount)
            if summary.avg_permit_amount is not None
            else None,
            date_range=DevelopmentActivitySummaryDateRange(
                activity_date_min=summary.activity_date_min,
                activity_date_max=summary.activity_date_max,
            ),
            by_permit_type=[summary_bucket(row) for row in summary.by_permit_type],
            by_work_type=[summary_bucket(row) for row in summary.by_work_type],
            by_status=[summary_bucket(row) for row in summary.by_status],
            by_activity_class=[
                summary_bucket(row) for row in summary.by_activity_class
            ],
            by_year=[summary_year_bucket(row) for row in summary.by_year],
            by_month=[summary_month_bucket(row) for row in summary.by_month],
            by_zoning_jurisdiction=[
                summary_bucket(row) for row in summary.by_zoning_jurisdiction
            ],
            by_zoning_category=[
                summary_bucket(row) for row in summary.by_zoning_category
            ],
            recent_activity=DevelopmentActivityRecentSummary(
                recent_1yr_parcels=summary.recent_activity.recent_1yr_parcels,
                recent_3yr_parcels=summary.recent_activity.recent_3yr_parcels,
            ),
        )

    def temporal_query(
        self,
        *,
        bbox: str | None,
        filters: DevelopmentTemporalQueryFilters,
        include_geometry: bool,
        limit: int,
        offset: int,
    ) -> DevelopmentTemporalQueryResponse:
        """Implement `GET /development/temporal-query` from the API contract."""

        if self.repository is None:
            raise RuntimeError("DevelopmentRepository is required for temporal query.")
        if (
            filters.rolling_window is not None
            and filters.rolling_window not in ALLOWED_ROLLING_WINDOWS
        ):
            raise ValueError("rolling_window must be 12 or 36")
        if (
            filters.date_start is not None
            and filters.date_end is not None
            and filters.date_start > filters.date_end
        ):
            raise ValueError("date_start must be on or before date_end")

        bbox_requested = normalize_filter_value(bbox) is not None
        if bbox_requested:
            parse_bbox(bbox or "")

        clamped_limit = min(max(limit, 1), MAX_DEVELOPMENT_PAGE_LIMIT)
        normalized_filters = DevelopmentTemporalQueryFilters(
            activity_class=normalize_filter_value(filters.activity_class),
            date_end=filters.date_end,
            date_start=filters.date_start,
            month=filters.month,
            permit_status=normalize_filter_value(filters.permit_status),
            permit_type=normalize_filter_value(filters.permit_type),
            rolling_window=filters.rolling_window,
            work_type=normalize_filter_value(filters.work_type),
            year=filters.year,
            zoning_category=normalize_filter_value(filters.zoning_category),
            zoning_jurisdiction=normalize_filter_value(filters.zoning_jurisdiction),
        )
        page = self.repository.temporal_query(
            filters=normalized_filters,
            limit=clamped_limit,
            offset=offset,
        )
        filters_applied: dict[str, int | str | bool] = {
            key: serialize_filter_value(value)
            for key, value in normalized_filters.__dict__.items()
            if value is not None
        }
        if bbox_requested:
            filters_applied["bbox"] = normalize_filter_value(bbox) or ""
        if include_geometry:
            filters_applied["include_geometry"] = include_geometry

        return DevelopmentTemporalQueryResponse(
            bbox_support=DevelopmentTemporalBBoxSupport(
                active=False,
                note=(
                    "bbox and include_geometry are accepted for future map extent "
                    "queries, but spatial filtering is not active until the "
                    "development activity service is backed by a safe geometry "
                    "source."
                ),
                requested=bbox_requested or include_geometry,
            ),
            filters_applied=filters_applied,
            limit=clamped_limit,
            offset=offset,
            results=[temporal_query_result(row) for row in page.results],
            summary=DevelopmentTemporalQuerySummary(
                active_parcel_count=page.summary.active_parcel_count,
                date_end=page.summary.date_end,
                date_start=page.summary.date_start,
                permit_type_breakdown=[
                    summary_bucket(row) for row in page.summary.permit_type_breakdown
                ],
                total_permits=page.summary.total_permits,
                work_type_breakdown=[
                    summary_bucket(row) for row in page.summary.work_type_breakdown
                ],
                zoning_jurisdiction_breakdown=[
                    summary_bucket(row)
                    for row in page.summary.zoning_jurisdiction_breakdown
                ],
            ),
            temporal_context=DevelopmentTemporalContext(
                date_end=page.temporal_context.date_end,
                date_start=page.temporal_context.date_start,
                defaulted_to_recent_window=page.temporal_context.defaulted_to_recent_window,
                mode=page.temporal_context.mode,
                month=page.temporal_context.month,
                rolling_window=page.temporal_context.rolling_window,
                year=page.temporal_context.year,
            ),
            total_count=page.total_count,
        )

    def get_permit_types(self) -> DevelopmentLookupResponse:
        """Return permit type lookup options for development filters."""

        if self.repository is None:
            raise RuntimeError("DevelopmentRepository is required for lookups.")
        return lookup_response(
            lookup_type="permit_types",
            records=self.repository.get_permit_types(),
        )

    def get_work_types(self) -> DevelopmentLookupResponse:
        """Return work type lookup options for development filters."""

        if self.repository is None:
            raise RuntimeError("DevelopmentRepository is required for lookups.")
        return lookup_response(
            lookup_type="work_types",
            records=self.repository.get_work_types(),
        )

    def get_jurisdictions(self) -> DevelopmentLookupResponse:
        """Return zoning jurisdiction lookup options for development filters."""

        if self.repository is None:
            raise RuntimeError("DevelopmentRepository is required for lookups.")
        return lookup_response(
            lookup_type="jurisdictions",
            records=self.repository.get_jurisdictions(),
        )

    def get_activity_classes(self) -> DevelopmentLookupResponse:
        """Return activity class lookup options for development filters."""

        if self.repository is None:
            raise RuntimeError("DevelopmentRepository is required for lookups.")
        return lookup_response(
            lookup_type="activity_classes",
            records=self.repository.get_activity_classes(),
        )

    def get_permit_segment_statistics(self) -> PermitSegmentStatisticsResponse:
        """Return countywide permit intelligence segment distributions."""

        if self.repository is None:
            raise RuntimeError(
                "DevelopmentRepository is required for permit segmentation.",
            )

        statistics = self.repository.get_permit_segment_statistics()
        return PermitSegmentStatisticsResponse(
            total_permits=statistics.total_permits,
            by_permit_segment=[
                DevelopmentStatisticsBucket(value=row.value, count=row.count)
                for row in statistics.by_permit_segment
            ],
            by_permit_growth_signal=[
                DevelopmentStatisticsBucket(value=row.value, count=row.count)
                for row in statistics.by_permit_growth_signal
            ],
            by_permit_status_stage=[
                DevelopmentStatisticsBucket(value=row.value, count=row.count)
                for row in statistics.by_permit_status_stage
            ],
            by_permit_value_class=[
                DevelopmentStatisticsBucket(value=row.value, count=row.count)
                for row in statistics.by_permit_value_class
            ],
            by_development_domain=[
                DevelopmentStatisticsBucket(value=row.value, count=row.count)
                for row in statistics.by_development_domain
            ],
        )

    def get_parcel_permit_segment_summary(
        self,
        official_parcel_id: str,
    ) -> ParcelPermitSegmentSummaryResponse | None:
        """Return the permit intelligence segment rollup for one parcel."""

        if self.repository is None:
            raise RuntimeError(
                "DevelopmentRepository is required for permit segmentation.",
            )

        normalized_parcel_id = normalize_filter_value(official_parcel_id)
        if normalized_parcel_id is None:
            raise ValueError("official_parcel_id is required")

        summary = self.repository.get_parcel_permit_segment_summary(
            normalized_parcel_id,
        )
        if summary is None:
            return None

        return parcel_permit_segment_summary(summary)

    def get_permit_segment_options(self) -> PermitSegmentOptionsResponse:
        """Return permit segmentation lookup options for UI filters."""

        if self.repository is None:
            raise RuntimeError(
                "DevelopmentRepository is required for permit segmentation.",
            )

        options = self.repository.get_permit_segment_options()
        return PermitSegmentOptionsResponse(
            development_domains=lookup_items(options.development_domains),
            growth_signals=lookup_items(options.growth_signals),
            permit_segments=lookup_items(options.permit_segments),
            status_stages=lookup_items(options.status_stages),
            value_classes=lookup_items(options.value_classes),
        )

    def get_parcel_permit_events(
        self,
        *,
        official_parcel_id: str,
        limit: int,
        offset: int,
        sort: str,
    ) -> DevelopmentParcelPermitEventsResponse:
        """Return permit events tied to one official parcel ID."""

        if self.repository is None:
            raise RuntimeError(
                "DevelopmentRepository is required for selected parcel permits.",
            )

        normalized_parcel_id = normalize_filter_value(official_parcel_id)
        if normalized_parcel_id is None:
            raise ValueError("official_parcel_id is required")

        normalized_sort = normalize_filter_value(sort) or "latest_first"
        if normalized_sort not in ALLOWED_SELECTED_PARCEL_PERMIT_SORT:
            raise ValueError("sort must be latest_first or oldest_first")

        clamped_limit = min(max(limit, 1), MAX_SELECTED_PARCEL_PERMIT_LIMIT)
        page = self.repository.get_parcel_permit_events(
            official_parcel_id=normalized_parcel_id,
            limit=clamped_limit,
            offset=offset,
            sort=normalized_sort,
        )

        return DevelopmentParcelPermitEventsResponse(
            official_parcel_id=page.official_parcel_id,
            total_count=page.total_count,
            limit=clamped_limit,
            offset=offset,
            sort=normalized_sort,
            permits=[parcel_permit_event(row) for row in page.permits],
        )

    def get_new_construction_statistics(self) -> NewConstructionStatisticsResponse:
        if self.repository is None:
            raise RuntimeError(
                "DevelopmentRepository is required for new construction statistics.",
            )

        record = self.repository.get_new_construction_statistics()
        return NewConstructionStatisticsResponse(
            total_permits=int(record.get("total_permits") or 0),
            matched_permit_count=int(record.get("matched_permit_count") or 0),
            unmatched_permit_count=int(record.get("unmatched_permit_count") or 0),
            ambiguous_permit_count=int(record.get("ambiguous_permit_count") or 0),
            invalid_placeholder_count=int(record.get("invalid_placeholder_count") or 0),
            unique_matched_parcel_count=int(
                record.get("unique_matched_parcel_count") or 0,
            ),
            co_issued_count=int(record.get("co_issued_count") or 0),
            co_not_issued_count=int(record.get("co_not_issued_count") or 0),
            date_range=NewConstructionDateRange(
                co_date_max=record.get("co_date_max"),
                co_date_min=record.get("co_date_min"),
                permit_date_max=record.get("permit_date_max"),
                permit_date_min=record.get("permit_date_min"),
            ),
            by_permit_type_class=new_construction_buckets(
                record.get("by_permit_type_class"),
            ),
            by_construction_status=new_construction_buckets(
                record.get("by_construction_status"),
            ),
            by_match_confidence=new_construction_buckets(
                record.get("by_match_confidence"),
            ),
        )

    def get_new_construction_trends(self) -> NewConstructionTrendsResponse:
        if self.repository is None:
            raise RuntimeError(
                "DevelopmentRepository is required for new construction trends.",
            )

        record = self.repository.get_new_construction_trends()
        return NewConstructionTrendsResponse(
            annual_trends=new_construction_trend_points(record.get("annual_trends")),
            monthly_trends=new_construction_trend_points(record.get("monthly_trends")),
        )

    def get_new_construction_parcel_summary(
        self,
        official_parcel_id: str,
    ) -> ParcelNewConstructionSummaryResponse:
        if self.repository is None:
            raise RuntimeError(
                "DevelopmentRepository is required for new construction parcel summary.",
            )

        normalized_parcel_id = normalize_filter_value(official_parcel_id)
        if normalized_parcel_id is None:
            raise ValueError("official_parcel_id is required")

        record = self.repository.get_new_construction_parcel_summary(
            normalized_parcel_id,
        )
        if record is None:
            return ParcelNewConstructionSummaryResponse(
                official_parcel_id=normalized_parcel_id,
            )

        return ParcelNewConstructionSummaryResponse(
            official_parcel_id=str(record["official_parcel_id"]),
            pin14=record.get("pin14"),
            total_new_construction_permits=int(
                record.get("total_new_construction_permits") or 0,
            ),
            residential_new_construction_permits=int(
                record.get("residential_new_construction_permits") or 0,
            ),
            commercial_new_construction_permits=int(
                record.get("commercial_new_construction_permits") or 0,
            ),
            first_new_construction_permit_date=record.get(
                "first_new_construction_permit_date",
            ),
            latest_new_construction_permit_date=record.get(
                "latest_new_construction_permit_date",
            ),
            latest_co_date=record.get("latest_co_date"),
            completed_new_construction_count=int(
                record.get("completed_new_construction_count") or 0,
            ),
            active_uncompleted_new_construction_count=int(
                record.get("active_uncompleted_new_construction_count") or 0,
            ),
            average_days_to_co=float(record["average_days_to_co"])
            if record.get("average_days_to_co") is not None
            else None,
            new_construction_years_active=int(
                record.get("new_construction_years_active") or 0,
            ),
            recent_1yr_new_construction_count=int(
                record.get("recent_1yr_new_construction_count") or 0,
            ),
            recent_3yr_new_construction_count=int(
                record.get("recent_3yr_new_construction_count") or 0,
            ),
            recent_5yr_new_construction_count=int(
                record.get("recent_5yr_new_construction_count") or 0,
            ),
            development_stage=str(
                record.get("development_stage")
                or "no_matched_new_construction_activity",
            ),
        )

    def get_new_construction_labels_summary(
        self,
    ) -> NewConstructionLabelsSummaryResponse:
        if self.repository is None:
            raise RuntimeError(
                "DevelopmentRepository is required for new construction labels summary.",
            )

        record = self.repository.get_new_construction_labels_summary()
        rates = [
            NewConstructionLabelPositiveRate(
                snapshot_year=int(row.get("snapshot_year") or 0),
                parcel_count=int(row.get("parcel_count") or 0),
                positive_next_1yr_count=int(
                    row.get("positive_next_1yr_count") or 0,
                ),
                positive_next_1yr_pct=float(row.get("positive_next_1yr_pct") or 0),
                positive_next_3yr_count=int(
                    row.get("positive_next_3yr_count") or 0,
                ),
                positive_next_3yr_pct=float(row.get("positive_next_3yr_pct") or 0),
            )
            for row in (record.get("positive_rate_by_snapshot_year") or [])
        ]

        return NewConstructionLabelsSummaryResponse(
            label_table_row_count=int(record.get("label_table_row_count") or 0),
            min_snapshot_year=record.get("min_snapshot_year"),
            max_snapshot_year=record.get("max_snapshot_year"),
            snapshot_year_count=int(record.get("snapshot_year_count") or 0),
            positive_rate_by_snapshot_year=rates,
        )

    def get_prediction_features_summary(
        self,
    ) -> DevelopmentPredictionFeaturesSummaryResponse:
        if self.repository is None:
            raise RuntimeError(
                "DevelopmentRepository is required for prediction features summary.",
            )

        record = self.repository.get_prediction_features_summary()
        feature_ablation_summary = development_feature_ablation_summary()
        feature_ablation_decision = feature_ablation_summary.get(
            "recommended_current_best_internal_model",
            {},
        )
        current_best_registry = development_current_best_model_registry()
        missingness = [
            DevelopmentPredictionFeatureMissingness(
                feature_name=row["feature_name"],
                missing_count=int(row.get("missing_count") or 0),
                missing_pct=float(row.get("missing_pct") or 0),
            )
            for row in (record.get("missingness_highlights") or [])
        ]
        label_rates = [
            DevelopmentPredictionFeatureLabelRate(
                label_name=row["label_name"],
                row_count=int(row.get("row_count") or 0),
                positive_count=int(row.get("positive_count") or 0),
                positive_rate_pct=float(row.get("positive_rate_pct") or 0),
            )
            for row in (record.get("label_positive_rates") or [])
        ]

        return DevelopmentPredictionFeaturesSummaryResponse(
            feature_matrix_available=bool(record.get("feature_matrix_available")),
            row_count=int(record.get("row_count") or 0),
            unique_parcel_count=int(record.get("unique_parcel_count") or 0),
            min_snapshot_year=record.get("min_snapshot_year"),
            max_snapshot_year=record.get("max_snapshot_year"),
            snapshot_year_count=int(record.get("snapshot_year_count") or 0),
            feature_set_version=record.get("feature_set_version"),
            feature_groups=DEVELOPMENT_PREDICTION_FEATURE_GROUPS,
            missingness_highlights=missingness,
            label_positive_rates=label_rates,
            leakage_caveats=DEVELOPMENT_PREDICTION_LEAKAGE_CAVEATS,
            baseline_model_experiment_available=bool(
                record.get("baseline_model_experiment_available"),
            ),
            latest_experiment_id=record.get("latest_experiment_id"),
            metrics_summary=development_model_metrics_summary(
                record.get("latest_experiment_id"),
            ),
            zoning_enhanced_feature_matrix_available=bool(
                record.get("zoning_enhanced_feature_matrix_available"),
            ),
            zoning_enhanced_row_count=int(
                record.get("zoning_enhanced_row_count") or 0,
            ),
            zoning_enhanced_model_experiment_available=bool(
                record.get("zoning_enhanced_model_experiment_available"),
            ),
            latest_zoning_enhanced_experiment_id=record.get(
                "latest_zoning_enhanced_experiment_id",
            ),
            baseline_vs_zoning_metrics_summary=development_zoning_metrics_summary(
                record.get("latest_zoning_enhanced_experiment_id"),
            ),
            transportation_enhanced_feature_matrix_available=bool(
                record.get("transportation_enhanced_feature_matrix_available"),
            ),
            transportation_enhanced_row_count=int(
                record.get("transportation_enhanced_row_count") or 0,
            ),
            transportation_enhanced_model_experiment_available=bool(
                record.get("transportation_enhanced_model_experiment_available"),
            ),
            latest_transportation_experiment_id=record.get(
                "latest_transportation_experiment_id",
            ),
            transportation_experiment_current_context_only=bool(
                record.get("transportation_experiment_current_context_only", True),
            ),
            planning_pipeline_utility_feature_matrix_available=bool(
                record.get("planning_pipeline_utility_feature_matrix_available"),
            ),
            planning_pipeline_utility_row_count=int(
                record.get("planning_pipeline_utility_row_count") or 0,
            ),
            planning_pipeline_utility_model_experiment_available=bool(
                record.get("planning_pipeline_utility_model_experiment_available"),
            ),
            latest_planning_pipeline_utility_experiment_id=record.get(
                "latest_planning_pipeline_utility_experiment_id",
            ),
            planning_pipeline_utility_current_context_only=bool(
                record.get("planning_pipeline_utility_current_context_only", True),
            ),
            concord_only_features_present=bool(
                record.get("concord_only_features_present"),
            ),
            utility_proxy_only_features_present=bool(
                record.get("utility_proxy_only_features_present"),
            ),
            latest_feature_ablation_available=bool(feature_ablation_summary),
            recommended_internal_model_experiment_id=(
                feature_ablation_decision.get("recommended_internal_model_experiment_id")
            ),
            recommended_internal_model_variant=(
                feature_ablation_decision.get("recommended_variant")
            ),
            phase16b_full_feature_set_recommended=bool(
                feature_ablation_decision.get("phase16b_full_feature_set_recommended", False),
            ),
            current_best_internal_model_available=bool(current_best_registry),
            current_best_internal_model_variant=(
                current_best_registry.get("recommended_feature_set")
                or current_best_registry.get("recommended_internal_model_name")
            ),
            current_best_internal_model_public_exposure_allowed=bool(
                current_best_registry.get("public_exposure_allowed", False),
            ),
            current_best_internal_model_production_ready=bool(
                current_best_registry.get("production_ready", False),
            ),
            excluded_feature_groups_current_best=[
                str(group)
                for group in current_best_registry.get("excluded_feature_groups", [])
            ],
            latest_model_qa_available=DEVELOPMENT_MODEL_QA_SUMMARY_PATH.exists(),
            latest_model_qa_id=development_model_qa_id(),
            standardized_metrics_available=DEVELOPMENT_MODEL_STANDARDIZED_METRICS_PATH.exists(),
            calibration_review_available=DEVELOPMENT_MODEL_CALIBRATION_REVIEW_PATH.exists(),
            production_ready=bool(record.get("production_ready")),
            model_active=False,
            prediction_probability_available=False,
        )

    def get_prediction_ranking_summary(
        self,
    ) -> DevelopmentPredictionRankingSummaryResponse:
        if self.repository is None:
            raise RuntimeError(
                "DevelopmentRepository is required for prediction ranking summary.",
            )

        record = self.repository.get_prediction_ranking_summary()
        return DevelopmentPredictionRankingSummaryResponse(
            ranking_available=bool(record.get("ranking_available")),
            experiment_id=record.get("experiment_id"),
            ranking_row_count=int(record.get("ranking_row_count") or 0),
            unique_parcel_count=int(record.get("unique_parcel_count") or 0),
            class_distribution=[
                DevelopmentPredictionRankingClassBucket(
                    development_signal_class=str(row["development_signal_class"]),
                    row_count=int(row.get("row_count") or 0),
                    pct_of_rows=float(row.get("pct_of_rows") or 0),
                )
                for row in (record.get("class_distribution") or [])
            ],
            explanation_available=bool(record.get("explanation_available")),
            explanation_row_count=int(record.get("explanation_row_count") or 0),
            calibration_status=development_model_calibration_status(),
            production_ready=False,
            public_exposure_allowed=False,
            prediction_probability_available=False,
            exact_probabilities_exposed=False,
            caveat="internal_ranking_research_not_for_public_decision",
            no_parcel_level_scores=True,
        )

    def get_transportation_accessibility_summary(
        self,
    ) -> DevelopmentPredictionTransportationAccessibilitySummaryResponse:
        if self.repository is None:
            raise RuntimeError(
                "DevelopmentRepository is required for transportation accessibility summary.",
            )

        record = self.repository.get_transportation_accessibility_summary()
        return DevelopmentPredictionTransportationAccessibilitySummaryResponse(
            feature_table_available=bool(record.get("feature_table_available")),
            row_count=int(record.get("row_count") or 0),
            unique_parcel_count=int(record.get("unique_parcel_count") or 0),
            expected_parcel_count=int(record.get("expected_parcel_count") or 0),
            row_count_matches_parcels=bool(record.get("row_count_matches_parcels")),
            road_clean_rows=int(record.get("road_clean_rows") or 0),
            rail_clean_rows=int(record.get("rail_clean_rows") or 0),
            rail_corridor_within_half_mile_count=int(
                record.get("rail_corridor_within_half_mile_count") or 0,
            ),
            missing_major_road_classification_count=int(
                record.get("missing_major_road_classification_count") or 0,
            ),
            distance_summary=[
                TransportationAccessibilityDistanceSummary(
                    metric_name=str(row["metric_name"]),
                    non_null_count=int(row.get("non_null_count") or 0),
                    min_ft=float(row["min_ft"]) if row.get("min_ft") is not None else None,
                    p25_ft=float(row["p25_ft"]) if row.get("p25_ft") is not None else None,
                    median_ft=float(row["median_ft"]) if row.get("median_ft") is not None else None,
                    p75_ft=float(row["p75_ft"]) if row.get("p75_ft") is not None else None,
                    p90_ft=float(row["p90_ft"]) if row.get("p90_ft") is not None else None,
                    max_ft=float(row["max_ft"]) if row.get("max_ft") is not None else None,
                    avg_ft=float(row["avg_ft"]) if row.get("avg_ft") is not None else None,
                )
                for row in (record.get("distance_summary") or [])
            ],
            missingness_summary=[
                TransportationAccessibilityMissingness(
                    feature_name=str(row["feature_name"]),
                    missing_count=int(row.get("missing_count") or 0),
                    missing_pct=float(row.get("missing_pct") or 0),
                )
                for row in (record.get("missingness_summary") or [])
            ],
            data_quality_distribution=[
                TransportationAccessibilityQualityBucket(
                    transportation_accessibility_data_quality=str(
                        row["transportation_accessibility_data_quality"],
                    ),
                    row_count=int(row.get("row_count") or 0),
                )
                for row in (record.get("data_quality_distribution") or [])
            ],
            current_context_only=True,
            model_active=False,
            prediction_probability_available=False,
        )

    def get_transportation_plan_traffic_summary(
        self,
    ) -> DevelopmentPredictionTransportationPlanTrafficSummaryResponse:
        if self.repository is None:
            raise RuntimeError(
                "DevelopmentRepository is required for transportation plan/traffic summary.",
            )

        record = self.repository.get_transportation_plan_traffic_summary()
        return DevelopmentPredictionTransportationPlanTrafficSummaryResponse(
            feature_table_available=bool(record.get("feature_table_available")),
            row_count=int(record.get("row_count") or 0),
            unique_parcel_count=int(record.get("unique_parcel_count") or 0),
            expected_parcel_count=int(record.get("expected_parcel_count") or 0),
            row_count_matches_parcels=bool(record.get("row_count_matches_parcels")),
            stip_clean_rows=int(record.get("stip_clean_rows") or 0),
            aadt_clean_rows=int(record.get("aadt_clean_rows") or 0),
            stip_project_within_half_mile_count=int(
                record.get("stip_project_within_half_mile_count") or 0,
            ),
            stip_project_within_1_mile_count=int(
                record.get("stip_project_within_1_mile_count") or 0,
            ),
            planned_transportation_investment_count=int(
                record.get("planned_transportation_investment_count") or 0,
            ),
            current_context_only_count=int(record.get("current_context_only_count") or 0),
            time_safe_for_training_count=int(
                record.get("time_safe_for_training_count") or 0,
            ),
            distribution_summary=[
                TransportationPlanTrafficDistributionMetric(
                    metric_name=str(row["metric_name"]),
                    metric_unit=str(row["metric_unit"]),
                    non_null_count=int(row.get("non_null_count") or 0),
                    min_value=float(row["min_value"]) if row.get("min_value") is not None else None,
                    p25_value=float(row["p25_value"]) if row.get("p25_value") is not None else None,
                    median_value=float(row["median_value"]) if row.get("median_value") is not None else None,
                    p75_value=float(row["p75_value"]) if row.get("p75_value") is not None else None,
                    p90_value=float(row["p90_value"]) if row.get("p90_value") is not None else None,
                    max_value=float(row["max_value"]) if row.get("max_value") is not None else None,
                    avg_value=float(row["avg_value"]) if row.get("avg_value") is not None else None,
                )
                for row in (record.get("distribution_summary") or [])
            ],
            missingness_summary=[
                TransportationAccessibilityMissingness(
                    feature_name=str(row["feature_name"]),
                    missing_count=int(row.get("missing_count") or 0),
                    missing_pct=float(row.get("missing_pct") or 0),
                )
                for row in (record.get("missingness_summary") or [])
            ],
            quality_distribution=[
                TransportationPlanTrafficQualityBucket(
                    quality_type=str(row["quality_type"]),
                    quality=str(row["quality"]),
                    row_count=int(row.get("row_count") or 0),
                )
                for row in (record.get("quality_distribution") or [])
            ],
            current_context_only=True,
            time_safe_for_training=False,
            model_active=False,
            prediction_probability_available=False,
        )


def development_model_metrics_summary(
    latest_experiment_id: object,
) -> dict[str, object]:
    if not latest_experiment_id or not DEVELOPMENT_MODEL_METRICS_PATH.exists():
        return {}

    try:
        payload = json.loads(DEVELOPMENT_MODEL_METRICS_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}

    if payload.get("experiment_id") != latest_experiment_id:
        return {}

    best_model_name = payload.get("best_model_name")
    best_metrics = (payload.get("models") or {}).get(best_model_name, {})
    return {
        "experiment_id": payload.get("experiment_id"),
        "target": payload.get("target"),
        "feature_set": payload.get("feature_set"),
        "best_model_name": best_model_name,
        "validation": best_metrics.get("validation", {}),
        "test": best_metrics.get("test", {}),
        "production_ready": bool(payload.get("production_ready")),
        "model_active": bool(payload.get("model_active")),
        "prediction_probability_available": bool(
            payload.get("prediction_probability_available"),
        ),
    }


def development_zoning_metrics_summary(
    latest_zoning_experiment_id: object,
) -> dict[str, object]:
    if (
        latest_zoning_experiment_id != "phase10e_zoning_enhanced_v1"
        or not DEVELOPMENT_ZONING_MODEL_METRICS_PATH.exists()
    ):
        return {}

    try:
        payload = json.loads(
            DEVELOPMENT_ZONING_MODEL_METRICS_PATH.read_text(encoding="utf-8"),
        )
    except (OSError, json.JSONDecodeError):
        return {}

    if payload.get("experiment_id") != latest_zoning_experiment_id:
        return {}

    retrained_baseline = payload.get("retrained_baseline") or {}
    zoning_enhanced = payload.get("zoning_enhanced") or {}
    return {
        "experiment_id": payload.get("experiment_id"),
        "target": payload.get("target"),
        "baseline_best_model_name": retrained_baseline.get("best_model_name"),
        "zoning_enhanced_best_model_name": zoning_enhanced.get("best_model_name"),
        "comparison_on_selected_best_models": payload.get(
            "comparison_on_selected_best_models",
            {},
        ),
        "improvement_meaningful": bool(payload.get("improvement_meaningful")),
        "zoning_features_appear_important": bool(
            payload.get("zoning_features_appear_important"),
        ),
        "top_zoning_features": payload.get("top_zoning_features", [])[:10],
        "production_ready": bool(payload.get("production_ready")),
        "model_active": bool(payload.get("model_active")),
        "prediction_probability_available": bool(
            payload.get("prediction_probability_available"),
        ),
        "internal_only": True,
    }


def development_model_qa_id() -> str | None:
    if not DEVELOPMENT_MODEL_QA_SUMMARY_PATH.exists():
        return None

    try:
        payload = json.loads(DEVELOPMENT_MODEL_QA_SUMMARY_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None

    return payload.get("qa_id")


def development_model_calibration_status() -> str | None:
    if not DEVELOPMENT_MODEL_CALIBRATION_REVIEW_PATH.exists():
        return None

    try:
        payload = json.loads(
            DEVELOPMENT_MODEL_CALIBRATION_REVIEW_PATH.read_text(encoding="utf-8"),
        )
    except (OSError, json.JSONDecodeError):
        return None

    return payload.get("calibration_assessment")


def development_feature_ablation_summary() -> dict[str, object]:
    if not DEVELOPMENT_FEATURE_ABLATION_SUMMARY_PATH.exists():
        return {}

    try:
        payload = json.loads(
            DEVELOPMENT_FEATURE_ABLATION_SUMMARY_PATH.read_text(encoding="utf-8"),
        )
    except (OSError, json.JSONDecodeError):
        return {}

    return payload if isinstance(payload, dict) else {}


def development_current_best_model_registry() -> dict[str, object]:
    if not DEVELOPMENT_CURRENT_BEST_MODEL_REGISTRY_PATH.exists():
        return {}

    try:
        payload = json.loads(
            DEVELOPMENT_CURRENT_BEST_MODEL_REGISTRY_PATH.read_text(encoding="utf-8"),
        )
    except (OSError, json.JSONDecodeError):
        return {}

    return payload if isinstance(payload, dict) else {}


def normalize_filter_value(value: str | None) -> str | None:
    if value is None:
        return None

    normalized = " ".join(value.strip().split())
    return normalized or None


def serialize_filter_value(value: int | str | date) -> int | str:
    if isinstance(value, date):
        return value.isoformat()
    return value


def parse_bbox(value: str) -> tuple[float, float, float, float]:
    parts = [part.strip() for part in value.split(",")]
    if len(parts) != 4:
        raise ValueError("bbox must use minx,miny,maxx,maxy format")
    try:
        minx, miny, maxx, maxy = [float(part) for part in parts]
    except ValueError as exc:
        raise ValueError("bbox must contain four numeric coordinates") from exc
    if minx >= maxx or miny >= maxy:
        raise ValueError("bbox min coordinates must be less than max coordinates")
    return minx, miny, maxx, maxy


def lookup_response(lookup_type: str, records) -> DevelopmentLookupResponse:
    options = lookup_items(records)
    return DevelopmentLookupResponse(
        lookup_type=lookup_type,
        total_options=len(options),
        options=options,
    )


def new_construction_buckets(value: object) -> list[NewConstructionBucket]:
    rows = value if isinstance(value, list) else []
    return [
        NewConstructionBucket(
            count=int(row.get("count") or 0),
            value=str(row.get("value") or "unknown"),
        )
        for row in rows
        if isinstance(row, dict)
    ]


def new_construction_trend_points(value: object) -> list[NewConstructionTrendPoint]:
    rows = value if isinstance(value, list) else []
    return [
        NewConstructionTrendPoint(
            active_uncompleted_count=int(row.get("active_uncompleted_count") or 0),
            commercial_count=int(row.get("commercial_count") or 0),
            completed_count=int(row.get("completed_count") or 0),
            month=row.get("month"),
            permit_count=int(row.get("permit_count") or 0),
            residential_count=int(row.get("residential_count") or 0),
            year=row.get("year"),
        )
        for row in rows
        if isinstance(row, dict)
    ]


def lookup_items(records) -> list[DevelopmentLookupItem]:
    return [
        DevelopmentLookupItem(
            value=record.value,
            label=humanize_lookup_label(record.value),
            count=record.count,
        )
        for record in records
    ]


def humanize_lookup_label(value: str) -> str:
    normalized = " ".join(value.replace("_", " ").split())
    if normalized.isupper() or normalized.islower():
        return normalized.title()
    return normalized


def trend_point(point) -> DevelopmentTrendPoint:
    return DevelopmentTrendPoint(
        year=point.year,
        month=point.month,
        permit_count=point.permit_count,
        parcel_count=point.parcel_count,
        total_permit_amount=float(point.total_permit_amount)
        if point.total_permit_amount is not None
        else None,
        zoning_jurisdiction_name=point.zoning_jurisdiction_name,
        zoning_category=point.zoning_category,
        permit_type=point.permit_type,
        work_type=point.work_type,
    )


def temporal_query_result(row) -> DevelopmentTemporalQueryResult:
    return DevelopmentTemporalQueryResult(
        activity_date=row.activity_date,
        activity_month=row.activity_month,
        activity_year=row.activity_year,
        development_activity_class=row.development_activity_class,
        dominant_zoning_code_raw=row.dominant_zoning_code_raw,
        dominant_zoning_general_normalized=row.dominant_zoning_general_normalized,
        official_parcel_id=row.official_parcel_id,
        permit_amount=float(row.permit_amount) if row.permit_amount is not None else None,
        permit_id=row.permit_id,
        permit_number=row.permit_number,
        permit_status=row.permit_status,
        permit_type=row.permit_type,
        pin14=row.pin14,
        relationship_confidence=row.relationship_confidence,
        work_type=row.work_type,
        zoning_jurisdiction_name=row.zoning_jurisdiction_name,
    )


def parcel_permit_event(row) -> DevelopmentParcelPermitEvent:
    return DevelopmentParcelPermitEvent(
        activity_date=row.activity_date,
        activity_year=row.activity_year,
        permit_amount=float(row.permit_amount) if row.permit_amount is not None else None,
        permit_id=row.permit_id,
        permit_number=row.permit_number,
        permit_status=row.permit_status,
        permit_type=row.permit_type,
        permit_segment=row.permit_segment,
        permit_growth_signal=row.permit_growth_signal,
        development_domain=row.development_domain,
        permit_status_stage=row.permit_status_stage,
        permit_value_class=row.permit_value_class,
        permit_signal_score=float(row.permit_signal_score)
        if row.permit_signal_score is not None
        else None,
        relationship_confidence=row.relationship_confidence,
        work_type=row.work_type,
    )


def parcel_permit_segment_summary(row) -> ParcelPermitSegmentSummaryResponse:
    return ParcelPermitSegmentSummaryResponse(
        official_parcel_id=row.official_parcel_id,
        pin14=row.pin14,
        total_permits=row.total_permits or 0,
        residential_growth_permits=row.residential_growth_permits or 0,
        commercial_activity_permits=row.commercial_activity_permits or 0,
        industrial_activity_permits=row.industrial_activity_permits or 0,
        institutional_activity_permits=row.institutional_activity_permits or 0,
        redevelopment_signal_permits=row.redevelopment_signal_permits or 0,
        minor_maintenance_permits=row.minor_maintenance_permits or 0,
        demolition_permits=row.demolition_permits or 0,
        active_construction_permits=row.active_construction_permits or 0,
        completed_permits=row.completed_permits or 0,
        high_value_permits=row.high_value_permits or 0,
        major_value_permits=row.major_value_permits or 0,
        total_permit_amount=float(row.total_permit_amount)
        if row.total_permit_amount is not None
        else None,
        latest_permit_date=row.latest_permit_date,
        first_permit_date=row.first_permit_date,
        active_year_count=row.active_year_count or 0,
        dominant_permit_segment=row.dominant_permit_segment,
        dominant_growth_signal=row.dominant_growth_signal,
        permit_signal_score_max=float(row.permit_signal_score_max)
        if row.permit_signal_score_max is not None
        else None,
        permit_signal_score_avg=float(row.permit_signal_score_avg)
        if row.permit_signal_score_avg is not None
        else None,
        current_activity_status=row.current_activity_status,
    )


def summary_bucket(bucket) -> DevelopmentActivitySummaryBucket:
    return DevelopmentActivitySummaryBucket(
        value=bucket.value,
        permit_count=bucket.permit_count,
        active_parcel_count=bucket.active_parcel_count,
        total_permit_amount=float(bucket.total_permit_amount)
        if bucket.total_permit_amount is not None
        else None,
    )


def summary_year_bucket(bucket) -> DevelopmentActivitySummaryYearBucket:
    return DevelopmentActivitySummaryYearBucket(
        year=bucket.year,
        permit_count=bucket.permit_count,
        active_parcel_count=bucket.active_parcel_count,
        total_permit_amount=float(bucket.total_permit_amount)
        if bucket.total_permit_amount is not None
        else None,
    )


def summary_month_bucket(bucket) -> DevelopmentActivitySummaryMonthBucket:
    return DevelopmentActivitySummaryMonthBucket(
        year=bucket.year,
        month=bucket.month,
        permit_count=bucket.permit_count,
        active_parcel_count=bucket.active_parcel_count,
        total_permit_amount=float(bucket.total_permit_amount)
        if bucket.total_permit_amount is not None
        else None,
    )


def rolling_summary(summary) -> DevelopmentRollingSummary | None:
    if summary is None:
        return None
    return DevelopmentRollingSummary(
        window_months=summary.window_months,
        start_date=summary.start_date,
        end_date=summary.end_date,
        permit_count=summary.permit_count,
        parcel_count=summary.parcel_count,
        total_permit_amount=float(summary.total_permit_amount)
        if summary.total_permit_amount is not None
        else None,
    )


def hotspot_result(result) -> DevelopmentHotspotResult:
    centroid_longitude = optional_float(result.centroid_longitude)
    centroid_latitude = optional_float(result.centroid_latitude)
    centroid = (
        DevelopmentHotspotMapCentroid(
            longitude=centroid_longitude,
            latitude=centroid_latitude,
        )
        if centroid_longitude is not None and centroid_latitude is not None
        else None
    )

    return DevelopmentHotspotResult(
        official_parcel_id=result.official_parcel_id,
        pin14=result.pin14,
        subdivision=result.subdivision,
        neighborhood=result.neighborhood,
        zoning_jurisdiction_name=result.zoning_jurisdiction_name,
        dominant_zoning_code_raw=result.dominant_zoning_code_raw,
        dominant_zoning_general_normalized=result.dominant_zoning_general_normalized,
        parcel_quality_status=result.parcel_quality_status,
        zoning_assignment_confidence=result.zoning_assignment_confidence,
        total_permit_count=result.total_permit_count or 0,
        first_permit_date=result.first_permit_date,
        recent_permit_count_1yr=result.recent_permit_count_1yr or 0,
        recent_permit_count_3yr=result.recent_permit_count_3yr or 0,
        total_permit_amount=float(result.total_permit_amount)
        if result.total_permit_amount is not None
        else None,
        avg_permit_amount=float(result.avg_permit_amount)
        if result.avg_permit_amount is not None
        else None,
        latest_permit_date=result.latest_permit_date,
        active_year_count=result.active_year_count or 0,
        dominant_permit_type=result.dominant_permit_type,
        dominant_work_type=result.dominant_work_type,
        latest_permit_status=result.latest_permit_status,
        ambiguous_permit_count=result.ambiguous_permit_count or 0,
        co_date_future_outlier_count=result.co_date_future_outlier_count or 0,
        development_activity_score=float(result.development_activity_score)
        if result.development_activity_score is not None
        else None,
        development_activity_class=result.development_activity_class,
        has_unmatched_or_ambiguous_permit_flag=bool(
            result.has_unmatched_or_ambiguous_permit_flag,
        ),
        residential_growth_permits=result.residential_growth_permits or 0,
        commercial_activity_permits=result.commercial_activity_permits or 0,
        industrial_activity_permits=result.industrial_activity_permits or 0,
        institutional_activity_permits=result.institutional_activity_permits or 0,
        redevelopment_signal_permits=result.redevelopment_signal_permits or 0,
        minor_maintenance_permits=result.minor_maintenance_permits or 0,
        demolition_permits=result.demolition_permits or 0,
        active_construction_permits=result.active_construction_permits or 0,
        completed_permits=result.completed_permits or 0,
        high_value_permits=result.high_value_permits or 0,
        major_value_permits=result.major_value_permits or 0,
        dominant_permit_segment=result.dominant_permit_segment,
        dominant_growth_signal=result.dominant_growth_signal,
        permit_signal_score_max=float(result.permit_signal_score_max)
        if result.permit_signal_score_max is not None
        else None,
        permit_signal_score_avg=float(result.permit_signal_score_avg)
        if result.permit_signal_score_avg is not None
        else None,
        current_activity_status=result.current_activity_status,
        map_focus=DevelopmentHotspotMapFocus(
            centroid=centroid,
            geometry_available=bool(result.geometry_available)
            and centroid is not None,
            full_geometry_returned=False,
            spatial_reference=DevelopmentHotspotSpatialReference(wkid=4326),
        ),
    )


def optional_float(value: object) -> float | None:
    if value is None:
        return None

    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def zoning_summary_row(row) -> DevelopmentZoningSummaryRow:
    return DevelopmentZoningSummaryRow(
        zoning_jurisdiction_name=row.zoning_jurisdiction_name,
        dominant_zoning_code_raw=row.dominant_zoning_code_raw,
        dominant_zoning_general_normalized=row.dominant_zoning_general_normalized,
        permit_type=row.permit_type,
        work_type=row.work_type,
        permit_status=row.permit_status,
        activity_year=row.activity_year,
        activity_month=row.activity_month,
        permit_count=row.permit_count,
        active_parcel_count=row.active_parcel_count,
        total_permit_amount=float(row.total_permit_amount)
        if row.total_permit_amount is not None
        else None,
        avg_permit_amount=float(row.avg_permit_amount)
        if row.avg_permit_amount is not None
        else None,
        very_high_activity_parcel_count=row.very_high_activity_parcel_count,
        high_activity_parcel_count=row.high_activity_parcel_count,
        moderate_activity_parcel_count=row.moderate_activity_parcel_count,
        low_activity_parcel_count=row.low_activity_parcel_count,
    )


def trend_direction(annual_trends) -> str:
    if len(annual_trends) < 2:
        return "flat"
    previous = annual_trends[-2].permit_count
    current = annual_trends[-1].permit_count
    if current > previous:
        return "up"
    if current < previous:
        return "down"
    return "flat"


def peak_year(annual_trends) -> int | None:
    if not annual_trends:
        return None
    peak = max(annual_trends, key=lambda point: point.permit_count)
    return peak.year


def peak_month(monthly_trends) -> str | None:
    if not monthly_trends:
        return None
    peak = max(monthly_trends, key=lambda point: point.permit_count)
    if peak.year is None or peak.month is None:
        return None
    return f"{peak.year:04d}-{peak.month:02d}"
