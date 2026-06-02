from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, Numeric, String
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class ParcelEnriched(Base):
    __tablename__ = "parcels_enriched"
    __table_args__ = {"schema": "public"}

    official_parcel_id: Mapped[str] = mapped_column(String, primary_key=True)
    objectid_1: Mapped[int | None] = mapped_column(BigInteger)
    pin14: Mapped[str | None] = mapped_column(String)
    subdiv_name: Mapped[str | None] = mapped_column(String)
    nbh_name: Mapped[str | None] = mapped_column(String)
    acctname1: Mapped[str | None] = mapped_column(String)
    acctname2: Mapped[str | None] = mapped_column(String)
    mailaddr1: Mapped[str | None] = mapped_column(String)
    mailaddr2: Mapped[str | None] = mapped_column(String)
    mailcity: Mapped[str | None] = mapped_column(String)
    mailstate: Mapped[str | None] = mapped_column(String)
    mailzipcode: Mapped[str | None] = mapped_column(String)
    marketvalue_numeric: Mapped[float | None] = mapped_column(Numeric)
    assessedvalue_numeric: Mapped[float | None] = mapped_column(Numeric)
    parcel_quality_status: Mapped[str | None] = mapped_column(String)
    parcel_size_category: Mapped[str | None] = mapped_column(String)
    valuation_band: Mapped[str | None] = mapped_column(String)
    transformed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ParcelZoningOverlayV2(Base):
    __tablename__ = "parcel_zoning_overlay_v2"
    __table_args__ = {"schema": "public"}

    official_parcel_id: Mapped[str] = mapped_column(String, primary_key=True)
    planning_jurisdiction_name: Mapped[str | None] = mapped_column(String)
    dominant_zoning_code_raw: Mapped[str | None] = mapped_column(String)
    dominant_zoning_general_normalized: Mapped[str | None] = mapped_column(String)
    zoning_assignment_confidence: Mapped[str | None] = mapped_column(String)
    zoning_jurisdiction_name: Mapped[str | None] = mapped_column(String)
    has_multiple_zoning_jurisdictions: Mapped[bool | None] = mapped_column(Boolean)
    has_no_zoning_match: Mapped[bool | None] = mapped_column(Boolean)


class ParcelZoningIntelligenceQA(Base):
    __tablename__ = "parcel_zoning_intelligence_qa"
    __table_args__ = {"schema": "public"}

    official_parcel_id: Mapped[str] = mapped_column(String, primary_key=True)
    governance_warning_categories: Mapped[list[str] | None] = mapped_column(
        ARRAY(String),
    )
    safe_for_dashboard: Mapped[bool | None] = mapped_column(Boolean)
