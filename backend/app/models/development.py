from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import BigInteger, Boolean, Date, DateTime, Integer, Numeric, String
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from app.models.parcel import Base


class RealPropertyPermitParcelRelationship(Base):
    __tablename__ = "real_property_permit_parcel_relationship"
    __table_args__ = {"schema": "public"}

    relationship_id: Mapped[str] = mapped_column(String, primary_key=True)
    permit_id: Mapped[str | None] = mapped_column(String)
    permit_number: Mapped[str | None] = mapped_column(String)
    official_parcel_id: Mapped[str | None] = mapped_column(String)
    objectid_1: Mapped[int | None] = mapped_column(BigInteger)
    pin14: Mapped[str | None] = mapped_column(String)
    activity_date: Mapped[date | None] = mapped_column(Date)
    activity_year: Mapped[int | None] = mapped_column(Integer)
    activity_month: Mapped[int | None] = mapped_column(Integer)
    permit_type: Mapped[str | None] = mapped_column(String)
    work_type: Mapped[str | None] = mapped_column(String)
    permit_status: Mapped[str | None] = mapped_column(String)
    permit_amount: Mapped[Decimal | None] = mapped_column(Numeric)
    zoning_jurisdiction_name: Mapped[str | None] = mapped_column(String)
    dominant_zoning_code_raw: Mapped[str | None] = mapped_column(String)
    dominant_zoning_general_normalized: Mapped[str | None] = mapped_column(String)
    relationship_confidence: Mapped[str | None] = mapped_column(String)
    has_parcel_match: Mapped[bool | None] = mapped_column(Boolean)
    has_multiple_parcel_matches: Mapped[bool | None] = mapped_column(Boolean)
    missing_parcel_match: Mapped[bool | None] = mapped_column(Boolean)
    transformed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class DevelopmentActivityParcelSummary(Base):
    __tablename__ = "development_activity_parcel_summary"
    __table_args__ = {"schema": "public"}

    official_parcel_id: Mapped[str] = mapped_column(String, primary_key=True)
    objectid_1: Mapped[int | None] = mapped_column(BigInteger)
    pin14: Mapped[str | None] = mapped_column(String)
    subdiv_name: Mapped[str | None] = mapped_column(String)
    nbh_name: Mapped[str | None] = mapped_column(String)
    parcel_quality_status: Mapped[str | None] = mapped_column(String)
    valuation_band: Mapped[str | None] = mapped_column(String)
    parcel_size_category: Mapped[str | None] = mapped_column(String)
    zoning_jurisdiction_name: Mapped[str | None] = mapped_column(String)
    planning_jurisdiction_name: Mapped[str | None] = mapped_column(String)
    dominant_zoning_code_raw: Mapped[str | None] = mapped_column(String)
    dominant_zoning_general_normalized: Mapped[str | None] = mapped_column(String)
    zoning_assignment_confidence: Mapped[str | None] = mapped_column(String)
    governance_warning_categories: Mapped[list[str] | None] = mapped_column(
        ARRAY(String),
    )
    primary_governance_warning: Mapped[str | None] = mapped_column(String)
    safe_for_dashboard: Mapped[bool | None] = mapped_column(Boolean)
    total_permit_count: Mapped[int | None] = mapped_column(Integer)
    first_permit_date: Mapped[date | None] = mapped_column(Date)
    latest_permit_date: Mapped[date | None] = mapped_column(Date)
    active_year_count: Mapped[int | None] = mapped_column(Integer)
    recent_permit_count_1yr: Mapped[int | None] = mapped_column(Integer)
    recent_permit_count_3yr: Mapped[int | None] = mapped_column(Integer)
    total_permit_amount: Mapped[Decimal | None] = mapped_column(Numeric)
    avg_permit_amount: Mapped[Decimal | None] = mapped_column(Numeric)
    dominant_permit_type: Mapped[str | None] = mapped_column(String)
    dominant_work_type: Mapped[str | None] = mapped_column(String)
    latest_permit_status: Mapped[str | None] = mapped_column(String)
    ambiguous_permit_count: Mapped[int | None] = mapped_column(Integer)
    has_unmatched_or_ambiguous_permit_flag: Mapped[bool | None] = mapped_column(Boolean)
    co_date_future_outlier_count: Mapped[int | None] = mapped_column(Integer)
    activity_anchor_date: Mapped[date | None] = mapped_column(Date)
    development_activity_score: Mapped[Decimal | None] = mapped_column(Numeric)
    development_activity_class: Mapped[str | None] = mapped_column(String)
    summarized_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
