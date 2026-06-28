from typing import Any, Literal

from pydantic import BaseModel, Field

CfsAiDomain = Literal[
    "data_readiness",
    "flood",
    "general",
    "methodology",
    "model_lab",
    "permits",
    "schools",
    "transportation",
    "utilities",
    "zoning",
]

CfsAiProvider = Literal["anthropic", "none", "openai"]


class CfsAiSearchFilters(BaseModel):
    domains: list[CfsAiDomain] = Field(default_factory=list)
    year_end: int | None = None
    year_start: int | None = None


class CfsAiSearchRequest(BaseModel):
    filters: CfsAiSearchFilters = Field(default_factory=CfsAiSearchFilters)
    mode: Literal["demo", "live"] = "live"
    query: str = Field(min_length=1, max_length=500)


class CfsAiEvidenceItem(BaseModel):
    confidence: Literal["available", "limited", "not_available"] = "available"
    detail: str
    source: str
    title: str


class CfsAiSearchResponse(BaseModel):
    answer: str
    as_of: str | None = None
    caveats: list[str] = Field(default_factory=list)
    data_mode: Literal["demo", "live"] = "live"
    domains: list[CfsAiDomain] = Field(default_factory=list)
    evidence: list[CfsAiEvidenceItem] = Field(default_factory=list)
    provider: CfsAiProvider = "none"
    related_layers: list[str] = Field(default_factory=list)
    suggested_actions: list[str] = Field(default_factory=list)


CfsAiContext = dict[str, Any]
