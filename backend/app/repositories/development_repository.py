from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import and_, func, literal, select
from sqlalchemy.orm import Session

from app.models import (
    DevelopmentActivityParcelSummary,
    RealPropertyPermitParcelRelationship,
)


@dataclass(frozen=True)
class DevelopmentStatisticsFilters:
    activity_class: str | None = None
    month: int | None = None
    permit_type: str | None = None
    work_type: str | None = None
    year: int | None = None
    zoning_category: str | None = None
    zoning_jurisdiction: str | None = None


@dataclass(frozen=True)
class DevelopmentStatisticsBucket:
    value: str
    count: int


@dataclass(frozen=True)
class DevelopmentActivityClassCounts:
    no_activity: int
    low_activity: int
    moderate_activity: int
    high_activity: int
    very_high_activity: int


@dataclass(frozen=True)
class DevelopmentStatisticsRecord:
    total_permits: int
    parcels_with_activity: int
    parcels_without_activity: int
    recent_activity_parcels_1yr: int
    recent_activity_parcels_3yr: int
    activity_date_min: date | None
    activity_date_max: date | None
    activity_classes: DevelopmentActivityClassCounts
    by_permit_type: list[DevelopmentStatisticsBucket]
    by_work_type: list[DevelopmentStatisticsBucket]
    by_status: list[DevelopmentStatisticsBucket]
    by_zoning_jurisdiction: list[DevelopmentStatisticsBucket]
    by_zoning_category: list[DevelopmentStatisticsBucket]


@dataclass(frozen=True)
class DevelopmentTrendsFilters:
    end_year: int | None = None
    group_by: str | None = None
    month: int | None = None
    permit_status: str | None = None
    permit_type: str | None = None
    rolling_window: int | None = None
    start_year: int | None = None
    work_type: str | None = None
    year: int | None = None
    zoning_category: str | None = None
    zoning_jurisdiction: str | None = None


@dataclass(frozen=True)
class DevelopmentTrendPointRecord:
    permit_count: int
    parcel_count: int
    total_permit_amount: Decimal | None
    month: int | None = None
    permit_type: str | None = None
    work_type: str | None = None
    year: int | None = None
    zoning_category: str | None = None
    zoning_jurisdiction_name: str | None = None


@dataclass(frozen=True)
class DevelopmentRollingSummaryRecord:
    end_date: date
    parcel_count: int
    permit_count: int
    start_date: date
    total_permit_amount: Decimal | None
    window_months: int


@dataclass(frozen=True)
class DevelopmentTrendsRecord:
    activity_date_max: date | None
    activity_date_min: date | None
    annual_trends: list[DevelopmentTrendPointRecord]
    grouped_trends: list[DevelopmentTrendPointRecord]
    monthly_trends: list[DevelopmentTrendPointRecord]
    rolling_summary: DevelopmentRollingSummaryRecord | None
    total_permits: int


@dataclass(frozen=True)
class DevelopmentHotspotsFilters:
    activity_class: str | None = None
    permit_type: str | None = None
    recent_window: int | None = None
    work_type: str | None = None
    year: int | None = None
    zoning_category: str | None = None
    zoning_jurisdiction: str | None = None


@dataclass(frozen=True)
class DevelopmentHotspotRecord:
    official_parcel_id: str
    pin14: str | None
    subdivision: str | None
    neighborhood: str | None
    zoning_jurisdiction_name: str | None
    dominant_zoning_code_raw: str | None
    dominant_zoning_general_normalized: str | None
    parcel_quality_status: str | None
    zoning_assignment_confidence: str | None
    total_permit_count: int | None
    recent_permit_count_1yr: int | None
    recent_permit_count_3yr: int | None
    total_permit_amount: Decimal | None
    avg_permit_amount: Decimal | None
    latest_permit_date: date | None
    dominant_permit_type: str | None
    dominant_work_type: str | None
    latest_permit_status: str | None
    development_activity_score: Decimal | None
    development_activity_class: str | None
    has_unmatched_or_ambiguous_permit_flag: bool | None


@dataclass(frozen=True)
class DevelopmentHotspotsPage:
    results: list[DevelopmentHotspotRecord]
    total_count: int


@dataclass(frozen=True)
class DevelopmentZoningSummaryFilters:
    month: int | None = None
    permit_status: str | None = None
    permit_type: str | None = None
    work_type: str | None = None
    year: int | None = None
    zoning_category: str | None = None
    zoning_code: str | None = None
    zoning_jurisdiction: str | None = None


@dataclass(frozen=True)
class DevelopmentZoningSummaryRecord:
    zoning_jurisdiction_name: str
    dominant_zoning_code_raw: str
    dominant_zoning_general_normalized: str
    permit_type: str
    work_type: str
    permit_status: str
    activity_year: int | None
    activity_month: int | None
    permit_count: int
    active_parcel_count: int
    total_permit_amount: Decimal | None
    avg_permit_amount: Decimal | None
    very_high_activity_parcel_count: int
    high_activity_parcel_count: int
    moderate_activity_parcel_count: int
    low_activity_parcel_count: int


@dataclass(frozen=True)
class DevelopmentZoningSummaryPage:
    results: list[DevelopmentZoningSummaryRecord]
    total_count: int


@dataclass(frozen=True)
class DevelopmentActivitySummaryFilters:
    activity_class: str | None = None
    date_end: date | None = None
    date_start: date | None = None
    month: int | None = None
    permit_status: str | None = None
    permit_type: str | None = None
    work_type: str | None = None
    year: int | None = None
    zoning_category: str | None = None
    zoning_jurisdiction: str | None = None


@dataclass(frozen=True)
class DevelopmentActivitySummaryBucketRecord:
    active_parcel_count: int
    permit_count: int
    total_permit_amount: Decimal | None
    value: str


@dataclass(frozen=True)
class DevelopmentActivityYearBucketRecord:
    active_parcel_count: int
    permit_count: int
    total_permit_amount: Decimal | None
    year: int


@dataclass(frozen=True)
class DevelopmentActivityMonthBucketRecord:
    active_parcel_count: int
    month: int
    permit_count: int
    total_permit_amount: Decimal | None
    year: int


@dataclass(frozen=True)
class DevelopmentActivityRecentRecord:
    recent_1yr_parcels: int
    recent_3yr_parcels: int


@dataclass(frozen=True)
class DevelopmentActivitySummaryRecord:
    active_parcel_count: int
    activity_date_max: date | None
    activity_date_min: date | None
    avg_permit_amount: Decimal | None
    by_activity_class: list[DevelopmentActivitySummaryBucketRecord]
    by_month: list[DevelopmentActivityMonthBucketRecord]
    by_permit_type: list[DevelopmentActivitySummaryBucketRecord]
    by_status: list[DevelopmentActivitySummaryBucketRecord]
    by_work_type: list[DevelopmentActivitySummaryBucketRecord]
    by_year: list[DevelopmentActivityYearBucketRecord]
    by_zoning_category: list[DevelopmentActivitySummaryBucketRecord]
    by_zoning_jurisdiction: list[DevelopmentActivitySummaryBucketRecord]
    recent_activity: DevelopmentActivityRecentRecord
    total_permit_amount: Decimal | None
    total_permits: int


@dataclass(frozen=True)
class DevelopmentTemporalQueryFilters:
    activity_class: str | None = None
    date_end: date | None = None
    date_start: date | None = None
    month: int | None = None
    permit_status: str | None = None
    permit_type: str | None = None
    rolling_window: int | None = None
    work_type: str | None = None
    year: int | None = None
    zoning_category: str | None = None
    zoning_jurisdiction: str | None = None


