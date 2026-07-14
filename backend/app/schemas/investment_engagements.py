from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

from app.schemas.investment import InvestmentStrategyId, reject_private_identity_text


EngagementStatus = Literal["Draft", "In Review", "Client Review", "Archived"]
ShortlistStatus = Literal["Longlist", "Shortlist", "Needs Verification", "Client Review", "Removed", "Finalist for Further Diligence"]
CriteriaType = Literal["Must Have", "Preferred", "Informational", "Disqualifier", "Needs Verification"]


class InvestmentEngagementPayload(BaseModel):
    budget_range: str | None = Field(default=None, max_length=120)
    client_or_internal_label: str | None = Field(default=None, max_length=160)
    criteria: list[dict[str, Any]] = Field(default_factory=list, max_length=80)
    engagement_name: str = Field(min_length=1, max_length=160)
    engagement_status: EngagementStatus = "Draft"
    engagement_type: str = Field(default="Site-selection study", max_length=120)
    maximum_acres: float | None = Field(default=None, ge=0)
    minimum_acres: float | None = Field(default=None, ge=0)
    must_have_criteria: list[str] = Field(default_factory=list, max_length=80)
    notes: str | None = Field(default=None, max_length=4000)
    preferred_criteria: list[str] = Field(default_factory=list, max_length=80)
    property_type: str | None = Field(default=None, max_length=120)
    selected_strategy: InvestmentStrategyId = "development_land"
    target_geography: str | None = Field(default=None, max_length=160)
    timeline: str | None = Field(default=None, max_length=120)

    _safe_text = field_validator("client_or_internal_label", "engagement_name", "notes", mode="before")(reject_private_identity_text)


class InvestmentEngagementPatch(BaseModel):
    budget_range: str | None = Field(default=None, max_length=120)
    client_or_internal_label: str | None = Field(default=None, max_length=160)
    criteria: list[dict[str, Any]] | None = Field(default=None, max_length=80)
    engagement_name: str | None = Field(default=None, min_length=1, max_length=160)
    engagement_status: EngagementStatus | None = None
    engagement_type: str | None = Field(default=None, max_length=120)
    maximum_acres: float | None = Field(default=None, ge=0)
    minimum_acres: float | None = Field(default=None, ge=0)
    must_have_criteria: list[str] | None = Field(default=None, max_length=80)
    notes: str | None = Field(default=None, max_length=4000)
    preferred_criteria: list[str] | None = Field(default=None, max_length=80)
    property_type: str | None = Field(default=None, max_length=120)
    selected_strategy: InvestmentStrategyId | None = None
    shortlist: list[dict[str, Any]] | None = Field(default=None, max_length=250)
    target_geography: str | None = Field(default=None, max_length=160)
    timeline: str | None = Field(default=None, max_length=120)

    _safe_text = field_validator("client_or_internal_label", "engagement_name", "notes", mode="before")(reject_private_identity_text)


class InvestmentEngagementCriteriaRequest(BaseModel):
    criteria: list[dict[str, Any]] = Field(default_factory=list, max_length=80)


class InvestmentEngagementShortlistRequest(BaseModel):
    item_id: str = Field(min_length=1, max_length=160)
    item_type: Literal["search_area", "parcel", "opportunity", "intake_candidate", "underwriting_scenario"]
    notes: str | None = Field(default=None, max_length=2000)
    status: ShortlistStatus = "Longlist"

    _safe_notes = field_validator("notes", mode="before")(reject_private_identity_text)
