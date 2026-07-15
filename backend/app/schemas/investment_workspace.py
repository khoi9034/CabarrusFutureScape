from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

from app.schemas.investment import InvestmentStrategyId, reject_private_identity_text


def reject_private_identity_payload(value: Any) -> Any:
    if isinstance(value, dict):
        for item in value.values():
            reject_private_identity_payload(item)
    elif isinstance(value, list):
        for item in value:
            reject_private_identity_payload(item)
    elif isinstance(value, str):
        reject_private_identity_text(value)
    return value


SavedItemType = Literal[
    "area",
    "parcel",
    "opportunity",
    "intake_candidate",
    "underwriting_scenario",
    "report",
    "engagement",
]
SavedItemStatus = Literal["Saved", "Reviewing", "Needs Verification", "Shortlisted", "Archived"]


class InvestmentSavedItemPayload(BaseModel):
    area_id: str | None = Field(default=None, max_length=160)
    candidate_id: str | None = Field(default=None, max_length=160)
    engagement_id: str | None = Field(default=None, max_length=160)
    item_reference_id: str = Field(min_length=1, max_length=160)
    item_type: SavedItemType
    label: str = Field(min_length=1, max_length=220)
    opportunity_id: str | None = Field(default=None, max_length=160)
    parcel_id: str | None = Field(default=None, max_length=160)
    private_notes: str | None = Field(default=None, max_length=4000)
    scenario_id: str | None = Field(default=None, max_length=160)
    status: SavedItemStatus = "Shortlisted"
    strategy: InvestmentStrategyId | None = None
    summary: str | None = Field(default=None, max_length=1000)

    _safe_text = field_validator("label", "private_notes", "summary", mode="before")(reject_private_identity_text)


class InvestmentSavedItemPatch(BaseModel):
    label: str | None = Field(default=None, min_length=1, max_length=220)
    private_notes: str | None = Field(default=None, max_length=4000)
    status: SavedItemStatus | None = None
    summary: str | None = Field(default=None, max_length=1000)

    _safe_text = field_validator("label", "private_notes", "summary", mode="before")(reject_private_identity_text)


class InvestmentSavedItemReorderRequest(BaseModel):
    item_ids: list[str] = Field(min_length=1, max_length=250)


class InvestmentRecentWorkPayload(BaseModel):
    activity_type: str = Field(min_length=1, max_length=80)
    context: dict[str, Any] = Field(default_factory=dict)
    label: str = Field(min_length=1, max_length=220)
    page: str = Field(min_length=1, max_length=80)
    parcel_id: str | None = Field(default=None, max_length=160)
    reference_id: str | None = Field(default=None, max_length=160)
    reference_type: str = Field(min_length=1, max_length=80)
    strategy: InvestmentStrategyId | None = None
    summary: str | None = Field(default=None, max_length=1000)

    _safe_text = field_validator("label", "summary", mode="before")(reject_private_identity_text)
    _safe_context = field_validator("context", mode="before")(reject_private_identity_payload)


class InvestmentSavedSearchPayload(BaseModel):
    advanced_criteria: dict[str, Any] = Field(default_factory=dict)
    essential_criteria: dict[str, Any] = Field(default_factory=dict)
    goal: str = Field(default="Custom", max_length=120)
    guided_or_advanced: Literal["guided", "advanced"] = "guided"
    location_type: str = Field(default="All Cabarrus County", max_length=120)
    location_value: str | None = Field(default=None, max_length=160)
    result_summary: dict[str, Any] = Field(default_factory=dict)
    search_name: str = Field(min_length=1, max_length=180)

    _safe_name = field_validator("search_name", "location_value", mode="before")(reject_private_identity_text)
    _safe_payloads = field_validator("advanced_criteria", "essential_criteria", "result_summary", mode="before")(reject_private_identity_payload)


class InvestmentSavedSearchPatch(BaseModel):
    advanced_criteria: dict[str, Any] | None = None
    essential_criteria: dict[str, Any] | None = None
    goal: str | None = Field(default=None, max_length=120)
    guided_or_advanced: Literal["guided", "advanced"] | None = None
    location_type: str | None = Field(default=None, max_length=120)
    location_value: str | None = Field(default=None, max_length=160)
    result_summary: dict[str, Any] | None = None
    search_name: str | None = Field(default=None, min_length=1, max_length=180)

    _safe_name = field_validator("search_name", "location_value", mode="before")(reject_private_identity_text)
    _safe_payloads = field_validator("advanced_criteria", "essential_criteria", "result_summary", mode="before")(reject_private_identity_payload)
