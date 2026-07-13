from datetime import date
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, Field, HttpUrl, field_validator, model_validator


InvestmentStrategyId = Literal[
    "development_land",
    "land_banking",
    "entitlement_repositioning",
    "existing_use",
]


class InvestmentScreenRequest(BaseModel):
    filters: dict[str, Any] = Field(default_factory=dict)
    limit: int = Field(default=80, ge=1, le=250)
    strategy: InvestmentStrategyId = "development_land"


class InvestmentCompareRequest(BaseModel):
    parcel_ids: list[str] = Field(min_length=1, max_length=8)
    strategy: InvestmentStrategyId = "development_land"


class InvestmentIntakeCompareRequest(BaseModel):
    candidate_ids: list[str] = Field(min_length=2, max_length=4)


InvestmentSourceType = Literal[
    "Active Listing",
    "Off-Market Lead",
    "Broker Lead",
    "Auction",
    "County Sale Record",
    "Existing CFS Candidate",
    "Manual Research",
    "Other",
]

InvestmentReviewStatus = Literal[
    "New",
    "Screening",
    "Researching",
    "Needs Verification",
    "Priority Review",
    "Hold for Later",
    "Archived",
]

SaleVerificationStatus = Literal[
    "Not Reviewed",
    "Potentially Qualified",
    "Qualified for Screening Context",
    "Non-Market Transfer",
    "Multi-Parcel Review Required",
    "Insufficient Information",
]


class InvestmentIntakePayload(BaseModel):
    asking_price: Decimal | None = Field(default=None, ge=0)
    asking_price_date: date | None = None
    broker_notes: str | None = Field(default=None, max_length=4000)
    candidate_name: str = Field(min_length=1, max_length=160)
    date_added: date | None = None
    deed_review_status: SaleVerificationStatus = "Not Reviewed"
    deed_type: str | None = Field(default=None, max_length=120)
    expiration_or_review_date: date | None = None
    last_verified: date | None = None
    listing_date: date | None = None
    listing_status: str | None = Field(default=None, max_length=80)
    market_sale_status: SaleVerificationStatus = "Not Reviewed"
    multi_parcel_review: bool = False
    parcel_id: str | None = Field(default=None, max_length=80)
    property_type: str | None = Field(default=None, max_length=120)
    review_status: InvestmentReviewStatus = "New"
    source_name: str | None = Field(default=None, max_length=160)
    source_type: InvestmentSourceType = "Manual Research"
    source_url: HttpUrl | None = None
    strategy: InvestmentStrategyId = "development_land"
    user_notes: str | None = Field(default=None, max_length=4000)
    verification_date: date | None = None
    verification_notes: str | None = Field(default=None, max_length=4000)
    verification_source: str | None = Field(default=None, max_length=160)

    @field_validator("candidate_name", "source_name", "listing_status", "property_type", "user_notes", "broker_notes", mode="before")
    @classmethod
    def reject_private_identity_fields(cls, value: Any) -> Any:
        text = str(value or "").lower()
        if "owner" in text or "mailing" in text or "grantor" in text or "grantee" in text:
            raise ValueError("Do not enter owner, mailing, grantor, or grantee information.")
        return value

    @model_validator(mode="after")
    def normalize_private_label(self) -> "InvestmentIntakePayload":
        self.parcel_id = self.parcel_id.strip() if self.parcel_id else None
        return self


class InvestmentIntakePatch(BaseModel):
    asking_price: Decimal | None = Field(default=None, ge=0)
    asking_price_date: date | None = None
    broker_notes: str | None = Field(default=None, max_length=4000)
    candidate_name: str | None = Field(default=None, min_length=1, max_length=160)
    deed_review_status: SaleVerificationStatus | None = None
    deed_type: str | None = Field(default=None, max_length=120)
    expiration_or_review_date: date | None = None
    last_verified: date | None = None
    listing_date: date | None = None
    listing_status: str | None = Field(default=None, max_length=80)
    market_sale_status: SaleVerificationStatus | None = None
    multi_parcel_review: bool | None = None
    parcel_id: str | None = Field(default=None, max_length=80)
    property_type: str | None = Field(default=None, max_length=120)
    review_status: InvestmentReviewStatus | None = None
    source_name: str | None = Field(default=None, max_length=160)
    source_type: InvestmentSourceType | None = None
    source_url: HttpUrl | None = None
    strategy: InvestmentStrategyId | None = None
    user_notes: str | None = Field(default=None, max_length=4000)
    verification_date: date | None = None
    verification_notes: str | None = Field(default=None, max_length=4000)
    verification_source: str | None = Field(default=None, max_length=160)

    _safe_text = field_validator("candidate_name", "source_name", "listing_status", "property_type", "user_notes", "broker_notes", mode="before")(InvestmentIntakePayload.reject_private_identity_fields)


class InvestmentCsvImportRequest(BaseModel):
    csv_text: str = Field(min_length=1, max_length=200_000)