@dataclass(frozen=True)
class DevelopmentTemporalQueryResultRecord:
    activity_date: date | None
    activity_month: int | None
    activity_year: int | None
    development_activity_class: str | None
    dominant_zoning_code_raw: str | None
    dominant_zoning_general_normalized: str | None
    official_parcel_id: str | None
    permit_amount: Decimal | None
    permit_id: str | None
    permit_number: str | None
    permit_status: str | None
    permit_type: str | None
    pin14: str | None
    relationship_confidence: str | None
    work_type: str | None
    zoning_jurisdiction_name: str | None


@dataclass(frozen=True)
class DevelopmentTemporalQuerySummaryRecord:
    active_parcel_count: int
    date_end: date | None
    date_start: date | None
    permit_type_breakdown: list[DevelopmentActivitySummaryBucketRecord]
    total_permits: int
    work_type_breakdown: list[DevelopmentActivitySummaryBucketRecord]
    zoning_jurisdiction_breakdown: list[DevelopmentActivitySummaryBucketRecord]


@dataclass(frozen=True)
class DevelopmentTemporalContextRecord:
    date_end: date | None
    date_start: date | None
    defaulted_to_recent_window: bool
    mode: str
    month: int | None
    rolling_window: int | None
    year: int | None


@dataclass(frozen=True)
class DevelopmentTemporalQueryPage:
    results: list[DevelopmentTemporalQueryResultRecord]
    summary: DevelopmentTemporalQuerySummaryRecord
    temporal_context: DevelopmentTemporalContextRecord
    total_count: int


@dataclass(frozen=True)
class DevelopmentLookupRecord:
    count: int
    value: str


class DevelopmentRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def _relationship_from(self):
        return RealPropertyPermitParcelRelationship.__table__.outerjoin(
            DevelopmentActivityParcelSummary.__table__,
            DevelopmentActivityParcelSummary.official_parcel_id
            == RealPropertyPermitParcelRelationship.official_parcel_id,
        )

    def _relationship_predicates(
        self,
        filters: DevelopmentStatisticsFilters,
    ):
        predicates = []

        if filters.year is not None:
            predicates.append(
                RealPropertyPermitParcelRelationship.activity_year == filters.year,
            )
        if filters.month is not None:
            predicates.append(
                RealPropertyPermitParcelRelationship.activity_month == filters.month,
            )
        if filters.permit_type:
            predicates.append(
                func.lower(RealPropertyPermitParcelRelationship.permit_type)
                == filters.permit_type.lower(),
            )
        if filters.work_type:
            predicates.append(
                func.lower(RealPropertyPermitParcelRelationship.work_type)
                == filters.work_type.lower(),
            )
        if filters.zoning_jurisdiction:
            predicates.append(
                func.lower(
                    RealPropertyPermitParcelRelationship.zoning_jurisdiction_name,
                )
                == filters.zoning_jurisdiction.lower(),
            )
        if filters.zoning_category:
            predicates.append(
                func.lower(
                    RealPropertyPermitParcelRelationship.dominant_zoning_general_normalized,
                )
                == filters.zoning_category.lower(),
            )
        if filters.activity_class:
            predicates.append(
                func.lower(DevelopmentActivityParcelSummary.development_activity_class)
                == filters.activity_class.lower(),
            )

        return predicates

    def _trend_predicates(
        self,
        filters: DevelopmentTrendsFilters,
    ):
        predicates = []

        if filters.year is not None:
            predicates.append(
                RealPropertyPermitParcelRelationship.activity_year == filters.year,
            )
        else:
            if filters.start_year is not None:
                predicates.append(
                    RealPropertyPermitParcelRelationship.activity_year
                    >= filters.start_year,
                )
            if filters.end_year is not None:
                predicates.append(
                    RealPropertyPermitParcelRelationship.activity_year
                    <= filters.end_year,
                )
        if filters.month is not None:
            predicates.append(
                RealPropertyPermitParcelRelationship.activity_month == filters.month,
            )
        if filters.permit_type:
            predicates.append(
                func.lower(RealPropertyPermitParcelRelationship.permit_type)
                == filters.permit_type.lower(),
            )
        if filters.work_type:
            predicates.append(
                func.lower(RealPropertyPermitParcelRelationship.work_type)
                == filters.work_type.lower(),
            )
        if filters.permit_status:
            predicates.append(
                func.lower(RealPropertyPermitParcelRelationship.permit_status)
                == filters.permit_status.lower(),
            )
        if filters.zoning_jurisdiction:
            predicates.append(
                func.lower(
                    RealPropertyPermitParcelRelationship.zoning_jurisdiction_name,
                )
                == filters.zoning_jurisdiction.lower(),
            )
        if filters.zoning_category:
            predicates.append(
                func.lower(
                    RealPropertyPermitParcelRelationship.dominant_zoning_general_normalized,
                )
                == filters.zoning_category.lower(),
            )

        return predicates

    def _hotspot_predicates(
        self,
        filters: DevelopmentHotspotsFilters,
    ):
        predicates = [
            func.coalesce(DevelopmentActivityParcelSummary.total_permit_count, 0) > 0,
        ]

        if filters.activity_class:
            predicates.append(
                func.lower(DevelopmentActivityParcelSummary.development_activity_class)
                == filters.activity_class.lower(),
            )
        if filters.zoning_jurisdiction:
            predicates.append(
                func.lower(DevelopmentActivityParcelSummary.zoning_jurisdiction_name)
                == filters.zoning_jurisdiction.lower(),
            )
        if filters.zoning_category:
            predicates.append(
                func.lower(
                    DevelopmentActivityParcelSummary.dominant_zoning_general_normalized,
                )
                == filters.zoning_category.lower(),
            )
        if filters.recent_window == 1:
            predicates.append(
                func.coalesce(
                    DevelopmentActivityParcelSummary.recent_permit_count_1yr,
                    0,
                )
                > 0,
            )
        if filters.recent_window == 3:
            predicates.append(
                func.coalesce(
                    DevelopmentActivityParcelSummary.recent_permit_count_3yr,
                    0,
                )
                > 0,
            )

        relationship_predicates = [
            RealPropertyPermitParcelRelationship.official_parcel_id
            == DevelopmentActivityParcelSummary.official_parcel_id,
            RealPropertyPermitParcelRelationship.has_parcel_match.is_(True),
        ]
        if filters.year is not None:
            relationship_predicates.append(
                RealPropertyPermitParcelRelationship.activity_year == filters.year,
            )
        if filters.permit_type:
            relationship_predicates.append(
                func.lower(RealPropertyPermitParcelRelationship.permit_type)
                == filters.permit_type.lower(),
            )
        if filters.work_type:
            relationship_predicates.append(
                func.lower(RealPropertyPermitParcelRelationship.work_type)
                == filters.work_type.lower(),
            )

        if len(relationship_predicates) > 2:
            predicates.append(
                select(1)
                .select_from(RealPropertyPermitParcelRelationship)
                .where(and_(*relationship_predicates))
                .exists(),
            )

        return predicates

    def _development_zoning_summary_predicates(
        self,
        filters: DevelopmentZoningSummaryFilters,
    ):
        predicates = []

        if filters.zoning_jurisdiction:
            predicates.append(
                func.lower(
                    RealPropertyPermitParcelRelationship.zoning_jurisdiction_name,
                )
                == filters.zoning_jurisdiction.lower(),
            )
        if filters.zoning_category:
            predicates.append(
                func.lower(
                    RealPropertyPermitParcelRelationship.dominant_zoning_general_normalized,
                )
                == filters.zoning_category.lower(),
            )
        if filters.zoning_code:
            predicates.append(
                func.lower(
                    RealPropertyPermitParcelRelationship.dominant_zoning_code_raw,
                )
                == filters.zoning_code.lower(),
            )
        if filters.permit_type:
            predicates.append(
                func.lower(RealPropertyPermitParcelRelationship.permit_type)
                == filters.permit_type.lower(),
            )
        if filters.work_type:
            predicates.append(
                func.lower(RealPropertyPermitParcelRelationship.work_type)
                == filters.work_type.lower(),
            )
        if filters.permit_status:
            predicates.append(
                func.lower(RealPropertyPermitParcelRelationship.permit_status)
                == filters.permit_status.lower(),
            )
        if filters.year is not None:
            predicates.append(
                RealPropertyPermitParcelRelationship.activity_year == filters.year,
            )
        if filters.month is not None:
            predicates.append(
                RealPropertyPermitParcelRelationship.activity_month == filters.month,
            )

        return predicates

    def _activity_summary_predicates(
        self,
        filters: DevelopmentActivitySummaryFilters,
    ):
        predicates = []

        if filters.year is not None:
            predicates.append(
                RealPropertyPermitParcelRelationship.activity_year == filters.year,
            )
        if filters.month is not None:
            predicates.append(
                RealPropertyPermitParcelRelationship.activity_month == filters.month,
            )
        if filters.date_start is not None:
            predicates.append(
                RealPropertyPermitParcelRelationship.activity_date
                >= filters.date_start,
            )
        if filters.date_end is not None:
            predicates.append(
                RealPropertyPermitParcelRelationship.activity_date <= filters.date_end,
            )
        if filters.permit_type:
            predicates.append(
                func.lower(RealPropertyPermitParcelRelationship.permit_type)
                == filters.permit_type.lower(),
            )
        if filters.work_type:
            predicates.append(
                func.lower(RealPropertyPermitParcelRelationship.work_type)
                == filters.work_type.lower(),
            )
        if filters.permit_status:
            predicates.append(
                func.lower(RealPropertyPermitParcelRelationship.permit_status)
                == filters.permit_status.lower(),
            )
        if filters.zoning_jurisdiction:
            predicates.append(
                func.lower(
                    RealPropertyPermitParcelRelationship.zoning_jurisdiction_name,
                )
                == filters.zoning_jurisdiction.lower(),
            )
        if filters.zoning_category:
            predicates.append(
                func.lower(
                    RealPropertyPermitParcelRelationship.dominant_zoning_general_normalized,
                )
                == filters.zoning_category.lower(),
            )
        if filters.activity_class:
            predicates.append(
                func.lower(DevelopmentActivityParcelSummary.development_activity_class)
                == filters.activity_class.lower(),
            )

        return predicates

    def _temporal_query_base_predicates(
        self,
        filters: DevelopmentTemporalQueryFilters,
    ):
        predicates = []

        if filters.permit_type:
            predicates.append(
                func.lower(RealPropertyPermitParcelRelationship.permit_type)
                == filters.permit_type.lower(),
            )
        if filters.work_type:
            predicates.append(
                func.lower(RealPropertyPermitParcelRelationship.work_type)
                == filters.work_type.lower(),
            )
        if filters.permit_status:
            predicates.append(
                func.lower(RealPropertyPermitParcelRelationship.permit_status)
                == filters.permit_status.lower(),
            )
        if filters.zoning_jurisdiction:
            predicates.append(
                func.lower(
                    RealPropertyPermitParcelRelationship.zoning_jurisdiction_name,
                )
                == filters.zoning_jurisdiction.lower(),
            )
        if filters.zoning_category:
            predicates.append(
                func.lower(
                    RealPropertyPermitParcelRelationship.dominant_zoning_general_normalized,
                )
                == filters.zoning_category.lower(),
            )
        if filters.activity_class:
            predicates.append(
                func.lower(DevelopmentActivityParcelSummary.development_activity_class)
                == filters.activity_class.lower(),
            )

        return predicates

    def _temporal_query_predicates(
        self,
        filters: DevelopmentTemporalQueryFilters,
        date_start: date | None,
        date_end: date | None,
    ):
        predicates = self._temporal_query_base_predicates(filters)

        if filters.year is not None:
            predicates.append(
                RealPropertyPermitParcelRelationship.activity_year == filters.year,
            )
        if filters.month is not None:
            predicates.append(
                RealPropertyPermitParcelRelationship.activity_month == filters.month,
            )
        if filters.date_start is not None:
            predicates.append(
                RealPropertyPermitParcelRelationship.activity_date
                >= filters.date_start,
            )
        if filters.date_end is not None:
            predicates.append(
                RealPropertyPermitParcelRelationship.activity_date <= filters.date_end,
            )
        if date_start is not None:
            predicates.append(
                RealPropertyPermitParcelRelationship.activity_date >= date_start,
            )
        if date_end is not None:
            predicates.append(
                RealPropertyPermitParcelRelationship.activity_date <= date_end,
            )

        return predicates

    def _parcel_universe_predicates(
        self,
        filters: DevelopmentStatisticsFilters,
    ):
        predicates = []

        if filters.zoning_jurisdiction:
            predicates.append(
                func.lower(DevelopmentActivityParcelSummary.zoning_jurisdiction_name)
                == filters.zoning_jurisdiction.lower(),
            )
        if filters.zoning_category:
            predicates.append(
                func.lower(
                    DevelopmentActivityParcelSummary.dominant_zoning_general_normalized,
                )
                == filters.zoning_category.lower(),
            )
        if filters.activity_class:
            predicates.append(
                func.lower(DevelopmentActivityParcelSummary.development_activity_class)
                == filters.activity_class.lower(),
            )

        return predicates

    def get_statistics(
        self,
        *,
        filters: DevelopmentStatisticsFilters,
    ) -> DevelopmentStatisticsRecord:
        relationship_from = self._relationship_from()
        relationship_predicates = self._relationship_predicates(filters)
        relationship_where = (
            and_(*relationship_predicates) if relationship_predicates else None
        )
        parcel_predicates = self._parcel_universe_predicates(filters)
        parcel_where = and_(*parcel_predicates) if parcel_predicates else None

        def apply_relationship_where(statement):
            if relationship_where is not None:
                return statement.where(relationship_where)
            return statement

        def apply_parcel_where(statement):
            if parcel_where is not None:
                return statement.where(parcel_where)
            return statement

        anchor_date = self.db.execute(
            apply_parcel_where(
                select(func.max(DevelopmentActivityParcelSummary.activity_anchor_date)),
            ),
        ).scalar_one()

        metrics_statement = apply_relationship_where(
            select(
                func.count(
                    func.distinct(RealPropertyPermitParcelRelationship.permit_id),
                ).label("total_permits"),
                func.count(
                    func.distinct(
                        RealPropertyPermitParcelRelationship.official_parcel_id,
                    ),
                )
                .filter(RealPropertyPermitParcelRelationship.has_parcel_match.is_(True))
                .label("parcels_with_activity"),
                func.min(RealPropertyPermitParcelRelationship.activity_date).label(
                    "activity_date_min",
                ),
                func.max(RealPropertyPermitParcelRelationship.activity_date).label(
                    "activity_date_max",
                ),
            ).select_from(relationship_from),
        )
        metrics = self.db.execute(metrics_statement).mappings().one()

        recent_1yr = 0
        recent_3yr = 0
        if anchor_date is not None:
            recent_1yr = self.db.execute(
                apply_relationship_where(
                    select(
                        func.count(
                            func.distinct(
                                RealPropertyPermitParcelRelationship.official_parcel_id,
                            ),
                        ),
                    )
                    .select_from(relationship_from)
                    .where(
                        RealPropertyPermitParcelRelationship.has_parcel_match.is_(True),
                        RealPropertyPermitParcelRelationship.activity_date
                        >= anchor_date - timedelta(days=365),
                    ),
                ),
            ).scalar_one()
            recent_3yr = self.db.execute(
                apply_relationship_where(
                    select(
                        func.count(
                            func.distinct(
                                RealPropertyPermitParcelRelationship.official_parcel_id,
                            ),
                        ),
                    )
                    .select_from(relationship_from)
                    .where(
                        RealPropertyPermitParcelRelationship.has_parcel_match.is_(True),
                        RealPropertyPermitParcelRelationship.activity_date
                        >= anchor_date - timedelta(days=365 * 3),
                    ),
                ),
            ).scalar_one()

        relationship_dimension_filters_present = any(
            [
                filters.year is not None,
                filters.month is not None,
                filters.permit_type,
                filters.work_type,
            ],
        )
        no_result_scope = (
            (metrics["total_permits"] or 0) == 0
            and relationship_dimension_filters_present
        )

        parcel_universe_count = 0
        if not no_result_scope:
            parcel_universe_count = self.db.execute(
                apply_parcel_where(
                    select(func.count()).select_from(DevelopmentActivityParcelSummary),
                ),
            ).scalar_one()
        parcels_with_activity = metrics["parcels_with_activity"] or 0
        parcels_without_activity = max(parcel_universe_count - parcels_with_activity, 0)

        activity_class_counts = {
            "no_activity": 0,
            "low_activity": 0,
            "moderate_activity": 0,
            "high_activity": 0,
            "very_high_activity": 0,
        }
        class_label = func.coalesce(
            DevelopmentActivityParcelSummary.development_activity_class,
            "no_activity",
        ).label("activity_class")
        if not no_result_scope:
            class_statement = apply_parcel_where(
                select(class_label, func.count().label("count"))
                .select_from(DevelopmentActivityParcelSummary)
                .group_by(class_label),
            )
            for row in self.db.execute(class_statement).mappings().all():
                if row["activity_class"] in activity_class_counts:
                    activity_class_counts[row["activity_class"]] = row["count"]

        def grouped_count(column) -> list[DevelopmentStatisticsBucket]:
            value_label = func.coalesce(column, "unknown").label("value")
            statement = apply_relationship_where(
                select(
                    value_label,
                    func.count(
                        func.distinct(RealPropertyPermitParcelRelationship.permit_id),
                    ).label("count"),
                )
                .select_from(relationship_from)
                .group_by(value_label)
                .order_by(func.count(func.distinct(RealPropertyPermitParcelRelationship.permit_id)).desc(), value_label),
            )
            return [
                DevelopmentStatisticsBucket(value=row["value"], count=row["count"])
                for row in self.db.execute(statement).mappings().all()
            ]

        return DevelopmentStatisticsRecord(
            total_permits=metrics["total_permits"] or 0,
            parcels_with_activity=parcels_with_activity,
            parcels_without_activity=parcels_without_activity,
            recent_activity_parcels_1yr=recent_1yr,
            recent_activity_parcels_3yr=recent_3yr,
            activity_date_min=metrics["activity_date_min"],
            activity_date_max=metrics["activity_date_max"],
            activity_classes=DevelopmentActivityClassCounts(**activity_class_counts),
            by_permit_type=grouped_count(
                RealPropertyPermitParcelRelationship.permit_type,
            ),
            by_work_type=grouped_count(RealPropertyPermitParcelRelationship.work_type),
            by_status=grouped_count(
                RealPropertyPermitParcelRelationship.permit_status,
            ),
            by_zoning_jurisdiction=grouped_count(
                RealPropertyPermitParcelRelationship.zoning_jurisdiction_name,
            ),
            by_zoning_category=grouped_count(
                RealPropertyPermitParcelRelationship.dominant_zoning_general_normalized,
            ),
        )

    def get_trends(
        self,
        *,
        filters: DevelopmentTrendsFilters,
    ) -> DevelopmentTrendsRecord:
        relationship_from = RealPropertyPermitParcelRelationship.__table__
        predicates = self._trend_predicates(filters)
        where_clause = and_(*predicates) if predicates else None

        def apply_where(statement):
            if where_clause is not None:
                return statement.where(where_clause)
            return statement

        def trend_select(*group_columns):
            return apply_where(
                select(
                    *group_columns,
                    func.count(
                        func.distinct(RealPropertyPermitParcelRelationship.permit_id),
                    ).label("permit_count"),
                    func.count(
                        func.distinct(
                            RealPropertyPermitParcelRelationship.official_parcel_id,
                        ),
                    )
                    .filter(
                        RealPropertyPermitParcelRelationship.has_parcel_match.is_(
                            True,
                        ),
                    )
                    .label("parcel_count"),
                    func.sum(
                        RealPropertyPermitParcelRelationship.permit_amount,
                    ).label("total_permit_amount"),
                ).select_from(relationship_from),
            )

        total_permits = self.db.execute(
            apply_where(
                select(
                    func.count(
                        func.distinct(
                            RealPropertyPermitParcelRelationship.permit_id,
                        ),
                    ),
                ).select_from(relationship_from),
            ),
        ).scalar_one()
        date_bounds = self.db.execute(
            apply_where(
                select(
                    func.min(RealPropertyPermitParcelRelationship.activity_date).label(
                        "activity_date_min",
                    ),
                    func.max(RealPropertyPermitParcelRelationship.activity_date).label(
                        "activity_date_max",
                    ),
                ).select_from(relationship_from),
            ),
        ).mappings().one()

        annual_statement = (
            trend_select(RealPropertyPermitParcelRelationship.activity_year.label("year"))
            .where(RealPropertyPermitParcelRelationship.activity_year.is_not(None))
            .group_by(RealPropertyPermitParcelRelationship.activity_year)
            .order_by(RealPropertyPermitParcelRelationship.activity_year)
        )
        annual_trends = [
            DevelopmentTrendPointRecord(
                permit_count=row["permit_count"],
                parcel_count=row["parcel_count"],
                total_permit_amount=row["total_permit_amount"],
                year=row["year"],
            )
            for row in self.db.execute(annual_statement).mappings().all()
        ]

        monthly_statement = (
            trend_select(
                RealPropertyPermitParcelRelationship.activity_year.label("year"),
                RealPropertyPermitParcelRelationship.activity_month.label("month"),
            )
            .where(
                RealPropertyPermitParcelRelationship.activity_year.is_not(None),
                RealPropertyPermitParcelRelationship.activity_month.is_not(None),
            )
            .group_by(
                RealPropertyPermitParcelRelationship.activity_year,
                RealPropertyPermitParcelRelationship.activity_month,
            )
            .order_by(
                RealPropertyPermitParcelRelationship.activity_year,
                RealPropertyPermitParcelRelationship.activity_month,
            )
        )
        monthly_trends = [
            DevelopmentTrendPointRecord(
                permit_count=row["permit_count"],
                parcel_count=row["parcel_count"],
                total_permit_amount=row["total_permit_amount"],
                month=row["month"],
                year=row["year"],
            )
            for row in self.db.execute(monthly_statement).mappings().all()
        ]

        grouped_trends = self._get_grouped_trends(filters, relationship_from, where_clause)
        rolling_summary = self._get_rolling_summary(filters, relationship_from, where_clause)

        return DevelopmentTrendsRecord(
            activity_date_max=date_bounds["activity_date_max"],
            activity_date_min=date_bounds["activity_date_min"],
            annual_trends=annual_trends,
            grouped_trends=grouped_trends,
            monthly_trends=monthly_trends,
            rolling_summary=rolling_summary,
            total_permits=total_permits or 0,
        )

    def get_hotspots(
        self,
        *,
        filters: DevelopmentHotspotsFilters,
        limit: int,
        offset: int,
        sort_by: str,
    ) -> DevelopmentHotspotsPage:
        predicates = self._hotspot_predicates(filters)
        where_clause = and_(*predicates)

        sort_columns = {
            "development_activity_score": DevelopmentActivityParcelSummary.development_activity_score,
            "recent_permit_count_1yr": DevelopmentActivityParcelSummary.recent_permit_count_1yr,
            "recent_permit_count_3yr": DevelopmentActivityParcelSummary.recent_permit_count_3yr,
            "total_permit_amount": DevelopmentActivityParcelSummary.total_permit_amount,
            "total_permit_count": DevelopmentActivityParcelSummary.total_permit_count,
        }
        sort_column = sort_columns[sort_by]

        total_count = self.db.execute(
            select(func.count())
            .select_from(DevelopmentActivityParcelSummary)
            .where(where_clause),
        ).scalar_one()

        statement = (
            select(
                DevelopmentActivityParcelSummary.official_parcel_id,
                DevelopmentActivityParcelSummary.pin14,
                DevelopmentActivityParcelSummary.subdiv_name.label("subdivision"),
                DevelopmentActivityParcelSummary.nbh_name.label("neighborhood"),
                DevelopmentActivityParcelSummary.zoning_jurisdiction_name,
                DevelopmentActivityParcelSummary.dominant_zoning_code_raw,
                DevelopmentActivityParcelSummary.dominant_zoning_general_normalized,
                DevelopmentActivityParcelSummary.parcel_quality_status,
                DevelopmentActivityParcelSummary.zoning_assignment_confidence,
                DevelopmentActivityParcelSummary.total_permit_count,
                DevelopmentActivityParcelSummary.recent_permit_count_1yr,
                DevelopmentActivityParcelSummary.recent_permit_count_3yr,
                DevelopmentActivityParcelSummary.total_permit_amount,
                DevelopmentActivityParcelSummary.avg_permit_amount,
                DevelopmentActivityParcelSummary.latest_permit_date,
                DevelopmentActivityParcelSummary.dominant_permit_type,
                DevelopmentActivityParcelSummary.dominant_work_type,
                DevelopmentActivityParcelSummary.latest_permit_status,
                DevelopmentActivityParcelSummary.development_activity_score,
                DevelopmentActivityParcelSummary.development_activity_class,
                DevelopmentActivityParcelSummary.has_unmatched_or_ambiguous_permit_flag,
            )
            .select_from(DevelopmentActivityParcelSummary)
            .where(where_clause)
            .order_by(
                sort_column.desc().nulls_last(),
                DevelopmentActivityParcelSummary.total_permit_count.desc().nulls_last(),
                DevelopmentActivityParcelSummary.official_parcel_id,
            )
            .limit(limit)
            .offset(offset)
        )
        results = [
            DevelopmentHotspotRecord(**row)
            for row in self.db.execute(statement).mappings().all()
        ]

        return DevelopmentHotspotsPage(results=results, total_count=total_count)

    def get_zoning_summary(
        self,
        *,
        filters: DevelopmentZoningSummaryFilters,
        limit: int,
        offset: int,
    ) -> DevelopmentZoningSummaryPage:
        relationship_from = self._relationship_from()
        predicates = self._development_zoning_summary_predicates(filters)
        where_clause = and_(*predicates) if predicates else None

        jurisdiction_label = func.coalesce(
            RealPropertyPermitParcelRelationship.zoning_jurisdiction_name,
            "unknown",
        ).label("zoning_jurisdiction_name")
        code_label = func.coalesce(
            RealPropertyPermitParcelRelationship.dominant_zoning_code_raw,
            "unknown",
        ).label("dominant_zoning_code_raw")
        category_label = func.coalesce(
            RealPropertyPermitParcelRelationship.dominant_zoning_general_normalized,
            "unknown",
        ).label("dominant_zoning_general_normalized")
        permit_type_label = func.coalesce(
            RealPropertyPermitParcelRelationship.permit_type,
            "unknown",
        ).label("permit_type")
        work_type_label = func.coalesce(
            RealPropertyPermitParcelRelationship.work_type,
            "unknown",
        ).label("work_type")
        permit_status_label = func.coalesce(
            RealPropertyPermitParcelRelationship.permit_status,
            "unknown",
        ).label("permit_status")
        activity_year_label = (
            RealPropertyPermitParcelRelationship.activity_year.label("activity_year")
            if filters.year is not None
            else literal(None).label("activity_year")
        )
        activity_month_label = (
            RealPropertyPermitParcelRelationship.activity_month.label("activity_month")
            if filters.month is not None
            else literal(None).label("activity_month")
        )
        group_columns = [
            jurisdiction_label,
            code_label,
            category_label,
            permit_type_label,
            work_type_label,
            permit_status_label,
            activity_year_label,
            activity_month_label,
        ]

        def class_count(activity_class: str):
            return func.count(
                func.distinct(DevelopmentActivityParcelSummary.official_parcel_id),
            ).filter(
                DevelopmentActivityParcelSummary.development_activity_class
                == activity_class,
            )

        grouped_statement = (
            select(
                *group_columns,
                func.count(
                    func.distinct(RealPropertyPermitParcelRelationship.permit_id),
                ).label("permit_count"),
                func.count(
                    func.distinct(
                        RealPropertyPermitParcelRelationship.official_parcel_id,
                    ),
                )
                .filter(RealPropertyPermitParcelRelationship.has_parcel_match.is_(True))
                .label("active_parcel_count"),
                func.sum(
                    RealPropertyPermitParcelRelationship.permit_amount,
                ).label("total_permit_amount"),
                func.avg(
                    RealPropertyPermitParcelRelationship.permit_amount,
                ).label("avg_permit_amount"),
                class_count("very_high_activity").label(
                    "very_high_activity_parcel_count",
                ),
                class_count("high_activity").label("high_activity_parcel_count"),
                class_count("moderate_activity").label(
                    "moderate_activity_parcel_count",
                ),
                class_count("low_activity").label("low_activity_parcel_count"),
            )
            .select_from(relationship_from)
            .group_by(*group_columns)
        )
        if where_clause is not None:
            grouped_statement = grouped_statement.where(where_clause)

        grouped_subquery = grouped_statement.subquery()
        total_count = self.db.execute(
            select(func.count()).select_from(grouped_subquery),
        ).scalar_one()

        statement = (
            select(grouped_subquery)
            .order_by(
                grouped_subquery.c.permit_count.desc(),
                grouped_subquery.c.zoning_jurisdiction_name,
                grouped_subquery.c.dominant_zoning_code_raw,
                grouped_subquery.c.permit_type,
                grouped_subquery.c.work_type,
                grouped_subquery.c.permit_status,
            )
            .limit(limit)
            .offset(offset)
        )
        results = [
            DevelopmentZoningSummaryRecord(**row)
            for row in self.db.execute(statement).mappings().all()
        ]

        return DevelopmentZoningSummaryPage(
            results=results,
            total_count=total_count,
        )

    def get_activity_summary(
        self,
        *,
        filters: DevelopmentActivitySummaryFilters,
    ) -> DevelopmentActivitySummaryRecord:
        relationship_from = self._relationship_from()
        predicates = self._activity_summary_predicates(filters)
        where_clause = and_(*predicates) if predicates else None

        def apply_where(statement):
            if where_clause is not None:
                return statement.where(where_clause)
            return statement

        metrics = self.db.execute(
            apply_where(
                select(
                    func.count(
                        func.distinct(
                            RealPropertyPermitParcelRelationship.permit_id,
                        ),
                    ).label("total_permits"),
                    func.count(
                        func.distinct(
                            RealPropertyPermitParcelRelationship.official_parcel_id,
                        ),
                    )
                    .filter(
                        RealPropertyPermitParcelRelationship.has_parcel_match.is_(
                            True,
                        ),
                    )
                    .label("active_parcel_count"),
                    func.sum(
                        RealPropertyPermitParcelRelationship.permit_amount,
                    ).label("total_permit_amount"),
                    func.avg(
                        RealPropertyPermitParcelRelationship.permit_amount,
                    ).label("avg_permit_amount"),
                    func.min(
                        RealPropertyPermitParcelRelationship.activity_date,
                    ).label("activity_date_min"),
                    func.max(
                        RealPropertyPermitParcelRelationship.activity_date,
                    ).label("activity_date_max"),
                ).select_from(relationship_from),
            ),
        ).mappings().one()

        anchor_date = self.db.execute(
            select(func.max(DevelopmentActivityParcelSummary.activity_anchor_date)),
        ).scalar_one()
        recent_1yr_parcels = 0
        recent_3yr_parcels = 0
        if anchor_date is not None:
            recent_1yr_parcels = self.db.execute(
                apply_where(
                    select(
                        func.count(
                            func.distinct(
                                RealPropertyPermitParcelRelationship.official_parcel_id,
                            ),
                        ),
                    )
                    .select_from(relationship_from)
                    .where(
                        RealPropertyPermitParcelRelationship.has_parcel_match.is_(
                            True,
                        ),
                        RealPropertyPermitParcelRelationship.activity_date
                        >= anchor_date - timedelta(days=365),
                    ),
                ),
            ).scalar_one()
            recent_3yr_parcels = self.db.execute(
                apply_where(
                    select(
                        func.count(
                            func.distinct(
                                RealPropertyPermitParcelRelationship.official_parcel_id,
                            ),
                        ),
                    )
                    .select_from(relationship_from)
                    .where(
                        RealPropertyPermitParcelRelationship.has_parcel_match.is_(
                            True,
                        ),
                        RealPropertyPermitParcelRelationship.activity_date
                        >= anchor_date - timedelta(days=365 * 3),
                    ),
                ),
            ).scalar_one()

        def grouped_bucket(column) -> list[DevelopmentActivitySummaryBucketRecord]:
            value_label = func.coalesce(column, "unknown").label("value")
            statement = apply_where(
                select(
                    value_label,
                    func.count(
                        func.distinct(
                            RealPropertyPermitParcelRelationship.permit_id,
                        ),
                    ).label("permit_count"),
                    func.count(
                        func.distinct(
                            RealPropertyPermitParcelRelationship.official_parcel_id,
                        ),
                    )
                    .filter(
                        RealPropertyPermitParcelRelationship.has_parcel_match.is_(
                            True,
                        ),
                    )
                    .label("active_parcel_count"),
                    func.sum(
                        RealPropertyPermitParcelRelationship.permit_amount,
                    ).label("total_permit_amount"),
                )
                .select_from(relationship_from)
                .group_by(value_label)
                .order_by(
                    func.count(
                        func.distinct(
                            RealPropertyPermitParcelRelationship.permit_id,
                        ),
                    ).desc(),
                    value_label,
                ),
            )
            return [
                DevelopmentActivitySummaryBucketRecord(
                    active_parcel_count=row["active_parcel_count"] or 0,
                    permit_count=row["permit_count"] or 0,
                    total_permit_amount=row["total_permit_amount"],
                    value=row["value"],
                )
                for row in self.db.execute(statement).mappings().all()
            ]

        year_statement = apply_where(
            select(
                RealPropertyPermitParcelRelationship.activity_year.label("year"),
                func.count(
                    func.distinct(RealPropertyPermitParcelRelationship.permit_id),
                ).label("permit_count"),
                func.count(
                    func.distinct(
                        RealPropertyPermitParcelRelationship.official_parcel_id,
                    ),
                )
                .filter(RealPropertyPermitParcelRelationship.has_parcel_match.is_(True))
                .label("active_parcel_count"),
                func.sum(
                    RealPropertyPermitParcelRelationship.permit_amount,
                ).label("total_permit_amount"),
            )
            .select_from(relationship_from)
            .where(RealPropertyPermitParcelRelationship.activity_year.is_not(None))
            .group_by(RealPropertyPermitParcelRelationship.activity_year)
            .order_by(RealPropertyPermitParcelRelationship.activity_year),
        )
        by_year = [
            DevelopmentActivityYearBucketRecord(
                active_parcel_count=row["active_parcel_count"] or 0,
                permit_count=row["permit_count"] or 0,
                total_permit_amount=row["total_permit_amount"],
                year=row["year"],
            )
            for row in self.db.execute(year_statement).mappings().all()
        ]

        month_statement = apply_where(
            select(
                RealPropertyPermitParcelRelationship.activity_year.label("year"),
                RealPropertyPermitParcelRelationship.activity_month.label("month"),
                func.count(
                    func.distinct(RealPropertyPermitParcelRelationship.permit_id),
                ).label("permit_count"),
                func.count(
                    func.distinct(
                        RealPropertyPermitParcelRelationship.official_parcel_id,
                    ),
                )
                .filter(RealPropertyPermitParcelRelationship.has_parcel_match.is_(True))
                .label("active_parcel_count"),
                func.sum(
                    RealPropertyPermitParcelRelationship.permit_amount,
                ).label("total_permit_amount"),
            )
            .select_from(relationship_from)
            .where(
                RealPropertyPermitParcelRelationship.activity_year.is_not(None),
                RealPropertyPermitParcelRelationship.activity_month.is_not(None),
            )
            .group_by(
                RealPropertyPermitParcelRelationship.activity_year,
                RealPropertyPermitParcelRelationship.activity_month,
            )
            .order_by(
                RealPropertyPermitParcelRelationship.activity_year,
                RealPropertyPermitParcelRelationship.activity_month,
            ),
        )
        by_month = [
            DevelopmentActivityMonthBucketRecord(
                active_parcel_count=row["active_parcel_count"] or 0,
                month=row["month"],
                permit_count=row["permit_count"] or 0,
                total_permit_amount=row["total_permit_amount"],
                year=row["year"],
            )
            for row in self.db.execute(month_statement).mappings().all()
        ]

        return DevelopmentActivitySummaryRecord(
            active_parcel_count=metrics["active_parcel_count"] or 0,
            activity_date_max=metrics["activity_date_max"],
            activity_date_min=metrics["activity_date_min"],
            avg_permit_amount=metrics["avg_permit_amount"],
            by_activity_class=grouped_bucket(
                DevelopmentActivityParcelSummary.development_activity_class,
            ),
            by_month=by_month,
            by_permit_type=grouped_bucket(
                RealPropertyPermitParcelRelationship.permit_type,
            ),
            by_status=grouped_bucket(
                RealPropertyPermitParcelRelationship.permit_status,
            ),
            by_work_type=grouped_bucket(RealPropertyPermitParcelRelationship.work_type),
            by_year=by_year,
            by_zoning_category=grouped_bucket(
                RealPropertyPermitParcelRelationship.dominant_zoning_general_normalized,
            ),
            by_zoning_jurisdiction=grouped_bucket(
                RealPropertyPermitParcelRelationship.zoning_jurisdiction_name,
            ),
            recent_activity=DevelopmentActivityRecentRecord(
                recent_1yr_parcels=recent_1yr_parcels or 0,
                recent_3yr_parcels=recent_3yr_parcels or 0,
            ),
            total_permit_amount=metrics["total_permit_amount"],
            total_permits=metrics["total_permits"] or 0,
        )

    def temporal_query(
        self,
        *,
        filters: DevelopmentTemporalQueryFilters,
        limit: int,
        offset: int,
    ) -> DevelopmentTemporalQueryPage:
        relationship_from = self._relationship_from()
        base_predicates = self._temporal_query_base_predicates(filters)
        base_where_clause = and_(*base_predicates) if base_predicates else None

        def apply_base_where(statement):
            if base_where_clause is not None:
                return statement.where(base_where_clause)
            return statement

        temporal_filters_requested = any(
            [
                filters.year is not None,
                filters.month is not None,
                filters.date_start is not None,
                filters.date_end is not None,
                filters.rolling_window is not None,
            ],
        )
        defaulted_to_recent_window = not temporal_filters_requested
        effective_start: date | None = None
        effective_end: date | None = None
        mode = "explicit"
        if filters.rolling_window is not None or defaulted_to_recent_window:
            effective_end = self.db.execute(
                apply_base_where(
                    select(
                        func.max(
                            RealPropertyPermitParcelRelationship.activity_date,
                        ),
                    ).select_from(relationship_from),
                ),
            ).scalar_one()
            if effective_end is not None:
                window = filters.rolling_window or 12
                effective_start = subtract_months(effective_end, window)
            mode = (
                "rolling_window"
                if filters.rolling_window is not None
                else "default_recent_12_months"
            )
        elif filters.year is not None and filters.month is not None:
            mode = "year_month"
        elif filters.year is not None:
            mode = "year"
        elif filters.month is not None:
            mode = "month"
        elif filters.date_start is not None or filters.date_end is not None:
            mode = "date_range"

        predicates = self._temporal_query_predicates(
            filters,
            effective_start,
            effective_end,
        )
        where_clause = and_(*predicates) if predicates else None

        def apply_where(statement):
            if where_clause is not None:
                return statement.where(where_clause)
            return statement

        total_count = self.db.execute(
            apply_where(
                select(func.count())
                .select_from(relationship_from),
            ),
        ).scalar_one()

        metrics = self.db.execute(
            apply_where(
                select(
                    func.count(
                        func.distinct(
                            RealPropertyPermitParcelRelationship.permit_id,
                        ),
                    ).label("total_permits"),
                    func.count(
                        func.distinct(
                            RealPropertyPermitParcelRelationship.official_parcel_id,
                        ),
                    )
                    .filter(
                        RealPropertyPermitParcelRelationship.has_parcel_match.is_(
                            True,
                        ),
                    )
                    .label("active_parcel_count"),
                    func.min(
                        RealPropertyPermitParcelRelationship.activity_date,
                    ).label("date_start"),
                    func.max(
                        RealPropertyPermitParcelRelationship.activity_date,
                    ).label("date_end"),
                ).select_from(relationship_from),
            ),
        ).mappings().one()

        def breakdown(column) -> list[DevelopmentActivitySummaryBucketRecord]:
            value_label = func.coalesce(column, "unknown").label("value")
            statement = apply_where(
                select(
                    value_label,
                    func.count(
                        func.distinct(
                            RealPropertyPermitParcelRelationship.permit_id,
                        ),
                    ).label("permit_count"),
                    func.count(
                        func.distinct(
                            RealPropertyPermitParcelRelationship.official_parcel_id,
                        ),
                    )
                    .filter(
                        RealPropertyPermitParcelRelationship.has_parcel_match.is_(
                            True,
                        ),
                    )
                    .label("active_parcel_count"),
                    func.sum(
                        RealPropertyPermitParcelRelationship.permit_amount,
                    ).label("total_permit_amount"),
                )
                .select_from(relationship_from)
                .group_by(value_label)
                .order_by(
                    func.count(
                        func.distinct(
                            RealPropertyPermitParcelRelationship.permit_id,
                        ),
                    ).desc(),
                    value_label,
                ),
            )
            return [
                DevelopmentActivitySummaryBucketRecord(
                    active_parcel_count=row["active_parcel_count"] or 0,
                    permit_count=row["permit_count"] or 0,
                    total_permit_amount=row["total_permit_amount"],
                    value=row["value"],
                )
                for row in self.db.execute(statement).mappings().all()
            ]

        result_statement = (
            apply_where(
                select(
                    RealPropertyPermitParcelRelationship.permit_id,
                    RealPropertyPermitParcelRelationship.permit_number,
                    RealPropertyPermitParcelRelationship.official_parcel_id,
                    RealPropertyPermitParcelRelationship.pin14,
                    RealPropertyPermitParcelRelationship.activity_date,
                    RealPropertyPermitParcelRelationship.activity_year,
                    RealPropertyPermitParcelRelationship.activity_month,
                    RealPropertyPermitParcelRelationship.permit_type,
                    RealPropertyPermitParcelRelationship.work_type,
                    RealPropertyPermitParcelRelationship.permit_status,
                    RealPropertyPermitParcelRelationship.permit_amount,
                    RealPropertyPermitParcelRelationship.zoning_jurisdiction_name,
                    RealPropertyPermitParcelRelationship.dominant_zoning_code_raw,
                    RealPropertyPermitParcelRelationship.dominant_zoning_general_normalized,
                    DevelopmentActivityParcelSummary.development_activity_class,
                    RealPropertyPermitParcelRelationship.relationship_confidence,
                ).select_from(relationship_from),
            )
            .order_by(
                RealPropertyPermitParcelRelationship.activity_date.desc().nulls_last(),
                RealPropertyPermitParcelRelationship.permit_id,
                RealPropertyPermitParcelRelationship.official_parcel_id,
            )
            .limit(limit)
            .offset(offset)
        )
        results = [
            DevelopmentTemporalQueryResultRecord(**row)
            for row in self.db.execute(result_statement).mappings().all()
        ]

        return DevelopmentTemporalQueryPage(
            results=results,
            summary=DevelopmentTemporalQuerySummaryRecord(
                active_parcel_count=metrics["active_parcel_count"] or 0,
                date_end=metrics["date_end"],
                date_start=metrics["date_start"],
                permit_type_breakdown=breakdown(
                    RealPropertyPermitParcelRelationship.permit_type,
                ),
                total_permits=metrics["total_permits"] or 0,
                work_type_breakdown=breakdown(
                    RealPropertyPermitParcelRelationship.work_type,
                ),
                zoning_jurisdiction_breakdown=breakdown(
                    RealPropertyPermitParcelRelationship.zoning_jurisdiction_name,
                ),
            ),
            temporal_context=DevelopmentTemporalContextRecord(
                date_end=effective_end or filters.date_end,
                date_start=effective_start or filters.date_start,
                defaulted_to_recent_window=defaulted_to_recent_window,
                mode=mode,
                month=filters.month,
                rolling_window=filters.rolling_window
                or (12 if defaulted_to_recent_window else None),
                year=filters.year,
            ),
            total_count=total_count or 0,
        )

    def get_permit_types(self) -> list[DevelopmentLookupRecord]:
        return self._relationship_lookup(
            RealPropertyPermitParcelRelationship.permit_type,
        )

    def get_work_types(self) -> list[DevelopmentLookupRecord]:
        return self._relationship_lookup(
            RealPropertyPermitParcelRelationship.work_type,
        )

    def get_jurisdictions(self) -> list[DevelopmentLookupRecord]:
        return self._relationship_lookup(
            RealPropertyPermitParcelRelationship.zoning_jurisdiction_name,
        )

    def get_activity_classes(self) -> list[DevelopmentLookupRecord]:
        value_label = func.btrim(
            DevelopmentActivityParcelSummary.development_activity_class,
        ).label("value")
        statement = (
            select(
                value_label,
                func.count().label("count"),
            )
            .select_from(DevelopmentActivityParcelSummary)
            .where(
                DevelopmentActivityParcelSummary.development_activity_class.is_not(
                    None,
                ),
                func.btrim(
                    DevelopmentActivityParcelSummary.development_activity_class,
                )
                != "",
            )
            .group_by(value_label)
            .order_by(func.count().desc(), value_label)
        )
        return [
            DevelopmentLookupRecord(count=row["count"], value=row["value"])
            for row in self.db.execute(statement).mappings().all()
        ]

    def _relationship_lookup(self, column) -> list[DevelopmentLookupRecord]:
        value_label = func.btrim(column).label("value")
        count_label = func.count(
            func.distinct(RealPropertyPermitParcelRelationship.permit_id),
        ).label("count")
        statement = (
            select(value_label, count_label)
            .select_from(RealPropertyPermitParcelRelationship)
            .where(column.is_not(None), func.btrim(column) != "")
            .group_by(value_label)
            .order_by(count_label.desc(), value_label)
        )
        return [
            DevelopmentLookupRecord(count=row["count"], value=row["value"])
            for row in self.db.execute(statement).mappings().all()
        ]

    def _get_grouped_trends(
        self,
        filters: DevelopmentTrendsFilters,
        relationship_from,
        where_clause,
    ) -> list[DevelopmentTrendPointRecord]:
        if filters.group_by is None:
            return []

        group_map = {
            "year": (
                RealPropertyPermitParcelRelationship.activity_year.label("year"),
                "year",
            ),
            "month": (
                RealPropertyPermitParcelRelationship.activity_month.label("month"),
                "month",
            ),
            "permit_type": (
                func.coalesce(
                    RealPropertyPermitParcelRelationship.permit_type,
                    "unknown",
                ).label("permit_type"),
                "permit_type",
            ),
            "work_type": (
                func.coalesce(
                    RealPropertyPermitParcelRelationship.work_type,
                    "unknown",
                ).label("work_type"),
                "work_type",
            ),
            "zoning_jurisdiction": (
                func.coalesce(
                    RealPropertyPermitParcelRelationship.zoning_jurisdiction_name,
                    "unknown",
                ).label("zoning_jurisdiction_name"),
                "zoning_jurisdiction_name",
            ),
            "zoning_category": (
                func.coalesce(
                    RealPropertyPermitParcelRelationship.dominant_zoning_general_normalized,
                    "unknown",
                ).label("zoning_category"),
                "zoning_category",
            ),
        }
        group_column, field_name = group_map[filters.group_by]

        statement = select(
            group_column,
            func.count(
                func.distinct(RealPropertyPermitParcelRelationship.permit_id),
            ).label("permit_count"),
            func.count(
                func.distinct(
                    RealPropertyPermitParcelRelationship.official_parcel_id,
                ),
            )
            .filter(RealPropertyPermitParcelRelationship.has_parcel_match.is_(True))
            .label("parcel_count"),
            func.sum(RealPropertyPermitParcelRelationship.permit_amount).label(
                "total_permit_amount",
            ),
        ).select_from(relationship_from)
        if where_clause is not None:
            statement = statement.where(where_clause)
        if filters.group_by in {"year", "month"}:
            statement = statement.where(group_column.is_not(None))

        statement = (
            statement.group_by(group_column)
            .order_by(group_column)
            if filters.group_by in {"year", "month"}
            else statement.group_by(group_column).order_by(
                func.count(
                    func.distinct(RealPropertyPermitParcelRelationship.permit_id),
                ).desc(),
                group_column,
            )
        )

        results = []
        for row in self.db.execute(statement).mappings().all():
            kwargs = {field_name: row[field_name]}
            results.append(
                DevelopmentTrendPointRecord(
                    permit_count=row["permit_count"],
                    parcel_count=row["parcel_count"],
                    total_permit_amount=row["total_permit_amount"],
                    **kwargs,
                ),
            )
        return results

    def _get_rolling_summary(
        self,
        filters: DevelopmentTrendsFilters,
        relationship_from,
        where_clause,
    ) -> DevelopmentRollingSummaryRecord | None:
        if filters.rolling_window is None:
            return None

        max_date_statement = select(
            func.max(RealPropertyPermitParcelRelationship.activity_date),
        ).select_from(relationship_from)
        if where_clause is not None:
            max_date_statement = max_date_statement.where(where_clause)

        end_date = self.db.execute(max_date_statement).scalar_one()
        if end_date is None:
            return None

        start_date = subtract_months(end_date, filters.rolling_window)
        rolling_statement = select(
            func.count(
                func.distinct(RealPropertyPermitParcelRelationship.permit_id),
            ).label("permit_count"),
            func.count(
                func.distinct(
                    RealPropertyPermitParcelRelationship.official_parcel_id,
                ),
            )
            .filter(RealPropertyPermitParcelRelationship.has_parcel_match.is_(True))
            .label("parcel_count"),
            func.sum(RealPropertyPermitParcelRelationship.permit_amount).label(
                "total_permit_amount",
            ),
        ).select_from(relationship_from)
        if where_clause is not None:
            rolling_statement = rolling_statement.where(where_clause)
        rolling_statement = rolling_statement.where(
            RealPropertyPermitParcelRelationship.activity_date >= start_date,
            RealPropertyPermitParcelRelationship.activity_date <= end_date,
        )
        row = self.db.execute(rolling_statement).mappings().one()

        return DevelopmentRollingSummaryRecord(
            end_date=end_date,
            parcel_count=row["parcel_count"] or 0,
            permit_count=row["permit_count"] or 0,
            start_date=start_date,
            total_permit_amount=row["total_permit_amount"],
            window_months=filters.rolling_window,
        )


def subtract_months(value: date, months: int) -> date:
    month_index = value.month - 1 - months
    year = value.year + month_index // 12
    month = month_index % 12 + 1
    day = min(value.day, days_in_month(year, month))
    return date(year, month, day)


def days_in_month(year: int, month: int) -> int:
    if month == 12:
        next_month = date(year + 1, 1, 1)
    else:
        next_month = date(year, month + 1, 1)
    return (next_month - date(year, month, 1)).days
