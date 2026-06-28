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

CfsAiProvider = Literal["none", "openai"]
CfsAiDashboardFocusDomain = Literal[
    "data_readiness",
    "flood",
    "general",
    "model_lab",
    "permits",
    "schools",
    "transportation",
    "utilities",
    "zoning",
]


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


class CfsAiWatchlistFilter(BaseModel):
    domain: str | None = None
    status: str | None = None


class CfsAiOpenDetailAction(BaseModel):
    type: Literal["domain", "kpi", "watchlist"]
    id: str


class CfsAiTimeRangeAction(BaseModel):
    end_year: int | None = None
    start_year: int | None = None


class CfsAiDashboardActions(BaseModel):
    filter_watchlist: CfsAiWatchlistFilter | None = None
    focus_domain: CfsAiDashboardFocusDomain | None = None
    highlight_kpis: list[str] = Field(default_factory=list)
    open_detail: CfsAiOpenDetailAction | None = None
    recommended_layers: list[str] = Field(default_factory=list)
    sort_watchlist_by: Literal["data_gap", "recent_activity", "severity"] | None = None
    time_range: CfsAiTimeRangeAction | None = None


class CfsAiSearchResponse(BaseModel):
    answer: str
    as_of: str | None = None
    caveats: list[str] = Field(default_factory=list)
    dashboard_actions: CfsAiDashboardActions = Field(
        default_factory=CfsAiDashboardActions,
    )
    data_mode: Literal["demo", "live"] = "live"
    domains: list[CfsAiDomain] = Field(default_factory=list)
    evidence: list[CfsAiEvidenceItem] = Field(default_factory=list)
    provider: CfsAiProvider = "none"
    related_layers: list[str] = Field(default_factory=list)
    suggested_actions: list[str] = Field(default_factory=list)


CfsAiContext = dict[str, Any]
