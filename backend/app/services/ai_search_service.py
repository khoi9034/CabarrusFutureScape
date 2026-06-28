from __future__ import annotations

import json
import re
import urllib.error
import urllib.request
from datetime import UTC, datetime
from typing import Any

from app.config import Settings
from app.schemas.ai_search import (
    CfsAiContext,
    CfsAiDashboardActions,
    CfsAiDomain,
    CfsAiEvidenceItem,
    CfsAiSearchRequest,
    CfsAiSearchResponse,
)

SAFE_CAVEATS = [
    "Answers use CFS summary context only and do not invent missing data.",
    "Observed permit activity is a planning signal, not a prediction.",
    "Preliminary school capacity watch is not an official enrollment forecast.",
    "Model Lab context is internal research only; no exact probabilities are shown.",
]

RELATED_LAYERS = {
    "data_readiness": ["Data Still Needed", "Methodology"],
    "flood": ["Floodplain Review"],
    "general": ["Development Hotspots", "Floodplain Review", "School Utilization + Permit Pressure"],
    "methodology": ["Methodology"],
    "model_lab": ["Model Lab Research"],
    "permits": ["Development Hotspots", "Permit Activity by Year"],
    "schools": ["School Utilization + Permit Pressure", "School Capacity Watch"],
    "transportation": ["Transportation Context"],
    "utilities": ["Utility Readiness"],
    "zoning": ["Zoning / Land Use"],
}

DASHBOARD_ACTIONS: dict[CfsAiDomain, dict[str, Any]] = {
    "data_readiness": {
        "filter_watchlist": {"domain": "data_readiness", "status": "data needed"},
        "focus_domain": "data_readiness",
        "highlight_kpis": ["data_readiness"],
        "open_detail": {"type": "domain", "id": "data_readiness"},
        "sort_watchlist_by": "data_gap",
    },
    "flood": {
        "focus_domain": "flood",
        "highlight_kpis": ["floodplain_review"],
        "open_detail": {"type": "kpi", "id": "floodplain_review"},
        "recommended_layers": ["Floodplain Review"],
    },
    "general": {
        "focus_domain": "general",
        "highlight_kpis": ["observed_development_activity", "school_pressure"],
        "recommended_layers": [
            "Development Hotspots",
            "School Utilization + Permit Pressure",
            "Floodplain Review",
        ],
    },
    "model_lab": {
        "focus_domain": "model_lab",
        "highlight_kpis": ["model_research_status"],
        "open_detail": {"type": "domain", "id": "model_lab"},
        "recommended_layers": ["Model Lab Research Signals"],
    },
    "permits": {
        "focus_domain": "permits",
        "highlight_kpis": ["observed_development_activity"],
        "open_detail": {"type": "kpi", "id": "observed_development_activity"},
        "recommended_layers": ["Development Hotspots"],
        "sort_watchlist_by": "recent_activity",
    },
    "schools": {
        "filter_watchlist": {"domain": "schools", "status": "elevated review"},
        "focus_domain": "schools",
        "highlight_kpis": ["school_pressure"],
        "open_detail": {"type": "kpi", "id": "school_pressure"},
        "recommended_layers": [
            "School Utilization + Permit Pressure",
            "Development Hotspots",
        ],
        "sort_watchlist_by": "severity",
    },
    "transportation": {
        "focus_domain": "transportation",
        "highlight_kpis": ["transportation_context"],
        "recommended_layers": ["Transportation Context"],
    },
    "utilities": {
        "focus_domain": "utilities",
        "highlight_kpis": ["utility_readiness"],
        "recommended_layers": ["Utility Readiness"],
    },
    "zoning": {
        "focus_domain": "zoning",
        "highlight_kpis": ["data_readiness"],
        "recommended_layers": ["Zoning / Land Use"],
    },
}

DOMAIN_KEYWORDS: list[tuple[CfsAiDomain, tuple[str, ...]]] = [
    ("schools", ("school", "attendance", "capacity", "utilization", "student")),
    ("flood", ("flood", "fema", "floodplain", "floodway", "hazard")),
    ("permits", ("permit", "development", "growth", "activity", "trend")),
    ("transportation", ("transportation", "traffic", "road", "stip", "aadt")),
    ("utilities", ("utility", "utilities", "wsacc", "water", "sewer")),
    ("model_lab", ("model", "research", "signal", "lab")),
    ("data_readiness", ("missing", "data", "coverage", "readiness", "needed")),
    ("zoning", ("zoning", "land use", "rezoning", "planning")),
    ("methodology", ("method", "explain", "caveat", "limitation")),
]

