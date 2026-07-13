from typing import Any, Literal

from pydantic import BaseModel, Field


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
