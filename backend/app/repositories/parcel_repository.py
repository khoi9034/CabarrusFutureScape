from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal

from sqlalchemy import and_, case, func, or_, select
from sqlalchemy.orm import Session

from app.models import (
    ParcelEnriched,
    ParcelZoningIntelligenceQA,
    ParcelZoningOverlayV2,
)


@dataclass(frozen=True)
class ParcelDetailRecord:
    official_parcel_id: str
    pin14: str | None
    objectid_1: int | None
    subdivision: str | None
    neighborhood: str | None
    marketvalue_numeric: Decimal | None
    assessedvalue_numeric: Decimal | None
    valuation_band: str | None
    parcel_size_category: str | None
    parcel_quality_status: str | None
    zoning_jurisdiction_name: str | None
    dominant_zoning_code_raw: str | None
    dominant_zoning_general_normalized: str | None
    zoning_assignment_confidence: str | None
    governance_warning_categories: list[str] | None
    safe_for_dashboard: bool | None
    planning_jurisdiction: str | None
    transformed_at: datetime | None


@dataclass(frozen=True)
class ParcelSearchFilters:
    parcel_quality_status: str | None = None
    safe_for_dashboard: bool | None = None
    valuation_band: str | None = None
    zoning_category: str | None = None
    zoning_confidence: str | None = None
    zoning_jurisdiction: str | None = None


@dataclass(frozen=True)
class ParcelSearchRecord:
    official_parcel_id: str
    pin14: str | None
    subdivision: str | None
    neighborhood: str | None
    owner_display: str | None
    mailing_city: str | None
    mailing_state: str | None
    zoning_jurisdiction_name: str | None
    dominant_zoning_code_raw: str | None
    dominant_zoning_general_normalized: str | None
    zoning_assignment_confidence: str | None
    parcel_quality_status: str | None
    valuation_band: str | None
    safe_for_dashboard: bool | None
    governance_warning_categories: list[str] | None


@dataclass(frozen=True)
class ParcelSearchPage:
    results: list[ParcelSearchRecord]
    total_count: int


@dataclass(frozen=True)
class ParcelFilterFilters:
    governance_warning: str | None = None
    neighborhood: str | None = None
    parcel_quality_status: str | None = None
    parcel_size_category: str | None = None
    safe_for_dashboard: bool | None = None
    subdivision: str | None = None
    valuation_band: str | None = None
    zoning_category: str | None = None
    zoning_code: str | None = None
    zoning_confidence: str | None = None
    zoning_jurisdiction: str | None = None


@dataclass(frozen=True)
class ParcelFilterRecord:
    official_parcel_id: str
    pin14: str | None
    subdivision: str | None
    neighborhood: str | None
    zoning_jurisdiction_name: str | None
    dominant_zoning_code_raw: str | None
    dominant_zoning_general_normalized: str | None
    zoning_assignment_confidence: str | None
    parcel_quality_status: str | None
    valuation_band: str | None
    parcel_size_category: str | None
    safe_for_dashboard: bool | None
    governance_warning_categories: list[str] | None


@dataclass(frozen=True)
class ParcelFilterPage:
    results: list[ParcelFilterRecord]
    total_count: int


@dataclass(frozen=True)
class ParcelStatisticsFilters:
    parcel_quality_status: str | None = None
    safe_for_dashboard: bool | None = None
    valuation_band: str | None = None
    zoning_category: str | None = None
    zoning_confidence: str | None = None
    zoning_jurisdiction: str | None = None


@dataclass(frozen=True)
class ParcelStatisticsBucket:
    value: str
    count: int


@dataclass(frozen=True)
class ParcelStatisticsRecord:
    total_parcels: int
    zoned_parcels: int
    no_match_parcels: int
    safe_for_dashboard_parcels: int
    review_parcels: int
    high_confidence_parcels: int
    low_confidence_parcels: int
    multi_jurisdiction_parcels: int
    by_zoning_jurisdiction: list[ParcelStatisticsBucket]
    by_zoning_category: list[ParcelStatisticsBucket]
    by_parcel_quality_status: list[ParcelStatisticsBucket]
    by_valuation_band: list[ParcelStatisticsBucket]
    by_governance_warning: list[ParcelStatisticsBucket]


@dataclass(frozen=True)
class ParcelZoningSummaryFilters:
    parcel_quality_status: str | None = None
    safe_for_dashboard: bool | None = None
    zoning_category: str | None = None
    zoning_code: str | None = None
    zoning_confidence: str | None = None
    zoning_jurisdiction: str | None = None


@dataclass(frozen=True)
class ParcelZoningJurisdictionSummaryRecord:
    zoning_jurisdiction_name: str
    parcel_count: int
    high_confidence_count: int
    review_count: int
    safe_for_dashboard_count: int