UNSAFE_REPLACEMENTS = {
    r"\bwill be developed\b": "has observed planning context",
    r"\bwill develop\b": "shows observed permit activity",
    r"\bwill overcrowd\b": "needs school capacity review",
    r"\bovercrowding prediction\b": "preliminary school capacity watch",
    r"\bovercrowded\b": "above capacity in preliminary context",
    r"\bofficial prediction\b": "planning review signal",
    r"\bofficial score\b": "review status",
    r"\bexact probability\b": "no exact probability",
    r"\bprediction probability\b": "relative research signal",
    r"\braw score\b": "relative research signal",
    r"\bguaranteed\b": "not guaranteed",
    r"\bcertain\b": "not certain",
}


class CfsAiSearchService:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    def search(
        self,
        request: CfsAiSearchRequest,
        context: CfsAiContext,
    ) -> CfsAiSearchResponse:
        domains = request.filters.domains or classify_query_domains(request.query)
        fallback = deterministic_answer(request, context, domains)
        provider = self._settings.cfs_ai_provider

        if (
            not self._settings.cfs_ai_enabled
            or provider == "none"
            or not self._settings.cfs_ai_model.strip()
        ):
            return fallback

        try:
            provider_payload = self._provider_answer(request, context, domains)
        except Exception:
            fallback.caveats.append(
                "AI provider was unavailable; deterministic CFS answer returned.",
            )
            return sanitize_response(fallback)

        if provider_payload is None:
            fallback.caveats.append(
                "AI provider is not fully configured; deterministic CFS answer returned.",
            )
            return sanitize_response(fallback)

        response = CfsAiSearchResponse(
            answer=str(provider_payload.get("answer") or fallback.answer),
            as_of=fallback.as_of,
            caveats=_string_list(provider_payload.get("caveats")) or fallback.caveats,
            data_mode=request.mode,
            domains=domains,
            evidence=_evidence_items(provider_payload.get("evidence")) or fallback.evidence,
            dashboard_actions=_dashboard_actions_from_payload(
                provider_payload.get("dashboard_actions"),
            )
            or fallback.dashboard_actions,
            provider=provider,
            related_layers=_string_list(provider_payload.get("related_layers"))
            or fallback.related_layers,
            suggested_actions=_string_list(provider_payload.get("suggested_actions"))
            or fallback.suggested_actions,
        )
        return sanitize_response(response)

    def _provider_answer(
        self,
        request: CfsAiSearchRequest,
        context: CfsAiContext,
        domains: list[CfsAiDomain],
    ) -> dict[str, Any] | None:
        if self._settings.cfs_ai_provider != "openai":
            return None

        api_key = self._settings.openai_api_key.strip()
        if not api_key:
            return None
        payload = {
            "model": self._settings.cfs_ai_model.strip(),
            "messages": [
                {"role": "system", "content": _provider_system_prompt()},
                {
                    "role": "user",
                    "content": json.dumps(
                        {
                            "domains": domains,
                            "query": request.query,
                            "cfs_context": compact_context(context),
                            "deterministic_dashboard_actions": dashboard_actions_for_domains(
                                domains,
                            ).model_dump(exclude_none=True),
                        },
                        default=str,
                    ),
                },
            ],
            "response_format": {"type": "json_object"},
        }
        return _post_provider_json(
            "https://api.openai.com/v1/chat/completions",
            payload,
            {
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            ["choices", 0, "message", "content"],
        )


def classify_query_domains(query: str) -> list[CfsAiDomain]:
    normalized = query.lower()
    matches = [
        domain
        for domain, keywords in DOMAIN_KEYWORDS
        if any(keyword in normalized for keyword in keywords)
    ]
    return matches[:3] or ["general"]


def deterministic_answer(
    request: CfsAiSearchRequest,
    context: CfsAiContext,
    domains: list[CfsAiDomain],
) -> CfsAiSearchResponse:
    primary_domain = domains[0] if domains else "general"
    builders = {
        "data_readiness": _data_readiness_answer,
        "flood": _flood_answer,
        "general": _general_answer,
        "methodology": _methodology_answer,
        "model_lab": _model_answer,
        "permits": _permit_answer,
        "schools": _school_answer,
        "transportation": _transportation_answer,
        "utilities": _utility_answer,
        "zoning": _zoning_answer,
    }
    response = builders.get(primary_domain, _general_answer)(request, context, domains)
    return sanitize_response(response)


def sanitize_response(response: CfsAiSearchResponse) -> CfsAiSearchResponse:
    payload = response.model_dump()
    sanitized = _sanitize_value(payload)
    return CfsAiSearchResponse.model_validate(sanitized)


def sanitize_text(value: str) -> str:
    sanitized = value
    for pattern, replacement in UNSAFE_REPLACEMENTS.items():
        sanitized = re.sub(pattern, replacement, sanitized, flags=re.IGNORECASE)
    return sanitized


def dashboard_actions_for_domains(
    domains: list[CfsAiDomain],
    request: CfsAiSearchRequest | None = None,
) -> CfsAiDashboardActions:
    primary = domains[0] if domains else "general"
    payload = dict(DASHBOARD_ACTIONS.get(primary, DASHBOARD_ACTIONS["general"]))
    if request and (request.filters.year_start or request.filters.year_end):
        payload["time_range"] = {
            "end_year": request.filters.year_end,
            "start_year": request.filters.year_start,
        }
    return CfsAiDashboardActions.model_validate(payload)


def compact_context(context: CfsAiContext) -> CfsAiContext:
    return {
        "indicator_summary": context.get("indicator_summary"),
        "school_pressure": context.get("school_pressure"),
        "methodology": context.get("methodology"),
    }


def _permit_answer(
    request: CfsAiSearchRequest,
    context: CfsAiContext,
    domains: list[CfsAiDomain],
) -> CfsAiSearchResponse:
    summary = context.get("indicator_summary", {})
    growth = _monitor_metrics(summary, "growth_monitor")
    trend = _chart(summary, "development_permit_trend")
    top_segment = growth.get("top_permit_segment") or "Not available"
    latest = trend[-1] if trend else {}
    answer = (
        "Observed permit activity is the strongest growth signal in CFS. "
        f"The top available permit segment is {top_segment}, and the latest trend point "
        f"shows {_fmt(latest.get('value'))} permits for {latest.get('label', 'the latest available year')}."
    )
    return _response(
        answer,
        context,
        domains,
        request.mode,
        [
            _evidence(
                "Observed permit activity",
                f"{_fmt(growth.get('permit_records'))} permit records across {_fmt(growth.get('active_parcels'))} active parcels.",
                "indicator_summary.growth_monitor",
            ),
            _evidence(
                "Permit activity trend",
                _trend_detail(trend),
                "development_permit_trend",
                "available" if trend else "not_available",
            ),
        ],
        ["Review Development Hotspots by permit segment and year range."],
    )


def _school_answer(
    request: CfsAiSearchRequest,
    context: CfsAiContext,
    domains: list[CfsAiDomain],
) -> CfsAiSearchResponse:
    pressure = context.get("school_pressure", {})
    summary = pressure.get("summary", {})
    answer = (
        "School review should start where preliminary utilization context and observed permit activity overlap. "
        f"CFS has {_fmt(summary.get('areas_analyzed'))} attendance areas in the school pressure extract, "
        f"with {_fmt(summary.get('elevated_review_count'))} elevated review signals."
    )
    return _response(
        answer,
        context,
        domains,
        request.mode,
        [
            _evidence(
                "School pressure summary",
                (
                    f"{_fmt(summary.get('areas_with_utilization'))} areas include utilization context; "
                    f"{_fmt(summary.get('areas_with_recent_permits'))} include recent permit activity."
                ),
                "school_pressure_summary",
                "available" if pressure.get("features") else "limited",
            ),
            _evidence(
                "Recent permit activity in watched areas",
                f"{_fmt(summary.get('recent_residential_permits_in_watched_areas'))} recent residential permits in watched areas.",
                "school_pressure_summary",
                "available" if summary else "not_available",
            ),
        ],
        ["Open Explore Countywide → School Utilization + Permit Pressure."],
    )


def _flood_answer(
    request: CfsAiSearchRequest,
    context: CfsAiContext,
    domains: list[CfsAiDomain],
) -> CfsAiSearchResponse:
    summary = context.get("indicator_summary", {})
    constraint = _monitor_metrics(summary, "constraint_monitor")
    answer = (
        "Floodplain Review summarizes parcels with mapped FEMA floodplain context. "
        f"CFS currently shows {_fmt(constraint.get('review_parcels'))} review parcels, including "
        f"{_fmt(constraint.get('special_flood_hazard_area_parcels'))} Special Flood Hazard Area parcels "
        f"and {_fmt(constraint.get('floodway_parcels'))} floodway parcels where available."
    )
    return _response(
        answer,
        context,
        domains,
        request.mode,
        [
            _evidence(
                "Floodplain Review",
                f"{_fmt(constraint.get('high_severe_impact'))} high/severe review attention parcels if available.",
                "indicator_summary.constraint_monitor",
            ),
        ],
        ["Review Floodplain Review before planning around constrained parcels."],
    )


def _model_answer(
    request: CfsAiSearchRequest,
    context: CfsAiContext,
    domains: list[CfsAiDomain],
) -> CfsAiSearchResponse:
    answer = (
        "Model Lab is internal research context only. It can describe relative research signals and helpful feature groups, "
        "but it does not expose exact probabilities, raw model values, or official classifications."
    )
    return _response(
        answer,
        context,
        domains,
        request.mode,
        [
            _evidence(
                "Model status",
                "Current public-facing status is internal research only and not production-ready.",
                "model_status",
            ),
        ],
        ["Use Model Lab for research context, then verify source records before conclusions."],
    )


def _data_readiness_answer(
    request: CfsAiSearchRequest,
    context: CfsAiContext,
    domains: list[CfsAiDomain],
) -> CfsAiSearchResponse:
    readiness = context.get("indicator_summary", {}).get("data_readiness", [])
    labels = [item.get("dataset", "Unknown dataset") for item in readiness[:4]]
    answer = (
        "The main data readiness gaps are official datasets that would make CFS stronger for production review. "
        f"Priority gaps include {', '.join(labels) if labels else 'not available from current context'}."
    )
    return _response(
        answer,
        context,
        domains,
        request.mode,
        [
            _evidence(
                "Data Still Needed",
                f"{len(readiness)} priority missing datasets are tracked.",
                "indicator_summary.data_readiness",
                "available" if readiness else "not_available",
            ),
        ],
        ["Request official data sources listed in the Data Still Needed board."],
    )


def _transportation_answer(request, context, domains):
    return _simple_domain_answer(
        "Transportation Context",
        "Transportation context is available as a planning layer where source data exists; use it with observed permit activity and parcel context.",
        "Review Transportation Context with Development Hotspots before staff follow-up.",
        request,
        context,
        domains,
    )


def _utility_answer(request, context, domains):
    return _simple_domain_answer(
        "Utility Readiness",
        "Utility readiness is proxy-only until true capacity data is received. Proximity does not confirm available capacity.",
        "Request WSACC service area, available capacity, committed capacity, and update date.",
        request,
        context,
        domains,
    )


def _zoning_answer(request, context, domains):
    return _simple_domain_answer(
        "Zoning / Land Use",
        "Zoning and land-use context help explain parcel planning context, but official rezoning case records and future land-use GIS remain data needs where unavailable.",
        "Review zoning context with permit activity and data readiness caveats.",
        request,
        context,
        domains,
    )


def _methodology_answer(request, context, domains):
    return _simple_domain_answer(
        "Methodology",
        "CFS combines observed activity, constraints, preliminary school context, and data readiness notes. Missing data is shown as unavailable rather than inferred.",
        "Open Methodology for source notes, caveats, and safe-use boundaries.",
        request,
        context,
        domains,
    )


def _general_answer(
    request: CfsAiSearchRequest,
    context: CfsAiContext,
    domains: list[CfsAiDomain],
) -> CfsAiSearchResponse:
    answer = (
        "Start with Development Activity, School Utilization + Permit Pressure, Floodplain Review, and Data Still Needed. "
        "Those signals cover observed growth, constraints, capacity context, and missing official data."
    )
    return _response(
        answer,
        context,
        domains,
        request.mode,
        [
            _evidence(
                "Mission Control",
                "CFS summarizes countywide monitoring signals from existing CFS intelligence.",
                "indicator_center",
            ),
        ],
        [
            "Inspect the Operational Watchlist first.",
            "Open related Explore Countywide layers for map context.",
        ],
    )


def _simple_domain_answer(title, answer, action, request, context, domains):
    return _response(
        answer,
        context,
        domains,
        request.mode,
        [_evidence(title, answer, title.lower().replace(" ", "_"))],
        [action],
    )


def _response(
    answer: str,
    context: CfsAiContext,
    domains: list[CfsAiDomain],
    mode: str,
    evidence: list[CfsAiEvidenceItem],
    actions: list[str],
) -> CfsAiSearchResponse:
    active_domains = domains or ["general"]
    caveats = list(dict.fromkeys(SAFE_CAVEATS + context.get("caveats", [])))[:6]
    if mode == "demo":
        caveats.insert(0, "Portfolio Demo uses a cached demo extract.")
    return CfsAiSearchResponse(
        answer=answer,
        as_of=context.get("as_of") or datetime.now(UTC).isoformat(),
        caveats=caveats,
        dashboard_actions=dashboard_actions_for_domains(active_domains, None),
        data_mode=mode,  # type: ignore[arg-type]
        domains=active_domains,
        evidence=evidence,
        provider="none",
        related_layers=_related_layers(active_domains),
        suggested_actions=actions,
    )


def _evidence(title, detail, source, confidence="available") -> CfsAiEvidenceItem:
    return CfsAiEvidenceItem(
        confidence=confidence,
        detail=detail,
        source=source,
        title=title,
    )


def _related_layers(domains: list[CfsAiDomain]) -> list[str]:
    layers: list[str] = []
    for domain in domains:
        layers.extend(RELATED_LAYERS.get(domain, []))
    return list(dict.fromkeys(layers))[:6]


def _monitor_metrics(summary: dict[str, Any], card_id: str) -> dict[str, Any]:
    for card in summary.get("monitoring_cards", []):
        if card.get("id") == card_id:
            return card.get("metrics", {})
    return {}


def _chart(summary: dict[str, Any], chart_id: str) -> list[dict[str, Any]]:
    chart_data = summary.get("chart_data", {})
    value = chart_data.get(chart_id, [])
    return value if isinstance(value, list) else []


def _trend_detail(trend: list[dict[str, Any]]) -> str:
    if not trend:
        return "Trend data is not available from current CFS context."
    first = trend[0]
    latest = trend[-1]
    return (
        f"{first.get('label', 'First available')}: {_fmt(first.get('value'))}; "
        f"{latest.get('label', 'latest')}: {_fmt(latest.get('value'))}."
    )


def _fmt(value: Any) -> str:
    if value is None or value == "":
        return "not available"
    if isinstance(value, (int, float)):
        return f"{value:,.0f}"
    return str(value)


def _sanitize_value(value: Any) -> Any:
    if isinstance(value, str):
        return sanitize_text(value)
    if isinstance(value, list):
        return [_sanitize_value(item) for item in value]
    if isinstance(value, dict):
        return {key: _sanitize_value(item) for key, item in value.items()}
    return value


def _string_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item) for item in value if item is not None][:8]


