from datetime import date, datetime

from sqlalchemy import BigInteger, Boolean, Date, DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.parcel import Base


class AccelaPlanReviewClean(Base):
    __tablename__ = "accela_plan_reviews_clean"
    __table_args__ = {"schema": "public"}

    accela_plan_review_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    official_parcel_id: Mapped[str | None] = mapped_column(String)
    pin14: Mapped[str | None] = mapped_column(String)
    address: Mapped[str | None] = mapped_column(String)
    review_type: Mapped[str | None] = mapped_column(String)
    review_status: Mapped[str | None] = mapped_column(String)
    file_date: Mapped[date | None] = mapped_column(Date)
    current_context_only: Mapped[bool | None] = mapped_column(Boolean)
    cleaned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    geometry: Mapped[str | None] = mapped_column(Text)


class ZoningJurisdictionalClean(Base):
    __tablename__ = "zoning_jurisdictional_clean"
    __table_args__ = {"schema": "public"}

    zoning_jurisdictional_id: Mapped[str] = mapped_column(String, primary_key=True)
    jurisdiction_name: Mapped[str | None] = mapped_column(String)
    zoning_code_raw: Mapped[str | None] = mapped_column(String)
    zoning_general_normalized: Mapped[str | None] = mapped_column(String)
    zoning_type_raw: Mapped[str | None] = mapped_column(String)
    base_district_raw: Mapped[str | None] = mapped_column(String)
    conditional_raw: Mapped[str | None] = mapped_column(String)
    transformed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    geometry: Mapped[str | None] = mapped_column(Text)


class FemaFloodZoneClean(Base):
    __tablename__ = "fema_nfhl_flood_zones_clean"
    __table_args__ = {"schema": "public"}

    flood_zone_internal_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    fld_ar_id: Mapped[str | None] = mapped_column(String)
    flood_zone_code: Mapped[str | None] = mapped_column(String)
    flood_constraint_type: Mapped[str | None] = mapped_column(String)
    flood_severity_class: Mapped[str | None] = mapped_column(String)
    source_layer: Mapped[str | None] = mapped_column(String)
    transformed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    geometry: Mapped[str | None] = mapped_column(Text)


class SchoolZone(Base):
    __tablename__ = "school_zones"
    __table_args__ = {"schema": "public"}

    zone_id: Mapped[str] = mapped_column(String, primary_key=True)
    school_name_raw: Mapped[str | None] = mapped_column(String)
    school_level: Mapped[str | None] = mapped_column(String)
    school_system: Mapped[str | None] = mapped_column(String)
    matched_school_reference_id: Mapped[str | None] = mapped_column(String)
    match_confidence: Mapped[str | None] = mapped_column(String)
    include_in_cfs_v1: Mapped[bool | None] = mapped_column(Boolean)
    source_layer: Mapped[str | None] = mapped_column(String)
    transformed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    geometry: Mapped[str | None] = mapped_column(Text)


class SchoolReference(Base):
    __tablename__ = "school_reference"
    __table_args__ = {"schema": "public"}

    school_reference_id: Mapped[str] = mapped_column(String, primary_key=True)
    school_type: Mapped[str | None] = mapped_column(String)
    address: Mapped[str | None] = mapped_column(String)