@dataclass(frozen=True)
class ParcelZoningCodeSummaryRecord:
    zoning_jurisdiction_name: str
    zoning_code: str
    zoning_category: str
    parcel_count: int
    review_count: int


@dataclass(frozen=True)
class ParcelZoningCategorySummaryRecord:
    zoning_category: str
    parcel_count: int


@dataclass(frozen=True)
class ParcelZoningConfidenceSummaryRecord:
    confidence: str
    parcel_count: int


@dataclass(frozen=True)
class ParcelGovernanceWarningSummaryRecord:
    governance_warning: str
    parcel_count: int


@dataclass(frozen=True)
class ParcelZoningSummaryRecord:
    total_parcels: int
    zoned_parcels: int
    no_match_parcels: int
    multi_jurisdiction_count: int
    jurisdiction_summary: list[ParcelZoningJurisdictionSummaryRecord]
    zoning_code_summary: list[ParcelZoningCodeSummaryRecord]
    zoning_category_summary: list[ParcelZoningCategorySummaryRecord]
    confidence_summary: list[ParcelZoningConfidenceSummaryRecord]
    governance_warning_summary: list[ParcelGovernanceWarningSummaryRecord]


@dataclass(frozen=True)
class ParcelGovernanceWarningsFilters:
    parcel_quality_status: str | None = None
    safe_for_dashboard: bool | None = None
    warning_category: str | None = None
    zoning_category: str | None = None
    zoning_confidence: str | None = None
    zoning_jurisdiction: str | None = None


@dataclass(frozen=True)
class ParcelGovernanceWarningsResultRecord:
    official_parcel_id: str
    pin14: str | None
    subdivision: str | None
    neighborhood: str | None
    zoning_jurisdiction_name: str | None
    dominant_zoning_code_raw: str | None
    dominant_zoning_general_normalized: str | None
    zoning_assignment_confidence: str | None
    parcel_quality_status: str | None
    valuation_band: str | None
    safe_for_dashboard: bool | None
    governance_warning_categories: list[str] | None


@dataclass(frozen=True)
class ParcelGovernanceWarningsSummaryRecord:
    warning_category: str
    parcel_count: int


@dataclass(frozen=True)
class ParcelGovernanceWarningsPage:
    filters_default_to_review: bool
    results: list[ParcelGovernanceWarningsResultRecord]
    total_count: int
    warning_summary: list[ParcelGovernanceWarningsSummaryRecord]


def escape_like(value: str) -> str:
    return (
        value.replace("\\", "\\\\")
        .replace("%", "\\%")
        .replace("_", "\\_")
    )


class ParcelRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def _base_from(self):
        return (
            ParcelEnriched.__table__
            .outerjoin(
                ParcelZoningOverlayV2.__table__,
                ParcelZoningOverlayV2.official_parcel_id
                == ParcelEnriched.official_parcel_id,
            )
            .outerjoin(
                ParcelZoningIntelligenceQA.__table__,
                ParcelZoningIntelligenceQA.official_parcel_id
                == ParcelEnriched.official_parcel_id,
            )
        )

    def _statistics_predicates(
        self,
        filters: ParcelStatisticsFilters,
    ):
        predicates = []

        if filters.zoning_jurisdiction:
            predicates.append(
                func.lower(ParcelZoningOverlayV2.zoning_jurisdiction_name)
                == filters.zoning_jurisdiction.lower(),
            )
        if filters.zoning_category:
            predicates.append(
                func.lower(ParcelZoningOverlayV2.dominant_zoning_general_normalized)
                == filters.zoning_category.lower(),
            )
        if filters.parcel_quality_status:
            predicates.append(
                func.lower(ParcelEnriched.parcel_quality_status)
                == filters.parcel_quality_status.lower(),
            )
        if filters.zoning_confidence:
            predicates.append(
                func.lower(ParcelZoningOverlayV2.zoning_assignment_confidence)
                == filters.zoning_confidence.lower(),
            )
        if filters.valuation_band:
            predicates.append(
                func.lower(ParcelEnriched.valuation_band)
                == filters.valuation_band.lower(),
            )
        if filters.safe_for_dashboard is not None:
            predicates.append(
                ParcelZoningIntelligenceQA.safe_for_dashboard
                == filters.safe_for_dashboard,
            )

        return predicates

    def _zoning_summary_predicates(
        self,
        filters: ParcelZoningSummaryFilters,
    ):
        predicates = []

        if filters.zoning_jurisdiction:
            predicates.append(
                func.lower(ParcelZoningOverlayV2.zoning_jurisdiction_name)
                == filters.zoning_jurisdiction.lower(),
            )
        if filters.zoning_category:
            predicates.append(
                func.lower(ParcelZoningOverlayV2.dominant_zoning_general_normalized)
                == filters.zoning_category.lower(),
            )
        if filters.zoning_code:
            predicates.append(
                func.lower(ParcelZoningOverlayV2.dominant_zoning_code_raw)
                == filters.zoning_code.lower(),
            )
        if filters.parcel_quality_status:
            predicates.append(
                func.lower(ParcelEnriched.parcel_quality_status)
                == filters.parcel_quality_status.lower(),
            )
        if filters.zoning_confidence:
            predicates.append(
                func.lower(ParcelZoningOverlayV2.zoning_assignment_confidence)
                == filters.zoning_confidence.lower(),
            )
        if filters.safe_for_dashboard is not None:
            predicates.append(
                ParcelZoningIntelligenceQA.safe_for_dashboard
                == filters.safe_for_dashboard,
            )

        return predicates

    def _governance_warning_predicates(
        self,
        filters: ParcelGovernanceWarningsFilters,
    ):
        predicates = []

        if filters.warning_category:
            predicates.append(
                ParcelZoningIntelligenceQA.governance_warning_categories.any(
                    filters.warning_category.lower(),
                ),
            )
        if filters.zoning_jurisdiction:
            predicates.append(
                func.lower(ParcelZoningOverlayV2.zoning_jurisdiction_name)
                == filters.zoning_jurisdiction.lower(),
            )
        if filters.zoning_category:
            predicates.append(
                func.lower(ParcelZoningOverlayV2.dominant_zoning_general_normalized)
                == filters.zoning_category.lower(),
            )
        if filters.parcel_quality_status:
            predicates.append(
                func.lower(ParcelEnriched.parcel_quality_status)
                == filters.parcel_quality_status.lower(),
            )
        if filters.zoning_confidence:
            predicates.append(
                func.lower(ParcelZoningOverlayV2.zoning_assignment_confidence)
                == filters.zoning_confidence.lower(),
            )
        if filters.safe_for_dashboard is not None:
            predicates.append(
                ParcelZoningIntelligenceQA.safe_for_dashboard
                == filters.safe_for_dashboard,
            )
        elif filters.warning_category is None:
            # This endpoint defaults to the governance review lane. Explicit
            # safe_for_dashboard or warning_category filters can widen/scope it.
            predicates.append(ParcelZoningIntelligenceQA.safe_for_dashboard.is_(False))

        return predicates

    def get_by_official_parcel_id(
        self,
        official_parcel_id: str,
    ) -> ParcelDetailRecord | None:
        statement = (
            select(
                ParcelEnriched.official_parcel_id,
                ParcelEnriched.pin14,
                ParcelEnriched.objectid_1,
                ParcelEnriched.subdiv_name.label("subdivision"),
                ParcelEnriched.nbh_name.label("neighborhood"),
                ParcelEnriched.marketvalue_numeric,
                ParcelEnriched.assessedvalue_numeric,
                ParcelEnriched.valuation_band,
                ParcelEnriched.parcel_size_category,
                ParcelEnriched.parcel_quality_status,
                ParcelZoningOverlayV2.zoning_jurisdiction_name,
                ParcelZoningOverlayV2.dominant_zoning_code_raw,
                ParcelZoningOverlayV2.dominant_zoning_general_normalized,
                ParcelZoningOverlayV2.zoning_assignment_confidence,
                ParcelZoningIntelligenceQA.governance_warning_categories,
                ParcelZoningIntelligenceQA.safe_for_dashboard,
                ParcelZoningOverlayV2.planning_jurisdiction_name.label(
                    "planning_jurisdiction",
                ),
                ParcelEnriched.transformed_at,
            )
            .outerjoin(
                ParcelZoningOverlayV2,
                ParcelZoningOverlayV2.official_parcel_id
                == ParcelEnriched.official_parcel_id,
            )
            .outerjoin(
                ParcelZoningIntelligenceQA,
                ParcelZoningIntelligenceQA.official_parcel_id
                == ParcelEnriched.official_parcel_id,
            )
            .where(ParcelEnriched.official_parcel_id == official_parcel_id)
            .limit(1)
        )

        row = self.db.execute(statement).mappings().first()
        return ParcelDetailRecord(**row) if row else None

    def search_parcels(
        self,
        query: str,
        *,
        filters: ParcelSearchFilters,
        limit: int,
        offset: int,
    ) -> ParcelSearchPage:
        normalized_query = query.lower()
        like_pattern = f"%{escape_like(normalized_query)}%"
        prefix_pattern = f"{escape_like(normalized_query)}%"

        searchable_columns = [
            ParcelEnriched.official_parcel_id,
            ParcelEnriched.pin14,
            ParcelEnriched.acctname1,
            ParcelEnriched.acctname2,
            ParcelEnriched.mailaddr1,
            ParcelEnriched.mailaddr2,
            ParcelEnriched.mailcity,
            ParcelEnriched.mailstate,
            ParcelEnriched.mailzipcode,
            ParcelEnriched.subdiv_name,
            ParcelEnriched.nbh_name,
            ParcelZoningOverlayV2.dominant_zoning_code_raw,
            ParcelZoningOverlayV2.zoning_jurisdiction_name,
            ParcelZoningOverlayV2.dominant_zoning_general_normalized,
            ParcelZoningOverlayV2.planning_jurisdiction_name,
        ]

        search_predicate = or_(
            *[
                func.lower(func.coalesce(column, "")).like(
                    like_pattern,
                    escape="\\",
                )
                for column in searchable_columns
            ],
        )

        predicates = [search_predicate]

        if filters.zoning_jurisdiction:
            predicates.append(
                func.lower(ParcelZoningOverlayV2.zoning_jurisdiction_name)
                == filters.zoning_jurisdiction.lower(),
            )
        if filters.zoning_category:
            predicates.append(
                func.lower(ParcelZoningOverlayV2.dominant_zoning_general_normalized)
                == filters.zoning_category.lower(),
            )
        if filters.parcel_quality_status:
            predicates.append(
                func.lower(ParcelEnriched.parcel_quality_status)
                == filters.parcel_quality_status.lower(),
            )
        if filters.zoning_confidence:
            predicates.append(
                func.lower(ParcelZoningOverlayV2.zoning_assignment_confidence)
                == filters.zoning_confidence.lower(),
            )
        if filters.valuation_band:
            predicates.append(
                func.lower(ParcelEnriched.valuation_band)
                == filters.valuation_band.lower(),
            )
        if filters.safe_for_dashboard is not None:
            predicates.append(
                ParcelZoningIntelligenceQA.safe_for_dashboard
                == filters.safe_for_dashboard,
            )

        where_clause = and_(*predicates)
        owner_display = func.coalesce(
            func.nullif(ParcelEnriched.acctname1, ""),
            func.nullif(ParcelEnriched.acctname2, ""),
        ).label("owner_display")

        relevance_rank = case(
            (
                func.lower(ParcelEnriched.official_parcel_id)
                == normalized_query,
                1,
            ),
            (func.lower(ParcelEnriched.pin14) == normalized_query, 2),
            (
                func.lower(func.coalesce(ParcelEnriched.pin14, "")).like(
                    prefix_pattern,
                    escape="\\",
                ),
                3,
            ),
            (
                or_(
                    func.lower(func.coalesce(ParcelEnriched.acctname1, "")).like(
                        like_pattern,
                        escape="\\",
                    ),
                    func.lower(func.coalesce(ParcelEnriched.acctname2, "")).like(
                        like_pattern,
                        escape="\\",
                    ),
                ),
                4,
            ),
            (
                or_(
                    func.lower(func.coalesce(ParcelEnriched.subdiv_name, "")).like(
                        like_pattern,
                        escape="\\",
                    ),
                    func.lower(func.coalesce(ParcelEnriched.nbh_name, "")).like(
                        like_pattern,
                        escape="\\",
                    ),
                ),
                5,
            ),
            else_=6,
        ).label("relevance_rank")

        base_from = self._base_from()

        total_count = self.db.execute(
            select(func.count())
            .select_from(base_from)
            .where(where_clause),
        ).scalar_one()

        statement = (
            select(
                ParcelEnriched.official_parcel_id,
                ParcelEnriched.pin14,
                ParcelEnriched.subdiv_name.label("subdivision"),
                ParcelEnriched.nbh_name.label("neighborhood"),
                owner_display,
                ParcelEnriched.mailcity.label("mailing_city"),
                ParcelEnriched.mailstate.label("mailing_state"),
                ParcelZoningOverlayV2.zoning_jurisdiction_name,
                ParcelZoningOverlayV2.dominant_zoning_code_raw,
                ParcelZoningOverlayV2.dominant_zoning_general_normalized,
                ParcelZoningOverlayV2.zoning_assignment_confidence,
                ParcelEnriched.parcel_quality_status,
                ParcelEnriched.valuation_band,
                ParcelZoningIntelligenceQA.safe_for_dashboard,
                ParcelZoningIntelligenceQA.governance_warning_categories,
                relevance_rank,
            )
            .select_from(base_from)
            .where(where_clause)
            .order_by(
                relevance_rank,
                ParcelZoningIntelligenceQA.safe_for_dashboard.desc().nullslast(),
                ParcelEnriched.official_parcel_id,
            )
            .limit(limit)
            .offset(offset)
        )

        rows = self.db.execute(statement).mappings().all()
        return ParcelSearchPage(
            results=[
                ParcelSearchRecord(
                    official_parcel_id=row["official_parcel_id"],
                    pin14=row["pin14"],
                    subdivision=row["subdivision"],
                    neighborhood=row["neighborhood"],
                    owner_display=row["owner_display"],
                    mailing_city=row["mailing_city"],
                    mailing_state=row["mailing_state"],
                    zoning_jurisdiction_name=row["zoning_jurisdiction_name"],
                    dominant_zoning_code_raw=row["dominant_zoning_code_raw"],
                    dominant_zoning_general_normalized=row[
                        "dominant_zoning_general_normalized"
                    ],
                    zoning_assignment_confidence=row[
                        "zoning_assignment_confidence"
                    ],
                    parcel_quality_status=row["parcel_quality_status"],
                    valuation_band=row["valuation_band"],
                    safe_for_dashboard=row["safe_for_dashboard"],
                    governance_warning_categories=row[
                        "governance_warning_categories"
                    ],
                )
                for row in rows
            ],
            total_count=total_count,
        )

    def filter_parcels(
        self,
        *,
        filters: ParcelFilterFilters,
        limit: int,
        offset: int,
    ) -> ParcelFilterPage:
        """Filter parcel intelligence rows using SQLAlchemy-bound parameters only."""

        predicates = []

        if filters.zoning_jurisdiction:
            predicates.append(
                func.lower(ParcelZoningOverlayV2.zoning_jurisdiction_name)
                == filters.zoning_jurisdiction.lower(),
            )
        if filters.zoning_category:
            predicates.append(
                func.lower(ParcelZoningOverlayV2.dominant_zoning_general_normalized)
                == filters.zoning_category.lower(),
            )
        if filters.zoning_code:
            predicates.append(
                func.lower(ParcelZoningOverlayV2.dominant_zoning_code_raw)
                == filters.zoning_code.lower(),
            )
        if filters.parcel_quality_status:
            predicates.append(
                func.lower(ParcelEnriched.parcel_quality_status)
                == filters.parcel_quality_status.lower(),
            )
        if filters.zoning_confidence:
            predicates.append(
                func.lower(ParcelZoningOverlayV2.zoning_assignment_confidence)
                == filters.zoning_confidence.lower(),
            )
        if filters.valuation_band:
            predicates.append(
                func.lower(ParcelEnriched.valuation_band)
                == filters.valuation_band.lower(),
            )
        if filters.parcel_size_category:
            predicates.append(
                func.lower(ParcelEnriched.parcel_size_category)
                == filters.parcel_size_category.lower(),
            )
        if filters.safe_for_dashboard is not None:
            predicates.append(
                ParcelZoningIntelligenceQA.safe_for_dashboard
                == filters.safe_for_dashboard,
            )
        if filters.governance_warning:
            predicates.append(
                ParcelZoningIntelligenceQA.governance_warning_categories.any(
                    filters.governance_warning.lower(),
                ),
            )
        if filters.subdivision:
            predicates.append(
                func.lower(func.coalesce(ParcelEnriched.subdiv_name, "")).like(
                    f"%{escape_like(filters.subdivision.lower())}%",
                    escape="\\",
                ),
            )
        if filters.neighborhood:
            predicates.append(
                func.lower(func.coalesce(ParcelEnriched.nbh_name, "")).like(
                    f"%{escape_like(filters.neighborhood.lower())}%",
                    escape="\\",
                ),
            )

        base_from = self._base_from()

        where_clause = and_(*predicates) if predicates else None

        count_statement = select(func.count()).select_from(base_from)
        if where_clause is not None:
            count_statement = count_statement.where(where_clause)

        total_count = self.db.execute(count_statement).scalar_one()

        statement = (
            select(
                ParcelEnriched.official_parcel_id,
                ParcelEnriched.pin14,
                ParcelEnriched.subdiv_name.label("subdivision"),
                ParcelEnriched.nbh_name.label("neighborhood"),
                ParcelZoningOverlayV2.zoning_jurisdiction_name,
                ParcelZoningOverlayV2.dominant_zoning_code_raw,
                ParcelZoningOverlayV2.dominant_zoning_general_normalized,
                ParcelZoningOverlayV2.zoning_assignment_confidence,
                ParcelEnriched.parcel_quality_status,
                ParcelEnriched.valuation_band,
                ParcelEnriched.parcel_size_category,
                ParcelZoningIntelligenceQA.safe_for_dashboard,
                ParcelZoningIntelligenceQA.governance_warning_categories,
            )
            .select_from(base_from)
            .order_by(ParcelEnriched.official_parcel_id)
            .limit(limit)
            .offset(offset)
        )
        if where_clause is not None:
            statement = statement.where(where_clause)

        rows = self.db.execute(statement).mappings().all()
        return ParcelFilterPage(
            results=[
                ParcelFilterRecord(
                    official_parcel_id=row["official_parcel_id"],
                    pin14=row["pin14"],
                    subdivision=row["subdivision"],
                    neighborhood=row["neighborhood"],
                    zoning_jurisdiction_name=row["zoning_jurisdiction_name"],
                    dominant_zoning_code_raw=row["dominant_zoning_code_raw"],
                    dominant_zoning_general_normalized=row[
                        "dominant_zoning_general_normalized"
                    ],
                    zoning_assignment_confidence=row[
                        "zoning_assignment_confidence"
                    ],
                    parcel_quality_status=row["parcel_quality_status"],
                    valuation_band=row["valuation_band"],
                    parcel_size_category=row["parcel_size_category"],
                    safe_for_dashboard=row["safe_for_dashboard"],
                    governance_warning_categories=row[
                        "governance_warning_categories"
                    ],
                )
                for row in rows
            ],
            total_count=total_count,
        )

    def get_statistics(
        self,
        *,
        filters: ParcelStatisticsFilters,
    ) -> ParcelStatisticsRecord:
        base_from = self._base_from()
        predicates = self._statistics_predicates(filters)
        where_clause = and_(*predicates) if predicates else None

        def apply_where(statement):
            return statement.where(where_clause) if where_clause is not None else statement

        metrics_statement = apply_where(
            select(
                func.count().label("total_parcels"),
                func.count()
                .filter(ParcelZoningOverlayV2.has_no_zoning_match.is_(False))
                .label("zoned_parcels"),
                func.count()
                .filter(ParcelZoningOverlayV2.has_no_zoning_match.is_(True))
                .label("no_match_parcels"),
                func.count()
                .filter(ParcelZoningIntelligenceQA.safe_for_dashboard.is_(True))
                .label("safe_for_dashboard_parcels"),
                func.count()
                .filter(ParcelZoningIntelligenceQA.safe_for_dashboard.is_(False))
                .label("review_parcels"),
                func.count()
                .filter(ParcelZoningOverlayV2.zoning_assignment_confidence == "high")
                .label("high_confidence_parcels"),
                func.count()
                .filter(ParcelZoningOverlayV2.zoning_assignment_confidence == "low")
                .label("low_confidence_parcels"),
                func.count()
                .filter(ParcelZoningOverlayV2.has_multiple_zoning_jurisdictions.is_(True))
                .label("multi_jurisdiction_parcels"),
            ).select_from(base_from),
        )
        metrics = self.db.execute(metrics_statement).mappings().one()

        def grouped_count(column) -> list[ParcelStatisticsBucket]:
            value_label = func.coalesce(column, "unknown").label("value")
            statement = apply_where(
                select(value_label, func.count().label("count"))
                .select_from(base_from)
                .group_by(value_label)
                .order_by(func.count().desc(), value_label),
            )
            return [
                ParcelStatisticsBucket(
                    value=row["value"],
                    count=row["count"],
                )
                for row in self.db.execute(statement).mappings().all()
            ]

        warning_subquery_statement = apply_where(
            select(
                ParcelEnriched.official_parcel_id,
                ParcelZoningIntelligenceQA.governance_warning_categories,
            ).select_from(base_from),
        )
        warning_subquery = warning_subquery_statement.subquery()
        warning_value = func.unnest(
            warning_subquery.c.governance_warning_categories,
        ).label("value")
        warning_expansion = select(warning_value).subquery()
        warning_statement = (
            select(
                warning_expansion.c.value,
                func.count().label("count"),
            )
            .where(warning_expansion.c.value.is_not(None))
            .group_by(warning_expansion.c.value)
            .order_by(func.count().desc(), warning_expansion.c.value)
        )
        by_governance_warning = [
            ParcelStatisticsBucket(
                value=row["value"],
                count=row["count"],
            )
            for row in self.db.execute(warning_statement).mappings().all()
        ]

        return ParcelStatisticsRecord(
            total_parcels=metrics["total_parcels"],
            zoned_parcels=metrics["zoned_parcels"],
            no_match_parcels=metrics["no_match_parcels"],
            safe_for_dashboard_parcels=metrics["safe_for_dashboard_parcels"],
            review_parcels=metrics["review_parcels"],
            high_confidence_parcels=metrics["high_confidence_parcels"],
            low_confidence_parcels=metrics["low_confidence_parcels"],
            multi_jurisdiction_parcels=metrics["multi_jurisdiction_parcels"],
            by_zoning_jurisdiction=grouped_count(
                ParcelZoningOverlayV2.zoning_jurisdiction_name,
            ),
            by_zoning_category=grouped_count(
                ParcelZoningOverlayV2.dominant_zoning_general_normalized,
            ),
            by_parcel_quality_status=grouped_count(
                ParcelEnriched.parcel_quality_status,
            ),
            by_valuation_band=grouped_count(ParcelEnriched.valuation_band),
            by_governance_warning=by_governance_warning,
        )

    def get_zoning_summary(
        self,
        *,
        filters: ParcelZoningSummaryFilters,
    ) -> ParcelZoningSummaryRecord:
        base_from = self._base_from()
        predicates = self._zoning_summary_predicates(filters)
        where_clause = and_(*predicates) if predicates else None

        def apply_where(statement):
            return statement.where(where_clause) if where_clause is not None else statement

        metrics_statement = apply_where(
            select(
                func.count().label("total_parcels"),
                func.count()
                .filter(ParcelZoningOverlayV2.has_no_zoning_match.is_(False))
                .label("zoned_parcels"),
                func.count()
                .filter(ParcelZoningOverlayV2.has_no_zoning_match.is_(True))
                .label("no_match_parcels"),
                func.count()
                .filter(ParcelZoningOverlayV2.has_multiple_zoning_jurisdictions.is_(True))
                .label("multi_jurisdiction_count"),
            ).select_from(base_from),
        )
        metrics = self.db.execute(metrics_statement).mappings().one()

        jurisdiction_label = func.coalesce(
            ParcelZoningOverlayV2.zoning_jurisdiction_name,
            "unknown",
        ).label("zoning_jurisdiction_name")
        jurisdiction_statement = apply_where(
            select(
                jurisdiction_label,
                func.count().label("parcel_count"),
                func.count()
                .filter(ParcelZoningOverlayV2.zoning_assignment_confidence == "high")
                .label("high_confidence_count"),
                func.count()
                .filter(ParcelZoningIntelligenceQA.safe_for_dashboard.is_(False))
                .label("review_count"),
                func.count()
                .filter(ParcelZoningIntelligenceQA.safe_for_dashboard.is_(True))
                .label("safe_for_dashboard_count"),
            )
            .select_from(base_from)
            .group_by(jurisdiction_label)
            .order_by(func.count().desc(), jurisdiction_label),
        )

        zoning_code_jurisdiction_label = func.coalesce(
            ParcelZoningOverlayV2.zoning_jurisdiction_name,
            "unknown",
        ).label("zoning_jurisdiction_name")
        zoning_code_label = func.coalesce(
            ParcelZoningOverlayV2.dominant_zoning_code_raw,
            "unknown",
        ).label("zoning_code")
        zoning_category_label = func.coalesce(
            ParcelZoningOverlayV2.dominant_zoning_general_normalized,
            "unknown",
        ).label("zoning_category")
        zoning_code_statement = apply_where(
            select(
                zoning_code_jurisdiction_label,
                zoning_code_label,
                zoning_category_label,
                func.count().label("parcel_count"),
                func.count()
                .filter(ParcelZoningIntelligenceQA.safe_for_dashboard.is_(False))
                .label("review_count"),
            )
            .select_from(base_from)
            .group_by(
                zoning_code_jurisdiction_label,
                zoning_code_label,
                zoning_category_label,
            )
            .order_by(
                func.count().desc(),
                zoning_code_jurisdiction_label,
                zoning_code_label,
            ),
        )

        category_label = func.coalesce(
            ParcelZoningOverlayV2.dominant_zoning_general_normalized,
            "unknown",
        ).label("zoning_category")
        category_statement = apply_where(
            select(
                category_label,
                func.count().label("parcel_count"),
            )
            .select_from(base_from)
            .group_by(category_label)
            .order_by(func.count().desc(), category_label),
        )

        confidence_label = func.coalesce(
            ParcelZoningOverlayV2.zoning_assignment_confidence,
            "unknown",
        ).label("confidence")
        confidence_statement = apply_where(
            select(
                confidence_label,
                func.count().label("parcel_count"),
            )
            .select_from(base_from)
            .group_by(confidence_label)
            .order_by(func.count().desc(), confidence_label),
        )

        warning_subquery_statement = apply_where(
            select(
                ParcelEnriched.official_parcel_id,
                ParcelZoningIntelligenceQA.governance_warning_categories,
            ).select_from(base_from),
        )
        warning_subquery = warning_subquery_statement.subquery()
        warning_value = func.unnest(
            warning_subquery.c.governance_warning_categories,
        ).label("governance_warning")
        warning_expansion = select(warning_value).subquery()
        warning_statement = (
            select(
                warning_expansion.c.governance_warning,
                func.count().label("parcel_count"),
            )
            .where(warning_expansion.c.governance_warning.is_not(None))
            .group_by(warning_expansion.c.governance_warning)
            .order_by(func.count().desc(), warning_expansion.c.governance_warning)
        )

        return ParcelZoningSummaryRecord(
            total_parcels=metrics["total_parcels"],
            zoned_parcels=metrics["zoned_parcels"],
            no_match_parcels=metrics["no_match_parcels"],
            multi_jurisdiction_count=metrics["multi_jurisdiction_count"],
            jurisdiction_summary=[
                ParcelZoningJurisdictionSummaryRecord(
                    zoning_jurisdiction_name=row["zoning_jurisdiction_name"],
                    parcel_count=row["parcel_count"],
                    high_confidence_count=row["high_confidence_count"],
                    review_count=row["review_count"],
                    safe_for_dashboard_count=row["safe_for_dashboard_count"],
                )
                for row in self.db.execute(jurisdiction_statement).mappings().all()
            ],
            zoning_code_summary=[
                ParcelZoningCodeSummaryRecord(
                    zoning_jurisdiction_name=row["zoning_jurisdiction_name"],
                    zoning_code=row["zoning_code"],
                    zoning_category=row["zoning_category"],
                    parcel_count=row["parcel_count"],
                    review_count=row["review_count"],
                )
                for row in self.db.execute(zoning_code_statement).mappings().all()
            ],
            zoning_category_summary=[
                ParcelZoningCategorySummaryRecord(
                    zoning_category=row["zoning_category"],
                    parcel_count=row["parcel_count"],
                )
                for row in self.db.execute(category_statement).mappings().all()
            ],
            confidence_summary=[
                ParcelZoningConfidenceSummaryRecord(
                    confidence=row["confidence"],
                    parcel_count=row["parcel_count"],
                )
                for row in self.db.execute(confidence_statement).mappings().all()
            ],
            governance_warning_summary=[
                ParcelGovernanceWarningSummaryRecord(
                    governance_warning=row["governance_warning"],
                    parcel_count=row["parcel_count"],
                )
                for row in self.db.execute(warning_statement).mappings().all()
            ],
        )

    def get_governance_warnings(
        self,
        *,
        filters: ParcelGovernanceWarningsFilters,
        limit: int,
        offset: int,
    ) -> ParcelGovernanceWarningsPage:
        base_from = self._base_from()
        predicates = self._governance_warning_predicates(filters)
        where_clause = and_(*predicates) if predicates else None
        filters_default_to_review = (
            filters.safe_for_dashboard is None and filters.warning_category is None
        )

        def apply_where(statement):
            return statement.where(where_clause) if where_clause is not None else statement

        total_count = self.db.execute(
            apply_where(select(func.count()).select_from(base_from)),
        ).scalar_one()

        warning_rows_statement = (
            apply_where(
                select(
                    ParcelEnriched.official_parcel_id,
                    ParcelEnriched.pin14,
                    ParcelEnriched.subdiv_name.label("subdivision"),
                    ParcelEnriched.nbh_name.label("neighborhood"),
                    ParcelZoningOverlayV2.zoning_jurisdiction_name,
                    ParcelZoningOverlayV2.dominant_zoning_code_raw,
                    ParcelZoningOverlayV2.dominant_zoning_general_normalized,
                    ParcelZoningOverlayV2.zoning_assignment_confidence,
                    ParcelEnriched.parcel_quality_status,
                    ParcelEnriched.valuation_band,
                    ParcelZoningIntelligenceQA.safe_for_dashboard,
                    ParcelZoningIntelligenceQA.governance_warning_categories,
                ).select_from(base_from),
            )
            .order_by(
                ParcelZoningIntelligenceQA.safe_for_dashboard.asc().nullslast(),
                ParcelEnriched.official_parcel_id,
            )
            .limit(limit)
            .offset(offset)
        )
        rows = self.db.execute(warning_rows_statement).mappings().all()

        warning_subquery_statement = apply_where(
            select(
                ParcelEnriched.official_parcel_id,
                ParcelZoningIntelligenceQA.governance_warning_categories,
            ).select_from(base_from),
        )
        warning_subquery = warning_subquery_statement.subquery()
        warning_value = func.unnest(
            warning_subquery.c.governance_warning_categories,
        ).label("warning_category")
        warning_expansion = select(warning_value).subquery()
        warning_summary_statement = (
            select(
                warning_expansion.c.warning_category,
                func.count().label("parcel_count"),
            )
            .where(warning_expansion.c.warning_category.is_not(None))
            .group_by(warning_expansion.c.warning_category)
            .order_by(func.count().desc(), warning_expansion.c.warning_category)
        )

        return ParcelGovernanceWarningsPage(
            filters_default_to_review=filters_default_to_review,
            results=[
                ParcelGovernanceWarningsResultRecord(
                    official_parcel_id=row["official_parcel_id"],
                    pin14=row["pin14"],
                    subdivision=row["subdivision"],
                    neighborhood=row["neighborhood"],
                    zoning_jurisdiction_name=row["zoning_jurisdiction_name"],
                    dominant_zoning_code_raw=row["dominant_zoning_code_raw"],
                    dominant_zoning_general_normalized=row[
                        "dominant_zoning_general_normalized"
                    ],
                    zoning_assignment_confidence=row[
                        "zoning_assignment_confidence"
                    ],
                    parcel_quality_status=row["parcel_quality_status"],
                    valuation_band=row["valuation_band"],
                    safe_for_dashboard=row["safe_for_dashboard"],
                    governance_warning_categories=row[
                        "governance_warning_categories"
                    ],
                )
                for row in rows
            ],
            total_count=total_count,
            warning_summary=[
                ParcelGovernanceWarningsSummaryRecord(
                    warning_category=row["warning_category"],
                    parcel_count=row["parcel_count"],
                )
                for row in self.db.execute(warning_summary_statement)
                .mappings()
                .all()
            ],
        )
