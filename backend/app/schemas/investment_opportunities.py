from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

from app.schemas.investment import InvestmentStrategyId, reject_private_identity_text
from app.schemas.investment_underwriting import InvestmentUnderwritingScenarioType


OpportunitySourceMode = Literal[
    "Approved API",
    "Public Government Feed",
    "Broker or MLS Export",
    "CSV Import",
    "External Search Link",
    "Manual / Off-Market Lead",
    "Internal CFS Evidence",
]


class InvestmentOpportunityRefreshRequest(BaseModel):
    source_id: str | None = Field(default=None, max_length=80)


class InvestmentOpportunityMatchRequest(BaseModel):
    parcel_id: str | None = Field(default=None, max_length=80)
    latitude: float | None = None
    longitude: float | None = None


class InvestmentOpportunityIntakeRequest(BaseModel):
    strategy: InvestmentStrategyId = "development_land"


class InvestmentUnderwritingTemplatePayload(BaseModel):
    assumptions: dict[str, Any] = Field(default_factory=dict)
    default_source: str = Field(default="Analyst default", max_length=120)
    scenario_type: InvestmentUnderwritingScenarioType = "development_land"
    template_name: str = Field(min_length=1, max_length=160)
    values_requiring_confirmation: list[str] = Field(default_factory=list, max_length=80)

    _safe_name = field_validator("template_name", mode="before")(reject_private_identity_text)


class InvestmentUnderwritingPrefillRequest(BaseModel):
    candidate_id: str | None = Field(default=None, max_length=80)
    existing_assumptions: dict[str, Any] = Field(default_factory=dict)
    opportunity_id: str | None = Field(default=None, max_length=160)
    parcel_id: str | None = Field(default=None, max_length=80)
    scenario_type: InvestmentUnderwritingScenarioType = "development_land"
    strategy: InvestmentStrategyId = "development_land"
    template_id: str | None = Field(default=None, max_length=120)
