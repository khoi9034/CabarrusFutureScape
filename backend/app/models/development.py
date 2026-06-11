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


class PermitIntelligenceSegment(Base):
    __tablename__ = "permit_intelligence_segments"
    __table_args__ = {"schema": "public"}

    permit_id: Mapped[str] = mapped_column(String, primary_key=True)
    permit_number: Mapped[str | None] = mapped_column(String)
    parcel_number: Mapped[str | None] = mapped_column(String)
    permit_date: Mapped[date | None] = mapped_column(Date)
    activity_year: Mapped[int | None] = mapped_column(Integer)
    activity_month: Mapped[int | None] = mapped_column(Integer)
    permit_type: Mapped[str | None] = mapped_column(String)
    work_type: Mapped[str | None] = mapped_column(String)
    permit_status: Mapped[str | None] = mapped_column(String)
    permit_amount: Mapped[Decimal | None] = mapped_column(Numeric)
    permit_segment: Mapped[str | None] = mapped_column(String)
    permit_growth_signal: Mapped[str | None] = mapped_column(String)
    development_domain: Mapped[str | None] = mapped_column(String)
    permit_value_class: Mapped[str | None] = mapped_column(String)
    permit_status_stage: Mapped[str | None] = mapped_column(String)
    is_residential_growth: Mapped[bool | None] = mapped_column(Boolean)
    is_commercial_activity: Mapped[bool | None] = mapped_column(Boolean)
    is_industrial_activity: Mapped[bool | None] = mapped_column(Boolean)
    is_institutional_activity: Mapped[bool | None] = mapped_column(Boolean)
    is_redevelopment_signal: Mapped[bool | None] = mapped_column(Boolean)
    is_minor_maintenance: Mapped[bool | None] = mapped_column(Boolean)
    is_demolition: Mapped[bool | None] = mapped_column(Boolean)
    is_active_construction: Mapped[bool | None] = mapped_column(Boolean)
    is_completed: Mapped[bool | None] = mapped_column(Boolean)
    is_high_value: Mapped[bool | None] = mapped_column(Boolean)
    is_major_value: Mapped[bool | None] = mapped_column(Boolean)
    is_map_relevant: Mapped[bool | None] = mapped_column(Boolean)
    is_future_prediction_relevant: Mapped[bool | None] = mapped_column(Boolean)
    permit_signal_score: Mapped[Decimal | None] = mapped_column(Numeric)
    classification_reason: Mapped[str | None] = mapped_column(String)
    rules_version: Mapped[str | None] = mapped_column(String)
    transformed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ParcelPermitSegmentSummary(Base):
    __tablename__ = "parcel_permit_segment_summary"
    __table_args__ = {"schema": "public"}

    official_parcel_id: Mapped[str] = mapped_column(String, primary_key=True)
    pin14: Mapped[str | None] = mapped_column(String)
    total_permits: Mapped[int | None] = mapped_column(Integer)
    residential_growth_permits: Mapped[int | None] = mapped_column(Integer)
    commercial_activity_permits: Mapped[int | None] = mapped_column(Integer)
    industrial_activity_permits: Mapped[int | None] = mapped_column(Integer)
    institutional_activity_permits: Mapped[int | None] = mapped_column(Integer)
    redevelopment_signal_permits: Mapped[int | None] = mapped_column(Integer)
    minor_maintenance_permits: Mapped[int | None] = mapped_column(Integer)
    demolition_permits: Mapped[int | None] = mapped_column(Integer)
    active_construction_permits: Mapped[int | None] = mapped_column(Integer)
    completed_permits: Mapped[int | None] = mapped_column(Integer)
    high_value_permits: Mapped[int | None] = mapped_column(Integer)
    major_value_permits: Mapped[int | None] = mapped_column(Integer)
    total_permit_amount: Mapped[Decimal | None] = mapped_column(Numeric)
    latest_permit_date: Mapped[date | None] = mapped_column(Date)
    first_permit_date: Mapped[date | None] = mapped_column(Date)
    active_year_count: Mapped[int | None] = mapped_column(Integer)
    dominant_permit_segment: Mapped[str | None] = mapped_column(String)
    dominant_growth_signal: Mapped[str | None] = mapped_column(String)
    permit_signal_score_max: Mapped[Decimal | None] = mapped_column(Numeric)
    permit_signal_score_avg: Mapped[Decimal | None] = mapped_column(Numeric)
    current_activity_status: Mapped[str | None] = mapped_column(String)
    issued_or_starting_permits: Mapped[int | None] = mapped_column(Integer)
    map_relevant_permits: Mapped[int | None] = mapped_column(Integer)
    future_prediction_relevant_permits: Mapped[int | None] = mapped_column(Integer)
    ambiguous_relationship_permits: Mapped[int | None] = mapped_column(Integer)
    activity_anchor_date: Mapped[date | None] = mapped_column(Date)
    summarized_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
