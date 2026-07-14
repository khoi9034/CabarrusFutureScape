from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

from app.schemas.investment import InvestmentStrategyId, reject_private_identity_text


InvestmentUnderwritingScenarioType = Literal[
    "development_land",
    "land_banking",
    "entitlement_repositioning",
    "existing_use_acquisition",
]

InvestmentUnderwritingStatus = Literal[
    "Draft",
    "In Review",
    "Needs Verification",
    "Ready for Report",
    "Archived",
]


class InvestmentUnderwritingCalculateRequest(BaseModel):
    assumptions: dict[str, Any] = Field(default_factory=dict)
    candidate_id: str | None = Field(default=None, max_length=80)
    parcel_id: str | None = Field(default=None, max_length=80)
    scenario_name: str = Field(default="Underwriting Scenario", min_length=1, max_length=160)
    scenario_type: InvestmentUnderwritingScenarioType = "development_land"
    strategy: InvestmentStrategyId = "development_land"

    _safe_name = field_validator("scenario_name", mode="before")(reject_private_identity_text)


class InvestmentUnderwritingScenarioPayload(InvestmentUnderwritingCalculateRequest):
    private_notes: str | None = Field(default=None, max_length=4000)
    scenario_status: InvestmentUnderwritingStatus = "Draft"

    _safe_notes = field_validator("private_notes", mode="before")(reject_private_identity_text)


class InvestmentUnderwritingScenarioPatch(BaseModel):
    assumptions: dict[str, Any] | None = None
    candidate_id: str | None = Field(default=None, max_length=80)
    parcel_id: str | None = Field(default=None, max_length=80)
    private_notes: str | None = Field(default=None, max_length=4000)
    scenario_name: str | None = Field(default=None, min_length=1, max_length=160)
    scenario_status: InvestmentUnderwritingStatus | None = None
    scenario_type: InvestmentUnderwritingScenarioType | None = None
    strategy: InvestmentStrategyId | None = None

    _safe_text = field_validator("scenario_name", "private_notes", mode="before")(reject_private_identity_text)


class InvestmentUnderwritingCompareRequest(BaseModel):
    scenario_ids: list[str] = Field(min_length=2, max_length=4)
