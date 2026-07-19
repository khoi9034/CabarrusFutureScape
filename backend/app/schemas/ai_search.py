from typing import Any, Literal

from pydantic import BaseModel, Field

CfsAiDomain = Literal[
    "data_readiness",
    "economics",
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
    "economics",
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


class CfsAiConversationTurn(BaseModel):
    answer_summary: str | None = Field(default=None, max_length=500)
    dashboard_actions: dict[str, Any] = Field(default_factory=dict)
    focused_domain: str | None = Field(default=None, max_length=50)
    query: str = Field(max_length=500)
    related_layers: list[str] = Field(default_factory=list, max_length=8)


class CfsAiSelectedSignal(BaseModel):
    domain: str = Field(max_length=80)
    evidence: list[str] = Field(default_factory=list, max_length=8)
    id: str = Field(max_length=120)
    related_layers: list[str] = Field(default_factory=list, max_length=8)
    status_band: str | None = Field(default=None, max_length=80)
    title: str = Field(max_length=200)


class CfsAiSearchRequest(BaseModel):
    app_mode: Literal["consulting", "economics", "planning"] = "planning"
    conversation_context: list[CfsAiConversationTurn] = Field(default_factory=list, max_length=5)
    filter_context: dict[str, Any] = Field(default_factory=dict)
    filters: CfsAiSearchFilters = Field(default_factory=CfsAiSearchFilters)
    mode: Literal["demo", "live"] = "live"
    query: str = Field(min_length=1, max_length=500)
    request_type: Literal["powerbi_report_plan"] | None = None
    selected_signal: CfsAiSelectedSignal | None = None


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
    context_freshness: str | None = None
    dashboard_actions: CfsAiDashboardActions = Field(
        default_factory=CfsAiDashboardActions,
    )
    data_source: str | None = None
    data_mode: Literal["demo", "live"] = "live"
    domains: list[CfsAiDomain] = Field(default_factory=list)
    evidence: list[CfsAiEvidenceItem] = Field(default_factory=list)
    filtered_context_summary: str | None = None
    powerbi_actions: dict[str, Any] | None = None
    provider: CfsAiProvider = "none"
    provider_status: str | None = None
    related_layers: list[str] = Field(default_factory=list)
    suggested_actions: list[str] = Field(default_factory=list)
    timings_ms: dict[str, int] = Field(default_factory=dict)


CfsAiContext = dict[str, Any]