def _evidence_items(value: Any) -> list[CfsAiEvidenceItem]:
    if not isinstance(value, list):
        return []
    items = []
    for item in value[:6]:
        if isinstance(item, dict):
            items.append(
                CfsAiEvidenceItem(
                    confidence=item.get("confidence", "available"),
                    detail=str(item.get("detail", "")),
                    source=str(item.get("source", "provider")),
                    title=str(item.get("title", "CFS evidence")),
                ),
            )
    return items


def _dashboard_actions_from_payload(value: Any) -> CfsAiDashboardActions | None:
    if not isinstance(value, dict):
        return None
    try:
        return CfsAiDashboardActions.model_validate(value)
    except Exception:
        return None


def _provider_system_prompt() -> str:
    return (
        "You are the CFS planning intelligence assistant. Answer only from the supplied CFS context. "
        "Return valid JSON only. Do not invent data. Do not expose owner names, mailing addresses, secrets, "
        "exact probabilities, raw model scores, official prediction classes, official school overcrowding claims, "
        "or database connection details. Use safe planning language. Distinguish observed permit activity from "
        "prediction. Distinguish preliminary school capacity watch from official school capacity findings. "
        "dashboard_actions are UI suggestions only and do not create official claims. Return JSON with answer, "
        "evidence, related_layers, caveats, suggested_actions, and dashboard_actions."
    )


def _post_provider_json(
    url: str,
    payload: dict[str, Any],
    headers: dict[str, str],
    content_path: list[Any],
) -> dict[str, Any] | None:
    data = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(url, data=data, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            provider_payload = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
        return None

    content: Any = provider_payload
    for key in content_path:
        if isinstance(key, int) and isinstance(content, list) and len(content) > key:
            content = content[key]
        elif isinstance(key, str) and isinstance(content, dict):
            content = content.get(key)
        else:
            return None

    if not isinstance(content, str):
        return None
    try:
        parsed = json.loads(content)
    except json.JSONDecodeError:
        return None
    return parsed if isinstance(parsed, dict) else None
